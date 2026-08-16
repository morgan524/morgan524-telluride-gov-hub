# Operations reference

_Split out of CLAUDE.md 2026-06-22. Manual ops cheat sheet, the other GH workflows, daily liveness checks, Cloudflare account context, project email addresses, the telluride.gov domain note, and known loose ends._

## Domain note (fixed 2026-04-30)

Replaced 14 references to the dead domain `telluride-co.gov` with
`telluride.gov` across `scripts/content-refresh.js` (RSS URLs that had
been failing every run), `index.html`, `js/gov-helpers.js` (housing
contact emails), `js/corrections.js`, `the-growing-weight-of-tellurides-debt/index.html`,
and `telluride-gov-hub.html`. **Do NOT touch `telluride-co.civicweb.net`** —
that's a real, separate domain hosting Telluride's CivicWeb agenda
portal. Confirmed working 2026-04-30: `https://telluride.gov/` returns
200; `https://telluride-co.gov/` returns DNS NXDOMAIN.

## Other workflows in the same repo

## Liveness checks — `scripts/maintenance.js` (daily, ~2026-05-14)

The daily maintenance run now does three liveness probes against the
off-machine pipeline to catch silent failures that wouldn't show up as a
workflow failure on their own:

1. **`feed.xml` freshness** — fetches `https://livabletelluride.org/feed.xml`,
   parses `<lastBuildDate>`. Flags if it's older than 12 hours (suggests
   `content-refresh.yml` stopped running or `build-rss-feed.js` regressed).

2. **Event Sheet CSV reachability** — fetches the `sheetCsvUrl` from
   `email-events-config.json`. Flags if it returns non-200, or returns 200
   but with the wrong header row (Google Sheets publish-to-web sometimes
   serves HTML for the wrong tab even though the URL still resolves).

3. **Mailchimp digest campaigns** — opt-in via `MAILCHIMP_API_KEY` secret.
   Calls `GET /3.0/campaigns?status=sent&type=rss`. Flags if no RSS-driven
   campaign has been sent in the last 48 hours (suggests the campaign was
   paused, deleted, or the feed URL was changed). When the secret isn't
   set, the check logs `ℹ` and skips — no failure.

   To turn on: create a Mailchimp API key at
   `https://us15.admin.mailchimp.com/account/api/`, then add it as a
   GitHub Actions secret named `MAILCHIMP_API_KEY`. No other config
   needed — `maintenance.yml` already passes it through to the script
   when present.

Each check pushes a human-readable description to `maintenance-issues.log`
on failure (does NOT fail the workflow — they're advisory). The existing
"Report issues" step surfaces the file as a `::warning::` annotation on
the workflow run.

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
- **Find what last touched js/gov-helpers.js:**
  `git log -1 --pretty=fuller -- js/gov-helpers.js` from the repo.

## Cloudflare account context

- Account: **Morgan@brieflink.ai's Account**
- Account ID: `8f020e73de4e9956f0e3ad7dce070ef4`
- Workers in this account (as of 2026-04-30): `brieflink-jobs`,
  `brieflink-stripe-worker`, `brieflink-worker`,
  `hyper2-courtlistener-proxy`, `livabletelluride-rss-proxy`.
  Don't confuse the brieflink-* workers with this project — they belong to
  a separate product (BriefLink legal-citation tooling).

## Site traffic / usage stats

**Cloudflare Web Analytics** is the only record of who visits the site — the
site is on GitHub Pages, so there are no server logs. The beacon (site tag
`6500d02421bc4da1bebfad6099e6027c`) reaches every page two ways: `site.js`
(~line 150) injects it on the 29 pages that load `site.js`, and a hardcoded
`<script>` tag covers the older standalone pages (privacy-policy, terms-of-use,
profile, data-deletion, community-guidelines, source-document, and the 14
`Blog Posts/*/index.html`).

Read it either way:

- **Dashboard** — Cloudflare → Analytics & Logs → Web Analytics.
- **`scripts/analytics-report.js`** — prints visits, pageviews, top pages,
  referrers, countries, devices, and a weekly trend. Run it through the
  **Analytics Report** workflow (Actions → Analytics Report → Run workflow),
  which needs repo secret `CF_ANALYTICS_TOKEN` (Cloudflare token scoped
  Account → Account Analytics → **Read**). Numbers land in the run's job
  summary. `--sites` verifies the token and lists site tags; `--introspect`
  dumps the live GraphQL schema.

Note: `api.cloudflare.com` is **blocked by the Claude Code sandbox's egress
policy**, so this cannot be run from a Claude session — use the workflow (or a
local shell with `CF_API_TOKEN` set).

Two things to know before interpreting any of it:

1. **Tracking began 2026-06-14** (commit `895acac`). Nothing exists before it.
2. **The redesign cutover (2026-07-22, commit `0e7e033`) deleted 18 legacy
   pages.** Per-path figures spanning that date show old URLs dying and new
   ones starting at zero — an inventory change, not a traffic change. Totals
   compare cleanly across it; paths do not.

The beacon is client-side JS, so it misses RSS/feed readers, digest email opens
(that's Mailchimp — see `docs/mailchimp.md`), and JS-blocked visitors. It also
largely excludes bots, which server logs would include. Treat it as a **floor on
human reach**. Still uninstrumented: `voodoo-timeline/index.html` and the two
`assets/Housing Study/` calculators.

## Email addresses on the project

The `livabletelluride.org` domain has three role addresses, each with a
different job. Easy to mix them up — keep them straight:

| Address                          | Role                                       | Where it appears                                                                                          |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `info@livabletelluride.org`      | Main public contact + Hub-Bub admin identity | 14 places: contact links across the site, corrections form, event-submission backup, Mailchimp signup wrap-up, **hardcoded admin check in `js/hub-bub.js` and `js/gov-helpers.js` (`user.email === 'info@livabletelluride.org'`)**, and the destination for Apps-Script confirmation emails. If you log into Hub-Bub / Firebase Auth as this address, the UI grants moderator privileges. |
| `bot@livabletelluride.org`       | Git commit author for automated workflows  | All four GH Actions workflows set `git config user.email "bot@livabletelluride.org"` so commits are attributed to "Gov Hub Bot". Nothing reads mail here; it's just an identity string. |
| `events@livabletelluride.org`    | Inbox for the email-to-events pipeline     | Only used by the Apps Script + Google Sheet flow described below. Treat it as a service inbox, not a contact. |

If you spin up a fourth alias (e.g. for a new project), add it to this table
and grep the codebase for any place that needs to know about it.

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
- **Site cache busters — auto-bumped by content-refresh.js** (as of
  2026-05-14). The `bumpCacheBusters()` function at the end of
  `scripts/content-refresh.js` updates the `?v=...` query string on
  `js/gov-helpers.js`, `js/gov-data.js`, `js/corrections.js`,
  `js/legal-standalone.js`, and `css/site.css` whenever the refresh
  produced any change. It also bumps `CACHE_NAME` in `sw.js` so the
  Service Worker invalidates its pre-cached shell. Both keys are derived
  from the same UTC timestamp (`YYYY-MM-DD-HHMM`) so they always agree.
  When making manual edits to those assets between scheduled refreshes,
  you can still bump the `?v=` strings yourself; the next bot run will
  overwrite with its own stamp.

  If you add a NEW versioned asset to `index.html`, also append its path
  to the `assetPaths` array inside `bumpCacheBusters()`, and seed it with
  any `?v=initial` value (the regex only matches assets that already have
  a `?v=`).
