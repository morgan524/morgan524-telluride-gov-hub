// Unit tests for js/lt-data.js — the shared data layer rebuilt pages use
// (redesign prep, 2026-07-20). Pure helpers only; the fetch path is
// browser-exercised per page at flip time.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LTData = require(path.resolve(__dirname, '..', '..', 'js', 'lt-data.js'));

test('esc escapes HTML-significant characters', () => {
  assert.equal(LTData.esc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(LTData.esc(null), '');
});

test('safeUrl allows only http(s)', () => {
  assert.equal(LTData.safeUrl('https://x.org/a'), 'https://x.org/a');
  assert.equal(LTData.safeUrl('javascript:alert(1)'), '#');
  assert.equal(LTData.safeUrl('', '/events.html'), '/events.html');
});

test('mtDateKey anchors calendar dates to America/Denver (UTC-skew regression)', () => {
  // 03:00 UTC on Jul 20 is still Jul 19 in Denver (MDT = UTC-6) — the exact
  // case .toISOString().slice(0,10) gets wrong.
  assert.equal(LTData.mtDateKey(new Date('2026-07-20T03:00:00Z')), '2026-07-19');
  // Midday UTC is the same calendar day in Denver.
  assert.equal(LTData.mtDateKey(new Date('2026-07-20T18:00:00Z')), '2026-07-20');
});

test('parseDateKey + fmtDate round-trip a date key without day shift', () => {
  assert.equal(LTData.mtDateKey(LTData.parseDateKey('2026-07-20')), '2026-07-20');
  assert.equal(LTData.fmtDate('2026-07-20', { weekday: 'short', month: 'short', day: 'numeric' }),
    'Mon, Jul 20');
});

test('todayMT returns a YYYY-MM-DD key', () => {
  assert.match(LTData.todayMT(), /^\d{4}-\d{2}-\d{2}$/);
});

test('cache bucket is a positive integer (10-minute granularity)', () => {
  const b = LTData._bucket();
  assert.ok(Number.isInteger(b) && b > 0);
});

// ── renderFeaturedAction: the remote ways in ──────────────────────────────────
// Morgan, 2026-08-19: "we always need to include the Zoom link and the YouTube
// link to join in". The card used to render Zoom only, so a meeting's
// livestream — carried in the data all along — never reached the reader.

// Minimal stand-in for the #featured-action card. renderFeaturedAction reaches
// for `document` only when card.querySelector misses, so serving every id here
// keeps the test DOM-free.
function fakeCard() {
  const els = {};
  for (const id of ['fa-headline', 'fa-meta', 'fa-blurb', 'fa-gallery', 'fa-acts']) {
    els[id] = { textContent: '', innerHTML: '', className: '', hidden: false };
  }
  return { style: {}, els, querySelector: (sel) => els[sel.slice(1)] || null };
}

const featuredAction = (meeting) => ({
  headline: 'HARC takes up the Shandoka Lot redevelopment',
  blurb: 'A blurb.',
  deepDive: { label: 'Carhenge / Shandoka', href: '/deep-dive-carhenge.html' },
  meeting: Object.assign({ date: LTData.todayMT(), humanDate: 'today' }, meeting),
});

test('renderFeaturedAction renders both the Zoom and the YouTube link', () => {
  const card = fakeCard();
  assert.equal(LTData.renderFeaturedAction(card, featuredAction({
    zoomLink: 'https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA',
    livestream: 'https://www.youtube.com/@townoftelluridecolorado8739/streams',
  })), true);
  const acts = card.els['fa-acts'].innerHTML;
  assert.match(acts, /href="https:\/\/us06web\.zoom\.us\/meeting\/register\/KKzcuKFdTuyXzpw65k2aAA"[^>]*>Join Zoom</);
  assert.match(acts, /href="https:\/\/www\.youtube\.com\/@townoftelluridecolorado8739\/streams"[^>]*>Watch on YouTube</);
});

test('a non-YouTube livestream gets a generic label', () => {
  const card = fakeCard();
  LTData.renderFeaturedAction(card, featuredAction({
    livestream: 'https://media.avcaptureall.cloud/?customerGuid=f6f590a7',
  }));
  assert.match(card.els['fa-acts'].innerHTML, />Watch the Livestream</);
});

test('no livestream in the data means no livestream link', () => {
  const card = fakeCard();
  LTData.renderFeaturedAction(card, featuredAction({ zoomLink: 'https://us06web.zoom.us/j/1' }));
  assert.doesNotMatch(card.els['fa-acts'].innerHTML, /Watch/);
});
