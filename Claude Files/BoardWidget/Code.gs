/**
 * Livable Telluride - Board Vote Tracker  (v2: motion / second / vote + PDF record)
 * ------------------------------------------------------------------
 * Parliamentary flow over email + a live web page:
 *   1. A matter is created and every board member is emailed a single link
 *      to their personal, tokenized status page.
 *   2. On that page a member can "Move to Approve" (first click wins the
 *      motion). Moving also records that member's vote as Yes.
 *   3. Once moved, any OTHER member can "Second" (also records their Yes).
 *   4. Voting is GATED: Yes/No/Abstain do nothing until there is both a
 *      motion AND a second. Once seconded, everyone gets a "voting is open"
 *      email and can vote from their page.
 *   5. When the outcome is decided (majority for/against, or all voted),
 *      the script builds a PDF record of the entire process (motion text,
 *      mover, seconder, every vote, result, timestamps), saves it to a
 *      permanent Drive folder, and emails it to all members as an
 *      attachment plus a link.
 *
 * Links are HMAC-signed per member so they can't be guessed or forged.
 * ASCII-only on purpose (non-ASCII in .gs strings mangles on HTML output).
 */

const SHEET_BOARD = 'Board';
const SHEET_VOTES = 'Votes';
const SHEET_LOG   = 'Log';

const PROP_SECRET    = 'BALLOT_SECRET';      // auto-generated signing secret
const PROP_ANTHROPIC = 'ANTHROPIC_API_KEY';  // optional: enables auto-summary
const ORG_NAME       = 'Livable Telluride';
const MAJORITY       = 3;                     // of 5 members
const DOC_FOLDER     = 'Board Vote Documents';// uploaded matter documents
const PDF_FOLDER     = 'Board Vote Records';  // permanent PDF record of each decided matter

// Public web-app URL of the "Anyone" deployment. Hardcoded on purpose:
// ScriptApp.getService().getUrl() returns a DOMAIN-SCOPED (/a/.../macros/...)
// URL on this Workspace-owned script that 404s for non-org users. Paste the
// /exec URL from Deploy > Manage deployments whose access = Anyone. Editing
// that deployment to a New version keeps this URL the same.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw932V45fnstX-ZJ5cNdBV96jsnl83LsIaIePVPCIE1sVSpkY3iJDC5rY8jmE9k6wsVxA/exec';

// Votes-tab column layout (1-indexed). Member vote columns start at COL.firstMember
// and run for getBoard_().length columns; the tally/result/pdf columns follow.
const COL = {
  date: 1, id: 2, title: 3, summary: 4, doc: 5, motion: 6,
  movedBy: 7, movedAt: 8, secBy: 9, secAt: 10, firstMember: 11,
};
function tallyCols_(n) {
  const base = COL.firstMember + n;
  return { yes: base, no: base + 1, abst: base + 2, result: base + 3, pdf: base + 4 };
}

/* ============================ MENU ============================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Board Votes')
    .addItem('New matter & send ballot...', 'openCompose')
    .addItem('Re-send link for a matter...', 'resendPrompt')
    .addItem('Voting status pages (get links)', 'showStatusLinks')
    .addSeparator()
    .addItem('Send reminders now', 'sendRemindersNow')
    .addItem('Turn ON reminders (every 3 days)', 'installReminderTrigger_')
    .addItem('Turn OFF reminders', 'turnOffReminders')
    .addSeparator()
    .addItem('Set up sheets', 'setup')
    .addItem('Test summary API key', 'testApiKey')
    .addToUi();
}

function openCompose() {
  const html = HtmlService.createHtmlOutputFromFile('Compose').setWidth(540).setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'New matter');
}

/* ====================== ONE-TIME SETUP ======================== */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_SECRET)) {
    props.setProperty(PROP_SECRET, Utilities.getUuid() + Utilities.getUuid());
  }

  let board = ss.getSheetByName(SHEET_BOARD);
  if (!board) {
    board = ss.insertSheet(SHEET_BOARD);
    board.getRange('A1:B1').setValues([['Name', 'Email']]).setFontWeight('bold');
    board.getRange('A2:B6').setValues([
      ['Morgan Smith', ''], ['Keith Hill', ''], ['John Metzger', ''],
      ['David Lavender', ''], ['Emily Masson', ''],
    ]);
    board.setColumnWidth(1, 180); board.setColumnWidth(2, 260);
    board.getRange('A1:B1').setBackground('#2D4A3E').setFontColor('#FFFFFF');
  }

  const names = getBoard_().map(m => m.name);
  const header = ['Date', 'Matter ID', 'Title', 'Summary', 'Document', 'Motion Text',
    'Moved By', 'Moved At', 'Seconded By', 'Seconded At']
    .concat(names, ['Yes', 'No', 'Abstained', 'Result', 'Record PDF']);
  let votes = ss.getSheetByName(SHEET_VOTES);
  if (!votes) votes = ss.insertSheet(SHEET_VOTES);
  votes.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold')
    .setBackground('#2D4A3E').setFontColor('#FFFFFF');
  votes.setColumnWidth(COL.title, 150); votes.setColumnWidth(COL.summary, 280);
  votes.setColumnWidth(COL.motion, 280);
  votes.setFrozenRows(1);

  let log = ss.getSheetByName(SHEET_LOG);
  if (!log) {
    log = ss.insertSheet(SHEET_LOG);
    log.getRange('A1:E1').setValues([['Timestamp', 'Matter ID', 'Member', 'Action', 'Result']])
      .setFontWeight('bold').setBackground('#2D4A3E').setFontColor('#FFFFFF');
    log.setFrozenRows(1);
  }

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\nThe Votes tab now uses the motion/second/vote layout.\n' +
    'If you have old TEST rows from the previous layout, delete them (rows 2+) so\n' +
    'columns line up.\n\n1. Fill in board emails on the "Board" tab.\n' +
    '2. Deploy > Manage deployments > Edit > New version.\n' +
    '3. Board Votes > New matter & send ballot.');
}

