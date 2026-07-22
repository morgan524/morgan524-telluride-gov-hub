#!/usr/bin/env node
// Build data/events-index.json — every upcoming community event (next 60 days),
// aggregated from the per-source mirrors at PIPELINE time so the events page
// stays dumb: normalize per-source shapes, drop excluded/gov/closure items,
// pin venue towns, dedup across sources, first-day-only for multi-day runs,
// and attach a category-fallback image when the source has none.
//
// This ports the essential heuristics OUT of events.html (per
// docs/redesign/page-inventory.md keep/move/kill notes). The recurring-band /
// calendar rendering stays a page concern.
//
// Runs: end of content-refresh.js (after the mirrors are written) + standalone:
//   node scripts/build-events-index.js
//
// Record shape (contract-checked): { title, href, date:'YYYY-MM-DD',
//   endDate?, time, location, town, img, category, source }

const fs = require('fs');
const path = require('path');
const { writeMirror } = require('./lib/json-mirror.js');
const { loadDataArrays } = require('./lib/load-data.js');

// These consts are COMPUTED in gov-helpers.js (IIFEs), so the literal-extract
// JSON mirrors are permanently empty — pull them from the runtime loader.
// (Bug found 2026-07-21: Music on the Green / Farmers Market / Rotary events
// were silently absent from the redesign events page.)
const RUNTIME_SOURCES = {
  'music-on-the-green':        'MUSIC_ON_THE_GREEN',
  'telluride-farmers-market':  'TELLURIDE_FARMERS_MARKET',
  'telluride-rotary-meetings': 'TELLURIDE_ROTARY_MEETINGS',
};

// mirror file (sans .json) → display source label
const SOURCES = {
  'community-events':          'Community',
  'music-on-the-green':        'Music on the Green',
  'telluride-farmers-market':  'Telluride Farmers Market',
  'beacon-events':             'Beacon',
  'chamber-music-events':      'Telluride Chamber Music',
  'telluride-rotary-meetings': 'Telluride Rotary',
  'koto-community-events':     'KOTO Community Calendar',
  'wilkinson-events':          'Wilkinson Public Library',
  'alibi-events':              'The Alibi',
  'sheridan-events':           'Sheridan Opera House',
  'telluride-venture-events':  'Telluride Venture Network',
  'nucla-naturita-events':     'Nucla-Naturita',
  'club-red-shows':            'Club Red',
  'fresh-food-hub-events':     'Fresh Food Hub',
  'sherbino-events':           'Sherbino Theater',
  'telluride-foundation-events':'Telluride Foundation',
  'ouray-county-events':       'Ouray County',
  'ouray-ridgway-events':      'Ouray Ridgway Calendar',
  'norwood-events':            'Town of Norwood',
  'mountain-village-events':   'Mountain Village',
  'telluride-com-events':      'Telluride.com',
  'telluride-science-events':  'Telluride Science',
};

// Permanently hidden niche events — mirror of EXCLUDED_EVENTS in events.html /
// content-refresh.js; keep all three in sync.
const EXCLUDED = /wright opera house guided tour|ridgway railroad museum|free train ride|summer bingo|ultimate frisbee/i;
// Government meetings live on Gov-Hub, not the events page.
const GOV_MEETING = /\b(town council|board of (county )?commissioners|planning (and zoning|commission)|p&z|board of directors|general assembly|HARC|historic & architectural|work session|board of trustees|school board|board of education)\b/i;
const CLOSURE = /\b(closed|closure|holiday hours|office closed)\b/i;

// Venues that are ALWAYS in Telluride regardless of the record's location.
const TELLURIDE_VENUES = /sheridan opera house|ah haa|the alibi|telluride depot|wilkinson public library|telluride conference center/i;
function townIn(hay) {
  if (TELLURIDE_VENUES.test(hay)) return 'Telluride';
  if (/mountain village|reflection plaza|hotel madeline/.test(hay)) return 'Mountain Village';
  if (/norwood/.test(hay)) return 'Norwood';
  if (/ridgway|sherbino/.test(hay)) return 'Ridgway';
  if (/\bouray\b/.test(hay)) return 'Ouray';
  if (/nucla|naturita/.test(hay)) return 'West End';
  if (/\brico\b/.test(hay)) return 'Rico';
  if (/\bophir\b/.test(hay)) return 'Ophir';
  if (/telluride/.test(hay)) return 'Telluride';
  return '';
}
// Location + title are authoritative; the source label is only a fallback
// (e.g. "Ouray Ridgway Calendar" would otherwise mislabel Ouray events).
function townFor(e, label) {
  return townIn([e.location, e.title].join(' ').toLowerCase()) || townIn(String(label).toLowerCase());
}

