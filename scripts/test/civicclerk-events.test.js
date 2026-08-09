// COUNTY_CACHED_DATA is built from CivicClerk's OData events. Each rule below
// is one where a wrong guess publishes wrong civic information — a resident
// showing up on the wrong day, or at 3:30 AM.
const test = require('node:test');
const assert = require('node:assert');
const {
  wallParts, fmtMeetingDate, fmtMeetingTime, countyTypeOf, formatEventLocation,
  countyRowsFromEvents, mergeCountyRows,
} = require('../lib/civicclerk-events.js');
const { serializeArray } = require('../lib/serialize.js');

// Real payloads, copied from the live API on 2026-08-09 — including the
// structured eventLocation object, which is what made the first run fail.
const EVENTS = [
  { id: 922, eventName: 'Planning Commission Meeting', startDateTime: '2026-08-13T09:00:00Z', categoryName: 'Planning Commission',
    eventLocation: { id: 377, eventId: 0, address1: '333 West Colorado Ave., Second Floor Meeting Room', address2: null, city: 'Telluride', state: 'CO', zipCode: '81435' } },
  { id: 930, eventName: 'Board of County Commissioners Meeting', startDateTime: '2026-08-19T09:30:00Z', categoryName: 'Board of County Commissioners',
    eventLocation: { id: 354, eventId: 0, address1: '333 West Colorado Ave 2nd Fl', address2: null, city: 'Telluride', state: 'Colorado', zipCode: '81435' } },
  { id: 941, eventName: 'CWAB', startDateTime: '2026-08-27T16:30:00Z', categoryName: 'General',
    eventLocation: { id: 510, eventId: 0, address1: null, address2: null, city: null, state: null, zipCode: null } },
];

test('CivicClerk timestamps are LOCAL wall time despite the Z suffix', () => {
  // The county's own page says the BOCC starts at 9:30 AM. Treating "09:30:00Z"
  // as real UTC and converting to Denver would render it at 3:30 AM.
  const p = wallParts('2026-08-19T09:30:00Z');
  assert.deepEqual(p, { y: 2026, mo: 8, d: 19, h: 9, min: 30 });
  assert.equal(fmtMeetingTime(p), '9:30 AM');
  assert.equal(fmtMeetingDate(p), 'August 19, 2026');
});

test('an evening meeting keeps its own calendar day', () => {
  // CWAB at "16:30Z" is 4:30 PM Mountain. Converted as true UTC it would be
  // 10:30 AM — and for anything after 6 PM local it would land on the NEXT day.
  const rows = countyRowsFromEvents(EVENTS);
  const cwab = rows.find((r) => r.title === 'CWAB');
  assert.equal(cwab.date, 'August 27, 2026');
  assert.equal(cwab.time, '4:30 PM');
});

test('midnight means "no time set", not 12 AM', () => {
  assert.equal(fmtMeetingTime(wallParts('2026-08-19T00:00:00Z')), null);
  assert.equal(fmtMeetingTime(wallParts('2026-08-19T12:00:00Z')), '12:00 PM');
});

test('meeting type drives the category label, and unknown is safe', () => {
  assert.equal(countyTypeOf('Planning Commission Meeting', 'Planning Commission'), 'planning');
  assert.equal(countyTypeOf('Board of County Commissioners Work Session', 'Board of County Commissioners'), 'bocc');
  // CWAB is an advisory board. 'other' renders as a plain "Meeting" rather than
  // being mislabeled a commission.
  assert.equal(countyTypeOf('CWAB', 'General'), 'other');
});

test('rows never carry an agendaUrl the API only claims exists', () => {
  // CLAUDE.md: never link to an agenda that doesn't exist. The URL comes later,
  // from the actual published file, via patchAgendaUrls().
  for (const r of countyRowsFromEvents(EVENTS)) {
    assert.equal(r.agendaUrl, undefined);
    assert.ok(r.civicClerkId, 'needs a civicClerkId for the portal link');
  }
});

test('a hand-curated meeting the API never returns is KEPT', () => {
  // The SSR Housing Code Update roundtables live in DocumentCenter, not
  // CivicClerk. Automating the list must not delete them.
  const existing = [{
    date: 'September 4, 2026', time: '5:30 PM', type: 'ssr',
    title: 'Housing Code Update -- SSR Meeting #6',
    agendaUrl: 'https://sanmiguelcountyco.gov/DocumentCenter/View/1234',
    location: 'Norwood', note: 'Bring written comment.',
  }];
  const merged = mergeCountyRows(existing, countyRowsFromEvents(EVENTS), { now: new Date('2026-08-09T18:00:00Z') });
  const ssr = merged.find((r) => r.type === 'ssr');
  assert.ok(ssr, 'the hand-added roundtable survived the rebuild');
  assert.equal(ssr.agendaUrl, 'https://sanmiguelcountyco.gov/DocumentCenter/View/1234');
  assert.equal(ssr.note, 'Bring written comment.');
});

