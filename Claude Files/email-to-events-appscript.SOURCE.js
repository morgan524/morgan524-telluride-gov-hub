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
 *       4. If you added/removed a trigger function, re-run setupTrigger()
 *
 *     This file lives in version control so changes are reviewable and
 *     diffable, and so a future maintainer can re-create the deployed
 *     script if it's ever lost. But step 2 above is the gate — without
 *     it, the bug you "fixed" here is still live.
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * FIRST-TIME SETUP (only if the deployed script is being recreated):
 * 1. Open Google Sheets → create a new sheet called "Event Inbox"
 * 2. Add headers in Row 1: Status | Title | Date | EndDate | Location | Time | Description | SourceURL | SubmittedAt | EmailSubject | EmailFrom | Image
 *    (Image = flyer URL from the Submit-an-Event form; add it as the LAST/12th column on an existing sheet.)
 * 3. Publish the sheet: File → Share → Publish to web (as CSV, entire document)
 * 4. Copy the published CSV URL into email-events-config.json (sheetCsvUrl field)
 * 5. Open Extensions → Apps Script → paste this code → Save
 * 6. Run "setupTrigger" once to create the auto-check trigger
 * 7. Authorize when prompted
 *
 * See CLAUDE.md "Email-to-events ingestion pipeline" for the full
 * architecture and debug runbook.
 */

// ── CONFIG ──
var SHEET_NAME = 'Event Inbox';
var CHECK_LABEL = 'Processed';  // Gmail label applied after processing
var MAX_EMAILS_PER_RUN = 10;
var NOTIFY_EMAIL = 'info@livabletelluride.org';

// Shared secret for the Approve/Deny email buttons. The web-app doGet() checks
// it so the action links aren't trivially guessable. Random — change anytime
// (re-save + re-deploy the web app afterward).
var SECRET = 'a62a9ec3-5c16-4636-aa98-c91e0305351d';

// Approve/Deny alias addresses. Both are Workspace aliases that deliver
// to events@livabletelluride.org. When you forward a submission email to
// one of these, the handler below recognizes the recipient and writes a
// Sheet row with the matching Status.
var APPROVE_ALIAS = 'approve@livabletelluride.org';
var DENY_ALIAS    = 'deny@livabletelluride.org';
var APPROVED_LABEL = 'Approved';
var DENIED_LABEL   = 'Denied';

// Senders allowed to trigger approval/denial. Add additional addresses
// (e.g. a co-organizer) here if you want them to be able to approve
// events by forwarding. Sender check uses includes() against the From
// header, so case + name-wrapping ("Morgan Smith <morgan@...>") is fine.
var TRUSTED_APPROVERS = [
  'info@livabletelluride.org',
  'morgancsmith99@gmail.com'
];

// Senders whose mail must NEVER be parsed as an event. Google account-security
// notices, mailer-daemon bounces, calendar invites from automated systems,
// noreply addresses generally — all show up in the inbox unread and would
// otherwise get queued as bogus events.
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

/**
 * Was this message addressed to approve@ or deny@?
 *
 * Gmail aliases preserve the original recipient address in the
 * To/Cc headers AND in Delivered-To / X-Original-To headers. We
 * scan both because some forwarders strip one but not the other:
 *   - msg.getTo() / getCc() — what the sender typed
 *   - getRawContent() — the SMTP envelope, including Delivered-To
 *
 * Returns 'approve' | 'deny' | null.
 */
function detectApproveDenyAction(msg) {
  var addresses = ((msg.getTo() || '') + ' ' + (msg.getCc() || '')).toLowerCase();
  try {
    var raw = msg.getRawContent() || '';
    // Pull Delivered-To and X-Original-To headers (these are the actual
    // SMTP destinations; alias delivery shows here even when To: doesn't).
    var headerMatches = raw.match(/^(Delivered-To|X-Original-To):\s*([^\r\n]+)/gim) || [];
    addresses += ' ' + headerMatches.join(' ').toLowerCase();
  } catch (e) {
    // getRawContent can throw on very large messages; fall back to To/Cc only
    Logger.log('  detectApproveDenyAction: raw read failed: ' + e.message);
  }
  if (addresses.indexOf(APPROVE_ALIAS.toLowerCase()) !== -1) return 'approve';
  if (addresses.indexOf(DENY_ALIAS.toLowerCase()) !== -1)    return 'deny';
  return null;
}

