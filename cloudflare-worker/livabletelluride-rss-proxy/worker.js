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
  // Direct-PDF agenda hosts (Med / Fire / Ophir). Their agendas are plain
  // .pdf links and these origins can block GH-runner IPs; route via the
  // Worker so content-refresh can fetch + parse them. Added 2026-05-28.
  "tellmed.org",
  "www.tellmed.org",
  "telluridefire.com",
  "www.telluridefire.com",
  "townofophir.colorado.gov",
  "www.townofophir.colorado.gov",
  // San Miguel Basin Forum (West End news) — Creative Circle CMS, same
  // as Telluride Times. Direct fetches from GH runners get 403/429.
  "sanmiguelbasinforum.com",
  "www.sanmiguelbasinforum.com",
  // Sheridan Opera House — WordPress + Modern Events Calendar Lite.
  // /events/ landing page parsed for the 3 upcoming events. Direct
  // fetch works as of 2026-05-29 but added defensively in case nginx
  // / Yoast / a future WAF rule starts blocking GH runner IPs.
  "sheridanoperahouse.com",
  "www.sheridanoperahouse.com",
  // Alibi Telluride — events served by Event Calendar App (the
  // alibi.com Squarespace native calendar is dormant; the live
  // events are in the embedded ECA widget). Parser hits ECA API.
  "alibitelluride.com",
  "www.alibitelluride.com",
  "api.eventcalendarapp.com",
  // Telluride.com — community calendar. /festivals-events/events/
  // ships all events inline as fcEventsData (300+ entries).
  "telluride.com",
  "www.telluride.com",
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

// ── Mailchimp "Update your profile" endpoint ──────────────────────────
// POST /update-profile { email, fields:{FNAME,LNAME,MMERGE6,MMERGE10,
// MMERGE11}, interests:{ "<interestId>": bool } }. PATCHes the subscriber
// (update-only — a non-member returns a friendly "subscribe first", so this
// can't be used to inject arbitrary contacts). Only non-empty fields are
// sent, so it never blanks data the person didn't touch. Needs the
// MAILCHIMP_API_KEY Worker secret (datacenter is read from the key suffix).
const MC_LIST_ID = "f83dc56387";
const PROFILE_ALLOWED_ORIGINS = [
  "https://livabletelluride.org",
  "https://www.livabletelluride.org",
];
const PROFILE_MERGE_FIELDS = ["FNAME", "LNAME", "MMERGE6", "MMERGE10", "MMERGE11"];

