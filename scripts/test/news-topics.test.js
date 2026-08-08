// The topic-tagging rules, plus the carry-forward re-tag that decides whether a
// rules change actually reaches the site.
//
// Background (2026-08-07): the scoring rewrite fixed classifyNewsTopic, but the
// site kept serving old tags. The RSS feeds only carry the most recent handful
// of items, so most articles on screen are carried forward from a previous run
// — and both carry-forward paths pushed the stored record verbatim. 34 of 83
// live Telluride Times articles were still on tags from the old
// first-match-wins cascade and would have stayed there until they aged out.
const test = require('node:test');
const assert = require('node:assert');
const {
  classifyNewsTopic,
  retagCarriedForward,
} = require('../lib/news-topics.js');

// ── The two bug classes the scoring rewrite was meant to kill ──

test('a headline keyword does not outvote a body that is plainly about something else', () => {
  // The canonical regression: "road" in the title used to win outright.
  assert.equal(
    classifyNewsTopic(
      'Logan Metz and the fork in the road',
      'Logan Metz — Wisconsin-born singer-songwriter and multi-instrumentalist — plays Music on the Green.',
    ),
    'arts-culture',
  );
});

test('patterns are word-anchored, not substring matches', () => {
  // Each of these matched the wrong topic under the old unanchored cascade:
  // /rent/ in "current", /art/ in "part", /park/ in "parking".
  for (const [title, body] of [
    ['Current conditions at the reservoir', 'The current level is being monitored.'],
    ['Taking part in the survey', 'Residents can take part this week.'],
    ['Parking changes downtown', 'New parking rules take effect.'],
  ]) {
    assert.notEqual(classifyNewsTopic(title, body), 'housing', `${title} → housing`);
  }
});

test('a real land-use story still lands on a land-use-ish topic', () => {
  const t = classifyNewsTopic(
    'County housing code discussions continue',
    'San Miguel County continues its land use code audit, focusing on zoning density and workforce housing.',
  );
  assert.ok(['housing', 'land-use'].includes(t), `got ${t}`);
});

test('an unmatched story falls back to community rather than erroring', () => {
  assert.equal(classifyNewsTopic('New cookies are selling like hot cakes', 'A bakery opened.'), 'community');
  assert.equal(classifyNewsTopic('', ''), 'community');
});

// ── The carry-forward re-tag: the part that makes a rules change reach the site ──

test('a carried-forward record is re-tagged, not copied verbatim (the leak this fixes)', () => {
  const stored = {
    title: 'Logan Metz and the fork in the road',
    copy: 'Logan Metz — Wisconsin-born singer-songwriter and multi-instrumentalist — plays Music on the Green.',
    newsTopic: 'infrastructure', // assigned by the old cascade
    href: 'https://example.com/a',
    source: 'Telluride Times',
  };
  assert.equal(retagCarriedForward(stored).newsTopic, 'arts-culture');
});

test('re-tagging preserves every other field', () => {
  const stored = {
    title: 'Logan Metz and the fork in the road',
    copy: 'singer-songwriter plays Music on the Green',
    newsTopic: 'infrastructure',
    href: 'https://example.com/a',
    source: 'Telluride Times',
    img: 'https://example.com/a.jpg',
    imgPos: 'center 20%',      // hand-set presentation override — must survive
    firstSeen: '2026-08-01',
    claudeSummary: true,
  };
  const after = retagCarriedForward(stored);
  for (const k of Object.keys(stored)) {
    if (k === 'newsTopic') continue;
    assert.deepEqual(after[k], stored[k], `field ${k} was altered`);
  }
});

test('re-tagging does not mutate the stored record in place', () => {
  const stored = { title: 'Logan Metz and the fork in the road', copy: 'singer-songwriter', newsTopic: 'infrastructure' };
  retagCarriedForward(stored);
  assert.equal(stored.newsTopic, 'infrastructure');
});

test('a record without newsTopic never gains one', () => {
  // Some carried-forward shapes (gov notices, alerts) have no topic field —
  // adding one would change what downstream renderers see.
  const stored = { title: 'Something', copy: 'Some copy', href: 'https://example.com/x' };
  assert.deepEqual(retagCarriedForward(stored), stored);
  assert.ok(!('newsTopic' in retagCarriedForward(stored)));
});

test('non-object inputs pass through rather than throwing', () => {
  for (const v of [null, undefined, 'a string', 42]) {
    assert.equal(retagCarriedForward(v), v);
  }
});

test('re-tagging is idempotent', () => {
  const stored = { title: 'Logan Metz and the fork in the road', copy: 'singer-songwriter plays Music on the Green', newsTopic: 'infrastructure' };
  const once = retagCarriedForward(stored);
  assert.deepEqual(retagCarriedForward(once), once);
});