/**
 * Is this From address allowed to trigger approve/deny? Whitelist check
 * is a soft guard — without it, anyone who guessed the alias could
 * approve fake events. From headers come as "Name <addr@host>" so we
 * do a substring match.
 */
function isTrustedApprover(from) {
  if (!from) return false;
  var lower = from.toLowerCase();
  for (var i = 0; i < TRUSTED_APPROVERS.length; i++) {
    if (lower.indexOf(TRUSTED_APPROVERS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

/**
 * Run this ONCE to set up the automatic trigger.
 * Checks for new emails every 5 minutes.
 */
function setupTrigger() {
  // Remove old triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'processNewEmails' || fn === 'checkAddedEvents') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Check for new emails every 5 minutes
  ScriptApp.newTrigger('processNewEmails')
    .timeBased()
    .everyMinutes(5)
    .create();
  // Check for events added to the live site every 10 minutes
  ScriptApp.newTrigger('checkAddedEvents')
    .timeBased()
    .everyMinutes(10)
    .create();
  Logger.log('Triggers created — email check every 5 min, added-events check every 10 min.');
}

/**
 * Main function — processes unread emails not yet labeled "Processed"
 */
function processNewEmails() {
  var sheet = getOrCreateSheet();
  Logger.log('Sheet found: ' + sheet.getName() + ' with ' + sheet.getLastRow() + ' rows');

  var label = getOrCreateLabel(CHECK_LABEL);
  var newEvents = [];

  // Find unread threads NOT already labeled
  var threads = GmailApp.search('is:unread -label:' + CHECK_LABEL, 0, MAX_EMAILS_PER_RUN);
  Logger.log('Found ' + threads.length + ' unread threads without Processed label');

  // If nothing found, log what IS in the inbox for debugging
  if (threads.length === 0) {
    var recent = GmailApp.search('newer_than:1d', 0, 5);
    Logger.log('Emails from last 24h: ' + recent.length);
    recent.forEach(function(t) {
      Logger.log('  Subject: ' + t.getFirstMessageSubject() + ' | Unread: ' + t.isUnread());
      t.getLabels().forEach(function(l) { Logger.log('    Label: ' + l.getName()); });
    });
  }

  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    Logger.log('Processing thread: ' + thread.getFirstMessageSubject() + ' (' + messages.length + ' messages)');
    var threadAction = null;  // 'approve' | 'deny' | null — drives label choice
    messages.forEach(function(msg) {
      if (msg.isUnread()) {
        // ── approve@ / deny@ alias path ──
        // When the user forwards a submission email to approve@ or deny@,
        // detect that here and short-circuit the normal "event-signal"
        // filter — the user's forward IS the signal. parseEventEmail's
        // optional second arg overrides the resulting Sheet Status.
        var action = detectApproveDenyAction(msg);
        if (action) {
          if (!isTrustedApprover(msg.getFrom())) {
            Logger.log('  IGNORED approve/deny — untrusted sender: ' + msg.getFrom());
            msg.markRead();
            return;
          }
          var eventData = parseEventEmail(msg, { action: action });
          if (eventData) {
            Logger.log('  ' + action.toUpperCase() + ' from ' + msg.getFrom() + ': ' + eventData.title);
            eventData.row = appendToSheet(sheet, eventData);
            newEvents.push(eventData);
            threadAction = action;
          }
          msg.markRead();
          return;
        }

        // ── normal events@ direct-receive path ──
        var eventData = parseEventEmail(msg);
        if (eventData) {
          Logger.log('Parsed event: ' + eventData.title);
          eventData.row = appendToSheet(sheet, eventData);
          newEvents.push(eventData);
        }
        msg.markRead();
      }
    });
    thread.addLabel(label);
    // Stack a more specific label on top so approved/denied threads are
    // visually distinct from normal "Processed" forwards in Gmail.
    if (threadAction === 'approve') thread.addLabel(getOrCreateLabel(APPROVED_LABEL));
    if (threadAction === 'deny')    thread.addLabel(getOrCreateLabel(DENIED_LABEL));
  });

  // Send notification for newly received events
  if (newEvents.length > 0) {
    sendReceiptNotification(newEvents);
    Logger.log('Added ' + newEvents.length + ' events to sheet and sent notification');
  } else {
    Logger.log('No new events processed');
  }
}

/**
 * Send notification when new event emails are received and parsed.
 */
function sendReceiptNotification(events) {
  // Group by action so each path gets a notification that accurately
  // describes what happened. A single batch can contain a mix if multiple
  // forwards land between two trigger ticks.
  var approved = events.filter(function(e) { return e.action === 'approve'; });
  var denied   = events.filter(function(e) { return e.action === 'deny'; });
  var direct   = events.filter(function(e) { return !e.action; });

  if (approved.length) sendActionNotification(approved, 'approve');
  if (denied.length)   sendActionNotification(denied, 'deny');
  if (direct.length)   sendDirectReceiptNotification(direct);
}

function sendActionNotification(events, action) {
  var n = events.length;
  var verb = action === 'approve' ? 'approved' : 'denied';
  var emoji = action === 'approve' ? '✅' : '❌';
  var subject = 'Livable Telluride: ' + n + ' event' + (n > 1 ? 's' : '') + ' ' + verb;
  var body = emoji + ' The following event' + (n > 1 ? 's were' : ' was') + ' ' + verb + ':\n\n';

  events.forEach(function(ev, i) {
    body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    body += (i + 1) + '. ' + ev.title + '\n';
    if (ev.date) body += '   Date: ' + ev.date + '\n';
    if (ev.location) body += '   Location: ' + ev.location + '\n';
    if (ev.time) body += '   Time: ' + ev.time + '\n';
    if (ev.description) body += '   Details: ' + ev.description.substring(0, 200) + '\n';
    if (ev.sourceUrl) body += '   Link: ' + ev.sourceUrl + '\n';
    body += '   From: ' + ev.emailFrom + '\n\n';
  });

  body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  if (action === 'approve') {
    body += 'These events will appear on livabletelluride.org/events within 6 hours\n';
    body += '(the next content-refresh run).\n\n';
  } else {
    body += 'These events were recorded with Status=skipped for the audit trail.\n';
    body += 'They will NOT appear on the site.\n\n';
  }
  body += 'Review or edit the Sheet:\n';
  body += SpreadsheetApp.getActiveSpreadsheet().getUrl() + '\n';

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

// Forwarded-to-events@ events are held (Status='hold') and sent to info@ as a
// REVIEW email with Approve / Deny buttons. The buttons are links to this
// script's web-app doGet(), which flips the row to 'new' (publish) or
// 'skipped' (discard). One email per event so each has its own buttons.
function sendDirectReceiptNotification(events) {
  var base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; }

  events.forEach(function(ev) {
    var subject = 'Review event: ' + (ev.title || '(untitled)');
    var rows = [
      ['Title', ev.title], ['Date', ev.date], ['Time', ev.time],
      ['Location', ev.location], ['Description', ev.description],
      ['Link', ev.sourceUrl], ['Forwarded from', ev.emailFrom]
    ];
    var table = '<table style="border-collapse:collapse;width:100%;max-width:560px;">';
    rows.forEach(function(r) {
      var v = (r[1] == null ? '' : String(r[1])).trim();
      if (!v) return;
      table += '<tr>'
        + '<td style="padding:6px 10px;border:1px solid #e2e2e2;background:#f7f7f5;font-weight:700;white-space:nowrap;vertical-align:top;">' + esc(r[0]) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #e2e2e2;">' + esc(v) + '</td></tr>';
    });
    table += '</table>';

    var buttons;
    if (base && ev.row) {
      var approveUrl = base + '?action=approve&row=' + ev.row + '&token=' + encodeURIComponent(SECRET);
      var denyUrl    = base + '?action=deny&row='    + ev.row + '&token=' + encodeURIComponent(SECRET);
      buttons = '<div style="margin:18px 0;">'
        + '<a href="' + approveUrl + '" style="display:inline-block;background:#1f5130;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;margin-right:10px;">✓ Approve &amp; Publish</a>'
        + '<a href="' + denyUrl + '" style="display:inline-block;background:#fff;color:#a33;border:1.5px solid rgba(170,51,51,0.4);text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;">✕ Deny</a>'
        + '</div>'
        + '<p style="font-size:12px;color:#888;margin:0;">Or edit the row in the Event Inbox sheet, then click Approve.</p>';
    } else {
      buttons = '<p style="color:#a33;font-weight:700;">⚠ Approve/Deny buttons unavailable — deploy this script as a Web App (Deploy → New deployment → Web app) so the buttons have a URL. For now, set this row\'s Status to "new" in the sheet to publish it.</p>';
    }

    var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">'
      + '<h2 style="margin:0 0 4px;color:#1f5130;">New event forwarded for review</h2>'
      + '<p style="margin:0 0 16px;color:#555;">Best-guess parse of a forwarded email. Approve to publish it to livabletelluride.org/events, or Deny.</p>'
      + table + buttons
      + '<p style="margin:16px 0 0;font-size:12px;color:#999;">Event Inbox sheet: ' + esc(SpreadsheetApp.getActiveSpreadsheet().getUrl()) + '</p>'
      + '</div>';

    var plain = 'New event forwarded for review: ' + ev.title
      + '\nDate: ' + (ev.date || '?') + '   Time: ' + (ev.time || '?') + '   Location: ' + (ev.location || '?')
      + '\n\n' + (ev.description || '')
      + (base && ev.row ? ('\n\nApprove: ' + base + '?action=approve&row=' + ev.row + '&token=' + SECRET
                          + '\nDeny:    ' + base + '?action=deny&row='    + ev.row + '&token=' + SECRET) : '');

    MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: subject, name: 'Livable Telluride', htmlBody: html, body: plain });
  });
}

