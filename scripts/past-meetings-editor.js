#!/usr/bin/env node
/**
 * past-meetings-editor.js — the Thursday-night Past Meetings draft (Morgan
 * 2026-10-26). Writes the JSON that scripts/past-meetings-docx.py turns into a
 * Word document for Emily to edit; Morgan sends the edited version on Friday.
 * It replaces the Tuesday auto-send (see RETIRED_FROM in past-meetings-email.js).
 *
 * Covers the week just held: Friday through Thursday. Friday meetings are rare,
 * so the week is "complete" Thursday night and last Friday's stragglers land in
 * this draft instead of falling between two.
 *
 * Every public meeting held in the window is listed. Recapped ones carry the
 * same wording the Past Meetings email used (Major Decisions get the longer
 * summary, the rest the short teaser). Ones with no recap yet — recaps run once
 * a day around 9:30 AM, so a Wednesday-evening or Thursday meeting usually has
 * none — are listed under "Recap not yet available" for Emily to fill or cut.
 *
 * Usage: node scripts/past-meetings-editor.js 2026-10-29 /tmp/past-editor.json
 *        (the Thursday that closes the week; default: the most recent Thursday, MT)
 */
const fs = require('fs');
const path = require('path');
const RR = require('./lib/recap-regions.js');
const RI = require('./lib/recap-importance.js');
const { fixNames, fixNamesDeep } = require('./lib/name-spellings.js');
const { buildWeekMeetings } = require('./build-week-meetings.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://livabletelluride.org';

function lastThursdayMT() {
  const mt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }));
  const back = (mt.getDay() - 4 + 7) % 7;
  mt.setDate(mt.getDate() - back);
  return mt.getFullYear() + '-' + String(mt.getMonth() + 1).padStart(2, '0') + '-' + String(mt.getDate()).padStart(2, '0');
}

const THU = process.argv[2] || lastThursdayMT();
const OUT = process.argv[3] || 'past-meetings-editor.json';
if (new Date(THU + 'T12:00:00Z').getUTCDay() !== 4) { console.error(`${THU} is not a Thursday`); process.exit(1); }

const iso = (d) => d.toISOString().slice(0, 10);
const fri = new Date(THU + 'T12:00:00Z'); fri.setUTCDate(fri.getUTCDate() - 6);
const FROM = iso(fri);
const longDate = (d, withYear) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', Object.assign({ month: 'long', day: 'numeric', timeZone: 'UTC' }, withYear ? { year: 'numeric' } : {}));
const LABEL = longDate(FROM, FROM.slice(0, 4) !== THU.slice(0, 4)) + ' - ' + longDate(THU, true);

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'meeting-recaps.json'), 'utf8'));
const recaps = all
  .filter((r) => r && r.date >= FROM && r.date <= THU && r.recap && !RR.RECAP_EMAIL_EXCLUDE.has(r.sourceKey))
  .map(fixNamesDeep)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const row = (r, major) => ({
  date: r.date,
  body: r.title || '',
  source: r.sourceLabel || '',
  text: major ? RI.longRecap(r.recap) : RR.shortRecap(r.recap),
  link: SITE + '/gov-hub-past.html#' + RR.recapId(r),
});
const major = recaps.filter((r) => RI.isMajor(r)).map((r) => row(r, true));
const other = recaps.filter((r) => !RI.isMajor(r)).map((r) => row(r, false));

// Meetings held in the window that have no recap yet. A recap matches on
// source + date; a body that met twice that day needs as many recaps. Only
// bodies we actually recap (one in the last 120 days) can be "pending" —
// Ophir, the school board, fire and the Medical Center post no video, so they
// would otherwise sit in the pending list every single week.
const since = new Date(THU + 'T12:00:00Z'); since.setUTCDate(since.getUTCDate() - 120);
const recapped = new Set(all.filter((r) => r && r.date >= iso(since)).map((r) => r.sourceKey));
const held = buildWeekMeetings(ROOT, { from: new Date(FROM + 'T00:00:00'), to: new Date(THU + 'T00:00:00') })
  .filter((m) => m.kind !== 'event' && !RR.RECAP_EMAIL_EXCLUDE.has(m.source) && recapped.has(m.source));
const recapCount = {};
for (const r of recaps) { const k = r.sourceKey + '|' + r.date; recapCount[k] = (recapCount[k] || 0) + 1; }
const pending = [];
// Earliest first within a day; no published time goes last (site-wide rule).
const mins = (t) => { const m = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(t || ''); return m ? (m[1] % 12) * 60 + +m[2] + (/p/i.test(m[3]) ? 720 : 0) : 9999; };
for (const m of held.sort((a, b) => a.date.localeCompare(b.date) || mins(a.time) - mins(b.time))) {
  const k = m.source + '|' + m.date;
  if (recapCount[k]) { recapCount[k]--; continue; }
  pending.push({ date: m.date, body: fixNames(m.title), source: m.sourceLabel, time: m.time || '' });
}

const n = recaps.length;
const data = {
  subject: 'Past Meetings - ' + LABEL,
  label: LABEL,
  from: FROM,
  to: THU,
  lede: `What happened at ${n} public meeting${n === 1 ? '' : 's'} across the region this week. ` +
    (major.length ? 'Decisions on issues that affect everyone come first, in more detail; the rest follow in brief. ' : 'In brief: ') +
    "Each summary links to the full recap, written from the meeting's video or minutes.",
  major,
  other,
  pending,
};
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`past-meetings-editor: ${FROM} to ${THU} — ${major.length} major, ${other.length} other, ${pending.length} pending → ${OUT}`);
console.log('LABEL=' + LABEL);
