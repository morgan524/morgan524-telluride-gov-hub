const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../lib/claude-model.js');

test('exports SONNET/OPUS/HAIKU as claude-* model IDs', () => {
  for (const k of ['SONNET', 'OPUS', 'HAIKU']) {
    assert.equal(typeof models[k], 'string');
    assert.match(models[k], /^claude-/, `${k} should be a claude-* model id`);
  }
});
