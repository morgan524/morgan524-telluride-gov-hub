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
const COMMUNITY_PULSE_CACHE_DATE = '2026-03-31';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'telski-003', sourceKey: 'telski',
    postedAt: '2026-03-31T07:00:00',
    title: 'Today may be the last day of ski season',
    excerpt: 'Telluride Ski Resort says today (3/31) could be the final day of the 2025\u201326 season. 9 of 17 lifts open, 31 trails. Possible reopening for a closing weekend April 5 depends on upcoming snowfall.',
    tags: ['Ski Season', 'Closing Day', 'Conditions'], featured: true, eventRelated: false
  },
  {
    id: 'c7cc-003', sourceKey: 'c7cc',
    postedAt: '2026-03-31T09:00:00',
    title: 'Town Council meets today \u2014 March 31 agenda',
    excerpt: 'Town Council meeting today at Rebekah Hall. Agenda packets available on the Town website. Public comment period at the start. Stream live on the Town\u2019s YouTube channel if you can\u2019t attend.',
    tags: ['Town Council', 'Government', 'Meeting'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-002', sourceKey: 'fb-2061',
    postedAt: '2026-03-31T08:30:00',
    title: 'CDOT: CO 145 shoulder work continues west of Telluride',
    excerpt: 'CDOT crews are still doing sweeping and shoulder cleaning on Hwy 145 west of town. Expect full stops, alternating traffic, and up to 15-minute delays. Plan extra travel time.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: true, eventRelated: false
  },
  {
    id: 'fb-3395-003', sourceKey: 'fb-3395',
    postedAt: '2026-03-31T10:00:00',
    title: 'KOTO Spring Street Dance this Friday!',
    excerpt: 'Mark your calendar: KOTO Spring Street Dance is Friday April 3, 4\u20138 PM on Colorado Ave between Aspen and Fir. Free admission, cash bar, and a Pink Flamingo Costume Contest. End-of-ski-season celebration!',
    tags: ['Events', 'KOTO', 'Street Dance'], featured: true, eventRelated: true
  },
  {
    id: 'c7cc-004', sourceKey: 'c7cc',
    postedAt: '2026-03-30T11:00:00',
    title: 'Carhenge PUD update \u2014 public hearing date pending',
    excerpt: 'Following last week\u2019s P&Z work session, the Carhenge PUD application is moving toward a formal public hearing. Commission raised concerns about density, parking offsets, and affordability tiers. Stay tuned for the hearing date.',
    tags: ['Development', 'PUD', 'Carhenge'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-002', sourceKey: 'smc-dems',
    postedAt: '2026-03-30T14:00:00',
    title: 'DA Dougherty meet-and-greet recap',
    excerpt: 'Boulder DA Michael Dougherty held a public meet-and-greet in Telluride yesterday afternoon. Thanks to everyone who came out to discuss public safety and justice reform. County Assembly is April 12\u2014register by April 5.',
    tags: ['Politics', 'Meet and Greet', 'Assembly'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2438-002', sourceKey: 'fb-2438',
    postedAt: '2026-03-30T09:00:00',
    title: 'Spring cleaning? Free items on the curb this week',
    excerpt: 'Lots of folks spring cleaning before mud season. Furniture, ski gear, and household items popping up on curbs around town. Post your finds and freebies here!',
    tags: ['Free', 'Community', 'Spring Cleaning'], featured: false, eventRelated: false
  },
  {
    id: 'carpool-003', sourceKey: 'koto-carpool',
    postedAt: '2026-03-31T07:15:00',
    title: 'Ride share: Norwood to Telluride, Mon\u2013Fri',
    excerpt: 'Looking for a carpool buddy Norwood\u2192Telluride, leaving around 7:15 AM daily. Can share gas. Return trip around 5 PM. Comment or DM if interested.',
    tags: ['Carpool', 'Norwood', 'Commute'], featured: false, eventRelated: false
  },
  {
    id: 'yoga-002', sourceKey: 'yoga-fest',
    postedAt: '2026-03-30T10:00:00',
    title: 'Early-bird passes on sale \u2014 June 25\u201328',
    excerpt: 'Telluride Yoga Festival early-bird pricing ends April 15. Over 120 classes, workshops, and live music in the mountains. All levels welcome. Grab your pass before prices go up!',
    tags: ['Festival', 'Yoga', 'Early Bird'], featured: false, eventRelated: true
  },
  {
    id: 'humane-003', sourceKey: 'humane',
    postedAt: '2026-03-31T11:00:00',
    title: 'Meet Juniper \u2014 still available for adoption!',
    excerpt: 'Juniper is a 2-year-old heeler mix who loves hikes, belly rubs, and snowy adventures. Great with kids, good with other dogs. Foster-to-adopt available. Apply on our website!',
    tags: ['Adoption', 'Dogs', 'Pets'], featured: true, eventRelated: false
  },
  {
    id: 'humane-004', sourceKey: 'humane',
    postedAt: '2026-03-28T09:00:00',
    title: 'Foster homes needed for kitten season',
    excerpt: 'Kitten season is here and we need foster families! We provide food, supplies, and vet care. You provide love and a warm spot. Apply on our website.',
    tags: ['Foster', 'Cats', 'Volunteer'], featured: false, eventRelated: false
  },
  {
    id: 'telski-004', sourceKey: 'telski',
    postedAt: '2026-03-29T07:00:00',
    title: 'Gondola closing April 5 for off-season',
    excerpt: 'The free gondola between Telluride and Mountain Village closes for the season at midnight April 5. Summer scenic rides resume in June. Plan your last rides this week!',
    tags: ['Gondola', 'Transportation', 'Season'], featured: false, eventRelated: false
  },
  {
    id: 'foundation-002', sourceKey: 'foundation',
    postedAt: '2026-03-31T09:00:00',
    title: 'Spring grant cycle opens TODAY',
    excerpt: 'Telluride Foundation\u2019s spring grant cycle is now open! Grants support environment, arts, education, athletics, health, and human services across the three-county region. Deadline: May 15.',
    tags: ['Grants', 'Nonprofits', 'Funding'], featured: false, eventRelated: false
  },
  {
    id: 'rotary-ig-002', sourceKey: 'rotary-ig',
    postedAt: '2026-03-29T13:00:00',
    title: 'Scholarship applications due April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors \u2014 applications are open. Awards up to $2,500. See our website for details and application form.',
    tags: ['Scholarships', 'Youth', 'Education'], featured: false, eventRelated: false
  },
  {
    id: 'tchn-003', sourceKey: 'tchn',
    postedAt: '2026-03-30T08:30:00',
    title: 'Mental health first aid training \u2014 April 8',
    excerpt: 'Free 8-hour Mental Health First Aid certification course at the Telluride Conference Center. Learn to recognize signs and respond to mental health crises. Register on our website.',
    tags: ['Mental Health', 'Training', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'blues-002', sourceKey: 'blues-brews',
    postedAt: '2026-03-28T12:00:00',
    title: 'First wave of artists announced \u2014 Sept 18\u201320',
    excerpt: 'Telluride Blues & Brews Festival has announced the first wave of performers for 2026. Full lineup and single-day passes coming soon. Mark your calendars!',
    tags: ['Festival', 'Music', 'Blues'], featured: false, eventRelated: true
  },
  {
    id: 'skijoring-002', sourceKey: 'skijoring',
    postedAt: '2026-03-27T15:00:00',
    title: 'Skijoring 2026 recap \u2014 what a weekend!',
    excerpt: 'Incredible inaugural Telluride Skijoring on Colorado Ave March 13\u201315! Huge crowds, amazing athletes, and perfect conditions. Planning already underway for 2027. Volunteer or sponsor\u2014DM us.',
    tags: ['Skijoring', 'Events', 'Recap'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-004', sourceKey: 'fb-3395',
    postedAt: '2026-03-29T16:45:00',
    title: 'Bear-proof trash cans now required',
    excerpt: 'Reminder from the Town: bear-proof trash containers are now required for all residential properties. The bears are waking up! Secure your trash and bird feeders.',
    tags: ['Wildlife', 'Town Notice', 'Bears'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-003', sourceKey: 'fb-2061',
    postedAt: '2026-03-28T11:00:00',
    title: 'Tips-Up FriYAY: LP Giobbi at Heritage Plaza April 3',
    excerpt: 'The Tips-Up FriYAY concert series wraps up this Friday with LP Giobbi performing 3:30\u20135:30 PM at Heritage Plaza in Mountain Village. Free and open to all \u2014 great way to close out ski season!',
    tags: ['Music', 'Mountain Village', 'Free'], featured: false, eventRelated: true
  },
  {
    id: 'tchn-004', sourceKey: 'tchn',
    postedAt: '2026-03-27T14:00:00',
    title: 'Spring wellness workshops coming in April',
    excerpt: 'Tri-County Health Network is launching a spring wellness series in April covering nutrition, stress management, and outdoor fitness. Free for all community members. Schedule posted soon.',
    tags: ['Health', 'Wellness', 'Free'], featured: false, eventRelated: true
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