// Category-fallback images — same CC0 library the digest uses
// (assets/digest/fallbacks/<slug>.jpg); keep patterns in sync with
// weekly-email.js CATEGORY_FALLBACKS.
const SITE = 'https://livabletelluride.org';
const FB = (slug) => SITE + '/assets/digest/fallbacks/' + slug + '.jpg';
const CATEGORY_FALLBACKS = [
  [/\bbaseball\b|softball|little league|t-?ball/i, 'baseball'],
  [/\bfilm\b|\bmovie\b|cinema|screening|documentary/i, 'film'],
  [/\bhike\b|hiking|\btrail\b|\btrek\b|summit|wildflower|nature walk|backpack/i, 'hiking'],
  [/\bbike\b|bicycle|cycling|mountain bike|\bMTB\b|gran fondo|pedal/i, 'cycling'],
  [/gallery|exhibit|\bart\b|painting|sculpture|\bartist\b|open studio|mural/i, 'art'],
  [/theat(?:er|re)|\bplay\b|improv|musical|opera|cabaret|\bdrama\b/i, 'theater'],
  [/farmers market|\bfood\b|dinner|brunch|tasting|brewery|\bbeer\b|\bwine\b|chef|culinary|bbq|barbecue|potluck|harvest/i, 'food'],
  [/\bkids?\b|\bfamily\b|children|story ?time|\byouth\b|playgroup|toddler|puppet/i, 'family'],
  [/\byoga\b|meditation|wellness|pilates|breathwork|sound bath|tai chi|qigong/i, 'wellness'],
  [/lecture|\btalk\b|\bauthor\b|\breading\b|\bpanel\b|workshop|seminar|science|discussion|presentation|\bforum\b|book club|training|\bclinic\b|registration|\bclass\b|info session/i, 'talk'],
  [/festival|parade|celebration|\bfair\b|fireworks|\bgala\b|jubilee/i, 'festival'],
  [/concert|live music|\bband\b|reggae|bluegrass|\bjazz\b|acoustic|singer|songwriter|music on the green|\bDJ\b|dance party|\bdance\b/i, 'livemusic'],
];
// Catch-all "community" events rotate through six licensed regional photos
// (Adobe Stock, Enhanced license, morgan@ex1creative.com plan — see
// assets/digest/fallbacks/SOURCES.json) instead of repeating one image.
// Deterministic by title hash: the same event always keeps the same photo.
const COMMUNITY_COUNT = 6;
function communityImg(title) {
  let h = 0;
  const s = String(title || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FB('community-' + ((h % COMMUNITY_COUNT) + 1));
}
function fallbackImg(title) {
  for (const [re, slug] of CATEGORY_FALLBACKS) if (re.test(title || '')) return FB(slug);
  return communityImg(title);
}

// User-facing event-type filter groups (events page "type" chips). Derived
// from the same keyword patterns as the fallback images; title matched first
// (most reliable), then the description. Everything else → Community.
const SLUG_TYPE = {
  baseball: 'Outdoors & Sports', hiking: 'Outdoors & Sports', cycling: 'Outdoors & Sports',
  film: 'Arts & Film', art: 'Arts & Film', theater: 'Arts & Film',
  livemusic: 'Music', food: 'Food & Drink', family: 'Family & Kids',
  wellness: 'Wellness', talk: 'Talks & Classes', festival: 'Festivals'
};
// Description text is looser than titles ("the art of fermentation", "a
// celebration of local food") — drop the most idiom-prone words for that pass.
const DESC_PATTERNS = CATEGORY_FALLBACKS.map(([re, slug]) => {
  if (slug === 'art') return [/gallery|exhibit|painting|sculpture|\bartist\b|open studio|mural/i, slug];
  if (slug === 'festival') return [/festival|parade|\bfair\b|fireworks|\bgala\b|jubilee/i, slug];
  return [re, slug];
});
function typeOf(title, desc) {
  for (const [re, slug] of CATEGORY_FALLBACKS) if (re.test(title || '')) return SLUG_TYPE[slug];
  for (const [re, slug] of DESC_PATTERNS) if (re.test(desc || '')) return SLUG_TYPE[slug];
  return 'Community';
}

// Calendar-date key in America/Denver for an ISO datetime (pubDate) — never
// UTC-slice (the MT-anchored rule).
function mtKey(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function dateKeyOf(e) {
  if (/^\d{4}-\d{2}-\d{2}/.test(e.date || '')) return String(e.date).slice(0, 10);
  if (e.date) { const k = mtKey(e.date); if (k) return k; }
  if (e.pubDate) return mtKey(e.pubDate);
  return '';
}
function timeOf(e) {
  if (e.time) return String(e.time).trim();
  // RSS pubDate often carries a real start time; surface it when non-midnight.
  if (e.pubDate) {
    const d = new Date(e.pubDate);
    if (!isNaN(d)) {
      const t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' }).format(d);
      if (!/^12:00 AM$/.test(t)) return t;
    }
  }
  return '';
}
const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function buildEventsIndex(repoRoot) {
  const DATA = path.join(repoRoot, 'data');
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const horizon = new Date(now.getTime() + 60 * 86400000);
  const horizonKey = horizon.getFullYear() + '-' + pad(horizon.getMonth() + 1) + '-' + pad(horizon.getDate());

  const seen = new Map();   // normTitle|date → record (first source wins)
  const out = [];
  let runtime = null;
  for (const [file, label] of Object.entries(SOURCES)) {
    let arr = [];
    if (RUNTIME_SOURCES[file]) {
      try {
        if (!runtime) runtime = loadDataArrays(repoRoot);
        arr = runtime.arrays[RUNTIME_SOURCES[file]] || runtime.captured[RUNTIME_SOURCES[file]] || [];
      } catch (e) { console.warn(`  events-index: runtime const ${RUNTIME_SOURCES[file]} failed — skipped`); continue; }
    } else {
      try { arr = JSON.parse(fs.readFileSync(path.join(DATA, file + '.json'), 'utf8')); }
      catch (e) { console.warn(`  events-index: ${file}.json unreadable — skipped`); continue; }
    }
    for (const e of arr || []) {
      if (!e || !e.title) continue;
      const title = String(e.title).trim();
      if (/^\s*(?:cancell?ed|postponed)\b/i.test(title)) continue;   // source-marked cancellations/postponements
      if (EXCLUDED.test(title) || GOV_MEETING.test(title) || CLOSURE.test(title)) continue;
      const date = dateKeyOf(e);
      if (!date || date < todayKey || date > horizonKey) continue;
      const key = normTitle(title).slice(0, 60) + '|' + date;
      if (seen.has(key)) continue;
      const href = e.link || e.href || '';
      const rawImg = e.imageUrl || e.img || '';
      // Short description for the events page cards: strip any HTML, collapse
      // whitespace, drop leading date/venue boilerplate echoes, cut at a word
      // boundary. Empty when the source has none.
      let desc = String(e.description || e.summary || '')
        .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (normTitle(desc).slice(0, 40) === normTitle(title).slice(0, 40)) desc = '';  // desc that just repeats the title
      if (desc.length > 240) desc = desc.slice(0, 240).replace(/\s+\S*$/, '') + '…';
      const rec = {
        title: title,
        href: href,
        date: date,
        time: timeOf(e),
        location: String(e.location || '').trim(),
        town: townFor(e, label),
        img: (/^https?:\/\//.test(rawImg) && !/\.webp(\?|#|$)/i.test(rawImg)) ? rawImg : fallbackImg(title),
        category: String(e.category || '').trim(),
        source: label,
        desc: desc,
        type: typeOf(title, desc),
      };
      if (/^\d{4}-\d{2}-\d{2}/.test(e.endDate || '') && String(e.endDate).slice(0, 10) > date) {
        rec.endDate = String(e.endDate).slice(0, 10);   // multi-day: listed on first day only
      }
      seen.set(key, rec);
      out.push(rec);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || 'zz').localeCompare(b.time || 'zz')));
  return out;
}

function run(repoRoot) {
  const root = repoRoot || path.resolve(__dirname, '..');
  const events = buildEventsIndex(root);
  const p = writeMirror('EVENTS_INDEX', events, path.join(root, 'data'));
  console.log(`  events-index: ${events.length} events (60-day window) → ${path.relative(root, p)}`);
  return events;
}

if (require.main === module) run();
module.exports = { buildEventsIndex, run };
