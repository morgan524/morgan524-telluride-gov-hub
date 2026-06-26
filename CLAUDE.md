# Telluride Gov Hub / Livable Telluride — Project Memory

## JS file architecture (refactored 2026-05-18 — read this first)

Two JS data files. No more `data-only.js` or extract-data-only.js step:

  - **`js/gov-data.js`** — Static config + zoom data: CACHED_DATA arrays
    per source, MEETING_ZOOM_LINKS, MEETING_PASSCODES, SCHOOL_ZOOM_LINK,
    ENTITY_REMOTE, LOCAL_ORGS, ENTITY_LOGOS, LAND_USE_ISSUES,
    DEEP_DIVE_PAGES, TELLURIDE_FESTIVALS, QR_OPTIONS, etc.
  - **`js/gov-helpers.js`** — Bot-managed data + pure helper functions:
    MANUAL_SUMMARIES, TELLURIDE_TIMES_ARTICLES, KOTO_NEWSCASTS,
    KOTO_FEATURED_STORIES, BLOG_POSTS, COMMUNITY_EVENTS,
    KOTO_COMMUNITY_EVENTS, WILKINSON_EVENTS, HUMANE_SOCIETY_ANIMALS,
    LEGAL_NOTICES, HOUSING_LISTINGS, RIDGWAY_AGENDA_MAP, plus helpers
    (getMeetingSummary, getMeetingZoomLink, getMeetingPasscode,
    get*Meetings, localDate, truncate, isBadSummary). Used to be
    auto-generated as `data-only.js` from `gov-hub.js`; now it's the
    single source of truth.

Every HTML page loads `gov-data.js` + `gov-helpers.js`. **No page loads
`js/gov-hub.js` directly.** All bot scripts (`content-refresh.js`,
`maintenance.js`, `build-rss-feed.js`, `housing-refresh.js`,
`deep-dive-refresh.js`) read/write `gov-helpers.js` directly — no
extraction step.

`js/gov-hub.js` is **dead code** retained for git history. Don't edit it.

**To make an edit live:** edit `gov-data.js` (static config) OR
`gov-helpers.js` (bot data + helpers). Commit + push. GitHub Pages
serves it within ~1–2 min; cache-busters auto-bump every 10 min so
browsers refetch.

---

