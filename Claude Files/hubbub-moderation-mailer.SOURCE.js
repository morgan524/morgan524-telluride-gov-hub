/**
 * Hub-Bub moderation mailer — Google Apps Script (source copy).
 *
 * THIS FILE DOES NOT RUN HERE. It must be pasted into a Google Apps Script
 * project under the info@livabletelluride.org account and deployed as a Web App.
 *
 * Role: the Cloudflare Worker `/moderate` endpoint POSTs a pre-built HTML email
 * here (Cloudflare Workers can't send email); this script relays it via Gmail to
 * info@livabletelluride.org. The email contains the one-click Accept/Deny links,
 * which point back at the Worker `/moderation-action` (NOT at this script).
 *
 * ─────────────────────────── DEPLOY (one time) ───────────────────────────
 * 1. https://script.google.com  → New project (signed in as info@livabletelluride.org).
 * 2. Paste this whole file. Save.
 * 3. (Optional but recommended) Project Settings → Script properties → add
 *    `RELAY_SECRET` = any long random string. If set, requests must include the
 *    same secret or they're ignored (blocks spam to your inbox). Put the SAME
 *    string in the Worker as the `MAIL_RELAY_SECRET` variable.
 * 4. Run `testSend` once → authorize the Gmail scope when prompted (check your
 *    inbox for the test email).
 * 5. Deploy → New deployment → type "Web app" → Execute as: Me →
 *    Who has access: "Anyone" → Deploy. Copy the /exec URL.
 * 6. Give that /exec URL to Claude (or set it yourself) as the Worker variable
 *    `MAIL_RELAY_URL`. Done.
 *
 * Editing later: Deploy → Manage deployments → (edit) → Version: New version,
 * or the /exec URL changes.
 */

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);

    // Optional shared-secret gate. Enforced only if RELAY_SECRET is set.
    var want = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (want && String(d.secret || '') !== want) {
      return _json({ ok: false, msg: 'unauthorized' });
    }

    if (d && d.kind === 'moderation' && d.html) {
      MailApp.sendEmail({
        to: 'info@livabletelluride.org',        // hardcoded recipient — never honor d.to
        subject: d.subject || 'Hub-Bub post flagged for review',
        htmlBody: d.html,
        name: 'Livable Telluride Hub-Bub'
      });
      return _json({ ok: true });
    }
    return _json({ ok: false, msg: 'ignored' });
  } catch (err) {
    return _json({ ok: false, msg: String(err) });
  }
}

// Lets you open the /exec URL in a browser to confirm it's deployed.
function doGet() {
  return _json({ ok: true, service: 'hubbub-moderation-mailer' });
}

function testSend() {
  MailApp.sendEmail({
    to: 'info@livabletelluride.org',
    subject: 'Hub-Bub mailer test',
    htmlBody: '<p>If you got this, the moderation mailer is deployed and authorized.</p>',
    name: 'Livable Telluride Hub-Bub'
  });
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
