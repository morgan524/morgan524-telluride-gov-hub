/* js/gov-helpers.js — bot-managed data + pure helper functions.
 *
 * Loaded by EVERY page (after gov-data.js, before gov-helpers.js if at all).
 *   Legacy index.html:    gov-data.js + gov-helpers.js + gov-helpers.js
 *   v2 standalone pages:  gov-data.js + gov-helpers.js
 *
 * This used to be auto-generated as data-only.js from gov-helpers.js by
 * scripts/extract-data-only.js. As of 2026-05-18 it's the SINGLE SOURCE
 * of truth — both the content-refresh bot and humans edit it directly,
 * and gov-helpers.js no longer carries duplicates of these consts.
 *
 * Depends on gov-data.js (must load first) for COUNTY_CACHED_DATA,
 * MV_CACHED_DATA, COUNTY_CIVICCLERK_BASE, MEETING_ZOOM_LINKS,
 * MEETING_PASSCODES, SCHOOL_ZOOM_LINK, ENTITY_REMOTE, etc.
 */

function truncate(text, maxLen = 200) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function localDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // ISO format "YYYY-MM-DD..." — split on dash to avoid UTC interpretation
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // Named month format "Month Day, Year"
  const named = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const d = new Date(named[1] + ' ' + named[2] + ', ' + named[3]);
    // new Date("March 31, 2026") may be UTC — re-create as local
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  // Fallback — parse then force to local midnight.
  // Use UTC components to preserve the intended calendar date when input is a
  // UTC-midnight timestamp (e.g. RFC 2822 RSS pubDate "+0000"). Using local
  // getDate() on a UTC-midnight Date returns the previous day in timezones
  // west of UTC (e.g. MDT = UTC-6).
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isBadSummary(text) {
  if (!text) return false;
  if (SUMMARY_REJECT_PATTERNS.some(pat => pat.test(text))) return true;
  // Long single-sentence text about the agenda itself (not topic list)
  if (text.length > 120 && !text.includes(' · ') && /\b(agenda|page|text|content|appears|navigation)\b/i.test(text)) return true;
  return false;
}

// Per-meeting Zoom info parsed out of the agenda PDF by
// scripts/content-refresh.js (parseZoomFromAgenda). Keyed by the same
// source|date|title string as MANUAL_SUMMARIES. Read by zoomPanel() in
// gov-hub.html in preference to the static MEETING_ZOOM_LINKS /
// MEETING_PASSCODES config — agenda-extracted info is per-meeting and
// stays current automatically; the static config is the fallback for
// sources without a PDF agenda.
const MEETING_AGENDA_META = {
  "county|2026-05-27|Board of County Commissioners Special Meeting in Telluride 2:00 pm - 2:45 pm":
    {"zoomUrl":"https://us02web.zoom.us/meeting/register/Tg73_6Q9SouIp8dXx71sfg","meetingId":"886 0088 9761","passcode":"042834","phone":"719-359-4580"},

  "county|2026-06-11|Planning Commission Meeting":
    {"zoomUrl":"https://us06web.zoom.us/j/89317090915?pwd=s1SDCrhwsjqY7klJbBNGI7Oyc3Sg2U.1","meetingId":"893 1709 0915","passcode":"670854","phone":"970-728-3844"},

  "county|2026-06-03|Board of County Commissioners Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/83995847328","meetingId":"839 9584 7328","passcode":"308083","phone":"719-359-4580"}
};

const MANUAL_SUMMARIES = {
  "norwood|2026-05-18|Planning and Zoning Commission Meeting":
    "Two code items on the table — a Land Use Code update and a Colorado Wildfire Resiliency Code progress check. The CWRC has been winding through subcommittee work across the region for months; tonight's discussion is P&Z's chance to weigh in before the next draft. The LUC update is at the stage where text changes accumulate quickly. April 20 minutes on consent. The kind of agenda that reads quiet but quietly reshapes what gets built and how.",

  "ophir|2026-05-19|General Assembly Meeting":
    "Charter Review Committee update tops the substantive list — Charter language work is the closest Ophir gets to code revision. Town Buildings Electrification & Solar gets a Wheels-led briefing alongside Lane Masters. Manager's report covers the New Dominion USFS project and two wildfire prep items: a Western Wildfire Council rapid risk assessment for the Town and fuel-reduction work at Town Hall and East Ophir. The agenda also notes the recent passing of John Eagle. A full evening for a town this size.",

  "smart|2026-05-20|SMART Board of Directors":
    "Virtual-only meeting. The Gondola update is the agenda's headline — that's the project that drives SMART's 3A ballot context. Resolution 2026-8 appoints Marya Stark to the Investment Committee. Q4 2025 / annual performance report and the May Ops report round out the formal business. The board closes in executive session under §24-6-402(4)(b) to confer with counsel on Masson v. SMC BOCC. Anyone tracking how the gondola conversation is evolving should bookmark the live link.",

  "mv|2026-05-21|Town Council Meeting":
    "Agenda not yet available",

  "mv|2026-06-17|Town Council Meeting":
    "Agenda not yet available",

  "mv|2026-06-04|Design Review Board":
    "Agenda not yet available",

  "fire|2026-06-16|Board of Directors Meeting":
    "Agenda not yet available",

  "med|2026-05-28|Regular Board Meeting":
    "A regular Telluride Hospital District board meeting. Past the consent agenda and the April draft financials, the substance is in Board Matters — updates on the new facility, partnership talks, and early mill levy considerations. The mill levy is the one to watch; that's the property-tax lever that funds the district. CEO and Foundation/campaign reports round it out. In person at 333 W. Colorado Ave. or by Zoom.",

  "school|2026-06-09|Telluride Board of Education Work Session":
    "Agenda not yet available",

  "school|2026-06-09|Telluride Board of Education Monthly Meeting":
    "Agenda not yet available",

  "ophir|2026-06-16|General Assembly Meeting":
    "Agenda not yet available",

  "smart|2026-06-11|SMART Board of Directors":
    "Agenda not yet available",

  "norwood|2026-06-09|Board of Trustees Meeting":
    "Agenda not yet available",

  "norwood|2026-06-15|Planning and Zoning Commission Meeting":
    "Agenda not yet available",

  "airport|2026-05-21|TRAA Board of Commissioners Meeting":
    "Agenda not yet available",

  "ouray|2026-05-20|The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions.":
    "Land Use Code definitions review · Planning Commission work session",

  "county|2026-05-25|Open Space Commission Meeting":
    "Open Space Commission meeting",

  "county|2026-06-03|Board of County Commissioners Meeting":
    "Regular commissioner meeting · Agenda details not yet available",

  "county|2026-06-11|Planning Commission Meeting":
    "Agenda not available",

  "county|2026-06-17|Board of County Commissioners Meeting":
    "Regular meeting agenda TBD",

  "county|2026-06-22|Open Space Commission Meeting":
    "Agenda details pending · Trail and open space management · Development review matters",

  "county|2026-06-24|Board of County Commissioners Work Session":
    "Work session agenda pending",

  "telluride|2026-06-17|Historic & Architectural Review Commission Chair - Jun 17 2026":
    "The agenda content for this Historic & Architectural Review Commission meeting isn't available yet — just the meeting date and a list of past meetings going back to 2018.",

  "telluride|2026-06-17|Historic & Architectural Review Commission - Jun 17 2026":
    "Meeting information unavailable",

  "telluride|2026-06-17|Parks & Recreation Commission - Jun 17 2026":
    "Meeting scheduled for June 17, 2026",

  "telluride|2026-06-09|Town Council - Jun 09 2026":
    "Agenda not yet published",

  "telluride|2026-06-03|Ecology Commission - Jun 03 2026":
    "Monthly Ecology Commission meeting · Human-wildlife interaction oversight · General commission business",

  "telluride|2026-06-03|Commission for Community Assistance, Arts & Special Events - Jun 03 2026":
    "The agenda text for this Commission for Community Assistance, Arts & Special Events meeting is missing — only the portal navigation and meeting list appears.",

  "telluride|2026-06-03|Telluride Housing Authority Subcommittee - Jun 03 2026":
    "The Jun 03 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "telluride|2026-06-01|Open Space Commission - Jun 01 2026":
    "Meeting scheduled for first Monday of the month · Commission reviews open space acquisitions and management · Advises Town Council on comprehensive plan elements",

  "telluride|2026-05-28|Planning & Zoning Commission - May 28 2026":
    "No specific agenda items available",

  "county|2026-05-27|Board of County Commissioners Special Meeting in Telluride 2:00 pm - 2:45 pm":
    "The commissioners will handle two septic system variances in Ophir, consider ending a deed restriction on Society Drive, and hold a work session with Placerville residents about corridor beautification and Fire District expansion plans.",

  "med|2026-06-25|Regular Board Meeting":
    "The June 25th Regular Board Meeting agenda hasn't been posted yet.",

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    "The June 25, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    "The June 25 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-05-28|Planning & Zoning Commission Chair - May 28 2026":
    "The May 28 Planning & Zoning Commission Chair meeting agenda hasn't been posted yet.",

  "ouray|2026-06-03|The Planning Commission will conduct a regular meeting and hold a public hearing to consider and make recommendation on an application for a 6-lot regular PUD in the South Mesa Zone (Packet Materials are attached to the agenda)":
    "The Planning Commission will review a 6-lot subdivision proposal in the South Mesa Zone — a public hearing where neighbors can weigh in before commissioners make their recommendation to the county.",

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    "The June 30 2026 Town Council agenda hasn't been posted yet."
};

