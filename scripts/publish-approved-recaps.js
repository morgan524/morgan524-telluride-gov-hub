#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// PUBLISH APPROVED RECAPS — scripts/publish-approved-recaps.js
// ════════════════════════════════════════════════════════════════════
//
// The publish side of the recap email-approval gate. Asks the editorial Worker
// for recaps you've APPROVED (kind:"recap", status:"approved") and writes each
// into MEETING_RECAPS in js/gov-helpers.js (using your edited text if you edited
// it in the review page). Denied/pending recaps never publish.
//
// Two phases so a recap is marked published only after the commit lands:
//   node scripts/publish-approved-recaps.js          # write MEETING_RECAPS
//   <workflow commits & pushes>
//   node scripts/publish-approved-recaps.js --mark   # mark them published
//
// Env: EDITORIAL_SECRET, EDITORIAL_WORKER (optional). No YouTube/key needed —
// can run in the cloud.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { extractJsArray } = require('./lib/extract.js');
const { serializeArray } = require('./lib/serialize.js');

const WORKER = process.env.EDITORIAL_WORKER || 'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev';
const SECRET = process.env.EDITORIAL_SECRET || '';
const REPO_ROOT = path.resolve(__dirname, '..');
const GOV = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const MARKER = path.join(__dirname, '.just-published-recaps.json');
const MARK = process.argv.includes('--mark');
const KEEP = 50;

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
const stripHtml = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const readJson = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };

async function phaseMark() {
  const ids = readJson(MARKER, []);
  if (!ids.length) { console.log('  Nothing to mark.'); return; }
  let ok = 0;
  for (const id of ids) {
    try { const r = await httpJson('POST', `${WORKER}/article-published`, { secret: SECRET, id });
      if (r.json && r.json.ok) ok++; else console.log(`  ✗ mark failed ${id}: ${(r.json && r.json.msg) || r.status}`); }
    catch (e) { console.log(`  ✗ mark error ${id}: ${e.message}`); }
  }
  console.log(`  Marked ${ok}/${ids.length} recap(s) published.`);
  try { fs.unlinkSync(MARKER); } catch {}
}

async function phaseWrite() {
  if (!SECRET) { console.error('  ✗ EDITORIAL_SECRET not set'); process.exit(1); }
  const res = await httpJson('GET', `${WORKER}/article-pending-publish?secret=${encodeURIComponent(SECRET)}`);
  if (!res.json || !res.json.ok) { console.error(`  ✗ could not list approved: ${(res.json && res.json.msg) || res.status}`); process.exit(1); }
  const recaps = (res.json.drafts || []).filter((d) => d.kind === 'recap');
  console.log(`\n  ${recaps.length} approved recap(s) to publish.`);
  if (!recaps.length) { fs.writeFileSync(MARKER, '[]'); return; }

  let src = fs.readFileSync(GOV, 'utf8');
  const existing = extractJsArray(src, 'MEETING_RECAPS') || [];
  const entries = recaps.map((d) => ({
    sourceKey: d.source, sourceLabel: d.sourceLabel, date: d.meetingDate,
    title: (d.editedTitle || d.title || '').trim(),
    recap: stripHtml(d.editedBodyHtml || d.bodyHtml || ''),
    videoUrl: d.videoUrl,
  })).filter((e) => e.recap && e.date && e.videoUrl);

  const byUrl = new Map();
  for (const r of [...entries, ...existing]) if (r.videoUrl && !byUrl.has(r.videoUrl)) byUrl.set(r.videoUrl, r);
  const final = [...byUrl.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, KEEP);

  const m = /const\s+MEETING_RECAPS\s*=\s*\[/.exec(src);
  if (!m) { console.error('  ✗ MEETING_RECAPS not found'); process.exit(1); }
  let depth = 0, i = m.index + m[0].length - 1, end = -1;
  for (; i < src.length; i++) { if (src[i] === '[') depth++; else if (src[i] === ']') { if (--depth === 0) { end = i; break; } } }
  let semi = end + 1; while (semi < src.length && src[semi] !== ';') semi++; if (src[semi] === ';') semi++;
  src = src.slice(0, m.index) + serializeArray('MEETING_RECAPS', final) + src.slice(semi);
  try { new Function(src); } catch (e) { console.error('  ✗ refusing to write — would not parse: ' + e.message); process.exit(1); }
  fs.writeFileSync(GOV, src);
  fs.writeFileSync(MARKER, JSON.stringify(recaps.map((d) => d.id)));
  recaps.forEach((d) => console.log(`  ✓ published recap: ${d.editedTitle || d.title}`));
  console.log(`  MEETING_RECAPS now ${final.length} entries. Commit, then run --mark.`);
}

(MARK ? phaseMark() : phaseWrite()).catch((e) => { console.error(e); process.exit(1); });
