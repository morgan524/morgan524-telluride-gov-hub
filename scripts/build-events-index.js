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

// Specific per-occurrence acts for rotating series, kept in recurring-acts.json
// at the REPO ROOT (not data/) and shaped { _comment, series: [...] }.
//
// Restored to the index 2026-08-09. The pre-redesign events.html fetched this
// file itself and rendered a "Daily" card per act; the cutover (0e7e0335)
// dropped that reader, so from then on the file was written by two jobs and
// displayed nowhere. Folding it in HERE instead of re-adding a page-side fetch
// matches how the rebuilt page works — events.html renders events-index.json
// and stays dumb — and it means the acts inherit dedup, town-pinning, type
// classification and fallback images for free.
//
// MUST be first in SOURCES: a specific act ("Movie Mondays: Top Gun") wins over
// the generic series entry ("Movie Mondays in Hartwell Park") on the same day,
// and first-source-wins is how this builder resolves collisions.
const ACTS_FILE = 'recurring-acts';

// mirror file (sans .json) → display source label
const SOURCES = {
  [ACTS_FILE]:                 '',   // label comes from each act's own `source`
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
  // Morgan's local stock photos (images/Stock, added 2026-07-22) — matched
  // before the broader categories they'd otherwise fall into (farmers market
  // → food, voter registration → talk's "registration").
  [/farmers'? market/i, 'farmersmarket'],
  [/\btennis\b|pickleball/i, 'tennis'],
  [/\bhockey\b|ice.?skat/i, 'hockey'],
  [/\bvot(?:e|ing|ers?)\b|election|ballot/i, 'voting'],
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
  [/concert|live music|\bband\b|reggae|bluegrass|\bjazz\b|acoustic|singer|songwriter|music on the green|music on the mesa|chamber music|\bDJ\b|dance party|\bdance\b/i, 'livemusic'],
];
// Catch-all "community" events rotate through licensed/owned regional photos
// (1-6 Adobe Stock Enhanced license, 7-10 Morgan's own town photos — see
// assets/digest/fallbacks/SOURCES.json) instead of repeating one image.
// Deterministic by title hash: the same event always keeps the same photo.
// Other multi-image slugs rotate the same way (ROTATING_SLUGS).
const ROTATING_SLUGS = { farmersmarket: 3, tennis: 3, voting: 3 };
function titleHash(title) {
  let h = 0;
  const s = String(title || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// PERMANENT RULE (Morgan 2026-07-23): photos of Telluride may back TELLURIDE
// events ONLY — a Norwood card wearing Telluride's main street is wrong.
// Pool scenes: 1-3,6 Adobe Telluride; 7-10 Morgan's town-of-Telluride photos;
// 4 = Ouray/Million Dollar Hwy; 5 = generic San Juans panorama (any town).
const COMMUNITY_POOLS = {
  telluride: [1, 2, 3, 5, 6, 7, 8, 9, 10],
  ouray:     [4, 5],
  generic:   [5],
};
function communityImg(title, town) {
  const pool = town === 'Telluride' ? COMMUNITY_POOLS.telluride
    : (town === 'Ouray' || town === 'Ridgway') ? COMMUNITY_POOLS.ouray
    : COMMUNITY_POOLS.generic;
  return FB('community-' + pool[titleHash(title) % pool.length]);
}
// Fallback image priority when an event has NO real source image (Morgan,
// 2026-07-23). Order matters:
//   1. Telluride Town Park venue → the Town Park photo (a Town Park event
//      should show Town Park, whatever it is).
//   2. Category match → the category photo. A tennis event shows tennis
//      wherever it is — category beats a town default. Youth/kids tennis gets
//      the kids-tennis photo specifically.
//   3. Town default → Mountain Village (only when NO category matched, e.g. a
//      generic MV community event).
//   4. Generic regional community pool.
function fallbackImg(title, town, location) {
  const loc = String(location || ''), t = String(title || '');
  if (/\btown park\b/i.test(loc) && (!town || town === 'Telluride')) return FB('townpark');
  for (const [re, slug] of CATEGORY_FALLBACKS) {
    if (!re.test(t)) continue;
    if (slug === 'tennis' && /\byouth\b|\bkids?\b|\bjunior\b|\bchild/i.test(t)) return FB('tennis-3');
    const n = ROTATING_SLUGS[slug];
    return n ? FB(slug + '-' + ((titleHash(t) % n) + 1)) : FB(slug);
  }
  if (town === 'Mountain Village') return FB('mountainvillage');
  return communityImg(t, town);
}

// User-facing event-type filter groups (events page "type" chips). Derived
// from the same keyword patterns as the fallback images; title matched first
// (most reliable), then the description. Everything else → Community.
const SLUG_TYPE = {
  baseball: 'Outdoors & Sports', hiking: 'Outdoors & Sports', cycling: 'Outdoors & Sports',
  tennis: 'Outdoors & Sports', hockey: 'Outdoors & Sports',
  film: 'Arts & Film', art: 'Arts & Film', theater: 'Arts & Film',
  livemusic: 'Music', food: 'Food & Drink', farmersmarket: 'Food & Drink',
  family: 'Family & Kids',
  wellness: 'Wellness', talk: 'Talks & Classes', festival: 'Festivals',
  voting: 'Community'
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
// A bare "YYYY-MM-DD" is a CALENDAR DATE, not an instant. new Date() parses it
// as UTC midnight, and converting that to Mountain Time lands on the PREVIOUS
// DAY — so every source that stores a date-only pubDate was listed a day early.
//
// Found 2026-08-09 via the Telluride Mushroom Festival: it starts Aug 12, but
// telluride.com's and the Alibi's copies (pubDate "2026-08-12", no time) came
// out as Aug 11, while KOTO's ("2026-08-12T00:00:00-06:00", carrying an offset)
// was correct. Same trap as the MT-anchored rule, one layer down: the fix isn't
// to convert more carefully, it's to not convert a value that has no time in it.
const isCalendarDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());

function dateKeyOf(e) {
  if (/^\d{4}-\d{2}-\d{2}/.test(e.date || '')) return String(e.date).slice(0, 10);
  if (e.date) { const k = mtKey(e.date); if (k) return k; }
  if (isCalendarDate(e.pubDate)) return String(e.pubDate).trim();
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
// Comparison key for titles. The order of these passes matters:
//
//  1. Entity apostrophes become real ones. Sources emit "Nature&#039;s", and
//     without this the generic entity strip turns it into "nature 039 s".
//  2. Apostrophes are DELETED, not turned into a space. Replacing them with a
//     space was the bug behind "Ridgway Farmer's Market" (KOTO) publishing
//     alongside "Ridgway Farmers Market" (Ouray Ridgway): the two keys came out
//     "ridgway farmer s market" and "ridgway farmers market", so dedup never
//     saw a match. Everything else still becomes a space, so word boundaries
//     survive and "Cara Van" never collides with "Caravan".
//  3. "&" becomes "and" so "Rock & Roll" and "Rock and Roll" agree.
const normTitle = (t) => String(t || '')
  .toLowerCase()
  .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&[a-z]+;|&#\d+;/g, ' ')
  .replace(/['\u2018\u2019\u02bc`]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Applied ONLY to the cross-source dedup key, never to act suppression: an
// aggregator appends the venue to a title the venue itself lists bare, e.g.
// "DARRELL SCOTT - Live at The Sherbino" (Ouray Ridgway) vs "DARRELL SCOTT"
// (Sherbino Theater). Deliberately narrow -- a general "strip trailing at X"
// would wrongly merge "Yoga at Hartwell Park" into a plain "Yoga" the same day.
const dedupTitle = (t) => normTitle(t).replace(/\s+live at\s+.*$/, '').trim();

// Read recurring-acts.json (repo root, { _comment, series: [...] }). Missing or
// malformed is non-fatal — the rest of the index is worth building.
function readActs(repoRoot) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(repoRoot, ACTS_FILE + '.json'), 'utf8'));
    return Array.isArray(doc.series) ? doc.series : [];
  } catch (e) {
    console.warn(`  events-index: ${ACTS_FILE}.json unreadable — specific acts skipped (${e.message})`);
    return [];
  }
}

// date → normalized series names that have a SPECIFIC act that day.
//
// Without this the page shows both cards: "Movie Mondays in Hartwell Park" from
// the Ouray/Ridgway calendar AND "Movie Mondays: Top Gun" from the acts file.
// The generic one is strictly less useful — knowing the film is the whole point
// of the acts file — so it loses. Matching is substring-on-normalized-title, so
// "Movie Mondays" catches "Movie Mondays in Hartwell Park" while leaving
// "Telluride Farmers Market" (the market itself) alone when the suppressed
// series is "Telluride Farmers' Market Music Series".
function actSuppressionIndex(acts) {
  const byDate = new Map();
  for (const a of acts) {
    const date = String(a?.date || '').slice(0, 10);
    const series = normTitle(a?.series);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !series) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date).add(series);
  }
  return byDate;
}

