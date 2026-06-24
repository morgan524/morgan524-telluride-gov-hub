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
    {"zoomUrl":"https://us02web.zoom.us/j/83995847328","meetingId":"839 9584 7328","passcode":"308083","phone":"719-359-4580"},

  "county|2026-06-10|Board of Review and Planning Commission Joint Work Session":
    {"zoomUrl":"https://us06web.zoom.us/j/84720329875","phone":"970-728-3844"},

  "smart|2026-06-11|SMART Board of Directors":
    {"zoomUrl":"https://us02web.zoom.us/j/82926286001?pwd=hhw2xIVjbwIb6pBVuRTO5mtaLM70GN.1"},

  "county|2026-06-18|Lodging Tax Board 06/18/26":
    {"meetingId":"860 8356 9395","passcode":"993341","phone":"970-728-3844","sv":2},

  "county|2026-06-17|Board of County Commissioners Meeting":
    {"zoomUrl":"https://us02web.zoom.us/meeting/register/4b60Vv3xSPWI1meA92I9Yw","meetingId":"864 8853 1282","passcode":"965124","phone":"719-359-4580","sv":2},

  "telluride|2026-06-17|Historic & Architectural Review Commission Chair - Jun 17 2026":
    {"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"876 4109 1694","passcode":"695618.","phone":"301-715-8592","sv":2},

  "telluride|2026-06-17|Historic & Architectural Review Commission - Jun 17 2026":
    {"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592","sv":2},

  "telluride|2026-06-17|Parks & Recreation Commission - Jun 17 2026":
    {"zoomUrl":"https://us06web.zoom.us/meeting/register/tZIufu6srzwsH9X0sfxgA_In-LUt0azBIi8Z","sv":2},

  "telluride|2026-06-15|Gondola Subcommittee - Jun 15 2026":
    {"zoomUrl":"https://gbsm.zoom.us/j/82559576086","sv":2},

  "fire|2026-06-16|Board of Directors Meeting":
    {"sv":2},

  "telluride|2026-07-06|Open Space Commission - Jul 06 2026":
    {"sv":2},

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    {"sv":2},

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    {"sv":2},

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    {"sv":2},

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    {"sv":2},

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    {"sv":2,"zoomUrl":"https://us06web.zoom.us/meeting/register/oQIoNRzgRC-zUdrPFaFzpQ","meetingId":"843 9146 6771","passcode":"793419.","phone":"719) 359-4580"},

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    {"sv":2,"zoomUrl":"https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg","meetingId":"846 6324 0731","passcode":"769982","phone":"301-715-8592"},

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    {"sv":2,"zoomUrl":"https://us06web.zoom.us/meeting/register/m65fl_EfRuC-m1IoGX6uiQ","meetingId":"815 3599 7736","passcode":"769982","phone":"301-715-8592"},

  "telluride|2026-06-15|Corrected Agenda for Open Space Commission Site Walk - Jun 15 2026":
    {"sv":2},

  "county|2026-06-22|Open Space Commission Meeting":
    {"sv":2,"zoomUrl":"https://www.google.com/url?q=https://us06web.zoom.us/j/82416565788&sa=D&source=calendar&ust=1782161034577544&usg=AOvVaw1VhSAXMLvCsaoHEGucwKxm","meetingId":"824 1656 5788","passcode":"269895","phone":"970-369-5469"},

  "county|2026-06-24|Board of County Commissioners Work Session":
    {"sv":2},

  "county|2026-07-01|Board of County Commissioners Meeting":
    {"sv":2},

  "county|2026-07-08|Board of County Commissioners Work Session":
    {"sv":2},

  "county|2026-07-09|Planning Commission Meeting":
    {"sv":2},

  "mv|2026-06-17|Town Council Meeting":
    {"zoomUrl":"https://us06web.zoom.us/webinar/register/WN_XDMlJEPIRy6V3a5BeMEfCQ","phone":"970-369-6429","sv":2},

  "county|2026-07-14|Historical Commission":
    {"sv":2},

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    {"sv":2},

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    {"sv":2},

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    {"sv":2},

  "county|2026-07-15|Board of County Commissioners Meeting":
    {"sv":2},

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    {"sv":2},

  "med|2026-06-25|Regular Board Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/89509331558","meetingId":"895 0933 1558","sv":2},

  "telluride|2026-06-23|Special Meeting - HARC and P&Z - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    {"sv":2},

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    {"sv":2},

  "county|2026-07-08|Board of County Commissioners Special":
    {"sv":2},

  "fire|2026-07-21|Board of Directors Meeting":
    {"sv":2},

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    {"sv":2},

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    {"sv":2},

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    {"sv":2},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    {"sv":2},

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    {"sv":2}
};

const MANUAL_SUMMARIES = {
  "mv|2026-06-17|Town Council Meeting":
    "Council meets for a packed agenda that includes an executive session for legal advice on a recent investigation, plus a full hour set aside to review an independent investigation report and consider future actions. Two new staff members join — a housing director and planner. Council will vote on several items: expedited review policies for affordable housing projects to participate in state Prop 123, a water storage lease agreement with the utility company, and a height variance for a single-family home on San Joaquin Road. There's also a presentation on thermal energy network findings and the usual liquor permits for summer events.",

  "fire|2026-06-16|Board of Directors Meeting":
    "The fire district's monthly board meeting covers their 2025 audit results, master planning updates, and wildfire assignments as summer approaches. Station 3 construction gets an update, along with the usual reports from chiefs and coordinators across the district's operations.",

  "med|2026-05-28|Regular Board Meeting":
    "A regular Telluride Hospital District board meeting. Past the consent agenda and the April draft financials, the substance is in Board Matters — updates on the new facility, partnership talks, and early mill levy considerations. The mill levy is the one to watch; that's the property-tax lever that funds the district. CEO and Foundation/campaign reports round it out. In person at 333 W. Colorado Ave. or by Zoom.",

  "school|2026-06-09|Telluride Board of Education Work Session":
    "Agenda not yet available",

  "school|2026-06-09|Telluride Board of Education Monthly Meeting":
    "Agenda not yet available",

  "ophir|2026-06-16|General Assembly Meeting":
    "Agenda not yet available",

  "smart|2026-06-11|SMART Board of Directors":
    "SMART's board meets to approve a lease with Telluride Gymnastics Academy at 137 Society Drive, plus the usual gondola update and quarterly reports.",

  "norwood|2026-06-09|Board of Trustees Meeting":
    "Agenda not yet available",

  "norwood|2026-06-15|Planning and Zoning Commission Meeting":
    "The commission takes up two land-use code items. It will consider Resolution 0615-2026, recommending amendments to the Norwood Land Use Code to adopt the updated 2026 DarkSky International outdoor-lighting standards, alongside a discussion of the Dark Sky Coalition's updated rules. It also reviews a Current Conditions Analysis as part of the broader Land Use Code update. The consent agenda is limited to approving the May 18 minutes. 6:30 p.m. at Norwood Town Hall, with a Zoom option.",

  "county|2026-05-25|Open Space Commission Meeting":
    "Open Space Commission meeting",

  "county|2026-06-03|Board of County Commissioners Meeting":
    "Regular commissioner meeting · Agenda details not yet available",

  "county|2026-06-11|Planning Commission Meeting":
    "Agenda not available",

  "county|2026-06-17|Board of County Commissioners Meeting":
    "The commissioners will interview candidates for the Board of Adjustment and Planning Commission — Jonathan Prince for a direct appointment, and three applicants competing for an alternate Planning Commission slot. They'll get an update on affordable housing from the county's housing specialist, along with routine wastewater variances for two Ophir properties. The consent agenda includes adopting the latest Community Wildfire Protection Plan and approving a liquor license renewal for The Blue Jay in Placerville.",

  "county|2026-06-22|Open Space Commission Meeting":
    "The Open Space Commission meets June 22 to work through several active trail and open space projects. On the table: a NEPA process update for the Perimeter Trail, new signage for the Keystone Gorge Loop Trail, and a conversation about future goals for the San Juan Skyway Scenic Byway Corridor. Conceptual plans for Mill Creek Park and an update on the Down Valley Connector Trail through Sawpit are also on the agenda. The commission will also address two vacancies — one regular seat and one alternate — plus a Northwest Mountain seasonal slot.",

  "county|2026-06-24|Board of County Commissioners Work Session":
    "MEETING CANCELED — the Board of County Commissioners' June 24 work session has been canceled. The next BOCC meeting is the regular meeting on July 1.",

  "telluride|2026-06-23|Special Meeting - HARC and P&Z - Jun 23 2026":
    "A joint subset of HARC and P&Z meets for one hour to work through proposed amendments to the Town's Land Use Code and Design Guidelines — changes needed to bring Telluride into alignment with the Colorado Wildfire Resiliency Code. Whatever language they recommend goes to Town Council for the final call. Wildfire code compliance has been working its way through mountain communities across the state; this is Telluride's turn to reconcile state requirements with local historic and architectural standards — two frameworks that don't always sit comfortably together.",

  "telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026":
    "A joint special session of P&Z and HARC — one hour, one item. The two commissions will review proposed amendments to the Town's Land Use Code and Design Guidelines needed to bring Telluride into consistency with the Colorado Wildfire Resiliency Code. Whatever they recommend moves to Town Council for final consideration. Wildfire code alignment has been on the horizon for mountain communities across the state; this is Telluride working through what that means for local rules on materials, design, and land use.",

  "telluride|2026-06-17|Historic & Architectural Review Commission Chair - Jun 17 2026":
    "The Historic & Architectural Review Commission Chair will review two projects: aluminum window replacements at 324 W Colorado (a contributing historic structure in an alley) and a deck expansion at 714 E Columbia. Both applications face staff recommendations for disapproval — the windows for introducing aluminum into a historic wood garage that's supposed to maintain its utilitarian character, and the deck for being too large and reducing the building's stepping down to Shadow Lane. The 324 W Colorado item was continued from May and includes a pre-meeting site walk.",

  "telluride|2026-06-17|Historic & Architectural Review Commission - Jun 17 2026":
    "HARC reviews three projects with varying scope. Two minor Certificate of Appropriateness amendments for existing homes at 239 N Aspen and 566 W Columbia — routine changes that don't create new site plans. The bigger item is a large-scale preliminary review for new construction at 208 S Fir that hits the 5,000-square-foot threshold requiring full commission review. There's also a 3:00 PM site walk at the Fir Street property. Two projects at 238 N Pine continue getting pushed to August.",

  "telluride|2026-06-17|Parks & Recreation Commission - Jun 17 2026":
    "The Parks & Recreation Commission will set the 2026-2027 ice rink schedule and approve a modest fee increase for winter programs. The Hanley Ice Rink schedule runs October 7 through March 3, dividing ice time between hockey clubs, figure skating, curling, school district PE, and public skating slots. The hourly rate for winter programs is going up 3.7% — from $88.85 to $92.12 per hour — driven by higher utility costs and reduced operational hours from last winter's warm weather.",

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
    "The Telluride Hospital District board meets June 25 with a full slate of internal matters. The heaviest item on the agenda is a 45-minute discussion of mill levy considerations — the taxing mechanism that funds the district, and a recurring pressure point as the hospital works toward a new facility. Board members will also spend time on new facility updates and partnership updates, plus a communications strategy discussion. The finance committee and CFO will walk through May 2026 draft financials. Consent items include ratification of an updated investment policy.",

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    "The commission holds a work session on the Shandoka Lot Redevelopment Project— the major Town-owned redevelopment proposal brought forward by Design Workshop. The commission gives feedback to staff and the applicant before formal Land Use Code review begins. You can read more about this project [here](https://livabletelluride.org/deep-dive-carhenge.html).",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    "The Chair was scheduled to take up the 238 N Pine Street minor subdivision (a request to split a 7,500 sq ft Historic Residential lot into two), but the applicant has asked for it to be continued again — to the July 23 P&Z meeting. No substantive action is expected at this meeting. 4:00 PM at Rebekah Hall.",

  "telluride|2026-05-28|Planning & Zoning Commission Chair - May 28 2026":
    "The May 28 Planning & Zoning Commission Chair meeting agenda hasn't been posted yet.",

  "ouray|2026-06-03|The Planning Commission will conduct a regular meeting and hold a public hearing to consider and make recommendation on an application for a 6-lot regular PUD in the South Mesa Zone (Packet Materials are attached to the agenda)":
    "The Planning Commission will review a 6-lot subdivision proposal in the South Mesa Zone — a public hearing where neighbors can weigh in before commissioners make their recommendation to the county.",

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    "A full agenda for June 30. The most consequential item is first reading of Land Use Code amendments ahead of Colorado Wildfire Resiliency Code implementation — the kind of code change that will set the baseline for how development and fire risk interact in the box canyon for years to come. Council also takes up second readings on two property sales (907 East Colorado Avenue and Longwill 16 Unit B3), a tap fee waiver IGA with the Telluride School District, and a renewal of the Black Hills Energy gas franchise. An emergency ordinance banning open fires and fireworks rounds out the public hearing docket — not unusual for late June. A work session on the Telluride Energy Mitigation Program looks at updates to energy use offset calculations and fees. Community survey results get a work session too.",

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    "The July 1, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    "The July 1, 2026 Commission for Community Assistance, Arts & Special Events agenda hasn't been posted yet.",

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    "The July 1, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    "The July 1, 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "county|2026-07-01|Board of County Commissioners Meeting":
    "The July 1, 2026 Board of County Commissioners Meeting agenda hasn't been posted yet.",

  "county|2026-06-10|Board of Review and Planning Commission Joint Work Session":
    "The county's Board of Review and Planning Commission will hear a presentation on Colorado's new Low Energy and Carbon Code — building standards that could reshape how structures get approved in the box canyon.",

  "county|2026-06-08|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board meets to review junior livestock sale terms and update bylaws for the upcoming fair season.",

  "telluride|2026-07-06|Open Space Commission - Jul 06 2026":
    "The July 6, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-06-11|San Miguel Authority for Regional Transportation - Jun 11 2026":
    "The June 11, 2026 SMART agenda hasn't been posted yet.",

  "county|2026-07-08|Board of County Commissioners Work Session":
    "The July 8 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "smart|2026-07-09|SMART Board of Directors":
    "The July 9 SMART Board of Directors agenda hasn't been posted yet.",

  "county|2026-06-18|Lodging Tax Board 06/18/26":
    "The Lodging Tax Board meets to review tax reports and hear updates from the Norwood Chamber and Telluride Tourism Board. Standard quarterly check-in on how lodging tax dollars are being distributed and used across the county.",

  "county|2026-07-09|Planning Commission Meeting":
    "The July 9, 2026 Planning Commission Meeting agenda hasn't been posted yet.",

  "telluride|2026-06-12|Judicial Subcommittee - Jun 12 2026":
    "The June 12, 2026 Judicial Subcommittee agenda hasn't been posted yet.",

  "telluride|2026-06-15|Corrected Agenda for Open Space Commission Site Walk - Jun 15 2026":
    "The Open Space Commission will walk the Tilman-Beam Corral site at Lot B in the Pearl Subdivision to review corral and fence conditions. They'll meet at the Shell Station on Highway 145 at 4 PM before heading to the property.",

  "telluride|2026-06-15|Gondola Subcommittee - Jun 15 2026":
    "The Gondola Advisory Committee meets to discuss federal funding timelines and local commitments for gondola replacement. The main focus is FTA Capital Investment Grant requirements — SMART needs $18M committed for project development work by fall 2026 to enter the federal program, with partners (Town of Telluride, Mountain Village entities) needing to formalize their share of a $140M total project cost. The committee will also hear updates from SMART and local jurisdictions, plus discuss next steps for the funding process.",

  "county|2026-07-14|Historical Commission":
    "The July 14 Historical Commission agenda hasn't been posted yet.",

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    "The July 15, 2026 Historic & Architectural Review Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    "The July 15, 2026 HARC agenda hasn't been posted yet.",

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    "The July 15, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-07-15|Board of County Commissioners Meeting":
    "The July 15, 2026 Board of County Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    "A short one for this session. The Telluride Housing Authority meets June 30 to approve minutes from May and handle two organizational items: appointing members to a newly forming Resident Advisory Committee, then conducting a random drawing to stagger member terms. The advisory committee structure is worth watching — resident voice in housing decisions has been a recurring tension in the valley.",

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    "The July 16, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    "The July 16, 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "county|2026-07-08|Board of County Commissioners Special":
    "The July 8 Board of County Commissioners Special Meeting agenda hasn't been posted yet.",

  "fire|2026-07-21|Board of Directors Meeting":
    "The July 21, 2026 Fire Board of Directors Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    "The July 21, 2026 Town Council agenda hasn't been posted yet.",

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    "The July 22 Board of County Commissioners Special Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    "The July 23, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    "The July 23, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    "The June 25, 2026 Planning & Zoning Commission Chair meeting has been cancelled."
};

/* ── Post-meeting "Rick" recaps ───────────────────────────────────────
   A plain-spoken ~100-word summary of what happened at a meeting, in the
   voice of "Rick" (a long-time local). Gov-Hub shows each recap as a
   "Past Meeting Summaries" card for 3 days after the meeting date, then it
   drops off automatically. Extracted from the meeting video transcript
   (see the vote-tracker pipeline). Append new recaps to the TOP.
   Schema: { sourceKey, sourceLabel, date (YYYY-MM-DD), title, recap,
             videoUrl }                                                    */
const MEETING_RECAPS = [
  { sourceKey:'telluride', sourceLabel:'Town of Telluride', date:'2026-06-09',
    title:'Town Council — Jun 9, 2026',
    videoUrl:'https://www.youtube.com/watch?v=vxrKceCqXaM',
    recap:"A housing-heavy June meeting. Council gave first-reading approval to selling two more deed-restricted units (907 East Colorado and Longwell 16), accepted the 2025 audit, and approved a first reading of the Black Hills gas franchise. The fire-restriction ordinance passed on second reading. Three residents were reappointed to commissions and the airport board. The one split vote was a partial waiver of school-district tap fees for teacher housing, which passed 4-2 with Stark and Enright opposed. Fee was absent." },
  { sourceKey:'county', sourceLabel:'San Miguel County', date:'2026-06-03',
    title:'Board of County Commissioners — Jun 3, 2026',
    videoUrl:'https://www.youtube.com/watch?v=3nSAqRc0Cpk',
    recap:"A land-and-housing day for the BOCC. They approved an additional $100,000 to the Telluride Foundation's Housing Opportunity Fund and renamed their new fast-track development rule from 'Accelerated' to 'Prioritized' Housing Review. A bouldering gym in Illium received a PUD amendment, accessory-dwelling-unit sizing was clarified, and new on-site wastewater regulations were adopted. All votes passed 3-0." },
  { sourceKey:'county', sourceLabel:'San Miguel County', date:'2026-05-27',
    title:'Board of County Commissioners — May 27, 2026',
    videoUrl:'https://www.youtube.com/watch?v=CkFxc1DpoNM',
    recap:"The commissioners approved two Ophir septic setback variances, released a 2024 deed-restriction settlement on a Lawson Hill lot, and accepted a state (DOLA) housing-planning grant. All votes were unanimous. An earlier Placerville session that day was a work session with no votes." },
  { sourceKey:'county', sourceLabel:'San Miguel County', date:'2026-05-20',
    title:'Board of County Commissioners — May 20, 2026',
    videoUrl:'https://www.youtube.com/watch?v=xDE7B7x2C5U',
    recap:"The commissioners approved the consent agenda and appointed two residents to community boards — Jackie Kenik to the Lone Tree Cemetery board and Marcus Kirkwood to the San Miguel Basin Fairboard. They updated the County's drug-and-alcohol policy and approved a conduit-and-fiber exchange with Clear Networks. Two land-use hearings followed: a lot-line vacation near Sawpit and a multi-year logging and wildfire-mitigation permit on Wilson Mesa. They also adopted the state's septic Regulation 43 Appendix A, keeping variance authority at the county level. All votes were 3-0." },
  { sourceKey:'county', sourceLabel:'San Miguel County', date:'2026-05-14',
    title:'Planning Commission — May 14, 2026',
    videoUrl:'https://www.youtube.com/watch?v=R9nnXLvOGCY',
    recap:"The two contested public hearings — the Garlock and Crockett applications on the Mesas — were tabled and withdrawn. The Commission recommended approval of a PUD amendment for a climbing gym in the former Illium tire shop and a code amendment defining 'footprint' and clarifying ADU maximum size. It also recommended adopting an accelerated review process for affordable housing to keep San Miguel eligible for Prop 123 funding. All recommendations go to the BOCC." },
  { sourceKey:'county', sourceLabel:'San Miguel County', date:'2026-05-13',
    title:'Board of County Commissioners — May 13, 2026',
    videoUrl:'https://www.youtube.com/watch?v=Q6xLvyjwDgs',
    recap:"A special session focused on presentations and public comment. The board heard from a Rights Mesa resident about an HOA and code-enforcement dispute, reviewed the parks and open space work plan, and discussed housing funding with the Telluride Association of Realtors, including a proposed state vacancy tax that failed at the Legislature. The formal votes were unanimous: green grants, a letter of support for a street-safety grant, and gift cards for spring-cleanup volunteers." },
  { sourceKey:'telluride', sourceLabel:'Town of Telluride', date:'2026-05-19',
    title:'Town Council — May 19, 2026',
    videoUrl:'https://www.youtube.com/watch?v=U3QyzfSWDlE',
    recap:"Council adopted the federal Safe Streets and Roads for All regional transportation safety plan and a Vision Zero resolution targeting no traffic deaths by 2040. They authorized acquisition of a town employee unit at Mandota, approved a first reading of new fire-restriction rules, and reappointed Carly Shaw to the Election Commission. They also granted a seasonal rooftop shade structure for the National building on Colorado Avenue, with conditions. Meehan Fee was absent; all votes were 6-0." },
  { sourceKey:'telluride', sourceLabel:'Town of Telluride', date:'2026-04-28',
    title:'Town Council — Apr 28, 2026',
    videoUrl:'https://www.youtube.com/watch?v=vWaP0Ba4GYY',
    recap:"A housing-focused meeting. The Stender HARC appeal was continued at the appellant's request. Council reappointed Peter Sante to the Planning & Zoning Commission and adopted second readings authorizing the sale of two deed-restricted units — the Element 52 unit on South Davis and the Silverjack unit on West Pacific — to lottery winners. Sitting as the Housing Authority, they adopted a policy temporarily suspending certain waitlist rules, with a set sunset date, to reduce vacancies. Meehan Fee was absent." }
];

