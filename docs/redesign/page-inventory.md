# Redesign rebuild — per-page inventory (data reads + heuristics)

Generated 2026-07-20 by static analysis of every root `*.html` against the
top-level consts/functions of `js/gov-data.js` (GD) + `js/gov-helpers.js` (GH).
This is the working map for the page-by-page rebuild: what each page reads,
what already has a JSON mirror in `data/`, and which in-page heuristics need a
keep / move-to-pipeline / kill decision before that page is rebuilt.

**Companion docs:** `docs/json-data-migration-plan.md` (the JSON migration this
rebuild rides on — Phase 1 dual-write LIVE, Phase 2 first reader flipped),
`docs/redesign/` (this folder) for rebuild artifacts.

## The matrix

| page | loads GD/GH | inline JS lines | globals used | notes |
|---|---|---|---|---|
| events.html | Y/Y | 1,777 | 23 (22 mirrored) | Biggest, most heuristics — rebuild LAST |
| gov-hub.html | Y/Y | 890 | 9 (3 mirrored) | Meeting getters + zoom/passcode config |
| local-news.html | Y/Y | 717 | 9 (7 mirrored) | Categorizer + letter/obituary filters |
| hub-bub.html | Y/Y | 661 | **0** | Firestore-driven; data-file loads are pure waste |
| local-orgs.html | Y/– | 627 | 1 (0 mirrored) | LOCAL_ORGS (hand-edited config) |
| legal-notices.html | Y/Y | 541 | 2 (1 mirrored) | Geocode/nearby filter is self-contained |
| housing.html | Y/Y | 421 | 1 (0 mirrored) | HOUSING_LISTINGS not mirrored yet |
| deep-dive-*.html ×6 | Y/– | ~322 ea | 2 (0 mirrored) | All render LAND_USE_ISSUES[key]; shared template |
| index.html | Y/Y | 268 | 3 (3 mirrored) | Easy early flip |
| deep-dives.html | –/Y | 175 | 1 (mirrored) | **Already flipped** (fetches blog-posts.json; GH is fallback only) |
| about / donate / policy pages | –/– | ≤90 | 0 | Static; nav/footer share only |
| *-review.html, email-studio, profile, source-document | –/– | – | 0 | Admin tools — Worker/Firestore-backed, out of scope for the public rebuild |

52 JSON mirrors exist in `data/` today.

## Per-page detail (public content pages)

### events.html — 1,777 lines, 58 local functions
- **Data:** all 22 bot event arrays (ALL mirrored) + `TELLURIDE_FESTIVALS`
  (static config, no mirror) + `resolveEventImage` helper.
- **Heuristics inventory** (each needs keep/move/kill at rebuild time):
  - `EXCLUDED_EVENTS` title blocklist — duplicated in content-refresh.js (**move to pipeline**, single copy)
  - `townFor()` venue→town pinning (Sheridan/Ah Haa/Alibi/Depot ⇒ Telluride) (**move to pipeline** — precompute `town` on each event)
  - `isGovMeeting` / `isClosureNotice` / `isAttendanceNotice` filters (**move**)
  - `rcClassify`/`rcCadence`/recurring-band logic (Daily vs Recurring, multi-day = first-day-only) (**keep in page** — render concern)
  - `featuredScore`/`FEATURED_PINS`/`pickFeatured` hero card (**keep**, but pins could move to a JSON config)
  - `eventCoord`/`geoDist` proximity (uses js/events-proximity.js) (**keep**)
  - Cross-source dedup (**move to pipeline** — dedupe once at write time)
- **Rebuild note:** with dedup/filtering/town-pinning precomputed into the
  mirrors, the page drops to fetch → group by day → render.

### gov-hub.html — 890 lines
- **Data:** meeting getters (`getTellurideMeetings` etc. — these wrap the 11
  `*_CACHED_DATA` seeds, all mirrored), `MANUAL_SUMMARIES` +
  `MEETING_AGENDA_META` (mirrored), plus unmirrored config:
  `WHY_THIS_MATTERS`, `MEETING_ZOOM_LINKS`, `MEETING_PASSCODES`,
  `ENTITY_REMOTE`, `SCHOOL_ZOOM_LINK`, `MEETING_RECAPS` (bot data, no mirror).
- **Heuristics:** `emphasizeNames` bolding (shared w/ digest — make it a shared
  module), zoom-panel visibility rules (always-visible per memory), joint-meeting
  dedup, `meetingBoardToken` summary resolution (**keep** — but move into the
  shared loader so digest/site use one copy).
- **Rebuild blocker:** needs config mirrors (zoom links, passcodes, WHY_THIS_MATTERS)
  or a `data/config/gov-hub.json` export. `MEETING_RECAPS` needs a mirror.

### local-news.html — 717 lines
- **Data:** TT articles, KOTO newscasts, SMB Forum, LOCAL_NEWS_FEATURED,
  Humane Society animals, Alibi/Sheridan (for venue-announcement filtering) —
  all mirrored. Unmirrored: `ENTITY_LOGOS`, `GOV_MEETING_PATTERN` (config).
