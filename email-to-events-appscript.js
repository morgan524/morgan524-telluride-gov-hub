/**
 * ═══════════════════════════════════════════════════════════
 * LIVABLE TELLURIDE — Email-to-Events Google Apps Script
 * ═══════════════════════════════════════════════════════════
 *
 * Deploy this script on the dedicated Gmail account.
 * It processes incoming emails, extracts event details,
 * and writes them to a Google Sheet for the site to pick up.
 *
 * SETUP:
 * 1. Open Google Sheets → create a new sheet called "Event Inbox"
 * 2. Add headers in Row 1: Status | Title | Date | EndDate | Location | Time | Description | SourceURL | SubmittedAt | EmailSubject | EmailFrom
 * 3. Publish the sheet: File → Share → Publish to web (as CSV, entire document)
 * 4. Copy the published CSV URL — you'll need it for the scheduled task
 * 5. Open Extensions → Apps Script → paste this code → Save
 * 6. Run "setupTrigger" once to create the auto-check trigger
 * 7. Authorize when prompted
 */

// ── CONFIG ──
var SHEET_NAME = 'Event Inbox';
var CHECK_LABEL = 'Processed';  // Gmail label applied after processing
var MAX_EMAILS_PER_RUN = 10;
var NOTIFY_EMAIL = 'info@livabletelluride.org';

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
    messages.forEach(function(msg) {
      if (msg.isUnread()) {
        var eventData = parseEventEmail(msg);
        if (eventData) {
          Logger.log('Parsed event: ' + eventData.title);
          appendToSheet(sheet, eventData);
          newEvents.push(eventData);
        }
        msg.markRead();
      }
    });
    thread.addLabel(label);
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
  var subject = 'Livable Telluride: ' + events.length + ' new event' + (events.length > 1 ? 's' : '') + ' received';
  var body = 'The following event' + (events.length > 1 ? 's were' : ' was') + ' received via Events@livabletelluride.org and queued for the website:\n\n';

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
  body += 'These events will be automatically added to livabletelluride.org within 3 hours.\n';
  body += 'Review the Event Inbox sheet to edit details before they go live:\n';
  body += SpreadsheetApp.getActiveSpreadsheet().getUrl() + '\n';

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
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
 */
function parseEventEmail(msg) {
  var subject = msg.getSubject() || '';
  var body = msg.getPlainBody() || '';
  var from = msg.getFrom() || '';
  var received = msg.getDate();

  // Skip automated / system senders (Google security alerts, bounces, etc.).
  // These show up unread in events@ and would otherwise be queued as fake events.
  if (isSystemSender(from)) {
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

  // Extract fields using common patterns
  var title = extractField(body, subject, 'title') || cleanSubject(subject);
  var date = extractField(body, subject, 'date') || '';
  var endDate = extractField(body, subject, 'endDate') || '';
  var location = extractField(body, subject, 'location') || '';
  var time = extractField(body, subject, 'time') || '';
  var description = extractDescription(body) || body.substring(0, 500).trim();
  var sourceUrl = extractUrl(body) || '';

  // Require at least one positive event-like signal before queueing. Without
  // any of these, the email is almost certainly not an event submission and
  // shouldn't go on the calendar.
  var isForward = /^\s*(fwd?|fw)\s*:/i.test(subject);
  var hasEventKeyword = /\bevent\b|\bfundraiser\b|\bconcert\b|\bworkshop\b|\bmeeting\b|\bworkshop\b|\bopen\s+house\b|\bgala\b|\bbenefit\b/i.test(subject);
  var hasDateLocOrTime = !!(date || location || time);
  if (!isForward && !hasEventKeyword && !hasDateLocOrTime) {
    Logger.log('  Skipping (no event signal): from=' + from + ' subject="' + subject + '"');
    return null;
  }

  return {
    status: 'new',
    title: title,
    date: date,
    endDate: endDate,
    location: location,
    time: time,
    description: description,
    sourceUrl: sourceUrl,
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
    sheet.appendRow(['Status', 'Title', 'Date', 'EndDate', 'Location', 'Time', 'Description', 'SourceURL', 'SubmittedAt', 'EmailSubject', 'EmailFrom']);
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
    data.emailFrom
  ]);
}

/**
 * Get or create a Gmail label
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);
  return label;
}