const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "Art in action",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Telluride Plein Air runs June 29–July 5, with invited painters working at easels along Main Street and nearby scenic spots. The Quick Draw competition on July 2 challenges artists to finish a piece in 90 minutes; exhibitions and sales run July 3–5 in Oak Street and Elms parks. Paintings can be purchased wet off the easel.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_4fcd4e03-8616-4b12-a68f-439b35cf921f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/8b/c8b7c334-f80f-4d54-bada-1626a191875a/6a3a4e35bdf48.image.jpg",
    imgHiRes: true
  },
  {
    title: "Grand Mesa Writers’ Symposium features local wordsmiths",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "The second annual Grand Mesa Writers’ Symposium is set for Sept. 11-13, and this year’s ambitious event will feature four talented individuals with deep Colorado connections. The three-day event is intended to inspire writers, readers, and book lovers.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/norwood_post/article_8af44439-d60b-4d7a-a140-ae8bcb66f298.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/8d/e8da4f89-97f9-4069-ad21-1e20a4ae773f/6a3ac1b1511e7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Olympian skier Bode Miller pleads not guilty to Idaho misdemeanor drug charges",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "public-safety",
    copy: "Bode Miller, the six-time Olympic medalist, pleaded not guilty to misdemeanor drug charges in Idaho after a sheriff's deputy found him with 4.1 grams of psilocybin mushrooms. Idaho has some of the nation's strictest drug laws, though neighboring Colorado has legalized psilocybin for therapeutic use.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fdc646b7-89fe-5981-8395-245aac89bbbe.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/eb/3eb4bef7-d4b3-5c21-98a1-4ff3c1a91d21/6a3b202368366.image.jpg",
    imgHiRes: true
  },
  {
    title: "A party where the past meets the present",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Telluride Theatre is hosting the Muleskinner's Ball, a fundraising gala blending early 1900s wild west Telluride with live pop-up performances, casino games, a secret speakeasy, and a buffet dinner. Funds support artist pay, venue costs, programs, and the mortgage on office space the organization purchased last year. Telluride Theatre also took over the middle/high school drama program in 2025 after a longtime teacher retired.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_92e80cd9-0fef-47b9-b267-4042ab2d0018.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/a3/0a3dc82b-b051-4a69-a4f5-cd1bb21ff908/6a3acd7b8004c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Former Colorado analyst pleads guilty in DNA testing scandal",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "A former Colorado Bureau of Investigation DNA analyst pleaded guilty and faces 8–16 years in prison for altering and deleting forensic data across cases involving homicide, sexual assault, and robbery. At least one murder conviction was overturned, hundreds of cases are under review, and the fallout could cost Colorado over $11 million.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fc275fb9-ae95-5c69-975b-ecd480d72128.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/92/9925a063-2561-5b9c-be59-16030bc6f892/6a3b18fb1f281.image.jpg",
    imgHiRes: true
  },
  {
    title: "Norwood Preschool receives top marks in education",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "land-use",
    copy: "Norwood Preschool earned a Level 5 rating from Colorado Shines — the highest possible mark in Colorado's voluntary quality system for licensed early care programs. The rating followed a three-hour state observation and document review. The play-based program serves around 20 kids ages 3–4 annually.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_13743ca3-47e6-403f-8324-59865ce523e3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/0f/90fed00b-4458-435b-b257-5512a7ddf256/6a3ab2216a0e6.image.webp",
    imgHiRes: true
  },
  {
    title: "Analog bags",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "A columnist reflects on \"analog bags\" — totes stocked with non-digital activities like journals or sketchbooks — as a social media trend and personal rediscovery after a camping trip near Gateway left phones nearly dead. Without screens, the orioles and the Dolores River came through clearer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_994bfc5a-45a5-4b19-9f33-f693a5ba9a0a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/08/9082f483-bf86-4ba3-bc9f-853fa807f1a0/6a3aec0b31509.image.jpg",
    imgHiRes: true
  },
  {
    title: "The rainbow beyond Oz",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "health",
    copy: "This is a personal Father's Day reflection by Stan Brooks, a part-time Telluride resident and Emmy-winning filmmaker, on experiencing his first year as a grandfather. He writes about the unexpected emotional intensity of grandparenthood compared to parenting, including the science behind \"grandfather brain\" and oxytocin release. A community member sharing a personal milestone.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_1caa1d01-a579-4b22-b79a-c1137e420a22.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/f9/7f901c02-8dfb-48ca-b7c8-a95575406658/6a3aec943e006.image.jpg",
    imgHiRes: true
  },
  {
    title: "Look up at the night sky",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "The Telluride area still holds onto genuinely dark skies, something the author — an off-grid mesa resident — credits partly to solar-powered homes that don't waste energy on outdoor lighting after dark. Light pollution is erasing that experience for much of the world, along with the health benefits tied to natural dark-light cycles.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_0f6e6a21-52cf-4a99-ac59-af96a0a0cf73.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/95/c95b2983-db7a-4f1f-84de-a0b4b148e9a3/6a3aead128b96.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Mushroom Festival to honor Katrina Blair",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "The Telluride Mushroom Festival will honor the late Katrina Blair, a 16-year festival contributor known for her annual Durango-to-Telluride foraging walk and the Wild Foods Dinner. This year's dinner (Aug. 14, Ah Haa rooftop) continues the tradition, with Mila Garelle making the journey and gathering plants along the route. A free public memorial is set for Aug. 15 at Elms Park.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_381d9f6c-932e-4ee1-8281-a2fa6a4f2abe.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/d0/dd0d329f-f9cb-49fd-8ba8-1a753ebb8660/6a3ae9d1407f4.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Breeders show",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "housing",
    copy: "This piece isn't a Telluride Times article — it's a personal essay about attending a Breeders concert in Maine. There's no local Telluride news, policy, or community information to summarize here. No card can be generated from this content.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_3077e4a4-034f-4a33-894c-b249699ac869.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/b0/eb02b27f-652b-43ff-8b38-ed62f5119b16/6a3ae8b36e075.image.jpg",
    imgHiRes: true
  },
  {
    title: "All things wellness",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "The Telluride Yoga Festival returns June 25–28 across Mountain Village and Telluride for its 18th season — its biggest yet, with 1,200 passholders, 50 presenters, and 150+ offerings including yoga, breathwork, meditation, hiking, and equine therapy. About 26% of attendees are local residents; the rest come from all 50 states and beyond. Many free public events run daily throughout the festival.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_119bdb3b-96a7-4823-9921-f3ce090d1538.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/4d/34df2b7b-ebe5-4835-bd30-9c75b7f87713/6a3ac6382ce06.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Bluegrass Festival astounds",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-23",
    newsTopic: "arts-culture",
    copy: "Sam Bush anchored this year's Telluride Bluegrass Festival across multiple sets — with Tedeschi Trucks Band, Larkin Poe, Jake Shimabukuro, Leftover Salmon, and Greensky Bluegrass. Renée Fleming singing \"Ave Maria\" accompanied only by Béla Fleck's banjo stood out as a quiet highlight. Sierra Hull, Shimabukuro, and first-timers Dallahan and Alash rounded out a notably wide-ranging lineup.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_c2d45aa1-2ba5-49cb-b903-fcf3608376bf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/0e/c0e8308a-eb16-4314-b6e6-5e0ebdf76089/6a3a57dd9d203.image.jpg",
    imgHiRes: true
  },
  {
    title: "Housing and the environment",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-23",
    newsTopic: "land-use",
    copy: "Nearly half of San Miguel County workers commute 25+ miles, with transportation making up 30% of local emissions. The county needs roughly 1,100 new housing units by 2030. More homes close to town would cut commutes and emissions, though advocates note it doesn't fix the deeper displacement problem.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7e2ae631-ad66-4171-a7bb-16e0afca004c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/35/6359fa98-3753-4424-9fb7-8510347a2bf2/6a391a4d3d1bf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Munchie Mansion is a new eatery in Placerville",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-22",
    newsTopic: "community",
    copy: "Munchie Mansion, a food trailer at 260 Front St. in Placerville, opened in March run by Jenni Watkins and her daughter Aspen. It serves handmade sandwiches, sides, and espresso using Telluride Coffee Roasters beans, Monday–Friday, 10am–4pm. Dinner service is planned for later this summer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_9d05a760-b3f2-4345-947d-02c7bf92ff3a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/e5/8e553ba1-8595-4d5c-8b98-84b7caf90acf/6a31b60d0bdce.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Threads of sound’",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-22",
    newsTopic: "arts-culture",
    copy: "Telluride Chamber Music returns to the Mai residence barn for three evening concerts June 28–July 5, featuring an accomplished ensemble of violinists, cellist, and pianist, plus guest clarinetist Alan Kay from Juilliard. Programs include works by Brahms, Mozart, Debussy, Gershwin, and Copland. A Local Artists' Night is also scheduled June 30.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_ce72d8c6-e7f3-46f2-846a-529ca94e23f4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/a5/ba56e910-dc41-4628-afeb-b4f75e839c5e/6a391393f2918.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wyndham Clark avoids record collapse and holds on to win the US Open",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-22",
    newsTopic: "community",
    copy: "Wyndham Clark won his second U.S. Open title at Shinnecock Hills, finishing at 4-under after a final-round 73, holding off a late charge by Sam Burns. He led wire-to-wire, the first player to do so at the U.S. Open since 2014. His father flew overnight from Denver to watch him win for the first time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_2dfa6045-3d42-50d3-8d67-378ce6f4ffdb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/5f/85ff96ce-ec9b-566b-9232-80f9c06de7c0/6a386d86ea740.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wyndham Clark wins his second U.S. Open title with wire-to-wire victory at Shinnecock Hills",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-22",
    newsTopic: "community",
    copy: "The article text appears to be a mix of unrelated items, but the most locally relevant item is the Colorado Supreme Court ruling. Here's the summary focused on that:\n\n---\n\nThe Colorado Supreme Court ruled June 15 in favor of the Town of Telluride, deciding that planned unit development (PUD) agreements are administrative matters — not legislative ones — and can't be changed through citizen ballot initiatives.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_741c8fd1-5de3-5dac-aec3-248d0ce3eb06.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "True North, Juvenile Diversion programs team up for youth",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-22",
    newsTopic: "education",
    copy: "True North and San Miguel County's juvenile diversion program joined forces this spring for a first-ever multi-day college tour, taking students from Telluride, Norwood, and Nucla to visit four schools and two national parks across southern Colorado. The trip was funded through an opioid prevention grant and a Colorado Department of Human Services program. Both organizations hope to make the extended overnight format an annual tradition.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d6449172-ab41-482d-b4d5-c74c1415f80c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/dd/5ddbec01-609b-4606-b58e-a3643c3d7351/6a31b91e9d10d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Court ruling will protect open space in Butcher Creek",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-21",
    newsTopic: "land-use",
    copy: "Colorado's Supreme Court unanimously ruled that the Butcher Creek PUD agreement can't be amended through a ballot initiative, keeping Lot A as common open space. The court found Brighton's proposal attempted to bypass the town's required administrative review process. The 37-acre hillside parcel carries steep slopes, geologic hazards, and bedrock — factors that demanded specialized municipal oversight.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a35ab12e-3137-49bf-80e7-278cc26eda89.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/11/2112bc34-deea-4afa-b03b-c1ef73ab051f/6a3566c709038.image.jpg",
    imgHiRes: true
  },
  {
    title: "Rico Trails Alliance receives grant for bridge project",
    source: "Telluride Times",
    date: "June 20, 2026",
    firstSeen: "2026-06-20",
    newsTopic: "infrastructure",
    copy: "The Rico Trails Alliance has raised over $300,000 — including a $250,000 Colorado Parks and Wildlife grant and $40,000 from the Telluride Foundation — to build a 68-foot ADA-compliant pedestrian bridge spanning the east fork of the Dolores River near Rico. The bridge anchors the RGS River Trail, linking Rico's rec facilities and the old Rio Grande Southern railroad grade to hundreds of miles of Forest Service trails.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d0cf73ba-3f29-4037-a93a-6a60886242c3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/73/873b82ff-8683-45c3-af51-3f30ea87d3b8/6a32698771b03.image.jpg",
    imgHiRes: true
  },
  {
    title: "The soul of the West",
    source: "Telluride Times",
    date: "June 20, 2026",
    firstSeen: "2026-06-20",
    newsTopic: "recreation",
    copy: "A longtime Telluride-area resident reflects on 35 years living at the confluence of two rivers on the Uncompahgre Plateau, tracing roots from a Sonoran Desert childhood in Tucson to the Western Slope. The piece moves through personal observations — petroglyphs, monsoon rainbows, wildfire smoke, winter squalls — as meditations on place and time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_2eb36a10-3147-437b-8935-90158fe0e902.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/b7/5b7f3f51-d1c4-4ae9-9ef5-47b3c10edbf1/6a31bb6dbc01b.image.webp",
    imgHiRes: true
  },
  {
    title: "Sierra Hull embodies new bluegrass generation of genre busters",
    source: "Telluride Times",
    date: "June 20, 2026",
    firstSeen: "2026-06-20",
    newsTopic: "arts-culture",
    copy: "Much of the bluegrass world first met Sierra Hull a year after she started learning mandolin, when she met Sam Bush as a fourth grader and had her first of countless impromptu jams with Sam.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_ccd5bf74-2043-4d36-bd76-ed763fa5e790.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/02/20223a93-b43c-42a2-a1c0-01c290f6b72d/6a2cdfe5814ac.image.jpg",
    imgHiRes: true
  },
  {
    title: "Bluegrass bites and buys",
    source: "Telluride Times",
    date: "June 19, 2026",
    firstSeen: "2026-06-20",
    newsTopic: "arts-culture",
    copy: "When the Bluegrass Festival hits Telluride, local retailers and restaurateurs tend to follow the Scouts’ motto, “Be prepared.” Shops and eateries are well stocked with festivarians’ needs in mind, offering specialty goods and festival-friendly menu items.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_5f947d77-1ff0-40ad-a878-8b3ea8c1e00c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/9c/59c20dc7-fd46-4854-887d-c6259f2f436d/6a30efecbeb06.image.jpg",
    imgHiRes: true
  },
  {
    title: "A most beautiful commute",
    source: "Telluride Times",
    date: "June 19, 2026",
    firstSeen: "2026-06-20",
    newsTopic: "community",
    copy: "A writer describes the daily routine of catching an 8 a.m. ferry that carries island schoolchildren to the mainland — the buggy ride down a dirt lane past bougainvillea, the harbor sounds, and the familiar scramble not to miss the one thing in the country that runs on time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_9255a32d-c3f0-4a8a-968a-1006ae5dcad4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/3c/e3ca20de-df9f-4cd3-9799-8449e974041a/6a3191a500501.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Impossible ideas’ flourish at this year’s Bluegrass",
    source: "Telluride Times",
    date: "June 19, 2026",
    firstSeen: "2026-06-19",
    newsTopic: "arts-culture",
    copy: "Looking back on 44 years of Béla Fleck playing the Telluride Bluegrass Festival, audiences have learned to expect the unexpected.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_a87f737d-c724-4832-97c6-bba719309e1d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/0c/60cae73d-3ec7-47be-815e-55aab92918ee/6a2e0b3c8fc7b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wyndham Clark seizes on changing nature of Shinnecock to lead US Open",
    source: "Telluride Times",
    date: "June 19, 2026",
    firstSeen: "2026-06-19",
    newsTopic: "housing",
    copy: "The USGA set up a different course at Shinnecock Hills to handle strong wind Thursday. When the wind subsided later, Wyndham Clark seemed to play a different U.S. Open. He took advantage of the gentler conditions, pulling away to reach…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_794045f7-c36a-5ceb-9f06-600ac299f284.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/c6/5c6fa879-d4aa-5fee-8d9e-a4b998252ab5/6a34a41ec6208.image.jpg",
    imgHiRes: true
  },
  {
    title: "Five years after a Navajo elder vanished, the man who robbed her was released from prison",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-19",
    newsTopic: "infrastructure",
    copy: "Five years to the day Navajo elder Ella Mae Begay disappeared, the man who acknowledged beating her and leaving her on the side of the road is free from prison. Preston Tolth pleaded guilty to robbing Begay and was sentenced…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_23648ead-b435-52f6-a7f3-835255a06ac5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/78/b78c743a-5325-5878-8598-1344be3031c5/6a348139ac276.image.jpg",
    imgHiRes: true
  },
  {
    title: "A trip to Bluegrass changed her life",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-19",
    newsTopic: "community",
    copy: "Emily Dwan’s first trip to Telluride came in 2010, when her family gathered to visit her older sister, Jenny, who had relocated to Durango from suburban Illinois for work.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_eba393de-e081-4012-a78b-5a57112acd53.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/7f/a7ff0fff-37f9-49ff-8061-e9d07dfc7463/6a2cd53e748c5.image.jpg",
    imgHiRes: true
  },
  {
    title: "The cathedral tree",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-19",
    newsTopic: "infrastructure",
    copy: "In a steep fold of land near Sawpit stands a blue spruce so enormous it stops people in their tracks. From the road, it rises above the surrounding forest like something ancient and improbable; a tree less observed than encountered.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_8672b2da-93d9-4466-afba-a1005703e790.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/0f/70f776b1-3109-4dbc-ae78-adad8e103e3f/6a318fec1cda3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Families of kids with disabilities warn Education Department changes could break a flawed system",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "housing",
    copy: "Parents of kids with disabilities say they have waited months for the Education Department to address complaints of bullying or discrimination. Now, the department is offloading civil rights enforcement and special education, raising concerns about further chaos. On Tuesday, the…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_725d3ce6-9ce1-5dac-aeb9-8b16fa147e13.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/68/a6858de1-2983-5f12-867f-0a64df83e7f5/6a33729ab42b8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Bluegrass brothers",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "community",
    copy: "It’s hard to say how much of the DNA of Telluride Bluegrass is actually bluegrass.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_4542a375-f6aa-430a-8303-89dc325a685f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/8f/f8f9939d-0ea1-42b7-8441-09455f348758/6a3100e01b44c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Towns, County implement stage 1 fire restrictions",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "public-safety",
    copy: "The Towns of Telluride and Mountain Village, as well as San Miguel County, have implemented stage 1 fire restrictions in response to heightened fire danger.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_70e341d7-cf81-451c-8943-d2f4b1ba555a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/2a/b2a92ba2-985f-4e30-9ee4-5e5fd767450d/6a341b719b62c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for June 18-24, 2026",
    source: "Telluride Times",
    date: "June 18, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "community",
    copy: "A foreclosure sale is scheduled for July 16, 2026 at 10 a.m. at 305 W. Colorado Ave. in Telluride for a property at 122 43ZS Road in Norwood, with an outstanding balance of roughly $115,000 on a 2009 Wells Fargo deed of trust. A separate estate notice sets an October 18, 2026 deadline for creditor claims in San Miguel County probate case 26PR30006.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Masterful, ‘heartburn-inducing’ performances on an intimate stage",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "arts-culture",
    copy: "One of the hottest tickets to the Telluride Bluegrass Festival doesn’t involve a ticket at all. It’s a seat at an open-air “workshop” in Elks Park.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_b4f48345-93f7-4c80-91b0-6f4da8b5fd31.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/7f/47fe6efd-9e14-43f8-8461-0d4bb7dd39c8/6a2e06f1afbbb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Small molecules at the origins of life",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "arts-culture",
    copy: "In a town surrounded by peaks that have stood for millions of years, silent witnesses to the long, slow drama of Earth’s transformation, it isn’t hard to feel the weight of deep time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_76f13598-181c-4cdd-8ff3-cbb2fbe9fe82.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/60/360b6020-f959-4635-a821-e8dbbef75ede/6a318b7745711.image.jpg",
    imgHiRes: true
  },
  {
    title: "Summer fun with your best friend",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "community",
    copy: "Before heading out on summer trails with your dog, check that vaccinations are current, leash rules are followed, and you're packing enough food, water, and basic first-aid supplies. Streams can carry harmful parasites, and waste should always be packed out. Second Chance Humane Society in Ridgway also has adoptable dogs if you're looking for a trail partner.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_5052f986-1380-444b-a0ef-057e89e4188b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/b5/6b58ac41-299f-43f6-99d4-6dfbd28ad731/6a32d15c11f2e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Federal judge, bestselling author Roy Altman to speak in Telluride",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "community",
    copy: "Federal judge and Yale Law School graduate Roy Altman speaks in Telluride on June 30 at 5:30 p.m., drawing on his book *Israel on Trial* to examine how legal standards of evidence apply to contested historical and political claims. Tickets are $10 and include a copy of the book.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_55be3fc5-6ac0-4b3c-8c6e-a21c3edb8a48.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Yonder, Szwarc elected to SMPA board",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "government",
    copy: "Joanna Yonder won the SMPA District 3 board seat, defeating incumbent David Alexander 228–178. In District 6, incumbent Valentine Szwarc held on, 179–171 over challenger Tricia Savage. SMPA board members serve four-year terms, elected by co-op members across seven districts.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_58cf11c3-ad10-4dbe-9d9f-d0578f392b0d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/4b/04b1908d-1923-476d-ba0c-d6fe504c3bcb/6a32c995d6167.image.jpg",
    imgHiRes: true
  },
  {
    title: "Play It Forward pickleball tournament fundraises for SMRC",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "community",
    copy: "SMRC, one of San Miguel County's oldest nonprofits serving survivors of domestic violence and sexual assault, is holding a pickleball fundraiser June 28 at Telluride Racquet Club in Mountain Village. Federal funding cuts are pressing on the organization. All skill levels welcome; registration at smrcco.org/events.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_135741c3-c073-4c37-b9e8-505682e27bcd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/0d/b0d269cd-ce31-4dc6-bc21-b63d61102e16/6a32ca6a38d34.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride deserves better",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "community",
    copy: "Residents across Telluride — workers, seniors, commuters, longtime locals — are raising concerns about proposed development, housing, and financing decisions they say they weren't meaningfully informed about. Common themes: unclear costs, vacant workforce units before 250 more are built, and a public process many can't participate in due to work schedules.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_e8370c3d-bc39-4acd-ac85-0854d3916528.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Madelaine WhiteU",
    imgHiRes: true
  },
  {
    title: "Is Telluride Paradise?",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "community",
    copy: "Telluride sits at the dead end of a box canyon with one paved evacuation route — Highway 145. Two proposed high-density developments in the canyon's southwest throat would add housing and vehicles near that single exit, with no public wildfire egress analysis completed. April snowpack in the basin hit 9% of its 30-year median, and a statewide drought emergency is active.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_0a47afcd-25ba-46c5-b953-131783c38019.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Kate FedacU",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of June 18-24",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "government",
    copy: "To ensure that your birthday is listed, email utetrailclub@yahoo.com. For other events, email mia.rupani@telluridetimes.com.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d557e234-3f27-4790-9574-34267075077a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/58/b5804c72-d95d-45cf-a165-549035b858c1/6a32c8e79d4c3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Vote for Marya Stark",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "government",
    copy: "A Telluride resident is endorsing Marya Stark for town council, citing her composure during the Telluride Ski and Golf labor dispute and her background in finance. The letter, signed by Dan Enright, points to her work ethic and ability to handle both high-pressure moments and routine municipal business.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_4723ca4f-db9e-4228-9168-b09c27162ec1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Dan Enright",
    imgHiRes: true
  },
  {
    title: "With gratitude to SMPA District 3",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "education",
    copy: "Joanna Yonder has been elected to the SMPA District 3 board, succeeding Dave Alexander, who served 16 years. She thanked voters and volunteers, noting the campaign was built on community effort. She acknowledged the Western Slope faces complicated energy decisions ahead.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_d1d75e38-ec22-4340-bc9c-f94cb6a69bf4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Joanna Yonder",
    imgHiRes: true
  },
  {
    title: "With gratitude to SMPA District 3",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "education",
    copy: "Joanna Yonder won the San Miguel Power Association District 3 board seat in the June 4 election, succeeding Dave Alexander, who served 16 years in the role. She credited community outreach for her campaign and acknowledged the Western Slope is entering a complicated period for energy.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_1090ef24-041f-45d1-8b55-ca2dd118b475.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/f9/8f939b57-1ce4-4bf3-89e3-efa596231507/6a32c73611113.image.jpg",
    letterAuthor: "Joanna Yonder",
    imgHiRes: true
  },
  {
    title: "Rico’s Fireweed has a new owner",
    source: "Telluride Times",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    newsTopic: "public-safety",
    copy: "Emily Thorn’s path to Fireweed, the Rico café and mercantile that she purchased from founder/owners Chelsey Rajavuori and Matt Guerti in March, took a little while.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_f7697606-40d0-41ec-9f80-ad2ddf7a6f48.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/5e/c5edd619-4823-4736-aba7-d0b2005fb4c0/6a30e744a0f94.image.jpg",
    imgHiRes: true
  },
  {
    title: "The family forged by theater",
    source: "Telluride Times",
    date: "June 16, 2026",
    firstSeen: "2026-06-16",
    newsTopic: "arts-culture",
    copy: "In the summer of 1999, my husband (then boyfriend) Travis and I moved to Telluride. Travis came to ski. I came to start a children’s theater company. We both came to be together.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_b0a15262-fe8d-43db-a2cc-339a9cde4826.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/88/688fd068-0afb-4bab-8f61-c0a7d2589729/6a2b4d6d50fb9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Steward for an uncertain future: Telluride Town Council candidate Charles Dalton",
    source: "Telluride Times",
    date: "June 16, 2026",
    firstSeen: "2026-06-16",
    newsTopic: "government",
    copy: "Of the three candidates running for two seats on Telluride Town Council in the June 30 special election, Charles Dalton is the “old-timer,” having lived in Telluride for 10 years.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d1f22fd4-022a-49f6-a26d-2d556533adf8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/e4/0e411176-7121-4f5b-8b1c-3efdf057083a/6a30fd9376842.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘People over self’: Telluride Town Council candidate Chris Uihlein",
    source: "Telluride Times",
    date: "June 16, 2026",
    firstSeen: "2026-06-16",
    newsTopic: "government",
    copy: "Chris Uihlein is serious about wanting to get to know his fellow candidates for Telluride Town Council. He knows Charles Dalton a bit from the Monday night winter curling league they both participate in and he knows Marya Stark from…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_25ae29a6-e2a9-4b47-8c6d-5528fec8a9fb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/fb/8fba0e1a-9241-458d-a6b7-30cd3d3bee4a/6a30f60f61b4f.image.jpg",
    imgHiRes: true
  },
  {
    title: "All things wellness",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-23",
    newsTopic: "community",
    copy: "The Telluride Yoga Festival runs June 25–28 across Mountain Village and Telluride, marking its 18th season with a record 1,200 passholders, 50 presenters, and 150+ offerings. Free daily events include yoga in Elms Park, live music, fireside chats, and more. About 26% of attendees are local residents; the rest come from all 50 states and beyond.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_119bdb3b-96a7-4823-9921-f3ce090d1538.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/4d/34df2b7b-ebe5-4835-bd30-9c75b7f87713/6a3ac6382ce06.image.jpg",
    imgHiRes: true
  },
  {
    title: "No surprises: Telluride Town Council candidate Marya Stark",
    source: "Telluride Times",
    date: "June 16, 2026",
    firstSeen: "2026-06-16",
    newsTopic: "government",
    copy: "She’s only been on the job for approximately six months, but it’s been a full agenda for Telluride Town Council member Marya Stark, and she’s ready to dial down on the kinds of surprises council and the community have been…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_18e52cae-4f5b-4d68-ae21-71b301384ac7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/a3/8a36df49-72ba-403a-8faa-317408ac8772/6a30fa8544efa.image.jpg",
    imgHiRes: true
  },
  {
    title: "Small cart, big flavor",
    source: "Telluride Times",
    date: "June 16, 2026",
    firstSeen: "2026-06-16",
    newsTopic: "infrastructure",
    copy: "The newest food cart in town, Benji Biber’s Mini Deli, is located at the Oak Street Gondola Plaza and serves fresh, made-to-order breakfast sandwiches from morning until the afternoon.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_c78aeb7d-1f1e-4fcf-a243-43810af97bc7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/b3/ab314a9c-3cdf-40ca-bbef-659678381807/6a30ae0d9bcbe.image.jpg",
    imgHiRes: true
  },
  {
    title: "Birding for health",
    source: "Telluride Times",
    date: "June 15, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "health",
    copy: "“There is an unreasonable joy to be had from the observation of small birds going about their bright, oblivious business”",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_a85e4f1b-ece7-48ca-9f0e-b690c56fbc5c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/36/3364de8d-3aa7-4f11-8966-289492ab6173/6a2b4b9d8dbe5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Boulder bet $34 million to land Sundance. High lodging prices are raising concerns.",
    source: "Telluride Times",
    date: "June 15, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "arts-culture",
    copy: "Boulder's hosting of the Sundance Film Festival is causing a stir over high accommodation costs. Some homes in the Colorado town are listed for over $5,000 a night, much higher than in Park City, Utah. Property managers expect prices to…",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_de0027b0-84f0-58c2-a343-c80bcea8d54e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride installs outdoor warning siren to improve emergency alerts",
    source: "Telluride Times",
    date: "June 15, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "arts-culture",
    copy: "The town just installed its first outdoor warning siren, funded by a $25,000 Telluride Foundation grant, to address emergency communication during packed festival times when cell service gets jammed. The siren can broadcast eight different pre-recorded messages for situations like wildfires or floods and should be operational before Bluegrass starts June 18. Fire officials would like to eventually add more sirens throughout the county as funding becomes available.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b2f12888-10ba-4d66-9c72-797fdcd50bd5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/1d/81d34e98-64e8-4bb7-8510-2b2d9095c45d/6a2cd91b932a8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Shades of the season",
    source: "Telluride Times",
    date: "June 14, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "community",
    copy: "Telluride Arts is launching two community art shows this summer. \"The Color of Summer\" opens July 2 and invites artists to create works in whatever single color they feel best defines the season, running through October. \"This Is Colorado\" features over 120 one-square-foot canvases depicting artists' visions of the state for its 150th birthday, with locations in both Telluride and Mountain Village through August 1.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_2b8e7efc-eaa5-42b0-a151-475128fbc69f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/17/d17e963c-3647-4dc0-9584-8179e1d2f584/6a2b562591fd2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Run for good",
    source: "Telluride Times",
    date: "June 14, 2026",
    firstSeen: "2026-06-14",
    newsTopic: "infrastructure",
    copy: "The annual Rundola race is back July 4th with a major change - Forest Service permits now require runners to stay on Telluride Trail instead of taking multiple routes like the straight-up Coonskin option. This year's race focuses on raising money for the Good Neighbor Fund, which has helped over 200 locals since early 2024 deal with emergencies from housing costs to medical bills, especially after the recent strike and poor snow season hit so many people hard.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_bf63620b-b013-435e-b903-f34e32bd10b5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/cf/5cf25f00-552c-4489-96cc-7ee3fe73b005/6a2b52f2c1e00.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump administration opens public lands to off-road use",
    source: "Telluride Times",
    date: "June 13, 2026",
    firstSeen: "2026-06-14",
    newsTopic: "infrastructure",
    copy: "The Trump administration rescinded executive orders that restricted off-road vehicle use on public lands, though no immediate changes are happening to local trails or OHV designations around here. Conservation groups say this signals a broader shift toward prioritizing motorized access and resource extraction over ecosystem protection, potentially putting roadless areas like Hope Lake, Ice Lake and the Dolores River corridor at risk down the road.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b0c1e98d-3a0a-49c7-ac01-d0126eddf1d7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/b7/db76ab80-bdb9-448d-9a31-1ac8bd70656f/6a2b5032da0af.image.jpg",
    imgHiRes: true
  },
  {
    title: "Good vibrations — water makes them possible",
    source: "Telluride Times",
    date: "June 13, 2026",
    firstSeen: "2026-06-14",
    newsTopic: "infrastructure",
    copy: "Dr. Heyden from Arizona State University will present at Telluride Science Town Talks about how water enables vibrations within cells, research that could lead to more targeted medications with fewer side effects and cleaner industrial processes. His work explores using water as an alternative to toxic chemical solvents in manufacturing, potentially reducing pollution and energy consumption. The free talk runs 6:30-7:30 p.m. at the Conference Center as part of the summer series bringing world-class researchers to town.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_5c004b0c-9a31-4647-a348-63561f401a8a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/0c/c0cd50bf-c2bb-4ad1-8448-11e1d1c3ef43/6a2b4736547da.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wright’s Mesa Disc Golf Course lands new home",
    source: "Telluride Times",
    date: "June 13, 2026",
    firstSeen: "2026-06-13",
    newsTopic: "arts-culture",
    copy: "The Wright's Mesa Disc Golf Course found a new home in Mountain Village after being displaced by Norwood's new school construction. The Town of Mountain Village is providing free use of 37 acres at 1545 Spruce Street until the land is eventually developed for housing. West End residents who originally financed the course through individual basket purchases are volunteering to rebuild the nine-hole layout, which should be ready for summer league play.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_547d13da-a89e-480b-9f57-6036d8e38a4a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/84/5846f840-9e2b-4d51-ac2b-adc7461e6406/6a2b035620bde.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Music is just such a vital way that communities tell their stories’",
    source: "Telluride Times",
    date: "June 12, 2026",
    firstSeen: "2026-06-13",
    newsTopic: "arts-culture",
    copy: "Although Telluride Bluegrass is best known for its exceptional musical talent, the festival also comes with a dash of science.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_2b0f2184-b419-456f-b251-7b8ca0ec0a58.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/03/80330c81-ecb9-4d2a-9ddf-3a719fdf520e/6a2935bd7c432.image.jpg",
    imgHiRes: true
  },
  {
    title: "Where to enjoy Norwood’s summer scores",
    source: "Telluride Times",
    date: "June 12, 2026",
    firstSeen: "2026-06-13",
    newsTopic: "community",
    copy: "Wright’s Mesa is waking up to summer with the sounds of guitar-picking, cello and violin.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_e8ac482b-c3a4-4c1e-b830-af336769c162.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/de/9deb3305-3fc3-4475-af64-5d963c9a9065/6a2afce94c807.image.jpg",
    imgHiRes: true
  },
  {
    title: "A global gap year",
    source: "Telluride Times",
    date: "June 12, 2026",
    firstSeen: "2026-06-12",
    newsTopic: "community",
    copy: "The world is a big place, but for Jula Cieciuch and Hutson Chaffin, the world feels a bit smaller now — in a very good way.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_ee0fdf4a-3140-4966-8795-22fd5877f354.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/4b/14b1eee1-b10e-4c1d-8a41-a88ea481d743/6a29325a35eef.image.jpg",
    imgHiRes: true
  },
  {
    title: "Good vibrations — water makes them possible",
    source: "Telluride Times",
    date: "June 12, 2026",
    firstSeen: "2026-06-12",
    newsTopic: "infrastructure",
    copy: "Dr. Matthias Heyden from Arizona State University will present a free science talk Tuesday at 6:30 p.m. at the Telluride Conference Center about water's role in molecular vibrations that make biology possible. His research into how water enables protein movement could lead to more targeted medications with fewer side effects and cleaner industrial processes using water instead of toxic chemical solvents.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_a3ed19e7-0f56-43e7-9aed-6199e1427ace.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Judge considers arguments in challenge to New Mexico's universal childcare program",
    source: "Telluride Times",
    date: "June 11, 2026",
    firstSeen: "2026-06-11",
    newsTopic: "community",
    copy: "A New Mexico judge is weighing whether to let a lawsuit proceed that challenges the state's universal childcare program, which covers daycare costs for all working families regardless of income. The program launched in November and has already seen enrollment and costs exceed projections, raising sustainability questions even as it's funded by oil and gas revenues. Other states are watching closely as New Mexico becomes the first to offer this level of childcare coverage.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9ae95e10-abf4-5301-aec8-333fe72aeafb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/1f/a1f4ddb0-8770-512e-b915-5a58f38d3a2c/6a2a37903fbc4.image.jpg",
    imgHiRes: true
  },
  {
    title: "A ‘positive’ award winner",
    source: "Telluride Times",
    date: "June 11, 2026",
    firstSeen: "2026-06-12",
    newsTopic: "community",
    copy: "When Matt Oakes is on call, he’s on call for all.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_00cb5216-f3de-4731-a147-c31701bb904c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/9c/c9ceba60-cf01-4cc3-b8b5-dc56ad5c5951/6a2926365a29e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Summer Stampede Week",
    source: "Telluride Times",
    date: "June 11, 2026",
    firstSeen: "2026-06-11",
    newsTopic: "education",
    copy: "The first week of Summer Stampede Week was a complete success. Elementary students enjoyed learning about pioneer life through various educational activities and playing card games to review their math skills.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_e113dda9-21b5-4607-908b-bf92c4e519d1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/41/b411cd1a-1782-4278-825e-ad1ea7a47ef4/6a2b00d3851a8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sunset’s silver jubilee back where it belongs",
    source: "Telluride Times",
    date: "June 11, 2026",
    firstSeen: "2026-06-11",
    newsTopic: "arts-culture",
    copy: "The Sunset Concert Series returns to its longtime home at Sunset Plaza for its 25th anniversary season after a location dispute last summer between Telluride Ski & Golf and the Mountain Village Owners Association was resolved. Nine free Wednesday evening concerts run from June 24 through August 19, featuring an eclectic lineup from New Orleans funk to West African jazz to reggae.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_981334cd-cc1a-4d91-9c0b-8a260d824521.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/81/581b8b89-0d7d-4bae-a88d-7610ed764824/6a293887b6430.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for June 11-17, 2026",
    source: "Telluride Times",
    date: "June 11, 2026",
    firstSeen: "2026-06-11",
    newsTopic: "community",
    copy: "A San Miguel County property at 1730 Grand Avenue in Norwood is heading to foreclosure auction on July 30th at the Telluride courthouse. The foreclosure stems from the death of the property owners who had a $249,750 loan from 2009 that now has an outstanding balance of over $309,000.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Telluride Implements Stage 1 Fire Restrictions",
    source: "Town of Telluride",
    date: "June 18, 2026",
    newsTopic: "public-safety",
    copy: "(June 17, 2026) – In response to heightened fire danger across the region, Town Manager Zoe Dohnal has implemented Stage 1 Fire Restrictions within the Town of Telluride, effective 1:00 a.m. MT on Thursday, June 18, 2026.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=396",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15584"
  },
  {
    title: "Colorado Supreme Court Rules Unanimously That Butcher Creek PUD Cannot Be Amended or Rezoned by...",
    source: "Town of Telluride",
    date: "June 16, 2026",
    newsTopic: "land-use",
    copy: "(June 15, 2026) – The Colorado Supreme Court today issued a unanimous decision in Kavanaugh v. Telluride Locals Coalition Petitioners’ Committee et al. (2026 CO 47), ruling in favor of the Town of Telluride and reversing the Colorado Court of Appeals.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=395",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15579"
  },
  {
    title: "Town of Telluride Releases Findings of Independent Investigation",
    source: "Town of Telluride",
    date: "June 10, 2026",
    newsTopic: "recreation",
    copy: "(June 10, 2026) – Telluride, CO – The Town has released the findings of an independent investigation conducted by Investigations Law Group (ILG) regarding former Mayor Pro Tem Meehan Fee’s involvement in discussions and negotiations with Telski.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=394",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15572"
  },
  {
    title: "Commissioners Finalize Deed Restriction Reversion Process",
    source: "San Miguel County",
    date: "June 18, 2026",
    newsTopic: "housing",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1401",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=13313"
  },
  {
    title: "Mill Creek Park Site Closed for Revegetation",
    source: "San Miguel County",
    date: "June 18, 2026",
    newsTopic: "recreation",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1400",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14312"
  },
  {
    title: "Beaver Park Gravel Pit Closure",
    source: "San Miguel County",
    date: "June 17, 2026",
    newsTopic: "recreation",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1399",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14098"
  },
  {
    title: "Bike to Work Day!",
    source: "San Miguel County",
    date: "June 17, 2026",
    newsTopic: "community",
    copy: "Join us for Bike To Work Day on June 24th!",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1398",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14309"
  },
  {
    title: "County Enters Stage 1 Fire Restrictions",
    source: "San Miguel County",
    date: "June 17, 2026",
    newsTopic: "public-safety",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1397",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14307"
  },
  {
    title: "Imogene Pass is Open",
    source: "San Miguel County",
    date: "June 23, 2026",
    newsTopic: "community",
    copy: "Imogene Pass is now open on the San Miguel County side. Please check with Ouray County for up-to-date conditions on their side of the pass.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=532",
    img: ""
  },
  {
    title: "Black Bear Road (CR K69) Closure for Roadwork June 25, 2026 from 6:00 am to 5:00 pm",
    source: "San Miguel County",
    date: "June 22, 2026",
    newsTopic: "infrastructure",
    copy: "PUBLIC NOTICE – ROAD CLOSURE Black Bear Road (CR K69) Closure for Roadwork",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=531",
    img: ""
  },
  {
    title: "Stage 1 Fire Restrictions in effect for all unincorporated, privately owned land in the county, effective Thursday, June 18th at midnight",
    source: "San Miguel County",
    date: "June 17, 2026",
    newsTopic: "public-safety",
    copy: "Expanded: Stage One Fire Restrictions will be in place for all unincorporated, privately owned land in San Miguel County effective Friday 6/18/26 at 11:59 pm.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=525",
    img: ""
  },
  {
    title: "Clerk's Office Shortened Office hours June 15-18 and June 29-July 2",
    source: "San Miguel County",
    date: "June 15, 2026",
    newsTopic: "community",
    copy: "The Clerk's Office will have shortened office hours the weeks of June 15-18 and June 29-July second. The office hours will be 9:00 am - 5:00 pm Monday through Thursday.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=530",
    img: ""
  },
  {
    title: "Stage 1 Fire Restrictions In Effect",
    source: "Town of Telluride",
    date: "June 17, 2026",
    newsTopic: "public-safety",
    copy: "In response to heightened fire danger across the region, Town Manager Zoe Dohnal has implemented Stage 1 Fire Restrictions within the Town of Telluride, effective 1:00 a.m. MT on Thursday, June 18, 2026.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=65",
    img: ""
  },
  {
    title: "Click here for details.",
    source: "Town of Ridgway",
    date: "June 24, 2026",
    firstSeen: "2026-06-09",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Stage-1-Fire-Restrictions-Press-Release-2026-06-09-acc.pdf",
    img: ""
  },
  {
    title: "Town of Ridgway 2026 Drinking Water Quality Report Covering Data for Calendar Year 2025",
    source: "Town of Ridgway",
    date: "June 24, 2026",
    firstSeen: "2026-06-18",
    newsTopic: "infrastructure",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/RIDGWAY-TOWN-OF---CO0146676---2026-CCR.doc_0.pdf",
    img: ""
  },
  {
    title: "Ridgway receives Local IMPACT Accelerator Award",
    source: "Town of Ridgway",
    date: "June 15, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Local-IMPACT-Accelerator-Grant-PR-2026-06-15.pdf",
    img: ""
  },
  {
    title: "Movie Mondays 8:30pm in Hartwell Park",
    source: "Town of Ridgway",
    date: "June 24, 2026",
    firstSeen: "2026-06-04",
    newsTopic: "arts-culture",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Movie-Mondays-Poster-2026.pdf",
    img: ""
  },
  {
    title: "Planting Trees in Ridgway - Species Recommendations Brochure",
    source: "Town of Ridgway",
    date: "June 24, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TreesToPlant%20Brochure%202021.pdf",
    img: ""
  },
  {
    title: "Notice and Call of Special Meeting of the Ridgway Town Council",
    source: "Town of Ridgway",
    date: "June 16, 2026",
    firstSeen: "2026-06-03",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Special-Meeting-Notice.pdf",
    img: ""
  },
  {
    title: "Ridgway Town Council Special Meeting Agenda",
    source: "Town of Ridgway",
    date: "June 16, 2026",
    firstSeen: "2026-06-12",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June-16-special-meeting-agenda.pdf",
    img: ""
  },
  {
    title: "Ridgway Planning Commission Meeting Agenda",
    source: "Town of Ridgway",
    date: "June 17, 2026",
    firstSeen: "2026-06-12",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00-2026.06.17-%28PC-Agenda%29.pdf",
    img: ""
  },
  {
    title: "Ridgway Sustainability Advisory Board Meeting Agenda",
    source: "Town of Ridgway",
    date: "June 18, 2026",
    firstSeen: "2026-06-15",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/SAB-Meeting-Packet---June-18%2C-2026.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 6-22-26",
    source: "KOTO Community Radio",
    date: "June 23, 2026",
    newsTopic: "recreation",
    copy: "First Responders See Busy Weekend; Mountain Village Considers Ethics Code Changes",
    href: "https://koto.org/news/newscast-6-22-26/"
  },
  {
    title: "Newscast 6-17-26",
    source: "KOTO Community Radio",
    date: "June 18, 2026",
    newsTopic: "education",
    copy: "On this week's Regional Roundup, we hear about a poetry festival that took place recently in the Four Corners. Then, we hear from our rural climate reporter on how the Colorado River is at a tipping point due to severe drought, over allocation, and climate change. These issues were discussed at a conference at the law school at CU Boulder. Then, we",
    href: "https://koto.org/news/newscast-6-17-26/"
  },
  {
    title: "Newscast 6-15-26",
    source: "KOTO Community Radio",
    date: "June 16, 2026",
    newsTopic: "government",
    copy: "Telluride Discusses Town Council Ethics Code; The Photography of Humanity and Climate Change",
    href: "https://koto.org/news/newscast-6-15-26/"
  },
  {
    title: "Newscast 6-12-26",
    source: "KOTO Community Radio",
    date: "June 13, 2026",
    newsTopic: "public-safety",
    copy: "On this week's Regional Roundup, we hear about a jazz festival in northern New Mexico that celebrates Indigenous jazz music. Then, we head to the Roaring Fork Valley on Colorado's Western Slope to hear about efforts to create safe passages for wildlife crossing highways. After that we head to Wyoming to hear how goats are being used for fire mitiga",
    href: "https://koto.org/news/newscast-6-12-26/"
  },
  {
    title: "Newscast 6-11-26",
    source: "KOTO Community Radio",
    date: "June 12, 2026",
    newsTopic: "public-safety",
    copy: "Beehive Fire Burns Over 300 Acres; West End Roundup with the San Miguel Basin Forum; Music Comes to the Mesa",
    href: "https://koto.org/news/newscast-6-11-26/"
  },
  {
    title: "Newscast 6-10-26",
    source: "KOTO Community Radio",
    date: "June 11, 2026",
    newsTopic: "health",
    copy: "Telluride Releases Investigation Report; Adventure Race for Mental Health; Bird Song on the San Miguel",
    href: "https://koto.org/news/newscast-6-10-26/"
  }
];

