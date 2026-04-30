# Telluride Gov Hub / Livable Telluride — Project Memory

This is the memory file Claude should read first when working on the
livabletelluride.org / Telluride Gov Hub project. It captures the deployed
architecture, the live URLs and secrets, the operational rhythm, and the
gotchas that have come up — so a fresh Claude session can be useful
immediately instead of rediscovering the system from scratch.

If anything below drifts from reality (we move a domain, swap providers,
restructure the script), update this file in the same commit.

---

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
   ├── js/gov-hub.js                (the data file that the live site loads)
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
                                       ▼  result merged into js/gov-hub.js
                                          and pushed by the workflow as
                                          "🔄 Content refresh YYYY-MM-DD HH:MM UTC"

   Live site: https://livabletelluride.org  (serves the latest gov-hub.js)
```

## Why the Cloudflare Worker exists

In April 2026 the news refresh stopped picking up new articles. Root cause
was that the GitHub Actions runner IPs are blocked by the news origins:

| Origin              | From GH runner            | From CF Worker         |
| ------------------- | ------------------------- | ---------------------- |
| Telluride Times     | HTTP 429 (rate-limit)     | HTTP 200, full RSS     |
| KOTO Community Radio| HTTP 403 (Cloudflare bot) | HTTP 200, full RSS     |

The blocking is by IP and TLS fingerprint, not User-Agent. Tweaking headers
will not fix it — verified empirically. The Worker fetches from CF's edge,
which both origins treat as legitimate residential traffic.

The Worker's URL is the value of `RSS_PROXY_URL` in the GitHub repo's Actions
secrets. As of this writing it's:

```
https://livabletelluride-rss-proxy.morgan-8f0.workers.dev
```

## Worker source of truth

Lives under `cloudflare-worker/livabletelluride-rss-proxy/` in this workspace:

- `worker.js`     — the actual Worker code (allow-list, /health, /proxy)
- `wrangler.toml` — wrangler config; account_id is hard-coded
- `README.md`     — deploy and wiring instructions

To redeploy:

```bash
cd cloudflare-worker/livabletelluride-rss-proxy
wrangler deploy
# or, via REST API with a CF token (Workers Scripts: Edit + Account Settings: Read):
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/8f020e73de4e9956f0e3ad7dce070ef4/workers/scripts/livabletelluride-rss-proxy" \
  -H "Authorization: Bearer <CF_TOKEN>" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2025-01-01"};type=application/json' \
  -F 'worker.js=@worker.js;type=application/javascript+module'
```

The CF token is **deploy-time only** — runtime never touches it. The Worker
keeps running indefinitely once deployed, with no expiring credentials.

## The news script — `scripts/content-refresh.js`

Five tasks per run (in order):

1. Meeting agenda summaries — Claude API call against agenda text
2. News articles — RSS scrape via the Worker proxy
3. Community Pulse — prune posts older than 5 days
4. Legal notices — prune notices past their `expires` date
5. Email events — Google Sheet CSV sync (if `email-events-config.json`
   contains a sheet URL)

Important behaviors:

- **`maybeProxy(url)`** routes any fetch to a known-blocked host through the
  Worker. Allow-list of proxyable hosts is hard-coded; matches the Worker's
  own allow-list. Hosts NOT in the set fetch direct.
- **Telluride Times feed:**
  `https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*&l=25&s=start_time&sd=desc`
- **KOTO feeds (split, not the catch-all `/feed/`):**
  - newscasts: `https://koto.org/news-category/newscasts/feed/`
  - featured:  `https://koto.org/news-category/featured-stories/feed/`
- **14-day cutoff:** `NEWS_MAX_AGE_DAYS = 14`. Anything older than 14 days is
  filtered out at fetch time. Don't be surprised when older items disappear
  from the live site — it's intentional pruning, not a bug. Adjust the
  constant if a section needs a longer window.
- **The "no diff, no commit" pattern:** if all five tasks run successfully
  but produce identical output to what's already in `js/gov-hub.js`, the
  workflow's "Commit and push" step is *skipped*. That's correct behavior,
  not a failure. Use `git log --grep "Content refresh"` and the per-run logs
  in GitHub Actions to debug.

## Common "news isn't refreshing" complaints — debug order

