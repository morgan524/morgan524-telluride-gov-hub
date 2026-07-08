/**
 * Hub-Bub email-in lane — Gmail Apps Script
 * ─────────────────────────────────────────────────────────────────────────
 * Lets you FORWARD a Town/County notice into the Hub-Bub surfacing pipeline:
 * a forwarded email you label "HubBub" is pushed to the Worker (/pulse-submit),
 * which queues it (pulse_inbox); the daily run-pulse loop then drafts it as a
 * Rick-voice discussion prompt and emails it back to you to approve. Anything
 * you forward is always drafted (you chose it) — you still approve/deny.
 *
 * ── ONE-TIME SETUP (in the Gmail account that receives your forwards) ──
 * 1. script.google.com → New project → paste this whole file.
 * 2. Project Settings → Script properties → add:
 *      EDITORIAL_SECRET = <the same secret set on the Worker + GitHub Actions>
 * 3. In Gmail, make a label "HubBub" (Labels → Create). Either apply it by hand
 *    to any email you want surfaced, OR add a Gmail filter (e.g. forwards to a
 *    dedicated address / from telluride.gov) that auto-applies "HubBub".
 * 4. Back in Apps Script, run installTrigger() once and grant permission. Done —
 *    it checks hourly. (Run processHubBubInbox() once to test.)
 *
 * Nothing publishes from here — this only queues a candidate. The human approval
 * gate is still the tokenized review email from the pipeline.
 */

var WORKER = 'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev';
var LABEL = 'HubBub';           // apply to emails you want surfaced
var DONE_LABEL = 'HubBub/Done'; // moved here after a successful push
var MAX_PER_RUN = 25;

function processHubBubInbox() {
  var secret = PropertiesService.getScriptProperties().getProperty('EDITORIAL_SECRET');
  if (!secret) { Logger.log('Set EDITORIAL_SECRET in Script properties first.'); return; }
  var label = GmailApp.getUserLabelByName(LABEL);
  if (!label) { Logger.log('Create a Gmail label "' + LABEL + '" and apply it to emails to surface.'); return; }
  var done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);

  var threads = label.getThreads(0, MAX_PER_RUN);
  var pushed = 0;
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    var m = msgs[msgs.length - 1]; // the forwarded message is the latest in the thread
    var subject = m.getSubject().replace(/^\s*(fwd?|fw):\s*/i, '').trim();
    var body = cleanForwardedBody(m.getPlainBody());
    if (!body && !subject) { threads[i].removeLabel(label).addLabel(done); continue; }
    var url = (body.match(/https?:\/\/[^\s>)\]]+/) || [''])[0];
    var payload = {
      secret: secret,
      id: m.getId(),                 // Gmail message id → idempotent queue doc id
      title: subject,
      body: body.slice(0, 18000),
      url: url,
      from: m.getFrom(),
    };
    try {
      var res = UrlFetchApp.fetch(WORKER + '/pulse-submit', {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) { threads[i].removeLabel(label).addLabel(done); pushed++; }
      else { Logger.log('submit failed ' + res.getResponseCode() + ': ' + res.getContentText()); }
    } catch (e) { Logger.log('error: ' + e); }
  }
  Logger.log('HubBub: pushed ' + pushed + ' of ' + threads.length + ' labeled thread(s).');
}

// Strip common forwarded-email chrome so the model sees the notice, not headers.
function cleanForwardedBody(t) {
  t = String(t || '');
  t = t.replace(/^[\s\S]*?-{3,}\s*Forwarded message\s*-{3,}\s*\n(?:[^\n]*\n)*?\n/i, ''); // drop the "Forwarded message" header block
  t = t.replace(/\n\s*On .*\bwrote:\s*[\s\S]*$/i, '');       // drop quoted reply trailers
  t = t.replace(/\[https?:\/\/[^\]]+\]/g, '');               // drop bracketed tracking links
  return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Run once to install the hourly trigger.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processHubBubInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processHubBubInbox').timeBased().everyHours(1).create();
  Logger.log('Installed: processHubBubInbox runs hourly.');
}
