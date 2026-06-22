# Events tab — sources, dedup & sort

_Split out of CLAUDE.md 2026-06-22. KOTO calendar, Wilkinson, cross-source dedup, per-group logos, and the within-day source-mixing sort. (Mountain Village event scraping is also covered in the mv-calendar-wrong-dates memory note.)_

## KOTO Community Calendar — events on the Events tab

Live at /#tab-news (the "Events" tab). Source of truth is the WordPress
Tribe Events JSON API for the community-calendar category:

```
https://koto.org/wp-json/tribe/events/v1/events/?categories=community-calendar
```

`scripts/content-refresh.js` Task 8 (`syncKotoCommunityEvents`) hits
this API every 6 hours via the Cloudflare Worker proxy, filters to
events whose `start_date` is within the next 7 days (or still
in-progress now), and writes a normalized `KOTO_COMMUNITY_EVENTS`
array into `js/gov-helpers.js`. Each entry:

```js
{ title, link, description, pubDate (ISO string), source: 'koto',
  sourceLabel: 'KOTO', category: 'Community Event', location, imageUrl }
```

`fetchKOTONews()` in `js/gov-helpers.js` reads this server-curated array
first. It only falls back to the old client-side proxy-scrape path
(`CODETABS_PROXY` / `ALLORIGINS_PROXY`) if the const is empty —
which should only happen on a brand-new repo before the first
content-refresh run.

The 7-day window is a user-imposed cap: longer windows make the
events tab unwieldy (the Tribe API page returns 50 by default and
KOTO regularly has 30+ upcoming community events).

KOTO logo is wired automatically: events have `source: 'koto'`, so
`renderLogo('koto')` picks up `ENTITY_LOGOS['koto']` and renders it
on each card.

If KOTO ever migrates off WordPress / The Events Calendar plugin, the
JSON endpoint will change. Update `KOTO_TRIBE_API` in
`scripts/content-refresh.js` accordingly.

## Cross-source duplicate detection on the Events tab

Many events are listed by multiple sources: Wilkinson Library posts
its own events, KOTO often re-lists library and other community
events on its calendar, and the Telluride Times calendar lists
nearly everything. To avoid showing the same event 2-3 times, the
events merge step in `collectEvents()` (the function that builds
the Events tab data) does smart deduplication.

**Source priority (lowest number wins on a duplicate):**

| Priority | Source                                  |
| -------- | --------------------------------------- |
| 0        | Wilkinson Public Library (`wilkinson`)  |
| 1        | KOTO Community Calendar (`koto`)        |
| 2        | Local groups / Humane Society           |
| 3        | Telluride Times (`ttimes`)              |
| 4        | everything else                         |

Rationale: TT and KOTO often re-list events that originate at the
library or another organization. The original-source listing is
canonical (correct title, photo, location, status) and should win.

**Dedup key construction** — handles the ways different sources
phrase the same event:

1. Strip a trailing venue suffix that TT often appends, e.g.
   `Tea & Tarot: Wilkinson Public Library, 2:30-4:30 p.m.` →
   `Tea & Tarot`.
2. Strip a trailing time suffix like `, 1-3 p.m.` or `, 2:30-4:30 p.m.`.
3. Replace `&` with `and` so `Tea & Tarot` and `Tea and Tarot` match.
4. Lowercase, strip remaining punctuation, collapse whitespace.
5. Take the first 4 words. (Catches `Drop-In Tech Time` vs
   `Drop-In Tech Time with Oliver` — both yield `drop in tech time`.)
6. Append the ISO date so events with the same title on different
   days don't collapse.

**Implementation** is `eventSourcePriority()` and `eventDedupKey()`
inside the events-collect function in `js/gov-helpers.js`. The merged
array is sorted by `(date asc, priority asc)` BEFORE the
first-seen-wins filter, so the highest-priority source for each
duplicate set is the one that survives.

If you add a new event source in the future:

- Pick its priority slot in `eventSourcePriority()` (0 = canonical
  origin, 4 = re-listing aggregator).
- If its titles include venue suffixes that other sources don't
  mention, extend `eventDedupKey()`'s suffix-strip regex so the
  cross-source match still works.

## Per-group logos on Gov-Hub recurring meetings

`LOCAL_GROUP_SCHEDULES` entries (Rotary, Elks, TMVOA, etc.) can carry
a `logo: '/logo/<file>.png'` path. `generateLocalGroupMeetings()`
copies this onto each meeting record, and `renderLogo(source, item)`
prefers `item.logo` over the `ENTITY_LOGOS[source]` default. Without
a `logo` field, the card falls back to the generic `🤝` localgroup
placeholder.

To add a new branded local group:
1. `cp <file>.png /tmp/deploy/telluride/logo/`
2. Add `logo: '/logo/<file>.png'` to that group's `LOCAL_GROUP_SCHEDULES`
   entry in `js/gov-helpers.js`.

Already wired: `Telluride Rotary.png`, `Elks.png`, `TMVOA Logo.png`.

## Events tab card sort: mix sources within each day

`renderNews()` in `js/gov-helpers.js` sorts events with TWO passes
(both using the same logic, applied before and after the
`slice(0,50)` cap):

1. **Day bucket, ascending** — `Math.floor(pubDate / 86400000)` →
   today's events first, then tomorrow's, then the day after.
2. **Stable hash within each day** — `_evHash(title + '|' + source)` →
   pseudo-random ordering within a date that interleaves TT,
   Wilkinson, KOTO, and other sources instead of clustering by source.

The hash is deterministic (same input → same output every page load)
so cards don't shuffle on refresh. The two-pass structure exists
because there's a slice in the middle; without re-applying the same
sort after the slice, the result reverted to plain pubDate-ascending
which clobbered the mixing.

## KOTO Community Calendar — events on the Events tab

Live at /#tab-news. Source of truth is the Tribe Events JSON API:

```
https://koto.org/wp-json/tribe/events/v1/events/?categories=community-calendar
```

`scripts/content-refresh.js` Task 8 (`syncKotoCommunityEvents`) hits
this every 6h, filters to events whose `start_date` is within the
next 7 days (or still in-progress now), and writes a normalized
`KOTO_COMMUNITY_EVENTS` array into `js/gov-helpers.js`. Schema:

```js
{ title, link, description, pubDate (ISO), source: 'koto',
  sourceLabel: 'KOTO', category: 'Community Event', location, imageUrl }
```

`fetchKOTONews()` in `js/gov-helpers.js` reads this server-curated array
first; falls back to legacy client-side proxy-scrape only if the
const is empty.

## Wilkinson Public Library — events on the Events tab

Same pattern as KOTO. Source: telluridelibrary.libcal.com (LibCal
platform), api_events.php endpoint with `cid=19928&days=7`.

`scripts/content-refresh.js` Task 9 (`syncWilkinsonEvents`) parses
the HTML response (LibCal returns table-formatted HTML, not JSON),
fetches each event's detail page for the `og:image`, and writes
`WILKINSON_EVENTS` into `js/gov-helpers.js`. Filtered to next 7 days.
Schema same as KOTO above but with `source: 'wilkinson'`.

The HTML parser splits on `<table class="...s-lc-ea-tb...">` and
extracts the title, From/To times, location, and description rows.
HTML entities are decoded via `decodeHtmlEntities()` before storage.

`fetchWilkinsonEvents()` (sync function in `js/gov-helpers.js`, called
synchronously from the events-render path) reads the const directly.

If LibCal ever changes the api_events.php response format, update
`parseWilkinsonHtml()` in `scripts/content-refresh.js`.
