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

// eventLocation is a STRUCTURED ADDRESS OBJECT, not a string:
//   { id, eventId, address1, address2, city, state, zipCode }
// String()-ing it yields the literal "[object Object]", which is exactly what
// shipped on the first run (2026-08-09) — caught by the data-file write guard
// before it reached the site, which is what that guard exists for. Every field
// is independently nullable: CWAB comes back with all of them null, and that
// must produce an empty string, not "null, null null".
function formatEventLocation(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc.trim();          // defensive: shape may change back
  const clean = (v) => (v == null ? '' : String(v).trim());
  // The county writes both "CO" and "Colorado"; existing rows use the abbreviation.
  const state = clean(loc.state).replace(/^colorado$/i, 'CO');
  const zip = clean(loc.zipCode);
  const tail = [state, zip].filter(Boolean).join(' ');
  return [clean(loc.address1), clean(loc.address2), clean(loc.city), tail]
    .filter(Boolean).join(', ');
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
      location: formatEventLocation(e.eventLocation),
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

// ── Which published file IS the agenda? ────────────────────────────────────
//
// The rule used to be `f.type === 'Agenda'` — one exact, case-sensitive match
// on one field, with no log line when it missed. That makes "the county hasn't
// posted an agenda" and "the county posted one under a name we don't
// recognise" look identical from the outside, and the second is the one that
// silently ships a wrong "agenda hasn't been posted yet" card.
//
// Observed 2026-08-31: San Miguel event 923 (Sep 10 Planning Commission)
// ingested agenda file 1979 on Aug 27, while event 887 (Sep 2 BOCC) never
// picked up file 1980 — the adjacent file id, so uploaded in the same sitting.
// The Sep 2 card sat on the placeholder stub for five days and ~30 refresh
// runs, and the weekly digest suppressed its "View agenda" link the whole time
// (correctly, per the never-link-to-an-agenda-that-doesn't-exist rule: the
// summary said the agenda was pending, so the rule believed it).
//
// So: match in descending order of confidence, and never invent a file. Every
// candidate comes from the API's own publishedFiles list, so a URL built from
// one always points at a document the county really published. Minutes and
// packets must not outrank a plain agenda, which is why this is an ordered
// walk rather than a single predicate.
function pickAgendaFile(publishedFiles) {
  const files = (Array.isArray(publishedFiles) ? publishedFiles : [])
    .filter((f) => f && f.fileId != null);
  const typeOf = (f) => String(f.type || '').trim().toLowerCase();
  const nameOf = (f) => String(f.name || '').trim().toLowerCase();
  return files.find((f) => typeOf(f) === 'agenda')                      // "Agenda"
      || files.find((f) => /^agenda\b/.test(typeOf(f)))                 // "Agenda Packet", "Agenda - Amended"
      || files.find((f) => /agenda/.test(typeOf(f)))                    // "Revised Agenda", "AgendaPacket"
      // Type missing or unrecognised, but the file names itself. Exclude
      // minutes: "Agenda and Minutes" is the record of a PAST meeting.
      || files.find((f) => /agenda/.test(nameOf(f)) && !/minutes/.test(nameOf(f)))
      || null;
}

// One-line summary of what the API DID publish for an event, for the log we
// print when pickAgendaFile comes back empty. Without this, a miss is
// invisible and the only way to notice is a reader complaining that a card
// says "not posted yet" about an agenda they are looking at.
function describePublishedFiles(publishedFiles) {
  const files = (Array.isArray(publishedFiles) ? publishedFiles : []).filter(Boolean);
  if (!files.length) return 'none';
  return files
    .map((f) => `${f.type || '?'}:${f.name || '?'}#${f.fileId == null ? '?' : f.fileId}`)
    .join(' | ');
}

module.exports = {
  wallParts, fmtMeetingDate, fmtMeetingTime, countyTypeOf, formatEventLocation,
  countyRowsFromEvents, mergeCountyRows, MONTHS,
  pickAgendaFile, describePublishedFiles,
};
