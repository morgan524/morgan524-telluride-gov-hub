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
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-17T18:00:00';
const COMMUNITY_PULSE_POSTS = [
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
  },
  {
    id: 'c7cc-023b', sourceKey: 'c7cc',
    postedAt: '2026-04-15T10:00:00',
    title: 'SMRHA housing lottery drawing April 24 — three deed-restricted units to be awarded',
    excerpt: 'The lottery drawing for three deed-restricted homeownership units through SMRHA takes place Thursday, April 24 at 10 AM at Rebekah Hall. Units available: Silver Jack 202 and Silver Jack 205 at 155 W Pacific Ave, and Element 52 SW-102 at 398 S Davis St. Applications closed April 10. Visit smrha.org or email admin@smrha.org for details.',
    tags: ['Housing', 'Affordable', 'Lottery', 'Upcoming Event'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-051', sourceKey: 'fb-2061',
    postedAt: '2026-04-15T11:00:00',
    title: 'Business Stabilization Grant notifications expected April 22 — review wrapping up',
    excerpt: 'Review of Town of Telluride Business Stabilization Assistance Grant applications wraps up this week, with applicant notifications expected by April 22. The program has distributed approximately $290,876 to 46 locally owned businesses impacted by the ski resort closure, part of the $400,000 economic relief package. Contact the Town Clerk\'s office with questions.',
    tags: ['Business', 'Town Government', 'Relief'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-052', sourceKey: 'fb-2061',
    postedAt: '2026-04-16T08:00:00',
    title: 'Employee Housing Impact Mitigation Fee increase takes effect May 1',
    excerpt: 'San Miguel County\'s Employee Housing Impact Mitigation Fee will increase effective May 1, 2026. The updated fee structure applies to new development and is part of the county\'s ongoing effort to address the housing crisis for local workers. Developers and property owners should review the new schedule at sanmiguelcountyco.gov. The fee supports deed-restricted housing production across the region.',
    tags: ['Housing', 'Development', 'County', 'Policy'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-041', sourceKey: 'fb-3395',
    postedAt: '2026-04-16T08:30:00',
    title: 'Spring Clean Up set for May 15–16 — electronics, paint, hazardous waste accepted',
    excerpt: 'San Miguel County\'s annual Spring Clean Up is scheduled for May 15–16, hosted by EcoAction Partners. Drop-off locations: Telluride (Carhenge Parking Lot, both days), Mountain Village (Market Plaza, May 15), and Norwood (County Fairgrounds, May 16). Accepted items include electronics, paint, batteries, and other hazardous waste. Visit ecoactionpartners.org for full details on accepted items.',
    tags: ['Community', 'Environment', 'County', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-053', sourceKey: 'fb-2061',
    postedAt: '2026-04-16T09:00:00',
    title: 'Society Turn / CO-145 construction — check CDOT updates before traveling',
    excerpt: 'The Colorado Department of Transportation continues infrastructure work on CO-145 west of the Society Turn roundabout. Expect intermittent lane closures and delays. CDOT has created a dedicated webpage tracking highway interruptions — visit bit.ly/CO145updates for real-time status. Motorists should allow extra travel time between Telluride and the valley floor.',
    tags: ['Transportation', 'Construction', 'CDOT', 'Road Closure'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-042', sourceKey: 'fb-3395',
    postedAt: '2026-04-16T09:30:00',
    title: 'County wildfire building code requirements now in effect — WUI areas affected',
    excerpt: 'San Miguel County\'s updated wildfire-resilient building code requirements are now in effect for properties in designated wildland-urban interface (WUI) areas. The county is also launching an interactive mapping tool so residents can check their wildfire risk. The Community Wildfire Protection Plan is expected to be completed in 2026. With snowpack at 15% of median and fire season approaching, compliance with new standards is critical.',
    tags: ['Wildfire', 'Building Code', 'County', 'Safety'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-054', sourceKey: 'fb-2061',
    postedAt: '2026-04-16T10:00:00',
    title: 'County Commissioner meetings resume April 22 after spring break',
    excerpt: 'The San Miguel County Board of County Commissioners resumes regular meetings on Wednesday, April 22, 2026 at 9:30 AM following the April 6–17 spring break recess. The next meeting on April 29 is also scheduled. Agendas will be posted at sanmiguelcountyco.gov. Multiple advisory boards also resume this month, including the Open Space Commission on April 27.',
    tags: ['Government', 'County', 'Meeting'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-055', sourceKey: 'fb-2061',
    postedAt: '2026-04-16T10:30:00',
    title: 'Special election petition deadline Monday — four days left for Council candidates',
    excerpt: 'Four days remain for prospective candidates to file petitions for the June 30 Town of Telluride special election. The filing window closes Monday, April 20 at 5 PM. Two Council seats are on the ballot: one vacated by former Mayor Pro Tem Meehan Fee and one held by appointed Councilmember Marya Stark. Candidates need 25 signatures from registered Telluride voters. Petitions available at the Town Clerk\'s office in Rebekah Hall.',
    tags: ['Elections', 'Deadline', 'Town Government', 'Council'], featured: true, eventRelated: true
  },
  {
    id: 'mountainfilm-004', sourceKey: 'mountainfilm',
    postedAt: '2026-04-16T11:00:00',
    title: 'Mountainfilm partners with Firelight Media — HOMEGROWN Series comes to 2026 festival',
    excerpt: 'Mountainfilm announced a collaborative partnership with Firelight Media\'s HOMEGROWN Series, bringing curated documentary programming to the 48th annual festival, May 21–25. Firelight Media supports emerging filmmakers of color. The partnership expands Mountainfilm\'s commitment to diverse storytelling alongside guest director Cristina Mittermeier\'s conservation-focused program. Festival passes available at mountainfilm.org.',
    tags: ['Festival', 'Film', 'Partnership', 'Arts'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2438-015', sourceKey: 'fb-2438',
    postedAt: '2026-04-16T12:00:00',
    title: 'Paradigm Gathering approved with total fire ban — West End wellness festival returns in June',
    excerpt: 'San Miguel County approved a temporary-use permit for the sixth annual Paradigm Gathering, a four-day wellness festival for 250 participants near Egnar in the West End. Due to extreme drought conditions and snowpack at 15% of median, the county imposed a total fire ban at this year\'s event, eliminating fire dancing which had been a hallmark of past gatherings. The festival focuses on intentional music, cleansing, and healing workshops.',
    tags: ['Festival', 'County', 'Fire Ban', 'West End'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-056', sourceKey: 'fb-2061',
    postedAt: '2026-04-16T12:30:00',
    title: 'Colorado restructures search and rescue oversight — CPW takes statewide coordination role',
    excerpt: 'Colorado Parks and Wildlife announced a new interagency agreement effective August 1 that shifts statewide search and rescue coordination from the Colorado Search and Rescue Association to CPW and the state\'s homeland security division. Sheriff\'s offices retain operational authority, but CPW will develop training standards, credentialing, and response coordination. San Miguel County SAR, covering over 1,200 square miles from 5,000 to 14,000 feet elevation, will be affected. Some veteran volunteers have raised concerns about the restructuring.',
    tags: ['Safety', 'Search and Rescue', 'State Policy', 'County'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-057', sourceKey: 'fb-2061',
    postedAt: '2026-04-17T08:00:00',
    title: 'CDOT shoulder work on Keystone Hill — expect 20-minute delays between Telluride and Placerville',
    excerpt: 'The Colorado Department of Transportation is performing culvert cleaning and shoulder clearing operations on CO-145 along Keystone Hill between Mile Points 73 and 74 (Telluride to Placerville). Motorists should expect full stops, alternating one-lane traffic, and delays of up to 20 minutes from 9 a.m. to 3 p.m. on active work days. The routine maintenance is necessary to remove debris and mitigate erosion or flooding on the roadway. This is separate from the ongoing access improvement project west of the Society Turn roundabout.',
    tags: ['Transportation', 'CDOT', 'Road Work', 'Delays'], featured: false, eventRelated: false
  },
  {
    id: 'mountainfilm-005', sourceKey: 'mountainfilm',
    postedAt: '2026-04-17T09:00:00',
    title: 'Mountainfilm releases full 2026 schedule — passholder reservations open May 6',
    excerpt: 'Mountainfilm has released the full schedule for its 48th annual festival, May 21\u201325 in Telluride. Festival passes are on sale now at mountainfilm.org. Passholder film reservations open on a tiered schedule: Ama Dablam and Festival Guest passes on May 6, Palmyra/Student/Crew on May 8, and Wasatch/Volunteer/Senior on May 12. The free Mountainfilm app (iOS and Android) serves as the official festival guide with schedule, film descriptions, and event details. Guest director Cristina Mittermeier curates this year\u2019s conservation-focused program.',
    tags: ['Festival', 'Film', 'Tickets', 'Upcoming Event'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-058', sourceKey: 'fb-2061',
    postedAt: '2026-04-17T10:00:00',
    title: 'Sheriff launches behavioral health safe transport pilot — Norwood-based program fills West End gap',
    excerpt: 'San Miguel County Sheriff Dan Covault and Dave Hayes of Guardian Transport and Security in Grand Junction have launched the San Miguel Safe Transport Program, a behavioral health secure transport pilot based in Norwood. The program addresses a critical gap in services for the county\'s West End communities, providing safe transportation for individuals experiencing behavioral health crises. The pilot is expected to serve residents who previously faced long wait times or lacked access to appropriate transport to treatment facilities.',
    tags: ['Health', 'Safety', 'County', 'West End'], featured: false, eventRelated: false
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
