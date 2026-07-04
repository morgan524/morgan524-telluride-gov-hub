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

// Calendar-date key (YYYY-MM-DD) for a Date built by localDate(). Those Dates
// are local-midnight on the intended calendar day, so the day lives in the
// Date's LOCAL components. Deriving the key via toISOString() (UTC) silently
// shifts the day for evening/timestamped dates or runtimes east of UTC —
// breaking summary / agenda / zoom lookups. Read the local components instead.
// (For date-only meetings in a west-of-UTC browser this is identical to the old
// toISOString().slice(0,10), so it's a zero-regression correctness fix.)
function localDateKey(d) {
  if (!d || isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isBadSummary(text) {
  if (!text) return false;
  if (SUMMARY_REJECT_PATTERNS.some(pat => pat.test(text))) return true;
  // Catch scraped-page artifacts that slip past SUMMARY_REJECT_PATTERNS — text
  // describing the agenda DOCUMENT/PAGE itself, not the meeting's substance.
  // Do NOT trip on the bare word "agenda": it appears in many real summaries
  // ("A full agenda for the last day of June…") and was silently suppressing
  // them (Town Council, BOCC, MV Council, etc.).
  if (text.length > 120 && !text.includes(' · ') &&
      /\b(agenda|meeting) (page|pdf|document|text|content)\b|\bpage (navigation|content|text)\b|\b(skip to|main content|click here)\b/i.test(text)) return true;
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
  "county|2026-06-11|Planning Commission Meeting":
    {"zoomUrl":"https://us06web.zoom.us/j/89317090915?pwd=s1SDCrhwsjqY7klJbBNGI7Oyc3Sg2U.1","meetingId":"893 1709 0915","passcode":"670854","phone":"970-728-3844"},

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
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/ePrh_CzmTLKqp0syEbUesw","meetingId":"894 7506 0147","passcode":"314276.","phone":"719) 359-4580"},

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    {"sv":4},

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/83022451705?pwd=Lj8jkLF9GQny7CWBqvP8IYkQhviQBb.1","meetingId":"830 2245 1705","passcode":"229528.","phone":"719) 359-4580"},

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799"},

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/oQIoNRzgRC-zUdrPFaFzpQ","meetingId":"843 9146 6771","passcode":"793419.","phone":"719) 359-4580"},

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
    {"sv":4,"zoomUrl":"https://us02web.zoom.us/meeting/register/Mie5Wdx5RWmbBb3Nr07LBg","meetingId":"828 4833 4181","passcode":"562164","phone":"719-359-4580"},

  "county|2026-07-08|Board of County Commissioners Work Session":
    {"sv":2},

  "county|2026-07-09|Planning Commission Meeting":
    {"sv":2},

  "mv|2026-06-17|Town Council Meeting":
    {"zoomUrl":"https://us06web.zoom.us/webinar/register/WN_XDMlJEPIRy6V3a5BeMEfCQ","phone":"970-369-6429","sv":2},

  "county|2026-07-14|Historical Commission":
    {"sv":4},

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"876 4109 1694","passcode":"695618.","phone":"301-715-8592"},

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592"},

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    {"sv":4},

  "county|2026-07-15|Board of County Commissioners Meeting":
    {"sv":4},

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    {"sv":4},

  "med|2026-06-25|Regular Board Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/89509331558","meetingId":"895 0933 1558","sv":2},

  "telluride|2026-06-23|Special Meeting - HARC and P&Z - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    {"sv":2},

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    {"sv":4},

  "county|2026-07-08|Board of County Commissioners Special":
    {"sv":2},

  "fire|2026-07-21|Board of Directors Meeting":
    {"sv":2},

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    {"sv":4},

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    {"sv":4},

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    {"sv":4},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    {"sv":4},

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    {"sv":2},

  "county|2026-07-09|Planning Commission and Board of County Commissioners Joint Work Session":
    {"zoomUrl":"https://us06web.zoom.us/j/86169399856?pwd=UPH9VHFb655TsZwXPmXCQ4BKMCZ9n5.1","meetingId":"861 6939 9856","passcode":"690306","phone":"970-728-3844","sv":4},

  "county|2026-06-29|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-08|Board of County Commissioners Special - In Norwood at Sheriff Annex":
    {"sv":4,"zoomUrl":"https://us02web.zoom.us/meeting/register/tThmDYw9REKbs5_LM8bpog","meetingId":"832 9649 4938","passcode":"425135","phone":"719-359-4580"},

  "ouray|2026-07-01|PM - The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to this agenda)":
    {"sv":4},

  "telluride|2026-07-08|Ecology Commission - Jul 08 2026":
    {"sv":4},

  "telluride|2026-06-29|Open Space Commission Site Walk - Jun 29 2026":
    {"sv":4},

  "county|2026-07-27|Open Space Commission Meeting":
    {"sv":4},

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    {"sv":4},

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    {"sv":4},

  "telluride|2026-07-15|(RESCHEDULED) Parks & Recreation Commission - Jul 15 2026":
    {"sv":4},

  "telluride|2026-07-21|Telluride Housing Authority - Jul 21 2026":
    {"sv":4},

  "county|2026-07-12|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-14|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-15|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-16|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-17|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-18|San Miguel Basin Fair Board":
    {"sv":4},

  "telluride|2026-08-03|Open Space Commission - Aug 03 2026":
    {"sv":4}
};

const MANUAL_SUMMARIES = {
  "mv|2026-06-17|Town Council Meeting":
    "Council meets for a packed agenda that includes an executive session for legal advice on a recent investigation, plus a full hour set aside to review an independent investigation report and consider future actions. Two new staff members join — a housing director and planner. Council will vote on several items: expedited review policies for affordable housing projects to participate in state Prop 123, a water storage lease agreement with the utility company, and a height variance for a single-family home on San Joaquin Road. There's also a presentation on thermal energy network findings and the usual liquor permits for summer events.",

  "fire|2026-06-16|Board of Directors Meeting":
    "The fire district's monthly board meeting covers their 2025 audit results, master planning updates, and wildfire assignments as summer approaches. Station 3 construction gets an update, along with the usual reports from chiefs and coordinators across the district's operations.",

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

  "med|2026-06-25|Regular Board Meeting":
    "The Telluride Hospital District board meets June 25 with a full slate of internal matters. The heaviest item on the agenda is a 45-minute discussion of mill levy considerations — the taxing mechanism that funds the district, and a recurring pressure point as the hospital works toward a new facility. Board members will also spend time on new facility updates and partnership updates, plus a communications strategy discussion. The finance committee and CFO will walk through May 2026 draft financials. Consent items include ratification of an updated investment policy.",

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    "The commission holds a work session on the Shandoka Lot Redevelopment Project— the major Town-owned redevelopment proposal brought forward by Design Workshop. The commission gives feedback to staff and the applicant before formal Land Use Code review begins. You can read more about this project [here](https://livabletelluride.org/deep-dive-carhenge.html).",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    "The Chair was scheduled to take up the 238 N Pine Street minor subdivision (a request to split a 7,500 sq ft Historic Residential lot into two), but the applicant has asked for it to be continued again — to the July 23 P&Z meeting. No substantive action is expected at this meeting. 4:00 PM at Rebekah Hall.",

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    "A full agenda for the last day of June. The most consequential item: first reading of Land Use Code amendments tied to Colorado's wildfire resilience requirements — changes to the rules that govern how buildings are built here, with fire country context that anyone in the box canyon understands. Council will also hold a second work session on the Telluride Energy Mitigation Program (TEMP), debating which outdoor energy uses — snowmelt, heat tape, outdoor fireplaces, spas, pools — trigger mitigation requirements and at what offset levels. On second reading: a new Black Hills Energy gas franchise, a school district tap-fee IGA, and the authorized sale of two deed-restricted properties (907 E. Colorado and Longwill 16 Unit B3). An emergency fire ban ordinance — covering open fires, fireworks, and smoking restrictions — is also up for consideration. Council will also vote on acquiring Spruce House Unit H as deed-restricted housing.",

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    "The July 1, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    "A routine CCAASE meeting with two items worth noting. RASR Productions LLC is asking to extend the Telluride Autumn Classic street closure on September 25, 2026 — adding the westbound lane of Colorado Ave. between Willow and Alder to an already-approved closure from Aspen to Willow. No objections came back from emergency services or affected residents. The commission will also take up a 2027 calendar date request from TMVOA for Red, White & Blues on July 3–4, which overlaps with MusicFest, Plein Air, and the 4th of July Celebration already on the books. A work session reviews draft 2027 grant materials.",

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    "Two worksession items — no formal votes today. First, the subcommittee takes up nonconventional lending under Guideline §110.2, which currently restricts borrowers to conventional or government-guaranteed fixed-rate mortgages. The discussion centers on whether that framework fits mixed-use structures, where Fannie Mae and Freddie Mac's \"warrantable condominium\" standards can block financing entirely. Second, a thornier policy question: how to count children of split-custody households toward minimum bedroom requirements. Current language defines primary residence as a \"sole and exclusive place of residence,\" which leaves staff using tax-dependent status and custody percentages to determine eligibility — a framework that, applied consistently, means a child may qualify for a bedroom in only one parent's unit. Staff has laid out the scenarios and is asking the subcommittee whether existing appeal and exception pathways are sufficient, or whether the Guidelines and Policies need revision.",

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    "The Liquor Licensing Authority takes up 14 special event permit requests at its July 1 meeting — a busy slate that tracks the canyon's summer season in full swing. Applicants include Palm Arts Inc. (AVID Dance Performance, Camp Alderwild), Telluride Mountain Club (Mountain Run, Telluride Reserve), Telluride Medical Center Foundation (Telluride Table across multiple venues), San Miguel Mentoring (Top Chef & Taste of Telluride), Tri-County Health Network (Noche de Luz), Telluride Chamber Music Association (New York Philharmonic Brass Quintet), Telluride Society for Jazz (Jazz Festival), Telluride Film Festival, and Telluride Bluegrass Beer Booth Inc. (Camp Alderwild). Events span July through early September 2026. The board will also approve minutes from the May 21 meeting.",

  "county|2026-07-01|Board of County Commissioners Meeting":
    "A relatively routine July BOCC meeting, though a few items are worth tracking. The board will interview an applicant for an alternate seat on the Planning Commission — a slot that matters whenever land-use decisions get close. There's a 40-minute presentation on the Road and Bridge High Country Road opening policy, with the Forest Service at the table, which touches on access to the county's backcountry roads every season. The board will also take up an ADA policy update, a tax abatement denial, and board appointments to the Behavioral Health Solutions Panel. The attorney's agenda includes an executive session on a code enforcement matter — no details given, as is typical.",

  "county|2026-06-10|Board of Review and Planning Commission Joint Work Session":
    "The county's Board of Review and Planning Commission will hear a presentation on Colorado's new Low Energy and Carbon Code — building standards that could reshape how structures get approved in the box canyon.",

  "county|2026-06-08|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board meets to review junior livestock sale terms and update bylaws for the upcoming fair season.",

  "telluride|2026-07-06|Open Space Commission - Jul 06 2026":
    "Three substantive items on the Valley Floor dominate this meeting. First, the Commission reviews alternative trail alignments for Reach 1 of the Valley Floor Open Space — three route options are mapped, each threading around wetland delineations. Second, the Telluride Mountain Club requests permission to route approximately 0.25 miles of the long-planned Mountain Village to Valley Floor Connector Trail across Town-owned open space; after nine years of public engagement and a completed NEPA process, the Forest Service has issued a FONSI and Draft Decision Notice — the missing piece is this short segment on Town land. The Club also asks the Commission to recommend allowing dogs on that segment, for consistency with the surrounding Forest Service trail. Third, a forwarded letter from resident Ramona Gaylord challenges the goat grazing program, citing drought conditions, documented thistle re-emergence in the 2025 grazing footprint, elk calving conflicts, and an absence of measurable pilot data — and asking the Commission to reconsider before committing roughly $10,000 to another season.",

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
    "The July 14, 2026 San Miguel County Historical Commission agenda hasn't been posted yet.",

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    "Two Town-owned civic buildings come before HARC on July 15. First is Town Hall at 135 W Columbia Ave — a minor-scale alteration for accessibility improvements and renovations to the designated local landmark, with no floor area increase. Second is the Parks & Recreation office and garage at 500 E Colorado Ave — a minor-scale addition that will increase floor area by more than 25%, resulting in a building still under 1,000 square feet. Both projects are designed by Hellmuth, Obata & Kassabaum and reviewed under the 2024 Design Guidelines and Standards.",

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    "The July 15 HARC meeting is dominated by the Carhenge redevelopment project at 700 W Pacific Ave — three separate Preliminary Large-Scale public hearings covering Buildings A, B, C, D1, D2, E1, E2, and E3 on Lots 34 and 34B of Backman Village, all new construction outside the Telluride Historic Landmark District in an Accommodations 2 zone, with Design Workshop as applicant and the Town itself as owner. A work session on the Shandoka Lot redevelopment at 860 Black Bear Rd — another Town-owned Accommodations 2 parcel — follows. Also on the hearing docket is a continued amendment to a prior Certificate of Appropriateness for 239 N Aspen, inside the THLD, elevated by the HARC Chair back in May.",

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    "The July 15, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-07-15|Board of County Commissioners Meeting":
    "The July 15 Board of County Commissioners meeting agenda hasn't been posted yet.",

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    "The Telluride Housing Authority is standing up its newly created Resident Advisory Committee — a structure approved unanimously in May — by appointing members from across the Town's rental properties. Fifteen eligible applications came in from tenants at the Boarding House, Shandoka, Sunnyside, Virginia Placer, and Voodoo. The THA will also hold a random drawing to assign staggered terms. It's a small procedural meeting, but the RAC itself is new ground: a formal channel for renters in Town-owned housing to have a structured voice in how those policies are shaped.",

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
    "The July 22 San Miguel County Board of County Commissioners Special Meeting has been posted, but no agenda detail has been released beyond the meeting type itself. Special meetings are called for specific business outside the regular cycle — what that business is here isn't yet public.",

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    "The July 23, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    "The July 23, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    "The June 25, 2026 Planning & Zoning Commission Chair meeting has been cancelled.",

  "county|2026-07-09|Planning Commission and Board of County Commissioners Joint Work Session":
    "The Planning Commission and BOCC are sitting down together for a joint work session — no final votes, but the discussion is substantive. They'll be working through proposed Land Use Code amendments across five sections: forestry practices (§6-4), oil and gas operations (§6-5), and deep geothermal operations (§6-6) in the morning, followed by condominium plats (§12-15) and PUD and subdivision rules (§5-14). Work sessions like this are where the actual shape of code changes gets negotiated before anything goes to public hearing — worth paying attention to early.",

  "county|2026-06-29|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board meets in Norwood on June 29th. The posted agenda is a shell — minutes approval and generic \"new/old business\" placeholders, with no specific items listed. There's no detail on what the board actually plans to discuss.",

  "county|2026-07-08|Board of County Commissioners Special - In Norwood at Sheriff Annex":
    "The July 8 Special BOCC meeting in Norwood at the Sheriff Annex has been posted, but no agenda items have been listed beyond the meeting title itself. Nothing to summarize yet.",

  "ouray|2026-07-01|PM - The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to this agenda)":
    "Ouray County's Planning Commission meets July 1 at 2:00 PM for a work session on possible changes to Section 2 – Definitions in the Land Use Code. Definitions work might sound like housekeeping, but how a county defines its terms shapes everything that follows — what counts as a dwelling unit, what qualifies as a use, what triggers review. The packet materials are attached to the posted agenda.",

  "telluride|2026-07-08|Ecology Commission - Jul 08 2026":
    "The July 8, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-06-29|Open Space Commission Site Walk - Jun 29 2026":
    "The Open Space Commission heads out on foot Monday at 4:00 PM — meeting at the northwest corner of the Shandoka parking lot on Mahoney Drive. The site walk covers potential river trail alignments in Reach 1 of the Valley Floor Open Space. No agenda room, no projector: just commissioners walking the ground to see what the land actually has to say about where a trail might go.",

  "county|2026-07-27|Open Space Commission Meeting":
    "The July 27, 2026 Open Space Commission Meeting agenda hasn't been posted yet.",

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    "The agenda for this July 29 joint work session between the San Miguel County Planning Commission and the Board of County Commissioners hasn't been posted yet.",

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    "The July 29, 2026 (Rescheduled) Parks & Recreation Commission agenda hasn't been posted yet.",

  "telluride|2026-07-15|(RESCHEDULED) Parks & Recreation Commission - Jul 15 2026":
    "The July 15, 2026 (Rescheduled) Parks & Recreation Commission agenda hasn't been posted yet.",

  "telluride|2026-07-21|Telluride Housing Authority - Jul 21 2026":
    "The July 21, 2026 Telluride Housing Authority agenda hasn't been posted yet.",

  "county|2026-07-12|San Miguel Basin Fair Board":
    "The Fair Board convenes for a special meeting to divide up pre-fair responsibilities among board members and sort out lamb bedding setup. Housekeeping before the fair season — the kind of meeting that keeps things from falling through the cracks.",

  "county|2026-07-14|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special midday meeting to debrief on the day's events, discuss any matters that came up, and set market classes. Routine fair-board business.",

  "county|2026-07-15|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special meeting at 10pm on July 15 — a late-night debrief session following what appears to be fair day itself. The agenda is a short two items: a debrief of the day and discussion of whatever matters came to the board from it. Routine wrap-up, nothing of broad public consequence on the face of it.",

  "county|2026-07-16|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board convenes a special meeting at 10pm — an end-of-day debrief and discussion of whatever came up during the fair. The agenda is deliberately open-ended, which is how these post-event sessions tend to go.",

  "county|2026-07-17|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special meeting at 10pm — late by design, after a full day at the fair. The agenda is a debrief: how the day went and whatever issues made their way up to the board during it. Routine end-of-day business, but these conversations are often where the real operational picture emerges.",

  "county|2026-07-18|San Miguel Basin Fair Board":
    "A late-night special meeting — 10 p.m. — to debrief the day's fair activities and work through whatever issues surfaced during the event. The agenda is intentionally open-ended, which is typical for fair boards wrapping up a long day.",

  "telluride|2026-08-03|Open Space Commission - Aug 03 2026":
    "The August 3, 2026 Open Space Commission agenda hasn't been posted yet."
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
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-30",
    title: "Town Council — Jun 30, 2026",
    recap: "Council held two executive sessions (deputy municipal court judge personnel matter; town manager check-in). On action items, the Black Hills Energy gas franchise was renewed for 10 years (unanimous, second reading). A 50% tap-fee waiver and payment plan for the Telluride School District's employee housing project passed 5-1, with one dissent favoring a full waiver. Ordinances authorizing sale of two town-employee housing units (907 East Colorado and Longwill 16-B3) passed unanimously. An emergency Stage 2 fire-restrictions ordinance was adopted unanimously. Ronald Carlson was appointed deputy municipal court judge unanimously. A land use code amendment to implement Colorado Wildfire Resiliency Code passed unanimously on first reading. The town authorized purchase of Spruce House Unit H unanimously. Stephanie Hatcher was reappointed to CCASE unanimously. The Telluride Housing Authority appointed seven resident advisory committee members unanimously. Work sessions covered updates to the Telluride Energy Mitigation Program (TEMP) and presentation of the 2026 community survey, which showed declining confidence in local government and economic health alongside improving marks for public safety and mobility. Substantial public comment opposed converting the Town Park Oval green space to a hard-surface sports court.",
    videoUrl: "https://www.youtube.com/watch?v=I4t6u53slF8"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-25",
    title: "Planning & Zoning — Jun 25, 2026",
    recap: "The commission continued the 238 North Pine Street minor subdivision application to its July 23 meeting without discussion. The bulk of the meeting was a work session on the Shandoka Lot redevelopment project — a town-owned 4-acre parcel at 860 Black Bear Road proposed for a large-scale PUD that would include roughly 50–60 housing units (mostly affordable, with a limited free-market share), approximately 300 net new public parking spaces within a structured garage, neighborhood-serving commercial uses (daycare, food bank, restaurant, retail, fitness), and a transit center. No votes were taken on the project; commissioners raised extensive questions about parking demand calculations, water-table and flood-zone risks for below-grade construction, traffic impacts, green space adequacy, building massing and solar access along the river trail, and EV charging. The commission also voted to recommend that Town Council adopt land use code amendments to Section 3-505 (tree removal/maintenance) to align with the Colorado Wildfire Resiliency Code, with several wording revisions directed by the commission; the ordinance is scheduled for council consideration June 30.",
    videoUrl: "https://www.youtube.com/watch?v=m0qjXC2TCfo"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-17",
    title: "HARC — Jun 17, 2026",
    recap: "HARC voted to continue the flood-elevation raise request for 239 North Aspen (5-1) to the July 15 meeting, directing staff to provide a detailed written explanation of which flood-plain code interpretation changed to require the structure to be lifted. For 566 West Columbia, HARC approved a certificate-of-appropriateness amendment allowing the contributing primary structure to be raised an additional 3¼ inches to meet the flood-protection elevation (4-1). For 208 South Fir, a large commercial new-construction project in the warehouse district, HARC granted preliminary approval (4-1) with conditions addressing roof material, building height and depth, wall-plane articulation along the alley, an arborist report, parking payment-in-lieu, and building materials. Two individual-property items were continued to the August 19 meeting.",
    videoUrl: "https://www.youtube.com/watch?v=3naByhxnyjE"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-09",
    title: "Town Council — Jun 9, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vxrKceCqXaM",
    recap: "A housing-heavy June meeting. Council gave first-reading approval to selling two more deed-restricted units (907 East Colorado and Longwell 16), accepted the 2025 audit, and approved a first reading of the Black Hills gas franchise. The fire-restriction ordinance passed on second reading. Three residents were reappointed to commissions and the airport board. The one split vote was a partial waiver of school-district tap fees for teacher housing, which passed 4-2 with Stark and Enright opposed."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-06-03",
    title: "Board of County Commissioners — Jun 3, 2026",
    videoUrl: "https://www.youtube.com/watch?v=3nSAqRc0Cpk",
    recap: "A land-and-housing day for the BOCC. They approved an additional $100,000 to the Telluride Foundation's Housing Opportunity Fund and renamed their new fast-track development rule from 'Accelerated' to 'Prioritized' Housing Review. A bouldering gym in Illium received a PUD amendment, accessory-dwelling-unit sizing was clarified, and new on-site wastewater regulations were adopted. All votes passed 3-0."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-28",
    title: "Planning & Zoning Commission — May 28, 2026",
    recap: "The commission took action on two public hearing items and one work session. On the minor subdivision application for 238 North Pine Street — which would split a 7,500-square-foot corner lot into two 25-foot lots — the commission voted unanimously to continue the hearing to June 25, directing staff to analyze grounds for a potential denial motion and to examine setback and height implications. On the Carhenge lot conceptual PUD (700 West Pacific Avenue, proposing roughly 220–230 affordable units with height and site-coverage variations), the commission voted unanimously to continue to July 23, directing the applicant to consider reductions in height, maximum floor area, and site coverage, and to provide preliminary flood-plain and traffic studies. The Shandoka lot work session was continued without discussion to June 25.",
    videoUrl: "https://www.youtube.com/watch?v=ies_4xRTogs"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-27",
    title: "Board of County Commissioners — May 27, 2026",
    videoUrl: "https://www.youtube.com/watch?v=CkFxc1DpoNM",
    recap: "The commissioners approved two Ophir septic setback variances, released a 2024 deed-restriction settlement on a Lawson Hill lot, and accepted a state (DOLA) housing-planning grant. All votes were unanimous. An earlier Placerville session that day was a work session with no votes."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-20",
    title: "Board of County Commissioners — May 20, 2026",
    videoUrl: "https://www.youtube.com/watch?v=xDE7B7x2C5U",
    recap: "The commissioners approved the consent agenda and appointed two residents to community boards — Jackie Kenik to the Lone Tree Cemetery board and Marcus Kirkwood to the San Miguel Basin Fairboard. They updated the County's drug-and-alcohol policy and approved a conduit-and-fiber exchange with Clear Networks. Two land-use hearings followed: a lot-line vacation near Sawpit and a multi-year logging and wildfire-mitigation permit on Wilson Mesa. They also adopted the state's septic Regulation 43 Appendix A, keeping variance authority at the county level. All votes were 3-0."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-19",
    title: "Town Council — May 19, 2026",
    videoUrl: "https://www.youtube.com/watch?v=U3QyzfSWDlE",
    recap: "Council adopted the federal Safe Streets and Roads for All regional transportation safety plan and a Vision Zero resolution targeting no traffic deaths by 2040. They authorized acquisition of a town employee unit at Mandota, approved a first reading of new fire-restriction rules, and reappointed Carly Shaw to the Election Commission. They also granted a seasonal rooftop shade structure for the National building on Colorado Avenue, with conditions. All votes were 6-0."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-14",
    title: "Planning Commission — May 14, 2026",
    videoUrl: "https://www.youtube.com/watch?v=R9nnXLvOGCY",
    recap: "The two contested public hearings — the Garlock and Crockett applications on the Mesas — were tabled and withdrawn. The Commission recommended approval of a PUD amendment for a climbing gym in the former Illium tire shop and a code amendment defining 'footprint' and clarifying ADU maximum size. It also recommended adopting an accelerated review process for affordable housing to keep San Miguel eligible for Prop 123 funding. All recommendations go to the BOCC."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-13",
    title: "Board of County Commissioners — May 13, 2026",
    videoUrl: "https://www.youtube.com/watch?v=Q6xLvyjwDgs",
    recap: "A special session focused on presentations and public comment. The board heard from a Rights Mesa resident about an HOA and code-enforcement dispute, reviewed the parks and open space work plan, and discussed housing funding with the Telluride Association of Realtors, including a proposed state vacancy tax that failed at the Legislature. The formal votes were unanimous: green grants, a letter of support for a street-safety grant, and gift cards for spring-cleanup volunteers."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-04-28",
    title: "Town Council — Apr 28, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vWaP0Ba4GYY",
    recap: "A housing-focused meeting. The Stender HARC appeal was continued at the appellant's request. Council reappointed Peter Sante to the Planning & Zoning Commission and adopted second readings authorizing the sale of two deed-restricted units — the Element 52 unit on South Davis and the Silverjack unit on West Pacific — to lottery winners. Sitting as the Housing Authority, they adopted a policy temporarily suspending certain waitlist rules, with a set sunset date, to reduce vacancies."
  }
];

