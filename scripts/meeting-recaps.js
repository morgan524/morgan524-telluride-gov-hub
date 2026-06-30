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
        resolve(JSON.parse(txt.trim()));
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

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY) { console.error('  ✗ ANTHROPIC_API_KEY not set'); process.exit(1); }

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
