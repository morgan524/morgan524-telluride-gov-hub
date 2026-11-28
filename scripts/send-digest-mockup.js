#!/usr/bin/env node
/**
 * send-digest-mockup.js — email Morgan the digest for review with a one-click
 * Approve button (Morgan 2026-11-28).
 *
 * Preconditions: the reviewed digest is already committed to digest/<key>.html
 * (e.g. after scripts/apply-editor-edits.py applied John/Emily's Word edits) and
 * held steady by digest/freeze.json so the bot won't drift it before approval.
 *
 * This mints an HMAC approval token with DIGEST_KEY (same secret the Worker
 * verifies in /approve), wraps the email in a "For your approval" banner whose
 * button links to the Worker's /approve endpoint, and sends it as a Customer.io
 * transactional test email via the Worker's /send. Clicking Approve writes the
 * send-lock, so the scheduled job sends that exact version at its time.
 *
 * Usage: node scripts/send-digest-mockup.js --key weekly [--to info@livabletelluride.org]
 * Needs ~/.digest_key (the Worker passphrase = GitHub secret DIGEST_KEY).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const WORKER = process.env.DIGEST_WORKER || 'https://livabletelluride-digest.morgan-8f0.workers.dev';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const SEND_WHEN = { weekly: 'Monday 7:00 AM', past: 'its scheduled time' };

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }

function readKey() {
  const p = path.join(os.homedir(), '.digest_key');
  if (!fs.existsSync(p)) { console.error('Missing ~/.digest_key (the Worker DIGEST_KEY).'); process.exit(1); }
  const k = fs.readFileSync(p, 'utf8').trim();
  if (!k) { console.error('~/.digest_key is empty.'); process.exit(1); }
  return k;
}

function post(path_, payload, key) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(WORKER + path_);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', timeout: 60000,
      headers: { 'Content-Type': 'application/json', 'x-digest-key': key, 'User-Agent': UA, 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad response: ' + d.slice(0, 200))); } }); });
    req.on('error', reject); req.write(data); req.end();
  });
}

function banner(key, cover, approveUrl) {
  const label = key === 'past' ? 'Past Meetings' : 'The Week Ahead Outlook';
  const when = SEND_WHEN[key] || 'its scheduled time';
  return '\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#21443c;"><tr><td align="center" style="padding:18px 10px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fff;">'
    + '<div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e3c87a;">Livable Telluride &middot; For your approval</div>'
    + '<div style="font-size:14.5px;line-height:1.6;margin:7px 0 14px;">This is <strong>' + label + '</strong> (' + cover + '), reviewed and ready. Click Approve to schedule it for the <strong>' + when + '</strong> send &mdash; nothing goes out until you approve. Or just reply with any changes.</div>'
    + '<a href="' + approveUrl + '" style="display:inline-block;background:#b58a2c;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:999px;">&#10003; Approve &amp; schedule &mdash; ' + when + '</a>'
    + '</td></tr></table></td></tr></table>';
}

(async () => {
  const key = arg('key', 'weekly');
  const to = arg('to', 'info@livabletelluride.org');
  const expDays = parseInt(arg('exp-days', '7'), 10);
  const DIGEST_KEY = readKey();

  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'digest', 'manifest.json'), 'utf8'));
  const d = man.digests && man.digests[key];
  if (!d) { console.error('No "' + key + '" digest in the manifest.'); process.exit(1); }
  const ws = d.weekStart || '';
  const subject = d.subject || '';
  let html = fs.readFileSync(path.join(ROOT, 'digest', d.file), 'utf8');

  const exp = Math.floor(Date.now() / 1000) + expDays * 86400;
  const sig = crypto.createHmac('sha256', DIGEST_KEY).update('approve|' + key + '|' + ws + '|' + exp).digest('hex');
  const approveUrl = WORKER + '/approve?key=' + encodeURIComponent(key) + '&ws=' + encodeURIComponent(ws) + '&exp=' + exp + '&sig=' + sig;

  html = html.replace(/(<body[^>]*>)/i, '$1' + banner(key, d.covers || ws, approveUrl));

  const r = await post('/send', { emailHtml: html, subject: 'Review — ' + subject, test: true, to }, DIGEST_KEY);
  if (r && r.ok) console.log('Sent review mock-up to ' + to + ' (key=' + key + ', weekStart=' + ws + '). Approve link expires in ' + expDays + ' days.');
  else { console.error('Send failed:', JSON.stringify(r)); process.exit(1); }
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
