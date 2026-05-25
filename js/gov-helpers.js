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
    "The May 28 regular board meeting agenda hasn't been posted yet, so there's no way to know what's coming up.",

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

  "county|2026-05-27|Board of County Commissioners Special Meeting in Telluride 2:00 pm - 2:45 pm":
    "Special meeting in Telluride · Work session at Placerville School House · No published agenda items",

  "county|2026-06-03|Board of County Commissioners Meeting":
    "Regular commissioner meeting · Agenda details not yet available",

  "county|2026-06-11|Planning Commission Meeting":
    "Agenda not available",

  "county|2026-06-17|Board of County Commissioners Meeting":
    "Regular meeting agenda TBD",

  "county|2026-06-22|Open Space Commission Meeting":
    "Agenda details pending · Trail and open space management · Development review matters",

  "county|2026-06-24|Board of County Commissioners Work Session":
    "Work session agenda pending"
};

const TELLURIDE_TIMES_ARTICLES = [
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
    imgHiRes: true
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
    imgHiRes: true
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
    imgHiRes: true
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
    imgHiRes: true
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
    title: "Tiny patients, big fight: NICU parents win leave in 2 states and push for more",
    source: "Telluride Times",
    date: "May 17, 2026",
    firstSeen: "2026-05-17",
    newsTopic: "housing",
    copy: "A Fort Collins couple faced the difficult choice between working while their baby was in the NICU or using up parental leave before bringing her home. Colorado became the first state to offer paid NICU leave in January - 12 weeks on top of regular parental leave - while Illinois will start offering 10-20 days unpaid next month.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_972ba0ce-4c07-5b4f-9b1e-7d3dc9268852.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/0e/e0e2f3ab-4e6e-58b6-83ea-c282291ca3c3/6a09c00146405.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump administration rescinds Public Lands Rule",
    source: "Telluride Times",
    date: "May 17, 2026",
    firstSeen: "2026-05-18",
    newsTopic: "arts-culture",
    copy: "The Trump administration rescinded the Public Lands Rule, which would have given conservation equal weight with mining, drilling, and grazing when considering uses for BLM lands. The move affects 298,733 acres of BLM land in San Miguel County and will impact ongoing planning for the Uncompahgre Resource Management Plan.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8b172d1f-535e-4d09-b70c-ed1a18b83bde.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/4a/04a53e93-4905-40fc-8659-1f3e4c69202f/6a0a0e02139c0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Tiny patients, big fight: NICU parents win leave in 2 states and push for more",
    source: "Telluride Times",
    date: "May 17, 2026",
    firstSeen: "2026-05-17",
    newsTopic: "housing",
    copy: "A Colorado couple faced the dilemma many NICU parents know - work while their baby was hospitalized or save parental leave for later. Colorado became the first state in January to offer paid NICU leave (12 weeks), while Illinois will start a smaller unpaid program next month.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fd56087d-96f6-5692-8644-bb2754f3d21b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/0e/e0e2f3ab-4e6e-58b6-83ea-c282291ca3c3/6a09c00146405.image.jpg",
    imgHiRes: true
  },
  {
    title: "Cassidy tried to get along with Trump after his impeachment vote. Retribution came anyway",
    source: "Telluride Times",
    date: "May 17, 2026",
    firstSeen: "2026-05-18",
    newsTopic: "government",
    copy: "Senator Cassidy finished third in Saturday's primary despite outspending rivals, unable to overcome Trump's opposition five years after voting to convict him during impeachment. Trump-endorsed Julia Letlow led the voting and will face state Treasurer John Fleming in the June 27 runoff for the Republican nomination.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1b4aa47e-075a-5201-80b4-8260d28c5013.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/5d/e5dde20d-6cde-562d-ac58-8f35803d191d/6a0a11cd27eb3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Rural Homes Colorado to build workforce housing for MV",
    source: "Telluride Times",
    date: "May 17, 2026",
    firstSeen: "2026-05-17",
    newsTopic: "housing",
    copy: "Mountain Village has partnered with nonprofit Rural Homes Colorado to develop workforce housing on town-donated land, with construction expected to start fall 2027 and residents moving in by late 2028. Rural Homes uses modular construction to keep costs down and has built 49 homes in Norwood, Ridgway and Ouray since 2021.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_9bb0b443-6b90-42fe-a3bc-0162f255e88a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/10/010ec66b-45b0-4c16-a613-ad59e52b90e8/6a08c4a872f36.image.jpg",
    imgHiRes: true
  },
  {
    title: "Commissioners discuss housing vacancy tax",
    source: "Telluride Times",
    date: "May 16, 2026",
    firstSeen: "2026-05-17",
    newsTopic: "housing",
    copy: "County commissioners are exploring a vacancy tax on empty residential properties after the state legislature failed to pass a bill giving local governments that authority. With San Miguel County's housing vacancy rate at 45% and declining revenue from the current mitigation fee funding source, commissioners see the tax as a way to incentivize property use and generate affordable housing funds, though no vote was taken.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b1076477-13fb-4a95-b379-541028f46b0b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/8a/38a1605e-6b18-4b84-aa3e-fc7736a15baa/6a08d4817c43d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Learning life-saving skills",
    source: "Telluride Times",
    date: "May 16, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "education",
    copy: "Telluride middle and high school students have been learning CPR and first aid through classes led by CPR World, with over 300 students earning various certifications in the past six semesters. The program is losing its TEMTA funding after this semester, so the school is training staff to teach the courses in-house to keep the program going despite budget constraints.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_2a3a0d01-be06-4ef1-8140-d1e70330f521.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/d9/0d9135cc-bc05-447d-adfd-2c9ffcd91700/6a08263900ad3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado's Democratic governor commutes ex-election clerk Tina Peters' sentence after Trump pressure",
    source: "Telluride Times",
    date: "May 15, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "government",
    copy: "Governor Polis commuted former Mesa County election clerk Tina Peters' prison sentence after she was convicted of allowing unauthorized access to voting equipment in 2021. Peters had smuggled in an associate of MyPillow's Mike Lindell to copy election computer servers, later shared at a \"cybersymposium.\" Trump celebrated the decision while Secretary of State Griswold called it \"selling out our state's justice system.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9e3062ea-83f3-51a0-9f48-6a2e62d31d45.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/1e/b1ec7de1-b5e3-5e4e-95b3-697a44fdd763/6a0794aa1edc4.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado's Democratic governor commutes the sentence of elections clerk Tina Peters after pressure from President Trump",
    source: "Telluride Times",
    date: "May 15, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "government",
    copy: "Colorado's Democratic governor commutes the sentence of elections clerk Tina Peters after pressure from President Trump.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news/state/article_3013befe-22ca-5e49-ab32-450e2db1936e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Bike safety concern prompts a ‘bold move’",
    source: "Telluride Times",
    date: "May 15, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "education",
    copy: "A Mountain School student completed her capstone project on bike safety after noticing many local teenagers not wearing helmets. Her research found 40% of surveyed kids don't wear helmets, and she observed unsafe practices like multiple riders on e-bikes designed for fewer people.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_5690068e-7e59-46e4-b19c-d4e45b334750.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/3e/43e515a2-f472-4cf6-abaa-8065fa6a5641/6a0642203b240.image.jpg",
    imgHiRes: true
  },
  {
    title: "Seeds of motherhood",
    source: "Telluride Times",
    date: "May 15, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Carol Hiatt reflects on raising her daughter Madison in the mountains, sharing memories from first ski lessons to snowmobile mishaps to Sunday afternoons reading by the fire. Now an adult, Madison has grown into a skilled woman who bakes bread and hosts board games, embodying the nurturing home environment she grew up with while developing her own distinct traits.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_cbfd4cab-6e21-4681-ae0f-8f35fc8eca9b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/1a/a1a74b80-0896-421a-9999-e5f3d6b186c7/6a04900858af0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Upcoming TEF events are ‘by us, for us’",
    source: "Telluride Times",
    date: "May 15, 2026",
    firstSeen: "2026-05-15",
    newsTopic: "community",
    copy: "Tyler, a local restaurant worker and parent, teamed up with Telluride Education Foundation president Hannah Richman to create fundraising events for the schools after seeing program cuts. The School Supper Club runs May 25-29 with participating restaurants like Cornerhouse, The National, and 221 South Oak donating proceeds, followed by Party in the Park featuring local bands, food vendors, and activities like a mechanical bull.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1f48aede-d175-43bc-b798-8d9ecad4410f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/20/0206d206-c227-4ced-a75b-1a575f5e764a/6a064b51bf0d7.image.jpg",
    imgHiRes: true
  },
  {
    title: "County stakeholders vote against accelerated housing",
    source: "Telluride Times",
    date: "May 14, 2026",
    firstSeen: "2026-05-15",
    newsTopic: "housing",
    copy: "County stakeholders failed to reach the 70% supermajority needed to approve a fast-track housing review process that would have expedited projects with at least half deed-restricted units within 90 days. The accelerated review was a requirement for accessing Colorado's affordable housing fund established by Proposition 123, but concerns about project size limits led to the proposal being tabled.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_f8f4bfd3-69ee-4f73-ae4f-bb0e751c3324.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/94/394025f8-fde3-4ab8-984d-fa6884441730/6a06482c2b625.image.jpg",
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
    title: "Firehouse visit",
    source: "Telluride Times",
    date: "May 14, 2026",
    firstSeen: "2026-05-15",
    newsTopic: "public-safety",
    copy: "Local preschoolers are wrapping up their school year with their last day on May 14 and graduation ceremony on May 19 at 6 p.m. Baseball and high school track teams are competing at State May 15-16, while the middle school band has their concert May 18 at 7 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_e5fd4a1a-af15-4b7f-9f21-9ac2c18b02f9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/f4/8f492a71-102e-41f3-bd51-ed01b48705d0/6a04915a7faa2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Denver runway fatality reveals a weakness in airport security",
    source: "Telluride Times",
    date: "May 14, 2026",
    firstSeen: "2026-05-14",
    newsTopic: "community",
    copy: "A person breached Denver airport's perimeter fence and was killed after being pulled into an aircraft engine, forcing the pilot to abort takeoff and evacuate 224 passengers. The intruder scaled the fence in 15 seconds after airport security missed him on surveillance, mistaking the alarm for deer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_421115b6-446c-5d25-a14a-6a9fefb7c8d4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/c1/ac134921-b515-5796-ab77-99af996bd75e/69ffaae2560db.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Hockey diplomacy’",
    source: "Telluride Times",
    date: "May 14, 2026",
    firstSeen: "2026-05-14",
    newsTopic: "infrastructure",
    copy: "A Telluride youth hockey team will travel to Mongolia June 2-30, becoming the first U.S. team to play hockey there. The 88 participants including players, coaches and parents will also visit China and South Korea as part of the cultural exchange trip organized by Vail International Hockey Club.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_33649250-20c6-4e8b-8534-3efffb12c77a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/9c/c9cea77a-5b08-4460-8aa6-2fee9a39b366/6a03553ac86e0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for My 14-20, 2026",
    source: "Telluride Times",
    date: "May 14, 2026",
    firstSeen: "2026-05-14",
    newsTopic: "recreation",
    copy: "San Miguel County is seeking contractors for a boiler replacement at Down Valley Park in Placerville, with proposals due June 4. The Town of Telluride is looking for a Deputy Municipal Court Judge, while Mountain Village needs bids for window and door replacement at Mountain Munchkins.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Aspen girls again best Telluride",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-14",
    newsTopic: "community",
    copy: "Aspen defeated Telluride 12-7 in girls lacrosse after a much closer game than their earlier 24-12 matchup this season. The contest was tied 7-7 late in the game before Aspen pulled away with key goals from freshman Chloe Collins and assists from senior Luca Nettleton.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_ae718dcc-b13c-4dc1-afb9-d6340e47869c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/78/678c1443-599c-455e-bc2a-e7fea24dfe43/6a035823e4c42.image.jpg",
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
    title: "Smoking brain (it’s a good thing)",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-14",
    newsTopic: "community",
    copy: "A local writer reflects on the concept of \"smoking brain\" - that uncomfortable feeling when you're pushed to your mental limits, like struggling with a difficult math problem or learning a new language. Drawing on neuroscientist Huberman's research, she explains how this frustration actually triggers brain chemicals that promote learning and growth, challenging the old belief that adult brains can't change.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_933732fe-e0b2-4907-98ba-429519044ca5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/8c/b8c2d082-d65f-4b07-a422-fff4ca9bf321/6a048e73b6318.image.jpg",
    imgHiRes: true
  },
  {
    title: "US overdose deaths fell again in 2025, but some worry about policy and drug supply changes",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "US overdose deaths dropped again in 2025 across most drug types and states, though Arizona, Colorado and New Mexico saw increases of 10% or more. While researchers are cautiously optimistic, they warn the drug supply keeps evolving with new potent substances like cychlorphine, and recent federal cuts to harm reduction programs could reverse progress.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_66099b39-b1b8-5596-bab2-43d492ff274a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/7e/f7eaaa55-d2df-5520-b082-970ac4c7d39f/6a048678a0970.image.jpg",
    imgHiRes: true
  },
  {
    title: "Move to acquire Wilkin Court unit raises questions",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "housing",
    copy: "The town wants to purchase a Wilkin Court deed-restricted unit to convert it from Tier 3 to Tier 1, saying this simplifies the affordable housing program. But residents are challenging whether the town actually has legal authority to buy the unit against the owner's wishes, with one attorney arguing the deed restriction gives owners the right to choose their buyer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a8fa1aa6-0996-404d-b96d-28b33668f431.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/c4/8c400c14-efca-45da-b5f0-72721a6e54fc/6a04964540393.image.jpg",
    imgHiRes: true
  },
  {
    title: "Denver airport security initially missed trespasser who was killed by plane on runway",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "A man who entered Denver airport intending to take his own life was struck and killed by a Frontier Airlines plane during takeoff Friday night. Security initially missed the trespasser when an alarm triggered, mistakenly attributing it to nearby deer, and couldn't intervene in time once he was spotted crossing the runway. The collision caused an engine fire that forced passenger evacuation, injuring 12 people with 5 hospitalized.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9fc2cb9e-0705-5c97-84c6-e314be457898.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/b3/bb30350f-f401-55b1-8ef1-47a01fa5d399/69ffaae0caae4.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD for the week of May 14-20",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "government",
    copy: "This week's birthdays run from May 14-20, including local residents like Asher Ferguson, Marie Neisen, and the Priestley family members. The regular community calendar continues with Town Board meetings second Wednesdays, Farmers Market Thursdays 2-6 p.m., and various services like the food pantry Sundays 3-6 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_6db5a92b-5491-4bac-b91c-c21f3ee60db1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/61/e61c1b48-54e4-483a-b1ab-1e99ed6d5d77/6a03b4fae7ac9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Federal judge rules ICE in Colorado violated order limiting warrantless arrests",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "A federal judge ruled that ICE agents in Colorado violated a court order limiting warrantless arrests and failed to properly train officers or document such arrests. The ruling stems from an ACLU lawsuit over \"collateral arrests\" of people caught up in immigration enforcement actions. ICE must now provide officer training within 45 days and turn over arrest records.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_6835e55c-d86e-510b-9abd-c6f823a59ecc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/ac/aac37bc9-0b93-5774-be58-3957819b40cc/6a03a5aa52159.image.jpg",
    imgHiRes: true
  },
  {
    title: "Green Grants thanks",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Shawnna and Dennis Andrejko wrote to thank EcoAction Partners, specifically Siobhan Montoya Lavender and Kendra Held, along with Town of Telluride's Darin Graber for their help with a Telluride Green Grants project. The couple completed efficiency upgrades through the program that helps residents with sustainability improvements.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_02b77004-73f0-4b36-a906-72b8b5861d5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Countywide Spring Clean-Up events return May 15-16",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "The annual Spring Clean-Up events return May 15-16, with electronics and household waste disposal at Carhenge in Telluride both days, plus Mountain Village and Norwood locations. The fourth annual Trash Bash follows May 17 at Elks Park.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1ca77ddc-c404-48bd-8ccf-251ceda547b0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/fc/7fcfe0e0-ef57-4065-83b8-194de28aaab7/6a03b367c3759.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lawton Eddy of Salida performs pop-up poetry May 15",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Lawton Eddy from Salida will perform pop-up poetry at the Wilkinson Library Magazine Room on Friday, May 15 at 1 p.m., with the prompt \"chasing grace.\" The free event encourages attendees to bring poems or stories to share, and Eddy has been involved with local poetry festivals and performances since the early 2000s.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_09a57ab6-8638-4062-8bdf-aa60ec487f06.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/3f/d3fbca7e-6388-43f7-adc1-be836916c378/6a03b263064bb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mental Health Awareness Month: Shining a Light",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "health",
    copy: "Tri-County Health Network is asking local businesses and governments to light their buildings green throughout May for Mental Health Awareness Month. The initiative aims to reduce stigma and encourage conversations about mental health support. Events include wearing green on May 15 and a community discussion May 11 at Norwood Community Center.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_398ee143-ea60-47b8-b5e4-54c6b5213317.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/e6/6e67ae1c-a27c-4cf1-a3a0-6e8e9c4e5360/6a03b16d57978.image.jpg",
    imgHiRes: true
  },
  {
    title: "Money reset: getting your budget back on track",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "government",
    copy: "With housing costs and basic expenses squeezing local budgets harder than usual, Telluride Foundation is offering free financial literacy workshops May 18th at Wilkinson Library - noon-1:30pm in English and 5:30-7pm in Spanish. The Foundation's emergency fund has seen applications jump from 70 to over 500 this year, prompting the partnership with four local banks to help residents build budgeting and savings skills.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_c19ec511-b459-4568-a13d-ec475a100b73.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Create your This is Colorado canvas",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "arts-culture",
    copy: "Telluride Arts is hosting a community canvas project at the Mountain Village distillery May 28 where folks can create 12x12 inch pieces expressing what being a Coloradan means to them. The finished canvases will form mosaics displayed at two locations June 15-July 31 as part of Colorado's 150th anniversary celebration.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_8f08686b-e1e8-4aec-8d3f-07f36dd37aff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/3c/63c47cc3-338c-4e0c-90ef-9a73e5f4e924/6a03af2c08a42.image.jpg",
    imgHiRes: true
  },
  {
    title: "Why do pets come back?",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "The local animal shelter reminds folks that returning adopted pets is sometimes necessary due to family emergencies or housing issues, and they welcome animals back without judgment. They're encouraging potential adopters to consider their living situations beforehand, especially breed restrictions from landlords. Two returned pets currently available are Buddy, an active 80-pound mixed breed, and Albus, a friendly cat who needs to be the only feline.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_c79afdcf-67a2-4a53-af38-836434775c16.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/f5/8f5b69c6-c02a-490b-9be5-b2121e993e1e/6a03ae4e06eb8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Norwood banquet celebrates community standouts",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Norwood held its second annual Night of Elegance banquet at the Lone Cone Library, drawing 49 residents for dinner, music and awards. Mesa Rose Kitchen won Business of the Year for the second straight year, while Tom Meehan received the Norwood Noble award after retiring from 47 years as a volunteer firefighter and EMT.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_476e263a-ef79-45ed-96f1-efff9949fec9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/ce/5ce29a5d-8bea-4c87-980e-a850058b903e/6a03852cadbff.image.png",
    imgHiRes: true
  },
  {
    title: "The condition PCOS is now called PMOS. What to know about the name change and what it means for care",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Medical experts have changed the name of PCOS (polycystic ovary syndrome) to PMOS (polycystic ovary metabolic syndrome) after 14 years of collaboration, saying the old name was confusing since the condition doesn't actually involve ovarian cysts. The hormonal condition affects weight, metabolism, mental health, and reproduction, with treatment focusing mainly on lifestyle changes like diet and exercise.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9576d122-904f-5d3d-98b5-7b18da541ace.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/60/86041077-105e-5b75-a863-8057788e4508/6a039de6576da.image.jpg",
    imgHiRes: true
  },
  {
    title: "2026 NFL schedule: Broncos and Chiefs play in 1st Monday night game of the season",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "arts-culture",
    copy: "The Broncos and Chiefs will face off in the first Monday night game of the 2026 NFL season, though Chiefs QB Patrick Mahomes' availability remains uncertain after tearing his ACL and LCL in December. Broncos quarterback Bo Nix is expected ready for training camp after breaking his ankle during the AFC playoffs.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1f2793ff-0041-5e96-b185-b3d756e5252d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/be/bbeb5f6d-e5cf-57fd-b2ac-6cdf28676ddf/6a031be69f601.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sweet success",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "The Telluride High School lacrosse team beat Holy Family 17-7 in the sweet 16, with the Miners jumping ahead early and never trailing after the first quarter. Beck Sommers led the scoring while goalies Bridger Barrett and Dylan Saunders split time in net for the sixth-seeded Miners, who improved to 13-3 overall.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_89d6205d-3340-4cd9-9e3c-7d05b688bf6e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/67/9672da42-7f48-4249-b019-db5fc45d6ef2/6a034f43b4e8c.image.jpg",
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
    title: "Many County Offices Closed May 21-25, 2026. Please plan ahead!",
    source: "San Miguel County",
    date: "May 15, 2026",
    newsTopic: "arts-culture",
    copy: "Due to all-staff training and the Memorial Day holiday, many offices will be closed from Thursday, May 21-Monday, May 25, reopening May 26. Please plan ahead! Contact individual departments for their closures.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=526",
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
    title: "DOLA Economic Vitality Community Session on May 27, 2026",
    source: "Town of Ridgway",
    date: "May 25, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/EV-Posters-for-Ridgway-DOLA-visit-May-2026_1.pdf",
    img: ""
  },
  {
    title: "CO Main Street Architect Visits on May 27-28, 2026",
    source: "Town of Ridgway",
    date: "May 25, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Design-Posters-for-Ridgway-DOLA-visit-May-2026_2.pdf",
    img: ""
  },
  {
    title: "SH62 Banner Structure Project completed; Request form now available",
    source: "Town of Ridgway",
    date: "May 14, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/SH62-Banner-Structure-Press-Release-2026-05-14.pdf",
    img: ""
  },
  {
    title: "Town Manager's Report",
    source: "Town of Ridgway",
    date: "May 12, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Manager%27s-Report---May-12%2C-2026.pdf",
    img: ""
  },
  {
    title: "Planting Trees in Ridgway - Species Recommendations Brochure",
    source: "Town of Ridgway",
    date: "May 25, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TreesToPlant%20Brochure%202021.pdf",
    img: ""
  },
  {
    title: "Ridgway Planning Commission Meeting Agenda",
    source: "Town of Ridgway",
    date: "May 20, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---May-20%2C-2026.pdf",
    img: ""
  },
  {
    title: "Notice of Public Hearing - River Park, Ridgway Business Park, Phase 3 Final Plat",
    source: "Town of Ridgway",
    date: "May 20, 2026",
    firstSeen: "2026-05-16",
    newsTopic: "recreation",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.05.20_public-hearing-notice.pdf",
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
  }
];

