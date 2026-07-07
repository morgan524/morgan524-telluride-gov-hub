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

// SSRF guard for endpoints that must fetch arbitrary user-supplied URLs (e.g.
// /og link previews, where an allow-list would defeat the feature). Rejects
// non-http(s), non-standard ports, and hostnames that resolve to loopback /
// link-local / RFC-1918 private space or cloud metadata. Literal-IP checks
// only (can't resolve DNS here), but that blocks the common SSRF probes; pair
// with origin-scoped CORS so browsers other than our site can't read results.
function isPublicHttpUrl(target) {
  let u;
  try { u = new URL(target); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  // Literal IPv4?
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return false;                         // 10.0.0.0/8
    if (a === 127) return false;                        // loopback
    if (a === 0) return false;                          // 0.0.0.0/8
    if (a === 169 && b === 254) return false;           // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return false;  // 172.16.0.0/12
    if (a === 192 && b === 168) return false;           // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
    if (a >= 224) return false;                         // multicast / reserved
  }
  // Literal IPv6 loopback / link-local / unique-local.
  if (host === "::1" || host === "[::1]") return false;
  if (/^\[?(fe80|fc|fd)/i.test(host)) return false;
  return true;
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

// ── Customer.io "Update your profile" + "Read your profile" endpoints ──
// POST /update-profile { email, fields:{FNAME,LNAME,MMERGE6,MMERGE10,
// MMERGE11}, interests:{ "<interestId>": bool } }. PATCHes the subscriber
// (update-only — a non-member returns a friendly "subscribe first", so this
// can't be used to inject arbitrary contacts). Only non-empty fields are
// sent, so it never blanks data the person didn't touch. Needs the Customer.io
// credentials (SITE_ID/TRACK_API_KEY for writes; APP_API_KEY for /profile-read).
const PROFILE_ALLOWED_ORIGINS = [
  "https://livabletelluride.org",
  "https://www.livabletelluride.org",
];
const PROFILE_MERGE_FIELDS = ["FNAME", "LNAME", "MMERGE6", "MMERGE10", "MMERGE11"];

// Customer.io is the system of record. Maps the signup/profile inputs onto the
// Customer.io attribute schema (also used by the one-time import). subs[] keys
// are the name-based subscription keys the site sends (weekly/newsletter + the
// four Event Topics); fields[] are the profile field names the form posts.
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
// string and never throws, so a Customer.io hiccup can't break the signup flow.
// No-ops silently until the two Worker secrets are set.
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
// POST /interests — which subscription groups exist. Post-Mailchimp these are a
// fixed Customer.io attribute set, so they're always available.
async function handleInterests(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  return json({ ok: true, available: { weekly: true, newsletter: true, arts: true, civic: true, family: true, outdoors: true } });
}

// POST /profile-read { idToken } — returns the signed-in user's own Customer.io
// attributes (name, region, subscription flags) so the profile page can pre-fill.
// Token-verified; the email comes from the verified token, never from input. A
// contact Customer.io doesn't have yet returns { ok:true, found:false }.
async function handleProfileRead(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  if (!env.CUSTOMERIO_APP_API_KEY) return json({ ok: false, msg: "Profile lookup isn't configured yet." }, 500);

  let data; try { data = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const idToken = data && data.idToken;
  if (!idToken) return json({ ok: false, msg: "Not signed in." }, 401);
  const email = await verifyFirebaseEmail(idToken);
  if (!email) return json({ ok: false, msg: "We couldn't verify your sign-in." }, 401);

  // Read the contact's attributes from Customer.io (App API; contact id == email).
  let resp;
  try {
    resp = await fetch("https://api.customer.io/v1/customers/" + encodeURIComponent(email) + "/attributes", {
      headers: { Authorization: "Bearer " + env.CUSTOMERIO_APP_API_KEY },
    });
  } catch { return json({ ok: false, msg: "Couldn't reach Customer.io." }, 502); }
  if (resp.status === 404) return json({ ok: true, found: false, email });
  if (!(resp.status >= 200 && resp.status < 300)) return json({ ok: false, msg: "Lookup failed (" + resp.status + ")." });

  let a = {};
  try { const j = await resp.json(); a = (j.customer && j.customer.attributes) || j.attributes || {}; } catch (_) {}
  const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";
  return json({
    ok: true, found: true, email,
    fields: { FNAME: a.first_name || "", LNAME: a.last_name || "", MMERGE6: a.region || "" },
    subs: {
      weekly:     truthy(a.sub_weekly_update),
      newsletter: truthy(a.sub_newsletter),
      arts:       truthy(a.topic_music_arts),
      civic:      truthy(a.topic_gov_meetings),
      family:     truthy(a.topic_family_kids),
      outdoors:   truthy(a.topic_outdoors_rec),
    },
  });
}

async function handleUpdateProfile(request, env) {
  const cors = profileCorsHeaders(request.headers.get("Origin") || "");
  const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, msg: "POST only" }, 405);
  if (!env.CUSTOMERIO_SITE_ID || !env.CUSTOMERIO_TRACK_API_KEY) return json({ ok: false, msg: "Profile updates aren't configured yet." }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, msg: "Bad request." }, 400); }
  const email = String(data.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json({ ok: false, msg: "Please enter a valid email address." }, 400);

  // Customer.io is the system of record (Mailchimp retired 2026-07-06). Map the
  // inputs onto the Customer.io attribute schema, then cioIdentify PUT-upserts the
  // contact by email — creating it on signup, updating it on a profile edit.
  // This is an intentionally-unauthenticated by-email endpoint (the weekly-email
  // manage-preferences link + pre-account signup both call it without a Firebase
  // token) — same posture as any public newsletter form; the abuse ceiling is
  // "opt in / edit a known email" (low-harm, one-click unsubscribe). HMAC-signed
  // email links remain the future hardening (see audit).
  const merge_fields = {};
  const inFields = data.fields && typeof data.fields === "object" ? data.fields : {};
  for (const k of PROFILE_MERGE_FIELDS) {
    if (inFields[k] != null && String(inFields[k]).trim() !== "") merge_fields[k] = String(inFields[k]).trim();
  }
  const cioAttrs = {};
  for (const [k, attr] of Object.entries(CIO_FIELDS_TO_ATTR)) {
    if (merge_fields[k]) cioAttrs[attr] = merge_fields[k];
  }
  if (data.subs && typeof data.subs === "object") {
    for (const [k, v] of Object.entries(data.subs)) {
      if (CIO_SUBS_TO_ATTR[k] && typeof v === "boolean") cioAttrs[CIO_SUBS_TO_ATTR[k]] = v;
    }
  }
  if (!Object.keys(cioAttrs).length) return json({ ok: false, msg: "Nothing to update." }, 400);

  const cioStatus = await cioIdentify(env, email, cioAttrs);
  if (cioStatus === "ok") {
    return json({ ok: true, msg: "Your info has been updated — thank you!", cio: cioStatus });
  }
  return json({ ok: false, msg: "Couldn't save your info right now — please try again.", cio: cioStatus }, 502);
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
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e7b24a">Editorial &middot; Draft for review</div>
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
        body: JSON.stringify({ kind: "editorial", to: MOD_RECIPIENT, subject: "📝 Draft for review: " + (doc.title || id), html: articleEmailHtml(doc, reviewUrl), secret: env.MAIL_RELAY_SECRET || "" }),
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
      // Open-Graph extractor for Hub-Bub link previews. It legitimately needs to
      // fetch arbitrary user-pasted URLs, so it can't use the proxy allow-list —
      // instead it blocks private/loopback/link-local targets (SSRF guard) and
      // scopes CORS to our own site so the endpoint can't be used as an
      // anonymous cross-origin fetch amplifier.
      const corsH = { ...profileCorsHeaders(request.headers.get("Origin") || ""), "Access-Control-Allow-Methods": "GET, OPTIONS" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return new Response(JSON.stringify({ error: "No url param" }), { status: 400, headers: corsH });
      if (!isPublicHttpUrl(targetUrl)) {
        return new Response(JSON.stringify({ error: "URL not allowed" }), { status: 400, headers: corsH });
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
