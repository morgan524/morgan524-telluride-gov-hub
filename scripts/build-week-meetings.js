#!/usr/bin/env node
// Build data/week-meetings.json — ALL upcoming public meetings (next 14 days,
// every source/body), fully aggregated at pipeline time so pages stay dumb.
//
// Why: the raw *-cached-data seed mirrors miss meetings that come from config
// (e.g. county CivicClerk IDs — the Jul 22 2026 BOCC special), and merging 13
// sources + joint-meeting dedup + summary resolution is logic that belongs in
// the pipeline, not in every page. This reuses the SAME getters gov-hub and
// the digest rely on (via lib/load-data.js), so all surfaces agree.
//
// Readers: redesign homepage "Top priorities", the rebuilt Gov-Hub (later).
// Runs: end of content-refresh.js (every 6h) + standalone:
//   node scripts/build-week-meetings.js
//
// Record shape (contract-checked in test/json-contract.test.js):
//   { source, sourceLabel, title, date: 'YYYY-MM-DD', time, location,
//     agendaUrl, link, hasAgenda, summary }

const path = require('path');
const { loadDataArrays } = require('./lib/load-data.js');
const { writeMirror } = require('./lib/json-mirror.js');

const GETTERS = [
  ['telluride', 'Town of Telluride',   'getTellurideMeetings'],
  ['county',    'San Miguel County',   'getCountyCachedMeetings'],
  ['mv',        'Mountain Village',    'getMVMeetings'],
  ['school',    'School District',     'getSchoolMeetings'],
  ['fire',      'Fire District',       'getFireMeetings'],
  ['med',       'Hospital District',   'getMedMeetings'],
  ['norwood',   'Town of Norwood',     'getNorwoodMeetings'],
  ['ophir',     'Town of Ophir',       'getOphirMeetings'],
  ['ridgway',   'Town of Ridgway',     'getRidgwayMeetings'],
  ['rico',      'Town of Rico',        'getRicoMeetings'],
  ['ouray',     'Ouray County',        'getOurayMeetings'],
  ['smart',     'SMART',               'getSmartMeetings'],
  ['airport',   'Airport Authority',   'getAirportMeetings'],
];
const WINDOW_DAYS = 14;

function buildWeekMeetings(repoRoot) {
  const { captured } = loadDataArrays(repoRoot);
  const getSummary = captured.getMeetingSummary;
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today.getTime() + WINDOW_DAYS * 86400000);

  const seen = new Set();
  const out = [];
  for (const [source, sourceLabel, fnName] of GETTERS) {
    const fn = captured[fnName];
    if (typeof fn !== 'function') { console.warn(`  week-meetings: ${fnName} missing — skipped`); continue; }
    let arr = [];
    try { arr = fn() || []; } catch (e) { console.warn(`  week-meetings: ${fnName} threw: ${e.message}`); continue; }
    for (const m of arr) {
      if (!m || !m.eventDate || !(m.eventDate instanceof Date) || isNaN(m.eventDate)) continue;
      if (m.eventDate < today || m.eventDate > end) continue;
      const date = m.eventDate.getFullYear() + '-' + pad(m.eventDate.getMonth() + 1) + '-' + pad(m.eventDate.getDate());
      // Joint meetings appear under each commission (word-order variants):
      // alphabetize title tokens so both collapse to one key (digest pattern).
      const tokens = (String(m.title || '').toLowerCase().match(/[a-z]+/g) || []).sort().join('');
      const key = source + '|' + date + '|' + tokens.slice(0, 32);
      if (seen.has(key)) continue;
      seen.add(key);
      let summary = '';
      try { summary = (getSummary && getSummary(m)) || ''; } catch (e) { /* leave blank */ }
      out.push({
        source: source,
        sourceLabel: m.sourceLabel || sourceLabel,
        title: String(m.title || '').trim(),
        date: date,
        time: String(m.time || '').trim(),
        location: String(m.location || '').trim(),
        agendaUrl: m.agendaLink || '',
        link: m.link || '',
        hasAgenda: !!(m.agendaLink || m.hasAgenda),
        summary: String(summary || '').trim(),
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
  return out;
}

function run(repoRoot) {
  const root = repoRoot || path.resolve(__dirname, '..');
  const meetings = buildWeekMeetings(root);
  const p = writeMirror('WEEK_MEETINGS', meetings, path.join(root, 'data'));
  console.log(`  week-meetings: ${meetings.length} meetings (next ${WINDOW_DAYS} days) → ${path.relative(root, p)}`);
  return meetings;
}

if (require.main === module) run();
module.exports = { buildWeekMeetings, run };