const KOTO_FEATURED_STORIES = [

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
// Telluride Rotary news — scraped from portal.clubrunner.ca/3291 by
// content-refresh.js (pullRotaryNews). Bot-managed; seeded empty. Same
// firstSeen date model as SMBF (ClubRunner stories carry no publish date).
// Shape: { title, source, sourceKey:'rotary', date, firstSeen, newsTopic,
// copy, href, img }. Rendered on Local News via local-news.html loadLiveData.
const ROTARY_NEWS = [
  {
    title: "Upcoming meetings",
    source: "Telluride Rotary",
    sourceKey: "rotary",
    date: "June 2, 2026",
    firstSeen: "2026-06-02",
    newsTopic: "arts-culture",
    copy: "Normally we meet the 1st and 3rd Wednesdays of the month. Meetings feature member updates, club news, and speakers. We are not meeting the first Wednesday in July due the holiday that week. Join us Wednesday, July 15, 6pm at our new town meeting place, MountainFilm's office at 122 S Oak Street. Emai",
    href: "https://portal.clubrunner.ca/3291/Stories/upcoming-meetings-1",
    img: ""
  },
  {
    title: "The Second Annual Hikeathon Is Happening In June, Register Now!",
    source: "Telluride Rotary",
    sourceKey: "rotary",
    date: "June 2, 2026",
    firstSeen: "2026-06-02",
    newsTopic: "arts-culture",
    copy: "Help us make the Hikeathon a success! Telluride Rotary is back with its signature community event to promote health and camaraderie while also raising much-needed funds for Telluride Rotary and other nonprofits. Sign up here to participate, or visit the site to make a donation: https://go.dojiggy.io",
    href: "https://portal.clubrunner.ca/3291/Stories/the-second-annual-hikeathon-is-happening-in-june-register-now",
    img: "https://clubrunner.blob.core.windows.net/00000003291/Images/Hikathon-simplified-logo-SMALL.png"
  },
  {
    title: "Rotary Youth Exchange: Info for Students and Potential Host Families",
    source: "Telluride Rotary",
    sourceKey: "rotary",
    date: "June 2, 2026",
    firstSeen: "2026-06-02",
    newsTopic: "infrastructure",
    copy: "Rotary Youth Exchange student Chochi from Colombia with his host family—Alison, Eric, and Fletcher Dale—and club President Kate Wadley. Update: We will send one Telluride High student abroad to the Czech Republic for the 2026-27 school year, and we will host a student in Telluride during that school",
    href: "https://portal.clubrunner.ca/3291/Stories/rotary-youth-exchange-info-for-students-and-potential-host-families",
    img: "https://clubrunner.blob.core.windows.net/00000003291/Images/IMG_0219_20260321-130223.jpeg"
  },
  {
    title: "Congratulations Telluride Rotary Scholarship Recipients",
    source: "Telluride Rotary",
    sourceKey: "rotary",
    date: "June 2, 2026",
    firstSeen: "2026-06-02",
    newsTopic: "community",
    copy: "Congratulations Class of 2026! The Telluride Rotary Club is proud to award $23,000 in scholarships this year plus an additional $500 for our Service Above Self awards. Many thanks to our Scholarship Committee chair Lauren Bloemsma and these Rotary members who served on the committee: Jim Austin, Mar",
    href: "https://portal.clubrunner.ca/3291/Stories/congratulations-telluride-rotary-scholarship-recipients",
    img: "https://clubrunner.blob.core.windows.net:443/00000003291/Images/IMG_6664_20260528-230509.jpeg"
  },
  {
    title: "Recent Grants and Service by Telluride Rotary Club",
    source: "Telluride Rotary",
    sourceKey: "rotary",
    date: "June 2, 2026",
    firstSeen: "2026-06-02",
    newsTopic: "education",
    copy: "Telluride Rotary Club takes pride in making several grants, giving scholarships to high school seniors, and participating in community service projects. Below are highlights since of our club's actions to make a positive difference: gave $23,000 in May of 2026 in scholarships to high school seniors ",
    href: "https://portal.clubrunner.ca/3291/Stories/recent-grants-and-service-by-telluride-rotary-club",
    img: "https://clubrunner.blob.core.windows.net/00000003291/Images/1000015658_20250103-032420.jpeg"
  }
];

// As genuinely-new articles appear at the top of the SMBF landing
// page over the coming weeks, the bot will add them with firstSeen=today
// and the array will naturally shed the sentinels via the same logic.
const SMB_FORUM_ARTICLES = [
  {
    title: "Norwood native Wyatt Hughes summits Everest",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "June 10, 2026",
    firstSeen: "2026-06-10",
    newsTopic: "community",
    copy: "Wyatt Hughes, a Norwood native and the son of Howard Hughes, reached the top of Mount Everest May 28 at 12:30 p.m. How does the son of a western Colorado rancher, from a remote place like Norwood, …",
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-native-wyatt-hughes-summits-everest,118050",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260609-202440-699-F1%20-%20everest.JPG"
  },
  {
    title: "Johnson makes new CORA request, questions town leadership",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "June 3, 2026",
    firstSeen: "2026-06-03",
    newsTopic: "community",
    copy: "Mimi Johnson, vocal opponent to the newly erected cell tower in Nucla, shared with the Forum she contacted Nucla Town Hall that she was conducting a Colorado Open Records Act (CORA). In …",
    href: "https://www.sanmiguelbasinforum.com/stories/johnson-makes-new-cora-request-questions-town-leadership,117346",
    img: ""
  },
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
  }
];

// Hand-curated featured items for the Local News page. The bot never rewrites
// this array (it only manages TELLURIDE_TIMES_ARTICLES / KOTO_* / SMB_*), so a
// pinned letter or feature here is stable. local-news.html prepends these and
// honors `featured: true`. Set `isLetter: true` to get the Letter-to-the-Editor
// treatment (byline + logo) while still using a custom `img` as the hero.
const LOCAL_NEWS_FEATURED = [
  {
    title: "Is Telluride Paradise?",
    source: "Letter to the Editor",
    sourceKey: "letter",
    date: "June 17, 2026",
    summary: "Paradise, California was a beautiful mountain town until the 2018 Camp Fire killed 85 people. Kate Fedack draws a direct comparison to Telluride -- a wildland-urban interface community at the dead end of a box canyon with one primary paved way out -- and asks why dense new development at the canyon's throat is advancing with no public wildfire egress analysis.",
    href: "/Blog%20Posts/is-telluride-paradise/",
    img: "/images/blog/telluride-paradise-fire.jpg",
    category: "Opinion",
    isLetter: true,
    letterAuthor: "Kate Fedack",
    featured: true
  }
];

const BLOG_POSTS = [
  {
    title: "The Colorado Supreme Court's \"Butcher Creek\" Decision",
    date: "Jun 17, 2026",
    href: "https://mailchi.mp/99279f8aa0a7/participate-in-the-bocc-meeting-on-december-20251559",
    image: "https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/newsletter-images%2Fbutcher-creek-pud-lot-a.jpg?alt=media&token=48edbaf5-841d-42c8-abea-6beafedc3381",
    excerpt: "The Colorado Supreme Court's ruling in Kavanaugh v. Telluride Locals Coalition holds that a PUD agreement functions like a contract -- it can't be amended without following its own terms and the owner consent they require. We break down what the \"Butcher Creek\" decision means and how it could shape the pending fights over Backman Village/Carhenge and Diamond Ridge/Aldasoro.",
    category: "Newsletter",
    readTime: "4 min",
    source: "mailchimp"
  },
  {
    title: "Come to the Livable Telluride Kickoff Event",
    date: "Jun 9, 2026",
    href: "https://mailchi.mp/862595911df1/come-to-the-livable-telluride-kickoff-event",
    image: "",
    excerpt: "Livable Telluride Kickoff Event Join Us for the Livable Telluride Kickoff Event Please join us tomorrow (Wednesday, June 10) from 5&ndash;7 PM at the Elks Club for the launch of Livable Telluride , a new community resource designed to make local information easier to find, understand, and use, and to bring people together. We'll have appetizers and a cash bar available. Livable Telluride is built ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "Welcome to the New Livable Telluride",
    date: "Jun 2, 2026",
    href: "https://mailchi.mp/4f766c920f0e/participate-in-the-bocc-meeting-on-december-20251398",
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/234a1ccb-fc9c-7aab-8d5f-dab36d775b79.png",
    excerpt: "96 Welcome to the New Livable Telluride Measure 300 process revealed that even in a small, highly engaged community, it is remarkably difficult for residents to keep track of issues ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "From \"Let the People Decide\" to \"Livable Telluride\"",
    url: "https://livabletelluride.org/Blog%20Posts/from-let-the-people-decide-to-livable-telluride",
    date: "Feb 23, 2026",
    readTime: "3 min",
    image: "/images/blog/let-the-people-decide.jpg",
    summary: "The story behind our rebrand — why the mission evolved from a single ballot question to a broader effort to keep Telluride livable for the people who actually live here.",
    category: "Town of Telluride"
  },
  {
    title: "As the Society Turns (the Survey Episode)",
    url: "https://livabletelluride.org/Blog%20Posts/societyturnpud",
    date: "Oct 14, 2025",
    readTime: "2 min",
    image: "/images/blog/society-turn-survey.png",
    summary: "106 residents weighed in on Society Turn — 83% knew about the hospital, but nearly 80% had no idea how much else is planned for that site.",
    category: "County Issues"
  },
  {
    title: "As the Society Turns (the PUD Episode)",
    url: "https://livabletelluride.org/Blog%20Posts/as-the-society-turns-the-pud-episode",
    date: "Oct 11, 2025",
    readTime: "5 min",
    image: "/images/blog/society-turn-pud.png",
    summary: "A deep dive into the Society Turn PUD that even its loudest critics admit is bigger than anyone realized — and why that matters for the valley's future.",
    category: "County Issues"
  },
  {
    title: "Saturday Shot of Finance: If VooDoo Were a Private Development, Would It Already Be Bankrupt?",
    url: "https://livabletelluride.org/Blog%20Posts/saturday-shot-of-finance-if-voodoo-were-a-private-development-would-it-already-be-bankrupt",
    date: "Oct 11, 2025",
    readTime: "4 min",
    image: "/images/blog/voodoo-finance.png",
    summary: "A family stuck in \"affordable housing\" with soaring rent asks the question no one at Town Hall wants to answer — do these numbers actually work?",
    category: "Town of Telluride"
  },
  {
    title: "Why is Rent So Damn High In Telluride!",
    url: "https://livabletelluride.org/Blog%20Posts/why-is-rent-so-damn-high-in-telluride",
    date: "Sep 15, 2025",
    readTime: "5 min",
    image: "/images/blog/rent-so-damn-high.png",
    summary: "Sweet Rants lit up with locals doing the math on new housing projects — and the per-unit costs will make your jaw drop.",
    category: "Town of Telluride"
  },
  {
    title: "From $36 Million to $103 Million: How Telluride Became Richer Than a Lottery Winner",
    url: "https://livabletelluride.org/Blog%20Posts/from-36-million-to-103-million-how-telluride-became-richer-than-a-lottery-winner",
    date: "Sep 13, 2025",
    readTime: "3 min",
    image: "/images/blog/36-to-103-million.png",
    summary: "A 930% budget increase in ten years — this breakdown of where all that money went (and keeps going) is essential reading for any Telluride taxpayer.",
    category: "Town of Telluride"
  },
  {
    title: "Canyonlands Development: A Closer Look at Telluride's Financing",
    url: "https://livabletelluride.org/Blog%20Posts/canyonlands-development-a-closer-look-at-telluride-s-financing",
    date: "Jul 28, 2025",
    readTime: "4 min",
    image: "/images/blog/canyonlands.png",
    summary: "The $26.5M Canyonlands project by Clark's uses a creative 30-year lease structure that every resident should understand before the bonds come due.",
    category: "Town of Telluride"
  },
  {
    title: "Empowering Telluride: The Future of Lot L Development",
    url: "https://livabletelluride.org/Blog%20Posts/empowering-telluride-the-future-of-lot-l-development",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/lot-l.png",
    summary: "A massive parking garage on Lot L could permanently change downtown Telluride's character — here's why community input matters now, not later.",
    category: "Town of Telluride"
  },
  {
    title: "The Sunnyside Project",
    url: "https://livabletelluride.org/Blog%20Posts/the-sunnyside-project",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/sunnyside.png",
    summary: "Completed before costs spiraled, Sunnyside shows how pre-pandemic housing financing worked — and why today's projects can't replicate it.",
    category: "Town of Telluride"
  },
  {
    title: "The VooDoo Project",
    url: "https://livabletelluride.org/Blog%20Posts/the-voodoo-project",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/voodoo-project.png",
    summary: "The VooDoo's $27.4M price tag for 27 units launched at exactly the wrong time — a cautionary tale of what happens when interest rates hit 7%.",
    category: "Town of Telluride"
  },
  {
    title: "The Chair 7 Development Controversy",
    url: "https://livabletelluride.org/Blog%20Posts/the-chair-7-development-controversy",
    date: "Jul 25, 2025",
    readTime: "3 min",
    image: "/images/blog/chair-7.png",
    summary: "A hotel and commercial development on open space near the ski area is the most contentious proposal in years — here's what the PUD amendment actually allows.",
    category: "Town of Telluride"
  },
  {
    title: "The Gondola Station",
    url: "https://livabletelluride.org/Blog%20Posts/the-gondola-station",
    date: "Jul 2, 2025",
    readTime: "1 min",
    image: "/images/blog/gondola-station.png",
    summary: "Three design concepts for a new gondola station could reshape downtown — but without a charter amendment, voters won't get a say.",
    category: "Town of Telluride"
  }
];