/* ==================== CREATE + SEND INVITE ==================== */

function createAndSend(title, fullText, manualSummary, docName, docMime, docB64) {
  title = (title || '').trim();
  fullText = (fullText || '').trim();
  if (!title) throw new Error('Please enter a title for the matter.');

  const motionText = fullText || title;
  const summary = manualSummary && manualSummary.trim()
    ? manualSummary.trim()
    : (summarize_(motionText) || defaultSummary_(title));

  let docUrl = '';
  if (docB64 && docName) {
    docUrl = saveDoc_(docName, docMime || 'application/octet-stream', docB64).url;
  }

  const matterId = newMatterId_();
  const votes = sheet_(SHEET_VOTES);
  const members = getBoard_();
  const row = [fmtDate_(new Date(), 'yyyy-MM-dd'), matterId, title, summary, docUrl, motionText,
    '', '', '', '']                       // movedBy, movedAt, secBy, secAt
    .concat(members.map(() => ''))         // member vote cells
    .concat([0, 0, 0, 'Awaiting motion', '']);
  votes.appendRow(row);

  const sent = emailMembers_('invite', matterId, title, summary, motionText, docUrl, '', '', new Date());
  return 'Matter "' + title + '" created and a link was sent to ' + sent + ' member(s).' +
    (docName ? '\nDocument attached for review: ' + docName : '') +
    '\n\nSummary recorded:\n' + summary +
    '\n\nMembers can now Move to Approve from their email link.';
}

function resendPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Re-send link', 'Enter the Matter ID (column B):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const matterId = res.getResponseText().trim();
  const row = findMatterRow_(matterId);
  if (!row) { ui.alert('No matter found with that ID.'); return; }
  const m = readMatter_(row);
  const phase = (m.movedBy && m.secondedBy) ? 'voting' : 'invite';
  const sent = emailMembers_(phase, matterId, m.title, m.summary, m.motionText, m.docUrl, m.movedBy, m.secondedBy, m.date);
  ui.alert('Re-sent the link to ' + sent + ' member(s).');
}

/** Email every member their personal status-page link. phase = 'invite' | 'voting'. */
function emailMembers_(phase, matterId, title, summary, motionText, docUrl, movedBy, secondedBy, matterDate) {
  const base = webAppUrl_();
  const members = getBoard_();
  const m = { id: matterId, title: title, summary: summary, motionText: motionText, docUrl: docUrl,
    movedBy: movedBy, secondedBy: secondedBy, date: matterDate };
  let sent = 0;
  members.forEach(function (mem, i) { if (mem.email) { ballotEmail_(phase, mem, i, m, base); sent++; } });
  return sent;
}

/** Send one member their matter email. phase = 'invite' | 'voting' | 'reminder'. */
function ballotEmail_(phase, mem, vi, m, base) {
  const stage = m.stage || (!m.movedBy ? 'awaiting_motion' : (!m.secondedBy ? 'awaiting_second' : 'voting'));
  const t = HtmlService.createTemplateFromFile('Ballot');
  t.orgName = ORG_NAME; t.phase = phase; t.stage = stage; t.voterName = mem.name;
  t.title = m.title; t.summary = m.summary; t.motionText = m.motionText || '';
  t.docUrl = m.docUrl || ''; t.movedBy = m.movedBy || ''; t.secondedBy = m.secondedBy || '';
  t.openUrl = actionUrl_(base, m.id, vi, '');
  MailApp.sendEmail({
    to: mem.email,
    subject: (phase === 'reminder' ? 'Reminder - ' : '') + subjectFor_(m.title, m.date),
    htmlBody: t.evaluate().getContent(),
    name: ORG_NAME + ' Board Votes',
  });
}

/* ===================== DAILY VOTE REMINDERS ===================== */

/** Time-driven (every 3 days): remind every member who hasn't yet acted on each open matter.
 *  A member is "done" once their vote cell is filled (move/second/vote all fill it).
 *  Finalized matters (Passed/Failed) are skipped, so reminders stop on their own. */
function sendReminders_() {
  const votes = sheet_(SHEET_VOTES);
  const last = votes.getLastRow();
  if (last < 2) return 0;
  const members = getBoard_();
  const base = webAppUrl_();
  let total = 0;
  for (let row = 2; row <= last; row++) {
    const m = readMatter_(row);
    if (!m.id || m.decided) continue;                 // skip blanks + finalized matters
    members.forEach(function (mem, i) {
      if (!mem.email) return;
      if (String(m.votes[i] || '').trim()) return;     // already moved / seconded / voted
      ballotEmail_('reminder', mem, i, m, base);
      total++;
    });
  }
  Logger.log('Reminders sent: ' + total);
  return total;
}

