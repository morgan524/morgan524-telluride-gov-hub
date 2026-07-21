# Redesign architecture — backend & process

How the rebuilt site (in `redesign/`, cutting over to root) works under the
hood: what changed, what deliberately didn't, and how to make changes
day-to-day. Written 2026-07-20, at the end of Phase 3.

Companions: `page-inventory.md` (per-page map + rebuild order),
`../json-data-migration-plan.md` (the JS→JSON migration this rides on).

## The data flow

```
  scrapers & bots (UNCHANGED)                 every 6h / daily
  content-refresh.js · housing-refresh.js · maintenance.js
        │
        ▼
  js/gov-helpers.js + js/gov-data.js          ← still the bot's write target (until Phase 6)
        │  json-mirror hook (every run, CI-verified identical)
        ▼
  data/*.json  ←──────────────── THE CONTRACT ────────────────┐
   ├─ raw mirrors (telluride-times-articles, legal-notices…)  │  CI: json-mirror.test.js
   ├─ config mirrors (land-use-issues, local-orgs,            │      (JSON ≡ JS literal)
   │   gondola-data, deep-dive-pages, housing-listings)       │  CI: json-contract.test.js
   └─ PRECOMPUTED INDEXES — the new layer:                    │      (shape, min-counts,
       week-meetings.json  (13 meeting sources, summaries,    │       no "undefined"/"NaN"
       events-index.json    zoom, comment emails, town pins,  │       string values)
                            dedup, filters, fallback images)  │
        ▼                                                     │
  GitHub Pages serves everything statically                   │
        ▼                                                     │
  pages: fetch JSON via js/lt-data.js (LTData) → render ──────┘
  (site.js = ONE nav/footer · lt.css = ONE design system)
```

## What changed, structurally

| Old | New |
|---|---|
| Every page loads 500KB+ of JS globals (gov-data + gov-helpers) | Pages fetch only the small JSON files they need |
| Heuristics (dedup, town-pinning, filters, categorizers) run in every browser, duplicated per page | Run **once, in the pipeline**, in testable Node scripts (`scripts/build-events-index.js`, `scripts/build-week-meetings.js`) |
| Silent fallbacks (`typeof X !== 'undefined'`) hide breakage | **Loud failures** — `LTData.showError` renders a visible error card + console.error; no silent empty renders |
| Nav/footer hand-copied across ~20 pages (drift class) | One `redesign/site.js` (nav + footer + Español/Log In), one `redesign/lt.css` (all design tokens + components) |
| Breakage discovered by users | Two CI gates on every push: mirrors ≡ JS, and every data file matches its shape contract |
| events.html = 1,777 inline lines; gov-hub = 890 | ~170 and ~150 — skeleton + one render function each |

## What deliberately did NOT change

The entire bot/infrastructure layer — the plan's core rule is that the risky,
recently-stabilized machinery keeps running exactly as-is:

- Cloudflare Workers (RSS proxy, digest, moderation, profile-update)
- All GitHub Actions workflows (content-refresh, maintenance, digest, reviews)
- The digest/email pipeline (weekly-email.js, Review Desk, Customer.io)
- Firestore + Hub-Bub auth and submissions
- GitHub Pages hosting (no framework, no build step — plain HTML/CSS/JS)

The JSON layer sits *between* the bots and the pages, isolating each side from
the other: a bot bug can't take a page down past its last-good mirror, and a
page rewrite can't touch the pipeline.

## Day-to-day process

- **Bot data** (news, events, meetings, notices, animals): nothing to do —
  flows into the mirrors + indexes automatically every 6 hours.
- **Hand-edited config** (`LOCAL_ORGS`, `LAND_USE_ISSUES`, festivals, zoom
  links): edit `js/gov-data.js` as always, then `node scripts/mirror-json.js`
  and commit both. Forget the second step → the json-mirror CI test fails with
  instructions (and content-refresh self-heals the mirror within ~6h).
- **Design change**: edit `lt.css` (tokens/components) or `site.js`
  (nav/footer) once — every page updates.
- **Page change**: each page is one small self-contained HTML file.
- **New data need**: prefer extending a pipeline builder (so pages stay dumb);
  add/adjust the contract in `scripts/test/json-contract.test.js` in the same
  commit — the contracts are what pages are allowed to assume.

## Standing rules (from page-inventory.md)

1. Pages fetch `data/*.json` via LTData — never the JS globals, never silent
   fallbacks.
2. Nav + footer live only in `site.js` (placeholder divs + a plain `<script>`
   tag AFTER both placeholders — the DCL-race rule).
