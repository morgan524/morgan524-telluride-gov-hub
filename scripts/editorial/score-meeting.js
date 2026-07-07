// ════════════════════════════════════════════════════════════════════
// Editorial layer · Step 2: TRIAGE — scoreMeeting()
// ════════════════════════════════════════════════════════════════════
//
// Sits ON TOP of the existing meeting-summary pipeline (content-refresh.js
// fetch → transcribe → summarize). It does NOT touch that pipeline. Given a
// meeting summary that already exists on disk (MANUAL_SUMMARIES in
// js/gov-helpers.js), this judges newsworthiness for the Livable Telluride
// audience and emits structured JSON:
//
//   { score: 0-5, body, topics[], reasons[], follow_up_to }
//
// The caller (triage-run.js for now; the agentic loop later) maps the score
// to a branch:
//   score < 2   → 'ignore'  (log and stop)
//   score 2-3   → 'flag'     (summary-only; no draft)
//   score >= 4  → 'draft'    (warrants a drafted article)
//
// This is one Claude API call per meeting, reusing the exact request shape
// used by callClaude() in scripts/content-refresh.js (inline https, x-api-key,
// model id from scripts/lib/claude-model.js). No SDK dependency.
//
// Nothing here writes to disk or publishes anything — pure judgment.

const https = require('https');
const { SONNET } = require('../lib/claude-model.js');

// Model: default to the same floating Sonnet alias the summary pipeline uses.
// Override with EDITORIAL_MODEL if calibration wants a stronger judge (e.g.
// claude-opus-4-8) — newsworthiness taste is exactly the kind of judgment a
// bump might help, and this keeps that a one-env-var change.
const TRIAGE_MODEL = process.env.EDITORIAL_MODEL || SONNET;

// Score → branch. Single source of truth so triage-run.js and the eventual
// loop agree. Matches the brief: <2 stop, 2-3 flag, >=4 draft.
function branchForScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'ignore';
  if (score >= 4) return 'draft';
  if (score >= 2) return 'flag';
  return 'ignore';
}