// HTML-escape helper for the review email.
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Web app: the Approve/Deny buttons in the review email link here ──
// Deploy this script as a Web App (Deploy → New deployment → type "Web app",
// Execute as: Me [events@], Who has access: Anyone). doGet flips the held row.
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = (p.action || '').toLowerCase();
  var row = parseInt(p.row, 10);
  if (p.token !== SECRET) return htmlPage('This link is invalid or has expired.');
  if (!row || (action !== 'approve' && action !== 'deny')) return htmlPage('Bad request.');

  var sheet = getOrCreateSheet();
  if (row < 2 || row > sheet.getLastRow()) return htmlPage('That event row no longer exists.');
  var cur = String(sheet.getRange(row, 1).getValue()).toLowerCase();
  var title = sheet.getRange(row, 2).getValue();
  if (cur !== 'hold') {
    return htmlPage('Already ' + (cur === 'new' || cur === 'added' || cur === 'notified' ? 'approved' : (cur === 'skipped' ? 'denied' : cur)) + ': “' + title + '”.');
  }
  sheet.getRange(row, 1).setValue(action === 'approve' ? 'new' : 'skipped');
  return htmlPage(action === 'approve'
    ? '✅ Approved: “' + title + '”. It will appear on livabletelluride.org/events within ~6 hours.'
    : '✕ Denied: “' + title + '”. It will not be published.');
}