function sendRemindersNow() {
  const n = sendReminders_();
  SpreadsheetApp.getUi().alert('Sent ' + n + ' reminder(s) for open matters.\n\n' +
    'Members who already moved, seconded, or voted are not reminded; finalized matters are skipped.');
}

function installReminderTrigger_() {
  removeReminderTrigger_();
  ScriptApp.newTrigger('sendReminders_').timeBased().everyDays(3).atHour(8).create();
  SpreadsheetApp.getUi().alert('Reminders are ON (every 3 days).\n\nEvery third day around 8 AM, each member who ' +
    'has not yet acted on an open matter gets a reminder email with their link. Reminders stop automatically once ' +
    'a matter is decided. (Turn them off anytime from this menu.)');
}

function removeReminderTrigger_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'sendReminders_') { ScriptApp.deleteTrigger(tr); removed++; }
  });
  return removed;
}

function turnOffReminders() {
  const n = removeReminderTrigger_();
  SpreadsheetApp.getUi().alert(n ? 'Daily reminders turned OFF.' : 'Daily reminders were not on.');
}

/* ===================== VOTING STATUS DASHBOARD ===================== */

/** Token-protected status URL. viewer<0 (or null) = read-only overview; viewer>=0 =
 *  that member's personal dashboard whose cards get a "Click to Vote" button. */
function statusPageUrl_(viewer) {
  if (viewer == null || viewer < 0) return webAppUrl_() + '?view=status&k=' + sign_('STATUS', 'all');
  return webAppUrl_() + '?view=status&v=' + viewer + '&k=' + sign_('STATUS', viewer);
}

