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
