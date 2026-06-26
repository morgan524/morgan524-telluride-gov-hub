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

const VERSION = "1.1.0";

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
  "townofrico.colorado.gov",
  "www.townofrico.colorado.gov",
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

// Customer.io dual-write (parallel to Mailchimp during the migration). Maps the
// same signup/profile inputs onto the Customer.io attribute schema used by the
// one-time import (scripts/mailchimp-to-customerio.js) so a person identified
// here looks identical to an imported one. subs[] keys are the name-based keys
// resolveInterests() returns; fields[] are Mailchimp merge tags.
const CIO_SUBS_TO_ATTR = {
  weekly:     "sub_weekly_update",
  newsletter: "sub_newsletter",
  arts:       "topic_music_arts",
  civic:      "topic_gov_meetings",
  family:     "topic_family_kids",
  outdoors:   "topic_outdoors_rec",
};
const CIO_FIELDS_TO_ATTR = { FNAME: "first_name", LNAME: "last_name", MMERGE6: "region" };

// Identify (upsert) a person in Customer.io via the Track API, keyed by email
// (lowercased) — matches the import's identifier. Best-effort: returns a status
// string and never throws, so a Customer.io hiccup can't break the Mailchimp
// write or the signup. No-ops silently until the two Worker secrets are set.
async function cioIdentify(env, email, attrs) {
  if (!env.CUSTOMERIO_SITE_ID || !env.CUSTOMERIO_TRACK_API_KEY) return "skipped";
  if (!attrs || !Object.keys(attrs).length) return "empty";
  const auth = "Basic " + btoa(env.CUSTOMERIO_SITE_ID + ":" + env.CUSTOMERIO_TRACK_API_KEY);
  try {
    const r = await fetch("https://track.customer.io/api/v1/customers/" + encodeURIComponent(email), {
      method: "PUT",
      headers: { "Authorization": auth, "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...attrs }),
    });
    return r.ok ? "ok" : "http " + r.status;
  } catch (e) {
    return "error";
  }
}

function profileCorsHeaders(origin) {
  const allow = PROFILE_ALLOWED_ORIGINS.includes(origin) ? origin : PROFILE_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

// Firebase project (public client key — safe to embed). Used to verify a
// caller's ID token via the Identity Toolkit so a person can only read THEIR
// OWN profile (the email comes from the verified token, never from input).
const FIREBASE_API_KEY = "AIzaSyCyAjB0RA_LtoETyRqxVJor0lRB4NRyXF0";

async function verifyFirebaseEmail(idToken) {
  try {
    const r = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const u = j.users && j.users[0];
    return u && u.email ? String(u.email).toLowerCase() : null;
  } catch (_) { return null; }
}

// The embedded signup form uses Mailchimp "web IDs" (group[7915][24641]); the
// API keys member.interests by a DIFFERENT alphanumeric interest ID. Resolve
// the real IDs by interest NAME ("Weekly Update" / "Newsletter") so both read
// and write are correct regardless of the numeric web IDs. Cached per isolate.
// Resolves all known subscription groups -> real Mailchimp interest IDs by
// matching interest NAMES (so the 4 pilot "Event Topics" light up automatically
// once you create them in Mailchimp). Cached ~5 min so newly-created groups are
// picked up without a redeploy. Keys whose group doesn't exist yet are null.
let _interestCache = null, _interestTs = 0;
async function resolveInterests(env) {
  if (_interestCache && (Date.now() - _interestTs < 300000)) return _interestCache;
  const dc = env.MAILCHIMP_API_KEY.split("-")[1] || "us15";
  const auth = "Basic " + btoa("anystring:" + env.MAILCHIMP_API_KEY);
  const base = "https://" + dc + ".api.mailchimp.com/3.0/lists/" + MC_LIST_ID;
  const map = {};
  try {
    const cr = await fetch(base + "/interest-categories?count=60", { headers: { Authorization: auth } });
    const cj = await cr.json();
    for (const cat of (cj.categories || [])) {
      const ir = await fetch(base + "/interest-categories/" + cat.id + "/interests?count=200", { headers: { Authorization: auth } });
      const ij = await ir.json();
      for (const it of (ij.interests || [])) map[String(it.name || "").trim().toLowerCase()] = it.id;
    }
  } catch (_) {}
  const find = (re) => { for (const n of Object.keys(map)) if (re.test(n)) return map[n]; return null; };
  const result = {
    weekly:     find(/weekly/),
    newsletter: find(/newsletter/),
    arts:       find(/\barts\b|music|festival/),
    civic:      find(/government|civic|\bmeetings?\b/),
    family:     find(/family|kids/),
    outdoors:   find(/outdoor|recreation/),
  };
  if (result.weekly || result.newsletter) { _interestCache = result; _interestTs = Date.now(); } // cache only a good fetch
  return result;
}

// POST /interests — public, non-PII: which subscription groups currently exist
// on the list (booleans only), so the profile page shows only real options.
async function handleInterests(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.MAILCHIMP_API_KEY) return json({ ok: false, available: {} });
  const ids = await resolveInterests(env);
  const available = {};
  for (const k of Object.keys(ids)) available[k] = !!ids[k];
  return json({ ok: true, available });
}

// POST /profile-read { idToken } — returns the signed-in user's own Mailchimp
// fields + subscription state so the profile page can pre-fill. Token-verified;
// a non-subscriber gets { ok:true, found:false }.
async function handleProfileRead(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  if (!env.MAILCHIMP_API_KEY) return json({ ok: false, msg: "Profile lookup isn't configured yet." }, 500);

  let data; try { data = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const idToken = data && data.idToken;
  if (!idToken) return json({ ok: false, msg: "Not signed in." }, 401);
  const email = await verifyFirebaseEmail(idToken);
  if (!email) return json({ ok: false, msg: "We couldn't verify your sign-in." }, 401);

  const dc = env.MAILCHIMP_API_KEY.split("-")[1] || "us15";
  const apiUrl = "https://" + dc + ".api.mailchimp.com/3.0/lists/" + MC_LIST_ID + "/members/" + md5(email);
  let resp;
  try { resp = await fetch(apiUrl, { headers: { Authorization: "Basic " + btoa("anystring:" + env.MAILCHIMP_API_KEY) } }); }
  catch { return json({ ok: false, msg: "Couldn't reach Mailchimp." }, 502); }
  if (resp.status === 404) return json({ ok: true, found: false, email });
  if (!(resp.status >= 200 && resp.status < 300)) return json({ ok: false, msg: "Lookup failed (" + resp.status + ")." });

  const m = await resp.json();
  const mf = m.merge_fields || {};
  const mi = m.interests || {};
  const ids = await resolveInterests(env);
  return json({
    ok: true, found: true, email,
    fields: {
      FNAME: mf.FNAME || "", LNAME: mf.LNAME || "", MMERGE6: mf.MMERGE6 || "",
      MMERGE10: mf.MMERGE10 || "", MMERGE11: mf.MMERGE11 || "",
    },
    subs: {
      weekly:     ids.weekly     ? !!mi[ids.weekly]     : null,
      newsletter: ids.newsletter ? !!mi[ids.newsletter] : null,
    },
  });
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
  // Preferred path: name-based subs resolved to the real Mailchimp interest IDs
  // (the form's 24641/24642 are web IDs that the API ignores).
  if (data.subs && typeof data.subs === "object") {
    const ids = await resolveInterests(env);
    for (const [k, v] of Object.entries(data.subs)) {
      if (ids[k] && typeof v === "boolean") interests[ids[k]] = v;
    }
  }
  const body = {};
  if (Object.keys(merge_fields).length) body.merge_fields = merge_fields;
  if (Object.keys(interests).length) body.interests = interests;
  if (!Object.keys(body).length) return json({ ok: false, msg: "Nothing to update." }, 400);

  // Dual-write to Customer.io (parallel to Mailchimp during the migration).
  // Map the SAME inputs onto the import's attribute schema. Booleans in
  // data.subs are explicit toggles, so we always forward them (including
  // false → drops the person from that segment). Best-effort; awaited so it
  // completes within the request, but its result never affects the response.
  const cioAttrs = {};
  for (const [k, attr] of Object.entries(CIO_FIELDS_TO_ATTR)) {
    if (merge_fields[k]) cioAttrs[attr] = merge_fields[k];
  }
  if (data.subs && typeof data.subs === "object") {
    for (const [k, v] of Object.entries(data.subs)) {
      if (CIO_SUBS_TO_ATTR[k] && typeof v === "boolean") cioAttrs[CIO_SUBS_TO_ATTR[k]] = v;
    }
  }
  const cioStatus = await cioIdentify(env, email, cioAttrs);

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
    return json({ ok: true, msg: "Your info has been updated — thank you!", cio: cioStatus });
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

// ════════════════════ HUB-BUB POST MODERATION ════════════════════
// /moderate  — POST {postId,title,body,authorName}. Claude judges the post; if
//   it's a personal attack/harassment/threat/slur (NOT mere criticism of
//   policy/officials), email info@ with one-click Accept/Deny links back to
//   /moderation-action. Reuses ANTHROPIC_API_KEY. Best-effort: returns ok even
//   when nothing is configured, so a flag never blocks posting.
// /moderation-action — GET from the emailed buttons. HMAC-verified. "deny"
//   deletes the post from Firestore via the FIREBASE_SERVICE_ACCOUNT secret.
const MOD_PROJECT = "telluride-gov-hub";
const MOD_RECIPIENT = "info@livabletelluride.org";

function b64url(buf) {
  let s = ""; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// HMAC key derived from a stable secret (no extra secret to manage). The
// Accept/Deny links are unforgeable because only the Worker holds this seed.
async function modHmacKey(env) {
  // Seed from a STABLE secret only — NOT FIREBASE_SERVICE_ACCOUNT, so adding or
  // rotating that key doesn't invalidate outstanding Accept/Deny links.
  const seed = (env.MODERATION_SECRET || env.ANTHROPIC_API_KEY || "fallback") + "|hubbub-moderation-v1";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(seed),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function modSign(env, payload) {
  const key = await modHmacKey(env);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function modEmailHtml(o) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2e29">
  <div style="background:#21443c;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e7b24a">Hub-Bub moderation</div>
    <div style="font-size:18px;font-weight:700;margin-top:3px">A post was flagged for review</div></div>
  <div style="border:1px solid #e6e9e6;border-top:0;border-radius:0 0 8px 8px;padding:20px 22px">
    <p style="margin:0 0 4px;font-size:13px;color:#7a8a85">Reason: <strong style="color:#a8401f">${esc(o.reason || "possible personal attack")}</strong>${o.severity ? " (" + esc(o.severity) + ")" : ""}</p>
    <p style="margin:14px 0 4px;font-size:12px;color:#7a8a85;text-transform:uppercase;letter-spacing:.06em">Posted by ${esc(o.author)}</p>
    <div style="font-weight:700;font-size:16px;margin:2px 0 8px">${esc(o.title)}</div>
    <div style="font-size:14px;line-height:1.6;color:#41514b;white-space:pre-wrap;background:#f7faf8;border:1px solid #eef1ee;border-radius:8px;padding:12px 14px">${esc(o.body)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr>
      <td style="padding-right:10px"><a href="${o.acceptUrl}" style="display:inline-block;background:#e7efe9;color:#21443c;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:8px">&#10003; Accept (keep)</a></td>
      <td><a href="${o.denyUrl}" style="display:inline-block;background:#a8401f;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:8px">&#10007; Deny (remove)</a></td>
    </tr></table>
    <p style="font-size:12px;color:#9aa7a1;margin-top:10px">&ldquo;Deny&rdquo; deletes the post immediately. Links expire in 7 days.</p>
  </div></div>`;
}

async function handleModerate(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ ok: true, skipped: "no anthropic key" });

  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  const postId = String(d.postId || "").trim();
  const title = String(d.title || "").slice(0, 300);
  const body = String(d.body || "").slice(0, 4000);
  const author = String(d.authorName || "a neighbor").slice(0, 80);
  if (!postId || !body) return json({ ok: true, skipped: "missing fields" });

  const sys = "You are a content-moderation assistant for a small-town civic forum in Telluride, Colorado. "
    + "Neighbors discuss local government, housing, land use, and events. Vigorous criticism of policies, public officials, "
    + "decisions, and institutions is WELCOME and must NOT be flagged, even when blunt or angry. "
    + "Flag a post ONLY if it contains a personal attack on a private individual, harassment, threats of violence, "
    + "slurs or hate toward a protected group, or doxxing (sharing private personal info). "
    + "Respond with ONLY a compact JSON object and nothing else: "
    + "{\"flag\": true|false, \"reason\": \"<=8 words\", \"severity\": \"low|medium|high\"}.";
  let verdict = { flag: false };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 150, system: sys,
        messages: [{ role: "user", content: "POST TITLE: " + title + "\n\nPOST BODY:\n" + body }] }),
    });
    const out = await r.json();
    const txt = (out.content || []).filter(b => b && b.type === "text").map(b => b.text).join("");
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) verdict = JSON.parse(m[0]);
  } catch (e) { return json({ ok: false, msg: "classify failed" }); }

  if (!verdict.flag) return json({ ok: true, flagged: false });

  const exp = Date.now() + 7 * 24 * 3600 * 1000;
  const origin = new URL(request.url).origin;
  const mkLink = async (action) => {
    const sig = await modSign(env, postId + "|" + action + "|" + exp);
    return origin + "/moderation-action?id=" + encodeURIComponent(postId) + "&a=" + action + "&exp=" + exp + "&sig=" + sig;
  };
  const html = modEmailHtml({
    title, body, author, reason: verdict.reason, severity: verdict.severity,
    acceptUrl: await mkLink("accept"), denyUrl: await mkLink("deny"),
  });

  if (env.MAIL_RELAY_URL) {
    try {
      await fetch(env.MAIL_RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "moderation", to: MOD_RECIPIENT, subject: "⚠️ Hub-Bub post flagged for review", html, secret: env.MAIL_RELAY_SECRET || "" }) });
    } catch (e) { /* email best-effort */ }
  }
  return json({ ok: true, flagged: true });
}

// Service-account → Google OAuth token → Firestore REST (per-isolate token cache)
function pemToPkcs8(pem) {
  const b64 = String(pem).replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
// Pull the FIRST complete, brace-balanced {…} object out of a string, ignoring
// anything before or after it (handles a duplicate paste or trailing text).
// String-aware so braces inside JSON string values don't fool the depth count.
function firstJsonObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return s;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return s.slice(start);
}
// Parse FIREBASE_SERVICE_ACCOUNT tolerantly: strip a BOM, then take just the
// first complete {…} object (so stray/duplicate content around it is ignored).
// Throws a clear, non-sensitive error if it still isn't valid JSON.
function getServiceAccount(env) {
  const raw = firstJsonObject((env.FIREBASE_SERVICE_ACCOUNT || "").replace(/^﻿/, "").trim());
  try { return JSON.parse(raw); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT isn't valid JSON (" + String(e.message || "").slice(0, 50) + "). Re-paste the entire .json file as the secret."); }
}
let _gToken = null, _gTokenExp = 0;
async function googleAccessToken(env, scope) {
  if (_gToken && Date.now() < _gTokenExp - 60000) return _gToken;
  const sa = getServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = enc({ alg: "RS256", typ: "JWT" }) + "." +
    enc({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + signingInput + "." + sig,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + (j.error_description || j.error || "unknown"));
  _gToken = j.access_token; _gTokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return _gToken;
}
async function firestoreDelete(env, docPath) {
  const sa = getServiceAccount(env);
  const token = await googleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const url = "https://firestore.googleapis.com/v1/projects/" + (sa.project_id || MOD_PROJECT) +
    "/databases/(default)/documents/" + docPath;
  const r = await fetch(url, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("firestore " + r.status + " " + (await r.text().catch(() => "")).slice(0, 120));
}

async function handleModerationAction(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "", a = url.searchParams.get("a") || "";
  const exp = url.searchParams.get("exp") || "", sig = url.searchParams.get("sig") || "";
  const page = (title, msg) => new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
    "<body style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:60px auto;padding:0 24px;color:#1a2e29'>" +
    "<h2 style='color:#21443c'>" + title + "</h2><p style='font-size:16px;line-height:1.6;color:#41514b'>" + msg + "</p>" +
    "<p style='margin-top:24px'><a href='https://livabletelluride.org/hub-bub.html' style='color:#2f7a5f'>Open Hub-Bub &rarr;</a></p></body>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!id || !a || !exp || !sig) return page("Invalid link", "This moderation link is missing information.");
  if (Date.now() > Number(exp)) return page("Link expired", "This moderation link has expired. Open Hub-Bub to moderate directly.");
  if ((await modSign(env, id + "|" + a + "|" + exp)) !== sig) return page("Invalid link", "This moderation link couldn't be verified.");
  if (a === "accept") return page("Post kept", "No action taken — the post stays published. Thanks for reviewing.");
  if (a === "deny") {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return page("Not configured yet", "Post removal isn't set up yet (missing FIREBASE_SERVICE_ACCOUNT). You can remove the post directly in Hub-Bub.");
    try { await firestoreDelete(env, "posts/" + id); return page("Post removed", "The flagged post has been deleted from Hub-Bub."); }
    catch (e) { return page("Couldn't remove it", "Deletion failed: " + String((e && e.message) || e).slice(0, 140) + ". You can remove it directly in Hub-Bub."); }
  }
  return page("Unknown action", "That action isn't recognized.");
}

// ════════════════════ EDITORIAL — meeting-article drafts ════════════════════
// The agentic editorial layer (scripts/editorial/*) drafts an article when a
// meeting summary scores newsworthy, writes it here, and emails info@ a
// tokenized review link. The decision page (article-review.html) reads the
// draft and records Approve/Deny/Edit — all token-gated, all server-side via
// the service account, so article_drafts is locked to clients (firestore.rules).
//   POST /article-create  {secret, draft}      — loop creates a draft + emails the link
//   GET  /article-draft?id=&t=                 — decision page reads the draft (token)
//   POST /article-decide  {id,t,action,...}    — decision page records the decision (token)
const ART_COLL = "article_drafts";

// Firestore REST uses typed values; firestoreDelete didn't need (de)serializers
// but get/patch do. Recursive so nested triage/citations/flaggedClaims survive.
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}
function toFsFields(obj) {
  const f = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) f[k] = toFsValue(obj[k]);
  return f;
}
function fromFsValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ("mapValue" in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}
function fromFsFields(fields) {
  const o = {};
  for (const k of Object.keys(fields || {})) o[k] = fromFsValue(fields[k]);
  return o;
}
async function firestoreGet(env, docPath) {
  const sa = getServiceAccount(env);
  const token = await googleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const url = "https://firestore.googleapis.com/v1/projects/" + (sa.project_id || MOD_PROJECT) +
    "/databases/(default)/documents/" + docPath;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("firestore get " + r.status + " " + (await r.text().catch(() => "")).slice(0, 120));
  const j = await r.json();
  return fromFsFields(j.fields || {});
}
// PATCH with an updateMask covering exactly the supplied keys → also creates the
// doc if absent (used for both create and partial update).
async function firestorePatch(env, docPath, obj) {
  const sa = getServiceAccount(env);
  const token = await googleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const mask = keys.map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const url = "https://firestore.googleapis.com/v1/projects/" + (sa.project_id || MOD_PROJECT) +
    "/databases/(default)/documents/" + docPath + "?" + mask;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFsFields(obj) }),
  });
  if (!r.ok) throw new Error("firestore patch " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160));
  return true;
}

// Article review token: "<exp>.<sig>", sig = HMAC over "article|id|exp". Reuses
// modSign so there's no new secret to manage; namespaced so it can't collide
// with moderation links.
async function artToken(env, id, exp) {
  return exp + "." + (await modSign(env, "article|" + id + "|" + exp));
}
async function artVerify(env, id, t) {
  const dot = String(t || "").indexOf(".");
  if (dot < 0) return { ok: false };
  const exp = String(t).slice(0, dot), sig = String(t).slice(dot + 1);
  if (!/^\d+$/.test(exp)) return { ok: false };
  if ((await modSign(env, "article|" + id + "|" + exp)) !== sig) return { ok: false };
  if (Date.now() > Number(exp)) return { ok: false, expired: true };
  return { ok: true };
}

function articleEmailHtml(doc, reviewUrl) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tri = doc.triage || {};
  const reasons = (tri.reasons || []).map((r) => `<li style="margin:4px 0">${esc(r)}</li>`).join("");
  const body = doc.editedBodyHtml || doc.bodyHtml || "";   // trusted (pipeline-authored)
  const cites = (doc.citations || []).map((c) => `<li style="margin:3px 0;font-size:12px;color:#7a8a85">[${esc(c.marker)}] ${esc(c.text)}</li>`).join("");
  const flags = (doc.flaggedClaims || []).length
    ? `<div style="background:#fdf1e6;border:1px solid #e8c7a8;border-radius:8px;padding:10px 12px;margin:12px 0"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#a8401f">Flagged &mdash; not verifiable from sources</div><ul style="margin:6px 0 0;padding-left:18px">${doc.flaggedClaims.map((f) => `<li style="font-size:13px;color:#7a3e16">${esc(f)}</li>`).join("")}</ul></div>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a2e29">
  <div style="background:#21443c;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e7b24a">${doc.kind === "full-summary" ? "Full meeting summary &middot; for your approval" : doc.kind === "recap" ? "Meeting recap &middot; for your approval" : "Editorial &middot; Draft for review"}</div>
    <div style="font-size:19px;font-weight:700;margin-top:3px">${esc(doc.title || "Untitled draft")}</div></div>
  <div style="border:1px solid #e6e9e6;border-top:0;border-radius:0 0 8px 8px;padding:20px 22px">
    <div style="background:#efe9dc;border-radius:8px;padding:12px 14px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#21443c">Why this was drafted &mdash; newsworthiness ${esc(tri.score)}/5</div>
      <ul style="margin:6px 0 0;padding-left:18px;font-size:13px;color:#4a5e57">${reasons}</ul>
    </div>
    ${doc.dek ? `<p style="font-style:italic;color:#4a5e57;font-size:15px;margin:0 0 12px">${esc(doc.dek)}</p>` : ""}
    <div style="font-size:15px;line-height:1.65;color:#1a2e29">${body}</div>
    ${flags}
    ${cites ? `<div style="margin-top:14px;border-top:1px solid #e6e9e6;padding-top:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#7a8a85">Sources</div><ul style="margin:6px 0 0;padding-left:18px">${cites}</ul></div>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr>
      <td><a href="${reviewUrl}" style="display:inline-block;background:#21443c;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:8px">Review &rarr; approve, edit, or deny</a></td>
    </tr></table>
    <p style="font-size:12px;color:#9aa7a1;margin-top:10px">Nothing publishes until you approve it. Link expires in 30 days.</p>
  </div></div>`;
}

async function handleArticleCreate(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
  if (request.method !== "POST") return json({ ok: false }, 405);
  let d; try { d = await request.json(); } catch { return json({ ok: false, msg: "bad json" }, 400); }
  const secret = env.EDITORIAL_SECRET || env.MAIL_RELAY_SECRET || "";
  if (!secret || d.secret !== secret) return json({ ok: false, msg: "unauthorized" }, 401);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: false, msg: "no service account" }, 500);
  const draft = d.draft || {};
  const id = String(draft.id || draft.slug || "").trim();
  if (!id) return json({ ok: false, msg: "missing id/slug" }, 400);

  // Idempotent: the loop calls this every run, so if a draft for this meeting
  // already exists (ANY status — including denied), don't re-create or re-email.
  try {
    const existing = await firestoreGet(env, ART_COLL + "/" + id);
    if (existing) return json({ ok: true, id, skipped: "exists", status: existing.status || "pending" });
  } catch (e) { /* fall through and attempt create */ }

  const now = new Date().toISOString();
  const doc = Object.assign({}, draft, { status: "pending", createdAt: now });
  delete doc.id;
  try { await firestorePatch(env, ART_COLL + "/" + id, doc); }
  catch (e) { return json({ ok: false, msg: "firestore: " + String((e && e.message) || e).slice(0, 120) }, 502); }

  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const t = await artToken(env, id, exp);
  const reviewUrl = "https://livabletelluride.org/article-review.html?id=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(t);

  let emailed = false;
  if (env.MAIL_RELAY_URL) {
    try {
      await fetch(env.MAIL_RELAY_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "editorial", to: MOD_RECIPIENT, subject: (doc.kind === "full-summary" ? "📝 Full meeting summary for review: " : doc.kind === "recap" ? "📝 Meeting recap for review: " : "📝 Draft for review: ") + (doc.title || id), html: articleEmailHtml(doc, reviewUrl), secret: env.MAIL_RELAY_SECRET || "" }),
      });
      emailed = true;
    } catch (e) { /* best-effort */ }
  }
  return json({ ok: true, id, reviewUrl, emailed });
}

async function handleArticleDraftRead(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "", t = url.searchParams.get("t") || "";
  if (!id || !t) return json({ ok: false, msg: "Missing link parameters." }, 400);
  const v = await artVerify(env, id, t);
  if (!v.ok) return json({ ok: false, msg: v.expired ? "This review link has expired." : "This link couldn't be verified." }, 403);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: false, msg: "Draft storage isn't configured." }, 500);
  let doc;
  try { doc = await firestoreGet(env, ART_COLL + "/" + id); }
  catch (e) { return json({ ok: false, msg: "Could not load the draft." }, 502); }
  if (!doc) return json({ ok: false, msg: "This draft no longer exists." }, 404);
  return json({ ok: true, draft: doc, status: doc.status || "pending" });
}

