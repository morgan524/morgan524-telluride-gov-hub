/**
 * ══════════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Cloud Functions for Claude-Powered Summaries
 * ══════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   Frontend (static HTML) → Cloud Function HTTP endpoints → Claude API
 *   Summaries cached in Firestore "summaries" collection
 *
 * Functions:
 *   1. getSummary       — Returns cached summary or generates new one
 *   2. refreshSummary   — Force-regenerate a single summary (admin)
 *   3. refreshUpcoming  — Regenerate all summaries in next N days (admin)
 *   4. scheduledRefresh  — Cron: auto-check for stale/missing summaries
 *   5. getSummaries     — Batch-fetch all cached summaries (frontend page load)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
// Lazy-load heavy dependencies to avoid Firebase's 10-second init timeout
let _Anthropic, _cheerio, _fetch;
function getAnthropic() { if (!_Anthropic) _Anthropic = require('@anthropic-ai/sdk'); return _Anthropic; }
function getCheerio() { if (!_cheerio) _cheerio = require('cheerio'); return _cheerio; }
function getFetch() { if (!_fetch) _fetch = require('node-fetch'); return _fetch; }

admin.initializeApp();
const db = admin.firestore();

// ── Constants ──
const SUMMARIES_COLLECTION = 'summaries';
const ADMIN_SECRET_HEADER = 'x-govhub-admin-key';
const CACHE_TTL_HOURS = 12; // re-check agenda sources every 12 hours
// Use the floating Sonnet alias so a model retirement doesn't silently
// break getSummary / refreshSummary / scheduledRefresh. claude-sonnet-4-20250514
// was retired by Anthropic on 2026-06-15 20:48 UTC and would have caused
// every summary refresh in this Cloud Function to error until manually fixed.
// Reminder: bumping this constant in git is only step 1 — the Firebase
// Cloud Function must be redeployed with `firebase deploy --only functions`
// to actually push the change to production.
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_AGENDA_TEXT_LENGTH = 15000; // chars sent to Claude

// ── Agenda source URLs for each entity ──
const AGENDA_SOURCES = {
  telluride: {
    label: 'Town of Telluride',
    meetingsApi: 'https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings',
    detailBase: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=',
    type: 'civicweb'
  },
  county: {
    label: 'San Miguel County',
    portalBase: 'https://sanmiguelcoco.portal.civicclerk.com',
    calendarUrl: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=58',
    type: 'civicclerk'
  },
  smart: {
    label: 'SMART',
    pageUrl: 'https://smarttelluride.colorado.gov/board-meetings',
    type: 'generic'
  },
  mv: {
    label: 'Mountain Village',
    pageUrl: 'https://townofmountainvillage.com/government/town-council/town-council/',
    type: 'generic'
  },
  school: {
    label: 'Telluride School District R-1',
    pageUrl: 'https://www.tellurideschool.org/agendasandminutes',
    type: 'generic'
  },
  fire: {
    label: 'Telluride Fire Protection District',
    pageUrl: 'https://www.telluridefire.com/board-meetings',
    type: 'generic'
  },
  med: {
    label: 'Telluride Medical Center / Hospital District',
    pageUrl: 'https://www.tellmed.org/board-meetings',
    type: 'generic'
  },
  norwood: {
    label: 'Town of Norwood',
    pageUrl: 'https://www.norwoodtown.com/governance',
    type: 'generic'
  },
  ophir: {
    label: 'Town of Ophir',
    pageUrl: 'https://townofophir.colorado.gov/general-assembly-2',
    type: 'generic'
  },
  airport: {
    label: 'Telluride Regional Airport Authority',
    pageUrl: 'https://tellurideairport.com/traa-board-information/',
    type: 'generic'
  }
};

// ══════════════════════════════════════════════════════════════
// ── CORS helper ──
// ══════════════════════════════════════════════════════════════
function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, ' + ADMIN_SECRET_HEADER);
  res.set('Access-Control-Max-Age', '3600');
}

function handleCors(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

// ══════════════════════════════════════════════════════════════
// ── Admin auth check ──
// ══════════════════════════════════════════════════════════════
function isAdmin(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers[ADMIN_SECRET_HEADER] === secret;
}

// ══════════════════════════════════════════════════════════════
// ── Firestore summary document schema ──
// ══════════════════════════════════════════════════════════════
//
// Document ID: "{source}|{YYYY-MM-DD}|{meetingTitle}"
//
// Fields:
//   source          string    Entity key (telluride, county, etc.)
//   date            string    YYYY-MM-DD
//   meetingTitle    string    Meeting name
//   shortSummary    string    1-3 sentence card summary
//   topics          string[]  3-6 bullet key topics
//   whyItMatters    string    Optional context paragraph
//   agendaUrl       string    URL of agenda that was summarized
//   agendaHash      string    Hash of extracted agenda text (change detection)
//   sourceText      string    Raw text sent to Claude (for debugging)
//   generatedAt     timestamp When summary was generated
//   fromCache       boolean   Always true when read from Firestore
//   model           string    Claude model used
//   error           string    If generation failed, why
//

// ══════════════════════════════════════════════════════════════
// ── Text extraction from agenda sources ──
// ══════════════════════════════════════════════════════════════

/**
 * Fetch and extract text from a meeting agenda URL.
 * Handles HTML pages and attempts PDF text extraction.
 */