function htmlPage(msg) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 20px;text-align:center;font-size:17px;line-height:1.5;color:#1a2e29;">'
    + msg + '</div>'
  );
}

/**
 * Check for events that have been added to the live site.
 * The scheduled task changes Status from "new" to "added".
 * This function sends a confirmation and marks them "notified".
 * Runs on a 10-minute timer (set up by setupTrigger).
 */
function checkAddedEvents() {
  var sheet = getOrCreateSheet();
  var data = sheet.getDataRange().getValues();
  var addedEvents = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === 'added') {
      addedEvents.push({
        row: i + 1,
        title: data[i][1],
        date: data[i][2],
        location: data[i][4]
      });
    }
  }

  if (addedEvents.length === 0) return;

  // Send confirmation
  var subject = 'Livable Telluride: ' + addedEvents.length + ' event' + (addedEvents.length > 1 ? 's' : '') + ' now live on site';
  var body = 'The following event' + (addedEvents.length > 1 ? 's are' : ' is') + ' now live on livabletelluride.org:\n\n';

  addedEvents.forEach(function(ev, i) {
    body += (i + 1) + '. ' + ev.title;
    if (ev.date) body += ' — ' + ev.date;
    if (ev.location) body += ' (' + ev.location + ')';
    body += '\n';
  });

  body += '\nView the site: https://livabletelluride.org\n';

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);

  // Mark as notified so we don't send again
  addedEvents.forEach(function(ev) {
    sheet.getRange(ev.row, 1).setValue('notified');
  });
}

