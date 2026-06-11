/**
 * ═══════════════════════════════════════════════════════════════════
 * LIVABLE TELLURIDE — Email-to-Events Google Apps Script (SOURCE COPY)
 * ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️  THIS FILE DOES NOT RUN ANYWHERE. It is a reference / source copy.
 *
 *     The script that ACTUALLY runs the email-to-events pipeline lives
 *     inside the events@livabletelluride.org Gmail account, at:
 *
 *       https://script.google.com/  → "Email-to-Events" project
 *       (or: events@ → Extensions → Apps Script)
 *
 *     Editing THIS file changes nothing in production. To deploy a
 *     change you MUST also:
 *       1. Open the Apps Script editor in the events@ account
 *       2. Paste the new code over the existing project
 *       3. Save (Cmd-S / Ctrl-S)
 *       4. Run setupTrigger() once (re-creates the 5-min email trigger)
 *       5. Authorize when prompted (Gmail + external requests)
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHAT THIS DOES (unified review queue, 2026-06-11):
 *   A trusted admin forwards an event email to events@ (or approve@/deny@,
 *   which are aliases that deliver to events@). Every 5 minutes this script
 *   best-guess-parses each new forward and writes it to the SAME Firestore
 *   collection the website "Submit an Event" form uses — event_submissions
 *   with status 'pending'. You then review it — and EDIT anything that's off,
 *   including the summary — at:
 *
 *       https://livabletelluride.org/event-review.html
 *
 *   Approve there → the event publishes to livabletelluride.org/events
 *   (events.html reads approved event_submissions directly). Deny → it never
 *   shows. One queue, one editable review page, for both forwarded emails and
 *   website-form submissions.
 *
 *   This REPLACES the old flow (Google-Sheet row + an Apps-Script web-app with
 *   Approve/Deny buttons in the email). That web app's deployment URL went
 *   stale and 404'd ("Sorry, unable to open the file"). There is no web app
 *   anymore — nothing to deploy as a web app, nothing to go stale.
 *
 *   The script still appends an audit row to the "Event Inbox" sheet with
 *   Status='hold' (never published from there; the content-refresh sheet
 *   sync only publishes 'new'/'added', so there's no double-publish).
 *
 * Only TRUSTED_APPROVERS may add events (the forward IS the authorization).
 * Anyone else who emails events@ is ignored.
 */

// ── CONFIG ──
var SHEET_NAME = 'Event Inbox';          // audit-trail sheet (optional)
var CHECK_LABEL = 'Processed';           // Gmail label applied after processing
var MAX_EMAILS_PER_RUN = 10;
var NOTIFY_EMAIL = 'info@livabletelluride.org';

// ── Firebase (the unified review queue) ──
// Forwarded events are written to the SAME Firestore collection the website
// "Submit an Event" form uses (event_submissions, status 'pending'). Because
// the security rules require a signed-in user to create a submission, this
// script first gets an ANONYMOUS Firebase id token (Identity Toolkit REST),
// then writes via the Firestore REST API with that token.
var FB_API_KEY = 'AIzaSyCyAjB0RA_LtoETyRqxVJor0lRB4NRyXF0';
var FB_PROJECT = 'telluride-gov-hub';
var REVIEW_URL = 'https://livabletelluride.org/event-review.html';

// Senders allowed to add events by forwarding. The forward itself is the
// authorization, so only these addresses are honored. From headers arrive as
// "Name <addr@host>", so a substring match handles the name-wrapping.
var TRUSTED_APPROVERS = [
  'info@livabletelluride.org',
  'morgancsmith99@gmail.com'
];

// Senders whose mail must NEVER be parsed as an event (account-security
// notices, bounces, calendar invites from automated systems, noreply, etc.).
var SYSTEM_SENDER_PATTERNS = [
  /\bno-?reply\b/i,
  /\bmailer-daemon\b/i,
  /\bpostmaster@/i,
  /\bbounce[s]?@/i,
  /\bnotifications?@/i,
  /\bdonotreply\b/i,
  /accounts\.google\.com/i,
  /security-noreply/i,
  /calendar-notification@google\.com/i
];

function isSystemSender(from) {
  if (!from) return false;
  for (var i = 0; i < SYSTEM_SENDER_PATTERNS.length; i++) {
    if (SYSTEM_SENDER_PATTERNS[i].test(from)) return true;
  }
  return false;
}

