#!/usr/bin/env node
/**
 * frozen-preview.js — the Sunday review copy of a FROZEN digest.
 *
 * While digest/freeze.json is active (written by digest-sunday-review.yml),
 * the Sunday 10 AM preview must show the exact file that was reviewed and will
 * be approved, not a fresh render. This injects a banner with the review's
 * findings for that digest and neutralises the merge tags.
 *
 * Usage: node scripts/lib/frozen-preview.js <weekly|past> <outPath>
 * Exit 0 → wrote outPath, prints SUBJECT=…   Exit 3 → not frozen / no digest
 * (caller falls back to rendering fresh).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [key, outPath] = process.argv.slice(2);
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let freeze, man;
try { freeze = JSON.parse(read('digest/freeze.json')); man = JSON.parse(read('digest/manifest.json')); }
catch { console.error('[frozen-preview] no active freeze'); process.exit(3); }
if (!freeze.until || Date.now() >= Date.parse(freeze.until)) { console.error('[frozen-preview] freeze expired'); process.exit(3); }
const d = man.digests && man.digests[key];
if (!d) { console.error(`[frozen-preview] no ${key} digest this week`); process.exit(3); }
let html;
try { html = read(d.file); } catch { console.error(`[frozen-preview] missing ${d.file}`); process.exit(3); }

let issues = [];
try { const rep = JSON.parse(read('digest/review.json')); issues = ((rep.digests || []).find((x) => x.key === key) || {}).issues || []; } catch (_) {}
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const list = issues.length
  ? '<br><span style="font-weight:400;">The early-morning review found ' + issues.length + ' item' + (issues.length === 1 ? '' : 's') + ' to check:</span><ul style="margin:6px 0 0;padding-left:18px;font-weight:400;">' +
    issues.slice(0, 12).map((x) => `<li>${esc(x.severity.toUpperCase())}: ${esc(x.where)} &mdash; ${esc(x.problem)}</li>`).join('') + '</ul>'
  : '<br><span style="font-weight:400;">The early-morning review found no issues.</span>';
const banner = `  <tr><td style="background:#a8401f;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1.5;">REVIEWED DRAFT &mdash; ${esc(d.name)}, sending Monday 9:00 AM once approved. The bot will not change it before then.${list}<br><a href="https://livabletelluride.org/digest/review.html" style="color:#ffe4c4;font-weight:700;text-decoration:underline;">Full review report</a> &middot; <a href="https://livabletelluride.org/digest-review.html" style="color:#ffe4c4;font-weight:700;text-decoration:underline;">Edit or approve at the Review Desk &rarr;</a></td></tr>\n`;

// Show only the everyone copy (hidden regional copies stay hidden in mail
// clients anyway); neutralise personalization the way the review drafts do.
const anchor = '  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">';
let out = html.includes(anchor) ? html.replace(anchor, banner + anchor) : banner + html;
out = out.replace(/\*\|INTERESTED:[^|]*\|\*/g, '').replace(/\*\|END:INTERESTED\|\*/g, '')
  .replace(/\*\|UNSUB\|\*/g, '#').replace(/\*\|[A-Z0-9_]+\|\*/g, '')
  .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#').replace(/\{\{\s*customer\.[^}]*\}\}/g, '');
fs.writeFileSync(outPath, out);
console.log('SUBJECT=' + d.subject + (issues.length ? ` [review: ${issues.length} item(s)]` : ' [reviewed]'));