const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "Claude Lemieux's brain is being donated to Boston University's CTE Center, his family says",
    source: "Telluride Times",
    date: "May 31, 2026",
    firstSeen: "2026-05-31",
    newsTopic: "community",
    copy: "Former NHL player Claude Lemieux's family has donated his brain to Boston University's CTE Center for research following his death. The family gave permission for any findings to be shared publicly with Lemieux's name attached, hoping the research will lead to better understanding and protection for future athletes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_05584188-d4ca-5265-9e80-3448018427fd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/47/d47cedf3-7a73-5a48-a684-99d3efe90552/6a18b5e2b4ec0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Housing and mental health",
    source: "Telluride Times",
    date: "May 30, 2026",
    firstSeen: "2026-05-31",
    newsTopic: "housing",
    copy: "Local healthcare providers are reporting that housing instability has become a major driver of stress, anxiety and worsening mental health among patients. Dr. Sharon Grundy notes that uncertain housing affects everything from sleep to chronic condition management, while Tri-County Health Network has advocated with Town Council about housing policies that particularly challenge immigrant and Spanish-speaking residents. One local couple saw their Town-owned rental jump from $2,450 to $4,400 monthly under new policies, forcing them to question whether staying in Telluride remains viable despite their deep community ties.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_82784adf-bcaf-458a-a47e-25d04eeb187a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/61/16137491-cbb9-48aa-beb2-abece96f516e/6a18c781afb5e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountains matter: notes from the UNMP Summit",
    source: "Telluride Times",
    date: "May 30, 2026",
    firstSeen: "2026-05-31",
    newsTopic: "recreation",
    copy: "The UN Mountain Partnership summit in Andorra brought together 150 representatives from 50+ countries to tackle climate change impacts on mountain regions, with Telluride Institute among just four North American groups attending. The numbers tell the story: 186 French Alps ski areas have permanently closed, developing mountain countries need $187 billion annually for climate adaptation but received only $13.8 billion in 2022, and back home Mount Hood Meadows just closed a month early with 100 inches below normal snowpack.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_be1f24b0-2b42-454b-966c-2e8c825bb36e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/5f/85f9cd72-a2fd-4bcc-b4de-5fa0be078976/6a18dad99fd26.image.jpg",
    imgHiRes: true
  },
  {
    title: "Kick-off to adventure",
    source: "Telluride Times",
    date: "May 30, 2026",
    firstSeen: "2026-05-30",
    newsTopic: "community",
    copy: "Telluride Academy is gearing up for its 10-week summer season with 120 camps serving over 700 kids, from day camps for younger ones to multi-day backcountry adventures for teens. The program offers significant tuition assistance for local families and maintains a device-free policy to get kids unplugged and outside.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_570c06c7-2d4d-4dd8-8349-90541606b9f6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/04/104c5465-3a28-4379-9a51-c069fc546c61/6a1a90ee9adc7.image.jpg",
    imgHiRes: true
  },
  {
    title: "From mentees to THS grads",
    source: "Telluride Times",
    date: "May 29, 2026",
    firstSeen: "2026-05-29",
    newsTopic: "community",
    copy: "Five students from the One to One Mentoring program are graduating from Telluride High School this year, representing relationships that span between one and nearly ten years with their mentors. The program held a celebration for the graduates, their families and mentors, where mentors spoke about watching these young people grow up and develop into responsible adults. Together, this graduating class and their mentors have accumulated 35 years of mentoring relationships.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6099f30c-36d6-4552-bac9-3f9c0eb00dde.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/d6/ed65dff5-4f05-45d8-9ba8-161870e75b58/6a17fd67e7c20.image.jpg",
    imgHiRes: true
  },
  {
    title: "Prize winners from Mountainfilm 2026",
    source: "Telluride Times",
    date: "May 29, 2026",
    firstSeen: "2026-05-29",
    newsTopic: "arts-culture",
    copy: "Mountainfilm 2026 wrapped up with awards spanning documentaries, adventure films, and special recognition categories. \"Kijuyu Land\" took best documentary feature while \"Teeth to the Wind\" won the Charlie Fowler adventure film award, and Jim Morrison received the lifetime adventure award. The festival continues its tradition of highlighting films about outdoor culture, social issues, and adventure stories that resonate with mountain communities.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_0b673172-efaa-40b2-a702-232704b34502.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/47/747f11a0-7b75-44c0-adc1-8d286ca26be1/6a192fbecc1e5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Despite scrutiny, special education money flows to for-profit residential treatment centers",
    source: "Telluride Times",
    date: "May 29, 2026",
    firstSeen: "2026-05-29",
    newsTopic: "government",
    copy: "Special education money is flowing to for-profit residential treatment centers through regulatory loopholes, with facilities operating on individual school district contracts and drawing out-of-state students to avoid oversight. A 2022 study found only half of states have certification processes for these centers, and most don't track students sent out of state, creating gaps in monitoring when kids are placed far from home. California has nearly 300 students currently placed out-of-state despite banning similar placements for foster care, highlighting how education funding remains a \"fraught loophole\" that advocates say puts vulnerable children at risk.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_751f25eb-9668-5d58-af46-14a2b20d70e2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/9d/19dde105-5d91-5038-aa53-3a465c7cfee0/6a196caf5f462.image.jpg",
    imgHiRes: true
  },
  {
    title: "MV Town Council discusses expanding employee housing site",
    source: "Telluride Times",
    date: "May 29, 2026",
    firstSeen: "2026-05-29",
    newsTopic: "housing",
    copy: "Mountain Village Town Council is considering adding 15 employee apartments to an existing workforce housing site, which would require rezoning but maintain the same total amounts of multifamily and open space. The proposal has hit resistance from council members and residents who want to preserve an existing park area where families play flag football, even though the overall open space would stay the same. There's also discussion about loosening deed restrictions so the housing isn't just for Telski employees.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8d5bb5ae-775c-4765-b15f-8f7ca0efafd8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/80/e80695c4-157a-4535-a45c-d37d302ce2e7/6a17ffb51d8b2.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Dirty Turkeys at The Alibi",
    source: "Telluride Times",
    date: "May 29, 2026",
    firstSeen: "2026-05-29",
    newsTopic: "community",
    copy: "Psychedelic rockers The Dirty Turkeys play The Alibi on May 29, 9-11:30 p.m. The Boulder-based band have dubbed their sound “acid cow punk,” describing it as a fusion of psychedelia, surf, punk and outlaw country. Formed in fall 2022, The…",
    claudeSummary: false,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_666e5b48-9a9c-42ec-bc42-40729fefb441.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/57/857ec873-03a9-440a-b259-f9c1533ef0d8/6a19249f960e8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Claude Lemieux, the feisty four-time Stanley Cup champion for Avalanche, Devils and Habs, dies at 60",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "community",
    copy: "Claude Lemieux, the four-time Stanley Cup champion known for his gritty play with the Avalanche, Devils and Canadiens, died at 60. The former playoff MVP had just served as Montreal's torch bearer three days earlier at their playoff game. He scored nearly 400 goals over 21 NHL seasons.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_83361eac-e7f1-5c15-adcb-f94a6345e4a7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/85/d8594810-80a8-59b4-890a-7244b3410a62/6a18b5e0f3c11.image.jpg",
    imgHiRes: true
  },
  {
    title: "Summertime means Music on the Green",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "arts-culture",
    copy: "The free Music on the Green summer concert series kicks off May 29 with Dori Freeman performing from 5-7 p.m., followed by weekly shows through September featuring artists like Ray Wylie Hubbard and Jon Stickley Trio. The concerts happen in Mountain Village with mountain views and are sponsored by TMVOA, Madeline Hotel, and the Town of Mountain Village.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_5ab17cdd-56f8-40ff-924d-952b470c2352.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/7a/b7acfc05-77ea-4560-905f-b58e3262b0d4/6a18bd7a43676.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Racquet Club steps into new era",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "recreation",
    copy: "The Telluride Racquet Club expects 15,000 players this summer, up from 1,000 in its first year, with three tennis courts plus a social court area, two platform tennis courts that convert to pickleball in summer. Owner Fey brings in four collegiate tennis pros each season and offers leagues, clinics and lessons through a user-friendly app called Play by Point.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_9834d2c4-5e92-4023-b1a2-e7280515c851.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/b2/db20b18b-c9d2-42f6-bb7c-d51da2923086/6a17f88a91426.image.jpg",
    imgHiRes: true
  },
  {
    title: "Norwood School breaks ground",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "education",
    copy: "",
    claudeSummary: false,
    href: "https://www.telluridenews.com/gallery/news/article_bb23a8b7-4634-46aa-997f-ed192e5fe5a9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/a2/2a2a4618-f6fe-4938-a72a-199d3eee76b4/6a18cdfe2fa15.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Refreshed’ Wild West Fest is back",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "arts-culture",
    copy: "Wild West Fest returns in 2026 after a year hiatus, with organizers making changes based on kid feedback from surveys. The updated program includes more horseback riding through partnerships with local outfitters and shorter activity sessions instead of multi-day commitments.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_59368846-14d1-48b6-af76-572d06c92b15.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/d6/cd6adb7e-6b3f-4df9-ad01-30f555752e79/6a17f3c41f222.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for May 28-June 3, 2026",
    source: "Telluride Times",
    date: "May 28, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "community",
    copy: "A local resident named Kendal Dawn Oakleaf Smith has petitioned San Miguel County Court for a name change to Kendal Dawn Oakleaf Smith. The Colorado Community Action Association is accepting applications through June 3rd for a basic income research project offering $13,000 one-time payments to eligible county residents. The county is also seeking contractors for flooring replacement projects and a boiler system replacement at Down Valley Park.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_0adc5789-cb68-4509-b7a8-1e8bf62a4c8e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Man arrested for hiding sex offender status",
    source: "Telluride Times",
    date: "May 27, 2026",
    firstSeen: "2026-05-28",
    newsTopic: "community",
    copy: "Deputies arrested a man who allegedly concealed his identity and sex offender status while working locally as a DJ. The suspect was previously convicted in 2013 for attempted sexual assault on a child and is scheduled for a court hearing June 16.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_70cc432e-aea1-4dac-91e0-f3a7a5fde25a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/c2/ac24a6b9-6aa6-47dc-a16b-5637a70ad6bb/6a16fe812e569.image.jpg",
    imgHiRes: true
  },
  {
    title: "US Supreme Court settles long-running water dispute over dwindling Rio Grande",
    source: "Telluride Times",
    date: "May 27, 2026",
    firstSeen: "2026-05-27",
    newsTopic: "infrastructure",
    copy: "The Supreme Court settled a decade-long water dispute between New Mexico and Texas over Rio Grande usage, requiring New Mexico to cut groundwater pumping by 18,200 acre-feet annually and retire over 14 square miles of farmland. The agreement aims to restore order to water-sharing between the states as drought conditions worsen along the river that originates in Colorado.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ec16ddd6-59c4-5d79-b1cd-562da53b058d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/d7/5d733892-c447-5597-ac43-e080d5af12f7/6a1727b561bb6.image.jpg",
    imgHiRes: true
  },
  {
    title: "It’s a wrap",
    source: "Telluride Times",
    date: "May 27, 2026",
    firstSeen: "2026-05-27",
    newsTopic: "community",
    copy: "Mountainfilm wrapped up another year showcasing documentaries focused on environmental protection, social justice, and personal resilience. Films featured everything from women inmates helping restore endangered butterflies in Oregon prisons to wildfire survivors in California, plus local wildlife rehabilitator Lissa Margetts in \"The Mountain Ark.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_fb7ed56b-afa8-4c5d-ae54-3f5a43bfa3ff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/3a/a3a31761-8d88-4191-8917-c18600aaa617/6a17011608bd7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Vaulting to success — and fun",
    source: "Telluride Times",
    date: "May 26, 2026",
    firstSeen: "2026-05-27",
    newsTopic: "community",
    copy: "Local gymnasts had a strong showing at state and regional meets this year. Several Telluride Gymnastics team members placed in top 10 finishes, with highlights including Abigail Mann taking third on vault at state and first at regionals, and multiple Gold-level athletes earning fifth-place all-around titles.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_d89d2da5-9ccd-49c8-bae9-66b744d58c4f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/34/434e7b74-b0b7-41c3-ba73-05a9b9fa0810/6a1535cb82c0a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Gabriel Landeskog uses in-skate sensors, AI-driven movement platform to manage his knee and workload",
    source: "Telluride Times",
    date: "May 26, 2026",
    firstSeen: "2026-05-26",
    newsTopic: "community",
    copy: "Gabriel Landeskog is using AI-powered sensors in his skates to monitor his surgically repaired knee and prevent overexertion during training and games. The technology from Vancouver company Plantiga tracks his movement patterns and biomechanics, flagging potential issues before he feels them.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fd43bc8f-8803-5f9a-8e79-6724fb70fea8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/fe/5fe07e55-c0c6-553d-a8ed-4a84aa4394cc/6a15708f94453.image.jpg",
    imgHiRes: true
  },
  {
    title: "Supreme Court won't intervene in discrimination suit led by Black ex-head coach Flores against NFL",
    source: "Telluride Times",
    date: "May 26, 2026",
    firstSeen: "2026-05-26",
    newsTopic: "community",
    copy: "The Supreme Court declined to hear the NFL's appeal of a discrimination lawsuit filed by former Dolphins coach Brian Flores and two other Black coaches alleging racist hiring practices. The decision means the case will proceed in lower courts rather than through NFL arbitration, with Flores and colleagues Steve Wilks and Ray Horton claiming they were denied fair opportunities for coaching positions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_15cfeabf-da1d-59af-b7db-1a98f8e909f3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/6f/66f49c03-5ba9-549d-8ed6-b7101ae68775/6a15ba1f0eba6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado’s largest gas spill contaminates Southern Ute drinking water",
    source: "Telluride Times",
    date: "May 26, 2026",
    firstSeen: "2026-05-26",
    newsTopic: "infrastructure",
    copy: "A Houston-based company's leaking 40-year-old gas pipeline contaminated Southern Ute drinking water wells with what the tribe estimates at 200,000 gallons of gasoline, discovered by a rancher's cows in December. Enterprise Products disputes the spill size and says it's working with agencies on cleanup, but tribal leaders and county officials say the response has been too slow.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a401808e-d76b-453a-9470-28c44d15bc85.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/9c/59c7ef9a-77e8-4717-8ead-905c0bdf40a1/6a152a6cde813.image.png",
    imgHiRes: true
  },
  {
    title: "‘He says “yes” to everything.’",
    source: "Telluride Times",
    date: "May 24, 2026",
    firstSeen: "2026-05-25",
    newsTopic: "education",
    copy: "Chochi, a Rotary Youth Exchange student who had never heard of Telluride before arriving, has won over the community with his infectious positivity and willingness to try everything. Despite being new to snow and activities like basketball, he helped the golf team reach state championships for the first time and earned spirit awards along the way.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_95d8abdb-cfbb-4583-8420-a5de13732d9f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/2a/42a7051a-c0d6-4202-a625-3fee32668761/6a1159940d283.image.jpg",
    imgHiRes: true
  },
  {
    title: "Council recaps winter housing program",
    source: "Telluride Times",
    date: "May 25, 2026",
    firstSeen: "2026-05-25",
    newsTopic: "housing",
    copy: "Town's winter RV camping program at the north park completed its fourth season, housing 9 people in allocated spaces from late November to mid-April. The program collected $9,300 in revenue against roughly $10,000 in operating costs, with some outstanding rent balances still owed.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_327f40ba-0bc6-4509-8436-c136f3e02e2c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/29/d29fa0d0-0b04-43b4-98e5-996ff4d4a8e1/6a115714a006d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Responding when disaster strikes",
    source: "Telluride Times",
    date: "May 24, 2026",
    firstSeen: "2026-05-25",
    newsTopic: "community",
    copy: "San Miguel County Emergency Manager Shannon Armstrong and the Telluride Foundation have formed the San Juan Regional COAD - a network of about 80 nonprofits, businesses and agencies across three counties to coordinate disaster response. The group focuses mainly on wildfire preparedness but also handles floods, severe weather and other emergencies, with strong community participation exceeding organizers' expectations.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_495ca062-80ec-438c-8f0a-a42fa8d758e6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/d5/6d52cd96-9fea-49b0-94a0-f02a885a8548/6a115bfaf164d.image.jpg",
    imgHiRes: true
  },
  {
    title: "The science of connection",
    source: "Telluride Times",
    date: "May 24, 2026",
    firstSeen: "2026-05-24",
    newsTopic: "community",
    copy: "Dr. Kevin Morris from the University of Denver will speak Friday June 5th at 5:30 p.m. at the Science Center about his research on human-animal connections and health. He's studying how psychiatric service dogs help veterans with PTSD and plans future research on veterans and horses.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_702af9d4-c819-4687-a223-a924539cf04b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/00/0005938d-e480-4c36-85a6-b9e7b590e264/6a1149294f3df.image.jpg",
    imgHiRes: true
  },
  {
    title: "Commissioners discuss building codes",
    source: "Telluride Times",
    date: "May 23, 2026",
    firstSeen: "2026-05-24",
    newsTopic: "land-use",
    copy: "San Miguel County commissioners are discussing updating building codes from 2018 to 2024 standards, which would require more energy-efficient construction with stricter requirements for walls, windows, lighting and air leakage. The new codes would start in 2027 and align with state mandates requiring all Colorado jurisdictions to adopt low-energy building codes by 2030.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7f836f62-2a1a-411d-89f5-a3fb0891ea64.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/0c/60c0e092-0602-4354-97f2-7f80200b5c2c/6a1154ab94555.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride School District has its ‘back against the wall’",
    source: "Telluride Times",
    date: "May 23, 2026",
    firstSeen: "2026-05-23",
    newsTopic: "government",
    copy: "The school district faces a major budget shortfall due to new state funding formulas and is asking voters to approve a mill levy override that would cost homeowners less than $10 monthly per million dollars of property value. Declining enrollment from 910 students in 2020 to an anticipated 620, plus the district's reclassification from \"rural\" to \"town\" status, has created a funding gap of nearly $6,000 per student below what adequacy studies say is needed.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_3980a9b3-d3e7-4778-8ce3-eedacfdafbb1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/c8/8c887b07-9980-46d7-a28d-0a499366b784/6a115e7a12ca3.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘An energizing time’ for Telluride Arts",
    source: "Telluride Times",
    date: "May 22, 2026",
    firstSeen: "2026-05-23",
    newsTopic: "arts-culture",
    copy: "Jessica Galbo took over as executive director of Telluride Arts last August and has introduced new programs like Salon Night and Creative Exchange. She's submitted a revised proposal to the town for reopening the Transfer Warehouse with basic improvements rather than the originally planned multi-level cultural center due to cost overruns.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_128c5f8b-2b08-49be-a4a8-38b2391f8bca.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/36/a36d5b63-9f47-4d58-92e9-928b3254d8de/6a0e8fb4dffba.image.jpg",
    imgHiRes: true
  },
  {
    title: "To the center",
    source: "Telluride Times",
    date: "May 22, 2026",
    firstSeen: "2026-05-23",
    newsTopic: "arts-culture",
    copy: "Campers found their favorite cottonwood grove empty and hiked to ancient ruins in a canyon, discovering what appeared to be petroglyphs and a grave site among fallen boulders. A sunrise hike revealed pottery fragments at a pueblo site, including a water vessel rim that made them reflect on how magical modern plumbing would seem to the ancient inhabitants.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_602ad3ac-3179-4220-ab72-4d185d88b067.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/59/959d5cc4-78a6-457b-81aa-ed98ec623895/6a0d8930da86d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Fabulous freeriders",
    source: "Telluride Times",
    date: "May 22, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "recreation",
    copy: "Four Telluride Ski & Snowboard Club freeride athletes qualified for junior championships at Kicking Horse, competing against the top 5-10% of Western Hemisphere athletes despite limited snow this season. Local skiers placed well, with Cieciuch finishing 6th in U19 women's division and three others making finals in the natural terrain competition.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_6e1ffe99-1c70-4fd9-9041-b6bbe7ffbf17.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/18/51817d31-e00d-4991-a117-0ae9f2544bb4/6a0e8d025f075.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountainfilm homecoming",
    source: "Telluride Times",
    date: "May 22, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "arts-culture",
    copy: "Several local filmmakers are featured at this year's Mountainfilm, including Ben Knight who brought two films: \"Best Day Ever\" about adaptive bike riders building a Vermont bike park, and \"Teeth to the Wind\" about climbers Michael Gardner and Sam Hennessey. Knight, known for blending humor with serious subjects, says people seek him out because of his sensitive editing style.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_fb3ab976-5bf3-4e28-b091-a80cee11fed9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/70/8709cb40-2ae2-41f6-baeb-aeac7f6208de/6a0e81f164e4d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado Democrats censure governor for conspiracy theorist sentence commutation",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "government",
    copy: "Governor Polis commuted former Mesa County Clerk Tina Peters' 9-year sentence for copying election computer systems, reducing her prison time to end June 1st. The Colorado Democratic Party censured Polis after 700 members petitioned against the decision, calling it a dangerous precedent.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_f4202a41-f9f2-562d-8d97-2c1f2db524f4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/1e/b1ec7de1-b5e3-5e4e-95b3-697a44fdd763/6a0f5f485e3db.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘There’ll be a lot of connection’",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "arts-culture",
    copy: "The HBO documentary series \"The Dark Wizard\" about legendary climber and BASE jumper Dean Potter will screen at Mountainfilm this week. Potter, who died in 2015 during a proximity flight in Yosemite, once parachuted onto Colorado Avenue here in 2014. Local climber and filmmaker Jim Hurst was among Potter's close friends and appears prominently in the four-part series, which explores Potter's complex personality and tragic death.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_b40e80a2-d383-43d1-bff3-566e31012b76.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/2e/92ec7600-dfe0-407f-9fa0-15ff6755550d/6a0e7e4111eb8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Records of a relationship with the land",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "arts-culture",
    copy: "Cristina MitterMeier, this year's Mountainfilm guest director and founder of the International League of Conservation Photographers, is showing 10 selected photos at Fringe Gallery during the festival. The retrospective spans nearly two decades of her work, featuring images from Ethiopia, British Columbia, India and other locations that explore the relationship between indigenous peoples and wild places.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_9fd8c3e4-4231-41ef-baa3-40cbe4e5b00a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/10/8100ce08-0402-427d-8011-6b7d34f2f9ac/6a0e7393477d2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Super solar project",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "community",
    copy: "Rainbow Preschool installed solar panels on their roof through a partnership with Active Energies Solar, generating 12,200 kW-h annually with 131% energy offset. The project was funded partly through Town of Telluride Green Grant money and has an 8% annual return.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_47be9c09-3df7-4adb-ad86-52fcdacec827.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true,
    letterAuthor: "Megan Berry Director, Rainbow Preschool"
  },
  {
    title: "Green Grants thanks",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "community",
    copy: "Local residents Shawnna and Dennis Andrejko thanked EcoAction Partners, particularly Siobhan Montoya Lavender and Kendra Held, plus Town staffer Darin Graber for help with their Telluride Green Grants project. The program helps residents complete home efficiency upgrades.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_020283e8-4a89-40fe-b595-6ad1fdec878a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true,
    letterAuthor: "Shawnna"
  },
  {
    title: "Endorsing Marya",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "community",
    copy: "Marya Stark, a six-month Town Council appointee, helped create an Economic Resilience Workgroup after last winter's mountain closure hurt local businesses. County Commissioner Anne Brown is endorsing Stark for a full four-year term, citing her policy and finance background.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_9c315856-90b1-43ac-b572-99eea53ab25e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true,
    letterAuthor: "Anne Brown San Miguel"
  },
  {
    title: "End housing bottlenecks",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "housing",
    copy: "Five deed-restricted homes are sitting unsold in Pinion Park while local teachers, healthcare workers, and young families can't qualify under current housing authority requirements. The writer notes many residents earn too much for assistance programs but not enough to meet the rigid lending and qualification standards, creating a bottleneck that's forcing people to keep renting or leave town.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_71288668-53cf-41d2-ade1-f8b82cabe11c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true,
    letterAuthor: "Shannon Farley"
  },
  {
    title: "We can't all be friends",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "The local Second Chance Humane Society has several long-term shelter animals who need to be the only pet in their home, including Howard the cat, Lexi the dog, and Rocko, a senior dog who's been waiting over a year for adoption. These single-pet animals often form especially strong bonds with their human families.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_e2a979c9-1565-4b23-beee-604ab2b4c557.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/95/195498f7-845f-4453-a79c-6146255d99e0/6a0f608a39c4c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Weed of the month: hoary cress",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "Hoary cress, an invasive plant from Europe and Asia, has been spreading aggressively in our area since the early 1900s through both seeds and roots that can extend 15 feet annually. The white-flowered weed creates monocultures that crowd out native plants and is toxic to cattle, making it particularly problematic for agricultural land. San Miguel County's Vegetation Control office is asking residents to help eliminate infestations and offers cost-share funding and management assistance.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_d439160d-ed6b-42b5-83d4-54d8349c1212.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/50/650998f1-88f8-4789-8485-a2b816eb74e4/6a0f5fe1c753b.image.png",
    imgHiRes: true
  },
  {
    title: "Chalkboard week of May 21-27, 2026",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "government",
    copy: "This week's birthdays include Ward Priestley, Sharon Williams, Heather Snyder, Tricia Lippert, Tony Royer, McKenzie Alexander, and Peyton Priestley among others from May 21-27. The usual community meetings continue with Town Board on second Wednesdays and School Board on third Wednesdays, plus ongoing activities like the Thursday farmers market and Sunday food pantry distribution.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_ec1eed12-c369-4710-90bc-847fc7b0ee67.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/f3/2f39c500-3189-4393-b516-c6d0843b5bd2/6a0f5ef43d5e0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Guardians, guides and ‘Good Luck, Kid’",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "Mountainfilm's May 22 premieres include three shorts: \"Guardians of Anatolia\" follows a Turkish nomadic family's 400-kilometer migration filmed over nearly a decade; \"Mountain Guides: Barometers of Change\" features Ridgway's Angela Hawse documenting Arctic ice loss and polar bears; and \"Good Luck, Kid\" shows young filmmaker Taylor Shaffer getting a chance to film climbing legends Tommy Caldwell and Alex Honnold.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_990e5ac9-b55e-4599-b7d9-dda3d47402c4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/62/762bd0fe-d4b7-401b-ac50-c1851014f459/6a06ddbd17d9c.image.jpg",
    imgHiRes: true
  },
  {
    title: "A talented team",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "arts-culture",
    copy: "Filmmakers Beth and George Gage will premiere their documentary \"InVINCEble\" at Mountainfilm, telling the story of USC basketball player Vince Iwuchukwu who suffered cardiac arrest during practice at age 18. The film explores sudden cardiac arrest among young athletes and the mental challenges when health issues threaten sports careers.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_1b5a84e3-52ea-4de1-9538-651e28c777cf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/e8/de8a56cd-ebcd-4b1f-aff4-159bfe4a09aa/6a06d97e6bb3d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Local filmmaker Ken Bailey honors Telluride��s beloved Lissa Margetts",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "arts-culture",
    copy: "Ken Bailey finished a documentary about Lissa Margetts, who ran the Rocky Mountain Ark Wildlife Rehabilitation Center and cared for thousands of injured animals before her death in 2018. He found forgotten footage from 20+ years ago and turned it into \"The Mountain Ark,\" screening at Mountainfilm.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_d78ea7ff-7d61-460a-ba50-81a4dfed4e55.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/56/1569aecb-bff4-4012-84f5-d88df962005b/6a06d485894c5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town council discusses strategies to address housing policies",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "housing",
    copy: "Town Council is forming a 9-member committee of housing project residents to provide feedback on rental policies, with participants getting rent credits for their service. Due to local criticism and staff capacity limits, they're also hiring outside consultants to review housing policies more quickly than staff could manage internally.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_aa3cb7e5-739c-474d-8a71-d46a4d7296e8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/ec/4ecb883f-23a1-4d1d-bddd-dfd4266f8781/6a0fd7c8a2481.image.jpg",
    imgHiRes: true
  },
  {
    title: "Una comunidad por la que vale la pena luchar",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "A candidate is running for County Commissioner, expressing concern that the community is disappearing despite the landscape remaining. They're focusing on housing affordability for local workers, noting that rising costs have pushed out families while many houses sit empty most of the year. The candidate emphasizes balancing growth with infrastructure limits and keeping housing prices aligned with what local workers actually earn.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_220cea39-7b74-4304-b7f6-68aa9d22c930.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/85/385ea219-d90e-46b3-ae19-f24d72946c06/6a0ea32eaa922.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for May 21-27, 2026",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "San Miguel County is seeking contractors for flooring replacement at two downtown Telluride buildings and a boiler system replacement at Down Valley Park in Placerville, with proposal deadlines in early June. A foreclosure sale notice has been filed for a property owned by Sandra G. Esch with an outstanding balance of $115,217.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Patricia Siger",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "government",
    copy: "Patricia Siger (nee Warren), of Lutherville-Timonium, MD, passed away on Friday, May 8th, 2026, at the age of 80. She is survived by her devoted husband, Joel Siger; caring sister-in-law, Lynn Guldan; loving sister, Judy (Richard) Shilling; and beloved nephews,…",
    claudeSummary: false,
    href: "https://www.telluridenews.com/obituaries/article_467ebd46-0fe4-4a28-9789-a00f3d07c759.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/0c/90c5d817-5d85-4aa1-880d-9f48bc91b178/6a0dc90a85e7b.image.png",
    imgHiRes: true
  },
  {
    title: "A community worth fighting for",
    source: "Telluride Times",
    date: "May 21, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "community",
    copy: "A candidate for San Miguel County Commissioner is highlighting concerns about housing affordability, workforce retention, and community sustainability. They're emphasizing the need for affordable housing that matches local wages, better regional coordination, and more transparent decision-making processes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_eb9b3a02-15be-4e45-a36a-a3399f6daf37.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/d1/8d1a0c86-e85c-4bb7-a99d-efcb3ded31c6/6a0ea13a5b911.image.jpg",
    imgHiRes: true
  },
  {
    title: "THS track wins big",
    source: "Telluride Times",
    date: "May 20, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "education",
    copy: "THS girls track team had a strong showing at state championships, with their 4x800 relay team finishing first in 9:44.46, coming within 11 seconds of the 2A record. Austin Coom won her second straight 800m title in 2:11.45, missing the state record by just 0.02 seconds, while the Lady Miners placed 10th overall as a team.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_05e1f911-c5b9-4b4b-ba4f-b633a1d3a7c5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/27/92731cb4-0e96-430e-a9f6-8e46805b1b02/6a0c21f8d29e5.image.jpg",
    imgHiRes: true
  },
  {
    title: "The plant that outlasted the miners",
    source: "Telluride Times",
    date: "May 20, 2026",
    firstSeen: "2026-05-21",
    newsTopic: "recreation",
    copy: "Miners in the old West planted rhubarb for its hardy nature and tangy spring flavor when fresh fruit wasn't available most of the year. The author's 1893 house likely has rhubarb from that original planting still thriving in the yard. Rhubarb plants still mark abandoned mining settlements across the high country, with one historic camp above Gunnison actually named Pie Plant.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_d561c5b3-49d8-4a93-90c3-0948eee9e33a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/1d/d1d8e35f-1f8d-4d2f-a595-78ce88f351de/6a0d87534309b.image.jpg",
    imgHiRes: true
  },
  {
    title: "This year's most endangered historic places nod to America 250 and the promise of equality for all",
    source: "Telluride Times",
    date: "May 20, 2026",
    firstSeen: "2026-05-20",
    newsTopic: "land-use",
    copy: "The National Trust for Historic Preservation released its 2026 most endangered places list, featuring 11 sites across America that highlight the principle of equality, with each receiving a $25,000 grant. Sites include the Ben Moore Hotel in Montgomery where civil rights leaders stayed, the Tule Lake Japanese American segregation center, and Angel Island immigration station.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_4d87e910-1d10-5e25-9af6-0032fbc0f6f9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/08/d08dd411-5461-5062-ba2c-5ac383a44e51/6a0d9f6f18404.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Ethics Commission holds first meeting in 19 years",
    source: "Telluride Times",
    date: "May 20, 2026",
    firstSeen: "2026-05-20",
    newsTopic: "government",
    copy: "The Town Ethics Commission met for the first time since 2005 to review a complaint against Councilwoman Kristen Permanoff for making an insulting comment during a Zoom council meeting in January. Permanoff, who thought she was muted while dealing with a family emergency, apologized publicly and personally to the speaker she interrupted, though the complaint came from a third party. The commission ultimately found no ethical violation occurred.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_456c78de-b779-48b0-8c6b-7b83f3783a07.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/3b/b3bef5c4-c3cb-4d04-a298-e72ee9d1fa09/6a0dc7899b070.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado's top court orders children's hospital to resume gender-affirming care for minors",
    source: "Telluride Times",
    date: "May 19, 2026",
    firstSeen: "2026-05-20",
    newsTopic: "health",
    copy: "Colorado's Supreme Court ordered Children's Hospital Colorado to resume gender-affirming care for minors after four transgender girls sued, claiming the hospital violated state anti-discrimination law. The 5-2 ruling came after the hospital stopped these services following a federal investigation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_8e1b844e-d9ba-58dc-b1a8-754933a96518.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Intergovernmental meeting considers large-scale projects",
    source: "Telluride Times",
    date: "May 20, 2026",
    firstSeen: "2026-05-20",
    newsTopic: "health",
    copy: "Regional officials met to discuss coordination on large development projects after several communities said they were caught off guard by the Four Seasons project in Mountain Village. Towns like Ridgway and Naturita are now housing construction workers, straining local resources and infrastructure, with Ridgway suing over zoning violations at worker housing.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_ab40e47c-2e12-4591-ba16-71b511df9bf2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/5a/85a13aa6-b1b6-4623-9baa-57f77227e78e/6a0d7c50103a8.image.jpg",
    imgHiRes: true
  },
  {
    title: "A return to the mountains",
    source: "Telluride Times",
    date: "May 19, 2026",
    firstSeen: "2026-05-20",
    newsTopic: "housing",
    copy: "A former Telluride restaurant manager who helped open Allred's and Alpino Vino is returning after a decade in Vail to run The Alpine Club, a new private club being developed by Southworth and local residents Scott and Lauren Woodward. The project will completely reimagine the space with a restaurant, bar, chef's counter, après ski lounge, and various amenities.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_e144854e-3e45-4876-a1b1-e40d947ec150.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/0b/50bee733-1e7b-45b2-bfe4-25b65a3fefa0/6a0b3830a98bc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mahoney sets State standard … twice",
    source: "Telluride Times",
    date: "May 19, 2026",
    firstSeen: "2026-05-19",
    newsTopic: "community",
    copy: "Telluride junior Mahoney set new state records in both the 100 and 200 meters at the state championships, clocking 10.83 in the 100 and dealing with a 45-minute lightning delay before his 200 final. His 17 points helped Telluride finish 19th as a team, making both school and state history.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_7554c1af-188d-4958-b4eb-d99606cae703.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/78/f788412a-63b4-45dd-a492-93b90cafd637/6a0c1f226d915.image.jpg",
    imgHiRes: true
  },
  {
    title: "New Mexico wildfire sparked by fatal medical plane crash spreads quickly in rural area",
    source: "Telluride Times",
    date: "May 18, 2026",
    firstSeen: "2026-05-19",
    newsTopic: "public-safety",
    copy: "A medical plane crash in New Mexico sparked a wildfire that doubled to over 19 square miles between Sunday and Monday morning. More than 600 firefighters are battling the blaze in steep terrain, working to protect evacuated cattle ranches and the community of Arabella amid red flag conditions with 20-30 mph winds.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_e905dbce-0fed-5240-93f4-648f460f0e69.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/ac/2ac4c526-79e0-546d-8e03-002c7e877354/6a0b78166dc04.image.jpg",
    imgHiRes: true
  },
  {
    title: "Busy, but feeling good",
    source: "Telluride Times",
    date: "May 18, 2026",
    firstSeen: "2026-05-18",
    newsTopic: "infrastructure",
    copy: "Dr. Geetter at Medicine Ranch is hosting a mental health lecture on May 21 during Mountainfilm, kicking off a busy summer of events. He's also working with the Telluride Men's Health Club on suicide awareness and featuring local artisans in his shop, all while maintaining his positive outlook on the community's resilience.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_f5789cb8-8bff-49d1-a78a-3006cc453e19.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/26/526c819e-4c2e-45ff-81cc-66df69bc7fea/6a0b3366e0158.image.jpg",
    imgHiRes: true
  },
  {
    title: "Highway 62 between Ridgway and Placerville re-opens",
    source: "Telluride Times",
    date: "May 22, 2026",
    firstSeen: "2026-05-22",
    newsTopic: "housing",
    copy: "Highway 62 between Ridgway and Placerville closed for several hours today after a house blocked both lanes near mile marker 9, about four miles west of Dallas Divide. A crane from Montrose was brought in to move the structure, and the sheriff's office provided detour routes using county roads 56V and 58P. The highway reopened around 4 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_042cbb30-7003-4b76-8bc3-a40b5a124367.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/bf/abfd96db-450e-40ba-8a54-74fb95a45581/6a1082ef543f9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Marshal’s Department Arrests Individual for Failure to Register as a Sex Offender",
    source: "Town of Telluride",
    date: "May 22, 2026",
    newsTopic: "public-safety",
    copy: "Content Notice: This communication contains information related to sexual violence/child abuse. Reader discretion is advised.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=393",
    img: ""
  },
  {
    title: "Telluride Barricade Passes Mailed to Town Residents",
    source: "Town of Telluride",
    date: "May 21, 2026",
    newsTopic: "land-use",
    copy: "(May 18, 2026) - The Telluride Parks & Recreation Department has mailed two 2026 Barricade Passes to all residential property owners within the barricade boundary and who either receive a Town water bill or hold a Town parking permit.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=391",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15546"
  },
  {
    title: "Telluride Housing Authority Launches Tenant Advisory Committee",
    source: "Town of Telluride",
    date: "May 21, 2026",
    newsTopic: "housing",
    copy: "(May 20, 2026) – Telluride, CO – The THA is now accepting applications for the newly established Tenant Advisory Committee, a resident-led group created to strengthen communication between tenants living in Town-managed rental housing and Town leadership.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=392",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15549"
  },
  {
    title: "Egnar Enters Stage 1 Fire Restrictions",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "public-safety",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1395",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14159"
  },
  {
    title: "Western Slope Wellness Launches Free Regional Mental Health Resource for Western Slope Communities",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "health",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1394",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14249"
  },
  {
    title: "Road and Bridge Office Closed on June 2nd 2026",
    source: "San Miguel County",
    date: "May 28, 2026",
    newsTopic: "infrastructure",
    copy: "The Road and Bridge office in Norwood will be closed on Tuesday, June 2, 2026. The office will open on Wednesday, June 3rd, with normal business hours.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=528",
    img: ""
  },
  {
    title: "Ophir Pass is now Open",
    source: "San Miguel County",
    date: "May 28, 2026",
    newsTopic: "community",
    copy: "Ophir Pass is now Open",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=527",
    img: ""
  },
  {
    title: "Stage 1 Fire Restrictions in effect for Egnar Fire Protection District until further notice",
    source: "San Miguel County",
    date: "May 26, 2026",
    newsTopic: "public-safety",
    copy: "Stage One fire Restrictions will be in place in the Egnar Fire Protection District until further notice.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=525",
    img: ""
  },
  {
    title: "New Wildfire Information Site Launched",
    source: "San Miguel County",
    date: "May 1, 2026",
    newsTopic: "public-safety",
    copy: "San Miguel County announces the launch of a new wildfire information site, Living with Wildfire. The site is a resource for preparation, mitigation, evacuation and recovery information. More material will be added soon!",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=522",
    img: ""
  },
  {
    title: "Ridgway Offers Convenient Online Payments with Xpress Bill Pay",
    source: "Town of Ridgway",
    date: "May 19, 2026",
    firstSeen: "2026-05-19",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/XPress-Bill-Pay-Press-Release-2026-05-19.pdf",
    img: ""
  },
  {
    title: "Planting Trees in Ridgway - Species Recommendations Brochure",
    source: "Town of Ridgway",
    date: "May 31, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TreesToPlant%20Brochure%202021.pdf",
    img: ""
  },
  {
    title: "Ridgway Youth Advisory Council Meeting Agenda",
    source: "Town of Ridgway",
    date: "June 1, 2026",
    firstSeen: "2026-05-27",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/YAC-Meeting-Agenda-%26-Packet---June-1%2C-2026.pdf",
    img: ""
  },
  {
    title: "Notice and Call of Workshop Meeting of the Ridgway Town Council",
    source: "Town of Ridgway",
    date: "June 16, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop-meeting-notice.pdf",
    img: ""
  },
  {
    title: "Water service outage planned for night of May 28th",
    source: "Town of Ridgway",
    date: "May 27, 2026",
    firstSeen: "2026-05-27",
    newsTopic: "infrastructure",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Water-Shut-Off-Notice-Press-Release-2026-05-27.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 5-29-26",
    source: "KOTO Community Radio",
    date: "May 30, 2026",
    newsTopic: "government",
    copy: "On this week’s Regional Roundup, we hear about efforts to repeal the Roadless Rule for National Forests and learn about an upcoming movie set to benefit from a new Colorado tax credit. We also visit a popular Western Colorado trail that has introduced new fees for e-bikes, hear why water managers are worried about a dry summer ahead, and tag along ",
    href: "https://koto.org/news/newscast-5-29-26/"
  },
  {
    title: "Newscast 5-28-26",
    source: "KOTO Community Radio",
    date: "May 29, 2026",
    newsTopic: "public-safety",
    copy: "Telluride Fire Plans for Station 3 Expansion; West End Roundup with the San Miguel Basin Forum; Wear a Lifejacket and Don’t Touch the Wildlife",
    href: "https://koto.org/news/newscast-5-28-26/"
  },
  {
    title: "Newscast 5-27-26",
    source: "KOTO Community Radio",
    date: "May 28, 2026",
    newsTopic: "community",
    copy: "Man Arrested for Failure to Register as Sex Offender; The Impetus of Dance in Unlikely Spaces",
    href: "https://koto.org/news/newscast-5-27-26/"
  },
  {
    title: "Newscast 5-22-26",
    source: "KOTO Community Radio",
    date: "May 23, 2026",
    newsTopic: "government",
    copy: "On this week’s Regional Roundup, we hear how Utah residents are pushing back against a proposed data center, and we'll hear a report on a new management plan for the Maroon Bells area in Western Colorado. We'll also hear about the nuances of party affiliation ahead of Wyoming’s primary elections, and the environmental benefits of mushroom cultivati",
    href: "https://koto.org/news/newscast-5-22-26/"
  },
  {
    title: "Newscast 5-21-26",
    source: "KOTO Community Radio",
    date: "May 22, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; Kris Tompkins on Rewilding the Mind; A Placerville Poetry Box",
    href: "https://koto.org/news/newscast-5-21-26/"
  },
  {
    title: "Newscast 5-20-26",
    source: "KOTO Community Radio",
    date: "May 21, 2026",
    newsTopic: "government",
    copy: "Telluride School District to Ask Voters for More Funding; Cat Movie Fisher with Risho Unda; InVINCEble Comes to Mountainfilm",
    href: "https://koto.org/news/newscast-5-20-26/"
  },
  {
    title: "Newscast 5-18-26",
    source: "KOTO Community Radio",
    date: "May 19, 2026",
    newsTopic: "health",
    copy: "Survey Looks at Health and Wellbeing in the Region; Coming Up Next, Telluride; General Assembly Adjourns",
    href: "https://koto.org/news/newscast-5-18-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "A Placerville Poetry Box",
    source: "KOTO Community Radio",
    date: "May 22, 2026",
    newsTopic: "infrastructure",
    copy: "A bright yellow poetry box on the side of the road in San Miguel Canyon offers people driving to and fro a place to stop, write, and share poems. Created by local poet Rosemerry Wahtola Trommer, the poetry box is an opportunity to pause, reflect, and embrace a sense of community.",
    href: "https://koto.org/news/san-miguel-canyon-telluride-poetry-box-colorado/"
  }
];