When somebody says "news on livabletelluride isn't updating," walk through
this list before changing anything:

1. **Confirm the workflow is firing.** Open
   <https://github.com/morgan524/morgan524-telluride-gov-hub/actions/workflows/content-refresh.yml>
   and check the run history. Every 6 hours; expect ~4 runs/day.
2. **Confirm runs are succeeding.** The "Run content refresh" step always
   succeeds (it has `continue-on-error: true`); the meaningful signal is
   whether "Commit and push" was *executed* or *skipped*. Skipped == no
   diff == probably the feeds returned identical content.
3. **Read the per-feed status logs.** In the run logs, lines like
   `[feed] Telluride Times HTTP 200 bytes=24615` tell you exactly what each
   origin returned. Anything other than 200, especially 429 or 403, means
   the proxy or origin is misbehaving.
4. **Check the Worker /health.**
   `curl https://livabletelluride-rss-proxy.morgan-8f0.workers.dev/health`
   should return `{"ok":true,...}` and the current allow-list. If 5xx or
   connection refused, the Worker has been deleted or paused.
5. **Sample a `/proxy?url=…` call.** From any non-blocked machine. If the
   Worker returns 200 but the runner doesn't get the same, the problem is
   the workflow's `RSS_PROXY_URL` secret (typo, deleted, etc.).
6. **Watch out for domain drift.** `telluride-co.gov` does NOT exist; the
   Town of Telluride is at `telluride.gov`. If you see DNS NXDOMAIN errors,
   somebody put the wrong host in `NEWS_FEEDS`. The KOTO main `/feed/` is
   not the right feed for newscasts — use the category archive feeds.

## Workspace vs. GitHub source of truth

**The GitHub repo is the source of truth.** The local workspace (this
folder) is mostly for reading and editing; the workflows deploy from
`origin/main`. As a result:

- `js/gov-hub.js` in the workspace is *frequently out of date* relative to
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

## Other workflows in the same repo

- `housing-refresh.yml` — daily housing listing refresh
- `maintenance.yml`     — daily site cleanup (stale articles, expired
                           legal notices, daily review markdown)
- `monthly-citation-audit.yml` — monthly Bluebook audit (BriefLink-related)
- `content-refresh.yml` — the main news/summary/pulse refresher (subject of
                           this memo)

If a runner-IP-block issue appears in housing-refresh.yml or any other
workflow, the Cloudflare Worker can be reused — just add the host to its
allow-list and route fetches through it the same way `content-refresh.js`
does.

## Manual operations cheat sheet

- **Trigger content-refresh now (instead of waiting for next cron):**
  Actions tab → Content Refresh → Run workflow → main → Run.
  Or via API with a token that has `repo` + `workflow` scopes:
  ```bash
  curl -X POST -H "Authorization: Bearer <GH_TOKEN>" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/morgan524/morgan524-telluride-gov-hub/actions/workflows/content-refresh.yml/dispatches \
    -d '{"ref":"main"}'
  ```
- **Add a host to the allow-list:** edit `cloudflare-worker/livabletelluride-rss-proxy/worker.js`
  (`ALLOWED_HOSTS`), edit `scripts/content-refresh.js` (`PROXY_HOSTS`),
  redeploy the Worker, push the script. Both lists must agree.
- **Rotate the Worker URL:** redeploy with a different script name, then
  update the `RSS_PROXY_URL` secret in the GitHub repo (Settings → Secrets
  and variables → Actions → RSS_PROXY_URL).
- **Find what last touched js/gov-hub.js:**
  `git log -1 --pretty=fuller -- js/gov-hub.js` from the repo.

## Cloudflare account context

- Account: **Morgan@brieflink.ai's Account**
- Account ID: `8f020e73de4e9956f0e3ad7dce070ef4`
- Workers in this account (as of 2026-04-30): `brieflink-jobs`,
  `brieflink-stripe-worker`, `brieflink-worker`,
  `hyper2-courtlistener-proxy`, `livabletelluride-rss-proxy`.
  Don't confuse the brieflink-* workers with this project — they belong to
  a separate product (BriefLink legal-citation tooling).

## Email subscriptions / Mailchimp daily digest

