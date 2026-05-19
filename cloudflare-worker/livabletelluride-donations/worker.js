/**
 * Livable Telluride — Donation Receipt Worker
 *
 * Listens for Stripe `checkout.session.completed` webhooks from the
 * donation Payment Link (buy.stripe.com/7sY7sD2TZ2MV5Vudf40Ba00) and
 * emails the donor a branded IRS-compliant tax-deductible acknowledgment
 * via Resend.
 *
 * Required secrets (set via `wrangler secret put <NAME>`):
 *   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Developers → Webhooks
 *   RESEND_API_KEY         — from resend.com → API Keys
 *   ORG_EIN                — your IRS-assigned Employer Identification Number
 *
 * Optional env vars (in wrangler.toml [vars] or set via secret):
 *   ORG_NAME       — default "Livable Telluride"
 *   SENDER_EMAIL   — default "donations@livabletelluride.org"
 *                    (must be a verified sender in Resend)
 *   SUPPORT_EMAIL  — default "info@livabletelluride.org"
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) return new Response('Missing signature', { status: 400 });

    const body = await request.text();

    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return new Response('Server not configured', { status: 503 });
    }

    const verified = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!verified) return new Response('Invalid signature', { status: 400 });

    let event;
    try { event = JSON.parse(body); }
    catch { return new Response('Invalid JSON', { status: 400 }); }

    // Only act on completed checkouts. Stripe will retry on non-2xx, so we
    // return 200 for events we deliberately ignore.
    if (event.type !== 'checkout.session.completed') {
      return new Response('OK (ignored)', { status: 200 });
    }

    const session = event.data?.object || {};
    const email = session.customer_details?.email || session.customer_email;
    const name = session.customer_details?.name || '';
    const amount = (session.amount_total || 0) / 100;
    const currency = (session.currency || 'usd').toUpperCase();
    const date = new Date((session.created || Date.now() / 1000) * 1000);
    const sessionId = session.id || 'unknown';

    if (!email || amount <= 0) {
      console.warn('Missing email or zero amount, skipping receipt', { sessionId });
      return new Response('OK (missing data)', { status: 200 });
    }

    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response('Server not configured', { status: 503 });
    }

    const result = await sendReceiptEmail({ to: email, name, amount, currency, date, sessionId, env });
    if (!result.ok) {
      // Don't 500 — Stripe will retry the webhook (up to 3 days), which
      // could double-send if the email service flakes. Log + return 200.
      console.error('Send failed:', result.error);
      return new Response('OK (send failed, logged)', { status: 200 });
    }

    console.log(`Receipt sent to ${email} for ${currency} ${amount}`);
    return new Response('OK', { status: 200 });
  }
};

// ── Stripe webhook HMAC-SHA256 signature verification ──
async function verifyStripeSignature(payload, header, secret) {
  const parts = Object.fromEntries(
    header.split(',').map(kv => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // 5-minute tolerance window — rejects replays of old captured webhooks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected, signature);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// ── Send the receipt email via Resend ──
async function sendReceiptEmail({ to, name, amount, currency, date, sessionId, env }) {
  const orgName = env.ORG_NAME || 'Livable Telluride';
  const sender = env.SENDER_EMAIL || 'donations@livabletelluride.org';
  const support = env.SUPPORT_EMAIL || 'info@livabletelluride.org';
  const ein = env.ORG_EIN || '__SET_ORG_EIN_SECRET__';

  const html = buildReceiptHtml({ name, amount, currency, date, sessionId, ein, support });
  const text = buildReceiptText({ name, amount, currency, date, sessionId, ein, support });

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${orgName} <${sender}>`,
        to,
        reply_to: support,
        subject: `Thank you for your gift to ${orgName}`,
        html,
        text
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, error: `Resend HTTP ${resp.status}: ${errText}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── HTML receipt template ──
function buildReceiptHtml({ name, amount, currency, date, sessionId, ein, support }) {
  const fmtAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toLowerCase() === 'usd' ? 'USD' : currency
  }).format(amount);
  const fmtDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const greeting = name ? `Dear ${escapeHtml(name)},` : 'Dear Friend,';
  const shortId = escapeHtml(sessionId.length > 28 ? sessionId.slice(0, 28) + '…' : sessionId);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Thank you for your gift</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fdfbf6;color:#1a2e29;line-height:1.55;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf6;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(36,49,46,0.10);overflow:hidden;">
<tr><td style="background:#21443c;padding:32px 32px 24px;text-align:center;">
<h1 style="margin:0;color:#fff;font-family:Georgia,'Times New Roman',serif;font-size:1.75rem;letter-spacing:-0.02em;">Livable Telluride</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:0.95rem;">Inform. Connect. Engage. Together.</p>
</td></tr>
<tr><td style="padding:36px 36px 28px;">
<p style="margin:0 0 16px;font-size:1.05rem;">${greeting}</p>
<p style="margin:0 0 16px;font-size:1rem;">Thank you so much for your contribution to Livable Telluride. Your gift directly funds the work of keeping local government accessible, our reporting independent, and the Telluride region informed.</p>
<p style="margin:0 0 24px;font-size:1rem;">Please retain this receipt for your tax records.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4e8d3;border-radius:12px;margin:0 0 24px;">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#7a5c10;text-transform:uppercase;letter-spacing:0.08em;">Receipt</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
<tr><td style="padding:6px 0;color:#4a5e57;font-size:0.95rem;">Amount</td><td style="padding:6px 0;color:#1a2e29;font-size:1.05rem;font-weight:700;text-align:right;">${fmtAmount}</td></tr>
<tr><td style="padding:6px 0;color:#4a5e57;font-size:0.95rem;">Date</td><td style="padding:6px 0;color:#1a2e29;font-size:0.95rem;text-align:right;">${fmtDate}</td></tr>
<tr><td style="padding:6px 0;color:#4a5e57;font-size:0.95rem;">Recipient</td><td style="padding:6px 0;color:#1a2e29;font-size:0.95rem;text-align:right;">Livable Telluride</td></tr>
<tr><td style="padding:6px 0;color:#4a5e57;font-size:0.95rem;">EIN</td><td style="padding:6px 0;color:#1a2e29;font-size:0.95rem;text-align:right;font-family:'SF Mono',Monaco,monospace;">${escapeHtml(ein)}</td></tr>
<tr><td style="padding:6px 0;color:#4a5e57;font-size:0.85rem;">Transaction</td><td style="padding:6px 0;color:#7a8a85;font-size:0.78rem;text-align:right;font-family:'SF Mono',Monaco,monospace;">${shortId}</td></tr>
</table>
</td></tr>
</table>
<p style="margin:0 0 14px;font-size:0.9rem;color:#4a5e57;border-left:3px solid #b58a2c;padding:10px 16px;background:#fdfbf6;">
<strong style="color:#1a2e29;">Tax-deductible acknowledgment:</strong> Livable Telluride is a 501(c)(3) tax-exempt organization (EIN ${escapeHtml(ein)}). No goods or services were provided in exchange for this contribution. Your gift is tax-deductible to the extent allowed by law.
</p>
<p style="margin:24px 0 8px;font-size:1rem;">With gratitude,</p>
<p style="margin:0;font-size:1rem;font-style:italic;color:#4a5e57;">The Livable Telluride Team</p>
</td></tr>
<tr><td style="padding:24px 36px 32px;border-top:1px solid rgba(33,68,60,0.10);background:#fdfbf6;text-align:center;">
<p style="margin:0 0 6px;font-size:0.82rem;color:#7a8a85;">Questions? Email <a href="mailto:${escapeHtml(support)}" style="color:#21443c;">${escapeHtml(support)}</a></p>
<p style="margin:0;font-size:0.78rem;color:#7a8a85;">© ${date.getFullYear()} Livable Telluride · <a href="https://livabletelluride.org" style="color:#21443c;">livabletelluride.org</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── Plain-text fallback (for clients that block HTML email) ──
function buildReceiptText({ name, amount, currency, date, sessionId, ein, support }) {
  const fmtAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toLowerCase() === 'usd' ? 'USD' : currency
  }).format(amount);
  const fmtDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const greeting = name ? `Dear ${name},` : 'Dear Friend,';

  return `LIVABLE TELLURIDE
Inform. Connect. Engage. Together.

${greeting}

Thank you so much for your contribution to Livable Telluride. Your gift directly
funds the work of keeping local government accessible, our reporting independent,
and the Telluride region informed.

Please retain this receipt for your tax records.

RECEIPT
-------
Amount:      ${fmtAmount}
Date:        ${fmtDate}
Recipient:   Livable Telluride
EIN:         ${ein}
Transaction: ${sessionId}

TAX-DEDUCTIBLE ACKNOWLEDGMENT
-----------------------------
Livable Telluride is a 501(c)(3) tax-exempt organization (EIN ${ein}).
No goods or services were provided in exchange for this contribution.
Your gift is tax-deductible to the extent allowed by law.

With gratitude,
The Livable Telluride Team

Questions? Email ${support}
© ${date.getFullYear()} Livable Telluride · https://livabletelluride.org
`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
