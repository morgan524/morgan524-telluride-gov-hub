/**
 * Livable Telluride — "New Event Submitted" email notifier (Apps Script web app)
 * ============================================================================
 *
 * PURPOSE
 *   events.html writes every "Submit an Event" submission to the Firestore
 *   collection `event_submissions` (status: 'pending'). That is the canonical
 *   review queue, surfaced at https://livabletelluride.org/event-review.html.
 *   This web app exists ONLY to send a heads-up email so the admin doesn't
 *   have to poll the queue: the browser POSTs the submission here right after
 *   the Firestore write succeeds, and this script emails a summary +
 *   Approve/Deny link to info@livabletelluride.org.
 *
 *   It does NOT write to Firestore, does NOT approve/deny anything, and is
 *   safe to redeploy at any time. If this web app is down, submissions still
 *   land in the queue — only the courtesy email is skipped.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DEPLOY (one time — do this in the Google account that should SEND the mail;
 *         info@livabletelluride.org is ideal so the From: matches the domain)
 *
 *   1. Go to https://script.google.com  → New project.
 *   2. Delete the default Code.gs contents and paste THIS ENTIRE FILE in.
 *   3. (Optional) Change NOTIFY_TO below if you want a different recipient.
 *   4. Click Deploy → New deployment → gear icon → "Web app".
 *        - Description:        Livable Telluride event-submit notifier
 *        - Execute as:         Me (the signed-in account)
 *        - Who has access:     Anyone
 *      Click Deploy. Authorize when prompted (it needs "send email as you").
 *   5. Copy the "Web app URL" — it ends in /exec. It looks like:
 *        https://script.google.com/macros/s/AKfyc.../exec
 *   6. Paste that URL into events.html → the NOTIFY_WEBAPP_URL constant
 *      (search the file for "paste the Apps Script /exec URL here"), commit,
 *      and push. Done — email alerts are live.
 *
 *   To TEST without the website: in the editor pick the function
 *   `testSend` from the dropdown and click Run. You should get a sample
 *   email at NOTIFY_TO within a minute.
 *
 *   NOTE: if you later edit this script, you must Deploy → "Manage
 *   deployments" → edit the existing deployment → "New version" for the
 *   change to take effect. A brand-new deployment gives a DIFFERENT /exec
 *   URL (which you'd then have to re-paste into events.html).
 * ──────────────────────────────────────────────────────────────────────────
 */

var NOTIFY_TO      = 'info@livabletelluride.org';
var REVIEW_URL     = 'https://livabletelluride.org/event-review.html';
var SENDER_NAME    = 'Livable Telluride';

/** Web-app entry point — the browser POSTs the submission JSON here. */
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    sendNotification(data);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** A GET just confirms the web app is alive (handy for a quick sanity check). */
function doGet() {
  return _json({ ok: true, service: 'event-submit-notify', ts: new Date().toISOString() });
}

