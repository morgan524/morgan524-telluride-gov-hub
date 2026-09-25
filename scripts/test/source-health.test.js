const test = require('node:test');
const assert = require('node:assert/strict');
const sh = require('../source-health.js');

test('detectAnomalies: broken→High, partial→Medium, healthy/excluded→none', () => {
  const arrays = {
    A: [],                          // 0 now, was 30 → broken
    B: new Array(4).fill({}),       // 4 now, was 28 → partial
    C: new Array(25).fill({}),      // healthy
    LEGAL_NOTICES: [],              // excluded (legitimately sporadic)
  };
  const baseline = { sources: {
    A: { dailyMax: { '2026-06-20': 30, '2026-06-22': 0 } },
    B: { dailyMax: { '2026-06-21': 28, '2026-06-22': 4 } },
    C: { dailyMax: { '2026-06-22': 25 } },
    LEGAL_NOTICES: { dailyMax: { '2026-06-20': 5, '2026-06-22': 0 } },
  } };
  const out = sh.detectAnomalies(arrays, baseline);
  const byName = Object.fromEntries(out.map(a => [a.name, a.severity]));
  assert.equal(byName.A, 'High');
  assert.equal(byName.B, 'Medium');
  assert.equal(out.length, 2);
  assert.ok(!('C' in byName));
  assert.ok(!('LEGAL_NOTICES' in byName));
});

test('detectAnomalies: a small source dropping to 0 below MIN_EXPECTED is ignored', () => {
  const out = sh.detectAnomalies(
    { Tiny: [] },
    { sources: { Tiny: { dailyMax: { '2026-06-21': 2, '2026-06-22': 0 } } } }
  );
  assert.equal(out.length, 0);   // recentMax 2 < MIN_EXPECTED(3) → not flagged
});

test('updateBaseline records today and prunes entries older than 14 days', () => {
  const baseline = { sources: { A: { dailyMax: { '2026-05-01': 10, '2026-06-20': 8 } } } };
  sh.updateBaseline(baseline, { A: new Array(7).fill({}) }, '2026-06-22');
  const dm = baseline.sources.A.dailyMax;
  assert.equal(dm['2026-06-22'], 7);          // today recorded
  assert.equal(dm['2026-06-20'], 8);          // within window, kept
  assert.ok(!('2026-05-01' in dm));            // >14d old, pruned
});

test('updateBaseline enrolls a brand-new source', () => {
  const baseline = { sources: {} };
  sh.updateBaseline(baseline, { New: new Array(12).fill({}) }, '2026-06-22');
  assert.equal(baseline.sources.New.dailyMax['2026-06-22'], 12);
});

test('detectStaleData: flags a *_CACHED_DATA list with 0 upcoming, not one with upcoming', () => {
  const localDate = v => { const d = new Date(v); return isNaN(d) ? null : d; };
  const today = '2026-07-16';
  const captured = {
    // all past, no future summary → should flag High (the MV/Med/School/Ophir failure)
    MV_CACHED_DATA: [{ date: 'June 17, 2026' }, { date: 'May 21, 2026' }],
    // has a future entry → must NOT flag (the Airport case)
    AIRPORT_CACHED_DATA: [{ date: 'May 1, 2026' }, { date: 'November 19, 2026' }],
    // all past in the array, BUT a future summary exists → renders upcoming via
    // MANUAL_SUMMARIES (getCountyCachedMeetings), so must NOT flag.
    COUNTY_CACHED_DATA: [{ date: 'July 9, 2026' }],
    MANUAL_SUMMARIES: { 'county|2026-07-22|BOCC regular meeting': 'summary text' },
    // fresh cache date so signal-1 stays quiet; isolates signal-3
    MV_CACHE_DATE: '2026-07-16',
    AIRPORT_CACHE_DATE: '2026-07-16',
    COUNTY_CACHE_DATE: '2026-07-16',
  };
  const findings = sh.detectStaleData(captured, localDate, today);
  const empty = findings.filter(f => /0 upcoming meetings/.test(f.message));
  assert.equal(empty.length, 1, 'exactly one empty-upcoming finding');
  assert.equal(empty[0].name, 'MV_CACHED_DATA');
  assert.equal(empty[0].severity, 'High');
  assert.ok(!empty.some(f => f.name === 'AIRPORT_CACHED_DATA'),
    'a list with an upcoming meeting must not be flagged');
  assert.ok(!empty.some(f => f.name === 'COUNTY_CACHED_DATA'),
    'a list that renders upcoming via a future summary must not be flagged');
});

test('orphan summaries: a _BOARD_MEETINGS row counts as a list row', () => {
  // Telluride's boards do not live in a *_CACHED_DATA array — Town Council is
  // in TELLURIDE_BOARD_MEETINGS. Only scanning _CACHED_DATA reported the Sept 1
  // Town Council summary as an orphan while the meeting was listed and
  // rendering, i.e. a false positive on the busiest body on the site.
  // Mirrors the REAL localDate in js/gov-helpers.js: a bare "YYYY-MM-DD" is
  // split on the dashes rather than handed to new Date(), which would read it
  // as UTC midnight and land on the previous day in Mountain time. Summary keys
  // are ISO and meeting rows are "Month D, YYYY", so a naive stub makes the two
  // sides disagree by a day and the test lies about what the checker does.
  const localDate = v => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const d = new Date(v);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const captured = {
    MANUAL_SUMMARIES: {
      'telluride|2026-09-01|Town Council - Sep 01 2026': 'real summary',
      'telluride|2026-09-14|Open Space Commission - Sep 14 2026': 'real summary',
    },
    TELLURIDE_CACHED_DATA: [{ date: 'September 16, 2026', title: 'HARC Meeting' }],
    TELLURIDE_BOARD_MEETINGS: [{ date: 'September 1, 2026', title: 'Town Council' }],
  };
  const f = sh.detectStaleData(captured, localDate, '2026-08-16')
    .filter(x => x.name === 'MANUAL_SUMMARIES');
  assert.equal(f.length, 1, 'still reports the genuine orphan');
  assert.ok(/2026-09-14/.test(f[0].message), 'Sept 14 has no row anywhere — real orphan');
  assert.ok(!/2026-09-01/.test(f[0].message),
    'Sept 1 IS listed in TELLURIDE_BOARD_MEETINGS and must not be called an orphan');
});

test('detectAnomalies: an array emptied by an active drop-event correction is Low, not a broken scraper', () => {
  const baseline = { sources: { TJC_EVENTS: { dailyMax: { '2026-08-20': 3 } },
                                KOTO_EVENTS: { dailyMax: { '2026-08-20': 9 } } } };
  const arrays = { TJC_EVENTS: [], KOTO_EVENTS: [] };

  // Without the map, both look like broken scrapers.
  const plain = sh.detectAnomalies(arrays, baseline);
  assert.equal(plain.length, 2);
  assert.ok(plain.every(a => a.severity === 'High'));

  // With it, only the genuinely-broken one stays High.
  const out = sh.detectAnomalies(arrays, baseline, { TJC_EVENTS: 'drop-tjc-shabbat-2026-08-16' });
  const tjc = out.find(a => a.name === 'TJC_EVENTS');
  const koto = out.find(a => a.name === 'KOTO_EVENTS');
  assert.equal(tjc.severity, 'Low');
  assert.match(tjc.message, /drop-tjc-shabbat-2026-08-16/);
  assert.equal(koto.severity, 'High');
});
