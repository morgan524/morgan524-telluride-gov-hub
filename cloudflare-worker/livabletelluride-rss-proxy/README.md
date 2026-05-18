# livabletelluride-rss-proxy

A small Cloudflare Worker that proxies a fixed allow-list of RSS / news
feeds for the Telluride Gov Hub `content-refresh` GitHub Action.

## Live URL
https://livabletelluride-rss-proxy.morgan-8f0.workers.dev

## Account
Morgan@brieflink.ai's Account — ID: 8f020e73de4e9956f0e3ad7dce070ef4

## Why it exists

The Action's content-refresh job got blocked at the IP layer when it scraped
news feeds directly from GitHub-hosted runners:

| Source                | What happens from GitHub runner | What happens from CF Worker |
| --------------------- | ------------------------------- | --------------------------- |
| Telluride Times       | HTTP 429 (rate-limit by IP)     | HTTP 200, full RSS          |
| KOTO Community Radio  | HTTP 403 (Cloudflare bot mode)  | HTTP 200, full RSS          |
| San Miguel County     | HTTP 200                        | HTTP 200                    |
| Town of Telluride     | DNS ENOTFOUND on runner         | Resolves fine               |

Tweaking the User-Agent didn't help — the blocking is by IP and TLS
fingerprint, not UA. Workers have CF's own egress, which both origins treat
as legitimate residential traffic.

## Endpoints

- `GET /health` → `{ "ok": true, "version": "...", "allowed": [...] }`
- `GET /proxy?url=<encoded URL>` → 200 + origin body. Returns 403 if the URL
  isn't on the allow-list (see `ALLOWED_HOSTS` in `worker.js`).

Optional shared secret: set `PROXY_KEY` as a Worker secret (`wrangler secret
put PROXY_KEY`). When set, callers must include `?key=<value>` or send
`X-Proxy-Key: <value>` as a header.

## Deploy

```bash
cd cloudflare-worker/livabletelluride-rss-proxy
wrangler deploy
# (optional) wrangler secret put PROXY_KEY
```

Or via REST API (see CLAUDE.md for the curl command using a Cloudflare API
token).

## Adding a new host to the allow-list

1. Add the hostname to `ALLOWED_HOSTS` in `worker.js`
2. Add it to `PROXY_HOSTS` in `scripts/content-refresh.js` (must stay in sync)
3. `wrangler deploy` to push the updated worker
4. Commit both files

## Wiring it into the GitHub Action

In `scripts/content-refresh.js`, the `maybeProxy(url)` helper routes any
fetch to a known-blocked host through this Worker. The `RSS_PROXY_URL`
GitHub Actions secret holds the base URL so it isn't hardcoded in the
script. The pre-flight `/health` check at the start of every content-refresh
run also verifies the Worker is reachable AND that its `ALLOWED_HOSTS` is in
sync with the script's `PROXY_HOSTS`; either failure aborts the run with a
deploy-instruction error.

## Secrets

- `PROXY_KEY` (optional env var) — shared secret for auth. Not currently set.