function statusOut_(html) {
  return HtmlService.createHtmlOutput(html)
    .setTitle(ORG_NAME + ' - Voting Status')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function linkRow_(label, url) {
  return '<div style="margin-bottom:11px;"><div style="font-size:12px;font-weight:700;color:#2D4A3E;margin-bottom:3px;">' + label + '</div>'
    + '<input readonly value="' + url.replace(/&/g, '&amp;') + '" onclick="this.select()" '
    + 'style="width:100%;box-sizing:border-box;font-size:11px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;"></div>';
}

function showStatusLinks() {
  const members = getBoard_();
  let rows = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:4px 2px;color:#1f2937;">'
    + '<p style="font-size:13px;margin:0 0 8px;"><b>Share this one link with the whole board.</b> It shows every open matter and gives each member a vote button to their own ballot, so anyone can check status and vote from the same page:</p>'
    + linkRow_('Board status + vote (share with everyone)', statusPageUrl_(-1))
    + '<p style="font-size:13px;margin:16px 0 6px;">Optional private per-member dashboards (single Click-to-Vote button):</p>';
  members.forEach(function (m, i) { rows += linkRow_(m.name, statusPageUrl_(i)); });
  rows += '</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(rows).setWidth(560).setHeight(540), 'Voting status links');
}

/** Build the whole status page HTML (ASCII; served via createHtmlOutput). */
function buildStatusHtml_(viewer, members) {
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  };
  const votes = sheet_(SHEET_VOTES);
  const last = votes.getLastRow();
  const n = members.length;
  const base = webAppUrl_();

  let cards = '', count = 0;
  for (let row = 2; row <= last; row++) {
    const m = readMatter_(row);
    if (!m.id) continue;
    let voted = 0;
    m.votes.forEach(function (v) { if (String(v).trim()) voted++; });
    if (voted >= n) continue;                      // fully voted -> drop from the dashboard
    count++;

    let pills = '';
    members.forEach(function (mem, i) {
      const v = String(m.votes[i] || '').trim().toLowerCase();
      const role = mem.name === m.movedBy ? ' (moved)' : (mem.name === m.secondedBy ? ' (2nd)' : '');
      let cls = 'none', label = 'no vote yet';
      if (v === 'yes') { cls = 'yes'; label = 'Yes'; }
      else if (v === 'no') { cls = 'no'; label = 'No'; }
      else if (v === 'abstained') { cls = 'abs'; label = 'Abstained'; }
      pills += '<span class="pill ' + cls + '"><span class="dot"></span><span class="nm">' + esc(mem.name) + esc(role) + '</span> ' + label + '</span>';
    });

    const rl = String(m.result).toLowerCase();
    let badge = 'Voting open', bcls = 'open';
    if (m.stage === 'awaiting_motion') { badge = 'Awaiting motion'; bcls = 'wait'; }
    else if (m.stage === 'awaiting_second') { badge = 'Awaiting second'; bcls = 'wait'; }
    else if (rl.indexOf('passed') === 0) { badge = 'Passed'; bcls = 'pass'; }
    else if (rl.indexOf('failed') === 0) { badge = 'Failed'; bcls = 'fail'; }

    let act = '';
    if (viewer >= 0) {
      const myV = String(m.votes[viewer] || '').trim();
      const blabel = m.stage === 'voting' ? (myV ? 'Change your vote' : 'Click to Vote') : 'Open to act';
      act = '<div class="vote-act"><a class="vote-btn" href="' + actionUrl_(base, m.id, viewer, '') + '">' + blabel + '</a>'
        + (myV ? '<span class="myv">Your vote: ' + esc(myV) + '</span>' : '') + '</div>';
    } else {
      let btns = '';
      members.forEach(function (mem, i) {
        btns += '<a class="vbtn" href="' + actionUrl_(base, m.id, i, '') + '">' + esc(String(mem.name).split(' ')[0]) + '</a>';
      });
      act = '<div class="vote-act overview"><span class="actlbl">Go to your ballot:</span>' + btns + '</div>';
    }

    cards += '<div class="vote-card">'
      + '<div class="vote-card-top">'
      + '<div class="vote-info"><div class="vote-title">' + esc(m.title) + '</div>'
      + '<div class="vote-desc">' + esc(m.summary) + '</div></div>'
      + '<div class="vote-right"><span class="badge ' + bcls + '">' + badge + '</span>'
      + '<span class="prog">' + voted + ' of ' + n + ' voted</span></div>'
      + '</div>'
      + '<div class="vote-pills">' + pills + '</div>'
      + act
      + '</div>';
  }
  if (!count) cards = '<div class="empty">No outstanding votes. Every open matter has been fully voted.</div>';

  const css = 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f3f4f6;color:#1f2937;}'
    + '.wrap{max-width:760px;margin:0 auto;padding:24px 16px 40px;}'
    + '.hd{background:#2D4A3E;color:#fff;border-radius:10px;padding:16px 20px;margin-bottom:14px;}'
    + '.hd .org{font-size:18px;font-weight:700;}.hd .sub{font-size:13px;color:#bcd3c8;margin-top:2px;}'
    + '.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#4b5563;margin:0 2px 14px;}'
    + '.legend span{display:inline-flex;align-items:center;gap:5px;}'
    + '.legend i{width:11px;height:11px;border-radius:50%;display:inline-block;}'
    + '.vote-card{background:#fff;border:1px solid #d6e3dc;border-radius:10px;margin-bottom:12px;overflow:hidden;}'
    + '.vote-card-top{display:flex;align-items:flex-start;gap:12px;padding:14px 16px 10px;}'
    + '.vote-info{flex:1;min-width:0;}'
    + '.vote-title{font-size:16px;font-weight:700;color:#173d34;line-height:1.3;margin-bottom:4px;}'
    + '.vote-desc{font-size:13px;color:#4b5563;line-height:1.45;}'
    + '.vote-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;}'
    + '.badge{font-size:12px;font-weight:800;padding:4px 11px;border-radius:20px;white-space:nowrap;}'
    + '.badge.pass{background:#dcfce7;color:#166534;}.badge.fail{background:#fee2e2;color:#991b1b;}'
    + '.badge.open{background:#dbeafe;color:#1d4ed8;}.badge.wait{background:#fef3c7;color:#92400e;}'
    + '.prog{font-size:11px;color:#6b7280;font-weight:600;}'
    + '.vote-pills{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 14px;}'
    + '.pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:14px;font-size:12px;white-space:nowrap;line-height:1.2;}'
    + '.pill .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}.pill .nm{font-weight:700;}'
    + '.pill.yes{background:#dcfce7;color:#166534;border:1px solid #bbf7d0;}.pill.yes .dot{background:#16a34a;}'
    + '.pill.no{background:#fee2e2;color:#991b1b;border:1px solid #fecaca;}.pill.no .dot{background:#dc2626;}'
    + '.pill.abs{background:#fef3c7;color:#92400e;border:1px solid #fde68a;}.pill.abs .dot{background:#d97706;}'
    + '.pill.none{background:#fff;color:#9ca3af;border:1px dashed #d1d5db;}.pill.none .dot{background:#d1d5db;}'
    + '.empty{background:#fff;border-radius:10px;padding:40px 20px;text-align:center;color:#6b7280;font-size:15px;}'
    + '.foot{text-align:center;font-size:12px;color:#9ca3af;margin-top:8px;}'
    + '.refresh{display:inline-block;margin:0 0 14px;font-size:13px;font-weight:600;color:#1d6fb8;text-decoration:none;}'
    + '.vote-act{display:flex;align-items:center;gap:12px;padding:2px 16px 16px;}'
    + '.vote-btn{display:inline-block;background:#2D4A3E;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:10px 22px;border-radius:8px;}'
    + '.myv{font-size:12px;color:#6b7280;font-weight:600;}'
    + '.vote-act.overview{flex-wrap:wrap;gap:8px;}'
    + '.actlbl{font-size:12px;color:#6b7280;font-weight:700;margin-right:2px;}'
    + '.vbtn{display:inline-block;background:#eef3f1;color:#2D4A3E;border:1px solid #cdddd5;text-decoration:none;font-size:13px;font-weight:700;padding:7px 14px;border-radius:8px;}';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_top">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="refresh" content="60">'
    + '<style>' + css + '</style></head><body><div class="wrap">'
    + '<div class="hd"><div class="org">' + esc(ORG_NAME) + '</div>'
    + '<div class="sub">' + (viewer >= 0 ? esc(members[viewer].name) + ' &middot; your pending votes' : 'Board Voting Status') + ' &middot; ' + count + ' outstanding</div></div>'
    + '<a class="refresh" href="' + statusPageUrl_(viewer) + '">&#8635; Refresh now</a>'
    + '<div class="legend"><span><i style="background:#16a34a"></i>Yes</span>'
    + '<span><i style="background:#dc2626"></i>No</span>'
    + '<span><i style="background:#d97706"></i>Abstained</span>'
    + '<span><i style="background:#d1d5db"></i>No vote yet</span></div>'
    + cards
    + '<div class="foot">Auto-refreshes every minute. A matter disappears once all ' + n + ' members have voted.</div>'
    + '</div></body></html>';
}

