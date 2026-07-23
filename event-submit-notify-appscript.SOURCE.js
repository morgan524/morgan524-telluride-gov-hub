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
 *   It ALSO sends a thank-you/confirmation to the SUBMITTER when the admin
 *   approves an event or org (event-review.html / org-review.html POST
 *   { action:'approval', kind, email, name, title } on Approve). See
 *   sendApprovalThankYou() + testApproval(). Approve-only; never on deny; only
 *   when the submission included an email.
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
var EVENTS_URL     = 'https://livabletelluride.org/events.html';
var ORGS_URL       = 'https://livabletelluride.org/local-orgs.html';
var LOCAL_NEWS_URL = 'https://livabletelluride.org/local-news.html';

/** Web-app entry point — the browser POSTs the submission JSON here. */
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    if (data && data.action === 'approval') {
      // Submitter thank-you, sent from event-review.html on Approve (events,
      // orgs, and letters).
      sendApprovalThankYou(data);
    } else if (data && data.action === 'denial') {
      // Gracious "not this time" note to the writer (letters). No reason given.
      sendDenialNote(data);
    } else if (data && data.action === 'letter-submit') {
      // New letter-to-the-editor heads-up to the admin, incl. the word count.
      sendLetterHeadsUp(data);
    } else {
      // New event/org submission heads-up to the admin (the original behavior).
      sendNotification(data);
    }
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
        + 'padding:10px 18px;border-radius:8px;font-weight:700;">Review &amp; Approve &#8594;</a></p>';
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

/**
 * Submitter THANK-YOU / confirmation, sent when the admin approves an event or
 * org at event-review.html / org-review.html. Payload:
 *   { action:'approval', kind:'event'|'org', email, name, title }
 * Sends only when a valid submitter email is present; replies route to info@.
 */
function sendApprovalThankYou(d) {
  var email = (d && d.email ? String(d.email) : '').trim();
  if (!/\S+@\S+\.\S+/.test(email)) return;   // no/invalid submitter email → nothing to send
  var kind    = (d.kind || 'event');
  var isOrg   = (kind === 'org');
  var isLetter= (kind === 'letter');
  var name    = (d.name ? String(d.name).trim() : '');
  var title   = (d.title ? String(d.title).trim() : (isOrg ? 'your organization' : isLetter ? 'your letter' : 'your event'));
  var where   = isOrg ? 'the Local Organizations directory' : isLetter ? 'Local News' : 'the community events calendar';
  var pageUrl = isOrg ? ORGS_URL : isLetter ? LOCAL_NEWS_URL : EVENTS_URL;
  // Pure-ASCII subject: Subject headers can't use HTML entities, and raw
  // non-ASCII (emoji, curly quotes, em dash) is what got mis-decoded as MacRoman
  // on recipients' mail clients.
  var subject = isOrg
    ? "You're in the directory - thanks for posting to Livable Telluride"
    : isLetter
    ? "Your letter to the editor has been approved for publication"
    : "You're on the calendar - thanks for posting to Livable Telluride";
  var greeting = name ? ('Hi ' + name + ',') : 'Hi there,';
  var cta = isOrg ? 'See the directory' : isLetter ? 'Read it on Local News' : 'See it on the calendar';

  // Letters get their own warmer body; events/orgs keep the original wording.
  if (isLetter) {
    var lhtml = ''
      + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:15px;color:#1a2e29;line-height:1.6;max-width:560px;">'
      + '<p style="margin:0 0 14px;">' + _esc(greeting) + '</p>'
      + '<p style="margin:0 0 14px;">Thank you for submitting your letter to the editor to Livable Telluride. '
      + 'We&#8217;re pleased to say it has been <strong>approved for publication</strong> and will be on the website shortly '
      + '(usually within a few minutes).</p>'
      + '<p style="margin:0 0 20px;"><a href="' + _esc(pageUrl) + '" '
      + 'style="display:inline-block;background:#1f5130;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:999px;'
      + 'font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:14px;">' + _esc(cta) + ' &#8594;</a></p>'
      + '<p style="margin:0 0 14px;">Thank you for taking the time to share your perspective with the community. '
      + 'We&#8217;d welcome another letter anytime.</p>'
      + '<p style="margin:18px 0 0;color:#5a6b64;">With gratitude,<br><strong>Livable Telluride</strong><br>'
      + '<a href="https://livabletelluride.org" style="color:#5a6b64;">livabletelluride.org</a></p>'
      + '</div>';
    var lplain = greeting + '\n\n'
      + 'Thank you for submitting your letter to the editor to Livable Telluride. We are pleased to say it has been '
      + 'approved for publication and will be on the website shortly (usually within a few minutes).\n\n'
      + cta + ': ' + pageUrl + '\n\n'
      + 'Thank you for sharing your perspective with the community. We would welcome another letter anytime.\n\n'
      + 'With gratitude,\nLivable Telluride\nhttps://livabletelluride.org';
    MailApp.sendEmail({ to: email, subject: subject, name: SENDER_NAME, htmlBody: lhtml, body: lplain, replyTo: NOTIFY_TO });
    return;
  }

  var html = ''
    + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:15px;color:#1a2e29;line-height:1.6;max-width:560px;">'
    + '<p style="margin:0 0 14px;">' + _esc(greeting) + '</p>'
    + '<p style="margin:0 0 14px;">Thank you for submitting <strong>' + _esc(title) + '</strong> to Livable Telluride. '
    + 'Good news &#8212; it&#8217;s been <strong>approved</strong> and will appear in ' + where + ' shortly '
    + '(usually within a few minutes).</p>'
    + '<p style="margin:0 0 20px;"><a href="' + _esc(pageUrl) + '" '
    + 'style="display:inline-block;background:#1f5130;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:999px;'
    + 'font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:14px;">' + _esc(cta) + ' &#8594;</a></p>'
    + '<p style="margin:0 0 14px;">We&#8217;re an independent, reader-funded nonprofit keeping the box canyon informed &#8212; '
    + 'please post again anytime you have something for the community.</p>'
    + '<p style="margin:18px 0 0;color:#5a6b64;">With gratitude,<br><strong>Livable Telluride</strong><br>'
    + '<a href="https://livabletelluride.org" style="color:#5a6b64;">livabletelluride.org</a></p>'
    + '</div>';

  var plain = greeting + '\n\n'
    + 'Thank you for submitting "' + title + '" to Livable Telluride. It has been approved and will appear in '
    + where + ' shortly (usually within a few minutes).\n\n'
    + cta + ': ' + pageUrl + '\n\n'
    + 'We are an independent, reader-funded nonprofit keeping the box canyon informed - please post again anytime.\n\n'
    + 'With gratitude,\nLivable Telluride\nhttps://livabletelluride.org';

  MailApp.sendEmail({
    to:       email,
    subject:  subject,
    name:     SENDER_NAME,
    htmlBody: html,
    body:     plain,
    replyTo:  NOTIFY_TO   // submitter replies land at info@
  });
}

