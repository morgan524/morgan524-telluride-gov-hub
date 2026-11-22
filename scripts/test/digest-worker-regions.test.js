// Digest Worker: regional split + payload compression (worker.js ltRegionVariant
// / ltCompress). Customer.io caps broadcast trigger data at 50 KB, so a regional
// digest goes out as one trigger per region, each carrying only its own copy.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RR = require('../lib/recap-regions.js');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'cloudflare-worker', 'livabletelluride-digest', 'worker.js'), 'utf8');
const a = src.indexOf('// ── Regional digests + payload size');
const b = src.indexOf('function ltPayload');
// eslint-disable-next-line no-new-func
const W = new Function(src.slice(a, b) + '\nreturn { ltRegionVariant, ltCompress, ltHasRegions, LT_REGION_MARK, LT_HIDE_OPEN, LT_HIDE_CLOSE };')();

test('worker markers match the email builder', () => {
  assert.strictEqual(W.LT_REGION_MARK, RR.REGION_MARK);
  assert.strictEqual(W.LT_HIDE_OPEN, RR.HIDE_OPEN);
  assert.strictEqual(W.LT_HIDE_CLOSE, RR.HIDE_CLOSE);
});

test('each region variant keeps shared content plus only its own copies', () => {
  const blk = (x) => RR.regionBlock('ALL' + x, { 'East End': 'E' + x, 'West End': 'W' + x, 'Ridgway/Ouray': 'O' + x });
  const html = 'head|' + blk(1) + '|mid|' + blk(2) + '|foot';
  assert.ok(W.ltHasRegions(html));
  assert.strictEqual(W.ltRegionVariant(html, 1), 'head|ALL1|mid|ALL2|foot');
  assert.strictEqual(W.ltRegionVariant(html, 2), 'head|E1|mid|E2|foot');
  assert.strictEqual(W.ltRegionVariant(html, 3), 'head|W1|mid|W2|foot');
  assert.strictEqual(W.ltRegionVariant(html, 4), 'head|O1|mid|O2|foot');
  assert.strictEqual(W.ltRegionVariant('plain', 3), 'plain');
});

test('compression round-trips exactly and shrinks repeated styles', () => {
  const row = '<td style="padding:13px 0;border-top:1px solid #eef1ee;font-family:Georgia,serif;">x</td>';
  const html = row.repeat(20) + '<a href="https://livabletelluride.org/gov-hub.html?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=week-ahead">a</a>'.repeat(5);
  const c = W.ltCompress(html);
  assert.ok(c.body.length < html.length / 2);
  let back = c.body; for (const d of c.dict) back = back.split(d.k).join(d.v);
  assert.strictEqual(back, html);
  assert.deepStrictEqual(W.ltCompress('has § already').dict, []);   // never tokenise a body that contains §
});
