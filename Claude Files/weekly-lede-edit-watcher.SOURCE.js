/**
 * weekly-lede-edit-watcher.SOURCE.js  —  Apps Script (reference copy)
 * ───────────────────────────────────────────────────────────────────
 * Closes the loop on the SATURDAY weekly-email review: when you REPLY to the
 * "The Week Ahead — ..." review email with corrected intro text, this captures
 * it and writes data/week-ahead-lede.json in the repo, keyed by the week the
 * email covers. scripts/weekly-email.js then reads your wording the next time
 * the draft is rendered.
 *
 * ⚠️ IMPORTANT — the edit does NOT change an already-sent draft. The Saturday
 * run emails the review AND uploads a paste-ready artifact. After you reply
 * with an edit, RE-RUN the "Weekly Email Preview" workflow (GitHub → Actions →
 * Weekly Email Preview → Run workflow) to regenerate the draft + artifact with
 * your new intro, then send that through Mailchimp.
 *
 * THIS FILE DOES NOT RUN ANYWHERE. The live copy lives in the
 * info@livabletelluride.org Google account → Extensions/Apps Script. Edits
 * here are reference-only until pasted into that editor.
 *
 * ── ONE-TIME SETUP (in the info@ Google account) ──
 *  1. script.google.com → New project → paste this file (replace the old one).
 *  2. Project Settings → Script properties → add (if not already there):
 *       GITHUB_TOKEN  = a fine-grained GitHub PAT with "Contents: Read and
 *                       write" on morgan524/morgan524-telluride-gov-hub
 *       GITHUB_REPO   = morgan524/morgan524-telluride-gov-hub   (optional; default)
 *  3. Run setupTrigger() once and authorize (Gmail + external requests).
 *
 * ── HOW YOU USE IT ──
 *  Reply to the Saturday review email with ONLY the corrected intro text.
 *  - A reply of just "approved" / "looks good" / "ok" / "send it" → no change.
 *  - Any other text → becomes that week's "Week Ahead" intro.
 *  Quoted original text and signatures are stripped automatically. You get a
 *  confirmation email back. The week is read from the "week-key YYYY-MM-DD"
 *  marker the review email carries (falls back to the upcoming Monday).
 */

var REPO = (PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || 'morgan524/morgan524-telluride-gov-hub');
var LEDE_PATH = 'data/week-ahead-lede.json';
var REVIEW_SUBJECT_MATCH = 'The Week Ahead';
var APPROVAL_WORDS = /^(approved|approve|looks good|lgtm|ok|okay|send it|good to go|👍|yes)\.?$/i;

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processLedeEdits') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processLedeEdits').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: processLedeEdits every 15 min.');
}

// The week the edit applies to. Prefer the explicit "week-key YYYY-MM-DD" marker
// the review email embeds (robust, incl. across year boundaries); otherwise fall
// back to the upcoming Monday (the week a Saturday review covers).
function targetWeekKey_(rawBody) {
  var m = /week-key\s+(\d{4}-\d{2}-\d{2})/i.exec(rawBody || '');
  if (m) return m[1];
  return upcomingMondayISO_();
}

function upcomingMondayISO_() {
  var d = new Date();
  var dow = d.getUTCDay();                  // 0=Sun .. 6=Sat
  var add = (dow === 1) ? 0 : ((8 - dow) % 7); // Mon→0, Sun→1, Sat→2, Tue..Fri→next week
  var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
  var nd = new Date(t);
  var mm = ('0' + (nd.getUTCMonth() + 1)).slice(-2);
  var dd = ('0' + nd.getUTCDate()).slice(-2);
  return nd.getUTCFullYear() + '-' + mm + '-' + dd;
}

function processLedeEdits() {
  // Unread replies to the review email, not yet processed.
  var threads = GmailApp.search('is:unread subject:"' + REVIEW_SUBJECT_MATCH + '" -label:LedeProcessed newer_than:7d');
  if (!threads.length) return;
  var label = getOrCreateLabel_('LedeProcessed');

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msgs = thread.getMessages();
    var last = msgs[msgs.length - 1];
    // Only act on an actual REPLY (more than the original message in the thread).
    if (msgs.length < 2) { continue; }

    var rawBody = last.getPlainBody();
    var weekKey = targetWeekKey_(rawBody);
    var lede = cleanReplyBody_(rawBody);
    if (!lede || APPROVAL_WORDS.test(lede)) {
      // Approval / no edit — just mark processed.
      thread.addLabel(label);
      thread.markRead();
      continue;
    }

    try {
      commitLede_(weekKey, lede);
      GmailApp.sendEmail('info@livabletelluride.org',
        'Re: The Week Ahead — intro updated ✓',
        'Got it. The "Week Ahead" intro for the week of ' + weekKey + ' has been set to:\n\n' + lede +
        '\n\nNOTE: this does not change the draft that already went out. To use it, re-run the ' +
        '"Weekly Email Preview" workflow (GitHub → Actions → Weekly Email Preview → Run workflow) ' +
        'to regenerate the draft + paste-ready file, then send that through Mailchimp.');
    } catch (e) {
      GmailApp.sendEmail('info@livabletelluride.org',
        'Re: The Week Ahead — intro update FAILED',
        'Could not save your edit: ' + e.message + '\n\nReply again or edit data/week-ahead-lede.json manually.');
    }
    thread.addLabel(label);
    thread.markRead();
  }
}

// Strip quoted original ("On ... wrote:" + leading ">"), signatures, and
// collapse to the user's new intro text.
function cleanReplyBody_(body) {
  if (!body) return '';
  var s = String(body);
  // Cut everything from the quoted-original marker onward.
  s = s.split(/^On .*wrote:$/m)[0];
  s = s.split(/^_{5,}$/m)[0];          // Outlook divider
  s = s.split(/^-{2,}\s*Original Message/m)[0];
  // Drop quoted lines.
  s = s.split('\n').filter(function (line) { return !/^\s*>/.test(line); }).join('\n');
  // Drop a trailing signature after a "-- " line.
  s = s.split(/^-- $/m)[0];
  return s.replace(/\s+\n/g, '\n').trim();
}

// Read-modify-write data/week-ahead-lede.json: set map[weekKey] = lede, keeping
// every other entry (incl. "_comment" and "default") intact.
function commitLede_(weekKey, lede) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN script property not set.');
  var apiBase = 'https://api.github.com/repos/' + REPO + '/contents/' + LEDE_PATH;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };

  // Get current file (SHA + content) so we can update in place.
  var sha = null, map = {};
  var getResp = UrlFetchApp.fetch(apiBase, { headers: headers, muteHttpExceptions: true });
  if (getResp.getResponseCode() === 200) {
    var j = JSON.parse(getResp.getContentText());
    sha = j.sha;
    try {
      var decoded = Utilities.newBlob(Utilities.base64Decode(String(j.content).replace(/\s/g, ''))).getDataAsString();
      map = JSON.parse(decoded) || {};
    } catch (e) { map = {}; }
  }
  map[weekKey] = lede;

  var content = JSON.stringify(map, null, 2) + '\n';
  var payload = {
    message: 'weekly lede edit (review reply) ' + weekKey,
    content: Utilities.base64Encode(content),
    committer: { name: 'Gov Hub Bot', email: 'bot@livabletelluride.org' },
  };
  if (sha) payload.sha = sha;
  var putResp = UrlFetchApp.fetch(apiBase, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  var code = putResp.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error('GitHub API ' + code + ': ' + putResp.getContentText().slice(0, 300));
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
