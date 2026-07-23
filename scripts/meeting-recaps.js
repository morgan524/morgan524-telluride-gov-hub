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
  // Mountain Village does NOT use YouTube — it publishes to an AV Capture All
  // portal that exposes, per meeting, a direct .mp4 AND a .vtt caption file.
  // The .vtt is a ready-made transcript (no yt-dlp, no download, no
  // transcription) and it is not IP-blocked, so unlike the YouTube channels
  // this one would also work from CI. Added 2026-07-23 — MV had been in the
  // Vote Tracker with NO ingest path at all since March.
  { sourceKey: 'mv', sourceLabel: 'Mountain Village', kind: 'avcapture',
    url: 'https://media.avcaptureall.cloud/?customerGuid=f6f590a7-5acc-4d32-9928-ad9ae0d02e06&target=foo&view=thumbs&tabs=past%7Ctoday%7Cupcoming' },
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

// ── AV Capture All (Mountain Village) ────────────────────────────────
// The portal is a Blazor WASM app, so the meeting list only exists after the
// client renders. Playwright (already a dependency) loads it and we read the
// per-meeting download links straight out of the DOM. Each meeting yields a
// .vtt caption file we use as the transcript.
async function listAvCapture(url) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    // A real Chrome UA is required: with Playwright's default (which says
    // "HeadlessChrome") the Blazor app never renders — the DOM stays ~10 chars
    // and no meeting rows appear. Verified 2026-07-23.
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    // 'networkidle' fires BEFORE the Blazor WASM runtime finishes booting —
    // the DOM is still ~10 chars at that point. Wait on the rendered meeting
    // rows themselves, then a beat for the asset links to attach.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // state:'attached' — the rows exist in the DOM but are not all VISIBLE
    // (collapsed cards), so the default visibility wait times out.
    await page.waitForSelector('a[href^="/meeting/"]', { state: 'attached', timeout: 90000 });
    await page.waitForTimeout(3000);
    // Collect one row per meeting GUID with its .vtt URL. Do NOT try to read
    // the date out of the surrounding DOM — closest() lands on a tiny cell
    // ("05:47:58") and the date isn't in it. The asset FILENAME encodes both
    // the body and the date reliably:
    //   "Town Council Meeting_2026-07-16_02-24-34 PM.vtt"
    const raw = await page.evaluate(() => {
      const seen = new Set(); const out = [];
      for (const a of document.querySelectorAll('a[href^="/meeting/"]')) {
        const guid = (a.getAttribute('href') || '').split('/').pop();
        if (!guid || seen.has(guid)) continue;
        const vtt = [...document.querySelectorAll(`a[href*="/meetings/${guid}/"]`)]
          .map((x) => x.getAttribute('href')).find((h) => /\.vtt(\?|$)/i.test(h));
        if (!vtt) continue;
        seen.add(guid); out.push({ id: guid, vtt });
      }
      return out;
    });
    const parsed = [];
    for (const r of raw) {
      let base = '';
      try { base = decodeURIComponent(r.vtt.split('/').pop().split('?')[0]); } catch { continue; }
      const m = base.match(/^(.*?)_(\d{4}-\d{2}-\d{2})_/);
      if (!m) continue;
      const rawTitle = m[1].replace(/\s*Merged\s*$/i, '').trim();
      parsed.push({
        id: r.id, vtt: r.vtt, date: m[2],
        title: /design review/i.test(rawTitle) ? 'Design Review Board Meeting' : rawTitle,
        merged: /merged/i.test(base),
      });
    }
    return parsed;
  } finally { await browser.close(); }
}