const COMMUNITY_EVENTS = [
  {
    title: "2nd Annual Telluride Rotary Hikeathon",
    source: "Telluride Rotary Club",
    date: "May 31, 2026",
    endDate: "June 28, 2026",
    location: "",
    eventTimes: "11:00 AM kickoff",
    img: "https://clubrunner.blob.core.windows.net/00000003291/Images/Hikathon-simplified-logo-SMALL.png",
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

// Telluride Farmers Market — AUTO-RECURRING weekly series (no hand-refresh
// needed each year), same render pattern as MUSIC_ON_THE_GREEN. The market
// runs every Friday from the Friday after Memorial Day (the last Monday of
// May) through the last Friday of September, on South Oak Street, 10:30 AM–
// 3:30 PM. The Fridays are COMPUTED below for the current and next year, so
// the series rolls over automatically — the events.html 60-day rolling window
// only renders upcoming Fridays. (Computed client-side in the browser; the bot
// never extracts this IIFE, only plain `const NAME = [` arrays.) Re-grab the
// hero photo if the market ever changes its branding; the dates take care of
// themselves.
const TELLURIDE_FARMERS_MARKET = (function () {
  const LINK = 'https://www.thetelluridefarmersmarket.com/';
  const LOCATION = 'South Oak Street, downtown Telluride';
  const TIME = '10:30 AM – 3:30 PM';
  const IMAGE = '/img/telluride-farmers-market.webp';
  // All UTC date math so the YYYY-MM-DD strings never drift by timezone.
  const lastMondayOfMay = (y) => {
    const d = new Date(Date.UTC(y, 4, 31));            // May 31
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const lastFridayOfSep = (y) => {
    const d = new Date(Date.UTC(y, 8, 30));            // Sep 30
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const seasonFridays = (y) => {
    const start = lastMondayOfMay(y);                  // step to the first Friday after it
    do { start.setUTCDate(start.getUTCDate() + 1); } while (start.getUTCDay() !== 5);
    const end = lastFridayOfSep(y);
    const out = [];
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  const thisYear = new Date().getUTCFullYear();
  const fridays = seasonFridays(thisYear).concat(seasonFridays(thisYear + 1));
  return fridays.map(date => ({
    title: 'Telluride Farmers Market',
    date: date,
    time: TIME,
    location: LOCATION,
    description: 'The Telluride Farmers Market is open every Friday through the season on South Oak Street in downtown Telluride, 10:30 AM–3:30 PM. Locally produced organic produce, animal products, prepared food, and artisan goods — everything sourced within 100 miles of Telluride.',
    href: LINK,
    imageUrl: IMAGE,
    sourceLabel: 'Telluride Farmers Market',
  }));
})();

// Telluride Science — summer "Town Talk" public-lecture series + workshops at
// the Telluride Innovation Center (300 S. Townsend). AUTO-SYNCED every refresh
// by content-refresh.js Task 22 from the Tribe Events API at
// https://telluridescience.org/wp-json/tribe/events/v1/events/ (same WordPress
// + The Events Calendar stack as KOTO/Sherbino). The entries below are a
// seed/fallback — the bot overwrites them on its first successful run, and if
// the API ever errors the existing array carries forward instead of being
// wiped. The events.html collector applies a rolling 60-day window, so
// out-of-season entries simply don't render until they approach.
const TELLURIDE_SCIENCE_EVENTS = [
  {
    title: "Small Molecules at the Origins of Life",
    date: "2026-06-23",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by David Lacy, University of Buffalo. How did the atoms in the universe come together to form life? At the heart of this mystery is the conversion of small molecules into the building blocks of life, driven by metallocofactors—enzyme-like catalysts conserved across all domains of life. The chemical ancestors of these metallocofactors are thought to have been active prior to the traditional bounds of life, such as dynamic molecular architectures at mineral surfaces in early oceans. Understanding these chemistries in unusual abiotic environments enables unique insight into how life may have started and evolved into its present form. In this talk, I will share some of the exciting new developments in the science of extraterrestrial photosynthesis (the search for light-harvesting life on other planets) and other metal-based processes that underpin life on Earth, and possibly the cosmos. …",
    link: "https://telluridescience.org/event/small-molecules-at-the-origins-of-life/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Tau: A shape-shifting protein that may hold the key to early detection of brain diseases",
    date: "2026-06-30",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by Lukasz Joachimiak, Associate Professor, UT Southwestern Medical Center. Tau is a protein in brain cells that normally helps support their internal structure. In more than 25 brain diseases, including Alzheimer’s, tau can misfold and clump together into harmful fibers. Recent advances in imaging have shown that these tau clumps can take on many different shapes depending on the disease, but it is still unclear how the same protein can form such a wide variety of structures. In this talk, I will describe how we are using both experiments and computational methods to understand the basic rules that guide how tau changes shape and forms these toxic aggregates. By uncovering these rules, we hope to develop better ways to detect specific forms of tau early and design targeted treatments that can stop or prevent these diseases. …",
    link: "https://telluridescience.org/event/tau-a-shape-shifting-protein/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Breakthroughs in RNA Science: From Pond Scum to Life-Saving Medicine",
    date: "2026-07-14",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "Phil Bevilacqua, from Penn State University, will present breakthroughs in RNA medicine over the last decade including using CRISPR for gene editing, developing mRNA vaccines for stopping pandemics and curing cancer, and the investigating the roles of RNA in the origin of life itself.  He will also discuss how investing in basic science has led to these translational breakthroughs.\r\n\r\nTown Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11 (please note the July 28 talk will be at the Sheridan Opera House). Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/breakthroughs-in-rna-science/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Town Talk",
    date: "2026-07-21",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by Clodagh O'Shea, Salk Institute for Biological Studies. The title and topic will be posted soon. \r\nTown Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11 (please note the July 28 talk will be at the Sheridan Opera House). Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/clodagh-oshea/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "The Dual Challenge: Climate and Energy",
    date: "2026-07-28",
    time: "6:30 PM – 7:30 PM",
    location: "Sheridan Opera House, Telluride",
    description: " \r\n\r\nThe world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time.\r\nThree leading voices sit down to examine what this challenge actually looks like — the data, the tradeoffs, and the paths forward. Panelists include Dr. Guy Brasseur, Climate Scientist, NCAR and Max Planck Institute for Meteorology, Georgina Campbell Flatter, CEO of Greentown Labs, and Jeff Guldner, Retired CEO of Arizona Public Service Company and Pinnacle West. \r\nThis event, cosponsored by Telluride Science, Telluride Foundation, and Open Minds, is free and open to the public. \r\nThis special Town Talk will be held at the Sheridan Opera House. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public, but RSVP is required.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/the-dual-challenge-climate-and-energy/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/image.webp",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Single molecule views of Nature’s nanomachines",
    date: "2026-08-04",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children's Hospital, Howard Hughes Medical School. \r\nDid you know that proteins are nano-scale machines that help us think, dance and keep the threat of cancer at bay? Did you know that biology is a new research frontier for physical scientists? In this talk, Professor Ha of Harvard University will discuss how biophysicists are using light-based tools to poke and examine Nature’s nano-machines, one molecule at a time, uncovering the amazing acrobatic abilities that are essential for all forms of life.\r\nTown Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/single-molecule-views-of-natures-nanomachines/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-08-13",
    time: "5:30 PM – 6:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center.  All are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-august/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/ChatGPT-Image-May-27-2026-03_58_05-PM.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Earth's Most Resilient Life, Our Greatest Hope: Exploring Unusual Microbes to Solve Humanity’s Biggest Challenges",
    date: "2026-08-25",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: " \r\n\r\n\r\nThis special town talk, presented by Braden Tierney, cofounder and executive director of the Two Frontiers Project extends the season and will be held in town at the Telluride Innovation Center.  \r\nFrom hydrothermal vents and volcanic seeps to alpine soils and mine drainage right here in Telluride, Earth’s most unusual ecosystems are home to microscopic life with extraordinary abilities. In this talk, Tierney will  share stories from the field and the lab through their team at the Two Frontiers Project. They explore the planet’s microbial diversity in search of “microbial superpowers” that could help tackle pollution, support agriculture, protect ecosystems, and improve human health. With an emphasis on projects ongoing in Colorado, we’ll explore how these invisible ecosystems work, why they matter for everyday life, and how citizen scientists and students can help map this hidden world.\r\nThanks to our title sponsor Alpine Bank.",
    link: "https://telluridescience.org/event/talk-unusual-microbes/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-09-10",
    time: "5:30 PM – 6:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center.  All are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-september/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/ChatGPT-Image-May-27-2026-03_58_05-PM.png",
    sourceLabel: "Telluride Science"
  }
];

// Telluride Rotary Club meetings — hand-curated recurring series (bots don't
// touch this). 1st & 3rd Wednesdays, 6:00 PM (social 5:30); 1st Wed at
// Mountain Lodge in Mountain Village, 3rd Wed at an announced Telluride
// location. No meetings in April. Dates are GENERATED from the viewer's
// current date at page load (rolling), so the list never goes stale. Schedule
// + logo from portal.clubrunner.ca/3291.
const TELLURIDE_ROTARY_MEETINGS = (function () {
  function nthWeekday(year, month, weekday, n) { // month 0-indexed, weekday 0=Sun..6=Sat
    const first = new Date(year, month, 1);
    const day = 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7;
    return new Date(year, month, day);
  }
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const out = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {                 // current month + next 3
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = base.getFullYear(), m = base.getMonth();
    if (m === 3) continue;                       // April — no meetings
    [1, 3].forEach(n => {
      const d = nthWeekday(y, m, 3, n);          // Wednesday = 3
      const first = (n === 1);
      out.push({
        title: 'Telluride Rotary Club Meeting',
        date: iso(d),
        time: '6:00 PM (social at 5:30)',
        location: first
          ? 'Mountain Lodge, 457 Mountain Village Blvd, Mountain Village'
          : 'Announced Telluride location',
        description: 'Telluride Rotary Club meets the 1st & 3rd Wednesdays at 6:00 PM (gathering at 5:30) — 1st Wednesday at Mountain Lodge in Mountain Village, 3rd Wednesday at an announced Telluride location. A service club supporting scholarships, Youth Exchange, international projects, and community grants. Guests welcome; in-person & online options available.',
        href: 'https://portal.clubrunner.ca/3291',
        imageUrl: '/logo/Telluride%20Rotary.png',
        sourceLabel: 'Telluride Rotary',
      });
    });
  }
  return out;
})();

const KOTO_COMMUNITY_EVENTS = [
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
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-06-24/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-06-24T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-06-24/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-06-24T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "This Is Colorado (In One Square Foot) Progressive Opening Reception",
    link: "https://koto.org/event/this-is-colorado-in-one-square-foot-progressive-opening-reception/2026-06-24/1/",
    description: "What does Colorado look like through the eyes of the people who live here? This spring, as part of the local effort to celebrate America’s 250th anniversary and Colorado’s 150th anniversary, Telluride Arts in partnership with the Telluride Historical Museum invited the community to explore this question by submitting artworks for This Is Colorado (In One Square Foot), the region's first community-wide art project. More than 120 artists, ranging from first-time participants to professional creatives, accepted the challenge of telling a Colorado story on a canvas measuring just one square foot, and now their work is ready to be unveiled to the public. Presented with the generous support from the Town of Mountain Village, TMVOA, and CCAASE, This is Colorado (In One Square Foot) will be on view from June 24 through August 1, 2026, from 10 a.m. to 5 p.m. …",
    pubDate: "2026-06-24T22:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-06-24/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-06-24T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "This Is Colorado (In One Square Foot) Progressive Opening Reception",
    link: "https://koto.org/event/this-is-colorado-in-one-square-foot-progressive-opening-reception/2026-06-24/2/",
    description: "What does Colorado look like through the eyes of the people who live here? This spring, as part of the local effort to celebrate America’s 250th anniversary and Colorado’s 150th anniversary, Telluride Arts in partnership with the Telluride Historical Museum invited the community to explore this question by submitting artworks for This Is Colorado (In One Square Foot), the region's first community-wide art project. More than 120 artists, ranging from first-time participants to professional creatives, accepted the challenge of telling a Colorado story on a canvas measuring just one square foot, and now their work is ready to be unveiled to the public. Presented with the generous support from the Town of Mountain Village, TMVOA, and CCAASE, This is Colorado (In One Square Foot) will be on view from June 24 through August 1, 2026, from 10 a.m. to 5 p.m. …",
    pubDate: "2026-06-24T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-25/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-25T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-06-25/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-06-25T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "The play \"12 Incompetent Jurors\" presented by the Norwood Community Players",
    link: "https://koto.org/event/the-play-12-incompetent-jurors-presented-by-the-norwood-community-players/",
    description: "Wide Sky Arts Collective and the Norwood Community Players present \"12 Incompetent Jurors\" &#8230; a parody by Ian McWethey and directed by local Claire Jacobs. Shows are at The Livery on June 25th, 26th, and 27th, doors at 6:30, show at 7, cash bar. The link for discounted advance tickets is at www.norwoodparkandrec.org .",
    pubDate: "2026-06-26T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Livery Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/WSAC-12IJ-Poster.jpg"
  },
  {
    title: "Trick Dog Takeover at Timber Room",
    link: "https://koto.org/event/trick-dog-takeover-at-timber-room/",
    description: "San Francisco's acclaimed Trick Dog brings its inventive approach to cocktails to The Madeline Hotel & Residences for two nights only. Named Best U.S. Cocktail Bar 2025, the celebrated team takes over Timber Room with a menu showcasing the creativity, craftsmanship, and playful spirit that have made it one of the country's most sought-after bar programs. June 26 | Happy Hour on the Terrace The weekend begins on the Timber Room terrace, where mountain views, signature cocktails, and Trick Dog favorites set the tone for a memorable evening. Settle in with drinks, light bites, and good company as the sun dips behind the peaks. June 27 | An Evening in Timber Room Join Trick Dog inside Timber Room for an immersive evening highlighting the bar's acclaimed cocktail program, alongside a curated selection of non-alcoholic offerings and Timber Room's dinner menu. …",
    pubDate: "2026-06-26T06:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/trick-dog.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-26/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-26T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-06-26/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-06-26T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-06-26/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-06-26T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-06-26/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-06-26T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Free Youth Tennis & Pickleball Program",
    link: "https://koto.org/event/free-youth-tennis-pickleball-program/",
    description: "Community Tennis & Pickleball Program This program is available for children ages 8 – 16 to receive free tennis instruction from trained and certified coaches at the Telluride Racquet Club. Goal: This program is designed to reach those who may not be able to participate due to financial constraints. Inclusivity: No one will be turned away based on their ability to pay. No Membership Required. Demo equipment is available at no charge for use during this clinic.",
    pubDate: "2026-06-26T21:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-06-27/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-06-27T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Jennifer Thurston Memorial",
    link: "https://koto.org/event/jennifer-thurston-memorial/",
    description: "Join us at a memorial for long time local and former KOTO newscaster, Jennifer Thurston. Saturday, June 27th from 1pm – 4pm at he Placerville Schoolhouse. Friends and Family will be sharing stories and food – all are welcome!",
    pubDate: "2026-06-27T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Placerville Schoolhouse",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Jennifer-Thurston-1.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-06-27/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-06-28T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "Play It Forward – Pickleball for a Purpose!",
    link: "https://koto.org/event/play-it-forward-pickleball-for-a-purpose/",
    description: "Hey Telluride – grab your paddle! The San Miguel Resource Center is hosting Play It Forward! Pickleball for a Purpose on Sunday, June 28th at the Telluride Racquet Club. All skill levels welcome – and every point you play supports MSRC's 24/7 crisis hotline and youth prevention programs right here in our community. All levels of play are welcome, and if you don't have a racquet and balls, don't worry. We'll supply that for you! Advanced play will begin at 9:30 a.m., and Beginner & Intermediate play at 12 p.m. (noon). Register now at smrcco.org/events. Play it forward, Telluride!",
    pubDate: "2026-06-28T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Pickleball Open Play",
    link: "https://koto.org/event/pickleball-open-play/2026-06-28/",
    description: "Weekly Round Robins Eligibility: Must be rated 2.5+. Requirements: Players should know the rules, scoring, and basic strategy of tennis. Format: Fun, competitive matches with rotating partners each session. Minimum Players: A minimum of 4 players is required for the class to run.",
    pubDate: "2026-06-28T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "San Miguel County Democrats Book Club",
    link: "https://koto.org/event/san-miguel-county-democrats-book-club/2026-06-28/1/",
    description: "The San Miguel County Democrats are hosting a Book Club on Sunday, June 28th, discussing Dan Rather's book \"What Unites Us.\" They will meet at noon at the Wilkinson Public Library in the Telluride Room, and 4:30pm at the Oliver House in Norwood, 1555 Summit St. For more information, please contact Cindy at mtnmama70@gmail.com .",
    pubDate: "2026-06-28T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-06-28/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-06-28T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-06-28/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-06-28T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "San Miguel County Democrats Book Club",
    link: "https://koto.org/event/san-miguel-county-democrats-book-club/2026-06-28/2/",
    description: "The San Miguel County Democrats are hosting a Book Club on Sunday, June 28th, discussing Dan Rather's book \"What Unites Us.\" They will meet at noon at the Wilkinson Public Library in the Telluride Room, and 4:30pm at the Oliver House in Norwood, 1555 Summit St. For more information, please contact Cindy at mtnmama70@gmail.com .",
    pubDate: "2026-06-28T22:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Telluride Medical Center Foundation Classic",
    link: "https://koto.org/event/telluride-medical-center-foundation-classic/2026-06-28/",
    description: "Register Now! Join us for our reimagined and elevated Telluride Medical Center Foundation golf tournament! Sunday, June 28: Calcutta & Cocktails Monday, June 29: Breakfast, Golf, Lunch & Awards",
    pubDate: "2026-06-29T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Golf Club",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Registration-is-Live.png"
  },
  {
    title: "Telluride Medical Center Foundation Classic",
    link: "https://koto.org/event/telluride-medical-center-foundation-classic/2026-06-29/",
    description: "Register Now! Join us for our reimagined and elevated Telluride Medical Center Foundation golf tournament! Sunday, June 28: Calcutta & Cocktails Monday, June 29: Breakfast, Golf, Lunch & Awards",
    pubDate: "2026-06-29T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Golf Club",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Registration-is-Live.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-29/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-29T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Frame Drum Workshop",
    link: "https://koto.org/event/frame-drum-workshop-2/",
    description: "Join world-renowned percussionist Yousif Sheronick for a one-hour hands-on workshop exploring the ancient and transformative art of the frame drum. This session introduces participants to basic strokes and then guides them through rhythm sequences inspired by Egyptian gods, bodies of water, earth, and plant life. This workshop is open to all levels—beginners are welcome. Age 16+. Tickets are free but drums are limited so please email to reserve one! telluridechambermusic@gmail.com",
    pubDate: "2026-06-29T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Frame-drum-1-scaled.jpeg"
  },
  {
    title: "The Mountain Ark: A Ken Bailey Film",
    link: "https://koto.org/event/the-mountain-ark-a-ken-bailey-film/",
    description: "The Mountain Ark: A Ken Bailey Film Lissa Margetts, one of Telluride’s most beloved characters and quintessential figures, connects with animals on a deep level. She is resilient, independent and not to be contained, just like the animals she works with. From childhood she shared a strong connection with animals and her community. After starting the workforce in the defense industry, Margetts decided to return to her mountain community where she founded the Rocky Mountain Ark Wildlife Rehabilitation Center. The Ark was an internationally known institution that sheltered and rehabilitated injured animals on a 14 acre preserve. Her educational outreach program reached over 100,000 school children. The documentary follows Margetts on a day filled with surprise, grief, death and human interactions which leaves the audience in laughter, tears and astonishment. This screening is brought to the community by the PSA Project. …",
    pubDate: "2026-06-29T23:45:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Michael D. Palm Theater, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/THE-MOUNTAIN-ARK-A-Ken-Bailey-Film.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-06-30/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-06-30T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Federal Judge Roy Altman on The Battle for Truth: Why the Israel Debate Matters to Everyone",
    link: "https://koto.org/event/federal-judge-roy-altman-on-the-battle-for-truth-why-the-israel-debate-matters-to-everyone/",
    description: "Drawing from his bestselling book Israel on Trial, federal judge Roy Altman explores how the debate over Israel illuminates broader questions of truth, history, democracy, and civic responsibility in an age of competing narratives. This will be an inclusive conversation.",
    pubDate: "2026-06-30T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Roy-Altman-Event-QR.jpg"
  },
  {
    title: "Town Talk: Tau",
    link: "https://koto.org/event/town-talk-tau/",
    description: "This town talk will be presented by Lukasz Joachimiak, Associate Professor, UT Southwestern Medical Center. Tau is a protein in brain cells that normally helps support their internal structure. In more than 25 brain diseases, including Alzheimer’s, tau can misfold and clump together into harmful fibers. Recent advances in imaging have shown that these tau clumps can take on many different shapes depending on the disease, but it is still unclear how the same protein can form such a wide variety of structures. In this talk, I will describe how we are using both experiments and computational methods to understand the basic rules that guide how tau changes shape and forms these toxic aggregates. By uncovering these rules, we hope to develop better ways to detect specific forms of tau early and design targeted treatments that can stop or prevent these diseases.",
    pubDate: "2026-07-01T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/TT_logo_1048x802_A-3.png"
  },
  {
    title: "Baby Bop",
    link: "https://koto.org/event/baby-bop/",
    description: "Baby Bop is a fun, upbeat babywearing dance class designed for caregivers and little ones to move together through easy-to-follow routines. Expect feel-good music, simple choreography, and a supportive atmosphere focused on bonding, movement, and joy — no dance experience required! Baby Bop es una clase de baile divertida y animada, diseñada para que cuidadores y pequeños se muevan juntos mediante rutinas fáciles de seguir. Te espera música alegre, coreografías sencillas y un ambiente de apoyo centrado en el vínculo, el movimiento y la alegría; ¡no se requiere experiencia previa en baile!",
    pubDate: "2026-07-01T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-01/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-01T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-07-01/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-07-01T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-07-01/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-07-01T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Telluride Venture Network's Pitch Day",
    link: "https://koto.org/event/telluride-venture-networks-pitch-day/",
    description: "TVN's Climate Solutions Investment Bootcamp culminates in a high-energy Pitch Day. Come listen to some of the most cutting-edge startups from across the Four Corners region present and learn how they are solving the most pressing climate issues. The hour goes by quickly, so stick around at the Show Bar to mingle with the cohort afterward.",
    pubDate: "2026-07-01T22:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Sheridan Opera House, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Town-of-Mountain-Village-Events-1800x900-1.png"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-07-01/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-07-01T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Yin Yang Yoga with Miriah",
    link: "https://koto.org/event/yin-yang-yoga-with-miriah/",
    description: "Yin Yang yoga is a combination of Vinyasa Flow (yang) incorporating Hatha and Kundalini with Yin Restorative poses. We'll be warming up with some movement and Vinyasa flow and settle into longer yin restorative poses. Best of both worlds. Bring your own mat if you can; the library has a limited supply. This class is free and open to the public of all skill levels. Donations to the instructor are welcome.",
    pubDate: "2026-07-02T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MIRIAH-2.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-02/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-02T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-07-02/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-07-02T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Art Walk Telluride",
    link: "https://koto.org/event/art-walk-telluride/2026-07-02/",
    description: "Join us the first Thursday of every month for Telluride's Art Walk. It will be an evening filled with inspiring exhibits, engaging receptions, and the chance to meet local and visiting artists. From 5–7 pm, participating venues will open their doors, showcasing new collections and inviting art lovers to explore the vibrant gallery scene. Find what's new on www.telluridearts.org Note: Special Edition Art Walk May 21st.",
    pubDate: "2026-07-02T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png"
  },
  {
    title: "French Happy Hour at the Alibi",
    link: "https://koto.org/event/french-happy-hour-at-the-alibi-2/",
    description: "Practice speaking in French with other French speakers in an informal setting at the Alibi. Light snacks are provided and beverages are available to purchase at the bar. Space is limited, sign up at www.telluridelibrary.org.",
    pubDate: "2026-07-02T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Alibi, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/French-Happy-Hour-9.png"
  },
  {
    title: "Mountain Village Red, White & Blues Celebration",
    link: "https://koto.org/event/mountain-village-red-white-blues-celebration/",
    description: "Mountain Village's beloved Red, White &Blues Celebration returns July 3-4, 2026, bringing two days of FREE family activities, live music, arts and cultural programming, and community festivities to Mountain Village. Presented by the Telluride Mountain Village Owners Association (TMVOA), the annual Independence Day celebration invites residents and visitors alike to gather in the heart of the San Juan Mountains for a weekend filled with live entertainment, interactive activities, merchant specials, and fun for all ages. This year's celebration carries special significance as the nation commemorates the250thanniversary of the United States and Colorado celebrates its 150th anniversary of statehood. New programming includes a special Drone Show, a performance by '90s alt-rock legends Better Than Ezra, Telluride Arts' This is Colorado (In One Square Foot) Sesquicentennial exhibition, Telluride Theatre Sesquisemiquincentennial performances, and a new Family Happy Hour with Movies Under the Stars on Saturday evening. Festivities begin at 1 p.m. …",
    pubDate: "2026-07-03T06:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Village Plazas",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/RWB-BTE-Mailchimpbanner-scaled.png"
  },
  {
    title: "Yoga For All with Jay and Jane",
    link: "https://koto.org/event/yoga-for-all-with-jay-and-jane/2026-07-03/",
    description: "Join local instructors Jane del Piero and Jay Holt for a weekly class centered on deep breath work, gentle flow, and energizing chakral movement. Jane and Jay are the owners of local acupuncture, massage, and sound healing practice Luv Light. Donations are accepted. All bodies welcome.",
    pubDate: "2026-07-03T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/wellness-lineup-18.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-03/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-03T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-07-03/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-07-03T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-07-03/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-07-03T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Baby Bop",
    link: "https://telluridelibrary.libcal.com/event/16610073?hs=a",
    description: "9:00 AM – 10:00 AM · Baby Bop is a fun, upbeat babywearing dance class designed for caregivers and little ones to move together through easy-to-follow routines. Expect feel-good music, simple choreography, and a supportive atmosphere focused on bonding, movement, and joy — no dance experience required! Baby Bop es una clase de baile divertida y animada, dise&ntilde;ada para que cuidadores y peque&ntilde;os se muevan juntos mediante rutinas f&aacute;ciles de seguir. Te espera m&uacute;sica alegre, coreograf&iacute;as sencillas y un ambiente de apoyo centrado en el v&iacute;nculo, el movimiento y la alegr&iacute;a; &iexcl;no se requiere experiencia previa en baile!",
    pubDate: "2026-06-24T15:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_26_16_45_45.png"
  },
  {
    title: "Mountain Village Farmers Marketshow: Steve Weeks Music",
    link: "https://telluridelibrary.libcal.com/event/15564454?hs=a",
    description: "11:00 AM – 12:00 PM · Steve Weeks performs with both a boisterous sense of humor and a deep sense of purpose.  \"We're supposed to be entertaining and educating kids,\" the Colorado-based singer-songwriter enthuses. \"I am sincere about the music I write.  If it's not coming from the heart or isn't fun, I won't write it.\"",
    pubDate: "2026-06-24T17:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Mountain Village Market",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_13_11_27_50.png"
  },
  {
    title: "Radio Biblioteca",
    link: "https://telluridelibrary.libcal.com/event/16958284?hs=a",
    description: "12:00 PM – 1:00 PM · Escucha a KOTO Miercoles por Medio y conoce las noticias y eventos que tendremos en nuestra comunidad &bull; Tune in to Koto 91.7 FM every other Wednesday and learn about the news and events we will have in our community",
    pubDate: "2026-06-24T18:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "KOTO Radio Station",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_26_10_36_58.png"
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://telluridelibrary.libcal.com/event/16767654?hs=a",
    description: "1:00 PM – 3:00 PM · Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don't! We'll have tables, cloths, chairs, and sets.   NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance if you&#39;d like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-06-24T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_04_21_13_46_33.jpg"
  },
  {
    title: "Teen Movie and Ice Cream Club",
    link: "https://telluridelibrary.libcal.com/event/16935732?hs=a",
    description: "4:00 PM – 6:00 PM · Join us every Wednesday this summer for Teen Movie and Ice Cream Club. We will watch a movie on the teen TV with free ice cream available!",
    pubDate: "2026-06-24T22:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Teen Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_22_12_40_26.jpg"
  },
  {
    title: "Plant Party! Dirt-Bar and Plant Care",
    link: "https://telluridelibrary.libcal.com/event/16593899?hs=a",
    description: "5:30 PM – 7:00 PM ·   Discover the power of dirt at Dirt Bar Plant Care! Learn the fundamentals of healthy houseplants, from soil and lighting to watering and general plant maintenance. BYOP — Bring Your Own Plant for any re-potting needs-f you want!— if you'd like advice on your plant's specific care needs or troubleshooting tips. We will have bags for taking home soil for different types of plants, so much fun in one evening.",
    pubDate: "2026-06-24T23:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_22_14_07_55.jpg"
  },
  {
    title: "Romance with Rachel",
    link: "https://telluridelibrary.libcal.com/event/16590831?hs=a",
    description: "5:30 PM – 7:00 PM · If you haven&#39;t been paying attention.... Romance is IN! Welcome to Wilkinson&#39;s newest book club celebrating the sales-sweeping genre on love and all its glory—Romance with Rachel. Each month, join Rachel in reading a romance novel from a new subgenre and then engage the group in discussion about all the nitty gritty details. At the end of the event, our ravenous romance readers will collaboratively choose the novel for the next month. We will meet either at the library or offsite the fourth Wednesday of each month. June&#39;s selection is The Duke: A Novel by Anna Cowan. Five copies will be first come, first serve for registrees. Reach out to Rachel at rbrand@telluridelibrary.org if you have trouble acquiring a copy. Description below: A sapphic regency romance about the duke who fears nothing... …",
    pubDate: "2026-06-24T23:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Telluride Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_29_13_35_46.png"
  }
];

// Bot-managed by scripts/content-refresh.js Task 7 (syncHumaneSocietyAnimals).
// Currently empty: every animal the THS Shelterluv feed lists right now is
// either pending adoption ("ADOPTION PENDING! …") or pre-weaning/photoless,
// none of which are advertised as adoptable. The sync filters those out, so
// this repopulates automatically when THS posts genuinely-available pets.
const HUMANE_SOCIETY_ANIMALS = [
  {
    id: "TEL-A-186",
    name: "Roman",
    species: "Dog",
    breed: "Bulldog, French",
    ageGroup: "Young Dog",
    sex: "Male",
    photo: "https://new-s3.shelterluv.com/profile-pictures/d41da3a87655b31d6984c022c69835b0/22b7f37d16d281de87282d9cfb67b365.jpeg",
    profileUrl: "https://www.shelterluv.com/embed/animal/213885538",
    summary: "Young Dog • Bulldog, French • Male",
    firstSeen: "2026-06-23",
    revealDate: "2026-06-23",
    lastSeen: "2026-06-24"
  }
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
    title: "BLAKEGETBACKHERE (DJ Set)",
    link: "https://www.alibitelluride.com/calendar#eca-event=blakegetbackhere-dj-set",
    description: "Blake Get Back Here – North Carolina native and current Aspen resident, Blake Ge...",
    pubDate: "2026-06-27",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/fa2be521-9bdb-42f6-a121-13a81fc12966/-/crop/1294x1295/0,0/-/preview/"
  },
  {
    title: "Alibi Bday Celebration w/ Horse Bitch",
    link: "https://www.alibitelluride.com/calendar#eca-event=alibi-bday-celebration-w-horse-bitch",
    description: "Portion of ticket sales will be donated to KOTO Horse Bitch is a genre-defyin...",
    pubDate: "2026-06-30",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/af4d0323-57c7-40e5-9fc4-43e5fb557081/-/crop/5475x2735/0,345/-/preview/"
  },
  {
    title: "Wim Tapley & the Cannons w/ Waxpool",
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
    title: "MINDCHATTER DJ SET",
    link: "https://www.alibitelluride.com/calendar#eca-event=mindchatter-dj-set",
    description: "Singer, songwriter, and multi-instrumentalist Bryce Connolly, better known as M...",
    pubDate: "2026-07-04",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/9944f858-66bb-428d-b435-1f6248dfb345/-/crop/2376x1189/0,1317/-/preview/"
  },
  {
    title: "Zander Rodriguez",
    link: "https://www.alibitelluride.com/calendar#eca-event=zander-rodriguez",
    description: "Zander Rodriguez is a singer-songwriter now based in Phoenix, Arizona. Originall...",
    pubDate: "2026-07-05",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/587eca13-bf75-4c6c-a808-93088ae7164f/-/crop/2624x1311/0,680/-/preview/"
  },
  {
    title: "B-Side Players",
    link: "https://www.alibitelluride.com/calendar#eca-event=b-side-players",
    description: "The B-Side Players bring their genre-blending sound to The Alibi for a late-night live music performance. Known for fusing styles across cultural boundaries, the band takes the stage at 9:00 PM.",
    pubDate: "2026-07-08",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/3bac837e-cc78-4024-a064-b06fa2834a6d/-/crop/2589x1295/0,133/-/preview/"
  },
  {
    title: "River Spell w/ Moonbeem",
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
    title: "Strumbucket",
    link: "https://www.alibitelluride.com/calendar#eca-event=strumbucket",
    description: "Strumbucket is a five-piece \"twang-funk\" band from Jackson, Wyoming known for th...",
    pubDate: "2026-07-12",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/ecf44f04-a967-4ab1-8581-9fb400a00c69/-/crop/4223x2110/0,701/-/preview/"
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
  },
  {
    title: "Nik Parr & the Selfless Lovers",
    link: "https://www.alibitelluride.com/calendar#eca-event=nik-parr-and-the-selfless-lovers",
    description: "Nik Parr & The Selfless Lovers are a high-energy, piano-driven roots rock band h...",
    pubDate: "2026-07-30",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/5e2a35ce-6185-49b8-9c47-4f5ecdbf4b5b/-/crop/1080x541/0,225/-/preview/"
  },
  {
    title: "Natalie Brooke",
    link: "https://www.alibitelluride.com/calendar#eca-event=natalie-brooke",
    description: "Natalie Brooke is a rock star. A virtuoso funk / rock keys player leading her po...",
    pubDate: "2026-08-01",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/b150a182-60cb-4116-bccf-81a27439a381/-/crop/1080x432/0,36/-/preview/"
  },
  {
    title: "Theo Croker - Telluride Jazz Fest After Dark",
    link: "https://www.alibitelluride.com/calendar#eca-event=theo-croker-telluride-jazz-fest-after-dark",
    description: "With trumpeter, vocalist, composer and record producer, Theo Croker, we will beh...",
    pubDate: "2026-08-07",
    time: "10:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/0cb46769-06f4-4294-84d6-a2e85873e599/-/crop/1295x1296/152,0/-/preview/"
  },
  {
    title: "Endea Owens & The Cookout",
    link: "https://www.alibitelluride.com/calendar#eca-event=endea-owens-and-the-cookout",
    description: "Endea Owens is all about jazz. This phenomenal bassist, composer and performer h...",
    pubDate: "2026-08-08",
    time: "10:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2340e518-38e2-471f-802f-0183b7f67cbb/-/crop/1069x1068/235,0/-/preview/"
  },
  {
    title: "Max & Heather Stalling",
    link: "https://www.alibitelluride.com/calendar#eca-event=max-and-heather-stalling",
    description: "Meet Max & Heather Stalling, a dynamic duo of singer-songwriters from Dallas, Te...",
    pubDate: "2026-08-11",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2f8a6c97-33f7-43f4-a134-b385a801631a/-/crop/5464x2727/0,1365/-/preview/"
  },
  {
    title: "Banshee Tree w/ Quattlebaum - Telluride Mushroom Festival",
    link: "https://www.alibitelluride.com/calendar#eca-event=banshee-tree-w-quattlebaum-telluride-mushroom-festival",
    description: "Set against the electric backdrop of the Telluride Mushroom Festival—a legendary...",
    pubDate: "2026-08-12",
    time: "7:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/3a7022df-2a89-4430-9639-65f67a9584ce/-/crop/500x500/0,63/-/preview/"
  },
  {
    title: "The Copper Children & Thom LaFond- Telluride Mushroom Fest",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-copper-children-telluride-mushroom-fest",
    description: "The Copper Children are a diverse blend of styles and influences that span from ...",
    pubDate: "2026-08-13",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/dc85c3b0-3a00-458b-946e-3f08cb24a8bc/-/crop/500x500/0,63/-/preview/"
  },
  {
    title: "DJ Jonko X Codestar - Telluride Mushroom Fest",
    link: "https://www.alibitelluride.com/calendar#eca-event=codestar-x-jasper-telluride-mushroom-fest",
    description: "DJ Jonko X and Codestar bring their sets to The Alibi for an official Telluride Mushroom Fest after party, keeping the energy going late into the night. The show starts at 9:00 PM as part of the broader Mushroom Festival celebrations happening in Telluride.",
    pubDate: "2026-08-14",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/6ad6b1b4-5f1a-4af3-8640-17838213967a/-/crop/500x500/0,52/-/preview/"
  },
  {
    title: "Thom LaFond + DROS",
    link: "https://www.alibitelluride.com/calendar#eca-event=thom-la-fonde-dros-alexander-karvelas",
    description: "Thom LaFond and DROS take the stage at The Alibi for a late-night live music set tied to the Telluride Mushroom Festival's Puff Ball After Party. The show starts at 9:00 PM and brings the festival's celebratory energy into the evening at one of Telluride's beloved local venues.",
    pubDate: "2026-08-15",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/7bf79fb4-a715-4cee-b43a-bf4637aec172/-/crop/500x500/0,66/-/preview/"
  },
  {
    title: "Wax Monkey",
    link: "https://www.alibitelluride.com/calendar#eca-event=wax-monkey",
    description: "Wax Monkey is a 5-piece jam band composed of childhood friends hailing from Birm...",
    pubDate: "2026-08-22",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/16f8ae40-6bce-4ecb-8d32-adaabafa3398/-/crop/2304x1153/0,383/-/preview/"
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
    title: "FREE Oak Street Park SummerSHOW Series: Elder Grown",
    link: "https://sheridanoperahouse.com/events/oak-street-park-summershow-series/",
    description: "The FREE Oak Street Park SummerSHOW Series presents Elder Grown at the Sheridan Opera House in Telluride. This concert is part of the free summer performance series offering live entertainment to the community.",
    pubDate: "2026-06-25",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/dsc01583lr-1-.733x412.webp"
  },
  {
    title: "Telluride Theatre Muleskinner's Ball Fundraiser",
    link: "https://sheridanoperahouse.com/events/telluride-theatre-muleskinners-ball-fundraiser/",
    description: "Telluride Theatre hosts its Muleskinner's Ball fundraiser at the historic Sheridan Opera House, bringing together music and community to support the local theater organization. The event blends a lively ball-style atmosphere with fundraising for Telluride Theatre's programs and productions.",
    pubDate: "2026-06-27",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/48278-gala25-2-thundertix-min.jpg"
  },
  {
    title: "23rd Annual Telluride Plein Air",
    link: "https://sheridanoperahouse.com/events/23rd-annual-telluride-plein-air/",
    description: "The 23rd Annual Telluride Plein Air is a longstanding celebration of outdoor painting bringing together artists who create works on location throughout the Telluride area. The event is held at the Sheridan Opera House, serving as a hub for this established regional arts tradition.",
    pubDate: "2026-06-29",
    endDate: "2026-06-30",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/Vios-Richie-Rainy-Day-in-Telluride-90-mins.-QuickDraw-8x10-Watercolor-800.webp"
  }
];

// Telluride Venture Network — entrepreneurial-ecosystem bootcamps from
// tellurideventurenetwork.com/tvn-events/ (hand-curated; bots don't touch).
// Multi-day programs: pubDate is the start date; run dates noted in the
// description. events.html's 60-day window hides past/concluded cohorts
// (e.g. the Feb–Mar 2026 Strategy & Growth Bootcamp).
const TELLURIDE_VENTURE_EVENTS = [];

// Beacon — outreach to seasonal / young-adult workers (beacontelluride.com).
// Maintained by the `beacon-events-refresh` scheduled task, which re-reads
// https://www.beacontelluride.com/upcoming-events weekly and re-derives this
// array. The page lists events in PROSE (specific dates + recurring weekly),
// so the task uses AI extraction + computes upcoming occurrences. Paused/
// seasonal items (Ski Days, Adopt-a-Liftie) are intentionally omitted until
// they resume. Safe to hand-edit between runs.
const BEACON_EVENTS = [
  { title:"Friday Feast", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's twice-a-month free home-cooked dinner for lifties and all other seasonal workers.", date:"2026-06-12", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well Coffee Shop, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Friday Feast", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's twice-a-month free home-cooked dinner for lifties and all other seasonal workers.", date:"2026-07-10", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well Coffee Shop, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-16", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-23", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-30", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-11", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-18", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-25", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
];


// Telluride Chamber Music concerts (telluridechambermusic.org/events).
// Bot-refreshed by the chamber-music-events-refresh scheduled task.
const CHAMBER_MUSIC_EVENTS = [
  { title:"Resonance & Romance", link:"https://telluridechambermusic.org/concert/romance", description:"A summer chamber music concert presented by Telluride Chamber Music.", date:"2026-06-28", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/romance.webp" },
  { title:"Frame Drum Workshop", link:"https://telluridechambermusic.org/concert/frame-drum", description:"A frame drum workshop presented by Telluride Chamber Music.", date:"2026-06-29", time:"5:30 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/frame-drum.webp" },
  { title:"Local Artists Night", link:"https://telluridechambermusic.org/concert/local-artists-night", description:"An evening showcasing local artists, presented by Telluride Chamber Music.", date:"2026-06-30", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/local-artists-night.webp" },
  { title:"From the Music Room — A Trip Down Memory Lane", link:"https://telluridechambermusic.org/concert/music-room", description:"A chamber music concert presented by Telluride Chamber Music.", date:"2026-07-02", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/music-room.webp" },
  { title:"Braided Traditions — A Festival of Cultural Roots", link:"https://telluridechambermusic.org/concert/braided", description:"A festival concert celebrating cultural roots, presented by Telluride Chamber Music.", date:"2026-07-05", time:"3:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/braided.webp" },
  { title:"Chill with Chamber Music! — Norwood", link:"https://telluridechambermusic.org/concert/norwood-jul", description:"A relaxed chamber music concert in Norwood, presented by Telluride Chamber Music.", date:"2026-07-23", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Norwood", imageUrl:"https://telluridechambermusic.org/concerts/norwood-jul.webp" },
  { title:"The Brass Family — Kids' Concert", link:"https://telluridechambermusic.org/concert/brass-family", description:"A family-friendly kids' concert presented by Telluride Chamber Music.", date:"2026-07-31", time:"11:00 AM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/brass-family.webp" },
  { title:"New York Philharmonic Principal Brass Quintet", link:"https://telluridechambermusic.org/concert/ny-phil", description:"A concert by the New York Philharmonic Principal Brass Quintet, presented by Telluride Chamber Music.", date:"2026-07-31", time:"7:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/ny-phil.webp" },
  { title:"Telluride Community Concert — August", link:"https://telluridechambermusic.org/concert/community-aug", description:"A community concert presented by Telluride Chamber Music.", date:"2026-08-13", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/community-aug.webp" },
  { title:"Chill with Chamber Music! — Norwood", link:"https://telluridechambermusic.org/concert/norwood-aug", description:"A relaxed chamber music concert in Norwood, presented by Telluride Chamber Music.", date:"2026-08-27", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Norwood", imageUrl:"https://telluridechambermusic.org/concerts/norwood-aug.webp" },
  { title:"Telluride Community Concert — September", link:"https://telluridechambermusic.org/concert/community-sep", description:"A community concert presented by Telluride Chamber Music.", date:"2026-09-10", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/community-sep.webp" },
  { title:"Balourdet Quartet", link:"https://telluridechambermusic.org/concert/balourdet", description:"A concert by the Balourdet Quartet, presented by Telluride Chamber Music.", date:"2026-09-13", time:"7:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/balourdet.webp" },
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
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/05/Creating-with-AI-1-scaled.png"
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
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/06/rundola26_680x440.jpg"
  },
  {
    title: "The Dual Challenge: Climate and Energy",
    link: "https://telluridefoundation.org/tf-events/",
    description: "A Town Talk panel discussion on what meeting humanity's energy needs while keeping a healthy planet actually requires, featuring climate and energy experts. Free; presented in partnership with Telluride Science.",
    pubDate: "2026-07-28T18:30:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Innovation Center, Telluride, CO",
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/06/0728-TT_320-x-212-TF.jpg"
  }
];

const OURAY_COUNTY_EVENTS = [
  {
    title: "Ouray County MAC Group Meeting",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=2378",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=2378",
    pubDate: "2026-07-09T14:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "4-H Event Center - 22739 Highway 550 Ridgway CO 81432",
    imageUrl: ""
  },
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
    title: "Employee Summer Picnic",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3653",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3653",
    pubDate: "2026-06-25T12:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Pa-Co-Chu-Puk - Ridgway CO 81432",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2025-08-04T12:00:00.000Z",
    endDate: "2028-07-24",
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
    pubDate: "2026-03-02T12:00:00.000Z",
    endDate: "2026-12-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Beautification Committee (OBC)",
    link: "https://www.cityofouray.com/city_offices/committees___boards/beautification_committee_(obc).php",
    description: "The Beautification Committee (OBC) works on projects to help beautify the community. The committee oversees the installation of all the flower gardens in the City as well as all the hanging baskets and plantings on Main Street. They have also worked hard over the years to acquire many historic mining pieces and equipment that are displayed throughout the community to recognize Ouray's mining heritage. The committee has also provided direction on signage, light poles, and benches on the public rights of way. The Beautification Committee also plays an important role in developing and implementing master plans for the City’s park system. The committee makes recommendations to the City Council on these many beautification projects as well as the use of dollars from the Beautification Fund. This fund is supported by a portion of the Lodging Occupation Tax and is used exclusively for projects that help beautify the community. …",
    pubDate: "2026-03-04T12:00:00.000Z",
    endDate: "2027-02-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://zumba.com/p/zumbafitnesswithTamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com. For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra.",
    pubDate: "2026-04-01T12:00:00.000Z",
    endDate: "2026-12-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/e3b37a55dafe3e5ac88f6f7359fdef186311fd9b.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-04-08T12:00:00.000Z",
    endDate: "2027-04-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "https://www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-04-09T12:00:00.000Z",
    endDate: "2027-04-08",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-04-16T12:00:00.000Z",
    endDate: "2026-08-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "https://www.ridgwayfuse.org/firstfridays",
    description: "Discover new work, celebrate openings and connect with artists at the First Friday Art Walk in downtown Ridgway. Each month galleries, studios and retail spaces throw open their doors for receptions, pop-up exhibits and special programming — perfect for art lovers and casual browsers alike. NEW! 🎨🛍️ Shop local. Win local. Celebrate local. 🎶🍷 Starting this June, your First Friday stroll through Ridgway could score you a $100 gift card to your favorite local business. 👀 Here’s how it works: ✨ Shop during First Friday ✨ Text your receipts from participating businesses ✨ Submit up to 3 receipts each month ✨ Two winners drawn monthly! Every receipt = another chance to win while supporting the galleries, shops, restaurants, artists, makers, and small businesses that make Ridgway feel like Ridgway. 📸 Text receipts to: (970) 316-3197 —or drop them off at Town Hall within 48 hours. …",
    pubDate: "2026-05-01T12:00:00.000Z",
    endDate: "2026-12-04",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "https://www.beetrueyou.com",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person.",
    pubDate: "2026-05-13T12:00:00.000Z",
    endDate: "2026-09-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Creative Space: Artist Salon Series",
    link: "https://www.ridgwayfuse.org",
    description: "Join us for the second CREATIVE SPACE artist salon on WEDNESDAY JUNE 24! We will enjoy an artist talk by local painter, Karen Keene Day, during the run of her exhibition in the Decker Room. Stay and socialize with creatives afterward! Please bring some food/drinks to share! All are welcome! Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited. We welcome your ideas for future events! Bring something to eat or drink to share! To learn more, ask questions, submit ideas, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484",
    pubDate: "2026-05-21T12:00:00.000Z",
    endDate: "2026-12-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53233124549377/huge/48f5037f05c4138c97f3f592d4b11a0581b38eab.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-05-22T12:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Ouray Mountain Air Music Series",
    link: "https://www.ouraymusicseries.com",
    description: "June 4th: AJ Fullerton and Grant Sabin June 11th: Nik Parr & The Selfless Lovers with You Knew Me When June 18th: The Sweet Lizzy Project with Sara Jean Kelley June 25th: Cruz Contreras & The Black Lillies and Griffin William Sherry Set in the heart of Ouray, the Mountain Air Music Series has become a signature summer tradition, offering a welcoming space for families, friends, and visitors of all ages to gather and unwind. Surrounded by breathtaking mountain views, the series creates an atmosphere that is equal parts relaxing and energizing—where laughter, community spirit, and live music blend seamlessly in one unforgettable outdoor experience. What makes the series truly special is the lineup of talented bands who bring both heart and authenticity to the stage. Each group shares a deep passion for music and a genuine appreciation for performing in small communities like Ouray. …",
    pubDate: "2026-06-04T12:00:00.000Z",
    endDate: "2026-06-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52951532621249/huge/45a880540db97b7292e967c6f16b980532044c29.jpg"
  },
  {
    title: "True Grit Historic Walking Tours",
    link: "https://truegrittours.org/true-grit-tours ",
    description: "Walk in the footsteps of John Wayne and Kim Darby as you explore downtown Ridgway with a trained guide to discover the fascinating behind-the-scenes story of the filming of the original True Grit movie in 1968. Many of the buildings seen in the movie are still in place. John Wayne won his only Oscar for his portrail of Marshal Rooster Cogburn. Offered every Friday at 3 pm in June, July and August. Additional tours are offered at 10am Mondays and 3 pm Wednesdays in July. Meet at the Hartwell Park gazebo 15 minutes before tours begin. FREE. Tours last about an hour. In 2022, this tour was recognized nationally when it was named the reader's choice for best historic town tour by True West magazine. For more information see the website: TrueGritTours.org or on facebook: True Grit Tours. …",
    pubDate: "2026-06-05T12:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52285883190282/huge/99283c09e34ca5aeabd7006cca2ba5b2b28899c3.jpg"
  },
  {
    title: "Ongoing - Colorado Stories - Susan Clark & Alex Mendard Art Exhibition",
    link: "https://susanclarkart.com",
    description: "Susan Clark's oil pastel and Alex Menard's watercolor work will be on display in the Space to Create gallery - located in the lobby of the building near Kate's Place - through June. Artist Bios: Alex Menard: Retired Landscape Designer/ Installer, now watercolorist and linocut printmaker. Artist profile here Susan Clark With my art, I capture the spectacular interplay of color, light, and image and then distill it down, while still maintaining the original awe. I like to present the viewer with a different way of seeing images while evoking a sense of enjoyment and creating a smile. My “joie de vivre” is exploring with harmonious color & disappearing for hours to create whimsical and colorful expressive paintings. I paint the Colorado mountains and aspen trees, which surround me and provide a quiet escape. …",
    pubDate: "2026-06-08T12:00:00.000Z",
    endDate: "2026-06-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create ",
    imageUrl: "https://localist-images.azureedge.net/photos/53170905602603/huge/89412c5d44050148024816c075b55e79851a67c1.jpg"
  },
  {
    title: "Ongoing: Painting Evolution Of Moments With Wild Horses 1999-2026- Artist Karen Keene Day",
    link: "https://events.ourayridgwayevents.com/event/painting-evolution-of-moments-with-wild-horses-1999-2026-artist-karen-keene-day",
    description: "Enjoy nearly 3 decades or work from local painter, Karen Keene Day. Info decker@ridgwayfuse.org",
    pubDate: "2026-06-08T12:00:00.000Z",
    endDate: "2026-06-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709642938173/huge/e2c21f0b2c1fb10c06c021e9b9d55a9ea535bccc.jpg"
  },
  {
    title: "Evenings of History 2026 @ the Wright",
    link: "https://www.ouraycountyhistoricalsociety.org/about-4",
    description: "Evenings of History 2026 @ the Wright WHEN? Weekly Tuesdays • 7:00 pm – 9:00 pm Doors at 6:30 pm • Presentations at 7:00 pm June 16 June 23 June 30 July 7 July 14 July 21 July 28 August 4 WHERE? Wright Opera House 472 Main St. Ouray, Colorado SERIES: Presented by the Ouray County Historical Society ABOUT THE SERIES Join the Ouray County Historical Society for another season of Evenings of History, a community lecture series exploring the people, places, and stories that shaped Ouray County and the greater San Juan region. From mining legends and frontier photography to fashion, recreation, and Ute history, this year’s lineup offers a fascinating look into the characters and events that helped define the American West. Through local historians, researchers, storytellers, and community experts, Evenings of History continues a longstanding tradition of preserving and sharing the rich heritage of Ouray County. …",
    pubDate: "2026-06-16T12:00:00.000Z",
    endDate: "2026-08-04",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52887120617394/huge/59851e9ca29d75054645a0e488e33edbbcf73d69.jpg"
  },
  {
    title: "Functional Fitness - Strength & Mobility Training For Women",
    link: "https://www.signupgenius.com/go/10C044DAAA82DA7FAC70-60167874-functional#/",
    description: "Welcome to Ridgway's strength and mobility training for women! Functional means we focus on movements that mimic everyday activities and improve overall mobility, strength and fitness. Exercises often work multiple muscle groups simultaneously, improving coordination and stability. I love the female group setting because we get a chance to really connect and not only get stronger physically, but also build support and community. Come for a drop in and get a taste or commit long term to transformation, vitality and longevity. All levels are welcome. Let's do hard things together! Class Structure: 5 minute warm up / 30 minute circuit workout / 10 minute cooldown stretch & mobility What To Bring: yoga mat, water, no shoes preferred - If you need to wear shoes they must be clean indoor shoes only. No mud, dirt, snow, etc. Every Tuesday & Thursday 8:15-9 am / Advance sign up required! …",
    pubDate: "2026-06-18T12:00:00.000Z",
    endDate: "2026-12-22",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53188965998095/huge/55f592a5e84d7486827ccac53e3cf97ff5f937db.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://www.facebook.com/stepstavern",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM Every Friday Night",
    pubDate: "2026-06-19T12:00:00.000Z",
    endDate: "2026-09-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/53142698527493/huge/db3a6ef58a79b18eea8c70a4d583bbf3d9498404.jpg"
  },
  {
    title: "Saturday Yoga",
    link: "https://studioouray.com",
    description: "Zen Mountain Yoga is a carefully designed yoga class created to move your mind, body, and spirit through a series of seated and standing yoga poses. Yoga props are used to facilitate deeper movement for a richer stretch environment, designed to increase flexibility, balance, and range of movement. Restorative breathing exercises, neurogenic brain training, and guided relaxation will promote stress reduction and mental clarity. Zen out in as we explore the eight limbs of yoga through your dosha awareness, and bring the mountain home to your heart. Appropriate for beginner to advanced. ***Please visit studioouray.com in case of inclement weather or class cancellation.***Please bring a yoga mat, sun protection, and water.*** $10.00 outside until Labor Day. Drop-indoors after labor day $20.00.",
    pubDate: "2026-06-20T12:00:00.000Z",
    endDate: "2026-09-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53233830352657/huge/0d1cbbdf672690b660591a1d6fa1c311b49b04ef.jpg"
  },
  {
    title: "Ouray Open Air Market",
    link: "https://www.ouray-events.com/open-air",
    description: "The Ouray Open-Air Market is a brand-new cooperative, organized marketplace designed to provide a dedicated home for small-scale creators & producers. Our core mission is to promote local agriculture and artisan goods while fostering honest, transparent relationships between vendors and the community. This is an entirely fresh platform in town designed to showcase your artisanal goods and services, helping neighbors and visitors know exactly who made the products they love. When and Where? Location: The market will take place in a beautiful open-air setting at Billy Goat Gruff's Patio (located at 4th Ave. + Main Street, Ouray, CO).Schedule: We will operate every Sunday from June 21, 2026, through September 6, 2026.Hours: Market hours are 10:00 AM to 2:00 PM.",
    pubDate: "2026-06-21T12:00:00.000Z",
    endDate: "2026-09-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Billy Goats Gruff Patio",
    imageUrl: "https://localist-images.azureedge.net/photos/53054893063268/huge/ed5f6f42c1d6a9db337d04171355a33509b6e1d1.jpg"
  },
  {
    title: "Breathe Together",
    link: "https://www.cristinagafta.com",
    description: "We explore and practice breath awareness and conscious breathing techniques as doorways to physical and emotional regulation and spiritual growth. Through these practices we also grow our awareness and achieve higher states of consciousness that can help us in our everyday life, relationships, general wellbeing and ultimately reconnect with our higher nature. No previous experience is required.",
    pubDate: "2026-06-22T12:00:00.000Z",
    endDate: "2026-09-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness and Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/53197444379202/huge/26813502ab1ba3ae9f231b0cd774d101f4f32f02.jpg"
  },
  {
    title: "Ridgway Independent Film Festival Screening Series",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-festival-screening-series",
    description: "You decide! Help us to pre-screen short films for this year's festival. You will screen films (many brand new, never before seen) that are in consideration for our November festival, and discuss and review them afterwards! A different genre each night! Be a part of our community-based film selection process! Questions? New to this and want to learn more? Email arielle@sherbinotheater.com",
    pubDate: "2026-06-23T12:00:00.000Z",
    endDate: "2026-06-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53196545955120/huge/47f14d971b58902d369831d085a3fa5a7b0437bd.jpg"
  },
  {
    title: "Help Keep Our Rivers Clean Youth Art & Poetry Contest (Submission Deadline)",
    link: "https://www.uncompahgrewatershed.org/uwp-2026-youth-art-poetry-contest/",
    description: "THEME: All of Us Can Help Keep Rivers Clean: Let’s prevent nonpoint source pollution! ORGANIZED BY: The Uncompahgre Watershed Partnership with support from the Environmental Protection Agency and Colorado Department of Public Health and Environment. OVERVEW: Nonpoint source pollution (NSP), or water pollution that does not originate from a single, distinct source, such as a pipe, is an ongoing threat to water quality in the state of Colorado. The Art & Poetry Contest is designed for ages 4 to 20, and is aimed at educating the community about the challenges faced by our waterways and opportunities to reduce the impacts of harmful nonpoint source pollutants such as sediment, chemicals, bacteria, recreation, post-wildfire runoff. PRIZES: Winners in each age category will receive: 1st Place = $200, 2nd Place = $100, 3rd Place = $50. Plus, one person will win $150 plus the People’s Choice Award. …",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53180866539942/huge/a62f9f776e77b4e1668b5df6a9c609601e287648.jpg"
  },
  {
    title: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz : “Early Season Wildflowers in Ouray County”",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Different elevations and habitats provide opportunities to view a wide variety of Colorado’s native plants and wildflowers. Ridgway writer and Colorado Native Plant Master Mary Menz and Jaime Pisarowicz will share their extensive plant knowledge and excitement for the area with you. Special guest and fellow NPM Sandra Dick will also join the group as a guide! Registration includes a copy of their book Common Wildflowers of the San Juan Mountains ($49) or Wildflowers of Colorado’s Western Slope ($69). All groups are limited to 12 participants. Participants will meet and carpooling is recommended (we help facilitate this effort at the meet up location)—specific directions and more information will be provided via email prior to the event. A waiver needs to be signed before the event. Please do so here Please check your email the evening before class for any unexpected cancellations or weather-related updates. …",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "location disclosed via email right before class",
    imageUrl: "https://localist-images.azureedge.net/photos/53073652493992/huge/202160a6bd8ae2c028c7969e3e4ea812bda5bc4a.jpg"
  },
  {
    title: "Ouray County Baseball - 13u Baseball vs. Ignacio",
    link: "https://ouraycountybaseball.com",
    description: "Ouray County Baseball - 13u Baseball vs. Ignacio",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52118491920073/huge/05139b66e9f6daf3db0bec61ea6da7641d58cf5a.jpg"
  },
  {
    title: "Live Music- Easy Jim(Grateful Dead Cover Band)",
    link: "https://www.stelmohotel.com/summer-sound/easyjim",
    description: "Join us on Wednesday, June 24th as we welcome Easy Jim, Western Colorado’s premier Grateful Dead cover band. Known for their improvisational spirit and free-flowing energy, Easy Jim brings the timeless sound of the Dead to life. From classic jams to deep cuts, they capture the true essence of the Grateful Dead experience, loose, alive, and completely in the moment. Come ready to dance, wander, and let the music take you where it will.",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53126161919270/huge/531d9c39aeb8057b46d1879464e57f32c94ad915.jpg"
  },
  {
    title: "The Hateful Eight: CO-150 Film Festival @ the Wright",
    link: "https://colorado150film.com/",
    description: "The Hateful Eight: CO-150 Film Festival @ the Wright WHEN? Wednesday, June 24 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 3h 7min RATING: R ROTTEN TOMATOES SCORE: 74% ABOUT THE FILM The Hateful Eight (2015) follows a group of strangers stranded together during a brutal Wyoming blizzard shortly after the Civil War. As tensions rise inside a remote stagecoach lodge, secrets emerge and loyalties unravel in classic Quentin Tarantino fashion. Featuring sharp dialogue, striking cinematography, and a slow-burning atmosphere of paranoia and violence, the film blends mystery, western grit, and dark humor into a tense cinematic experience. A suspenseful modern western filled with unforgettable characters, uneasy alliances, and explosive confrontations. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. …",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52887290127542/huge/51507f28e4bbf5865ad30a8cf4958f9f758bc259.jpg"
  },
  {
    title: "Spanish Storytime",
    link: "https://ouray.colibraries.org/lib-cal/",
    description: "Join us at Ouray Library to have a Spanish Storytime! This will be the first of (hopefully) many this year. This will last from 11:00 a.m. to around 11:45 a.m.",
    pubDate: "2026-06-25T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53136204077030/huge/73a73457770aa7ffe32d86c159c84b8eb038df21.jpg"
  },
  {
    title: "OLD MAN POLLY",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-26T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Final Friday: Tea Party",
    link: "https://www.voyageryouth.org/hubb-teen-events",
    description: "AN OPPORTUNITY TO WEAR A WHIMSICAL WARDROBE! For Middle & High School Students, Final Friday is reclaiming Voyager as the Teen Center it used to be. 🤘 Come hang out for an evening that mixes chill social time with free food and fun activities. Every month, we have games, art and more available. All we ask is that you clean up after yourself and help us create a welcoming space for everyone. This month, Erin Latta from the Artisan Bakery & Cafe will be joining us. If you've ever been interested in learning how to make scones, Erin will be showing us how to make two different favors of sweet scones. TO RSVP STEP 1: Once a year, make or update an account with Voyager so we have access to important information to best serve the Teens that are attending. …",
    pubDate: "2026-06-26T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53047439328205/huge/285e8175b5195c6e4eb0f8c6b8e30f8735ea212a.jpg"
  },
  {
    title: "An Evening Avian Adventure - Ridgway State Park Summer Program Series",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "Grab your binoculars and join local birding expert Mike Campbell. From majestic bald eagles cruising the shoreline to brilliant mountain bluebirds nesting along the trails, you will unlock expert secrets to identify local species by sight and sound.",
    pubDate: "2026-06-26T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53161598821007/huge/9b37979e0045291708375bbf7b44d3da63e6c121.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon — Premiere Screening @ the Wright",
    link: "https://Wrightoperahouse.org",
    description: "Echoes in the Canyon: Premiere Screening: Movie Night @ the Wright WHEN? Friday, June 26 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado Tickets $5 ABOUT THE FILM Ouray: Echoes in the Canyon premieres at the Wright Opera House for a special hometown screening event with filmmaker Hank Braxtan in attendance. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call “The Gem of the Rockies.” Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. …",
    pubDate: "2026-06-26T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53011656318052/huge/6cf2b8cc4168eefd5dcea2ff77191ad96b77bd76.jpg"
  },
  {
    title: "Trail Town Tenth Annual 10-mile and 5-mile Run/Walk",
    link: "https://www.sanjuanmountainrunners.com/trailtownten",
    description: "This event highlights everything there is to love about the Ridgway area. The 10-mile race is run on a lollipop course with magnificent views of the San Juan Mountains. The 5-mile fun-run / walk is an out-and-back on the first 2.5 miles of the 10-mile course and offers something for everyone. The event is coordinated with the Ridgway RiverFest and that means food and beverages and plenty of activities along the Uncompahgre River later the same day. Race proceeds will benefit the Uncompahgre Watershed Partnership.",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Palomino Trail in Ridgway",
    imageUrl: "https://localist-images.azureedge.net/photos/53196585688300/huge/19b8513846ef05c51f75290f87dfb7a9e0d533f4.jpg"
  },
  {
    title: "Back To The Future Festival",
    link: "https://events.ourayridgwayevents.com/event/back-to-the-future-festival",
    description: "Fundraiser to support Sharing Ministries Food Bank. Food, Entertainment, Music, Museum Tours, and Vintage Photos. For more information, call 970-240-8385. Sharing Ministries provides supplemental food assistance and services to residents of Ouray, Montrose, Delta, San Miguel and Gunnison Counties.",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Museum of the Mountain West",
    imageUrl: "https://localist-images.azureedge.net/photos/53056662722867/huge/f871fb72be98c25f0ffba65779b0681f719415ea.jpg"
  },
  {
    title: "Ouray History Day",
    link: "https://www.visitouray.com/150",
    description: "Step back in time and experience the rich history of Ouray. Historic Walking Tour 10 AM–2:30 PM | Centennial Park next to the Ouray Elks Lodge, 421 Main St. (Tour leaves at 10:15) Discover the stories that shaped Ouray through guided tours of historic buildings and live portrayals of some of the town’s most prominent historical figures. Local actors will bring history to life as they share the experiences, memories, and personalities of early Ouray residents. Photo: Ouray County Historical Society Ute Creation Story 8 PM | Fellin Park Listen to the Ute Creation Story as told by Larry Cesspooch, and deepen your understanding of the people, cultures, and stories that have shaped the Ouray area for generations.",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52993991365940/huge/293df0610b27e785b906c11f81085da47aadb892.jpg"
  },
  {
    title: "18th Annual Ridgway RiverFest",
    link: "https://ridgwayriverfest.org/",
    description: "The Ridgway RiverFest is a family-friendly celebration of the Uncompahgre River, our watershed and river recreation with all-age river races, live music, local food and drink, kids’ activities, watershed educational and cultural programs. RiverFest is produced by the Uncompahgre Watershed Partnership, a Ouray County nonprofit watershed group dedicated to helping protect the economic, natural, and scenic values of the Upper Uncompahgre River Watershed. The highlight of the day is the infamous “Junk of the Unc” race in which boaters maneuver their craft, constructed from scrap materials not intended for river travel, through whitewater rapids and others’ junk, trying to keep it all intact until the finish line. The 2026 Ridgway RiverFest kicks off with the river races at 11am this year. This includes paddle boards, kayaks, duckies, and more! This event will go until 12pm and the main festivities will begin at 3pm. …",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52183972236736/huge/02f92530b9be036db720bee9d880832b463f5802.jpg"
  },
  {
    title: "Ouray County Ranch History Museum's 20th Anniversary Day",
    link: "https://ocrhm.org",
    description: "Enjoy a fun-filled day of interactive activities & games, celebrating OC Ranch Museum's 20th Anniversary! Tour the acreage and see sites for future museum buildings, There will be mule rides, livestock, Rocking W Ice Cream truck from Webb Dairy, Sliders from Brittany at Uncompahgre Farm, 4-H youth showcasing their fair projects, CSU Extension offerings, zeroscape learning/plantings, Minerva West dress-up Trunk Show recognizing homesteader locals, Ridgway Community Apiary, Mighty Mini Horse Therapy, and more!",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53130955512768/huge/e51310a22a0fd90b349a2434edb7a63e61e96854.jpg"
  },
  {
    title: "Tavern & Tours: Ouray History Day @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "Tavern & Tours: Ouray History Day @ the Wright WHEN? Saturday, June 27 Doors open: 11:00 am – 4:00 pm TOUR SCHEDULE Tour 1: 11:30 am – 12:30 pm Tour 2: 12:30 pm – 1:30 pm Tour 3: 1:30 pm – 2:30 pm Tour 4: 2:30 pm – 3:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Step inside one of Ouray’s most historic buildings for an afternoon of stories, cocktails, and local history at the Wright Opera House. Tavern & Tours: Ouray History Day invites guests to explore the fascinating past of the Wright through guided tours highlighting the building’s colorful frontier origins, theatrical legacy, hidden corners, and the larger history of Ouray itself. …",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53011860959808/huge/18d2c8168b9b4eb4feda6c306a6a74312794c185.jpg"
  },
  {
    title: "Exhibit of Help Keep Our Rivers Clean Contest Youth Art & Poetry",
    link: "https://www.uncompahgrewatershed.org/uwp-2026-youth-art-poetry-contest/",
    description: "Come to Rollans Park in Ridgway during Ridgway RiverFest to view the art and poetry created by youth from around the Uncompahgre River Watershed. Festivalgoers will have a chance to vote on a People's Choice Award for one youth artist or poet! THEME: All of Us Can Help Keep Rivers Clean: Let’s prevent nonpoint source pollution! ORGANIZED BY: The Uncompahgre Watershed Partnership with support from the Environmental Protection Agency and Colorado Department of Public Health and Environment. OVERVEW: Nonpoint source pollution (NSP), or water pollution that does not originate from a single, distinct source, such as a pipe, is an ongoing threat to water quality in the state of Colorado. …",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53195810024826/huge/772295e1bfbc1a68b9f84735fa06b8abd1fbcac1.jpg"
  },
  {
    title: "Null and Void - Live at the Floating Lotus - FREE show",
    link: "https://FloatingLotusBrewery.com",
    description: "Null and Void is a rock duo from Denver, CO. Just guitar and drums, Null and void plays covers and originals. Inspired by bands like the Black Keys, Green Day, Smashing Pumpkins, The White Stripes, The Presidents of the United States of America, and Superchunk, their sets are on fire from start to finish. Null and Void has played Larimer Lounge, Lost Lake, Globe Hall, the Trailside Saloon, Goosetown, the Black Buzzard, Moe’s BBQ, and outdoor events and festivals like Run the Rocks (2022-2024) and Ridgway Rocks. Null and Void have shared the stage with the City of Sound, the Dirty Turkeys, Cinema Stereo, The Losers Club, Stray the Course, LOG, Hot Like Wasabi, 2 Seconds to Denver, Bicycle Day, and many more... Free Show All Ages Welcome Outdoor Stage",
    pubDate: "2026-06-27T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53028364541359/huge/a175a92f468964f585613b57a9d781045075cb33.jpg"
  },
  {
    title: "Ridgway Fête de la Musique presented by Citizens State Bank, The Sherbino & Weehawken Creative Arts",
    link: "https://www.ridgwayfete.com/",
    description: "4 pm – Dark || Downtown Ridgway on Clinton & Cora + Hartwell Park, the Sherbino & The Courtyard at 610 Setting: Walking, Standing, Dancing Join us for one of Ridgway’s most joyful traditions — the Ridgway Fête de la Musique, an outdoor celebration of live music, community, and summer vibes! Presented by Citizen’s State Bank, Weehawken Creative Arts, and The Sherbino, this FREE event transforms downtown Ridgway into a bustling open-air festival filled with the sound of music. 15+ Musical Acts | Many Simultaneous Outdoor Stages + An Indoor Stage at the Sherbino From the vibrant rhythms of Mariachi San Jose to regional favorites like David Nunn, Heather & Doug, and Donny Morales, there’s something for every musical taste. Wander Clinton and Cora Streets, the Courtyard at 610, The Sherbino and Hartwell Park to enjoy an incredible lineup of performances across multiple stages! …",
    pubDate: "2026-06-28T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52590090771453/huge/5f8f06133edd0a9151fe5e6e785bc44ecfc34e48.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-06-30T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Live Music- Bright Light Social Hour",
    link: "https://www.stelmohotel.com/summer-sound/bright-light-social-hour",
    description: "Join us on Wednesday, July 1st as we welcome Bright Light Social Hour to the St. Elmo Tavern Patio! This Austin, Texas-based rock band is known for their explosive blend of psychedelic rock, funk, and soul. Drawing comparisons to classic acts like Cream and The Doors while maintaining a sound that is entirely their own, TBLSH delivers a high-energy, groove-heavy live experience that is hard to shake. Their music pulses with driving rhythms, swirling guitars, and a raw, electrifying energy that fills whatever room or patio they play. This is a ticketed show. Tickets can be purchased here: https://booking.whollyticket.com/84948 Show starts at 7pm. We look forward to seeing you there!",
    pubDate: "2026-07-01T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53126268448586/huge/551649ade610d753640b4916bd308fa22ba0932e.jpg"
  },
  {
    title: "True Grit: CO-150 Film Festival @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "True Grit: CO-150 Film Festival @ the Wright WHEN? Wednesday, July 1 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 8min RATING: G ROTTEN TOMATOES SCORE: 89% ABOUT THE FILM True Grit (1969) stars John Wayne in his Academy Award-winning role as the tough and hard-drinking U.S. Marshal Rooster Cogburn, hired by a determined young girl to help track down her father’s killer through dangerous frontier territory. Blending rugged western action with humor, heart, and unforgettable performances, the film became a defining classic of the American West and one of the most beloved westerns ever made. A timeless frontier adventure about justice, courage, and the stubborn grit it takes to do what’s right. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. …",
    pubDate: "2026-07-01T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52931213000303/huge/4a35e556e3be8d09715931691264a9a9467bcf3a.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Fly Fishing",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search/detail/339?onlineSiteId=0&from_original_cui=true",
    description: "Participants will learn the basics of fly fishing techniques with instruction and equipment provided by Ridgway State Park staff. Please meet at the Pa-Co-Chu-Puk area of Ridgway State Park and bring snacks, water, weather-appropriate clothing, and sunglasses for eye protection while fishing. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com",
    pubDate: "2026-07-02T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52993896774577/huge/f8a8f4f0f395170cb24aaa84ed744e29fb7d74e4.jpg"
  },
  {
    title: "Ridgway Concert Series",
    link: "https://pickinproductions.com/upcomingshows",
    description: "The Town of Ridgway & Pickin’ Productions Present THE 19TH ANNUAL 2026 RIDGWAY CONCERT SERIES JULY 2 LEVI PLATERO Shelby Means JULY 9 BLACK UHURU Psylo JULY 16 SAM GRISMAN PROJECT Tanasi JULY 23 DOGS IN A PILE Felix Y Los Gatos JULY 30 THE RUMBLE Ft. Chief Joseph Boudreaux Jr. Handmade Moments FREE SHOW 6PM FOOD - VENDORS - BEER WINE & MARGARITAS No Dogs or Outside Alcohol Permitted HARTWELL PARK Ridgway – Colorado SPONSORS Ridgway Real Estate – Alpine Bank – Chipeta Lodge Resort & Space- Orvis Hot Springs – Julie & Dave Duff – Bennett Forgeworks- OAK – Billings Artwork – Todd W. Hoffman Foundation- The Market at Ridgway – Fiddlers Green – KVNF Public Radio – Alpine Edge Engineering - Alt Space Coworking- Vacation Rental Collective For More Information, Please Visit: www.pickinproductions.com",
    pubDate: "2026-07-02T12:00:00.000Z",
    endDate: "2026-07-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52696447609647/huge/b28c8601f5e3e0db939bf8de5f0e8929fe11dc2b.jpg"
  },
  {
    title: "On Display: Silverton, Interpreted",
    link: "https://www.ridgwayfuse.org",
    description: "We are excited to host a group show during the month of July from our neighbors in Silverton! Silverton, Interpreted is a traveling show features a selection of artists from The 9318 Collective whose work reflects the beauty, energy, and elemental character of the San Juan Mountains and the lands that surround them. Through varied styles and mediums, the exhibition offers multiple perspectives on a shared place, celebrating the artistic dialogue between land and maker.",
    pubDate: "2026-07-03T12:00:00.000Z",
    endDate: "2026-07-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53047351194602/huge/ca565426cdce176dbabc27b75052233f99cf4818.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Show Opening: Silverton, Interpreted - Ridgway First Friday",
    link: "https://www.ridgwayfuse.org",
    description: "Join us for the opening reception of Silverton Interpreted. This traveling show features a selection of artists from The 9318 Collective whose work reflects the beauty, energy, and elemental character of the San Juan Mountains and the lands that surround them. Through varied styles and mediums, the exhibition offers multiple perspectives on a shared place, celebrating the artistic dialogue between land and maker. Part of Ridgway's First Friday Art Walk",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53047134482853/huge/ade622a01d29b435d00b2f7201368e70e8a824bf.jpg"
  },
  {
    title: "Neon Sky Band",
    link: "https://events.ourayridgwayevents.com/event/neon-sky-band",
    description: "Start making plans for the biggest summer holiday celebration!! Join us in Ouray, CO July 3rd and 4th!! Southern rock to the rescue! Country music to sooth the soul and sing along. July 3rd - 6-10:30 pm in Fellin Park",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53055035817748/huge/dddd6148831e8d2649d60b1e881859ecc4ea323e.jpg"
  },
  {
    title: "Hoofbeats & Brushstrokes - Ridgway State Park Summer Program Series",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "Discover the intersection of fine art and equine beauty! Join us at the Ridgway State Park Visitors Center for an evening with renowned local artist Alice Billings. Known for her incredible ability to capture the spirit, power, and movement of horses, Alice will share the techniques and stories behind her celebrated work.",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53169382297247/huge/90c8516d4f798c06d78d5d4768e32e810fcfd7c3.jpg"
  },
  {
    title: "Ouray Weird Trivia Night @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "Ouray Weird Trivia Night @ the Wright WHEN? Friday, July 3 Doors at 6:30 pm • Trivia at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Ouray Weird Trivia Night returns to the Wright for an evening of strange facts, useless knowledge, unexpected questions, and community-powered chaos. From local lore and pop culture to history, movies, science, and wonderfully obscure nonsense, teams will compete for bragging rights in a trivia night designed for both serious competitors and people who just enjoy laughing with friends. Locals, tourists, fringe personalities, and mainstream minds are all welcome! Free to Attend In-person event at the historic Wright Opera House Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889.",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52931510224219/huge/bc7122ef6b232e543532628c54c9b91bf49b16f5.jpg"
  },
  {
    title: "Ouray's 4th of July Celebration",
    link: "https://cms5.revize.com/revize/cityofourayco/news_detail_T2_R585.php",
    description: "We have a fun-packed day full of something for everyone! Below is a list of the main events. Please feel free to check out local restaurants and retail stores for other events or specials throughout the holiday as well. Our Visit Ouray website has a comprehensive listing of all the wonderful places to check out while here. Celebrate responsibly, remember your sunscreen, stay hydrated, and please have a designated driver if traveling. 7:30 AM - Ourayce 10K Starts at City Hall, Registration opens at 7 am 10 AM - Parade West side = wet side 11 AM - Kids Games Fellin Park 2 PM - Water Fights 6th & Main Street 9:15ish (dusk) - Fireworks Weather Permitting",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "ouray, colorado",
    imageUrl: "https://localist-images.azureedge.net/photos/53055005519669/huge/908d40629803a11a75965b3341e740a4c20372bf.jpg"
  },
  {
    title: "Ourayce 10K Fun Run",
    link: "https://hometrustoc.org/event/43rd-annual-ourayce-10k-fun-run/",
    description: "10K Fun Run to kick off the 4th of July in Ouray. All proceeds benefit the Home Trust of Ouray County. Teams, costumes, and other positive ways to have a fun time for a good cause are encouraged. Pre-registration: $35/entry which includes Official Race T-shirt! $40 after July 2nd.",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center ",
    imageUrl: "https://localist-images.azureedge.net/photos/52799047964496/huge/aa0e3974def4b41e5c52e23f113a307c37cedb5b.jpg"
  },
  {
    title: "Fourth of July Tavern Open House: Drunk History Tours @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "Fourth of July Tavern Open House: Drunk History Tours @ the Wright WHEN? Saturday, July 4 Tavern Open: 11:00 am – 9:00 pm (Opens after the parade • Closes after the fireworks or drone show) WHERE? Wright Opera House Tavern 472 Main St. Ouray, Colorado ABOUT THE EVENT Step into the Wright Tavern this Fourth of July and meet a few of the forgotten friends, colorful characters, and questionable legends woven into the history of the Wright Opera House. Throughout the day, guests can join Drunk History Tours led by none other than Letitia Wright or Alewife Addie, two spirited guides with a talent for storytelling and perhaps a flexible relationship with historical restraint. These lively tours shine a lantern on the strange, true, and unexpectedly entertaining stories hidden within the walls of one of Ouray’s most historic buildings. …",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52931651916712/huge/bf90b207aa8421d1e362931dc586e1ec3146c45b.jpg"
  },
  {
    title: "4th of July Courtyard Celebration",
    link: "https://beaumonthotel.com/celebrate-the-4th-of-july-at-the-beaumont-hotel-garden-courtyard/",
    description: "Looking for the perfect way to spend your Independence Day in Ouray? Join us on Saturday, July 4th, from Noon to 4:00 PM for an afternoon of live music, great food, refreshing drinks, and unforgettable mountain-town atmosphere at the Beaumont Hotel’s beautiful Garden Courtyard. This special 4th of July celebration will feature live music from Jack Haight and his full band, bringing an energetic mix of music to help make your holiday weekend memorable. Whether you’re a local resident or visiting the San Juan Mountains for the holiday, the Garden Courtyard offers the perfect place to relax, connect with friends, and enjoy the summer season. Guests can also purchase food and beverages while enjoying the festivities. Surrounded by the historic elegance of the Beaumont Hotel and the stunning scenery of downtown Ouray, this event combines the best of Colorado mountain living with classic Independence Day fun. …",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53171340326261/huge/16a6724455125724b02cad6f8eb6d278ce193b90.jpg"
  },
  {
    title: "Neon Sky - Playing at Twin Peaks",
    link: "https://events.ourayridgwayevents.com/event/neon-sky-playing-at-twin-peaks",
    description: "Start making plans for the biggest summer holiday celebration!! Join us in Ouray, CO 4th!! Southern rock to the rescue! Country music to sooth the soul and sing along. July 4th - 5 - 9 pm at Twin Peaks Lodge and Hot Springs",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Twin Peaks Lodge and Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/53055048338026/huge/1972c7c294d4aeea7ec59595611ab9d6216447d5.jpg"
  },
  {
    title: "Ridgway Rocks",
    link: "https://www.instagram.com/ridgwayrocksfest/",
    description: "Live Music in Town Park 6-10 PM. Damon Robinson, Null & Void, Flannel Feedback.",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52745922632341/huge/0250190a0bcc6088f63749a38406222953357e3e.jpg"
  },
  {
    title: "A Geological Odyssey: Ouray County - Ridgway State Park Summer Program Series",
    link: "https://cpw.state.co.us/events?f%5B0%5D=state_parks%3A186",
    description: "Join us for a fascinating journey through time with expert John Mitchell. From ancient volcanic eruptions to the glacial forces that shaped our modern landscape, he will unravel the epic story written in the rocks of Ouray County.",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53161788541140/huge/43e5cbd69d31cef897cd453db90b4a55db1e9c83.jpg"
  },
  {
    title: "Soussical The Musical - Summer Youth Theatre Program",
    link: "https://www.minervawest.org/youththeatre#anchors-mnyz5o91",
    description: "Seussical is a fantastical musical based on the works of Dr. Seuss, primarily blending Horton Hears a Who!, Horton Hatches the Egg, and Gertrude McFuzz. Written by Lynn Ahrens and Stephen Flaherty, it follows Horton the Elephant and the Cat in the Hat as they explore themes of imagination, loyalty, and community through toe-tapping, whimsical musical numbers. Performances on July 25th & 26th at Ridgway Secondary School. For financial assistance contact Kathy O'Mara at 413-441-6120 or Email komara@minervawest.org.",
    pubDate: "2026-07-06T12:00:00.000Z",
    endDate: "2026-07-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52711641780960/huge/4a195394e3f1702e5fcf72925dae09f386f6a1cc.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Closed In Observance Of 4th Of July",
    link: "https://www.norwoodtown.com/2026-07-02-closed-in-observance-of-4th-of-july",
    description: "The Town of Norwood will be closed in observance of the 4th of July holiday. Residents should plan accordingly for any town services or offices they may need to access around this time.",
    pubDate: "2026-07-02T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Star Spangled Saturday Parade 11 Am",
    link: "https://www.norwoodtown.com/2026-07-04-star-spangled-saturday-parade-11-am",
    description: "The Town of Norwood hosts its annual Star Spangled Saturday Parade on the Fourth of July, stepping off at 11 a.m. This community celebration brings together residents and visitors to mark Independence Day with a traditional hometown parade through Norwood.",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-07-08-board-of-trustees-meeting",
    description: "The Town of Norwood Board of Trustees will hold a regularly scheduled meeting in Norwood. Members of the public are welcome to attend this local government session, where town officials gather to conduct municipal business.",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Sanitation District Meeting",
    link: "https://www.norwoodtown.com/2026-07-09-norwood-sanitation-district-meeting-meeting",
    description: "A regular meeting of the Norwood Sanitation District, hosted by the Town of Norwood. Community members with an interest in local sanitation services and infrastructure are welcome to attend.",
    pubDate: "2026-07-09T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Meeting",
    link: "https://www.norwoodtown.com/2026-07-14-nwc-meeting",
    description: "A regularly scheduled meeting of the Norwood Water Committee, hosted by the Town of Norwood. The meeting provides an opportunity for community members and officials to address water-related issues and local governance matters.",
    pubDate: "2026-07-14T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-07-20-planning-and-zoning-commission-meeting",
    description: "A regularly scheduled meeting of the Norwood Planning and Zoning Commission, held under the Town of Norwood. The commission reviews land use applications, development proposals, and zoning matters affecting the Norwood community.",
    pubDate: "2026-07-20T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Music On The Mesa The Burroughs",
    link: "https://www.norwoodtown.com/2026-08-08-music-on-the-mesa-the-burroughs",
    description: "Music On The Mesa presents The Burroughs in Norwood on August 8th, 2026. This community music event offers live entertainment in the scenic mesa setting outside of Telluride.",
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Labor Day",
    link: "https://www.norwoodtown.com/2026-09-07-closed-for-labor-day",
    description: "The Town of Norwood will be closed in observance of Labor Day. Municipal offices and services will be unavailable during the holiday closure.",
    pubDate: "2026-09-07T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
  {
    title: "Town Talk: Small Molecules at the Origins of Life",
    link: "https://townofmountainvillage.com/explore/events/all-events/town-talk-small-molecules-at-the-origins-of-life/",
    description: "This town talk will be presented by David Lancy, University of Buffalo. How did the atoms in the universe come together to form life?",
    pubDate: "2026-06-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48903/tt_logo_1048x802_a.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "\"This Is Colorado (In One Square Foot)\" Community Art Project Exhibition",
    link: "https://townofmountainvillage.com/explore/events/all-events/this-is-colorado-in-one-square-foot-community-art-project-exhibition/",
    description: "A community art exhibition presenting the \"This Is Colorado (In One Square Foot)\" project, on display in Mountain Village. The show invites the public to explore locally contributed artwork centered on the theme of Colorado identity, each piece interpreting the concept within a single square foot.",
    pubDate: "2026-06-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49173/this_is_co_art_exhibit_1800x900_smaller.jpeg"
  },
  {
    title: "Music on the Green Presents LVDY",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-lvdy-2/",
    description: "Beyond the Groove Productions and the Telluride Mountain Village Owners Association (TMVOA) present LVDY on Friday, June 26, from 5 to 7 p.m.,",
    pubDate: "2026-06-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48851/ldvy_1800x900px_1.png"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-06-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-06-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "The Muleskinner&#039;s Ball (GALA Fundraiser for Telluride Theatre)",
    link: "https://townofmountainvillage.com/explore/events/all-events/the-muleskinners-ball-gala-fundraiser-for-telluride-theatre/",
    description: "Get ready for the Telluride Theatre GALA! Back by popular demand, Telluride Theatre is reprising last year's Muleskinner's Ball for another rowdy evening of",
    pubDate: "2026-06-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48944/mv_calendar_-_muleskinners_ball_2.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "6th Annual Alpine Cookout",
    link: "https://townofmountainvillage.com/explore/events/all-events/6th-annual-alpine-cookout/",
    description: "The 6th Annual Alpine Cookout at Madeline Hotel & Residences returns this July! Get ready for a day of sensational cuisine, live music,",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48895/untitled_design_1.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Telluride Foundation Rundola: Run for Good",
    link: "https://townofmountainvillage.com/explore/events/all-events/telluride-foundation-rundola-run-for-good/",
    description: "Celebrate Independence Day with the Telluride Foundation at the 16th Annual Rundola on July 4th, 2026! This exciting uphill foot race supports the Good",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48757/rundola26_1800x900.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-07-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-07-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "MusicFest",
    link: "https://townofmountainvillage.com/explore/events/all-events/musicfest-2/",
    description: "Come and celebrate MusicFest 2026! This chamber music festival will offers the chance to enjoy chamber music performances by world class musicians in a",
    pubDate: "2026-07-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48604/musicfest.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-07-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-07-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "Mountain Village Merchant Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/merchant-meeting/",
    description: "Join us for the monthly Mountain Village Merchant Meeting to be held on the second Tuesday of each month from 10 to 11 a.m. The meeting will be hybrid with",
    pubDate: "2026-07-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/27556/merchant_event-1.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-15T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Randy Houser Benefit Concert",
    link: "https://townofmountainvillage.com/explore/events/all-events/randy-houser-benefit-concert/",
    description: "Great music, for a great cause. The Telluride Foundation, in partnership with The Alpine Club, is proud to announce the Randy Houser Benefit Concert,",
    pubDate: "2026-07-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48771/tomv_1800x900.jpg"
  },
  {
    title: "Music on the Green Presents Sway Wild",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-sway-wild/",
    description: "Beyond the Groove Productions and the Telluride Mountain Village Owners Association (TMVOA) present Music on the Green with Sway Wild on Friday, July 17,",
    pubDate: "2026-07-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48853/sway_wild_1800x900px_1.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-07-18T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-07-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-07-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-22T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  }
];

const TELLURIDE_COM_EVENTS = [
  {
    title: "Gondola Closed for Maintenance",
    link: "https://www.telluride.com/event/gondola-closes-for-maintenance/",
    description: "The gondola will be closed for maintenance starting October 26 and will re-open for winter at 6:30 a.m. on November 20, …",
    pubDate: "2026-04-06",
    endDate: "2026-11-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45301/gondola-rainbow-2-high-res-2100x1401-f18dd3a9-0d2b-4ff7-b99c-2c162daf4e94.800x533.webp"
  },
  {
    title: "Telluride Arts Salon Night",
    link: "https://www.telluride.com/event/telluride-arts-salon-night/",
    description: "Salon Nights are inspired by the legendary Parisian salons - those lively gatherings where artists, thinkers, and …",
    pubDate: "2026-04-09",
    endDate: "2026-10-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60890/download.800x533.webp"
  },
  {
    title: "Patagonia Telluride Coffee Club",
    link: "https://www.telluride.com/event/patagonia-telluride-coffee-club/",
    description: "Starting in April, Patagonia Telluride is teaming up with The Pour Over Pedaler once a month through October to bring …",
    pubDate: "2026-04-18",
    endDate: "2026-10-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62111/screenshot_2026-04-01_at_2_21_59_pm.800x533.webp"
  },
  {
    title: "Creative Exchange",
    link: "https://www.telluride.com/event/creative-exchange/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call …",
    pubDate: "2026-05-14",
    endDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60815/download_1.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-05-29",
    endDate: "2026-09-18",
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
    pubDate: "2026-05-29",
    endDate: "2026-10-09",
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
    pubDate: "2026-05-29",
    endDate: "2026-09-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-02",
    endDate: "2026-10-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Sweet Sounds",
    link: "https://www.telluride.com/event/sweet-sounds/",
    description: "Head to the Wilkinson Public Library on the first Wednesday of the month this summer for live music and sweet treats! …",
    pubDate: "2026-06-03",
    endDate: "2026-08-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62443/sweet_sounds_5.800x533.webp"
  },
  {
    title: "Telluride Art Walk",
    link: "https://www.telluride.com/event/telluride-art-walk/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and …",
    pubDate: "2026-06-04",
    endDate: "2026-10-01",
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
    pubDate: "2026-06-04",
    endDate: "2026-09-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58400/screenshot_2026-01-21_at_4_30_00_pm.800x533.webp"
  },
  {
    title: "Free Tasting",
    link: "https://www.telluride.com/event/free-tasting-at-telluride-wine-merchant/",
    description: "Free tasting every Thursday from 4-6pm. The theme of the tasting will vary from different seasonal selections in wine, …",
    pubDate: "2026-06-04",
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62697/screenshot_2026-06-03_at_1_50_16_pm.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Saturdays through Thursdays this summer for Games on the Green! They will have classic lawn …",
    pubDate: "2026-06-06",
    endDate: "2026-09-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-09",
    endDate: "2026-08-11",
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
    endDate: "2026-09-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53672/download_1.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-06-10",
    endDate: "2026-09-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
  },
  {
    title: "Free Wine Tasting",
    link: "https://www.telluride.com/event/free-wine-tasting/",
    description: "Join the Mountain Village Wine Merchant every Wednesday for a free wine tasting of three different wines.",
    pubDate: "2026-06-10",
    endDate: "2026-09-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/46449/mvwmplanetpic2.800x533.webp"
  },
  {
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-06-11",
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
  },
  {
    title: "Live Music at Alloy Kitchen",
    link: "https://www.telluride.com/event/live-music-at-alloy-kitchen/",
    description: "Free live music, four nights a week, all season long. Alloy Kitchen at Mountain Lodge Telluride hosts a rotating lineup …",
    pubDate: "2026-06-11",
    endDate: "2026-10-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62862/alloy-live-music-pool-deck.800x533.webp"
  },
  {
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-06-13",
    endDate: "2026-08-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Music on the Mesa",
    link: "https://www.telluride.com/event/music-on-the-mesa/",
    description: "Music on the Mesa is a FREE outdoor concert series presented two Saturdays a summer by Norwood Park & Rec District, …",
    pubDate: "2026-06-13",
    endDate: "2026-08-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62177/screenshot_2026-04-09_at_2_09_57_pm.800x533.webp"
  },
  {
    title: "Sunday Rehab",
    link: "https://www.telluride.com/event/sunday-rehab/",
    description: "Sunday Rehab brings the Mountain Lodge pool deck to life every Sunday with brunch, a Bloody Mary and juice bar, food …",
    pubDate: "2026-06-14",
    endDate: "2026-10-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62769/sunday-rehab-event-image-2200x1237.800x533.webp"
  },
  {
    title: "Weird Wine Wednesdays at The National",
    link: "https://www.telluride.com/event/weird-wine-wednesdays-at-the-national/",
    description: "Elevate your evening on the rooftop at The National with Weird Wine Wednesdays, a laid-back, weekly tasting experience …",
    pubDate: "2026-06-17",
    endDate: "2026-09-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62830/the_national_wine.800x533.webp"
  },
  {
    title: "Bombargo",
    link: "https://www.telluride.com/event/bombargo/",
    description: "Bombargo is a Canadian based international touring band that drops a vibrant splash of soul over their distinctive …",
    pubDate: "2026-06-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/56920/screenshot_2026-04-09_at_2_01_00_pm.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-06-24",
    endDate: "2026-08-19",
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
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62503/bosq_x_the_national_collab.800x533.webp"
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
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58332/dsc01583lr--1-.800x533.webp"
  },
  {
    title: "The Jauntee",
    link: "https://www.telluride.com/event/the-jauntee/",
    description: "The Jauntee is an electrifying and genre-blending musical ensemble that has captivated audiences with their unique and …",
    pubDate: "2026-06-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62170/screenshot_2026-04-09_at_2_02_00_pm.800x533.webp"
  },
  {
    title: "Trick Dog Takeover at Timber Room",
    link: "https://www.telluride.com/event/trick-dog-takeover-at-timber-room/",
    description: "San Francisco's acclaimed Trick Dog brings its inventive approach to cocktails to The Madeline Hotel & Residences …",
    pubDate: "2026-06-26",
    endDate: "2026-06-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62758/trick_dog.800x533.webp"
  },
  {
    title: "Telluride Theatre Muleskinner&#039;s Ball Fundraiser",
    link: "https://www.telluride.com/event/telluride-theatre-muleskinners-ball-fundraiser/",
    description: "Get ready for the one-night/one-of-a-kind Telluride Theatre GALA! A blast from the past - the biggest party of the …",
    pubDate: "2026-06-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/47975/muleskinners_ball_hero_1920x1080_hero.800x533.webp"
  },
  {
    title: "Dinner and a Magic Show With Ty Gallenbeck",
    link: "https://www.telluride.com/event/dinner-and-a-magic-show-with-ty-gallenbeck/",
    description: "Enjoy a three-course wine-paired dinner followed by a VIP magic show featuring performer Ty Gallenbeck in Telluride. This community event combines fine dining with live entertainment for an evening of food and magic.",
    pubDate: "2026-06-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62888/1000009408.800x533.webp"
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
    title: "Play It Forward! Pickleball for a Purpose",
    link: "https://www.telluride.com/event/play-it-forward-pickleball-for-a-purpose/",
    description: "Play It Forward! brings together the Telluride Community for a day of pickleball, friendly competition, and meaningful …",
    pubDate: "2026-06-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62799/play_it_forward_3_1.800x533.webp"
  },
  {
    title: "The National Summer School: Premium Pours for the BBQ",
    link: "https://www.telluride.com/event/the-national-summer-school-premium-pours-for-the-bbq/",
    description: "Elevate your approach to casual summer dining. This engaging session explores the unexpected harmony between classic …",
    pubDate: "2026-06-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62824/the_national_wine.800x533.webp"
  },
  {
    title: "Pride Ride",
    link: "https://www.telluride.com/event/pride-ride/",
    description: "Join TelluPride for the 2026 Pride Ride on Sunday, June 28! Riders will meet under the bra in Telluride Town Park at 3 …",
    pubDate: "2026-06-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62911/screenshot_2026-06-16_at_11_17_56_am.800x533.webp"
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
    title: "The Mountain Ark: A Ken Bailey Film",
    link: "https://www.telluride.com/event/the-mountain-ark-a-ken-bailey-film/",
    description: "Lissa Margetts, one of Telluride’s most beloved characters and quintessential figures, connects with animals on a …",
    pubDate: "2026-06-29",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62927/the-mountain-ark-a-ken-bailey-film.800x533.webp"
  },
  {
    title: "Federal Judge Roy Altman on Why the Israel Debate Matters",
    link: "https://www.telluride.com/event/federal-judge-roy-altman-on-why-the-israel-debate-matters/",
    description: "Drawing from his bestselling book Israel on Trial, federal judge Roy Altman explores how the debate over Israel …",
    pubDate: "2026-06-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62810/roy_altman_event_qr_1.800x533.webp"
  },
  {
    title: "Wim Tapley & the Cannons",
    link: "https://www.telluride.com/event/wim-tapley-the-cannons/",
    description: "Based in Athens, Georgia, Wim Tapley came of age playing shows in Washington D.C. where he honed his voice with the …",
    pubDate: "2026-07-01",
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
    title: "Telluride Venture Network’s Pitch Day",
    link: "https://www.telluride.com/event/telluride-venture-networks-pitch-day/",
    description: "TVN's Climate Solutions Investment Bootcamp culminates in a high-energy Pitch Day. Come listen to some of the most …",
    pubDate: "2026-07-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62741/telluride_com_events-_2200x1237.800x533.webp"
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
    title: "The Color of Summer Exhibit Opening",
    link: "https://www.telluride.com/event/the-color-of-summer/",
    description: "Visit the Telluride Arts HQ Gallery to view \"The Color of Summer\" from July 2 - October 25, 2026. More About the …",
    pubDate: "2026-07-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62906/telluride_arts_color_of_summer_tot_2200_x_1237_px.800x533.webp"
  },
  {
    title: "Mind Blown",
    link: "https://www.telluride.com/event/mind-blown/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of …",
    pubDate: "2026-07-03",
    endDate: "2026-09-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36321/couch_1600x900.800x533.webp"
  },
  {
    title: "Red, White & Blues",
    link: "https://www.telluride.com/event/red-white-and-blues/",
    description: "Mountain Village's beloved Red, White & Blues Celebration returns July 3-4, 2026, bringing two days of FREE family …",
    pubDate: "2026-07-03",
    endDate: "2026-07-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/37568/screenshot_2026-06-09_at_9_49_43_am_870x435.800x533.webp"
  },
  {
    title: "Madeline Hotel & Residences Annual Alpine Cookout",
    link: "https://www.telluride.com/event/madeline-hotel-residences-annual-alpine-cookout/",
    description: "The 6th Annual Alpine Cookout at Madeline Hotel & Residences returns this July! Get ready for a day of sensational …",
    pubDate: "2026-07-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48038/copy_of_alpine_cookout_hero.800x533.webp"
  },
  {
    title: "Better Than Ezra",
    link: "https://www.telluride.com/event/better-than-ezra/",
    description: "Friday evening's live music lineup begins with acclaimed singer-songwriter and local legend Emily Scott Robinsonat 5 …",
    pubDate: "2026-07-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62891/bte_show_poster.800x533.webp"
  },
  {
    title: "Telluride Fourth of July Parade",
    link: "https://www.telluride.com/event/telluride-4th-of-july-parade/",
    description: "The Telluride 4th of July Parade is the longest running event in the Town's history. The parade celebrates our …",
    pubDate: "2026-07-04",
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
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44821/download_11.800x533.webp"
  },
  {
    title: "Fourth of July Celebration at the Museum",
    link: "https://www.telluride.com/event/4th-of-july-celebration-at-the-museum/",
    description: "Come celebrate the 4th of July with the Museum with their annual root beer float fundraiser. Come up the hill to the …",
    pubDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48234/july4_2018_poster.800x533.webp"
  },
  {
    title: "Mindchatter",
    link: "https://www.telluride.com/event/mindchatter/",
    description: "Singer, songwriter, and multi-instrumentalist Bryce Connolly, better known as Mindchatter, has built a reputation for …",
    pubDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62894/download_4_5.800x533.webp"
  },
  {
    title: "Alpine Chapel Outdoor Service",
    link: "https://www.telluride.com/event/alpine-chapel-outdoor-service/",
    description: "The Alpine Chapel will host an outdoor worship service at the Sunset Plaza Stage in Mountain Village at 9:30 a.m.",
    pubDate: "2026-07-05",
    endDate: "2026-09-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62860/img_4897.800x533.webp"
  },
  {
    title: "Science of Cocktails",
    link: "https://www.telluride.com/event/science-of-cocktails/",
    description: "A crowd pleaser for more than 15 years attracting those from near and far, the Science of Cocktails is Pinhead’s …",
    pubDate: "2026-07-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53794/soc2026_v1_0_instagram45.800x533.webp"
  },
  {
    title: "SoDown",
    link: "https://www.telluride.com/event/sodown/",
    description: "SoDown, the project of Denver-based producer, multi-instrumentalist, and live performer Ehren River Wright, delivers an …",
    pubDate: "2026-07-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61831/clientfile_610220.800x533.webp"
  },
  {
    title: "River Spell",
    link: "https://www.telluride.com/event/river-spell/",
    description: "River Spell is a Colorado-based jam band that delivers heartfelt songwriting and extended improvisation. Their …",
    pubDate: "2026-07-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62654/screenshot_2026-06-01_at_3_21_03_pm.800x533.webp"
  },
  {
    title: "Hardrock Hundred Endurance Run",
    link: "https://www.telluride.com/event/hardrock-100/",
    description: "The Hardrock Hundred Mile Endurance Run is an ultramarathon of 102.5 miles in length, plus 33,197 feet of climb and …",
    pubDate: "2026-07-10",
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
    title: "Mauritson Wine Dinner",
    link: "https://www.telluride.com/event/mauritson-wine-dinner-madeline-hotel-residences/",
    description: "Join sixth-generation Sonoma winemaker Clay Mauritson for an intimate evening at Madeline Hotel & Residences. For …",
    pubDate: "2026-07-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62760/untitled_design_2.800x533.webp"
  },
  {
    title: "North Mississippi Allstars",
    link: "https://www.telluride.com/event/north-mississippi-allstars/",
    description: "The Sheridan Arts Foundation presents North Mississippi Allstars Live in Concert at the historic Sheridan Opera House …",
    pubDate: "2026-07-11",
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
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62315/img_5733.800x533.webp"
  },
  {
    title: "Meet the Winemaker Hike With Clay Mauritson",
    link: "https://www.telluride.com/event/meet-the-winemaker-hike-with-clay-mauritson/",
    description: "Join sixth-generation Sonoma farmer and winemaker Clay Mauritson for an intimate alpine adventure through Telluride's …",
    pubDate: "2026-07-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62762/clay_mauritson__photo_credit_king_lawrence.800x533.webp"
  },
  {
    title: "AVID Dance: The Wolff & Other Works",
    link: "https://www.telluride.com/event/palm-arts-presents-avid-dance-the-wolff-other-works/",
    description: "Artistic Ventures in Dance (AVID) invites you to join us for \"The Wolff & Other Works”, an unforgettable evening …",
    pubDate: "2026-07-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62925/telluride_tour_poster_1.800x533.webp"
  },
  {
    title: "Liver Down the River",
    link: "https://www.telluride.com/event/liver-down-the-river/",
    description: "From the heart of Colorado comes a five piece band, Liver Down The River. The group has their roots in countless river …",
    pubDate: "2026-07-16",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62309/screenshot_2026-04-29_at_2_56_50_pm.800x533.webp"
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
    title: "Telluride Theatre&#039;s Annual Shakespeare in the Park",
    link: "https://www.telluride.com/event/telluride-theatres-annual-shakespeare-in-the-park/",
    description: "2026 Shakespeare in the Park\n\nHenry, the young and newly crowned king, is impatient to assert control over the people …",
    pubDate: "2026-07-17",
    endDate: "2026-07-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/51687/thunder_tix_600x375px.800x533.webp"
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
    title: "Randy Houser Benefit Concert With Special Guest Jamey Johnson",
    link: "https://www.telluride.com/event/randy-houser-benefit-concert/",
    description: "Great music, for a great cause. The Telluride Foundation, in partnership with The Alpine Club, is proud to announce the …",
    pubDate: "2026-07-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62393/randy_houser_calendar_2200x1237_1.800x533.webp"
  },
  {
    title: "Young and Dead",
    link: "https://www.telluride.com/event/young-and-dead/",
    description: "Young and Dead is an exciting culmination of musicians in their early 20's from Boulder, Colorado. With a unique …",
    pubDate: "2026-07-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62657/screenshot_2026-06-01_at_3_22_58_pm.800x533.webp"
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
    title: "Telluride Mountain Club’s Party in the Park",
    link: "https://www.telluride.com/event/telluride-mountain-clubs-party-in-the-park/",
    description: "TMtC's annual Party in the Park is happening July 23 at Telluride Town Park! This community celebration supports our …",
    pubDate: "2026-07-23",
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
    endDate: "2026-08-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58269/norwood.800x533.webp"
  },
  {
    title: "Summer Spectacular: The Music Man",
    link: "https://www.telluride.com/event/summer-spectacular-the-music-man/",
    description: "SAF’s YPT Summer Spectacular program starts on a Monday, and by Friday, these summer campers have learned an entire …",
    pubDate: "2026-07-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62637/ypt-summer-music-man.800x533.webp"
  },
  {
    title: "High Country Hustle",
    link: "https://www.telluride.com/event/high-country-hustle/",
    description: "High Country Hustle is a bluegrass band from Durango, Colorado, formed in 2017 and known for their high-energy …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62174/screenshot_2026-04-09_at_2_05_25_pm.800x533.webp"
  },
  {
    title: "The Nugget: A Telluride Restoration Story",
    link: "https://www.telluride.com/event/the-nugget-a-telluride-restoration-story/",
    description: "The Nugget: A Telluride Restoration Story, a documentary short film presented by former Nugget Building owners Katrine …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62645/film-the-nugget-a-telluride-restoration-story-and-a-benefit-for-the-telluride-historical-museum.800x533.webp"
  },
  {
    title: "Town Talk: The Dual Challenge - Climate and Energy",
    link: "https://www.telluride.com/event/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. …",
    pubDate: "2026-07-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62558/0728-tt_320_x_212-tf.800x533.webp"
  },
  {
    title: "The Mammoths",
    link: "https://www.telluride.com/event/the-mammoths/",
    description: "Hailing from Austin, TX, fuzz rockers The Mammoths fuse ‘70s inspired psychedelia with biting, petrified rock n’ …",
    pubDate: "2026-07-29",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62660/screenshot_2026-06-01_at_3_26_04_pm.800x533.webp"
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
  },
  {
    title: "Nik Parr & the Selfless Lovers",
    link: "https://www.telluride.com/event/nik-parr-the-selfless-lovers/",
    description: "Nik Parr & The Selfless Lovers are a high-energy, piano-driven roots rock band hailing from Austin, Texas. Imagine …",
    pubDate: "2026-07-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62663/screenshot_2026-06-01_at_3_27_44_pm.800x533.webp"
  },
  {
    title: "San Miguel Basin Fair and Rodeo",
    link: "https://www.telluride.com/event/san-miguel-basin-fair-and-rodeo/",
    description: "The San Miguel Basin Fair takes place every summer at the San Miguel County Fairgrounds in Norwood. Livestock shows …",
    pubDate: "2026-07-31",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44941/60e630d2b3fd1_image.800x533.webp"
  },
  {
    title: "New York Philharmonic Brass Quintet",
    link: "https://www.telluride.com/event/new-york-philharmonic-brass-quintet/",
    description: "The incredible New York Philharmonic Principal Brass Quintet perform in Telluride! Don’t miss the best brass players …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62212/nyp_brass.800x533.webp"
  },
  {
    title: "The Brass Family",
    link: "https://www.telluride.com/event/the-brass-family/",
    description: "“The Brass Family” – with the New York Philharmonic Principal Brass Quintet Learn all about brass instruments in …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62214/nyp_education.800x533.webp"
  },
  {
    title: "Summer Spectacular: The Jungle Book",
    link: "https://www.telluride.com/event/summer-spectacular-the-jungle-book/",
    description: "SAF’s YPT Summer Spectacular program starts on a Monday, and by Friday, these summer campers have learned an entire …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62640/ypt-sumemr-jungle-book.800x533.webp"
  },
  {
    title: "Top Chef and Taste of Telluride",
    link: "https://www.telluride.com/event/top-chef-and-taste-of-telluride/",
    description: "Top Chef and Taste of Telluride offers up scrumptious food and creative cocktails, a chef competition, silent auction …",
    pubDate: "2026-08-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44989/screenshot_2024-07-09_at_1_28_41_pm.800x533.webp"
  },
  {
    title: "Natalie Brooke",
    link: "https://www.telluride.com/event/natalie-brooke/",
    description: "Natalie Brooke is a rock star. A virtuoso funk / rock keys player leading her powerhouse 4-piece band from the …",
    pubDate: "2026-08-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62666/screenshot_2026-06-01_at_3_29_24_pm.800x533.webp"
  },
  {
    title: "Big Love Car Wash",
    link: "https://www.telluride.com/event/big-love-car-wash/",
    description: "Like the music they play, Big Love Car Wash is full of dichotomies: whimsical yet serious, fanciful yet pragmatic, …",
    pubDate: "2026-08-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62901/biglovecarwash-2lb24-1536x1024.800x533.webp"
  },
  {
    title: "Telluride Jazz Festival",
    link: "https://www.telluride.com/event/telluride-jazz-festival/",
    description: "Since 1977, Telluride’s majestic perch high in the San Juan Mountains of southwestern Colorado has been the site of …",
    pubDate: "2026-08-07",
    endDate: "2026-08-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28880/14407123460f9210.800x533.webp"
  },
  {
    title: "KOTO Duck Race",
    link: "https://www.telluride.com/event/koto-duck-race/",
    description: "The Ducks are trained and ready to rumble! KOTO’s Duck Race is happening on August 7, and there are a ton of …",
    pubDate: "2026-08-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44995/rubber-duck-race-white-no-rotary-logo-or-heading_20200710-224712.800x533.webp"
  },
  {
    title: "Telluride Mushroom Festival",
    link: "https://www.telluride.com/event/telluride-mushroom-festival/",
    description: "Since 1981, the Telluride Mushroom Festival has been celebrating all things mycological, from the newest advancements …",
    pubDate: "2026-08-12",
    endDate: "2026-08-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45066/2-2-26-4to3-full-color-poster.800x533.webp"
  },
  {
    title: "Community Concert",
    link: "https://www.telluride.com/event/community-concert/",
    description: "A fun and free chamber music series featuring talented local musicians. These concerts will appeal to both first time …",
    pubDate: "2026-08-13",
    endDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60285/download_8.800x533.webp"
  },
  {
    title: "Burlesque Buffet",
    link: "https://www.telluride.com/event/burlesque-buffet/",
    description: "Presented by Telluride Theatre's Professional Burlesque Troupe: THE HOUSE OF SHIMMY SHAKE! HOSS returns for a …",
    pubDate: "2026-08-21",
    endDate: "2026-08-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62743/1_burlesque_buffet_visit_telluride_placeholder.800x533.webp"
  },
  {
    title: "Noche de Luz (Night of Light)",
    link: "https://www.telluride.com/event/noche-de-luz-night-of-light/",
    description: "Join Tri-County Health Network for a Night of Light, Celebrating our Community in Bloom! A Vibrant Celebration of …",
    pubDate: "2026-08-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62940/untitled_2200_x_1237_px.800x533.webp"
  },
  {
    title: "Telluride Mountain Run",
    link: "https://www.telluride.com/event/telluride-mountain-run/",
    description: "The Telluride Mountain Run is a challenging and technical mountain race in the San Juan Mountains above the beautiful …",
    pubDate: "2026-08-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55221/screenshot_2024-08-27_at_2_39_13_pm.800x533.webp"
  },
  {
    title: "Wax Monkey",
    link: "https://www.telluride.com/event/wax-monkey/",
    description: "Wax Monkey is a 5-piece jam band composed of childhood friends hailing from Birmingham, Alabama. The members first …",
    pubDate: "2026-08-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62312/screenshot_2026-04-29_at_2_59_37_pm.800x533.webp"
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
  },
  {
    title: "Foreclosure Sale -- Section 27 Property (Sale No. 202602)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee will conduct a foreclosure sale for property originally owned by Alexander S. Hartman due to death of all named mortgagors under the deed of trust. The property is located in Section 27, Township 45 North, Range 13 West. Current debt holder is Mortgage Assets Management, LLC with an outstanding balance of $309,162.10.",
    deadline: "TBD",
    expires: "2026-07-31",
    dates: "6/4",
    papers: ["ttimes_0604"],
    url: "https://www.telluridenews.com/news/legals/article_f189086a-bd15-49d6-92a1-f8e7553ebb74.html",
    address: "Section 27, Township 45 North, Range 13 West, San Miguel County",
    noticeKey: "foreclosure-202602",
    caseNumber: "202602"
  },
  {
    title: "Notice to First Mortgagees -- Village Creek Condominium Declaration Amendment",
    entity: "Village Creek Condominium Association",
    entityClass: "ent-county",
    entityLogo: "smrha",
    icon: "🏠",
    iconClass: "type-hearing",
    type: "Housing Notice",
    filterTag: "housing",
    summary: "Village Creek Condominium Association has issued a proposed First Amendment to the Declaration for Village Creek Condominiums, as established by the Condominium Declaration recorded December 23, 1987. Pursuant to C.R.S. sec. 38-33.3-217, this notice is being published to notify first mortgagees of the proposed amendment.",
    deadline: "",
    expires: "2026-07-14",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "Village Creek Condominiums, San Miguel County",
    noticeKey: "village-creek-condo-amendment"
  },
  {
    title: "Financial Report -- Treasurer's Semi-Annual Report (July-December 2025)",
    entity: "San Miguel County Treasurer",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Treasurer has prepared the Semi-Annual Report for July-December 2025, which is now available for public viewing on the county website under agendas and minutes from May 6, 2026. This report provides financial information about county operations.",
    deadline: "Not specified",
    expires: "2026-07-28",
    dates: "5/28",
    papers: ["ttimes_0528"],
    url: "https://www.telluridenews.com/news/legals/article_0adc5789-cb68-4509-b7a8-1e8bf62a4c8e.html",
    address: "San Miguel County",
    noticeKey: "treasurer-report-2025-h2"
  },
  {
    title: "Property Tax Exemption -- Senior Citizens, Veterans, and Gold Star Spouses",
    entity: "San Miguel County Assessor",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Assessor is informing residents about property tax exemptions available for qualifying senior citizens (65+), veterans with disabilities, and gold star veteran spouses. The exemption covers 50% of the first $200,000 in actual value of primary residences, with applications due by July 15 (late applications accepted until August 15).",
    deadline: "July 15, 2026 (late applications until August 15, 2026)",
    expires: "2026-08-15",
    dates: "5/28",
    papers: ["ttimes_0528"],
    url: "https://www.telluridenews.com/news/legals/article_0adc5789-cb68-4509-b7a8-1e8bf62a4c8e.html",
    address: "San Miguel County",
    noticeKey: "tax-exemption-2026"
  },
  {
    title: "Foreclosure Sale -- Hartman Property (Sale No. COL-000156)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee is conducting a foreclosure sale for property owned by Alexander S. Hartman due to death of all named mortgagors. The property at 1730 Grand Avenue, Norwood will be auctioned on July 30, 2026 at 10:00 AM at the Telluride courthouse to satisfy a debt of $309,162.10.",
    deadline: "July 30, 2026 at 10:00 AM",
    expires: "2026-07-30",
    dates: "6/11",
    papers: ["ttimes_0611"],
    url: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    address: "Section 27, Township 45 North, Range 13 West (1730 Grand Avenue, Norwood, CO 81423)",
    noticeKey: "foreclosure-col-000156"
  },
  {
    title: "Foreclosure Sale -- Esch Property (Sale No. 2026-01)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee is conducting a foreclosure sale for property owned by Sandra G. Esch due to failure to make timely mortgage payments. The property at 122 43ZS Road, Norwood will be auctioned on July 16, 2026 at 10:00 AM at the Telluride courthouse to satisfy a debt of $115,217.40.",
    deadline: "July 16, 2026 at 10:00 AM",
    expires: "2026-07-16",
    dates: "6/11",
    papers: ["ttimes_0611"],
    url: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    address: "Northwest 1/4 Northwest 1/4, Section 26, Township 45 North, Range 13 West (122 43ZS Road, Norwood, CO 81423)",
    noticeKey: "foreclosure-2026-01"
  },
  {
    title: "Water Court Application -- Trout Lake Reservoir Storage Rights (Case No. 26CW3028)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "Telluride Preserve Homeowners Association filed an application to make absolute a 3.0 acre-foot conditional water right from Lake Fork of the San Miguel River for storage in Trout Lake Reservoir. The water right is for replacement of depletions and augmentation purposes, with beneficial use claimed as of June 16, 2025.",
    deadline: "Statutory protest period (typically 4-6 months from publication)",
    expires: "2026-08-31",
    dates: "6/11",
    papers: ["ttimes_0611"],
    url: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    address: "NE SW Section 8, Township 41 North, Range 9 West, NMPM",
    noticeKey: "26cw3028",
    caseNumber: "26CW3028"
  },
  {
    title: "Request for Proposal -- Town of Telluride Housing Common Spaces Cleaning Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: Town of Telluride Housing Common Spaces Cleaning Services.",
    deadline: "Closes 6/26/2026",
    expires: "2026-06-26",
    dates: "6/11",
    url: "https://www.telluride.gov/bids.aspx?bidID=130",
    address: "",
    totBidID: "130"
  },
  {
    title: "Probate Notice -- Claims Against Estate (Case No. 26PR30006)",
    entity: "Estate of (unnamed), Patricia L. Bode Personal Representative",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Patricia L. Bode, as Personal Representative of an estate in San Miguel County, is notifying all persons with claims against the estate that they must present those claims to her or to the District Court of San Miguel County on or before October 18, 2026, or claims may be forever barred. The notice is published through attorney Zachary T. Reams of Reams & Reams in Grand Junction, CO.",
    deadline: "2026-10-18",
    expires: "2026-10-18",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "26PR30006",
    caseNumber: "26PR30006"
  },
  {
    title: "Public Hearing Notice -- Land Use Code Amendment Section 5-1908 Nonconforming Lots",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Board of County Commissioners is holding a public hearing on July 15, 2026 at 10:00 a.m. in Telluride (333 W. Colorado Ave, 2nd Floor) and online to consider an amendment to Land Use Code Section 5-1908 regarding Nonconforming Lots, with related amendments to Sections 5-307 (Forestry, Agriculture and Open), 5-314 (Open Space), 5-319.1 (Wright's Mesa), 5-321 (High Country Area), and Article 7 (Definitions). This is the second step of a two-step process; written comments should be submitted to the San Miguel County Planning Department by noon on May 27, 2026.",
    deadline: "2026-07-15",
    expires: "2026-07-15",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "333 W. Colorado Ave, 2nd Floor, Telluride, CO 81435 (San Miguel County unincorporated lands)",
    noticeKey: "luc-amendment-5-1908-nonconforming-lots"
  },
  {
    title: "Foreclosure Sale Notice -- Stonegate Drive Mountain Village (Sale No. 202603)",
    entity: "Federal Holding Realty / Public Trustee San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee, Brandi R. Hatfield, will conduct a public foreclosure auction on August 13, 2026 at 10:00 a.m. at 305 W. Colorado Avenue, Telluride, for a vacant lot at Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village). The original grantor is Two Stonegate LLC; the current debt holder is Federal Holding Realty, with an outstanding principal balance of $500,000.00 on a deed of trust dated February 23, 2026. The foreclosure is due to failure to make payments as provided in the Note and Deed of Trust.",
    deadline: "2026-08-13",
    expires: "2026-08-13",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village, San Miguel County)",
    noticeKey: "foreclosure-sale-202603",
    caseNumber: "202603"
  },
  {
    title: "Public Hearing Notice -- Land Use Code Amendment New Section 5-31 Natural Medicine Businesses",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Board of County Commissioners is being asked to consider a Land Use Code amendment adding a new Section 5-31 governing Natural Medicine Businesses, along with related amendments to Article 7 (Definitions). The amendment requires review and recommendation by the County Planning Commission (CPC) and action by the Board of County Commissioners pursuant to LUC Section 3-601 D. This notice indicates this is the second step of a two-step public hearing process; full hearing details were not fully captured in the published text.",
    deadline: "",
    expires: "2026-08-18",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "San Miguel County, Colorado (countywide land use code)",
    noticeKey: "luc-amendment-5-31-natural-medicine"
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
];

const RIDGWAY_AGENDA_MAP = {
  "June 16, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Special-Meeting-Packet---June-16%2C-2026.pdf",

  "June 10, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---June-10%2C-2026.pdf",

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
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20January%2014%2C%202026_0.pdf",

  "December 10, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20December%2010%2C%202025.pdf",

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
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20July%209%2C%202025%20UPDATED_0.pdf",

  "June 11, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2011%2C%202025.pdf",

  "June 2, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20June%202%2C%202025.pdf",

  "May 14, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Town%20Council%20Regular%20Meeting%20Packet%20-%20May%2014%2C%202025.pdf",

  "April 29, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20April%2029%2C%202025_0.pdf",

  "April 9, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%209%2C%202025.pdf",

  "March 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2012%2C%202025.pdf",

  "February 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20February%2012%2C%202025%20UPDATED.pdf",

  "January 8, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20January%208%2C%202025.pdf",

  "December 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20December%2011%2C%202024%20UPDATED.pdf",

  "November 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20November%2013%2C%202024.pdf",

  "October 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2012%2C%202024.pdf",

  "October 9, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20October%209%2C%202024.pdf",

  "September 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20September%2011%2C%202024_0.pdf",

  "August 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20August%2014%2C%202024%20UPDATED.pdf",

  "July 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20July%2010%2C%202024_0.pdf",

  "June 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2012%2C%202024.pdf",

  "May 8, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20May%208%2C%202024_0.pdf",

  "April 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%2010%2C%202024.pdf",

  "March 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2013%2C%202024%20updated_0.pdf",

  "February 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20UPDATED%20-%20February%2014%2C%202024.pdf",

  "December 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20December%2013%2C%202023.pdf",

  "November 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20November%208%2C%202023.pdf",

  "October 21, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2021%2C%202023.pdf",

  "October 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20October%2011%2C%202023.pdf",

  "September 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20September%2013%2C%202023.pdf",

  "August 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20August%2028%2C%202023.pdf",

  "August 9, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20August%209%2C%202023.pdf",

  "July 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-July%2012%2C%202023.pdf",

  "June 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June%2015%20workforce%20%26%20affordable%20housing%20committee%20agenda.pdf",

  "June 14, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20June%2014%2C%202023.pdf",

  "June 6, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20June%206%2C%202023.pdf",

  "May 10, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20May%2010%2C%202023.pdf",

  "April 17, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20April%2017%2C%202023.pdf",

  "April 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20April%2012%2C%202023.pdf",

  "March 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20March%208%2C%202023.pdf",

  "February 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20February%208%2C%202023_0.pdf",

  "January 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20January%2011%2C%202023.pdf",

  "November 16, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2016%2C%202023.pdf",

  "February 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Workshop%20Packet%20-%20February%2015%2C%202023.pdf",

  "December 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Packet%20-%20December%2014%2C%202022.pdf",

  "November 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Updated%20Town%20Council%20Packet%20-%20November%209%2C%202022_0.pdf",

  "October 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2029%2C%202022.pdf",

  "October 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Council%20Meeting%20Packet%20-%20October%2012%2C%202022.pdf",

  "September 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Council%20Meeting%20Packet%20-%20September%2014%2C%202022_0.pdf",

  "September 7, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Sept%207%20special%20meeting%20agenda.pdf",

  "August 10, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20August%2010%2C%202022.pdf",

  "August 3, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Special%20Meeting%20Packet%20-%20August%203%2C%202022.pdf",

  "July 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20July%2013%2C%202022.pdf",

  "June 8, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20June%208%2C%202022.pdf",

  "May 11, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20May%2011%2C%202022.pdf",

  "April 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20April%2013%2C%202022_0.pdf",

  "March 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20March%209%2C%202022.pdf",

  "February 28, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Special%20Meeting%20Packet%20-%20February%2028%2C%202022.pdf",

  "February 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20February%209%2C%202022%20UPDATED.pdf",

  "January 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20January%2012%2C%202022.pdf",

  "November 17, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2017%2C%202022.pdf",

  "January 27, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop%20Packet.pdf",

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
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2018%2C%202021.pdf",

  "October 21, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop%20Packet%20-%20October%2021%2C%202021.pdf",

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

  "June 17, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---June-17%2C-2026.pdf",

  "May 20, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---May-20%2C-2026.pdf",

  "April 15, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.04.15%20%28PC%20Meeting%20Pkt%29.pdf",

  "March 18, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.03.18%20%28PC%20Meeting%20Pkt%29.pdf",

  "February 18, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.02.18%20PC%20Meeting.pdf",

  "November 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20November%2019%2C%202025.pdf",

  "October 15, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2015%2C%202025.pdf",

  "September 17, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2017%2C%202025.pdf",

  "August 20, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2020%2C%202025.pdf",

  "June 18, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2018%202025.pdf",

  "May 21, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20May%2021%2C%202025.pdf",

  "April 16, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2016%2C%202025.pdf",

  "March 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2019%2C%202025.pdf",

  "February 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2019%2C%202025.pdf",

  "January 28, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20January%2028%2C%202025.pdf",

  "November 26, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20November%2026%2C%202024_0.pdf",

  "October 29, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2029%2C%202024.pdf",

  "September 24, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2024%2C%202024.pdf",

  "August 27, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2027%2C%202024.pdf",

  "July 30, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20July%2030%2C%202024.pdf",

  "June 25, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2025%2C%202024.pdf",

  "May 28, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20May%2028%2C%202024.pdf",

  "April 30, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2030%2C%202024.pdf",

  "March 26, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2026%2C%202024.pdf",

  "February 27, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2027%2C%202024.pdf",

  "October 31, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2031%2C%202023.pdf",

  "September 26, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2026%2C%202023.pdf",

  "August 29, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2029%2C%202023.pdf",

  "June 27, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2027%2C%202023.pdf",

  "April 25, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2025%2C%202023.pdf",

  "April 4, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Special%20Meeting%20Packet%20-%20April%204%2C%202023.pdf",

  "March 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2028%2C%202023.pdf",

  "February 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2028%2C%202023.pdf",

  "January 31, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20%28updated%29%20-%20January%2031%2C%202023.pdf",

  "January 10, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20January%2010%2C%202023.pdf",

  "November 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20PC%20Meeting%20Packet%20-%20November%2029%2C%202022.pdf",

  "October 25, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20PC%20Packet%20-%20October%2025%2C%202022.pdf",

  "September 27, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Planning%20Commission%20Meeting%20Packet%20-%20September%2027%2C%202022.pdf",

  "September 22, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Special%20Planning%20Commission%20Meeting%20Packet%20-%20September%2022%2C%202022.pdf",

  "August 30, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20August%2030%2C%202022.pdf",

  "July 26, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2026%2C%202022.pdf",

  "June 28, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20June%2028%2C%202022.pdf",

  "May 31, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20May%2031%2C%202022%20compressed.pdf",

  "April 26, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20April%2026%2C%202022.pdf",

  "March 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20March%2029%2C%202022.pdf",

  "February 22, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20February%2022%2C%202022.pdf",

  "January 25, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20January%2025%2C%202022.pdf",

  "November 30, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20November%2030%2C%202021.pdf",

  "October 26, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20October%2026%2C%202021%203.pdf",

  "September 28, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20September%2028%2C%202021.pdf",

  "August 31, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20August%2031%2C%202021.pdf",

  "July 27, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2027%2C%202021%20%28updated%29.pdf",

  "July 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2013%2C%202021.pdf",

  "May 25, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20May%2025%2C%202021.pdf",

  "July 28, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.07.28%20%28PC%20Agenda%20Pkt%29.pdf",

  "June 30, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.06.30%20%28PC%20Agenda%20Pkt%29_0.pdf"
};

// ── Town of Rico Board of Trustees agenda/packet/minutes URLs ──
// Keyed by the meeting label shown on the Board of Trustees page
// (regular meetings = "<Month> <Year>"; specials/work sessions carry
// their qualifier). getRicoMeetings() looks up the "<Month> <Year>" key
// for each generated 3rd-Wednesday meeting. The bot (syncRicoAgendas in
// content-refresh.js) regenerates this map from the page every 6h, so
// new agendas/packets/minutes appear automatically as Rico posts them.
const RICO_AGENDA_MAP = {
  "June 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Agenda.pdf"},

  "June 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Packet.pdf"},

  "June 2026 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Agenda%20Special%20Meeting_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%20Spec.%202026%20minutes.pdf"},

  "May 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/May%202026%20minutes.pdf"},

  "April 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/April%202026%20minutes.pdf"},

  "March 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202026%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/March%202026%20minutes.pdf"},

  "February 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Feb%202026%20minutes.pdf"},

  "February 2026 Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/feb%202026%20special%20minutes.pdf"},

  "January 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/January%202026%20minutes.pdf"},

  "December 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%202025%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/December%202025%20minutes.pdf"},

  "December 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%203%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%203%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/December%203%202025%20minutes%20special%20meeting.pdf"},

  "November 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/nov%2019_%202025%20minutes.pdf"},

  "October 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/october%202025%20minutes.pdf"},

  "September 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/September%2017%20minutes.pdf"},

  "August 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/August%2020%20minutes.pdf"},

  "August 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20August%2013%202025.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20August%2013%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/august%2013_%202025%20minutes.pdf"},

  "July 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%2016%20minutes.pdf"},

  "July 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%209%20minutes.pdf"},

  "June 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2018%20minutes.pdf"},

  "June 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20June%2011%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2011%20minutes.pdf"},

  "May 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20may%2021%202025.pdf"},

  "May 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20May%2014%202025.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20May%2014%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20may%2014%202025.pdf"},

  "April 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20april%2016%202025.pdf"},

  "March 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20mar%2019%202025.pdf"},

  "March 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20mar%203%202025.pdf"},

  "February 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20feb%2019%202025.pdf"},

  "January 2025 Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Agenda%20Special%20Meeting.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20jan%2030%202025.pdf"},

  "January 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20jan%2015%202025.pdf"},

  "December 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20December%202024.pdf"},

  "November 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20November%202024.pdf"},

  "October 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/October%2016_%202024%20minutes.pdf"},

  "September 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/September_%202024%20minutes.pdf"},

  "September 2024 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20September%2011%202024.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20September%2011%202024_0.pdf"},

  "August 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%2021%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%2021%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/August%2021_%202024%20minutes.pdf"},

  "July 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%2017%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%2017_%202024%20minutes.pdf"},

  "June 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%2019%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%2019%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2019_%202024%20minutes.pdf"},

  "May 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%2015%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/May%2015_%202024%20minutes.pdf"},

  "April 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%2017%202024%20Packet.pdf"},

  "March 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%2020%202024%20Agenda_1.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%2020%202024%20Packet_1.pdf"},

  "March 2024 VCUP Public Forum":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%207%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/March%207%20VCUP%20Public%20Forum%20Handouts_without%20CT.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/3.7.24.pdf"},

  "March 2024 VCUP Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%206%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%206%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/3.6.24.pdf"},

  "February 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%2028%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%2028%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/2.28.24.pdf"},

  "February 2024 Sewer Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20Feb%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Rico%20Wastewater%20Collection%20and%20Treatment%20System%20%281%29.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/2.15.24.pdf"},

  "January 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%2017%202024%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%2017%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/1.17.24.pdf"}
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

