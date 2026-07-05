// livabletelluride-digest — backend for the Digest Review Desk
// (digest-review.html). All JSON, CORS-locked to the site:
//   GET  /health        → {ok, broadcast}            (no auth; quick check)
//   POST /chat   (auth) → {emailHtml, subject, message, history?}
//                         → Claude edits the email or answers
//                         → {reply, changed, html, subject}
//   POST /send   (auth) → {emailHtml, subject, test, to?}
//                         → Customer.io transactional (test) or broadcast (send)
//   POST /save   (auth) → {key, html, subject, weekStart}
//                         → commits the approved digest + a lock marker to the
//                           repo so the daily bot render can't change it
// Auth: header  x-digest-key: <DIGEST_KEY passphrase>.
// Secrets (set via deploy-digest-worker.yml): ANTHROPIC_API_KEY,
//   CUSTOMERIO_APP_API_KEY, CUSTOMERIO_BROADCAST_ID (optional until CIO is
//   finalized), DIGEST_KEY.
// GITHUB_TOKEN (required only for /save) is set OUT OF BAND via
//   `wrangler secret put GITHUB_TOKEN` — a fine-scoped PAT with contents:write on
//   this repo. It is intentionally NOT in the deploy workflow's managed list, so
//   a missing token can never fail the digest-Worker deploy; Worker secrets
//   persist across deploys. Optional: GITHUB_REPO override (owner/name).

const ALLOW_ORIGINS = ["https://livabletelluride.org", "https://www.livabletelluride.org"];
const FROM = "Livable Telluride <news@news.livabletelluride.org>";

function cors(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-digest-key",
    "Access-Control-Max-Age": "86400",
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

const SYSTEM = `You are the editor's assistant for "Livable Telluride", a community newsletter for Telluride, Mountain Village, and the surrounding San Miguel County towns. A reviewer is looking at a ready-to-send HTML email digest (a "Weekend Outlook" or "Week Ahead") and may ask you to edit it or answer questions about it.

You receive the FULL current email as HTML. When the reviewer asks for a change, return the FULL updated email HTML with ONLY that change applied. Rules:
- Preserve the existing structure, inline styles, <table> layout, and overall design EXACTLY. It is an email — keep it email-safe (inline styles, table layout, no <script>, no external CSS or web fonts).
- To REMOVE an event, delete that event's entire card row (its <tr>...</tr>). To ADD one, copy the markup of an existing event card and fill in the details (date badge, title link, location line, a short blurb, a "Details" link, and an <img> only if a real photo URL is provided). To REWRITE, change only that card's text.
- Keep the tone informational and grounded in the local area — never breathless, salesy, or padded. Keep any *|MERGE|* tags (e.g. *|UNSUB|*, *|EMAIL|*) intact and unmoved. Keep the output PURE ASCII, using numeric HTML entities (e.g. &#8212; for an em dash, &#128205; for a pin) exactly like the rest of the email.
- Never invent facts about an event (dates, prices, lineups). If you lack a detail the reviewer didn't give you, ask for it instead of guessing.
- If the reviewer only asks a question, answer it and do NOT change the HTML (changed=false, empty html).
Always respond by calling the "respond" tool.`;

const TOOL = {
  name: "respond",
  description: "Reply to the reviewer; include the full edited email HTML when you changed it.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "A short, plain message to the reviewer describing what you changed, or answering their question." },
      changed: { type: "boolean", description: "true ONLY if you edited the email HTML or subject." },
      html: { type: "string", description: "The FULL updated email HTML when changed is true; otherwise an empty string." },
      subject: { type: "string", description: "An updated subject line if the reviewer asked to change it; otherwise an empty string." },
    },
    required: ["reply", "changed"],
  },
};

async function chat(body, env) {
  if (!env.ANTHROPIC_API_KEY) return { error: "Anthropic key not configured on the Worker." };
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const messages = [];
  messages.push({ role: "user", content: "CURRENT EMAIL SUBJECT: " + (body.subject || "") + "\n\nCURRENT EMAIL HTML:\n" + (body.emailHtml || "") });
  messages.push({ role: "assistant", content: "Got it — I have the current digest in front of me. What would you like to change?" });
  for (const m of history) {
    if (m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string") {
      messages.push({ role: m.role, content: m.text });
    }
  }
  messages.push({ role: "user", content: String(body.message || "") });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "respond" },
      messages,
    }),
  });
  const data = await r.json();
  if (!r.ok) return { error: "anthropic " + r.status, detail: (data && data.error && data.error.message) || "" };
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block) return { reply: "(no response)", changed: false, html: "", subject: "" };
  const inp = block.input || {};
  return {
    reply: inp.reply || "",
    changed: !!inp.changed,
    html: inp.changed ? (inp.html || "") : "",
    subject: inp.subject || "",
  };
}