// Cheap pre-filter: meetings whose summary is just a "no agenda posted yet"
// placeholder carry no newsworthy content, so short-circuit them to score 0
// instead of spending an API call. Mirrors the placeholder patterns the
// summary pipeline itself recognises (isPlaceholderSummary / isBadSummary).
const PLACEHOLDER_RE = /agenda\s+(text\s+|details\s+)?(not|isn'?t)\s+(yet\s+)?(available|posted)|hasn'?t\s+been\s+posted|no\s+agenda|^[a-z ]*meeting\.?$/i;

function isPlaceholderSummary(summary) {
  if (!summary || typeof summary !== 'string') return true;
  const s = summary.trim();
  if (s.length < 40) return true;            // too short to be a real summary
  return PLACEHOLDER_RE.test(s);
}

// The triage rubric is anchored to the SAME key local issues the summary
// voice ("Rick") is anchored to, so "newsworthy" means "matters to this
// community", not generic civics. Keep this list in sync with the KEY LOCAL
// ISSUES block in content-refresh.js's SUMMARY_SYSTEM_PROMPT.
const TRIAGE_SYSTEM_PROMPT = `You are the assignment editor for Livable Telluride, a civic news site covering the Telluride, Colorado region (Town of Telluride, Mountain Village, San Miguel County, and the smaller jurisdictions: Norwood, Ophir, the school district, fire district, hospital district, SMART/gondola, SMRHA housing).

Your job: read a single government-meeting summary and judge how NEWSWORTHY it is for residents of this region — how much it deserves a written news article, versus just appearing as a routine line item.

You are NOT writing the article. You are scoring it and extracting structure. Be a discerning editor: most meetings are routine. Reserve high scores for decisions that genuinely change something for residents.

NEWSWORTHINESS SCALE (0-5):
- 5 — Major decision on a key local issue: an ordinance/code change at second reading or adoption, approval or denial of a major development, a significant budget/tax/debt action, a major affordable-housing decision, a major hotel approval, a consequential land-use vote. The kind of thing residents would want to read about and that affects the place materially.
- 4 — Substantive, consequential action: a first reading of a meaningful ordinance, a notable land-use review or PUD step, a new policy with real public impact, a meaningful contract/lease with public consequences, an investigation report of public interest.
- 3 — Real governance with some public interest but routine in character: variances, smaller leases, board appointments, audits, master-plan updates, presentations on substantive topics.
- 2 — Minor or mostly procedural items with slight public interest: routine renewals, liquor permits for events, small administrative matters.
- 1 — Purely routine/administrative: consent agendas, minutes approval, reorganizations, liaison reports, with nothing of public consequence.
- 0 — No real content: agenda not posted, summary is a placeholder, or nothing of substance is on the agenda.

KEY LOCAL ISSUES (these RAISE newsworthiness when a meeting touches them):
1. Aldasoro PUD / Diamond Ranch — zoning & PUD enforcement (Case 2023CV30044)
2. SMART Ballot Issue 3A — gondola funding & election contest ($5.2M/year tax)
3. Society Turn PUD — hospital & major commercial development (~400,000 sq ft)
4. Measure 300 — voter oversight of major development
5. Chair 7 / Carhenge — open space & luxury development
6. Municipal budget & debt — budget grew from $10M (2015) to ~$95-100M (2025)
7. Affordable housing financial crisis — VooDoo ~$1M/unit, Sunnyside ~60% rent hikes
8. Hotels — Four Seasons (~$1B) & Sixth Sense (~$300M) in Mountain Village
9. HB24-1107 — fee-shifting against land-use challengers
10. CORA transparency & government accountability
Also generally newsworthy: code/land-use amendments, wildfire policy, water, traffic/parking decisions, short-term-rental (STR) regulation, anything with a meaningful tax or fee impact.

SCORING DISCIPLINE:
- Score ONLY on what is actually present in the summary text. Do not assume a routine-sounding meeting hides something big, and do not inflate a meeting because the body is important. A Town Council meeting with only liquor permits is a 2, not a 4.
- When the summary is a placeholder ("agenda not yet available", "Regular meeting", etc.), score 0.
- Prefer the LOWER score when genuinely on the fence between two levels. High scores must be earned by concrete, consequential agenda content.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{
  "score": 0,                       // integer 0-5
  "body": "",                       // the governing body in full, e.g. "Mountain Village Town Council", "San Miguel County Board of County Commissioners"
  "topics": [],                     // 2-5 short topic tags, e.g. ["affordable housing", "Prop 123", "water lease"]
  "reasons": [],                    // 1-3 short bullet strings explaining the score, citing the specific agenda items that drove it
  "follow_up_to": null              // if the summary references a PRIOR decision/case/earlier step this continues (e.g. "second reading", "continued from", a named ongoing case), a short string naming it; otherwise null
}`;

function buildUserPrompt(meeting) {
  const { source, date, title, summary } = meeting;
  return `Score this government-meeting summary for newsworthiness.

SOURCE CODE: ${source}
DATE: ${date}
MEETING TITLE: ${title}

SUMMARY:
${summary}

Return ONLY the JSON object specified.`;
}

// Low-level Anthropic call — same shape as callClaude() in content-refresh.js.
// Returns the parsed JSON object the model emitted. Throws on API/parse error.
function callTriage(meeting, { apiKey, model, maxTokens = 1024 } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: model || TRIAGE_MODEL,
    max_tokens: maxTokens,
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(meeting) }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`${json.error.type || 'error'}: ${json.error.message || JSON.stringify(json.error)}`));
            return;
          }
          let text = json.content?.[0]?.text || '';
          const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence) text = fence[1];
          resolve(JSON.parse(text.trim()));
        } catch (e) {
          reject(new Error(`triage parse failed: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

// Normalize whatever the model returned into the canonical shape, clamping
// the score and guaranteeing the fields downstream code expects.
function normalize(raw, meeting) {
  let score = Number(raw && raw.score);
  if (Number.isNaN(score)) score = 0;
  score = Math.max(0, Math.min(5, Math.round(score)));
  return {
    source: meeting.source,
    date: meeting.date,
    title: meeting.title,
    score,
    branch: branchForScore(score),
    body: (raw && typeof raw.body === 'string' && raw.body.trim()) || '',
    topics: Array.isArray(raw && raw.topics) ? raw.topics.filter((t) => typeof t === 'string' && t.trim()) : [],
    reasons: Array.isArray(raw && raw.reasons) ? raw.reasons.filter((r) => typeof r === 'string' && r.trim()) : [],
    follow_up_to: (raw && typeof raw.follow_up_to === 'string' && raw.follow_up_to.trim()) || null,
  };
}

// PUBLIC: score one meeting. `meeting` = { source, date, title, summary }.
// Placeholder summaries short-circuit to score 0 with no API call.
async function scoreMeeting(meeting, opts = {}) {
  if (isPlaceholderSummary(meeting.summary)) {
    return normalize(
      { score: 0, body: '', topics: [], reasons: ['No agenda content / placeholder summary'], follow_up_to: null },
      meeting,
    );
  }
  const raw = await callTriage(meeting, opts);
  return normalize(raw, meeting);
}

module.exports = {
  scoreMeeting,
  branchForScore,
  isPlaceholderSummary,
  TRIAGE_MODEL,
  TRIAGE_SYSTEM_PROMPT,
};
