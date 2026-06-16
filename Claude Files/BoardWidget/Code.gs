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
    : (summarize_(motionText) || motionText.slice(0, 240));

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

  const sent = emailMembers_('invite', matterId, title, summary, motionText, docUrl, '', '');
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
  const sent = emailMembers_(phase, matterId, m.title, m.summary, m.motionText, m.docUrl, m.movedBy, m.secondedBy);
  ui.alert('Re-sent the link to ' + sent + ' member(s).');
}

/** Email every member their personal status-page link. phase = 'invite' | 'voting'. */
function emailMembers_(phase, matterId, title, summary, motionText, docUrl, movedBy, secondedBy) {
  const base = webAppUrl_();
  const members = getBoard_();
  let sent = 0;
  members.forEach(function (mem, i) {
    if (!mem.email) return;
    const t = HtmlService.createTemplateFromFile('Ballot');
    t.orgName = ORG_NAME; t.phase = phase; t.voterName = mem.name;
    t.title = title; t.summary = summary; t.motionText = motionText || '';
    t.docUrl = docUrl || ''; t.movedBy = movedBy || ''; t.secondedBy = secondedBy || '';
    t.openUrl = actionUrl_(base, matterId, i, '');
    MailApp.sendEmail({
      to: mem.email,
      subject: (phase === 'voting' ? '[Board Vote - voting open] ' : '[Board Vote] ') + title,
      htmlBody: t.evaluate().getContent(),
      name: ORG_NAME + ' Board Votes',
    });
    sent++;
  });
  return sent;
}

/* ===================== THE LIVE STATUS PAGE / ACTIONS ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
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
  emailMembers_('voting', m.id, m.title, m.summary, m.motionText, m.docUrl, m.movedBy, m.secondedBy);
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
    subject: '[Board Vote - Result] ' + (passed ? 'Passed' : (/^Failed/.test(m.result) ? 'Failed' : 'Final')) +
      ': ' + String(m.title).slice(0, 80),
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
