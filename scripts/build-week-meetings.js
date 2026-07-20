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
//     agendaUrl, packetUrl, link, hasAgenda, summary, zoomLink, zoomPasscode,
//     livestream, commentEmail }

const path = require('path');
const { loadDataArrays } = require('./lib/load-data.js');
const { writeMirror } = require('./lib/json-mirror.js');

// Labels match the live Gov-Hub "Public Entities" sidebar.
const GETTERS = [
  ['telluride', 'Town of Telluride',                'getTellurideMeetings'],
  ['county',    'San Miguel County',                'getCountyCachedMeetings'],
  ['mv',        'Mountain Village',                 'getMVMeetings'],
  ['school',    'School District R-1',              'getSchoolMeetings'],
  ['fire',      'Fire Protection',                  'getFireMeetings'],
  ['med',       'Telluride Regional Medical Center','getMedMeetings'],
  ['norwood',   'Town of Norwood',                  'getNorwoodMeetings'],
  ['ophir',     'Town of Ophir',                    'getOphirMeetings'],
  ['ridgway',   'Town of Ridgway',                  'getRidgwayMeetings'],
  ['rico',      'Town of Rico',                     'getRicoMeetings'],
  ['ouray',     'Ouray County',                     'getOurayMeetings'],
  ['smart',     'SMART Transit',                    'getSmartMeetings'],
  ['airport',   'Telluride Regional Airport',       'getAirportMeetings'],
];
const WINDOW_DAYS = 14;

// Public-comment inboxes by body (same map the digest uses — weekly-email.js
// COMMENT_MAP; keep in sync). Bodies without a recipient resolve to ''.
const COMMENT_MAP = {
  telluride:          'townclerk@telluride.gov',
  'telluride-harc':   'dcandelaria@telluride.gov',
  county:             'bocc@sanmiguelcountyco.gov',
  'county-planning':  'planningcommission@sanmiguelcountyco.gov',
  mv:                 'council@mtnvillage.org',
  'mv-planning':      'planning@mtnvillage.org',
  fire:               'pdasaro@telluridefire.com',
  med:                'bodadmin@tellmed.org',
  norwood:            'cross@norwoodtown.com',
  ophir:              'clerk@ophir.us',
  rico:               'townclerk@ricocolorado.gov',
  airport:            'info@tellurideairport.com',
};
function commentEmailFor(source, title) {
  let key = source;
  const t = String(title || '').toLowerCase();
  if (key === 'county' && /planning/.test(t)) key = 'county-planning';
  if (key === 'mv' && /planning|design review/.test(t)) key = 'mv-planning';
  if (key === 'telluride' && /harc|historic|architectural review/.test(t)) key = 'telluride-harc';
  return COMMENT_MAP[key] || '';
}

function buildWeekMeetings(repoRoot) {
  const { captured } = loadDataArrays(repoRoot);
  const getSummary = captured.getMeetingSummary;
  // Per-entity livestream URLs (gov-data ENTITY_REMOTE — e.g. the towns' and
  // county's YouTube stream pages, MV's AV Capture portal).
  const remote = captured.ENTITY_REMOTE || {};
  // Per-meeting zoom/agenda metadata the bot scrapes into MEETING_AGENDA_META
  // (zoomUrl, meetingId, passcode, phone, agendaUrl). Keys are
  // `source|YYYY-MM-DD|<bot title>` where the bot title often differs from the
  // card title (e.g. "Town Council - Jul 21 2026") — resolve exactly like the
  // live gov-hub: exact key, else single prefix match, else board-token match
  // (preferring the full commission over a "Chair" variant).
  const agendaMeta = captured.MEETING_AGENDA_META || {};
  const boardToken = captured.meetingBoardToken || function () { return ''; };
  function resolveMeta(source, date, title) {
    const prefix = source + '|' + date + '|';
    const exact = agendaMeta[prefix + title];
    if (exact) return exact;
    const keys = Object.keys(agendaMeta).filter((k) => k.indexOf(prefix) === 0);
    if (keys.length === 1) return agendaMeta[keys[0]];
    const tok = boardToken(title);
    if (tok) {
      const hits = keys
        .filter((k) => boardToken(k.slice(prefix.length)) === tok)
        .sort((a, b) => (/chair/i.test(a) - /chair/i.test(b)));
      if (hits.length) return agendaMeta[hits[0]];
    }
    return null;
  }
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
      const title = String(m.title || '').trim();
      // Zoom: MEETING_AGENDA_META (bot-scraped, per-meeting) wins; the static
      // MEETING_ZOOM_LINKS config via the getters is the fallback.
      const meta = resolveMeta(source, date, title) || {};
      let zoomLink = '', zoomPasscode = '';
      try { zoomLink = (captured.getMeetingZoomLink && captured.getMeetingZoomLink(m)) || ''; } catch (e) { /* none */ }
      try { zoomPasscode = (captured.getMeetingPasscode && captured.getMeetingPasscode(m)) || ''; } catch (e) { /* none */ }
      out.push({
        source: source,
        sourceLabel: sourceLabel,   // the canonical entity label (GETTERS), not per-record variants — filters group on it
        title: title,
        date: date,
        time: String(m.time || '').trim(),
        location: String(m.location || '').trim(),
        agendaUrl: m.agendaLink || meta.agendaUrl || '',
        packetUrl: m.packetUrl || meta.packetUrl || '',
        link: m.link || '',
        hasAgenda: !!(m.agendaLink || meta.agendaUrl || m.hasAgenda),
        summary: String(summary || '').trim(),
        zoomLink: String(meta.zoomUrl || zoomLink || ''),
        zoomMeetingId: String(meta.meetingId || ''),
        zoomPasscode: String(meta.passcode || zoomPasscode || ''),
        zoomPhone: String(meta.phone || ''),
        livestream: (remote[source] && remote[source].livestream) || '',
        commentEmail: commentEmailFor(source, title),
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