/**
 * ADMIN heads-up when a Letter to the Editor is submitted (/submit-letter.html
 * POSTs { action:'letter-submit', name, email, title, wordCount, needsManual,
 * hasPhoto, hasDoc } right after the Firestore write). Emails info@ a summary —
 * with the WORD COUNT shown outside the letter text — and a link to the review
 * desk. The letter body itself is reviewed on /event-review.html, not here.
 */
function sendLetterHeadsUp(d) {
  var wc = (d && d.wordCount != null) ? String(d.wordCount) : '';
  var flag = d && d.needsManual
    ? 'Auto-copyedit was unavailable - read the original / uploaded document on the review desk.'
    : 'Auto-copyedit ran; a cleaned draft is ready to review.';
  var rows = [
    ['Headline',   d.title],
    ['From',       d.name],
    ['Email',      d.email],
    ['Word count', wc + (wc && (Number(wc) < 500 || Number(wc) > 750) ? '  (outside the 500-750 range)' : '')],
    ['Photo',      d.hasPhoto ? 'Yes' : 'No'],
    ['Document',   d.hasDoc ? 'Yes (uploaded)' : 'No (typed)'],
    ['Review note', flag]
  ];
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">';
  html += '<h2 style="margin:0 0 4px;color:#1f5130;">New letter to the editor</h2>';
  html += '<p style="margin:0 0 16px;color:#555;">Submitted on livabletelluride.org. Read, edit, and approve or deny it here:</p>';
  html += '<p style="margin:0 0 18px;"><a href="' + _esc(REVIEW_URL) + '" '
        + 'style="display:inline-block;background:#1f5130;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;">Review the letter &#8594;</a></p>';
  html += '<table style="border-collapse:collapse;width:100%;max-width:560px;">';
  rows.forEach(function (r) {
    var val = (r[1] == null ? '' : String(r[1])).trim();
    if (!val) return;
    html += '<tr><td style="padding:6px 10px;border:1px solid #e2e2e2;background:#f7f7f5;font-weight:700;white-space:nowrap;vertical-align:top;">'
          + _esc(r[0]) + '</td><td style="padding:6px 10px;border:1px solid #e2e2e2;">' + _esc(val) + '</td></tr>';
  });
  html += '</table></div>';
  var plain = rows.filter(function (r) { return r[1] != null && String(r[1]).trim(); })
    .map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nReview: ' + REVIEW_URL;
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New letter to the editor: ' + (d.title || ('from ' + (d.name || 'a reader'))),
    name: SENDER_NAME, htmlBody: html, body: plain,
    replyTo: (d.email && /\S+@\S+\.\S+/.test(d.email)) ? String(d.email) : undefined
  });
}