function sendNotification(d) {
  // Two payload shapes are supported:
  //   1. GENERIC (any form): { subject, heading, reviewUrl, imageUrl,
  //      imageLabel, fields: [[label, value], ...] }. Used by the
  //      "Add Your Organization" modal on local-orgs.html and any future
  //      form — the website fully controls the email content.
  //   2. LEGACY EVENT (events.html "Submit an Event"): the flat
  //      title/date/time/location/url/name/email/org/description/imageUrl
  //      keys. Kept so the deployed script keeps working for events even
  //      before this generic version is re-deployed.
  var isGeneric = d && d.fields && d.fields.length;

  var heading, subject, reviewUrl, imageUrl, imageLabel, rows;
  if (isGeneric) {
    heading    = d.heading || 'New submission';
    subject    = d.subject || heading;
    reviewUrl  = d.reviewUrl || REVIEW_URL;
    imageUrl   = d.imageUrl || '';
    imageLabel = d.imageLabel || 'Image';
    rows       = d.fields;
  } else {
    heading    = 'New event submitted';
    subject    = 'New event submitted: ' + (d.title || '(untitled event)');
    reviewUrl  = REVIEW_URL;
    imageUrl   = d.imageUrl || '';
    imageLabel = 'Flyer';
    rows = [
      ['Title',        d.title],
      ['Date',         d.date],
      ['Time',         d.time],
      ['Location',     d.location],
      ['Link',         d.url],
      ['Submitted by', d.name],
      ['Email',        d.email],
      ['Organization', d.org],
      ['Description',  d.description]
    ];
  }

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">';
  html += '<h2 style="margin:0 0 4px;color:#1f5130;">' + _esc(heading) + '</h2>';
  html += '<p style="margin:0 0 16px;color:#555;">Submitted on livabletelluride.org. Review it in the queue:</p>';
  html += '<p style="margin:0 0 18px;"><a href="' + _esc(reviewUrl) + '" '
        + 'style="display:inline-block;background:#1f5130;color:#fff;text-decoration:none;'
        + 'padding:10px 18px;border-radius:8px;font-weight:700;">Review &amp; Approve →</a></p>';
  html += '<table style="border-collapse:collapse;width:100%;max-width:560px;">';
  rows.forEach(function (r) {
    var label = r[0], val = (r[1] == null ? '' : String(r[1])).trim();
    if (!val) return;
    html += '<tr>'
          + '<td style="padding:6px 10px;border:1px solid #e2e2e2;background:#f7f7f5;'
          + 'font-weight:700;white-space:nowrap;vertical-align:top;">' + _esc(label) + '</td>'
          + '<td style="padding:6px 10px;border:1px solid #e2e2e2;">' + _esc(val) + '</td>'
          + '</tr>';
  });
  html += '</table>';
  if (imageUrl) {
    html += '<p style="margin:16px 0 4px;font-weight:700;">' + _esc(imageLabel) + ':</p>';
    html += '<img src="' + _esc(imageUrl) + '" alt="" '
          + 'style="max-width:320px;border:1px solid #ddd;border-radius:8px;">';
  }
  html += '</div>';

  var plain = rows
    .filter(function (r) { return r[1] != null && String(r[1]).trim(); })
    .map(function (r) { return r[0] + ': ' + r[1]; })
    .join('\n') + '\n\nReview: ' + reviewUrl;

  // Best-effort reply-to: pull an email from the legacy field or any
  // generic field labeled like an email.
  var replyTo = d.email;
  if (!replyTo && isGeneric) {
    rows.forEach(function (r) {
      if (!replyTo && /email/i.test(r[0]) && /\S+@\S+\.\S+/.test(String(r[1] || ''))) replyTo = String(r[1]).trim();
    });
  }

  MailApp.sendEmail({
    to:       NOTIFY_TO,
    subject:  subject,
    name:     SENDER_NAME,
    htmlBody: html,
    body:     plain,
    replyTo:  (replyTo && /\S+@\S+\.\S+/.test(replyTo)) ? String(replyTo) : undefined
  });
}

/** Run this manually from the editor to test EVENT deliverability. */
function testSend() {
  sendNotification({
    title: 'TEST — Community Potluck',
    date: '2026-06-15', time: '5:00 PM',
    location: 'Town Park, Telluride',
    url: 'https://example.org/potluck',
    name: 'Jane Doe', email: 'jane@example.org',
    org: 'Telluride Neighbors',
    description: 'A test submission to confirm the notifier works end to end.'
  });
}

/** Run this manually from the editor to test the ORG (generic) format.
 *  If you get an email titled "New organization submitted" with a field
 *  table, the generic code is correctly saved. If you get a blank
 *  "New event submitted: (untitled event)", this Code.gs is still the OLD
 *  version — re-paste the whole file, SAVE, and run this again. */
function orgTest() {
  sendNotification({
    kind: 'org',
    subject: 'New organization submitted: TEST — Editor Org Check',
    heading: 'New organization submitted',
    reviewUrl: 'https://livabletelluride.org/org-review.html',
    imageLabel: 'Logo',
    fields: [
      ['Organization', 'TEST — Editor Org Check'],
      ['Website', 'https://example.org'],
      ['Donation URL', 'https://example.org/donate'],
      ['Category', 'nonprofit'],
      ['Town', 'Telluride, CO'],
      ['Description', 'Editor-side check that the generic org email format works.'],
      ['Contact email', 'test@example.org']
    ]
  });
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
