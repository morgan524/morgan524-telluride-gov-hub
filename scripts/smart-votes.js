#!/usr/bin/env node
/**
 * smart-votes.js — SMART (San Miguel Authority for Regional Transportation)
 * Board of Directors votes, read from the MINUTES inside each posted board
 * packet at https://smarttelluride.colorado.gov/board-meetings (Morgan,
 * 2026-09-29).
 *
 * SMART posts no separate minutes; each month's packet carries the PREVIOUS
 * meeting's draft minutes ("Board of Directors Meeting August 13th, 2026 …
 * minutes"), which record directors present by jurisdiction and every motion
 * as "X moved … / Y seconded … / The motion passed unanimously." So unlike
 * the caption-derived tracker rows, attendance is explicit: a unanimous vote
 * is Yes for every director present, and absent directors are Absent.
 *
 * Pipeline (idempotent — packets already parsed are skipped):
 *   1. list "… Board Packet" PDFs on the board-meetings page
 *   2. download each new packet, extract text (pdfjs), cut out the minutes
 *   3. Claude → { meetings:[{ date, present[], motions[] }] }
 *   4. store in data/smart-votes.json; rebuild the SMART block in
 *      v2/vote-tracker.html (between SMART-BEGIN / SMART-END markers)
 *
 * Usage: node scripts/smart-votes.js [--limit N] [--dry-run] [--reparse]
 * Needs ANTHROPIC_API_KEY for new packets. RSS_PROXY_URL (the site Worker) is
 * used as a fallback when SMART's CloudFront 403s a direct request (it blocks
 * GitHub runner IPs).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { SONNET } = require('./lib/claude-model.js');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'https://smarttelluride.colorado.gov/board-meetings';
const ORIGIN = 'https://smarttelluride.colorado.gov';
const STORE = path.join(ROOT, 'data', 'smart-votes.json');
const TRACKER = path.join(ROOT, 'v2', 'vote-tracker.html');
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i > -1 ? +args[i + 1] : Infinity; })();
const DRY = args.includes('--dry-run');
const REPARSE = args.includes('--reparse');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function rawGet(url, binary) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf,*/*', 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 120000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return resolve(rawGet(new URL(r.headers.location, url).href, binary)); }
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => { const b = Buffer.concat(chunks); resolve({ status: r.statusCode, body: binary ? b : b.toString('utf8') }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: binary ? Buffer.alloc(0) : '' }); });
    req.on('error', () => resolve({ status: 0, body: binary ? Buffer.alloc(0) : '' }));
  });
}
async function get(url, binary = false) {
  let r = await rawGet(url, binary);
  if (r.status !== 200 && process.env.RSS_PROXY_URL) {
    r = await rawGet(process.env.RSS_PROXY_URL.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url), binary);
  }
  return r;
}

function claudeJson(system, user) {
  const body = JSON.stringify({ model: SONNET, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] });
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }, (r) => {
      let t = ''; r.on('data', (c) => { t += c; });
      r.on('end', () => {
        try {
          const j = JSON.parse(t);
          if (j.error) return reject(new Error(j.error.message));
          const txt = (j.content || []).map((c) => c.text || '').join('');
          const m = txt.match(/\{[\s\S]*\}/);
          resolve(m ? JSON.parse(m[0]) : null);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.end(body);
  });
}

async function pdfText(buf) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const c = await p.getTextContent();
    // Rebuild line breaks from the y-coordinate so "X moved… / Y seconded…"
    // stay on separate lines (pdfjs gives positioned fragments).
    let lastY = null, line = '', lines = [];
    for (const it of c.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += it.str; lastY = y;
    }
    lines.push(line);
    pages.push(lines.join('\n'));
  }
  return pages;
}