async function handleArticleDecide(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false }, 405);
  let d; try { d = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const id = String(d.id || ""), t = String(d.t || ""), action = String(d.action || "");
  if (!id || !t) return json({ ok: false, msg: "Missing link parameters." }, 400);
  const v = await artVerify(env, id, t);
  if (!v.ok) return json({ ok: false, msg: v.expired ? "This review link has expired." : "This link couldn't be verified." }, 403);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: false, msg: "Draft storage isn't configured." }, 500);

  const now = new Date().toISOString();
  const patch = {};
  if (d.editedTitle !== undefined) patch.editedTitle = String(d.editedTitle);
  if (d.editedDek !== undefined) patch.editedDek = String(d.editedDek);
  if (d.editedBodyHtml !== undefined) patch.editedBodyHtml = String(d.editedBodyHtml);
  if (action === "approve") { patch.status = "approved"; patch.reviewedAt = now; }
  else if (action === "deny") { patch.status = "denied"; patch.denyReason = String(d.denyReason || ""); patch.reviewedAt = now; }
  else if (action === "edit") { patch.status = "pending"; patch.editedAt = now; }
  else return json({ ok: false, msg: "Unknown action." }, 400);

  try { await firestorePatch(env, ART_COLL + "/" + id, patch); }
  catch (e) { return json({ ok: false, msg: "Could not save: " + String((e && e.message) || e).slice(0, 100) }, 502); }
  return json({ ok: true, status: patch.status });
}