/* ===================== THE LIVE STATUS PAGE / ACTIONS ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};

  // Status dashboard: one token-protected page listing all matters not yet fully voted.
  if (p.view === 'status') {
    const stMembers = getBoard_();
    const sv = parseInt(p.v, 10);
    if (!isNaN(sv) && sv >= 0 && sv < stMembers.length && p.k === sign_('STATUS', sv)) {
      return statusOut_(buildStatusHtml_(sv, stMembers));     // personalized (with Click to Vote)
    }
    if (p.k === sign_('STATUS', 'all')) {
      return statusOut_(buildStatusHtml_(-1, stMembers));     // read-only overview
    }
    return HtmlService.createHtmlOutput('Status link could not be verified.');
  }

  const matterId = p.m, vi = parseInt(p.v, 10), token = p.k, act = (p.act || '').toLowerCase();

  if (!matterId || isNaN(vi) || !token) return page_({ error: 'This link is incomplete or invalid.' });
  if (token !== sign_(matterId, vi)) return page_({ error: 'This link could not be verified.' });

  const members = getBoard_();
  if (vi < 0 || vi >= members.length) return page_({ error: 'Unknown member.' });
  const me = members[vi];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findMatterRow_(matterId);
    if (!row) return page_({ error: 'That matter is no longer available.' });

    let notice = '';
    if (act) notice = processAction_(row, vi, me, act, members);

    const m = readMatter_(row);
    return page_(Object.assign({ voterName: me.name, myVote: m.votes[vi] || '', notice: notice,
      moveUrl: actionUrl_(webAppUrl_(), matterId, vi, 'move'),
      secondUrl: actionUrl_(webAppUrl_(), matterId, vi, 'second'),
      yesUrl: actionUrl_(webAppUrl_(), matterId, vi, 'yes'),
      noUrl: actionUrl_(webAppUrl_(), matterId, vi, 'no'),
      abstainUrl: actionUrl_(webAppUrl_(), matterId, vi, 'abstain'),
      isMover: m.movedBy && m.movedBy === me.name,
      isSeconder: m.secondedBy && m.secondedBy === me.name,
    }, m));
  } finally {
    lock.releaseLock();
  }
}

/** Apply a member action; returns a human notice string. Writes to the sheet. */
function processAction_(row, vi, me, act, members) {
  const votes = sheet_(SHEET_VOTES);
  let m = readMatter_(row);

  if (act === 'move') {
    if (m.movedBy) return (m.movedBy === me.name ? 'You have already moved to approve this matter.'
      : 'This matter was already moved by ' + m.movedBy + '.');
    votes.getRange(row, COL.movedBy).setValue(me.name);
    votes.getRange(row, COL.movedAt).setValue(fmtDate_(new Date(), 'yyyy-MM-dd HH:mm'));
    setVote_(votes, row, vi, 'Yes', me.name + ' moved to approve');
    log_(m.id, me.name, 'Move to Approve (Yes)');
    recompute_(row, members.length);
    return 'You moved to approve this matter. Your vote was recorded as Yes. It now needs a second from another member.';
  }

  if (act === 'second') {
    if (!m.movedBy) return 'This matter needs a motion before it can be seconded.';
    if (m.secondedBy) return (m.secondedBy === me.name ? 'You have already seconded this matter.'
      : 'This matter was already seconded by ' + m.secondedBy + '.');
    if (m.movedBy === me.name) return 'You moved this matter, so another member must second it.';
    votes.getRange(row, COL.secBy).setValue(me.name);
    votes.getRange(row, COL.secAt).setValue(fmtDate_(new Date(), 'yyyy-MM-dd HH:mm'));
    setVote_(votes, row, vi, 'Yes', me.name + ' seconded');
    log_(m.id, me.name, 'Second (Yes)');
    recompute_(row, members.length);
    finalizeIfDecided_(row, members);
    sendVotingOpenNotice_(row);          // motion + second now present -> voting opens
    return 'You seconded this matter. Your vote was recorded as Yes. Voting is now open for all members.';
  }

  if (act === 'yes' || act === 'no' || act === 'abstain') {
    if (!m.movedBy || !m.secondedBy) return 'Voting is not open yet. This matter needs a motion and a second first.';
    const word = act === 'yes' ? 'Yes' : (act === 'no' ? 'No' : 'Abstained');
    setVote_(votes, row, vi, word, me.name + ' voted ' + word);
    log_(m.id, me.name, 'Vote ' + word);
    recompute_(row, members.length);
    finalizeIfDecided_(row, members);
    return 'Your vote was recorded: ' + word + '.';
  }

  return '';
}

