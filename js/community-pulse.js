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
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-07';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'telski-024', sourceKey: 'telski',
    postedAt: '2026-04-05T08:00:00',
    title: 'Ski season wrapped — Telluride closed for the summer after April 5 closing day',
    excerpt: 'The 2025-26 ski season at Telluride Ski Resort ended Sunday, April 5. The resort reopened Friday after a mid-week closure to preserve snow for closing weekend. Spring conditions with intermediate and advanced terrain only. Next up: summer operations begin in late June.',
    tags: ['Ski Season', 'Closing Day', 'Recap'], featured: true, eventRelated: false
  },
  {
    id: 'telski-025b', sourceKey: 'telski',
    postedAt: '2026-04-06T07:00:00',
    title: 'Gondola closed today — spring maintenance through May 21',
    excerpt: 'The free gondola between Telluride and Mountain Village is now closed as of Monday, April 6 for spring maintenance. It will reopen May 21 for summer operations. Free SMART bus service continues between the towns throughout the closure period. The Town of Mountain Village will also operate a bus between the Meadows and Village Center until the chondola opens.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-024', sourceKey: 'fb-2061',
    postedAt: '2026-04-05T09:00:00',
    title: 'Wildfire risk elevated — Colorado bracing for unusually early fire season',
    excerpt: 'Seasonal fire outlook from NIFC shows above-average wildfire risk across the Four Corners by June. Colorado snowpack at just 61% of median. First four months of the water year are the warmest in 131 years. Experts warn conditions are worse than 2012 and 2020. Maintain defensible space around your property now.',
    tags: ['Wildfire', 'Drought', 'Safety'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-024', sourceKey: 'fb-3395',
    postedAt: '2026-04-05T10:00:00',
    title: 'Water restrictions in effect — outdoor watering Mon/Wed/Fri only',
    excerpt: 'Town of Telluride outdoor water restrictions remain in effect since March 31. Below-average snowpack and anticipated dry spring drove the proactive restrictions. Watering allowed Mon/Wed/Fri only, before 8 AM or after 7 PM. Irrigation at 70–75% of normal. Runoff forecast 60–70% of normal.',
    tags: ['Drought', 'Water', 'Conservation'], featured: true, eventRelated: false
  },
  {
    id: 'c7cc-020', sourceKey: 'c7cc',
    postedAt: '2026-04-05T09:30:00',
    title: 'SMRHA housing lottery apps close April 10 — drawing April 24',
    excerpt: 'Last chance to apply for deed-restricted homeownership units through SMRHA. Three units available: Silver Jack 202 and Silver Jack 205 at 155 W Pacific Ave, and Element 52 SW-102 at 398 S Davis St. Applications accepted by appointment through noon on Friday, April 10. Lottery drawing April 24 at 10 AM, Rebekah Hall. Visit smrha.org or email admin@smrha.org.',
    tags: ['Housing', 'Affordable', 'Lottery'], featured: true, eventRelated: true
  },
  {
    id: 'smc-dems-013b', sourceKey: 'smc-dems',
    postedAt: '2026-04-06T08:00:00',
    title: 'San Miguel County Democratic Assembly — Saturday, April 12',
    excerpt: 'The San Miguel County Democratic Assembly takes place Saturday, April 12. Registered delegates will vote to advance local candidates to the primary ballot. Delegate registration closed April 5. Details at smcdemocrats.org.',
    tags: ['Politics', 'Assembly', 'Upcoming'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-025', sourceKey: 'fb-2061',
    postedAt: '2026-04-05T09:30:00',
    title: 'Town election petitions due April 20 — run for Town Council',
    excerpt: 'Nomination petitions for the June 30 Town of Telluride special election are available now. Completed petitions must be submitted to the Town Clerk by Monday, April 20, 2026. Town Council seats to be filled — if you\'re considering a run for local office, now is the time.',
    tags: ['Elections', 'Government', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-025', sourceKey: 'fb-3395',
    postedAt: '2026-04-05T07:30:00',
    title: 'Town community survey open through May 21 — share your feedback',
    excerpt: 'The Town of Telluride\'s third annual community survey is open. Share feedback on government services, quality of life, and priorities. Open to all residents through May 21, 2026. Your input helps shape town budget and policy decisions.',
    tags: ['Town Government', 'Survey', 'Civic'], featured: false, eventRelated: false
  },
  {
    id: 'tchn-015', sourceKey: 'tchn',
    postedAt: '2026-04-05T09:00:00',
    title: 'Free Mental Health First Aid training — this Tuesday, April 8',
    excerpt: 'Free 8-hour Mental Health First Aid certification course at the Telluride Conference Center on Tuesday, April 8. Learn to recognize signs and respond to mental health crises. Open to community members. Register at tchnetwork.org.',
    tags: ['Mental Health', 'Training', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'c7cc-021', sourceKey: 'c7cc',
    postedAt: '2026-04-05T11:00:00',
    title: '$290K in business grants distributed to 46 local businesses',
    excerpt: 'Town of Telluride distributed approximately $290,876 to 46 locally owned businesses impacted by the ski resort closure earlier this season. Part of the broader $400,000 economic relief package approved in February alongside tourism, air service, and resident hardship funding.',
    tags: ['Business', 'Town Government', 'Relief'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-028', sourceKey: 'fb-3395',
    postedAt: '2026-04-06T08:00:00',
    title: 'Community Wildfire Protection Plan — public comment period open',
    excerpt: 'San Miguel County is seeking public input on a new Community Wildfire Protection Plan. Panel discussions are being held to kick off the public comment period. With 2026 fire season outlook showing above-average wildfire risk across the Four Corners, community input on preparedness and mitigation is critical. Visit sanmiguelcountyco.gov for details.',
    tags: ['Wildfire', 'County', 'Public Comment'], featured: false, eventRelated: false
  },
  {
    id: 'foundation-011', sourceKey: 'foundation',
    postedAt: '2026-04-05T10:00:00',
    title: 'Town Park Campground reservations open April 21 — season starts May 15',
    excerpt: 'Town Park Campground 2026 season runs May 15 through October 4. First of four reservation windows opens Tuesday, April 21 at 9 AM MST for arrivals May 15–June 12. All camping is by online reservation only with limited availability. Details at telluride-co.gov.',
    tags: ['Camping', 'Town Park', 'Reservations'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-026', sourceKey: 'fb-2061',
    postedAt: '2026-04-04T07:30:00',
    title: 'CDOT: CO 145 road widening near Society Turn through September',
    excerpt: 'CDOT road work on CO 145 at Mile Point 71, just west of Society Turn Roundabout, runs through early September. Williams Construction adding a new right-turn lane with acceleration/deceleration lanes. Mon–Fri, 9 AM–4 PM. Expect lane shifts, flaggers, and up to 5-minute delays.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-014', sourceKey: 'smc-dems',
    postedAt: '2026-04-04T10:00:00',
    title: 'County housing projects update — Ilium groundbreaking targeted this spring',
    excerpt: 'San Miguel County targets April–May 2026 groundbreaking for five affordable units at the Ilium site (KEO Studio Works design). Deer Creek CDOT partnership aims for 30–35 workforce units. Pathfinder 73-unit project still contingent on water. County also advancing a Land Use Code Amendment for accelerated housing review.',
    tags: ['Housing', 'County', 'Development'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-032', sourceKey: 'fb-2061',
    postedAt: '2026-04-07T09:00:00',
    title: 'Mountain Village council vacancy — five candidates seeking appointment',
    excerpt: 'Five candidates are seeking appointment by Mountain Village Town Council to fill the vacancy left by former Mayor Marti Prohaska\'s resignation last month. Town Council is expected to make the appointment at an upcoming meeting. Follow townofmountainvillage.com for meeting agendas and updates.',
    tags: ['Government', 'Mountain Village', 'Council'], featured: false, eventRelated: false
  },
  {
    id: 'rotary-ig-011', sourceKey: 'rotary-ig',
    postedAt: '2026-04-04T13:00:00',
    title: 'Rotary scholarships for seniors — deadline April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors are open. Awards up to $5,000 for top academic achievers, plus $2,500 awards and a $1,000 vocational scholarship. Deadline April 15. Apply at telluriderotary.org.',
    tags: ['Scholarships', 'Youth', 'Education'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-030', sourceKey: 'fb-2061',
    postedAt: '2026-04-06T10:00:00',
    title: 'Airport Authority special meeting — April 21 at Hangar 30',
    excerpt: 'The Telluride Regional Airport Authority will hold a special meeting on Tuesday, April 21, 2026 at 1:00 PM at Hangar 30 Conference Room, Telluride Regional Airport. Agenda to be posted at tellurideairport.com. This follows a recent aircraft incident at the airport that was reported with no injuries.',
    tags: ['Airport', 'Government', 'Meeting'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-029b', sourceKey: 'fb-2061',
    postedAt: '2026-04-07T07:00:00',
    title: 'Greyhead wildfire update — no active flames after overnight precipitation',
    excerpt: 'Update on the Greyhead Mountain fire near Telluride Regional Airport: following moderate overnight precipitation, there are no active flames or visible smoke. Additional snowfall is expected, further supporting containment. Fire crews continue working interior hot spots to prevent re-ignition. The fire was reported Sunday approximately 2 miles northwest of the airport and was believed to be lightning-caused. Conditions remain exceptionally dry — maintain defensible space.',
    tags: ['Wildfire', 'Safety', 'Update'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-031', sourceKey: 'fb-2061',
    postedAt: '2026-04-07T08:00:00',
    title: 'Parks & Recreation Commission meeting April 15 canceled — rescheduled to April 29',
    excerpt: 'The Town of Telluride Parks & Recreation Commission meeting originally scheduled for April 15 has been canceled. It has been rescheduled to Tuesday, April 29. The Liquor Licensing Authority meeting remains on schedule for April 23, 2026.',
    tags: ['Town Government', 'Parks', 'Meeting'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-029', sourceKey: 'fb-3395',
    postedAt: '2026-04-06T11:00:00',
    title: 'Pacific Avenue closed April 6–18 for improvement project',
    excerpt: 'Pacific Avenue is closed from Monday, April 6 through Saturday, April 18 as the Town of Telluride Public Works Department begins the next phase of the Pacific Avenue Improvement Project. Expect full closures between Mahoney and surrounding blocks. Part of the broader Southwest Area Conceptual Plan for improved traffic flow, bike safety, and pedestrian access.',
    tags: ['Road Closure', 'Town Notice', 'Construction'], featured: false, eventRelated: false
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
