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
    id: 'telski-020', sourceKey: 'telski',
    postedAt: '2026-04-04T08:00:00',
    title: 'TOMORROW is Closing Day — last chance to ski Telluride this season',
    excerpt: 'Telluride Ski Resort wraps up the 2025–26 season TOMORROW, Sunday April 5. The resort reopened Friday after a mid-week closure to preserve snow. Get your final turns in — conditions are spring corn on south-facing slopes. Check tellurideskiresort.com for updated lift status and grooming report.',
    tags: ['Ski Season', 'Closing Day', 'Last Call'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-016', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T07:30:00',
    title: 'Willow Springs Fire — crews monitoring, dry conditions continue',
    excerpt: 'The lightning-caused Willow Springs Fire (ignited April 1, approx. 2 mi NW of Telluride Regional Airport near Greyhead) remains under monitoring. Dry conditions persist across the Western Slope with record-low snowpack. Stage 1 fire restrictions may come early this year. Follow Telluride Fire Protection District and San Miguel County Sheriff for updates.',
    tags: ['Wildfire', 'Safety', 'Alert'], featured: true, eventRelated: false
  },
  {
    id: 'c7cc-016', sourceKey: 'c7cc',
    postedAt: '2026-04-04T09:00:00',
    title: 'SMRHA housing lottery — one week left to apply, deadline April 10',
    excerpt: 'SMRHA accepting applications by appointment through noon Thursday, April 10 for deed-restricted homeownership units. Lottery drawing Friday, April 24 at 10 AM at Rebekah Hall. Visit smrha.org/lottery or email admin@smrha.org for details and appointment scheduling.',
    tags: ['Housing', 'Affordable', 'Lottery'], featured: true, eventRelated: true
  },
  {
    id: 'telski-021', sourceKey: 'telski',
    postedAt: '2026-04-04T10:00:00',
    title: 'Gondola closes Monday — free SMART bus during spring maintenance',
    excerpt: 'The free gondola between Telluride and Mountain Village closes Monday, April 6 for spring maintenance and will reopen May 21 for summer operations. Free SMART bus service continues between towns during the six-week closure. Plan your commute accordingly.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-018', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T08:30:00',
    title: 'KOTO Street Dance recap — Colorado Ave came alive for closing weekend',
    excerpt: 'The KOTO Spring Street Dance brought out the community Friday evening on Colorado Ave with The Other Brothers headlining, a cash bar, and the annual Pink Flamingo Costume Contest. Raffle drawing for a 5-night stay at Koro Sun Resort in Fiji went off during intermission. Thanks to everyone who celebrated the end of ski season!',
    tags: ['Events', 'KOTO', 'Street Dance'], featured: true, eventRelated: true
  },
  {
    id: 'fb-3395-019', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T11:00:00',
    title: 'Town outdoor water restrictions in effect — Mon/Wed/Fri watering only',
    excerpt: 'Town of Telluride outdoor water restrictions remain in effect following below-average snowpack. Watering allowed Mon/Wed/Fri only, before 8 AM or after 7 PM. Irrigation systems at 70–75% of normal. Exterior water features must stay off. Help protect our water supply — every drop counts this year.',
    tags: ['Drought', 'Water', 'Conservation'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-020', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T13:00:00',
    title: 'Special election petitions due April 20 — two Council seats at stake',
    excerpt: 'Town of Telluride special municipal election set for June 30 to fill two Council seats (including the vacancy from Councilmember Meehan Fee\'s Jan 27 resignation). Nomination petitions available from the Town Clerk at 135 W Columbia Ave. Return 25+ signatures by April 20. Terms run through Nov 2029.',
    tags: ['Election', 'Town Council', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'smc-dems-009', sourceKey: 'smc-dems',
    postedAt: '2026-04-04T08:00:00',
    title: 'Democratic Assembly April 12 — delegate registration closes tomorrow',
    excerpt: 'San Miguel County Democratic Assembly is Saturday, April 12. Tomorrow, April 5, is the last day to register as a delegate. This is how local candidates advance to the primary ballot. Info at smcdemocrats.org.',
    tags: ['Politics', 'Assembly', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-017', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T07:00:00',
    title: 'CDOT: CO 145 road work near Society Turn continues through September',
    excerpt: 'CDOT road work on CO 145 at Mile Point 71, just west of Society Turn Roundabout, continues through early September. Williams Construction adding a new right-turn lane with acceleration/deceleration lanes plus shoulder work and fresh striping. Mon–Fri, 9 AM–4 PM. Expect flaggers and up to 5-minute delays.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: false, eventRelated: false
  },
  {
    id: 'tchn-013', sourceKey: 'tchn',
    postedAt: '2026-04-04T09:00:00',
    title: 'Free Mental Health First Aid training — this Tuesday, April 8',
    excerpt: 'Free 8-hour Mental Health First Aid certification course at the Telluride Conference Center this Tuesday, April 8. Learn to recognize signs and respond to mental health crises in your community. Spots still available — register at tchnetwork.org.',
    tags: ['Mental Health', 'Training', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'c7cc-017', sourceKey: 'c7cc',
    postedAt: '2026-04-04T11:30:00',
    title: 'KOTO "Off the Record" — wildfire preparedness and evacuation planning',
    excerpt: 'KOTO aired a wildfire preparedness segment with San Miguel County Emergency Manager Shannon Armstrong and Tim Pinnow of the West Region Wildfire Council. Covered defensible space, evacuation routes, and the elevated risk this season after record-low snowpack. Listen at koto.org.',
    tags: ['Wildfire', 'KOTO', 'Preparedness'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-021', sourceKey: 'fb-3395',
    postedAt: '2026-04-04T15:00:00',
    title: 'Bears are stirring — spring bear awareness campaign underway',
    excerpt: 'Town of Telluride spring bear awareness campaign is in full swing. Bear-proof trash containers required for all residential properties. Never leave food, livestock feed, or pet food outside or in vehicles. Remove bird feeders now. Most bear conflicts stem from unsecured garbage — keep Telluride bear-safe.',
    tags: ['Wildlife', 'Town Notice', 'Bears'], featured: false, eventRelated: false
  },
  {
    id: 'humane-013', sourceKey: 'humane',
    postedAt: '2026-04-04T10:00:00',
    title: 'Adopt Juniper — active heeler mix looking for a hiking buddy',
    excerpt: 'Juniper is a 2-year-old heeler mix who loves hikes, belly rubs, and snowy adventures. Great with kids, good with other dogs. Foster-to-adopt available. All adoptions are in-person in Telluride. Apply at telluridehumanesociety.com or email info@telluridehumanesociety.org.',
    tags: ['Adoption', 'Dogs', 'Pets'], featured: false, eventRelated: false
  },
  {
    id: 'yoga-008', sourceKey: 'yoga-fest',
    postedAt: '2026-04-04T10:00:00',
    title: '18th annual Yoga Festival — early-bird pricing ends April 15',
    excerpt: 'Telluride Yoga Festival runs June 25–28 with 24+ presenters and over 120 offerings plus live music and excursions. Early-bird pricing ends April 15 — that is 11 days away. All levels welcome. Grab your pass before prices go up at tellurideyogafestival.com.',
    tags: ['Festival', 'Yoga', 'Early Bird'], featured: false, eventRelated: true
  },
  {
    id: 'rotary-ig-009', sourceKey: 'rotary-ig',
    postedAt: '2026-04-04T12:00:00',
    title: 'Rotary scholarships for graduating seniors — deadline April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors are open. Awards up to $5,000 for top academic achievers, plus $2,500 awards and a $1,000 vocational scholarship. 11 days left to apply. Details and application at telluriderotary.org.',
    tags: ['Scholarships', 'Youth', 'Education'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-010', sourceKey: 'smc-dems',
    postedAt: '2026-04-03T10:00:00',
    title: 'SMC Land Use Code Amendment — Accelerated Housing Review moves forward',
    excerpt: 'San Miguel County Planning Commission and Board of County Commissioners held a joint work session March 26 on a proposed Land Use Code Amendment for Accelerated Housing Review. The amendment aims to streamline permitting for deed-restricted and workforce housing projects countywide.',
    tags: ['Housing', 'Land Use', 'County'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-018', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T12:00:00',
    title: 'SUHFER forest treatment project — public comment period open',
    excerpt: 'USFS South Uncompahgre Hazardous Fuels and Ecological Resiliency (SUHFER) project covers 267,300 acres on the Uncompahgre Plateau across Montrose, Ouray, and San Miguel counties. Includes timber harvest, prescribed burns, and fuel reduction over 20 years. Submit comments at fs.usda.gov.',
    tags: ['Forest', 'Public Comment', 'Wildfire'], featured: false, eventRelated: false
  },
  {
    id: 'foundation-005', sourceKey: 'foundation',
    postedAt: '2026-04-04T09:30:00',
    title: 'Telluride Foundation — 2025 community grants awarded across 7 focus areas',
    excerpt: 'The Telluride Foundation awarded its annual community grants in December 2025 to nonprofits and governmental entities serving San Miguel, Ouray, and West Montrose counties. Grants support arts, early childhood, education, athletics, health, human services, and environment. Learn more at telluridefoundation.org.',
    tags: ['Grants', 'Nonprofits', 'Community'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2438-008', sourceKey: 'fb-2438',
    postedAt: '2026-04-04T09:00:00',
    title: 'Mud season spring cleaning — free items popping up around town',
    excerpt: 'Spring cleaning is in full swing as mud season arrives. Furniture, ski gear, and household items showing up on curbs around town. Post your finds and freebies in the Telluride Classifieds & Community group!',
    tags: ['Free', 'Community', 'Spring Cleaning'], featured: false, eventRelated: false
  },
  {
    id: 'carpool-009', sourceKey: 'koto-carpool',
    postedAt: '2026-04-03T07:15:00',
    title: 'Ride share: Norwood to Telluride, Mon–Fri, 7:15 AM',
    excerpt: 'Looking for a carpool buddy Norwood to Telluride, leaving around 7:15 AM daily. Can share gas. Return trip around 5 PM. With the gondola closing Monday, carpooling is even more important. Comment or DM if interested.',
    tags: ['Carpool', 'Norwood', 'Commute'], featured: false, eventRelated: false
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