// San Miguel Basin Forum (West End — Norwood, Nucla, Naturita, Paradox).
// Populated by scripts/content-refresh.js → pullSmbForum() every 6 hours.
// Schema: { title, source: 'San Miguel Basin Forum', sourceKey: 'smb',
//   date, firstSeen, newsTopic, copy, href, img }.
//
// Date model (2026-05-26): "Publish date" on the site = the day WE
// first observe the article on SMBF (`firstSeen`), NOT the article's
// own byline date. SMBF is print-first and stories appear in the
// print edition well before they're posted online, so trusting the
// online byline would understate freshness. The displayed `date`
// field mirrors `firstSeen` in human form.
//
// Carry-forward in pullSmbForum() preserves entries whose firstSeen
// is within the 35-day window even when they roll off SMBF's short
// front-page rotation.
//
// ── Seeded for first-deploy ──
//
// The top two entries are the two articles the user wanted to feature
// as the launch pair (today = 2026-05-26).
//
// The remaining 23 entries are the OTHER articles currently on the
// SMBF landing page, stamped with sentinel firstSeen='2025-01-01'.
// They exist solely so that on the bot's first run after deploy,
// pullSmbForum() recognises them as "already known" and DOESN'T
// flood the Local News tab by stamping all 25 articles with today's
// date. Local News applies its own 35-day-firstSeen filter, so these
// sentinel-dated entries never display — they just block re-detection.
//
// As genuinely-new articles appear at the top of the SMBF landing
// page over the coming weeks, the bot will add them with firstSeen=today
// and the array will naturally shed the sentinels via the same logic.
const SMB_FORUM_ARTICLES = [
  {
    title: "Jackson McCabe is Pinhead history ‘pintern’",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "May 26, 2026",
    firstSeen: "2026-05-26",
    newsTopic: "education",
    copy: "Jackson McCabe, a junior at Nucla High School, will do a small “pinternship” in Washington, D.C. this summer. The Pinhead Institute of Telluride, a Smithsonian Affiliate, is sponsoring the …",
    href: "https://www.sanmiguelbasinforum.com/stories/jackson-mccabe-is-pinhead-history-pintern,114883",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260512-170032-0b9-F1%20-%20pinhead.jpg"
  },
  {
    title: "Town secures $1.25M for Norwood Hill improvements",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "May 26, 2026",
    firstSeen: "2026-05-26",
    newsTopic: "arts-culture",
    copy: "Last week, the Town of Norwood announced it had been awarded $1,250,000 in funding through the Colorado Department of Transportation's Highway Safety Improvement Program (HSIP). Town Manager Sara …",
    href: "https://www.sanmiguelbasinforum.com/stories/town-secures-125m-for-norwood-hill-improvements,114098",
    img: ""
  },
  {
    title: "Pierce said drought plan is forthcoming; ‘be responsible with water’",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "infrastructure",
    copy: "With snowpack at a 30-year low, Tim Pierce, of Mustang Water Authority, told the Forum the repercussions are less water in the river. He said that means significantly less water this year, so …",
    href: "https://www.sanmiguelbasinforum.com/stories/pierce-said-drought-plan-is-forthcoming-be-responsible-with-water,110627",
    img: ""
  },
  {
    title: "Brent Garber tells his side of the Bucktail Fire",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "housing",
    copy: "Many in the West End know Brent Garber. He’s responsible for starting the Bucktail Fire in August of 2024, which burned more than 7,000 acres. He was sentenced in July of 2025, receiving multiple …",
    href: "https://www.sanmiguelbasinforum.com/stories/brent-garber-tells-his-side-of-the-bucktail-fire,108448",
    img: ""
  },
  {
    title: "Boys are state bound!",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "community",
    copy: "The Nucla Mustangs, now 25-0, are headed to the state tournament in Greeley. Head coach Mike Rummel told the Forum March 8 it was very exciting. “It has been a goal for the boys for a few …",
    href: "https://www.sanmiguelbasinforum.com/stories/boys-are-state-bound,107655",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260310-211136-873-front%20page%20pic.jpeg"
  },
  {
    title: "It snowed, but it’s not looking good",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "community",
    copy: "Yes, it did snow over the weekend, a welcome change of weather for anyone hoping the Western Slope gets precipitation this spring. Lifetime rancher and member of Mex & Sons cattle operation in …",
    href: "https://www.sanmiguelbasinforum.com/stories/it-snowed-but-its-not-looking-good,107656",
    img: ""
  },
  {
    title: "VFW honors Wytulka as Colorado high school teacher of the year",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "education",
    copy: "Nucla’s high school teacher, coach and school counselor Debbie Wytulka has received a prestigious state award by the VFW. Nominated by West End Public Schools and representing the 12th VFW district …",
    href: "https://www.sanmiguelbasinforum.com/stories/vfw-honors-wytulka-as-colorado-high-school-teacher-of-the-year,105139",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260218-101646-ba8-F4%20-%20vfw%20debbie.jpg"
  },
  {
    title: "Paula Brown and Brad Miller run for Nucla mayor",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "government",
    copy: "Incumbent Paula Brown is seeking reelection for the seat of Nucla mayor; her campaign opponent is Brad Miller. The Forum asked both candidates about their backgrounds and reasons for wanting to to …",
    href: "https://www.sanmiguelbasinforum.com/stories/paula-brown-and-brad-miller-run-for-nucla-mayor,104248",
    img: ""
  },
  {
    title: "Norwood girl breaks Guinness World Records for hula hooping",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "education",
    copy: "Ember Alexander, an 11-year-old girl in the fifth grade at Norwood Elementary School, set out to make history in the Guinness World Records and did so last week, on Jan. 27, after hula hooping for …",
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-girl-breaks-guinness-world-records-for-hula-hooping,103348",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260204-121432-f93-F4%20-%20ember.jpeg"
  },
  {
    title: "Zandon Bray: Release pause welcome, won’t solve every problem",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "government",
    copy: "Zandon Bray, who is a member of a multi-generational ranching family and District 9 board member for the Colorado Farm Bureau, confirmed with the Forum on Jan. 24 that last week yet another wolf in …",
    href: "https://www.sanmiguelbasinforum.com/stories/zandon-bray-release-pause-welcome-wont-solve-every-problem,102328",
    img: ""
  },
  {
    title: "West End encouraged to attend the ag econ summit",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "arts-culture",
    copy: "Janie VanWinkle, well-known cattlewoman and originally of Nucla, told the Forum last week she hopes folks from the West End attend the Economic Impact of Agriculture on Western Colorado Summit in …",
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-encouraged-to-attend-the-ag-econ-summit,101454",
    img: ""
  },
  {
    title: "West End sentiments differ on TelSki strike",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "recreation",
    copy: "The Telluride Ski Patrol labor strike is not just an East End issue. Many people who live in Norwood, Nucla and Naturita work for Telluride Ski Resort, as snow groomers, in the offices and for ski …",
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-sentiments-differ-on-telski-strike,99774",
    img: ""
  },
  {
    title: "Tim Pierce discusses current situation",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "housing",
    copy: "Tim Pierce, of Mustang Water, told the Forum last week that “to be quite blunt, Mustang Water is at its limit with the existing system.” He said one further upgrade can be made to add a …",
    href: "https://www.sanmiguelbasinforum.com/stories/tim-pierce-discusses-current-situation,95910",
    img: ""
  },
  {
    title: "Stakeholders question SMC regs",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "community",
    copy: "San Miguel County has been in the process of updating mining regulations, and for the last year has held a series of meetings and asked for public comment. While the county has not finalized anything …",
    href: "https://www.sanmiguelbasinforum.com/stories/stakeholders-question-smc-regs,93497",
    img: ""
  },
  {
    title: "Cossey never applied for man camp; Covault never worked one",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "housing",
    copy: "Last week, the San Miguel Basin Forum ran a lengthy story about the Nov. 8 meeting at Norwood Town Hall, a meeting held for community updates on the Four Seasons’ workforce housing plans, as …",
    href: "https://www.sanmiguelbasinforum.com/stories/cossey-never-applied-for-man-camp-covualt-never-worked-one,92290",
    img: ""
  },
  {
    title: "West End FLL team heads to state tournament",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "community",
    copy: "Nov. 15 was a busy day for local kids in the First Lego League (FLL) program. They got up early, but instead of heading to Durango, where regionals are typically held, they traveled to Ridgway. This …",
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-fll-team-heads-to-state-tournament,92291",
    img: "https://zeta.creativecirclecdn.com/smb/original/20251119-103041-15a-youth%20main%20w%20story.jpg"
  },
  {
    title: "Locals question man camps, infrastructure in community meetings",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "infrastructure",
    copy: "Two meetings to update community and get feedback on the Four Seasons project happened last week, Nov. 5 and Nov. 8. The Forum attended the Nov. 8 meeting at Norwood Town Hall from 6 to 8 p.m. Then, …",
    href: "https://www.sanmiguelbasinforum.com/stories/locals-question-man-camps-infrastructure-in-community-meetings,90857",
    img: "https://zeta.creativecirclecdn.com/smb/original/20251112-105813-532-man%20camps.jpg"
  },
  {
    title: "Coram talks solar, school, cell towers",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "education",
    copy: "Don Coram, Republican Colorado State Senator for 2017-2022 and of Montrose, attended the public solar meeting in the West End, held Oct. 2 at Nucla Community Center, along with about 40 other …",
    href: "https://www.sanmiguelbasinforum.com/stories/coram-talks-solar-school-cell-towers,89627",
    img: "https://zeta.creativecirclecdn.com/smb/original/20251104-200746-bc7-front%20page%20pic.jpg"
  },
  {
    title: "Norwood voters to decide on new school",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "government",
    copy: "The Nov. 4 election will determine whether or not Norwood voters pass a bond for a new school. A debatable issue, the bond didn’t pass the last time two times it was up for a vote. The Forum …",
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-voters-to-decide-on-new-school,88387",
    img: ""
  },
  {
    title: "Rimrockers help miners find records",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "land-use",
    copy: "Years ago, a donation of files was given to Rimrocker Historical Society by one who wishes to remain anonymous, but who did work on original mining safety claims. Over time, the Rimrocker ladies took …",
    href: "https://www.sanmiguelbasinforum.com/stories/rimrockers-help-miners-find-records,83408",
    img: ""
  },
  {
    title: "Community Benefit Coalition forms",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "community",
    copy: "A new coalition of community leaders, business representatives, and local stakeholders has formed to ensure that the West End Communities continue to thrive while responsibly managing growth …",
    href: "https://www.sanmiguelbasinforum.com/stories/community-benefit-coalition-forms,83412",
    img: ""
  },
  {
    title: "Town clean-up day is Oct. 18",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "government",
    copy: "The Nucla Town Board of Trustees assembled Sept. 10 for a regular meeting. It’s yet to be determined who will replace Town Manager Melissa Lampshire who resigned earlier this summer. West …",
    href: "https://www.sanmiguelbasinforum.com/stories/town-clean-up-day-is-oct-18,81168",
    img: ""
  },
  {
    title: "West End explores manufacturing possibilities",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "land-use",
    copy: "The West End Economic Development Corporation (WEEDC) is eyeing a manufacturing opportunity that could impact Nucla and Naturita. WEEDC Executive Director Makayla Gordon told the Forum last Friday …",
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-explores-manufacturing-possibilities,80123",
    img: ""
  },
  {
    title: "Uranium industry could be on upswing",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "land-use",
    copy: "In June representatives from Montrose County reported on a permitted uranium project in Utah’s Lisbon Valley. Then, county representatives said the project was “beginning to bring …",
    href: "https://www.sanmiguelbasinforum.com/stories/uranium-industry-could-be-on-upswing,79240",
    img: ""
  },
  {
    title: "Leopard frogs appear in Nucla, Part 2",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "Jan 1, 2025",
    firstSeen: "2025-01-01",
    newsTopic: "arts-culture",
    copy: "Last week, the Forum reported on northern leopard frog sightings in the West End. Many landowners have claimed they rarely see the species anymore, but others have said they’re seeing the …",
    href: "https://www.sanmiguelbasinforum.com/stories/leopard-frogs-appear-in-nucla-part-2,78176",
    img: "https://zeta.creativecirclecdn.com/smb/original/20250827-085129-c80-F1%20-%20jump.jpg"
  }
];

const BLOG_POSTS = [
  {
    title: 'From "Let the People Decide" to "Livable Telluride"',
    url: 'https://livabletelluride.org/Blog%20Posts/from-let-the-people-decide-to-livable-telluride',
    date: 'Feb 23, 2026',
    readTime: '3 min',
    image: '/images/blog/let-the-people-decide.jpg',
    summary: 'The story behind our rebrand — why the mission evolved from a single ballot question to a broader effort to keep Telluride livable for the people who actually live here.',
    category: 'Town of Telluride'
  },
  {
    title: 'As the Society Turns (the Survey Episode)',
    url: 'https://livabletelluride.org/Blog%20Posts/societyturnpud',
    date: 'Oct 14, 2025',
    readTime: '2 min',
    image: '/images/blog/society-turn-survey.png',
    summary: '106 residents weighed in on Society Turn — 83% knew about the hospital, but nearly 80% had no idea how much else is planned for that site.',
    category: 'County Issues'
  },
  {
    title: 'As the Society Turns (the PUD Episode)',
    url: 'https://livabletelluride.org/Blog%20Posts/as-the-society-turns-the-pud-episode',
    date: 'Oct 11, 2025',
    readTime: '5 min',
    image: '/images/blog/society-turn-pud.png',
    summary: 'A deep dive into the Society Turn PUD that even its loudest critics admit is bigger than anyone realized — and why that matters for the valley\'s future.',
    category: 'County Issues'
  },
  {
    title: 'Saturday Shot of Finance: If VooDoo Were a Private Development, Would It Already Be Bankrupt?',
    url: 'https://livabletelluride.org/Blog%20Posts/saturday-shot-of-finance-if-voodoo-were-a-private-development-would-it-already-be-bankrupt',
    date: 'Oct 11, 2025',
    readTime: '4 min',
    image: '/images/blog/voodoo-finance.png',
    summary: 'A family stuck in "affordable housing" with soaring rent asks the question no one at Town Hall wants to answer — do these numbers actually work?',
    category: 'Town of Telluride'
  },
  {
    title: 'Why is Rent So Damn High In Telluride!',
    url: 'https://livabletelluride.org/Blog%20Posts/why-is-rent-so-damn-high-in-telluride',
    date: 'Sep 15, 2025',
    readTime: '5 min',
    image: '/images/blog/rent-so-damn-high.png',
    summary: 'Sweet Rants lit up with locals doing the math on new housing projects — and the per-unit costs will make your jaw drop.',
    category: 'Town of Telluride'
  },
  {
    title: 'From $36 Million to $103 Million: How Telluride Became Richer Than a Lottery Winner',
    url: 'https://livabletelluride.org/Blog%20Posts/from-36-million-to-103-million-how-telluride-became-richer-than-a-lottery-winner',
    date: 'Sep 13, 2025',
    readTime: '3 min',
    image: '/images/blog/36-to-103-million.png',
    summary: 'A 930% budget increase in ten years — this breakdown of where all that money went (and keeps going) is essential reading for any Telluride taxpayer.',
    category: 'Town of Telluride'
  },
  {
    title: "Canyonlands Development: A Closer Look at Telluride's Financing",
    url: 'https://livabletelluride.org/Blog%20Posts/canyonlands-development-a-closer-look-at-telluride-s-financing',
    date: 'Jul 28, 2025',
    readTime: '4 min',
    image: '/images/blog/canyonlands.png',
    summary: 'The $26.5M Canyonlands project by Clark\'s uses a creative 30-year lease structure that every resident should understand before the bonds come due.',
    category: 'Town of Telluride'
  },
  {
    title: 'Empowering Telluride: The Future of Lot L Development',
    url: 'https://livabletelluride.org/Blog%20Posts/empowering-telluride-the-future-of-lot-l-development',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/lot-l.png',
    summary: 'A massive parking garage on Lot L could permanently change downtown Telluride\'s character — here\'s why community input matters now, not later.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Sunnyside Project',
    url: 'https://livabletelluride.org/Blog%20Posts/the-sunnyside-project',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/sunnyside.png',
    summary: 'Completed before costs spiraled, Sunnyside shows how pre-pandemic housing financing worked — and why today\'s projects can\'t replicate it.',
    category: 'Town of Telluride'
  },
  {
    title: 'The VooDoo Project',
    url: 'https://livabletelluride.org/Blog%20Posts/the-voodoo-project',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/voodoo-project.png',
    summary: 'The VooDoo\'s $27.4M price tag for 27 units launched at exactly the wrong time — a cautionary tale of what happens when interest rates hit 7%.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Chair 7 Development Controversy',
    url: 'https://livabletelluride.org/Blog%20Posts/the-chair-7-development-controversy',
    date: 'Jul 25, 2025',
    readTime: '3 min',
    image: '/images/blog/chair-7.png',
    summary: 'A hotel and commercial development on open space near the ski area is the most contentious proposal in years — here\'s what the PUD amendment actually allows.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Gondola Station',
    url: 'https://livabletelluride.org/Blog%20Posts/the-gondola-station',
    date: 'Jul 2, 2025',
    readTime: '1 min',
    image: '/images/blog/gondola-station.png',
    summary: 'Three design concepts for a new gondola station could reshape downtown — but without a charter amendment, voters won\'t get a say.',
    category: 'Town of Telluride'
  }
];

const COMMUNITY_EVENTS = [
  {
    title: "2nd Annual Telluride Rotary Hikeathon",
    source: "Telluride Rotary Club",
    date: "May 31, 2026",
    endDate: "June 28, 2026",
    location: "Oak Street Gondola Plaza, Telluride",
    eventTimes: "11:00 AM kickoff",
    copy: "Registration opens April 20 for the 2nd Annual Telluride Rotary Hikeathon. Four weeks of hiking from May 31 through June 28, with a kickoff at 11am on May 31 at the Oak Street gondola plaza. Hike from anywhere and raise funds for the Telluride Rotary Foundation — supporting scholarships, Youth Exchange, international projects, and community grants. 60% of nonprofit team funds go directly back to their nonprofit. Sponsored by Alpine Bank and Jagged Edge Mountain Gear.",
    href: "https://www.facebook.com/telluriderotary/",
    notable: true,
    beneficiary: "Telluride Rotary Foundation — scholarships, Youth Exchange & community grants",
    sponsors: "Alpine Bank, Jagged Edge Mountain Gear",
    clubInfo: { name: "Telluride Rotary Club", meetings: "1st & 3rd Wednesdays, 6:00 PM (social at 5:30)", location1: "1st Wed — Mountain Lodge, 457 Mountain Village Blvd", location2: "3rd Wed — Announced Telluride location", president: "Kate Wadley", email: "telluriderotary@gmail.com", website: "https://portal.clubrunner.ca/3291", note: "No meetings in April. In-person & online options available." }
  },
  {
    title: "Elks Lodge Comedy Night with Cindy Pierce",
    source: "Telluride Elks Lodge 692",
    date: "March 16, 2026",
    location: "472 W Pacific Ave, Telluride",
    copy: "The Telluride Elks Lodge hosted comedian Cindy Pierce for a night of laughs benefiting Tri-County Health Network and the community services they provide across the region. Located at 472 W Pacific Ave, the Lodge regularly hosts social and fundraising events for the Telluride community.",
    href: "https://www.facebook.com/pages/Telluride-Elks-Lodge-692/232150316875640",
    notable: true,
    beneficiary: "Tri-County Health Network"
  }
];

// ── Music on the Green — Mountain Village summer concert series ──
// Free-form curated series (Beyond the Groove / sunsetconcertseries.com).
// Every Friday 5–7 PM at Reflection Plaza (next to Hotel Madeline) in
// Mountain Village. events.html reads this via its pushEvent loop, so each
// concert renders as its own card on the Events tab within the rolling
// 60-day look-ahead window. Per-band photos live in /img/music-on-the-green/.
// Update this list each season from https://sunsetconcertseries.com/music-on-the-green
const MUSIC_ON_THE_GREEN = (function () {
  const SERIES_LINK = 'https://sunsetconcertseries.com/music-on-the-green';
  const LOCATION = 'Reflection Plaza (next to Hotel Madeline), Mountain Village';
  const TIME = '5:00 – 7:00 PM';
  const lineup = [
    { date: '2026-05-29', band: 'Dori Freeman',                   slug: 'dori-freeman' },
    { date: '2026-06-05', band: 'Madeline Hawthorne',             slug: 'madeline-hawthorne' },
    { date: '2026-06-12', band: 'J Plank & the Bernese Rescue Band', slug: 'j-plank' },
    { date: '2026-06-19', band: 'The Lowest Pair',                slug: 'the-lowest-pair' },
    { date: '2026-06-26', band: 'LVDY',                           slug: 'lvdy' },
    { date: '2026-07-10', band: 'Alex Maryol',                    slug: 'alex-maryol' },
    { date: '2026-07-17', band: 'Sway Wild',                      slug: 'sway-wild' },
    { date: '2026-07-24', band: 'Jon Stickley Trio',              slug: 'jon-stickley-trio' },
    { date: '2026-07-31', band: 'South Austin Moonlighters',      slug: 'south-austin-moonlighters' },
    { date: '2026-08-07', band: 'Logan Metz',                     slug: 'logan-metz' },
    { date: '2026-08-14', band: 'Ben Musser & Walker Young',      slug: 'ben-musser-walker-young' },
    { date: '2026-08-21', band: 'Ray Wylie Hubbard',             slug: 'ray-wylie-hubbard' },
    { date: '2026-08-28', band: 'Cristina Vane',                  slug: 'cristina-vane' },
    { date: '2026-09-04', band: 'Daniel Rodriguez',               slug: 'daniel-rodriguez' },
    { date: '2026-09-11', band: 'Danno Simpson',                  slug: 'danno-simpson' },
    { date: '2026-09-18', band: 'Leon Timbo',                     slug: 'leon-timbo' },
  ];
  return lineup.map(c => ({
    title: c.band + ' — Music on the Green',
    date: c.date,
    time: TIME,
    location: LOCATION,
    description: 'Outdoor summer concert in Mountain Village\'s Music on the Green series, presented by Beyond the Groove. Live music at Reflection Plaza (next to Hotel Madeline), Fridays 5–7 PM. This week: ' + c.band + '.',
    href: SERIES_LINK,
    imageUrl: '/img/music-on-the-green/' + c.slug + '.jpg',
    sourceLabel: 'Music on the Green',
  }));
})();