// Is this From address allowed to add events by forwarding?
function isTrustedApprover(from) {
  if (!from) return false;
  var lower = from.toLowerCase();
  for (var i = 0; i < TRUSTED_APPROVERS.length; i++) {
    if (lower.indexOf(TRUSTED_APPROVERS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

/**
 * Run this ONCE to set up the automatic trigger (checks email every 5 min).
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'processNewEmails' || fn === 'checkAddedEvents') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processNewEmails').timeBased().everyMinutes(5).create();
  Logger.log('Trigger created — email check every 5 min.');
}

/**
 * Main function — processes unread emails not yet labeled "Processed".
 * Each trusted forward → one Firestore event_submission (status 'pending')
 * + one audit row in the sheet. One review notification per batch.
 */
function processNewEmails() {
  var sheet = getOrCreateSheet();
  var label = getOrCreateLabel(CHECK_LABEL);
  var newEvents = [];

  var threads = GmailApp.search('is:unread -label:' + CHECK_LABEL, 0, MAX_EMAILS_PER_RUN);
  Logger.log('Found ' + threads.length + ' unread threads without Processed label');

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!msg.isUnread()) return;
      var eventData = parseEventEmail(msg);
      if (eventData) {
        var session = fbAnonSession();
        // If the event was forwarded AS an image (no flyer URL in the text),
        // grab the largest image attachment / inline image, upload it to
        // Firebase Storage, and use it as the flyer so it shows on the review
        // page and the published event card.
        if (session && !eventData.image) {
          var blob = getEventImageBlob(msg);
          if (blob) eventData.image = uploadEventImage(blob, session);
        }
        eventData.row = appendToSheet(sheet, eventData);                    // audit ('hold')
        eventData.firestoreOk = writeEventToFirestore(eventData, session);  // live review queue
        Logger.log('Queued: "' + eventData.title + '" (firestore=' + eventData.firestoreOk + ', image=' + (eventData.image ? 'yes' : 'no') + ')');
        newEvents.push(eventData);
      }
      msg.markRead();
    });
    thread.addLabel(label);
  });

  if (newEvents.length > 0) {
    sendReviewNotification(newEvents);
    Logger.log('Queued ' + newEvents.length + ' event(s) for review.');
  } else {
    Logger.log('No new events.');
  }
}

// ── Firebase: anonymous sign-in → write to event_submissions (pending) ──

// Start a short-lived anonymous Firebase session so the Firestore create
// passes the `isSignedIn()` rule and the Storage upload can write under the
// caller's own uid path. Returns { idToken, localId } or null.
function fbAnonSession() {
  try {
    var resp = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB_API_KEY,
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ returnSecureToken: true }), muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText() || '{}');
    if (!data.idToken) { Logger.log('  fbAnonSession: ' + resp.getResponseCode() + ' ' + resp.getContentText().substring(0, 200)); return null; }
    return { idToken: data.idToken, localId: data.localId };
  } catch (e) {
    Logger.log('  fbAnonSession error: ' + e.message);
    return null;
  }
}

// Pull the best flyer image from a forwarded email: the LARGEST image
// attachment or inline image (the main flyer; tiny logos/signatures lose).
// Returns a Blob or null.
function getEventImageBlob(msg) {
  try {
    var atts = msg.getAttachments({ includeInlineImages: true, includeAttachments: true });
    var best = null, bestSize = 0;
    for (var i = 0; i < atts.length; i++) {
      var a = atts[i];
      if ((a.getContentType() || '').indexOf('image/') !== 0) continue;
      var size = a.getBytes().length;
      if (size > bestSize && size < 10 * 1024 * 1024) { best = a; bestSize = size; }
    }
    return best;
  } catch (e) {
    Logger.log('  getEventImageBlob error: ' + e.message);
    return null;
  }
}

// Upload a flyer image to Firebase Storage at event-submissions/<uid>/… (the
// same path + rules the website "Submit an Event" form uses) and return a
// public download URL. Returns '' on failure.
function uploadEventImage(blob, session) {
  if (!blob || !session || !session.idToken) return '';
  try {
    var bucket = FB_PROJECT + '.firebasestorage.app';
    var name = (blob.getName() || 'flyer').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = 'event-submissions/' + session.localId + '/' + Date.now() + '_' + name;
    var url = 'https://firebasestorage.googleapis.com/v0/b/' + bucket
            + '/o?uploadType=media&name=' + encodeURIComponent(path);
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: blob.getContentType() || 'image/jpeg',
      headers: { Authorization: 'Bearer ' + session.idToken },
      payload: blob.getBytes(),
      muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      Logger.log('  Storage upload ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 300));
      return '';
    }
    var meta = JSON.parse(resp.getContentText() || '{}');
    if (!meta.downloadTokens) return '';
    return 'https://firebasestorage.googleapis.com/v0/b/' + bucket + '/o/'
         + encodeURIComponent(path) + '?alt=media&token=' + meta.downloadTokens;
  } catch (e) {
    Logger.log('  uploadEventImage error: ' + e.message);
    return '';
  }
}