/**
 * Parse an email into event fields.
 * Handles both structured forwarded emails and free-form text.
 *
 * opts.action ('approve' | 'deny') overrides the resulting Sheet Status
 * and skips the system-sender + event-signal filters (because the user
 * explicitly chose to forward — that IS the signal).
 */
function parseEventEmail(msg, opts) {
  opts = opts || {};
  var action = opts.action || null;
  var subject = msg.getSubject() || '';
  var body = msg.getPlainBody() || '';
  var from = msg.getFrom() || '';
  var received = msg.getDate();

  // Skip automated / system senders — UNLESS this is an explicit approve/deny
  // forward, in which case the user has already vouched for the message.
  if (!action && isSystemSender(from)) {
    Logger.log('  Skipping system sender: ' + from + ' / subject="' + subject + '"');
    return null;
  }

  // Clean up forwarded email markers — but ONLY if the body actually contains
  // a "---------- Forwarded message ----------" envelope. Otherwise these
  // regexes silently strip a user's literal "Date: May 15, 2026" line and the
  // date extractor never sees it.
  if (/^-+\s*Forwarded message\s*-+/im.test(body)) {
    body = body.replace(/^-+\s*Forwarded message\s*-+/im, '');
    // Strip the standard envelope lines that follow the marker (and only
    // those — applying once so we don't keep eating real fields below).
    body = body.replace(/^From:.*$/im, '');
    body = body.replace(/^Date:.*$/im, '');
    body = body.replace(/^Subject:.*$/im, '');
    body = body.replace(/^To:.*$/im, '');
  }

  // The events.html form prefixes the body with "EVENT SUBMISSION" and an
  // "===" rule; strip those so they don't end up in the parsed description.
  body = body.replace(/^EVENT SUBMISSION\s*\n=+\s*\n/im, '');
  // Submitted-by / Organization lines belong on the audit trail, not in
  // the public description.
  body = body.replace(/^Submitted by:.*$/im, '');
  body = body.replace(/^Organization:.*$/im, '');

  // Extract fields using common patterns
  var title = extractField(body, subject, 'title') || cleanSubject(subject);
  var date = extractField(body, subject, 'date') || '';
  var endDate = extractField(body, subject, 'endDate') || '';
  var location = extractField(body, subject, 'location') || '';
  var time = extractField(body, subject, 'time') || '';
  var description = extractDescription(body) || body.substring(0, 500).trim();
  var sourceUrl = extractUrl(body) || '';
  var image = extractImageUrl(body) || '';

  // Direct-to-events@ auto-add is ADMIN-ONLY (2026-06-03). Only a trusted
  // sender (TRUSTED_APPROVERS = info@livabletelluride.org + morgancsmith99@
  // gmail.com) may add an event simply by emailing events@. This is the
  // "no approval step needed because only I can do it" model — the trusted
  // sender IS the authorization. Anyone else who emails events@ is ignored
  // (their mail is NOT published). The separate approve@/deny@ forward flow
  // (action !== null) is unaffected by this gate.
  if (!action) {
    if (!isTrustedApprover(from)) {
      Logger.log('  Skipping (not a trusted admin sender for direct add): from=' + from);
      return null;
    }
    // A trusted admin's email IS the event — no keyword/date gate. The
    // subject becomes the title and the body becomes the description/summary,
    // plus any Date/Location/Time the body contains (best-effort).
  }

  // Status mapping:
  //   action === 'approve' → 'new'     (approve@ alias — publish next refresh)
  //   action === 'deny'    → 'skipped' (deny@ alias — audit trail, never live)
  //   no action (forward to events@) → 'hold' — NOT published; instead this
  //     triggers a review email to info@ with Approve/Deny buttons. Clicking
  //     Approve flips the row to 'new' (then it publishes); Deny → 'skipped'.
  var status = action === 'deny' ? 'skipped'
             : action === 'approve' ? 'new'
             : 'hold';

  return {
    status: status,
    action: action,  // 'approve' | 'deny' | null — drives notification copy
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
 * Looks for patterns like "Date: April 5, 2026" or "Where: Town Park"
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
    if (match && match[1]) {
      return match[1].trim().substring(0, 200);
    }
  }
  return '';
}