const KOTO_COMMUNITY_EVENTS = [
  {
    title: "Gentle Yoga with Kristin Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristin-milord-2/2026-05-31/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class is free, but donations to support the instructor are welcome.",
    pubDate: "2026-05-31T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/gentle-yoga-kristen-1.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-05-31/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-05-31T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-05-31/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-05-31T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Bardic Trails Online Poetry Night",
    link: "https://koto.org/event/bardic-trails-online-poetry-night-3/2026-06-02/",
    description: "The Telluride Institute's Bardic Trails poetry night features an award-winning guest poet sharing their new and exciting work. The reading will be followed with a Q & A about the poet’s work and inspirations, with time afterwards for poetry sharing from attendees – a Gourd Circle of sharing whatever poetry attendees wish, or just listening in. The list of 2026 poets is below. The free Bardic Trails virtual Zoom series is on the first Tuesday of each month. Visit to get the zoom link each month, Thanks to the Wilkinson Public Library, Cantor Family, the Guttman Family Foundation, CCAASE and our Fischer and Cantor contest participants for supporting our program and projects. Jan. 6 / Euro-American poet Dane Cervine of California Feb. …",
    pubDate: "2026-06-03T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/03/Bardic-Trails-2026.jpg"
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-06-04/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-06-04T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Art Walk Telluride",
    link: "https://koto.org/event/art-walk-telluride/2026-06-04/",
    description: "Join us the first Thursday of every month for Telluride's Art Walk. It will be an evening filled with inspiring exhibits, engaging receptions, and the chance to meet local and visiting artists. From 5–7 pm, participating venues will open their doors, showcasing new collections and inviting art lovers to explore the vibrant gallery scene. Find what's new on www.telluridearts.org Note: Special Edition Art Walk May 21st.",
    pubDate: "2026-06-04T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png"
  },
  {
    title: "Mars SUCKS! (Telluride Theatre FRINGE Project)",
    link: "https://koto.org/event/mars-sucks-telluride-theatre-fringe-project/2026-06-04/",
    description: "Mars SUCKS! (Telluride Theatre FRINGE Project) June 4 & 5 7 – 8:45pm @ The Michael D. Palm Theatre In an otherworldly performance, author and explorer Craig Childs brings a form of live cinema to the Palm, featuring live music by Beth Quist. This visual, musical, spoken word event mixes science, storytelling, and a crazy desert adventure. We'll be leaving the planet, so buckle up. Seating is limited. Pay-What-You-Can Tickets are available. Learn more on Telluride Theatre's website ( www.telluridetheatre.org )",
    pubDate: "2026-06-05T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Michael D. Palm Theater, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mars-sucks-thundertix.png"
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-06-05/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-06-05T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "The Science of Connection: How our Relationships with Animals Shape Health and Wellbeing",
    link: "https://koto.org/event/the-science-of-connection-how-our-relationships-with-animals-shape-health-and-wellbeing/",
    description: "Dr. Kevin Morris, from the University of Denver, Graduate School of Social Services, The Institute for Human Animal Connection (IHAC), will visit Telluride Science & Innovation Center on Friday, June 5th, for a presentation called \"The Science of Connection: How our Relationships with Animals Shape Health and Wellbeing.\" Dr. Morris has done numerous studies and has worked with Veterans, prison inmates, underprivileged children and underserved communities to study and improve the bond and relationships between animals and humans. Free and open to the public.",
    pubDate: "2026-06-05T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Science &#038; Innovation Center, TELLURIDE",
    imageUrl: ""
  },
  {
    title: "Town Talk: The Science of Connection",
    link: "https://koto.org/event/town-talk-the-science-of-connection/",
    description: "What does science have to say about the bonds we form with other animals — and why do those bonds matter so deeply for our health? In this talk, Dr. Kevin Morris, American Humane endowed chair and executive director of the University of Denver’s Institute for Human-Animal Connection, explores the emerging research behind human-animal relationships and what it means for individual and community well-being. Drawing on a remarkable career that spans molecular biology, cancer research, and social work, Dr. Morris bridges disciplines to illuminate how our lives with other animals are not just emotionally meaningful, but biologically and socially profound. His work challenges us to think about health as something shared across species — and to consider what a more equitable, science-informed relationship with the animal world could look like for all of us. This event is free and open to the public but RSVP is required at https://form.jotform.com/ 261447761087060",
    pubDate: "2026-06-05T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/0605-science-connect_invite-1.jpg"
  },
  {
    title: "Mars SUCKS! (Telluride Theatre FRINGE Project)",
    link: "https://koto.org/event/mars-sucks-telluride-theatre-fringe-project/2026-06-05/",
    description: "Mars SUCKS! (Telluride Theatre FRINGE Project) June 4 & 5 7 – 8:45pm @ The Michael D. Palm Theatre In an otherworldly performance, author and explorer Craig Childs brings a form of live cinema to the Palm, featuring live music by Beth Quist. This visual, musical, spoken word event mixes science, storytelling, and a crazy desert adventure. We'll be leaving the planet, so buckle up. Seating is limited. Pay-What-You-Can Tickets are available. Learn more on Telluride Theatre's website ( www.telluridetheatre.org )",
    pubDate: "2026-06-06T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Michael D. Palm Theater, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mars-sucks-thundertix.png"
  },
  {
    title: "Telluride Balloon Fest 2026",
    link: "https://koto.org/event/telluride-balloon-fest-2026/2026-06-06/1/",
    description: "Telluride Balloon Festival takes place Saturday, June 6 th and Sunday, June 7 th . Weather permitting & beginning at 6 a.m. on Saturday & Sunday, watch hot air balloons lift off from Telluride Town Park and float effortlessly over the Telluride Valley. Refreshments will be available for sale at the basketball court in Town Park. Don't miss the Balloon Glow on Main Street on Saturday night – it's an amazing sight! The Main Street Glow takes place from 6-10 p.m. on Saturday night.",
    pubDate: "2026-06-06T12:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Main Street, Telluride",
    imageUrl: ""
  },
  {
    title: "Lone Cone Librarys Annual Community Yard Sale & Bbq",
    link: "https://koto.org/event/lone-cone-librarys-annual-community-yard-sale-bbq/",
    description: "Our favorite spring tradition is back – the Lone Cone Library Community Yard Sale! Come browse treasures, support your neighbors, and enjoy a relaxed day on the lawn. Interested in being a vendor? Spaces are available for $10. If you’d like to reserve a spot, just fill out our quick sign‑up form at the front desk or below. Vendors are responsible for set up and clean-up of their items. Any items left behind will be taken care of in a respectful way (Donating, discarding, etc). 🍔 Community BBQ • 12–2pm Swing by for lunch while you shop. $10 per plate, includes a hamburger, a side, a drink and a cookie. Have items you no longer need? You can donate gently‑used items to the library ahead of the sale. We’ll add them to our tables, and all proceeds from donated items go directly toward supporting library programs.",
    pubDate: "2026-06-06T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/2890-scaled.jpg"
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-06-06/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-06-06T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Telluride Balloon Fest 2026",
    link: "https://koto.org/event/telluride-balloon-fest-2026/2026-06-06/2/",
    description: "Telluride Balloon Festival takes place Saturday, June 6 th and Sunday, June 7 th . Weather permitting & beginning at 6 a.m. on Saturday & Sunday, watch hot air balloons lift off from Telluride Town Park and float effortlessly over the Telluride Valley. Refreshments will be available for sale at the basketball court in Town Park. Don't miss the Balloon Glow on Main Street on Saturday night – it's an amazing sight! The Main Street Glow takes place from 6-10 p.m. on Saturday night.",
    pubDate: "2026-06-07T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Main Street, Telluride",
    imageUrl: ""
  },
  {
    title: "Telluride Balloon Fest 2026",
    link: "https://koto.org/event/telluride-balloon-fest-2026/2026-06-07/",
    description: "Telluride Balloon Festival takes place Saturday, June 6 th and Sunday, June 7 th . Weather permitting & beginning at 6 a.m. on Saturday & Sunday, watch hot air balloons lift off from Telluride Town Park and float effortlessly over the Telluride Valley. Refreshments will be available for sale at the basketball court in Town Park. Don't miss the Balloon Glow on Main Street on Saturday night – it's an amazing sight! The Main Street Glow takes place from 6-10 p.m. on Saturday night.",
    pubDate: "2026-06-07T12:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Main Street, Telluride",
    imageUrl: ""
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-06-07/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-06-07T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-06-07/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-06-07T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "The Box: How Anxiety, Perfectionism, and People-Pleasing Kept Me Trapped at WPL",
    link: "https://koto.org/event/the-box-how-anxiety-perfectionism-and-people-pleasing-kept-me-trapped-at-wpl/",
    description: "Join us on Monday, June 8th at 5:30 for a talk by well-being strategist, high-performance coach, bestselling author, and speaker Wendy Robbins ! The Box: How Anxiety, Perfectionism, and People-Pleasing Kept Me Trapped — and the Steps That Set Me Free You built the walls. You have the key. What if the anxiety, perfectionism, and people-pleasing you've spent your life managing aren't your greatest liabilities — but your biggest untapped assets? For over 40 years, Wendy Tamis Robbins hid in plain sight. From the outside, she had everything: Ivy-League grad, Div. 1 Athlete, Big Law attorney. On the inside, she was living with chronic anxiety, OCD, panic disorder, depression, substance abuse, and suicidal ideation — managing it all behind a flawless performance of having it all together. Then came a colon cancer diagnosis. And instead of breaking her, it broke her open. …",
    pubDate: "2026-06-08T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Free Legal Clinic – Clínica Jurídica Gratuita",
    link: "https://koto.org/event/free-legal-clinic-clinica-juridica-gratuita/2026-06-09/",
    description: "A FREE legal clinic for parties who have no attorney. Sign up today because spots are limited. Volunteer attorneys will answer questions, help fill out forms, and explain the process and procedure for legalissues. The volunteer attorneys do not represent you and this clinic is information only. BY APPOINTMENT ONLY. Call 970-728-4519 for more information and to sign up. Una clínica de asesoramiento jurídico GRATUITO para las personas que notienen abogado. Abogados voluntarios responderán a preguntas, ayudarán a llenar formularios y explicarán el proceso y el procedimiento de cuestiones jurídicas. Los abogados voluntarios no te representan y esta clínica es sólo informativa. CON CITA PREVIA. Llame a 970-728-4519 para más información y para registrarse.",
    pubDate: "2026-06-09T22:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-09/",
    description: "Big science. Small town. Every Tuesday from June 9- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7. All Town Talks will be held at the Telluride Conference Center in Mountain Village (with the exception of July 28) . Town Talks start at 6:30 pm (doors open at 6 pm).The schedule is as follows: June 9: Can we change the weather (And do we really want to?) by Derek Posselt NASA Jet Propulsion Laboratory June 16: Good Vibrations – Water, Proteins, and the Molecular Motions that Make Biology Possible by Matthias Heyden, Arizona State Univ. …",
    pubDate: "2026-06-10T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Town Talk: Can we change the weather (and do we really want to?)",
    link: "https://koto.org/event/town-talk-can-we-change-the-weather-and-do-we-really-want-to/",
    description: "This town talk will be presented by Derek Posselt, Principal Scientist, NASA Jet Propulsion Laboratory. If you live on planet Earth, you have had to worry about the weather at some point. Most of us have heard some version of the expression: “If you don’t like the weather, wait 5 minutes, and it will change.” Many of us wish we had the ability to do something about it. This is not a new impulse. Humans have been trying to change the weather for over a century. Posselt will review the ways people have tried to modify the weather, what has worked (and what hasn’t), and whether it is, in fact, a good idea to try in the first place.",
    pubDate: "2026-06-10T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/TT_logo_1048x802_A.png"
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-06-10/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-06-10T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/sewing.jpg"
  },
  {
    title: "Low Energy & Carbon Code Training",
    link: "https://koto.org/event/low-energy-carbon-code-training/",
    description: "Join this free, full-day training with code experts that will teach you how to design and build to the Low Energy and Carbon Code (LECC) and regional amendments. Leave with an understanding of electric, EV and solar-ready requirements, how the LECC compares to previous energy codes, and the 3 compliance pathways. Location: Ridgway Town Hall and Zoom Register on EcoAction Partners website: www.ecoactionpartners.org/energy-codes",
    pubDate: "2026-06-11T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/03/LECC-Training-June-26-Final-Flyer.png"
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-06-11/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-06-11T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-06-11/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-06-11T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-06-12/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-06-12T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Mass Movement",
    link: "https://koto.org/event/mass-movement/",
    description: "Over the past 10 years, Mass Movement has taken place as an annual celebration of dance in our small mountain town. We bring together local dancers and choreographers and also invite visiting choreographers and dancers from the region. Mass Movement is a celebration to find what moves you, whether you are on stage performing or participating as an audience member. This performance has been a platform and catalyst for the growth of the dance community here in Telluride. TDC and Palm Arts are excited to include Palm Arts Dance as an additional partnership this year and provide programming that invites local youth to participate in an intergenerational performance experience.",
    pubDate: "2026-06-13T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Michael D. Palm Theater, Telluride",
    imageUrl: ""
  },
  {
    title: "Mass Movement",
    link: "https://koto.org/event/mass-movement-3/",
    description: "Over the past 10 years, Mass Movement has taken place as an annual celebration of dance in our small mountain town. We bring together local dancers and choreographers and also invite visiting choreographers and dancers from the region. Mass Movement is a celebration to find what moves you, whether you are on stage performing or participating as an audience member. This performance has been a platform and catalyst for the growth of the dance community here in Telluride. TDC and Palm Arts are excited to include Palm Arts Dance as an additional partnership this year and provide programming that invites local youth to participate in an intergenerational performance experience.",
    pubDate: "2026-06-13T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Michael D. Palm Theater, Telluride",
    imageUrl: ""
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-06-13/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-06-13T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-06-14/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-06-14T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-06-14/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-06-14T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Fire and Ice Cream: Community Wildfire Education",
    link: "https://koto.org/event/fire-and-ice-cream-community-wildfire-education/",
    description: "The Town of Mountain Village Police Department, San Miguel County Office of Emergency Management and Telluride Fire Protection District present Fire and Ice Cream, an afternoon of wildfire education in Mountain Village on Sunday, June 14. The event will be held from 3 to 5 p.m. and will feature free ice cream, live music and informational tables from regional partners. Wildfire danger is at the forefront of our regional agencies' and residents’ minds as the area enters a dry summer season, and this event is an opportunity to learn about different aspects of wildfire preparedness, safety and prevention. In addition to the more serious topic of wildfire, the event will also feature free ice cream, live music and a fire truck and police squad car for kids to explore. …",
    pubDate: "2026-06-14T21:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Talking Gourds Presents Stories and Poems",
    link: "https://koto.org/event/talking-gourds-presents-stories-and-poems/2026-06-16/",
    description: "The Telluride Institute’s Talking Gourds Poetry Program is hosting a live Stories & Poems series at the Wilkinson Public Library magazine room on the third Tuesday of every month at 5:30 pm. Following the featured poet's or story teller's reading we will hold a Talking Gourds sharing circle going around the room to let everyone speak. Attendees are encouraged to bring their own work or someone else’s that they like to share. For more information, visit the Telluride Institute Talking Gourds website: tellurideinstitute.org/talking-gourds",
    pubDate: "2026-06-16T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-16/",
    description: "Big science. Small town. Every Tuesday from June 9- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7. All Town Talks will be held at the Telluride Conference Center in Mountain Village (with the exception of July 28) . Town Talks start at 6:30 pm (doors open at 6 pm).The schedule is as follows: June 9: Can we change the weather (And do we really want to?) by Derek Posselt NASA Jet Propulsion Laboratory June 16: Good Vibrations – Water, Proteins, and the Molecular Motions that Make Biology Possible by Matthias Heyden, Arizona State Univ. …",
    pubDate: "2026-06-17T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Town Talk: Good Vibrations",
    link: "https://koto.org/event/town-talk-good-vibrations/",
    description: "This town talk will be presented by Matthias Heyden, Arizona State University. Water is far more than a refreshing drink — its unique molecular properties make life possible. By forming a dynamic network of weak chemical bonds, water acts as both a selective solvent and a kind of molecular lubricant, driving the assembly of cells and keeping the tiny protein machines inside them flexible and in constant motion. Understanding the role water plays in the generation of these vibrations is one of the great frontiers of modern science, with real-world implications for greener industrial chemistry and smarter, safer drug design.",
    pubDate: "2026-06-17T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/TT_logo_1048x802_A-1.png"
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-06-18/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-06-18T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Salon Night at Telluride Arts HQ",
    link: "https://koto.org/event/salon-night-at-telluride-arts-hq/2026-06-18/",
    description: "Salon Nights are inspired by the legendary Parisian salons—those lively gatherings where artists, thinkers, and dreamers came together to meet up, debate, collaborate, and inspire. We’re bringing that spirit into the present and rooting it here in Telluride. These are evenings for conversation and connection, not lectures or formal programming. They are casual, open, and intentionally unstructured, designed to create the atmosphere where ideas can collide, new friendships form, and creativity sparks. Imagine an evening where musicians talk with writers, painters meet photographers, filmmakers share stories with ceramicists—and the unexpected happens!",
    pubDate: "2026-06-18T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.37.19-PM.png"
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-06-19/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-06-19T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-06-20/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-06-20T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-06-21/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-06-21T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-06-21/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-06-21T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-22/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-22T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-23/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-23T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-23/",
    description: "Big science. Small town. Every Tuesday from June 9- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7. All Town Talks will be held at the Telluride Conference Center in Mountain Village (with the exception of July 28) . Town Talks start at 6:30 pm (doors open at 6 pm).The schedule is as follows: June 9: Can we change the weather (And do we really want to?) by Derek Posselt NASA Jet Propulsion Laboratory June 16: Good Vibrations – Water, Proteins, and the Molecular Motions that Make Biology Possible by Matthias Heyden, Arizona State Univ. …",
    pubDate: "2026-06-24T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Town Talk: Small Molecules at the Origins of Life",
    link: "https://koto.org/event/town-talk-small-molecules-at-the-origins-of-life/",
    description: "This town talk will be presented by David Lancy, University of Buffalo. How did the atoms in the universe come together to form life? At the heart of this mystery is the conversion of small molecules into the building blocks of life, driven by metallocofactors—enzyme-like catalysts conserved across all domains of life. The chemical ancestors of these metallocofactors are thought to have been active prior to the traditional bounds of life, such as dynamic molecular architectures at mineral surfaces in early oceans. Understanding these chemistries in unusual abiotic environments enables unique insight into how life may have started and evolved into its present form. In this talk, I will share some of the exciting new developments in the science of extraterrestrial photosynthesis (the search for light-harvesting life on other planets) and other metal-based processes that underpin life on Earth, and possibly the cosmos.",
    pubDate: "2026-06-24T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/TT_logo_1048x802_A-2.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-24/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-24T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://telluridelibrary.libcal.com/event/16536433?hs=a",
    description: "11:00 AM – 12:00 PM · Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-05-31T17:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_03_03_14_50_39.jpg"
  },
  {
    title: "Drop-In Tech Time with Oliver",
    link: "https://telluridelibrary.libcal.com/event/15970376?hs=a",
    description: "1:00 PM – 3:00 PM · Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more! P&aacute;sate por el 2&ordm; piso para Tech Time con Oliver (habla espa&ntilde;ol) todos los domingos de 1 a 3pm. Traiga sus preguntas sobre tecnolog&iacute;a (tel&eacute;fonos, tabletas, computadoras port&aacute;tiles, correo electr&oacute;nico, etc.) o conozca las colecciones especiales que ofrece la biblioteca, como los Kindles, iPads y computadoras port&aacute;tiles que nuestros usuarios pueden rentar, as&iacute; como las aplicaciones de la biblioteca que puede descargar en sus dispositivos para acceder a libros electr&oacute;nicos, audiolibros, pel&iacute;culas, m&uacute;sica, revistas y m&aacute;s.",
    pubDate: "2026-05-31T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "2nd Floor Desk",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1714410099.jpg"
  },
  {
    title: "Tea and Tarot",
    link: "https://telluridelibrary.libcal.com/event/16567827?hs=a",
    description: "2:30 PM – 4:30 PM · Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective Seating is limited; please sign up here in advance.   Tea Ceremony is a perfect elemental art. Silently, we drink tea from ancient trees grown in reverence. In this special space we give the water, fire and tea leaves a chance to communicate with us in their subtle and silent tongue. Old growth trees have been taking in sunlight, rainwater and starlight for hundreds of years. Drinking tea from their leaves in a ceremonial space allows us access parts of our heart which we usually cannot reach.",
    pubDate: "2026-05-31T20:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Telluride Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1746566095.png"
  }
];

const HUMANE_SOCIETY_ANIMALS = [

];

/* The Alibi events — refreshed by syncAlibiEvents() every 6 hours.
 * Source: Event Calendar App (api.eventcalendarapp.com, calendar 14036).
 * Same schema as WILKINSON_EVENTS / SHERIDAN_EVENTS.
 * Link uses #eca-event=<friendlyUrl> fragment so users land on the
 * Alibi's own /calendar page with the event modal pre-opened.
 * Seeded 2026-05-29 with 3 events so the Events tab shows content
 * on Day 1; bot overwrites on first run. */
const ALIBI_EVENTS = [
  {
    title: "Goldpine w/ Corey Hooker",
    link: "https://www.alibitelluride.com/calendar#eca-event=goldpine-w-corey-hooker",
    description: "Bold + gold harmonies straight from Nashville. Winner of the Rocky Mountain Song...",
    pubDate: "2026-06-04",
    time: "8:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/93f72103-743c-4fcb-9eb9-4f1de89a45df/-/crop/1860x930/0,244/-/preview/"
  },
  {
    title: "North Fork Crossing w/ Brendan Forrest",
    link: "https://www.alibitelluride.com/calendar#eca-event=north-folk-crossing",
    description: "North Fork Crossing is a new-age Bluegrass band that resides between the Traditi...",
    pubDate: "2026-06-12",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/f1d0587b-ecc4-4749-9dc7-6d561e93a852/-/crop/2500x1251/0,210/-/preview/"
  },
  {
    title: "Ivanoff (DJ SET)",
    link: "https://www.alibitelluride.com/calendar#eca-event=ivanoff-dj-set",
    description: "IvanOff is a Montana-born tech house producer and DJ. His friends named him Ivan...",
    pubDate: "2026-06-13",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/d2c64473-1f50-467d-a322-7085c50094b9/-/crop/1080x541/0,1088/-/preview/"
  },
  {
    title: "Calder Allen",
    link: "https://www.alibitelluride.com/calendar#eca-event=calder-allen",
    description: "Born and raised in Austin, Texas, Calder Allen is a fifth-generation Texan whose...",
    pubDate: "2026-06-14",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/73cb4f4c-f615-4953-bfcf-3f5e356f3422/-/crop/3333x1665/0,504/-/preview/"
  },
  {
    title: "Palmyra w/ Frail Talk",
    link: "https://www.alibitelluride.com/calendar#eca-event=palmyra-w-frail-talk",
    description: "Established in Virginia’s Shenandoah Valley, Palmyra captures the collective spi...",
    pubDate: "2026-06-16",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/3dfa7885-4aaa-428a-a201-0b14f3c8ad8b/-/crop/4430x2213/0,614/-/preview/"
  },
  {
    title: "NIGHTGRASS - Dallahan",
    link: "https://www.alibitelluride.com/calendar#eca-event=nightgrass-dallahan",
    description: "Forged in Scotland and Ireland's traditional music scene, but drawing on the mus...",
    pubDate: "2026-06-18",
    time: "10:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/5bb37dbf-75d4-4378-9e29-724528deef37/-/crop/1920x959/0,78/-/preview/"
  },
  {
    title: "NIGHTGRASS - Jake Shimabukuro",
    link: "https://www.alibitelluride.com/calendar#eca-event=nightgrass-dallahan-1",
    description: "Jake Shimabukuro is a world-renowned ukulele virtuoso whose groundbreaking artis...",
    pubDate: "2026-06-19",
    time: "10:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/552caaca-9040-49ed-9e0e-39c2176f0681/-/crop/1800x901/0,101/-/preview/"
  },
  {
    title: "NIGHTGRASS - Boy Golden",
    link: "https://www.alibitelluride.com/calendar#eca-event=nightgrass-dallahan-2",
    description: "Who is Boy Golden? On the one hand it is moniker for a mysterious new artist, ...",
    pubDate: "2026-06-19",
    time: "10:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/ff68b41c-5bf1-41dd-ac81-91813095ba41/-/crop/5355x2674/0,2629/-/preview/"
  },
  {
    title: "Bombargo",
    link: "https://www.alibitelluride.com/calendar#eca-event=bombargo",
    description: "Bombargo is a Canadian based international touring band that drops a vibrant spl...",
    pubDate: "2026-06-23",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2812d2a2-8ee2-4e35-9f6c-8aeaa74ad435/-/crop/3300x1320/0,0/-/preview/"
  },
  {
    title: "Organtic",
    link: "https://www.alibitelluride.com/calendar#eca-event=organtic",
    description: "Organtic is 5 piece band playing high energy instrumental funk, reggae, latin, j...",
    pubDate: "2026-06-25",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2eff19a1-011d-4309-a6bc-4be23eff0592/-/crop/2598x1300/0,748/-/preview/"
  },
  {
    title: "The Jauntee w/ San Leandro",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-jauntee",
    description: "The Jauntee is an electrifying and genre-blending musical ensemble that has capt...",
    pubDate: "2026-06-26",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/1885a7f2-416e-4cb2-a4e8-f91c7c656895/-/crop/3663x1830/0,126/-/preview/"
  },
  {
    title: "Wim Tapley & the Cannons",
    link: "https://www.alibitelluride.com/calendar#eca-event=wim-tapley-and-the-cannons",
    description: "Based in Athens, Georgia, Wim Tapley came of age playing shows in Washington D.C...",
    pubDate: "2026-07-01",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/d29aea7b-9b02-4f7c-a2c2-183af167024d/-/crop/4036x2019/0,94/-/preview/"
  },
  {
    title: "The Bright Light Social Hour Night 1",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-bright-light-social-hour-night-1",
    description: "Austin’s The Bright Light Social Hour are widely recognized as the essence of Te...",
    pubDate: "2026-07-02",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/fc726446-27d2-4554-96e7-4e36cff186e5/-/crop/3037x1519/137,0/-/preview/"
  },
  {
    title: "The Bright Light Social Hour Night 2",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-bright-light-social-hour-night-2",
    description: "Austin’s The Bright Light Social Hour are widely recognized as the essence of Te...",
    pubDate: "2026-07-03",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/fc726446-27d2-4554-96e7-4e36cff186e5/-/crop/3037x1519/137,0/-/preview/"
  },
  {
    title: "River Spell",
    link: "https://www.alibitelluride.com/calendar#eca-event=river-spell",
    description: "River Spell is a Colorado-based jam band that delivers heartfelt songwriting and...",
    pubDate: "2026-07-09",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/9725c41c-1954-4f96-8d5a-bbe4507c7d01/-/crop/3998x1998/0,26/-/preview/"
  },
  {
    title: "Liver Down the River w/ Grass Blasters",
    link: "https://www.alibitelluride.com/calendar#eca-event=liver-down-the-river-w-grass-blasters",
    description: "From the heart of Colorado comes a five piece band, Liver Down The River. The gr...",
    pubDate: "2026-07-16",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/c767a7dc-fc92-4eca-b98e-91b8c973fb5c/-/crop/3225x1612/0,0/-/preview/"
  },
  {
    title: "The Saint Cecilia - Night One w/ Harvey Street",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-saint-cecilia-night-one",
    description: "From the outside, The Saint Cecilia is a collection of emotional images, love, a...",
    pubDate: "2026-07-17",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/a5f0d482-c0f2-4049-a875-64a39a0b5888/-/crop/1080x540/0,245/-/preview/"
  },
  {
    title: "The Saint Cecilia - Night Two w/ Harvey Street",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-saint-cecilia-night-one-1",
    description: "From the outside, The Saint Cecilia is a collection of emotional images, love, a...",
    pubDate: "2026-07-18",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/a5f0d482-c0f2-4049-a875-64a39a0b5888/-/crop/1080x540/0,245/-/preview/"
  },
  {
    title: "Young and Dead",
    link: "https://www.alibitelluride.com/calendar#eca-event=young-and-dead",
    description: "Young and Dead is an exciting culmination of musicians in their early 20's from ...",
    pubDate: "2026-07-19",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/6b4daa87-473a-4ea8-ab82-22647ed252f4/-/crop/3000x1501/0,132/-/preview/"
  },
  {
    title: "High Country Hustle",
    link: "https://www.alibitelluride.com/calendar#eca-event=high-country-hustle",
    description: "High Country Hustle is a bluegrass band from Durango, Colorado, formed in 2017 a...",
    pubDate: "2026-07-25",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/656ff21a-f248-4773-bd89-1ce49203874c/-/crop/3674x1471/0,691/-/preview/"
  },
  {
    title: "The Mammoths",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-mammoths",
    description: "Hailing from Austin, TX, fuzz rockers The Mammoths fuse ‘70s inspired psychedeli...",
    pubDate: "2026-07-29",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/e85f9702-e225-45cd-9c77-3b9d939c883b/-/crop/4096x2049/0,547/-/preview/"
  }
];

/* Sheridan Opera House events — refreshed by syncSheridanEvents() every 6 hours.
 * Schema mirrors WILKINSON_EVENTS: { title, link, description, pubDate,
 * endDate?, source, sourceLabel, category, location, imageUrl }.
 * pubDate is the start date (ISO YYYY-MM-DD). endDate is present only on
 * multi-day shows. events.html renders multi-day events as ONE card on
 * the start date with "Jun 1 — Jun 5" subtitle.
 *
 * Seeded 2026-05-29 with the 3 events that were live on Sheridan's
 * /events/ page at the time of wiring (so the Events tab shows
 * something on Day 1 instead of waiting for the next 6-hour refresh).
 * Bot overwrites this on first run. */
const SHERIDAN_EVENTS = [
  {
    title: "32nd Annual Wild West Fest",
    link: "https://sheridanoperahouse.com/events/32nd-annual-wild-west-fest/",
    description: "",
    pubDate: "2026-06-01",
    endDate: "2026-06-05",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2025/03/WWF-Logo-Color-With-Layers.png"
  },
  {
    title: "Wild West Fest Roundup Day",
    link: "https://sheridanoperahouse.com/events/wild-west-fest-roundup-day/",
    description: "",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/Wild-West-Fest-Roundup-Day-Image.png"
  },
  {
    title: "The Fretliners Live in Concert",
    link: "https://sheridanoperahouse.com/events/the-fretliners-live-in-concert-2/",
    description: "",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/unnamed-file.png"
  }
];

const TELLURIDE_FOUNDATION_EVENTS = [
  {
    title: "Creating with AI: The Tools Worth Using & How to Actually Use Them",
    link: "https://telluridefoundation.org/tf-events/",
    description: "If you've been overwhelmed by the surge of AI tools and aren't sure what's actually useful, this workshop cuts through the noise. Hands-on workshop covering text, images and logos, video creation, and website building. No coding, design, or AI experience required. Free; space limited to 50; RSVP required.",
    pubDate: "2026-06-12T13:00:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Innovation Center, Telluride, CO",
    imageUrl: ""
  },
  {
    title: "16th Annual Rundola",
    link: "https://telluridefoundation.org/tf-events/",
    description: "Independence Day uphill foot race from the Gondola base in Telluride to the top of San Sophia Ridge, supporting the Good Neighbor Fund (emergency financial assistance for locals in crisis). Family-friendly; medals + prizes; custom Rundola swag for every participant. Race start 7:30 a.m. Registration opens May 11, 2026.",
    pubDate: "2026-07-04T07:30:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Gondola Plaza, Telluride, CO",
    imageUrl: ""
  }
];

