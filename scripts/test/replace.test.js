// lib/replace.js — the STRICT const replacers (2026-07-22 audit P0-3).
// The two properties that distinguish them from the old per-script copies:
//   1. a missing target const THROWS (never a silent no-op)
//   2. the bracket walk is string-aware (brackets inside strings can't
//      mis-place the splice)

const test = require('node:test');
const assert = require('node:assert/strict');
const { locateConst, replaceJsArrayStrict, replaceJsObjectStrict, replaceConstStringStrict } = require('../lib/replace.js');

const SRC = [
  "const BEFORE = 'x';",
  'const ITEMS = [',
  '  { title: "[UPDATED] closure ] } tricky", n: 1 },',
  "  { title: 'plain', n: 2 }",
  '];',
  'const MAP = { "a|b": "v { nested ] in string" };',
  "const STAMP = '2026-01-01';",
  "const AFTER = 'y';",
].join('\n');

test('replaceJsArrayStrict replaces the literal, leaves neighbors intact', () => {
  const out = replaceJsArrayStrict(SRC, 'ITEMS', [{ title: 'new', n: 3 }]);
  assert.match(out, /const ITEMS = \[/);
  assert.match(out, /'new'|"new"/);
  assert.ok(!out.includes('[UPDATED]'), 'old items gone');
  assert.ok(out.includes("const BEFORE = 'x';") && out.includes("const AFTER = 'y';"));
  // The whole result must still parse.
  assert.doesNotThrow(() => new Function(out));
});

test('string-aware walk: brackets inside string values do not break the splice', () => {
  // If the walker counted the ] inside "[UPDATED] closure ] } tricky", the
  // splice would end early and corrupt the file. Round-trip must stay valid JS
  // and keep both records replaced atomically.
  const out = replaceJsArrayStrict(SRC, 'ITEMS', []);
  assert.doesNotThrow(() => new Function(out));
  assert.ok(out.includes('const MAP'), 'following const survives');
});

test('replaceJsObjectStrict replaces object literals with tricky string contents', () => {
  const out = replaceJsObjectStrict(SRC, 'MAP', { k: 'v2' });
  assert.doesNotThrow(() => new Function(out));
  assert.ok(!out.includes('nested ] in string'));
});

test('missing const THROWS (array, object, string variants)', () => {
  assert.throws(() => replaceJsArrayStrict(SRC, 'NOT_THERE', []), /not found/);
  assert.throws(() => replaceJsObjectStrict(SRC, 'NOT_THERE', {}), /not found/);
  assert.throws(() => replaceConstStringStrict(SRC, 'NOT_THERE', 'v'), /not found/);
  // wrong bracket kind for the declaration is also "not found"
  assert.throws(() => replaceJsObjectStrict(SRC, 'ITEMS', {}), /not found/);
});

test('truncated literal THROWS instead of silently returning source', () => {
  const truncated = 'const X = [ { a: 1 }, { b: 2 }';
  assert.throws(() => locateConst(truncated, 'X', false), /never closes/);
});

test('replaceConstStringStrict swaps the value and rejects quote injection', () => {
  const out = replaceConstStringStrict(SRC, 'STAMP', '2026-07-22');
  assert.ok(out.includes("const STAMP = '2026-07-22';"));
  assert.throws(() => replaceConstStringStrict(SRC, 'STAMP', "x' + hack + '"), /quotes/);
});
