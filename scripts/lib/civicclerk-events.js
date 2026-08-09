// Turn San Miguel County's CivicClerk OData events into COUNTY_CACHED_DATA rows.
//
// WHY THIS EXISTS (2026-08-09): content-refresh.js has queried this API every 6
// hours for months, but only to PATCH `agendaUrl` onto rows a human had already
// typed into gov-data.js by hand. Nobody typed any after 2026-03-25, so
// COUNTY_CACHED_DATA drifted to zero upcoming meetings while the API sat there
// returning eleven of them. The county kept rendering only because
// getCountyCachedMeetings() has a MANUAL_SUMMARIES fallback — the primary path
// had quietly stopped working and the backup was carrying the page.
//
// Kept in lib/ (not inline in content-refresh.js) so the mapping is unit-
// testable: every rule below is a place a wrong guess ships wrong civic
// information, which is worse than shipping none.

'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

// CivicClerk stamps LOCAL WALL TIME and suffixes it with "Z" anyway. A San
// Miguel BOCC meeting that really starts at 9:30 AM Mountain comes back as
// "2026-08-19T09:30:00Z". Parsing that as real UTC and converting to Denver
// would render it at 3:30 AM — and would roll any evening meeting (CWAB at
// "16:30Z", actually 4:30 PM) onto the wrong CALENDAR DAY.
//
// So: never hand this string to `new Date()`. Read the digits as written.
function wallParts(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(stamp || ''));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], min: +m[5] };
}

// → "August 19, 2026", the format gov-data.js meeting lists use.
function fmtMeetingDate(p) {
  if (!p || p.mo < 1 || p.mo > 12) return null;
  return `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}`;
}

// → "9:30 AM". Midnight means "no time given", not "starts at 12 AM": CivicClerk
// uses 00:00 for events whose start time hasn't been set.
function fmtMeetingTime(p) {
  if (!p || (p.h === 0 && p.min === 0)) return null;
  const ampm = p.h < 12 ? 'AM' : 'PM';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.min).padStart(2, '0')} ${ampm}`;
}

// The `type` field drives the category label in getCountyCachedMeetings():
// 'planning' → "Planning Commission", 'ssr' → "SSR Roundtable", anything else
// falls back to "Board Meeting"/"Meeting" by title. Unknown types are therefore
// SAFE — an advisory board like CWAB renders as a plain "Meeting" rather than
// being mislabeled a commission.
function countyTypeOf(eventName, categoryName) {
  const hay = `${categoryName || ''} ${eventName || ''}`.toLowerCase();
  if (/planning commission/.test(hay)) return 'planning';
  if (/board of county commissioners|\bbocc\b/.test(hay)) return 'bocc';
  return 'other';
}

// Map the API's events onto cached-list rows.
//
// agendaUrl is deliberately NOT set here even though the API reports
// `hasAgenda`. Per the project rule (CLAUDE.md, "never link to an agenda that
// doesn't exist") the URL must come from the real published file, which
// syncCountyAgendas() resolves and patchAgendaUrls() folds in afterwards. A row
// with `civicClerkId` still gets a working portal link at render time.
function countyRowsFromEvents(events) {
  const rows = [];
  for (const e of events || []) {
    if (!e || !e.eventName) continue;
    if (e.isDeleted) continue;
    const p = wallParts(e.startDateTime || e.eventDate);
    const date = fmtMeetingDate(p);
    if (!date) continue;

    const title = String(e.eventName).trim();
    const row = {
      date,
      time: fmtMeetingTime(p),
      title,
      type: countyTypeOf(title, e.categoryName),
      location: String(e.eventLocation || '').trim(),
      civicClerkId: Number.isFinite(e.id) ? e.id : null,
      note: null,
    };
    if (/\bspecial\b/i.test(title)) row.special = true;
    rows.push(row);
  }
  return rows;
}

// Merge freshly-fetched API rows over whatever is already in the file.
//
// The existing list is NOT disposable: it carries hand-written `note` text and
// entries the API never returns at all (the SSR Housing Code Update roundtables
// live in DocumentCenter, not CivicClerk). So:
//   • API rows win on the facts they own — time, title, location, civicClerkId;
//   • a hand-written note survives unless the API supplies one;
//   • rows the API doesn't know about are KEPT, not deleted;
//   • anything older than `lookbackDays` ages out.
// Identity is date + type, so a meeting the county RENAMES updates in place
// instead of appearing twice.
function mergeCountyRows(existing, fresh, opts = {}) {
  const lookbackDays = opts.lookbackDays == null ? 21 : opts.lookbackDays;
  const now = opts.now || new Date();
  const cutoff = new Date(now.getTime() - lookbackDays * 86400000);

  const keyOf = (r) => `${r.date}|${r.type || ''}`;
  const byKey = new Map();

  for (const r of existing || []) {
    if (!r || !r.date) continue;
    const d = new Date(r.date);
    if (isNaN(d) || d < cutoff) continue;
    byKey.set(keyOf(r), { ...r });
  }
  // An ABSENT API value must not erase a good existing one. CivicClerk leaves
  // eventLocation empty and the start time at midnight on plenty of events; a
  // naive spread would blank a location and a time that were already correct.
  const isEmpty = (v) => v == null || v === '';
  for (const r of fresh || []) {
    const prior = byKey.get(keyOf(r));
    if (!prior) { byKey.set(keyOf(r), r); continue; }
    const merged = { ...prior };
    for (const [k, v] of Object.entries(r)) {
      if (!isEmpty(v)) merged[k] = v;          // API owns the facts it actually has
    }
    // agendaUrl/packetUrl are never in `r` (patchAgendaUrls owns them), and a
    // hand-written note outlives the API's null.
    merged.note = isEmpty(r.note) ? (prior.note ?? null) : r.note;
    byKey.set(keyOf(r), merged);
  }

  return [...byKey.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  wallParts, fmtMeetingDate, fmtMeetingTime, countyTypeOf,
  countyRowsFromEvents, mergeCountyRows, MONTHS,
};