This is the project-memory Claude reads first for livabletelluride.org /
Telluride Gov Hub. It keeps only what's true every session: the data-file
architecture above, the source-of-truth rules, the critical
don't-break-this warnings, and an index into the detailed docs. **Subsystem
detail lives in `docs/` — read the relevant doc when a task touches that
area** (don't load them all up front).

If anything here or in `docs/` drifts from reality (a domain moves, a
provider changes, a script is restructured), update it in the same commit.

## Where the details live (`docs/`)

| Working on… | Read |
| ----------- | ---- |
| Cloudflare Worker proxy, content-refresh.js, TT/KOTO news scraping, "news isn't refreshing" | `docs/news-pipeline.md` |
| Local News tab — San Miguel Basin Forum, Humane Society animals, card overrides/filtering/logo alignment | `docs/local-news.md` |
| Events tab — KOTO calendar, Wilkinson, cross-source dedup, within-day sort, per-group logos | `docs/events-sources.md` |
| Mailchimp — two-subscription model, Subscribe form, blog-from-campaigns, feed.xml, RSS digest, "I got nothing" | `docs/mailchimp.md` |
| Email-to-events — events@ Gmail → Apps Script → Sheet → Task 5 pipeline + the 6 install gotchas | `docs/email-to-events.md` |
| Firestore rules, Hub-Bub auth, admin-email check | `docs/firestore-auth.md` |
| Daily content-correctness review — duplicate events, wrong/past/conflicting dates, broken links, AI semantic pass, "the content-review issue flagged X" | `docs/content-review.md` |
| Weekly infra/security/liveness review (dead-code guard, feed freshness, secret scan, Lighthouse) | `docs/weekly-review/PROTOCOL.md` |
| Planned migration of bot data from JS-source-rewriting to JSON files (phased, not started) | `docs/json-data-migration-plan.md` |
| Manual ops cheat sheet, other workflows, liveness checks, Cloudflare account, email addresses, domain note, loose ends | `docs/operations.md` |

Also in `~/.claude` memory (cross-session, auto-loaded): the Dropbox
canonical-path note, the weekly-email joint-meeting dedup, the
Mountain-Village-wrong-dates gotcha, and the Claude model-ID inventory
(every site that hardcodes a model + the retirement-preflight).

## Live system at a glance

```
                      every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
                                       │
                                       ▼
   GitHub repo: morgan524/morgan524-telluride-gov-hub  (public, default branch: main)
   ├── .github/workflows/content-refresh.yml
   │      └── runs scripts/content-refresh.js with secrets:
   │           - ANTHROPIC_API_KEY  (for meeting-summary generation)
   │           - RSS_PROXY_URL      (= the Cloudflare Worker URL below)
   ├── scripts/content-refresh.js   (the news/legal/pulse refresher)
   ├── js/gov-helpers.js                (the data file that the live site loads)
   ├── js/community-pulse.js
   └── … rest of the site
                                       │
                                       ▼  fetches blocked hosts via
                          ┌────────────────────────────┐
                          │  Cloudflare Worker proxy   │
                          │  livabletelluride-rss-proxy│
                          │  account: morgan@brieflink │
                          └────────────────────────────┘
                                       │
                                       ▼  Worker fetches RSS with a clean
                                          Safari UA from CF's edge
                          ┌──────────────────────────────────────┐
                          │  Telluride Times, KOTO, telluride.gov│
                          │  sanmiguelcountyco.gov,              │
                          │  telluride-co.civicweb.net, …        │
                          └──────────────────────────────────────┘
                                       │
                                       ▼  result merged into js/gov-helpers.js
                                          and pushed by the workflow as
                                          "🔄 Content refresh YYYY-MM-DD HH:MM UTC"

   Live site: https://livabletelluride.org  (serves the latest gov-hub.js)
```

## Workspace vs. GitHub source of truth

**The GitHub repo is the source of truth.** The local workspace (this
folder) is mostly for reading and editing; the workflows deploy from
`origin/main`. As a result:

- `js/gov-helpers.js` in the workspace is *frequently out of date* relative to
  the live site. The bot commits to GitHub many times a day; the workspace
  is only fresh after a manual `git pull` (we don't do that automatically).
- The site you see at livabletelluride.org reflects the latest `origin/main`,
  not the workspace.
- When asked "why doesn't my workspace look right?" — usually the answer is
  "your workspace is N days behind the bot's commits." Pulling from origin
  fixes it.

The local `repo/` subdirectory inside the workspace is a separate, very stale
clone of the same GitHub repo (only contains `index.html` from an early
single-file phase). Don't conflate the two; commits go to the actual repo
on GitHub, not into `repo/`.

**Canonical local path (2026-06-26):** the working copy lives in Dropbox at
`/Volumes/External/Dropbox (Personal)/Claude/Projects/Livable-Telluride2`
(quote the path — it has a space + parens). Its `.git/` and `scripts/node_modules/`
are marked `xattr -w com.dropbox.ignored 1` so Dropbox doesn't corrupt the
repo — keep that flag set on any new `node_modules`/`.git` here. The old
`~/Documents/Claude/...` workspace was **retired 2026-06-26** (the whole
`~/Documents/Claude` folder is being renamed/removed); don't look for it.
See the `work-in-dropbox-copy` memory note.

## CRITICAL: maintenance.js parity sync is one-way (index.html canonical)

`scripts/maintenance.js` Task 5 syncs `index.html` ↔ `telluride-gov-hub.html`.
**As of 2026-05-01 the sync is one-way: `index.html` → `telluride-gov-hub.html`.**

The OLD logic (pre-2026-05-01) was "copy the larger file over the smaller
one". That heuristic SILENTLY REVERTED any edit to `index.html` that made
the file smaller, because the maintenance bot ran every day at 12:00 UTC
and would copy the stale (larger, older) `telluride-gov-hub.html` BACK
over the new index.html. This destroyed:

- The 2026-04-30 form simplification (drop topic/source checkboxes,
  drop Monthly button) — restored to the pre-Round-1 form
- The 2026-04-30 Blog tab addition — entire nav button + tab-content
  div removed
- The cache buster bump on `js/gov-helpers.js` — reverted

**`telluride-gov-hub.html` was permanently deleted 2026-05-12.**
`index.html` is the only landing page. Do NOT recreate `telluride-gov-hub.html`.
All changes go to `index.html` only.