/**
 * Gracious "not this time" note to a letter writer when the admin denies a
 * letter (event-review.html POSTs { action:'denial', kind:'letter', email,
 * name, title }). Intentionally warm and NON-specific — it never states a
 * reason. Only sends when a valid writer email is present.
 */
function sendDenialNote(d) {
  var email = (d && d.email ? String(d.email) : '').trim();
  if (!/\S+@\S+\.\S+/.test(email)) return;
  var name = (d.name ? String(d.name).trim() : '');
  var greeting = name ? ('Hi ' + name + ',') : 'Hi there,';
  var subject = 'Thank you for your letter to Livable Telluride';
  var html = ''
    + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:15px;color:#1a2e29;line-height:1.6;max-width:560px;">'
    + '<p style="margin:0 0 14px;">' + _esc(greeting) + '</p>'
    + '<p style="margin:0 0 14px;">Thank you for taking the time to write to Livable Telluride and for sharing your '
    + 'perspective with us. We read every letter carefully.</p>'
    + '<p style="margin:0 0 14px;">After review, we&#8217;re not able to publish this particular letter. Please know this '
    + 'is not a judgment of you or the effort you put in &#8212; we simply can&#8217;t run everything we receive.</p>'
    + '<p style="margin:0 0 14px;">We genuinely hope you&#8217;ll write again. Community voices matter to us, and we&#8217;d '
    + 'welcome hearing from you on this or another topic down the road.</p>'
    + '<p style="margin:18px 0 0;color:#5a6b64;">With appreciation,<br><strong>Livable Telluride</strong><br>'
    + '<a href="https://livabletelluride.org" style="color:#5a6b64;">livabletelluride.org</a></p>'
    + '</div>';
  var plain = greeting + '\n\n'
    + 'Thank you for taking the time to write to Livable Telluride and for sharing your perspective with us. We read every letter carefully.\n\n'
    + 'After review, we are not able to publish this particular letter. Please know this is not a judgment of you or the effort you put in - we simply cannot run everything we receive.\n\n'
    + 'We genuinely hope you will write again. Community voices matter to us, and we would welcome hearing from you down the road.\n\n'
    + 'With appreciation,\nLivable Telluride\nhttps://livabletelluride.org';
  MailApp.sendEmail({ to: email, subject: subject, name: SENDER_NAME, htmlBody: html, body: plain, replyTo: NOTIFY_TO });
}

/** Run this manually from the editor to test the SUBMITTER thank-you (sends to
 *  NOTIFY_TO so you see it yourself). Flip kind to 'org' or 'letter' to test. */
function testApproval() {
  sendApprovalThankYou({ action: 'approval', kind: 'event', email: NOTIFY_TO, name: 'Jane', title: 'TEST — Community Potluck' });
}
/** Manual tests for the letter flows (each sends to NOTIFY_TO so you see it). */
function testLetterHeadsUp() {
  sendLetterHeadsUp({ action: 'letter-submit', name: 'Sam Reader', email: NOTIFY_TO, title: 'TEST — Why the plan matters', wordCount: 612, needsManual: false, hasPhoto: true, hasDoc: false });
}
function testLetterApproval() {
  sendApprovalThankYou({ action: 'approval', kind: 'letter', email: NOTIFY_TO, name: 'Sam', title: 'TEST — Why the plan matters' });
}
function testLetterDenial() {
  sendDenialNote({ action: 'denial', kind: 'letter', email: NOTIFY_TO, name: 'Sam', title: 'TEST — Why the plan matters' });
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
  s = String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // Non-ASCII -> numeric HTML entities so submitter names/titles with accents or
  // emoji are charset-proof too (kills the UTF-8-as-MacRoman mojibake). Array.from
  // iterates by code point, so an emoji becomes one correct entity.
  return Array.from(s).map(function (ch) {
    var cp = ch.codePointAt(0);
    return cp > 127 ? '&#' + cp + ';' : ch;
  }).join('');
}
function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