// The minutes are a few pages that open with "Board of Directors Meeting
// <date> … minutes" and list "Directors Present". Return every such block
// (a packet can carry a regular AND a special meeting).
function minutesBlocks(pages) {
  const out = [];
  pages.forEach((txt, i) => {
    if (!/Directors?\s+Present/i.test(txt) || !/minutes/i.test(txt)) return;
    if (out.length && out[out.length - 1].end >= i) return;
    let end = i;
    // Continue while following pages still read like minutes (motions, items)
    while (end + 1 < pages.length && end - i < 6 && /\b(moved|seconded|motion|Item \d+|adjourn)/i.test(pages[end + 1]) && !/Directors?\s+Present/i.test(pages[end + 1])) end++;
    out.push({ start: i, end, text: pages.slice(i, end + 1).join('\n\n') });
  });
  return out;
}

const SYSTEM = `You extract recorded votes from the draft MINUTES of the SMART (San Miguel Authority for Regional Transportation) Board of Directors, Colorado.
Return ONLY JSON: {"meetings":[{"date":"YYYY-MM-DD","type":"Regular|Special|Work Session","present":[{"name":"<full name as written>","jurisdiction":"<Town of Telluride|Town of Mountain Village|San Miguel County|Town of Ophir|Town of Rico|Town of Norwood|…>","alternate":true|false}],"motions":[{"title":"<short plain title, e.g. 'Resolution 2026-15 — Gondola Advisory Committee restructuring'>","category":"<one of: Budget & Finance, Transit Operations, Gondola, Intergovernmental, Appointments, Governance, Other>","mover":"<name>","seconder":"<name>","outcome":"Passed|Failed","tally":"<e.g. 5-0, or '' if not stated>","no":["<names voting no>"],"abstain":["<names>"],"recused":["<names>"],"detail":"<one sentence on what was approved>"}],"recap":"<2 short paragraphs (120-220 words total) for residents: what the board discussed and decided, in plain English, naming key projects/amounts; no invented facts; no mention of 'the minutes'>"}]}
Rules: use ONLY what the minutes state. "Passed unanimously" = no dissent. Only list a name under no/abstain/recused if the minutes say so. Directors present = voting members (and alternates only if the minutes list them among Member Directors present). Staff/guests are not directors. INCLUDE every motion that was voted on, including approval of agenda/consent/minutes (the caller filters procedural ones). If there are no minutes in the text, return {"meetings":[]}.`;

const PROCEDURAL = /\b(?:executive session|adjourn|recess)\b|\bapprov\w*\b[^.]{0,40}\b(?:agenda|minutes|consent)\b|\b(?:agenda|minutes|consent)\b[^.]{0,40}\bapprov/i;

