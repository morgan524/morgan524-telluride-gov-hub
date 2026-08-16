// ── Site search index (data/search-index.json) ──────────────────────────────
//
// One compact, flat index over everything the site publishes, consumed by the
// header search overlay in site.js (lazy-fetched on first open). Built from
// the data/*.json mirrors AFTER they're written each content-refresh run, plus
// a hand list of the site's static pages so "zoning" finds the Zoning Map.
//
// Record shape (keep it lean — the whole file ships to browsers):
//   { t: title, s: snippet (≤160 chars), u: url, k: kind, d: 'YYYY-MM-DD'? }
// Kinds: page | dive | news | meeting | recap | event | org | housing |
//        legal | blog
//
// Runs from content-refresh main() after build-events-index, or by hand:
//   node scripts/build-search-index.js

const fs = require('fs');
const path = require('path');

const clip = (s, n = 160) => {
  s = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';
};

// The site's fixed destinations, with the search terms people actually use.
// (Start Here + core pages; deep dives are added from data below.)
const STATIC_PAGES = [
  { t: 'Start Here — new to Livable Telluride?', s: 'Who decides what, the issues everyone is talking about, and how to plug in.', u: '/start-here.html', k: 'page' },
  { t: 'Local News', s: 'Short, useful civic reporting — Telluride Times, San Miguel Basin Forum, KOTO.', u: '/local-news.html', k: 'page' },
  { t: 'Deep Dives', s: 'The full story behind the region\'s big issues.', u: '/deep-dives.html', k: 'page' },
  { t: 'Events calendar', s: 'Concerts, films, markets, talks — one shared calendar for the whole region.', u: '/events.html', k: 'page' },
  { t: 'Gov-Hub — public meetings', s: 'Every public meeting for the next month: agendas, summaries, Zoom links, how to comment.', u: '/gov-hub.html', k: 'page' },
  { t: 'Past meetings & recaps', s: 'What happened at recent meetings — plain-English recaps.', u: '/gov-hub-past.html', k: 'page' },
  { t: 'Housing', s: 'Affordable & deed-restricted listings, housing data and resources.', u: '/housing.html', k: 'page' },
  // Hub-Bub's community side is paused (2026-08-16) and the page is noindex.
  // It stays live only as the signup surface, which nobody searches for by
  // name, so it is out of site search until the board comes back.
  { t: 'Local Orgs directory', s: 'The organizations, nonprofits, and groups that make up the community.', u: '/local-orgs.html', k: 'page' },
  { t: 'Zoning Map', s: 'Interactive San Miguel County zoning + parcel map.', u: '/zoning-map/index.html', k: 'page' },
  { t: 'Projects Map', s: 'Development projects across the region, mapped.', u: '/projects-map/index.html', k: 'page' },
  { t: 'Vote Tracker', s: 'How each board member voted, vote by vote.', u: '/v2/vote-tracker.html', k: 'page' },
  { t: 'Legal Notices', s: 'Public notices, bids and RFPs from every local government.', u: '/legal-notices.html', k: 'page' },
  { t: 'About Livable Telluride', s: 'Who we are and why we do this.', u: '/about.html', k: 'page' },
  { t: 'Donate', s: 'Independent, ad-free, always free. Keep it that way.', u: '/donate.html', k: 'page' },
  { t: 'Subscribe to the Week Ahead newsletter', s: 'Meetings, events, and what to watch — free by email every Monday.', u: '/hub-bub.html#signup', k: 'page' },
  { t: 'Norwood & the West End', s: 'Town meetings, events, Forum news, notices, and groups — one page for Norwood, Nucla, Naturita, and Wright\'s Mesa.', u: '/norwood.html', k: 'page' },
];

// Deep dives that live outside LAND_USE_ISSUES (mirror of deep-dives.html EXTRAS).
const EXTRA_DIVES = [
  { t: 'The Gondola (deep dive)', s: 'The free gondola\'s funding fight — SMART\'s ballot measure, the cost-sharing IGA.', u: '/deep-dive-gondola.html', k: 'dive' },
  { t: 'VooDoo (deep dive)', s: 'A $20M debt stack on one housing project — the balloon payment due in 2032.', u: '/deep-dive-voodoo.html', k: 'dive' },
  { t: 'The Town Park Oval (deep dive)', s: 'The proposed Town Park Oval paving and Warner Field improvements.', u: '/deep-dive-field-paving-town-park.html', k: 'dive' },
  { t: 'Telluride Debt (deep dive)', s: 'Where Telluride\'s money goes — the town\'s debt load, from $36M to $103M.', u: '/Blog%20Posts/the-growing-weight-of-tellurides-debt/', k: 'dive' },
];

