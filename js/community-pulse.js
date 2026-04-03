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
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-03';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'fb-3395-014', sourceKey: 'fb-3395',
    postedAt: '2026-04-03T08:00:00',
    title: 'KOTO Spring Street Dance — TODAY, 4–8 PM on Colorado Ave',
    excerpt: 'KOTO Spring Street Dance is TODAY, Friday April 3, 4–8 PM on Colorado Ave between Aspen and Fir. Free live music from The Other Brothers (Allman Brothers tribute). Cash bar, Pink Flamingo Costume Contest. Celebrate the end of ski season with Telluride!',
    tags: ['Events', 'KOTO', 'Street Dance'], featured: true, eventRelated: true
  },
  {
    id: 'telski-017', sourceKey: 'telski',
    postedAt: '2026-04-03T07:00:00',
    title: 'Closing weekend is HERE — ski today through Sunday April 5',
    excerpt: 'Telluride Ski Resort reopened today for closing weekend after temporarily closing mid-week to preserve snow. Ski through Sunday April 5. Pond skim and closing party already went off at Gorrono Ranch on April 2 with DJ Wombat. Check tellurideskiresort.com for conditions and enjoy the final turns!',
    tags: ['Ski Season', 'Closing Day', 'Pond Skim'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-013', sourceKey: 'fb-2061',
    postedAt: '2026-04-03T07:30:00',
    title: 'Willow Springs Fire update — dry conditions persist',
    excerpt: 'The Willow Springs Fire ignited April 1 near Telluride amid exceptionally dry conditions. Colorado is preparing for a serious wildfire season following a warm, dry winter. San Miguel County remains in severe drought. Follow Telluride Fire Protection District and SMSO for the latest.',
    tags: ['Wildfire', 'Safety', 'Alert'], featured: true, eventRelated: false
  },
  {
    id: 'telski-018', sourceKey: 'telski',
    postedAt: '2026-04-03T09:00:00',
    title: 'Tips-Up FriYAY finale — LP Giobbi at Heritage Plaza today',
    excerpt: 'The Tips-Up FriYAY après series wraps up TODAY, April 3, with DJ LP Giobbi at Heritage Plaza, Mountain Village, 3:30–5:30 PM. Free event with live music, beverages, and mountain views. Last one of the season!',
    tags: ['Music', 'Mountain Village', 'Free'], featured: true, eventRelated: true
  },
  {
    id: 'c7cc-013', sourceKey: 'c7cc',
    postedAt: '2026-04-03T08:30:00',
    title: 'SMRHA housing lottery — deed-restricted units, drawing April 24',
    excerpt: 'SMRHA accepting applications for deed-restricted homeownership units (White House 3C, Entrada H, Meribel B). Lottery drawing April 24 at 10 AM, Rebekah Hall, 113 W Colorado Ave. Visit smrha.org/lottery or email admin@smrha.org.',
    tags: ['Housing', 'Affordable', 'Lottery'], featured: true, eventRelated: true
  },
  {
    id: 'fb-3395-015', sourceKey: 'fb-3395',
    postedAt: '2026-04-03T10:00:00',
    title: 'Town outdoor water restrictions in effect since March 31',
    excerpt: 'Town of Telluride outdoor water restrictions began March 31. Watering allowed Mon/Wed/Fri only, before 8 AM or after 7 PM. Irrigation systems must run at 70–75% of normal. Exterior water features must be off. San Miguel County remains in severe drought with runoff forecast 60–70% of normal.',
    tags: ['Drought', 'Water', 'Conservation'], featured: false, eventRelated: false
  },
  {
    id: 'telski-019', sourceKey: 'telski',
    postedAt: '2026-04-02T07:00:00',
    title: 'Gondola closes April 6 — reopens May 21 for summer',
    excerpt: 'The free gondola between Telluride and Mountain Village closes April 6 for spring maintenance. Reopens May 21 for summer operations. Free SMART bus service continues between towns during the closure.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-007', sourceKey: 'smc-dems',
    postedAt: '2026-04-03T08:00:00',
    title: 'County Democratic Assembly April 12 — register by Saturday!',
    excerpt: 'San Miguel County Democratic Assembly is April 12. Register by tomorrow, April 5, to participate as a delegate. Info at smcdemocrats.org. This is how local candidates advance to the primary ballot.',
    tags: ['Politics', 'Assembly', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-014', sourceKey: 'fb-2061',
    postedAt: '2026-04-01T07:30:00',
    title: 'CDOT: CO 145 road widening near Society Turn through September',
    excerpt: 'CDOT road work on CO 145 at Mile Point 71, just west of Society Turn Roundabout, runs through early September. Williams Construction adding a new right-turn lane with acceleration/deceleration lanes. Mon–Fri, 9 AM–4 PM. Expect lane shifts, flaggers, and up to 5-minute delays.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: false, eventRelated: false
  },
  {
    id: 'tchn-012', sourceKey: 'tchn',
    postedAt: '2026-04-03T09:00:00',
    title: 'Free Mental Health First Aid training — next Tuesday, April 8',
    excerpt: 'Free 8-hour Mental Health First Aid certification course at the Telluride Conference Center on Tuesday, April 8. Learn to recognize signs and respond to mental health crises. Register at tchnetwork.org.',
    tags: ['Mental Health', 'Training', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'humane-012', sourceKey: 'humane',
    postedAt: '2026-04-02T11:00:00',
    title: 'Meet Juniper — heeler mix available for adoption',
    excerpt: 'Juniper is a 2-year-old heeler mix who loves hikes, belly rubs, and snowy adventures. Great with kids, good with other dogs. Foster-to-adopt available. Apply at telluridehumanesociety.com.',
    tags: ['Adoption', 'Dogs', 'Pets'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-016', sourceKey: 'fb-3395',
    postedAt: '2026-04-02T16:00:00',
    title: 'Bears are stirring — secure trash and remove bird feeders',
    excerpt: 'Town of Telluride spring bear awareness campaign is underway. Bear-proof trash containers are required for all residential properties. Lock cars, secure windows, and take down bird feeders. Most bear conflicts are linked to careless handling of food and garbage.',
    tags: ['Wildlife', 'Town Notice', 'Bears'], featured: false, eventRelated: false
  },
  {
    id: 'c7cc-015', sourceKey: 'c7cc',
    postedAt: '2026-04-03T11:00:00',
    title: 'KOTO "Off the Record" — wildfire preparedness with emergency manager',
    excerpt: 'KOTO aired a wildfire preparedness segment on "Off the Record" with San Miguel County Emergency Manager Shannon Armstrong and Tim Pinnow, executive director at the West Region Wildfire Council. Discussion covered defensible space, evacuation routes, and the elevated risk this season after record-low snowpack.',
    tags: ['Wildfire', 'KOTO', 'Preparedness'], featured: false, eventRelated: false
  },
  {
    id: 'carpool-008', sourceKey: 'koto-carpool',
    postedAt: '2026-04-01T07:15:00',
    title: 'Ride share: Norwood to Telluride, Mon–Fri',
    excerpt: 'Looking for a carpool buddy Norwood to Telluride, leaving around 7:15 AM daily. Can share gas. Return trip around 5 PM. Comment or DM if interested.',
    tags: ['Carpool', 'Norwood', 'Commute'], featured: false, eventRelated: false
  },
  {
    id: 'yoga-007', sourceKey: 'yoga-fest',
    postedAt: '2026-04-01T10:00:00',
    title: '18th annual Yoga Festival — early-bird passes end April 15',
    excerpt: 'Telluride Yoga Festival runs June 25–28 with 24+ presenters and over 120 offerings plus live music and excursions. Early-bird pricing ends April 15. All levels welcome — grab your pass before prices go up!',
    tags: ['Festival', 'Yoga', 'Early Bird'], featured: false, eventRelated: true
  },
  {
    id: 'rotary-ig-008', sourceKey: 'rotary-ig',
    postedAt: '2026-04-02T13:00:00',
    title: 'Rotary scholarships for seniors — deadline April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors are open. Awards up to $5,000 for top academic achievers, plus $2,500 awards and a $1,000 vocational scholarship. Deadline April 15. Apply at telluriderotary.org.',
    tags: ['Scholarships', 'Youth', 'Education'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-008', sourceKey: 'smc-dems',
    postedAt: '2026-04-01T10:00:00',
    title: 'SMC Land Use Code Amendment — Accelerated Housing Review',
    excerpt: 'San Miguel County Planning Commission and Board of County Commissioners held a joint work session March 26 on a proposed Land Use Code Amendment for Accelerated Housing Review. The amendment aims to streamline permitting for deed-restricted and workforce housing projects countywide.',
    tags: ['Housing', 'Land Use', 'County'], featured: false, eventRelated: false
  },
  {
    id: 'foundation-008', sourceKey: 'foundation',
    postedAt: '2026-04-02T17:30:00',
    title: 'Tales from the Season — storytelling night recap',
    excerpt: 'Telluride Arts and Citizens State Bank hosted "Tales from the Season" on April 2 at 135 W Pacific Ave. Community members shared stories from the 2025-26 winter season over mocktails and light bites. A great send-off to an unforgettable — and unusually dry — ski season.',
    tags: ['Arts', 'Community', 'Events'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2438-007', sourceKey: 'fb-2438',
    postedAt: '2026-04-02T09:00:00',
    title: 'Spring cleaning — free items on curbs around town',
    excerpt: 'Lots of folks spring cleaning before mud season. Furniture, ski gear, and household items showing up on curbs around town. Post your finds and freebies in the group!',
    tags: ['Free', 'Community', 'Spring Cleaning'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-015', sourceKey: 'fb-2061',
    postedAt: '2026-04-03T12:00:00',
    title: 'Uncompahgre Plateau forest treatment — public comment open',
    excerpt: 'USFS proposed forest treatment project covers 267,000+ acres on the Uncompahgre Plateau across Montrose, Ouray, and San Miguel counties. 30-day public comment period underway. Details at fs.usda.gov. Important for wildfire mitigation in the region.',
    tags: ['Forest', 'Public Comment', 'Wildfire'], featured: false, eventRelated: false
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