async function extractAgendaText(url) {
  if (!url) return { text: '', hash: '' };

  try {
    const fetch = getFetch();
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TellurideGovHub/1.0 (civic-summary-bot)' },
      timeout: 15000,
      redirect: 'follow'
    });

    if (!resp.ok) return { text: '', hash: '' };

    const contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('application/pdf')) {
      // PDF extraction
      const buffer = await resp.buffer();
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        const text = data.text.slice(0, MAX_AGENDA_TEXT_LENGTH);
        return { text, hash: simpleHash(text) };
      } catch (pdfErr) {
        console.warn('PDF parse failed:', pdfErr.message);
        return { text: '[PDF could not be parsed]', hash: '' };
      }
    }

    // HTML extraction
    const html = await resp.text();
    const cheerio = getCheerio();
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $('script, style, nav, footer, header, .sidebar, .navigation').remove();

    // Try to find agenda-specific content areas
    let text = '';
    const agendaSelectors = [
      '.agenda-content', '.meeting-agenda', '#agenda',
      '.agenda-body', '.content-area', '.meeting-details',
      'main', 'article', '.entry-content', '#content'
    ];

    for (const sel of agendaSelectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 100) {
        text = el.text().trim();
        break;
      }
    }

    if (!text) {
      text = $('body').text().trim();
    }

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').slice(0, MAX_AGENDA_TEXT_LENGTH);
    return { text, hash: simpleHash(text) };

  } catch (err) {
    console.warn('Agenda extraction failed for', url, ':', err.message);
    return { text: '', hash: '' };
  }
}

/**
 * For CivicWeb (Telluride), fetch the meeting detail page for agenda text
 */
async function fetchCivicWebAgenda(meetingId) {
  const url = AGENDA_SOURCES.telluride.detailBase + meetingId;
  return extractAgendaText(url);
}