// Does a specific act already cover this title on this date? Kept as its own
// exported function so test/recurring-acts-suppression.test.js exercises the
// REAL matching rule rather than a copy of it — the over-match failure here
// deletes a live event from the calendar, silently.
function isActSuppressed(index, title, date) {
  const set = index.get(date);
  if (!set) return false;
  const nt = normTitle(title);
  for (const series of set) if (nt.includes(series)) return true;
  return false;
}

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
  const suppressed = actSuppressionIndex(readActs(repoRoot));
  for (const [file, label] of Object.entries(SOURCES)) {
    let arr = [];
    if (file === ACTS_FILE) {
      // Each act carries `image`; the shared normalizer below reads `imageUrl`.
      arr = readActs(repoRoot).map((a) => ({ ...a, imageUrl: a.image || '' }));
    } else if (RUNTIME_SOURCES[file]) {
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
      // A generic series entry loses to the specific act on the same day.
      if (file !== ACTS_FILE && isActSuppressed(suppressed, title, date)) continue;
      const key = dedupTitle(title).slice(0, 60) + '|' + date;
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
      // Acts come from several calendars, so each carries its own source label
      // ("Ouray Ridgway Calendar", "Telluride.com") rather than a per-file one.
      const srcLabel = label || String(e.source || '').trim();
      const town = townFor(e, srcLabel);
      const rec = {
        title: title,
        href: href,
        date: date,
        time: timeOf(e),
        location: String(e.location || '').trim(),
        town: town,
        // Keep the source image whenever it's an absolute URL. Both prior
        // exclusions are gone (2026-07-23): webp renders in browsers (the webp
        // block lives only in the EMAIL path), and koto.org/wp-content is
        // embeddable after all (ACAO:*, no CORP header). Otherwise → venue/
        // category fallback.
        img: (/^https?:\/\//.test(rawImg)) ? rawImg : fallbackImg(title, town, e.location),
        category: String(e.category || '').trim(),
        source: srcLabel,
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
  // Freshness stamp (day-granular, MT) — content-review alerts if this build
  // stops running. Sidecar file so the index stays a plain array for readers.
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const metaPath = path.join(root, 'data', 'events-index-meta.json');
  const meta = JSON.stringify({ generatedAt: stamp, count: events.length }) + '\n';
  try { if (fs.readFileSync(metaPath, 'utf8') !== meta) fs.writeFileSync(metaPath, meta); }
  catch (_) { fs.writeFileSync(metaPath, meta); }
  console.log(`  events-index: ${events.length} events (60-day window) → ${path.relative(root, p)}`);
  return events;
}

if (require.main === module) run();
module.exports = { buildEventsIndex, run, actSuppressionIndex, isActSuppressed, normTitle, dedupTitle, dateKeyOf };