// WebVTT → plain text: drop the header, cue numbers and timing lines, and
// collapse the rolling-caption duplicates the same way the yt-dlp path does.
function vttToText(vtt) {
  const lines = String(vtt || '').split(/\r?\n/)
    .filter((l) => l.trim() && l.trim() !== 'WEBVTT' && !l.includes('-->') && !/^\d+$/.test(l.trim()));
  const dedup = [];
  for (const ln of lines) if (ln !== dedup[dedup.length - 1]) dedup.push(ln);
  return dedup.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchVtt(url) {
  const res = await fetch(url);
  if (!res.ok) return '';
  return vttToText(await res.text());
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
- Around 100 words. Separate distinct topics with a BLANK LINE (\\n\\n) — two to four short paragraphs. No headers, no lists, no markdown.

HARD RULES:
- Use ONLY what the transcript supports. Do NOT invent vote tallies, names, numbers, or outcomes. If the transcript is unclear on an outcome, describe it without a fabricated tally.
- Auto-generated captions misspell names — only state a name if you're confident; otherwise refer to "a councilmember"/"a commissioner".
- Never speculate about motives or what comes next.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{ "title": "Body — Mon D, YYYY  (e.g. \\"Town Council — Jun 9, 2026\\")",
  "recap": "~100 words, short paragraphs separated by blank lines",
  "votes": [ { "item": "<what was voted on, max 50 chars>", "outcome": "Passed|Failed|Tabled|Continued", "tally": "<e.g. 6-0, 4-3; empty string if not stated>" } ] }
VOTES RULES — substantive votes ONLY: ordinances/readings, resolutions, approvals/denials of applications, contracts/IGAs, money allocated, appointments. EXCLUDE administrative/procedural votes: minutes, agenda, consent-agenda approval, adjournment, entering/leaving executive session, continuances of omitted individual-property items. Same no-invention rule: only votes the transcript clearly supports; leave tally "" when unstated. Empty array when none.`;

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
        let txt = j.content?.[0]?.text || '';
        // Strip a markdown fence. The old regex required a CLOSING ``` — when a
        // response hit max_tokens mid-JSON the fence was never closed, the
        // regex missed, and JSON.parse choked on the leading backticks
        // ("Unexpected token '`'"). Strip the opening and any closing fence
        // independently so an unclosed fence still parses. (2026-07-23)
        txt = txt.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (j.stop_reason === 'max_tokens') {
          return reject(new Error('Claude response hit max_tokens (truncated JSON) — raise max_tokens for this call'));
        }
        resolve(JSON.parse(txt));
      } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic timeout')); });
    req.write(payload); req.end();
  });
}

async function recapFromTranscript(ch, isoDate, videoTitle, transcript) {
  const userPrompt = `ENTITY: ${ch.sourceLabel}\nVIDEO TITLE: ${videoTitle}\nMEETING DATE: ${isoDate}\n\nTRANSCRIPT (auto-captions):\n"""\n${transcript.slice(0, 600000)}\n"""\n\nWrite the recap. Return ONLY the JSON object.`;
  // 1500, not 700: the payload is a ~100-word recap PLUS a votes[] array, and a
  // busy meeting (Jun 30 2026 had six) truncated at 700 — which surfaced as an
  // unparseable half-JSON rather than an obvious budget error.
  return callClaude({ model: MODEL, max_tokens: 1500, system: RECAP_SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] });
}

/* ── Vote-tracker drafts ─────────────────────────────────────────────
   For boards the Vote Tracker covers, run a SECOND pass over the same
   transcript extracting substantive votes into the pending-JSON format
   used by extract-votes.mjs. NOTHING is inserted automatically — drafts
   land in scripts/pending/ and the workflow opens a review issue. The
   human review + insert-votes.mjs step stays (transcript tallies need
   eyes; that gate is by design). */
const VT_CONFIG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'vote-tracker-config.json'), 'utf8')); }
  catch (e) { return {}; }
})();
function trackerEntityFor(sourceKey, title) {
  if (sourceKey === 'county' && /county commissioners|BOCC/i.test(title)) return 'bocc';
  if (sourceKey === 'county' && /planning commission/i.test(title)) return 'pc';
  if (sourceKey === 'mv' && /design review/i.test(title)) return 'drb';
  if (sourceKey === 'mv' && /town council/i.test(title)) return 'tomv';
  if (sourceKey === 'rico' && /trustees/i.test(title)) return 'rico';
  // Telluride Town Council — enabled 2026-07-23 once the `telluride` roster
  // landed in vote-tracker-config.json (commit ecbc243). It was hardcoded out
  // before that, which is why the tracker never picked up council votes.
  if (sourceKey === 'telluride' && /town council/i.test(title)) return 'telluride';
  return '';
}
// Resolve the roster in force on a given date. The config stores `rosters` —
// an array of {start,end,members} windows — NOT a flat `roster`. draftVotes
// used to test `entity.roster`, which is undefined for every entity, so it
// returned null on every call and NO vote draft was ever produced. Fixed
// 2026-07-23.
function rosterForDate(entity, isoDate) {
  const windows = entity && entity.rosters;
  if (!Array.isArray(windows)) return null;
  const w = windows.find((r) => isoDate >= r.start && (r.end === null || r.end === undefined || isoDate <= r.end));
  return w && Array.isArray(w.members) && w.members.length ? w.members : null;
}
// The system prompt already tells Claude to skip procedural motions, but it
// doesn't reliably comply — the Jun 30 2026 council run returned two executive
// sessions, the consent calendar and a "THA — Approve minutes" among 14 votes.
// Since drafts now publish unattended, enforce it deterministically instead of
// trusting the model. Substantive housing/land-use/appointment votes that merely
// mention "minutes" in passing are unaffected: these patterns anchor on the
// motion's own subject. (2026-07-23)
const PROCEDURAL_RE = /\b(?:go into|enter|convene in|adjourn(?:ment)?|recess)\b|\bexecutive session\b|\bconsent calendar\b|\bapprove (?:the )?(?:minutes|agenda)\b|\bminutes approval\b|\bapproval of (?:the )?(?:minutes|agenda)\b/i;
function isProcedural(title) { return PROCEDURAL_RE.test(String(title || '')); }