const KOTO_NEWSCASTS = [
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
  },
  {
    title: "Newscast 5-15-26",
    source: "KOTO Community Radio",
    date: "May 16, 2026",
    newsTopic: "land-use",
    copy: "On this week’s Regional Roundup, we hear about the Trump administration’s decision to rescind the Public Lands Rule, and we hear a report on the success of wildlife crossings in Wyoming. As bears become more active, we hear why communities need to be bear aware, and we'll hear about efforts across the region to protect dark skies from light polluti",
    href: "https://koto.org/news/newscast-5-15-26/"
  },
  {
    title: "Newscast 5-14-26",
    source: "KOTO Community Radio",
    date: "May 15, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; Cat Movie Fisher with Risho Unda; Listening Club is the Cure for Disintegration",
    href: "https://koto.org/news/newscast-5-14-26/"
  },
  {
    title: "Newscast 5-13-26",
    source: "KOTO Community Radio",
    date: "May 14, 2026",
    newsTopic: "land-use",
    copy: "Regional Governments Discuss Impacts of Development; The Joy of Sex Ed…with Clowns; Alex Kelloff Makes Bid for Congress",
    href: "https://koto.org/news/newscast-5-13-26/"
  },
  {
    title: "Newscast 5-11-26",
    source: "KOTO Community Radio",
    date: "May 12, 2026",
    newsTopic: "community",
    copy: "Valley Floor Day Instills Stewardship in a Changing Climate -General Assembly Enters Final Days",
    href: "https://koto.org/news/newscast-5-11-26/"
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
  },
  {
    title: "Valley Floor Day Instills Stewardship in a Changing Climate",
    source: "KOTO Community Radio",
    date: "May 12, 2026",
    newsTopic: "education",
    copy: "More than 100 elementary students explored local flora and fauna during Valley Floor Education Day, learning about beavers, owls and ecosystem health through hands-on science.",
    href: "https://koto.org/news/valley-floor-education-day-telluride-students-wetlands-wildlife-science/"
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
    clubInfo: {
      name: "Telluride Rotary Club",
      meetings: "1st & 3rd Wednesdays, 6:00 PM (social at 5:30)",
      location1: "1st Wed — Mountain Lodge, 457 Mountain Village Blvd",
      location2: "3rd Wed — Announced Telluride location",
      president: "Kate Wadley",
      email: "telluriderotary@gmail.com",
      website: "https://portal.clubrunner.ca/3291",
      note: "No meetings in April. In-person & online options available."
    }
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

const KOTO_COMMUNITY_EVENTS = [
  {
    title: "School Supper Club",
    link: "https://koto.org/event/school-supper-club/",
    description: "The restaurant community is coming together for a second year to support our public schools! Different restaurants have promotions to encourage participation and build community!",
    pubDate: "2026-05-25T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/2026SSCSavetheDate.png"
  },
  {
    title: "Women's Empowerment Group",
    link: "https://koto.org/event/womens-empowerment-group-2/",
    description: "Join Kaity Swick and Sally Harris Porter with Collaborative Trauma Solutions in a women’s empowerment group focused on fostering connections with like-minded women and developing deeper connections with yourselves and each other. We will incorporate somatic practices, mindfulness exercises and practical tools rooted in mind-body awareness. This will be held in a group setting and will be a trauma-informed and non-judgmental space created to strengthen community and provide a safe space to express yourself. Kaity and Sally will guide the group with relevant topics and supportive tools, so all you have to do is show up with an open mind. Please sign up here if you are interested: https://forms.gle/RLxaexLJar4Vpnhp7",
    pubDate: "2026-05-26T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Women-Empowerment-4.png"
  },
  {
    title: "George Gage SkateBoarding Movie",
    link: "https://koto.org/event/george-gage-skateboarding-movie/",
    description: "Skateboard (1978, PG, 97 min.) was the first feature film to depict the height of the 70s skateboard craze. Many refer to it as the Bad News Bears of the sport. It’s star studded cast includes Alan Garfield, 70s teen idol Leif Garrett, skateboarding legend Tony Alva, and iconic female freestyler and member of the Skateboarding Hall of Fame Ellen O’Neal. It's also the first film Telluride local George Gage ever made! (George is also the founder of the legendary Billy Ball soft ball team.) This screening is free and open to the public, but a hat will be passed for donations to a fund to provide scholarships (or is is skaterships?) for kids who want to attend Telluride Skateboard Camp and could use a little financial help. A Hollywood agent finds himself in debt to a powerful bookie. …",
    pubDate: "2026-05-26T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-3/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-05-27T13:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/mahjong-6-1.png"
  },
  {
    title: "Romance with Rachel Book Club",
    link: "https://koto.org/event/romance-with-rachel-book-club-2/",
    description: "If you haven't been paying attention&#8230;. Romance is IN! Welcome to Wilkinson's newest book club celebrating the sales-sweeping genre on love and all its glory—Romance with Rachel. Each month, join Rachel in reading a romance novel from a new subgenre and then engage the group in discussion about all the nitty gritty details. At the end of the event, our ravenous romance readers will collaboratively choose the novel for the next month. May's book is \"The Elsewhere Express\" by Samantha Sotto Yambao—a cozier magical realism romance. Five copies will be first come, first serve for registrees. Reach out to Rachel at rbrand@telluridelibrary.org if you have trouble acquiring a copy. Location TBD, Rachel will reach out the week of the event to confirm.",
    pubDate: "2026-05-27T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/May-Poster-done.png"
  },
  {
    title: "Coffee and Climate Conversations",
    link: "https://koto.org/event/coffee-and-climate-conversations/",
    description: "For decades, environmental advocacy has shaped communities across San Miguel County. From our biggest wins, such as establishing the Valley Floor Conservation easement or creating a comprehensive Climate Action Plan, to ongoing conversations around land use, energy, waste and water issues in the face of our changing climate, our community continues to mobilize around the landscapes we call home. Join Sheep Mountain Alliance, EcoAction Partners, and local environmental advocates Joan May and Art Goodtimes for a discussion about environmentalism in our community over the decades: where have we been, and what will we do next? Whose voices should we center in these conversations, and how can we come together across different interest groups to envision a sustainable future? Join us for this exciting discussion about our region’s environmental legacy and future. As always, coffee, tea and pastries kindly provided. We hope to see you there!",
    pubDate: "2026-05-28T08:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-05-28/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-05-28T12:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Canvas & Cocktails",
    link: "https://koto.org/event/canvas-cocktails/",
    description: "Hosted by Telluride Arts and TMVOA as part of the One Square Foot project MAY 28, 2026 | 5–7 P.M. At Telluride Distilling Company in Mountain Village Drink specials, pizza, and all canvas/materials provided. No sign-up necessary Be part of the “This is Colorado” community art project, which will be displayed in a mosaic exhibition this July. All community members are invited to participate. More info: telluridearts.org/co-250-150 • info@telluridearts.org",
    pubDate: "2026-05-28T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Distilling Company, Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Create-Cocktails-1-scaled.jpg"
  },
  {
    title: "KOTO KOOKout at Greenwoods!",
    link: "https://koto.org/event/koto-kookout-at-greenwoods/",
    description: "KOOKout with KOTO in Ridgway ATTENTION RIDGWAY AND OURAY RESIDENTS! JOIN US FOR OUR INAUGURAL KOTO KOOKout!! Thursday, May 28 5 – 8 PM | Greenwoods Live music with T Bone, plus free apps & KOOK bumper stickers! Help shape the future of 90.3 FM K-O-O-K Now proudly serving Ouray County!",
    pubDate: "2026-05-28T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-05-29/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-05-29T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Impetus – A site-specific dance performace",
    link: "https://koto.org/event/impetus-a-site-specific-dance-performace/",
    description: "Impetus is a 45-minute site-specific movement performance utilizing the unique landscape of the skatepark. Dancers use momentum, gravity, and interaction with each other to create a cyclical feeling, mimicking the energetic frustrations many of us are feeling with the state of the world today. This event is FREE and open to the public, all ages welcome. Donations will be collected at the event.",
    pubDate: "2026-05-29T19:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/impetus-no-fringe-logo.png"
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-05-30/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-05-30T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "West End Democrats of San Miguel & Montrose County 2026 Primary Voter Listening Session",
    link: "https://koto.org/event/west-end-democrats-of-san-miguel-montrose-county-2026-primary-voter-listening-session/",
    description: "Tired of being assaulted by nonstop political campaign blather? Here’s an idea: a session where YOU get to express YOUR needs and pressing issues and to have those important concerns relayed to the folks running in the June 30 th primary election in Colorado. No campaign rhetoric, no stump speeches, just a chance for you to voice YOUR concerns. The West End Democrats of San Miguel and Montrose County invite you to a one-hour, informal listening session moderated by Emmy Award winning broadcast journalist Judy Muller. We especially urge younger, independent, and unaffiliated voters to attend. What are your concerns and issues? Please let us know so that we can relay them to all the candidates, a list which includes Governor, Attorney General, U.S. House of Representatives, Secretary of State and Treasurer. We will make sure you are heard! …",
    pubDate: "2026-05-30T11:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: ""
  },
  {
    title: "Party in the Park",
    link: "https://koto.org/event/party-in-the-park/",
    description: "TEF and there&#8230; are organizing our second annual Party in the Park! There will be great food and drinks, fun games, and amazing music, to celebrate our community!! All proceeds support our public schools!",
    pubDate: "2026-05-30T13:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Town Park, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/PITP-STD.png"
  },
  {
    title: "Gentle Yoga with Kristin Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristin-milord-2/2026-05-31/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class is free, but donations to support the instructor are welcome.",
    pubDate: "2026-05-31T11:00:00.000Z",
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
    pubDate: "2026-05-31T13:00:00.000Z",
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
    pubDate: "2026-05-31T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-02/",
    description: "Big science. Small town. Every Tuesday from June 2- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7.",
    pubDate: "2026-06-02T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Bardic Trails Online Poetry Night",
    link: "https://koto.org/event/bardic-trails-online-poetry-night-3/2026-06-02/",
    description: "The Telluride Institute's Bardic Trails poetry night features an award-winning guest poet sharing their new and exciting work. The reading will be followed with a Q & A about the poet’s work and inspirations, with time afterwards for poetry sharing from attendees – a Gourd Circle of sharing whatever poetry attendees wish, or just listening in. The list of 2026 poets is below. The free Bardic Trails virtual Zoom series is on the first Tuesday of each month. Visit to get the zoom link each month, Thanks to the Wilkinson Public Library, Cantor Family, the Guttman Family Foundation, CCAASE and our Fischer and Cantor contest participants for supporting our program and projects. Jan. 6 / Euro-American poet Dane Cervine of California Feb. …",
    pubDate: "2026-06-02T19:00:00.000Z",
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
    pubDate: "2026-06-04T12:30:00.000Z",
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
    pubDate: "2026-06-04T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png"
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-06-05/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-06-05T10:00:00.000Z",
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
    pubDate: "2026-06-05T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Science &#038; Innovation Center, TELLURIDE",
    imageUrl: ""
  },
  {
    title: "Lone Cone Librarys Annual Community Yard Sale & Bbq",
    link: "https://koto.org/event/lone-cone-librarys-annual-community-yard-sale-bbq/",
    description: "Our favorite spring tradition is back – the Lone Cone Library Community Yard Sale! Come browse treasures, support your neighbors, and enjoy a relaxed day on the lawn. Interested in being a vendor? Spaces are available for $10. If you’d like to reserve a spot, just fill out our quick sign‑up form at the front desk or below. Vendors are responsible for set up and clean-up of their items. Any items left behind will be taken care of in a respectful way (Donating, discarding, etc). 🍔 Community BBQ • 12–2pm Swing by for lunch while you shop. $10 per plate, includes a hamburger, a side, a drink and a cookie. Have items you no longer need? You can donate gently‑used items to the library ahead of the sale. We’ll add them to our tables, and all proceeds from donated items go directly toward supporting library programs.",
    pubDate: "2026-06-06T09:30:00.000Z",
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
    pubDate: "2026-06-06T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-06-07/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-06-07T13:00:00.000Z",
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
    pubDate: "2026-06-07T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Free Legal Clinic – Clínica Jurídica Gratuita",
    link: "https://koto.org/event/free-legal-clinic-clinica-juridica-gratuita/2026-06-09/",
    description: "A FREE legal clinic for parties who have no attorney. Sign up today because spots are limited. Volunteer attorneys will answer questions, help fill out forms, and explain the process and procedure for legalissues. The volunteer attorneys do not represent you and this clinic is information only. BY APPOINTMENT ONLY. Call 970-728-4519 for more information and to sign up. Una clínica de asesoramiento jurídico GRATUITO para las personas que notienen abogado. Abogados voluntarios responderán a preguntas, ayudarán a llenar formularios y explicarán el proceso y el procedimiento de cuestiones jurídicas. Los abogados voluntarios no te representan y esta clínica es sólo informativa. CON CITA PREVIA. Llame a 970-728-4519 para más información y para registrarse.",
    pubDate: "2026-06-09T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-09/",
    description: "Big science. Small town. Every Tuesday from June 2- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7.",
    pubDate: "2026-06-09T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-06-10/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-06-10T17:00:00.000Z",
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
    pubDate: "2026-06-11T09:00:00.000Z",
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
    pubDate: "2026-06-11T12:30:00.000Z",
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
    pubDate: "2026-06-11T17:30:00.000Z",
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
    pubDate: "2026-06-12T10:00:00.000Z",
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
    pubDate: "2026-06-12T19:00:00.000Z",
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
    pubDate: "2026-06-12T19:00:00.000Z",
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
    pubDate: "2026-06-13T10:00:00.000Z",
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
    pubDate: "2026-06-14T13:00:00.000Z",
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
    pubDate: "2026-06-14T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Talking Gourds Presents Stories and Poems",
    link: "https://koto.org/event/talking-gourds-presents-stories-and-poems/2026-06-16/",
    description: "The Telluride Institute’s Talking Gourds Poetry Program is hosting a live Stories & Poems series at the Wilkinson Public Library magazine room on the third Tuesday of every month at 5:30 pm. Following the featured poet's or story teller's reading we will hold a Talking Gourds sharing circle going around the room to let everyone speak. Attendees are encouraged to bring their own work or someone else’s that they like to share. For more information, visit the Telluride Institute Talking Gourds website: tellurideinstitute.org/talking-gourds",
    pubDate: "2026-06-16T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Telluride Science Town Talks",
    link: "https://koto.org/event/telluride-science-town-talks/2026-06-16/",
    description: "Big science. Small town. Every Tuesday from June 2- August 11, Telluride Science invites the public to sit down with some of the world’s most brilliant researchers for a conversation that might just change how you see the world. Town Talks cover everything from quantum computing and climate solutions to the latest in medicine and energy — accessible, thought-provoking, and completely free. Please note, there is no Town Talk on July 7.",
    pubDate: "2026-06-16T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-06-18/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-06-18T12:30:00.000Z",
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
    pubDate: "2026-06-18T17:30:00.000Z",
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
    pubDate: "2026-06-19T10:00:00.000Z",
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
    pubDate: "2026-06-20T10:00:00.000Z",
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
    pubDate: "2026-06-21T13:00:00.000Z",
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
    pubDate: "2026-06-21T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Holiday - Library Closed",
    link: "https://telluridelibrary.libcal.com/event/15920090?hs=a",
    description: "Monday, May – Monday, May",
    pubDate: "2026-05-25T00:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: ""
  }
];

const HUMANE_SOCIETY_ANIMALS = [

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
    title: "Love Your Trail Day",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3642",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3642",
    pubDate: "2026-06-06T08:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Uncompahgre River Walk - Ouray CO 81427",
    imageUrl: ""
  },
  {
    title: "Ouray County EMS Dinner - Community Needs Assessment Follow-Up",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3645",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3645",
    pubDate: "2026-05-25T17:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "- Ouray CO 81427",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-25T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-05-25T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Basketball and Volleyball Tournament - Hot Springs Style",
    link: "https://events.ourayridgwayevents.com/event/basketball-and-volleyball-tournament-hot-springs-style",
    description: "🏀🏐 Take on the competition this Memorial Day at the Ouray Hot Springs! Get ready for a fun, fast-paced showdown at the Basketball & Volleyball Tournament – Hot Springs Style! Join us on May 25 for a casual basketball and volleyball tournament. Signups begin at noon, with games happening in the activity pool and shallow pool around 2 PM. Grab your friends and enjoy a fun afternoon at the pool!",
    pubDate: "2026-05-25T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701346021520/huge/63080493e21c290f2831737b304b5c49b5e1128c.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-25T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-26T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-26T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Tourism Advisory Committee",
    link: "https://cityofouray.com/city_offices/committees___boards/tourism_advisory_committee.php",
    description: "The Ouray Tourism Advisory Committee (TAC) represents a cross-section of the small businesses, nonprofits, and residents of Ouray. We educate ourselves about best practices in the tourism industry, tourism marketing, and the visitor experience. We gather input, plan, prioritize, measure, and advise the City of Ouray on the best actions to take related to the tourism industry in our community.",
    pubDate: "2026-05-26T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Community Meditation",
    link: "www.ridgwayfuse.org",
    description: "Join us for a peer-led weekly meditation series at the Decker Community Room. Free and open to the public! We meet every 1st, 2nd, and 4th Tuesday of the month (all but the 3rd Tuesday!)",
    pubDate: "2026-05-27T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52338340283147/huge/582622671001d9ab20f8c25a5d229c9ecbbba165.jpg"
  },
  {
    title: "Economic Vitality Conversation",
    link: "https://events.ourayridgwayevents.com/event/economic-vitality-meeting",
    description: "📣 Community Conversation: Economic Vitality Data Join us for an engaging discussion with special guests Matt Gordon and Larry Lucas from the Colorado Department of Local Affairs. Who should attend? Local leaders, business owners, economic development professionals, entrepreneurs, and interested community members. All community members are welcome. Discussion topics include: • Communicating Ridgway’s opportunities and key community data to businesses, entrepreneurs, and investors • Identifying available data, gaps, and community needs This conversation builds on goals from the Town Master Plan, Ridgway FUSE Creative Main Street, and broader regional initiatives. SEE FULL AGENDA HERE Interested in attending? RSVP to Tera Wick at twick@town.ridgway.co.us or call (970) 626-5308 ext. 215.",
    pubDate: "2026-05-27T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52922480227239/huge/947d1bad2aeb685f292e305dab2d8be8b33038c5.jpg"
  },
  {
    title: "Rooftop Rhythm",
    link: "https://events.ourayridgwayevents.com/event/rooftop-rhythm",
    description: "Chipeta Lodge Resort + Spa announces \"Rooftop Rhythm\" on Wednesday at 5:30-8:30 PM on the rooftop at White Buffalo Restaurant + Bar. First up, James O. Patterson joins us Wednesday May 27th, 2026. Come for cocktails, casual dining, and incomparable sunsets. This Wednesday's featured burger specials include the Fuddrucker Smashburger, a Green Chile Cheeseburger, & an Adobo Black Bean Veggie Burger, all served with crispy fries and option add-ons. Bring your friends, grab a seat on the rooftop, and settle in for a spectacular summer evening.",
    pubDate: "2026-05-27T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52948785665803/huge/11d4d632f53929a839e01aa0a3c9aeb19b288438.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-05-28T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "www.beetrueyou.com",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person.",
    pubDate: "2026-05-28T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-05-28T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-28T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "The Lord of the Rings: The Fellowship of the Ring: Movie Night @ The Wright",
    link: "https://thewrightoperahouse.org/",
    description: "The Lord of the Rings: The Fellowship of the Ring: Movie Night @ the Wright WHEN? Wednesday, May 28 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 58min RATING: PG-13 ROTTEN TOMATOES SCORE: 91% ABOUT THE FILM This movie was chosen to be just in time for fans of the Genre and precedes our live theatre event: \"Fly, You Fools!\" The Lord of the Rings: The Fellowship of the Ring (2001) follows a young hobbit, Frodo Baggins, as he sets out on a perilous journey to destroy a powerful ring and prevent it from falling into the hands of darkness. Joined by a fellowship of unlikely allies, Frodo travels across Middle-earth facing danger, temptation, and the growing shadow of evil in an epic tale of courage, friendship, and sacrifice. …",
    pubDate: "2026-05-29T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52568666129757/huge/1fe32b4a28a59494b608daafcb284a172935afe5.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-05-29T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 7:00 PM. Karaoke Begins at 8:00 PM",
    pubDate: "2026-05-29T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52633505531238/huge/33b9b47c734793a754893ee4e67227b39326b67b.jpg"
  },
  {
    title: "Ridgway Last Day of School",
    link: "https://www.ridgway.k12.co.us/page/district-calendar/",
    description: "",
    pubDate: "2026-05-29T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-05-29T16:00:00.000Z",
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
    pubDate: "2026-05-29T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-29T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Final Friday: School's Out Let's Go!",
    link: "https://www.voyageryouth.org/hubb-teen-events",
    description: "SCHOOL'S OUT LET'S GO! For Middle & High School Students, Final Friday is reclaiming Voyager as the Teen Center it used to be. 🤘 Come hang out for an evening that mixes chill social time with free food and fun activities. Every month, we have games, art and more available. All we ask is that you clean up after yourself and help us create a welcoming space for everyone. This month, meet Jazzmin, Voyager's new Teen Program Assistant who will be leading Adventure Wednesdays and Multi-Day Trips. We will have a new juggling kit to celebrate and share a party trick that she's been developing as well as Summer Survival Mystery Bags to take home with you. TO RSVP STEP 1: Once a year, make or update an account with Voyager so we have access to important information to best serve the Teens that are attending. …",
    pubDate: "2026-05-29T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52860999139790/huge/5cdf44deaab00132052e2601f35f9a2a76fc9960.jpg"
  },
  {
    title: "Fly You Fools Presented by UpstART | Opening Night | Fri 5/29/26",
    link: "https://thewrightoperahouse.org/",
    description: "Fly You Fools Presented by UpstART | Opening Night | Fri 5/29/26 WHEN? Friday, May 29 Doors at 7:00 pm • Show at 7:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-30T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52382837970272/huge/efa20aea189f55b2258da20d2382a48a7bde31a0.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Bear Creek NRT",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-30T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bear Creek Trail Head south of Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52789326237006/huge/bd0e715520daa45a021ccfc75c4938dfef1aed85.jpg"
  },
  {
    title: "Family Fun Fest and Used Book Sale",
    link: "https://events.ourayridgwayevents.com/event/family-fun-fest-and-used-book-sale",
    description: "Celebrate the library with a fun and free event for all! Hosted by the Friends of the Ridgway Library, Summer Fun Fest & Book Sale brings readers of all ages together to celebrate summer, reading, and your library. Enjoy a day filled with activities including chalk art, crafts, face painting, shaved ice, a used book sale, a fly fishing clinic for ages 10+, and a bike maintenance clinic — bring your bike! All activities are free and everyone is welcome. Sign up for the bike clinic and fly casting clinic at the library or call 970-626-5252. Volunteers are needed! Contact jill.hepp@friendsofridgwaylibrary.org if you are interested in volunteering. Hosted by Friends of the Ridgway Library.",
    pubDate: "2026-05-30T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52886186007930/huge/bfbbb0ceaf2c0b102794d880373c99a34a6c541b.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-05-30T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "Ute Indian Museum Community Appreciation Festival",
    link: "https://events.ourayridgwayevents.com/event/ute-indian-museum-community-appreciation-festival",
    description: "Ute Indian Museum | Free Community Celebration Saturday, May 30 | 10am–3pm Spend the day with us at the Ute Indian Museum for a free, all-ages celebration of Native culture and community. Browse Native American vendors, explore a native created immersive gallery, and stay for a live cultural performance at noon. Ther performance includes: World Champion Hoop DancersFlute PlayingStorytelling Free admission. All ages welcome.",
    pubDate: "2026-05-30T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ute Indian Museum",
    imageUrl: "https://localist-images.azureedge.net/photos/52957925886030/huge/5ff9950ecfead1ac4b649b9f36306fddef0b157f.jpg"
  },
  {
    title: "WOWSERS",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-30T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "The Yawpers! Live at the Sherbino",
    link: "https://sherbino.org/events/category/music/",
    description: "https://sherbino.org/events/category/music/ Doors at 6:45 pm | Opener at 7:15 pm | The Yawpers at 8:00 pm $25 advance / $30 day of show / A limited amount of tables are available for this show Get ready for a high-octane night of raw, unapologetic rock and roll as The Yawpers take over the Sherbino stage! For over 15 years, The Yawpers have built a reputation as one of the most electrifying rock bands on the road—driven by gritty guitar riffs, relentless energy, and a sound that pulls from garage rock, punk, blues, and Americana. Their live shows are loud, fast, and wildly infectious—exactly the kind of experience that reminds you why rock and roll still matters. Now hitting the road with new music on the horizon, The Yawpers are bringing their signature intensity and edge back to Ridgway. …",
    pubDate: "2026-05-31T01:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52403083528953/huge/e7eb8757e5dcaf8d14e07216a616734c89871529.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-31T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  },
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
    title: "GOLDPINE ~ Live at The Courtyard at 610",
    link: "https://sherbino.org/event/goldpine-ridgway-concert-may-31-2026/",
    description: "GOLDPINE at the Courtyard at 610 (enter via the alley behind the Sherbino and 610 Gallery) || Gates & Bar: 6 pm || Showtime: 6:30 pm || All General Admission Seating || $25 advance || $30 day of show || Buy Tickets From Bristol Rhythm & Roots Reunion and the Kansas City Chiefs’ Arrowhead Stadium to listening rooms throughout the United States, husband-wife duo GOLDPINE has been offering their own brand of bold harmony-driven Americana to audiences large and small. WINNER of the 2022 Rocky Mountain Songwriter Contest, their distinctive harmonies are clearly a channel for their sometimes-raucous, sometimes-reminiscent compositions. With an incredible collection of stories about life, love, and purpose, their live performance is a powerful projection of everything Goldpine is about: striking vocals, bold harmony, and introspection into the human experience. …",
    pubDate: "2026-06-01T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52252954261031/huge/a6e0971bed5331dc9b04a9d11a417ef4af3c14c3.jpg"
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
    title: "Parks and Recreation Committee (PARC)",
    link: "https://cityofouray.com/city_offices/committees___boards/parks_and_recreation_committee.php",
    description: "The Parks and Recreation Committee (PARC) is made up of community members who volunteer their time to support and enhance recreational opportunities in Ouray. PARC organizes safe, family-friendly events that bring the community together. Events include Broomball, Cabin Fever Days, Dodgeball, Softball, and Game Night, among others. The committee works closely with local organizations, businesses, and other City committees to carry out its mission. Community partners include the Ouray Hot Springs Pool & Fitness Center, the Beautification Committee, and the Ouray School District. PARC also plays an important role in developing and implementing master plans for the City’s park system, helping ensure that Ouray’s parks and recreational spaces serve residents and visitors for years to come. Members of the public are welcome to attend these meetings. Meetings: PARC meets monthly on the first Tuesday at 6:00 p.m. …",
    pubDate: "2026-06-03T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c6145ef61e306a4ae09b9adae1c263887c36248c.jpg"
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
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 7:00 PM. Karaoke Begins at 8:00 PM",
    pubDate: "2026-06-05T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52633505531238/huge/33b9b47c734793a754893ee4e67227b39326b67b.jpg"
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

const TELLURIDE_COM_EVENTS = [];

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
    title: "Public Hearing -- OWTS Variance Application (Sheamus Croke - Ophir)",
    entity: "San Miguel County Board of Health",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "San Miguel County Board of Health will consider an OWTS Variance Application for Sheamus Croke, owner of Lots 5 and 6 Block M Ophir, to reduce setback from Soil Treatment Area to southwest property line from 10 feet to 2 feet. Public hearing scheduled for May 27, 2026 at 2:00 PM.",
    deadline: "May 27, 2026 at 2:00 PM",
    expires: "2026-05-27",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Lots 5 and 6 Block M Ophir",
    noticeKey: "owts-variance-croke-ophir-2026"
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
    title: "Request for Proposal -- Request for Proposal for San Miguel County Road 58P Retaining Wall Construction",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for San Miguel County Road 58P Retaining Wall Construction.",
    deadline: "Closes 5/26/2026",
    expires: "2026-05-26",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=203",
    address: "",
    smcBidID: "203"
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
    title: "RFP -- MSE Retaining Wall Design and Construction",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is soliciting proposals for design and construction of a mechanically stabilized earth retaining wall on County Road 58P north of Sawpit. A mandatory pre-bid meeting is May 14, 2026 at 1:00 PM, with proposals due May 26, 2026 at 5:00 PM.",
    deadline: "May 26, 2026 at 5:00 PM",
    expires: "2026-05-26",
    dates: "5/14",
    papers: ["ttimes_0514"],
    url: "https://www.telluridenews.com/news/legals/article_37e5c98c-cc98-40ed-b749-f4e550c9ec5d.html",
    address: "County Road 58P north of Sawpit, CO",
    noticeKey: "COL-000125"
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
    title: "Special Use Permit -- Scenic and Social Use (Parcel #452726103022)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a public hearing on a Special Use Permit application for scenic and social use of property. The hearing is scheduled for May 14, 2026 at 10:30 a.m. at the Sheriff's Annex Building in Norwood. Written comments must be received by noon on April 30, 2026.",
    deadline: "2026-04-30 12:00",
    expires: "2026-05-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO, Parcel #452726103022",
    noticeKey: "special-use-452726103022-scenic"
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
    summary: "John Miller on behalf of Kurt Works Inc. and Kurt Crockett has applied for a Special Use Permit to establish a construction/contractor office and staging area for excavation and grading business operations. The San Miguel County Planning Commission will hold a public hearing on May 14, 2026 at 10:45 a.m. Written comments must be received by noon on April 30, 2026.",
    deadline: "2026-04-30 12:00",
    expires: "2026-05-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO, Parcel #452726103022",
    noticeKey: "special-use-452726103022-contractor"
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
    summary: "San Miguel County is requesting proposals for a contractor to replace flooring at 333 & 305 W. Colorado Ave in Telluride. Proposals must be submitted by 5:00 PM on Friday, May 24th either via email or dropped off at the Maintenance department. Contact Greg Pollio for more information.",
    deadline: "2026-05-24 17:00",
    expires: "2026-05-24",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-telluride-2026"
  },
  {
    title: "RFP -- Landscape Improvements at Galloping Goose Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals for landscape improvements to the Galloping Goose Park in Telluride. Proposals must be submitted by 5:00 PM on Friday, May 22 either via email or dropped off at the Parks & Open Space department. Contact Janet Kask for more information.",
    deadline: "2026-05-22 17:00",
    expires: "2026-05-22",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "Galloping Goose Park, Telluride, CO",
    noticeKey: "rfp-galloping-goose-landscape-2026"
  },
  {
    title: "ITB -- Mill Creek Pressure Reducing Valve Vault Installation",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Town of Telluride is soliciting sealed bids for a PRV vault installation project at Mill Creek. Bids must be received by 4 PM on Thursday, April 30, 2026 at the Public Works & Transit Facility or via confirmed electronic submission. Bid documents are available through Public Works or online.",
    deadline: "2026-04-30 16:00",
    expires: "2026-04-30",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "Mill Creek, Telluride, CO",
    noticeKey: "itb-mill-creek-prv-2026"
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
      agendaLink: m.agendaUrl || null
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
          hasAgenda: hasAgendaCombined
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
      hasAgenda
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
      hasAgenda
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
      hasAgenda
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