const OURAY_COUNTY_EVENTS = [
  {
    title: "18th Annual Ridgway RiverFest",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3644",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3644",
    pubDate: "2026-06-27T09:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Rollans Park - 257 Sherman St. Ridgway CO 81432",
    imageUrl: ""
  },
  {
    title: "Rollans Park Cleanup",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3643",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3643",
    pubDate: "2026-06-13T09:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Rollans Park - 257 Sherman St. Ridgway CO 81432",
    imageUrl: ""
  },
  {
    title: "CC4CA 2026 Annual Meeting",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3473",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3473",
    pubDate: "2026-06-10T12:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "- Vail CO 81657",
    imageUrl: ""
  },
  {
    title: "Kim Mitchell's Retirement Party",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3648",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3648",
    pubDate: "2026-06-09T16:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Hartwell Park - Ridgway CO 81432",
    imageUrl: ""
  },
  {
    title: "Love Your Trail Day",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3642",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3642",
    pubDate: "2026-06-06T08:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Uncompahgre River Walk - Ouray CO 81427",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "OTG Overnight Trail Maintenance Trip: Bear Creek NRT",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-31T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bear Creek Trail Head south of Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52789326237006/huge/bd0e715520daa45a021ccfc75c4938dfef1aed85.jpg"
  },
  {
    title: "PARK - Ultimate Frisbee",
    link: "https://events.ourayridgwayevents.com/event/park-ultimate-frisbee",
    description: "Come play frisbee! Anyone is welcome.",
    pubDate: "2026-05-31T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/51807883052581/huge/9d7f0c7c4c96318902b1dfef1c3f821c9b3189d1.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-31T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  },
  {
    title: "Ouray Softball Spring Training",
    link: "https://events.ourayridgwayevents.com/event/ouray-softball-spring-training",
    description: "Step onto the field for Ouray Softball Spring Training at Fellin Park. This preseason program is designed to shake off the rust, build skills, and get players ready for summer league action. Open to a range of ages and experience levels, spring training focuses on fundamentals, teamwork, and getting back into the rhythm of the game. Whether you're refining your swing, sharpening fielding skills, or just getting back in the game, it’s a great way to kick off the season. Come ready to play, connect with teammates, and enjoy spring evenings on the diamond in Ouray. Want to join a team, but you aren't already involved? Sign up Here!",
    pubDate: "2026-05-31T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701275725771/huge/58498e59bf3c36b5491225bca2838359fa0701bd.jpg"
  },
  {
    title: "Summer Soulful Sisters Circle- Free Intro Gathering",
    link: "https://www.beetrueyou.com/",
    description: "Accountability Spiritual Community Enless Possibility Bring your Goals, Challenges and Questions. Learn about this unique opportunity for personal growth in community, led by Elizabeth Lava, a highly trained and experienced health, life and spiritual coach. Meet other women who are wanting to grow together in a group and on their own. Handouts and tea will be provided.",
    pubDate: "2026-05-31T23:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52836840684511/huge/6e3df308aea99655628d77e2253a5060af169275.jpg"
  },
  {
    title: "Restoration Work Week:  June 1 - June 5, 2026",
    link: "http://www.ridgwayrailroadmuseum.org/events.html",
    description: "Come and work on the railroad. We can use your computer skills, woodworking skills, manual labor, painting, etc. Lots of fun work for everyone. Lunch provided.",
    pubDate: "2026-06-01T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52594216043415/huge/422bf6ccf915872b17c354d089ec0b4b7eb791d6.jpg"
  },
  {
    title: "Swimming Classes for Kids",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search?activity_select_param=2&viewMode=list",
    description: "The Ouray Hot Springs summer swim lesson program is a fun and supportive way for kids to build confidence in the water. Two-week sessions run through the summer from June 1 through Aug. 6. Details: ✔️ Classes meet Monday–Thursday for 30 minutes each day ✔️ 8 classes per session ✔️ $45 per session (that’s less than $6 per class!) ✔️ Pool entry during class period included Class Options: Parent Tots: (Under 3 with an adult) Level 1: Beginner Skills (Ages 3+) Level 2: Intermediate Skills (All Ages) Level 3: Advanced Skills (All Ages) 📅 You can register at tinyurl.com/ourayactivities! Registration for each session closes the Friday before the session begins. Questions? Contact our Swim Safety Coordinator at 970-325-3009 or JWyatt@CityofOuray.com.",
    pubDate: "2026-06-01T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52806871795839/huge/2b4a1f1e03bf8526d92866007630f4a159e579d5.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-06-01T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://weehawkenarts.org/karate-2/",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-06-01T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-06-02T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  },
  {
    title: "Introduction to Pickleball Beginner's Clinic",
    link: "ridgwaypickleball.org",
    description: "Hosted by the Ridgway Pickball Club, come learn the basics of the game - how to play, rules & scoring, shots and lingo and basic strategy. You will be playing games by the last part of the clinic! You must register at https://ridgwaypickleball.org/event-6659078 as space is limited. All equipment provided. $10 for non-members/free to members. Check website at www.ridgwaypickleball.org for additional dates as this clinic is being offered once a month through September. If you need more information send an email to ridgwaypickleball@gmail.com",
    pubDate: "2026-06-02T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51579997965478/huge/4984f693db71ca30a33ee066346909a44bc0987f.jpg"
  },
  {
    title: "Wright Opera House Guided Tour",
    link: "wrightoperahouse.org",
    description: "We're a nonprofit dedicated to bringing world-class performances to Ouray. All guided tours help support our diverse programming! Step behind the scenes of Ouray’s historic gem! Our guided tours offer a unique glimpse into the history, architecture, and stories that make The Wright Opera House truly one-of-a-kind. Tour Days: Tuesday's at 2:00 PM and Wednesday's at 10:00 AMWeekend Tours: Available by request and scheduled around our regular programming. As an active opera house, weekend tours are not offered through our ticketing platform.Tour Fee: $20 per personMinimum Guests: 4 people per tourAccessibility: Fully ADA accessible with elevatorKid-Friendly: Absolutely! A perfect family outingPhoto-Friendly: Yes! Capture this historic beauty (no video during tours, please)Tour Duration: ~1.5 hoursGroups of 25 or more, or for weekend requests: Please contact us directly for pricing and scheduling. …",
    pubDate: "2026-06-02T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52569865342720/huge/3b2908ddb2fc3d1f0e870007c7b65025c358699f.jpg"
  },
  {
    title: "JACK HAIGHT",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-02T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Sips and Housing Solutions Series: Housing Action Plan Outreach Event #1",
    link: "https://events.ourayridgwayevents.com/event/sips-and-housing-solutions-series-housing-action-plan-outreach-event-1",
    description: "CALLING ALL RIDGWAY WORKFORCE AND AREA RESIDENTS: Please join Points Consulting and Town of Ridgway planning staff at any of our upcoming outreach events for the 2026 HOUSING ACTION PLAN. Your voice matters. Everyone is welcome! Please see this link: tinyurl.com/planridgway for more information and to RSVP. June 2nd: 4:30 - 6:30 PM at Maven Local Eatery | Housing Happy Hour: Drink discounts and free appetizers while supplies last! June 3rd: 8:00-10:00 AM at Town Hall | Coffee and Housing Conversation: Free coffee and treats! June 4th: 8:00-10:00 AM at Decker Community Room | Coffee and Housing Conversation: Free coffee and treats!",
    pubDate: "2026-06-02T22:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Maven Local Eatery",
    imageUrl: "https://localist-images.azureedge.net/photos/53020619553022/huge/2d80ec84c65f92f576716eb922a442ec92e9ff11.jpg"
  },
  {
    title: "Parks and Recreation Committee (PARC)",
    link: "https://cityofouray.com/city_offices/committees___boards/parks_and_recreation_committee.php",
    description: "The Parks and Recreation Committee (PARC) is made up of community members who volunteer their time to support and enhance recreational opportunities in Ouray. PARC organizes safe, family-friendly events that bring the community together. Events include Broomball, Cabin Fever Days, Dodgeball, Softball, and Game Night, among others. The committee works closely with local organizations, businesses, and other City committees to carry out its mission. Community partners include the Ouray Hot Springs Pool & Fitness Center, the Beautification Committee, and the Ouray School District. PARC also plays an important role in developing and implementing master plans for the City’s park system, helping ensure that Ouray’s parks and recreational spaces serve residents and visitors for years to come. Members of the public are welcome to attend these meetings. Meetings: PARC meets monthly on the first Tuesday at 6:00 p.m. …",
    pubDate: "2026-06-03T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Beautification Committee (OBC)",
    link: "https://www.cityofouray.com/city_offices/committees___boards/beautification_committee_(obc).php",
    description: "The Beautification Committee (OBC) works on projects to help beautify the community. The committee oversees the installation of all the flower gardens in the City as well as all the hanging baskets and plantings on Main Street. They have also worked hard over the years to acquire many historic mining pieces and equipment that are displayed throughout the community to recognize Ouray's mining heritage. The committee has also provided direction on signage, light poles, and benches on the public rights of way. The Beautification Committee also plays an important role in developing and implementing master plans for the City’s park system. The committee makes recommendations to the City Council on these many beautification projects as well as the use of dollars from the Beautification Fund. This fund is supported by a portion of the Lodging Occupation Tax and is used exclusively for projects that help beautify the community. …",
    pubDate: "2026-06-03T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Sips and Housing Solutions Series: Housing Action Plan Outreach Event #2",
    link: "https://events.ourayridgwayevents.com/event/sips-and-housing-solutions-series-housing-action-plan-outreach-event-2",
    description: "CALLING ALL RIDGWAY WORKFORCE AND AREA RESIDENTS: Please join Points Consulting and Town of Ridgway planning staff at any of our upcoming outreach events for the 2026 HOUSING ACTION PLAN. Your voice matters. Everyone is welcome! Please see this link: tinyurl.com/planridgway for more information and to RSVP. June 2nd: 4:30 - 6:30 PM at Maven Local Eatery | Housing Happy Hour: Drink discounts and free appetizers while supplies last! June 3rd: 8:00-10:00 AM at Town Hall | Coffee and Housing Conversation: Free coffee and treats! June 4th: 8:00-10:00 AM at Decker Community Room | Coffee and Housing Conversation: Free coffee and treats!",
    pubDate: "2026-06-03T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53020661090978/huge/40ac3b3b0cbad4ea627f2474983b044d7e46f15a.jpg"
  },
  {
    title: "Wright Opera House Guided Tour",
    link: "wrightoperahouse.org",
    description: "We're a nonprofit dedicated to bringing world-class performances to Ouray. All guided tours help support our diverse programming! Step behind the scenes of Ouray’s historic gem! Our guided tours offer a unique glimpse into the history, architecture, and stories that make The Wright Opera House truly one-of-a-kind. Tour Days: Tuesday's at 2:00 PM and Wednesday's at 10:00 AMWeekend Tours: Available by request and scheduled around our regular programming. As an active opera house, weekend tours are not offered through our ticketing platform.Tour Fee: $20 per personMinimum Guests: 4 people per tourAccessibility: Fully ADA accessible with elevatorKid-Friendly: Absolutely! A perfect family outingPhoto-Friendly: Yes! Capture this historic beauty (no video during tours, please)Tour Duration: ~1.5 hoursGroups of 25 or more, or for weekend requests: Please contact us directly for pricing and scheduling. …",
    pubDate: "2026-06-03T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52569865342720/huge/3b2908ddb2fc3d1f0e870007c7b65025c358699f.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://zumba.com/p/zumbafitnesswithTamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com. For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra.",
    pubDate: "2026-06-03T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/327c868a372da99a8aa625676956ed98bc1b6b79.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-06-04T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Summer Bingo - Wednesday Night at Ouray Elks Lodge",
    link: "Www.ourayelks.org",
    description: "OPEN TO THE PUBLIC Come see our beautiful historic lodge while joining us in playing bingo! Doors Open at 5:30 pm, Early Bird Bingo 6:00 and Regular Bingo starts at 7:00pm Concessions available to purchase",
    pubDate: "2026-06-04T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52440353082990/huge/849a6c82c22aa4e9cf19e3fc7490b7c928059ded.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "www.beetrueyou.com",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person.",
    pubDate: "2026-06-04T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Indiana Jones and the Last Crusade: CO-150 Film Festival Screening @ the Wright",
    link: "wrightoperahouse.org",
    description: "Indiana Jones and the Last Crusade: CO-150 Film Festival Screening @ the Wright WHEN? Wednesday, June 3 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 7min RATING: PG-13 ROTTEN TOMATOES SCORE: 84% ABOUT THE FILM Indiana Jones and the Last Crusade (1989) follows legendary archaeologist Indiana Jones as he races across Europe and the Middle East in search of the Holy Grail while trying to rescue his kidnapped father. Blending action, humor, ancient mysteries, and unforgettable set pieces, the film remains one of the most beloved adventure movies ever made. This special Colorado-themed screening also highlights the film’s surprising connections to the American West. …",
    pubDate: "2026-06-04T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52880057442920/huge/28c2e72d06258101855099bea6c7cc466c6c9b07.jpg"
  },
  {
    title: "Sips and Housing Solutions Series: Housing Action Plan June Outreach Event #3",
    link: "https://events.ourayridgwayevents.com/event/sips-and-housing-solutions-series-housing-action-plan-outreach-event-3",
    description: "CALLING ALL RIDGWAY WORKFORCE AND AREA RESIDENTS: Please join Points Consulting and Town of Ridgway planning staff at any of our upcoming outreach events for the 2026 HOUSING ACTION PLAN. Your voice matters. Everyone is welcome! Please see this link: tinyurl.com/planridgway for more information and to RSVP. June 2nd: 4:30 - 6:30 PM at Maven Local Eatery | Housing Happy Hour: Drink discounts and free appetizers while supplies last! June 3rd: 8:00-10:00 AM at Town Hall | Coffee and Housing Conversation: Free coffee and treats! June 4th: 8:00-10:00 AM at Decker Community Room | Coffee and Housing Conversation: Free coffee and treats!",
    pubDate: "2026-06-04T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Archery at Ridgway State Park",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search/detail/336?onlineSiteId=0&from_original_cui=true",
    description: "Youth ages 11–16 will learn the basics of archery safety and technique with instruction and equipment provided by Ridgway State Park staff. Participants will meet at the Pa-Co-Chu-Puk area of Ridgway State Park. Please bring snacks, water, and weather-appropriate clothing for the day. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com",
    pubDate: "2026-06-04T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52993121954018/huge/5965887f386512b0d03cd940f1ba54e68225dffa.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-06-04T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "Storytime with a Firefighter",
    link: "https://ouray.colibraries.org/lib-cal/",
    description: "Join us at Ouray Library from 11:00 a.m. to 11:45 a.m. to listen to some fantastic stories read by a firefighter!",
    pubDate: "2026-06-04T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53011646838988/huge/12e4beac0de2ca67ec7902033e67b225b61e0e9b.jpg"
  },
  {
    title: "Wild West Wonder Wander: Kris Batchelder Art Opening Reception @ the Wright",
    link: "wrightoperahouse.org",
    description: "Wild West Wonder Wander: Kris Batchelder Art Opening Reception @ the Wright WHEN? Thursday, June 4 4:00 pm – 6:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT The Ouray County Arts Association presents Wild West Wonder Wander, an opening reception celebrating the work of Colorado collage artist Kris Batchelder. Kris is a self-created paper collage artist whose work is deeply inspired by the outdoors, wildlife, and the adventurous spirit of the American West. Having spent years exploring wilderness landscapes and outdoor communities around the world, her pieces reflect both a love of nature and a desire to inspire others to experience it for themselves. Recently returning to Colorado after time spent living in Wyoming, Kris has found new inspiration in Ridgway and the greater Ouray area, places she first fell in love with years ago during an early visit to the region. …",
    pubDate: "2026-06-04T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52886404587594/huge/0c51371f7fbb6f19dc67e815e978b33092a15b0c.jpg"
  },
  {
    title: "Music in the Park Beer Tent Fundraiser",
    link: "https://ouray.colibraries.org/lib-cal/",
    description: "Come visit the beer tent at the first Music in the Park of the season to support the Ouray Public Library.",
    pubDate: "2026-06-04T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52958246797759/huge/9d80a9e6b3491bb7d97680483482831a350faf18.jpg"
  },
  {
    title: "Ouray Mountain Air Music Series",
    link: "www.ouraymusicseries.com",
    description: "June 4th: AJ Fullerton and Grant Sabin June 11th: Nik Parr & The Selfless Lovers with You Knew Me When June 18th: The Sweet Lizzy Project with Sara Jean Kelley June 25th: Cruz Contreras & The Black Lillies and Griffin William Sherry Set in the heart of Ouray, the Mountain Air Music Series has become a signature summer tradition, offering a welcoming space for families, friends, and visitors of all ages to gather and unwind. Surrounded by breathtaking mountain views, the series creates an atmosphere that is equal parts relaxing and energizing—where laughter, community spirit, and live music blend seamlessly in one unforgettable outdoor experience. What makes the series truly special is the lineup of talented bands who bring both heart and authenticity to the stage. Each group shares a deep passion for music and a genuine appreciation for performing in small communities like Ouray. …",
    pubDate: "2026-06-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52951532621249/huge/45a880540db97b7292e967c6f16b980532044c29.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-06-05T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM.",
    pubDate: "2026-06-05T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52985439397427/huge/7a32dc0ce7dd0fa5fc146521f201b6616af6feca.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-06-05T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-06-05T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "True Grit Historic Walking Tours",
    link: "https://truegrittours.org/true-grit-tours ",
    description: "Walk in the footsteps of John Wayne and Kim Darby as you explore downtown Ridgway with a trained guide to discover the fascinating behind-the-scenes story of the filming of the original True Grit movie in 1968. Many of the buildings seen in the movie are still in place. John Wayne won his only Oscar for his portrail of Marshal Rooster Cogburn. Offered every Friday at 3 pm in June, July and August. Additional tours are offered at 10am Mondays and 3 pm Wednesdays in July. Meet at the Hartwell Park gazebo 15 minutes before tours begin. FREE. Tours last about an hour. In 2022, this tour was recognized nationally when it was named the reader's choice for best historic town tour by True West magazine. For more information see the website: TrueGritTours.org or on facebook: True Grit Tours. …",
    pubDate: "2026-06-05T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52285883190282/huge/99283c09e34ca5aeabd7006cca2ba5b2b28899c3.jpg"
  },
  {
    title: "BOXCAR",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-05T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Art Opening-Karen Keene Day",
    link: "https://events.ourayridgwayevents.com/event/art-opening-karen-keene-day",
    description: "“Painting Evolution Of Moments With Wild Horses 1999-2026” By Artist Karen Keene Day Join us for a retrospective of Karen's work that spans almost 30 years! Including some exciting process pieces and of course her signature large-format, captivating horse portraits. During Ridgway's First Friday Art Walk. More info decker@ridgwayfuse.org",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709607614558/huge/4004c3e46daab151739f91ab158182bf8b6c5793.jpg"
  },
  {
    title: "First Friday - DJ Dance Party at the Bank Building",
    link: "Ridgwaypilates.com",
    description: "Join Ridgway Pilates and DJ M2 for a free dance party out front of the historic Bank Building on First Friday. We will be showcasing the work of Tammi Brazee inside with free champagne and tours of our beautiful studio. We are offering summer Pilates specials only available in person. Join us for some fun inside and out. Get your groove on!",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52992080608980/huge/8c22fb5996a75e65ccc502afcc04ec5d3f26df04.jpg"
  },
  {
    title: "First Friday - Opening Reception for Todd Mayfield's \"Southwestern Impressionism\"",
    link: "https://sherbino.org/event/southwestern-impressionism-todd-mayfield-ridgway/",
    description: "June 5 | 5:00–7:00 PM | 610 Arts Collective | Free The 610 Arts Collective is pleased to present Southwestern Impressionism, a vibrant June exhibition featuring the work of Ouray artist Todd Mayfield. The exhibit will be on view June 2–26, 2026, at the 610 Arts Collective in Ridgway, Colorado. Drawing inspiration from the color, energy, and spirit of the American Southwest, Mayfield’s paintings are bold, expressive, and deeply rooted in a sense of place. Working primarily in acrylics, his pieces blend vivid palettes, movement, texture, and striking composition to create works that feel both contemporary and timeless. From powerful portraiture to richly layered abstract and figurative forms, Southwestern Impressionism celebrates the beauty, culture, and emotional landscape of the West. Please join us for an Artist Reception on Friday, June 5th, where guests can enjoy refreshments, meet Todd Mayfield, and learn more about the creative process behind the work. …",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52995996265018/huge/36e8fc7211df0a9f45d2eade27a757aa4f475c6a.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "www.ridgwayfuse.org/firstfridays ",
    description: "Discover new work, celebrate openings and connect with artists at the First Friday Art Walk in downtown Ridgway. Each month galleries, studios and retail spaces throw open their doors for receptions, pop-up exhibits and special programming — perfect for art lovers and casual browsers alike. NEW! 🎨🛍️ Shop local. Win local. Celebrate local. 🎶🍷 Starting this June, your First Friday stroll through Ridgway could score you a $100 gift card to your favorite local business. 👀 Here’s how it works: ✨ Shop during First Friday ✨ Text your receipts from participating businesses ✨ Submit up to 3 receipts each month ✨ Two winners drawn monthly! Every receipt = another chance to win while supporting the galleries, shops, restaurants, artists, makers, and small businesses that make Ridgway feel like Ridgway. 📸 Text receipts to: (970) 316-3197 —or drop them off at Town Hall within 48 hours. …",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
  },
  {
    title: "First Friday Art Walk with Walter St.Clair",
    link: "https://www.instagram.com/mountaingirlgallery/",
    description: "Join us at the Mountain Girl Gallery on Friday, June 5 for our 9th Anniversary celebration featuring the sweets sounds of Walter St.Clair on the porch.",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52372912892394/huge/571ed29f2fe398fbe38b9d73af3e8e3e0168844d.jpg"
  },
  {
    title: "The Bug Stops Here! Our Tiny Neighbors",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "“The Bug Stops Here! Our Tiny Neighbors” by area entomolgist Melissa Schriener Come discover the incredible survival adaptations of our multi-legged neighbors and learn why these misunderstood creatures are absolutely vital to the high-desert ecosystem. There's no charge for the program, but you do need a State Park Pass for your vehicle. You can purchase one at the fee station on the way in. This program is part of the Ridgway State Park Summer Program Series.",
    pubDate: "2026-06-05T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53002635976132/huge/477796cac3dfc2e50c58fd02ecea457263bcf44a.jpg"
  },
  {
    title: "First Friday Live Music - Coral Skye",
    link: "https://sherbino.org/event/the-sherbino-presents-coral-skye-first-friday-show-2/",
    description: "Friday, June 5th | 6:00–8:00 pm Sherbino “Living Room” Free Show | Cash Bar | Tips Encouraged Celebrate First Friday with an intimate evening of live music at the Sherbino! Join us in the Sherbino’s cozy “Living Room” near the bar for a special performance by Coral Skye. Coral is a musician out of Montrose, CO who enjoys sharing her pop “acousti-soul” style of music. With a decade of professional performances under her belt, she has entertained all sorts of audiences, from festival crowds to local nursing home residents and students in school programs. Her inspiration comes from the power of music, family members and the support of her caring audiences. She has opened up for names like Survivor at the Olathe Corn Festival and Big Head Todd and the Monsters at The Bridges concert in Montrose. …",
    pubDate: "2026-06-06T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52687172889799/huge/7521571e527cc0dc1f360803533c1c60fa3cbb12.jpg"
  },
  {
    title: "Music Bingo @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/music-bingo-the-wright",
    description: "Music Bingo @ the Wright WHEN? Doors at 6:30 pm • Event at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT It’s bingo. But louder. And somehow emotionally complicated. Battle for glory using songs, questionable music knowledge, accidental dancing, and the sudden realization that one hit from 2007 still lives in your head rent-free. Expect singalongs, dramatic betrayals, nostalgic bangers, deep cuts, and at least one person absolutely convinced they should have won three rounds ago. Whether you’re a human jukebox or someone who confidently calls every song “that one TikTok song,” Music Bingo welcomes all skill levels and levels of chaos. Free to attend In-person event at the historic Wright Opera House Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889.",
    pubDate: "2026-06-06T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52886458731201/huge/e99a2ec1f365e0aaf580bfd7ce874919c7d87cbf.jpg"
  },
  {
    title: "2-Day Trail Stewardship Trip: Middle Cimarron & Porphyry Basin",
    link: "https://ouraytrails.org/volunteers",
    description: "Join Ouray Trail Group Crew Leader Kevin for a two-day trail stewardship trip to Middle Cimarron and Porphyry Basin. Volunteers will perform trail maintenance while enjoying the spectacular scenery of Colorado’s backcountry. This horse-supported trip includes pack support for gear and offers a rewarding opportunity to help maintain local trails alongside fellow volunteers. There's no cost, but please register.",
    pubDate: "2026-06-06T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Middle Cimarron Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52932291535577/huge/c31fed3a3ed404b986c0895b4b749fdccbef4e68.jpg"
  },
  {
    title: "Love Your Trail: Volunteer Trail Work Day",
    link: "https://lp.constantcontactpages.com/ev/reg/fem7328",
    description: "Help care for one of Ouray’s most beloved paths! Join us for a volunteer trail work day on the Uncompahgre Riverwalk Trail to improve the section just north of town. We’ll tackle projects that make a big difference, including replacing fence posts, repairing erosion damage, and trimming back overgrowth to keep the trail safe and beautiful for everyone. DATE: June 6, 2026 | 8 AM – 2 PM WHERE: Meet at the end of Uncompahgre St. off Hwy 550 at the Uncompahgre Riverwalk Trail WHAT TO BRING: Work gloves and a willingness to get your hands a little dirty for a good cause. REGISTER: https://lp.constantcontactpages.com/ev/reg/fem7328 Whether you’re a regular trail user or just want to give back to the community, we’d love to have you out there! This event is made possible by the Colorado West Land Trust and Uncompahgre Watershed Partnership.",
    pubDate: "2026-06-06T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Uncompahgre River Walk Trail at the end of Uncompahgre St. off Hwy 550",
    imageUrl: "https://localist-images.azureedge.net/photos/52516139023881/huge/5b4a0efa0ce13ac6d736cbe1dadddee60e5bbc1b.jpg"
  },
  {
    title: "Community Cleanup",
    link: "https://events.ourayridgwayevents.com/event/community-cleanup",
    description: "Bring your unwanted items to Community Cleanup Day on Saturday, June 6, 9 AM–4 PM. It’s an easy way to dispose of junk without a special trip to the dump. Drop-off locations: 📍 RV parking area: landfill items, e-waste, & recycling 📍 Rotary Park: green waste (You can bring yard debris to Rotary Park starting May 8. Please stack branches neatly with cut ends facing the road (under 12\" diameter only). No soil accepted.) ACCEPTABLE Dried Out Paint (start drying it out now!)Scrap LumberFurnitureBuilding MaterialElectronic WasteRecyclingYard Debris NOT ACCEPTABLE Wet PaintLiquidsTiresStainCleanersBatteriesMattressesNote: RV parking in the RV lot will not be available that day Thanks for helping keep our community clean and beautiful! And big thanks to Bruin Waste and Sav-a-Tree for their partnership in making this happen! ♻️",
    pubDate: "2026-06-06T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "RV Parking Lot at the end of 9th Ave. ",
    imageUrl: "https://localist-images.azureedge.net/photos/52765189321282/huge/e3707690cdec408c4fcf20e6d47b246aa2076c25.jpg"
  },
  {
    title: "Hooked on Fishing: Kids Fishing Clinic!",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "Hooked on Fishing: Kids Fishing Clinic! This free clinic is the perfect way for kids to learn the ropes of fishing in a supportive, hands-on environment. Our friendly team will walk the kids through everything they need to know to get a nibble on the line. There's no charge for the program, but you do need a State Park Pass for your vehicle. You can purchase one at the fee station on the way in. This program is part of the Ridgway State Park Summer Program Series.",
    pubDate: "2026-06-06T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53002673613905/huge/db3bf2a8daa98babb9d6f40f922684124ebe6871.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-06-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "THE EXPANSIVE VIEW: ATMOSPHERIC PERSPECTIVE IN WATERCOLOR WITH ANITA WINTERS",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "The Expansive View - Watercolor Class with Anita Winter June 6, 10am-3pm Cora Annex, Ridgway Tuition: $85 Learn how to give your paintings depth by using atmospheric perspective. In this step by step watercolor class you will learn how to use value, color and texture to create distance in your paintings. Participants are invited to bring their own watercolor supplies (a basic range such as blues, greens, and primary colors; a palette; an assortment of brushes; and at least four 11×14 sheets of watercolor paper). For those looking to expand their materials, Anita Winters recommends the following items from Blick.com: Palette: i.e. …",
    pubDate: "2026-06-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52745264474804/huge/ce202ee1eb38e710a712202d02b030db716d6461.jpg"
  },
  {
    title: "COREY HOOKER & THE MOTEL PROPHETS",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-06T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Sunset Hike with the Park Naturalist",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "Sunset Hike with the Park Naturalist Celebrate National Trails Day with an unforgettable evening stroll as the mountains light up in stunning alpenglow. Join a park naturalist to uncover the cool secrets of the park’s wildlife, geological wonders, and unforgettable trails during the most beautiful hour of the day. There's no charge for the program, but you do need a State Park Pass for your vehicle. You can purchase one at the fee station on the way in. This program is part of the Ridgway State Park Summer Program Series.",
    pubDate: "2026-06-07T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53002695709901/huge/753cc7395c40b32d8b0a4b8a3898370c0a86f720.jpg"
  },
  {
    title: "2-Day Trail Stewardship Trip: Middle Cimarron & Porphyry Basin",
    link: "https://ouraytrails.org/volunteers",
    description: "Join Ouray Trail Group Crew Leader Kevin for a two-day trail stewardship trip to Middle Cimarron and Porphyry Basin. Volunteers will perform trail maintenance while enjoying the spectacular scenery of Colorado’s backcountry. This horse-supported trip includes pack support for gear and offers a rewarding opportunity to help maintain local trails alongside fellow volunteers. There's no cost, but please register.",
    pubDate: "2026-06-07T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Middle Cimarron Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52932291535577/huge/c31fed3a3ed404b986c0895b4b749fdccbef4e68.jpg"
  },
  {
    title: "PARK - Ultimate Frisbee",
    link: "https://events.ourayridgwayevents.com/event/park-ultimate-frisbee",
    description: "Come play frisbee! Anyone is welcome.",
    pubDate: "2026-06-07T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/51807883052581/huge/9d7f0c7c4c96318902b1dfef1c3f821c9b3189d1.jpg"
  },
  {
    title: "Ridgway Bird Walks & Talks: Birds and Bikes",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Join Mike Campbell, a Colorado native, lifelong birder, retired educator, wildlife artist, bird banding educator, and Friends of Ridgway State Park board member, as he shares his experiences and knowledge of our local feathered friends and the environment we share during a guided Bird Walk & Talk in Ouray County. Bikes are required - participants will be riding! the group will meet in downtown Ridgway and bike no more than 5 miles on a mix of paved and dirt roads to reach excellent birding spots in and around town. Small group sizes will allow the experience to be tailored to participants’ knowledge levels and interests. Times, meeting location, and any weather-related updates will be provided via email prior to the event. A waiver needs to be signed before the event. Please do so here. If you're having issues with registration, please email lexi@weehawkenarts.org.",
    pubDate: "2026-06-08T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52393360061357/huge/dcc540c5e8c42ba92a7bee91cc3bccf0ba5c48e9.jpg"
  },
  {
    title: "On Display: Painting Evolution Of Moments With Wild Horses 1999-2026- Artist Karen Keene Day",
    link: "https://events.ourayridgwayevents.com/event/painting-evolution-of-moments-with-wild-horses-1999-2026-artist-karen-keene-day",
    description: "Enjoy nearly 3 decades or work from local painter, Karen Keene Day. Info decker@ridgwayfuse.org",
    pubDate: "2026-06-08T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709642938173/huge/e2c21f0b2c1fb10c06c021e9b9d55a9ea535bccc.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-06-08T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Dinosaur Tracks Hike",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search/detail/337?onlineSiteId=0&from_original_cui=true",
    description: "Youth participants will hike the Silvershield Trail to visit Ouray’s famous dinosaur tracks. This moderately difficult hike takes approximately 2 hours up and 2 hours back down. Participants should come prepared with sturdy hiking footwear, a rain jacket, sunscreen, a warm hat, at least 1 quart of water, and a packed lunch. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com",
    pubDate: "2026-06-09T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Silvershield Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52993254837385/huge/4f776574a23d4fa60707a34a824293cc3de18e38.jpg"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee @ The Sherbino",
    link: "https://sherbino.org/events/",
    description: "MONTHLY WELCOME HOME ALLIANCE VETERAN’S COFFEE @ THE SHERBINO Every Branch. Every Era. Every Ability. Offering coffee, donuts and camaraderie. Mike Trickey and April Heard will be there bringing information to you on topics such as: Navigating the VA, Housing, Jobs, Volunteer Opportunities, community resources, VA benefits, recreation and mental health. For more information or to offer support (products or monetary), call 970-765-2210 or visit https://www.whafv.org/ Occurs the 2nd Tuesday of Every Month || 10 am - Noon || Free to attend || Vets Only, Please",
    pubDate: "2026-06-09T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52236172073282/huge/134613035140f6c008febe657f2e7e23acc365e9.jpg"
  },
  {
    title: "On Display: Painting Evolution Of Moments With Wild Horses 1999-2026- Artist Karen Keene Day",
    link: "https://events.ourayridgwayevents.com/event/painting-evolution-of-moments-with-wild-horses-1999-2026-artist-karen-keene-day",
    description: "Enjoy nearly 3 decades or work from local painter, Karen Keene Day. Info decker@ridgwayfuse.org",
    pubDate: "2026-06-09T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709642938173/huge/e2c21f0b2c1fb10c06c021e9b9d55a9ea535bccc.jpg"
  },
  {
    title: "Wright Opera House Guided Tour",
    link: "wrightoperahouse.org",
    description: "We're a nonprofit dedicated to bringing world-class performances to Ouray. All guided tours help support our diverse programming! Step behind the scenes of Ouray’s historic gem! Our guided tours offer a unique glimpse into the history, architecture, and stories that make The Wright Opera House truly one-of-a-kind. Tour Days: Tuesday's at 2:00 PM and Wednesday's at 10:00 AMWeekend Tours: Available by request and scheduled around our regular programming. As an active opera house, weekend tours are not offered through our ticketing platform.Tour Fee: $20 per personMinimum Guests: 4 people per tourAccessibility: Fully ADA accessible with elevatorKid-Friendly: Absolutely! A perfect family outingPhoto-Friendly: Yes! Capture this historic beauty (no video during tours, please)Tour Duration: ~1.5 hoursGroups of 25 or more, or for weekend requests: Please contact us directly for pricing and scheduling. …",
    pubDate: "2026-06-09T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52569865342720/huge/3b2908ddb2fc3d1f0e870007c7b65025c358699f.jpg"
  },
  {
    title: "DAVE MENSCH",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-09T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Nature Journaling in the Field with Mary Menz and Sandy Dick",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Nature Journaling in the Field June 10 Wednesday 8:00am to Noon $49-$69 Registration: www.weehawkenarts.org Join Colorado Native Plant Masters Mary Menz and Sandra Dick as they explore Ouray County wildflowers and natural settings. In this session, you’ll sit in quiet spots and draw what you see to help you hone ID skills. We’ll talk about interesting characteristics of plants and their historical uses. Participants will receive small sketchbooks and will work in pencil, but are welcome to bring their own supplies such as colored pencils, watercolors, etc. Registration includes a copy of their book Common Wildflowers of the San Juan Mountains ($49) or Wildflowers of Colorado’s Western Slope ($69). All groups are limited to 12 participants. Participants will meet and carpooling is recommended (we help facilitate this effort at the meet up location)—specific directions and more information will be provided via email prior to the event. …",
    pubDate: "2026-06-10T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52648536856781/huge/9a9c3474332959978afbd4a529a9a2418e1b0636.jpg"
  },
  {
    title: "Wright Opera House Guided Tour",
    link: "wrightoperahouse.org",
    description: "We're a nonprofit dedicated to bringing world-class performances to Ouray. All guided tours help support our diverse programming! Step behind the scenes of Ouray’s historic gem! Our guided tours offer a unique glimpse into the history, architecture, and stories that make The Wright Opera House truly one-of-a-kind. Tour Days: Tuesday's at 2:00 PM and Wednesday's at 10:00 AMWeekend Tours: Available by request and scheduled around our regular programming. As an active opera house, weekend tours are not offered through our ticketing platform.Tour Fee: $20 per personMinimum Guests: 4 people per tourAccessibility: Fully ADA accessible with elevatorKid-Friendly: Absolutely! A perfect family outingPhoto-Friendly: Yes! Capture this historic beauty (no video during tours, please)Tour Duration: ~1.5 hoursGroups of 25 or more, or for weekend requests: Please contact us directly for pricing and scheduling. …",
    pubDate: "2026-06-10T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52569865342720/huge/3b2908ddb2fc3d1f0e870007c7b65025c358699f.jpg"
  },
  {
    title: "Splash Into STEAM",
    link: "https://events.ourayridgwayevents.com/event/splash-into-steam",
    description: "Splash Into STEAM is a fun, hands‑on Girl Scout Buddies Drop‑In Event where girls and their friends explore science and engineering through water play! Build a floating boat, experiment with cleaning dirty water, and design a water run to see how water moves. Jump in anytime, try one station or all three, and make a splash while learning together! 💦🔬👧 This event is open to all girls and their friends. You don't have to be a Girl Scout.",
    pubDate: "2026-06-10T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52744270535881/huge/2c61b5d27b015d45fb42faf91991d5314cc4e592.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://zumba.com/p/zumbafitnesswithTamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com. For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra.",
    pubDate: "2026-06-10T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/327c868a372da99a8aa625676956ed98bc1b6b79.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-06-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Summer Bingo - Wednesday Night at Ouray Elks Lodge",
    link: "Www.ourayelks.org",
    description: "OPEN TO THE PUBLIC Come see our beautiful historic lodge while joining us in playing bingo! Doors Open at 5:30 pm, Early Bird Bingo 6:00 and Regular Bingo starts at 7:00pm Concessions available to purchase",
    pubDate: "2026-06-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52440353082990/huge/849a6c82c22aa4e9cf19e3fc7490b7c928059ded.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "www.beetrueyou.com",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person.",
    pubDate: "2026-06-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "It Was Just An Accident: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/it-was-just-an-accident-movie-night-the-wright",
    description: "It Was Just An Accident: Movie Night @ the Wright WHEN? Wednesday, June 10 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 1h 52min RATING: PG-13 ROTTEN TOMATOES SCORE: 98%! ABOUT THE FILM It Was Just An Accident (2025) follows a seemingly ordinary event that spirals into a chain reaction of misunderstandings, consequences, and unexpected revelations. As tensions rise and lives intersect, the film explores how a single moment can reshape relationships and alter the course of multiple lives. Blending dark humor, emotional tension, and sharp social observation, the story gradually uncovers the complicated truths hidden beneath everyday appearances. A suspenseful and thought-provoking drama about chance, accountability, and the ripple effects of human decisions. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. …",
    pubDate: "2026-06-11T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52886546383646/huge/a127886b72fb3a600be995c26a811e7c6fba5849.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests.",
    pubDate: "2026-06-11T14:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "Cedar Hill Cemetery Tour",
    link: "www.ouraycountyhistoricalsociety.org",
    description: "Tour of Cedar Hill Cemetery, Ouray led by Alice Leeper. $20.00 Per Person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay",
    pubDate: "2026-06-11T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Cedar Hill Cemetery ",
    imageUrl: "https://localist-images.azureedge.net/photos/52278066168507/huge/2100ef3a6df421f4cc351fc153ebe5f196fc7df6.jpg"
  },
  {
    title: "Low Energy Carbon Code Training",
    link: "https://www.ecoactionpartners.org/energy-codes",
    description: "EcoAction Partners is facilitating a regional cohort across San Miguel, Ouray and San Juan counties to support collaborative discussion and implementation support for the state's building energy code requirements. Regional building code consistency, with varying amendments as appropriate for each jurisdiction, has proven beneficial to the regional building community and for enforcement over the years. This work is funded by the Energy Code Adoption and Enforcement Grant Program, from the Colorado Energy Office, and supported by Lotus Engineering & Sustainability and NORESCO. Low Energy & Carbon Code (LECC) Training: March 26, 2026 (9am-5pm) Who: Whole building contractor community What: LECC & Regional Amendments Training Where: Ridgway Town Hall & Zoom (Zoom Link to be provided to registrants) Why: Prepare for adoption by regional governments and get your questions answered Registration REQUIRED FOR LUNCH",
    pubDate: "2026-06-11T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52444204372144/huge/b898ad2e5fd77ff7c0562156e047d7da5afebb95.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-06-11T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "On Display: Painting Evolution Of Moments With Wild Horses 1999-2026- Artist Karen Keene Day",
    link: "https://events.ourayridgwayevents.com/event/painting-evolution-of-moments-with-wild-horses-1999-2026-artist-karen-keene-day",
    description: "Enjoy nearly 3 decades or work from local painter, Karen Keene Day. Info decker@ridgwayfuse.org",
    pubDate: "2026-06-11T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709642938173/huge/e2c21f0b2c1fb10c06c021e9b9d55a9ea535bccc.jpg"
  },
  {
    title: "Ouray Mountain Air Music Series",
    link: "www.ouraymusicseries.com",
    description: "June 4th: AJ Fullerton and Grant Sabin June 11th: Nik Parr & The Selfless Lovers with You Knew Me When June 18th: The Sweet Lizzy Project with Sara Jean Kelley June 25th: Cruz Contreras & The Black Lillies and Griffin William Sherry Set in the heart of Ouray, the Mountain Air Music Series has become a signature summer tradition, offering a welcoming space for families, friends, and visitors of all ages to gather and unwind. Surrounded by breathtaking mountain views, the series creates an atmosphere that is equal parts relaxing and energizing—where laughter, community spirit, and live music blend seamlessly in one unforgettable outdoor experience. What makes the series truly special is the lineup of talented bands who bring both heart and authenticity to the stage. Each group shares a deep passion for music and a genuine appreciation for performing in small communities like Ouray. …",
    pubDate: "2026-06-12T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52951532621249/huge/45a880540db97b7292e967c6f16b980532044c29.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-06-12T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM.",
    pubDate: "2026-06-12T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52985439397427/huge/7a32dc0ce7dd0fa5fc146521f201b6616af6feca.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-06-12T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-06-12T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "True Grit Historic Walking Tours",
    link: "https://truegrittours.org/true-grit-tours ",
    description: "Walk in the footsteps of John Wayne and Kim Darby as you explore downtown Ridgway with a trained guide to discover the fascinating behind-the-scenes story of the filming of the original True Grit movie in 1968. Many of the buildings seen in the movie are still in place. John Wayne won his only Oscar for his portrail of Marshal Rooster Cogburn. Offered every Friday at 3 pm in June, July and August. Additional tours are offered at 10am Mondays and 3 pm Wednesdays in July. Meet at the Hartwell Park gazebo 15 minutes before tours begin. FREE. Tours last about an hour. In 2022, this tour was recognized nationally when it was named the reader's choice for best historic town tour by True West magazine. For more information see the website: TrueGritTours.org or on facebook: True Grit Tours. …",
    pubDate: "2026-06-12T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52285883190282/huge/99283c09e34ca5aeabd7006cca2ba5b2b28899c3.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-12T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "ROCC'n By The River Summer Dinner",
    link: "https://roccsummerdinner2026.rsvpify.com/?group=e01b5e91-6d69-432f-8dc1-101f63d09c89&view=Wall",
    description: "Guest speaker is Heather Hansman author of Fierce Country: The Untold Story of Three Women Who Ignited America’s Love for the Wild. She brings to life the untold stories of these women who shaped the wild places we love--and shares fresh inspiration to protecting them. We hope you can attend! Catering by Stefan Davenport Music by local musicians Doug & Heather TICKETS ARE LIMITED AND HAVE SOLD OUT IN THE PAST Click the website link to buy tickets",
    pubDate: "2026-06-12T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Pa-Co-Chu-Puk ",
    imageUrl: "https://localist-images.azureedge.net/photos/52773337940831/huge/16b7fad506150558489741f3cda5604bf1be060a.jpg"
  },
  {
    title: "ORGANTIC - Live @ Floating Lotus Brewery",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us Friday, June 12 for a night of global grooves and high-energy instrumental jams on the outdoor stage at Floating Lotus Brewery! Featuring local favorites Organtic — a 5-piece instrumental group blending reggae, funk, afrobeat, Latin jazz, and jamband influences into a deep, danceable sonic journey. Their live shows are packed with rhythm, improvisation, and contagious energy that keeps the crowd moving all night long. Come support local music, grab a beer, and kick off your summer weekend under the Ridgway skies. 💵 $10 Cover 👨‍👩‍👧 All Ages Welcome",
    pubDate: "2026-06-13T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52878975083462/huge/5d86abd02cae768f6aabc574f4fcfd17ed09e474.jpg"
  },
  {
    title: "Trivia Night @ the Wright",
    link: "https://thewrightoperahouse.org/",
    description: "Trivia Night @ the Wright WHEN? Friday, June 12 Doors at 6:30 pm • Event at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Come test the true limits of the human mind at Trivia Night @ the Wright, where obscure facts become temporary personality traits. Questions may include history, movies, science, music, local lore, accidental expertise, and things you absolutely learned once in 8th grade and never expected to need again. Bring a team, bring a friend, or arrive alone like a mysterious wandering scholar of useless information. Competitive spirits, wild guesses, and dramatic confidence are all encouraged. No studying required. In fact, studying may make things worse. Free to attend In-person event at the historic Wright Opera House Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889.",
    pubDate: "2026-06-13T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52886675356003/huge/9fd471ff714c45bd18ae9a67be7d9b0872cd5a56.jpg"
  },
  {
    title: "High Step Society - Live",
    link: "https://sherbino.org/event/high-step-society/",
    description: "Doors at 7 pm || Show at 7:30 pm || Dancehall-style show with limited seating || Tickets: $25 advance / $30 day of show || A limited number of reserved tables are available. GA Tickets can be found under the venue diagram. Reserved tables are found by hovering over the diagram. GA seats are available in the bar area. Get ready for a high-energy night of vintage glamour and modern beats when High Step Society brings their electrifying electro-swing sound to the Sherbino. Part big band, part dance-floor DJ set, High Step Society delivers a high-flying, beat-dropping performance that blends the swagger of the Jazz Age with bass-heavy electronic grooves. Sultry, effervescent, low-down, dirty, and irresistibly danceable, this seven-piece powerhouse throws jazz straight back onto the dance floor where it belongs. Based between Portland, OR and New Orleans, LA, High Step Society has been a favorite on the U.S. …",
    pubDate: "2026-06-13T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52993729729431/huge/e1d998becabcdd783bde62126a99bfdfad6d9a7d.jpg"
  },
  {
    title: "2-Day Trail Stewardship Trip: Wright's Lake to Blue Lakes Pass",
    link: "https://ouraytrails.org/volunteers",
    description: "Join Ouray Trail Group Crew Leader Richfor a two-day stewardship trip from Wright's Lake to Blue Lakes Pass. Volunteers will perform trail maintenance while enjoying the spectacular scenery of Colorado’s backcountry. This is a rewarding opportunity to help maintain local trails alongside fellow volunteers. There's no cost, but please register.",
    pubDate: "2026-06-13T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Wright's Lake Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52932411507464/huge/45ad0cb327371f83a5fd76657c690337ddf55ebc.jpg"
  },
  {
    title: "San Juan Trail Triathlon",
    link: "https://sanjuantrailtri.com/",
    description: "DASH * PADDLE * PEDAL 3.5 mile run 1.5 mile paddle 8 mile mountain Divisions for individual racers, teams, and teens ages 12+ Money raised from this event directly benefits Montrose Recreation Foundation and Voyager Youth Program.",
    pubDate: "2026-06-13T14:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52922710682794/huge/7d09aec1e654bda398931d637d11654a01f64323.jpg"
  },
  {
    title: "Shifting Consciousness with Food and Your SELF",
    link: "https://www.beetrueyou.com/",
    description: "A transformative, one-day retreat to reimagine your relationship with food, self-care, and belonging. Christine will guide you through powerful, paradigm-shifting topics—including the paradox of permission and what it means to truly belong as you are, breaking free from quick-fix self-care, and redefining the difference between healing and “fixing.” Explore authentic nutrition through the practice of attunement. Paired with Elisabeth’s spiritually grounded facilitation, the experience weaves together mindfulness, movement, meditation, and meaningful connection. Through guided reflection and supportive group sharing, you’ll gain both insight and practical tools to cultivate a more compassionate, sustainable relationship with your body and yourself.",
    pubDate: "2026-06-13T14:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52836723968745/huge/c5e17d886587b3f2d245b1852b2398f4bc7df65e.jpg"
  },
  {
    title: "Rollans Park Cleanup",
    link: "https://www.uncompahgrewatershed.org/events/",
    description: "Come help clean up Rollans Park in Ridgway and be treated with a breakfast burrito and conversation with UWP staff and board members. UWP has adopted this important park that protects and provides access to the Uncompahgre River. We make an annual effort through the Adopt-a-Park Program to pick up litter and branches and do other maintenance around the park. This event is supported by the Town of Ridgway. Please email tanya@uncompahgrewatershed.org to sign up!",
    pubDate: "2026-06-13T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53001642609887/huge/fb9f391ed3891621f3b5be49abe7ace84d5ddd9c.jpg"
  },
  {
    title: "Dallas Park Cemetery Tour",
    link: "www.ouraycountyhistoricalsociety.org",
    description: "Tour of Dallas Park Cemetery Tour, led by Coleen McElroy. $20.00 Per Person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay",
    pubDate: "2026-06-13T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Dallas Park Cemetery ",
    imageUrl: "https://localist-images.azureedge.net/photos/52462667793124/huge/857907efd93056a1ba298d906bd6d5231a5f9d13.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-06-13T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "Spring Colors Gourd Bowls with Janice Reich",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Spring Colors Gourd Bowls with Janice Reich Alcohol Dye Technique with Seagrass Rim Saturday, June 13, 2026 | 10 am – 2 pm (includes a lunch break) Cora Annex, Ridgway (145 N. Cora St., Ridgway, CO 81432) Tuition: $75 Registration: www.weehawkenarts.org In this class, students will learn the basics of weaving seagrass around a gourd rim and working with TransTint alcohol dyes. When mixed, blended, or layered, these dyes create a wide range of vibrant colors and beautiful effects. Techniques may include dabbing, dripping, sponging, painting, and blending with alcohol dyes to achieve unique surface designs. Be bold—go with the color! All materials will be supplied by the instructor. If you have favorite beads or small embellishments, feel free to bring them along to personalize your bowl. About the Instructor: Shape, color, and texture lie at the heart of Janice’s artistic exploration. …",
    pubDate: "2026-06-13T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52648597926478/huge/cb32e72fdc1ada493249dea5fe1899d8db619801.jpg"
  },
  {
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://www.zeffy.com/en-US/ticketing/emma-kalf-bob-ross-painting-classes",
    description: "Happy Little Trees: Classes @ the Wright WHEN? Classes at 10:30 am WHERE? Wright Community Room Wright Opera House 472 Main St. Ouray, Colorado TICKETS: $55 Per Class (All supplies are included + coffee!) ABOUT THE CLASS Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. …",
    pubDate: "2026-06-13T16:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52373044220947/huge/1d3e4ebb5835fbe0ed89bf2b3588d8e41db8f444.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Closed For Memorial Day",
    link: "https://www.norwoodtown.com/2026-05-25-closed-for-memorial-day",
    description: "",
    pubDate: "2026-05-25T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Meeting",
    link: "https://www.norwoodtown.com/2026-06-09-nwc-meeting",
    description: "",
    pubDate: "2026-06-09T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-06-10-board-of-trustees-meeting",
    description: "",
    pubDate: "2026-06-10T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Sanitation District Meeting Meeting",
    link: "https://www.norwoodtown.com/2026-06-11-norwood-sanitation-district-meeting-meeting",
    description: "",
    pubDate: "2026-06-11T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Music On The Mesa Wolf Jett",
    link: "https://www.norwoodtown.com/2026-06-13-music-on-the-mesa-wolf-jett",
    description: "",
    pubDate: "2026-06-13T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-06-15-planning-and-zoning-commission-meeting",
    description: "",
    pubDate: "2026-06-15T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Music On The Mesa The Burroughs",
    link: "https://www.norwoodtown.com/2026-08-08-music-on-the-mesa-the-burroughs",
    description: "",
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [];

const TELLURIDE_COM_EVENTS = [
  {
    title: "Party in the Park",
    link: "https://www.telluride.com/event/party-in-the-park/",
    description: "Head to Town Park for Party in the Park, benefiting Telluride Schools and the Telluride Education Foundation on May …",
    pubDate: "2026-05-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58124/download_10.800x533.webp"
  },
  {
    title: "Bike Rodeo",
    link: "https://www.telluride.com/event/bike-rodeo/",
    description: "Head to the Telluride High School back parking lot on Sunday, May 31 from 12 p.m. to 1:30 p.m. for an afternoon focused …",
    pubDate: "2026-05-31",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58118/download_15.800x533.webp"
  },
  {
    title: "Wild West Fest",
    link: "https://www.telluride.com/event/wild-west-fest/",
    description: "The Sheridan Arts Foundation invites you to be a part of one of the most meaningful and exciting festivals of the …",
    pubDate: "2026-06-01",
    endDate: "2026-06-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44391/381695.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-03",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Sweet Sounds",
    link: "https://www.telluride.com/event/sweet-sounds/",
    description: "Head to the Wilkinson Public Library on the first Wednesday of the month this summer for live music and sweet treats! …",
    pubDate: "2026-06-03",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62443/sweet_sounds_5.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Art Walk",
    link: "https://www.telluride.com/event/telluride-art-walk/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36708/download_2.800x533.webp"
  },
  {
    title: "Goldpine",
    link: "https://www.telluride.com/event/goldpine/",
    description: "Bold + gold harmonies straight from Nashville. Winner of the Rocky Mountain Songwriter Contest and seen on NPR's …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62300/download_12.800x533.webp"
  },
  {
    title: "Rooftop Pop-Up Local Artist Market",
    link: "https://www.telluride.com/event/pop-up-local-artist-market/",
    description: "Shop an incredible rotating selection of Ah Haa’s staff, instructors and open studio memeber’s artwork in the …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58400/screenshot_2026-01-21_at_4_30_00_pm.800x533.webp"
  },
  {
    title: "A Telluride Theatre FRINGE Project: Mars SUCKS!",
    link: "https://www.telluride.com/event/a-telluride-theatre-fringe-project-mars-sucks/",
    description: "In an otherworldly performance, author and explorer Craig Childs brings a form of live cinema to the Palm. This visual, …",
    pubDate: "2026-06-04",
    endDate: "2026-06-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62293/mars_sucks_thundertix.800x533.webp"
  },
  {
    title: "\"Passages in Time\" Exhibition Opening",
    link: "https://www.telluride.com/event/passages-in-time-featuring-nancy-b-frank-and-micheline-klagsbrun/",
    description: "\"Passages in Time\" is an exhibition featuring two longtime locals: Nancy B Frank and Micheline Klagsbrun. Each artist …",
    pubDate: "2026-06-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62578/rock_4.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Telluride Balloon Festival",
    link: "https://www.telluride.com/event/telluride-balloon-festival/",
    description: "Get high at the Telluride Balloon Festival! Weather permitting, watch hot air balloons lift off from Telluride Town …",
    pubDate: "2026-06-05",
    endDate: "2026-06-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28889/1440710568aa5692e4.800x533.webp"
  },
  {
    title: "Wild West Fest Roundup",
    link: "https://www.telluride.com/event/wild-west-fest-roundup/",
    description: "The public is invited to participate in and celebrate Wild West Fest with the Sheridan Arts Foundation and youth …",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47520/wwf_roundup_ttb.800x533.webp"
  },
  {
    title: "The Chemistry of Connection: How Our Relationships With Animals Shape Health and Well-Being",
    link: "https://www.telluride.com/event/the-chemistry-of-connection-how-our-relationships-with-animals-shape-health-and-well-being/",
    description: "What does science have to say about the bonds we form with other animals — and why do those bonds matter so deeply …",
    pubDate: "2026-06-05",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62436/tot_animal_talk.800x533.webp"
  },
  {
    title: "Huck Finn & Becky Thatcher Day",
    link: "https://www.telluride.com/event/huck-finn-becky-thatcher-day/",
    description: "Join the Telluride Elks for a Telluride tradition: Huck Finn and Becky Thatcher Day! On Saturday, June 6, kids 10 and …",
    pubDate: "2026-06-06",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47903/img_7365-2100x1400-f9628f77-a650-47ed-a69a-f19ab0465d96.800x533.webp"
  },
  {
    title: "Telluride Brewing Co. Block Party",
    link: "https://www.telluride.com/event/telluride-brewing-co-block-party/",
    description: "The Telluride Brewing Company is hosting its annual block party. Join them Saturday, June 6  from 3 - 7 p.m. for a …",
    pubDate: "2026-06-06",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49618/screenshot_2025-05-21_at_3_45_34_pm.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Augment Summer Music Series",
    link: "https://www.telluride.com/event/augment-summer-music-series/",
    description: "Telluride's local non-profit organization Augment Music Project is hosting monthly concerts in Elks Park this summer. …",
    pubDate: "2026-06-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53672/download_1.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-06-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Creative Exchange",
    link: "https://www.telluride.com/event/creative-exchange/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call …",
    pubDate: "2026-06-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60815/tot_cxe_brittany_miller.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-06-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Telluride Food + Vine",
    link: "https://www.telluride.com/event/telluride-food-vine/",
    description: "Telluride Food + Vine is the area's premier food and wine weekend, providing the ultimate epicurean experience in …",
    pubDate: "2026-06-12",
    endDate: "2026-06-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/46462/dsc09460-2000x1333-68a9e203-a80e-4c8c-9152-5d77c08fcc52.800x533.webp"
  },
  {
    title: "Mass Movement",
    link: "https://www.telluride.com/event/mass-movement/",
    description: "Over the past 10 years, Mass Movement has taken place as an annual celebration of dance in our small mountain town. …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55257/download_14.800x533.webp"
  },
  {
    title: "North Fork Crossing",
    link: "https://www.telluride.com/event/north-fork-crossing/",
    description: "North Fork Crossing is a new-age Bluegrass band that resides between the Traditional music world with their timeless …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62160/screenshot_2026-04-09_at_1_55_43_pm.800x533.webp"
  },
  {
    title: "Creating With AI: The Tools Worth Using & How to Actually Use Them",
    link: "https://www.telluride.com/event/creating-with-ai-the-tools-worth-using-how-to-actually-use-them/",
    description: "If you’ve been overwhelmed by the surge of AI tools and aren’t sure what’s actually useful, this workshop cuts …",
    pubDate: "2026-06-12",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62389/creating_with_ai.800x533.webp"
  },
  {
    title: "The Fretliners",
    link: "https://www.telluride.com/event/the-fretliners/",
    description: "The Fretliners are a band defined by their songwriting—stories carried by powerful harmonies, dynamic arrangements, …",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61781/download_13.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Crawfish Boil Benefiting One to One Mentoring",
    link: "https://www.telluride.com/event/oldmixon-crawfish-boil/",
    description: "Join us for a community Crawfish Boil hosted by Oldmixon Construction and Telluride Brewing Company benefiting One to …",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58115/download_11.800x533.webp"
  },
  {
    title: "Music on the Mesa",
    link: "https://www.telluride.com/event/music-on-the-mesa/",
    description: "Music on the Mesa is a FREE outdoor concert series presented two Saturdays a summer by Norwood Park & Rec District, …",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62177/screenshot_2026-04-09_at_2_09_57_pm.800x533.webp"
  },
  {
    title: "IvanOff",
    link: "https://www.telluride.com/event/ivanoff/",
    description: "IvanOff is a Montana-born tech house producer and DJ. His friends named him IvanOff to remind him to cool off. …",
    pubDate: "2026-06-13",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62303/screenshot_2026-04-29_at_2_54_10_pm.800x533.webp"
  },
  {
    title: "Calder Allen",
    link: "https://www.telluride.com/event/calder-allen/",
    description: "Born and raised in Austin, Texas, Calder Allen is a fifth-generation Texan whose roots run deep in the state. His …",
    pubDate: "2026-06-14",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62163/screenshot_2026-04-09_at_1_57_27_pm.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Palmyra",
    link: "https://www.telluride.com/event/palmyra/",
    description: "Established in Virginia’s Shenandoah Valley, Palmyra captures the collective spirit of three Virginia natives: Teddy …",
    pubDate: "2026-06-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62166/screenshot_2026-04-09_at_1_59_02_pm.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-06-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "FirstGrass Concert",
    link: "https://www.telluride.com/event/firstgrass-concert/",
    description: "Join Planet Bluegrass at Sunset Plaza as they kick off the Telluride Bluegrass Festival with the annual FirstGrass …",
    pubDate: "2026-06-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47924/firstgrass_2000x1000.800x533.webp"
  },
  {
    title: "Summer Situation: Brazilian Barbecue",
    link: "https://www.telluride.com/event/summer-situation/",
    description: "Join Ah Haa for a celebratory kickoff to the summer season on Ah Haa’s Sky Deck! Chef Israel Castro, an expert in …",
    pubDate: "2026-06-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58314/screenshot_2026-05-28_at_3_00_36_pm.800x533.webp"
  },
  {
    title: "Telluride Arts Salon Night",
    link: "https://www.telluride.com/event/telluride-arts-salon-night/",
    description: "Salon Nights are inspired by the legendary Parisian salons - those lively gatherings where artists, thinkers, and …",
    pubDate: "2026-06-18",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60890/download.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-18",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-18",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Bluegrass Festival",
    link: "https://www.telluride.com/event/telluride-bluegrass-festival/",
    description: "Every June, Festivarians make the annual pilgrimage to Telluride for the Telluride Bluegrass Festival. Nestled in the …",
    pubDate: "2026-06-18",
    endDate: "2026-06-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28887/tbf-20190622-1138tev.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-06-19",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-06-19",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-06-19",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Patagonia Telluride Coffee Club",
    link: "https://www.telluride.com/event/patagonia-telluride-coffee-club/",
    description: "Starting in April, Patagonia Telluride is teaming up with The Pour Over Pedaler once a month through October to bring …",
    pubDate: "2026-06-20",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62111/screenshot_2026-04-01_at_2_21_59_pm.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-06-20",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Bombargo",
    link: "https://www.telluride.com/event/bombargo/",
    description: "Bombargo is a Canadian based international touring band that drops a vibrant splash of soul over their distinctive …",
    pubDate: "2026-06-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/56920/screenshot_2026-04-09_at_2_01_00_pm.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-06-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-06-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Bosq x The National: A Colorado Culinary Homecoming",
    link: "https://www.telluride.com/event/bosq-x-the-national-a-colorado-culinary-homecoming/",
    description: "The National in Telluride is thrilled to welcome Chef Barclay Dodge of Aspen’s Michelin-starred Bosq for a …",
    pubDate: "2026-06-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62503/bosq_x_the_national_collab.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-06-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-06-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Telluride Yoga Festival",
    link: "https://www.telluride.com/event/telluride-yoga-festival/",
    description: "The longest running yoga festival in the country, the Telluride Yoga Festival is a four-day yoga and wellness gathering …",
    pubDate: "2026-06-25",
    endDate: "2026-06-29",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28883/190827_001.800x533.webp"
  },
  {
    title: "Oak Street Park SummerSHOW Series",
    link: "https://www.telluride.com/event/oak-street-park-summershow-series/",
    description: "The Sheridan Opera House’s SHOW Bar has proudly hosted free summer patio shows to keep the arts accessible to all. …",
    pubDate: "2026-06-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58332/dsc01583lr--1-.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-06-26",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-06-26",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-06-26",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "The Jauntee",
    link: "https://www.telluride.com/event/the-jauntee/",
    description: "The Jauntee is an electrifying and genre-blending musical ensemble that has captivated audiences with their unique and …",
    pubDate: "2026-06-26",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62170/screenshot_2026-04-09_at_2_02_00_pm.800x533.webp"
  },
  {
    title: "Telluride Theatre Muleskinner&#039;s Ball Fundraiser",
    link: "https://www.telluride.com/event/telluride-theatre-muleskinners-ball-fundraiser/",
    description: "Get ready for the one-night/one-of-a-kind Telluride Theatre GALA! A blast from the past - the biggest party of the …",
    pubDate: "2026-06-27",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47975/muleskinners_ball_hero_1920x1080_hero.800x533.webp"
  },
  {
    title: "Telluride Chamber Music: MusicFest",
    link: "https://www.telluride.com/event/musicfest/",
    description: "Come and celebrate MusicFest 2026! Telluride Chamber Music is eagerly anticipating this event coming June and July. …",
    pubDate: "2026-06-28",
    endDate: "2026-07-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/46727/mf_artists_26.800x533.webp"
  },
  {
    title: "Telluride Medical Center Foundation Classic",
    link: "https://www.telluride.com/event/telluride-medical-center-foundation-classic/",
    description: "The Telluride Medical Center Foundation Classic is an elevated community golf fundraiser benefiting the Telluride …",
    pubDate: "2026-06-28",
    endDate: "2026-06-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62506/telluride_com.800x533.webp"
  },
  {
    title: "Telluride Plein Air",
    link: "https://www.telluride.com/event/telluride-plein-air/",
    description: "The Telluride Plein Air Festival is an essential fundraiser for the Sheridan Arts Foundation, a 501 (c) (3) …",
    pubDate: "2026-06-29",
    endDate: "2026-07-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45978/telluride-festival-plein-air-artists-2015-home-1.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-01",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Sweet Sounds",
    link: "https://www.telluride.com/event/sweet-sounds/",
    description: "Head to the Wilkinson Public Library on the first Wednesday of the month this summer for live music and sweet treats! …",
    pubDate: "2026-07-01",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62443/sweet_sounds_5.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-07-01",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-07-01",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Wim Tapley & the Cannons",
    link: "https://www.telluride.com/event/wim-tapley-the-cannons/",
    description: "Based in Athens, Georgia, Wim Tapley came of age playing shows in Washington D.C. where he honed his voice with the …",
    pubDate: "2026-07-01",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62306/screenshot_2026-04-29_at_2_55_28_pm.800x533.webp"
  },
  {
    title: "Trunk Show",
    link: "https://www.telluride.com/event/trunk-show-elinoff-gallery/",
    description: "The Elinoff Gallery is excited to have one of their favorite makers join them for the holiday week and bring some …",
    pubDate: "2026-07-01",
    endDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62621/300x300_c.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Art Walk",
    link: "https://www.telluride.com/event/telluride-art-walk/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and …",
    pubDate: "2026-07-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36708/download_2.800x533.webp"
  },
  {
    title: "Rooftop Pop-Up Local Artist Market",
    link: "https://www.telluride.com/event/pop-up-local-artist-market/",
    description: "Shop an incredible rotating selection of Ah Haa’s staff, instructors and open studio memeber’s artwork in the …",
    pubDate: "2026-07-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58400/screenshot_2026-01-21_at_4_30_00_pm.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-07-02",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Bright Light Social Hour",
    link: "https://www.telluride.com/event/bright-light-social-hour/",
    description: "Austin’s The Bright Light Social Hour are widely recognized as the essence of Texas psych rock – no one better …",
    pubDate: "2026-07-02",
    endDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55989/download_3.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-07-03",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-07-03",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Red, White & Blues",
    link: "https://www.telluride.com/event/red-white-and-blues/",
    description: "Celebrate the Fourth of July with the whole family this year at Mountain Village’s Red, White & Blues …",
    pubDate: "2026-07-03",
    endDate: "2026-07-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/37568/mountainvillagejuly3-92-2100x1400-77f0d9ec-366a-4c02-ba72-96f3fcc4b531.800x533.webp"
  },
  {
    title: "Madeline Hotel & Residences Annual Alpine Cookout",
    link: "https://www.telluride.com/event/madeline-hotel-residences-annual-alpine-cookout/",
    description: "The 6th Annual Alpine Cookout at Madeline Hotel & Residences returns this July! Get ready for a day of sensational …",
    pubDate: "2026-07-03",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48038/copy_of_alpine_cookout_hero.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-07-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Telluride Fourth of July Parade",
    link: "https://www.telluride.com/event/telluride-4th-of-july-parade/",
    description: "The Telluride 4th of July Parade is the longest running event in the Town's history. The parade celebrates our …",
    pubDate: "2026-07-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44403/img_2267-2100x1400-717e96b7-57a1-4fb1-8082-d7ef66424a4e.800x533.webp"
  },
  {
    title: "Rundola",
    link: "https://www.telluride.com/event/rundola/",
    description: "Celebrate Independence Day with the Telluride Foundation at the 16th Annual Rundola on July 4th, 2026! This exciting …",
    pubDate: "2026-07-04",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44821/download_11.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-07",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Augment Summer Music Series",
    link: "https://www.telluride.com/event/augment-summer-music-series/",
    description: "Telluride's local non-profit organization Augment Music Project is hosting monthly concerts in Elks Park this summer. …",
    pubDate: "2026-07-07",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53672/download_1.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-08",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-07-08",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-07-08",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Science of Cocktails",
    link: "https://www.telluride.com/event/science-of-cocktails/",
    description: "It’s that time of year – when intriguing experiments with density, sublimation, acoustic integration, and even …",
    pubDate: "2026-07-08",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53794/screenshot_2025-05-30_at_12_21_36_pm.800x533.webp"
  },
  {
    title: "Creative Exchange",
    link: "https://www.telluride.com/event/creative-exchange/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call …",
    pubDate: "2026-07-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60815/tot_cxe_brittany_miller.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-07-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "SoDown",
    link: "https://www.telluride.com/event/sodown/",
    description: "SoDown, the project of Denver-based producer, multi-instrumentalist, and live performer Ehren River Wright, delivers an …",
    pubDate: "2026-07-09",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61831/clientfile_610220.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-07-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-07-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-07-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Hardrock Hundred Endurance Run",
    link: "https://www.telluride.com/event/hardrock-100/",
    description: "The Hardrock Hundred Mile Endurance Run is an ultramarathon of 102.5 miles in length, plus 33,197 feet of climb and …",
    pubDate: "2026-07-10",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47185/hr100-home8.800x533.webp"
  },
  {
    title: "Telluride Table",
    link: "https://www.telluride.com/event/telluride-table/",
    description: "Family, whether forged by blood or bond, is the center of community and it all starts at the table. With a meal, with …",
    pubDate: "2026-07-10",
    endDate: "2026-07-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48187/telluridetable_logoassets_updated-14.800x533.webp"
  },
  {
    title: "Patagonia Telluride Coffee Club",
    link: "https://www.telluride.com/event/patagonia-telluride-coffee-club/",
    description: "Starting in April, Patagonia Telluride is teaming up with The Pour Over Pedaler once a month through October to bring …",
    pubDate: "2026-07-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62111/screenshot_2026-04-01_at_2_21_59_pm.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-07-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "North Mississippi Allstars",
    link: "https://www.telluride.com/event/north-mississippi-allstars/",
    description: "The Sheridan Arts Foundation presents North Mississippi Allstars Live in Concert at the historic Sheridan Opera House …",
    pubDate: "2026-07-11",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61784/clientfile_609712.800x533.webp"
  },
  {
    title: "Tom Gullikson Tennis Clinic",
    link: "https://www.telluride.com/event/tom-gullikson-tennis-clinic/",
    description: "Join the Gully Tennis Clinic @ TRC! Tom is a decorated Tennis coach and playing professional. Come out and enjoy some …",
    pubDate: "2026-07-11",
    endDate: "2026-07-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62315/img_5733.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-14",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-07-14",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-15",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-07-15",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-07-15",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Telluride Arts Salon Night",
    link: "https://www.telluride.com/event/telluride-arts-salon-night/",
    description: "Salon Nights are inspired by the legendary Parisian salons - those lively gatherings where artists, thinkers, and …",
    pubDate: "2026-07-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60890/download.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-07-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Liver Down the River",
    link: "https://www.telluride.com/event/liver-down-the-river/",
    description: "From the heart of Colorado comes a five piece band, Liver Down The River. The group has their roots in countless river …",
    pubDate: "2026-07-16",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62309/screenshot_2026-04-29_at_2_56_50_pm.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-07-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-07-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-07-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Ah Haa HAHA",
    link: "https://www.telluride.com/event/ah-haa-haha/",
    description: "The HAHA is a community art event unlike you’ve ever experienced! \n\nHAHA is the immersive art installation event of …",
    pubDate: "2026-07-17",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44841/screenshot_2023-03-23_at_4_39_19_pm.800x533.webp"
  },
  {
    title: "Telluride Americana Music Festival",
    link: "https://www.telluride.com/event/telluride-americana-music-festival/",
    description: "The Telluride Americana Music Festival is an annual singer-songwriter event celebrating the best of Americana music. …",
    pubDate: "2026-07-17",
    endDate: "2026-07-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45988/matheus-ferrero-8rvahtauc04-unsplash.800x533.webp"
  },
  {
    title: "Telluride Theatre&#039;s Annual Shakespeare in the Park",
    link: "https://www.telluride.com/event/telluride-theatres-annual-shakespeare-in-the-park/",
    description: "Stay tuned for updates about the 2026 event!",
    pubDate: "2026-07-17",
    endDate: "2026-07-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/51687/2_gents_artwork_landscape.800x533.webp"
  },
  {
    title: "The Saint Cecilia",
    link: "https://www.telluride.com/event/the-saint-cecilia/",
    description: "From the outside, The Saint Cecilia is a collection of emotional images, love, art, power, passion, lust and verve. …",
    pubDate: "2026-07-17",
    endDate: "2026-07-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60544/the_saint_cecelia.800x533.webp"
  },
  {
    title: "Randy Houser Benefit Concert",
    link: "https://www.telluride.com/event/randy-houser-benefit-concert/",
    description: "Great music, for a great cause. The Telluride Foundation, in partnership with The Alpine Club, is proud to announce the …",
    pubDate: "2026-07-17",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62393/houser_telluride_com-1.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-07-18",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Tom Gullikson Tennis Clinic",
    link: "https://www.telluride.com/event/tom-gullikson-tennis-clinic/",
    description: "Join the Gully Tennis Clinic @ TRC! Tom is a decorated Tennis coach and playing professional. Come out and enjoy some …",
    pubDate: "2026-07-18",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62315/img_5733.800x533.webp"
  },
  {
    title: "Telluride Baseball Festival",
    link: "https://www.telluride.com/event/telluride-baseball-festival/",
    description: "The Telluride Baseball Festival offers the combination of an instructional girls softball camp, boys baseball camp, …",
    pubDate: "2026-07-20",
    endDate: "2026-07-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44876/1caea1bf-5cda-4196-93fe-07036f415462.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-21",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-07-21",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-22",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-07-22",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-07-22",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Oak Street Park SummerSHOW Series",
    link: "https://www.telluride.com/event/oak-street-park-summershow-series/",
    description: "The Sheridan Opera House’s SHOW Bar has proudly hosted free summer patio shows to keep the arts accessible to all. …",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58332/dsc01583lr--1-.800x533.webp"
  },
  {
    title: "Telluride Mountain Club’s Party in the Park",
    link: "https://www.telluride.com/event/telluride-mountain-clubs-party-in-the-park/",
    description: "TMtC's annual Party in the Park is happening July 23 at Telluride Town Park! This community celebration supports our …",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48498/poster_board_img_0806.800x533.webp"
  },
  {
    title: "Chill With Chamber Music",
    link: "https://www.telluride.com/event/chill-with-chamber-music/",
    description: "Telluride Chamber Music is bringing music to the West End of the county with Community Concerts at the beautiful Livery …",
    pubDate: "2026-07-23",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58269/norwood.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-07-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-07-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-07-24",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-07-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "High Country Hustle",
    link: "https://www.telluride.com/event/high-country-hustle/",
    description: "High Country Hustle is a bluegrass band from Durango, Colorado, formed in 2017 and known for their high-energy …",
    pubDate: "2026-07-25",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62174/screenshot_2026-04-09_at_2_05_25_pm.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-28",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-07-28",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Town Talk: The Dual Challenge - Climate and Energy",
    link: "https://www.telluride.com/event/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. …",
    pubDate: "2026-07-28",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62558/0728-tt_320_x_212-tf.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-29",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-07-29",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-07-29",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Wednesdays and Thursdays this summer for Games on the Green! They will have classic lawn games …",
    pubDate: "2026-07-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-07-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-07-30",
    endDate: "undefined",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Telluride Reserve",
    link: "https://www.telluride.com/event/telluride-reserve/",
    description: "Telluride Reserve is more than an event—it is an intimate gathering where stories are shared, flavors are discovered, …",
    pubDate: "2026-07-30",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36164/dsc8590_1.800x533.webp"
  }
];

const PAPER_LOGOS = {
  ttimes: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_098f3ce9-59f7-4232-9cfb-c60ee8c3cac0.html'
  },
  ttimes_mar12: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_f5335947-f1c5-4d4e-8ab7-3b50a58ab55f.html'
  },
  ttimes_mar5: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_d3d895fe-19d3-4c6f-89f2-0f6ac32f19b5.html'
  },
  npost: {
    name: 'The Norwood Post',
    img: '',
    svg: '<svg viewBox="0 0 90 14" style="height:13px;width:auto;"><text x="0" y="12" font-family="Georgia,serif" font-weight="bold" font-size="12" fill="#222">The Norwood Post</text></svg>',
    url: 'https://www.telluridenews.com/norwood_post/legals/article_c23ef3df-a055-4ff6-ba7a-f277ef70197b.html'
  },
  ttimes_mar26: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_aa40e482-7008-4eda-9975-91e506726631.html'
  },
  ttimes_apr2: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_aec96dee-01bf-4370-b831-16a17257d9ff.html'
  },
  county_web: {
    name: 'San Miguel County',
    img: 'https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=12524',
    url: 'https://www.sanmiguelcountyco.gov/CivicAlerts.aspx'
  }
};