function setVote_(votes, row, vi, word, note) {
  votes.getRange(row, COL.firstMember + vi).setValue(word)
    .setNote(note + ' on ' + fmtDate_(new Date(), 'yyyy-MM-dd HH:mm'));
}

/** Recompute tally + result string from member vote cells. */
function recompute_(row, n) {
  const votes = sheet_(SHEET_VOTES);
  const vals = votes.getRange(row, COL.firstMember, 1, n).getValues()[0];
  let yes = 0, no = 0, abst = 0;
  vals.forEach(function (v) {
    v = String(v).toLowerCase();
    if (v === 'yes') yes++; else if (v === 'no') no++; else if (v === 'abstained') abst++;
  });
  const movedBy = votes.getRange(row, COL.movedBy).getValue();
  const secBy = votes.getRange(row, COL.secBy).getValue();
  const r = resultString_(movedBy, secBy, yes, no, abst, n);
  const tc = tallyCols_(n);
  votes.getRange(row, tc.yes, 1, 4).setValues([[yes, no, abst, r.result]]);
  return { yes: yes, no: no, abst: abst, stage: r.stage, decided: r.decided, result: r.result };
}

function resultString_(movedBy, secondedBy, yes, no, abst, n) {
  if (!movedBy) return { stage: 'awaiting_motion', decided: false, result: 'Awaiting motion' };
  if (!secondedBy) return { stage: 'awaiting_second', decided: false, result: 'Awaiting second (moved by ' + movedBy + ')' };
  const tail = abst ? (', ' + abst + ' abst.') : '';
  const decided = yes >= MAJORITY || no >= MAJORITY || (yes + no + abst) >= n;
  if (!decided) return { stage: 'voting', decided: false, result: 'Voting open (' + yes + '-' + no + tail + ')' };
  const label = yes >= MAJORITY ? 'Passed' : 'Failed';
  return { stage: 'voting', decided: true, result: label + ' (' + yes + '-' + no + tail + ')' };
}

/* ===================== FINALIZE: PDF + RESULT EMAIL ===================== */

function finalizeIfDecided_(row, members) {
  const n = members.length;
  const r = recompute_(row, n);
  if (!r.decided) return;

  const props = PropertiesService.getScriptProperties();
  const m = readMatter_(row);
  const key = 'RN_' + m.id;
  if (props.getProperty(key) === m.result) return;   // already notified for this outcome

  const record = buildAndSaveRecord_(m, members);     // {url, blob}
  sheet_(SHEET_VOTES).getRange(row, tallyCols_(n).pdf).setValue(record.url);
  sendResult_(m, members, record);
  props.setProperty(key, m.result);
  log_(m.id, 'system', 'Finalized: ' + m.result);
}

function sendVotingOpenNotice_(row) {
  const m = readMatter_(row);
  emailMembers_('voting', m.id, m.title, m.summary, m.motionText, m.docUrl, m.movedBy, m.secondedBy, m.date);
}

function sendResult_(m, members, record) {
  const recipients = members.filter(x => x.email).map(x => x.email).join(',');
  if (!recipients) return;
  const passed = /^Passed/.test(m.result);
  const rows = members.map(function (mem, i) { return { name: mem.name, vote: String(m.votes[i] || 'No vote') }; });

  const t = HtmlService.createTemplateFromFile('Result');
  t.orgName = ORG_NAME; t.title = m.title; t.summary = m.summary; t.motionText = m.motionText;
  t.matterId = m.id; t.movedBy = m.movedBy; t.movedAt = m.movedAt;
  t.secondedBy = m.secondedBy; t.secondedAt = m.secondedAt;
  t.yes = m.yes; t.no = m.no; t.abstain = m.abst; t.result = m.result; t.passed = passed;
  t.rows = rows; t.pdfUrl = record.url; t.docUrl = m.docUrl;

  MailApp.sendEmail({
    to: recipients,
    subject: 'Result - ' + subjectFor_(m.title, m.date) +
      ' (' + (passed ? 'Passed' : (/^Failed/.test(m.result) ? 'Failed' : 'Final')) + ')',
    htmlBody: t.evaluate().getContent(),
    name: ORG_NAME + ' Board Votes',
    attachments: [record.blob],
  });
}

/* ===================== PDF RECORD ===================== */

function buildAndSaveRecord_(m, members) {
  const html = buildRecordHtml_(m, members);
  const pdf = Utilities.newBlob(html, 'text/html', 'record.html')
    .getAs('application/pdf')
    .setName(m.id + ' - Board Vote Record.pdf');
  const folder = getFolder_(PDF_FOLDER);
  const file = folder.createFile(pdf);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl(), blob: pdf };
}

