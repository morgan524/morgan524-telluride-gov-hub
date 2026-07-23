#!/usr/bin/env node
/**
 * approved-preview.js — build the REVIEW email from the APPROVED digest.
 *
 * Why this exists (2026-07-23): the preview workflows used to re-render the
 * digest from scratch with scripts/weekly-email.js every run. That regenerates
 * the Rick lede (a fresh, non-deterministic Claude call) and re-picks events —
 * so the review email Morgan received never matched the version he had already
 * edited and approved at the Digest Review Desk. It LOOKED stale; in fact the
 * two paths shared no data at all. The approved file (digest/<key>.html, frozen
 * by digest/<key>.lock.json) is what actually sends, so when a lock exists for
 * this period the review email must show exactly that file.
 *
 * Usage:
 *   node scripts/lib/approved-preview.js <key> <weekStart> <outPath>
 *     key       'weekend' | 'weekly'
 *     weekStart YYYY-MM-DD the preview is for
 *     outPath   where to write the banner-injected preview HTML
 *
 * Exit 0  → wrote <outPath>; prints "SUBJECT=<subject>" on stdout.
 * Exit 3  → no matching approval lock; caller should fall back to rendering.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [key, weekStart, outPath] = process.argv.slice(2);
if (!key || !weekStart || !outPath) {
  console.error('usage: approved-preview.js <key> <weekStart> <outPath>');
  process.exit(2);
}

const htmlPath = path.join('digest', `${key}.html`);
const lockPath = path.join('digest', `${key}.lock.json`);

let lock;
try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
catch { console.error(`[approved-preview] no lock at ${lockPath}`); process.exit(3); }

if (String(lock.weekStart || '') !== String(weekStart)) {
  console.error(`[approved-preview] lock is for ${lock.weekStart}, preview is for ${weekStart} — not approved yet`);
  process.exit(3);
}

let html;
try { html = fs.readFileSync(htmlPath, 'utf8'); }
catch { console.error(`[approved-preview] missing ${htmlPath}`); process.exit(3); }
if (html.length < 2000) { console.error(`[approved-preview] ${htmlPath} too small`); process.exit(3); }

const sendDay = key === 'weekend' ? 'Friday' : 'Monday';
const DESK = 'https://livabletelluride.org/digest-review.html';
const banner =
  `  <tr><td style="background:#1f5130;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;` +
  `font-size:13px;font-weight:700;color:#fff;line-height:1.5;">APPROVED &mdash; this is the exact version that sends ${sendDay} 9:00 AM.` +
  `<br><span style="font-weight:400;">Your edits are already saved and frozen; the daily bot will not change it. To change anything, edit and re-approve at the Review Desk.</span>` +
  `<br><a href="${DESK}" style="color:#cfe8d8;font-weight:700;text-decoration:underline;">Open the Review Desk &rarr;</a></td></tr>\n`;

// Same anchor weekly-email.js uses for its REVIEW DRAFT banner.
const anchor = '  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">';
const out = html.includes(anchor) ? html.replace(anchor, banner + anchor) : banner + html;

fs.writeFileSync(outPath, out);
console.log(`SUBJECT=${lock.subject || 'The ' + (key === 'weekend' ? 'Weekend' : 'Week') + ' Ahead Outlook'}`);
console.error(`[approved-preview] wrote ${outPath} from the approved ${htmlPath} (${out.length} bytes)`);
