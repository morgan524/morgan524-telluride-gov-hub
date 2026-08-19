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
//   POST /upload-image (auth) → {name, dataBase64 (JPEG)}
//                         → commits the photo to assets/digest/uploads/ and
//                           returns {ok, url} for use in the email
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

You receive the FULL current email as HTML. When the reviewer asks for a change, DO NOT return the whole email — return a small set of precise find/replace EDITS via the "respond" tool. This keeps you fast and safe. Rules:
- Each edit has "find" (an EXACT substring copied VERBATIM from the current email HTML — identical text, whitespace, tags, and &#...; entities) and "replace" (the new text). Keep "find" as SHORT as possible while still matching the intended spot EXACTLY ONCE; if a short snippet would be ambiguous, include just enough surrounding markup to make it unique. Order edits top-to-bottom.
- To REMOVE an event, set find = that event's entire card <tr>...</tr> and replace = "" (empty). To ADD one, set find = a unique nearby anchor (e.g. the closing </tr> of an existing card) and replace = that same anchor followed by a new card copied from an existing card's markup (date badge, title link, location line, short blurb, a "Details" link, and an <img> only if a real photo URL is given). To REWRITE, find only the specific text/attribute and replace it.
- Preserve email-safe structure: inline styles, <table> layout, no <script>, no external CSS or web fonts. Keep any Customer.io Liquid tags (e.g. {% unsubscribe_url %}, {{ customer.email }}) and any legacy *|MERGE|* tags intact. Keep everything PURE ASCII using numeric HTML entities (e.g. &#8212; em dash, &#128205; pin) exactly like the rest of the email.
- Keep the tone informational and grounded in the local area — never breathless, salesy, or padded. Never invent facts about an event (dates, prices, lineups). If you lack a detail the reviewer didn't give you, ask for it instead of guessing.
- To change the subject line, set "subject". If the reviewer only asks a question, answer it in "reply" with changed=false and no edits.
Always respond by calling the "respond" tool. Set changed=true only when you provide edits or a new subject.`;

const TOOL = {
  name: "respond",
  description: "Reply to the reviewer; provide precise find/replace edits when changing the email.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "A short, plain message to the reviewer describing what you changed, or answering their question." },
      changed: { type: "boolean", description: "true ONLY if you provide edits or a new subject." },
      edits: {
        type: "array",
        description: "Find/replace edits applied in order to the current email HTML. Empty when you are not changing the body.",
        items: {
          type: "object",
          properties: {
            find: { type: "string", description: "EXACT substring copied verbatim from the current email HTML; must match exactly once." },
            replace: { type: "string", description: "Replacement text (use an empty string to delete)." },
          },
          required: ["find", "replace"],
        },
      },
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
      max_tokens: 8000,
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

  // Apply the model's find/replace edits to the current email HTML server-side.
  // Output is tiny (just the changed snippets), so this returns in seconds
  // instead of the ~2 min it took to re-emit the whole email. The response
  // contract to the front end is unchanged: { reply, changed, html, subject }.
  const emailHtml = String(body.emailHtml || "");
  const edits = Array.isArray(inp.edits) ? inp.edits : [];
  let newHtml = emailHtml, applied = 0;
  const misses = [];
  const appliedSnippets = [];
  for (const e of edits) {
    if (!e || typeof e.find !== "string" || typeof e.replace !== "string" || e.find === "") continue;
    const idx = newHtml.indexOf(e.find);
    if (idx === -1) { misses.push(e.find.replace(/\s+/g, " ").slice(0, 50)); continue; }
    newHtml = newHtml.slice(0, idx) + e.replace + newHtml.slice(idx + e.find.length);
    applied++;
    // Visible text of what changed — used only to locate the edit in the
    // rendered preview. A deletion has no new text, so fall back to the text
    // just before the cut so the Desk can still scroll to the right place.
    const plain = (s) => String(s).replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ").trim();
    const after = plain(e.replace);
    const anchor = after || plain(newHtml.slice(Math.max(0, idx - 300), idx)).slice(-60);
    if (anchor) appliedSnippets.push(anchor.slice(0, 80));
  }
  const subj = typeof inp.subject === "string" ? inp.subject : "";
  const subjectChanged = !!subj && subj !== String(body.subject || "");
  const changed = applied > 0 || subjectChanged;

  let note = "";
  if (misses.length) note = " (I couldn't locate " + misses.length + " passage" + (misses.length > 1 ? "s" : "") + " to change exactly — the wording may differ from what I expected; try rephrasing or being more specific.)";
  else if (inp.changed && !changed) note = " (No change was applied.)";

  return {
    reply: (inp.reply || "") + note,
    changed,
    html: changed ? newHtml : "",
    subject: subj,
    // What actually landed, so the Review Desk can scroll the reviewer to the
    // change and flash it. Plain text only, short — this is a UI hint, not data.
    appliedEdits: appliedSnippets.slice(0, 6),
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
    // Neutralise personalization for the direct transactional test: Customer.io
    // Liquid ({% unsubscribe_url %}, {{ customer.* }}) only renders on the real
    // broadcast path (the CIO template render_liquid's trigger.body), plus any
    // legacy Mailchimp merge tags.
    const testHtml = html
      .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, "#")
      .replace(/\{\{\s*customer\.[^}]*\}\}/g, "")
      .replace(/\*\|UNSUB\|\*/g, "#").replace(/\*\|[A-Z0-9_]+\|\*/g, "");
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
  if (!put.ok) {
    const tt = await put.text();
    if (put.status === 401) { _ghCache = { at: Date.now(), status: "bad" }; throw new Error(GH_TOKEN_HELP); }
    throw new Error("GitHub " + put.status + ": " + tt.slice(0, 150));
  }
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
  return ghPutB64(env, path, b64(contentStr), message);
}

// ── GitHub token health ──────────────────────────────────────────────────────
// Fine-grained PATs expire. Before this existed the first sign of an expired
// token was a raw "GitHub 401: Bad credentials" thrown in the reviewer's face at
// Approve time — on a Friday morning, minutes before the send window, with no
// way to tell it apart from a real outage. Now the Desk asks on load and warns
// early, and /save refuses to start a half-write it can't finish.
// Cached in module scope so the unauthenticated /health can't be used to hammer
// GitHub; a Worker isolate lives minutes, so a fixed token is picked up quickly.
let _ghCache = { at: 0, status: "unknown" };
async function ghTokenStatus(env) {
  if (!env.GITHUB_TOKEN) return "missing";
  const now = Date.now();
  if (_ghCache.status !== "unknown" && now - _ghCache.at < 60000) return _ghCache.status;
  const repo = (env.GITHUB_REPO || "morgan524/morgan524-telluride-gov-hub").trim();
  let status = "unknown";
  try {
    const r = await fetch("https://api.github.com/repos/" + repo, {
      headers: {
        "Authorization": "Bearer " + env.GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "User-Agent": "livabletelluride-digest-worker",
      },
    });
    if (r.status === 401) status = "bad";            // expired / revoked / malformed
    else if (r.status === 403 || r.status === 404) status = "forbidden";  // wrong scope or repo
    else if (r.ok) status = "ok";
    else status = "unknown";
  } catch (e) { status = "unknown"; }
  _ghCache = { at: now, status };
  return status;
}

const GH_TOKEN_HELP =
  "The Worker's GitHub token has expired, so nothing can be committed. " +
  "Create a new fine-grained token (Contents: Read and write on the site repo), " +
  "then run `npx wrangler secret put GITHUB_TOKEN` in cloudflare-worker/livabletelluride-digest " +
  "(or update the secret in the Cloudflare dashboard). Then click Approve again — " +
  "nothing you have done here is lost.";

// Same commit flow but the content is ALREADY base64 (binary uploads — the
// /upload-image photos — must not round-trip through TextEncoder).
async function ghPutB64(env, path, contentB64, message) {
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
    body: JSON.stringify({ message, content: contentB64, branch: "main", ...(sha ? { sha } : {}) }),
  });
  if (!put.ok) {
    const t = await put.text();
    if (put.status === 401) { _ghCache = { at: Date.now(), status: "bad" }; throw new Error(GH_TOKEN_HELP); }
    if (put.status === 403 || put.status === 404) {
      throw new Error("GitHub refused the write on " + path + " (" + put.status + "). The token is valid but " +
        "doesn't have Contents: Read and write on this repo — re-issue it with that permission.");
    }
    throw new Error("GitHub " + put.status + " on " + path + ": " + t.slice(0, 200));
  }
}

// ── /upload-image — host a Desk-uploaded photo on livabletelluride.org ──
// The Desk resizes client-side (canvas → JPEG ≤1200px) and sends base64; we
// commit it to assets/digest/uploads/<YYYY-MM>/ and return the public URL the
// email will use. GitHub Pages serves the file ~1-2 min after the commit —
// well before any scheduled send.
async function uploadImage(body, env) {
  if (!env.GITHUB_TOKEN) return { error: "Uploads aren't configured — the Worker needs its GITHUB_TOKEN secret." };
  const dataB64 = String(body.dataBase64 || "");
  if (!dataB64 || dataB64.length < 100) return { error: "No image data received." };
  if (dataB64.length > 4_200_000) return { error: "Image too large after resize (max ~3 MB) — try a smaller photo." };
  if (!/^[A-Za-z0-9+/=]+$/.test(dataB64)) return { error: "Bad image encoding." };
  // Magic bytes: JPEG (/9j/) or PNG (iVBORw0KGgo). The Digest Desk always sends
  // JPEG; the Newsletter Desk may send PNG for line art (elevation drawings,
  // charts), where JPEG artefacts blur hairlines and small type.
  const isJpeg = dataB64.startsWith("/9j/");
  const isPng  = dataB64.startsWith("iVBORw0KGgo");
  if (!isJpeg && !isPng) return { error: "Only JPEG or PNG uploads are accepted (is the file an image?)." };
  const slug = String(body.name || "photo").toLowerCase()
    .replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "photo";
  const ym = new Date().toISOString().slice(0, 7);
  const ext = isPng ? ".png" : ".jpg";
  const dir = body.folder === "newsletter" ? "assets/newsletters/uploads/" : "assets/digest/uploads/";
  const path = dir + ym + "/" + slug + "-" + Date.now() + ext;
  await ghPutB64(env, path, dataB64, "Digest: photo upload " + slug + " (Review Desk)");
  return { ok: true, url: "https://livabletelluride.org/" + path };
}

// Does this path already exist on main? ghPutB64 fetches the blob sha and
// includes it, so a PUT to an occupied path OVERWRITES silently. That is fine
// for timestamped photo uploads; it is not fine for a source document whose
// descriptive filename is already linked from a sent newsletter.
async function ghExists(env, path) {
  const repo = (env.GITHUB_REPO || "morgan524/morgan524-telluride-gov-hub").trim();
  const r = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path + "?ref=main", {
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "User-Agent": "livabletelluride-digest-worker",
    },
  });
  return r.ok;
}

// ── /upload-pdf — host a Desk-uploaded source document ──
// Newsletters cite plats, letters, memos and staff reports. This commits the
// file under newsletter/<topic>/ — the same tree the /newsletter-pdf skill
// publishes to, so hand-published and Desk-published documents stay together —
// and returns the raw URL plus a /read.html viewer URL for the hyperlink.
async function uploadPdf(body, env) {
  if (!env.GITHUB_TOKEN) return { error: "Uploads aren't configured — the Worker needs its GITHUB_TOKEN secret." };
  const dataB64 = String(body.dataBase64 || "");
  if (!dataB64 || dataB64.length < 100) return { error: "No PDF data received." };
  // ~8 MB of file. GitHub would take far more, but the Worker holds the whole
  // body in memory and the Desk gets used on hotel wifi as often as not.
  if (dataB64.length > 11_000_000) return { error: "PDF too large (max about 8 MB). Compress it, or split it into parts." };
  if (!/^[A-Za-z0-9+/=]+$/.test(dataB64)) return { error: "Bad PDF encoding." };
  // Magic bytes: base64 of "%PDF-". Catches a renamed .doc or an image.
  if (!dataB64.startsWith("JVBERi0")) return { error: "That file isn't a PDF — it has to start with %PDF-." };

  const clean = (v, fallback) => String(v || "").toLowerCase()
    .replace(/\.pdf$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
  const topic = clean(body.topic, "documents");
  const slug = clean(body.name, "document");
  const path = "newsletter/" + topic + "/" + slug + ".pdf";

  if (!body.overwrite && await ghExists(env, path)) {
    return {
      error: "A document already exists at " + path + ". Rename this one, or re-run with overwrite to replace it — "
        + "replacing it changes what every already-sent newsletter linking that URL shows.",
      exists: true, path,
    };
  }

  await ghPutB64(env, path, dataB64, "Newsletter: upload document " + slug + " (Newsletter Desk)");
  const url = "https://livabletelluride.org/" + path;
  // The path is already reduced to [a-z0-9-] segments plus "/" and ".pdf", so it
  // needs no escaping — and encodeURIComponent() would percent-encode the
  // slashes, producing read.html?doc=newsletter%2Ffoo%2Fbar.pdf. That works, but
  // it is what a reader sees when they hover the link in a newsletter, and some
  // mail clients mangle long percent-encoded query strings.
  return {
    ok: true,
    url,
    readerUrl: "https://livabletelluride.org/read.html?doc=" + path,
    path,
  };
}

async function saveDigest(body, env) {
  if (!env.GITHUB_TOKEN) return { error: "Locking isn't configured yet — add a fine-scoped GitHub token (contents:write) as the Worker's GITHUB_TOKEN secret." };
  // Preflight. /save writes TWO files (the digest, then the lock marker); a
  // token that dies between them would leave the digest committed but
  // unapproved — looks locked, never sends. Check first, write nothing on fail.
  const tok = await ghTokenStatus(env);
  if (tok === "bad") return { error: GH_TOKEN_HELP, tokenExpired: true };
  if (tok === "forbidden") return { error: "The Worker's GitHub token is valid but lacks Contents: Read and write on the site repo — re-issue it with that permission.", tokenExpired: true };
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
      return json({
        ok: true,
        broadcast: !!(env.CUSTOMERIO_BROADCAST_ID || "").trim(),
        testBroadcast: !!(env.CUSTOMERIO_TEST_BROADCAST_ID || "").trim(),
        // "ok" | "bad" | "missing" | "forbidden" | "unknown" — the Desk warns on
        // load so an expired token surfaces before the reviewer does the work,
        // not at Approve time. No secret is exposed, only whether it still works.
        github: await ghTokenStatus(env),
      }, 200, origin);
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
      if (url.pathname === "/upload-image") return json(await uploadImage(body, env), 200, origin);
      if (url.pathname === "/upload-pdf") return json(await uploadPdf(body, env), 200, origin);
      return json({ error: "not found" }, 404, origin);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500, origin);
    }
  },
};
