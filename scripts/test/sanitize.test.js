const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRecords, filterMvConflicts } = require('../lib/sanitize.js');

test('collapses a doubled noise word in titles', () => {
  const [o] = sanitizeRecords([{ title: 'Norwood Sanitation District Meeting Meeting', date: '2026-07-09' }]);
  assert.equal(o.title, 'Norwood Sanitation District Meeting');
});

test('leaves legit doubled words (place names) alone', () => {
  const [o] = sanitizeRecords([{ title: 'Walla Walla Wine Walk', date: '2026-08-01' }]);
  assert.equal(o.title, 'Walla Walla Wine Walk');
});

test('repairs scheme-less links but not https/mailto', () => {
  const out = sanitizeRecords([
    { title: 'A', date: '2026-07-01', link: 'ocrhm.org' },
    { title: 'B', date: '2026-07-02', link: 'www.x.org/a' },
    { title: 'C', date: '2026-07-03', link: 'https://ok.com' },
    { title: 'D', date: '2026-07-04', href: 'mailto:a@b.com' },
  ]);
  assert.equal(out[0].link, 'https://ocrhm.org');
  assert.equal(out[1].link, 'https://www.x.org/a');
  assert.equal(out[2].link, 'https://ok.com');     // unchanged
  assert.equal(out[3].href, 'mailto:a@b.com');      // unchanged
});

test('drops wrong-year and backwards endDates, keeps valid ones', () => {
  const out = sanitizeRecords([
    { title: 'Run', date: '2026-07-04', endDate: '2027-07-04' },  // year typo
    { title: 'Back', date: '2026-07-10', endDate: '2026-07-01' }, // end < start
    { title: 'Fest', date: '2026-07-10', endDate: '2026-07-12' }, // valid
  ]);
  assert.ok(!('endDate' in out[0]));
  assert.ok(!('endDate' in out[1]));
  assert.equal(out[2].endDate, '2026-07-12');
});

test('removes exact duplicates (same date+title+link), keeps multi-session', () => {
  const out = sanitizeRecords([
    { title: 'Dup', date: '2026-07-03', link: 'https://e.com/1' },
    { title: 'Dup', date: '2026-07-03', link: 'https://e.com/1' },  // exact dup → dropped
    { title: 'Sess', date: '2026-07-04', link: 'https://e.com/1/' },
    { title: 'Sess', date: '2026-07-04', link: 'https://e.com/2/' }, // different link → kept
  ]);
  assert.equal(out.filter(o => o.title === 'Dup').length, 1);
  assert.equal(out.filter(o => o.title === 'Sess').length, 2);
});

test('collapses same-date title reorderings (joint meetings)', () => {
  const out = sanitizeRecords([
    { title: 'Special Meeting - HARC and P&Z', date: 'June 23, 2026', agendaUrl: 'x/8285' },
    { title: 'Special Meeting - P&Z and HARC', date: 'June 23, 2026', agendaUrl: 'x/8286' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Special Meeting - HARC and P&Z');
});

test('non-array input passes through unchanged', () => {
  assert.deepEqual(sanitizeRecords('nope'), 'nope');
});

test('filterMvConflicts drops off-by-1 MV copy, keeps same-date + unknown', () => {
  const mv = [
    { title: 'Town Talk: Tau', pubDate: '2026-06-30' },        // KOTO says 07-01 → drop
    { title: 'Market on the Plaza', pubDate: '2026-06-24' },   // same date as KOTO → keep
    { title: 'MV Only Thing', pubDate: '2026-07-15' },         // not in trusted → keep
  ];
  const koto = [
    { title: 'Town Talk: Tau', pubDate: '2026-07-01' },
    { title: 'Market on the Plaza', pubDate: '2026-06-24' },
  ];
  const { kept, dropped } = filterMvConflicts(mv, [koto]);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].title, 'Town Talk: Tau');
  assert.equal(kept.length, 2);
});
