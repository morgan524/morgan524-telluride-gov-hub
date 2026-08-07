'use strict';
// Content-addressed cache for Anthropic responses, keyed by a hash of the FULL
// request body (model + system + messages + max_tokens).
//
// Why this exists (2026-08-07): scripts/meeting-recaps.js drafts a recap from a
// meeting transcript and then, for tracked boards, runs a SECOND pass over the
// same ~150k-token transcript to extract votes. Both results only persist if
// the run's `git push` succeeds — and it had been failing for 10 days straight
// (`--ff-only` refusing after the content bot pushed mid-run). Every failed
// push threw away work already paid for, and the next morning re-bought it:
// the same 532,301 chars of transcript went to Sonnet on every day of
// Jul 28 - Aug 6, ~266k input tokens/day, producing recaps that drifted
// slightly each time (the Jul 21 Town Council vote count came back 9, then 10,
// then 11).
//
// The cache deliberately lives OUTSIDE the repo. run-meeting-recaps-local.sh
// opens with `git checkout -- js/gov-helpers.js` and may rebase or reset, so
// anything stored in the working tree is exactly what gets destroyed on a bad
// day — which is the failure this is here to survive.
//
// Staleness isn't a risk: entries are keyed by content, so any change to the
// prompt or transcript misses and re-asks. A hit means the inputs are byte
// identical, where a fresh call would only re-roll the same answer at full
// price.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DIR = path.join(os.homedir(), '.livabletelluride', 'recap-cache');

function createResponseCache(opts = {}) {
  const dir = opts.dir || process.env.RECAP_CACHE_DIR || DEFAULT_DIR;
  const maxAgeDays = opts.maxAgeDays == null ? 45 : opts.maxAgeDays;

  const pathFor = (body) => path.join(
    dir,
    crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32) + '.json'
  );

  // `null` means "no entry". A cached value of null is not representable, but
  // callers here never cache null — a failed/empty parse is not written.
  function read(body) {
    try {
      const raw = JSON.parse(fs.readFileSync(pathFor(body), 'utf8'));
      return 'response' in raw ? raw.response : null;
    } catch { return null; }
  }

  function write(body, response) {
    if (response == null) return false;   // never cache a miss as if it were a hit
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(pathFor(body), JSON.stringify({ cachedAt: new Date().toISOString(), response }));
      return true;
    } catch { return false; }             // cache failure must never fail the run
  }

  function has(body) {
    try { return fs.existsSync(pathFor(body)); } catch { return false; }
  }

  // Keep the directory from growing without bound. Entries past the lookback
  // window can never be hit again, since the caller only considers recent
  // meetings.
  function prune(now) {
    let removed = 0;
    const cutoff = (now == null ? Date.now() : now) - maxAgeDays * 86400000;
    try {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        try { if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); removed++; } } catch { /* raced */ }
      }
    } catch { /* no cache dir yet */ }
    return removed;
  }

  return { dir, maxAgeDays, pathFor, read, write, has, prune };
}

module.exports = { createResponseCache, DEFAULT_DIR };
