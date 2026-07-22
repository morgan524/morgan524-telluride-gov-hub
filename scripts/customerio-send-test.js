#!/usr/bin/env node
/**
 * Customer.io trial — send ONE test of the weekly "Week Ahead" email via the
 * App API (Transactional Email endpoint). For the parallel Customer.io trial;
 * does NOT touch Mailchimp. Run from customerio-send-test.yml so the App key
 * stays a GitHub Actions secret.
 *
 * Sends to a single recipient you control (CIO_TEST_TO). In the workspace's
 * "test mode" this is fine for self-tests; full-list sends need production mode.
 *
 * Mailchimp merge tags (*|UNSUB|*, *|EMAIL|* …) are neutralised first — those
 * are Mailchimp-only and Customer.io won't process them. (A real Customer.io
 * send would use Customer.io Liquid + its own unsubscribe link; that's
 * full-migration work, out of scope for this deliverability test.)
 */
const fs = require('fs');

const APP_KEY = (process.env.CUSTOMERIO_APP_API_KEY || '').trim();
const TO      = (process.env.CIO_TEST_TO || '').trim();
const SUBJECT = process.env.CIO_SUBJECT || 'The Week Ahead — Customer.io test';
const FROM    = 'Livable Telluride <news@news.livabletelluride.org>';
const HTML_FILE = process.env.CIO_HTML || 'weekly-email.html';

if (!APP_KEY) { console.error('Missing CUSTOMERIO_APP_API_KEY'); process.exit(1); }
if (!TO || !TO.includes('@')) { console.error('Missing/invalid CIO_TEST_TO'); process.exit(1); }

let html = fs.readFileSync(HTML_FILE, 'utf8');
html = html.replace(/\*\|UNSUB\|\*/g, '#').replace(/\*\|[A-Z0-9_]+\|\*/g, '')
           .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#')
           .replace(/\{\{\s*customer\.[^}]*\}\}/g, '');

(async () => {
  let res, text = '';
  try {
    res = await fetch('https://api.customer.io/v1/send/email', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + APP_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: TO,
        identifiers: { email: TO },
        from: FROM,
        subject: SUBJECT,
        body: html,
      }),
    });
    text = await res.text();
  } catch (e) {
    console.error('  ✗ request error:', e.message); process.exit(1);
  }
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  console.log('  ' + text.slice(0, 600));
  if (!res.ok) {
    console.log('\n  (400 mentioning transactional_message_id → Customer.io wants a');
    console.log('   transactional template; 4xx about test mode → flip the workspace');
    console.log('   to production or add the recipient as a verified test address.)');
    process.exit(1);
  }
  console.log(`\n  ✓ Sent "${SUBJECT}" to ${TO} from ${FROM}. Check the inbox (+ spam).`);
})();