async function draftVotes(entityKey, isoDate, title, transcript, videoUrl) {
  const entity = VT_CONFIG[entityKey];
  const roster = rosterForDate(entity, isoDate);
  if (!entity || !roster) {
    console.warn(`  · vote draft skipped for ${entityKey} ${isoDate}: no roster window covers that date`);
    return null;
  }
  const rosterIds = roster.join(', ');
  const sys = `You are extracting substantive recorded votes from a government meeting TRANSCRIPT (auto-captions — noisy) for ${entity.label || entityKey}. ` +
    `Substantive = ordinances, resolutions, IGAs, variances/CUPs/PUDs, code amendments, contracts, appointments. NOT procedural (agenda/minutes approval, adjournment). ` +
    `Roster member ids: ${rosterIds}. Return ONLY JSON: {"votes":[{"title":"<short motion title>","category":"<one of: Land Use, Housing, Budget & Finance, Public Safety, Appointments, Intergovernmental, Other>","outcome":"Passed|Failed|Tabled|Continued","tally":"<e.g. 6-0>","detail":"<one sentence>","memberVotes":{"<id>":"Yes|No|Abstain|Absent"}}]} ` +
    `Use ONLY what the transcript supports; if member-by-member votes are unclear, omit memberVotes rather than guessing. If no substantive votes, return {"votes":[]}.`;
  const body = {
    model: MODEL, max_tokens: 2000, system: sys,
    messages: [{ role: 'user', content: `MEETING: ${title} (${isoDate})\n\nTRANSCRIPT:\n"""\n${transcript.slice(0, 600000)}\n"""\n\nReturn ONLY the JSON object.` }]
  };
  const parsed = await callClaude(body);   // callClaude returns parsed JSON
  if (!parsed || !parsed.votes || !parsed.votes.length) return null;

  // Emit the SHAPE insert-votes.mjs consumes: a top-level `entries` array of
  // tracker records ({id,date,year,meeting,minutesUrl,title,description,tags,
  // outcome,tally,votes}). This used to write `votes:` with a different record
  // shape, which the inserter silently ignored — so even a successful draft
  // could never reach the tracker.
  const year = Number(isoDate.slice(0, 4));
  const prefix = entity.idPrefix || entityKey;
  const rosterSet = new Set(roster);
  const entries = parsed.votes.map((v, i) => {
    // Keep only ids that are actually on the roster for this date — a
    // hallucinated member would corrupt the heatmap.
    const votes = {};
    for (const [id, val] of Object.entries(v.memberVotes || {})) {
      if (rosterSet.has(id) && /^(Yes|No|Abstain|Absent|Recused|Vacant)$/.test(val)) votes[id] = val;
    }
    return {
      id: `${prefix}${year}-${String(i + 1).padStart(2, '0')}`,
      date: isoDate, year,
      meeting: title,
      // Transcript-sourced, so cite the recording. The tracker labels its
      // source "official adopted minutes" — swap in the CivicWeb minutes URL
      // when they are adopted.
      minutesUrl: videoUrl || '',
      title: v.title || '',
      description: v.detail || '',
      tags: v.category ? [v.category] : [],
      outcome: v.outcome || '',
      tally: v.tally || '',
      votes
    };
  // Drop anything with no usable per-member votes: the heatmap is the whole
  // point, and a tally-only row would publish an empty column of dashes.
  }).filter((e) => e.title && Object.keys(e.votes).length)
    .filter((e) => !isProcedural(e.title));

  if (!entries.length) {
    console.warn(`  · vote draft for ${entityKey} ${isoDate}: ${parsed.votes.length} motion(s) found but none had usable per-member votes — skipped`);
    return null;
  }
  const dir = path.join(__dirname, 'pending');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entityKey}-${isoDate}.json`);
  fs.writeFileSync(file, JSON.stringify({
    entity: entityKey, entityLabel: entity.label || entityKey, date: isoDate, meeting: title,
    rosterUsed: roster,
    source: 'transcript-auto-draft (meeting-recaps.js)',
    generatedAt: new Date().toISOString(),
    entries
  }, null, 2) + '\n');
  console.log(`  ✓ vote draft: ${entries.length} vote(s) → ${path.relative(process.cwd(), file)}`);
  return file;
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
    const isAv = ch.kind === 'avcapture';
    let vids = isAv ? await listAvCapture(ch.url) : listChannel(ch.url);
    if (isAv) {
      // The portal often holds several recordings of the same body on the same
      // day (a short fragment plus the full session, plus a "Merged" file).
      // Keep the LONGEST per body+date so we never recap a 2-minute stub.
      // Several recordings often exist for one body on one day (a short stub,
      // the full session, and a "Merged" file). Prefer Merged, else keep the
      // first; a stub that slips through is caught by the <500-char transcript
      // guard below.
      const best = new Map();
      for (const v of vids) {
        if (!v.date) continue;
        const k = `${v.date}|${bodyToken(v.title)}`;
        const cur = best.get(k);
        if (!cur || (v.merged && !cur.merged)) best.set(k, v);
      }
      vids = [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
    }
    for (const v of vids) {
      if (ONLY_VIDEO && v.id !== ONLY_VIDEO) continue;
      if (!FORCE && SKIP_TITLE.test(v.title)) continue;
      const videoUrl = isAv
        ? `https://media.avcaptureall.cloud/meeting/${v.id}`
        : `https://www.youtube.com/watch?v=${v.id}`;
      const date = v.date || parseDateFromTitle(v.title);
      if (!date) { continue; }
      const age = daysSince(date);
      if (!FORCE && (age > DAYS || age < 0)) continue;
      const meetKey = `${ch.sourceKey}|${date}|${bodyToken(v.title)}`;
      if (!FORCE && (seenVideo.has(videoUrl) || seenMeeting.has(meetKey))) continue;
      if (added.length >= LIMIT) { console.log(`  (reached --limit ${LIMIT})`); break; }

      console.log(`  ★ ${ch.sourceKey}  ${date}  ${v.title}`);
      if (DRY) { added.push({ sourceKey: ch.sourceKey, date, title: v.title, videoUrl }); continue; }

      const transcript = isAv ? await fetchVtt(v.vtt) : fetchTranscript(v.id);
      if (!transcript || transcript.length < 500) { console.log(`      ⚠ no usable transcript (${transcript.length} chars) — skipping`); continue; }
      console.log(`      transcript ${transcript.length} chars → drafting recap…`);
      let out;
      try { out = await recapFromTranscript(ch, date, v.title, transcript); }
      catch (e) { console.log(`      ✗ recap failed: ${e.message}`); continue; }
      if (!out || !out.recap) { console.log('      ✗ empty recap'); continue; }

      added.push({ sourceKey: ch.sourceKey, sourceLabel: ch.sourceLabel, date, title: (out.title || v.title).trim(), recap: out.recap.trim(), votes: Array.isArray(out.votes) ? out.votes.slice(0, 8) : [], videoUrl });
      seenVideo.add(videoUrl); seenMeeting.add(meetKey);
      console.log(`      ✓ ${out.title}`);

      // Vote-tracker draft from the same transcript (tracked boards only).
      const vtEntity = trackerEntityFor(ch.sourceKey, v.title);
      if (vtEntity) {
        try {
          const vf = await draftVotes(vtEntity, date, v.title, transcript, videoUrl);
          if (vf) console.log(`      🗳 vote draft → ${vf.replace(/^.*scripts\//, 'scripts/')}`);
        } catch (e) { console.log(`      ⚠ vote draft failed (recap unaffected): ${e.message}`); }
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