const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "Wildfire southwest of Denver forces thousands to evacuate and destroys more than 160 structures",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "public-safety",
    copy: "The Aspen Acres fire southwest of Denver has grown to nearly 105 square miles with zero containment, forcing full evacuations of Colorado City, Beulah, Rye, and San Isabel. Over 160 structures have been destroyed. It's a busy and dangerous fire season across the region right now.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_29d77297-868c-58e9-8a2b-f0f96bba3c3d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/c3/ec3cc2dc-3a76-55de-b275-629ec7c9e937/6a47e1184168f.image.jpg",
    imgHiRes: true
  },
  {
    title: "A summer camp like no other",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-04",
    newsTopic: "education",
    copy: "Telluride Ski & Snowboard Club athletes have been training aerial maneuvers at a water ramps facility in Park City, but that access ends mid-August when construction begins on a hotel at the complex. The Steamboat Springs water ramps facility is also closing for a residential development. TSSC's athletic director says it could be a few years before a comparable facility is available again.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_e8e1f7fd-ad54-43e7-ac5a-4061ac2f9113.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/f1/4f1e1dcb-8401-4873-8fc9-fa1eddf7dc1a/6a4608438706a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wildfire anxiety mounts amid fast-moving blazes and repeat evacuations",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "public-safety",
    copy: "Dry conditions and a low-snow winter have set the stage for a dangerous fire season across the West, with over 50 large fires burning and more than 9,000 personnel deployed. Evacuations have been ordered across Colorado, Utah, Arizona, New Mexico, and Washington — including near Ouray. Three firefighters died last weekend along the Colorado-Utah border.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_4d973373-7208-53fb-a780-c1b2993859f2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/61/26177bf3-f9b2-5216-a5a0-8353d34a6cdb/6a47b33cc2422.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride receives 2026 community survey results",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "land-use",
    copy: "Telluride's 2026 community survey drew 633 responses — a 42% jump over recent years. Residents rated natural environment, safety, and walkability highly, but cost of living scored \"excellent or good\" with just 3%, affordable housing at 11%, and overall economic health dropped 14% from 2025. Downtown vibrancy also fell 20 points.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_126b40a1-0567-46c9-a410-a1b3434e286f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/4a/74a308e5-d221-4cbd-b37f-ef54504ccab2/6a460acfeec68.image.jpg",
    imgHiRes: true
  },
  {
    title: "David Hoffmann is investing millions to preserve local newspapers",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "community",
    copy: "Billionaire David Hoffmann became chairman of Lee Enterprises — which owns the Telluride Times and 100+ other local papers — in February, investing tens of millions to preserve community journalism. His motivation traces back to a 1960s Little League no-hitter covered by his hometown Missouri paper.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/business/article_882e9b0b-7bb8-5514-95e3-a4e179e0dfa8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/82/882e9b0b-7bb8-5514-95e3-a4e179e0dfa8/6a45972ba4ac7.preview.jpg",
    imgHiRes: true
  },
  {
    title: "How David Hoffmann built the business behind his investment in local newspapers",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "community",
    copy: "David Hoffmann built his fortune over 37 years through DHR Global, an executive search firm he founded after leaving corporate HR work. That multibillion-dollar private family business now spans 127 companies, 27,000 employees, and 8 industry verticals. Most recently, Hoffmann led a $50 million investment into Lee Enterprises, a major newspaper group.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/business/article_c2937343-37e8-527e-83fc-0bed977a6c16.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/29/c2937343-37e8-527e-83fc-0bed977a6c16/6a459718c0baf.preview.jpg",
    imgHiRes: true
  },
  {
    title: "David Hoffmann chose family over football, and a path to success",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "land-use",
    copy: "David Hoffmann turned down a Wake Forest scholarship to stay close to family, then quit football entirely to marry his high school sweetheart and transfer schools. He baled hay and waited tables to finish his degree in industrial safety and occupational health. That foundation eventually led to a billionaire business career.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/business/article_6b2157a5-0598-56e4-b76c-939a0813310e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/b2/6b2157a5-0598-56e4-b76c-939a0813310e/6a45972073b24.preview.jpg",
    imgHiRes: true
  },
  {
    title: "David Hoffmann's childhood shaped his family's philanthropy",
    source: "Telluride Times",
    date: "July 3, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "community",
    copy: "David and Jerri Hoffmann's philanthropy grew from personal experience — childhood poverty, a love of the arts, and a grandson with Type 1 diabetes. Their family supports 350+ organizations, donates $3M+ annually, and runs a hockey camp for kids living with diabetes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/business/article_776e8672-b48d-5fd7-a527-2ddda3ad5a55.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/76/776e8672-b48d-5fd7-a527-2ddda3ad5a55/6a45970f3e9fc.preview.jpg",
    imgHiRes: true
  },
  {
    title: "Keeping homeless pets safe from wildfire",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "public-safety",
    copy: "Second Chance Humane Society evacuated all 40 animals from its Ridgway shelter Wednesday after a fast-moving wildfire came into view of the facility. Over 100 community members responded to the emergency foster call, placing all 10 dogs and 30 cats within hours. The shelter expects animals to remain in foster homes two to four days; donations toward transport and HEPA filters are welcome at secondchancehumane.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_522f6f8b-f59f-487a-984b-d3b97298fc07.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/66/d66947a1-797f-42fd-8539-a9e708bc276e/6a46a455e2c73.image.jpg",
    imgHiRes: true
  },
  {
    title: "Fire shelters are a key defense for firefighters. But they don't guarantee survival",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "public-safety",
    copy: "Fire shelters — layered aluminum, silica, and fiberglass wraps carried by wildland crews — have saved lives but aren't guaranteed protection. Escape routes and safety zones come first; the shelter is a last resort. Deployments have been rare recently, with only four recorded between 2021 and 2025.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_cecfb0ba-edd0-567a-8bf0-ca3a01ad9698.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/0d/80d00ef3-db70-56cd-8f14-70bdd66584e0/6a469ef7c213a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump and Republicans return to communist attacks against Democrats ahead of the midterm elections",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "government",
    copy: "Republicans are ramping up \"communist\" attacks on Democrats ahead of the midterms, spurred by democratic socialist primary wins in New York City and Denver. Democrats are divided between centrists and a growing left wing. Both parties are maneuvering ahead of November with slim GOP majorities in play.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_204b6353-51fc-5ab6-8da9-b5a2f26015a5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/6c/46cbd91d-c8da-5616-a33e-7d5904a0e4a3/6a464307452af.image.jpg",
    imgHiRes: true
  },
  {
    title: "Go Fourth",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "community",
    copy: "Stage 2 fire restrictions canceled the traditional fireworks, but Telluride is filling the gap with drone shows, a laser party, and live music on both July 3 and 4. The July 4 parade rolls at 11 a.m. — a beloved, anything-goes spectacle with an F-16 flyover expected. Arrive early for a good spot.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_e7854f8b-1993-4501-8a59-396815c37898.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/ce/5cea32c5-b93e-4224-a32c-5d57a587f7f3/6a40b35117934.image.jpg",
    imgHiRes: true
  },
  {
    title: "What to know about fireworks and the risk of wildfires this July 4th",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "public-safety",
    copy: "Record dry conditions across the West have pushed wildfire risk unusually high heading into the Fourth of July. Nearly 85% of wildfires are human-caused, and ignitions spike sharply on July 4th. Experts and local officials are urging people to skip backyard fireworks and attend professional displays instead.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_2fb29e6f-8164-586a-8eb6-433f9d493108.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/6b/e6bf2806-8b34-5dff-9a10-9d3632cd660e/6a45a02e480c0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Julie Beth Flatt Parker",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "recreation",
    copy: "Julie Beth Flatt Parker of San Antonio and Telluride passed away at 79. She and her husband George were longtime Telluride community supporters, backing the Telluride Foundation since 2001 and the San Miguel Resource Center, and Julie volunteered at Ah Haa School for the Arts.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_4ff92e0f-cf9d-4eeb-a6fb-bb4b3ce2287f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/d5/bd51fd7e-a968-46b4-a2e9-a2649026232d/6a4528871be36.image.jpg",
    imgHiRes: true
  },
  {
    title: "Ann Grundy",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "community",
    copy: "Ann Grundy, a longtime Telluride seasonal resident, passed away at her home on Lake Carroll. She and her late husband Dr. Laurence Grundy discovered Telluride in 1978, returning for decades of summers and winters. She is remembered for her stained-glass art, adventurous spirit, and quiet kindness.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_16eec0ce-93d5-4deb-acf4-501d346d9d50.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/99/e99f664b-854a-4df3-831a-3ffa0da6191f/6a45272a54c25.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for July 2-9, 2026",
    source: "Telluride Times",
    date: "July 2, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "infrastructure",
    copy: "San Miguel County's Board of Equalization is sitting July 1–August 5, 2026, to hear property valuation appeals. Deadlines are July 15 for real property and July 20 for personal property. Separately, Telluride School District is seeking bids for year-round custodial services at its three school buildings.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Outdoor adventuring with conservation at the core",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "recreation",
    copy: "Telluride Outside has been running guided outdoor trips here since 1984 — fly fishing, rafting, 4x4 tours, snowmobiling — and leases 12 miles of private water through its Telluride Angler shop. The outfit has raised over $9 million for Valley Floor riparian restoration and uses cleaner vehicles and four-stroke snowmobiles to cut emissions. Low snowfall is pushing schedule adjustments, with fishing trips moving to cooler morning hours.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_afaa6b38-4e93-4ea0-9c53-7976ce972ca2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/f9/ef9ac980-529b-426b-95cb-b81024b96cd0/6a4194c89458c.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Pac-12 basketball tournament is returning to Las Vegas as 7 new members join",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The Pac-12 is bringing its men's and women's basketball tournaments back to MGM Grand Garden Arena in Las Vegas after a period of uncertainty following a mass exodus of member schools. Seven new members — including Gonzaga, Boise State, and San Diego State — officially joined Wednesday, leaving Oregon State and Washington State as the only holdovers from the old conference.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_bc44a18e-43eb-5a66-9b17-74481a24eebf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/a6/fa6df350-6482-5002-9c7a-9143ad435df5/6a45656bc3b8a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Celebrate America 250 and Colorado 150 in Norwood",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Norwood Parks and Rec has put together a $5 Bucket List card tied to America's 250th and Colorado's 150th, with 20 local activities ranging from fishing Miramonte to sitting in the Town Park gazebo. Complete enough to hit 150 or 250 points and you're entered to win prizes at the Aug. 8 Music on the Mesa drawing.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_66edcd96-ac5f-4ceb-b006-3f2791f564c7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/be/cbe8a1fc-da39-4218-a216-052bffcd6f76/6a4450dd58b34.image.jpg",
    imgHiRes: true
  },
  {
    title: "West End Renaissance",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The West End has weathered cattle, mining, timber, coal, and COVID — the usual boom-bust pattern. Now broadband, airport upgrades, remote work, and the West End Vision Project are pointing toward a more diversified local economy. WEEDC is searching for a new executive director at what looks like a pivotal moment.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_64d52a82-dfcd-41c1-8ad7-17356b158ae9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/49/249a2e22-e7f8-4e77-842d-ef742134e68b/6a4451d589a77.image.jpg",
    imgHiRes: true
  },
  {
    title: "Grand Mesa and Uncompahgre National Forests enter Stage 1 fire restrictions",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "public-safety",
    copy: "Grand Mesa and Uncompahgre National Forests have entered Stage 1 fire restrictions amid severe drought across most of San Miguel County. Beetle outbreaks are killing trees near Busted Arm Draw, where timber removal projects are planned for next year to reduce wildfire risk where forest meets homes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_2d39aea1-17f7-4251-9383-1364826377f9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/7a/e7afb52b-6148-4787-901e-f023dd92e37e/6a444ff1046d3.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "government",
    copy: "The Chalkboard lists local birthdays for the week of July 2–7 and recurring community meeting schedules for Norwood and Nucla-Naturita area boards. Regular services include the Norwood Farmers Market Thursdays 2–6 p.m., weekly senior meals, Sunday food pantry, and pickleball sessions. AA meetings, free legal aid, and public health contacts are also noted.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_894e1c0c-5cb0-4604-ba04-88f713eb4805.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/3f/03f5379e-7873-4f42-8ea8-9af53a181d10/6a44526274f1b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado Democrats choose between insurgent progressives and veteran incumbents",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "government",
    copy: "Colorado's June Democratic primaries pit progressive insurgents against veteran incumbents in several key races — including a 30-year Denver congresswoman challenged by a Bernie Sanders-backed first-timer, and a Senate primary where Hickenlooper faces an \"insurgent progressive.\" The swing-district House seat could factor into national control.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d46744ac-3411-5bd7-97b9-2e30e434f7f0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/ae/caeecd6d-45ec-51b9-900c-b69d37e7b6d9/6a43435cc8de2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Melat Kiros wins Democratic nomination for U.S. House in Colorado's 1st Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "Melat Kiros has won the Democratic nomination for U.S. House in Colorado's 1st Congressional District. The 1st District covers the Denver metro area, well removed from the Telluride region, but it's part of the broader Colorado political landscape locals follow.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_da646672-16a3-5d5a-a515-847b88d164b8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Stark wins council seat; Dalton and Uihlein remain close",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "government",
    copy: "Christian Stark secured a Telluride Town Council seat, while the second seat remained tight between Dalton and Uihlein on election night. Both contested seats will be filled at the July 21 monthly council meeting. The special election was triggered by a mid-term resignation and a charter-required public vote on an appointed seat.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_dde69f5d-8cae-4bd7-a7f8-c993964bb25b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/7e/e7e5ec96-0503-4b3a-b54e-b0b54bfb0ce2/6a4477a9cec0c.image.png",
    imgHiRes: true
  },
  {
    title: "Dwayne Romero wins Democratic nomination for U.S. House in Colorado's 3rd Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "Dwayne Romero has won the Democratic nomination for U.S. House in Colorado's 3rd Congressional District. That's the seat covering this region, so it's worth keeping an eye on as the general election takes shape.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9934cc04-fb71-53d1-99bb-4dc55a357486.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Phil Weiser wins Democratic nomination for governor in Colorado",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Phil Weiser won the Democratic nomination for governor of Colorado. He'll face the Republican nominee in the general election for the state's top office.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_284f0737-7f3d-54d9-a0ad-deb2423ba68a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Michael Allen wins Republican nomination for attorney general in Colorado",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The article text here is mostly navigation noise and unrelated snippets — there isn't enough substantive content about Michael Allen's Republican nomination for attorney general to summarize accurately. Only the headline and a single line confirm the result. Michael Allen has won the Republican nomination for Colorado attorney general. That's the extent of what the article actually establishes — no primary date, margin, or opponent details are included in the provided text.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_47e6d1ad-e489-5a7b-af91-95d73fb4dbe5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Kelley Dennison wins Republican nomination for U.S. House in Colorado's 2nd Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "The article text here is mostly site navigation and unrelated content fragments — the actual story on Dennison's nomination doesn't include substantive detail beyond the headline. Kelley Dennison won the Republican nomination for Colorado's 2nd Congressional District U.S. House seat. The 2nd District covers the western slope, including the Telluride area.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_81aa76af-e062-5bea-8e3b-75d565c5e369.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Jessica Killin wins Democratic nomination for U.S. House in Colorado's 5th Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "Jessica Killin has won the Democratic nomination for U.S. House in Colorado's 5th Congressional District. The 5th has long leaned heavily Republican, so this sets up a general election contest worth watching as the fall campaign takes shape.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_21c60642-616e-56db-b31c-a7e21f439974.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Manny Rutinel wins Democratic nomination for U.S. House in Colorado's 8th Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "Manny Rutinel has won the Democratic nomination for Colorado's 8th Congressional District U.S. House seat. The 8th District covers the northern Front Range corridor, well east of the Western Slope.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_00aac81e-43a7-5e27-bb8d-c01435a45f13.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "John Hickenlooper wins Democratic nomination for U.S. Senate in Colorado",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "John Hickenlooper has won the Democratic nomination for U.S. Senate in Colorado. The race now moves to the general election.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d5fe6584-23a7-5f4a-9641-c9d530043638.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Jeff Hurd wins Republican nomination for U.S. House in Colorado's 3rd Congressional District",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "education",
    copy: "Jeff Hurd has won the Republican nomination for U.S. House in Colorado's 3rd Congressional District, which covers this region. That sets him up as the GOP candidate heading into the general election for the seat that represents Western Colorado.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_059d9514-60de-5d74-8edc-a1af2c836925.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Jena Griswold wins Democratic nomination for attorney general in Colorado",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The article text provided doesn't contain enough actual reporting on the Griswold story to summarize meaningfully — it's mostly site boilerplate and unrelated headlines mixed together. Only the headline itself carries any real information. Here's a summary based solely on what's confirmed in the text: Jena Griswold has won the Democratic nomination for Colorado attorney general. No further details about the race, margin, or opponents were included in the available article text. --- **Want me to write the card once you have the full article text?** I can turn it around quickly.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_70a8a5ff-fe7c-585d-9a10-3432695e1bf3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Amanda Gonzalez wins Democratic nomination for secretary of state in Colorado",
    source: "Telluride Times",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The article text here is mostly site boilerplate and navigation clutter — the actual story is thin. What's clear: Amanda Gonzalez won the Democratic nomination for Colorado Secretary of State. That's the whole of it, straight from the AP wire.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_923cf464-2af0-59cb-89b2-47f452a83136.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Hurt dance",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "A writer bikes to Secret Lake on a steep, rocky dirt road in the summer heat — tougher than remembered. The ride mixes physical struggle with a fond memory of stumbling onto a Basque sheepherder's camp years back. Quiet, honest writing about this country and what it does to you.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_fecc9745-e7bc-4d2f-a7d3-8eb939a3165b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/13/013ba86d-2271-48b4-8ba7-ccde638dd66f/6a4453ff602dc.image.jpg",
    imgHiRes: true
  },
  {
    title: "A monumental superbloom",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "health",
    copy: "Monument plant is having a superbloom across the San Juans this summer, triggered by the unusually wet July and August of 2022 — exactly four years ago, which matches researcher Dr. David Inouye's long-term findings on what cues the plant to begin forming a flower stalk. These monocarpic plants spend decades storing energy before producing one towering bloom, then dying, with some documented as old as 46 years before they ever flowered.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_213717d7-2629-45a1-a6ba-16dfae0e8eb4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/ed/aed2f81e-d2a1-4702-a065-c65299ec9c3e/6a444094216d6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Celebrate America 250 and Colorado 150 in Norwood",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Norwood Parks and Rec has a $5 Bucket List card tied to America's 250th and Colorado's 150th, with 20 local activities — hiking, fishing, the farmers market, even sitting in the new Town Park gazebo. Rack up points for prize drawings held Aug. 8 at Music on the Mesa. Cards available July 4 at Star Spangled Saturday and Wednesdays at The Livery.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/article_126335a5-be8b-4290-a374-899280ca4b26.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/d0/cd0b507e-90af-4e41-9682-e45c36510d0e/6a44393c7e0bb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Madeline to host 6th annual Alpine Cookout",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "The Madeline Hotel in Mountain Village is hosting its 6th annual Alpine Cookout over July 4th weekend, with a Chef's Table dinner July 2, the main outdoor cookout July 3 (4–7 p.m., $85 adults/$25 kids), and the Independence Day parade July 4. This year's chefs include James Beard winners Dean Fearing and Mark Kiffin, Iron Chef winner Viet Pham, and others. A portion of proceeds benefits the Telluride AIDS Benefit.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_390ec011-df03-4da2-b07c-f078ab6607ab.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/c9/cc9aafc0-c2cc-425c-be9b-9548dcc32224/6a443808cdd23.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lawton Eddy of Salida features at Bardic Trails on July 7",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "recreation",
    copy: "Salida poet Lawton Eddy headlines the Talking Gourds Bardic Trails virtual series on July 7. She's been performing since 2005, co-founded the Sparrows Poetry Festival, and published her debut collection in 2021. The free monthly event is hosted by the Telluride Institute — check tellurideinstitute.org for the Zoom link.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_b3bd6c35-6ee0-4878-8a7f-ea758f77a62c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/26/9265a43c-22e7-4195-9d96-9109f7e864bf/6a443530476f2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Science of Cocktails, with a twist",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Pinhead Institute's Science of Cocktails event pairs local mixologists with science — attendees sample clever drinks while judges award prizes based on taste and the chemistry behind each recipe. Proceeds support Pinhead's free STEM programs, which reach over 5,000 students across rural southwestern Colorado. Tickets at pinheadinstitute.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_644ff9a0-00ad-4553-8188-cabaa336957d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/c3/ac34666e-1877-4477-86a0-f225c5c27b11/6a443643643d6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Holding one another up",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "A Telluride community member named Julie Garel writes about losing her friend Sid to a shooting at a Montana bar. She reflects on grief, the limits of self-protective beliefs, and finding unexpected comfort — from a flight attendant, from Sid's friends holding each other at his memorial.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_1a9ad931-4b4a-414e-96d4-64afc133dfa3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Julie Garel",
    imgHiRes: true
  },
  {
    title: "Grateful for Road and Bridge",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "infrastructure",
    copy: "San Miguel County Road and Bridge recently graded a rough mountain road and applied magnesium chloride for dust after a resident reached out with concerns. The work made a real difference for daily drivers, though speeds have crept up since the improvements. The road is still dangerous — 15 mph, low gear.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_67f8709f-5b97-464a-93dd-be56a24c067b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Sue Hill",
    imgHiRes: true
  },
  {
    title: "Thank you, PI Fund",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "A 17-year-old local skier attended Silverton Avalanche School with support from the PI Fund, gaining hands-on training in avalanche awareness, rescue techniques, and backcountry risk management. The course included snow pits, rescue gear practice, and a live survival simulation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_4de1569b-6321-4a14-b3c3-435941f56b0a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Owen Stewart",
    imgHiRes: true
  },
  {
    title: "And more PI Fund gratitude",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "A local writer shares gratitude for receiving support from the Peter Inglis Avalanche Education Fund, which covered their Rec Level 1 avalanche course with Mountain Trip. The three-day course blended classroom and field time, with guides helping students understand backcountry risk without discouraging participation. The fund continues to make this kind of hands-on safety education accessible to community members.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_aca236c5-262a-40c0-92a0-5ca6da97764a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Your",
    imgHiRes: true
  },
  {
    title: "Telluride AIDS Benefit announces historic giving year",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "land-use",
    copy: "The Telluride AIDS Benefit had a record-breaking fundraising year in 2026, with proceeds going to local, regional, and international partners providing HIV prevention, treatment, housing, and care. National HIV Testing Day falls June 27. A fundraising cookout is set for July 3 at the Madeline Hotel.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_72969d70-5592-4bf4-9c54-4a42daa8ecbf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/57/357b17a2-9558-4e0f-9cf9-588495ad7e48/6a44344097ac7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Don't replace our sense of place",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Telluride's character — the scale, the streets, the views — didn't happen by accident. It was shaped over generations through deliberate decisions, restraint, and trade-offs by people who understood that not every opportunity is worth taking. The question now is whether that stewardship continues.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_5edf3551-b84c-440f-ab67-f27b07af37f9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Michael Saftler",
    imgHiRes: true
  },
  {
    title: "Pickleballers need space",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Pickleball has grown from painted lines on existing courts to a regular fixture in the park, with free reserved drop-in times three days a week. Now there's a call to dedicate the planned oval paving project to pickleball rather than basketball. Tennis players pay per reservation; pickleball players don't.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_34ab697b-0660-4085-ab3a-3d0068fd8da9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Eliot Brown",
    imgHiRes: true
  },
  {
    title: "Toxic plants for cats",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Lilies and daylilies are the most dangerous plants for cats — even small amounts can cause fatal kidney failure within 48 hours. Tulips, daffodils, sago palms, and common houseplants like aloe and azaleas can also sicken cats. The ASPCA's toxic plant database is a good resource before bringing a new cat home.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_54ce034f-4de6-4d19-861a-e1f403f14173.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/0a/a0ab000e-8b45-47a2-a486-ff75d39e3329/6a44314665cd3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Game of cones",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Chef Gavin has been running 221 South Oak since 2000 and added a second spot, Liz, two years ago at 200 West Colorado Avenue. Liz focuses on affordable, healthy rice bowls, breakfast options, and quality meats with no added sugar. This summer, Liz is adding scooped ice cream.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_3c8d5f3f-d2df-4469-b121-8a7692ae7e41.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/ee/4eea3128-d385-40a6-9b04-af1aaffa6269/6a418cdd585d3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Plan to convert the Town Park oval into a concrete space sees pushback",
    source: "Telluride Times",
    date: "June 30, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "recreation",
    copy: "The Town Park oval is set to be paved into a concrete multi-use surface — including sports courts — with site prep starting this fall and concrete work in spring 2027, at a phase-two cost of $1.33M. The plan has been in design documents since 2020 and cleared HARC review and council approval, with the Town citing year-round usability and drainage fixes. Muscatel Flats neighbors are pushing back, circulating a petition with 200+ signatures over lost green gathering space and pickleball noise concerns.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b989f2dd-f756-4e51-b0f2-f8c897136e43.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/17/7176ca8b-edea-48f4-b9ca-4538be741ffc/6a42d31a450c5.image.jpg",
    imgHiRes: true
  },
  {
    title: "3 firefighters killed in Western wildfire were trying to shield themselves from flames",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "public-safety",
    copy: "Three wildland firefighters — Emily Barker, Nick Hutcherson, and Sydney Watson — were killed near Grand Junction, Colorado, after attempting to deploy emergency shelters when they were overrun by fire. They were part of a Helitack crew working the Snyder Fire, which has burned roughly 44 square miles. The national wildfire preparedness level has been raised to 4 out of 5, with more than 8,000 firefighters deployed across the West.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_83a25af7-14a0-5408-b1e7-3e785a8bfc40.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/3b/43bb6b00-4dca-58d4-9b6a-95248b39f722/6a42a17b96f82.image.jpg",
    imgHiRes: true
  },
  {
    title: "Arkansas will move forward with a ban on using SNAP for candy and soda despite recent court ruling",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "arts-culture",
    copy: "Arkansas is moving ahead with its ban on using SNAP benefits to buy candy and soda, even after a federal judge vacated similar waivers in five other states on procedural grounds. Grocers will carry the enforcement burden, with the state providing a banned-items list and a consumer app to help shoppers navigate the changes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_6dd706fc-b56e-5909-8648-20c00aa17a90.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/82/68294f25-d97e-5bd1-baac-0054d024a087/6a42f39b271b6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Echoes of deadly Arizona wildfire with 3 firefighters killed in Colorado-Utah blaze",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "public-safety",
    copy: "Three firefighters on a Helitack crew were killed and two injured Saturday in a wildfire west of Grand Junction that has burned 44 square miles. They deployed fire shelters — last-resort heat-resistant tents — when flames overtook them, mirroring the 2013 Yarnell Hill tragedy in Arizona. Investigations like these often take months and rarely produce clear answers.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_577a5477-85e4-5731-913a-e6725143ec4d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/2e/22e691da-f0b3-5be8-a368-74d042eeda40/6a42df867f724.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado court rejects November ballot initiatives aimed at redrawing congressional districts",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "government",
    copy: "Colorado's Supreme Court threw out ballot initiatives that would have allowed mid-decade congressional redistricting, ruling both Democratic- and Republican-backed versions violated the state's multi-subject rule. Colorado's delegation currently sits at an even 4-4 split under maps drawn by the independent redistricting commission after 2020. That commission — created by voters in 2018 — remains intact.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_0d1a8d00-3442-582f-8656-1684af6654d7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/e1/ae1348ac-011e-5012-8696-6d5e86ee7336/6a42ec993cccc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Uncontained wildfires continue to ravage the Western Slope",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "public-safety",
    copy: "Three firefighters from the Rifle Helitac crew were killed and two injured in a burnover on the Knowles Fire near Grand Junction, where merged fires have burned nearly 30,000 acres with zero containment. The Gold Mountain Fire north of Ouray topped 4,000 acres, prompting a disaster declaration and closing Highway 550; Norwood and Telluride fire crews are on scene. San Miguel County is under a smoke advisory and Stage 2 fire restrictions, though no active fires were burning there as of Monday.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_77b644e3-1bc0-4799-b0ca-1289b8078e53.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/7b/e7b914ee-2087-4175-99f1-951c90a56f46/6a42d1776ce10.image.jpg",
    imgHiRes: true
  },
  {
    title: "Three firefighters who died in wildfires on Utah-Colorado border were from Alabama, Arizona and Michigan, officials say",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "public-safety",
    copy: "Three firefighters killed in wildfires along the Utah-Colorado border have been identified as coming from Alabama, Arizona, and Michigan. Details beyond their home states have not yet been released.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_e4e7bb70-4744-5bcb-b258-81fe5227d43b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "AP Decision Notes: What to expect in Colorado's state primary",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "government",
    copy: "Colorado's June primary features a Democratic governor's race between Sen. Michael Bennet and AG Phil Weiser, with Bennet vowing to name his own Senate replacement — someone under 50 — if elected. On the Republican side, Victor Marx leads in fundraising. Sen. Hickenlooper also faces a primary challenge from state Sen. Julie Gonzales.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_34b59166-5bd5-5e02-be97-b9df3e6d5eac.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/40/1400a5b7-ed9e-535b-adbc-f9fc9d9d34cd/6a4258c3c87ef.image.jpg",
    imgHiRes: true
  },
  {
    title: "MV Town Council considers recommendations on strengthening ethics code",
    source: "Telluride Times",
    date: "June 29, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "government",
    copy: "Mountain Village Town Council met with lead investigator Nick Boeving on June 17 to review ethics reform recommendations following last winter's procurement controversy. Council members pushed back on most suggestions, including adding \"appearance of impropriety\" language to the ethics code. Disclosure and recusal requirements drew the most support.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_73013665-e958-4674-9a72-571d5d48f074.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/b5/fb5bc5b4-b6d7-4092-95d0-3c822ed0284c/6a3fe0b95f574.image.jpg",
    imgHiRes: true
  },
  {
    title: "Dry, windy conditions fuel explosive wildfire growth across western US",
    source: "Telluride Times",
    date: "June 28, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "public-safety",
    copy: "Wildfire conditions across the West are severe this season — low humidity, warm temps, and gusty winds pushing fires fast across steep, hard-to-reach terrain. Utah declared an emergency, banned fireworks ahead of July 4th, and cut power in some areas to reduce risk. Nearly 3 million acres have burned nationally, already above the 10-year average.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ae2d65ba-16e2-566a-8769-e292b774e752.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/d6/ad61ec39-0c6c-537e-ab49-0d4477843304/6a405e4511644.image.jpg",
    imgHiRes: true
  },
  {
    title: "Livable Telluride aims to help residents stay informed",
    source: "Telluride Times",
    date: "June 28, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "land-use",
    copy: "Livable Telluride is a new website pulling together government meetings, agendas, development projects, and community resources for the Telluride region — covering the towns, county, and special districts in one place. The site includes a projects map, deep-dive explainers, and a message board, with AI handling most of the data gathering automatically.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7b89e05e-4bf6-4d82-9a32-fbec9c2a5fde.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/84/4849e313-a51b-4162-88a4-8c26532fb1d8/6a3fd61eae1ca.image.jpg",
    imgHiRes: true
  },
  {
    title: "NASA races to save Swift telescope from falling back to Earth with daring rescue mission",
    source: "Telluride Times",
    date: "June 28, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "public-safety",
    copy: "NASA hired startup Katalyst Space Technologies to boost the aging Swift Observatory to a higher orbit before it falls back to Earth, with liftoff as early as Tuesday aboard a Pegasus rocket. A small autonomous spacecraft called Link will spend roughly three months catching and repositioning Swift from 224 to 373 miles up. Hubble faces a similar fate and could be next in line for this kind of robotic rescue.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d7e4086c-85cd-5b1e-8db8-a9642945934e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/4b/c4b2c0d7-1838-5df1-8cfd-d7dd192e78e8/6a4111f77745a.image.jpg",
    imgHiRes: true
  },
  {
    title: "3 firefighters killed, 2 injured while tackling wildfires on the Colorado-Utah border, U.S. Wildland Fire Service says",
    source: "Telluride Times",
    date: "June 28, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "public-safety",
    copy: "Three firefighters were killed and two injured fighting wildfires along the Colorado-Utah border, according to the U.S. Wildland Fire Service. This region knows fire season well — losing crews is a hard reminder of what's at stake out there.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_6252f903-83d2-534d-a819-c1bbebca95df.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Sacred Sundays at Grace Reins",
    source: "Telluride Times",
    date: "June 28, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "community",
    copy: "Grace Reins, a Placerville facility cofounded by Erin Cain and Joe Crilly, works with eight rescued mustangs and one horse in therapeutic sessions for individuals, couples, groups, and students. A new bimonthly series called Sacred Sundays runs 3–5 p.m. through October 18, pairing conversations with local guests, time with the herd, and a sound bath.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_851f94d0-fc20-4708-bf13-cc7607c6a3a6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/06/7060b43b-d069-4648-bee6-185456a0a1f8/6a3e256be27a3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Dangerous weather hampers firefighters and leads to fireworks bans in western US",
    source: "Telluride Times",
    date: "June 27, 2026",
    firstSeen: "2026-06-27",
    newsTopic: "public-safety",
    copy: "The Cottonwood Fire in southern Utah has grown to over 112 square miles, with 45 mph winds and single-digit humidity grounding air tankers Friday. Red flag warnings stretch from Idaho to Arizona, and Rocky Mountain Power has issued safety shutoff watches across parts of Utah. Smoke from the fire was visible as far as Colorado.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_91a3a403-ca93-5b4b-b51d-b43ca29a9039.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/e3/2e38c486-0ff5-5582-bf12-448f34b30dad/6a3f09339e344.image.jpg",
    imgHiRes: true
  },
  {
    title: "Perpetually perplexed by parking policies",
    source: "Telluride Times",
    date: "June 27, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "recreation",
    copy: "Telluride's new license plate reader system is drawing public pushback, mainly because tickets are mailed days or weeks after violations instead of placed on windshields. Residents, business owners, and all three town council candidates agree that real-time, physical citations are needed. The town manager will address parking briefly at the June 30 council meeting.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_5e8fb307-bb6a-4b88-81c6-b376b8828dab.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/ea/9ea5844f-9d6e-4106-bbe3-55e708b3a2da/6a3f6ad86a845.image.png",
    imgHiRes: true
  },
  {
    title: "A win-win for artists and audiences",
    source: "Telluride Times",
    date: "June 27, 2026",
    firstSeen: "2026-06-27",
    newsTopic: "arts-culture",
    copy: "Augment Music Project, a Telluride nonprofit founded in 2020, pays local musicians to perform at free public events — the Farmers' Market Fridays, Elms Park concerts, and the library's Sweet Sounds series. They also offer annual grants to help musicians cover gear or studio costs. The goal is keeping talented players here rather than losing them to bigger markets.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_140be4e3-7455-49cc-89b3-13d8b341c61b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/03/8037a17d-d689-4eaf-a3e8-cb40757464fe/6a3d8c9fddf39.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Village moves forward with accelerated housing review",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "land-use",
    copy: "Mountain Village council approved an expedited review process for affordable housing projects — a step required to stay eligible for Colorado's Proposition 123 funds. Projects where at least half the units are affordable can now move through a faster approval track. The move also positions the town for up to $45,000 in additional grant funding if adopted before July 2026.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8c40ad7e-1a8a-43fa-9a8f-db59ce5a5d0a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/66/d66bb1f2-ebae-45fd-a67f-ab084607de68/6a3d859147699.image.jpg",
    imgHiRes: true
  },
  {
    title: "Polygamous sect leader convicted of abuse charges after girls found in trailer on Arizona highway",
    source: "Telluride Times",
    date: "June 27, 2026",
    firstSeen: "2026-06-27",
    newsTopic: "public-safety",
    copy: "A polygamous sect leader with ties to Colorado was convicted on all three counts of child abuse after girls were found locked in a hot, unventilated cargo trailer on an Arizona highway. He faces 4–8 years mandatory per count, with sentencing August 25. He'd previously been convicted in federal court on coercion and kidnapping charges.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_506fcc50-5b59-5590-a179-6723ee238102.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/54/054d6e04-4baf-5cae-8ca7-286bad50d954/6a3f13dbc3846.image.jpg",
    imgHiRes: true
  },
  {
    title: "Utah governor restricts fireworks as largest US wildfire surges uncontained",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "public-safety",
    copy: "Utah's Cottonwood Fire — now the largest active wildfire in the U.S. — is burning uncontained in Beaver County, destroying cabins and prompting Governor Cox to restrict fireworks statewide through July 5. Utah's state forester says fires are spreading faster than veteran firefighters have ever seen, with much of the region under severe to extreme drought. Smoke is visible as far away as Colorado.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1af5dc85-1524-5904-bfaa-1887e6d450da.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/18/e18e507a-eb43-5d4f-a72f-ee385dc2d66a/6a3ebbb06dac8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Polygamous sect leader is convicted of child abuse charges after girls found in enclosed trailer on an Arizona highway",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-27",
    newsTopic: "recreation",
    copy: "The Colorado Supreme Court ruled June 15 that Telluride's PUD agreements are administrative rather than legislative, meaning they can't be altered through citizen ballot initiatives. That's a significant clarification of how much direct say residents have over certain land-use decisions in town.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ca211695-7677-5096-9532-9efe5e99146b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Election Day Tuesday",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-27",
    newsTopic: "government",
    copy: "Tuesday, June 30 is Election Day in San Miguel County, with Town of Telluride voters also choosing two Town Council seats. Ballots were mailed earlier this month; in-person voting runs through Tuesday, 7 a.m.–7 p.m. Details at sanmiguelcountyco.gov/164/Elections.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_96e5c402-24eb-450d-be36-c051700ea081.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/ba/cbaf1e30-8c3e-47ca-9375-c5ab1653228d/6a3ee75e8bae4.image.jpg",
    imgHiRes: true
  },
  {
    title: "As Massachusetts ballot initiatives multiply, critics want to limit them",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "government",
    copy: "Massachusetts lawmakers, including House Speaker Ron Mariano, are pushing to reform or restrict the state's ballot initiative process, calling it \"fraught with peril.\" Twenty-three states allow some form of citizen initiative, a tool dating to the Progressive Era. Direct democracy advocates argue it's a necessary check when legislators won't act.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_977062db-12f7-5a40-9d9f-4eb543d5ace4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/12/312e8f3c-16dd-5ad1-8ec2-29083ad767df/6a3ec0477ef8c.image.jpg",
    imgHiRes: true
  },
  {
    title: "New chapter for ‘oldest continuously owned business in Telluride’",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "community",
    copy: "Elinoff Gallery at 204 W. Colorado Ave. — Telluride's oldest continuously owned business at 34 years — is in transition as founder Neal Elinoff, 71, looks to retire and sell or transfer the store before winter. The gallery carries original works by Picasso, Renoir, Warhol, and others, alongside jewelry and repair services. A trunk show featuring Roman and Jules jewelry runs July 1–3.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d73f9f18-47da-4440-9ab2-c08c1c87f03b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/31/7318e12d-8355-4640-9509-296acd873093/6a3917c90eb40.image.jpg",
    imgHiRes: true
  },
  {
    title: "Prosecutor dropping drug case against Olympian skier Bode Miller",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "recreation",
    copy: "Fremont County is dropping misdemeanor drug charges against Olympic ski legend Bode Miller, with the prosecutor citing new information tied to another active case. A second man charged in the same incident appears in court records. Miller had said the cannabis and pipe found during a traffic stop belonged to a friend, not him.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1c9a5348-84e1-542d-aeac-bd8adccd3f54.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/eb/3eb4bef7-d4b3-5c21-98a1-4ff3c1a91d21/6a3b202368366.image.jpg",
    imgHiRes: true
  },
  {
    title: "Elevated fare, lively scene",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "community",
    copy: "Kenny Rosen and Michael Goller — the team behind Uno, Dos, Tres, the Tunnel, and the Cornerhouse — opened Cuatro, Cinco, Seis on West Pacific in June. The Mexican restaurant aims for a middle price point with an elevated, chef-driven menu and a cocktail program drawing early notice. Breakfast, lunch, and dinner served; patio is open.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_84f92a95-eaa0-4b07-805a-6208792f13d1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/47/f47f9cf1-3ca7-4aef-8334-6d85a8ecc5cb/6a3d896e8530e.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘I just wanted to create’",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "arts-culture",
    copy: "Ridgway-based artist Brittany Miller — who spent 25 years coaching skating in Telluride and has shown work at Slate Gray and other local venues — was recently tapped by Telluride Arts to lead a Creative Exchange on how life's mistakes shaped her path. She opened Fine Art and Framing in Ridgway in 2020 and still teaches at Ah Haa.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_048ca257-ae6b-4c9e-8f24-340f82d86ff3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/b9/ab99ad6e-a264-4e03-b48e-812b612a79b9/6a3ad8a8c2753.image.jpg",
    imgHiRes: true
  },
  {
    title: "Brothers are accused of mishandling remains of two dozen people at Colorado funeral home",
    source: "Telluride Times",
    date: "June 26, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "public-safety",
    copy: "Two brothers who owned Davis Mortuary in Pueblo were arrested after inspectors found remains of roughly two dozen people stored in deeply improper conditions, including possible false ashes given to families. The case triggered under Colorado's new 2024 funeral home inspection rules, adopted after years of weak industry oversight statewide.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_91985d3f-af2a-53cf-b832-965c5f237d75.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/a8/5a873b17-7247-5c9e-9319-d34888cd243e/6a3dbe2d7007a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Pride bike ride on Sunday",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "community",
    copy: "A community Pride Month bike ride rolls out Sunday, June 28 at 3:30 p.m. from Town Park, heading west on Pacific Avenue with stops to dance at Lift 7 and the La Cocina patio. Organizers welcome riders of \"all ages, all wheels, allies.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/news/article_5eac6236-2641-4037-891c-5bcf2673674f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/41/b4101119-ceec-40a0-a546-273c5b5851cb/6a3d905776e2b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Towns, County announce stage 2 fire restrictions",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "public-safety",
    copy: "Stage 2 fire restrictions are now in effect for the Town of Telluride, its open spaces and roads, and all unincorporated San Miguel County land. Restrictions ban open fires, most grilling, smoking outdoors, fireworks, and combustion engines without spark arrestors. National forest lands nearby remain under the less-restrictive Stage 1.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1ee452dd-dff5-43ac-9077-15181bf7b98c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/6b/46b7ec9d-e334-4944-94e0-33175696b1bf/6a3d8ea2ea92a.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of June 25-July 1",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "government",
    copy: "The Chalkboard for June 25–July 1 lists local birthdays and recurring community meetings and events in the Norwood and Nucla-Naturita area. Weekly and monthly programs include the Norwood Farmers Market, senior meals, food pantry, pickleball, AA meetings, and free legal aid. Town board, school board, and chamber meetings also follow regular monthly schedules.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_18d0ee98-9560-4b52-ab87-ab0df895e2e9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/49/84978b61-651d-4ad9-9545-6337dcfc9316/6a3ac47be664c.image.jpg",
    imgHiRes: true
  },
  {
    title: "The ins and outs of e-bikes",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "recreation",
    copy: "San Miguel County, the towns of Telluride and Mountain Village, the ski resort, and federal land managers all have different e-bike rules. Most popular local trails are off-limits, including Jud Wiebe, Bear Creek, and the East End trails. County-allowed routes are limited to Whiskey Charlie and the M59 River Trail.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_143bdae7-71b8-4b5a-b4b5-17ac56b1ca76.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/1c/b1c03ed9-49d5-46d0-96c9-d14d148890bc/6a3addd597b51.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for June 25-July 1, 2026",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "community",
    copy: "San Miguel County will hold a public hearing July 15 on a lot line vacation at Lawson Hill to allow employee housing tied to the county jail. Separately, a foreclosure sale is proceeding on a San Miguel County property originally mortgaged in 2009. Creditor claims against the estate of Todd Kunkel are due by October 18, 2026.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Community movie night honors Lissa Margetts",
    source: "Telluride Times",
    date: "June 25, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "arts-culture",
    copy: "A free community screening of \"The Mountain Arm\" — a 60-minute documentary on Lissa Margetts and her decades of wildlife caregiving — takes place Monday, June 29 at 5:45 p.m. at the Michael D. Palm Theatre. The program also includes filmmaker Bailey's avalanche reel and a tribute film by Michael Aisner, running about 90 minutes total. Donations welcome but not required.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a2c3a5a4-a3d5-4e32-a4db-50eb1bc52c4f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/ca/7cace423-344d-4683-85d8-b8f81b5e25be/6a3a45f3d187b.image.png",
    imgHiRes: true
  },
  {
    title: "Jake Gordon takes his seat at CSU Extension office",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "arts-culture",
    copy: "Jake Gordon, a Norwood-area native, has joined the San Miguel Basin CSU Extension office as its first natural resources staffer in roughly a decade. He's running youth ag programs, setting up trainings on weeds, Russian olive, and range management, and organizing Community Animal Response Teams for evacuations. The San Miguel Basin Fair runs July 10–18; schedule at sanmiguelcountyfair.com.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_b520494e-d7d5-44ad-a5dc-9f0ea23060bf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/b9/db970a35-5737-4362-91a6-cf5a21780a18/6a3ab0c3c92f3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Tau: Untangling early Alzheimer’s detection",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-25",
    newsTopic: "community",
    copy: "Telluride Science hosts a free Town Talk Tuesday, June 30, 6:30 p.m. at the Telluride Conference Center in Mountain Village. UT Southwestern's Dr. Lukasz Joachimiak presents on tau protein — how it misfolds and may signal Alzheimer's and other brain diseases decades before symptoms appear.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_7b6d1b27-9e63-4a8a-8c97-7eb128433440.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/59/159d8d47-5109-41ba-a693-c8c945993f15/6a3ac66656a02.image.jpg",
    imgHiRes: true
  },
  {
    title: "A safe space for local youth",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "San Miguel County teens pushed for years to get a dedicated hangout spot, and in May 2025 they got one. The Shed — a 500-square-foot space on the Voodoo Lounge property in Telluride — is run by CTC and funded jointly by the Town of Telluride, Mountain Village, and San Miguel County. Open to ages 12–19, it offers everything from ping-pong to SAT prep, with programming shaped by a youth advisory board.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1d5a5b26-5d2a-4e4c-b252-d72cf27cf1e5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/41/e411def4-084b-45db-b6b0-b25c02feaf4a/6a3a40da633cb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Art in action",
    source: "Telluride Times",
    date: "June 24, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Telluride Plein Air runs June 29–July 5, with invited painters working at easels along Main Street and around the valley. The Quick Draw on July 2 challenges artists to finish a piece in 90 minutes, followed by a free public sale and preview party at the Sheridan. Daily exhibitions run July 3–5 in Oak Street and Elms parks.",
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
    copy: "The Grand Mesa Writers' Symposium runs Sept. 11–13 in Cedaredge, featuring regional writers including Telluride poet Kierstin Bridger, nonfiction author Craig Childs, and Western Slope poet Rosemerry Wahtola Trommer, who closes the event. Weekend passes are $160; a Saturday evening showcase tickets are $25 through Sept. 11. Details at grandmesawriters.org.",
    claudeSummary: true,
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
    copy: "Bode Miller pleaded not guilty to misdemeanor drug charges in Idaho after a traffic stop turned up psilocybin mushrooms. Miller says the cannabis found belonged to a friend and he was unaware of it; court documents note a deputy found 4.1 grams of mushrooms in a dispensary bag.",
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
    copy: "Telluride Theatre is hosting the Muleskinner's Ball, a fundraising gala featuring a buffet dinner by Telluride Chef, casino games, a secret speakeasy, and pop-up theatrical performances set in early 1900s wild west Telluride. Funds support theater programs, artist pay, venue costs, and a mortgage on office space the organization purchased last year. Telluride Theatre also took over the drama program at Telluride Middle/High School in 2025 after a longtime teacher retired.",
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
    copy: "A former Colorado Bureau of Investigation DNA analyst pleaded guilty after admitting she altered and deleted data to close cases faster, compromising hundreds of criminal cases including homicides and sexual assaults. At least one murder conviction was overturned, and the fallout could cost the state more than $11 million. She faces 8–16 years at her September sentencing.",
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
    copy: "Norwood Preschool earned a Level 5 rating from Colorado Shines — the state's highest designation for licensed early care programs — following a three-hour observation and documentation review. The voluntary rating covers everything from child interactions to hand-washing routines. The play-based program serves around 20 kids ages 3–4 annually.",
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
    copy: "A columnist reflects on the \"analog bag\" trend — carrying non-digital items like books or sketchbooks to step away from screens — and draws a parallel to Native American medicine pouches as objects of meaning and presence. A camping trip near Gateway without charged phones drove the point home: restlessness faded, and the orioles and the Dolores River got louder.",
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
    copy: "This is a personal Father's Day reflection by Stan Brooks, a part-time Telluride resident and Emmy-winning filmmaker, on becoming a grandfather for the first time. He writes about the unexpected emotional depth of the experience and touches on the science of \"grandfather brain\" — hormonal surges triggered by holding a grandchild.",
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
    copy: "The Telluride region still enjoys genuinely dark skies, partly because many mesa residents run on solar and skip outdoor lighting after dark. The piece reflects on how light pollution is erasing that experience for most people, disrupting sleep cycles and severing a connection to the night sky that humans have always had.",
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
    copy: "The Telluride Mushroom Festival will honor the late Katrina Blair, a 16-year festival contributor known for her annual Durango-to-Telluride wild foraging walk and the beloved Wild Foods Dinner. This year's dinner (Aug. 14, Ah Haa rooftop) continues with Mila Garelle making the traditional journey. A free public memorial is set for Aug. 15 at Elks Park.",
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
    copy: "This article isn't a Telluride Times piece — it's a personal essay about attending a Breeders concert in Maine. There's no local Telluride news here to summarize for a community card.",
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
    copy: "Telluride Yoga Festival runs June 25–28 across Mountain Village and Telluride, marking its 18th season with record attendance — 1,200 passholders, 50 presenters, and 150-plus offerings. Many free public events are included daily: yoga in Elms Park, live music, meditations, and opening/closing ceremonies. About 26% of attendees are local residents; the rest come from all 50 states and beyond.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_119bdb3b-96a7-4823-9921-f3ce090d1538.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/4d/34df2b7b-ebe5-4835-bd30-9c75b7f87713/6a3ac6382ce06.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Bluegrass Festival astounds",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Sam Bush anchored this year's Telluride Bluegrass Festival across multiple sets — with the Telluride House Band, Tedeschi Trucks Band, Larkin Poe, Leftover Salmon, and more — in what sounded like one of his busiest festivals in his 52 consecutive years attending. Highlights included Jake Shimabukuro, soprano Renée Fleming singing \"Ave Maria\" backed by Béla Fleck's banjo, and Fleck's bluegrass take on \"Rhapsody in Blue.\" Sierra Hull, Greensky Bluegrass, the Infamous Stringdusters, and first-timers Dallahan and Alash rounded out a characteristically wide-ranging lineup.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_c2d45aa1-2ba5-49cb-b903-fcf3608376bf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/0e/c0e8308a-eb16-4314-b6e6-5e0ebdf76089/6a3a57dd9d203.image.jpg",
    imgHiRes: true
  },
  {
    title: "Housing and the environment",
    source: "Telluride Times",
    date: "June 23, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "land-use",
    copy: "Nearly half of San Miguel County workers commute more than 25 miles, with transportation making up 30% of local emissions. The county needs roughly 1,100 housing units by 2030, and more homes near town would cut those commutes. Multifamily buildings also tend to run more energy-efficiently than larger second homes sitting dark.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7e2ae631-ad66-4171-a7bb-16e0afca004c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/35/6359fa98-3753-4424-9fb7-8510347a2bf2/6a391a4d3d1bf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Munchie Mansion is a new eatery in Placerville",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "Jenni Watkins opened Munchie Mansion, a food trailer at 260 Front St. in Placerville, in March — an offshoot of her decade-old catering business, The Sunny Side. The trailer runs Monday–Friday, 10am–4pm, serving homemade sandwiches, sides, and espresso from Telluride Coffee Roasters. Dinner service is planned for this summer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_9d05a760-b3f2-4345-947d-02c7bf92ff3a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/e5/8e553ba1-8595-4d5c-8b98-84b7caf90acf/6a31b60d0bdce.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Threads of sound’",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Telluride Chamber Music returns to the Mai residence — a restored barn beneath Sunshine Mountain — for three evening concerts June 28, July 2, and July 5, featuring violinists, a cellist, and pianist Orion Weiss, with guest clarinetist Alan Kay of Juilliard joining the July 2 program. The concerts mix classical masterworks with contemporary pieces, ending each night on a lighter note. A Local Artists' Night is also scheduled June 30.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_ce72d8c6-e7f3-46f2-846a-529ca94e23f4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/a5/ba56e910-dc41-4628-afeb-b4f75e839c5e/6a391393f2918.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wyndham Clark avoids record collapse and holds on to win the US Open",
    source: "Telluride Times",
    date: "June 22, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "Wyndham Clark won his second U.S. Open title at Shinnecock Hills, closing with a 73 but holding off Sam Burns by one shot. He built a big 54-hole lead that nearly vanished before a clutch 30-foot birdie on 16 steadied him. His father flew overnight from Denver to watch him win for the first time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_2dfa6045-3d42-50d3-8d67-378ce6f4ffdb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/5f/85ff96ce-ec9b-566b-9232-80f9c06de7c0/6a386d86ea740.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wyndham Clark wins his second U.S. Open title with wire-to-wire victory at Shinnecock Hills",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "The Colorado Supreme Court ruled on June 15 that planned unit development (PUD) agreements are administrative in nature, meaning they can't be changed through citizen ballot initiatives. It's a significant legal line to draw in a town where land use decisions tend to generate strong community opinions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_741c8fd1-5de3-5dac-aec3-248d0ce3eb06.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "True North, Juvenile Diversion programs team up for youth",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "education",
    copy: "True North and San Miguel County's juvenile diversion program joined forces for a first-ever multi-day college tour, taking students from Norwood, Nucla, and Telluride to visit four schools and two national parks across southern Colorado. The trip was funded through an opioid prevention grant and a state human services program. Organizers hope to make it an annual overnight event.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d6449172-ab41-482d-b4d5-c74c1415f80c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/dd/5ddbec01-609b-4606-b58e-a3643c3d7351/6a31b91e9d10d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Court ruling will protect open space in Butcher Creek",
    source: "Telluride Times",
    date: "June 21, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "land-use",
    copy: "Colorado's Supreme Court unanimously ruled that the Butcher Creek PUD agreement can't be changed through a ballot initiative, keeping Lot A as common open space. The court found Brighton's proposal tried to bypass the town's required administrative process for amending planned unit developments. The 37-acre hillside has steep slopes, geologic hazards, and bedrock close to the surface.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a35ab12e-3137-49bf-80e7-278cc26eda89.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/11/2112bc34-deea-4afa-b03b-c1ef73ab051f/6a3566c709038.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Telluride Welcomes Patrick Rondinelli as Deputy Town Manager",
    source: "Town of Telluride",
    date: "June 30, 2026",
    newsTopic: "recreation",
    copy: "(June 30, 2026) – The Town has hired Patrick Rondinelli as its new Deputy Town Manager. He joins the Town with more than two decades of local government leadership experience & a deep understanding of the opportunities & challenges facing mountain towns.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=399",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15606"
  },
  {
    title: "Town of Telluride Announces Schedule & Lineup for Fourth Annual Fourth of July Bash",
    source: "Town of Telluride",
    date: "June 24, 2026",
    newsTopic: "public-safety",
    copy: "(June 24, 2026) – In response to increasing fire danger across the region, the Town of Telluride will implement Stage 2 Fire Restrictions effective at 12:01 a.m. MT on Friday, June 26, 2026.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=398",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15590"
  },
  {
    title: "Town of Telluride to Implement Stage 2 Fire Restrictions",
    source: "Town of Telluride",
    date: "June 24, 2026",
    newsTopic: "public-safety",
    copy: "(June 24, 2026) – In response to increasing fire danger across the region, the Town of Telluride will implement Stage 2 Fire Restrictions effective at 12:01 a.m. MT on Friday, June 26, 2026.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=397",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15584"
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
    title: "Home Rebate Programs",
    source: "San Miguel County",
    date: "June 27, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1403",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14337"
  },
  {
    title: "Natural Resources Land Use Code Amendments",
    source: "San Miguel County",
    date: "June 26, 2026",
    newsTopic: "land-use",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1402",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14335"
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
    title: "County Enters Stage 1 Fire Restrictions",
    source: "San Miguel County",
    date: "June 17, 2026",
    newsTopic: "public-safety",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1397",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14307"
  },
  {
    title: "San Miguel County upgrading fire restrictions to Stage 2 for privately-owned, unincorporated land effective June 26 at 12:01",
    source: "San Miguel County",
    date: "June 24, 2026",
    newsTopic: "housing",
    copy: "Currently, there are varying levels of restrictions across the region, so please check the appropriate websites for the areas you plan to travel to and recreate in.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=533",
    img: ""
  },
  {
    title: "Town of Telluride Election Today",
    source: "Town of Telluride",
    date: "June 30, 2026",
    newsTopic: "government",
    copy: "Results for today's Town of Telluride special election are being reported live by San Miguel County. Updated totals will be posted as ballots are counted. View the live election results: https://bit.ly/totelection26",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=69",
    img: ""
  },
  {
    title: "Gold Mountain Fire",
    source: "Town of Telluride",
    date: "June 29, 2026",
    newsTopic: "housing",
    copy: "The Town is aware of the Gold Mountain Fire currently burning in Ouray County, north of the City of Ouray. We want to assure residents and visitors that the Gold Mountain Fire does not pose a direct threat to the Town of Telluride at this time.",
    href: "http://ouraycountyco.gov",
    img: ""
  },
  {
    title: "Stage 2 Fire Restrictions In Effect",
    source: "Town of Telluride",
    date: "June 26, 2026",
    newsTopic: "public-safety",
    copy: "In response to increasing fire danger across the region, the Town of Telluride will implement Stage 2 Fire Restrictions effective at 12:01 a.m. MT on Friday, June 26, 2026.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=67",
    img: ""
  },
  {
    title: "Gold Mountain Fire Update",
    source: "Town of Ridgway",
    date: "July 2, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/FINAL-MediaRelDalyUpdate_20260702_00009911.pdf",
    img: ""
  },
  {
    title: "Updates from the Town of Ridgway in light of the Gold Mountain Fire",
    source: "Town of Ridgway",
    date: "July 1, 2026",
    firstSeen: "2026-07-02",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Updates-from-the-Town-2026-07-01.pdf",
    img: ""
  },
  {
    title: "Gold Mountain Fire Update",
    source: "Town of Ridgway",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/GMFiewMediaRelDalyUpdate_20260701_0000991.pdf",
    img: ""
  },
  {
    title: "Gold Mountain Fire Perimeter Map",
    source: "Town of Ridgway",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/MAPpio_8x11_land_20260630_2130_GoldMountain_COGMF000099_0701day.pdf",
    img: ""
  },
  {
    title: "Gold Mountain Fire Update",
    source: "Town of Ridgway",
    date: "June 30, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Gold-Mtn-Fire-Update-2026-06-30.pdf",
    img: ""
  },
  {
    title: "Gold Mountain Fire Perimeter Map",
    source: "Town of Ridgway",
    date: "June 30, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/pio_8x11_land_20260630.pdf",
    img: ""
  },
  {
    title: "Gold Mountain Fire Update",
    source: "Town of Ridgway",
    date: "June 29, 2026",
    firstSeen: "2026-06-30",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Gold-Mtn-Fire-Update-2026-06-29.pdf",
    img: ""
  },
  {
    title: "Stage 2 Fire Restrictions Implemented in Ridgway",
    source: "Town of Ridgway",
    date: "June 28, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Stage-2-Fire-Restrictions-press-release-2026-06-28.pdf",
    img: ""
  },
  {
    title: "Finding of the Town Manager Enacting Town Wide Fire Ban",
    source: "Town of Ridgway",
    date: "June 28, 2026",
    firstSeen: "2026-06-29",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Wide-Fire-Ban---Stage-2-Restrictions---June-28%2C-2026---signed.pdf",
    img: ""
  },
  {
    title: "Update on Gold Mountain Fire in Ouray County - June 28, 2026, 12:23pm",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/News-Release_-June-28-Gold-Mountain-Fire-Update.pdf",
    img: ""
  },
  {
    title: "Update on Gold Mountain Fire in Ouray County - June 28, 2026, 1:45 a.m.",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-28",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/News-Release_-Gold-Mountain-Fire---Google-Docs.pdf",
    img: ""
  },
  {
    title: "Movie Mondays 8:30pm in Hartwell Park",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "arts-culture",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Movie-Mondays-Poster-2026.pdf",
    img: ""
  },
  {
    title: "Town of Ridgway 2026 Drinking Water Quality Report Covering Data for Calendar Year 2025",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "infrastructure",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/RIDGWAY-TOWN-OF---CO0146676---2026-CCR.doc_0.pdf",
    img: ""
  },
  {
    title: "Planting Trees in Ridgway - Species Recommendations Brochure",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-24",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TreesToPlant%20Brochure%202021.pdf",
    img: ""
  },
  {
    title: "Ridgway Workforce &amp; Affordable Housing Committee Meeting Agenda",
    source: "Town of Ridgway",
    date: "July 8, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "housing",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/July-8-workforce-%26-affordable-housing-committee-agenda.pdf",
    img: ""
  },
  {
    title: "Ridgway Town Council Meeting Agenda",
    source: "Town of Ridgway",
    date: "July 8, 2026",
    firstSeen: "2026-07-03",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/July-8-tc-agenda.pdf",
    img: ""
  },
  {
    title: "Notice of Public Hearing - Application for Resubdivision - Hyde Subdivision Lots 1, 2, 3, 4 of Block 14 (847 and 845 Hyde Street)",
    source: "Town of Ridgway",
    date: "July 15, 2026",
    firstSeen: "2026-07-01",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.07.15_public-hearing-notice-PC.pdf",
    img: ""
  },
  {
    title: "Notice of Introduction - Ordinance No. 04-2026",
    source: "Town of Ridgway",
    date: "July 4, 2026",
    firstSeen: "2026-06-26",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ord-introduction-notice.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 7-2-26",
    source: "KOTO Community Radio",
    date: "July 3, 2026",
    newsTopic: "public-safety",
    copy: "A Gold Mountain Fire Update; Telluride Town Council Names Resident Advisory Committee; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-7-2-26/"
  },
  {
    title: "Newscast 7-1-26",
    source: "KOTO Community Radio",
    date: "July 2, 2026",
    newsTopic: "public-safety",
    copy: "A Gold Mountain Fire Update; Town Council Election Still in Flux; Telluride Community Survey Shows Areas for Improvement",
    href: "https://koto.org/news/newscast-7-1-26/"
  },
  {
    title: "Newscast 6-29-26",
    source: "KOTO Community Radio",
    date: "June 30, 2026",
    newsTopic: "public-safety",
    copy: "A Gold Mountain Fire Update; Coming Up Next, Telluride",
    href: "https://koto.org/news/newscast-6-29-26/"
  },
  {
    title: "Newscast 6-26-26",
    source: "KOTO Community Radio",
    date: "June 27, 2026",
    newsTopic: "land-use",
    copy: "On this week's Regional Roundup, we bring you voices from Pride celebrations across the Rocky Mountain West. We also hear about a new app that connects LGBTQIA+ community members with volunteer opportunities in Utah and beyond. As drought conditions persist across the region, Trout Unlimited is urging anglers to give stressed fish a break by reduci",
    href: "https://koto.org/news/newscast-6-26-26/"
  },
  {
    title: "Newscast 6-25-26",
    source: "KOTO Community Radio",
    date: "June 26, 2026",
    newsTopic: "recreation",
    copy: "West End Roundup with the San Miguel Basin Forum; Lions in the Mountains; Dwayne Romero Vies for Congress",
    href: "https://koto.org/news/newscast-6-25-26/"
  },
  {
    title: "Newscast 6-24-26",
    source: "KOTO Community Radio",
    date: "June 25, 2026",
    newsTopic: "community",
    copy: "Remembering a BF Deal; Bluegrass Needs a Rethink; The Battle for Truth",
    href: "https://koto.org/news/newscast-6-24-26/"
  },
  {
    title: "Newscast 6-22-26",
    source: "KOTO Community Radio",
    date: "June 23, 2026",
    newsTopic: "recreation",
    copy: "First Responders See Busy Weekend; Mountain Village Considers Ethics Code Changes",
    href: "https://koto.org/news/newscast-6-22-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "Remembering a BF Deal",
    source: "KOTO Community Radio",
    date: "June 25, 2026",
    newsTopic: "community",
    copy: "KOTO's founder Jim Bedford (aka BF Deal) passed away on June 20, 2026. A visionary and leader, he is remembered by those who loved him and leaves a legacy in the Telluride community.",
    href: "https://koto.org/news/remembering-jimbedford-bfdeal-koto-radio/"
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
    title: "It’s time to bake; annual dessert contest is July 11",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    dateSource: "article",
    newsTopic: "community",
    copy: "Katie Alexander, superintendent of the decades-old dessert contest, is getting ready for the big day July 11, a Saturday, kicking off the San Miguel Basin Fair. What used to be a pie contest for the …",
    href: "https://www.sanmiguelbasinforum.com/stories/its-time-to-bake-annual-dessert-contest-is-july-11,120634",
    img: ""
  },
  {
    title: "West End producers sell at Ridgway markets",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    dateSource: "article",
    newsTopic: "arts-culture",
    copy: "Every Friday morning, from May 22 to Oct. 16, Ridgway’s Hartwell Park is filled with vendors and buyers attending the local farmers market. As the market celebrates its 26th anniversary, it …",
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-producers-sell-at-ridgway-markets,120637",
    img: ""
  },
  {
    title: "Farmers market started; weekly Wild Gal’s meals back",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "June 17, 2026",
    firstSeen: "2026-06-17",
    dateSource: "article",
    newsTopic: "arts-culture",
    copy: "Galit Korngold, of the West End and who owns and operates Wild Gal’s Market in Naturita, told the Forum over the weekend that there are two big things the community should know about: the summer …",
    href: "https://www.sanmiguelbasinforum.com/stories/farmers-market-started-weekly-wild-gals-meals-back,118956",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260616-133534-461-F4%20-%20farmers%20mkt.jpeg"
  },
  {
    title: "Norwood native Wyatt Hughes summits Everest",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "June 10, 2026",
    firstSeen: "2026-06-10",
    dateSource: "article",
    newsTopic: "community",
    copy: "Wyatt Hughes, a Norwood native and the son of Howard Hughes, reached the top of Mount Everest May 28 at 12:30 p.m. How does the son of a western Colorado rancher, from a remote place like Norwood, …",
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-native-wyatt-hughes-summits-everest,118050",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260609-202440-699-F1%20-%20everest.JPG"
  },
  {
    title: "Bird offers home care support in West End",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "June 10, 2026",
    firstSeen: "2026-06-10",
    dateSource: "article",
    newsTopic: "health",
    copy: "Christina Bird, of Paradox, spent nearly 20 years as a licensed practical nurse (LPN), working in long-term health care facilities. Originally from Paradox, she left for a while, but moved back when …",
    href: "https://www.sanmiguelbasinforum.com/stories/bird-offers-home-care-support-in-west-end,118048",
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
    title: "West End Renaissance",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "July 1, 2026",
    summary: "The West End has weathered cattle, mining, timber, coal, and COVID -- the usual boom-bust pattern. Now broadband, airport upgrades, remote work, and the West End Vision Project are pointing toward a more diversified local economy. WEEDC is searching for a new executive director at what looks like a pivotal moment.",
    href: "https://www.telluridenews.com/norwood_post/article_64d52a82-dfcd-41c1-8ad7-17356b158ae9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/49/249a2e22-e7f8-4e77-842d-ef742134e68b/6a4451d589a77.image.jpg",
    category: "Community",
    featured: true
  },
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
    letterAuthor: "Kate Fedack"
  }
];

