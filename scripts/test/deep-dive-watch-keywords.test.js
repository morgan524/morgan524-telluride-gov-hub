// Deep-dive watch keyword matching.
//
// The 2026-10-03 bug: the Carhenge keyword 'lot l' (for Shandoka's Lot L) was
// matched as a bare substring, so a County BOCC agenda's "lot line adjustment
// for Lots 320A and 320B in the Lawson Hill PUD" became the homepage Featured
// Action "Carhenge / Shandoka goes before Board of County Commissioners".
const test = require('node:test');
const assert = require('node:assert');
const { topicRegexes, matchTopics } = require('../build-deep-dive-watch.js');

const re = topicRegexes();

test('"lot line adjustment" does not match Carhenge', () => {
  const text = 'a lot line adjustment for Lots 320A and 320B in the Lawson Hill PUD';
  assert.ok(!matchTopics(re, text, 'county').includes('carhenge'));
});

test('Lot L and Carhenge mentions still match', () => {
  assert.ok(matchTopics(re, 'Shandoka Lot L parking structure', 'telluride').includes('carhenge'));
  assert.ok(matchTopics(re, 'proposed changes to Lot L', 'telluride').includes('carhenge'));
  assert.ok(matchTopics(re, 'Carhenge Redevelopment Project', 'telluride').includes('carhenge'));
});