**Important architectural fact (easy to misread).** The site has a Mailchimp
signup form (`js/gov-hub.js` ~line 6357), but **no code anywhere in this
project sends digest emails**. There is no Firebase function, GH workflow,
or Cloudflare Worker that emails subscribers. The form is a vanilla
JSONP-embed signup — it just adds the email + frequency preference to
Mailchimp's audience and stops there.

Layout of the pieces:

| Component                    | Where it lives                                  | Owner          |
| ---------------------------- | ----------------------------------------------- | -------------- |
| Subscribe form (UI)          | `js/gov-hub.js` ~6357                            | This repo      |
| Mailchimp audience           | `letpeopledecide.us15.list-manage.com`, list `f83dc56387` | Mailchimp UI |
| Frequency preference         | merge field `MMERGE9` ("daily" / "weekly" / …)  | Mailchimp     |
| Topics & sources              | interest groups under category `7912`           | Mailchimp     |
| Source RSS feed for digests  | `https://livabletelluride.org/feed.xml`         | This repo     |
| Daily-send mechanism         | **Mailchimp "RSS-driven email" campaign**        | **Mailchimp UI — must be configured** |

The `feed.xml` half is automated:

- `scripts/build-rss-feed.js` reads `js/gov-hub.js` (TT articles, KOTO
  newscasts/features, legal notices) and emits `feed.xml` at the repo root.
- The content-refresh workflow runs it every 6 hours alongside the news scrape,
  so the feed is always fresh.
- 7-day window for news, max 30 items, max 8 legal notices.
- GUIDs are stable (`href` for news, synthetic title-hash for legal notices),
  so Mailchimp won't re-send the same item across daily campaigns.

**The other half — actually sending email — is one-time Mailchimp UI work**
that has to happen INSIDE the Mailchimp account at
`https://us15.admin.mailchimp.com/`. Steps (do these once; they keep running
forever):