const BLOG_POSTS = [
  {
    title: "Weekend Update July 2",
    date: "Jul 2, 2026",
    href: "https://mailchi.mp/8bef8f98c535/weekend-update-july-2",
    image: "https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png",
    excerpt: "Livable Telluride &#183; Weekend Outlook The Weekend Outlook July 3 - July 5, 2026 &#128197; The Weekend Outlook \"It's Fourth of July weekend and many communities in the region will be offering free family fun. Wherever you land, please check in with the local jurisdiction for the latest fire restrictions. Telluride will kick off Saturday morning with the Rundola first thing followed by the longes",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "When the Town Judges Its Own Projects",
    date: "Jun 30, 2026",
    href: "https://mailchi.mp/42e61aa77a19/when-the-town-judges-its-own-projects",
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/234a1ccb-fc9c-7aab-8d5f-dab36d775b79.png",
    excerpt: "96 When the Town Judges Its Own Projects Apparently, our little newsletter has made a ripple. Possibly even a wave! ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ",
    category: "Newsletter",
    source: "mailchimp"
  },
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
    title: "Science of Cocktails",
    date: "2026-07-08",
    time: "5:00 PM – 8:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "A crowd pleaser for more than 15 years attracting those from near and far, the Science of Cocktails is Pinhead’s not-to-be-missed annual fundraiser. Held every July, the event combines intriguing experiments with density, sublimation, acoustic integration, and even comestible colloids with the finest in Telluride’s craft mixology scene.\nAll proceeds go to Pinhead Institute Programming.",
    link: "https://telluridescience.org/event/science-of-cocktails-2/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/06/SOC2026_V1.0_webbanner_1700x800.jpg",
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
    title: "Telluride Foundation Rundola: Run for Good",
    link: "https://koto.org/event/telluride-foundation-rundola-run-for-good/",
    description: "Celebrate Independence Day with the Telluride Foundation at the 16th Annual Rundola on July 4th, 2026! This exciting uphill foot race supports the Good Neighbor Fund, which offers emergency financial assistance for local individuals and families in crisis—helping with housing, transportation, medical expenses, and more. The Rundola is family friendly and open to all—whether you’re a seasoned runner, a casual hiker, or just looking for a fun holiday challenge. The race kicks off at 7:30 a.m. at the base of the Gondola in Telluride and climbs to the top of San Sophia Ridge via Telluride Trail. Top finishers in each category and leading fundraisers will receive medals + prizes, and every participant gets a custom Rundola t-shirt.",
    pubDate: "2026-07-04T13:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/rundola26_2200x1237-scaled.jpg"
  },
  {
    title: "Telluride 4th of July Parade",
    link: "https://koto.org/event/telluride-4th-of-july-parade/",
    description: "Parade Info The Parade starts at 11 a.m. and runs eastward down Main Street. There will be a fighter jet fly by. It is usually at 11 a.m. but last year it was at noon. Time is to be determined by the jet people. We LOVE water guns and super soakers but please NO water balloons Nothing that creates trash. This goes for floats and spectators. If participating in water activities – do not spray babies, older folks, classic cars and anyone with a camera. It is best to only engage with other people with water. Please make sure children stay behind the white line for their safety. Parade Registration All are welcome to participate in the parade! Register at tridejuly4parade.org before 5 p.m. on Friday July 3rd. Late entries are welcome but not eligible for judging. Please make sure to use patriotic decorations. …",
    pubDate: "2026-07-04T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-07-04/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-07-05T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "Pickleball Open Play",
    link: "https://koto.org/event/pickleball-open-play/2026-07-05/",
    description: "Weekly Round Robins Eligibility: Must be rated 2.5+. Requirements: Players should know the rules, scoring, and basic strategy of tennis. Format: Fun, competitive matches with rotating partners each session. Minimum Players: A minimum of 4 players is required for the class to run.",
    pubDate: "2026-07-05T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "5th of July picnic with the San Miguel County Democrats in Telluride Town Park",
    link: "https://koto.org/event/5th-of-july-picnic-with-the-san-miguel-county-democrats-in-telluride-town-park/",
    description: "The San Miguel County Democrats invite the public to a picnic on July 5 from 10:30-2 at Telluride Town Park to celebrate and defend 250 years of America's democracy. Food and drinks provided.",
    pubDate: "2026-07-05T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristen-milord-2/2026-07-05/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-07-05T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/gentle-yoga-kristen.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-07-05/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-07-05T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-07-05/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-07-05T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-06/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-06T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Savvy Seniors",
    link: "https://koto.org/event/savvy-seniors/",
    description: "Join us every Monday for \"Savvy Seniors,\" an exciting and interactive class designed for senior citizens who are curious about the world around them! This unique program goes beyond basic tech lessons to explore a wide range of engaging topics, including science, technology, environmental awareness, art, and music. Each session features a guest expert who will guide participants through fun, hands-on activities—from planting your own herbs to creating art, experimenting with science, and even exploring the therapeutic power of music. Whether you’re looking to enhance your tech skills, discover new hobbies, or simply enjoy stimulating conversations with peers, this class has something for everyone.",
    pubDate: "2026-07-06T19:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Birding with Katie Triest at Patagonia Telluride , July 6 and 7",
    link: "https://koto.org/event/birding-with-katie-triest-at-patagonia-telluride-july-6-and-7/2026-07-06/",
    description: "On July 6, join us for an evening of bird education and discussion led by local birder, Katie Triest at 5 pm at Patagonia Telluride. Join us again, on July 7 at 8:30 am in front of the Patagonia Telluride store for a bird walk with Katie. Please bring binoculars if you have them. If you don't, they will be provided. Please sign up at Patagonia Telluride or scan the QR code on flyers posted around town. Walk is limited to 12 participants.",
    pubDate: "2026-07-06T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, Telluride Retail",
    imageUrl: ""
  },
  {
    title: "Pie Contest",
    link: "https://koto.org/event/pie-contest/",
    description: "Our beloved tradition returns! Calling all pie enthusiasts! The Wilkinson Public Library is hosting its annual Pie Contest on Monday, July 6th! This delicious competition is open to bakers of all ages. Show off your skills and vie for bragging rights and a litany of prizes! Our panel of esteemed judges will decide the fate of your flaky masterpiece, based on appearance, creativity, and of course, taste. Register in advance",
    pubDate: "2026-07-07T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Pie-Contest-4.png"
  },
  {
    title: "Birding with Katie Triest at Patagonia Telluride , July 6 and 7",
    link: "https://koto.org/event/birding-with-katie-triest-at-patagonia-telluride-july-6-and-7/2026-07-07/",
    description: "On July 6, join us for an evening of bird education and discussion led by local birder, Katie Triest at 5 pm at Patagonia Telluride. Join us again, on July 7 at 8:30 am in front of the Patagonia Telluride store for a bird walk with Katie. Please bring binoculars if you have them. If you don't, they will be provided. Please sign up at Patagonia Telluride or scan the QR code on flyers posted around town. Walk is limited to 12 participants.",
    pubDate: "2026-07-07T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, Telluride Retail",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-07/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-07T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pup Meet Up- Gondola Plaza",
    link: "https://koto.org/event/pup-meet-up-gondola-plaza/",
    description: "Get ready to unleash the fun at our Pup Meetup! 🐶 Join us at the Gondola Plaza by the Coffee Cowboy Cart for a tail-wagging good time that’s sure to leave both you and your furry friend feeling pawsitively delighted. Make sure to stick around for the raffle with prizes from local pet stores and free pup cups from the Coffee Cowboy! Marney Prince with My Pup's Remedy will be there with free treats for your furry friend as well! With the Wilkinson Public Library, anything is PAW-sible. Who knows&#8230;you may even make some new FUR-ever friends!",
    pubDate: "2026-07-07T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Gondola Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Bardic Trails Online Poetry Night",
    link: "https://koto.org/event/bardic-trails-online-poetry-night-3/2026-07-07/",
    description: "The Telluride Institute's Bardic Trails poetry night features an award-winning guest poet sharing their new and exciting work. The reading will be followed with a Q & A about the poet’s work and inspirations, with time afterwards for poetry sharing from attendees – a Gourd Circle of sharing whatever poetry attendees wish, or just listening in. The list of 2026 poets is below. The free Bardic Trails virtual Zoom series is on the first Tuesday of each month. Visit to get the zoom link each month, Thanks to the Wilkinson Public Library, Cantor Family, the Guttman Family Foundation, CCAASE and our Fischer and Cantor contest participants for supporting our program and projects. Jan. 6 / Euro-American poet Dane Cervine of California Feb. …",
    pubDate: "2026-07-08T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/03/Bardic-Trails-2026.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-08/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-08T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-07-08/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-07-08T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Lite Lunch- Go Gentle",
    link: "https://koto.org/event/lite-lunch-go-gentle/",
    description: "The New York Times bestselling author of Where'd You Go, Bernadette returns to form in her most exuberant and life-affirming novel yet with the story of one woman’s cheerful determination to live a life of the mind only to have the heart force its way in. Adora Hazzard has it all figured out. A Stoic philosopher and divorcée, she lives a contented life on New York City’s Upper West Side. Having discovered that the secret to happiness is to desire only what you have, she’s applied this insight to blissful effect: relishing her teenage daughter, the freedom of being solo, and her job as a moral tutor for the twin boys of an old-money family. She’s even assembled a \"coven\"—like-minded women who live on the same floor in the legendary Ansonia—and is making active efforts to grow its membership. …",
    pubDate: "2026-07-08T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-07-08/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-07-08T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-07-08/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-07-08T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/sewing.jpg"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-07-08/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-07-08T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Science of Cocktails",
    link: "https://koto.org/event/science-of-cocktails/",
    description: "A crowd pleaser for more than 15 years attracting those from near and far, the Science of Cocktails is Pinhead’s not-to-be-missed annual fundraiser. Tthe event combines intriguing experiments with density, sublimation, acoustic integration, and even comestible colloids with the finest in Telluride’s craft mixology scene. July 8, 5-8pm at The Telluride Science & Innovation Center Adults 21+",
    pubDate: "2026-07-08T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Science &#038; Innovation Center, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/SOC2026_V1.0_Instagram45-1.png"
  },
  {
    title: "Sound Bath with Danielle & Ian",
    link: "https://koto.org/event/sound-bath-with-danielle-ian/",
    description: "Join us for an hour of traveling through sound and the inner self! In this once a month community event, we are healing the body and auric field with a multitude of sound frequencies. Chimes, 432hz quartz singing bowls, crystal tuning pyramids, rain drums, GALORE! We will also be holding space for group conversation, weaving through topics of spirituality. Bring a blanket, yoga mat, water bottle, journal, and your psycho-spiritual discussion hat! After each sound bath, we will be sticking around for group discussion for a duration of 30 – 40 minutes. Each month will have a different psycho-spiritual topic, and will offer tools to integrate these themes into our daily lives.",
    pubDate: "2026-07-08T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Yoga with Miriah",
    link: "https://koto.org/event/yoga-with-miriah/",
    description: "Yin Yang yoga is a combination of Vinyasa Flow (yang) incorporating Hatha and Kundalini with Yin Restorative poses. We'll be warming up with some movement and Vinyasa flow and settle into longer yin restorative poses. Best of both worlds. Bring your own mat if you can; the library has a limited supply. This class is free and open to the public of all skill levels. Donations to the instructor are welcome.",
    pubDate: "2026-07-09T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Community Support w/TCHN",
    link: "https://koto.org/event/community-support-w-tchn/",
    description: "Do you need help applying for public assistance programs? Ruth from Tri-County Health Network will provide guidance with filling out applications for SNAP, the Good Neighbor Fund, the Behavioral Health Fund, Medicaid, and can provide support in guiding you towards other helpful community resources. This will be held in Meeting Room #5 on the 2nd Thursday of the month from 9am-12pm. Advance registration is encouraged. ¿Necesita ayuda para solicitar programas de asistencia pública? Ruth, de Tri-County Health Network, brindará orientación para completar solicitudes de SNAP, el Fondo Good Neighbor, el Fondo de Salud Mental, Medicaid, y también puede apoyarle para conectarse con otros recursos comunitarios. Se llevará a cabo en la Sala de reuniones #5 el segundo jueves de cada mes, de 9 a.m. a 12 p.m. Se recomienda registrarse con anticipación. Por favor, envíe un correo electrónico a tosborne@telluridelibrary.org si necesita servicios de traducción.",
    pubDate: "2026-07-09T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-09/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-09T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-07-09/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-07-09T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Booze and Books at Liz",
    link: "https://koto.org/event/booze-and-books-at-liz/",
    description: "Sip on a libation while chatting with other bibliophiles about books you have read recently. It's totally open ended and open to everyone! 5:15 the second Thursday of every month. The library will get some apps for the table; you purchase your own beverage. Please sign up in advance. Meet at Liz at 200 W. Colorado Ave. in Telluride. (Entrance is on Fir St.)",
    pubDate: "2026-07-09T23:15:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Liz, Telluride",
    imageUrl: ""
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-07-09/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-07-09T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "“The Mountain Ark” Screening in Norwood at The Livery!",
    link: "https://koto.org/event/the-mountain-ark-screening-in-norwood-at-the-livery/",
    description: "If you missed the screenings in Telluride, there's one more chance to see \"The Mountain Ark\" in the County: at The Livery in Norwood on Thursday, July 9th, at 7pm, with filmmaker Ken Bailey in-person. The film is a tribute to Lissa Margetts and her beloved wildlife rehabilitation center on Wilson Mesa. Bring your personal Ark stories to share! Tickets at the door are $5 / $2 for kids under 12.",
    pubDate: "2026-07-10T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Livery Norwood",
    imageUrl: ""
  },
  {
    title: "Yoga For All with Jay and Jane",
    link: "https://koto.org/event/yoga-for-all-with-jay-and-jane/2026-07-10/",
    description: "Join local instructors Jane del Piero and Jay Holt for a weekly class centered on deep breath work, gentle flow, and energizing chakral movement. Jane and Jay are the owners of local acupuncture, massage, and sound healing practice Luv Light. Donations are accepted. All bodies welcome.",
    pubDate: "2026-07-10T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/wellness-lineup-18.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-10/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-10T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-07-10/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-07-10T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-07-10/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-07-10T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-07-10/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-07-10T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Free Youth Tennis & Pickleball Program",
    link: "https://koto.org/event/free-youth-tennis-pickleball-program-2/2026-07-10/",
    description: "Community Tennis & Pickleball Program This program is available for children ages 8 – 16 to receive free tennis instruction from trained and certified coaches at the Telluride Racquet Club. Goal: This program is designed to reach those who may not be able to participate due to financial constraints. Inclusivity: No one will be turned away based on their ability to pay. No Membership Required. Demo equipment is available at no charge for use during this clinic.",
    pubDate: "2026-07-10T21:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mauritson Wine Dinner",
    link: "https://koto.org/event/mauritson-wine-dinner/",
    description: "Join sixth-generation Sonoma winemaker Clay Mauritson for an intimate evening at Madeline Hotel & Residences. For more than 150 years, the Mauritson family has cultivated the rugged landscape of Sonoma's Dry Creek Valley, building a legacy rooted in stewardship, perseverance, and a deep connection to the land. This special evening begins with a private reception in Falcon Room, followed by a multi-course dinner in Timber Room thoughtfully paired with wines from Mauritson Wines and Loam Vineyards. Throughout the experience, Clay will share rare library selections, limited-production releases, and the stories behind the vineyards that have shaped his family's winemaking journey across six generations. Guests will gain a deeper understanding of the people, places, and soils that define Sonoma's distinctive character while enjoying a menu crafted to complement each wine's unique expression. Friday, July 10th Reception in Falcon Room | 6:00 PM Dinner in Timber Room | 7:00 PM",
    pubDate: "2026-07-11T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hotel Madeline, Mountain Village",
    imageUrl: ""
  },
  {
    title: "2nd annual Dark Sky Disc Golf in Norwood!",
    link: "https://koto.org/event/2nd-annual-dark-sky-disc-golf-in-norwood/",
    description: "Norwood Park & Rec, Wright's Mesa Disc Golf, and Norwood Dark Sky Advocates present the 2nd annual night of Dark Sky Disc Golf on Friday, July 10th, on the NEW course in downtown Norwood. Sunset gather is at 8:25pm, play begins at 9pm. Baskets will be a-glow and LED lights provided for discs. Plus refreshments, music, and telescopes! Access via western gate on County Road 42Z. More info at norwoodparkandrec.org .",
    pubDate: "2026-07-11T02:25:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Tom Gullikson Tennis Camp",
    link: "https://koto.org/event/tom-gullikson-tennis-camp/2026-07-11/",
    description: "Camp Pro-staff: Eric Fey, Tom Gullikson, Eric Alexon, and a Guest Professional Session One | July 11 & 12 | 9:00am – 12:00pm Session Two | July 18 & 19 | 9:00am – 12:00pm Tom is a decorated Tennis coach and playing professional. Come out and enjoy some of the best coaching in the country! Ranked #34 in singles and #4 in doubles US Open Mixed Doubles Champion 1984 Wimbledon Men's Doubles Runner- up 1983 US Open Men's Doubles Semi-Finalist 1982 Australian Open Men's Doubles Semi-Finalist 1983 Coach of Pete Sampras, Todd Martin, Andy Roddick, and Jennifer Capriati Former US Davis Cup Captain 1994 – 1999. Coached the US Davis Cup team to victory in 1995! Olympic Coach for the US team for the Atlanta Olympics when Andre Agassi won his Olympic gold medal! Please sign up on the TRC app or reach out to tellurideracquetclub@gmail.com",
    pubDate: "2026-07-11T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/IMG_5733.png"
  },
  {
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-07-11/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-07-11T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Meet the Winemaker Hike with Clay Mauritson",
    link: "https://koto.org/event/meet-the-winemaker-hike-with-clay-mauritson/",
    description: "Join sixth-generation Sonoma farmer and winemaker Clay Mauritson for an intimate alpine adventure through Telluride's spectacular landscape. Limited to just eight guests, this exclusive experience offers a rare opportunity to explore the mountains alongside a steward of one of California's most storied agricultural legacies. For more than 150 years, the Mauritson family has farmed the rugged terrain of Sonoma's Dry Creek Valley, cultivating a deep respect for the land that continues to shape Clay's approach to winemaking today. Together, guests will travel via gondola into Telluride before setting out on a guided hike to Bear Creek Falls, where conversations unfold against a backdrop of soaring peaks, alpine forests, and rushing waterfalls. Along the way, Clay will share stories of family, farming, and the enduring connection between place and craft. …",
    pubDate: "2026-07-11T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Bear Creek Trail, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/Rockpile-bottle-at-Mauritson-Winery.-Photo-credit-King-Lawrence-1-scaled.jpg"
  }
];