test('an empty API field does not erase a good existing value', () => {
  // CWAB's address comes back all-null, so the API contributes no location. A
  // naive spread would blank a location someone had already filled in by hand.
  const existing = [{
    date: 'August 27, 2026', type: 'other', title: 'CWAB',
    location: 'Wilkinson Public Library, Telluride',
    note: 'Community Wildfire Advisory Board.', agendaUrl: 'https://example.org/a.pdf',
  }];
  const merged = mergeCountyRows(existing, countyRowsFromEvents(EVENTS), { now: new Date('2026-08-09T18:00:00Z') });
  const cwab = merged.find((r) => r.date === 'August 27, 2026');
  assert.equal(cwab.location, 'Wilkinson Public Library, Telluride');
  assert.equal(cwab.note, 'Community Wildfire Advisory Board.');
  assert.equal(cwab.agendaUrl, 'https://example.org/a.pdf');
  assert.equal(cwab.civicClerkId, 941, 'the API still owns the facts it has');
  assert.equal(cwab.time, '4:30 PM');
});

test('a real API location DOES replace a stale hand-typed one', () => {
  // The other direction: when the county publishes an address, it wins. This is
  // the whole point of rebuilding from the API rather than trusting old typing.
  const existing = [{ date: 'August 13, 2026', type: 'planning', title: 'Planning Commission Meeting', location: 'Old room nobody uses' }];
  const merged = mergeCountyRows(existing, countyRowsFromEvents(EVENTS), { now: new Date('2026-08-09T18:00:00Z') });
  const pc = merged.find((r) => r.date === 'August 13, 2026');
  assert.equal(pc.location, '333 West Colorado Ave., Second Floor Meeting Room, Telluride, CO 81435');
});

test('a renamed meeting updates in place instead of duplicating', () => {
  const existing = [{ date: 'August 26, 2026', type: 'bocc', title: 'Board of County Commissioners Work Session' }];
  const fresh = countyRowsFromEvents([
    { id: 935, eventName: 'BOCC Special - In Norwood at Sheriff Annex', startDateTime: '2026-08-26T09:30:00Z', categoryName: 'Board of County Commissioners', eventLocation: 'Norwood' },
  ]);
  const merged = mergeCountyRows(existing, fresh, { now: new Date('2026-08-09T18:00:00Z') });
  assert.equal(merged.filter((r) => r.date === 'August 26, 2026').length, 1);
  assert.equal(merged[0].title, 'BOCC Special - In Norwood at Sheriff Annex');
});

test('rows older than the lookback age out', () => {
  const existing = [
    { date: 'March 25, 2026', type: 'bocc', title: 'Old meeting' },
    { date: 'August 5, 2026', type: 'bocc', title: 'Recent meeting' },
  ];
  const merged = mergeCountyRows(existing, [], { now: new Date('2026-08-09T18:00:00Z') });
  assert.deepEqual(merged.map((r) => r.title), ['Recent meeting']);
});

test('malformed events are skipped, not published as broken rows', () => {
  const rows = countyRowsFromEvents([
    { id: 1, eventName: 'No date at all' },
    { id: 2, eventName: '', startDateTime: '2026-08-19T09:30:00Z' },
    { id: 3, eventName: 'Deleted one', startDateTime: '2026-08-19T09:30:00Z', isDeleted: true },
    { id: 4, eventName: 'Good one', startDateTime: '2026-08-19T09:30:00Z', categoryName: 'General' },
  ]);
  assert.deepEqual(rows.map((r) => r.title), ['Good one']);
});

test('eventLocation is an OBJECT and must be formatted, never String()-ed', () => {
  // The 2026-08-09 first run shipped `location: "[object Object]"` on all 15
  // rows. The data-file write guard rejected it before it reached the site;
  // this test is so the guard never has to catch it again.
  const rows = countyRowsFromEvents(EVENTS);
  assert.equal(rows[0].location, '333 West Colorado Ave., Second Floor Meeting Room, Telluride, CO 81435');
  // The county writes both "CO" and "Colorado"; existing rows use the abbreviation.
  assert.equal(rows[1].location, '333 West Colorado Ave 2nd Fl, Telluride, CO 81435');
  // All-null address (CWAB) → empty string, NOT "null, null null".
  assert.equal(rows[2].location, '');
});

test('formatEventLocation survives a shape change back to a plain string', () => {
  assert.equal(formatEventLocation('305 W Colorado Ave, Telluride'), '305 W Colorado Ave, Telluride');
  assert.equal(formatEventLocation(null), '');
  assert.equal(formatEventLocation({}), '');
});

test('every row value is a scalar the serializer can emit', () => {
  // The general form of the [object Object] bug: ANY object-valued field would
  // be coerced by lib/serialize.js. Checking the serialized output covers the
  // fields that exist today and any field added later.
  const src = serializeArray('COUNTY_CACHED_DATA', countyRowsFromEvents(EVENTS));
  assert.ok(!src.includes('[object Object]'), 'serialized rows must not contain [object Object]');
  assert.ok(!/:\s*"undefined"/.test(src), 'serialized rows must not contain the string "undefined"');
  for (const row of countyRowsFromEvents(EVENTS)) {
    for (const [k, v] of Object.entries(row)) {
      assert.ok(v === null || ['string', 'number', 'boolean'].includes(typeof v),
        `${k} must be a scalar, got ${typeof v}`);
    }
  }
});