// Write one parsed event into Firestore event_submissions (status 'pending').
// Field names match what events.html reads for approved submissions
// (title/date/time/location/description/url/imageUrl) so it renders identically.
function writeEventToFirestore(ev, session) {
  var token = session && session.idToken;
  if (!token) return false;
  var s = function(v) { return { stringValue: String(v == null ? '' : v) }; };
  var fields = {
    title:        s(String(ev.title || '').substring(0, 200)),
    date:         s(ev.date),
    time:         s(ev.time),
    location:     s(ev.location),
    description:  s(String(ev.description || '').substring(0, 5000)),
    url:          s(ev.sourceUrl),
    imageUrl:     s(ev.image),
    status:       s('pending'),
    source:       s('email'),
    emailFrom:    s(ev.emailFrom),
    emailSubject: s(ev.emailSubject),
    createdAt:    { timestampValue: new Date().toISOString() }
  };
  try {
    var url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT
            + '/databases/(default)/documents/event_submissions';
    var resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ fields: fields }), muteHttpExceptions: true });
    var ok = resp.getResponseCode() === 200;
    if (!ok) Logger.log('  Firestore write ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 300));
    return ok;
  } catch (e) {
    Logger.log('  Firestore write error: ' + e.message);
    return false;
  }
}

// One heads-up email per batch: a read-only preview + a link to the editable
// review page. (No Approve/Deny buttons in the email — you review and edit at
// event-review.html, which is a stable URL that can't go stale.)
function sendReviewNotification(events) {
  var n = events.length;
  var subject = n + ' event' + (n > 1 ? 's' : '') + ' forwarded — review & approve';

  var anyFailed = events.some(function(e) { return e.firestoreOk === false; });

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:600px;">'
    + '<h2 style="margin:0 0 4px;color:#1f5130;">' + n + ' event' + (n > 1 ? 's' : '') + ' forwarded for review</h2>'
    + '<p style="margin:0 0 16px;color:#555;">Best-guess parse of your forwarded email'
    + (n > 1 ? 's' : '') + '. Open the review page to see how '
    + (n > 1 ? 'they' : 'it') + ' will look, <strong>edit anything that’s off (including the summary)</strong>, then Approve to publish — or Deny.</p>'
    + '<p style="margin:0 0 20px;"><a href="' + esc(REVIEW_URL) + '" '
    + 'style="display:inline-block;background:#1f5130;color:#fff;text-decoration:none;'
    + 'padding:11px 22px;border-radius:8px;font-weight:700;">Review &amp; Approve →</a></p>';

  if (anyFailed) {
    html += '<p style="color:#a33;font-weight:700;">⚠ At least one event could not be saved to the review queue '
      + '(Firestore write failed — check the Apps Script execution log). It is in the audit sheet but won’t '
      + 'appear in the review page.</p>';
  }

  events.forEach(function(ev) {
    var rows = [
      ['Title', ev.title], ['Date', ev.date], ['Time', ev.time],
      ['Location', ev.location], ['Description', ev.description],
      ['Link', ev.sourceUrl], ['Forwarded from', ev.emailFrom]
    ];
    var table = '<table style="border-collapse:collapse;width:100%;max-width:600px;margin:0 0 18px;">';
    rows.forEach(function(r) {
      var v = (r[1] == null ? '' : String(r[1])).trim();
      if (!v) return;
      table += '<tr>'
        + '<td style="padding:6px 10px;border:1px solid #e2e2e2;background:#f7f7f5;font-weight:700;white-space:nowrap;vertical-align:top;">' + esc(r[0]) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #e2e2e2;">' + esc(v) + '</td></tr>';
    });
    table += '</table>';
    html += table;
  });

  html += '<p style="margin:8px 0 0;font-size:12px;color:#999;">Review page: ' + esc(REVIEW_URL) + '</p></div>';

  var plain = n + ' event(s) forwarded for review.\n\nReview, edit, and approve at: ' + REVIEW_URL + '\n\n'
    + events.map(function(ev) {
        return '• ' + (ev.title || '(untitled)') + ' — ' + (ev.date || '?')
             + (ev.time ? ' ' + ev.time : '') + (ev.location ? ' @ ' + ev.location : '');
      }).join('\n');

  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: subject, name: 'Livable Telluride', htmlBody: html, body: plain });
}

// HTML-escape helper.
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Parse an email into event fields. Only trusted senders are honored — the
 * forward IS the authorization. Returns null for system senders / untrusted
 * senders / unparseable mail.
 */