function readJson(dataDir, name) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')); }
  catch (e) { console.warn('  search-index: skipped ' + name + ' (' + e.message + ')'); return null; }
}

// "July 22, 2026" / "Jul 21, 2026" / "2026-07-22" → ISO, or ''.
function iso(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d);
  if (isNaN(t)) return '';
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

function run(repoRoot) {
  const dataDir = path.join(repoRoot, 'data');
  const out = [...STATIC_PAGES, ...EXTRA_DIVES];

  // Deep dives (LAND_USE_ISSUES-driven pages)
  const issues = readJson(dataDir, 'land-use-issues.json') || {};
  for (const [key, v] of Object.entries(issues)) {
    out.push({ t: (v.label || key) + ' (deep dive)', s: clip(v.summary || v.intro || v.dek || v.subtitle || 'The full story behind ' + (v.label || key) + '.'), u: '/deep-dive-' + key + '.html', k: 'dive' });
  }

  // News (three sources; newest ~90 days is all the mirrors hold anyway)
  for (const [file, label] of [['telluride-times-articles.json', ''], ['smb-forum-articles.json', ''], ['koto-featured-stories.json', '']]) {
    for (const a of readJson(dataDir, file) || []) {
      if (!a || !a.title || !a.href) continue;
      out.push({ t: a.title, s: clip(a.copy || ''), u: a.href, k: 'news', d: iso(a.firstSeen || a.date) });
    }
  }

  // Upcoming meetings (gov-hub window)
  for (const m of readJson(dataDir, 'week-meetings.json') || []) {
    if (!m || !m.title) continue;
    out.push({ t: m.title + ' — ' + (m.sourceLabel || ''), s: clip(m.summary || (m.location || '')), u: '/gov-hub.html', k: 'meeting', d: m.date || '' });
  }

  // Meeting recaps
  for (const r of readJson(dataDir, 'meeting-recaps.json') || []) {
    if (!r || !r.title) continue;
    out.push({ t: r.title + (r.sourceLabel ? ' — ' + r.sourceLabel : ''), s: clip(r.recap || ''), u: '/gov-hub-past.html', k: 'recap', d: r.date || '' });
  }

  // Events (precomputed 60-day index)
  for (const e of readJson(dataDir, 'events-index.json') || []) {
    if (!e || !e.title) continue;
    out.push({ t: e.title, s: clip([e.date, e.time, e.location || e.town].filter(Boolean).join(' · ')), u: '/events.html', k: 'event', d: e.date || '' });
  }

  // Local orgs
  for (const o of readJson(dataDir, 'local-orgs.json') || []) {
    if (!o || !o.name) continue;
    out.push({ t: o.name, s: clip(o.summary || o.category || ''), u: '/local-orgs.html', k: 'org' });
  }

  // Housing listings
  for (const h of readJson(dataDir, 'housing-listings.json') || []) {
    if (!h || !h.title) continue;
    out.push({ t: String(h.title).replace(/^[^\w]*/, ''), s: clip([h.beds, h.price, h.address].filter(Boolean).join(' · ')), u: '/housing.html', k: 'housing' });
  }

  // Legal notices
  for (const n of readJson(dataDir, 'legal-notices.json') || []) {
    if (!n || !n.title) continue;
    out.push({ t: n.title + (n.entity ? ' — ' + n.entity : ''), s: clip(n.summary || n.type || ''), u: '/legal-notices.html', k: 'legal' });
  }

  // Blog posts
  for (const b of readJson(dataDir, 'blog-posts.json') || []) {
    if (!b || !b.title || !b.href) continue;
    out.push({ t: b.title, s: clip(b.excerpt || ''), u: b.href, k: 'blog', d: iso(b.date) });
  }

  const payload = { generated: new Date().toISOString(), items: out };
  const outPath = path.join(dataDir, 'search-index.json');
  const json = JSON.stringify(payload);
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, 'utf8') !== json) fs.writeFileSync(outPath, json);
  console.log('  search-index: ' + out.length + ' records (' + Math.round(json.length / 1024) + ' KB) → data/search-index.json');
  return payload;
}

if (require.main === module) run(path.join(__dirname, '..'));

module.exports = { run };