// Ridgway Town Council + Planning Commission. Surfaces RIDGWAY_CACHED_DATA
// stubs (each tagged board:'council'|'pc') and pulls the agenda/packet PDF
// from RIDGWAY_AGENDA_MAP by date (the bot refreshes that map from the two
// colorado.gov board pages every 6h). Same single "Town of Ridgway" entity.
function getRidgwayMeetings() {
  if (typeof RIDGWAY_CACHED_DATA === 'undefined') return [];
  const amap = (typeof RIDGWAY_AGENDA_MAP !== 'undefined') ? RIDGWAY_AGENDA_MAP : {};
  const PC_URL = 'https://townofridgway.colorado.gov/i-want-to/ridgway-planning-commission';
  return RIDGWAY_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const agendaUrl = m.agendaUrl || amap[m.date] || null;
    const hasAgenda = !!agendaUrl;
    const isPC = m.board === 'pc';
    const baseUrl = isPC ? PC_URL : (typeof RIDGWAY_COUNCIL_URL !== 'undefined' ? RIDGWAY_COUNCIL_URL : PC_URL);
    return {
      title: m.title,
      link: agendaUrl || baseUrl,
      description: m.note || (hasAgenda ? 'Agenda and full meeting packet available (PDF).' : ''),
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'ridgway',
      sourceLabel: 'Town of Ridgway',
      category: /special/i.test(m.title) ? 'Special Meeting' : (isPC ? 'Planning Commission' : 'Town Council'),
      canceled: false,
      hasAgenda,
      packetUrl: null
    };
  });
}

