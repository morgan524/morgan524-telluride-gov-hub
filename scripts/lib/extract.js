// Read a `const NAME = [...]` / `const NAME = {...}` literal back out of a JS
// source string and evaluate it to a value. The read-side counterpart to
// lib/serialize.js, extracted from content-refresh.js (used 30+ times there)
// so it's unit-tested and reusable.
//
// NOTE: these are naive bracket-matchers — they count every [ ] { } including
// any inside string literals. The bot's serialized data never contains an
// unbalanced bracket inside a string (serializeArray JSON-quotes values), so
// this is safe for that data. Don't point it at arbitrary hand-written JS.

function extractBalanced(source, varName, open, close) {
  const esc = open === '[' ? '\\[' : '\\{';
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*${esc}`);
  const match = startRe.exec(source);
  if (!match) return null;
  let depth = 0;
  const start = match.index + match[0].length - 1; // position of the opening bracket
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) {
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
