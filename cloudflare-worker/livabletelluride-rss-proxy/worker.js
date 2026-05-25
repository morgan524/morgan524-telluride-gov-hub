/**
 * livabletelluride-rss-proxy
 *
 * A small Cloudflare Worker that proxies a fixed allow-list of news / RSS
 * feeds. The Telluride Gov Hub's content-refresh GitHub Action gets blocked
 * at the IP level when it tries to scrape those feeds directly:
 *
 *   - Telluride Times    -> HTTP 429 (rate-limit on AWS/Azure egress IPs)
 *   - KOTO Community Radio -> HTTP 403 (Cloudflare bot-detection)
 *
 * Cloudflare Workers fetch from CF's edge with a clean residential-style
 * fingerprint, so they sail through both. The Action calls this worker
 * (e.g. /proxy?url=https%3A%2F%2Fwww.telluridenews.com%2Fsearch%2F...) and
 * gets the raw RSS/HTML back.
 *
 * Endpoints:
 *   GET /health          -> {"ok":true,"version":"…"}
 *   GET /proxy?url=…     -> 200 with origin's body (or 4xx if not allow-listed)
 *
 * Security:
 *   - Hard allow-list of host suffixes (extend ALLOWED_HOSTS as needed).
 *   - 60-second edge cache to be a good citizen toward the origins.
 *   - Optional shared-secret header (set X-RSS-PROXY-KEY in env) — if set,
 *     callers must send the same value as ?key= or as the X-Proxy-Key header.
 */

const VERSION = "1.0.0";

const ALLOWED_HOSTS = [
  "telluridenews.com",
  "www.telluridenews.com",
  "koto.org",
  "www.koto.org",
  "sanmiguelcountyco.gov",
  "www.sanmiguelcountyco.gov",
  "telluride.gov",
  "www.telluride.gov",
  "telluride-co.civicweb.net",
  "townofmountainvillage.com",
  "www.townofmountainvillage.com",
  "smarttelluride.colorado.gov",
  "www.tellurideschool.org",
  "ouraycountyco.gov",
  "www.ouraycountyco.gov",
  "www.norwoodtown.com",
  "townofridgway.colorado.gov",
  "www.townofridgway.colorado.gov",
  "events.ourayridgwayevents.com",
  // San Miguel Basin Forum (West End news) — Creative Circle CMS, same
  // as Telluride Times. Direct fetches from GH runners get 403/429.
  "sanmiguelbasinforum.com",
  "www.sanmiguelbasinforum.com",
];

// Realistic Safari UA that is known to clear both Telluride Times' rate-limit
// and Cloudflare's bot mode on koto.org.
const REAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function isAllowed(target) {
  let u;
  try {
    u = new URL(target);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

function authOk(request, url, env) {
  const need = env.PROXY_KEY || "";
  if (!need) return true; // no key configured -> open
  const got =
    url.searchParams.get("key") ||
    request.headers.get("x-proxy-key") ||
    "";
  return got === need;
}

async function handleProxy(request, url, env) {
  if (!authOk(request, url, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing url= query param", { status: 400 });
  }
  if (!isAllowed(target)) {
    return new Response(`Host not in allow-list: ${target}`, { status: 403 });
  }

  // Edge-cache for 60 seconds so we don't hammer origins on every cron tick.
  const cache = caches.default;
  const cacheKey = new Request(`https://rss-proxy/cache?u=${encodeURIComponent(target)}`, {
    method: "GET",
  });
  let resp = await cache.match(cacheKey);
  if (!resp) {
    const upstream = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cf: { cacheEverything: false },
      headers: {
        "User-Agent": REAL_UA,
        "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    // Pass body + content-type; clamp absurd sizes (RSS is small).
    const body = await upstream.arrayBuffer();
    const ct =
      upstream.headers.get("Content-Type") ||
      (target.toLowerCase().endsWith(".xml") ? "application/xml" : "text/plain");

    resp = new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=60",
        "X-Proxied-Status": String(upstream.status),
        "X-Proxied-Url": target,
        "X-Proxy-Version": VERSION,
      },
    });

    if (upstream.status === 200) {
      // Only cache successful responses so transient blocks don't poison cache.
      // event.waitUntil-style: in module-syntax we need ctx.waitUntil
      // but cache.put without await will still work; we let it race.
      cache.put(cacheKey, resp.clone()).catch(() => {});
    }
  }
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true, version: VERSION, allowed: ALLOWED_HOSTS });
    }
    if (url.pathname === "/proxy") {
      return handleProxy(request, url, env);
    }
    return new Response("Not Found", { status: 404 });
  },
};