const LEGAL_ENTITY_LOGOS = {
  county: '<img src="/logo/San%20Miguel%20County.png" alt="San Miguel County">',
  mv: '<img src="/logo/Mountain%20village%20Town.jpg" alt="Mountain Village">',
  telluride: '<img src="/logo/Telluride%20Town.png" alt="Town of Telluride">',
  housing: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 21V10l9-7 9 7v11H3z" fill="#6b3fa0" opacity="0.15"/><path d="M3 21V10l9-7 9 7v11" stroke="#6b3fa0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="14" width="6" height="7" rx="0.5" fill="#6b3fa0" opacity="0.3"/><path d="M9 14h6v7H9z" stroke="#6b3fa0" stroke-width="1.2"/><circle cx="12" cy="6" r="0" fill="none"/><path d="M7 21h10" stroke="#6b3fa0" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ridgway: '<img src="/logo/Ridgway%20Town.png" alt="Town of Ridgway">',
  norwood: '<img src="/logo/Norwood%20Town.jpeg" alt="Town of Norwood">',
  assessor: '<img src="/logo/San%20Miguel%20County.png" alt="San Miguel County Assessor">',
  state: '<img src="/logo/Colorado%20Logo.jpg" alt="State of Colorado">',
  water_court: '<img src="logo/water Court.png" alt="Water Court">',
  ophir: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 18l4-6 4 3 4-5 4 8H4z" fill="#5a7a3a" opacity="0.2"/><path d="M4 18l4-6 4 3 4-5 4 8" stroke="#5a7a3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="6" r="2" fill="#d4a017"/></svg>',
  shavano: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#3a8a3a" stroke-width="1.5" fill="#3a8a3a" opacity="0.1"/><path d="M8 15c0-3 2-5 4-7 2 2 4 4 4 7" stroke="#3a8a3a" stroke-width="1.5" stroke-linecap="round" fill="#3a8a3a" opacity="0.2"/><path d="M12 8v8M9 13h6" stroke="#3a8a3a" stroke-width="1.2" stroke-linecap="round"/></svg>'
};