/**
 * Simple string hash for change detection
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// ══════════════════════════════════════════════════════════════
// ── Claude summary generation ──
// ══════════════════════════════════════════════════════════════

async function generateSummary(source, date, meetingTitle, agendaText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured — set ANTHROPIC_API_KEY in functions/.env');

  const Anthropic = getAnthropic();
  const anthropic = new Anthropic.default({ apiKey });

  const entityLabel = AGENDA_SOURCES[source]?.label || source;

  const systemPrompt = `You are a civic information summarizer for the Telluride, Colorado region Gov Hub — a nonpartisan community resource. Your tone is neutral, concise, and civic-friendly, with a very slight emphasis toward preservation, conservation, and environmentalism.

RULES:
- Only summarize information actually present in the agenda text provided.
- If the agenda text is sparse or missing, say so briefly. Do NOT invent topics.
- Never hallucinate names, vote counts, or decisions not in the source text.
- Use plain language. Define government jargon inline when helpful.
- Keep the short summary to 1-3 sentences.
- Provide 3-6 key topic bullets. Each bullet should be a brief phrase or single sentence.
- The "why it matters" section should connect agenda items to the KEY LOCAL ISSUES below when relevant. Draw specific connections — reference case numbers, dollar amounts, and prior outcomes where applicable. If no agenda items relate to key issues, provide general community impact context or an empty string.

KEY LOCAL ISSUES IN THE TELLURIDE REGION:
Use these to enrich the "whyItMatters" section when agenda items touch on related topics.

1. ALDASORO PUD / DIAMOND RANCH — Zoning & PUD Enforcement
   Case 2023CV30044 (Lucarelli v. BOCC & Town). Whether Diamond Ranch lots are subject to the 1991 PUD Plan (density limits, RETA of 3/4 of 1%). 106 Appeal — Plaintiffs WON (June 2024): PUD covers all sub-districts. Declaratory Relief on Parcel C — Plaintiffs LOST (March 2026). Precedent for PUD interpretation and RETA enforcement.

2. SMART BALLOT ISSUE 3A — Gondola Funding & Election Contest
   Case 24CV8 (Masson v. SMART). $5.2M/year tax increase for gondola. Approved ~$8.2M/year debt service (~$40M debt). Capital fund by 2028: ~$22M vs estimated new gondola cost $80-100M+. ~$1M public funds spent on consultant-designed campaign before ballot. TABOR loophole concern: SMART may use Certificate of Participation (COP) to classify gondola payments as lease-back, circumventing TABOR debt approval.

3. SOCIETY TURN PUD — Hospital & Major Commercial Development
   20-acre PUD: ~400,000 sq ft total. Hospital ~44,000 sq ft (only ~10% of total), 125-room hotel, medical offices, retail, restaurants, employee housing. 79% of surveyed residents unaware hospital was only 10% of PUD. Traffic baseline from March 2020 (COVID lockdown — unreliable). No wildfire evacuation analysis.

4. MEASURE 300 — Voter Oversight of Major Development
   Proposed voter approval for projects over $10M, commercial rezonings over $20M/20,000 sq ft, and water extensions. Lost Nov 2025 but ~40% voted YES. Combined scope of projects under consideration: 811,000 sq ft (Shandoka garage + Chair 7 hotel + gondola redesign).

5. CHAIR 7 / CARHENGE — Open Space & Luxury Development
   1979 Telski dedicated Chair 7 as "Open Space District" (ski uses only). Proposed luxury hotel up to 5.5 stories. Combined Chair 7 + Shandoka + gondola = ~120,000 sq ft new commercial, 150-200+ new employees. Town Council abandoned hotel plans Sept 2025 after Measure 300 campaign.

6. MUNICIPAL BUDGET & DEBT
   Budget: $10M (2015) to ~$95-100M (2025). 212 town employees (~10% of population). Measure 2B: $64M debt authorization (~$197M with interest). Consultant spending: $64.1M (2017-2025), spiked from $1.9M (2019) to $10.5M (2023). VooDoo, Sunnyside financed via revenue bonds avoiding voter approval. Balloon payments: VooDoo $23M due ~2032.

7. AFFORDABLE HOUSING FINANCIAL CRISIS
   VooDoo: 27 units, $27.4M ($1M/unit), $21.4M borrowed at ~6%, ~$200K annual shortfall, 3 of 27 vacant, $23M balloon due ~2032. Sunnyside: 60% rent increases over 2 years. At $1M/unit costs, 50% AMI tenants ($42K/year) cannot cover financing. Result: units sit empty or serve higher-income residents.

8. HOTELS — Four Seasons & Sixth Sense (Mountain Village)
   Four Seasons: ~$1B, 634 estimated employees. Sixth Sense: ~$300M, 424 estimated employees. Combined 1,058 employees need ~$400M in housing. Actual mitigation: ~$3.8M. Massive externalization of housing costs.

9. HB24-1107 — Fee-Shifting Against Land Use Challengers
   Federal case 1:24-cv-01847-NRN. Mandatory attorney fee awards to prevailing governments in land use judicial review (5+ units/acre). One-sided: citizens pay if they lose. Chills citizen participation in land use review.

10. CORA TRANSPARENCY & GOVERNMENT ACCOUNTABILITY
    CORA requests revealed complex multi-entity funding for gondola planning. Substantial consultant payments before ballot measure.

CROSS-CUTTING THEMES: TABOR loopholes & voter bypass, consultant-driven governance ($64M spent), piecemeal presentation of 800,000+ sq ft combined development, housing affordability paradox, democratic deficit, PUD integrity, resort economics externalizing costs, and rising civic engagement.

OUTPUT FORMAT (JSON):
{
  "shortSummary": "1-3 sentence overview for the meeting card",
  "topics": ["topic 1", "topic 2", "topic 3"],
  "whyItMatters": "Paragraph connecting agenda items to key local issues with specific references, or empty string if no clear connection"
}`;

  const userPrompt = `Summarize this upcoming government meeting for community members:

ENTITY: ${entityLabel}
MEETING: ${meetingTitle}
DATE: ${date}

AGENDA TEXT:
${agendaText || '[No agenda text available. The agenda has not been posted yet or could not be retrieved.]'}

Return ONLY valid JSON matching the format specified.`;

  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt
    });

    const responseText = message.content[0]?.text || '';

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr.trim());

    return {
      shortSummary: parsed.shortSummary || '',
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      whyItMatters: parsed.whyItMatters || ''
    };
  } catch (err) {
    console.error('Claude API error:', err.message);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════
// ── Core: get or generate a summary ──
// ══════════════════════════════════════════════════════════════

async function getOrGenerateSummary(source, date, meetingTitle, agendaUrl, forceRefresh = false) {
  const docId = `${source}|${date}|${meetingTitle}`;
  const docRef = db.collection(SUMMARIES_COLLECTION).doc(docId);

  // Check cache first
  if (!forceRefresh) {
    const cached = await docRef.get();
    if (cached.exists) {
      const data = cached.data();
      // Check if cache is still fresh
      const ageHours = (Date.now() - data.generatedAt?.toMillis?.()) / (1000 * 60 * 60);
      if (ageHours < CACHE_TTL_HOURS && !data.error) {
        return { ...data, fromCache: true, docId };
      }
    }
  }

  // Extract agenda text
  let agendaData = { text: '', hash: '' };
  if (agendaUrl) {
    agendaData = await extractAgendaText(agendaUrl);
  }

  // Check if agenda text has changed since last generation
  if (!forceRefresh) {
    const cached = await docRef.get();
    if (cached.exists) {
      const data = cached.data();
      if (data.agendaHash && data.agendaHash === agendaData.hash && !data.error) {
        // Agenda hasn't changed, refresh timestamp and return cached
        await docRef.update({ generatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { ...data, fromCache: true, docId };
      }
    }
  }

  // Generate new summary via Claude
  try {
    const result = await generateSummary(source, date, meetingTitle, agendaData.text);

    const record = {
      source,
      date,
      meetingTitle,
      shortSummary: result.shortSummary,
      topics: result.topics,
      whyItMatters: result.whyItMatters,
      agendaUrl: agendaUrl || '',
      agendaHash: agendaData.hash,
      sourceText: agendaData.text.slice(0, 2000), // store snippet for debugging
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      model: CLAUDE_MODEL,
      error: ''
    };

    await docRef.set(record);
    return { ...record, fromCache: false, docId };

  } catch (err) {
    // Store the error so we don't retry immediately
    const errorRecord = {
      source,
      date,
      meetingTitle,
      shortSummary: '',
      topics: [],
      whyItMatters: '',
      agendaUrl: agendaUrl || '',
      agendaHash: '',
      sourceText: '',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      model: CLAUDE_MODEL,
      error: err.message || 'Unknown error'
    };
    await docRef.set(errorRecord);
    return { ...errorRecord, fromCache: false, docId };
  }
}

// ══════════════════════════════════════════════════════════════
// ── HTTP Function: getSummary ──
// ══════════════════════════════════════════════════════════════
// GET ?source=telluride&date=2026-03-31&title=Town%20Council
// Returns a single meeting summary from cache or generates it.

exports.getSummary = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  const { source, date, title, agendaUrl } = req.query;
  if (!source || !date || !title) {
    res.status(400).json({ error: 'Missing required params: source, date, title' });
    return;
  }

  try {
    const summary = await getOrGenerateSummary(source, date, title, agendaUrl);
    res.json(summary);
  } catch (err) {
    console.error('getSummary error:', err);
    res.status(500).json({ error: 'Summary generation failed' });
  }
});

// ══════════════════════════════════════════════════════════════
// ── HTTP Function: getSummaries (batch) ──
// ══════════════════════════════════════════════════════════════
// GET — returns all cached summaries (frontend loads this on page init)
// Optional: ?days=30 to limit to summaries within N days of today

exports.getSummaries = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const days = parseInt(req.query.days) || 60;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // include recent past meetings
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const futureStr = futureDate.toISOString().slice(0, 10);

    const snapshot = await db.collection(SUMMARIES_COLLECTION)
      .where('date', '>=', cutoffStr)
      .where('date', '<=', futureStr)
      .get();

    const summaries = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.error) {
        summaries[doc.id] = {
          shortSummary: data.shortSummary,
          topics: data.topics,
          whyItMatters: data.whyItMatters,
          generatedAt: data.generatedAt?.toDate?.()?.toISOString() || '',
          model: data.model
        };
      }
    });

    res.json({ summaries, count: Object.keys(summaries).length });
  } catch (err) {
    console.error('getSummaries error:', err);
    res.status(500).json({ error: 'Failed to fetch summaries' });
  }
});

// ══════════════════════════════════════════════════════════════
// ── HTTP Function: refreshSummary (admin) ──
// ══════════════════════════════════════════════════════════════
// POST { source, date, title, agendaUrl }
// Header: x-govhub-admin-key: <secret>

exports.refreshSummary = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const { source, date, title, agendaUrl } = req.body;
  if (!source || !date || !title) {
    res.status(400).json({ error: 'Missing required fields: source, date, title' });
    return;
  }

  try {
    const summary = await getOrGenerateSummary(source, date, title, agendaUrl, true);
    res.json({ ...summary, refreshed: true });
  } catch (err) {
    console.error('refreshSummary error:', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// ══════════════════════════════════════════════════════════════
// ── HTTP Function: refreshUpcoming (admin) ──
// ══════════════════════════════════════════════════════════════
// POST { days: 30 }
// Refreshes all summaries for meetings in the next N days.
// Requires meetings data to be passed in the request body.

exports.refreshUpcoming = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    if (handleCors(req, res)) return;

    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const { meetings, days } = req.body;
    if (!Array.isArray(meetings)) {
      res.status(400).json({ error: 'meetings array required' });
      return;
    }

    const maxDays = days || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + maxDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const results = [];

    for (const m of meetings) {
      if (!m.source || !m.date || !m.title) continue;
      if (m.date < todayStr || m.date > cutoffStr) continue;

      try {
        const summary = await getOrGenerateSummary(m.source, m.date, m.title, m.agendaUrl, true);
        results.push({ docId: summary.docId, status: 'ok', fromCache: false });
      } catch (err) {
        results.push({ docId: `${m.source}|${m.date}|${m.title}`, status: 'error', error: err.message });
      }
    }

    res.json({ refreshed: results.length, results });
  });

// ══════════════════════════════════════════════════════════════
// ── Scheduled Function: auto-refresh stale summaries ──
// ══════════════════════════════════════════════════════════════
// Runs every 6 hours. Checks for summaries older than CACHE_TTL_HOURS
// and re-generates them if the agenda has changed.

exports.scheduledRefresh = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('every 6 hours')
  .onRun(async () => {
    console.log('Scheduled summary refresh starting...');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Find summaries that might be stale
    const snapshot = await db.collection(SUMMARIES_COLLECTION)
      .where('date', '>=', todayStr)
      .where('date', '<=', cutoffStr)
      .get();

    let refreshed = 0;
    let checked = 0;

    for (const doc of snapshot.docs) {
      checked++;
      const data = doc.data();
      const ageHours = (Date.now() - data.generatedAt?.toMillis?.()) / (1000 * 60 * 60);

      // Only re-check if older than TTL
      if (ageHours < CACHE_TTL_HOURS) continue;

      // Re-extract agenda and check if content changed
      if (data.agendaUrl) {
        const freshAgenda = await extractAgendaText(data.agendaUrl);
        if (freshAgenda.hash && freshAgenda.hash !== data.agendaHash) {
          // Agenda changed — regenerate
          await getOrGenerateSummary(data.source, data.date, data.meetingTitle, data.agendaUrl, true);
          refreshed++;
        } else {
          // Just bump the timestamp
          await doc.ref.update({ generatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }

    console.log(`Scheduled refresh done: checked ${checked}, refreshed ${refreshed}`);
    return null;
  });

// ══════════════════════════════════════════════════════════════
// ── HTTP Function: adminStatus (admin dashboard data) ──
// ══════════════════════════════════════════════════════════════

exports.adminStatus = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const snapshot = await db.collection(SUMMARIES_COLLECTION)
      .orderBy('date', 'desc')
      .limit(100)
      .get();

    const records = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      records.push({
        docId: doc.id,
        source: data.source,
        date: data.date,
        meetingTitle: data.meetingTitle,
        hasContent: !!(data.shortSummary),
        topicCount: data.topics?.length || 0,
        hasWhyItMatters: !!(data.whyItMatters),
        generatedAt: data.generatedAt?.toDate?.()?.toISOString() || '',
        model: data.model,
        error: data.error || '',
        agendaUrl: data.agendaUrl
      });
    });

    res.json({ records, total: records.length });
  } catch (err) {
    console.error('adminStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});