function parseEventEmail(msg) {
  var subject = msg.getSubject() || '';
  var body = msg.getPlainBody() || '';
  var from = msg.getFrom() || '';
  var received = msg.getDate();

  if (isSystemSender(from)) {
    Logger.log('  Skipping system sender: ' + from);
    return null;
  }
  if (!isTrustedApprover(from)) {
    Logger.log('  Skipping untrusted sender: ' + from);
    return null;
  }

  // Clean forwarded-message envelope lines — only when an envelope marker is
  // actually present (otherwise these strip a user's literal "Date:" line).
  if (/^-+\s*Forwarded message\s*-+/im.test(body)) {
    body = body.replace(/^-+\s*Forwarded message\s*-+/im, '');
    body = body.replace(/^From:.*$/im, '');
    body = body.replace(/^Date:.*$/im, '');
    body = body.replace(/^Subject:.*$/im, '');
    body = body.replace(/^To:.*$/im, '');
  }

  // Strip the website form's "EVENT SUBMISSION" header + audit-only lines.
  body = body.replace(/^EVENT SUBMISSION\s*\n=+\s*\n/im, '');
  body = body.replace(/^Submitted by:.*$/im, '');
  body = body.replace(/^Organization:.*$/im, '');

  var title = extractField(body, subject, 'title') || cleanSubject(subject);
  var date = extractField(body, subject, 'date') || '';
  var endDate = extractField(body, subject, 'endDate') || '';
  var location = extractField(body, subject, 'location') || '';
  var time = extractField(body, subject, 'time') || '';
  var description = extractDescription(body) || body.substring(0, 500).trim();
  var sourceUrl = extractUrl(body) || '';
  var image = extractImageUrl(body) || '';

  return {
    status: 'hold',   // audit-sheet status only; the live queue uses Firestore 'pending'
    title: title,
    date: date,
    endDate: endDate,
    location: location,
    time: time,
    description: description,
    sourceUrl: sourceUrl,
    image: image,
    submittedAt: Utilities.formatDate(received, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    emailSubject: subject,
    emailFrom: from
  };
}

/**
 * Try to extract a specific field from the email body.
 */
function extractField(body, subject, fieldType) {
  var patterns = {
    title: [
      /(?:event|title|name|what)\s*[:]\s*(.+)/i
    ],
    date: [
      /(?:date|when|starts?)\s*[:]\s*(.+)/i,
      /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:\s*[-–,]\s*\d{1,2})?\s*,?\s*\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/
    ],
    endDate: [
      /(?:end\s*date|ends?|through|until)\s*[:]\s*(.+)/i
    ],
    location: [
      /(?:location|where|place|venue|at)\s*[:]\s*(.+)/i,
      /(?:at|@)\s+([\w\s]+(?:Park|Hall|Center|Plaza|Lodge|Ave|St|Blvd|Rd|Theater|Theatre|Church|School|Library|Museum|Resort)[^.]*)/i
    ],
    time: [
      /(?:time|starts? at|begins?|doors?)\s*[:]\s*(.+)/i,
      /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\s*[-–]?\s*(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))?)/
    ]
  };
  var fieldPatterns = patterns[fieldType] || [];
  for (var i = 0; i < fieldPatterns.length; i++) {
    var match = body.match(fieldPatterns[i]);
    if (match && match[1]) return match[1].trim().substring(0, 200);
  }
  return '';
}

/**
 * Extract a description — prefers text after "Description:"/"Details:",
 * falls back to the first meaningful paragraph.
 */
function extractDescription(body) {
  var descMatch = body.match(/(?:description|details|about|info)\s*[:]\s*([\s\S]{20,500}?)(?:\n\n|\n[A-Z]|\Z)/i);
  if (descMatch) return descMatch[1].trim();
  var paragraphs = body.split(/\n\s*\n/);
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].trim();
    if (p.length > 20 && !/^(from|to|date|subject|sent):/i.test(p)) return p.substring(0, 500);
  }
  return '';
}

function extractUrl(body) {
  var match = body.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/);
  return match ? match[0] : '';
}

// Flyer/logo image URL — the "Flyer image:" line the events form/review page emit.
function extractImageUrl(body) {
  var m = body.match(/Flyer\s*image\s*[:]\s*(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i);
  return m ? m[1].trim() : '';
}

function cleanSubject(subject) {
  return subject.replace(/^(Fwd?|Re|FW)\s*:\s*/gi, '').replace(/^\[.*?\]\s*/, '').trim();
}

// ── Audit sheet (optional; never publishes from here) ──
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Status', 'Title', 'Date', 'EndDate', 'Location', 'Time', 'Description', 'SourceURL', 'SubmittedAt', 'EmailSubject', 'EmailFrom', 'Image']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendToSheet(sheet, data) {
  sheet.appendRow([
    data.status, data.title, data.date, data.endDate, data.location, data.time,
    data.description, data.sourceUrl, data.submittedAt, data.emailSubject, data.emailFrom, data.image || ''
  ]);
  return sheet.getLastRow();
}

function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);
  return label;
}
