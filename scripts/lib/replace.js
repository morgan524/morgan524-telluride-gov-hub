// Shared STRICT const-replacers for the bot writers (content-refresh.js,
// maintenance.js, housing-refresh.js, deep-dive-refresh.js).
//
// Two guarantees the old per-script copies didn't make (2026-07-22 audit P0-3):
//
//   1. THROW when the target const is missing. The warn-and-continue versions
//      silently dropped every update when a const was renamed, moved to the
//      other data file, or lost in a refactor — the Norwood bug shape ("patched
//      against gov-helpers.js where the const doesn't exist, so every update
//      silently no-opped for a month"), which also went dark for SMC_ALERTS /
//      REGIONAL_NEWS_ARTICLES / ENGAGE_MEETINGS / MEETING_PREVIEWS after the
//      May 2026 gov-hub.js retirement.
//
//   2. STRING-AWARE bracket walking (same rules as lib/extract.js): the walk
//      skips '…' / "…" / `…` contents, so a stray [ ] { } inside scraped text
//      ("[UPDATED] closure") can't mis-place the closing bracket and splice a
//      corrupt literal.
//
// locateConst returns the span of `const NAME = <bracketed literal>;` in the
// source. The replace* helpers splice a freshly-serialized literal into that
// span. Serialization stays the caller's business where it has extra funnel
// steps (content-refresh's sanitize→validate→serialize); the plain helpers
// below cover the simple writers.

const { serializeArray, serializeObject } = require('./serialize.js');

// → { start, end } of the whole `const NAME = <literal>;` statement.
// Throws if the const isn't declared with the expected bracket, or if the
// literal never closes (truncated/corrupt file).
function locateConst(source, varName, isObject) {
  const open = isObject ? '{' : '[';
  const close = isObject ? '}' : ']';
  const esc = isObject ? '\\{' : '\\[';
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*${esc}`);
  const match = startRe.exec(source);
  if (!match) {
    throw new Error(
      `${varName}: const not found in target source — the update would be silently lost. ` +
      `The const was renamed/removed, or this write targets the wrong file (gov-helpers vs gov-data).`
    );
  }
  const bracketStart = match.index + match[0].length - 1;
  let depth = 0;
  let quote = null;
  for (let i = bracketStart; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        while (end < source.length && source[end] !== ';') end++;
        if (source[end] === ';') end++;
        return { start: match.index, end };
      }
    }
  }
  throw new Error(`${varName}: literal never closes in target source — file looks truncated/corrupt; refusing to write.`);
}

function spliceConst(source, varName, serializedBlock, isObject) {
  const { start, end } = locateConst(source, varName, isObject);
  return source.slice(0, start) + serializedBlock + source.slice(end);
}

// Replace `const NAME = [...];` with the serialized `arr`. Throws on missing const.
function replaceJsArrayStrict(source, varName, arr) {
  return spliceConst(source, varName, serializeArray(varName, arr), false);
}

// Replace `const NAME = {...};` with the serialized `obj`. Throws on missing const.
function replaceJsObjectStrict(source, varName, obj) {
  return spliceConst(source, varName, serializeObject(varName, obj), true);
}

// Replace `const NAME = '<old>';` with `const NAME = '<newValue>';`.
// Throws on missing const. newValue must be a plain string with no quotes.
function replaceConstStringStrict(source, varName, newValue) {
  const re = new RegExp(`(const\\s+${varName}\\s*=\\s*)'[^']*'`);
  if (!re.test(source)) {
    throw new Error(`${varName}: string const not found in target source — the update would be silently lost.`);
  }
  if (/['\\]/.test(String(newValue))) {
    throw new Error(`${varName}: refusing to write a value containing quotes/backslashes: ${newValue}`);
  }
  return source.replace(re, `$1'${newValue}'`);
}

module.exports = { locateConst, spliceConst, replaceJsArrayStrict, replaceJsObjectStrict, replaceConstStringStrict };