const WILKINSON_EVENTS = [

];

// Bot-managed by scripts/content-refresh.js Task 7 (syncHumaneSocietyAnimals).
// Currently empty: every animal the THS Shelterluv feed lists right now is
// either pending adoption ("ADOPTION PENDING! …") or pre-weaning/photoless,
// none of which are advertised as adoptable. The sync filters those out, so
// this repopulates automatically when THS posts genuinely-available pets.
const HUMANE_SOCIETY_ANIMALS = [
  {
    id: "TEL-A-190",
    name: "Peppa",
    species: "Dog",
    breed: "Poodle, Miniature / Schnauzer",
    ageGroup: "Adult Dog",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/c90348512d680b41160e384fc81688da/b549acbd39f70efb5528d5ad45a7cfcf.png",
    profileUrl: "https://www.shelterluv.com/embed/animal/214040349",
    summary: "Adult Dog • Poodle, Miniature / Schnauzer • Female",
    firstSeen: "2026-07-04",
    revealDate: "2026-07-04",
    lastSeen: "2026-07-04"
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
    description: "The B-Side Players make music without borders or boundar...",
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
    title: "Jake Manzi",
    link: "https://www.alibitelluride.com/calendar#eca-event=jake-manzi-1",
    description: "Jake Manzi has been on a journey, and he's ready to tell you all about it. Raise...",
    pubDate: "2026-07-14",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/7c0521ce-1758-4260-90ef-4561e574893f/-/crop/2807x1403/0,441/-/preview/"
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
    description: "Telluride Mushroom Fest After Party",
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
    description: "Telluride Mushroom Fest Puff Ball After Party",
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
  },
  {
    title: "Big Blitz",
    link: "https://www.alibitelluride.com/calendar#eca-event=big-blitz",
    description: "Hailing from Pittsburgh, PA, Big Blitz combines dance, jazz, rock, and electroni...",
    pubDate: "2026-08-30",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/d2998c5f-69ce-4db7-bee5-9c0a3e1ded0c/-/crop/2048x1024/0,158/-/preview/"
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
  },
  {
    title: "23rd Annual Telluride Plein Air",
    link: "https://sheridanoperahouse.com/events/23rd-annual-telluride-plein-air-2/",
    description: "The 23rd Annual Telluride Plein Air is a longstanding outdoor painting event held in and around Telluride, bringing together artists who work directly from observation in the landscape. The Sheridan Opera House serves as a hub for the event, which celebrates the tradition of painting en plein air in the scenic mountain setting of Telluride.",
    pubDate: "2026-07-01",
    endDate: "2026-07-05",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/Vios-Richie-Rainy-Day-in-Telluride-90-mins.-QuickDraw-8x10-Watercolor-800.webp"
  },
  {
    title: "Telluride Venture Network's Pitch Day",
    link: "https://sheridanoperahouse.com/events/telluride-venture-networks-pitch-day/",
    description: "Telluride Venture Network's Pitch Day is a startup pitch competition event held at the Sheridan Opera House, bringing together entrepreneurs and investors in the Telluride community. Local and regional founders present their business concepts to a panel in a live, public forum setting.",
    pubDate: "2026-07-01",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/06/Telluride-Venture-Network-.png"
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
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests.",
    pubDate: "2026-03-12T12:00:00.000Z",
    endDate: "2027-02-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
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
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://www.zeffy.com/en-US/ticketing/emma-kalf-bob-ross-painting-classes",
    description: "Happy Little Trees: Classes @ the Wright WHEN? Classes at 10:30 am WHERE? Wright Community Room Wright Opera House 472 Main St. Ouray, Colorado TICKETS: $55 Per Class (All supplies are included + coffee!) ABOUT THE CLASS Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. …",
    pubDate: "2026-04-11T12:00:00.000Z",
    endDate: "2026-12-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52373044220947/huge/1d3e4ebb5835fbe0ed89bf2b3588d8e41db8f444.jpg"
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
    title: "Parks and Recreation Committee (PARC)",
    link: "https://cityofouray.com/city_offices/committees___boards/parks_and_recreation_committee.php",
    description: "The Parks and Recreation Committee (PARC) is made up of community members who volunteer their time to support and enhance recreational opportunities in Ouray. PARC organizes safe, family-friendly events that bring the community together. Events include Broomball, Cabin Fever Days, Dodgeball, Softball, and Game Night, among others. The committee works closely with local organizations, businesses, and other City committees to carry out its mission. Community partners include the Ouray Hot Springs Pool & Fitness Center, the Beautification Committee, and the Ouray School District. PARC also plays an important role in developing and implementing master plans for the City’s park system, helping ensure that Ouray’s parks and recreational spaces serve residents and visitors for years to come. Members of the public are welcome to attend these meetings. Meetings: PARC meets monthly on the first Tuesday at 6:00 p.m. …",
    pubDate: "2026-05-05T12:00:00.000Z",
    endDate: "2027-04-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Dallas Park Cemetery Tour",
    link: "https://www.ouraycountyhistoricalsociety.org",
    description: "Tour of Dallas Park Cemetery Tour, led by Coleen McElroy. $20.00 Per Person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay",
    pubDate: "2026-05-09T12:00:00.000Z",
    endDate: "2026-10-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Dallas Park Cemetery ",
    imageUrl: "https://localist-images.azureedge.net/photos/52462667793124/huge/857907efd93056a1ba298d906bd6d5231a5f9d13.jpg"
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
    title: "Swimming Classes for Kids",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search?activity_select_param=2&viewMode=list",
    description: "The Ouray Hot Springs summer swim lesson program is a fun and supportive way for kids to build confidence in the water. Two-week sessions run through the summer from June 1 through Aug. 6. Details: ✔️ Classes meet Monday–Thursday for 30 minutes each day ✔️ 8 classes per session ✔️ $45 per session (that’s less than $6 per class!) ✔️ Pool entry during class period included Class Options: Parent Tots: (Under 3 with an adult) Level 1: Beginner Skills (Ages 3+) Level 2: Intermediate Skills (All Ages) Level 3: Advanced Skills (All Ages) 📅 You can register at tinyurl.com/ourayactivities! Registration for each session closes the Friday before the session begins. Questions? Contact our Swim Safety Coordinator at 970-325-3009 or JWyatt@CityofOuray.com.",
    pubDate: "2026-06-01T12:00:00.000Z",
    endDate: "2026-07-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52806871795839/huge/2b4a1f1e03bf8526d92866007630f4a159e579d5.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/860fbc87ce3cc92e25c09e723732d04292df18ba.jpg"
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
    title: "On Display: The 610 Arts Annual Photography Invitational ~ featuring works by Gary Slane & Eric Phillips",
    link: "https://sherbino.org/event/opening-reception-for-the-610-arts-annual-photography-invitational-featuring-works-by-gary-slane-eric-phillips/",
    description: "Photography Invitational featuring Gary Slane and Eric Phillips On display July 1 – August 28, 2026 Artist Reception: Friday, July 10 | 5:00–7:00 PM | Free! The 610 Arts Collective is pleased to present the Photography Invitational, featuring the work of Gary Slane of Montrose and Eric Phillips of Colorado’s Gunnison Valley. This special exhibition showcases two accomplished photographers whose distinct artistic perspectives celebrate the beauty, power, and wonder of the natural world. Join us for an Artist Reception on Friday, July 10, from 5:00–7:00 PM, where guests will have the opportunity to meet the artists, learn about their creative processes, and enjoy an evening surrounded by extraordinary imagery from across the American West and beyond. Gary Slane Montrose photographer Gary Slane has devoted years to capturing breathtaking landscapes, wildlife, and night skies throughout North America. …",
    pubDate: "2026-07-01T12:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53311891403836/huge/5ed79c16e243d3edcc6923539da943575df4cc1b.jpg"
  },
  {
    title: "Ridgway Concert Series",
    link: "https://pickinproductions.com/upcomingshows",
    description: "The Town of Ridgway & Pickin’ Productions Present THE 19TH ANNUAL 2026 RIDGWAY CONCERT SERIES FOOD - VENDORS - BEER - WINE & MARGARITAS JULY 2 LEVI PLATERO Shelby Means JULY 9 BLACK UHURU Psylo JULY 16 SAM GRISMAN PROJECT Tanasi JULY 23 DOGS IN A PILE Felix Y Los Gatos JULY 30 THE RUMBLE Ft. Chief Joseph Boudreaux Jr. Handmade Moments No Dogs or Outside Alcohol Permitted SPONSORS Ridgway Real Estate – Alpine Bank – Chipeta Lodge Resort & Space- Orvis Hot Springs – Julie & Dave Duff – Bennett Forgeworks- OAK – Billings Artwork – Todd W. Hoffman Foundation- The Market at Ridgway – Fiddlers Green – KVNF Public Radio – Alpine Edge Engineering - Alt Space Coworking- Vacation Rental Collective For More Information, Please Visit: www.pickinproductions.com",
    pubDate: "2026-07-02T12:00:00.000Z",
    endDate: "2026-07-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52696447609647/huge/b28c8601f5e3e0db939bf8de5f0e8929fe11dc2b.jpg"
  },
  {
    title: "Ouray Elks #492 Bloody Mary Bar",
    link: "https://events.ourayridgwayevents.com/event/ouray-elks-492-bloody-mary-bar",
    description: "Come join us for our famous annual Bloody Mary Bar! Cost is $15 for the Bloody Mary and other drinks will be available. OPEN TO THE PUBLIC!",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53312647689044/huge/046d1fcd91c6004a723578f64cbea2f7db87bf2b.jpg"
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
    title: "Ouray Elks #492 BBQ",
    link: "https://events.ourayridgwayevents.com/event/ouray-elks-492-bbq",
    description: "Come and grab your BBQ plate on 4th of July! Includes pulled pork sandwich and sides for $15. This will be available outside in front of the lodge starting around 10:30am!",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53312694813185/huge/1e4e38037b91768ebc225c5c6540f4d8d5332ed8.jpg"
  },
  {
    title: "Fourth of July Tavern Open House: Drunk History Tours @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "Fourth of July Tavern Open House: Drunk History Tours @ the Wright WHEN? Saturday, July 4 Tavern Open: 11:00 am – after the parade WHERE? Wright Opera House Tavern 472 Main St. Ouray, Colorado ABOUT THE EVENT Step into the Wright Tavern this Fourth of July and meet a few of the forgotten friends, colorful characters, and questionable legends woven into the history of the Wright Opera House. Throughout the day, guests can join Drunk History Tours led by none other than Letitia Wright or Alewife Addie, two spirited guides with a talent for storytelling and perhaps a flexible relationship with historical restraint. These lively tours shine a lantern on the strange, true, and unexpectedly entertaining stories hidden within the walls of one of Ouray’s most historic buildings. Expect frontier personalities, local lore, forgotten characters, and a few delightful detours along the way. …",
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
    title: "4th of July Karaoke 7:00pm",
    link: "https://events.ourayridgwayevents.com/event/4th-of-july-karaoke-700pm",
    description: "OPEN TO THE PUBLIC Every 4th of July we invite the community to join us for a free karaoke night. Singing starts at 7:00, but the bar is open much earlier!",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53312742009387/huge/e1825f1fc05b2829c70dc8011622c5e1195b4fa2.jpg"
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
    title: "Funky Ouray: Reggae music in Fellin Park",
    link: "https://events.ourayridgwayevents.com/event/funky-ouray-reggae-music-in-fellin-park",
    description: "Join us in Fellin Park every Sunday in July for Funky Ouray, a free, all-ages reggae DJ set hosted by Night Nurse Sound System. Bring a blanket, gather your friends, and kick back to reggae rhythms.",
    pubDate: "2026-07-05T12:00:00.000Z",
    endDate: "2026-07-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53251675055630/huge/fc4164d9a73f0015ccaf172c2b42758b02fab547.jpg"
  },
  {
    title: "On Display: Roots & Rhythms",
    link: "https://events.ourayridgwayevents.com/event/roots-and-rhythms-opening-night-with-live-music-and-demo",
    description: "Roots & Rhythms is a collaborative exhibition featuring mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Through layered textures, organic forms, and expressive movement, the exhibition explores the connection between memory and transformation—rooted in what came before, flowing toward what is possible. Where memory surfaces, movement unfolds, and forms emerge. The exhibition will remain on view July 3–August 4, with gallery hours Monday–Wednesday and Friday, 9 a.m.–4 p.m.",
    pubDate: "2026-07-06T12:00:00.000Z",
    endDate: "2026-08-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create",
    imageUrl: "https://localist-images.azureedge.net/photos/53268350844000/huge/c0c6f24f89c138a1d24652048a4c0c00ddd32f68.jpg"
  },
  {
    title: "Opening Reception: Roots & Rhythms @ Ridgway's Frist Friday Art Walk",
    link: "https://events.ourayridgwayevents.com/event/copy-of-on-display-roots-rhythms",
    description: "Here's a polished calendar description focused on the opening reception while capturing the details from the poster: Join us for the opening reception of Roots & Rhythms, a collaborative exhibition featuring mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Rooted in what came before and flowing toward what is possible, the exhibition explores memory, movement, and transformation through layered textures, organic forms, and expressive craftsmanship. Celebrate the opening during Ridgway's First Friday Art Walk with: Live music by Tibone A live steam-bending demonstration Meet-the-artist opportunities Complimentary refreshments The exhibition will remain on view July 3–August 4 during regular gallery hours (Monday–Wednesday and Friday, 9 a.m.–4 p.m.). Come experience an evening of art, conversation, and creativity in the heart of Ridgway.",
    pubDate: "2026-07-06T12:00:00.000Z",
    endDate: "2026-08-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create",
    imageUrl: "https://localist-images.azureedge.net/photos/53321591214673/huge/1e676b7f1743ef4737a6611d181ff63c6cb11505.jpg"
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
  },
  {
    title: "Ouray Youth Summer Programs: Rock Climbing",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search/detail/340?onlineSiteId=0&from_original_cui=true",
    description: "Participants will learn to rock climb or get to experience more challenging rock climbs with instruction from a local guide service. The guide service will provide all technical equipment including helmets, harnesses, and shoes. Please bring appropriate clothes for the day, sun protection, water, and snacks. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com",
    pubDate: "2026-07-07T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52994950182035/huge/cd7de10752ab32dcb54e1001e4d01b26ce8b716a.jpg"
  },
  {
    title: "RED MOUNTAIN REVIVAL",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-07-07T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Covenhoven - Live at The Courtyard at 610",
    link: "https://sherbino.org/event/covenhoven-courtyard-at-610-july-7-ridgway/",
    description: "Doors: 7 || Show: 7:30 || $20 advance / $24 day of || General Admission Seating || Limited Bar onsite || enter via the alleyway behind the Sherbino and the 610 Arts Collective Gallery Covenhoven is the internationally recognized indie-folk project of Colorado singer-songwriter Joel Van Horne, whose layered acoustic arrangements, rich harmonies, reedy baritone, and soaring falsetto have captivated audiences and critics alike since 2013. Through five full-length albums and two EPs, Covenhoven has crafted a signature sound that blends intimate folk songwriting with sweeping orchestral textures and atmospheric Americana. His songs balance hard-won wisdom with the beauty and hope found in the natural world — drawing inspiration from the landscapes of Colorado, Big Sur, and the American West. Covenhoven’s newest release, The Color of the Dark (2025), has already received widespread acclaim. …",
    pubDate: "2026-07-07T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52993910590740/huge/ee591be41df7dce6d2bdb9e84e37d1b1ae810587.jpg"
  },
  {
    title: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz : “Exploring Lower Black Bear Pass”",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Different elevations and habitats provide opportunities to view a wide variety of Colorado’s native plants and wildflowers. Ridgway writer and Colorado Native Plant Master Mary Menz and Jaime Pisarowicz will share their extensive plant knowledge and excitement for the area with you. Special guest and fellow NPM Sandra Dick will also join the group as a guide! Registration includes a copy of their book Common Wildflowers of the San Juan Mountains ($49) or Wildflowers of Colorado’s Western Slope ($69). All groups are limited to 12 participants. Participants will meet and carpooling is recommended (we help facilitate this effort at the meet up location)—specific directions and more information will be provided via email prior to the event. A waiver needs to be signed before the event. Please do so here Please check your email the evening before class for any unexpected cancellations or weather-related updates. …",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Location Disclosed after Registration ",
    imageUrl: "https://localist-images.azureedge.net/photos/53073706225439/huge/7ca2ac43b5dfe7097ca5e25b50578698e2badcb0.jpg"
  },
  {
    title: "July Film Club: Faces Places",
    link: "https://ouray.colibraries.org/lib-cal/",
    description: "Join our July Film Club! We will be watching and discussing \"Faces Places\" (2017), starting at 5:30 pm on Wednesday, July 8th. Please email programsouraypl@gmail.com for more information and for the location.",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53197072496149/huge/61d58f7a04d45b6160d170ddafbfba45141454d8.jpg"
  },
  {
    title: "BlacKkKlansman: CO-150 Film Festival @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "BlacKkKlansman: CO-150 Film Festival @ the Wright WHEN? Wednesday, July 8 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 15min RATING: R ROTTEN TOMATOES SCORE: 96% ABOUT THE FILM BlacKkKlansman (2018) tells the remarkable true story of Ron Stallworth, the first Black detective in the Colorado Springs Police Department, who infiltrates the Ku Klux Klan with the help of a fellow officer posing as him in person. Directed by Spike Lee, the film blends sharp humor, suspense, and social commentary while exploring racism, identity, and the enduring relevance of America’s past and present struggles. A bold and thought-provoking crime drama that balances tension, satire, and powerful historical reflection. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. Part of Movie Night @ the Wright, bringing film, community, and conversation to downtown Ouray since 1909.",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52931777161068/huge/6e18b842e960f4345690c291aa60d3caea7ecac4.jpg"
  },
  {
    title: "Live Music- Dave Jordan",
    link: "https://www.stelmohotel.com/summer-sound/dave-jordan",
    description: "Join us on Wednesday, July 8th as we welcome Dave Jordan. A New Orleans rooted singer-songwriter and bandleader with nearly three decades of American highways under his belt, Dave brings a sound that has been described as a swampy lovechild of Tom Petty, Dr. John, and John Prine. His music weaves rock, blues, funk, and Americana into a rich, soulful tapestry, all anchored by that unmistakable South Louisiana rhythm. An award-winning storyteller, his songs cover the full spectrum of human emotion with warmth, wit, and plenty of groove.",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53126308954360/huge/dc39d236acf1a73124e22fdae0143e571ac34d55.jpg"
  },
  {
    title: "2026 Hardrock Hundred",
    link: "https://www.hardrock100.com/index.php",
    description: "The run starts and ends in Silverton, Colorado and travels through the towns of Telluride, Ouray, and the ghost town of Sherman, crossing thirteen major passes in the 12,000' to 13,000' range. Entrants must travel above 12,000 feet (3,700 m) of elevation a total of 13 times, with the highest point on the course being the 14,048' summit of Handies Peak. The run has been held in early July of each year beginning in 1992, except for 1995 (too much snow), 2002 (nearby forest fires), 2019 (too much snow), and 2020 (COVID-19 pandemic). Each year's run is run in the opposite direction of the previous year's event (2025 was run in the counter-clockwise direction, 2026 will be clockwise). …",
    pubDate: "2026-07-10T12:00:00.000Z",
    endDate: "2026-07-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Silverton Highschool Gymnasium",
    imageUrl: "https://localist-images.azureedge.net/photos/51703557553146/huge/050175424246fd0205882d49e66a2c725b26b916.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-07-10T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Historic Walking Tour",
    link: "http://www.ouraycountyhistoricalsociety.org/",
    description: "Historic Ouray Main Street Walking Touor including the Elks Lodge, The Beaumont Hotel, The Wright Operal House, and Mesker Fronts. Tour led by Jenny Hart",
    pubDate: "2026-07-10T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52462631678331/huge/6cbdbfeb9edb95cd3ecb5d6d0dbe4af31c20a08b.jpg"
  },
  {
    title: "Opening Reception for The 610 Arts Annual Photography Invitational ~ featuring works by Gary Slane & Eric Phillips",
    link: "https://sherbino.org/event/opening-reception-for-the-610-arts-annual-photography-invitational-featuring-works-by-gary-slane-eric-phillips/",
    description: "July 10 @ 5:00 pm – 7:00 pm Photography Invitational featuring Gary Slane and Eric Phillips On display July 1 – August 28, 2026 Artist Reception: Friday, July 10 | 5:00–7:00 PM | Free! The 610 Arts Collective is pleased to present the Photography Invitational, featuring the work of Gary Slane of Montrose and Eric Phillips of Colorado’s Gunnison Valley. This special exhibition showcases two accomplished photographers whose distinct artistic perspectives celebrate the beauty, power, and wonder of the natural world. Join us for an Artist Reception on Friday, July 10, from 5:00–7:00 PM, where guests will have the opportunity to meet the artists, learn about their creative processes, and enjoy an evening surrounded by extraordinary imagery from across the American West and beyond. Gary Slane Montrose photographer Gary Slane has devoted years to capturing breathtaking landscapes, wildlife, and night skies throughout North America. …",
    pubDate: "2026-07-10T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53306626930226/huge/e9e9fa52e3b4c6283408d5cb97ce02cf32452428.jpg"
  },
  {
    title: "Ridgway Bird Walks & Talks with Mike Campbell: “Riparian Habitat Birding”",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Join Mike Campbell, a Colorado native, lifelong birder, retired educator, wildlife artist, bird banding educator, and Friends of Ridgway State Park board member, as he shares his experiences and knowledge of our local feathered friends and the environment we share during a guided Bird Walk & Talk in Ouray County. Small group sizes will allow the experience to be tailored to participants’ knowledge levels and interests. Times, meeting location, and any weather-related updates will be provided via email prior to the event. A waiver needs to be signed before the event. Please do so here. If you're having issues with registration, please email lexi@weehawkenarts.org.",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "location disclosed shortly before class start date (after registration).",
    imageUrl: "https://localist-images.azureedge.net/photos/53073815786547/huge/8387acbab2071461ef1077e1f731fcbe4010dbb0.jpg"
  },
  {
    title: "2-Day Trail Stewardship Trip: Courthouse to South Stealey Jct",
    link: "https://ouraytrails.org/volunteers",
    description: "Join Ouray Trail Group Crew Leader Kevin for a two-day stewardship trip from. Courthouse to South Stealey Junction . Volunteers will perform trail maintenance while enjoying the spectacular scenery of Colorado’s backcountry. This is a rewarding opportunity to help maintain local trails alongside fellow volunteers. Feel free to join us for one or both days. There's no cost, but please register.https://tinyurl.com/OTGsummer2026",
    pubDate: "2026-07-11T12:00:00.000Z",
    endDate: "2026-07-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Courthouse Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52932478605706/huge/594f0611d04b8cac902b2db3b64ffb53ae543a95.jpg"
  },
  {
    title: "Wildflower Walk with Mary Menz",
    link: "https://lp.constantcontactpages.com/ev/reg/6gbhr9f",
    description: "Experience the scenic vistas of the San Juan Mountains in Ouray from an entirely new perspective during this wildflower walk. 🌼 Join landowner Charlie Parker for a scenic three-mile hike across his private property while local botany expert Mary Menz helps identify the colorful wildflowers and alpine plants found along the trail. This event is in partnership with Colorado West Land Trust. 🕘 July 11 | 8:30 AM-1 PM 📍 Meet at the Ouray KOA, 225 Co Rd 23, Ridgway, CO 81432 💲 Free REGISTER: https://lp.constantcontactpages.com/ev/reg/6gbhr9f",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray KOA",
    imageUrl: "https://localist-images.azureedge.net/photos/53082388585996/huge/8f84b01bd22d47aca2573a9e1e048373c5a20130.jpg"
  },
  {
    title: "Cacao & Sound Ceremony with Brian Dickinson: Live Music @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/cacao-sound-ceremony-with-brian-dickinson-live-music-the-wright",
    description: "Cacao & Sound Ceremony with Brian Dickinson: Live Music @ the Wright WHEN? Saturday, July 11 Doors at 1:30 pm • Event at 2:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Join Brian Dickinson for an immersive Cacao & Sound Ceremony designed to create space for reflection, relaxation, and connection through intentional sound and shared experience. Combining ceremonial cacao with meditative soundscapes, this experience invites participants to slow down, settle in, and engage with music and vibration in a deeply restorative setting. Through live sound, resonance, and mindful presence, guests are encouraged to explore stillness and renewal in the historic setting of the Wright Opera House. Please bring your own blanket, yoga mat, or anything else that helps create a comfortable space to rest during the sound experience. …",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52931877221087/huge/c922252dd282798a2a91ee39c35282c81910f49e.jpg"
  },
  {
    title: "Deep Relaxation Sound Bath with Brian Dickinson: Live Music @ the Wright",
    link: "https://wrightoperahouse.org",
    description: "Deep Relaxation Sound Bath with Brian Dickinson: Live Music @ the Wright WHEN? Saturday, July 11 Doors at 6:00 pm • Event at 6:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Join us for a special Deep Relaxation Sound Bath with Brian Dickinson, designed to help relax, balance, and restore energy throughout the body. Brian will intuitively guide participants through a sound immersion journey using a rich collection of instruments including gongs, singing bowls, handpan, bells, flutes, ancient whistles, chimes, and more. As guests settle into a cosmic ocean of sound, these layered vibrations create a deeply immersive experience that gently massages the body and calms the nervous system. The harmonic resonance of gong tones allows participants to naturally drop into a peaceful state of deep relaxation, creating space for rest, restoration, and healing. …",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52932388838595/huge/3d53a3b85d29b20688afb793e034dfc642d33f6a.jpg"
  },
  {
    title: "Benefit Concert for Fire Fighters and OCEMS - Sacred Fire-Santana Tribute Band",
    link: "https://www.ocpag.org/sacredfire",
    description: "We will be doing this as a benefit concert for all volunteer fire departments in our county and OCEMS. Sacred Fire is a Santana tribute band composed entirely of professional musicians living and working in Denver. Established in November of 2024, band leader Ed Contreras' desire was to pay tribute to the band that inspired him to be a musician and to share the music which has already blessed millions of listeners since Woodstock in 1969. A Denver native, Ed Contreras has been playing World drums, drum kit, and percussion for over 50 years. His music covers everything from folk, jazz, rock, blues, country, and bluegrass to African, Flamenco, Brazilian, Eastern European and Middle Eastern styles. Contreras teaches at Swallow Hill Music in Denver and has found it to be the perfect place to educate folks about the power and spirituality of music. …",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53249868268500/huge/efe64b82d26bee2c8f8ee442ea9628870d8f4e3d.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Sweet T & Lady V",
    link: "https://sherbino.org/event/the-courtyard-at-610-presents-sweet-t-lady-v/",
    description: "July 12 @ 7:00 pm – 8:30 pm Gates: 6:30 || Show: 7:00pm || $14 Advance / $18 day of show || Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited bar onsite The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. Join us for an intimate evening with Grand Junction duo Sweet T & Lady V! With masterful mandolin, guitar, and rich vocal harmonies, these two create a beautifully woven wall of sound that’s both captivating and unforgettable. Come enjoy an evening of heartfelt music in an intimate setting—you won’t want to miss it! …",
    pubDate: "2026-07-12T12:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53306472560017/huge/aff5c9b2f459a2dc668c6dbb64c16f4677ee6924.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Closed In Observance Of 4th Of July",
    link: "https://www.norwoodtown.com/2026-07-02-closed-in-observance-of-4th-of-july",
    description: "",
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
    description: "",
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
    description: "",
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
    description: "",
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
    description: "",
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
    description: "",
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
    description: "",
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
    description: "",
    pubDate: "2026-09-07T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Pioneer Days And Car Show",
    link: "https://www.norwoodtown.com/2026-09-26-norwood-pioneer-days-and-car-show",
    description: "",
    pubDate: "2026-09-26T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
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
    title: "Red, White & Blues: Special Concert with Better Than Ezra + Drone Show",
    link: "https://townofmountainvillage.com/explore/events/all-events/red-white-blues-special-concert-with-better-than-ezra-drone-show/",
    description: "Friday evening's live music lineup begins with acclaimed singer-songwriter and local legend Emily Scott Robinson at 5 p.m. At 6:00 p.m.,",
    pubDate: "2026-07-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49151/tmv-eventgraphicbtesmall.jpg"
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
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
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
    title: "Science of Cocktails",
    link: "https://townofmountainvillage.com/explore/events/all-events/science-of-cocktails-1/",
    description: "A crowd pleaser for more than 15 years attracting those from near and far, the Science of Cocktails is Pinhead’s not-to-be-missed annual fundraiser.",
    pubDate: "2026-07-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49160/soc2026_v1_0_instagram45_copy.png"
  },
  {
    title: "Public Art Commission Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/public-art-commission-meeting/",
    description: "The Public Art Commission meets on an as-needed basis. Please join the meeting from your computer, tablet or smartphone through this link.",
    pubDate: "2026-07-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49288/screenshot_2026-07-01_at_1_45_30_pm.png"
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
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-11T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
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
    title: "Town Talk: Breakthroughs in RNA Science: From Basic Research to Medicine",
    link: "https://townofmountainvillage.com/explore/events/all-events/breakthroughs-in-rna-science-from-basic-research-to-medicine/",
    description: "Phil Bevilacqua, from Penn State University, will present breakthroughs in RNA medicine over the last decade including using CRISPR for gene editing,",
    pubDate: "2026-07-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49102/tt_logo_1048x802_a_1.png"
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
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48771/randy_houser_calendar_1800x900_1.png"
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
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-18T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
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
  },
  {
    title: "Music on the Green Presents Jon Stickley Trio",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-jon-stickley-trio-1/",
    description: "Beyond the Groove Productions and the Telluride Mountain Village Owners Association (TMVOA) present Music on the Green with Jon Stickley Trio on Friday,",
    pubDate: "2026-07-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48855/jon_stickley_trio_1800x900px.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-07-25T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-25T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-07-26T12:00:00.000Z",
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
    pubDate: "2026-07-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "Town Talk: The Dual Challenge - Climate and Energy",
    link: "https://townofmountainvillage.com/explore/events/all-events/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. Three leading voices sit down to examine",
    pubDate: "2026-07-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48907/0728-tt_320_x_212-tf.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-29T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "New York Philharmonic Brass Quintet",
    link: "https://townofmountainvillage.com/explore/events/all-events/new-york-philharmonic-brass-quintet-1/",
    description: "The incredible New York Philharmonic Principal Brass Quintet perform in Telluride! Don’t miss the best brass players in the country in what promises to be a",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48609/nyp_brass.jpg"
  },
  {
    title: "The Brass Family",
    link: "https://townofmountainvillage.com/explore/events/all-events/the-brass-family/",
    description: "“The Brass Family” – with the New York Philharmonic Principal Brass Quintet Learn all about brass instruments in this fun and interactive show with the",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48614/nyp_education.jpg"
  },
  {
    title: "Music on the Green Presents South Austin Moonlighters",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-south-austin-moonlighters-2/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present South Austin Moonlighters at Reflection Plaza in Mountain Village. The Friday shows are free,",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48857/south_austin_moonlighters_1800x900_px_1740x870.jpeg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-08-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-08-02T12:00:00.000Z",
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
    pubDate: "2026-08-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
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
    imageUrl: "https://www.telluride.com/site/assets/files/36708/artwalk-2200x1237.800x533.webp"
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
    title: "\"This Is Colorado (In One Square Foot)\" Community Art Project Exhibition",
    link: "https://www.telluride.com/event/this-is-colorado-in-one-square-foot-community-art-project-exhibition/",
    description: "\"This Is Colorado (In One Square Foot)\" is a Community Art Project on display in Telluride and Mountain Village between …",
    pubDate: "2026-06-24",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62946/this_is_co_art_exhibit_2200x1237.800x533.webp"
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
    title: "Jewelry Show With Nanci Modica",
    link: "https://www.telluride.com/event/jewelry-show-with-nanci-modica/",
    description: "New York-based goldsmith Nanci Modica is returning to Telluride with an all new collection of work from July 2 - 5, …",
    pubDate: "2026-07-02",
    endDate: "2026-07-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62954/untitled_-_june_25-_2026_at_14_42_16_2.800x533.webp"
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
    description: "Friday evening's live music lineup begins with acclaimed singer-songwriter and local legend Emily Scott Robinson at 5 …",
    pubDate: "2026-07-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62891/bte_show_poster.800x533.webp"
  },
  {
    title: "Fourth of July Drone Show",
    link: "https://www.telluride.com/event/fourth-of-july-drone-show-mountain-village/",
    description: "Head to Mountain Village for a Fourth of July drone show! The 2026 edition will take place after Better Than Ezra.",
    pubDate: "2026-07-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62993/dsc05106--1--2100x1400-66fb62fd-2190-48b7-ba10-131d268becc2_1.800x533.webp"
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
    title: "Fourth of July Bash",
    link: "https://www.telluride.com/event/fourth-of-july-bash/",
    description: "The Town of Telluride is hosting a celebration for The Fourth of July in Telluride Town Park immediately following the …",
    pubDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48287/tot4th26-ttb-header.800x533.webp"
  },
  {
    title: "Fourth of July Drone Show",
    link: "https://www.telluride.com/event/fourth-of-july-drone-show/",
    description: "Join the Town of Telluride for a Drone Show on the Fourth of July at dusk.",
    pubDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58552/dsc05106--1--2100x1400-66fb62fd-2190-48b7-ba10-131d268becc2.800x533.webp"
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
    title: "Apertivi & Oysters",
    link: "https://www.telluride.com/event/apertivi-oysters-for-july-4th/",
    description: "Celebrate July 4th and America's 250th with Apertivi and Oysters at The National! Whether you prefer to unwind inside …",
    pubDate: "2026-07-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62972/049eng_national_june26.800x533.webp"
  },
  {
    title: "Village Film Nights",
    link: "https://www.telluride.com/event/village-film-nights/",
    description: "The Telluride Film Festival, in collaboration with the Town of Mountain Village, the Telluride Conference Center, and …",
    pubDate: "2026-07-05",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58512/0412692b-4dd2-d891-5547-848b9c1541a8.800x533.webp"
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
    title: "History at the Movies",
    link: "https://www.telluride.com/event/history-at-the-movies/",
    description: "Join the Telluride Historical Museum for History at the Movies! In celebration of our state and National …",
    pubDate: "2026-07-07",
    endDate: "2026-07-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62987/screenshot_2026-07-01_at_12_43_41_pm.800x533.webp"
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
    title: "Josh Abbott",
    link: "https://www.telluride.com/event/josh-abbott/",
    description: "Spend an unforgettable evening with Josh Abbott, the acclaimed Texas singer-songwriter and frontman of the Josh Abbott …",
    pubDate: "2026-07-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62967/jab_bbt_022826-103.800x533.webp"
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
    title: "Box Canyon Races",
    link: "https://www.telluride.com/event/box-canyon-races/",
    description: "Come run in the high alpine! Sign up for the Bridal Veil 30k or the Bear Creek 10mi races for an exhilarating and …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48231/boxcanyon-246_1.800x533.webp"
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
    description: "Top Chef & Taste of Telluride is One to One Mentoring's premier annual fundraiser, bringing together locals, …",
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
  },
  {
    title: "Camp Alderwild",
    link: "https://www.telluride.com/event/camp-alderwild/",
    description: "Denver-based producer Of the Trees will be returning to play two nights at Town Park this summer. Of The Trees will be …",
    pubDate: "2026-08-28",
    endDate: "2026-08-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/57622/of_the_trees_by_frankie_zarantonello.800x533.webp"
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
  },
  {
    title: "Notice to Creditors -- Estate of Michael Kiball (COL-000175)",
    entity: "Estate of Michael Kiball",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "This is a notice to creditors of the estate of Michael Kiball, handled by Bo James Nerlin of Devor & Pluhoff, LLC in Montrose, Colorado. All persons with claims against the estate must present them to the personal representative or the District Court of San Miguel County. The notice was published June 25, July 2, and July 9.",
    deadline: "2026-10-18",
    expires: "2026-10-18",
    dates: "6/25",
    papers: ["ttimes_0625"],
    url: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "creditors-kiball-COL-000175"
  },
  {
    title: "Public Hearing -- Lot Line Vacation & PUD Amendment, Lawson Hill (COL-000176)",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County is considering an application by Drea Araiza on behalf of San Miguel County to vacate the lot line between Lots 425-1 and 425-2 in the Lawson Hill PUD (Parcels #456531201019 and #456531201020), in order to build employee housing as an accessory use to the county jail. The Board of County Commissioners will hold a public hearing on July 15, 2026 at 9:30 AM at 333 West Colorado Avenue, Telluride. Written comments of more than one page must be received by July 7, 2026 to receive full consideration.",
    deadline: "2026-07-15",
    expires: "2026-07-15",
    dates: "6/25",
    papers: ["ttimes_0625"],
    url: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    address: "Lots 425-1 and 425-2, Lawson Hill PUD, Parcels #456531201019 and #456531201020, San Miguel County, CO",
    noticeKey: "lot-line-vacation-lawson-hill-COL-000176"
  },
  {
    title: "Property Tax Exemption -- Senior Citizens, Disabled Veterans & Gold Star Spouses",
    entity: "San Miguel County Assessor's Office",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County is notifying qualifying senior citizens, veterans with a 100% service-connected disability rating (or individual unemployability status starting tax year 2025), and gold star veteran spouses that they may be eligible for a property tax exemption exempting 50% of the first $200,000 in actual value of their primary residence. Qualifying seniors must be at least 65, have owned and occupied the property as their primary residence for at least 10 consecutive years prior to January 1 of the application year. Applications must be submitted to the San Miguel County Assessor's office by July 15, with late applications accepted until August 15; contact the assessor at 970-728-3174.",
    deadline: "2026-07-15",
    expires: "2026-08-15",
    dates: "6/25",
    papers: ["ttimes_0625"],
    url: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    address: "San Miguel County, Colorado",
    noticeKey: "property-tax-exemption-senior-veteran-2026"
  },
  {
    title: "Public Notice -- San Miguel County Board of Equalization (CBOE) Session 2026",
    entity: "San Miguel County Board of Equalization",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Board of Commissioners will sit as the Board of Equalization (CBOE) from July 1 through August 5, 2026, to hear taxpayer appeals of Assessor property valuation and classification decisions. Independent hearing officers will conduct hearings and submit recommendations; only taxpayers who previously filed objections with the Assessor may petition. Filing deadlines are July 15, 2026 for real property and July 20, 2026 for personal property.",
    deadline: "2026-07-20",
    expires: "2026-08-05",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Miramonte Building, 2nd Floor, Room 201, 333 West Colorado Avenue, Telluride, Colorado",
    noticeKey: "COL-000178-cboe-2026"
  },
  {
    title: "RFP -- Custodial Services for Telluride School District R-1",
    entity: "Telluride School District R-1",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Telluride School District R-1 is requesting proposals from vendors to provide year-round custodial services at Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School. Services include trash removal, vacuuming, floor scrubbing, disinfecting, and window cleaning; vendors may bid on all or part of the contract. Requests for full specifications must be received by 4:00 PM on July 14, 2026, and complete proposals are due by 4:00 PM on July 21, 2026.",
    deadline: "2026-07-21",
    expires: "2026-07-21",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School, Telluride, Colorado",
    noticeKey: "COL-000180-tsd-custodial-rfp"
  },
  {
    title: "Public Notice to Creditors -- Estate of Gerald D. Wilson (26PR30005)",
    entity: "Estate of Gerald D. Wilson",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Notice is given that the estate of Gerald D. Wilson, also known as Gerald Dean Nelson, is being administered in San Miguel County District Court under Case No. 26PR30005. All persons with claims against the estate must present them to Personal Representative Michael Kimball or to the District Court on or before October 25, 2026, or claims may be forever barred.",
    deadline: "2026-10-25",
    expires: "2026-10-25",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "COL-000183-estate-wilson-26PR30005",
    caseNumber: "26PR30005"
  },
  {
    title: "Public Notice -- Replacement of Lost Share Certificate #887, Farmers' Water Development Company",
    entity: "Farmers' Water Development Company",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Farmers' Water Development Company (FWDC) has received a written request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued in the name of A.F. Newans M.D., C.P. Unless a written objection is filed with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date in the Norwood Post, a replacement certificate will be issued and the original permanently cancelled.",
    deadline: "2026-07-30",
    expires: "2026-07-30",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Farmers' Water Development Company, PO Box 10, Norwood, CO 81423",
    noticeKey: "COL-000181-fwdc-share-cert-887"
  },
  {
    title: "Public Hearing -- San Miguel County Planning Commission & BOCC Joint Work Session (July 9, 2026)",
    entity: "San Miguel County Planning Commission / Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Planning Commission and Board of County Commissioners will hold a joint work session on July 9, 2026 at 9:30 AM to discuss proposed Land Use Code amendments, including sections on Forestry Practices, Oil & Gas Operations, Deep Geothermal Operations, Condominium Plats, and Planned Unit Development & Subdivisions. The meeting is open to the public in person at 333 West Colorado Ave., Telluride, or via Zoom.",
    deadline: "2026-07-09",
    expires: "2026-07-09",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "333 West Colorado Ave., Second Floor Meeting Room, Telluride, CO 81435",
    noticeKey: "COL-000184-pc-bocc-worksession-2026-07-09"
  },
  {
    title: "Foreclosure Sale Notice -- Lot 166AR2, Telluride Mountain Village (Sale No. 202604)",
    entity: "Federal Holding Realty / Two Stonegate LLC",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee has recorded a Notice of Election and Demand for foreclosure on a Deed of Trust dated April 22, 2022, involving original grantor Two Stonegate LLC and beneficiary Federal Holding Realty, with an outstanding principal balance of $500,000. The property subject to foreclosure is Lot 166AR2, Telluride Mountain Village, located on Stonegate Drive, Mountain Village, CO 81435. The foreclosure is proceeding under CRS §38-38-103, and the lien foreclosed may not be a first lien.",
    deadline: "",
    expires: "2026-10-01",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village)",
    noticeKey: "foreclosure-sale-202604-lot166ar2-mountain-village",
    caseNumber: "202604"
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
  const out = COUNTY_CACHED_DATA.map(m => {
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

  // The static COUNTY_CACHED_DATA list can fall behind the bot's agenda scraper
  // (which keeps MANUAL_SUMMARIES current). Surface any FUTURE San Miguel County
  // meeting that already has a generated summary but isn't in the cached list —
  // so freshly-scraped BOCC / Planning / commission meetings appear even before
  // the cache is regenerated. Dedup against the cache by date + board type.
  if (typeof MANUAL_SUMMARIES !== 'undefined' && MANUAL_SUMMARIES) {
    const todayMT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const ctok = (t) => /planning/i.test(t) ? 'pc'
      : /board of county commissioners|commissioners|bocc/i.test(t) ? 'bocc'
      : /open space/i.test(t) ? 'openspace'
      : /historic/i.test(t) ? 'historical'
      : (meetingBoardToken(t) || 'gen');
    const seen = {};
    out.forEach(m => { if (m.eventDate) seen[m.eventDate.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) + '|' + ctok(m.title)] = 1; });
    for (const key of Object.keys(MANUAL_SUMMARIES)) {
      if (key.slice(0, 7).toLowerCase() !== 'county|') continue;
      const parts = key.split('|');
      const date = parts[1];
      if (!date || date < todayMT) continue;                 // future meetings only
      const eventDate = localDate(date);
      if (!eventDate || isNaN(eventDate.getTime())) continue;
      const rawTitle = (parts.slice(2).join('|') || 'County Meeting')
        .replace(/\s*-\s*[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s*$/, '').trim() || 'County Meeting';
      const dk = date + '|' + ctok(rawTitle);
      if (seen[dk]) continue; seen[dk] = 1;
      out.push({
        title: rawTitle,
        link: COUNTY_CIVICCLERK_FALLBACK,
        description: MANUAL_SUMMARIES[key] || '',
        eventDate,
        eventDates: '',
        eventTimes: '',
        location: '',
        source: 'county',
        sourceLabel: 'San Miguel County',
        category: /planning/i.test(rawTitle) ? 'Planning Commission' : /board/i.test(rawTitle) ? 'Board Meeting' : 'Meeting',
        canceled: false,
        hasAgenda: false,
        agendaLink: COUNTY_CIVICCLERK_FALLBACK
      });
    }
  }

  return out;
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

// Ouray County meetings (Board of County Commissioners + Planning Commission).
// content-refresh.js scrapes Ouray County's CivicPlus AgendaCenter RSS into
// MANUAL_SUMMARIES under the 'ouray|<date>|<agenda text>' source, but there's
// no OURAY_CACHED_DATA array or getter — so Ouray meetings never surfaced on
// the site or in the weekly digest. We surface upcoming meetings straight from
// those summary keys (the bot keeps them fresh): the board is inferred from the
// agenda text and the generated summary rides along as the description.
function getOurayMeetings() {
  if (typeof MANUAL_SUMMARIES === 'undefined' || !MANUAL_SUMMARIES) return [];
  const out = [];
  const seen = {};
  for (const key of Object.keys(MANUAL_SUMMARIES)) {
    if (key.slice(0, 6).toLowerCase() !== 'ouray|') continue;
    const parts = key.split('|');
    const date = parts[1];
    const raw = (parts.slice(2).join('|') || '').toLowerCase();
    const eventDate = localDate(date);
    if (!eventDate || isNaN(eventDate.getTime())) continue;
    const isPC = /planning commission/.test(raw);
    const isBOCC = /board of county commissioners|\bcommissioners\b|\bbocc\b/.test(raw);
    // Board-only title; the "Ouray County" entity rides on sourceLabel (consumers
    // that build a heading prefix it with the source — e.g. weekly-email.js).
    const title = isPC ? 'Planning Commission' : isBOCC ? 'Board of County Commissioners' : 'Meeting';
    const dk = date + '|' + title;
    if (seen[dk]) continue; seen[dk] = 1;
    out.push({
      title,
      link: 'https://ouraycountyco.gov/AgendaCenter',
      description: MANUAL_SUMMARIES[key] || '',
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: 'Ouray County, CO',
      source: 'ouray',
      sourceLabel: 'Ouray County',
      category: isPC ? 'Planning Commission' : 'Board of County Commissioners',
      canceled: false,
      hasAgenda: false,
      packetUrl: null
    });
  }
  return out;
}

function getTownAgendaLink(title, eventDate) {
  if (!eventDate) return TOWN_CIVICWEB_FALLBACK;
  const dateKey = localDateKey(eventDate);
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
    date: "July 21, 2026",
    title: "Telluride Housing Authority",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8289",
    hasAgenda: false,
    location: "Rebekah Hall, 113 W Columbia Ave",
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
  },
  {
    date: "September 24, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8104",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "October 1, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053",
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
  const dateKey = localDateKey(item.eventDate);
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
  const dateKey = localDateKey(item.eventDate);
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

  const dateKey = localDateKey(item.eventDate);
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
