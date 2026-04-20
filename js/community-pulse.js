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
const COMMUNITY_PULSE_CACHE_DATE = '2026-04-20T18:00:00';
const COMMUNITY_PULSE_POSTS = [
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
  },
  {
    id: 'telski-001', sourceKey: 'telski',
    postedAt: '2026-04-17T14:00:00',
    title: 'Telluride Bike Park closed for summer 2026 — Lift 4 modernization underway',
    excerpt: 'The Telluride Bike Park will be closed for the entire summer 2026 season to accommodate the Lift 4 (Village Express) modernization project, which began immediately after the mountain closed in early April. The project also affects operations around Gorrono Ranch at the top of Lift 4. Regular summer lift-served mountain biking is not expected to resume until summer 2027. Riders can still access hiking trails and the free gondola for sightseeing when it reopens May 21. Details at tellurideskiresort.com.',
    tags: ['Recreation', 'Bike Park', 'Ski Resort', 'Lift Modernization'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-043', sourceKey: 'fb-3395',
    postedAt: '2026-04-17T15:00:00',
    title: 'Gondola closed for spring maintenance — free buses run between Telluride and Mountain Village through May 20',
    excerpt: 'The Telluride-Mountain Village Gondola is now closed for several weeks of required spring maintenance after its final day of winter operation on April 5. A free shuttle bus runs between Telluride and Mountain Village through Wednesday, May 20. The gondola reopens Thursday, May 21 for the summer season, operating daily through October 25. Routine spring maintenance is scheduled during shoulder-season months as the gondola operates roughly 287 days per year.',
    tags: ['Transportation', 'Gondola', 'Mountain Village', 'Shoulder Season'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-059', sourceKey: 'fb-2061',
    postedAt: '2026-04-18T07:30:00',
    title: 'Pacific Avenue reopens today — Public Works phase wraps after 13-day closure',
    excerpt: 'Pacific Avenue in downtown Telluride reopens to through traffic today, Saturday, April 18, as the Town of Telluride Public Works Department wraps up the latest phase of infrastructure improvements. The full closure between Mahoney Drive had been in place since Monday, April 6 and included utility and streetscape work. Additional phases of the multi-year downtown improvement plan are expected later this season. Motorists should expect normal traffic patterns to resume by Monday.',
    tags: ['Transportation', 'Town Government', 'Public Works', 'Downtown'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-060', sourceKey: 'fb-2061',
    postedAt: '2026-04-18T08:00:00',
    title: 'Mountain Village Council to weigh new lighting regulations at April 23 meeting — first reading of CDC amendments',
    excerpt: 'The Mountain Village Town Council will consider a first reading of proposed amendments to the Community Development Code\'s lighting regulations at its regular meeting on Thursday, April 23. The changes aim to modernize the town\'s dark-sky and outdoor-lighting standards. A first reading is typically followed by a second reading and public hearing before final adoption. Agenda packet and livestream details will be posted at townofmountainvillage.com ahead of the meeting.',
    tags: ['Mountain Village', 'Town Council', 'Lighting', 'CDC', 'Upcoming Event'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2438-016', sourceKey: 'fb-2438',
    postedAt: '2026-04-18T08:30:00',
    title: 'KOTO\'s Big BAM Bash returns Friday, April 24 — battle of the bands lights up downtown',
    excerpt: 'KOTO Community Radio hosts its first-ever Big BAM Bash battle of the bands on Friday, April 24, featuring eight local musical groups competing in a single rollicking evening. The event doubles as a community benefit for KOTO\'s public broadcasting operations and showcases homegrown Telluride talent heading into festival season. Doors and venue details to be announced through KOTO and local organizers. Follow @KOTOradio for updates.',
    tags: ['Community', 'Music', 'KOTO', 'Benefit', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'fb-3395-044', sourceKey: 'fb-3395',
    postedAt: '2026-04-18T09:00:00',
    title: 'Galloping Goose shoulder-season schedule in effect through May 22 — single bus every 30 minutes',
    excerpt: 'The Town of Telluride\'s free Galloping Goose transit continues its shoulder-season schedule through Friday, May 22. A single bus runs every 30 minutes during off-season rather than the peak-season two-bus, 15-minute interval service. The revised schedule is designed to provide consistent, predictable service during the quieter spring weeks between ski season and summer festivals. Full route and timing details at telluride.gov.',
    tags: ['Transportation', 'Galloping Goose', 'Shoulder Season', 'Town Government'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-061', sourceKey: 'fb-2061',
    postedAt: '2026-04-18T11:00:00',
    title: 'SMPA board elections underway — District 3 and District 6 seats contested as energy costs rise',
    excerpt: 'San Miguel Power Association members have the chance to influence the seven-member cooperative board, with District 3 and District 6 seats on the ballot this year. District 3 (covering Norwood, Placerville, Rico, Sawpit and parts of five counties) has incumbent Dave Alexander facing challenger Joanna Yonder. District 6 (Ridgway and parts of Log Hill Village) pits appointed director Valentine Szwarc against Tricia Savage, following the passing of longtime director Debbie Cokes. With regional energy costs climbing, the race has drawn heightened attention from cooperative members. Candidate statements and voting details available at smpa.com.',
    tags: ['Elections', 'Energy', 'SMPA', 'Cooperative'], featured: true, eventRelated: true
  },
  {
    id: 'fb-3395-045', sourceKey: 'fb-3395',
    postedAt: '2026-04-18T11:30:00',
    title: 'Telluride Regional Airport Authority calls special meeting for Tuesday, April 21',
    excerpt: 'The Telluride Regional Airport Authority has scheduled a special meeting for Tuesday, April 21, 2026 at 1:00 p.m. in the Hangar 30 Conference Room at the Telluride Regional Airport. The notice was published in the Telluride Times classifieds on April 16. Agenda and supporting materials are available at tellurideairport.com. Special meetings of the Authority are used for time-sensitive decisions outside the regular meeting schedule.',
    tags: ['Airport', 'Government', 'Special Meeting', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-062', sourceKey: 'fb-2061',
    postedAt: '2026-04-18T12:00:00',
    title: 'Former San Miguel County Sheriff\'s deputy sentenced to 10 years on felony charges involving children',
    excerpt: 'A former San Miguel County Sheriff\'s Office deputy has been sentenced to 10 years in prison after pleading guilty to multiple felony charges involving crimes against children, according to the Telluride Times. The sentencing closes a case that has drawn significant attention across the county given the defendant\'s former role in local law enforcement. Full details of the plea agreement and sentencing were covered in this week\'s edition of the Telluride Times.',
    tags: ['Safety', 'Courts', 'County', 'Law Enforcement'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-046', sourceKey: 'fb-3395',
    postedAt: '2026-04-19T08:00:00',
    title: 'San Miguel Watershed Coalition awarded $500,000 for wildfire preparedness planning',
    excerpt: 'The San Miguel Watershed Coalition has received a $500,000 grant to develop a Wildfire Readiness Action Plan focused on watershed-scale risks across the San Miguel Basin. With snowpack still at roughly 15% of median following an abnormally dry winter, the funding will pay for hazard mapping, fuel-reduction prioritization, and coordination among fire agencies, water providers, and land managers. Plan development is expected to ramp up this spring ahead of summer fire season.',
    tags: ['Wildfire', 'Water', 'Grant', 'County'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-063', sourceKey: 'fb-2061',
    postedAt: '2026-04-19T09:00:00',
    title: 'Festival season safety push — organizers urge heat, hydration, and fire awareness',
    excerpt: 'With Mountainfilm (May 21\u201325), Bluegrass (June 17\u201321), and other festivals approaching, local public-health and emergency officials are reminding residents and visitors to prepare for hot, dry outdoor conditions. Recommendations include carrying water, watching for signs of heat illness at altitude, reviewing event fire restrictions, and planning transit from downtown Telluride and Mountain Village to avoid road congestion. With snowpack at 15% of median and a total fire ban already imposed at some West End events, festival-goers should expect stricter no-flame rules at many summer venues.',
    tags: ['Safety', 'Festival', 'Health', 'Fire'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2438-017', sourceKey: 'fb-2438',
    postedAt: '2026-04-19T10:00:00',
    title: 'West End community bike program launches — Brock Benson aims to put neighbors on two wheels',
    excerpt: 'Brock Benson, recently returned to San Miguel County\'s West End after a 20-year absence, has launched a grassroots effort to get bikes into the hands of residents who need them. "If you need a bike, I\'ll get you a bike," Benson says of the program, which leans on donations and refurbished frames. The effort targets Norwood, Redvale, and surrounding communities where transportation options are limited and a working bicycle can meaningfully expand access to jobs and services.',
    tags: ['Community', 'West End', 'Transportation', 'Nonprofit'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-064', sourceKey: 'fb-2061',
    postedAt: '2026-04-19T11:00:00',
    title: 'Reminder: Telluride Town Council special-election petitions due tomorrow at 5 PM',
    excerpt: 'Tomorrow \u2014 Monday, April 20 at 5 p.m. \u2014 is the deadline for prospective candidates to file petitions for the Town of Telluride\'s June 30 special election. Two Council seats are on the ballot: one vacated by former Mayor Pro Tem Meehan Fee and one currently held by appointed Councilmember Marya Stark. Petitions require 25 valid signatures from registered Telluride voters and must be turned in to the Town Clerk\'s office at Rebekah Hall before the deadline.',
    tags: ['Elections', 'Deadline', 'Town Government', 'Council'], featured: true, eventRelated: true
  },
  {
    id: 'fb-3395-047', sourceKey: 'fb-3395',
    postedAt: '2026-04-19T12:00:00',
    title: 'SMART free shuttle filling in for gondola — rider guide for shoulder-season travel',
    excerpt: 'The San Miguel Authority for Regional Transportation (SMART) is running a free shuttle between Telluride and Mountain Village every day while the gondola is closed for spring maintenance. The gondola, which closed after its final winter day April 5, reopens Thursday, May 21 for the summer season. The shuttle is designed for commuters, visitors, and anyone making the cross-town connection typically handled by the gondola. Routing, pickup locations, and schedule details are posted at smarttelluride.colorado.gov and on the Town of Mountain Village website.',
    tags: ['Transportation', 'Gondola', 'Mountain Village', 'Shoulder Season'], featured: false, eventRelated: false
  },
  {
    id: 'fb-2061-065', sourceKey: 'fb-2061',
    postedAt: '2026-04-19T13:00:00',
    title: 'Early-season water restrictions in effect — three-day watering schedule, 70–75% system setting',
    excerpt: 'Outdoor watering restrictions adopted by the Town of Telluride in late March remain in effect as snowpack sits at roughly 15% of median. Irrigation is allowed only Mondays, Wednesdays, and Fridays \u2014 before 8 a.m. or after 7 p.m. Irrigation systems must be set to 70\u201375% of normal usage, and all exterior water features must be turned off. Mountain Village has parallel restrictions. The proactive approach is designed to protect long-term municipal supply heading into what forecasters warn could be an above-normal fire season. Full details at telluride.gov.',
    tags: ['Water', 'Drought', 'Conservation', 'Town Government'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-066', sourceKey: 'fb-2061',
    postedAt: '2026-04-20T08:00:00',
    title: 'Community Survey open through May 21 — resident feedback shapes Council priorities and budget',
    excerpt: 'The Town of Telluride\'s third annual National Community Survey is open now through midnight on Thursday, May 21. Administered by Polco, the survey captures resident feedback on the economy, mobility, community design, utilities, safety, natural environment, and overall livability. Results will directly inform Town Council goals and future budget allocations. "Our residents don\'t just live in Telluride, they define it," said Town Manager Zoe Dohnal. Take the survey at bit.ly/totsurvey26.',
    tags: ['Town Government', 'Survey', 'Community', 'Budget'], featured: true, eventRelated: false
  },
  {
    id: 'fb-2061-067', sourceKey: 'fb-2061',
    postedAt: '2026-04-20T09:00:00',
    title: 'Special-election petition deadline TODAY at 5 PM — candidates need 25 signatures to qualify',
    excerpt: 'Today, Monday, April 20 at 5 p.m., is the final deadline for prospective candidates to file petitions for the Town of Telluride\'s June 30 special election. Two Council seats are on the ballot: one vacated by former Mayor Pro Tem Meehan Fee and one held by appointed Councilmember Marya Stark, who has confirmed she will run. Candidates must submit petitions with 25 valid signatures from registered Telluride voters to the Town Clerk\'s office at Town Hall, 135 W. Columbia Ave. Registered voters may sign up to two petitions. Certified candidates will be announced after verification.',
    tags: ['Elections', 'Deadline', 'Town Government', 'Council'], featured: true, eventRelated: true
  },
  {
    id: 'fb-2061-068', sourceKey: 'fb-2061',
    postedAt: '2026-04-20T10:00:00',
    title: 'Week ahead: County Commissioners resume Wednesday, Mountain Village Council meets Thursday',
    excerpt: 'Government meetings return this week after the spring break recess. The San Miguel County Board of County Commissioners holds its first regular meeting of the month on Wednesday, April 22 at 9:30 a.m. — agendas are posted at sanmiguelcountyco.gov. On Thursday, April 23, the Mountain Village Town Council considers a first reading of proposed amendments to the Community Development Code\'s lighting regulations, aimed at modernizing dark-sky and outdoor-lighting standards. The Telluride Regional Airport Authority also has a special meeting Tuesday, April 21 at 1 p.m. at Hangar 30.',
    tags: ['Government', 'County', 'Mountain Village', 'Meeting', 'Upcoming Event'], featured: false, eventRelated: true
  },
  {
    id: 'fb-2061-069', sourceKey: 'fb-2061',
    postedAt: '2026-04-20T11:00:00',
    title: 'Entrada Parking Lot closed Tuesday for sweeping and striping \u2014 use alternate lots',
    excerpt: 'The Town of Telluride will close the Entrada Parking Lot on Tuesday, April 21 for sweeping and striping, delayed from an earlier date due to weather. The lot will be closed for the full day while crews complete the work. Motorists should use the Carhenge lot or street parking as alternatives. The maintenance is part of regular spring preparation ahead of summer visitor season.',
    tags: ['Transportation', 'Parking', 'Town Government', 'Public Works'], featured: false, eventRelated: false
  },
  {
    id: 'fb-3395-048', sourceKey: 'fb-3395',
    postedAt: '2026-04-20T12:00:00',
    title: 'NightGrass pre-sale Wednesday, general sale Thursday \u2014 Bluegrass late-night shows June 17\u201321',
    excerpt: 'The NightGrass pre-sale for late-night shows during the 2026 Telluride Bluegrass Festival (June 17\u201321) opens Wednesday, April 22. General sale follows Thursday, April 23. Acts include Greensky Bluegrass, Infamous Stringdusters, Punch Brothers, and more across four downtown venues. Text NIGHTGRASS to 1-844-326-3296 for pre-sale access. Full lineup and ticket details at bluegrass.com.',
    tags: ['Festival', 'Music', 'Tickets', 'Upcoming Event'], featured: true, eventRelated: true
  },
  {
    id: 'c7cc-024', sourceKey: 'c7cc',
    postedAt: '2026-04-20T13:00:00',
    title: 'SMRHA housing lottery this Friday \u2014 three deed-restricted units awarded at Rebekah Hall',
    excerpt: 'The San Miguel Regional Housing Authority lottery drawing takes place this Friday, April 24 at 10 AM at Rebekah Hall, 113 W Colorado Ave. Three deed-restricted homeownership units will be awarded: Silver Jack 202 and Silver Jack 205 at 155 W Pacific Ave, and Element 52 SW-102 at 398 S Davis St. Applications closed April 10. Results will be posted at smrha.org after the drawing.',
    tags: ['Housing', 'Affordable', 'Lottery', 'Upcoming Event'], featured: true, eventRelated: true
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