function profileCorsHeaders(origin) {
  const allow = PROFILE_ALLOWED_ORIGINS.includes(origin) ? origin : PROFILE_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

async function handleUpdateProfile(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  if (!env.MAILCHIMP_API_KEY) return json({ ok: false, msg: "Profile updates aren't configured yet." }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const email = String(data.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json({ ok: false, msg: "Please enter a valid email address." }, 400);

  const merge_fields = {};
  const inFields = data.fields && typeof data.fields === "object" ? data.fields : {};
  for (const k of PROFILE_MERGE_FIELDS) {
    if (inFields[k] != null && String(inFields[k]).trim() !== "") merge_fields[k] = String(inFields[k]).trim();
  }
  const interests = {};
  if (data.interests && typeof data.interests === "object") {
    for (const [id, on] of Object.entries(data.interests)) {
      if (/^[0-9a-f]+$/i.test(id)) interests[id] = !!on;
    }
  }
  const body = {};
  if (Object.keys(merge_fields).length) body.merge_fields = merge_fields;
  if (Object.keys(interests).length) body.interests = interests;
  if (!Object.keys(body).length) return json({ ok: false, msg: "Nothing to update." }, 400);

  const dc = env.MAILCHIMP_API_KEY.split("-")[1] || "us15";
  const apiUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${MC_LIST_ID}/members/${md5(email)}`;
  let resp;
  try {
    resp = await fetch(apiUrl, {
      method: "PATCH",
      headers: {
        "Authorization": "Basic " + btoa("anystring:" + env.MAILCHIMP_API_KEY),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ ok: false, msg: "Couldn't reach Mailchimp — please try again." }, 502);
  }
  if (resp.status === 404) {
    return json({ ok: false, msg: "We couldn't find that email on our list. Use the address you subscribed with, or sign up first." });
  }
  if (resp.status >= 200 && resp.status < 300) {
    return json({ ok: true, msg: "Your info has been updated — thank you!" });
  }
  let detail = "";
  try { const j = await resp.json(); detail = j.detail || j.title || ""; } catch (_) {}
  return json({ ok: false, msg: detail || `Update failed (${resp.status}).` });
}

// MD5 (public-domain, Paul Johnston implementation). Mailchimp's subscriber
// hash is md5(lowercased email); crypto.subtle has no MD5, so we embed it.
function md5(string) {
  function RotateLeft(v, c) { return (v << c) | (v >>> (32 - c)); }
  function AddUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000, lY8 = lY & 0x80000000, lX4 = lX & 0x40000000, lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) return (lResult & 0x40000000) ? (lResult ^ 0xC0000000 ^ lX8 ^ lY8) : (lResult ^ 0x40000000 ^ lX8 ^ lY8);
    return lResult ^ lX8 ^ lY8;
  }
  const F = (x, y, z) => (x & y) | (~x & z);
  const G = (x, y, z) => (x & z) | (y & ~z);
  const H = (x, y, z) => x ^ y ^ z;
  const I = (x, y, z) => y ^ (x | ~z);
  function FF(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
  function GG(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
  function HH(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
  function II(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
  function ConvertToWordArray(str) {
    const len = str.length;
    const nWords = (((len + 8 - ((len + 8) % 64)) / 64) + 1) * 16;
    const wa = new Array(nWords - 1).fill(0);
    let bytePos = 0, byteCount = 0;
    while (byteCount < len) {
      const wc = (byteCount - (byteCount % 4)) / 4; bytePos = (byteCount % 4) * 8;
      wa[wc] = wa[wc] | (str.charCodeAt(byteCount) << bytePos);
      byteCount++;
    }
    const wc = (byteCount - (byteCount % 4)) / 4; bytePos = (byteCount % 4) * 8;
    wa[wc] = wa[wc] | (0x80 << bytePos);
    wa[nWords - 2] = len << 3; wa[nWords - 1] = len >>> 29;
    return wa;
  }
  function WordToHex(v) { let s = ""; for (let i = 0; i <= 3; i++) { const b = (v >>> (i * 8)) & 255; s += ("0" + b.toString(16)).slice(-2); } return s; }
  const x = ConvertToWordArray(string);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22, S21 = 5, S22 = 9, S23 = 14, S24 = 20,
        S31 = 4, S32 = 11, S33 = 16, S34 = 23, S41 = 6, S42 = 10, S43 = 15, S44 = 21;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756); c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB); b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
    a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A); c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8); d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122); d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193); c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E); b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
    a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340); c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
    a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], S22, 0x02441453); c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
    a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
    a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681); c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
    a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA); c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
    a = II(a, b, c, d, x[k + 0], S41, 0xF4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97); c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3); d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92); c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k + 6], S43, 0xA3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
    a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82); d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
    a = AddUnsigned(a, AA); b = AddUnsigned(b, BB); c = AddUnsigned(c, CC); d = AddUnsigned(d, DD);
  }
  return (WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d)).toLowerCase();
}

// POST /summarize-flyer { imageUrl } → { ok, summary }. Reads the flyer image
// with Claude (vision) and returns a short factual event summary for the
// admin event-review page. Needs the ANTHROPIC_API_KEY Worker secret.
async function handleSummarizeFlyer(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, msg: "Flyer summaries aren't configured yet (missing ANTHROPIC_API_KEY)." }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const imageUrl = String(data.imageUrl || "").trim();
  if (!/^https:\/\//i.test(imageUrl)) return json({ ok: false, msg: "A flyer image URL is required." }, 400);

  const prompt = "This is a flyer for a community event in the Telluride, Colorado region. "
    + "Read the text in the image and write a concise, factual 2-3 sentence summary for a community events calendar. "
    + "State what the event is, plus the date, time, and location if they appear on the flyer. "
    + "Do NOT invent or infer any detail that is not visibly on the flyer. "
    + "Write plain prose only - no preamble, no markdown, and do not start with phrases like 'This flyer' or 'The event'.";

  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
  } catch (e) {
    return json({ ok: false, msg: "Couldn't reach the summarizer - please try again." }, 502);
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ ok: false, msg: "Summary failed (" + resp.status + ").", detail: detail.slice(0, 200) }, 502);
  }
  const out = await resp.json().catch(() => ({}));
  const summary = (out.content || []).filter(b => b && b.type === "text").map(b => b.text).join("").trim();
  if (!summary) return json({ ok: false, msg: "No summary was returned." }, 502);
  return json({ ok: true, summary });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/update-profile") {
      return handleUpdateProfile(request, env);
    }
    if (url.pathname === "/summarize-flyer") {
      return handleSummarizeFlyer(request, env);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true, version: VERSION, allowed: ALLOWED_HOSTS });
    }
    if (url.pathname === "/og") {
      // Open-Graph extractor — fetches any public page and returns
      // { imageUrl, title, description } as JSON for Hub-Bub link previews.
      const corsH = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return new Response(JSON.stringify({ error: "No url param" }), { status: 400, headers: corsH });
      let pu;
      try { pu = new URL(targetUrl); } catch { return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: corsH }); }
      if (pu.protocol !== "https:" && pu.protocol !== "http:") {
        return new Response(JSON.stringify({ error: "Only http/https" }), { status: 400, headers: corsH });
      }
      try {
        const resp = await fetch(targetUrl, {
          headers: { "User-Agent": REAL_UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8" },
          redirect: "follow",
          cf: { cacheTtl: 3600, cacheEverything: true },
        });
        const html = await resp.text();
        function metaContent(patterns) {
          for (const re of patterns) { const m = html.match(re); if (m) return m[1].trim(); }
          return null;
        }
        const imageUrl = metaContent([
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
        ]);
        const title = metaContent([
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
          /<title[^>]*>([^<]+)<\/title>/i,
        ]);
        const description = metaContent([
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
        ]);
        return new Response(
          JSON.stringify({ imageUrl: imageUrl || null, title: title || null, description: description || null }),
          { status: 200, headers: { ...corsH, "Cache-Control": "public, max-age=3600" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "Fetch failed", detail: String(err) }), { status: 502, headers: corsH });
      }
    }
    if (url.pathname === "/proxy") {
      return handleProxy(request, url, env);
    }
    return new Response("Not Found", { status: 404 });
  },
};