3. Heuristics live in the pipeline unless they are pure render concerns.
4. Calendar dates are America/Denver-anchored (`LTData.mtDateKey`, never
   `toISOString().slice(0,10)`).
5. Every shipped page gets a side-by-side parity check + review-page.js pass
   before its old version is deleted.

## The endgame (migration Phase 6 — after cutover settles)

Once the old pages are deleted, nothing reads the JS globals. Then, one array
at a time, the mirrored literals get deleted from gov-helpers.js/gov-data.js
and the bots' writers point at the JSON directly. That permanently kills the
string-rewriting-JS-source bug class (the July 2026 outage category), and
gov-helpers.js shrinks from ~8,500 lines to a small helper library.

**Honest caveat until then:** the bot still writes JS literals and mirrors
them, so the two-file complexity still exists under the hood — it's just no
longer load-bearing for the site. The order is deliberate: pages first
(visible win, low risk), writer-flip last (highest risk, done when everything
else is proven).

## Deep-dive ⇄ Gov-Hub watch system (added 2026-07-20)

`scripts/build-deep-dive-watch.js` (runs at the end of content-refresh, after
build-week-meetings) cross-references every deep-dive topic against the
gov-hub pipeline and writes `data/deep-dive-watch.json`:

- **upcoming** — this week's meetings whose title/summary/hook match the
  topic's keywords → rendered by redesign/deep-dive.js as the live
  "On upcoming agendas" sidebar (hand-curated `issue.meetings` is now only a
  fallback when there are no live matches)
- **recent** — past-14-day meeting summaries mentioning the topic →
  "Recently in meetings" sidebar card
- **developments** — DEEP_DIVE_UPDATES entries (the Haiku news-triage in
  deep-dive-refresh.js; its missing target const was seeded 2026-07-20 and
  mirrored to data/deep-dive-updates.json)
- **stale** — flags when a watched meeting happened AFTER the topic's
  `lastUpdated` stamp in gov-data.js, or a `future:true` timeline entry's
  date has passed → surfaced in maintenance.js's daily findings issue
  (reviewDeepDiveStale)

Keywords live in deep-dive-refresh.js TOPICS (single map, both consumers);
WATCH_OVERRIDES in the builder tightens them for deterministic matching
('.*' clamped to within-sentence; society/gondola get narrower phrases; the
code topic is limited to telluride+county sources). **When hand-editing a
deep-dive topic, bump its `lastUpdated`** — that's what silences its stale
flag.

## Cutover checklist (Phase 4 — pending)

- ~~Re-shell zoning-map + projects-map~~ DONE 2026-07-20: staged copies at
  `redesign/zoning-map/index.html` + `redesign/projects-map/index.html` reuse
  the live apps' css/js/data via root-absolute paths (zoning map's inline
  module resolves `DATA_BASE = /zoning-map/`); `<body data-no-footer>` skips
  the footer on full-viewport apps. At cutover each staged copy replaces the
  live `index.html` in place — the app folders themselves never move.
  `site.js` now computes a ROOT mount prefix from location.pathname
  ('/redesign/' staged, '/' at root) so one file serves nested pages too.
- ~~Re-shell Hub-Bub~~ DONE 2026-07-21: `redesign/hub-bub.html` — old topnav +
  translate/hamburger JS stripped, shared shell injected, page's live
  Firebase auth widget (#hbTopnavAuth) relocated to a slim strip under the
  nav (site.js's static Log In pill hidden on this page via
  `.lt-pill-login{display:none}`); app js/css/data load root-absolute from
  the live site. site.js: Hub-Bub built:true, LOGIN_HREF = ROOT+'hub-bub.html'.
  NOTE: the embedded preview pane blanks desktop screenshots of this page
  when scrolled (mobile fine, DOM/hit-testing fine, all other pages fine) —
  believed to be a pane compositor quirk; confirm scrolling visually in a
  real desktop browser on staging.
- ~~Cloudflare Web Analytics~~ DONE 2026-07-20: site.js injects the beacon on
  every page (http/https only), same token as the live site
- Firestore approved-orgs merge on local-orgs.html
- Parity review: review-page.js against every page, old vs new
- Move `redesign/*` to root in one commit (URLs already match); keep old pages
  renamed `*-legacy.html` for ~1 week
- Remove the `noindex` meta from every page (including both map copies)
- Retire (or CACHE_NAME-bump) the service worker
- Retarget maintenance.js reviewNav() to the placeholder+site.js pattern
- Point the digest's links/UTMs nowhere new — URLs are unchanged by design