1. Log in → **Campaigns → Create Campaign → Email → RSS-driven email**.
2. **RSS feed URL:** `https://livabletelluride.org/feed.xml`.
3. **Send schedule:** every day, at the time of day you want the digest to
   land. (Site updates land on the 6h cron, so any time after 12:30 UTC
   includes everything from the morning's refresh.)
4. **Audience:** "Livable Telluride" (audience ID `f83dc56387`).
5. **Segment:** if you want true daily-vs-weekly differentiation, segment by
   merge field `MMERGE9 == "daily"`, then make a second campaign for
   `MMERGE9 == "weekly"` with weekly cadence. Otherwise just send to the
   whole audience and ignore `MMERGE9`.
6. **Subject line:** Mailchimp lets you template with `*|RSSITEM:TITLE|*` and
   `*|RSSFEED:DATE|*` — e.g. `Livable Telluride — *|RSSFEED:DATE|*`.
7. **Confirm sender domain DKIM/SPF** in Mailchimp's domain settings — if
   livabletelluride.org isn't authenticated, deliveries hit spam.
8. **Send a test to your own address** before activating to catch any
   formatting / template issues.

### "I subscribed and got nothing" — debug order

1. **Confirm the user is actually in the Mailchimp audience.** Log into
   Mailchimp → Audience → search for the email. Status should be
   `Subscribed` (not `Pending`, not `Cleaned`, not `Unsubscribed`).
2. **If status is `Pending`**, double opt-in is on (default for Mailchimp).
   Either ask the user to click the confirmation link in their inbox/spam,
   or turn off double opt-in in Audience → Settings → Audience name and
   defaults (only do this if the form privacy policy already covers it).
3. **Confirm a daily campaign actually exists.** Campaigns tab → look for an
   active "RSS-driven email" pointing at livabletelluride.org/feed.xml.
   If there isn't one, that's the bug — set it up per the steps above.
4. **Check the campaign's recent send log.** If sends are failing, the most
   common causes are: feed unreachable (rare — see below), authenticated
   sender domain not set up, or recipient address bouncing.
5. **Confirm the feed itself is fresh and reachable.**
   `curl -I https://livabletelluride.org/feed.xml` should return 200 with
   `Content-Type: application/xml`. If the feed has a stale `lastBuildDate`,
   investigate the content-refresh workflow (see "Common 'news isn't refreshing'"
   above — same pipeline).
6. **Always check spam.** First-send open rates for any new sender domain
   are bad until DKIM/SPF/DMARC is in place; tell the user to whitelist the
   sender in Gmail/Outlook.

### Updating what goes into the digest

`scripts/build-rss-feed.js` is the one place to change the digest contents.
Knobs:

- `MAX_AGE_DAYS = 7` — content older than this is dropped from the feed.
- `MAX_ITEMS = 30` — feed cap.
- `MAX_LEGAL_NOTICES = 8` — never let legal notices push out news.

If you want meeting summaries / Hub-Bub posts / housing listings in the
digest, extend the `main()` builder to read those arrays from `js/gov-hub.js`
and produce more `buildXItems(...)` flatMaps. The pattern is the same as the
existing news/legal builders.

## Email addresses on the project

The `livabletelluride.org` domain has three role addresses, each with a
different job. Easy to mix them up — keep them straight:

| Address                          | Role                                       | Where it appears                                                                                          |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `info@livabletelluride.org`      | Main public contact + Hub-Bub admin identity | 14 places: contact links across the site, corrections form, event-submission backup, Mailchimp signup wrap-up, **hardcoded admin check in `js/hub-bub.js` and `js/gov-hub.js` (`user.email === 'info@livabletelluride.org'`)**, and the destination for Apps-Script confirmation emails. If you log into Hub-Bub / Firebase Auth as this address, the UI grants moderator privileges. |
| `bot@livabletelluride.org`       | Git commit author for automated workflows  | All four GH Actions workflows set `git config user.email "bot@livabletelluride.org"` so commits are attributed to "Gov Hub Bot". Nothing reads mail here; it's just an identity string. |
| `events@livabletelluride.org`    | Inbox for the email-to-events pipeline     | Only used by the Apps Script + Google Sheet flow described below. Treat it as a service inbox, not a contact. |

If you spin up a fourth alias (e.g. for a new project), add it to this table
and grep the codebase for any place that needs to know about it.

## Email-to-events ingestion pipeline

The site lets community members get events on the calendar without filing a
PR or using the form: forward an email about the event to
`events@livabletelluride.org` and the system parses + queues + publishes it.
This is structurally similar to the Mailchimp pipeline (a signup form on the
site, but the actual sending lives elsewhere) — the parsing and queueing
live INSIDE a Google account, not in this repo.

**Pipeline stages (data flows top-to-bottom):**

```
   1. Sender (you, a community member, an org)
        forwards an event email to:        events@livabletelluride.org
        │
        ▼
   2. Google Apps Script (deployed inside the events@ Gmail account)
        - polls 'is:unread -label:Processed' every 5 minutes
        - parses date/location/time/description with regexes
        - writes a row to the "Event Inbox" Google Sheet
        - applies a "Processed" Gmail label so each thread runs once
        - emails info@livabletelluride.org a receipt summary
        Source: scripts/../email-to-events-appscript.js (in this repo,
        but the deployed copy lives in the Gmail account's
        Extensions → Apps Script editor)
        │
        ▼
   3. Google Sheet "Event Inbox", published as CSV.
        URL stored in email-events-config.json (sheetCsvUrl).
        Headers: Status | Title | Date | EndDate | Location | Time |
        Description | SourceURL | SubmittedAt | EmailSubject | EmailFrom
        │
        ▼
   4. GH Actions content-refresh.yml — Task 5 (syncEmailEvents())
        - every 6 hours, fetches the CSV
        - parses rows, writes them to community-events.json at the repo root
        - bumps Status from "new" to "added" for items it picks up
        │
        ▼
   5. The site reads community-events.json and renders events on the
      Events tab. Each event displays date / location / description / link.

   6. (Round-trip) Apps Script's checkAddedEvents() polls the Sheet every
      10 minutes for rows whose Status = "added" and emails info@ a "now
      live on site" confirmation, then bumps Status to "notified".
```

**Important deployment fact:** the Apps Script in this repo is the *source
copy*. The actual running script lives inside the Gmail account at
`events@livabletelluride.org` — Extensions → Apps Script. If `EMAIL-EVENTS-SETUP.md`
hasn't been completed end-to-end (script pasted, `setupTrigger` run once,
auth granted), nothing happens at stage 2 even though stages 3-5 still pull
from an empty Sheet.

