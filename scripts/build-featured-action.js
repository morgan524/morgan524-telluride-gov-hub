// ── Featured Action of the Week (homepage) ───────────────────────────────────
//
// Picks the governmental item most worth a resident's attention this week:
// the next upcoming meeting that touches a DEEP-DIVE topic (deep-dive-watch
// cross-reference), enriched with the meeting's card summary / agenda /
// packet / zoom from week-meetings.json. Writes data/featured-action.json,
// rendered by index.html in place of the old Housing/Events/Donate mini-row
// (per Morgan, 2026-07-22).
//
// Selection: FEATURED_ACTION_PIN in js/gov-data.js wins when set and not yet
// past; otherwise earliest upcoming deep-dive-linked meeting within HORIZON
// days, ties broken by TOPIC_PRIORITY. No candidates → {} (the homepage
// section hides itself).
//
// Runs from content-refresh.js main() right after build-deep-dive-watch (its
// input), and can be run by hand: node scripts/build-featured-action.js

const fs = require('fs');
const path = require('path');

const HORIZON_DAYS = 14;

// Importance tie-break when two topics meet the same day (most contested
// land-use fights first). Topics absent from this list rank last, in watch
// order.
const TOPIC_PRIORITY = ['carhenge', 'society', 'diamond', 'gondola', 'code', 'wildfire', 'skigate'];

// Topic key → deep-dive page. Default is deep-dive-<key>.html; anything
// off-pattern is listed here.
const TOPIC_HREF = {
  fieldpaving: '/deep-dive-field-paving-town-park.html'
};
const topicHref = (key) => TOPIC_HREF[key] || ('/deep-dive-' + key + '.html');

// Cut at a sentence boundary, never mid-sentence (digest convention).
function truncSentence(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

function humanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Strict-JSON const extractor (FEATURED_ACTION_PIN is documented as strict
// JSON in gov-data.js). Returns {} when absent/unparseable.
function readPin(govDataSrc) {
  const m = /const\s+FEATURED_ACTION_PIN\s*=\s*(\{[\s\S]*?\});/.exec(govDataSrc);
  if (!m) return {};
  try { return JSON.parse(m[1]) || {}; } catch { return {}; }
}

function run(repoRoot) {
  const dataDir = path.join(repoRoot, 'data');
  const watch = readJson(path.join(dataDir, 'deep-dive-watch.json'));
  const week = readJson(path.join(dataDir, 'week-meetings.json'));
  const pin = readPin(fs.readFileSync(path.join(repoRoot, 'js', 'gov-data.js'), 'utf8'));

  const todayMT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  const horizon = (() => {
    const [y, m, d] = todayMT.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + HORIZON_DAYS));
    return dt.toISOString().slice(0, 10);
  })();

  // All upcoming deep-dive-linked meetings in the window.
  const candidates = [];
  for (const [key, t] of Object.entries(watch.topics || {})) {
    for (const m of t.upcoming || []) {
      if (!m || !m.date || m.date < todayMT || m.date > horizon) continue;
      candidates.push({ topic: key, label: t.label, meeting: m });
    }
  }

  let choice = null;
  if (pin.topic && pin.date && pin.date >= todayMT) {
    choice = candidates.find(c => c.topic === pin.topic && c.meeting.date === pin.date) || null;
    // A pin for a meeting the watch doesn't know is honored with watch-less
    // minimal data so a hand pin can never silently no-op.
    if (!choice && (watch.topics || {})[pin.topic]) {
      choice = { topic: pin.topic, label: watch.topics[pin.topic].label, meeting: { date: pin.date, title: '', sourceLabel: '' } };
    }
  }
  if (!choice) {
    const rank = (k) => { const i = TOPIC_PRIORITY.indexOf(k); return i === -1 ? TOPIC_PRIORITY.length : i; };
    candidates.sort((a, b) => a.meeting.date.localeCompare(b.meeting.date) || rank(a.topic) - rank(b.topic));
    choice = candidates[0] || null;
  }

  let out = { generated: new Date().toISOString() };
  if (choice) {
    const m = choice.meeting;
    // Enrich from week-meetings (summary + packet + time live there).
    const wk = week.find(w => w.source === m.source && w.date === m.date && w.title === m.title) || {};
    // An expired pin must stop supplying COPY, not just stop selecting the
    // meeting. `pinned` already tested pin.date, but headline/blurb used
    // `pin.headline || …` unconditionally — so once a pin's date passed, it
    // stopped choosing the meeting while still overriding the text of whatever
    // meeting was auto-selected next. On 2026-08-08 the card advertised "Town
    // Park Oval paving goes before Parks & Rec on Wednesday, July 29" (a pin
    // that expired ten days earlier) stapled to an unrelated Aug 11 Town
    // Council meeting — wrong body, wrong date, and a call to action for a
    // meeting that had already happened.
    const pinActive = !!(pin.topic && pin.date && pin.date >= todayMT);
    out = {
      generated: out.generated,
      pinned: pinActive,
      topic: choice.topic,
      topicLabel: choice.label,
      headline: (pinActive && pin.headline) || (choice.label + ' goes before ' + (m.title || 'the board') + ' on ' + humanDate(m.date)),
      blurb: (pinActive && pin.blurb) || truncSentence(wk.summary || '', 480),
      // Pin-only, and gated on pinActive for the same reason the copy is: an
      // expired pin must stop supplying a picture, or the card would staple a
      // stale rendering onto whatever meeting got auto-selected next.
      // `images` is the current shape (one agenda can cover two projects, as
      // Aug 19 HARC does with Shandoka and 335 W Colorado). The older single
      // `image` is still honored so an existing pin keeps working.
      images: (pinActive && Array.isArray(pin.images) && pin.images.length
        ? pin.images
        : (pinActive && pin.image
            ? [{ src: pin.image, alt: pin.imageAlt || '', caption: pin.imageCredit || '' }]
            : [])),
      deepDive: { label: choice.label, href: topicHref(choice.topic) },
      meeting: {
        title: m.title || wk.title || '',
        sourceLabel: m.sourceLabel || wk.sourceLabel || '',
        date: m.date,
        humanDate: humanDate(m.date),
        time: m.time || wk.time || '',
        location: m.location || wk.location || '',
        agendaUrl: m.agendaUrl || wk.agendaUrl || '',
        hasAgenda: wk.hasAgenda !== undefined ? !!wk.hasAgenda : !!(m.agendaUrl),
        packetUrl: wk.packetUrl || '',
        zoomLink: m.zoomLink || wk.zoomLink || '',
        livestream: m.livestream || wk.livestream || ''
      }
    };
  }

  const outPath = path.join(dataDir, 'featured-action.json');
  const json = JSON.stringify(out, null, 1) + '\n';
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, 'utf8') !== json) fs.writeFileSync(outPath, json);
  console.log('  featured-action: ' + (choice ? (choice.label + ' → ' + (choice.meeting.title || '?') + ' ' + choice.meeting.date + (out.pinned ? ' (pinned)' : '')) : 'no candidate — section hides'));
  return out;
}

if (require.main === module) run(path.join(__dirname, '..'));

module.exports = { run };