function buildRecordHtml_(m, members) {
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  };
  const passed = /^Passed/.test(m.result);
  let memberRows = '';
  members.forEach(function (mem, i) {
    const v = String(m.votes[i] || 'No vote recorded');
    let role = '';
    if (mem.name === m.movedBy) role = ' (moved)';
    else if (mem.name === m.secondedBy) role = ' (seconded)';
    memberRows += '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + esc(mem.name) + esc(role) +
      '</td><td style="padding:6px 10px;border:1px solid #ccc;font-weight:bold;">' + esc(v) + '</td></tr>';
  });
  return '' +
    '<div style="font-family:Helvetica,Arial,sans-serif;color:#111;max-width:680px;margin:0 auto;padding:24px;">' +
    '<div style="border-bottom:3px solid #2D4A3E;padding-bottom:10px;margin-bottom:18px;">' +
    '<div style="font-size:20px;font-weight:bold;color:#2D4A3E;">' + esc(ORG_NAME) + '</div>' +
    '<div style="font-size:13px;color:#555;">Board of Directors - Record of Action</div></div>' +
    '<h1 style="font-size:18px;margin:0 0 4px;">' + esc(m.title) + '</h1>' +
    '<div style="font-size:12px;color:#666;margin-bottom:16px;">Matter ID: ' + esc(m.id) + ' &nbsp;|&nbsp; Date: ' + esc(m.date) + '</div>' +
    '<div style="font-size:13px;font-weight:bold;color:#2D4A3E;margin:14px 0 4px;">RESULT</div>' +
    '<div style="font-size:16px;font-weight:bold;color:' + (passed ? '#1f7a4d' : '#a4231c') + ';">' + esc(m.result) + '</div>' +
    '<div style="font-size:13px;font-weight:bold;color:#2D4A3E;margin:16px 0 4px;">MOTION</div>' +
    '<div style="white-space:pre-wrap;font-size:13px;line-height:1.5;border-left:3px solid #2D4A3E;padding:8px 12px;background:#f4f7f5;">' + esc(m.motionText) + '</div>' +
    (m.summary ? '<div style="font-size:13px;font-weight:bold;color:#2D4A3E;margin:16px 0 4px;">SUMMARY</div><div style="font-size:13px;line-height:1.5;">' + esc(m.summary) + '</div>' : '') +
    '<div style="font-size:13px;font-weight:bold;color:#2D4A3E;margin:16px 0 4px;">PROCEDURE</div>' +
    '<div style="font-size:13px;line-height:1.6;">Moved by <b>' + esc(m.movedBy || '-') + '</b>' + (m.movedAt ? ' on ' + esc(m.movedAt) : '') + '<br>' +
    'Seconded by <b>' + esc(m.secondedBy || '-') + '</b>' + (m.secondedAt ? ' on ' + esc(m.secondedAt) : '') + '</div>' +
    '<div style="font-size:13px;font-weight:bold;color:#2D4A3E;margin:16px 0 6px;">VOTE OF EACH MEMBER</div>' +
    '<table style="border-collapse:collapse;font-size:13px;width:100%;">' + memberRows + '</table>' +
    '<div style="font-size:13px;margin-top:10px;">Tally: <b>' + m.yes + ' Yes</b>, <b>' + m.no + ' No</b>, <b>' + m.abst + ' Abstained</b> (majority = ' + MAJORITY + ' of ' + members.length + ').</div>' +
    (m.docUrl ? '<div style="font-size:12px;color:#555;margin-top:12px;">Attached document: <a href="' + esc(m.docUrl) + '">' + esc(m.docUrl) + '</a></div>' : '') +
    '<div style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #ddd;padding-top:8px;">Generated automatically by ' + esc(ORG_NAME) + ' Board Votes on ' + esc(fmtDate_(new Date(), 'yyyy-MM-dd HH:mm')) + ' (' + tz_() + ').</div>' +
    '</div>';
}

/* ======================== HELPERS ============================ */

/** Read a matter row into a structured object. */
function readMatter_(row) {
  const votes = sheet_(SHEET_VOTES);
  const n = getBoard_().length;
  const tc = tallyCols_(n);
  const vals = votes.getRange(row, 1, 1, tc.pdf).getValues()[0];   // 0-indexed
  const at = function (c) { return vals[c - 1]; };
  const memberVotes = [];
  for (let i = 0; i < n; i++) memberVotes.push(at(COL.firstMember + i));
  return {
    row: row, date: at(COL.date), id: at(COL.id), title: at(COL.title), summary: at(COL.summary),
    docUrl: at(COL.doc), motionText: at(COL.motion),
    movedBy: at(COL.movedBy), movedAt: at(COL.movedAt), secondedBy: at(COL.secBy), secondedAt: at(COL.secAt),
    votes: memberVotes, yes: at(tc.yes), no: at(tc.no), abst: at(tc.abst), result: at(tc.result), pdfUrl: at(tc.pdf),
    stage: (!at(COL.movedBy) ? 'awaiting_motion' : (!at(COL.secBy) ? 'awaiting_second' : 'voting')),
    decided: /^Passed|^Failed/.test(String(at(tc.result))),
  };
}