### "I forwarded an event and it never showed up" — debug order

Walk this in order; each step rules out one stage of the pipeline.

1. **Confirm the email actually arrived at events@.** Log into the Gmail
   account; check Inbox + Spam. If it's missing, the issue is upstream
   (sender's deliverability, Google's spam filter, etc.) — not on us.

2. **Confirm the Apps Script is deployed and running.** In the Gmail
   account: Extensions → Apps Script → check that `email-to-events-appscript.js`
   is present and `setupTrigger` was run. Triggers tab should show two:
   `processNewEmails` (every 5 min) and `checkAddedEvents` (every 10 min).
   If those don't exist, follow `EMAIL-EVENTS-SETUP.md` to install.

3. **Check the Apps Script's Execution log.** Apps Script editor → Executions
   tab. Look for recent `processNewEmails` runs and what they logged. The
   script verbose-logs whether it found unread threads, which subjects it
   processed, and which fields it parsed. If runs are failing, the error
   trace is here.

4. **Confirm the Sheet has a new row.** Open the "Event Inbox" Sheet. Each
   forwarded email should produce one row with Status=`new`. If the Apps
   Script ran but no row appeared, the parser bailed (rare).

5. **Confirm the published CSV is up to date.** Sometimes Google Sheets'
   "Publish to web" caches aggressively:
   `curl -sL '<sheetCsvUrl from email-events-config.json>' | head`.
   If the live CSV doesn't show your new row even though the Sheet does,
   re-publish (File → Share → Publish to web → Publish again).

6. **Confirm the GH Action picked it up.** Latest content-refresh run logs
   should show `Task 5: Syncing email events ... Found N events from sheet`
   and `Wrote N events to community-events.json`. If it logs `No events in
   sheet`, the CSV is empty — go back to step 5.

7. **Confirm the site is rendering it.** Hard-refresh livabletelluride.org
   (Cmd-Shift-R). If `community-events.json` was updated but the Events tab
   still doesn't show the event, the cache buster on `index.html`'s
   reference to gov-hub.js / community-events.json may need bumping.

### Current state baseline (as of 2026-04-30)

- `email-events-config.json` has `sheetCsvUrl` set; the URL responds 200
  with `Content-Type: text/csv` — publish is configured.
- The published Sheet currently has **0 data rows**. Every content-refresh
  run logs "No events in sheet". `community-events.json` was last touched
  on 2026-03-27 and only contains the hardcoded Telluride Balloon Festival
  entry.
- This means either no event emails have been forwarded yet (most likely),
  or the Apps Script half of the pipeline isn't actually deployed in the
  events@ Gmail account. Walk the debug order above to tell which.

### Operational notes for editing the pipeline

- **Editing the parser?** Update `email-to-events-appscript.js` here AND
  paste the updated copy into the Gmail account's Apps Script editor.
  Without the second step the live behavior doesn't change.
- **Changing Sheet shape?** Headers must match `appendToSheet()`'s order
  exactly (Status | Title | Date | EndDate | Location | Time | Description |
  SourceURL | SubmittedAt | EmailSubject | EmailFrom). Reordering breaks
  the CSV parsing in `scripts/content-refresh.js` Task 5.
- **Rotating the Sheet?** If the Sheet is replaced (new file, new URL),
  publish-to-web the new one and update `email-events-config.json` with
  the new `sheetCsvUrl`. No restart needed; the next 6h cron picks it up.

## Known loose ends

- **KOTO featured stories** publish less often than newscasts. If
  `KOTO_FEATURED_STORIES` is empty or has only one entry, that's usually
  KOTO's posting cadence, not a scraping bug. Confirm by hitting
  `/proxy?url=https://koto.org/news-category/featured-stories/feed/` and
  checking item dates.
- **Telluride Times article images** — RSS doesn't always include the
  `<enclosure>`. The script tolerates a missing `img`. If many cards on the
  live site render without thumbnails, look at whether the upstream RSS
  shape has changed.
- **Site cache busters** — when changing `js/gov-hub.js` or `css/site.css`,
  bump the `?v=` query string in `index.html` so browsers actually pick up
  the change. The bot does NOT bump cache busters automatically.