- **Heuristics:** `categorizeArticle` chips, `isLetterToEditor`, `isObituary`
  (never-feature-an-obituary rule), `isGovMeetingAnnouncement` /
  `isVenueEventAnnouncement` / `isStatewideOrNationalNews` → `shouldKeep`
  (**move to pipeline** — precompute `category`, `isLetter`, `isObituary`,
  `keep` flags at write time), Shelterluv status filter (already duplicated
  bot+page — **move**, single copy).

### local-orgs.html — 627 lines
- **Data:** `LOCAL_ORGS` only (hand-edited; no mirror). Firestore
  `org_submissions` (approved auto-render) — stays.
- **Rebuild blocker:** needs `LOCAL_ORGS` exported to JSON (config mirror).

### legal-notices.html — 541 lines
- **Data:** `LEGAL_NOTICES` (mirrored) + `LEGAL_ENTITY_LOGOS` (config, tiny).
- **Heuristics:** geocode + nearby filter (self-contained, **keep**);
  expiry flag formatting (**keep**).
- **Good first pilot page** — one mirrored array, small config, contained logic.

### housing.html — 421 lines
- **Data:** `HOUSING_LISTINGS` — **not mirrored yet** (written by
  housing-refresh.js, not content-refresh). Needs adding to the mirror set.

### deep-dive-*.html (6 template pages + deep-dives.html)
- **Data:** `LAND_USE_ISSUES[TOPIC_KEY]` + `GONDOLA_DATA` (hand-edited config).
- All six share ~identical template JS — **collapse to one template + one
  config JSON** (`land-use-issues.json`) at rebuild.
- deep-dives.html is already JSON-first (blog-posts.json) — the pattern to copy.

### index.html — 268 lines
- **Data:** COMMUNITY_EVENTS, KOTO_COMMUNITY_EVENTS, WILKINSON_EVENTS (all
  mirrored) for the week-ahead strip. Easy early flip.

### hub-bub.html — 661 lines
- **Loads both data files, uses NOTHING from them.** Drop the two script tags —
  an immediate no-risk perf win independent of the rebuild. All logic is
  Firebase/Firestore (out of scope for the data-layer rebuild).

## Gaps to close before/while pages flip (prep work)

1. **Missing bot-data mirrors:** `HOUSING_LISTINGS`, `MEETING_RECAPS`.
2. **Config exports** (hand-edited consts pages need as JSON):
   `LOCAL_ORGS`, `LAND_USE_ISSUES` (+`GONDOLA_DATA`), `TELLURIDE_FESTIVALS`,
   `WHY_THIS_MATTERS`, `MEETING_ZOOM_LINKS`/`MEETING_PASSCODES`/`SCHOOL_ZOOM_LINK`,
   `ENTITY_LOGOS`/`ENTITY_REMOTE`/`ENTITY_ADDRESS`, `LEGAL_ENTITY_LOGOS`,
   `SOURCE_SHORT_NAME`, `DEEP_DIVE_PAGES`, `KEY_ISSUE_TIERS`.
   (Plan doc deferred these "until the reader-flip" — that's now.)
3. **Contract checks in CI** so shape drift fails the build (see
   `scripts/test/json-contract.test.js`).
4. **Shared modules** for rebuilt pages: loud-failure JSON loader, MT-anchored
   date lib, `emphasizeNames`, card renderer (design-dependent — wait for design).

## Recommended rebuild order

1. **legal-notices** (pilot — small, one mirrored array)
2. **index** (3 mirrored arrays, high visibility, tiny)
3. **deep-dives + the 6 deep-dive pages** (one template + config JSON collapse)
4. **local-orgs**, **housing** (after their mirrors/exports exist)
5. **local-news** (after categorizer moves to pipeline)
6. **gov-hub** (after config exports + MEETING_RECAPS mirror)
7. **events** (after dedup/filters move to pipeline)
8. **hub-bub** — not a data-layer rebuild; just gets the new shell + drops the
   dead data-file loads (which can happen immediately).

## Standing rules for every rebuilt page

- Fetch `data/*.json` — never the JS globals. No `typeof X !== 'undefined'`
  silent fallbacks: failures render a visible error state + `console.error`.
- **Nav + footer live in shared files, never in the page** (Morgan, 2026-07-20).
  Pages contain only `<div id="lt-header"></div>` / `<div id="lt-footer"></div>`
  placeholders; the markup is defined once in the shared `site.js` (the
  redesign prototype's pattern) so an edit shows on every page. Rules that keep
  this safe:
  - Load `site.js` with a **plain `<script>` tag placed after both placeholder
    divs** (end of `<body>`). Never inject it dynamically without a
    `readyState` guard — the DCL-race footgun.
  - A nav/footer change ships to users only after the **`sw.js` `CACHE_NAME`
    bump** (the `/js/` path is stale-while-revalidate) — same rule as any
    hand-edited `/js/` file. Revisit if we retire the SW during the rebuild.
  - Give the tag a `?v=` cache-buster like other shared JS.
  - The daily nav review check (maintenance.js `reviewNav`) should assert the
    placeholders + site.js include instead of per-page link lists once pages
    flip.
- Shared date/esc helpers from `js/lt-data.js` — no per-page copies.
- Heuristics live in the pipeline (testable, run once) unless they're pure
  render concerns.
- Each shipped page gets added to the daily deterministic review + a
  review-page.js pass before the old file is deleted.
