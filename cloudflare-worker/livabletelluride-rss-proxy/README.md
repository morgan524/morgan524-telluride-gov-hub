# livabletelluride-rss-proxy

A small Cloudflare Worker that proxies a fixed allow-list of RSS / news
feeds for the Telluride Gov Hub `content-refresh` GitHub Action.

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

The default URL after deploy is
`https://livabletelluride-rss-proxy.<your-subdomain>.workers.dev`. Use that as
the base URL in the GitHub Action's `scripts/content-refresh.js`.

## Wiring it into the GitHub Action

In `scripts/content-refresh.js`, replace direct `fetch(url)` calls for
news feeds with:

```js
const PROXY_BASE = process.env.RSS_PROXY_URL ||
  "https://livabletelluride-rss-proxy.<your-subdomain>.workers.dev";

function proxyUrl(target) {
  return `${PROXY_BASE}/proxy?url=${encodeURIComponent(target)}`;
}
```

and use `proxyUrl(...)` everywhere the script previously hit a non-Anthropic
host. The Action sets `RSS_PROXY_URL` (and optionally `RSS_PROXY_KEY`) as
secrets so the URL doesn't get hardcoded.
