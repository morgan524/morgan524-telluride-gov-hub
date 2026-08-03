// scripts/audit-meeting-summaries.js — Audit: are Gov Hub meeting summaries current, and does each meeting have an
// agenda? Loads the LIVE gov-data.js + gov-helpers.js exactly the way
// scripts/weekly-email.js does, walks every meeting source, and classifies each
// meeting in the window.
//
// The case that matters: an agenda IS posted but the summary is missing or is
// still an "agenda not posted yet" placeholder. That's a stale card.
const fs = require('fs');

// Usage: node scripts/audit-meeting-summaries.js <gov-data.js> <gov-helpers.js> [daysBack] [daysFwd]
//   Point it at the LIVE files for a true picture:
//     curl -fsS https://livabletelluride.org/js/gov-data.js -o /tmp/gd.js
//     curl -fsS https://livabletelluride.org/js/gov-helpers.js -o /tmp/gh.js
const GD = process.argv[2], GH = process.argv[3];
const BACK = parseInt(process.argv[4] || '21', 10);   // days back
const FWD  = parseInt(process.argv[5] || '45', 10);   // days forward

global.window = {};
global.document = { createElement: () => ({ set innerHTML(v) { this._v = v; }, get value() { return String(this._v == null ? '' : this._v).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"'); } }) };
global.AI_SUMMARIES = {};   // Firestore-backed on gov-hub.html only; empty here

const sandbox = (0, eval)(
  fs.readFileSync(GD, 'utf8') + '\n' + fs.readFileSync(GH, 'utf8') +
  '\n;({get:(n)=>{try{return eval(n)}catch(e){return undefined}}})'
);
const G = (n) => sandbox.get(n);

const MEETING_FNS = ['getTellurideMeetings','getCountyCachedMeetings','getMVMeetings','getSchoolMeetings','getFireMeetings','getMedMeetings','getRidgwayMeetings','getNorwoodMeetings','getOphirMeetings','getSmartMeetings','getAirportMeetings','getRicoMeetings','getOurayMeetings'];
const getMeetingSummary = G('getMeetingSummary');
const MANUAL = G('MANUAL_SUMMARIES') || {};
const PREVIEWS = G('MEETING_PREVIEWS') || {};

// Same weakness test the digest uses, so this audit agrees with what subscribers see.
const isWeak = (s) => !s || s.length < 32 || /agenda (tbd|not available|not yet|not posted)|hasn.t been posted|isn.t available|not available yet|no agenda|list of past meetings|meeting scheduled for|^regular meeting agenda/i.test(s);
const GENERIC_AGENDA_PAGE = /agenda-?center|agendaminutes|meeting-?list|\/(agendas?|meetings?|agendas-and-minutes)\/?(?:[?#].*)?$/i;
function isGenericAgendaUrl(u) {
  if (!u) return true;
  try { const p = new URL(u); if (!p.search && (p.pathname === '' || p.pathname === '/')) return true; } catch (e) {}
  return GENERIC_AGENDA_PAGE.test(u);
}

// eventDate is a Date on some sources and an ISO string on others; the site's
// own localDateKey() is the canonical normalizer, so prefer it.
const localDateKey = G('localDateKey');
function isoDate(v) {
  if (!v) return '';
  try { const k = localDateKey && localDateKey(v); if (k && /^\d{4}-\d{2}-\d{2}/.test(k)) return k.slice(0, 10); } catch (e) {}
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  return '';
}

const today = new Date().toISOString().slice(0, 10);
const shift = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const LO = shift(-BACK), HI = shift(FWD);

const rows = [];
for (const fn of MEETING_FNS) {
  const f = G(fn);
  if (typeof f !== 'function') { console.error(`!! ${fn} missing`); continue; }
  let list = [];
  try { list = f() || []; } catch (e) { console.error(`!! ${fn} threw: ${e.message}`); continue; }
  for (const m of list) {
    const date = isoDate(m.eventDate);
    if (!date || date < LO || date > HI) continue;
    const title = (m.title || '').replace(/ -- CANCELED$/, '');
    let sm = ''; try { sm = (getMeetingSummary && getMeetingSummary(m)) || ''; } catch (e) {}
    sm = sm || m.description || '';

    // Same two-signal test the digest uses: the scraper's own "agenda hasn't
    // been posted yet" wording beats any URL, and an index/portal-root URL is
    // not an agenda.
    const agendaPending = /not posted|hasn['’]?t been posted|not available|not yet/i.test(sm);
    const rawAgenda = m.agendaLink || (m.hasAgenda ? m.link : '') || '';
    const AGENDA_DOC_URL = /\.(?:pdf|docx?)(?:[?#]|$)|\/(?:files?|documents?|assets)\//i;
    const agendaUnverified = isWeak(sm) && !AGENDA_DOC_URL.test(rawAgenda);
    const realAgenda = !!rawAgenda && !agendaPending && !isGenericAgendaUrl(rawAgenda) && !agendaUnverified;

    const key = m.source + '|' + date + '|' + title;
    const hasManual = !!MANUAL[key];
    const hasPreview = !!PREVIEWS[key];
    const weak = isWeak(sm);

    let verdict;
    if (realAgenda && weak)        verdict = 'STALE';      // agenda out, no real summary
    else if (realAgenda && !weak)  verdict = 'OK';
    else if (!realAgenda && !weak) verdict = 'OK-NOAGENDA';// summarized without an agenda
    else                           verdict = 'PENDING';    // no agenda yet, nothing to say
    rows.push({ date, src: m.source || '?', title, realAgenda, rawAgenda, verdict,
                hasManual, hasPreview, canceled: / -- CANCELED$/.test(m.title || ''),
                len: (sm || '').length, sm });
  }
}
rows.sort((a, b) => a.date.localeCompare(b.date) || a.src.localeCompare(b.src));

const past = rows.filter(r => r.date < today), upc = rows.filter(r => r.date >= today);
const count = (arr, v) => arr.filter(r => r.verdict === v).length;

console.log(`\nGOV HUB MEETING SUMMARY AUDIT — ${today}`);
console.log(`window ${LO} .. ${HI}   (${rows.length} meetings across ${MEETING_FNS.length} sources)`);
console.log(`MANUAL_SUMMARIES: ${Object.keys(MANUAL).length} entries   MEETING_PREVIEWS: ${Object.keys(PREVIEWS).length} entries`);
console.log(`\n            agenda+summary   agenda,NO summary   no agenda (summary)   no agenda (none)`);
for (const [lbl, arr] of [['UPCOMING', upc], ['PAST    ', past]]) {
  console.log(`${lbl}        ${String(count(arr,'OK')).padStart(6)}   ${String(count(arr,'STALE')).padStart(15)}   ${String(count(arr,'OK-NOAGENDA')).padStart(18)}   ${String(count(arr,'PENDING')).padStart(16)}`);
}

const flag = (r) => `  ${r.date}  ${(r.src||'').padEnd(9).slice(0,9)}  ${r.title.slice(0,52).padEnd(52)}  ${r.canceled ? '[CANCELED] ' : ''}${r.len}ch`;

console.log(`\n── STALE: agenda is posted but the summary is missing/placeholder ──`);
const stale = rows.filter(r => r.verdict === 'STALE');
console.log(stale.length ? stale.map(r => flag(r) + '\n      agenda: ' + r.rawAgenda.slice(0, 100)).join('\n') : '  (none)');

console.log(`\n── UPCOMING, no agenda posted yet (expected; fills in automatically) ──`);
const pend = upc.filter(r => r.verdict === 'PENDING');
console.log(pend.length ? pend.map(flag).join('\n') : '  (none)');

console.log(`\n── UPCOMING with agenda + real summary ──`);
const ok = upc.filter(r => r.verdict === 'OK');
console.log(ok.length ? ok.map(r => flag(r) + (r.hasManual ? '  [manual]' : r.hasPreview ? '  [preview]' : '  [scraped]')).join('\n') : '  (none)');