// Name → stable id. "Ashley Story Von Spreecken" and "…Spreeken" are the same
// person, so ids merge on a small edit distance within the same first initial.
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Known spelling variants in SMART's minutes → one director. Checked against
// the other trackers' ids so people who sit on both (Fee, Errico, Stark,
// Permakoff, Magid, Gomez…) line up across boards.
const ALIAS = { meehanfee: 'fee', vonsprecken: 'storyvonspreecken', vonspreeken: 'storyvonspreecken', storyvonspreeken: 'storyvonspreecken', erico: 'errico', garcia: 'gomez', hollstrom: 'holstrom' };
const CANON = { fee: 'Meehan Fee', storyvonspreecken: 'Ashley Story Von Spreecken', errico: 'Teddy Errico', holstrom: 'Kris Holstrom', gomez: 'Rick Gomez', prohaska: 'Martinique Prohaska' };
function makeIdResolver(members) {
  const raw = makeRawResolver(members);
  return (fullName) => {
    let id = raw(fullName);
    if (id && ALIAS[id]) {
      const to = ALIAS[id];
      if (!members[to]) members[to] = { ...(members[id] || {}), name: CANON[to] || (members[id] || {}).name || to };
      if (id !== to) delete members[id];
      id = to;
    }
    if (id && CANON[id] && members[id]) members[id].name = CANON[id];
    return id;
  };
}
function makeRawResolver(members) {
  return (fullName) => {
    const clean = String(fullName || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-z .'-]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0].toLowerCase(), last = (parts.length > 1 ? parts.slice(1).join('') : parts[0]).toLowerCase().replace(/[^a-z]/g, '');
    for (const [id, m] of Object.entries(members)) {
      if ((m.first || '')[0] !== first[0]) continue;
      if (id === last || lev(id, last) <= 2 || id.endsWith(last) || last.endsWith(id)) return id;
    }
    // Last-name-only mentions ("Stark moved…") match an existing director.
    if (parts.length === 1) for (const [id] of Object.entries(members)) if (id === last || lev(id, last) <= 1) return id;
    members[last] = { name: clean, first, jurisdiction: '', alternate: false, seen: 0 };
    return last;
  };
}

// Past Meetings & Recaps: one card per SMART meeting, written from the minutes
// (SMART has no recordings we can transcribe). SMART cards are replaced
// wholesale each run; every other entity's recaps are left untouched.
// `videoUrl` doubles as the dedup key in meeting-recaps.js, so it must be
// unique per meeting: the packet URL + #minutes-<date>.
const GOV_HELPERS = path.join(ROOT, 'js', 'gov-helpers.js');
function buildRecaps(store) {
  const { extractJsArray } = require('./lib/extract.js');
  const { serializeArray } = require('./lib/serialize.js');
  let src = fs.readFileSync(GOV_HELPERS, 'utf8');
  const existing = extractJsArray(src, 'MEETING_RECAPS') || [];
  const seen = new Set();
  const smart = [];
  const meetings = Object.values(store.packets).flatMap((p) => (p.meetings || []).map((m) => ({ ...m, packetUrl: p.url }))).sort((a, b) => b.date.localeCompare(a.date));
  for (const m of meetings) {
    if (!m.recap || seen.has(m.date + m.type)) continue;
    seen.add(m.date + m.type);
    const when = new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    smart.push({
      sourceKey: 'smart', sourceLabel: 'SMART', date: m.date,
      title: `SMART Board of Directors${m.type && m.type !== 'Regular' ? ' ' + m.type : ''} — ${when}`,
      recap: m.recap,
      votes: (m.motions || []).filter((mo) => !PROCEDURAL.test(mo.title || '')).slice(0, 8).map((mo) => ({ item: mo.title, outcome: /failed/i.test(mo.outcome) ? 'Failed' : 'Passed', tally: mo.tally || '' })),
      videoUrl: `${m.packetUrl}#minutes-${m.date}`,
      minutesUrl: m.packetUrl,
    });
  }
  if (!smart.length) return null;
  const final = [...smart, ...existing.filter((r) => r.sourceKey !== 'smart')].sort((a, b) => (a.date < b.date ? 1 : -1));
  const mm = /const\s+MEETING_RECAPS\s*=\s*\[/.exec(src);
  let depth = 0, i = mm.index + mm[0].length - 1, end = -1;
  for (; i < src.length; i++) { if (src[i] === '[') depth++; else if (src[i] === ']') { if (--depth === 0) { end = i; break; } } }
  let semi = end + 1; while (semi < src.length && src[semi] !== ';') semi++; if (src[semi] === ';') semi++;
  src = src.slice(0, mm.index) + serializeArray('MEETING_RECAPS', final) + src.slice(semi);
  new Function(src);
  console.log(`SMART recaps: ${smart.length} meeting summaries (MEETING_RECAPS now ${final.length})`);
  return src;
}

function rebuildTrackerBlock(store) {
  const members = store.members;
  const items = [];
  const byYear = {};
  const meetings = Object.values(store.packets).flatMap((p) => (p.meetings || []).map((m) => ({ ...m, packetUrl: p.url }))).sort((a, b) => a.date.localeCompare(b.date));
  const seenMotion = new Set();
  // Seats per jurisdiction = the most REGULAR (non-alternate) directors it has
  // ever had present at once. An alternate votes only when their jurisdiction
  // is short a regular that meeting (Aug 13 2026: both Telluride regulars +
  // alternate Permakoff present → Permakoff did not vote; Jul 23: one regular
  // → she did).
  const jur = (id) => (members[id] && members[id].jurisdiction) || '?';
  // Alternate status is PER MEETING (Mogenson was an alternate, later a director).
  const isAltAt = (m, id) => (m.altIds ? m.altIds.includes(id) : !!(members[id] && members[id].alternate));
  const seats = {};
  for (const m of meetings) {
    const c = {}; for (const id of m.presentIds || []) if (!isAltAt(m, id)) c[jur(id)] = (c[jur(id)] || 0) + 1;
    for (const [j, n] of Object.entries(c)) seats[j] = Math.max(seats[j] || 0, n);
  }
  for (const m of meetings) {
    const year = m.date.slice(0, 4);
    const regCount = {}; for (const id of m.presentIds || []) if (!isAltAt(m, id)) regCount[jur(id)] = (regCount[jur(id)] || 0) + 1;
    const altUsed = {};
    const present = (m.presentIds || []).filter((id) => {
      if (!isAltAt(m, id)) return true;
      const j = jur(id), open = (seats[j] || 1) - (regCount[j] || 0) - (altUsed[j] || 0);
      if (open > 0) { altUsed[j] = (altUsed[j] || 0) + 1; return true; }
      return false;
    });
    for (const mo of (m.motions || [])) {
      if (PROCEDURAL.test(mo.title || '')) continue;
      const key = m.date + '|' + String(mo.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seenMotion.has(key)) continue; seenMotion.add(key);
      const votes = {};
      const failedUnan = /failed/i.test(mo.outcome) && !(mo.noIds || []).length;
      for (const id of present) votes[id] = failedUnan ? 'No' : 'Yes';
      for (const id of (mo.noIds || [])) votes[id] = 'No';
      for (const id of (mo.abstainIds || [])) votes[id] = 'Abstain';
      for (const id of (mo.recusedIds || [])) votes[id] = 'Recused';
      byYear[year] = (byYear[year] || 0) + 1;
      const yes = Object.values(votes).filter((v) => v === 'Yes').length, no = Object.values(votes).filter((v) => v === 'No').length;
      items.push({
        id: `smart${year}-${String(byYear[year]).padStart(2, '0')}`, date: m.date, year: +year,
        meeting: `SMART Board — ${new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${m.type && m.type !== 'Regular' ? ' (' + m.type + ')' : ''}`,
        minutesUrl: m.packetUrl, title: mo.title, description: mo.detail || '', tags: [mo.category || 'Other'],
        outcome: /failed/i.test(mo.outcome) ? 'Failed' : 'Passed', tally: mo.tally || `${yes}-${no}`, votes,
      });
    }
  }
  const lastAlt = {}; for (const m of meetings) for (const id of m.presentIds || []) lastAlt[id] = isAltAt(m, id);
  for (const [id] of Object.entries(members)) members[id].alternate = !!lastAlt[id];
  const allMembers = Object.entries(members).sort((a, b) => (a[1].jurisdiction || '').localeCompare(b[1].jurisdiction || '') || a[1].name.localeCompare(b[1].name))
    .map(([id, m]) => ({ id, name: m.name, shortName: m.name.split(' ').slice(-1)[0], title: (m.jurisdiction || 'Director') + (m.alternate ? ' (alternate)' : ''), alternate: !!m.alternate }));
  const block = `/* SMART-BEGIN — generated by scripts/smart-votes.js from the minutes inside each
   SMART board packet (https://smarttelluride.colorado.gov/board-meetings).
   Do not hand-edit: re-run the script. Columns per year are the directors who
   attended that year; a director not present at a meeting shows Absent. */
const SMART_ALL_MEMBERS = ${JSON.stringify(allMembers, null, 1)};
const SMART_VOTE_ITEMS = ${JSON.stringify(items, null, 1)};
/* SMART-END */`;
  let html = fs.readFileSync(TRACKER, 'utf8');
  const a = html.indexOf('/* SMART-BEGIN'), b = html.indexOf('/* SMART-END */');
  if (a < 0 || b < 0) throw new Error('SMART-BEGIN/SMART-END markers not found in v2/vote-tracker.html');
  html = html.slice(0, a) + block + html.slice(b + '/* SMART-END */'.length);
  return { html, items: items.length, members: allMembers.length };
}

(async () => {
  let store = { members: {}, packets: {} };
  try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { /* first run */ }
  if (REPARSE) store.members = {};   // rebuild names cleanly from the re-read minutes

  const page = await get(PAGE);
  if (page.status !== 200) { console.error(`SMART board-meetings page: HTTP ${page.status}`); process.exit(1); }
  const packets = [];
  for (const m of page.body.matchAll(/<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!/packet/i.test(label + m[1])) continue;
    let url = m[1]; if (!/^https?:/i.test(url)) url = ORIGIN + (url.startsWith('/') ? '' : '/') + url;
    if (!packets.find((p) => p.url === url)) packets.push({ url, label });
  }
  console.log(`SMART: ${packets.length} board packet(s) on the page`);

  const resolveId = makeIdResolver(store.members);
  let done = 0;
  for (const pk of packets) {
    if (done >= LIMIT) break;
    if (store.packets[pk.url] && !REPARSE) continue;
    if (!process.env.ANTHROPIC_API_KEY) { console.warn('  ANTHROPIC_API_KEY not set — cannot parse new packets'); break; }
    done++;
    process.stdout.write(`  ${pk.label} … `);
    const r = await get(pk.url, true);
    if (r.status !== 200 || !r.body.length) { console.log(`HTTP ${r.status} — skipped`); continue; }
    let pages; try { pages = await pdfText(r.body); } catch (e) { console.log(`PDF error ${e.message} — skipped`); continue; }
    const blocks = minutesBlocks(pages);
    if (!blocks.length) { console.log('no minutes found'); store.packets[pk.url] = { url: pk.url, label: pk.label, meetings: [], note: 'no minutes' }; continue; }
    let parsed;
    try { parsed = await claudeJson(SYSTEM, blocks.map((b) => b.text).join('\n\n=====\n\n').slice(0, 60000)); }
    catch (e) { console.log(`Claude error ${e.message} — will retry next run`); continue; }
    const meetings = [];
    for (const m of (parsed && parsed.meetings) || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) continue;
      const presentIds = [], altIds = [];
      for (const d of m.present || []) {
        const id = resolveId(d.name); if (!id) continue;
        const mem = store.members[id];
        mem.seen = (mem.seen || 0) + 1;
        if (d.jurisdiction) mem.jurisdiction = d.jurisdiction;
        if (typeof d.alternate === 'boolean') mem.alternate = d.alternate;
        if (!CANON[id] && String(d.name).length > String(mem.name).length) mem.name = String(d.name).replace(/\(.*?\)/g, '').trim();
        if (!presentIds.includes(id)) presentIds.push(id);
        if (d.alternate && !altIds.includes(id)) altIds.push(id);
      }
      const ids = (arr) => (arr || []).map(resolveId).filter(Boolean);
      meetings.push({ date: m.date, type: m.type || 'Regular', presentIds, altIds, recap: String(m.recap || '').trim(),
        motions: (m.motions || []).map((mo) => ({ title: mo.title, category: mo.category, outcome: mo.outcome, tally: mo.tally || '', detail: mo.detail || '',
          noIds: ids(mo.no), abstainIds: ids(mo.abstain), recusedIds: ids(mo.recused) })) });
    }
    store.packets[pk.url] = { url: pk.url, label: pk.label, parsedAt: new Date().toISOString().slice(0, 10), meetings };
    console.log(`${meetings.length} meeting(s), ${meetings.reduce((s, m) => s + m.motions.length, 0)} motion(s)`);
  }

  const { html, items, members } = rebuildTrackerBlock(store);
  console.log(`SMART tracker: ${items} substantive vote(s), ${members} director(s)`);
  const recapSrc = buildRecaps(store);
  if (DRY) { console.log('(dry run — nothing written)'); return; }
  if (recapSrc) {
    fs.writeFileSync(GOV_HELPERS, recapSrc);
    // Keep data/meeting-recaps.json (what gov-hub-past.html reads) in step.
    require('./lib/json-mirror.js').mirrorAll(ROOT);
  }
  fs.writeFileSync(STORE, JSON.stringify(store, null, 1) + '\n');
  new Function(html.slice(html.indexOf('/* SMART-BEGIN'), html.indexOf('/* SMART-END */')));   // parse check
  fs.writeFileSync(TRACKER, html);
})();
