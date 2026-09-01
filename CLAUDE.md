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
| Events tab — KOTO calendar, Wilkinson, cross-source dedup, within-day sort, per-group logos, the weekly feed-less partner refresh (Beacon / Chamber Music / recurring-acts) | `docs/events-sources.md` |
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

## CRITICAL: never link to an agenda that doesn't exist

**Rule (Morgan, 2026-08-03), applies to every digest and every surface:** if no
agenda has been posted for a meeting, render **no link at all** — not a
fallback, not the jurisdiction's agenda index.

The old `scripts/weekly-email.js` fallback rendered `Meeting info →` pointing at
the body's agenda INDEX (e.g. `ouraycountyco.gov/AgendaCenter`) whenever no
agenda was found. The reader clicks expecting an agenda, lands on a listing, and
has to hunt. The card text already says the agenda is pending — that's the
honest thing to show.

An agenda URL is rejected in three cases (meeting-collect loop + the `mh` row
renderer in `scripts/weekly-email.js`):

1. **`agendaPending`** — the scraped summary already says the agenda "hasn't
   been posted yet" / "not available" / "not yet". **This wording beats any
   URL.** Telluride civicweb mints a `MeetingInformation.aspx?Id=NNNN` page for
   every scheduled meeting whether or not a packet is attached, so the URL looks
   meeting-specific while the page is an empty shell.
2. **`isGenericAgendaUrl()`** — the URL is an agenda *index*: a CivicPlus
   AgendaCenter, a bare `/agendas` or `/meetings` path, or a bare portal root
   with no path/query (San Miguel County emits
   `https://sanmiguelcoco.portal.civicclerk.com` for meetings whose packet
   isn't out yet).
3. **`agendaUnverified`** — no summary content at all (so no "pending" wording
   to catch) AND the URL isn't the document itself (`AGENDA_DOC_URL`: `.pdf`/
   `.doc`, or a `/files/`, `/documents/`, `/assets/` route). With no
   agenda-derived content there's no evidence a packet exists.

This is self-healing: links reappear automatically as agendas post, because the
digest re-renders daily from live data. **Do NOT hand-add agenda links to
compensate for an empty week.**

Audit with `node scripts/audit-meeting-summaries.js /tmp/gd.js /tmp/gh.js 21 45`
(fetch the live `js/gov-data.js` + `js/gov-helpers.js` first). It reuses these
same predicates so the audit and the email can never disagree — **if you change
the agenda logic here, mirror it in the audit script.**

### The other half: an agenda that exists but never got ingested

The three rejection cases above are the RENDER side, and they are correct — but
they are only ever as honest as the data. If the ingest misses an agenda that
was posted, the summary stays on its "hasn't been posted yet" stub, case 1 fires
on that wording, and the digest suppresses a link to a document that is sitting
right there on the portal. From the outside this is indistinguishable from a
county that hasn't posted yet, which is what made it take five days to notice.

So when a reader says "the agenda is up and the site says it isn't", check the
ingest before touching the render rules:

- **County (CivicClerk).** `countyAgendaFor()` in `scripts/content-refresh.js`
  resolves the agenda file for an event via `pickAgendaFile()`
  (`scripts/lib/civicclerk-events.js`). It used to be a bare
  `f.type === 'Agenda'` — an exact, case-sensitive match, duplicated in two
  places, silent when it missed. It now matches agenda-ish types and file names
  in descending order of confidence, logs the event's whole `publishedFiles`
  list when it still finds nothing, and falls back to
  `COUNTY_CIVICCLERK_AGENDA_FILES` in `gov-data.js` — a hand-VERIFIED
  `{civicClerkId: fileId}` map for agendas the API refuses to list at all. A
  real published file always wins over an override.
  **Widen the matcher before reaching for the map.** The 2026-08-31 miss (Sep 2
  BOCC, event 887, file 1980) presented as an API omission and was not: the
  file was listed the whole time, under a type the exact match didn't
  recognise. The run log tells you which it is — `no agenda file for event
  <id> — publishedFiles: …` prints `none` for a genuine omission and names the
  files otherwise.
- **Timing.** `MEETING_AGENDA_META`'s `ph` hash is the fingerprint of the
  summary inputs. If it hasn't changed across days of commits
  (`git log -S'"<source>|<date>|<title>":'`), the ingest never saw anything new
  — that is an ingest miss, not a slow AI pass.

`digest-refresh.yml` re-renders on every Content Refresh, so once the data is
right the link appears within minutes rather than at the next daily cron.

Note `MANUAL_SUMMARIES` and `MEETING_PREVIEWS` live in **`js/gov-helpers.js`**
(~lines 940 and 503), not `gov-data.js`. `AI_SUMMARIES` is Firestore-backed and
inlined ONLY on `gov-hub.html`, so it's empty in any node-side render.

## Featured organization rotation is week-anchored

`featuredOrgIndex()` (duplicated in `scripts/weekly-email.js` and
`local-orgs.html` — change one, change the other) snaps to the **Monday of the
week being rendered** and counts weeks from `Date.UTC(2026, 7, 3)`. It is NOT a
render-time index: `digest-refresh.yml` drafts the email days before it sends
and an approved digest freezes behind `digest/<key>.lock.json`, so a render-time
pick could advertise a different org than the site showed that week.

**The index is positional — reordering `FEATURED_ORGS` reshuffles the
schedule.** Append new orgs at the end unless you mean to change who runs when.
Re-run `node scripts/mirror-json.js` after any edit and commit both
`js/gov-data.js` and `data/featured-orgs.json`.

Every featured org needs a **.png or .jpg** logo — the digest silently drops
`.webp` (`emailUsableImg()`). Convert `.webp` sources and **preserve alpha**, so
the logo sits correctly on both the site band's white card and the email's cream
callout.
