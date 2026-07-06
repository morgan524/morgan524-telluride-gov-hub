# Plan: migrate bot-managed data from JS-source-rewriting to JSON

**Status: PHASE 1 STARTED (2026-07-05).** Decision made: **JSON-in-repo** (not
Firestore) for bot-produced reference data; Firestore stays for user-generated /
real-time (Hub-Bub, submissions). This is a structural change that affects how
every browser page loads data — executed one array at a time with a rollback at
each step. Do **not** big-bang it.

**Phase 1 dual-write is LIVE for the `BLOG_POSTS` pilot:** the bot now writes
`data/blog-posts.json` alongside the JS literal (`scripts/lib/json-mirror.js` +
the hook in `content-refresh.js`), `scripts/mirror-json.js` seeds/re-syncs, and
`scripts/test/json-mirror.test.js` (CI) asserts the JSON equals the JS literal —
verified it catches a tampered mirror and that `mirror-json.js` fixes it. NO
client reads the JSON yet (zero browser change). Reversible: drop `BLOG_POSTS`
from `MIRROR_ARRAYS`. Next: add more arrays to `MIRROR_ARRAYS`, watch, then begin
flipping readers (each flip proven via the parity harness).

## Why

`js/gov-helpers.js` is bot-managed data stored as JS `const` literals. The bot
reads/writes it by manipulating the file as a **string** (`extractJsArray` /
`replaceJsValue` / `serializeArray`). That string-rewriting is the root cause of
a whole bug class — the `endDate:"undefined"` incident, and the historical
parity-sync disaster. `JSON.parse`/`JSON.stringify` literally cannot emit
`"undefined"` or an unbalanced bracket.

**Risk already reduced:** as of 2026-06-22 both sides of the string path are pure,
unit-tested libs (`lib/serialize.js`, `lib/extract.js`) with round-trip tests,
and a write-time validator quarantines malformed records. So the status quo is
much safer than it was — this migration is now an *improvement*, not a fire.

## Current architecture (what the migration must preserve)

- Every HTML page loads `gov-data.js` + `gov-helpers.js` as **synchronous
  `<script>` globals**; render code reads globals (`COMMUNITY_EVENTS`, …)
  synchronously at load. **This is the hard part** — JSON is fetched async, so
  the render must wait for it.
- The bot (`content-refresh.js` + friends) reads each array via
  `extractJsArray(govHubSrc, NAME)`, merges, and writes via
  `replaceJsValue(...)`.
- `?v=` cache-busters + the service worker (`sw.js` `CACHE_NAME`) gate freshness.

## Phased plan (each phase is independently shippable + reversible)

**Phase 1 — Bot dual-writes (no client change).** Pick ONE low-traffic array as
the pilot (e.g. `BLOG_POSTS` or a news array). Have the bot write
`data/<name>.json` alongside the existing JS literal. Add a CI check that the
JSON equals the JS literal (reuse `lib/extract.js`). Ship. Watch for a few days.
Reversible: stop writing the JSON file.

**Phase 2 — Client loader with fallback.** Add `js/data-loader.js`:
`await loadData()` fetches the migrated `data/*.json` (cache-busted) and assigns
the same global names, **falling back to the JS-embedded globals** if the fetch
fails. Gate the relevant tab's render behind `await loadData()`. Pilot on one
page. Reversible: the fallback means removing the loader restores old behavior.

**Phase 3 — Migrate array by array.** Move each array to JSON + its consumers to
the loader. Once an array has no JS-literal consumer, stop emitting the literal
for it (bot writes only JSON; reads switch to `JSON.parse`). One array per PR,
each verified in a real browser (Events, Local News, Gov-Hub, Housing tabs).

**Phase 4 — Retire the string path.** When all bot arrays are JSON,
`gov-helpers.js` holds only helper *functions*; `replaceJsValue`/`serializeArray`
are retired for data (kept only if still used for config). `sanitizeRecords` /
`validateRecords` move to run on the JSON write.

## Testing / safety at each step

- Extend `scripts/test/load-data.test.js` to also parse the JSON files and
  assert they match (no `"undefined"`, valid dates, etc.) — `test.yml` then
  guards every bot data commit.
- Keep `sanitizeRecords` + `validateRecords` in the JSON write path.
- Browser smoke-test the affected tab in incognito before each merge.
- Rollback: `git revert` the phase commit; the bot regenerates data next run.

## Effort

Phase 1: ~half a day. Phases 2–4: a few days, dominated by per-tab browser
verification. Total: a dedicated multi-session effort — not an inline task.
