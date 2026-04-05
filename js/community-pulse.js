/* Community Pulse Engine */

/* ══════════════════════════════════════════════════════════════
   COMMUNITY PULSE ENGINE
   View-only aggregation of recent public posts from local organizations
   ══════════════════════════════════════════════════════════════ */
// ── Community Pulse Sources & Data ──
// Posts auto-expire after 5 days. Max 20 shown at a time.
// Data refreshed every 6 hours with new relevant posts.
const CP_SOURCES = {
  'c7cc': { name: 'C7CC \u2014 Chair 7 Community Coalition', type: 'community', platform: 'facebook', url: 'https://www.facebook.com/groups/1076276483955655', logo: '' },
  'fb-3395': { name: 'Telluride Community Board', type: 'community', platform: 'facebook', url: 'https://www.facebook.com/groups/3395262530783440', logo: '' },
  'fb-2438': { name: 'Telluride Classifieds & Community', type: 'community', platform: 'facebook', url: 'https://www.facebook.com/groups/243846449146234', logo: '' },
  'koto-carpool': { name: 'KOTO Community Carpool', type: 'community', platform: 'facebook', url: 'https://www.facebook.com/groups/kotocommunitycarpool', logo: '' },
  'fb-2061': { name: 'Telluride Area Discussion', type: 'community', platform: 'facebook', url: 'https://www.facebook.com/groups/2061333304249532', logo: '' },
  'yoga-fest': { name: 'Telluride Yoga Festival', type: 'arts', platform: 'facebook', url: 'https://www.facebook.com/groups/tellurideyogafestival', logo: '' },
  'blues-brews': { name: 'Telluride Blues & Brews Festival', type: 'arts', platform: 'facebook', url: 'https://www.facebook.com/groups/telluridebluesbrewsfestivall', logo: '' },
  'smc-dems': { name: 'San Miguel County Democrats', type: 'government', platform: 'instagram', url: 'https://www.instagram.com/sanmiguelctydemocrats/', logo: '' },
  'humane': { name: 'Telluride Humane Society', type: 'nonprofits', platform: 'instagram', url: 'https://www.instagram.com/telluridehumanesociety/', logo: '' },
  'skijoring': { name: 'Telluride Skijoring & Winter Celebration', type: 'arts', platform: 'instagram', url: 'https://www.instagram.com/trideskijoring/', logo: '' },
  'rotary-ig': { name: 'Rotary Club of Telluride', type: 'clubs', platform: 'instagram', url: 'https://www.instagram.com/telluriderotary/', logo: 'https://clubrunner.blob.core.windows.net/00000003291/thumb/ClubLogo/clublogo.png' },
  'telski': { name: 'Telluride Ski Resort', type: 'health', platform: 'instagram', url: 'https://www.instagram.com/tellurideski/', logo: '' },
  'foundation': { name: 'Telluride Foundation', type: 'nonprofits', platform: 'instagram', url: 'https://www.instagram.com/telluridefoundation/', logo: '' },
  'tchn': { name: 'Tri-County Health Network', type: 'health', platform: 'instagram', url: 'https://www.instagram.com/tchn_co/', logo: '' }
};
// Posts are dated relative to COMMUNITY_PULSE_CACHE_DATE.
// Each post expires 5 days after its postedAt date.
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-04';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'telski-022', sourceKey: 'telski',
    postedAt: '2026-04-04T08:00:00',
    title: 'Last day tomorrow — ski resort closes Sunday April 5 for the season',
    excerpt: 'Telluride Ski Resort reopened Friday after closing mid-week to preserve snow for closing weekend. Intermediate and advanced terrain only — spring conditions. Sunday April 5 is the final day of the 2025-26 season. Get your last turns in!',
    tags: ['Ski Season', 'Closing Day', 'Final Weekend'], featured: true, eventRelated: true
  },
  {
    id: 'fb-3395-020', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T10:00:00',
    title: 'Water restrictions in effect — outdoor watering Mon/Wed/Fri only',
    excerpt: 'Town of Telluride outdoor water restrictions took effect March 31 due to below-average snowpack and anticipated dry spring. Watering allowed Mon/Wed/Fri only, before 8 AM or after 7 PM. Irrigation at 70–75% of normal. Exterior water features must be off. Runoff forecast 60–70% of normal.',
    tags: ['Drought', 'Water', 'Conservation'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-020', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T09:00:00',
    title: 'Fire outlook: above-average wildfire risk building across Four Corners',
    excerpt: 'National Interagency Fire Center seasonal outlook shows above-average wildfire risk across the Four Corners region by June. Colorado has the lowest snowpack in the modern SNOTEL era. First four months of the water year are the warmest in 131 years. Stay fire-aware and maintain defensible space.',
    tags: ['Wildfire', 'Drought', 'Safety'], featured: true, eventRelated: false
  },
  {
    id: 'c7cc-018', sourceKey: 'c7cc',
    postedAt: '2026-04-04T09:30:00',
    title: 'SMRHA housing lottery — deed-restricted units, drawing April 24',
    excerpt: 'SMRHA accepting applications for deed-restricted homeownership units (Silver Jack 202, Silver Jack 205, Element 52 SW-102). Lottery drawing April 24 at 10 AM, Rebekah Hall, 113 W Colorado Ave. Visit smrha.org or email admin@smrha.org.',
    tags: ['Housing', 'Affordable', 'Lottery'], featured: true, eventRelated: true
  },
  {
    id: 'telski-023', sourceKey: 'telski',
    postedAt: '2026-04-04T08:30:00',
    title: 'Gondola closes Monday April 6 — reopens May 21 for summer',
    excerpt: 'The free gondola between Telluride and Mountain Village closes Monday, April 6 for spring maintenance. Reopens May 21 for summer operations. Free SMART bus service continues between towns during the closure.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-021', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T07:30:00',
    title: 'Town community survey open through May 21 — share your feedback',
    excerpt: 'The Town of Telluride launched its third annual community survey on March 31. Share feedback on government services, quality of life, and priorities. Open to all residents through May 21, 2026. Your input helps shape town budget and policy decisions.',
    tags: ['Town Government', 'Survey', 'Civic'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-021', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T09:30:00',
    title: 'Town election petitions due April 20 — run for Town Council',
    excerpt: 'Nomination petitions for the June 30 Town of Telluride special election are available now. Completed petitions must be submitted to the Town Clerk by Monday, April 20, 2026. Town Council seats to be filled — if you\'re considering a run for local office, now is the time.',
    tags: ['Elections', 'Government', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'smc-dems-011', sourceKey: 'smc-dems',
    postedAt: '2026-04-04T08:00:00',
    title: 'County Democratic Assembly April 12 — delegate registration closes tomorrow',
    excerpt: 'San Miguel County Democratic Assembly is April 12. Register by tomorrow, April 5, to participate as a delegate. Info at smcdemocrats.org. This is how local candidates advance to the primary ballot.',
    tags: ['Politics', 'Assembly', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-022', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T07:00:00',
    title: 'KOTO Spring Street Dance recap — huge turnout on Colorado Ave',
    excerpt: 'The KOTO Spring Street Dance drew a big crowd Thursday on Colorado Ave. The Other Brothers, Circles Around the Sun, Steely Dead, and JJ Grey & Mofro rocked the block. The Pink Flamingo Costume Contest was a hit. Great end-of-season send-off!',
    tags: ['Events', 'KOTO', 'Recap'], featured: false, eventRelated: true
  },
  {
    id: 'c7cc-019', sourceKey: 'c7cc',
    postedAt: '2026-04-04T11:00:00',
    title: '$290K in business grants distributed to 46 local businesses',
    excerpt: 'Town of Telluride distributed approximately $290,876 to 46 locally owned businesses impacted by the ski resort closure earlier this season. Part of the broader $400,000 economic relief package approved in February alongside tourism, air service, and resident hardship funding.',
    tags: ['Business', 'Town Government', 'Relief'], featured: false, eventRelated: false
  },
  {
    id: 'tchn-014', sourceKey: 'tchn',
    postedAt: '2026-04-04T09:00:00',
    title: 'Free Mental Health First Aid training — Tuesday, April 8',
    excerpt: 'Free 8-hour Mental Health First Aid certification course at the Telluride Conference Center on Tuesday, April 8. Learn to recognize signs and respond to mental health crises. Register at tchnetwork.org.',
    tags: ['Mental Health', 'Training', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-022', sourceKey: 'fb-2061',
    postedAt: '2026-04-03T07:30:00',
    title: 'CDOT: CO 145 road widening near Society Turn through September',
    excerpt: 'CDOT road work on CO 145 at Mile Point 71, just west of Society Turn Roundabout, runs through early September. Williams Construction adding a new right-turn lane with acceleration/deceleration lanes. Mon–Fri, 9 AM–4 PM. Expect lane shifts, flaggers, and up to 5-minute delays.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-012', sourceKey: 'smc-dems',
    postedAt: '2026-04-03T10:00:00',
    title: 'County housing projects update — Ilium groundbreaking targeted spring 2026',
    excerpt: 'San Miguel County targets April–May 2026 groundbreaking for five affordable units at the Ilium site (KEO Studio Works design). Deer Creek CDOT partnership aims for 30–35 workforce units. Pathfinder 73-unit project still contingent on water. County also advancing a Land Use Code Amendment for accelerated housing review.',
    tags: ['Housing', 'County', 'Development'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-023', sourceKey: 'fb-3395',
    postedAt: '2026-04-03T16:00:00',
    title: 'Bears are stirring — secure trash and remove bird feeders',
    excerpt: 'Town of Telluride spring bear awareness campaign is underway. Bear-proof trash containers are required for all residential properties. Lock cars, secure windows, and take down bird feeders. Most bear conflicts are linked to careless handling of food and garbage.',
    tags: ['Wildlife', 'Town Notice', 'Bears'], featured: false, eventRelated: false
  },
  {
    id: 'humane-014', sourceKey: 'humane',
    postedAt: '2026-04-04T11:00:00',
    title: 'Spring adoptions — meet Juniper and Copper at telluridehumanesociety.com',
    excerpt: 'Telluride Humane Society has dogs and cats ready for forever homes this spring. Juniper (heeler mix) and Copper (lab mix) are looking for active families. Foster-to-adopt available. All adopters must be in Telluride for pickup. Apply at telluridehumanesociety.com.',
    tags: ['Adoption', 'Dogs', 'Pets'], featured: false, eventRelated: false
  },
  {
    id: 'rotary-ig-010', sourceKey: 'rotary-ig',
    postedAt: '2026-04-03T13:00:00',
    title: 'Rotary scholarships for seniors — deadline April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors are open. Awards up to $5,000 for top academic achievers, plus $2,500 awards and a $1,000 vocational scholarship. Deadline April 15. Apply at telluriderotary.org.',
    tags: ['Scholarships', 'Youth', 'Education'], featured: false, eventRelated: false
  },
  {
    id: 'yoga-009', sourceKey: 'yoga-fest',
    postedAt: '2026-04-02T10:00:00',
    title: '18th annual Yoga Festival — early-bird passes end April 15',
    excerpt: 'Telluride Yoga Festival runs June 25–28 with 24+ presenters and over 120 offerings plus live music and excursions. Early-bird pricing ends April 15. All levels welcome — grab your pass before prices go up!',
    tags: ['Festival', 'Yoga', 'Early Bird'], featured: false, eventRelated: true
  },
  {
    id: 'foundation-010', sourceKey: 'foundation',
    postedAt: '2026-04-04T10:00:00',
    title: 'Town Park Campground reservations open April 21 — first window May 15–June 12',
    excerpt: 'Town Park Campground reservation windows announced. First booking window opens April 21 for arrivals May 15–June 12. Plan ahead — Telluride campground spots go fast. Details at telluride-co.gov.',
    tags: ['Camping', 'Town Park', 'Reservations'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-023', sourceKey: 'fb-2061',
    postedAt: '2026-04-03T12:00:00',
    title: 'Uncompahgre Plateau forest treatment — public comment open',
    excerpt: 'USFS proposed forest treatment project covers 267,000+ acres on the Uncompahgre Plateau across Montrose, Ouray, and San Miguel counties. 30-day public comment period underway. Details at fs.usda.gov. Important for wildfire mitigation in the region.',
    tags: ['Forest', 'Public Comment', 'Wildfire'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2438-009', sourceKey: 'fb-2438',
    postedAt: '2026-04-03T09:00:00',
    title: 'Housing Authority reduces employment hours for 2026 rentals',
    excerpt: 'Telluride Housing Authority temporarily reduced the employment requirement from 1,400 to 1,200 hours for employee rental housing in 2026. Aimed at easing access for seasonal and year-round workers during the economic recovery period.',
    tags: ['Housing', 'Policy', 'Workers'], featured: false, eventRelated: false
  }
];
const CP_MAX_POSTS = 20;
const CP_EXPIRY_DAYS = 5;
// ── Community Pulse State ──// ── Community Pulse State ──
let cpTimeWindow = '48h';
let cpTypeFilter = 'all';
let cpPlatformFilter = 'all';
let cpSearchTerm = '';
let cpEventOnly = false;
function cpRelativeTime(isoStr) {
  const posted = new Date(isoStr);
  const now = new Date();
  const diffMs = now - posted;
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return diffH + ' hour' + (diffH === 1 ? '' : 's') + ' ago';
  const diffD = Math.floor(diffH / 24);
  return diffD + ' day' + (diffD === 1 ? '' : 's') + ' ago';
}
function cpGetSource(p) {
  return CP_SOURCES[p.sourceKey] || { name: 'Unknown', type: 'community', platform: 'website', url: '#', logo: '' };
}
function cpFilterPosts() {
  const now = new Date();
  const expiryMs = CP_EXPIRY_DAYS * 24 * 3600000;
  // Time window for display filter
  let windowMs = 48 * 3600000;
  if (cpTimeWindow === '72h') windowMs = 72 * 3600000;
  else if (cpTimeWindow === '7d') windowMs = 7 * 24 * 3600000;
  const filtered = COMMUNITY_PULSE_POSTS.filter(function(p) {
    const src = cpGetSource(p);
    const posted = new Date(p.postedAt);
    // Hard expiry: remove posts older than 5 days
    if ((now - posted) > expiryMs) return false;
    // Display time window filter
    if ((now - posted) > windowMs) return false;
    // Type filter
    if (cpTypeFilter !== 'all' && src.type !== cpTypeFilter) return false;
    // Platform filter
    if (cpPlatformFilter !== 'all' && src.platform !== cpPlatformFilter) return false;
    // Event only
    if (cpEventOnly && !p.eventRelated) return false;
    // Search
    if (cpSearchTerm) {
      var s = cpSearchTerm.toLowerCase();
      if (src.name.toLowerCase().indexOf(s) === -1 &&
          p.title.toLowerCase().indexOf(s) === -1 &&
          p.excerpt.toLowerCase().indexOf(s) === -1 &&
          !p.tags.some(function(t) { return t.toLowerCase().indexOf(s) !== -1; })) return false;
    }
    return true;
  }).sort(function(a, b) {
    return new Date(b.postedAt) - new Date(a.postedAt);
  });
  // Cap at 20 posts
  return filtered.slice(0, CP_MAX_POSTS);
}
function renderCommunityPulse() {
  const container = document.getElementById('community-pulse-content');
  const featuredEl = document.getElementById('communityPulseFeatured');
  if (!container) return;
  const posts = cpFilterPosts();
  // Render featured
  if (featuredEl) {
    const featured = posts.filter(function(p) { return p.featured; }).slice(0, 3);
    if (featured.length > 0) {
      featuredEl.innerHTML = featured.map(function(p) {
        var src = cpGetSource(p);
        return '<a class="link-card" href="' + src.url + '" target="_blank" rel="noopener">' +
          '<div class="link-icon">' + (p.eventRelated ? '\ud83d\udce3' : '\ud83d\udccc') + '</div>' +
          '<h4>' + p.title + '</h4>' +
          '<p>' + p.excerpt.substring(0, 100) + (p.excerpt.length > 100 ? '\u2026' : '') + '</p>' +
          '<div class="link-source">' + src.name + ' \u00b7 ' + src.platform.charAt(0).toUpperCase() + src.platform.slice(1) + '</div>' +
        '</a>';
      }).join('');
      featuredEl.parentElement.style.display = '';
    } else {
      featuredEl.parentElement.style.display = 'none';
    }
  }
  // Render main feed
  if (posts.length === 0) {
    container.innerHTML = '<div class="empty-state">No community updates match your current filters. Try widening the time window or clearing filters.</div>';
    return;
  }
  let html = '';
  posts.forEach(function(p) {
    var src = cpGetSource(p);
    const logoHtml = src.logo
      ? '<div class="card-logo"><img src="' + src.logo + '" alt="' + src.name + '" style="width:100%;height:100%;object-fit:contain;border-radius:10px;" loading="lazy"></div>'
      : '<div class="card-logo" style="display:flex;align-items:center;justify-content:center;background:rgba(33,68,60,0.08);border-radius:10px;font-size:1.2rem;">\u25ce</div>';
    const tagsHtml = p.tags.map(function(t) {
      return '<span class="legal-meta-tag tag-type">' + t + '</span>';
    }).join('');
    const imageHtml = '';
    const platformIcon = { facebook: '\ud83d\udcd8', instagram: '\ud83d\udcf7', website: '\ud83c\udf10', youtube: '\u25b6\ufe0f' }[src.platform] || '\ud83d\udd17';
    html += '<div class="card community-pulse-card" data-pulse-type="' + src.type + '" data-pulse-platform="' + src.platform + '">';
    html += '<div class="card-body" style="width:100%;">';
    html += '<div class="community-pulse-topline">';
    html += '<div>';
    html += '<span style="display:inline-block; font-size:0.72rem; padding:2px 8px; background:rgba(33,68,60,0.08); color:var(--forest); border-radius:6px; font-weight:600;">' + src.type.charAt(0).toUpperCase() + src.type.slice(1) + '</span> ';
    html += '<span style="display:inline-block; font-size:0.72rem; padding:2px 8px; background:rgba(166,143,87,0.12); color:var(--accent); border-radius:6px; font-weight:600;">' + platformIcon + ' ' + src.platform.charAt(0).toUpperCase() + src.platform.slice(1) + '</span>';
    html += '</div>';
    html += '<div class="community-pulse-time">' + cpRelativeTime(p.postedAt) + '</div>';
    html += '</div>';
    html += '<div style="display:flex; align-items:center; gap:10px; margin:6px 0 2px 0;">' + logoHtml;
    html += '<h3 style="margin:0;"><a href="' + src.url + '" target="_blank" rel="noopener">' + src.name + '</a></h3></div>';
    html += '<div class="meta" style="margin-bottom:4px;">' + p.title + '</div>';
    html += '<div class="description">' + p.excerpt + '</div>';
    html += imageHtml;
    html += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">' + tagsHtml + '</div>';
    html += '<div class="card-actions" style="margin-top:10px;">';
    html += '<a href="' + src.url + '" target="_blank" rel="noopener" class="cal-btn">View Original Post</a>';
    html += '</div>';
    html += '<div class="community-pulse-note">Comments stay on the original platform.</div>';
    html += '</div></div>';
  });
  container.innerHTML = html;
  // Ensure loading/empty states span full grid width
  var loadingEl = container.querySelector('.loading');
  if (loadingEl) loadingEl.style.gridColumn = '1 / -1';
}
// ── Community Pulse Filter Handlers ──
document.addEventListener('DOMContentLoaded', function() {
  // Time window filters
  document.querySelectorAll('#communityPulseTimeFilters .chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('#communityPulseTimeFilters .chip').forEach(function(c) { c.className = 'chip'; });
      chip.classList.add('active-all');
      cpTimeWindow = chip.dataset.pulseWindow;
      renderCommunityPulse();
    });
  });
  // Type filters
  document.querySelectorAll('#communityPulseTypeFilters .chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('#communityPulseTypeFilters .chip').forEach(function(c) { c.className = 'chip'; });
      if (chip.dataset.pulseType === 'all') chip.classList.add('active-all');
      else chip.classList.add('active-topic');
      cpTypeFilter = chip.dataset.pulseType;
      renderCommunityPulse();
    });
  });
  // Platform filters
  document.querySelectorAll('#communityPulsePlatformFilters .chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('#communityPulsePlatformFilters .chip').forEach(function(c) { c.className = 'chip'; });
      if (chip.dataset.pulsePlatform === 'all') chip.classList.add('active-all');
      else chip.classList.add('active-topic');
      cpPlatformFilter = chip.dataset.pulsePlatform;
      renderCommunityPulse();
    });
  });
  // Search
  var cpSearchInput = document.getElementById('communityPulseSearch');
  if (cpSearchInput) {
    var cpSearchTimeout;
    cpSearchInput.addEventListener('input', function() {
      clearTimeout(cpSearchTimeout);
      cpSearchTimeout = setTimeout(function() {
        cpSearchTerm = cpSearchInput.value.trim();
        renderCommunityPulse();
      }, 300);
    });
  }
  // Event-only checkbox
  var cpEventCheck = document.getElementById('communityPulseEventOnly');
  if (cpEventCheck) {
    cpEventCheck.addEventListener('change', function() {
      cpEventOnly = cpEventCheck.checked;
      renderCommunityPulse();
    });
  }
  // Initial render
  renderCommunityPulse();
});
