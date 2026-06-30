# Livable Telluride — Donation Receipt Worker

Sends a branded IRS-compliant tax-deductible acknowledgment email to each
donor immediately after they complete a Stripe checkout. Lives in the
same Cloudflare account as `livabletelluride-rss-proxy`
(`8f020e73de4e9956f0e3ad7dce070ef4`, Morgan@brieflink.ai).

```
Donor clicks "Donate via Stripe" on /donate.html
   │
   ▼
buy.stripe.com/7sY7sD2TZ2MV5Vudf40Ba00  (hosted Payment Link)
   │
   ▼  on successful payment, Stripe fires webhook:
   │  POST https://livabletelluride-donations.<sub>.workers.dev
   │  event = checkout.session.completed
   │  header = stripe-signature: t=...,v1=...
   ▼
This Worker
   │
   ├─ verifies stripe-signature with STRIPE_WEBHOOK_SECRET (HMAC-SHA256)
   ├─ extracts donor email + amount + date from session
   └─ builds branded HTML/text receipt with IRS magic language
       │
       ▼
       Resend (api.resend.com/emails)
       │
       ▼
       Donor inbox  (from: donations@livabletelluride.org)
```

## What the receipt contains (IRS Publication 1771 compliance)

Every email includes the four things the IRS requires for gifts ≥ $250:

1. Organization legal name (Livable Telluride)
2. Contribution amount and date
3. EIN
4. The magic language: *"No goods or services were provided in exchange
   for this contribution. Your gift is tax-deductible to the extent
   allowed by law."*

It also includes the Stripe transaction ID, your support email, and the
Livable Telluride branding so it looks like a real receipt, not a Stripe
default email.

## Prerequisites

1. **501(c)(3) confirmed** — verify Livable Telluride at
   <https://apps.irs.gov/app/eos>. Do NOT deploy until confirmed.
2. **EIN** — XX-XXXXXXX format, from your IRS determination letter
3. **Resend account** — sign up at <https://resend.com>
4. **Domain verification in Resend** — add a sender domain (probably
   `livabletelluride.org`) via Resend → Domains → Add Domain, then add
   the DKIM/SPF DNS records they show you to your domain registrar
5. **`donations@livabletelluride.org`** — set up an email alias for it,
   or change `SENDER_EMAIL` in wrangler.toml to whatever's verified in Resend

## Deploy

```bash
cd cloudflare-worker/livabletelluride-donations
wrangler login                          # if not already
wrangler secret put STRIPE_WEBHOOK_SECRET    # paste whsec_... when prompted
wrangler secret put RESEND_API_KEY           # paste re_... when prompted
wrangler secret put ORG_EIN                  # paste XX-XXXXXXX when prompted
wrangler deploy
```

You'll get back a URL like:

```
https://livabletelluride-donations.morgan-8f0.workers.dev
```

## Wire up the Stripe webhook

1. Open <https://dashboard.stripe.com/webhooks>
2. Click **Add endpoint**
3. **Endpoint URL** = the workers.dev URL from above
4. **Events to send** = `checkout.session.completed` (just this one)
5. Click **Add endpoint**
6. On the new endpoint page, click **Reveal** under "Signing secret"
7. Copy that `whsec_...` value
8. If it's different from what you set earlier, update:
   ```bash
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

## Test it end-to-end

1. In Stripe Dashboard, switch to **test mode**
2. Donate $1 via your payment link (use card `4242 4242 4242 4242`,
   any future date, any CVC)
3. Check the Worker log:
   ```bash
   wrangler tail
   ```
   You should see `Receipt sent to <email> for USD 1`
4. Check your inbox — the receipt should arrive within seconds
5. If the email arrives but lands in spam, your DKIM/SPF isn't fully
   propagated yet — check Resend → Domains

## Troubleshooting

**Webhook delivers but no email**: check `wrangler tail` for errors.
Most common: `RESEND_API_KEY not configured` or `Resend HTTP 401` (bad
key) or `Resend HTTP 422` (sender domain not verified).

**Webhook returns 400 Invalid signature**: the `STRIPE_WEBHOOK_SECRET`
in wrangler doesn't match the one Stripe is signing with. Re-copy from
Stripe Dashboard → Webhooks → endpoint → "Signing secret".

**Webhook returns 503 Server not configured**: a required secret
isn't set. Run `wrangler secret list` to see what's set.

**Stripe Dashboard shows webhook failing**: click the failing event for
the response body — it'll explain (signature failure, missing data, etc.).

**Donor name missing**: Stripe Payment Links don't always collect name
unless "Collect customer details" is on. Set that in the Payment Link's
"Customer information" section.

## What this Worker does NOT do (yet)

- **Annual giving statement** — IRS doesn't strictly require for gifts
  under $250, but donors expect a January summary. Roadmap: nightly cron
  that aggregates Stripe charges per donor and emails a summary in early
  January.
- **Recurring-donation handling** — Payment Links can do recurring, but
  this Worker only fires on the first checkout. For recurring, also
  listen for `invoice.paid` events.
- **Database of donations** — receipts are sent and forgotten. If you
  need a donor database, add a D1 binding and log each session there.
- **Failure alerting** — failed sends log to `wrangler tail` only. For
  prod, consider piping errors to a Sentry/Discord webhook.

## Files

- `worker.js` — the handler (single file, no deps)
- `wrangler.toml` — Cloudflare config + non-secret env vars
- `README.md` — this file