async function send(body, env) {
  const appKey = (env.CUSTOMERIO_APP_API_KEY || "").trim();
  if (!appKey) return { error: "Customer.io App API key not configured on the Worker." };
  const html = String(body.emailHtml || "");
  const subject = String(body.subject || "Livable Telluride");

  if (body.test) {
    const to = String(body.to || "").trim();
    if (!to.includes("@")) return { error: "Enter a valid test email address." };
    const testHtml = html.replace(/\*\|UNSUB\|\*/g, "#").replace(/\*\|[A-Z0-9_]+\|\*/g, "");
    const r = await fetch("https://api.customer.io/v1/send/email", {
      method: "POST",
      headers: { Authorization: "Bearer " + appKey, "Content-Type": "application/json" },
      body: JSON.stringify({ to, identifiers: { email: to }, from: FROM, subject: subject + " (test)", body: testHtml }),
    });
    const t = await r.text();
    return r.ok ? { ok: true, mode: "test", to } : { error: "Customer.io " + r.status, detail: t.slice(0, 400) };
  }

  // Full-process test → fire the TEST broadcast. It's bound in Customer.io to a
  // one-person test segment, so this exercises the real broadcast path (render +
  // send via the news@ domain) but can NEVER reach the real Weekly Update list.
  if (body.testBroadcast) {
    const tbid = (env.CUSTOMERIO_TEST_BROADCAST_ID || "").trim();
    if (!tbid) {
      return { pending: true, error: "No test broadcast configured yet. Create an API-triggered test broadcast pointed at a one-person test segment, then set CUSTOMERIO_TEST_BROADCAST_ID." };
    }
    const r = await fetch("https://api.customer.io/v1/campaigns/" + tbid + "/triggers", {
      method: "POST",
      headers: { Authorization: "Bearer " + appKey, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { subject, body: html } }),
    });
    const t = await r.text();
    return r.ok ? { ok: true, mode: "test-broadcast" } : { error: "Customer.io " + r.status, detail: t.slice(0, 400) };
  }

  // Approve & Send → API-triggered broadcast to the segment.
  const bid = (env.CUSTOMERIO_BROADCAST_ID || "").trim();
  if (!bid) {
    return {
      pending: true,
      error: "Customer.io broadcast not finalized yet. Create the API-triggered broadcast in the Customer.io UI, target the Weekly Update segment, and set CUSTOMERIO_BROADCAST_ID — then this goes live. (Send test works now.)",
    };
  }
  const r = await fetch("https://api.customer.io/v1/campaigns/" + bid + "/triggers", {
    method: "POST",
    headers: { Authorization: "Bearer " + appKey, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { subject, body: html } }),
  });
  const t = await r.text();
  if (!r.ok) return { error: "Customer.io " + r.status, detail: t.slice(0, 400) };
  // Sent — archive the exact HTML and record it so the next content-refresh run
  // turns this newsletter into a blog post. Best-effort: a blog hiccup must never
  // report the send as failed (it already went out).
  let blog = "skipped";
  if (env.GITHUB_TOKEN) { try { blog = await archiveBroadcast(env, body); } catch (e) { blog = "archive-error: " + String((e && e.message) || e).slice(0, 120); } }
  return { ok: true, mode: "broadcast", blog };
}

// Archive a just-sent broadcast: commit the exact HTML to digest/archive/ and
// append a record to data/sent-broadcasts.json (content-refresh turns those into
// BLOG_POSTS). Reuses the /save GitHub token.
async function archiveBroadcast(env, body) {
  const key = body.key === "weekend" ? "weekend" : "weekly";
  const html = String(body.emailHtml || "");
  const subject = String(body.subject || "Livable Telluride");
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const pretty = now.toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric" });
  const archivePath = "digest/archive/" + iso + "-" + key + ".html";
  await ghPutFile(env, archivePath, html, "Blog: archive sent " + key + " broadcast " + iso);
  const excerpt = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  await ghAppendJson(env, "data/sent-broadcasts.json", {
    date: pretty, subject, key, href: "https://livabletelluride.org/" + archivePath, excerpt, sentAt: now.toISOString(),
  });
  return "archived";
}

