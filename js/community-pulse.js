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
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-10';
const COMMUNITY_PULSE_POSTS = [
  {
    id: 'fb-2061-043', sourceKey: 'fb-2061',
    postedAt: '2026-04-10T10:00:00',
    title: 'Outdoor water restrictions now in effect — Telluride and Mountain Village both restrict irrigation',
    excerpt: 'The Town of Telluride implemented outdoor water restrictions effective March 31, 2026 in response to anticipated dry spring and summer conditions and below-average snowpack. Mountain Village has also implemented restrictions. Additional restrictions may follow if dry conditions persist, including potential limits on all outdoor water use. Property owners with newly installed landscaping in 2025 or 2026 may apply for additional watering allowances through the Town\'s Planning and Building Department.',
    tags: ['Water', 'Drought', 'Town Government', 'Conservation'], featured: true, eventRelated: false
  },
  {
    id: 'foundation-012', sourceKey: 'foundation',
    postedAt: '2026-04-10T10:30:00',
    title: 'Town allocates $100K to Good Neighbor Fund — rent relief applications accepted through May 1',
    excerpt: 'Town Council directed that the Affordable Housing Fund be used to cover approved rent relief applications through the Good Neighbor Fund for residents in Town-owned properties. Applications accepted through May 1, 2026. The Good Neighbor Fund, administered by the Telluride Foundation, provides emergency assistance for local families and individuals facing financial hardship, with no residency restrictions. Part of the Town\'s broader economic support response.',
    tags: ['Housing', 'Relief', 'Town Government', 'Affordable'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-044', sourceKey: 'fb-2061',
    postedAt: '2026-04-10T11:00:00',
    title: 'Town adjusts rent formula for employee housing — tenants save $100–$400 per month',
    excerpt: 'The Town of Telluride adjusted its rent formula for Town-managed employee housing with revised multipliers. Tenants now pay an average of 25% of their income toward rent after deductions for childcare, healthcare, and education. The change is projected to save households $100–$400 per month, with some tenants seeing reductions of up to $900 depending on unit type and income tier.',
    tags: ['Housing', 'Affordable', 'Town Government', 'Relief'], featured: false, eventRelated: false
  },
  {
    id: 'c7cc-022', sourceKey: 'c7cc',
    postedAt: '2026-04-10T07:00:00',
    title: 'SMRHA housing lottery apps close TODAY at noon — three deed-restricted units available',
    excerpt: 'Today is the final day to apply for deed-restricted homeownership units through SMRHA. Three units available: Silver Jack 202 and Silver Jack 205 at 155 W Pacific Ave, and Element 52 SW-102 at 398 S Davis St. Applications accepted by appointment through noon on Friday, April 10. Lottery drawing April 24 at 10 AM, Rebekah Hall. Visit smrha.org or email admin@smrha.org.',
    tags: ['Housing', 'Affordable', 'Lottery', 'Deadline'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-040', sourceKey: 'fb-2061',
    postedAt: '2026-04-10T07:30:00',
    title: 'Business Stabilization Grant materials due today — 11:59 PM MT deadline',
    excerpt: 'All outstanding materials for the Town of Telluride Business Stabilization Assistance Grant Program must be received by 11:59 PM MT tonight, April 10. The program has already distributed approximately $290,876 to 46 locally owned businesses impacted by the ski resort closure. Part of the $400,000 economic relief package. Contact the Town Clerk\'s office with questions.',
    tags: ['Business', 'Town Government', 'Deadline'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-041', sourceKey: 'fb-2061',
    postedAt: '2026-04-10T08:00:00',
    title: 'Town election petitions due April 20 — ten days left to file for Town Council',
    excerpt: 'Nomination petitions for the June 30 Town of Telluride special election must be submitted to the Town Clerk by Monday, April 20, 2026. Petitions are available now. Town Council seats to be filled — if you\'re considering a run for local office, the window is closing.',
    tags: ['Elections', 'Government', 'Deadline'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-032', sourceKey: 'fb-3395',
    postedAt: '2026-04-10T08:30:00',
    title: 'Bluegrass NightGrass tickets on sale April 22–23 — pre-sale signup open now',
    excerpt: 'NightGrass shows for the 2026 Telluride Bluegrass Festival (June 17–21) go on pre-sale Wednesday, April 22 and general sale Thursday, April 23. Late-night performances across four venues including Greensky Bluegrass, Infamous Stringdusters, Punch Brothers, and more. Text NIGHTGRASS to 1-844-326-3296 for pre-sale access. Details at bluegrass.com.',
    tags: ['Festival', 'Music', 'Tickets', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-033', sourceKey: 'fb-3395',
    postedAt: '2026-04-10T09:00:00',
    title: 'Housing Impact Fee final increase May 1 — fee rises to $1,112 per square foot',
    excerpt: 'The final phased increase of the Employee Housing Impact Mitigation Fee takes effect May 1, 2026, rising from $928 to $1,112 per square foot of employee housing required. San Miguel County is projected to need approximately 1,100 housing units by 2030, including 218 units in unincorporated areas. Nearly half of all workers commute more than 25 miles.',
    tags: ['Housing', 'County', 'Development', 'Policy'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-034', sourceKey: 'fb-3395',
    postedAt: '2026-04-10T09:30:00',
    title: 'Community survey still open — help shape Town of Telluride priorities through May 21',
    excerpt: 'The Town of Telluride\'s third annual community survey remains open through May 21, 2026. Share feedback on government services, quality of life, and town priorities. Open to all residents. Your input helps shape the town budget and policy decisions for the coming year.',
    tags: ['Town Government', 'Survey', 'Civic'], featured: false, eventRelated: false
  },
  {
    id: 'telski-025b', sourceKey: 'telski',
    postedAt: '2026-04-06T07:00:00',
    title: 'Gondola closed today — spring maintenance through May 21',
    excerpt: 'The free gondola between Telluride and Mountain Village is now closed as of Monday, April 6 for spring maintenance. It will reopen May 21 for summer operations. Free SMART bus service continues between the towns throughout the closure period. The Town of Mountain Village will also operate a bus between the Meadows and Village Center until the chondola opens.',
    tags: ['Gondola', 'Transportation', 'Season'], featured: true, eventRelated: false
  },
  {
    id: 'smc-dems-013b', sourceKey: 'smc-dems',
    postedAt: '2026-04-06T08:00:00',
    title: 'San Miguel County Democratic Assembly — Saturday, April 12',
    excerpt: 'The San Miguel County Democratic Assembly takes place Saturday, April 12. Registered delegates will vote to advance local candidates to the primary ballot. Delegate registration closed April 5. Details at smcdemocrats.org.',
    tags: ['Politics', 'Assembly', 'Upcoming'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-028', sourceKey: 'fb-3395',
    postedAt: '2026-04-06T08:00:00',
    title: 'Community Wildfire Protection Plan — public comment period open',
    excerpt: 'San Miguel County is seeking public input on a new Community Wildfire Protection Plan. Panel discussions are being held to kick off the public comment period. With 2026 fire season outlook showing above-average wildfire risk across the Four Corners, community input on preparedness and mitigation is critical. Visit sanmiguelcountyco.gov for details.',
    tags: ['Wildfire', 'County', 'Public Comment'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-026b', sourceKey: 'fb-2061',
    postedAt: '2026-04-09T07:00:00',
    title: 'CDOT: CO 145 road widening near Society Turn — work continues through September',
    excerpt: 'Ongoing CDOT road work on CO 145 at Mile Point 71, just west of Society Turn Roundabout, runs through early September. Williams Construction is adding a new right-turn lane with acceleration and deceleration lanes. Expect lane shifts, flaggers, and up to 5-minute delays Mon–Fri, 9 AM–4 PM. Plan extra time for your commute.',
    tags: ['Road Work', 'CDOT', 'Highway 145'], featured: false, eventRelated: false
  },
  {
    id: 'smc-dems-014b', sourceKey: 'smc-dems',
    postedAt: '2026-04-09T10:00:00',
    title: 'County housing projects update — Ilium groundbreaking targeted this spring',
    excerpt: 'San Miguel County targets April–May 2026 groundbreaking for five affordable units at the Ilium site (KEO Studio Works design). Deer Creek CDOT partnership aims for 30–35 workforce units. Pathfinder 73-unit project still contingent on water. County also advancing a Land Use Code Amendment for accelerated housing review.',
    tags: ['Housing', 'County', 'Development'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-032b', sourceKey: 'fb-2061',
    postedAt: '2026-04-07T09:00:00',
    title: 'Mountain Village council update — investigation into Prohaska resignation continues',
    excerpt: 'Mountain Village Town Council appointed Dan Jansen to fill the vacancy left by former Mayor Marti Prohaska\'s January resignation. The council has also approved an independent third-party investigation into the events and circumstances surrounding the resignation. Community discussion continues as the investigation proceeds. Follow townofmountainvillage.com for updates.',
    tags: ['Government', 'Mountain Village', 'Council'], featured: false, eventRelated: false
  },
  {
    id: 'rotary-ig-011b', sourceKey: 'rotary-ig',
    postedAt: '2026-04-09T10:00:00',
    title: 'Rotary scholarships for seniors — deadline April 15',
    excerpt: 'Telluride Rotary scholarships for graduating seniors are still open with the deadline approaching fast. Awards up to $5,000 for top academic achievers, plus $2,500 awards and a $1,000 vocational scholarship. Deadline is Tuesday, April 15. Apply at telluriderotary.org.',
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
  },
  {
    id: 'fb-2061-033', sourceKey: 'fb-2061',
    postedAt: '2026-04-08T07:00:00',
    title: 'Galloping Goose shifts to shoulder season — single-bus loop now in effect',
    excerpt: 'The Town of Telluride Galloping Goose bus has transitioned to its shoulder season schedule with single-bus operation. With the gondola closed for maintenance through May 21, SMART regional bus service continues between Telluride and Mountain Village. Mountain Village is also running a bus between the Meadows and Village Center until the chondola opens. Call 970-728-5700 for schedule details.',
    tags: ['Transportation', 'Bus', 'Shoulder Season'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-034', sourceKey: 'fb-2061',
    postedAt: '2026-04-08T08:00:00',
    title: 'Music on the Green returns — Mountain Village summer concerts May 29 through Sept 18',
    excerpt: 'The 2026 Music on the Green Summer Concert Series in Mountain Village runs every Friday from May 29 through September 18 (except July 3), 5–7 PM. Free live music in the Village Center. Mark your calendars for the summer season ahead.',
    tags: ['Events', 'Music', 'Mountain Village'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-035', sourceKey: 'fb-2061',
    postedAt: '2026-04-08T09:00:00',
    title: 'Four Seasons Mountain Village project tweaks — 52 hotel rooms, 43 residences',
    excerpt: 'The Four Seasons Hotel and Private Residences has updated its Mountain Village project design in response to customer demand. The revised plan includes 52 hotel rooms on the second and third floors overlooking the Mountain Village pond, plus 43 individually owned hotel residences ranging from one to five bedrooms, all allowed to be rented.',
    tags: ['Development', 'Mountain Village', 'Hotel'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-030', sourceKey: 'fb-3395',
    postedAt: '2026-04-08T10:00:00',
    title: 'Spring Clean Up & Trash Bash — May 16–18 at multiple locations',
    excerpt: 'The annual countywide Spring Clean Up returns May 16–18. Telluride drop-off at Carhenge Parking Lot (700 W Pacific Ave) Friday and Saturday; Mountain Village at Market Plaza on Friday; Norwood and County Fairgrounds on Saturday. Household hazardous waste, electronics recycling, and general household waste accepted. The third annual Trash Bash follows Sunday, May 18 starting at noon in Elks Park — pick up litter, get entered in a raffle, and enjoy free food.',
    tags: ['Community', 'Clean Up', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'tchn-016', sourceKey: 'tchn',
    postedAt: '2026-04-08T08:30:00',
    title: 'Public Health Week — April 6–12 proclaimed by County Commissioners',
    excerpt: 'San Miguel County Commissioners proclaimed April 6–12, 2026 as Public Health Week, joining national celebrations recognizing public health achievements. San Miguel County Public Health expanded services in 2025 including increased radon testing, food safety training, and enhanced access to harm-reduction materials like Narcan and fentanyl test strips.',
    tags: ['Public Health', 'County', 'Awareness'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-036', sourceKey: 'fb-2061',
    postedAt: '2026-04-08T10:30:00',
    title: 'Housing Code update — Phase 2 drafts due April 12, accelerated review underway',
    excerpt: 'San Miguel County\'s Housing Code Update project is now in Phase 2: Issue Identification and Analysis. The county is developing an Accelerated Housing Review process per Proposition 123 requirements and identifying code constraints that slow housing production. Revised draft materials will be published by April 12, 2026. Public input opportunities to follow.',
    tags: ['Housing', 'County', 'Land Use Code'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-031', sourceKey: 'fb-3395',
    postedAt: '2026-04-08T11:00:00',
    title: 'Colorado wildfire building codes now in effect — local adoption required by July 1',
    excerpt: 'As of April 1, 2026, Colorado cities and counties in high-risk wildfire areas must adopt new wildfire-ready building codes by July 1. The codes govern roofing materials, vent mesh sizes, landscaping within five feet of structures, and exterior wall assemblies. San Miguel County, with over 173,000 acres of moderate-to-high fire hazard, is directly affected. Building to wildfire standards adds roughly 2.7% to construction costs. Details at dfpc.colorado.gov.',
    tags: ['Wildfire', 'Building Codes', 'County'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-037', sourceKey: 'fb-2061',
    postedAt: '2026-04-09T07:30:00',
    title: 'Colorado confirms worst snowpack year in recorded history — San Miguel basin at 15%',
    excerpt: 'Colorado has officially recorded its worst snowpack year in history. As of April 1, statewide snow water equivalent was just 3.1 inches — less than 40% of the previous record low set in 2012. The San Miguel-Dolores-Animas-San Juan River Basin is at just 15% of median as of April 7. Sixty of 64 snow course measurement sites recorded their lowest-ever readings. Runoff forecasts remain grim, reinforcing the need for continued water conservation.',
    tags: ['Drought', 'Snowpack', 'Water', 'Climate'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-038', sourceKey: 'fb-2061',
    postedAt: '2026-04-09T08:00:00',
    title: 'Sunset Concert Series returns — Mountain Village Wednesdays June 10 through August 26',
    excerpt: 'The Sunset Concert Series in Mountain Village returns for its 25th year, now nationally recognized as one of USA Today\'s 10Best outdoor summer music series. Free live concerts every Wednesday from 6–8 PM at Sunset Plaza, June 10 through August 26. Family and pet friendly; no personal alcohol. Full artist lineup to be announced soon at sunsetconcertseries.com.',
    tags: ['Events', 'Music', 'Mountain Village', 'Summer'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-039', sourceKey: 'fb-2061',
    postedAt: '2026-04-09T09:00:00',
    title: 'Alpine Loop Overpass gate swung — mid-May clearing planned',
    excerpt: 'San Miguel County road staff report the Alpine Loop Overpass gate has been swung and San Juan County has cleared its side with rock berms placed at the summit to prevent bypass. A temporary barricade and signage will be installed so motorists know the pass remains closed at the summit. San Miguel County plans dozer work in mid-May to open the pass for the season, pending U.S. Forest Service coordination.',
    tags: ['Roads', 'County', 'Alpine Loop'], featured: false, eventRelated: false
  },
  {
    id: 'mountainfilm-001', sourceKey: 'mountainfilm',
    postedAt: '2026-04-09T10:30:00',
    title: 'Mountainfilm 2026 speaker lineup revealed — festival runs May 21–25',
    excerpt: 'Mountainfilm announced its 2026 Minds Moving Mountains Speaker Series lineup on April 8. The 48th annual documentary film festival runs May 21–25 in Telluride with conservationist and marine biologist Cristina Mittermeier as guest director. Festival passes are on sale now at mountainfilm.org.',
    tags: ['Festival', 'Film', 'Arts', 'Upcoming Event'], featured: false, eventRelated: true
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
