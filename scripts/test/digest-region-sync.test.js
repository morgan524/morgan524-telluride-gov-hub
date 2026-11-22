// Review Desk region sync (js/digest-region-sync.js), 2026-10-19: edits to the
// visible ALL copy must reach the hidden regional copies Customer.io sends.
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncRegions } = require('../../js/digest-region-sync.js');
const RR = require('../lib/recap-regions.js');

const card = (day, title, body) => `<tr><td><span>${day}</span><span>Town of Telluride</span><div>${title}</div><div>${body}</div></td></tr>`;
const section = (label, rows) => `<tr><td><div>&rarr; ${label}</div><table>${rows}</table></td></tr>`;
const A = card('WED', 'HARC', 'old HARC text <div>Why This Matters gondola</div>');
const B = card('THU', 'P&amp;Z', 'P&amp;Z text');
const C = card('FRI', 'Ridgway Council', 'Ridgway text');
const base = 'HEAD' + RR.regionBlock(section('Meetings', A + B + C), {
  'East End': section('Meetings · East End', A + B),
  'West End': section('Meetings · West End', ''),
  'Ridgway/Ouray': section('Meetings · Ridgway/Ouray', C),
}) + 'FOOT';

test('an edited card in the ALL copy replaces the same card in every regional copy', () => {
  const edited = base.replace(A, card('WED', 'HARC', 'new HARC text'));
  const { html, stats } = syncRegions(edited, base);
  assert.equal(html.split('old HARC text').length - 1, 0);
  assert.equal(html.split('new HARC text').length - 1, 2);   // ALL + East
  assert.equal(stats.replaced, 1);
});

test('a card deleted from the ALL copy is dropped from the regional copies', () => {
  const edited = base.replace(C, '');
  const { html, stats } = syncRegions(edited, base);
  assert.equal(html.includes('Ridgway text'), false);
  assert.equal(stats.removed, 1);
});

test('no edits → identical html; non-regional emails pass through', () => {
  assert.equal(syncRegions(base, base).html, base);
  assert.equal(syncRegions('<p>plain</p>', '<p>plain</p>').html, '<p>plain</p>');
});