/**
 * Extract a description — prefers text after "Description:" or "Details:"
 * Falls back to first meaningful paragraph.
 */
function extractDescription(body) {
  var descMatch = body.match(/(?:description|details|about|info)\s*[:]\s*([\s\S]{20,500}?)(?:\n\n|\n[A-Z]|\Z)/i);
  if (descMatch) return descMatch[1].trim();

  // Fall back to first paragraph with 20+ chars
  var paragraphs = body.split(/\n\s*\n/);
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].trim();
    if (p.length > 20 && !/^(from|to|date|subject|sent):/i.test(p)) {
      return p.substring(0, 500);
    }
  }
  return '';
}

/**
 * Extract first URL from the body
 */
function extractUrl(body) {
  var match = body.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/);
  return match ? match[0] : '';
}

/**
 * Extract the flyer/logo image URL — the "Flyer image:" line that the events
 * form + review page emit (the image is uploaded to Firebase Storage). Parsed
 * separately from extractUrl() so the flyer never clobbers the event's source
 * URL. Flows into the Sheet's Image column → community-events.json imageUrl.
 */
function extractImageUrl(body) {
  var m = body.match(/Flyer\s*image\s*[:]\s*(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i);
  return m ? m[1].trim() : '';
}

/**
 * Clean up the email subject for use as title
 */
function cleanSubject(subject) {
  return subject
    .replace(/^(Fwd?|Re|FW)\s*:\s*/gi, '')
    .replace(/^\[.*?\]\s*/, '')
    .trim();
}

/**
 * Get or create the target spreadsheet sheet
 */
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

/**
 * Append parsed event data to the sheet
 */
function appendToSheet(sheet, data) {
  sheet.appendRow([
    data.status,
    data.title,
    data.date,
    data.endDate,
    data.location,
    data.time,
    data.description,
    data.sourceUrl,
    data.submittedAt,
    data.emailSubject,
    data.emailFrom,
    data.image || ''
  ]);
  return sheet.getLastRow();  // row number of the row just appended
}

/**
 * Get or create a Gmail label
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);
  return label;
}
