// Regional past-meeting recaps in the weekly email (scripts/lib/recap-regions.js).
const test = require('node:test');
const assert = require('node:assert');
const RR = require('../lib/recap-regions.js');

const rec = (sourceKey, date, title = 'T') => ({ sourceKey, date, title, recap: 'One. Two.' });

test('window is the five business days before the week start', () => {
  assert.deepStrictEqual(RR.priorBusinessWeek('2026-10-05'), ['2026-09-28', '2026-10-02']); // Monday
  assert.deepStrictEqual(RR.priorBusinessWeek('2026-10-04'), ['2026-09-28', '2026-10-02']); // Sunday
});

test('recapsForWeek keeps last week Mon–Fri only, drops Rico/TMVOA, newest first', () => {
  const rows = [rec('telluride', '2026-09-25'), rec('mv', '2026-09-26'), rec('county', '2026-09-21'),
    rec('smart', '2026-09-20'), rec('rico', '2026-09-23'), rec('tmvoa', '2026-09-22'), rec('ridgway', '2026-09-28')];
  const out = RR.recapsForWeek(rows, '2026-09-28').map((r) => r.sourceKey + ' ' + r.date);
  assert.deepStrictEqual(out, ['telluride 2026-09-25', 'county 2026-09-21']);
});

test('region membership', () => {
  const rows = ['telluride', 'mv', 'school', 'smart', 'airport', 'med', 'county', 'ophir', 'fire', 'norwood', 'ouray', 'ouraycity', 'ridgway']
    .map((k) => rec(k, '2026-09-23'));
  const keys = (g) => RR.recapsForRegion(rows, g).map((r) => r.sourceKey).sort();
  assert.deepStrictEqual(keys('East End'), ['airport', 'county', 'fire', 'med', 'mv', 'ophir', 'school', 'smart', 'telluride']);
  assert.deepStrictEqual(keys('West End'), ['county', 'norwood', 'smart']);
  assert.deepStrictEqual(keys('Ridgway/Ouray'), ['ouray', 'ouraycity', 'ridgway']);
  assert.strictEqual(RR.recapsForRegion(rows, '').length, rows.length); // blank region → all
});

test('shortRecap trims to whole sentences', () => {
  const long = 'First sentence here. ' + 'Second sentence is quite a bit longer than the first one. '.repeat(6);
  const s = RR.shortRecap(long);
  assert.ok(s.startsWith('First sentence here.'));
  assert.ok(s.length <= 260);
});

test('recapId matches the page anchor format', () => {
  assert.strictEqual(RR.recapId({ sourceKey: 'mv', date: '2026-09-25', title: 'Mountain Village Town Council — Sep 25, 2026' }),
    'r-mv-2026-09-25-mountain-village-town-council-sep-25-2026');
});

test('eventRegion places events by location, then source', () => {
  assert.strictEqual(RR.eventRegion({ location: 'Norwood, CO' }), 'West End');
  assert.strictEqual(RR.eventRegion({ location: '687 N Cora Street, Ridgway, CO' }), 'Ridgway/Ouray');
  assert.strictEqual(RR.eventRegion({ location: 'Mountain Village, CO' }), 'East End');
  assert.strictEqual(RR.eventRegion({ title: 'Show', source: 'Sherbino Theater' }), 'Ridgway/Ouray');
  assert.strictEqual(RR.eventRegion({ title: 'Senior Lunch', source: 'NORWOOD_EVENTS' }), 'West End');
  assert.strictEqual(RR.eventRegion({ title: 'Concert', source: 'Sheridan Opera House' }), 'East End');
  assert.strictEqual(RR.eventRegion({ location: 'Rico Town Hall' }), null);
});

test('regionBlock splits into ALL + three hidden regional copies', () => {
  const html = 'pre' + RR.regionBlock('ALL', { 'East End': 'E', 'West End': 'W', 'Ridgway/Ouray': 'O' }) + 'post';
  const parts = html.split(RR.REGION_MARK);
  assert.strictEqual(parts.length, 6);
  assert.deepStrictEqual([parts[0], parts[1], parts[5]], ['pre', 'ALL', 'post']);
  assert.strictEqual(parts[3], RR.HIDE_OPEN + 'W' + RR.HIDE_CLOSE);
});

test('upcoming-meeting regions add Rico to the East End; recaps do not', () => {
  assert.ok(RR.MEETING_REGIONS['East End'].includes('rico'));
  assert.ok(RR.MEETING_REGIONS['East End'].includes('ophir'));
  assert.ok(!RR.RECAP_REGIONS['East End'].includes('rico'));
  assert.deepStrictEqual(RR.MEETING_REGIONS['West End'], RR.RECAP_REGIONS['West End']);
});
