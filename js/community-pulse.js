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
  'tchn': { name: 'Tri-County Health Network', type: 'health', platform: 'instagram', url: 'https://www.instagram.com/tchn_co/', logo: '' },
  'mountainfilm': { name: 'Mountainfilm Festival', type: 'arts', platform: 'website', url: 'https://www.mountainfilm.org/', logo: '' }
};
// Posts are dated relative to COMMUNITY_PULSE_CACHE_DATE.
// Each post expires 5 days after its postedAt date.
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-15';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'c7cc-023', sourceKey: 'c7cc',
    postedAt: '2026-04-11T08:00:00',
    title: 'SMRHA housing lottery drawing April 24 — three deed-restricted units to be awarded',
    excerpt: 'Applications for three deed-restricted homeownership units through SMRHA closed April 10. The lottery drawing takes place Thursday, April 24 at 10 AM at Rebekah Hall. Units available: Silver Jack 202 and Silver Jack 205 at 155 W Pacific Ave, and Element 52 SW-102 at 398 S Davis St. Visit smrha.org or email admin@smrha.org for details.',
    tags: ['Housing', 'Affordable', 'Lottery', 'Upcoming Event'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-045', sourceKey: 'fb-2061',
    postedAt: '2026-04-11T07:30:00',
    title: 'Business Stabilization Grant review underway — notifications expected April 22',
    excerpt: 'The Town of Telluride Business Stabilization Assistance Grant application period closed April 10. Review of submissions runs April 13–17, with applicant notifications expected by April 22. The program has already distributed approximately $290,876 to 46 locally owned businesses impacted by the ski resort closure. Part of the $400,000 economic relief package. Contact the Town Clerk\'s office with questions.',
    tags: ['Business', 'Town Government', 'Relief'], featured: true, eventRelated: false
  },
  {
    id: 'telski-025c', sourceKey: 'telski',
    postedAt: '2026-04-11T07:00:00',
    title: 'Gondola remains closed — spring maintenance continues through May 21',
    excerpt: 'The free gondola between Telluride and Mountain Village remains closed for spring maintenance since April 6. It will reopen May 21 for summer operations. Free SMART bus service continues between the towns throughout the closure period. The Town of Mountain Village is also running a bus between the Meadows and Village Center until the chondola opens.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-028b', sourceKey: 'fb-3395',
    postedAt: '2026-04-11T08:30:00',
    title: 'Community Wildfire Protection Plan — public comment period open',
    excerpt: 'San Miguel County is seeking public input on a new Community Wildfire Protection Plan. Panel discussions are being held to kick off the public comment period. With 2026 fire season outlook showing above-average wildfire risk across the Four Corners, community input on preparedness and mitigation is critical. Visit sanmiguelcountyco.gov for details.',
    tags: ['Wildfire', 'County', 'Public Comment'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-030b', sourceKey: 'fb-2061',
    postedAt: '2026-04-11T10:00:00',
    title: 'Airport Authority special meeting — April 21 at Hangar 30',
    excerpt: 'The Telluride Regional Airport Authority will hold a special meeting on Tuesday, April 21, 2026 at 1:00 PM at Hangar 30 Conference Room, Telluride Regional Airport. Agenda to be posted at tellurideairport.com. This follows a recent aircraft incident at the airport that was reported with no injuries.',
    tags: ['Airport', 'Government', 'Meeting'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-029b', sourceKey: 'fb-3395',
    postedAt: '2026-04-11T11:00:00',
    title: 'Pacific Avenue closed through April 18 — improvement project nearing completion',
    excerpt: 'Pacific Avenue remains closed through Saturday, April 18 as the Town of Telluride Public Works Department continues the next phase of the Pacific Avenue Improvement Project. Expect full closures between Mahoney and surrounding blocks. Part of the broader Southwest Area Conceptual Plan for improved traffic flow, bike safety, and pedestrian access. Reopening expected this weekend.',
    tags: ['Road Closure', 'Town Notice', 'Construction'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-036', sourceKey: 'fb-3395',
    postedAt: '2026-04-11T09:00:00',
    title: 'Tips-Up FriYAY kicks off April 20 — new après music series in Mountain Village',
    excerpt: 'Mountain Village launches a brand-new après music series called Tips-Up FriYAY, kicking off April 20, 2026. The series brings live music and community vibes to the Village during the spring shoulder season. A welcome addition while the gondola remains closed for maintenance through May 21.',
    tags: ['Events', 'Music', 'Mountain Village', 'Spring'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-046', sourceKey: 'fb-2061',
    postedAt: '2026-04-11T09:30:00',
    title: 'Special election filing window closing — petitions due April 20 for two Council seats',
    excerpt: 'The candidate petition period for the June 30 Town of Telluride special election closes Monday, April 20. Two Council seats are being filled: one vacated by former Mayor Pro Tem Meehan Fee and one held by appointed Councilmember Marya Stark. Candidates need 25 signatures from registered Telluride voters. Petitions available at the Town Clerk\'s office in Rebekah Hall. Each voter may sign up to two petitions.',
    tags: ['Elections', 'Government', 'Deadline', 'Council'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-037', sourceKey: 'fb-3395',
    postedAt: '2026-04-12T09:00:00',
    title: 'Tourism Board briefs both town councils — summer outlook, lodging, festival impacts',
    excerpt: 'The Telluride Tourism Board made separate presentations to the Telluride and Mountain Village town councils covering lodging and occupancy trends, festival economic impacts, marketing efforts, and summer season projections. The briefings set the stage for shoulder-season decisions and continued coordination between the two municipalities heading into the 2026 summer festival calendar.',
    tags: ['Tourism', 'Town Government', 'Mountain Village', 'Economy'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-047', sourceKey: 'fb-2061',
    postedAt: '2026-04-12T10:00:00',
    title: 'Mountain Village Police warn of growing email fraud scam targeting residents',
    excerpt: 'Mountain Village Police Department issued an alert about a growing email fraud scam targeting local residents. Do not click links or provide personal information in unsolicited emails. Verify senders directly and report suspicious messages to MVPD. Scams of this type often impersonate government agencies, financial institutions, or known local businesses.',
    tags: ['Safety', 'Mountain Village', 'Scam Alert', 'Public Notice'], featured: true, eventRelated: false
  },
  {
    id: 'mountainfilm-002', sourceKey: 'mountainfilm',
    postedAt: '2026-04-13T09:00:00',
    title: 'Mountainfilm 2026 festival passes on sale now — May 21–25 in Telluride',
    excerpt: 'The 48th annual Mountainfilm documentary festival returns to Telluride May 21–25, 2026 with conservationist and marine biologist Cristina Mittermeier as guest director. Festival passes are on sale now at mountainfilm.org. The Minds Moving Mountains Speaker Series lineup was revealed April 8 and film submissions remain open. Mountainfilm is an Academy Award–qualifying festival for the Documentary Short Film category.',
    tags: ['Festival', 'Film', 'Arts', 'Tickets'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-048', sourceKey: 'fb-2061',
    postedAt: '2026-04-13T10:00:00',
    title: 'Petition filing deadline five days away — Town Council special election candidates',
    excerpt: 'Five days remain for prospective candidates to file petitions for the June 30 Town of Telluride special election. The filing window closes Monday, April 20. Two Council seats are on the ballot. Candidates need 25 signatures from registered Telluride voters and can pick up petition packets at the Town Clerk\'s office in Rebekah Hall. Voters may sign up to two petitions.',
    tags: ['Elections', 'Deadline', 'Town Government', 'Council'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-049', sourceKey: 'fb-2061',
    postedAt: '2026-04-14T08:00:00',
    title: 'Four Seasons worker housing dispute hits courts — down-valley towns push back',
    excerpt: 'A lawsuit filed in Ouray County District Court challenges the use of the 52-unit MTN Lodge in Ridgway to house construction workers building the $1 billion Four Seasons Resort in Mountain Village. The town of Ridgway argues the lodge sits on land zoned for temporary stays, not long-term worker housing. Down-valley communities say they are bearing the housing burden while resort towns reap the financial benefits. The lodge owner says closure is the alternative if the lease is blocked.',
    tags: ['Housing', 'Development', 'Four Seasons', 'Legal'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-038', sourceKey: 'fb-3395',
    postedAt: '2026-04-14T09:00:00',
    title: 'Lightning-caused wildfire near airport contained — dry conditions persist',
    excerpt: 'A lightning-caused wildfire approximately 2 miles northwest of Telluride Regional Airport near the Greyhead subdivision was contained after response from Telluride Fire, San Miguel County Sheriff, U.S. Forest Service, and BLM. The fire burned less than 3 acres with no threat to public safety. Snowpack remains at just 15% of median as of early April, underscoring ongoing drought conditions and elevated wildfire risk heading into summer.',
    tags: ['Wildfire', 'Safety', 'Drought', 'Airport'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-050', sourceKey: 'fb-2061',
    postedAt: '2026-04-14T10:00:00',
    title: 'People\'s March returns April 25 — community rally in downtown Telluride',
    excerpt: 'The next People\'s March in Telluride is scheduled for Friday, April 25, 2026, following the previous march held March 28. The community-organized event brings residents together on West Colorado Avenue for a public demonstration. Details and updates available through local organizers.',
    tags: ['Community', 'Events', 'Civic', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'mountainfilm-003', sourceKey: 'mountainfilm',
    postedAt: '2026-04-14T11:00:00',
    title: 'Mountainfilm reveals Minds Moving Mountains speaker lineup for 2026',
    excerpt: 'Mountainfilm announced the full speaker lineup for its Minds Moving Mountains series at the 48th annual festival, May 21–25 in Telluride. The speaker series brings thought leaders, activists, and storytellers to the festival alongside documentary film screenings. Guest director Cristina Mittermeier, a conservationist and marine biologist, curates this year\'s program. Full lineup and festival passes at mountainfilm.org.',
    tags: ['Festival', 'Film', 'Speakers', 'Arts'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-039', sourceKey: 'fb-3395',
    postedAt: '2026-04-15T08:00:00',
    title: 'Snowpack at 15% of median — drought emergency deepens across San Miguel County',
    excerpt: 'Snowpack in the San Miguel basin stands at just 15% of median as of early April, well below the threshold needed for normal summer water supply. Both Telluride and Mountain Village have outdoor water restrictions in place, and additional restrictions may follow. The severe drought heightens wildfire risk and threatens irrigation and municipal water supplies through the summer season. Residents urged to conserve water and prepare for potential further restrictions.',
    tags: ['Water', 'Drought', 'Conservation', 'County'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-040', sourceKey: 'fb-3395',
    postedAt: '2026-04-15T09:00:00',
    title: 'NightGrass pre-sale opens next week — Bluegrass Festival late-night shows June 17–21',
    excerpt: 'NightGrass shows for the 2026 Telluride Bluegrass Festival (June 17–21) go on pre-sale Wednesday, April 22 and general sale Thursday, April 23. Late-night performances across four venues including Greensky Bluegrass, Infamous Stringdusters, Punch Brothers, and more. Text NIGHTGRASS to 1-844-326-3296 for pre-sale access. Details at bluegrass.com.',
    tags: ['Festival', 'Music', 'Tickets', 'Upcoming Event'], featured: false, eventRelated: true
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
