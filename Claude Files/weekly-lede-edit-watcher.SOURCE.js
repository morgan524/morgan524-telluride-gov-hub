/**
 * weekly-lede-edit-watcher.SOURCE.js  —  Apps Script (reference copy)
 * ───────────────────────────────────────────────────────────────────
 * Closes the loop on the Thursday weekly-email review: when you REPLY to
 * the "Weekly email preview" email with corrected lede text, this captures
 * it and commits data/week-ahead-override.json to the repo. The next
 * content-refresh build (build-rss-feed.js applyLedeOverride) then uses your
 * wording for Friday's send instead of the AI's.
 *
 * THIS FILE DOES NOT RUN ANYWHERE. The live copy lives in the
 * info@livabletelluride.org Google account → Extensions/Apps Script. Edits
 * here are reference-only until pasted into that editor.
 *
 * ── ONE-TIME SETUP (in the info@ Google account) ──
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings → Script properties → add:
 *       GITHUB_TOKEN  = a fine-grained GitHub PAT with "Contents: Read and
 *                       write" on morgan524/morgan524-telluride-gov-hub
 *       GITHUB_REPO   = morgan524/morgan524-telluride-gov-hub   (optional; this is the default)
 *  3. Run setupTrigger() once and authorize (Gmail + external requests).
 *
 * ── HOW YOU USE IT ──
 *  Reply to the Thursday preview email with ONLY the corrected lede text.
 *  - A reply of just "approved" / "looks good" / "ok" / "send it" → no change
 *    (the AI lede stands).
 *  - Any other text → becomes Friday's lede.
 *  Quoted original text and signatures are stripped automatically. You get a
 *  confirmation email back.
 */

var REPO = (PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || 'morgan524/morgan524-telluride-gov-hub');
var OVERRIDE_PATH = 'data/week-ahead-override.json';
var PREVIEW_SUBJECT_MATCH = 'Weekly email preview';
var APPROVAL_WORDS = /^(approved|approve|looks good|lgtm|ok|okay|send it|good to go|👍|yes)\.?$/i;

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processLedeEdits') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processLedeEdits').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: processLedeEdits every 15 min.');
}

// Current week key — MUST match build-rss-feed.js currentWeekKey():
//   `${year}-${floor((UTC(y,m,d) - UTC(y,0,1)) / (7*86400000))}`
function currentWeekKey() {
  var now = new Date();
  var y = now.getUTCFullYear();
  var startOfYear = Date.UTC(y, 0, 1);
  var today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  return y + '-' + Math.floor((today - startOfYear) / (7 * 86400000));
}

function processLedeEdits() {
  // Unread replies to the preview email, not yet processed.
  var threads = GmailApp.search('is:unread subject:"' + PREVIEW_SUBJECT_MATCH + '" -label:LedeProcessed newer_than:7d');
  if (!threads.length) return;
  var label = getOrCreateLabel_('LedeProcessed');

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msgs = thread.getMessages();
    var last = msgs[msgs.length - 1];
    // Only act on an actual REPLY (more than the original message in the thread).
    if (msgs.length < 2) { continue; }

    var lede = cleanReplyBody_(last.getPlainBody());
    if (!lede || APPROVAL_WORDS.test(lede)) {
      // Approval / no edit — just mark processed.
      thread.addLabel(label);
      thread.markRead();
      continue;
    }

    try {
      commitOverride_(lede);
      GmailApp.sendEmail('info@livabletelluride.org',
        'Re: Weekly email preview — lede updated ✓',
        'Got it. Friday\'s "Week Ahead" lede has been set to:\n\n' + lede +
        '\n\nIt will appear in the next site build (within ~6 hours) and in Friday\'s email.');
    } catch (e) {
      GmailApp.sendEmail('info@livabletelluride.org',
        'Re: Weekly email preview — lede update FAILED',
        'Could not save your edit: ' + e.message + '\n\nReply again or update data/week-ahead-override.json manually.');
    }
    thread.addLabel(label);
    thread.markRead();
  }
}

// Strip quoted original ("On ... wrote:" + leading ">"), signatures, and
// collapse to the user's new lede text.
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

function commitOverride_(lede) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN script property not set.');
  var apiBase = 'https://api.github.com/repos/' + REPO + '/contents/' + OVERRIDE_PATH;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };

  // Get current file SHA (if it exists) so we can update it.
  var sha = null;
  var getResp = UrlFetchApp.fetch(apiBase, { headers: headers, muteHttpExceptions: true });
  if (getResp.getResponseCode() === 200) sha = JSON.parse(getResp.getContentText()).sha;

  var content = JSON.stringify({ weekKey: currentWeekKey(), lede: lede, source: 'thursday-review-edit' }, null, 2) + '\n';
  var payload = {
    message: 'weekly lede override (Thursday review edit) ' + currentWeekKey(),
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