const LEGAL_NOTICES = [
  {
    title: "Ridgway Bids & Requests for Proposals",
    entity: "Town of Ridgway",
    entityClass: "ent-ridgway",
    entityLogo: "ridgway",
    icon: "📋",
    iconClass: "type-rfp",
    type: "Bids / RFP",
    filterTag: "public-entity",
    summary: "The Town of Ridgway posts active bids and requests for proposals on their website. Check the link for currently open solicitations. Town Hall: 201 N. Railroad St., Ridgway, CO 81432 · (970) 626-5308.",
    expires: "2026-12-31",
    url: "https://townofridgway.colorado.gov/resources/requests-for-proposals/bids"
  },
  {
    title: "Property Tax Exemption -- Seniors, Disabled Veterans & Gold Star Spouses",
    entity: "San Miguel County Assessor",
    entityClass: "ent-assessor",
    entityLogo: "state",
    icon: "🏠",
    iconClass: "type-tax",
    type: "Tax Exemption",
    filterTag: "tax-finance",
    summary: "Colorado provides a property tax exemption of 50% of the first $200,000 in actual value for qualifying senior citizens (65+, 10-year ownership), veterans with 100% disability, and gold star veteran spouses. Applications accepted through July 15, 2026. Contact the Assessor at 970-728-3174.",
    deadline: "Applications due by July 15, 2026",
    expires: "2026-07-15",
    dates: "2/5 through 7/9 (biweekly)",
    papers: ["ttimes", "npost"]
  },
  {
    title: "Notice of Vesting -- Korn Residence, 566 W Columbia Ave",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for the Korn Residence (Historic Residential zone, Lot 24A Block 9 West Telluride). Small-scale addition increasing floor area by more than 25%, small-scale repositioning of a designated THAS primary structure, minor scale alteration, and insubstantial scale addition. Owner: Korn David & Kristin Family Trust. Applicant: Shift Architects, Kristine Perpar. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"],
    address: "566 W Columbia Ave, Telluride, CO"
  },
  {
    title: "Notice of Vesting -- 108 N Columbine Minor Addition/Remodel",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for 108 N Columbine Minor Addition/Remodel (Residential zone, Lot 1R Block 24 East Telluride). Minor scale addition increasing floor area by more than 25% and resulting in 1,000-2,500 sq ft, outside of the THLD but within the HPOD. Owner: ZKLF LLC. Applicant: McAllister Architects, Michael McAllister. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"],
    address: "108 N Columbine St, Telluride, CO"
  },
  {
    title: "Notice of Vesting -- Fulton Residence (Hillside Transitional)",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for the Fulton Residence (Hillside Transitional zone, Lot 7R Block E North Telluride). Small-scale new construction of a principal structure containing 2,500 sq ft or more of floor area, on a lot with pre-construction grade or slope of building site coverage of 25% or greater. Owner: Tio Rico LLC. Applicant: William Erwin, ASUL. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"]
  },
  {
    title: "Ordinance -- Community Development Code Amendment for Wildfire Resilience (Passed Second Reading)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "mv",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Town of Mountain Village passed an ordinance on second reading on April 23, 2026 regarding Community Development Code amendments for compliance with Colorado Wildfire Resilience Code. The ordinance is available for review at Town Hall or on the town website.",
    deadline: "",
    expires: "2026-07-06",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Town of Mountain Village",
    noticeKey: "mv-ord-wildfire-2026"
  },
  {
    title: "Condominium Notice -- First Mortgagee Consent for Declaration Amendment (Village Creek)",
    entity: "Village Creek Condominium Association",
    entityClass: "ent-county",
    entityLogo: "mv",
    icon: "🏠",
    iconClass: "type-hearing",
    type: "Housing Notice",
    filterTag: "housing",
    summary: "Village Creek Condominium Association has issued a proposed First Amendment to the Declaration and is notifying all first mortgagees. First mortgagees have 60 days from the mailed notice to deliver a negative response, or they will be deemed to have approved the amendment.",
    deadline: "60 days after mailed notice to mortgagees",
    expires: "2026-07-06",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Village Creek Condominiums, San Miguel County, Colorado",
    noticeKey: "village-creek-condo-amend-2026"
  },
  {
    title: "RFP -- Flooring Replacement at County Buildings",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace flooring at 333 & 305 W. Colorado Ave, Telluride. RFP information is available on the county website or at the specified address. Deadline for proposals is 5:00 PM on Friday, June 5th.",
    deadline: "June 5, 2026 at 5:00 PM",
    expires: "2026-06-05",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-2026"
  },
  {
    title: "RFP -- Boiler System Replacement at Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace the boiler system at the Down Valley Park in Placerville. RFP information is available on the county website or at Parks & Open Space department. Deadline for proposals is 5:00 PM on June 4th.",
    deadline: "June 4, 2026 at 5:00 PM",
    expires: "2026-06-04",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Down Valley Park, Placerville",
    noticeKey: "rfp-boiler-placerville-2026"
  },
  {
    title: "Request for Proposal -- Request for Proposal for Boiler Replacement at the Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for Boiler Replacement at the Down Valley Park.",
    deadline: "Closes 6/4/2026",
    expires: "2026-06-04",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=205",
    address: "",
    smcBidID: "205"
  },
  {
    title: "Request for Proposal -- Request for Proposal for Floor Replacement at Courthouse and Miramonte Building",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for Floor Replacement at Courthouse and Miramonte Building.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=204",
    address: "",
    smcBidID: "204"
  },
  {
    title: "Request for Quote -- Request for Quote: Material Hauling",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Quote",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Quote: Material Hauling.",
    deadline: "Open until contracted",
    expires: "2026-08-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=159",
    address: "",
    smcBidID: "159"
  },
  {
    title: "Request for Proposal -- Soil Preparation and Regrading of Mill Creek Park Site",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Soil Preparation and Regrading of Mill Creek Park Site.",
    deadline: "Open until contracted",
    expires: "2026-08-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=189",
    address: "",
    smcBidID: "189"
  },
  {
    title: "Request for Proposal -- Deputy Municipal Court Judge",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: Deputy Municipal Court Judge.",
    deadline: "Closes 6/4/2026",
    expires: "2026-06-04",
    dates: "5/7",
    url: "https://www.telluride.gov/bids.aspx?bidID=127",
    address: "",
    totBidID: "127"
  },
  {
    title: "Property Tax Exemption -- Senior Citizens and Veterans with Disability",
    entity: "San Miguel County Assessor",
    entityClass: "ent-county",
    entityLogo: "state",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Assessor announces property tax exemption applications for qualifying senior citizens (65+), veterans with 100% service-connected disability, gold star veteran spouses, and qualified senior primary residential classification. Applications must be submitted by July 15, with late applications accepted until August 15.",
    deadline: "July 15, 2026",
    expires: "2026-08-15",
    dates: "4/30",
    papers: ["ttimes_0430"],
    url: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    address: "San Miguel County",
    noticeKey: "property-tax-exemption-2026"
  },
  {
    title: "Request for Proposal -- 2026 Public Restroom Cleaning Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: 2026 Public Restroom Cleaning Services.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/9",
    url: "https://www.telluride.gov/bids.aspx?bidID=128",
    address: "",
    totBidID: "128"
  },
  {
    title: "Request for Proposal -- 2026 Town Facilities Janitorial Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: 2026 Town Facilities Janitorial Services.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/9",
    url: "https://www.telluride.gov/bids.aspx?bidID=129",
    address: "",
    totBidID: "129"
  },
  {
    title: "Water Court -- Diligence Application for NWC Conditional Water Rights (Case No. 26CW3016)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "Norwood Water Commission filed a diligence application in Water Division 4 for multiple conditional water rights including reservoirs and pumps in the San Miguel River basin. The application seeks to show reasonable diligence in developing water rights originally decreed in 2013, with subsequent diligence found in 2019. The water rights are for irrigation, municipal, power generation, augmentation and piscatorial uses serving up to 20,000 acres in the NWC service area.",
    deadline: "Not specified in notice",
    expires: "2026-05-31",
    dates: "4/9",
    papers: ["ttimes_0409"],
    url: "https://www.telluridenews.com/news/legals/article_53f99203-76eb-4168-b3a4-392ac65857e4.html",
    address: "Multiple locations in San Miguel County including SW1/4 NE1/4 Section 10, T42N R12W; NW1/4 NW1/4 Section 22, T44N R13W; SE1/4 SE1/4 Section 9, T44N R13W; and other locations",
    noticeKey: "26CW3016",
    caseNumber: "26CW3016"
  },
  {
    title: "RFP -- Boiler System Replacement at Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to replace the boiler system at Down Valley Park in Placerville. Information is available online or at the Parks & Open Space department in Telluride. Proposals are due by 5:00 PM on June 4, 2026.",
    deadline: "June 4, 2026 at 5:00 PM",
    expires: "2026-06-04",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "Down Valley Park, Placerville, CO",
    noticeKey: "COL-000133"
  },
  {
    title: "RFP -- Deputy Municipal Court Judge Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Telluride is inviting proposals from qualified individuals to provide Deputy Municipal Court Judge Services for their Municipal Court of Record. Proposals must be submitted by noon on June 5, 2026, and detailed requirements are available at bit.ly/totbids.",
    deadline: "June 5, 2026 at 12:00 PM",
    expires: "2026-06-05",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "Telluride Municipal Court, Telluride, CO",
    noticeKey: "COL-000140"
  },
  {
    title: "RFP -- Flooring Replacement at County Buildings",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to replace flooring at 333 & 305 W. Colorado Ave in Telluride. Information is available online or at the building's 2nd floor, with proposals due by 5:00 PM on Friday, June 5th.",
    deadline: "June 5, 2026 at 5:00 PM",
    expires: "2026-06-05",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "COL-000131"
  },
  {
    title: "Public Hearing -- Land Use Code Amendment for Building Footprint Definition",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Board of Commissioners will hold a public hearing on June 3, 2026 at 9:30 AM to consider a Land Use Code amendment adding a definition for 'Building Footprint' and clarifying dimensional references. Written comments must be received by May 27, 2026.",
    deadline: "June 3, 2026 at 9:30 AM",
    expires: "2026-06-03",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "333 W Colorado Ave, 2nd FL, Telluride, CO",
    noticeKey: "COL-000142"
  },
  {
    title: "Public Hearing -- Land Use Code Amendment for Accelerated Housing Review",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "smrha",
    icon: "🏠",
    iconClass: "type-hearing",
    type: "Housing Notice",
    filterTag: "housing",
    summary: "San Miguel County Board of Commissioners will hold a public hearing on June 3, 2026 at 9:30 AM to consider a Land Use Code amendment adding Section 3-15 for Accelerated Housing Review. Written comments must be received by noon on May 27, 2026.",
    deadline: "June 3, 2026 at 9:30 AM",
    expires: "2026-06-03",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "333 W Colorado Ave, 2nd FL, Telluride, CO",
    noticeKey: "COL-000143"
  },
  {
    title: "Public Hearing -- Substantial PUD Amendment for Increased Floor Area",
    entity: "Jim Mahoney",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Board of Commissioners will hold a public hearing on June 3, 2026 at 9:30 AM to consider Jim Mahoney's application for a Substantial PUD Amendment to increase maximum floor area from 6,600 to 7,800 square feet at 780 Vance Drive. Written comments must be received by noon May 26, 2026.",
    deadline: "June 3, 2026 at 9:30 AM",
    expires: "2026-06-03",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "780 Vance Drive, Telluride, CO",
    noticeKey: "COL-000116"
  },
  {
    title: "Request for Proposal -- Foundation Repairs at the Placerville Schoolhouse",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Foundation Repairs at the Placerville Schoolhouse.",
    deadline: "Open until contracted",
    expires: "2026-08-14",
    dates: "5/16",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=188",
    address: "",
    smcBidID: "188"
  },
  {
    title: "Request for Proposal -- Trout Lake Water Tank Roofing",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Trout Lake Water Tank Roofing.",
    deadline: "Open until contracted",
    expires: "2026-08-14",
    dates: "5/16",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=187",
    address: "",
    smcBidID: "187"
  },
  {
    title: "RFP -- Mountain Village (COL-000150)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Mountain Village issued an RFP with a submission deadline of 5 p.m. Wednesday, June 10. Contact Molly Norton for more information at mnorton@mtnvillage.org.",
    deadline: "June 10, 2026 at 5:00 PM",
    expires: "2026-06-10",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "Mountain Village",
    noticeKey: "rfp-mountain-village-col-000150"
  },
  {
    title: "Name Change Petition -- Kendal Dawn Oakleaf Smith (Case 26C11)",
    entity: "San Miguel County Court",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County Court published notice of a petition filed April 28, 2026 to change the name of Kendal Dawn Oakleaf Smith to Kendal Dawn Oakleaf Smith. The petition was filed with the San Miguel County Court.",
    deadline: "",
    expires: "2026-07-20",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "San Miguel County",
    noticeKey: "name-change-26c11",
    caseNumber: "26C11"
  },
  {
    title: "Semi-Annual Treasurer Report -- July-December 2025",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Treasurer's Semi-Annual Report for July-December 2025 is prepared and available for viewing at www.sanmiguelcountyco.gov/661/Agendas-and-Minutes under the Wednesday, May 6, 2026/Notice.",
    deadline: "",
    expires: "2026-07-20",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "San Miguel County",
    noticeKey: "treasurer-report-2025-jul-dec"
  },
  {
    title: "RFP -- Flooring Replacement at 333 & 305 W. Colorado Ave",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace flooring at 333 & 305 W. Colorado Ave, Telluride. Proposals are due by 5:00 PM Friday, June 5th via email or drop-off at the Maintenance department.",
    deadline: "June 5, 2026 at 5:00 PM",
    expires: "2026-06-05",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-col-000131"
  },
  {
    title: "RFP -- Boiler System Replacement at Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace the boiler system at the Down Valley Park in Placerville. Proposals are due by 5:00 PM June 4 via email or drop-off at Parks & Open Space department.",
    deadline: "June 4, 2026 at 5:00 PM",
    expires: "2026-06-04",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "Down Valley Park, Placerville, CO",
    noticeKey: "rfp-boiler-placerville-col-000133"
  },
  {
    title: "Foreclosure Sale -- 122 43ZS Road, Norwood (Sale No. 202601)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee will conduct foreclosure sale at public auction on July 16, 2026 at 10:00 AM for property at 122 43ZS Road, Norwood. The property is in Section 26, Township 45 North, Range 13 West with an outstanding balance of $115,217.40.",
    deadline: "July 16, 2026 at 10:00 AM",
    expires: "2026-07-16",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "122 43ZS Road, Norwood, CO 81423 (Section 26, T45N, R13W)",
    noticeKey: "foreclosure-202601",
    caseNumber: "202601"
  },
  {
    title: "RFP -- Deputy Municipal Court Judge Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Telluride is inviting proposals from qualified individuals to provide Deputy Municipal Court Judge Services. Proposals will be accepted until 12:00pm noon on June 5, 2026.",
    deadline: "June 5, 2026 at 12:00 PM",
    expires: "2026-06-05",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "Telluride Municipal Court, Telluride, CO",
    noticeKey: "rfp-deputy-judge-col-000140"
  },
  {
    title: "Public Hearing -- Gas Franchise Ordinance for Black Hills Energy",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Telluride Town Council will hold a public hearing on June 9, 2026 at approximately 1:15pm to consider first reading of an ordinance granting a franchise to Black Hills Colorado Gas, Inc. for gas distribution services. The hearing will be hybrid format at 113 W Columbia Ave.",
    deadline: "June 9, 2026 at 1:15 PM",
    expires: "2026-06-09",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "113 W Columbia Ave, Telluride, Colorado",
    noticeKey: "ordinance-gas-franchise-1425"
  },
  {
    title: "Special Use Permit -- Scenic and Social Special Use (Parcel #452726103022)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a public hearing on a Scenic and Social Special Use Permit application for a property at 488 S. Avalon Dr., Norwood. The hearing is scheduled for May 14, 2026 at 10:30 a.m. Written comments must be received by noon on April 30, 2026.",
    deadline: "April 30, 2026 (comments deadline); May 14, 2026 (hearing)",
    expires: "2026-07-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO, Parcel #452726103022",
    noticeKey: "sup-452726103022-scenic-social"
  },
  {
    title: "Special Use Permit -- Construction/Contractor Office and Staging Area (Parcel #452726103022)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "John Miller on behalf of Kurt Works Inc. and Kurt Crockett has applied for a Special Use Permit to establish a Construction/Contractor Office and Staging Area for excavation and grading business operations at 488 S. Avalon Dr., Norwood. Public hearing scheduled for May 14, 2026 at 10:45 a.m. Written comments due by noon April 30, 2026.",
    deadline: "April 30, 2026 (comments deadline); May 14, 2026 (hearing)",
    expires: "2026-07-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO, Parcel #452726103022",
    noticeKey: "sup-452726103022-contractor-office"
  }
];

