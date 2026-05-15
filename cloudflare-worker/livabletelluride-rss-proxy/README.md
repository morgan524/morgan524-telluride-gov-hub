# livabletelluride-rss-proxy

Cloudflare Worker that proxies an allow-listed set of RSS/news feeds.
Used by the GitHub Actions content-refresh workflow to bypass IP blocks
on Telluride Times (HTTP 429) and KOTO (HTTP 403 Cloudflare bot-detect).

## Live URL
https://livabletelluride-rss-proxy.morgan-8f0.workers.dev

## Account
Morgan@brieflink.ai's Account — ID: 8f020e73de4e9956f0e3ad7dce070ef4

## Deploy
```bash
cd cloudflare-worker/livabletelluride-rss-proxy
wrangler deploy
```
Or via REST API (see CLAUDE.md for curl command).

## Adding a new host to the allow-list
1. Add the hostname to `ALLOWED_HOSTS` in `worker.js`
2. Add it to `PROXY_HOSTS` in `scripts/content-refresh.js` (must stay in sync)
3. `wrangler deploy` to push the updated worker
4. Commit both files

## Secrets
- `PROXY_KEY` (optional env var) — shared secret for auth. Not currently set.
