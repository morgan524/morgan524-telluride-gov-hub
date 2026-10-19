// Livable Telluride bolding guideline for meeting summaries (Morgan 2026-10-19).
//
// BOLD_GUIDELINE goes verbatim into every AI prompt that writes a meeting
// summary or recap; the writer marks bold with **double asterisks**.
// renderBold() turns those marks into <strong> for email/page HTML. Text written
// before the guideline has no marks; for it (and for any summary written without
// marks) only dollar figures are bolded. Agency names, places, dates and
// general phrases are never auto-bolded any more (the old emphasizeNames
// heuristic bolded every capitalized run).
const BOLD_GUIDELINE = [
  'BOLDING: use bold sparingly, only for the most critical terms, by wrapping them in **double asterisks**. Bold ONLY:',
  '(1) key dollar figures (e.g. **$812,000**);',
  '(2) pivotal project names (e.g. **gondola project development**, **regional wastewater treatment plant**);',
  '(3) the single most important decision or outcome in the summary (e.g. **0% adjustment to AMI rent tables**).',
  'Do NOT bold general descriptive phrases, agency or board names, people, places, dates, or anything merely interesting rather than decision-critical. When in doubt, leave it unbolded. Most paragraphs should have no bold at all.',
].join(' ');

const DOLLARS = /\$\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand)\b|[MBK]\b)?(?:[–-]\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion)\b|[MBK]\b)?)?/g;

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// text → HTML. `esc` lets a caller keep its own escaping conventions.
function renderBold(text, esc) {
  const e = esc || escHtml;
  const t = String(text == null ? '' : text);
  if (t.includes('**')) {
    // Balanced pairs become <strong>; a stray unmatched ** is dropped.
    return t.split(/(\*\*[^*\n]+?\*\*)/g).map((seg) => {
      const m = seg.match(/^\*\*([^*\n]+?)\*\*$/);
      return m ? '<strong>' + e(m[1]) + '</strong>' : e(seg.replace(/\*\*/g, ''));
    }).join('');
  }
  let out = '', last = 0, m;
  DOLLARS.lastIndex = 0;
  while ((m = DOLLARS.exec(t))) {
    out += e(t.slice(last, m.index)) + '<strong>' + e(m[0]) + '</strong>';
    last = m.index + m[0].length;
  }
  return out + e(t.slice(last));
}

// Plain text with the marks removed (search index, teaser length checks).
function stripBold(text) { return String(text == null ? '' : text).replace(/\*\*/g, ''); }

module.exports = { BOLD_GUIDELINE, renderBold, stripBold };
