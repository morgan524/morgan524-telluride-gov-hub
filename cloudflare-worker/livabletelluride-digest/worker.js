// livabletelluride-digest — backend for the Digest Review Desk
// (digest-review.html). Three endpoints, all JSON, CORS-locked to the site:
//   GET  /health        → {ok, broadcast}            (no auth; quick check)
//   POST /chat   (auth) → {emailHtml, subject, message, history?}
//                         → Claude edits the email or answers
//                         → {reply, changed, html, subject}
//   POST /send   (auth) → {emailHtml, subject, test, to?}
//                         → Customer.io transactional (test) or broadcast (send)
// Auth: header  x-digest-key: <DIGEST_KEY passphrase>.
// Secrets (set via deploy-digest-worker.yml): ANTHROPIC_API_KEY,
//   CUSTOMERIO_APP_API_KEY, CUSTOMERIO_BROADCAST_ID (optional until CIO is
//   finalized), DIGEST_KEY.

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
  return r.ok ? { ok: true, mode: "broadcast" } : { error: "Customer.io " + r.status, detail: t.slice(0, 400) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === "/health") {
      return json({ ok: true, broadcast: !!(env.CUSTOMERIO_BROADCAST_ID || "").trim() }, 200, origin);
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);

    const key = request.headers.get("x-digest-key") || "";
    if (!env.DIGEST_KEY || key !== env.DIGEST_KEY) return json({ error: "Unauthorized" }, 401, origin);

    let body = {};
    try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, origin); }

    try {
      if (url.pathname === "/chat") return json(await chat(body, env), 200, origin);
      if (url.pathname === "/send") return json(await send(body, env), 200, origin);
      return json({ error: "not found" }, 404, origin);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500, origin);
    }
  },
};