function page_(data) {
  const t = HtmlService.createTemplateFromFile('Confirmation');
  const d = data || {};
  ['error', 'notice', 'voterName', 'title', 'summary', 'motionText', 'docUrl',
    'movedBy', 'movedAt', 'secondedBy', 'secondedAt', 'result', 'myVote', 'pdfUrl',
    'stage', 'moveUrl', 'secondUrl', 'yesUrl', 'noUrl', 'abstainUrl']
    .forEach(function (k) { t[k] = d[k] || ''; });
  t.orgName = ORG_NAME;
  t.yes = d.yes || 0; t.no = d.no || 0; t.abstain = d.abst || 0;
  t.isMover = !!d.isMover;
  t.isSeconder = !!d.isSeconder;
  t.majority = MAJORITY;
  return t.evaluate().setTitle(ORG_NAME + ' - Board Vote').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function saveDoc_(name, mime, b64) {
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  const file = getFolder_(DOC_FOLDER).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl() };
}

function getFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function getBoard_() {
  const b = sheet_(SHEET_BOARD);
  const last = b.getLastRow();
  if (last < 2) return [];
  return b.getRange(2, 1, last - 1, 2).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), email: String(r[1]).trim() }));
}

function findMatterRow_(matterId) {
  const votes = sheet_(SHEET_VOTES);
  const ids = votes.getRange(2, COL.id, Math.max(votes.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(matterId)) return i + 2;
  return null;
}

function log_(matterId, who, action) {
  sheet_(SHEET_LOG).appendRow([fmtDate_(new Date(), 'yyyy-MM-dd HH:mm:ss'), matterId, who, action, '']);
}

// Action param is named 'act' (NOT 'c' - Google's edge 400-rejects a param named 'c').
function actionUrl_(base, matterId, vi, act) {
  let u = base + '?m=' + encodeURIComponent(matterId) + '&v=' + vi + '&k=' + sign_(matterId, vi);
  if (act) u += '&act=' + act;
  return u;
}

function sign_(matterId, vi) {
  const secret = PropertiesService.getScriptProperties().getProperty(PROP_SECRET);
  const raw = Utilities.computeHmacSha256Signature(matterId + '|' + vi, secret);
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('').slice(0, 20);
}

function newMatterId_() {
  return 'M-' + fmtDate_(new Date(), 'yyyyMMdd') + '-' + Math.floor(1000 + Math.random() * 9000);
}

/** Fallback one-line summary when there's no manual summary and no AI key.
 *  Kept distinct from the motion text so the motion isn't shown twice. */
function defaultSummary_(title) {
  const t = String(title || '').trim();
  if (!t) return 'Board matter for approval.';
  if (/^approve\b/i.test(t)) return 'Motion to ' + t.charAt(0).toLowerCase() + t.slice(1) + '.';
  return 'Motion: ' + t + '.';
}

/** Automatic email subject: "Vote of the Livable Telluride Board on <date> to approve <name>".
 *  <name> is the matter title with a leading "Approve" stripped so it doesn't double up.
 *  Handles a 'yyyy-MM-dd' string without timezone drift, or a Date object. */
function subjectFor_(title, dateVal) {
  let name = String(title || '').replace(/^\s*approve[:\s-]+/i, '').trim() || 'this matter';
  let d;
  if (dateVal instanceof Date) { d = dateVal; }
  else {
    const s = String(dateVal || ''); const mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = mt ? new Date(+mt[1], +mt[2] - 1, +mt[3]) : new Date(s);
  }
  const dateStr = (d && !isNaN(d.getTime())) ? fmtDate_(d, 'MMMM d, yyyy') : String(dateVal || '');
  return 'Vote of the ' + ORG_NAME + ' Board on ' + dateStr + ' to approve ' + name;
}

function webAppUrl_() {
  if (WEB_APP_URL) return WEB_APP_URL;
  const u = ScriptApp.getService().getUrl();
  if (!u) throw new Error('Set WEB_APP_URL, or deploy the project as a Web App first.');
  return u;
}

function sheet_(name) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Missing "' + name + '" tab. Run Board Votes > Set up sheets.');
  return s;
}

function fmtDate_(d, fmt) { return Utilities.formatDate(d, tz_(), fmt); }
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'America/Denver'; }

function summarize_(text) {
  text = (text || '').trim();
  if (!text) return '';
  const key = PropertiesService.getScriptProperties().getProperty(PROP_ANTHROPIC);
  if (!key) return '';
  try {
    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 160,
        messages: [{ role: 'user', content: 'You are recording a board vote. In 1-2 neutral, specific sentences, ' +
          'summarize the matter being voted on. No preamble.\n\nMatter text:\n' + text.slice(0, 6000) }],
      }),
    });
    if (resp.getResponseCode() !== 200) { Logger.log('Anthropic API ' + resp.getResponseCode() + ': ' + resp.getContentText()); return ''; }
    const j = JSON.parse(resp.getContentText());
    return (j.content && j.content[0] && j.content[0].text || '').trim();
  } catch (err) { Logger.log('summarize_ error: ' + err); return ''; }
}

function testApiKey() {
  const ui = SpreadsheetApp.getUi();
  const key = PropertiesService.getScriptProperties().getProperty(PROP_ANTHROPIC);
  if (!key) { ui.alert('No ANTHROPIC_API_KEY found in Script Properties.'); return; }
  const out = summarize_('Motion to approve a $48,000 first-year grant from the Telluride Foundation to fund a part-time Managing Editor.');
  ui.alert(out ? 'API key works. Sample summary:\n\n' + out
    : 'Key found but the request failed. Open Apps Script > Executions to see the logged error.');
}
