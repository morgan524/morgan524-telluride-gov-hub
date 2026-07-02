// Compile-check a JS source string before it's written to a data file.
//
// Every bot script that rewrites js/gov-helpers.js / js/gov-data.js / community-pulse.js
// must call this immediately before fs.writeFileSync. new Function(src) parses the
// whole file (function-body grammar — top-level `const`/`let` and statements are
// legal) WITHOUT executing it; a SyntaxError throws here, aborting the run before
// any write, so the last good file stays in place and the workflow commits nothing.
//
// This is the single safety net that turns "a bad serialize ships a broken data
// file → the whole site's data layer goes down" (the 2026-07-01 incident) into
// "the run fails loudly, CI opens an issue, the site keeps serving the last good
// file." content-refresh.js has had this inline since that incident; this module
// exists so maintenance.js / housing-refresh.js / deep-dive-refresh.js can share it.

function assertParses(label, src) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(src);
  } catch (e) {
    throw new Error(
      `${label} would be INVALID JS (${e.message}) — aborting write so a broken file is never shipped.`
    );
  }
}

module.exports = { assertParses };
