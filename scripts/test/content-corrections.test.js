// Corrections are overrides re-applied after every scrape. They are the only
// place in the pipeline where a human's editorial judgment outranks a source,
// so the failure modes are asymmetric: a correction that silently stops
// applying is an annoyance, while one that applies too broadly, or forever,
// quietly publishes wrong civic information.
const test = require('node:test');
const assert = require('node:assert');
const {
  applyCorrections, pruneExpired, defaultExpiry, matches, recordDate,
} = require('../lib/content-corrections.js');

const TODAY = '2026-08-09';

const dateFix = {
  id: 'best-day-ever', kind: 'event-date', array: 'TELLURIDE_COM_EVENTS',
  titleMatch: '"Best Day Ever" Free Movie Screening',
  wrongDate: '2026-08-19', correctDate: '2026-08-18',
  reason: 'KOTO event page states August 18.', expiresOn: '2026-09-17',
};

test('a date correction rewrites only the matching record', () => {
  const arrays = {
    TELLURIDE_COM_EVENTS: [
      { title: '"Best Day Ever" Free Movie Screening', pubDate: '2026-08-19' },
      { title: 'Something Else', pubDate: '2026-08-19' },
    ],
  };
  const { arrays: out, applied } = applyCorrections(arrays, [dateFix], TODAY);
  assert.equal(out.TELLURIDE_COM_EVENTS[0].pubDate, '2026-08-18');
  assert.equal(out.TELLURIDE_COM_EVENTS[1].pubDate, '2026-08-19', 'untargeted record untouched');
  assert.equal(applied[0].hits, 1);
});

test('it writes back to whichever date key the record actually uses', () => {
  const withDate = { TELLURIDE_COM_EVENTS: [{ title: dateFix.titleMatch, date: '2026-08-19' }] };
  const out = applyCorrections(withDate, [dateFix], TODAY).arrays;
  assert.equal(out.TELLURIDE_COM_EVENTS[0].date, '2026-08-18');
  assert.equal(out.TELLURIDE_COM_EVENTS[0].pubDate, undefined, 'no phantom second date key');
});

test('it goes inert once the source publishes the right date', () => {
  // Matching on wrongDate is what makes this self-retiring: the row stops
  // doing anything the moment the source fixes itself, instead of pinning a
  // date the source has since changed for a good reason.
  const fixedUpstream = { TELLURIDE_COM_EVENTS: [{ title: dateFix.titleMatch, pubDate: '2026-08-18' }] };
  const { applied } = applyCorrections(fixedUpstream, [dateFix], TODAY);
  assert.deepEqual(applied, [], 'nothing to do');
});

test('an expired correction stops applying', () => {
  const stale = { ...dateFix, expiresOn: '2026-08-01' };
  const arrays = { TELLURIDE_COM_EVENTS: [{ title: dateFix.titleMatch, pubDate: '2026-08-19' }] };
  const { applied, arrays: out } = applyCorrections(arrays, [stale], TODAY);
  assert.deepEqual(applied, []);
  assert.equal(out.TELLURIDE_COM_EVENTS[0].pubDate, '2026-08-19');
});

test('pruneExpired removes only the past-window rows', () => {
  const { kept, removed } = pruneExpired(
    [dateFix, { ...dateFix, id: 'old', expiresOn: '2026-07-01' }], TODAY);
  assert.deepEqual(kept.map(c => c.id), ['best-day-ever']);
  assert.deepEqual(removed.map(c => c.id), ['old']);
});

test('clear-link drops the href but KEEPS the event', () => {
  // Deleting a real community event because its website broke would be a much
  // worse outcome than showing it without a link.
  const arrays = { TJC_EVENTS: [{ title: 'Shabbat!', pubDate: '2026-08-28', link: 'https://dead.example/x' }] };
  const out = applyCorrections(arrays, [{
    id: 'x', kind: 'clear-link', array: 'TJC_EVENTS', titleMatch: 'Shabbat!', expiresOn: '2026-12-01',
  }], TODAY).arrays;
  assert.equal(out.TJC_EVENTS.length, 1, 'event still present');
  assert.equal(out.TJC_EVENTS[0].link, '');
  assert.equal(out.TJC_EVENTS[0].title, 'Shabbat!');
});

test('title matching is normalized but not fuzzy', () => {
  assert.ok(matches({ titleMatch: 'Tea and Tarot' }, { title: '  Tea & Tarot  ' }), 'punctuation/space-insensitive');
  assert.ok(!matches({ titleMatch: 'Tea and Tarot' }, { title: 'Tea and Tarot Workshop' }),
    'a longer, different event must NOT be swept up');
});

test('a malformed row is skipped, never applied loosely', () => {
  const arrays = { A: [{ title: 'x', pubDate: '2026-08-19' }] };
  const { applied, skipped } = applyCorrections(arrays, [
    { kind: 'nonsense', array: 'A', titleMatch: 'x' },
    { kind: 'event-date', titleMatch: 'x' },              // no array
    { kind: 'event-date', array: 'MISSING', titleMatch: 'x' },
  ], TODAY);
  assert.deepEqual(applied, []);
  assert.equal(skipped.length, 3);
});

test('every correction gets an expiry, anchored to the date it concerns', () => {
  // A row with no expiry is a landmine — it distorts data long after the source
  // fixed its own mistake and nobody remembers it exists.
  assert.equal(defaultExpiry({ correctDate: '2026-08-18' }, TODAY), '2026-09-17');
  assert.equal(defaultExpiry({ wrongDate: '2026-08-19' }, TODAY), '2026-09-18');
  assert.equal(defaultExpiry({}, TODAY), '2026-10-08');   // no date → 60 days
});

test('recordDate reads the key each source happens to use', () => {
  assert.equal(recordDate({ date: '2026-08-12' }), '2026-08-12');
  assert.equal(recordDate({ pubDate: '2026-08-12T00:00:00-06:00' }), '2026-08-12');
  assert.equal(recordDate({}), null);
});