// UTF-8-safe base64 DECODE (for reading an existing repo file's content).
function fromB64(b64str) {
  const bin = atob(String(b64str).replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Prepend an entry to a JSON array file in the repo (newest-first, capped).
async function ghAppendJson(env, path, entry) {
  const repo = (env.GITHUB_REPO || "morgan524/morgan524-telluride-gov-hub").trim();
  const base = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const headers = {
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "livabletelluride-digest-worker",
    "Content-Type": "application/json",
  };
  let arr = [], sha;
  const g = await fetch(base + "?ref=main", { headers });
  if (g.ok) { try { const gj = await g.json(); sha = gj.sha; const parsed = JSON.parse(fromB64(gj.content)); if (Array.isArray(parsed)) arr = parsed; } catch (e) {} }
  arr.unshift(entry);
  if (arr.length > 100) arr = arr.slice(0, 100);
  const put = await fetch(base, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message: "Blog: record sent broadcast " + (entry.date || ""), content: b64(JSON.stringify(arr, null, 2) + "\n"), branch: "main", ...(sha ? { sha } : {}) }),
  });
  if (!put.ok) { const tt = await put.text(); throw new Error("GitHub " + put.status + ": " + tt.slice(0, 150)); }
}

// ── /save — freeze the human-approved digest as final for the week ──
// Commits the approved HTML to the repo (digest/<file>.html) plus a lock marker
// (digest/<key>.lock.json) via the GitHub Contents API. digest-refresh.yml sees
// the lock and stops re-rendering that digest, so the daily bot can no longer
// change the lede or swap events — Monday's Approve & Send goes out exactly as
// approved. The lock auto-expires when the week rolls over (the workflow deletes
// a lock whose weekStart no longer matches the coming Monday/Friday).
const DIGEST_FILES = { weekly: "digest/week.html", weekend: "digest/weekend.html" };

// UTF-8-safe base64 (GitHub Contents API wants base64 file content).
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ghPutFile(env, path, contentStr, message) {
  const repo = (env.GITHUB_REPO || "morgan524/morgan524-telluride-gov-hub").trim();
  const base = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const headers = {
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "livabletelluride-digest-worker",
    "Content-Type": "application/json",
  };
  let sha;
  const g = await fetch(base + "?ref=main", { headers });
  if (g.ok) { try { sha = (await g.json()).sha; } catch (e) {} }
  const put = await fetch(base, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message, content: b64(contentStr), branch: "main", ...(sha ? { sha } : {}) }),
  });
  if (!put.ok) {
    const t = await put.text();
    throw new Error("GitHub " + put.status + " on " + path + ": " + t.slice(0, 200));
  }
}

async function saveDigest(body, env) {
  if (!env.GITHUB_TOKEN) return { error: "Locking isn't configured yet — add a fine-scoped GitHub token (contents:write) as the Worker's GITHUB_TOKEN secret." };
  const key = String(body.key || "").trim();
  const file = DIGEST_FILES[key];
  if (!file) return { error: "Unknown digest key: " + key };
  const html = String(body.html || "");
  if (html.length < 200) return { error: "Refusing to lock — the digest HTML looks empty." };
  const subject = String(body.subject || "");
  const weekStart = String(body.weekStart || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { error: "Missing/invalid weekStart (YYYY-MM-DD)." };
  const lock = JSON.stringify({ weekStart, subject, lockedAt: new Date().toISOString() }, null, 2) + "\n";
  await ghPutFile(env, file, html, "Digest: lock approved " + key + " for " + weekStart);
  await ghPutFile(env, "digest/" + key + ".lock.json", lock, "Digest: lock marker " + key + " " + weekStart);
  return { ok: true, locked: true, weekStart };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === "/health") {
      return json({ ok: true, broadcast: !!(env.CUSTOMERIO_BROADCAST_ID || "").trim(), testBroadcast: !!(env.CUSTOMERIO_TEST_BROADCAST_ID || "").trim() }, 200, origin);
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);

    const key = request.headers.get("x-digest-key") || "";
    if (!env.DIGEST_KEY || key !== env.DIGEST_KEY) return json({ error: "Unauthorized" }, 401, origin);

    let body = {};
    try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, origin); }

    try {
      if (url.pathname === "/chat") return json(await chat(body, env), 200, origin);
      if (url.pathname === "/send") return json(await send(body, env), 200, origin);
      if (url.pathname === "/save") return json(await saveDigest(body, env), 200, origin);
      return json({ error: "not found" }, 404, origin);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500, origin);
    }
  },
};