// Firestore structured query (status == value). Used by the publish job to
// pull approved drafts. Returns docs with `.id` attached.
async function firestoreQuery(env, collection, field, value) {
  const sa = getServiceAccount(env);
  const token = await googleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const url = "https://firestore.googleapis.com/v1/projects/" + (sa.project_id || MOD_PROJECT) +
    "/databases/(default)/documents:runQuery";
  const body = { structuredQuery: {
    from: [{ collectionId: collection }],
    where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFsValue(value) } },
    limit: 50,
  } };
  const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("firestore query " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160));
  const rows = await r.json();
  const out = [];
  for (const row of rows || []) {
    if (row.document) { const doc = fromFsFields(row.document.fields || {}); doc.id = row.document.name.split("/").pop(); out.push(doc); }
  }
  return out;
}

const editSecretOk = (env, given) => {
  const secret = env.EDITORIAL_SECRET || env.MAIL_RELAY_SECRET || "";
  return secret && given === secret;
};

// GET /article-exists?id=&secret=  — cheap dedup check for the loop (so it
// skips scoring/drafting a meeting already drafted). → { ok, exists, status }
async function handleArticleExists(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
  const url = new URL(request.url);
  if (!editSecretOk(env, url.searchParams.get("secret") || "")) return json({ ok: false, msg: "unauthorized" }, 401);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: false, msg: "no service account" }, 500);
  const id = url.searchParams.get("id") || "";
  if (!id) return json({ ok: false, msg: "missing id" }, 400);
  try { const doc = await firestoreGet(env, ART_COLL + "/" + id);
    return json({ ok: true, exists: !!doc, status: doc ? (doc.status || "pending") : null }); }
  catch (e) { return json({ ok: false, msg: String((e && e.message) || e).slice(0, 140) }, 502); }
}