// Town of Rico Board of Trustees. Rico meets the 3rd Wednesday of every month
// at 7:00 PM (Rico Town Hall, 2 Commercial St). Rather than hand-seed stubs,
// we GENERATE the upcoming regular meetings deterministically from that
// schedule (so future meetings always appear, even before the bot runs), then
// enrich each with its Agenda/Packet/Minutes PDFs from RICO_AGENDA_MAP, keyed
// by "<Month> <Year>" and refreshed from the Board of Trustees page every 6h.
function getRicoMeetings() {
  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
  const boardUrl = (typeof RICO_BOARD_URL !== 'undefined')
    ? RICO_BOARD_URL
    : 'https://townofrico.colorado.gov/government/board-of-trustees';
  const amap = (typeof RICO_AGENDA_MAP !== 'undefined') ? RICO_AGENDA_MAP : {};

  // 3rd Wednesday (weekday 3) of a given year/month (month is 0-based).
  function thirdWednesday(year, month) {
    const firstDow = new Date(year, month, 1).getDay();      // 0=Sun..6=Sat
    const firstWed = 1 + ((3 - firstDow + 7) % 7);
    return firstWed + 14;
  }

  const out = [];
  const now = new Date();
  // Generate the current month + next 3 months of regular meetings. gov-hub.html
  // filters to today→+30d, so this always yields the next 1–2 upcoming meetings
  // while staying correct as the window rolls forward month to month.
  for (let i = 0; i <= 3; i++) {
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const day = thirdWednesday(year, month);
    const dateStr = MONTHS[month] + ' ' + day + ', ' + year;
    const eventDate = localDate(dateStr);
    const monthKey = MONTHS[month] + ' ' + year;
    const docs = amap[monthKey] || {};
    const agendaUrl = docs.agenda || null;
    const hasAgenda = !!agendaUrl;
    out.push({
      title: 'Rico Board of Trustees Regular Meeting',
      link: agendaUrl || boardUrl,
      description: hasAgenda
        ? 'Board agenda and full meeting packet available (PDF).'
        : 'Regular monthly meeting of the Rico Board of Trustees. The agenda and packet are typically posted the Wednesday before the meeting.',
      eventDate,
      eventDates: '',
      eventTimes: '7:00 PM',
      location: 'Rico Town Hall, 2 Commercial St, Rico',
      source: 'rico',
      sourceLabel: 'Town of Rico',
      category: 'Board Meeting',
      canceled: false,
      hasAgenda,
      agendaLink: agendaUrl,
      packetUrl: docs.packet || null,
      minutesUrl: docs.minutes || null
    });
  }
  return out;
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

// Bot-synced upcoming Telluride board/commission meetings — Town Council,
// Planning & Zoning Commission, Telluride Housing Authority Subcommittee, Ethics
// Commission, and the joint P&Z/HARC subcommittee. Populated by
// content-refresh.js syncTellurideBoardMeetings() from the CivicWeb
// MeetingsService (HARC stays in TELLURIDE_CACHED_DATA above). Empty until the
// next content-refresh run. Each entry: {date,title,agendaUrl,hasAgenda,location,time}.
const TELLURIDE_BOARD_MEETINGS = [
  {
    date: "June 25, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8098",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "June 30, 2026",
    title: "Telluride Housing Authority",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8283",
    hasAgenda: true,
    location: "Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "June 30, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8039",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 1, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8161",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 21, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8040",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 23, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8100",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 5, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 6, 2026",
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 11, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 27, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 1, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8042",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 2, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8163",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 10, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 22, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8043",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  }
];

function getTellurideMeetings() {
  // HARC (hand-curated recurring schedule + bot-patched agenda links).
  const harc = TELLURIDE_CACHED_DATA.map(m => {
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

  // Other Telluride bodies the bot surfaces from CivicWeb. Rendered generically
  // (no HARC-specific time/location defaults); summary + board-token matching is
  // handled by getMeetingSummary via meetingBoardToken.
  const list = (typeof TELLURIDE_BOARD_MEETINGS !== 'undefined' && Array.isArray(TELLURIDE_BOARD_MEETINGS)) ? TELLURIDE_BOARD_MEETINGS : [];
  const board = list.map(m => {
    const agendaLink = m.agendaUrl || '';
    return {
      title: m.title,
      link: agendaLink || (typeof TOWN_CIVICWEB_FALLBACK !== 'undefined' ? TOWN_CIVICWEB_FALLBACK : agendaLink),
      description: '',
      eventDate: localDate(m.date),
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'telluride',
      sourceLabel: 'Town of Telluride',
      category: m.title,
      canceled: false,
      hasAgenda: !!m.hasAgenda && !!agendaLink,
      agendaLink: agendaLink || null
    };
  });

  return harc.concat(board);
}

// Canonical "board token" for a meeting title, so the website's short card
// titles ("HARC Meeting", "Town Council Meeting") reconcile with the bot's
// CivicWeb-sourced summary keys ("Historic & Architectural Review Commission -
// Jun 17 2026", etc.). Returns '' when no known board matches.
function meetingBoardToken(title) {
  const s = String(title || '').toLowerCase();
  const hasPZ = /planning\s*(?:&|and)\s*zoning|planning commission|\bp&z\b/.test(s);
  const hasHARC = /\bharc\b|historic\s*(?:&|and)\s*architectural/.test(s);
  if (hasPZ && hasHARC) return 'joint';        // joint P&Z + HARC subcommittee
  if (hasHARC) return 'harc';
  if (/town council/.test(s)) return 'council';
  if (hasPZ) return 'pz';
  if (/housing authority/.test(s)) return 'housing';
  if (/ethics/.test(s)) return 'ethics';
  if (/parks?\s*(?:&|and)?\s*rec/.test(s)) return 'parks';
  if (/open space/.test(s)) return 'openspace';
  if (/gondola/.test(s)) return 'gondola';
  return '';
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

  // 2.5 Board-token match. The website card title (e.g. "HARC Meeting") often
  // differs from the bot's CivicWeb-sourced summary key (e.g. "Historic &
  // Architectural Review Commission - Jun 17 2026"). Map both to a canonical
  // board token and match on it — this resolves multi-meeting days where the
  // single-meeting partial match (step 3) gives up. Prefer the full commission
  // agenda over a "Chair" variant, then the longest substantive summary; a
  // 40-char floor + isBadSummary() keep stubs from surfacing.
  const itemTok = meetingBoardToken(cleanTitle);
  if (itemTok) {
    const prefix = item.source + '|' + dateKey + '|';
    const pickBest = (store, getText) => {
      const hits = Object.keys(store)
        .filter(k => k.indexOf(prefix) === 0 && meetingBoardToken(k.slice(prefix.length)) === itemTok)
        .sort((a, b) => (/chair/i.test(a) - /chair/i.test(b)) || (getText(b).length - getText(a).length));
      for (const k of hits) { const s = getText(k); if (s && s.length >= 40 && !isBadSummary(s)) return s; }
      return '';
    };
    const mm = pickBest(MANUAL_SUMMARIES, k => MANUAL_SUMMARIES[k] || '');
    if (mm) return mm;
    const am = pickBest(AI_SUMMARIES, k => (AI_SUMMARIES[k] && AI_SUMMARIES[k].shortSummary) || '');
    if (am) return am;
  }

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
