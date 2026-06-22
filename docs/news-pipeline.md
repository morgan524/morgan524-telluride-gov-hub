# News pipeline — Cloudflare Worker, content-refresh.js, TT/KOTO

_Split out of CLAUDE.md 2026-06-22. Covers the proxy Worker, the content-refresh script, the mixed-source TELLURIDE_TIMES_ARTICLES gotcha, and the 'news isn't refreshing' runbook. Local News tab sources (SMBF, Humane Society) live in docs/local-news.md; Events tab sources in docs/events-sources.md._

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

Lives under `cloudflare-worker/livabletelluride-rss-proxy/` in this
workspace — now in version control (was previously dangling on disk
outside git, so a fresh clone couldn't redeploy from the repo):

- `worker.js`     — the actual Worker code (allow-list, /health, /proxy)
- `wrangler.toml` — wrangler config; account_id is hard-coded
- `README.md`     — deploy and wiring instructions

**Pre-flight health check (as of 2026-05-14):** `scripts/content-refresh.js`
calls the Worker's `/health` endpoint at the start of every run. Two things
get checked:

1. **Reachability** — if `RSS_PROXY_URL` is set but the Worker doesn't
   return HTTP 200, the script throws a fatal error with deploy
   instructions. The `if: failure()` step in `content-refresh.yml`
   then opens a tracked GitHub Issue automatically. Previously a deleted
   or paused Worker would silently produce an empty refresh and you'd
   only notice days later when the news section went stale.

2. **Allow-list drift** — `/health` returns the Worker's current
   `ALLOWED_HOSTS`. The script asserts that every host in its local
   `PROXY_HOSTS` is also on the Worker's list. If a host was added to
   `scripts/content-refresh.js` but never to `worker.js` (or vice
   versa), the script fails fast at startup. Previously this manifested
   as "one host mysteriously stopped working" weeks later.

When `RSS_PROXY_URL` is unset (local dev), the health check logs `ℹ`
and returns — no failure.

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
  Worker. Allow-list of proxyable hosts is hard-coded as the `PROXY_HOSTS`
  Set near the top of `scripts/content-refresh.js` (~line 84) and MUST stay
  in sync with the Worker's `ALLOWED_HOSTS`. The helper is wired into the
  custom `fetch(url, opts)` function so every outgoing request is routed
  transparently. Hosts NOT in the set fetch direct. Implemented
  2026-05-01 — before that the script fetched directly and TT scraping
  silently returned 0 articles every run.
- **Telluride Times feed:**
  `https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*&l=25&s=start_time&sd=desc`
- **KOTO feeds (split, not the catch-all `/feed/`):** the catch-all
  `https://koto.org/feed/` returns 0 items most of the time; the script
  uses two category-specific feeds via constants `KOTO_NEWSCASTS_RSS` and
  `KOTO_FEATURED_RSS`, scraped via a small `pullKotoFeed(url, bucket)`
  helper inside `refreshNews()`. (Pre-2026-05-01 the script used a single
  `KOTO_RSS = 'https://koto.org/feed/'`, which is why CLAUDE.md flagged
  the gotcha but the bug persisted; now fixed.)
  - newscasts: `https://koto.org/news-category/newscasts/feed/`
  - featured:  `https://koto.org/news-category/featured-stories/feed/`
- **14-day cutoff:** `NEWS_MAX_AGE_DAYS = 14`. Anything older than 14 days is
  filtered out at fetch time. Don't be surprised when older items disappear
  from the live site — it's intentional pruning, not a bug. Adjust the
  constant if a section needs a longer window.
- **The "no diff, no commit" pattern:** if all five tasks run successfully
  but produce identical output to what's already in `js/gov-helpers.js`, the
  workflow's "Commit and push" step is *skipped*. That's correct behavior,
  not a failure. Use `git log --grep "Content refresh"` and the per-run logs
  in GitHub Actions to debug.

## Gotcha: `TELLURIDE_TIMES_ARTICLES` is mixed-source despite the name

The const name is historical. The array holds two kinds of items:

- Actual Telluride Times articles (`source: 'Telluride Times'`) — pulled
  from the TT search RSS feed.
- Government news items (`source: 'Town of Telluride'`,
  `'San Miguel County'`, etc.) — pulled from each gov RSS feed in
  `NEWS_FEEDS` and then merged into the same array because they share
  the same rendering shape (title/source/date/copy/href).

If you ever see "no Telluride Times stories on the Local News tab" but
the array has entries, count items by `source` field, not by array
length. Confirmed 2026-05-01: when the maybeProxy fix landed, the array
went from 5 items (all gov news, 0 actual TT) to 31 items (25 actual TT
+ 6 gov news).

The two `KOTO_*` arrays are clean — `KOTO_NEWSCASTS` only contains
newscast posts and `KOTO_FEATURED_STORIES` only contains feature posts,
because the per-category RSS feeds segment them server-side.

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
