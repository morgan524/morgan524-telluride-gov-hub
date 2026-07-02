// Read a `const NAME = [...]` / `const NAME = {...}` literal back out of a JS
// source string and evaluate it to a value. The read-side counterpart to
// lib/serialize.js, extracted from content-refresh.js (used 30+ times there)
// so it's unit-tested and reusable.
//
// These bracket-matchers are STRING-AWARE: they skip over the contents of
// '…' / "…" / `…` string literals (honoring backslash escapes) so a stray
// [ ] { } inside scraped title/summary text can't fool the depth counter.
// A naive counter that counted brackets inside strings would mis-place the
// closing bracket on data like "[UPDATED] closure" or LLM prose containing a
// lone '}', slice a malformed literal, throw, and return null — and every
// caller does `|| []`, silently wiping carried-forward history. See
// docs/news-pipeline.md and the write-guard incident notes.

function extractBalanced(source, varName, open, close) {
  const esc = open === '[' ? '\\[' : '\\{';
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*${esc}`);
  const match = startRe.exec(source);
  if (!match) return null;
  let depth = 0;
  let quote = null; // current string delimiter (' " `) or null when outside a string
  const start = match.index + match[0].length - 1; // position of the opening bracket
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      // Inside a string literal: consume until the matching unescaped delimiter.
      if (ch === '\\') { i++; continue; } // skip the escaped char
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const literal = source.slice(start, i + 1);
        try {
          // Function eval handles single-quoted strings, template literals, etc.
          // eslint-disable-next-line no-new-func
          return new Function(`return (${literal})`)();
        } catch (e) {
          console.warn(`  Could not parse ${varName}: ${e.message}`);
          return null;
        }
      }
    }
  }
  return null;
}

// Extract a JS object assigned to `const NAME = { ... };` → object | null
function extractJsObject(source, varName) {
  return extractBalanced(source, varName, '{', '}');
}

// Extract a JS array assigned to `const NAME = [ ... ];` → array | null
function extractJsArray(source, varName) {
  return extractBalanced(source, varName, '[', ']');
}

module.exports = { extractJsArray, extractJsObject };