// GET /article-pending-publish?secret=  — approved-but-not-yet-published drafts,
// for the pull-model publish job. → { ok, drafts: [...] }
async function handleArticlePendingPublish(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
  const url = new URL(request.url);
  if (!editSecretOk(env, url.searchParams.get("secret") || "")) return json({ ok: false, msg: "unauthorized" }, 401);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ ok: false, msg: "no service account" }, 500);
  try { return json({ ok: true, drafts: await firestoreQuery(env, ART_COLL, "status", "approved") }); }
  catch (e) { return json({ ok: false, msg: String((e && e.message) || e).slice(0, 160) }, 502); }
}

// POST /article-published  {secret, id}  — mark a draft published after the
// publish job has generated + committed its page.
async function handleArticlePublished(request, env) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
  if (request.method !== "POST") return json({ ok: false }, 405);
  let d; try { d = await request.json(); } catch { return json({ ok: false }, 400); }
  if (!editSecretOk(env, d.secret || "")) return json({ ok: false, msg: "unauthorized" }, 401);
  const id = String(d.id || ""); if (!id) return json({ ok: false, msg: "missing id" }, 400);
  try { await firestorePatch(env, ART_COLL + "/" + id, { status: "published", publishedAt: new Date().toISOString() }); }
  catch (e) { return json({ ok: false, msg: String((e && e.message) || e).slice(0, 140) }, 502); }
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/update-profile") {
      return handleUpdateProfile(request, env);
    }
    if (url.pathname === "/profile-read") {
      return handleProfileRead(request, env);
    }
    if (url.pathname === "/interests") {
      return handleInterests(request, env);
    }
    if (url.pathname === "/summarize-flyer") {
      return handleSummarizeFlyer(request, env);
    }
    if (url.pathname === "/moderate") {
      return handleModerate(request, env);
    }
    if (url.pathname === "/moderation-action") {
      return handleModerationAction(request, env);
    }
    if (url.pathname === "/article-create") {
      return handleArticleCreate(request, env);
    }
    if (url.pathname === "/article-draft") {
      return handleArticleDraftRead(request, env);
    }
    if (url.pathname === "/article-decide") {
      return handleArticleDecide(request, env);
    }
    if (url.pathname === "/article-exists") {
      return handleArticleExists(request, env);
    }
    if (url.pathname === "/article-pending-publish") {
      return handleArticlePendingPublish(request, env);
    }
    if (url.pathname === "/article-published") {
      return handleArticlePublished(request, env);
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
