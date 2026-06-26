#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AUTO MEETING RECAPS — scripts/meeting-recaps.js
// ════════════════════════════════════════════════════════════════════
//
// Generates the "Past Meeting Summaries" recap cards automatically. Until now
// MEETING_RECAPS in js/gov-helpers.js was hand-written, so it went stale. This
// closes that gap:
//
//   1. List each entity's recent YouTube uploads (yt-dlp, flat — fast).
//   2. Parse the meeting date + body from each video TITLE (gov channels title
//      their videos like "HARC Regular Meeting 06/17/2026", "Town Council -
//      June 9, 2026"), keep only recent ones we haven't recapped yet.
//   3. Pull the video transcript (yt-dlp auto-captions, json3).
//   4. Claude writes a ~100-word "Rick"-voice recap of what HAPPENED.
//   5. Prepend to MEETING_RECAPS and write js/gov-helpers.js.
//
// Why yt-dlp: YouTube neutered the watch-page caption URLs and gates the
// InnerTube API behind attestation; yt-dlp tracks all that and keeps working.
//
// Usage:
//   node scripts/meeting-recaps.js                 # all entities, last 21 days
//   node scripts/meeting-recaps.js --dry-run       # list candidates only
//   node scripts/meeting-recaps.js --entity telluride --limit 2
//   node scripts/meeting-recaps.js --video VIDEOID --entity county --force
//
// Env: ANTHROPIC_API_KEY. Requires `yt-dlp` on PATH (pip install yt-dlp).

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { extractJsArray } = require('./lib/extract.js');
const { serializeArray } = require('./lib/serialize.js');
const { SONNET } = require('./lib/claude-model.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const GOV_HELPERS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const MODEL = process.env.EDITORIAL_MODEL || SONNET;

// Per-entity YouTube channels. Keep the URLs in sync with the `livestream`
// fields in js/gov-data.js (ENTITY_REMOTE). `/streams` is where these gov
// channels archive their meeting livestreams.
const CHANNELS = [
  { sourceKey: 'telluride', sourceLabel: 'Town of Telluride', url: 'https://www.youtube.com/@townoftelluridecolorado8739/streams' },
  { sourceKey: 'county',    sourceLabel: 'San Miguel County', url: 'https://www.youtube.com/@sanmiguelcountyco/streams' },
  { sourceKey: 'rico',      sourceLabel: 'Rico',              url: 'https://www.youtube.com/@townofrico/streams' },
];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = has('--dry-run');
const FORCE = has('--force');
const DAYS = parseInt(val('--days', '21'), 10);
const LIMIT = parseInt(val('--limit', '5'), 10);
const ONLY_ENTITY = val('--entity', null);
const ONLY_VIDEO = val('--video', null);
const KEEP = 50;   // cap MEETING_RECAPS length after prepending

const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

// Parse a meeting date out of a video title. Handles "06/17/2026",
// "June 9, 2026" / "Jun 9 2026", and "05282026" (MMDDYYYY). Returns ISO
// YYYY-MM-DD or null.
function parseDateFromTitle(title) {
  const t = String(title || '');
  let m;
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/))) return iso(m[3], m[1], m[2]);
  if ((m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo != null) return iso(m[3], mo + 1, m[2]);
  }
  if ((m = t.match(/\b(\d{2})(\d{2})(\d{4})\b/))) return iso(m[3], m[1], m[2]); // MMDDYYYY
  return null;
}
function iso(y, mo, d) {
  const Y = +y, M = +mo, D = +d;
  if (M < 1 || M > 12 || D < 1 || D > 31) return null;
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}
function daysSince(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? Infinity : Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Normalize a video/recap title to the governing BODY (date + boilerplate
// stripped) so we dedup at body+date granularity — this lets HARC and P&Z on
// the same day BOTH get recapped, while a re-upload of the same meeting (or a
// "Chair" sub-session of the same body) collapses to one.
function bodyToken(title) {
  return String(title || '')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '')
    .replace(/\b[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}\b/g, '')
    .replace(/\b\d{8}\b/g, '')
    .replace(/\b(regular|special|chair|work\s*session|meeting|board|of|directors|the)\b/gi, '')
    .replace(/[^a-z0-9&]+/gi, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
}

// "Chair" sessions are brief agenda-setting sub-meetings of the same body —
// low news value and they'd duplicate the body's substantive meeting.
const SKIP_TITLE = /\bchair\b/i;

function yt(argv) {
  return execFileSync('yt-dlp', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function listChannel(url) {
  let out = '';
  try { out = yt(['--flat-playlist', '--playlist-end', '15', '--print', '%(id)s\t%(title)s', url]); }
  catch (e) { console.warn(`  ⚠ could not list ${url}: ${String(e.message || e).slice(0, 80)}`); return []; }
  return out.split('\n').filter(Boolean).map((l) => { const i = l.indexOf('\t'); return { id: l.slice(0, i), title: l.slice(i + 1) }; });
}

// Pull the transcript for one video via yt-dlp auto/manual captions (json3).
function fetchTranscript(videoId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-'));
  try {
    try {
      yt(['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en', '--sub-format', 'json3',
        '-o', path.join(dir, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${videoId}`]);
    } catch (e) { /* yt-dlp prints to stderr; the file presence is the real signal */ }
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.json3'));
    if (!file) return '';
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const lines = (j.events || []).filter((e) => e.segs).map((e) => e.segs.map((s) => s.utf8 || '').join(''));
    // Drop consecutive duplicate lines (rolling-caption artifacts).
    const dedup = [];
    for (const ln of lines) { if (ln.trim() && ln !== dedup[dedup.length - 1]) dedup.push(ln); }
    return dedup.join(' ').replace(/\s+/g, ' ').trim();
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

const RECAP_SYSTEM_PROMPT = `You are "Rick", the single named voice behind Livable Telluride (a Telluride, Colorado civic site). "Rick" is an internal persona only — NEVER name or sign it. You are writing a SHORT RECAP of what happened at a government meeting, from its video transcript, for residents.

VOICE — knowing, not cynical; plainspoken; short sentences are fine; never flowery, never a press release; critical of processes/patterns, never of named individuals; not advocacy.

WHAT TO WRITE — the recap is about what ACTUALLY HAPPENED:
- Lead with the consequential outcomes: votes taken (and the tally if stated, e.g. "4-2"), ordinances/readings passed, applications approved/denied/tabled/continued, money allocated, appointments made.
- Note split votes and who dissented if the transcript makes it clear; note notable absences if stated.
- Skip procedural filler (roll call, minutes approval) unless nothing else happened.
- HARC (Historic & Architectural Review Commission) MEETINGS: HARC's routine
  docket is the design review of INDIVIDUAL PROPERTIES, and per policy these are
  NOT reported. OMIT every item that is the review of a specific property or
  address — Certificates of Appropriateness (COAs), flood-elevation raises,
  additions, remodels, demolitions, height/setback/material reviews, and
  new-construction design review for a single building or home. Concretely:
  if an item is identified by a street address (e.g. "239 North Aspen",
  "566 West Columbia", "208 South Fir"), DROP it entirely — do not name the
  address, the applicant, the vote, or the outcome. The ONLY HARC items worth
  reporting are town-wide matters: Design Guideline or code/text amendments, and
  genuinely major NON-residential projects (a hotel, a civic/public building, a
  large commercial development). A typical HARC meeting is entirely
  individual-property reviews and therefore has NOTHING to report.
  Close the loopholes: (a) flood-elevation / floodplain-variance raises of
  individual structures ARE individual-property reviews — OMIT them even when
  staff frame them as a code-interpretation or calculation change; only a
  formally ADOPTED Design Guideline or code-TEXT amendment counts as reportable
  policy, never its application to specific structures. (b) When you are unsure
  whether an individual-address item is residential or commercial, OMIT it.
  Continuances/tablings of individual-property items are also omitted.
- PLANNING COMMISSION / PLANNING & ZONING (P&Z) MEETINGS: do NOT report on
  single-family residences under review — individual single-family home
  variances, design reviews, setback/height/flood-elevation reviews for one
  house, or single-home construction/remodel/addition approvals. Omit them
  entirely. STILL report subdivisions, PUDs, rezonings, multi-family /
  affordable-housing projects, commercial development, and code/text amendments.
- (Both rules above apply ONLY to HARC / Planning Commission / P&Z — never to
  Town Council, BOCC, etc.)
- IF, after applying these rules, NOTHING substantive remains (the common case
  for HARC), return an EMPTY recap — {"title": "<body — date>", "recap": ""}.
  An empty recap means the meeting correctly gets NO card; do NOT pad it with the
  very items you were told to omit.
- Around 100 words. One paragraph. No headers, no lists, no markdown.

HARD RULES:
- Use ONLY what the transcript supports. Do NOT invent vote tallies, names, numbers, or outcomes. If the transcript is unclear on an outcome, describe it without a fabricated tally.
- Auto-generated captions misspell names — only state a name if you're confident; otherwise refer to "a councilmember"/"a commissioner".
- Never speculate about motives or what comes next.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{ "title": "Body — Mon D, YYYY  (e.g. \\"Town Council — Jun 9, 2026\\")", "recap": "~100 words, one paragraph" }`;

// Parse the model's JSON tolerantly. A long bodyHtml/recap can contain an
// unescaped straight quote (e.g. the phrase "above reproach") that breaks strict
// JSON.parse; when it does, fall back to greedily extracting the known fields.
function parseLoose(txt) {
  try { return JSON.parse(txt); } catch (e) { /* fall through */ }
  const un = (s) => s == null ? s : s.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  const strict = (k) => { const m = txt.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? un(m[1]) : undefined; };
  // Index-based grab for the long last-field (recap or bodyHtml): take everything
  // from after its opening quote to the object's final closing "} — so unescaped
  // straight quotes inside the prose are kept rather than ending the value early.
  // Works even if the response was truncated (no closing "}): grabs to the end.
  const greedy = (k) => {
    let i = txt.indexOf('"' + k + '"'); if (i < 0) return undefined;
    const colon = txt.indexOf(':', i + k.length + 2); if (colon < 0) return undefined;
    const open = txt.indexOf('"', colon + 1); if (open < 0) return undefined;
    let end = txt.lastIndexOf('"}'); if (end <= open) end = txt.lastIndexOf('"'); if (end <= open) end = txt.length;
    return un(txt.slice(open + 1, end));
  };
  const out = {};
  const t = strict('title'); if (t != null) out.title = t;
  const dek = strict('dek'); if (dek != null) out.dek = dek;
  const body = greedy('bodyHtml'); if (body != null) out.bodyHtml = body;
  const recap = greedy('recap'); if (recap != null) out.recap = recap;
  if (!Object.keys(out).length) throw new Error('could not parse model JSON');
  return out;
}

function callClaude(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 120000,
    }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try {
        const j = JSON.parse(d);
        if (j.error) return reject(new Error(`${j.error.type}: ${j.error.message}`));
        let txt = j.content?.[0]?.text || ''; const f = txt.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) txt = f[1];
        resolve(parseLoose(txt.trim()));
      } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic timeout')); });
    req.write(payload); req.end();
  });
}

async function recapFromTranscript(ch, isoDate, videoTitle, transcript) {
  const userPrompt = `ENTITY: ${ch.sourceLabel}\nVIDEO TITLE: ${videoTitle}\nMEETING DATE: ${isoDate}\n\nTRANSCRIPT (auto-captions):\n"""\n${transcript.slice(0, 600000)}\n"""\n\nWrite the recap. Return ONLY the JSON object.`;
  return callClaude({ model: MODEL, max_tokens: 700, system: RECAP_SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] });
}

// ── FULL SUMMARY (--full-summaries) ──
// Alongside the auto-published short recap, generate a LONGER transcript-based
// write-up and POST it to the editorial Worker as a kind:"full-summary" draft,
// which emails it for Approve/Edit/Deny. On approval it publishes a
// /meetings/<slug> page and a "Full Summary →" arrow under the meeting's recap.
// Only runs for meetings whose short recap succeeded (so SFR-suppressed
// meetings get neither).
const WORKER = process.env.EDITORIAL_WORKER || 'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev';
const EDITORIAL_SECRET = process.env.EDITORIAL_SECRET || '';
const FULL_SUMMARIES = has('--full-summaries');
function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}), timeout: 30000 },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d || '{}') }); } catch (e) { resolve({ status: res.statusCode, json: {} }); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('worker timeout')); });
    if (data) req.write(data); req.end();
  });
}
const summaryDraftId = (sourceKey, date, title) => 'fullsum-' + sourceKey + '-' + date + '-' + bodyToken(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const FULL_SUMMARY_SYSTEM_PROMPT = `You are "Rick", the single named voice behind Livable Telluride (a Telluride, Colorado civic site). "Rick" is an internal persona only — NEVER name or sign it. You are writing a FULL SUMMARY of a government meeting from its video transcript — a thorough but readable account for residents who want the detail behind the short recap card.

VOICE — Rick's voice: knowing, not cynical; plainspoken and clear; short sentences are fine; never flowery, never a press release; critical of processes/patterns, never of named individuals; not advocacy.
NOT TOO FOLKSY — this is a longer, detailed document, so lean PROFESSIONAL and informative: straight, readable reporting first. Use Rick's long view sparingly (at most a single light touch). AVOID folksy colloquialisms, dialect, and lived-in idioms ("the box canyon," "anyone who's been here long enough," "here we go again") and any affected local color — those belong on the short recap card, not here.

WHAT TO WRITE:
- A complete walk-through of what the body actually did: each substantive agenda item, the key discussion, the vote and tally (e.g. "4-2"), and the outcome (approved/denied/tabled/continued), plus money allocated and appointments.
- Organize by item, most consequential first. Be thorough but disciplined: roughly 400-800 words, and never exceed ~900. For an unusually packed agenda, give the consequential items their due and compress the minor ones to a sentence or two each rather than running long. Keep the prose tight — no padding or repetition. Plain HTML <p> paragraphs ONLY — no headings, lists, or markdown.
- Ground EVERY fact in the transcript. Do NOT invent vote tallies, names, numbers, or outcomes. Auto-captions misspell names — only name a person if you're confident; otherwise "a councilmember" / "a commissioner".
- PLANNING COMMISSION / P&Z / HARC: do NOT report individual single-family-residence reviews (COAs, flood-elevation raises, single-home design/variances/additions). Cover subdivisions, PUDs, rezonings, multi-family/affordable housing, commercial, civic buildings, and code/guideline amendments.

In all prose (dek and bodyHtml) use typographic curly quotes (“ ”) and apostrophes (’), NEVER straight double-quotes — a straight " inside a value breaks the JSON.

OUTPUT — ONLY valid JSON, no prose, no code fence (title uses the MONTH name, not a weekday):
{"title":"Body — Mon. D, YYYY (e.g. Town Council — Jun 9, 2026)","dek":"one-sentence standfirst, ~25-40 words","bodyHtml":"<p>…</p><p>…</p>"}`;

async function fullSummaryFromTranscript(ch, isoDate, videoTitle, transcript) {
  const userPrompt = `ENTITY: ${ch.sourceLabel}\nVIDEO TITLE: ${videoTitle}\nMEETING DATE: ${isoDate}\n\nTRANSCRIPT (auto-captions):\n"""\n${transcript.slice(0, 600000)}\n"""\n\nWrite the full summary. Return ONLY the JSON object.`;
  return callClaude({ model: MODEL, max_tokens: 4000, system: FULL_SUMMARY_SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY) { console.error('  ✗ ANTHROPIC_API_KEY not set'); process.exit(1); }
  if (FULL_SUMMARIES && !EDITORIAL_SECRET) { console.error('  ✗ --full-summaries needs EDITORIAL_SECRET'); process.exit(1); }

  let src = fs.readFileSync(GOV_HELPERS, 'utf8');
  const existing = extractJsArray(src, 'MEETING_RECAPS') || [];
  const seenVideo = new Set(existing.map((r) => r.videoUrl).filter(Boolean));
  const seenMeeting = new Set(existing.map((r) => `${r.sourceKey}|${r.date}|${bodyToken(r.title)}`));

  const channels = CHANNELS.filter((c) => !ONLY_ENTITY || c.sourceKey === ONLY_ENTITY);
  const added = [];

  for (const ch of channels) {
    const vids = listChannel(ch.url);
    for (const v of vids) {
      if (ONLY_VIDEO && v.id !== ONLY_VIDEO) continue;
      if (!FORCE && SKIP_TITLE.test(v.title)) continue;
      const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
      const date = parseDateFromTitle(v.title);
      if (!date) { continue; }
      const age = daysSince(date);
      if (!FORCE && (age > DAYS || age < 0)) continue;
      const meetKey = `${ch.sourceKey}|${date}|${bodyToken(v.title)}`;
      if (!FORCE && (seenVideo.has(videoUrl) || seenMeeting.has(meetKey))) continue;
      if (added.length >= LIMIT) { console.log(`  (reached --limit ${LIMIT})`); break; }

      console.log(`  ★ ${ch.sourceKey}  ${date}  ${v.title}`);
      if (DRY) { added.push({ sourceKey: ch.sourceKey, date, title: v.title, videoUrl }); continue; }

      const transcript = fetchTranscript(v.id);
      if (!transcript || transcript.length < 500) { console.log(`      ⚠ no usable transcript (${transcript.length} chars) — skipping`); continue; }
      console.log(`      transcript ${transcript.length} chars → drafting recap…`);
      let out;
      try { out = await recapFromTranscript(ch, date, v.title, transcript); }
      catch (e) { console.log(`      ✗ recap failed: ${e.message}`); continue; }
      if (!out || !out.recap) { console.log('      ✗ empty recap'); continue; }

      added.push({ sourceKey: ch.sourceKey, sourceLabel: ch.sourceLabel, date, title: (out.title || v.title).trim(), recap: out.recap.trim(), videoUrl });
      seenVideo.add(videoUrl); seenMeeting.add(meetKey);
      console.log(`      ✓ ${out.title}`);

      // Full Summary: longer write-up from the same transcript, emailed for approval.
      if (FULL_SUMMARIES && EDITORIAL_SECRET) {
        const sumId = summaryDraftId(ch.sourceKey, date, v.title);
        let exists = false;
        try { const ex = await httpJson('GET', `${WORKER}/article-exists?id=${encodeURIComponent(sumId)}&secret=${encodeURIComponent(EDITORIAL_SECRET)}`); exists = !!(ex.json && ex.json.exists); } catch (e) {}
        if (exists) { console.log('      · full summary already sent'); continue; }
        let sum;
        try { sum = await fullSummaryFromTranscript(ch, date, v.title, transcript); }
        catch (e) { console.log(`      ✗ full-summary failed: ${e.message}`); continue; }
        if (!sum || !sum.bodyHtml) { console.log('      ✗ empty full summary'); continue; }
        const draft = { id: sumId, slug: sumId, kind: 'full-summary',
          title: (sum.title || out.title || v.title).trim(), dek: (sum.dek || '').trim(), bodyHtml: sum.bodyHtml,
          meetingKey: `${ch.sourceKey}|${date}|${v.title}`,
          source: ch.sourceKey, sourceLabel: ch.sourceLabel, bodyLabel: ch.sourceLabel,
          meetingDate: date, videoUrl };
        try {
          const res = await httpJson('POST', `${WORKER}/article-create`, { secret: EDITORIAL_SECRET, draft });
          if (res.json && res.json.ok) console.log(`      ✉ full summary ${res.json.skipped ? 'already pending' : 'emailed for approval'}`);
          else console.log(`      ✗ full-summary create failed: ${(res.json && res.json.msg) || res.status}`);
        } catch (e) { console.log(`      ✗ full-summary create error: ${e.message}`); }
      }
    }
    if (added.length >= LIMIT) break;
  }

  console.log('  ' + '─'.repeat(64));
  if (!added.length) { console.log('  No new recaps.'); return; }
  if (DRY) { console.log(`  ${added.length} candidate(s) (dry run — nothing written).`); return; }

  // Prepend, dedup by videoUrl (new wins), newest-first, cap length.
  const merged = [...added, ...existing];
  const byUrl = new Map();
  for (const r of merged) if (r.videoUrl && !byUrl.has(r.videoUrl)) byUrl.set(r.videoUrl, r);
  const final = [...byUrl.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, KEEP);

  // Replace the MEETING_RECAPS literal in place.
  const startRe = /const\s+MEETING_RECAPS\s*=\s*\[/;
  const m = startRe.exec(src);
  if (!m) { console.error('  ✗ Could not find MEETING_RECAPS in gov-helpers.js'); process.exit(1); }
  let depth = 0, i = m.index + m[0].length - 1, end = -1;
  for (; i < src.length; i++) { if (src[i] === '[') depth++; else if (src[i] === ']') { if (--depth === 0) { end = i; break; } } }
  let semi = end + 1; while (semi < src.length && src[semi] !== ';') semi++; if (src[semi] === ';') semi++;
  src = src.slice(0, m.index) + serializeArray('MEETING_RECAPS', final) + src.slice(semi);
  // sanity: the file must still parse
  try { new Function(src); } catch (e) { console.error('  ✗ refusing to write — result would not parse: ' + e.message); process.exit(1); }
  fs.writeFileSync(GOV_HELPERS, src);
  console.log(`  ✓ Wrote ${added.length} new recap(s); MEETING_RECAPS now ${final.length} entries.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