const HOUSING_LISTINGS = [
  {
    title: "🏠 Element 52 SW-102",
    type: "deed-sale",
    address: "398 South Davis Street, Unit SW-102, Telluride, CO 81435",
    lat: 37.9281,
    lng: -107.8145,
    beds: "2 Bedroom, 1 Bath, ~988 sq ft",
    price: "$352,529 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/element-52-sw-102/",
    smrhaSlug: "element-52-sw-102",
    note: "Tier 2 Mitigation Unit. HOA $420.28/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "🏠 Silver Jack 202",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 202, Telluride, CO 81435",
    lat: 37.9352,
    lng: -107.8138,
    beds: "3 Bedroom, 2 Bath, ~1330 sq ft",
    price: "$405,507 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-202/",
    smrhaSlug: "silver-jack-202",
    note: "Tier 1 Town Constructed Unit. HOA $307.64/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "🏠 Silver Jack 205",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 205, Telluride, CO 81435",
    lat: 37.9352,
    lng: -107.8138,
    beds: "2 Bedroom, 1 Bath, ~935 sq ft",
    price: "$368,620 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-205/",
    smrhaSlug: "silver-jack-205",
    note: "Tier 1 Town Constructed Unit. HOA $218.42/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "Room for Rent — In-Town 2BR Condo",
    type: "deed-rental",
    address: "Telluride, CO 81435 (in-town)",
    lat: 37.9375,
    lng: -107.8123,
    beds: "1 Room in 2BR",
    price: "$1,883/mo (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/property/in-town-room-for-rent-telluride-co-81435/",
    note: "Deed-restricted room rental in shared 2BR condo. Contact SMRHA for eligibility."
  },
  {
    title: "Village Court Apartments — Waitlist",
    type: "deed-rental",
    address: "455 Mountain Village Blvd, Mountain Village, CO 81435",
    lat: 37.9325,
    lng: -107.8497,
    beds: "Studio–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Mountain Village",
    contact: { phone: "(970) 729-3419", email: "" },
    url: "https://townofmountainvillage.com/community/housing/village-court-apartments/",
    note: "Waitlist is currently capped — not accepting new applications. Check back periodically."
  },
  {
    title: "Shandoka Townhomes — Waitlist",
    type: "deed-rental",
    address: "820 Black Bear Rd, Telluride, CO 81435",
    lat: 37.9363,
    lng: -107.8198,
    beds: "1–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Town employee priority. Apply through the Town of Telluride."
  },
  {
    title: "Virginia Placer Apartments — Waitlist",
    type: "deed-rental",
    address: "Virginia Placer, Telluride, CO 81435",
    lat: 37.938,
    lng: -107.826,
    beds: "Studio–2 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Apply through the Town of Telluride Rental Housing division."
  },
  {
    title: "Luxury Condo — 395 E Colorado Ave",
    type: "market-rental",
    address: "395 E Colorado Ave, Telluride, CO 81435",
    lat: 37.9375,
    lng: -107.8095,
    beds: "3 Bedroom",
    price: "$2,500/mo",
    source: "Craigslist",
    contact: {  },
    url: "https://westslope.craigslist.org/apa/d/telluride-luxury-condo/7924056218.html",
    note: "Long-term rental. 3BR condo on E Colorado Ave. Verify availability directly."
  },
  {
    title: "1BR Apartment — 545 W Pacific Ave",
    type: "market-rental",
    address: "545 W Pacific Ave, Telluride, CO 81435",
    lat: 37.9378,
    lng: -107.8155,
    beds: "1 Bedroom",
    price: "$1,500/mo",
    source: "Craigslist",
    contact: {  },
    url: "https://westslope.craigslist.org/apa/d/telluride-look-no-further-than-this/7919977718.html",
    note: "Long-term rental. 1BR on W Pacific Ave. Verify availability directly."
  },
  {
    title: "3BR House — 280 Mahoney Dr",
    type: "market-rental",
    address: "280 Mahoney Dr, Telluride, CO 81435",
    lat: 37.941,
    lng: -107.817,
    beds: "3 Bedroom",
    price: "$3,901/mo",
    source: "Apartments.com",
    contact: {  },
    url: "https://www.apartments.com/280-mahoney-dr-telluride-co/zq5w36n/",
    note: "Market-rate long-term rental. Contact listing agent on Apartments.com."
  },
  {
    title: "1BR — 107 W Columbia Ave",
    type: "market-rental",
    address: "107 W Columbia Ave, Telluride, CO 81435",
    lat: 37.9373,
    lng: -107.8128,
    beds: "1 Bedroom",
    price: "$2,874/mo",
    source: "Apartments.com",
    contact: {  },
    url: "https://www.apartments.com/107-w-columbia-ave-telluride-co/f1l2ss1/",
    note: "Market-rate long-term rental in downtown Telluride."
  }
];

const RIDGWAY_AGENDA_MAP = {
  "May 13, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---May-13%2C-2026.pdf",

  "April 8, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%208%2C%202026%20%28updated%29.pdf",

  "March 25, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/March%2025%20special%20meeting%20agenda.pdf",

  "March 11, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2011%2C%202026.pdf",

  "February 11, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20February%2011%2C%202026.pdf",

  "January 26, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20January%2026%2C%202026%20UPDATED.pdf",

  "January 14, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20Jan%2014%20min.pdf",

  "December 10, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20Dec%2010%20min.pdf",

  "December 3, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20December%203%2C%202025.pdf",

  "November 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20November%2012%2C%202025.pdf",

  "October 4, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat-Special%20Meeting%20Packet%20-%20October%204%2C%202025.pdf",

  "October 1, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20October%201%2C%202025.pdf",

  "September 10, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20September%2010%2C%202025.pdf",

  "August 13, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20August%2013%2C%202025.pdf",

  "July 24, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20July%2024%2C%202025.pdf",

  "July 9, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20July%209%20min.pdf",

  "June 11, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2011%2C%202025.pdf",

  "June 2, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20June%202%2C%202025.pdf",

  "May 14, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Town%20Council%20Regular%20Meeting%20Packet%20-%20May%2014%2C%202025.pdf",

  "April 29, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20April%2029%2C%202025_0.pdf",

  "April 9, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20April%209%20min.pdf",

  "March 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2012%2C%202025.pdf",

  "February 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20February%2012%2C%202025%20UPDATED.pdf",

  "January 8, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/January%208%202025%20Workforce%20Commitee.pdf",

  "December 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00%20Dec%2011%20tc%20agenda.pdf",

  "November 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20November%2013%2C%202024.pdf",

  "October 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2012%2C%202024.pdf",

  "October 9, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20Oct%209%20min.pdf",

  "September 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/September%2011%20Workforce%20Committee.pdf",

  "August 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20August%2014%2C%202024%20UPDATED.pdf",

  "July 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20Committee%20July%2010%20min.pdf",

  "June 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2012%2C%202024.pdf",

  "May 8, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20Workforce%20Committee%20meeting%20Minutes%20-%20May%208.pdf",

  "April 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%2010%2C%202024.pdf",

  "March 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2013%2C%202024%20updated_0.pdf",

  "February 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20February%2014%2C%202024.pdf",

  "December 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20December%2013%2C%202023.pdf",

  "November 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20November%208%2C%202023.pdf",

  "October 21, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2021%2C%202023.pdf",

  "October 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20October%2011%2C%202023.pdf",

  "September 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20meeting%20Minutes%20-%20Sept%2013%2C%202023.pdf",

  "August 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20special%20meeting%20minutes%20-%20Aug%2028%2C%202023.pdf",

  "August 9, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20meeting%20minutes%20-%20Aug%209%2C%202023.pdf",

  "July 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20meeting%20minutes%20-%20July%2012%2C%2020230.pdf",

  "June 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June%2015%20workforce%20%26%20affordable%20housing%20committee%20agenda.pdf",

  "June 14, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.06.14%20tc%20min.pdf",

  "June 6, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.06.06%20Workforce%20Committee%20min.pdf",

  "May 10, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.05.10%20tc%20min.pdf",

  "April 17, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.04.17%20special%20tc%20min.pdf",

  "April 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.04.12%20tc%20min.pdf",

  "March 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.03.08%20tc%20min.pdf",

  "February 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.02.08%20tc%20min.pdf",

  "January 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.01.11%20tc%20min.pdf",

  "November 16, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC%20budget%20workshop%20minutes%20-%20Nov%2015%2C%202023.pdf",

  "February 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2023.02.15%20workshop%20tc%20min.pdf",

  "December 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.12.14%20tc%20min.pdf",

  "November 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.11.09%20tc%20min.pdf",

  "October 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.10.29%20budget%20retreat%20tc%20min.pdf",

  "October 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.10.12%20tc%20min.pdf",

  "September 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.09.14%20tc%20min.pdf",

  "September 7, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Sept%207%20special%20meeting%20agenda.pdf",

  "August 10, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.08.10%20tc%20min.pdf",

  "August 3, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.08.03%20special%20tc%20min.pdf",

  "July 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.07.13%20tc%20min.pdf",

  "June 8, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.06.08%20tc%20min.pdf",

  "May 11, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.05.11%20tc%20min.pdf",

  "April 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.04.13%20tc%20min.pdf",

  "March 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.03.09%20tc%20min.pdf",

  "February 28, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.02.28%20special%20tc%20min.pdf",

  "February 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.02.09%20tc%20min.pdf",

  "January 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.01.12%20tc%20min.pdf",

  "November 17, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.11.17%20budget%20workshop%20tc%20min.pdf",

  "October 26, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.10.26%20joint%20workshop%20tc%20min.pdf",

  "January 27, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2022.01.27%20joint%20workshop%20tc%20min.pdf",

  "December 8, 2021":
    "http://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20December%208%2C%202021.pdf",

  "November 10, 2021":
    "http://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20November%2010%2C%202021.pdf",

  "October 23, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00%20October%2023%20budget%20retreat%20agenda.pdf",

  "October 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20October%2013%2C%202021_0.pdf",

  "September 8, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20September%208%2C%202021.pdf",

  "August 11, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20August%2011%2C%202021.pdf",

  "July 14, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20July%2014%2C%202021_1.pdf",

  "June 9, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20June%209%2C%202021_0.pdf",

  "May 12, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20May%2012%2C%202021.pdf",

  "April 14, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20April%2014%2C%202021.pdf",

  "March 10, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20March%2010%2C%202021.pdf",

  "February 10, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20February%2010%2C%202021.pdf",

  "January 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20January%2013%2C%202021.pdf",

  "November 18, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.11.18%20budget%20workshop%20tc%20min.pdf",

  "October 21, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop%20Packet%20-%20October%2021%2C%202021.pdf",

  "April 1, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.04.01%20joint%20workshop%20tc%20min.pdf",

  "March 4, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.03.04%20joint%20workshop%20tc%20min.pdf",

  "February 18, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.02.18%20joint%20workshop%20tc%20min.pdf",

  "February 4, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.02.04%20joint%20workshop%20tc%20min.pdf",

  "January 21, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.01.21%20joint%20workshop%20tc%20min.pdf",

  "January 7, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2021.01.07%20joint%20workshop%20tc%20min.pdf",

  "December 9, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20December%209%2C%202020_1.pdf",

  "November 19, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20November%2019%2C%202020_0.pdf",

  "November 11, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20November%2011%2C%202020.pdf",

  "October 17, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/October%2017%20budget%20retreat%20agenda.pdf",

  "October 14, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00%20Oct%2014%20tc%20agenda.pdf",

  "September 9, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20September%209%2C%202020_0.pdf",

  "August 12, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20August%2012%2C%202020.pdf",

  "July 8, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20July%208%2C%202020.pdf",

  "June 23, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June%2023rd%20Special%20Meeting%20Packet.pdf",

  "June 10, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Full%20Agenda%20Packet%20-%20June%2010%2C%202020_0.pdf",

  "May 27, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.27%20Updated%20-%20May%2027th%20Special%20Meeting%20Packet.pdf",

  "May 13, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.13%20TC%20Agenda%20Packet%20%20May.pdf",

  "April 24, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.04.24%20Special%20Meeting%20Packet.pdf",

  "April 8, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.04.08%20TC%20Agenda%20Packet.pdf",

  "March 20, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.03.20%20TC%20Special%20Meeting%20Packet.pdf",

  "March 11, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.03.11%20TC%20Agenda%20Packet.pdf",

  "February 12, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.02.12%20tc%20min.pdf",

  "December 23, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.12.23%20joint%20workshop%20tc%20min.pdf",

  "December 10, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.12.10%20joint%20workshop%20tc%20min.pdf",

  "November 25, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.11.25%20joint%20workshop%20tc%20min.pdf",

  "November 10, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.11.10%20joint%20workshop%20tc%20min.pdf",

  "October 29, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.10.29%20joint%20workshop%20tc%20min.pdf",

  "October 15, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.10.15%20joint%20workshop%20tc%20min.pdf",

  "October 1, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.10.01%20joint%20workshop%20tc%20min.pdf",

  "September 3, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.09.03%20joint%20workshop%20tc%20min.pdf",

  "August 20, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.08.20%20joint%20workshop%20tc%20min.pdf",

  "August 6, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.08.06%20joint%20workshop%20tc%20min.pdf",

  "July 23, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.07.23%20joint%20workshop%20tc%20min.pdf",

  "July 16, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.07.16%20joint%20workshop%20tc%20min.pdf",

  "June 18, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.06.18%20joint%20workshop%20tc%20min.pdf",

  "May 28, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.28%20joint%20workshop%20tc%20min.pdf",

  "May 14, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.14%20joint%20workshop%20tc%20min.pdf",

  "April 29, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.04.29%20joint%20workshop%20tc%20min.pdf",

  "February 10, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.02.10%20joint%20workshop%20tc%20min.pdf"
};

function getCountyCachedMeetings() {
  return COUNTY_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    // Explicit agendaUrl override (used for entities not on CivicClerk, e.g.
    // the SSR Housing Code Update meetings whose packets are in DocumentCenter).
    const link = m.agendaUrl
      ? m.agendaUrl
      : (m.civicClerkId
          ? COUNTY_CIVICCLERK_BASE + m.civicClerkId + '/files'
          : COUNTY_CIVICCLERK_FALLBACK);
    const categoryLabel = m.type === 'planning'  ? 'Planning Commission'
                        : m.type === 'ssr'       ? 'SSR Roundtable'
                        : /board/i.test(m.title || '') ? 'Board Meeting'
                        : 'Meeting';

    return {
      title: m.title,
      link,
      description: m.note || '',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'county',
      sourceLabel: 'San Miguel County',
      category: categoryLabel,
      canceled: false,
      hasAgenda: !!(m.agendaUrl || m.civicClerkId),
      agendaLink: m.agendaUrl
        ? m.agendaUrl
        : (m.civicClerkId ? COUNTY_CIVICCLERK_BASE + m.civicClerkId + '/files' : null)
    };
  });
}

function getMVMeetings() {
  return MV_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || (m.board === 'drb' ? MV_DRB_URL : MV_TC_URL);

    let description = '';
    if (m.note) {
      description = m.note;
    }
    // No generic "Agenda available" fallback — the "Agenda Posted →" button already signals this

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'mv',
      sourceLabel: 'Mountain Village',
      category: m.board === 'drb' ? 'DRB Meeting' : 'Meeting',
      canceled: false,
      hasAgenda,
      agendaLink: m.agendaUrl || null,
      packetUrl: m.packetUrl || null
    };
  });
}

function getSchoolMeetings() {
  // Map each entry to a card object first
  const cards = SCHOOL_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || SCHOOL_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Agenda/packet available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'school',
      sourceLabel: 'School District R-1',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null,
      _rawTime: m.time || ''
    };
  });

  // Merge same-day pairs (e.g. Work Session 3:30 PM + Monthly Meeting 5:15 PM
  // on the same date) into a single combined card so they don't look like
  // duplicates.  The earlier meeting's time is shown first; the later meeting's
  // title becomes the suffix.  Agenda link from whichever entry has one.
  const merged = [];
  const seen = new Set();
  for (let i = 0; i < cards.length; i++) {
    if (seen.has(i)) continue;
    const a = cards[i];
    const dateKey = a.eventDate ? a.eventDate.toISOString().slice(0, 10) : null;
    let combined = false;
    for (let j = i + 1; j < cards.length; j++) {
      if (seen.has(j)) continue;
      const b = cards[j];
      const bKey = b.eventDate ? b.eventDate.toISOString().slice(0, 10) : null;
      if (dateKey && bKey === dateKey) {
        // Same day — merge: keep earlier time, combine title, keep any agenda
        const aTime = a._rawTime;
        const bTime = b._rawTime;
        const earlier = (!aTime || (bTime && aTime <= bTime)) ? a : b;
        const later   = earlier === a ? b : a;
        const hasAgendaCombined = earlier.hasAgenda || later.hasAgenda;
        const combinedLink = (earlier.hasAgenda ? earlier.link : null) || (later.hasAgenda ? later.link : null) || earlier.link;
        // Build a short title: strip common "Telluride Board of Education " prefix, join with " & "
        const shorten = t => t.replace(/^(Telluride\s+)?Board of Education\s+/i, '').replace(/\s*--\s*Special Meeting$/i, '');
        const combinedTitle = 'Telluride Board of Education ' + shorten(earlier.title) + ' & ' + shorten(later.title);
        const combinedTime = aTime && bTime ? aTime + ' & ' + bTime : (aTime || bTime);
        merged.push(Object.assign({}, earlier, {
          title: combinedTitle,
          link: combinedLink,
          eventTimes: combinedTime,
          hasAgenda: hasAgendaCombined,
          packetUrl: earlier.packetUrl || later.packetUrl || null
        }));
        seen.add(i);
        seen.add(j);
        combined = true;
        break;
      }
    }
    if (!combined) {
      seen.add(i);
      merged.push(a);
    }
  }

  // Strip internal helper field
  return merged.map(({ _rawTime, ...rest }) => rest);
}

function getFireMeetings() {
  return FIRE_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || FIRE_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'fire',
      sourceLabel: 'Fire District',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getMedMeetings() {
  return MED_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || MED_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'med',
      sourceLabel: 'Medical Center',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getNorwoodMeetings() {
  const boardUrls = { bot: NORWOOD_BOT_URL, pz: NORWOOD_PZ_URL, nwc: NORWOOD_NWC_URL, san: NORWOOD_SAN_URL };
  return NORWOOD_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || boardUrls[m.board] || NORWOOD_BOT_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: '1670 Naturita St, Norwood CO 81423',
      source: 'norwood',
      sourceLabel: 'Norwood',
      category: 'Meeting',
      canceled: false,
      hasAgenda
    };
  });
}

function getOphirMeetings() {
  const boardUrls = { ga: OPHIR_GA_URL, pz: OPHIR_PZ_URL };
  return OPHIR_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || boardUrls[m.board] || OPHIR_GA_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: 'Town of Ophir, CO 81426',
      source: 'ophir',
      sourceLabel: 'Ophir',
      category: 'Meeting',
      canceled: false,
      hasAgenda
    };
  });
}

function getAirportMeetings() {
  return AIRPORT_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    return {
      title: m.title,
      link: AIRPORT_BOARD_URL,
      description: m.note || 'Regular board meeting of the Telluride Regional Airport Authority.',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '12:00 PM',
      location: m.location || 'Terminal Observation Lounge, Telluride Regional Airport',
      source: 'airport',
      sourceLabel: 'TEX',
      category: 'Meeting',
      canceled: false,
      hasAgenda: false
    };
  });
}

function getSmartMeetings() {
  return SMART_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || SMART_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = m.packetUrl
        ? 'Board agenda and full meeting packet available (PDF).'
        : 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'smart',
      sourceLabel: 'SMART Transit',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getTownAgendaLink(title, eventDate) {
  if (!eventDate) return TOWN_CIVICWEB_FALLBACK;
  const dateKey = eventDate.toISOString().slice(0, 10);
  // Try exact title match first
  const exactKey = title + '|' + dateKey;
  let meetingId = TOWN_CIVICWEB_IDS[exactKey];
  // Try partial match on date only
  if (!meetingId) {
    for (const key of Object.keys(TOWN_CIVICWEB_IDS)) {
      if (key.endsWith('|' + dateKey)) {
        meetingId = TOWN_CIVICWEB_IDS[key];
        break;
      }
    }
  }
  if (!meetingId) return null;
  return TOWN_CIVICWEB_BASE + meetingId;
}

function getTellurideMeetings() {
  return TELLURIDE_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    // Explicit agendaUrl overrides everything (legacy/direct PDF links)
    // civicWebId uses the Town's CivicWeb portal (same system as County)
    // getTownAgendaLink also checks TOWN_CIVICWEB_IDS by title+date
    const civicWebLink = m.civicWebId
      ? TOWN_CIVICWEB_BASE + m.civicWebId
      : getTownAgendaLink(m.title, eventDate);
    const agendaLink = m.agendaUrl || civicWebLink;
    const hasAgenda = !!agendaLink;
    const link = agendaLink || TELLURIDE_HARC_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '5:00 PM',
      location: m.location || 'Rebekah Hall, 201 N. Pine Street, Telluride',
      source: 'telluride',
      sourceLabel: 'Town of Telluride',
      category: 'HARC Meeting',
      canceled: false,
      hasAgenda,
      agendaLink
    };
  });
}

function getMeetingSummary(item) {
  if (!item.eventDate) return '';
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;

  // 1. Check AI summaries (from Firestore via Cloud Function)
  if (AI_SUMMARIES[exactKey] && AI_SUMMARIES[exactKey].shortSummary) {
    const s = AI_SUMMARIES[exactKey].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  // 2. Check manual/fallback summaries
  if (MANUAL_SUMMARIES[exactKey]) return MANUAL_SUMMARIES[exactKey];

  // 3. Partial match in manual summaries (source + date, single meeting)
  for (const key of Object.keys(MANUAL_SUMMARIES)) {
    if (key.startsWith(item.source + '|' + dateKey + '|')) {
      const matchCount = Object.keys(MANUAL_SUMMARIES).filter(k => k.startsWith(item.source + '|' + dateKey + '|')).length;
      if (matchCount === 1) return MANUAL_SUMMARIES[key];
    }
  }

  // 4. Partial match in AI summaries
  const aiKeys = Object.keys(AI_SUMMARIES).filter(k => k.startsWith(item.source + '|' + dateKey + '|'));
  if (aiKeys.length === 1 && AI_SUMMARIES[aiKeys[0]].shortSummary) {
    const s = AI_SUMMARIES[aiKeys[0]].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  return '';
}

function getMeetingZoomLink(item) {
  if (!item.eventDate) return '';
  // School district always uses the same link
  if (item.source === 'school') return SCHOOL_ZOOM_LINK;
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const exactKey = item.source + '|' + dateKey + '|' + item.title.replace(/ -- CANCELED$/, '').replace(/ -- Special Meeting$/, '');
  if (MEETING_ZOOM_LINKS[exactKey]) return MEETING_ZOOM_LINKS[exactKey];
  // Try partial match
  for (const key of Object.keys(MEETING_ZOOM_LINKS)) {
    if (key.startsWith(item.source + '|' + dateKey + '|')) {
      const matchCount = Object.keys(MEETING_ZOOM_LINKS).filter(k => k.startsWith(item.source + '|' + dateKey + '|')).length;
      if (matchCount === 1) return MEETING_ZOOM_LINKS[key];
    }
  }
  return '';
}

function getMeetingPasscode(item) {
  if (!item || !item.eventDate) return null;

  // School district -- extract passcode from URL parameter
  if (item.source === 'school') {
    const url = SCHOOL_ZOOM_LINK;
    const pwdMatch = url.match(/[?&]pwd=([^&]+)/);
    return pwdMatch ? { id: '865 8512 4120', passcode: pwdMatch[1], phone: '' } : null;
  }

  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '').replace(/ -- Special Meeting$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;

  // Try exact match
  if (MEETING_PASSCODES[exactKey]) return MEETING_PASSCODES[exactKey];

  // Try partial match on source + date (if only one meeting that date)
  const datePrefix = item.source + '|' + dateKey + '|';
  const dateMatches = Object.keys(MEETING_PASSCODES).filter(k => k.startsWith(datePrefix));
  if (dateMatches.length === 1) return MEETING_PASSCODES[dateMatches[0]];

  return null;
}
