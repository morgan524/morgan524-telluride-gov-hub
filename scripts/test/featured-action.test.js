// Featured Action pin expiry.
//
// The pin (FEATURED_ACTION_PIN in js/gov-data.js) hand-picks which upcoming
// meeting the homepage promotes, and supplies its headline and blurb. Its
// `date` is the expiry.
//
// The 2026-08-08 bug: `pinned` tested pin.date, but headline/blurb used
// `pin.headline || …` with no freshness check. So once a pin expired it stopped
// SELECTING a meeting while still overriding the COPY of whatever meeting was
// auto-picked next — the homepage advertised "Town Park Oval paving goes before
// Parks & Rec on Wednesday, July 29" attached to an unrelated Aug 11 Town
// Council meeting. Wrong body, wrong date, and a call to action for a meeting
// that had already happened.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run } = require('../build-featured-action.js');

// Dates relative to "today" in Mountain Time, which is what the builder uses.
function mtToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}
function shiftDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Minimal repo the builder can run against: a deep-dive-watch topic with one
// upcoming meeting, a matching week-meetings row, and a gov-data.js pin.
function makeRepo(pin, meetingDate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-test-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.mkdirSync(path.join(root, 'js'));
  const meeting = {
    source: 'telluride',
    sourceLabel: 'Town of Telluride',
    title: 'Town Council',
    date: meetingDate,
    agendaUrl: 'https://example.com/agenda',
  };
  fs.writeFileSync(
    path.join(root, 'data', 'deep-dive-watch.json'),
    JSON.stringify({ topics: { code: { label: 'Code Changes', upcoming: [meeting] } } }),
  );
  fs.writeFileSync(
    path.join(root, 'data', 'week-meetings.json'),
    JSON.stringify([{ ...meeting, summary: 'Third reading of the wildfire resiliency code.', hasAgenda: true }]),
  );
  fs.writeFileSync(
    path.join(root, 'js', 'gov-data.js'),
    'const FEATURED_ACTION_PIN = ' + JSON.stringify(pin, null, 2) + ';\n',
  );
  return root;
}

test('an EXPIRED pin supplies no copy (the bug this guards)', () => {
  const today = mtToday();
  const root = makeRepo(
    {
      topic: 'fieldpaving',
      date: shiftDays(today, -10),                      // expired ten days ago
      headline: 'Town Park Oval paving goes before Parks & Rec on Wednesday, July 29',
      blurb: 'Parks & Rec will take up the paving of the Town Park grass oval.',
    },
    shiftDays(today, 3),                                 // an unrelated upcoming meeting
  );
  const out = run(root);

  assert.equal(out.pinned, false);
  assert.ok(!/Town Park Oval/.test(out.headline), `expired pin leaked its headline: ${out.headline}`);
  assert.ok(!/Parks & Rec/.test(out.blurb), `expired pin leaked its blurb: ${out.blurb}`);
  // Falls back to the auto-generated copy for the meeting actually selected.
  assert.match(out.headline, /Code Changes goes before Town Council/);
  assert.match(out.blurb, /wildfire resiliency code/);
});

test('an ACTIVE pin still supplies its copy', () => {
  const today = mtToday();
  const root = makeRepo(
    {
      topic: 'code',
      date: shiftDays(today, 5),                         // still in the future
      headline: 'A pinned headline',
      blurb: 'A pinned blurb.',
    },
    shiftDays(today, 3),
  );
  const out = run(root);

  assert.equal(out.pinned, true);
  assert.equal(out.headline, 'A pinned headline');
  assert.equal(out.blurb, 'A pinned blurb.');
});

test('an empty pin falls back to auto-generated copy', () => {
  const today = mtToday();
  const out = run(makeRepo({}, shiftDays(today, 3)));

  assert.equal(out.pinned, false);
  assert.match(out.headline, /Code Changes goes before Town Council/);
  assert.match(out.blurb, /wildfire resiliency code/);
});

test('a pin expiring TODAY is still active (boundary)', () => {
  const today = mtToday();
  const out = run(makeRepo(
    { topic: 'code', date: today, headline: 'Still valid today', blurb: 'Today blurb.' },
    shiftDays(today, 2),
  ));
  assert.equal(out.pinned, true);
  assert.equal(out.headline, 'Still valid today');
});

test('the committed pin in js/gov-data.js is not expired', () => {
  // A pin left in place past its date is dead weight: it can no longer select a
  // meeting, and (before the fix) silently corrupted the copy of the next one.
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'gov-data.js'), 'utf8');
  const m = /const\s+FEATURED_ACTION_PIN\s*=\s*(\{[\s\S]*?\});/.exec(src);
  assert.ok(m, 'FEATURED_ACTION_PIN const is missing from gov-data.js');
  const pin = JSON.parse(m[1]);
  if (pin && pin.date) {
    assert.ok(pin.date >= mtToday(), `FEATURED_ACTION_PIN expired on ${pin.date} — clear it or update the date`);
  }
});

// ── Remote ways in ────────────────────────────────────────────────────────────
// Morgan, 2026-08-19: the featured action must always carry the Zoom link and
// the YouTube link. A hand pin has no week-meetings row to inherit them from,
// so the pin itself may supply both — and an auto pick with neither falls back
// to the body's channel.

test('an ACTIVE pin supplies its Zoom + livestream links', () => {
  const today = mtToday();
  const out = run(makeRepo(
    {
      topic: 'code',
      date: shiftDays(today, 5),
      zoomLink: 'https://us06web.zoom.us/meeting/register/PINNED',
      livestream: 'https://www.youtube.com/@pinned/streams',
    },
    shiftDays(today, 3),
  ));
  assert.equal(out.meeting.zoomLink, 'https://us06web.zoom.us/meeting/register/PINNED');
  assert.equal(out.meeting.livestream, 'https://www.youtube.com/@pinned/streams');
});

test('an EXPIRED pin supplies no links either', () => {
  const today = mtToday();
  const out = run(makeRepo(
    {
      topic: 'fieldpaving',
      date: shiftDays(today, -10),
      zoomLink: 'https://us06web.zoom.us/meeting/register/STALE',
      livestream: 'https://www.youtube.com/@stale/streams',
    },
    shiftDays(today, 3),
  ));
  assert.equal(out.pinned, false);
  assert.ok(!/STALE/.test(out.meeting.zoomLink), `expired pin leaked its Zoom room: ${out.meeting.zoomLink}`);
  assert.ok(!/@stale/.test(out.meeting.livestream), `expired pin leaked its livestream: ${out.meeting.livestream}`);
});

test('a meeting with no livestream of its own falls back to the entity channel', () => {
  // The fixture meeting is a Town of Telluride one and carries no livestream.
  const out = run(makeRepo({}, shiftDays(mtToday(), 3)));
  assert.equal(out.meeting.livestream, 'https://www.youtube.com/@townoftelluridecolorado8739/streams');
});

test('the committed pin carries both remote ways in', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'gov-data.js'), 'utf8');
  const pin = JSON.parse(/const\s+FEATURED_ACTION_PIN\s*=\s*(\{[\s\S]*?\});/.exec(src)[1]);
  if (pin && pin.date) {
    assert.ok(pin.zoomLink, 'FEATURED_ACTION_PIN has no zoomLink — the card would offer no way to take part remotely');
    assert.ok(pin.livestream || pin.source, 'FEATURED_ACTION_PIN has no livestream and no source to fall back on');
  }
});
