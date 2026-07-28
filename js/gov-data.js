/* ══════════════════════════════════════════════════════
   GOV DATA — Static reference data for the Gov Hub
   Board caches, meeting metadata, land use issues,
   entity logos, topic definitions, festival calendar.
   This file is NOT modified by the content-refresh bot.
   ══════════════════════════════════════════════════════ */

const COUNTY_CIVICCLERK_BASE = 'https://sanmiguelcoco.portal.civicclerk.com/event/';

const COUNTY_CIVICCLERK_FALLBACK = 'https://sanmiguelcoco.portal.civicclerk.com';

const COUNTY_CIVICCLERK_IDS = {
  'Board of County Commissioners Special Meeting|2026-03-25': 864,
  'Board of County Commissioners Meeting|2026-03-25': 864,
  'Planning Commission and Board of County Commissioners Joint Work Session|2026-03-26': 971,
  'Joint Work Session|2026-03-26': 971,
  'Board of County Commissioners Meeting|2026-04-01': 882,
  'Board of County Commissioners Work Session|2026-04-08': 986,
  'Planning Commission|2026-04-02': 1025,
  'San Miguel County: Planning Commission|2026-04-02': 1025,
  // 2026-05-13 BOCC — partial-date fallback in getCountyAgendaLink will catch
  // any title variation as long as the date matches.
  'Board of County Commissioners Meeting|2026-05-13': 999,
  // 2026-05-14 Planning Commission — 1705 = full packet, 1704 = agenda only
  'Planning Commission Meeting|2026-05-14': 919,
  'Planning Commission|2026-05-14': 919,
};

// eventId -> hosted PDF path (takes priority over CivicClerk viewer link)
const COUNTY_HOSTED_PACKETS = {
  919: '/assets/packets/planning-commission-2026-05-14-packet.pdf',  // Planning Commission May 14 2026
};

const COUNTY_CIVICCLERK_AGENDA_FILES = {
  1025: 1652,  // Planning Commission Apr 2 2026
  999:  1702,  // BOCC May 13 2026
  919:  1705,  // Planning Commission May 14 2026
};

const COUNTY_CACHE_DATE = '2026-03-25';

const COUNTY_CACHED_DATA = [
  // ── March 2026 ──
  {
    date: 'March 25, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 864,
    note: null
  },
  {
    date: 'March 26, 2026',
    time: '9:30 AM - 12:00 PM',
    title: 'Planning Commission and Board of County Commissioners Joint Work Session',
    type: 'planning',
    location: '333 West Colorado Ave, 2nd Floor, Telluride, CO 81435',
    civicClerkId: 971,
    note: 'Joint session -- Accelerated Housing Review, Forestry Code, and related topics.'
  },
  // ── April 2026 ──
  {
    date: 'April 1, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 882,
    note: null
  },
  {
    date: 'April 8, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Work Session',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 986,
    note: null
  },
  // April 6-17 Spring Break -- no BOCC meetings
  {
    date: 'April 22, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'April 27, 2026',
    time: '1:30 PM - 3:30 PM',
    title: 'Housing Code Update -- SSR Meeting #5',
    type: 'ssr',
    location: '333 West Colorado Ave, 2nd Floor, Telluride, CO 81435',
    civicClerkId: null,
    agendaUrl: '/assets/ssr/14206-April-SSR-No-5-Meeting-Packet.pdf',
    note: '2-hour working session of the Stakeholder Strategic Roundtable for the SMC Housing Code Update. Agenda: Recap of Project Objectives (5 min) -- Accelerated Housing Review (25 min) -- Draft Code Recommendations (85 min) -- Closing (5 min). Zoom: 860 9725 9982 / passcode 731354 (https://us06web.zoom.us/j/86097259982).'
  },
  {
    date: 'April 29, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  // ── May 2026 ──
  {
    date: 'May 6, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'May 13, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 999,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'May 14, 2026',
    time: '9:30 AM',
    title: 'Planning Commission Meeting',
    type: 'planning',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 919,
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/919/files/agenda/1705',
    note: 'Public hearings on land use applications and code amendments (footprint definitions, accelerated housing review). Work session on natural medicine code amendments.'
  },
  {
    date: 'May 20, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: 896,
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/896/files/agenda/1716',
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'May 27, 2026',
    time: '2:00 PM - 6:30 PM',
    title: 'Board of County Commissioners Special Meeting in Telluride 2:00 pm - 2:45 pm',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride (2-2:45 pm) then Placerville School House (work session 4-6:30 pm)',
    civicClerkId: 1035,
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/1035/files/agenda/1762',
    note: 'Special meeting + work session. Agenda posted May 22.'
  },
  // ── June 2026 ──
  {
    date: 'June 3, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.',
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/884/files/agenda/1847'
  },
  {
    date: 'June 10, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.',
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/1040/files/agenda/1857'
  },
  {
    date: 'June 17, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.',
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/897/files/agenda/1869'
  },
  {
    date: 'June 24, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'July 8, 2026',
    time: '5:30 PM',
    title: 'Board of County Commissioners Special - In Norwood at Sheriff Annex',
    type: 'bocc',
    location: '1110 Summit Street, Norwood Sheriff Annex, Norwood, CO 81423',
    civicClerkId: 1001,
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/1001/files/agenda/1899'
  },
  {
    date: 'July 9, 2026',
    time: '9:30 AM',
    title: 'Planning Commission and Board of County Commissioners Joint Work Session',
    type: 'planning',
    civicClerkId: 921,
    agendaUrl: 'https://sanmiguelcoco.portal.civicclerk.com/event/921/files/agenda/1903'
  }
];

const SMART_BOARD_URL = 'https://smarttelluride.colorado.gov/board-meetings';

const SMART_CACHE_DATE = '2026-07-28';

const SMART_CACHED_DATA = [
  {
    date: "July 9, 2026",
    time: "4:00 PM",
    title: "SMART Board of Directors",
    location: "SMART Office, Lawson Hill (also virtual — see agenda)",
    agendaUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Agenda_July-23rd-2026_distributed.pdf",
    packetUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_July-23rd-2026.pdf"
  },
  {
    date: "August 13, 2026",
    time: "4:00 PM",
    title: "SMART Board of Directors",
    location: "SMART Office, Lawson Hill (also virtual — see agenda)",
    agendaUrl: null,
    packetUrl: null
  }
];

const TMVOA_URL = 'https://tmvoa.org/meetings-events/meeting-materials/';

const TMVOA_CACHE_DATE = '2026-07-28';

// TMVOA (Telluride Mountain Village Owners Association) — a private HOA, not
// a government body, but its Gondola Leadership/Subcommittee meetings and
// Board of Directors meetings are of high public interest given TMVOA's
// 12.5% share of gondola cost-sharing (see GONDOLA_STAKEHOLDERS). Rebuilt
// every run by syncTMVOAAgendas() from the live meeting-materials page —
// see that function for the robots.txt-aware scraping note.
const TMVOA_CACHED_DATA = [
  {
    date: "July 9, 2026",
    title: "TMVOA Board of Directors Meeting",
    board: "board",
    agendaUrl: "https://tmvoa.org/site/assets/files/4760/tmvoa_board_meeting_agenda_7_9_26_revised.pdf",
    packetUrl: "https://tmvoa.org/site/assets/files/4760/tmvoa_board_meeting_packet_7_9_26_final.pdf",
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "July 14, 2026",
    title: "Mountain Village Merchant Meeting",
    board: "merchant",
    agendaUrl: null,
    packetUrl: null,
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "July 20, 2026",
    title: "Gondola Subcommittee Meeting",
    board: "gondola",
    agendaUrl: "https://tmvoa.org/site/assets/files/4817/07_20_26_gsub_gondola_agenda_english_spanish.pdf",
    packetUrl: "https://tmvoa.org/site/assets/files/4817/july_20-_2026_meeting_packet_english.pdf",
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "July 23, 2026",
    title: "TMVOA Board of Directors Meeting",
    board: "board",
    agendaUrl: "https://tmvoa.org/site/assets/files/4822/tmvoa_board_meeting_agenda_7_23-1.pdf",
    packetUrl: "https://tmvoa.org/site/assets/files/4822/tmvoa_board_meeting_packet_7_23-1.pdf",
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "July 23, 2026",
    title: "TMVOA Annual Members Meeting",
    board: "annual",
    agendaUrl: "https://tmvoa.org/site/assets/files/4727/tmvoa_annual_members_meeting_agenda_7_23_26.pdf",
    packetUrl: "https://tmvoa.org/site/assets/files/4727/tmvoa_annual_members_meeting_packet_7_23_26.pdf",
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "July 28, 2026",
    title: "Gondola Leadership Committee Meeting",
    board: "gondola",
    agendaUrl: "https://tmvoa.org/site/assets/files/4825/07_28_26_leadership_gondola_agenda_updated.pdf",
    packetUrl: "https://tmvoa.org/site/assets/files/4825/07_28_26_leadership_gondola_committee_packet.pdf",
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "August 11, 2026",
    title: "Mountain Village Merchant Meeting",
    board: "merchant",
    agendaUrl: null,
    packetUrl: null,
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "August 20, 2026",
    title: "TMVOA Investment Committee Meeting",
    board: "investment",
    agendaUrl: null,
    packetUrl: null,
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "September 8, 2026",
    title: "Mountain Village Merchant Meeting",
    board: "merchant",
    agendaUrl: null,
    packetUrl: null,
    location: "Mountain Village, CO (see agenda for Zoom link)"
  },
  {
    date: "October 13, 2026",
    title: "Mountain Village Merchant Meeting",
    board: "merchant",
    agendaUrl: null,
    packetUrl: null,
    location: "Mountain Village, CO (see agenda for Zoom link)"
  }
];

const MV_TC_URL = 'https://townofmountainvillage.com/government/town-council/town-council/';

const MV_DRB_URL = 'https://townofmountainvillage.com/business/planning/design-review-board/';

const MV_CACHE_DATE = '2026-07-28';

const MV_CACHED_DATA = [
  {
    date: "August 6, 2026",
    time: "10:00 AM - 3:00 PM",
    title: "Design Review Board",
    board: "drb",
    agendaUrl: "https://townofmountainvillage.com/site/assets/files/49516/august_6-_2026_design_review_board_meeting_agenda.pdf",
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A"
  },
  {
    date: "August 20, 2026",
    time: "2:00 PM - 8:00 PM",
    title: "Town Council Meeting",
    board: "tc",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A",
    note: "Agenda typically posted the Friday before."
  },
  {
    date: "September 3, 2026",
    time: "10:00 AM - 3:00 PM",
    title: "Design Review Board",
    board: "drb",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A",
    note: "Agenda typically posted the Friday before."
  },
  {
    date: "September 17, 2026",
    time: "2:00 PM - 7:45 PM",
    title: "Town Council Meeting",
    board: "tc",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A",
    note: "Agenda typically posted the Friday before."
  },
  {
    date: "October 1, 2026",
    time: "10:00 AM - 3:00 PM",
    title: "Design Review Board",
    board: "drb",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A",
    note: "Agenda typically posted the Friday before."
  },
  {
    date: "October 7, 2026",
    time: "10:00 AM - 5:00 PM",
    title: "Town Council Meeting",
    board: "tc",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "Town Hall, 455 Mountain Village Blvd, Suite A",
    note: "Agenda typically posted the Friday before."
  }
];

const SCHOOL_BOARD_URL = 'https://www.tellurideschool.org/agendasandminutes';

const SCHOOL_CACHE_DATE = '2026-03-24';

const SCHOOL_CACHED_DATA = [
  // ── Upcoming (no agendas yet) ──
  {
    date: 'April 20, 2026',
    time: '5:15 PM',
    title: 'Telluride Board of Education Special Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/42026_boe_special_meeting.pdf',
    packetUrl: null,
    special: true,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Special meeting -- agenda posted closer to the date.'
  },
  {
    date: 'April 27, 2026',
    time: '3:30 PM',
    title: 'Telluride Board of Education Work Session',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Next scheduled work session -- agenda posted closer to the date.'
  },
  {
    date: 'April 28, 2026',
    time: '5:15 PM',
    title: 'Telluride Board of Education Monthly Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/42826_mm_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Next scheduled monthly meeting -- agenda posted closer to the date.'
  },
  {
    date: 'May 18, 2026',
    time: '3:30 PM',
    title: 'Telluride Board of Education Work Session',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/51826_ws_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'May 19, 2026',
    time: '5:15 PM',
    title: 'Telluride Board of Education Monthly Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/51926_mm_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'June 9, 2026',
    time: '3:30 PM',
    title: 'Telluride Board of Education Work Session',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'June 9, 2026',
    time: '5:15 PM',
    title: 'Telluride Board of Education Monthly Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/6926_mm_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  // ── Recent (with agendas) ──
  {
    date: 'March 16, 2026',
    time: '3:30 PM',
    title: 'Telluride Board of Education Work Session',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/31626_ws_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'March 17, 2026',
    time: '5:15 PM',
    title: 'Telluride Board of Education Monthly Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/31726_mm_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  }
];

const FIRE_BOARD_URL = 'https://www.telluridefire.com/board-meetings';

const FIRE_CACHE_DATE = '2026-05-12';

const FIRE_CACHED_DATA = [
  // ── Upcoming (3rd Tuesday of each month, 5:30 PM) ──
  {
    date: 'May 19, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/9e90a32e9/Agenda+-May+19th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435',
    note: 'Next scheduled meeting -- agenda typically posted a few days before.'
  },
  {
    date: 'June 16, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/978c9813f/Agenda+-June+16th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  },
  {
    date: 'July 21, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  },
  // ── Recent (with agendas) ──
  {
    date: 'April 21, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/d960bb1a5/Agenda+-April+21st%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  },
  {
    date: 'March 17, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/3d3e8ccfb/Agenda+-March+17th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  }
];

const MED_BOARD_URL = 'https://www.tellmed.org/board-meetings';

const MED_CACHE_DATE = '2026-07-28';

const MED_CACHED_DATA = [
  {
    date: "August 27, 2026",
    time: "8:30 AM - 11:30 AM",
    title: "Regular Board Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "333 W Colorado Ave (2nd Floor), Telluride / Zoom",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "September 24, 2026",
    time: "8:30 AM - 11:30 AM",
    title: "Regular Board Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: "333 W Colorado Ave (2nd Floor), Telluride / Zoom",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  }
];

const NORWOOD_BOT_URL = 'https://www.norwoodtown.com/board-of-trustees-meetings';

const NORWOOD_PZ_URL = 'https://www.norwoodtown.com/planning-and-zoning-commission-meetings';

const NORWOOD_NWC_URL = 'https://www.norwoodtown.com/nwc-meetings';

const NORWOOD_SAN_URL = 'https://www.norwoodtown.com/norwood-sanitation-district-meeting';

const NORWOOD_CACHE_DATE = '2026-07-28';

const NORWOOD_CACHED_DATA = [
  {
    date: "July 29, 2026",
    time: null,
    title: "Board of Trustees Work Session",
    agendaUrl: "https://www.norwoodtown.com/files/62b999f7f/07.29.2026+Work+Session+Board+of+Trustee+Agenda+ADA.pdf",
    packetUrl: null,
    special: false,
    board: "bot"
  },
  {
    date: "July 29, 2026",
    time: null,
    title: "NWC Possible Quorum",
    agendaUrl: "https://www.norwoodtown.com/files/1c026ffd5/07+2026+QUORUM+NOTICE.pdf",
    packetUrl: null,
    special: false,
    board: "nwc"
  },
  {
    date: "August 11, 2026",
    time: null,
    title: "Norwood Water Commission Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "nwc",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "August 12, 2026",
    time: null,
    title: "Board of Trustees Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "bot",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "August 17, 2026",
    time: null,
    title: "Planning and Zoning Commission Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "pz",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "September 8, 2026",
    time: null,
    title: "Norwood Water Commission Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "nwc",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "September 9, 2026",
    time: null,
    title: "Board of Trustees Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "bot",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  },
  {
    date: "September 21, 2026",
    time: null,
    title: "Planning and Zoning Commission Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "pz",
    note: "Next scheduled meeting -- agenda posted before the meeting."
  }
];

const OPHIR_GA_URL = 'https://townofophir.colorado.gov/general-assembly-2';

const OPHIR_PZ_URL = 'https://townofophir.colorado.gov/planning-and-zoning';

const OPHIR_CACHE_DATE = '2026-07-28';

const OPHIR_CACHED_DATA = [
  {
    date: "August 18, 2026",
    time: null,
    title: "General Assembly Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "ga"
  },
  {
    date: "September 15, 2026",
    time: null,
    title: "General Assembly Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "ga"
  }
];

// ── Town of Rico Board of Trustees (colorado.gov / Drupal) ──
// Meets the 3rd Wednesday of every month at 7:00 PM, Rico Town Hall
// (2 Commercial St). Agendas/packets posted the Wednesday prior; meetings
// are also live-streamed on the Town's YouTube channel. getRicoMeetings()
// in gov-helpers.js generates the upcoming 3rd-Wednesday meetings and pulls
// each meeting's Agenda/Packet/Minutes PDFs from RICO_AGENDA_MAP, which the
// bot refreshes from the Board of Trustees page every 6h.
const RICO_BOARD_URL = 'https://townofrico.colorado.gov/government/board-of-trustees';

const RIDGWAY_COUNCIL_URL = 'https://townofridgway.colorado.gov/i-want-to/ridgway-town-council';

const RIDGWAY_CACHE_DATE = '2026-07-28';

// Ridgway meeting stubs. Town Council = 2nd Wednesday @ 6:00 PM; Planning
// Commission = 3rd Wednesday @ 5:30 PM. The agenda/packet PDF for each date is
// auto-filled from RIDGWAY_AGENDA_MAP (gov-helpers.js), which the bot refreshes
// from the two colorado.gov board pages every 6h. Keep a couple of future stubs
// ahead of today so upcoming meetings render before their agenda is posted.
const RIDGWAY_CACHED_DATA = [
  {
    date: "July 8, 2026",
    time: "6:00 PM",
    title: "Ridgway Town Council Regular Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "council"
  },
  {
    date: "July 15, 2026",
    time: "5:30 PM",
    title: "Ridgway Planning Commission Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "pc"
  },
  {
    date: "August 12, 2026",
    time: "6:00 PM",
    title: "Ridgway Town Council Regular Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "council"
  },
  {
    date: "September 9, 2026",
    time: "6:00 PM",
    title: "Ridgway Town Council Regular Meeting",
    agendaUrl: null,
    packetUrl: null,
    special: false,
    board: "council"
  }
];

// ── Town of Telluride CivicWeb meeting portal ──
// Same telluride-co.civicweb.net portal the County uses; Town meetings have
// their own meeting IDs in the same system.
const TOWN_CIVICWEB_BASE = 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=';
const TOWN_CIVICWEB_FALLBACK = 'https://telluride-co.civicweb.net/Portal/MeetingTypeList.aspx';

// Map of "title|YYYY-MM-DD" -> CivicWeb meeting ID for Town meetings
// Find IDs at https://telluride-co.civicweb.net/Portal/MeetingTypeList.aspx
const TOWN_CIVICWEB_IDS = {
  'HARC Meeting|2026-05-20': 8014,
  // Add new entries here as agendas are posted, e.g.:
  // 'HARC Meeting|2026-06-17': XXXX,
  // 'Town Council Meeting|2026-MM-DD': XXXX,
};

const TELLURIDE_HARC_URL = 'https://telluride.gov/100/Historic-and-Architectural-Review-Commis';

const TELLURIDE_CACHE_DATE = '2026-05-11';

const TELLURIDE_CACHED_DATA = [
  // ── Historic and Architectural Review Commission (HARC) ──
  // Meets 3rd Wednesday of each month at Rebekah Hall, Telluride
  {
    date: 'May 20, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    civicWebId: 8014,
    note: 'Agenda includes Carhenge and Shandoka worksessions.'
  },
  {
    date: 'June 17, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8016'
  },
  {
    date: 'July 15, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8018'
  },
  {
    date: 'August 19, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: null
  },
  {
    date: 'September 16, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: null
  },
  {
    date: 'October 21, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: null
  },
  {
    date: 'November 18, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: null
  },
  {
    date: 'December 16, 2026',
    title: 'HARC Meeting',
    board: 'harc',
    location: 'Rebekah Hall, 201 N. Pine Street, Telluride',
    agendaUrl: null
  }
];

const AIRPORT_BOARD_URL = 'https://tellurideairport.com/traa-board-information/';

const AIRPORT_CACHE_DATE = '2026-03-25';

const AIRPORT_CACHED_DATA = [
  // Jan 15 already past
  {
    date: 'May 21, 2026',
    title: 'TRAA Board of Commissioners Meeting',
    time: '12:00 PM',
    location: 'Terminal Observation Lounge, Telluride Regional Airport',
    note: 'Regular board meeting of the Telluride Regional Airport Authority.'
  },
  {
    date: 'July 16, 2026',
    title: 'TRAA Board of Commissioners Meeting',
    time: '12:00 PM',
    location: 'Terminal Observation Lounge, Telluride Regional Airport',
    note: 'Regular board meeting of the Telluride Regional Airport Authority.'
  },
  {
    date: 'September 17, 2026',
    title: 'TRAA Board of Commissioners Meeting',
    time: '12:00 PM',
    location: 'Terminal Observation Lounge, Telluride Regional Airport',
    note: 'Regular board meeting of the Telluride Regional Airport Authority.'
  },
  {
    date: 'November 19, 2026',
    title: 'TRAA Board of Commissioners Meeting',
    time: '12:00 PM',
    location: 'Terminal Observation Lounge, Telluride Regional Airport',
    note: 'Regular board meeting of the Telluride Regional Airport Authority.'
  }
];

const GOVHUB_FUNCTIONS_BASE = 'https://us-central1-telluride-gov-hub.cloudfunctions.net';

const SUMMARY_REJECT_PATTERNS = [
  /provided agenda/i, /calendar navigation/i, /no detailed agenda/i,
  /appears to be/i, /could not (be |)pars/i, /unable to (extract|parse|read)/i,
  /no agenda (content|items|data)/i, /placeholder/i, /rather than specific/i,
  /no .{0,20}content .{0,20}available/i, /navigation page/i,
  /meeting agenda items/i, /agenda text/i, /cannot (be |)determin/i,
  /insufficient (data|information|content)/i
];

const WHY_THIS_MATTERS = [

  // ── PUD / Zoning / Development ──
  {
    match: /carhenge|700 w pacific/i,
    popup: 'Town Council is considering a Planned Unit Development at the former Carhenge site — a potential deed-restricted workforce housing project near the gondola. This is a work session: no final vote, but the direction set here shapes the formal application. Key questions: how many units, at what income levels, and how will parking and neighborhood impacts be managed? Work sessions are the best opportunity for public input before review narrows options.',
    decision: 'Whether to approve a Planned Unit Development (PUD) for the former Carhenge site at 700 W Pacific Ave as affordable housing.',
    who: 'Residents seeking affordable housing, adjacent property owners, and anyone concerned about density in the west end of town.',
    stage: 'Work session -- no binding vote, but direction given here shapes the formal application.',
    impact: 'This site could add deed-restricted workforce housing units near the gondola. Design, density, and traffic impacts will be evaluated. Work sessions are the best time for public input before formal review narrows options.',
    context: 'Affordable housing is among the most pressing issues in Telluride. Recent projects like VooDoo have shown that building at $1M/unit makes truly affordable rents extremely difficult. How this PUD is structured -- density, financing, deed restrictions -- will determine whether it actually serves lower-income workers or becomes another project that primarily benefits higher-AMI residents.'
  },
  {
    match: /chair\s*7/i,
    popup: 'Chair 7 was zoned Open Space District in 1979 — ski uses only, no residential or commercial development. Any rezoning would set a precedent for converting dedicated open space. In September 2025, Town Council said no hotel plans would proceed, but rezoning discussions may continue. Watch closely: once open space is commercially developed in Telluride, it has never been reversed.',
    decision: 'Whether to approve rezoning or development at the Chair 7 base area.',
    who: 'All Telluride residents and visitors -- Chair 7 was dedicated as "Open Space District" in 1979 (ski uses only, no residential or commercial).',
    stage: 'Check agenda for whether this is a work session, public hearing, or vote.',
    impact: 'Any commercial development here would set a precedent for converting dedicated open space to commercial use. The Chair 7 proposal was a primary catalyst for the Measure 300 campaign. In September 2025, Town Council stated they would no longer include hotel plans in this area, but rezoning discussions may continue.',
    context: 'The original Chair 7 proposal included a luxury hotel up to 5.5 stories. Combined with Shandoka and the gondola redesign, these projects totaled ~120,000 sq ft of new commercial space requiring 150-200+ new employees -- with no corresponding housing plan. The community response (Measure 300 receiving 40% YES votes) demonstrated significant concern about this scale of development.'
  },
  {
    match: /society\s*turn/i,
    popup: 'Society Turn is a proposed ~400,000 sq ft mixed-use project at the valley entrance. The hospital is only about 10% of the total footprint — the rest is commercial. Traffic studies used COVID-era March 2020 data. No wildfire evacuation analysis has been completed for a site sitting at the valley\'s single entry and exit point. Final BOCC approval may be one vote away.',
    decision: 'Whether to advance the Society Turn PUD -- a ~400,000 sq ft mixed-use development at the valley entrance including a hospital, hotel, medical offices, retail, and employee housing.',
    who: 'Every resident of the region. The hospital component (~44,000 sq ft) is roughly 10% of the total development. The remaining ~90% is commercial.',
    stage: 'Check agenda -- the PUD has completed 4 of 5 approval steps. Final approval may be pending.',
    impact: 'This would be the largest development project in the region\'s history. Traffic studies relied on March 2020 data (during COVID lockdown). Surveys show ~75% of residents were unaware the hospital was only 10% of total development, and ~79% didn\'t know the full scope was 400,000 sq ft.',
    context: 'The hospital district receives 2.6 acres essentially free (valued $1-2M), but defending a 400,000 sq ft PUD it doesn\'t control. The developer reportedly threatened withdrawal if Measure 300 passed. No wildfire evacuation analysis has been completed for the site, which sits at the single entry/exit point for the entire valley.'
  },
  {
    match: /shandoka/i,
    popup: 'A proposed 900-space parking garage at Shandoka would be one of the largest structures in the region. Combined with Chair 7 and the gondola redesign, these projects represent a massive escalation in commercial infrastructure. More parking directly drives higher visitor volumes — permanently affecting the character of downtown Telluride. The combined scope of all three projects approaches $500 million.',
    decision: 'Whether to approve a large parking structure at Shandoka.',
    who: 'Telluride residents, visitors, Mountain Village commuters, and adjacent neighborhoods.',
    stage: 'Check agenda for current phase.',
    impact: 'The proposed 900-space garage would be one of the largest structures in the region. Combined with Chair 7 and gondola redesign proposals, these projects represent a significant escalation of commercial infrastructure. Parking capacity decisions directly influence traffic volume, visitor numbers, and the character of the town.',
    context: 'Doug Sanders, with 20 years in local land development, testified that these projects cannot be evaluated in isolation -- the combined scope approaches $500M and could push the town\'s effective population from ~2,200 toward 3,500.'
  },
  {
    match: /accelerated\s*housing\s*review/i,
    popup: 'San Miguel County is proposing a 90-day fast-track review for qualifying affordable housing projects. A Prop 123 grant deadline drives the timeline: adopt by June 30 or wait until December 31. The Stakeholder Strategic Roundtable voted 5 to 2 against moving it forward now. All 9 public comments were in opposition. Critics say: fix the broader Land Use Code first, restore the project-size limit, and don\'t create a fast-track before adequate safeguards exist.',
    decision: 'Whether to amend the Land Use Code to implement fast-track 90-day review timelines for qualifying affordable housing development applications.',
    who: 'Developers proposing affordable housing, neighbors of potential development sites, and planning staff who must complete reviews within shortened timelines.',
    stage: 'Work session -- joint Planning Commission and BOCC discussion of proposed code language.',
    impact: 'Faster review timelines could accelerate housing production, but also reduce the window for public input on individual projects. This implements state requirements from HB23-1123. The question is how the county balances speed with community participation.',
    context: 'Housing affordability is a central regional concern. VooDoo\'s financial difficulties ($27.4M for 27 units, $23M balloon payment due ~2032) show that merely building faster doesn\'t solve the fundamental math problem: at $1M/unit, truly affordable rents are impossible without significant subsidy.'
  },
  {
    match: /comprehensive\s*plan/i,
    popup: 'A Comprehensive Plan revision sets the rules governing all future land use and zoning — changes that can reshape development patterns for decades. This is one of the most consequential items any planning body considers. Public input at this stage carries the most weight; once formal review begins, options narrow quickly. Recent Plans have been shaped by consultants who simultaneously worked on specific local development projects.',
    decision: 'Review or update of the town\'s Comprehensive Plan -- the foundational document guiding all future land use and zoning decisions.',
    who: 'Every property owner, resident, and business in the jurisdiction. The Comp Plan sets the framework for what can be built where.',
    stage: 'Check agenda -- typically presented as work session or public hearing.',
    impact: 'Comprehensive Plan changes can reshape development patterns for decades. This is one of the most consequential items a planning body can take up. Public input at this stage has the greatest influence on long-term outcomes.',
    context: 'Recent years have seen $64M in consultant spending (2017-2025), much of it directed by firms like DesignWorkshop that simultaneously work on specific development proposals. How the Comp Plan is framed -- and by whom -- shapes whether future development serves existing residents or primarily facilitates new commercial growth.'
  },

  // ── Wildfire / Safety ──
  {
    match: /wildfire\s*resiliency\s*code|wildland\s*urban\s*interface|wui\s*code/i,
    popup: 'The Town and County are considering adopting Colorado\'s Wildfire Resiliency Code and the Wildland Urban Interface Code. In a box canyon with one primary exit road, wildfire evacuation is an existential concern. Adoption means new construction and renovations must meet enhanced standards for building materials, defensible space, and vegetation management. Notably, the Society Turn site — at the valley\'s only entry point — still has no wildfire evacuation analysis.',
    decision: 'Whether to adopt Colorado\'s Wildfire Resiliency Code and/or the International Wildland Urban Interface (WUI) Code, setting construction and land management standards in fire-prone areas.',
    who: 'All property owners (new construction requirements), current residents (evacuation and defensible space), and the fire district (enforcement and response capacity).',
    stage: 'Check agenda -- may be adoption vote or work session.',
    impact: 'These codes set building material requirements, defensible space mandates, and vegetation management standards. In a box canyon with one primary exit road, wildfire preparedness is an existential community concern. Adoption means new construction and renovations must meet enhanced fire-resistance standards.',
    context: 'Fire mitigation has been identified as a top community priority for the region\'s future. Notably, the Society Turn PUD -- at the valley\'s single entry/exit point -- has not undergone a wildfire evacuation analysis despite its massive proposed scale.'
  },





  // ── Gondola / SMART ──
  {
    match: /gondola|smart\s*board|smart\s*transit/i,
    decision: 'SMART Board decisions regarding gondola operations, maintenance, capital planning, or the future of the free gondola connecting Telluride and Mountain Village.',
    who: 'Every commuter, worker, and visitor who uses the gondola, plus all property taxpayers in the SMART district.',
    stage: 'Check agenda for specific action items.',
    impact: 'The gondola (built 1996) is critical regional infrastructure. The current funding agreement expires in 2027. Ballot Issue 3A approved ~$8.2M/year in new tax revenue, but a replacement gondola is estimated at $120-150M+ -- leaving a significant funding gap.',
    context: 'CORA records revealed roughly $125K in campaign consulting before the ballot was referred. The campaign marketed the measure as funding a "new gondola" but the actual revenue only covers a fraction of replacement cost.'
  },

  // ── BOCC / Lucarelli Litigation ──
  {
    match: /lucarelli|executive\s*session.*litigation/i,
    decision: 'Executive session to discuss litigation strategy in the Lucarelli v. BOCC case regarding PUD enforcement in the Aldasoro/Diamond Ranch area.',
    who: 'Property owners in the Aldasoro PUD area, the broader community with interest in zoning enforcement consistency, and county taxpayers funding the litigation.',
    stage: 'Executive session -- closed to public, but the decision to settle or continue litigating has public consequences.',
    impact: 'This case established that the 1991 PUD covers the entire Aldasoro area (plaintiffs won the 106 appeal in June 2024). The ongoing litigation determines whether RETA fees (3/4 of 1% on property transfers) will be enforced, generating transportation revenue, and whether density restrictions in the Sheep Ranch sub-district are upheld.',
    context: 'The PUD case illustrates a broader pattern: historical land use commitments made to secure development approval being challenged or reinterpreted decades later. How the county handles this case signals whether PUD agreements across the region can be relied upon.'
  },

  // ── Medical Center / Hospital ──
  {
    match: /jensen\s*partners|healthcare\s*partnership|new\s*(?:hospital\s*)?facility/i,
    decision: 'Whether to pursue a healthcare partnership and/or new medical facility -- potentially tied to the Society Turn development.',
    who: 'All residents who rely on local healthcare, hospital district taxpayers, and the broader region served by Telluride Medical Center.',
    stage: 'Check agenda -- special meetings indicate active decision-making.',
    impact: 'The hospital\'s future is intertwined with the Society Turn PUD. The district receives 2.6 acres at Society Turn essentially free, but the hospital component is only ~10% of a 400,000 sq ft development. Partnership decisions made now will shape healthcare access and costs for decades.',
    context: 'The hospital district board is weighing significant partnership proposals (Jensen Partners consulting). Meanwhile, the Society Turn developer has reportedly conditioned the hospital\'s land allocation on the broader PUD advancing. Community members may want to ask: can the hospital secure a site without being tied to 300,000+ sq ft of commercial development it doesn\'t control?'
  },



  // ── HB24-1107 / Land Use Judicial Review ──
  {
    match: /hb.?24.?1107|1107|fee.?shifting|attorney\s*fees.*land\s*use/i,
    decision: 'Discussion or action related to HB24-1107, which mandates courts award attorney fees to prevailing governments when citizens challenge local land use decisions involving residential development at 5+ units/acre.',
    who: 'Any citizen or neighborhood group that might challenge a development approval. The law creates a one-sided financial penalty for losing -- citizens must pay government attorneys, but developers denied permits face no similar risk.',
    stage: 'Check agenda for context.',
    impact: 'This law fundamentally changes the risk calculus for citizens considering judicial review of land use decisions. A federal constitutional challenge is pending (Case 1:24-cv-01847-NRN). The law was lobbied by the Colorado Contractors Association through a lobbyist receiving $2.6M+ in fees.',
    context: 'In a community with active PUD enforcement litigation (Lucarelli v. BOCC) and development disputes (Chair 7, Society Turn), this law directly threatens residents\' ability to seek judicial review. Statistics cited in support of the bill were later shown to be misleading -- actual case numbers were 4-5 times higher than claimed.'
  },

  // ── CORA / Transparency ──
  {
    match: /cora|open\s*records|public\s*records/i,
    decision: 'Issues related to Colorado Open Records Act compliance and government transparency.',
    who: 'All community members who depend on transparent government. CORA is the primary tool for citizens to understand how public money is spent.',
    stage: 'Check agenda for context.',
    impact: 'CORA requests have been instrumental in uncovering the scale of consultant spending on the gondola project, the funding sources behind ballot measure campaigns, and the financial structure of housing projects.',
    context: 'CORA requests regarding SMART revealed roughly $125K in campaign consulting before the ballot was referred. Government responsiveness to records requests is a practical measure of transparency -- delays and excessive fees can effectively block public oversight.'
  },

  // ── Forestry / Natural Resources ──
  {
    match: /natural\s*resources.*forestry|forestry\s*practices/i,
    decision: 'Whether to amend the Land Use Code regarding forestry practices and natural resource management on private land.',
    who: 'Rural property owners, environmental advocates, and the broader community affected by watershed health and wildfire risk.',
    stage: 'Work session -- early-stage policy discussion.',
    impact: 'Forestry regulations affect how private landowners manage timber, which in turn affects wildfire risk, watershed health, and ecosystem integrity. In a mountain community surrounded by national forest, these rules have outsized importance.',
    context: 'Wildfire preparedness and water infrastructure protection have been identified as top regional priorities. Forestry practices directly affect both -- improper logging can increase runoff and erosion while reducing forest resilience to fire.'
  },

  // ── HARC / Historic Preservation ──
  {
    match: /(?:harc|historic.*architectural.*review).*(?:demolition|demolish|large.?scale|irreversible)|(?:demolition|demolish).*(?:harc|historic.*landmark|preservation)/i,
    decision: 'Whether to approve exterior alterations, new construction, demolitions, or signage within Telluride\'s National Historic Landmark District.',
    who: 'Property owners seeking approvals, adjacent property owners, and all residents who value the town\'s historic character.',
    stage: 'Check agenda -- HARC reviews can range from minor alterations (staff-level) to full commission hearings for large-scale projects and demolitions.',
    impact: 'HARC decisions shape the physical character of Telluride\'s historic downtown and residential neighborhoods. Approvals set precedents for building scale, materials, and design. Demolition permits are effectively irreversible -- once a historic structure is gone, it cannot be restored.',
    context: 'Telluride is a designated National Historic Landmark District -- one of the highest levels of historic recognition in the U.S. Development pressure from luxury construction and resort expansion creates ongoing tension between preservation and modernization. HARC also reviews projects tied to larger land use applications (Shandoka, Carhenge) that advance through P&Z and Council.'
  },

  // NOTE: There is intentionally NO generic per-body entry here (e.g. a
  // "Design Review Board" or "Planning Commission" matcher). "Why This
  // Matters" should fire ONLY when a meeting touches a substantive, Deep-Dive
  // / key-issue topic — not on every routine meeting of a given body. A DRB or
  // P&Z meeting that actually takes up the gondola terminal, Society Turn,
  // Carhenge, a code amendment, etc. will match the topic entries above.
];


// ══════════════════════════════════════════════════════════════
// ── Meeting Zoom / Passcode data ──
// ══════════════════════════════════════════════════════════════
//
// Three pieces consumed by js/gov-helpers.js:
//   1. MEETING_ZOOM_LINKS  — registration / join URLs per meeting
//                            (keyed "source|YYYY-MM-DD|meeting title")
//   2. SCHOOL_ZOOM_LINK    — School District R-1 uses the same Zoom
//                            room for every meeting, so a single
//                            constant is checked first for source='school'
//   3. MEETING_PASSCODES   — Meeting ID + passcode + phone, same key
//                            shape as MEETING_ZOOM_LINKS
//
// NOTE: ALL THREE of these declarations were lost in a single edit
// (commit b65a4b2). MEETING_PASSCODES restored 2026-05-18 along with
// MEETING_ZOOM_LINKS (empty default) and SCHOOL_ZOOM_LINK. Without
// them, gov-helpers.js getMeetingZoomLink() throws ReferenceError on every
// meeting card → Zoom panel never renders. Add the URLs as new
// agendas post; see the "Memory: deep-link URL patterns" memory file
// for the per-source pattern.

// SOURCE OF TRUTH for per-meeting zoom links + passcodes is MEETING_AGENDA_META
// (js/gov-helpers.js — bot-managed, per-meeting-instance, extracted from posted
// agendas) plus SCHOOL_ZOOM_LINK below (the school district's constant Zoom).
// gov-hub.html reads MEETING_AGENDA_META first and only falls back to these
// static maps. The maps previously held a handful of frozen past-date entries
// (all long superseded), which created a split-brain "two places to update zoom
// info" bug. They're now intentionally EMPTY — do NOT add entries here; the bot
// keeps MEETING_AGENDA_META current. The consts remain (empty) so
// getMeetingZoomLink()/getMeetingPasscode() still resolve without errors.
const MEETING_ZOOM_LINKS = {};

const SCHOOL_ZOOM_LINK = 'https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09';

// Intentionally EMPTY — see the MEETING_ZOOM_LINKS note above. Per-meeting
// passcodes live in MEETING_AGENDA_META (gov-helpers.js); the school district's
// constant passcode is derived from SCHOOL_ZOOM_LINK by getMeetingPasscode().
const MEETING_PASSCODES = {};

const LAND_USE_ISSUES = {
  "carhenge":
    {"lastUpdated":"2026-07-19","label":"Carhenge / Shandoka","heroImage":"https://ehq-production-us-california.imgix.net/6b1af98643c2eb1d96ea48d001eba309fb722ec3/original/1773791842/3923590257fa65a36b9b6893f6d1adc5_Carhenge-Lot-Header.png?auto=compress%2Cformat&w=1200","heroAlt":"Carhenge Lot Redevelopment site plan showing building layout, green spaces, and pedestrian connections","heroCredit":"Image: Town of Telluride / Engage Telluride","intro":"Two of the most significant in-town redevelopment projects are advancing simultaneously: Carhenge (700 W Pacific) and Shandoka (Lot L). Both propose replacing surface parking with mixed-use neighborhoods combining housing, community space, and structured parking through the PUD and subdivision process.","statusTitle":"Carhenge is deep in formal land use review — story poles are down, HARC has held its hearings, and P&Z takes up the subdivision and PUD on July 23.","statusCopy":"After a March P&Z work session and a May 20 HARC work session, story poles stood on the 700 W Pacific lot July 6–17 so the community could see the proposed heights and massing. On July 15 HARC held Preliminary Large-Scale public hearings on the eight proposed buildings (A through E) on Lots 34 and 34B. Next is the July 23 Planning & Zoning hearing on the subdivision that would consolidate the two lots and the Conceptual PUD for the new construction. Shandoka (Lot L) is moving on a parallel track. The key public questions remain density, design, actual affordability, neighborhood fit, parking, traffic, and flood/groundwater — the grounds the Chair 7 Community Coalition is contesting.","nextStep":"Carhenge Planning & Zoning hearing: July 23, 2026 at Rebekah Hall (113 W Columbia Ave) and on Zoom — a Preliminary Large Scale Subdivision to consolidate Lots 34 and 34B plus a Conceptual PUD for the new construction (carried over from May). The next regular P&Z is August 27.","metrics":[{"label":"What to follow","value":"Affordable housing PUD -- but what kind of affordability?","sub":"Both projects are precedent-setting decisions, not routine site plans. Projects labeled workforce housing can still miss lower-income workers. The entitlement details matter."},{"label":"Best public moment","value":"P&Z work sessions and open houses","sub":"Massing, density, and code fit get defined before formal votes. Engage early."}],"timeline":[{"date":"Past","title":"Southwest Area Conceptual Plan sets the stage","copy":"SWAP and the Lift 7 Neighborhood Planning effort identified both sites as priority in-town redevelopment opportunities aligned with the Telluride Master Plan."},{"date":"Sep 2025","title":"Town Council endorses Shandoka Alternative 2","copy":"Council approved the preferred concept for Lot L: below-grade structured parking, separate residential buildings, childcare, transit-oriented commercial, and enhanced pedestrian circulation."},{"date":"Mar 2026","title":"Carhenge enters formal P&Z review; Shandoka holds open houses","copy":"Carhenge P&Z work session scheduled March 26 to review subdivision and PUD direction. Shandoka community open houses March 25-26 at Ah Haa School and Cowboy General Store."},{"date":"May 2026","title":"Chair 7 Coalition files legal challenges; Carhenge tabled to July 23","copy":"Through counsel Diane Wolfson (Sphere Law Firm), the Chair 7 Community Coalition submitted seven letters to the Town and P&Z opposing the Carhenge and Shandoka PUDs on parking, traffic, flood and groundwater, and Backman Village Plat grounds — all seven are linked under Key Documents below. At the May 29 hearing the Commission tabled the Carhenge application to the July 23, 2026 P&Z meeting; the Shandoka work session is set for June 25, 2026."},{"date":"Jul 6–17, 2026","title":"Story poles go up on the Carhenge lot","copy":"The Town erected story poles across the 700 W Pacific parking lot from July 6 to July 17 (closing the lot during that window) so residents could see the proposed building heights and massing before the formal hearings."},{"date":"Jul 15, 2026","title":"HARC public hearing on the eight buildings","copy":"The Historic & Architectural Review Commission held Preliminary Large-Scale public hearings on the proposed Buildings A, B, C, D1, D2, E1, E2 and E3 on Lots 34 and 34B — all new construction in the Accommodations 2 zone (outside the Historic Landmark District), with Design Workshop as applicant and the Town as owner. A Shandoka Lot work session followed."},{"date":"Jul 23, 2026","title":"P&Z takes up the subdivision and Conceptual PUD","copy":"Planning & Zoning hears the Carhenge Preliminary Large Scale Subdivision — consolidating Lots 34 and 34B into a single parcel of just over 15,000 sq ft — and a Conceptual PUD for the new construction, carried over from May. Formal PUD, Subdivision, and Large Scale Activity hearings, then Town Council, still lie ahead.","future":true}],"docs":[{"title":"Carhenge Lot Ground Study (June 2026)","copy":"The Town-commissioned geotechnical and groundwater study of the 700 W Pacific site — directly relevant to the flood-zone and shallow-groundwater questions raised about the proposed below-grade parking.","tag":"Carhenge","href":"https://engagetelluride.org/32089/widgets/113355/documents/83231"},{"title":"C7CC — Summary of Legal Issues (June 2026)","copy":"Chair 7 Community Coalition overview of the seven legal letters its counsel (Diane Wolfson, Sphere Law Firm) filed opposing the Carhenge and Shandoka PUD applications — covering parking, traffic, flood and groundwater hazards, and the Backman Village Plat restrictions.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-summary-of-legal-issues.pdf?alt=media&token=36937ed8-1f92-447f-b520-16cf94d56aa6"},{"title":"C7CC — Shandoka: Traffic (Letter to P&Z, May 28 2026)","copy":"Identifies trip generators the existing studies never modeled — a transit center and a childcare facility with high, concentrated peak-hour traffic — and asks the Commission to decline a favorable circulation finding without a development-specific traffic study.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-shandoka-traffic.pdf?alt=media&token=26c50b31-37e2-476f-bddc-ceedcba8b784"},{"title":"C7CC — Carhenge: Parking (Letter to P&Z, May 27 2026)","copy":"Argues the 225–235 spaces understate Code requirements, and that the project relocates the roughly 288 intercept-parking spaces that justify its low one-space-per-unit minimum; asks P&Z to hold the application pending a real parking-demand analysis.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-carhenge-parking.pdf?alt=media&token=7e69811d-e42b-4180-a6db-3f1573b9838f"},{"title":"C7CC — Carhenge: Traffic (Letter to P&Z, May 27 2026)","copy":"Contends the traffic record is inadequate — the 2020 study and 2025 update modeled a different project and never analyzed the 10,000 sq ft of commercial use or peak school hours — and notes the Davis Street / West Colorado Avenue exit is already failing at Level of Service F.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-carhenge-traffic.pdf?alt=media&token=4f2ad7e8-7912-42d1-a2b2-94c6c42b5a2a"},{"title":"C7CC — Carhenge: Flood Hazards and Ground Water (Letter to P&Z, May 27 2026)","copy":"Flags that much of the site sits in FEMA Zone AE and a shallow-groundwater zone, yet the plan proposes multi-level basement parking — a configuration counsel argues is barred by NFIP rules and LUC Section 8-622.D, and that the project may not be buildable as drawn.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-carhenge-flood-groundwater.pdf?alt=media&token=8c3550f6-8665-4803-bf43-470e9afeb9d4"},{"title":"C7CC — Carhenge: Backman Village Plat (Letter to Town of Telluride, May 27 2026)","copy":"Argues the Backman Village Plat caps Lots 34 and 34-B at 141 multifamily units versus the proposed 220–230, and that consolidating the lots requires a plat amendment needing unanimous owner consent the Coalition will withhold — which counsel calls a literally futile posture.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-carhenge-backman-plat.pdf?alt=media&token=1f7eec13-01fc-4d9d-ad7a-f8eeb22b4147"},{"title":"C7CC — Shandoka: Backman Village Plat and 1987 Dedication Deed (Letter to Town of Telluride, May 27 2026)","copy":"The strongest Shandoka argument: the only permitted use for Lot L is parking to serve the surrounding lots, and a recorded 1987 Dedication Deed restricts it to public parking, transportation, access, and river and trail corridors — not the proposed housing, commercial space, or transit center.","tag":"C7CC","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fchair-7%2Fchair7-shandoka-backman-plat.pdf?alt=media&token=43ec3390-a003-4fc5-8961-e6fc0e762af1"},{"title":"Carhenge P&Z Work Session Application (Mar 26, 2026)","copy":"Full application package for the Planning & Zoning work session.","tag":"Carhenge","href":"https://engagetelluride.org/32089/widgets/113355/documents/79175"},{"title":"Carhenge Site Plan (Mar 26, 2026)","copy":"Site plan drawings for the proposed redevelopment.","tag":"Carhenge","href":"https://engagetelluride.org/32089/widgets/113355/documents/79180"},{"title":"Carhenge Application Narrative","copy":"Project narrative describing the redevelopment concept and entitlement approach.","tag":"Carhenge","href":"https://engagetelluride.org/32089/widgets/113355/documents/79178"},{"title":"Letter of Authorization (Town of Telluride)","copy":"Signed authorization letter for the application.","tag":"Carhenge","href":"https://engagetelluride.org/32089/widgets/113355/documents/79181"},{"title":"Shandoka Lot Redevelopment -- Alternative 2 (PDF)","copy":"Full concept package for the Council-endorsed Alternative 2 design (29.5 MB).","tag":"Shandoka","href":"https://engagetelluride.org/32023/widgets/113083/documents/78970"}],"meetings":[{"date":"Jul 23, 2026","time":"5:30 PM","title":"P&Z Hearing — Carhenge Subdivision & Conceptual PUD","source":"Town of Telluride","location":"Hybrid / Rebekah Hall, 113 W Columbia Ave","href":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8100","zoom":""},{"date":"Aug 27, 2026","title":"Planning & Zoning Commission — next regular meeting","source":"Town of Telluride","location":"Hybrid / Rebekah Hall, 113 W Columbia Ave","href":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102","zoom":""}],"players":[{"icon":"🏘️","title":"Town of Telluride / Design Workshop","copy":"Design Workshop leads the consultant team for both projects, handling site planning, architecture, infrastructure, and landscape design."},{"icon":"📐","title":"Planning & Zoning Commission","copy":"First major venue for density, compatibility, and code review. Carhenge work session March 26."},{"icon":"🏛️","title":"Town Council","copy":"Endorsed Shandoka Alternative 2 in September 2025. Will ultimately decide PUD and ordinance-level questions for both projects."},{"icon":"🧭","title":"Residents and community groups","copy":"C7CC and neighborhood residents supply the strongest real-world test of whether these projects solve the right problems."}],"news":[{"source":"Telluride Inside...and Out","date":"Jun 5, 2025","title":"Community Opportunities for Lift 7 & Gondola Station Planning","copy":"Town hosts events June 10-11 to gather feedback on transforming the Lift 7 base area into an affordable, pedestrian-friendly neighborhood.","href":"https://tellurideinside.com/2025/06/town-of-telluride-community-opportunities-for-lift-7-gondola-station-planning.html"},{"source":"Telluride News","date":"Apr 27, 2025","title":"Troubled by the communication surrounding Chair 7 redevelopment","copy":"Letter to the editor expressing concern about transparency and clarity in how the Chair 7 redevelopment project has been communicated to the community.","href":"https://www.telluridenews.com/letters_to_the_editor/article_639074ba-0d61-4cd9-9fc3-fc4ef2b206b3.html"},{"source":"Telluride News","date":"Oct 30, 2024","title":"Residents of Chair 7 neighborhood form community coalition","copy":"Neighbors in the Chair 7 area established the C7CC coalition (180+ members) to have a meaningful role in development plans for Carhenge and Shandoka.","href":"https://www.telluridenews.com/news/article_389e8d8c-9664-11ef-92b0-1b4c760901b6.html"},{"source":"Telluride News","date":"Sep 1, 2024","title":"Plan for Lift 7 area comes into focus","copy":"Emerging details on the development plan for the Lift 7 vicinity, including Carhenge and the Shandoka parking lot.","href":"https://www.telluridenews.com/news/article_b36a9c76-6807-11ef-8320-e798c816f268.html"},{"source":"Telluride News","date":"Jun 7, 2025","title":"Parking and People -- When is enough, enough?","copy":"Letter to the editor examining parking demand and whether current provisions meet community needs amid redevelopment plans.","href":"https://www.telluridenews.com/letters_to_the_editor/article_8e791e64-4b71-4ce7-8402-9828662eb5c1.html"},{"source":"Facebook","date":"Ongoing","title":"C7CC -- Chair 7 Community Coalition (Facebook Group)","copy":"Active community discussion group with 180+ members tracking Chair 7, Carhenge, and Shandoka development concerns.","href":"https://www.facebook.com/groups/1076276483955655"}],"sideBox":{"title":"What is it costing us?","copy":"Carhenge is a Town-funded project. Follow the public dollars — construction, debt service, and subsidy — in the cost & debt tracker.","label":"Open the cost tracker","href":"/projects-map/cost-tracker.html?project=Carhenge"}},

  "society":
    {"lastUpdated":"2026-06-01","label":"Society Turn / Valley Floor Entrance","heroImage":"https://img1.wsimg.com/isteam/ip/3f388f66-602e-4c3d-940c-27e48680fdb9/Society%20Turn%20Aerial.jpg/:/cr=t:0%25,l:0%25,w:100%25,h:100%25/rs=w:1200,cg:true","heroAlt":"Aerial view of the Society Turn development site along Highway 145 between Telluride and Mountain Village","heroCredit":"Image: societyturn.info","intro":"A 19.7-acre mixed-use PUD by Genesee Properties along Highway 145, west of the Society Turn Roundabout. The project bundles a regional hospital site, wastewater expansion, employee housing, medical offices, retail, hotel, and conference facilities -- raising questions about total scale, traffic, wildfire evacuation, and whether one project is being used to justify a broader build-out at the valley entrance.","statusTitle":"Society Turn remains a high-consequence regional development issue.","statusCopy":"Even when framed around public-serving uses, the project raises larger questions about total scale, traffic, wildfire evacuation, environmental limits, and whether one project is being used to justify a much broader build-out.","nextStep":"Track BOCC, Town Council, and any hospital-district discussions that tie facility needs to the larger site plan.","metrics":[{"label":"Primary tension","value":"Public benefit vs. total development scale","sub":"The public-facing rationale and the full project footprint may not be the same thing."},{"label":"Regional concern","value":"Traffic and emergency access","sub":"The site sits at a sensitive gateway for movement in and out of the valley."},{"label":"Best source","value":"Full packets and development summaries","sub":"Do not rely on summary language alone; the details matter."}],"timeline":[{"date":"2021","title":"Sketch PUD approved by County Commissioners","copy":"Planning Commission reviewed and recommended approval of the Sketch PUD for the 19.7-acre Genesee Properties parcel. BOCC approved."},{"date":"Recent","title":"Preliminary PUD/Subdivision phase begins; public scrutiny grows","copy":"The project advances toward Preliminary PUD while residents focus on total build-out scale, traffic at the roundabout, and wildfire evacuation concerns."},{"date":"Now","title":"The issue is no longer just one project","copy":"It has become a referendum on development scale, sequencing, and whether infrastructure and environmental analysis are keeping up."},{"date":"Next","title":"Watch for hearings, revised site materials, and hospital-related tie-ins","copy":"The most important developments may come through linked public bodies, not just one jurisdiction.","future":true}],"docs":[{"title":"Society Turn PUD Information","copy":"Developer site with aerial imagery, project features, community benefits, and mixed-use development details.","tag":"Developer","href":"https://societyturn.info/"},{"title":"San Miguel County CivicClerk Portal","copy":"Best place to look for county-side packets, work sessions, and supporting development materials.","tag":"County Record","href":"https://sanmiguelcoco.portal.civicclerk.com/"},{"title":"County Commissioners Page","copy":"Track BOCC agendas and board-level movement on major regional items.","tag":"BOCC","href":"https://sanmiguelcountyco.gov/192/Board-of-County-Commissioners"},{"title":"Telluride Medical Center Board Meetings","copy":"Useful when hospital facility planning overlaps with Society Turn discussions.","tag":"Hospital","href":"https://www.tellmed.org/board-meetings"}],"players":[{"icon":"🏗️","title":"Project sponsors and consultants","copy":"Control project framing, phasing, and how public benefits are presented."},{"icon":"🌲","title":"County decision-makers","copy":"Central to land-use approval, code fit, and regional public process."},{"icon":"🏥","title":"Hospital district leadership","copy":"Their participation can heavily influence how the project is perceived and justified."},{"icon":"🚗","title":"Regional commuters and residents","copy":"They bear the real-world consequences of traffic, access, and gateway-scale growth."}]},

  "code":
    {"lastUpdated":"2026-07-19","label":"Code Changes & Accelerated Review","heroImage":"/assets/ssr/SMC-Housing-Code-Update-infographic.jpg","heroAlt":"San Miguel County Housing Code Update infographic showing Phase 1 Project Foundation (Fall/Winter 2025), Phase 2 Issue Identification & Analysis (Spring 2026), and Phase 3 Final Audit Report and Code Drafting (Summer 2026).","heroCredit":"Source: San Miguel County Housing Code Update project page","heroAspect":"tall","legalSummary":"The current LUCA Draft (April 8, 2026) would create a 90-day \"Accelerated Housing Review\" track. Compared to the SSR's recommendations, the County's draft removes (1) language identifying the program as voluntary, (2) the exclusion of PUDs that involve rezoning or subdivision, (3) a 10-unit project-size cap, and (4) the requirement that review default to a two-step Planning-Commission-plus-BOCC process. The redline (linked above) shows SSR additions in blue and County deletions in red.","legalIssuesTitle":"Concerns with the County's draft","legalIssuesSub":"Specific places where the County's April 8 LUCA Draft removed or weakened SSR-recommended limits on the Accelerated Housing Review process.","intro":"Code reform is often where the biggest long-term land-use changes happen, because one ordinance can affect every future project, not just one site, for better or worse. The most active local example right now is the San Miguel County Housing Code Update, a 15-month land use code audit being shaped by an appointed Stakeholder Strategic Roundtable (SSR).","statusTitle":"The Final Code Audit Report is out -- the first full picture of the proposed Land Use Code changes.","statusCopy":"San Miguel County is undertaking a comprehensive land use code audit (June 2025 -- Sept 2026) funded by a Colorado Proposition 123 Local Planning Capacity Grant. The Stakeholder Strategic Roundtable (SSR) -- a mix of County staff, planning commissioners, school and housing officials, and 12 appointed community members -- meets monthly to review existing housing policies and shape draft amendments. The County notes this work also positions it for Proposition 123 \"Fast Track Approval\" funding, but does NOT satisfy SB24-174, which still requires a separate Housing Action Plan by January 1, 2028. If review timelines shorten or approval standards shift through this code audit, the practical balance between faster housing production and meaningful public review, environmental protection, and growth management changes for years to come.","nextStep":"Read the Final Code Audit Report (public draft, July 2026) on the County project page -- it contains the actual proposed code amendments, zone by zone. The SSR meets again July 27. Comments go to housingupdate@sanmiguelcountyco.gov before the Planning Commission and BOCC take up adoption this fall.","controversyUpdate":{"date":"May 14, 2026","heading":"May 14 Planning Commission — Fast Track Review","packetHref":"/assets/packets/planning-commission-2026-05-14-packet.pdf","points":[{"label":"Why it is before the Commission now","text":"San Miguel County must adopt a qualifying fast-track review process by June 30, 2026 to access Proposition 123 planning and infrastructure grant funds this fiscal year. Missing the June 30 window pushes the deadline to December 31 — and risks losing eligibility altogether. Planning Director Kaye Simonson drafted the amendment; it is Agenda Item 7 at the May 14 Planning Commission meeting, with a Commission recommendation to the BOCC expected."},{"label":"What the amendment actually does","text":"Eligible projects — those with at least 50% deed-restricted affordable units (rental at or below 120% AMI, for-sale at or below 200% AMI) — would receive a guaranteed 90-day review window. Critically, the amendment does NOT change substantive Land Use Code standards, does not obligate the County to approve any project, and does not allow more market-rate housing. It compresses only the review timeline, not the approval criteria."},{"label":"SSR position: 5 of 7 members opposed","text":"At its April 27 meeting the Stakeholder Strategic Roundtable weighed in. Five of seven members opposed moving the amendment forward as Phase 1. Their objections: the County is rushing the fast-track piece ahead of comprehensive code reform; the draft drops the 10-unit project-size cap the SSR had recommended; and other code amendments should be adopted before any accelerated pathway is created for large projects. Two members were in favor."},{"label":"Public comment: 9 submitted, all in opposition","text":"Every public comment received before the May 14 meeting opposed the amendment. Commenters — Morgan Smith, Nick Farkouh, Pam Bennett, Scott Bennett, Shellie Duplan (Aldasoro Ranch HOA), Emily Masson, Jolana Vankova, Lauren Murray, and Virginia Lucarelli — raised consistent themes: complete the broader code reform before creating a fast-track; restore the project-size limit; ensure meaningful public notice and hearing rights are not eroded."},{"label":"The core dispute","text":"The County's position is that the fast-track amendment should come first (Phase 1) to protect grant eligibility while the broader code reform continues in parallel. The SSR majority and virtually all public commenters argue the reverse: finish the comprehensive code overhaul first, then build a fast-track pathway inside a reformed framework with the right safeguards in place. The Planning Commission must decide whether the June 30 grant deadline justifies front-loading the fast-track before those safeguards exist."}]},"metrics":[{"label":"Big question","value":"Speed vs. scrutiny","sub":"How much process should be compressed in the name of housing delivery?"},{"label":"Who is affected","value":"Every future applicant and every future neighbor","sub":"Code amendments are system rules, not one-off exceptions."},{"label":"Best tactic","value":"Read the draft language","sub":"The text of the amendment matters more than the summary memo."}],"timeline":[{"date":"Past","title":"Housing pressure pushes governments toward procedural reform","copy":"Fast-track review and code cleanup become recurring policy tools in response to affordability pressure, even as many residents worry about cumulative growth effects."},{"date":"June 2025","title":"SMC Housing Code Update kicks off after Regional Housing Needs Assessment","copy":"San Miguel County launches a 15-month land use code audit funded by Colorado's Proposition 123 Local Planning Capacity Grant, targeting regulatory barriers in unincorporated areas and implementing East End Master Plan recommendations."},{"date":"Summer 2025","title":"Community Listening Sessions and Code Review begin","copy":"First series of community listening sessions held October 6-8, 2025; second series held December 8, 2025. SSR formed to advise staff and consultants on housing policy and code amendments."},{"date":"Fall 2025 - Apr 2026","title":"SSR meetings 1-5 review existing housing regulations","copy":"The Stakeholder Strategic Roundtable meets monthly (October, December, January, March, April) to review the Community Housing Zone designation and other housing-related rules. Each meeting packet and high-level summary is posted in the project document center."},{"date":"Now -- Spring 2026","title":"Community Review of Draft Code Amendments","copy":"Draft amendments developed over winter are now open for community review. This is the engagement window where the actual ordinance text becomes concrete and residents can weigh in on specifics rather than concepts."},{"date":"Apr 27, 2026","title":"SSR takes position on Accelerated Housing Review: 5 to 2 opposed","copy":"Five of seven SSR members voted against advancing the Accelerated Housing Review amendment as Phase 1, citing the missing project-size limit, wanting comprehensive reform first, and concern that the fast-track is being created before adequate safeguards are in place."},{"date":"May 14, 2026","title":"Planning Commission considers Accelerated Housing Review amendment (Agenda Item 7)","copy":"All 9 public comments received were in opposition. SSR voted 5-2 against advancing as Phase 1. Commission recommendation goes to BOCC. County's June 30 Prop 123 grant deadline drives the timing."},{"date":"Jun 3, 2026","title":"County adopts the Prioritized Housing Review program","copy":"To hold its Proposition 123 eligibility, the BOCC adopted the fast-track review ahead of the broader code reform -- with customizations: rental eligibility at or below 120% AMI, for-sale at or below 200% AMI, a County-specific list of eligible (and ineligible) application types, and confirmation that all other code standards still apply."},{"date":"Jul 2026","title":"Final Code Audit Report (public draft) released -- the proposed code changes arrive","copy":"The consultant team's report lays out the actual proposed Land Use Code amendments: cut by-right minimum lot sizes from 35 acres to 7 (Low Density), 3 (Medium), and 2 (High); raise by-right density to current PUD levels and add deed-restriction density bonuses (25% bonus at 37% deed-restricted units, 35% at 38-50%, 50% plus 10 ft of height at 51%+); halve setbacks in LD/MD/HD; allow duplexes and townhomes wherever single-family homes are allowed; make ADUs by-right and raise their cap to 1,000 sq ft; expand cottage housing, cohousing, and tiny-home allowances; rewrite the Community Housing zone (3,000 sq ft dwelling cap, 40-45 ft height tiers for affordability and net-zero); and reduce reliance on the 18-36 month PUD process. Rejected ideas include parking-minimum changes, fee waivers, and open-space reductions."},{"date":"Jul 16, 2026","title":"SSR meeting six digs into density and workforce housing types","copy":"The Stakeholder Strategic Roundtable worked through zoning, density, and housing types -- condos, cottages, townhomes -- against a projected need of roughly 1,100 units countywide by 2030 (207 in unincorporated areas). Density bonuses for deed-restricted projects drew interest; no recommendations were finalized."},{"date":"Summer-Fall 2026","title":"Planning Commission and BOCC Work Sessions, then Final Presentations","copy":"After community review, the Planning Commission and Board of County Commissioners hold work sessions on draft amendments, followed by final code amendment presentations in the fall.","future":true},{"date":"Winter 2026","title":"Adoption process for the final code amendments","copy":"The County moves to formal adoption of the updated land use code, completing the 15-month process. Adopted text -- not the summary -- is what governs every future application.","future":true}],"news":[{"source":"Telluride Times","date":"Jul 19, 2026","title":"Stakeholders discuss housing density","copy":"Coverage of the SSR's sixth meeting (July 16): workforce housing types, zoning, and density against a projected countywide need of ~1,100 units by 2030 -- with density bonuses for deed-restricted projects on the table and no recommendations finalized yet.","href":"https://www.telluridenews.com/news/article_3fa56ff6-1d64-4c3b-b271-0802fcb74db2.html"}],"docs":[{"title":"Final Code Audit Report & Recommendations (public draft, July 2026)","copy":"The full proposed Land Use Code changes -- lot sizes, density and bonuses, setbacks, housing types, the Community Housing zone rewrite, and Appendix A code redlines. Posted in the project document center.","tag":"Key Document","href":"https://www.sanmiguelcountyco.gov/882/Housing-Code-Update"},{"title":"May 14, 2026 Planning Commission Packet — Agenda Item 7: Accelerated Housing Review","copy":"Full PC packet for the May 14 meeting, including staff memo, proposed amendment text, SSR April 27 meeting recap, and all 9 public comments received — all in opposition. This is the most current record of where the amendment stands before the Commission vote.","tag":"May 14 PC Packet","href":"https://sanmiguelcoco.portal.civicclerk.com/"},{"title":"Accelerated Housing Review LUCA Draft (April 8, 2026)","copy":"The actual draft code amendment text the County is currently moving forward. This is the single most important document: every rule in this draft becomes law if adopted. Read this BEFORE the redline below to see where the County landed.","tag":"Flagship Draft","href":"/assets/ssr/14055-document-14055.pdf"},{"title":"SSR-vs-County redline (offline copy)","copy":"Mirror of the redlined Accelerated Housing Review draft, with SSR additions in BLUE and County deletions in RED. Stored on this site so it stays available even if SMC moves or removes the original. Use this to see exactly what the SSR recommended versus what the County kept.","tag":"Redline (mirror)","href":"assets/ssr/Accelerated-Housing-Review-LUCA-redline-SSR-vs-County.pdf"},{"title":"April SSR No. 5 Meeting Packet","copy":"Fifth and most recent SSR meeting packet (April 2026). High-level summary not yet posted by SMC at the time of writing.","tag":"SSR No. 5","href":"/assets/ssr/14206-April-SSR-No-5-Meeting-Packet.pdf"},{"title":"March SSR No. 4 Meeting Packet","copy":"Fourth SSR meeting packet (March 2026). This is where the Accelerated Housing Review draft language was substantively reworked.","tag":"SSR No. 4","href":"/assets/ssr/13938-March-SSR-No-4-Meeting-Packet.pdf"},{"title":"March SSR No. 4 Meeting High-Level Summary","copy":"Short summary of what was discussed and decided at SSR No. 4.","tag":"SSR No. 4 Summary","href":"/assets/ssr/14065-March-SSR-No-4-Meeting-High-Level-Summary.pdf"},{"title":"January SSR No. 3 Meeting Packet","copy":"Third SSR meeting packet (January 2026).","tag":"SSR No. 3","href":"/assets/ssr/13846-January-SSR-No-3-Meeting-Packet.pdf"},{"title":"January SSR No. 3 Meeting High-Level Summary","copy":"Short summary of what was discussed and decided at SSR No. 3.","tag":"SSR No. 3 Summary","href":"/assets/ssr/13883-January-SSR-No-3-High-Level-Summary.pdf"},{"title":"December SSR No. 2 Meeting Packet","copy":"Second SSR meeting packet (December 2025).","tag":"SSR No. 2","href":"/assets/ssr/13733-December-SSR-No-2-Meeting-Packet.pdf"},{"title":"December SSR No. 2 Meeting High-Level Summary","copy":"Short summary of what was discussed and decided at SSR No. 2.","tag":"SSR No. 2 Summary","href":"/assets/ssr/13810-December-SSR-No-Meeting-High-Level-Summary.pdf"},{"title":"October SSR No. 1 Meeting Packet","copy":"First SSR meeting packet (October 2025). Typically the largest packet because it sets up baseline existing-code review.","tag":"SSR No. 1","href":"/assets/ssr/13732-October-SSR-No-1-Meeting-Packet.pdf"},{"title":"October SSR No. 1 Meeting High-Level Summary","copy":"Short summary of what was discussed and decided at SSR No. 1.","tag":"SSR No. 1 Summary","href":"/assets/ssr/13734-October-SSR-No-1-Meeting-High-Level-Summary.pdf"},{"title":"BOCC Presentation -- Community Engagement Plan","copy":"Presentation given to the Board of County Commissioners describing the Housing Code Update community engagement strategy.","tag":"BOCC","href":"/assets/ssr/13339-BOCC-Presentation-Community-Engagement-Plan-PDF.pdf"},{"title":"Community Engagement Plan","copy":"Full Community Engagement Plan describing how the County intends to gather public input throughout the code update.","tag":"Plan","href":"/assets/ssr/13340-Community-Engagement-Plan-PDF.pdf"},{"title":"San Miguel County Housing Code Update (project page)","copy":"Official SMC project page -- timeline, listening sessions, SSR roster, document center, and Spanish-language information. The canonical entry point for everything happening in this code audit.","tag":"SMC Project Page","href":"https://www.sanmiguelcountyco.gov/882/Housing-Code-Update"},{"title":"San Miguel County Land Use Code (Accelerated Housing Review)","copy":"The current Land Use Code language that the Accelerated Housing Review draft would amend. Useful for comparing existing rules against the proposed changes.","tag":"Existing Code","href":"/assets/ssr/14055-document-14055.pdf"},{"title":"San Miguel County CivicClerk Portal","copy":"Source for BOCC and Planning Commission packets, staff memos, and joint work sessions where this code update will be debated and ultimately adopted.","tag":"CivicClerk","href":"https://sanmiguelcoco.portal.civicclerk.com/"},{"title":"Submit comments to the SSR","copy":"Email housingupdate@sanmiguelcountyco.gov. Comments received by noon a week before a meeting go into the meeting packet; by noon the day before go to the meeting body; later is held until next meeting.","tag":"Public Comment","href":"mailto:housingupdate@sanmiguelcountyco.gov"}],"legalIssues":[{"icon":"⚖️","title":"3-1501 -- the County removed language identifying the program as voluntary","copy":"The SSR draft kept the phrase \"in order to receive financial assistance from the State of Colorado\" before the requirement to provide an Accelerated Housing Review. The County removed it. Nothing in C.R.S. 29-32-105 actually requires this 90-day review -- it is a precondition for one funding stream (Proposition 123). Colorado HB26-1360 has eliminated Prop 123 funding for this fiscal year and it may be eliminated again. As written, the County's draft reads as a mandate when in fact the program is voluntary tied to a discretionary funding source."},{"icon":"🏗️","title":"3-1501 / eligible-vs-ineligible -- new PUDs with rezoning or subdivision could be fast-tracked","copy":"The SSR draft excluded \"Planned Unit Development approval or amendment that includes zoning approval or subdivision of land\" from the 90-day track -- the same language used by the State of Colorado. The County's draft strikes that exclusion AND removes \"approval that does not involve rezoning or subdivision of land\" from the eligible-projects clause. Read together, the County draft would let a brand-new PUD that requires both rezoning and subdivision proceed through 90-day administrative review, which can apply to projects of any size (see issue 5)."},{"icon":"🗺️","title":"3-1501 ineligible list -- \"Initial Zoning or Rezoning\" deleted","copy":"The County's draft strikes \"Initial Zoning or Rezoning\" from the list of project types ineligible for accelerated review. Combined with the change above, this signals that rezoning is now permitted within a 90-day administrative review for both PUDs and other developments. The change is consequential by omission rather than statement."},{"icon":"📋","title":"3-1503 -- the two-step process backstop is removed","copy":"The SSR draft kept the language \"Unless an alternate process is specified in the Land Use Code, the Accelerated Housing Review process shall be a Two-Step process (review by the Planning Commission + Board of County Commissioners).\" The County's draft strikes that line entirely. With it gone, the Code does not specify who reviews these applications, what notice is given to neighbors, or whether the public has a hearing -- it could become a fully administrative one-step process. The draft should specify the actual procedure."},{"icon":"📐","title":"Article 7 Definitions -- the 10-unit cap and contiguous-land limit are deleted","copy":"The SSR draft included \"No project that includes more than ten (10) total units may be considered for Accelerated Housing Review\" along with rules requiring the application to encompass the whole contiguous parcel and preventing future fast-track applications on the same land. The County's draft strikes the entire paragraph. Nothing in Proposition 123 requires the fast-track process to apply to projects of any size. As drafted, a 200-unit development could move through 90-day review with limited or no public notice -- a far different posture than the small-project framing the SSR proposed."}],"players":[{"icon":"📜","title":"Planning staff and consultants","copy":"They draft and shape the first version of the ordinance language and run the SSR process day-to-day."},{"icon":"🌲","title":"County Planning Commission and BOCC","copy":"They translate policy goals into enforceable rules and hold the final adoption vote on draft amendments."},{"icon":"🏠","title":"Housing advocates and neighborhood critics","copy":"Both tend to agree the rules matter -- they just disagree on what problem the rules should solve first."},{"icon":"⚖️","title":"Future applicants and objectors","copy":"They inherit whatever approval framework gets adopted now."}],"roster":{"title":"Stakeholder Strategic Roundtable (SSR)","subtitle":"Appointed by San Miguel County to advise on the Housing Code Update. The SSR adheres to a charter with consensus-seeking norms and a 70% super-majority for formal \"temperature-check\" statements; recap, slide deck, and audio are posted within 72 hours of each meeting.","groups":[{"label":"SSR Project Team","members":[{"name":"Drea Araiza","role":"Housing Specialist, San Miguel County staff"},{"name":"Hallie Bevan-Simpson","role":"County Planning Commission"},{"name":"Jarrod Biggs","role":"Deputy County Manager, San Miguel County staff"},{"name":"John Miller","role":"Telluride Ski and Golf"},{"name":"Drew Nelson","role":"Housing Director, Town of Mountain Village"},{"name":"John Pandolfo","role":"Superintendent, Telluride School District R-1"},{"name":"Kaye Simonson","role":"Planning Director, San Miguel County staff"},{"name":"Lee Taylor","role":"County Planning Commission"},{"name":"James Van Hooser","role":"Community Housing Manager, Town of Telluride"},{"name":"Lance Waring","role":"Board of County Commissioners"}]},{"label":"Appointed Individuals","members":[{"name":"Danny Craft"},{"name":"Tony Daranyi"},{"name":"Elaine Demas"},{"name":"Nick Farkouh"},{"name":"Peter Johnson"},{"name":"Nina Kothe"},{"name":"Amy Levek"},{"name":"Paul Major"},{"name":"Stefanie Solomon"},{"name":"Jason Soules"},{"name":"Kathrine Warren"},{"name":"Anna Wilson"}]}]}},

  "wildfire":
    {"lastUpdated":"2026-06-01","heroImage":"/images/blog/telluride-paradise-fire.jpg","heroAlt":"Wildfire burning above a mountain town at dusk","label":"Wildfire Resiliency","intro":"The Town of Telluride, San Miguel County, and the Telluride Fire Protection District are all considering adoption of Colorado's Wildfire Resiliency Code and the International Wildland Urban Interface (WUI) Code -- setting construction and land management standards in fire-prone areas.","statusTitle":"Multiple bodies are simultaneously weighing wildfire code adoption.","statusCopy":"In a box canyon with one primary exit road, wildfire preparedness is an existential community concern. These codes would set building material requirements, defensible space mandates, and vegetation management standards for new construction and renovations. The question is how aggressively to adopt fire-resistance standards and how they interact with development approvals.","nextStep":"Watch Town Council, Fire District, and County agendas for wildfire resiliency code hearings and adoption votes.","metrics":[{"label":"Core question","value":"How far should fire-resistance standards go?","sub":"Adoption means new construction and renovations must meet enhanced standards. The scope and cost implications are the main debate."},{"label":"Why it matters here","value":"Box canyon with one exit road","sub":"Wildfire evacuation is not theoretical -- the geography makes preparedness an existential priority."},{"label":"Connection to development","value":"Society Turn and new projects","sub":"No wildfire evacuation analysis has been completed for the Society Turn PUD at the valley's single entry/exit point."}],"timeline":[{"date":"Past","title":"Fire mitigation identified as top community priority","copy":"Regional planning processes consistently rank wildfire preparedness among the most critical long-term concerns for the Telluride region."},{"date":"Recent","title":"Fire District takes up Wildfire Resiliency and WUI codes","copy":"Resolutions 2026-02 (Wildfire Resiliency Code) and 2026-03 (WUI Code) introduced at the fire district level, alongside apparatus and Station 3 updates."},{"date":"Now","title":"Town Council also considering adoption","copy":"The town's April 14 agenda includes adoption of the Colorado Wildfire Resiliency Code alongside other land use code updates."},{"date":"Next","title":"Watch for adoption votes and implementation details","copy":"The key details are in the specific requirements adopted -- building materials, defensible space zones, vegetation management, and how they apply to existing vs. new construction.","future":true}],"docs":[{"title":"Town of Telluride Agendas & Minutes","copy":"Watch for wildfire resiliency code adoption on Town Council agendas.","tag":"Town Record","href":"https://telluride-co.civicweb.net/Portal/MeetingTypeList.aspx"},{"title":"Telluride Fire Protection District","copy":"Fire district meetings where WUI and resiliency code resolutions are being considered.","tag":"Fire District","href":"https://telluridefire.com/"},{"title":"San Miguel County CivicClerk Portal","copy":"County-level forestry and fire code discussions.","tag":"County Record","href":"https://sanmiguelcoco.portal.civicclerk.com/"}],"players":[{"icon":"🔥","title":"Telluride Fire Protection District","copy":"Leading the push for WUI and resiliency code adoption through Resolutions 2026-02 and 2026-03."},{"icon":"🏛️","title":"Town Council","copy":"Considering parallel adoption of the Colorado Wildfire Resiliency Code alongside land use code updates."},{"icon":"🌲","title":"County Planning and BOCC","copy":"County-level forestry regulations affect wildfire risk, watershed health, and ecosystem integrity across the region."},{"icon":"🏠","title":"Property owners and builders","copy":"Bear the cost of enhanced building standards but also the most direct benefit of reduced fire risk."}]},

  "diamond":
    {"lastUpdated":"2026-06-01","label":"Diamond Ridge","heroImage":"/images/Diamond%20Ridge.jpg","intro":"Diamond Ridge is a 105-acre property on Deep Creek Mesa near the Telluride Airport that San Miguel County and the Town of Telluride purchased for $7.2M with plans for high-density affordable housing using a newly created high-density zone district called the CH Zone that allows for 20 units per acre. Neighboring landowners challenged the rezoning and won twice in court -- first on due process and illegal spot zoning grounds, then on a PUD interpretation that further restricts development. A $5M state grant expired due to the County's failed legal strategy. Despite neighboring landowners and many community members requesting discussions about the property's future, the Town and County have not held public discussions, and the land remains idle.","statusTitle":"The courts ruled the County broke its own rules -- twice.","statusCopy":"In 2022, the BOCC rushed through a rezone of 39 acres of the Diamond Ridge property from protected Forestry/Agricultural land to the CH Zone. The district court found that County Commissioner Hilary Cooper helped engineer the purchase and rezone behind the scenes, and therefore, when she refused to recuse herself from a vote on rezoning, the County denied landowners proper due process. The court also found the rezone was illegal spot zoning that ignored the Master Plan. The Town and County believe the 39 acres to be separate from the encompassing 1991 Aldasoro PUD plan, which restricts development to one home per 35 acres, and therefore made no attempt to rezone the remaining 66 acres of undisputedly PUD-protected land. Neighboring property owners dispute this belief. In a second 2024 ruling, the court confirmed that the Diamond Ranch lots are part of the 1991 Aldasoro PUD, meaning they are restricted to one home per 35 acres. However, in a later decision by a new judge on the case, the court did find the 39 acres not to be subject to the 1991 PUD. Neighboring property owners have appealed this ruling, and the County subsequently appealed the PUD ruling but has not attempted a new rezoning.","nextStep":"Watch for the outcome of the appeals of the PUD-related rulings, and whether the County attempts any new rezoning or development strategy.","metrics":[{"label":"Core tension","value":"Government bypassed its own zoning rules to fast-track development","sub":"The County invented a new high-density zone and applied it to protected open space -- the court found it violated due process and the Master Plan."},{"label":"What the courts found","value":"Two rulings vindicating the landowners","sub":"Dec. 2022: rezoning vacated for commissioner bias and illegal spot zoning. June 2024: Diamond Ranch lots confirmed within the 1991 Aldasoro PUD, restricting development to 35-acre lots."}],"timeline":[{"date":"1991","title":"Aldasoro Ranch PUD Plan protects the area as open space","copy":"The Sheep Ranch area (now Diamond Ranch) is zoned Forestry/Agricultural with 35-acre minimum lots, Department of Wildlife building site approval required, and a RETA for transportation mitigation -- protections landowners relied on when purchasing property."},{"date":"2021","title":"BOCC quietly creates a new high-density zone district called the CH (Community Housing) Zone","copy":"San Miguel County amends the Land Use Code to create the Community Housing zone allowing up to 20 units per acre -- the polar opposite of the F/Ag zoning that had protected the area for decades. The entire process was conducted by Zoom during the COVID lockdowns, with no public participation. Text messages later revealed this was coordinated with the Town's purchase plan."},{"date":"2022","title":"Only three months after adopting the CH Zone, an application to rezone Diamond Ridge is completed, and the rezone is rushed through over objections; court strikes it down","copy":"Despite a formal recusal request, Commissioner Cooper -- who had privately coordinated the purchase and rezone with the Town -- voted to approve the rezone 3-0. Neighboring landowners sued. In December 2022, Judge Patrick ruled in favor of the neighboring landowners and vacated (nullified) the rezone, finding a due process violation and illegal spot zoning."},{"date":"2023","title":"$5M state grant expires; landowners offer to buy the property","copy":"The County's failed legal strategy costs taxpayers the $5M DOLA housing grant, which expires in November 2023. Area residents offer $6.15M to purchase the property -- nearly the full purchase price -- but the County and Town refuse to sell."},{"date":"2024","title":"Second court victory: Diamond Ranch confirmed within Aldasoro PUD","copy":"In June 2024, Judge Patrick rules that the Diamond Ranch lots are part of the 1991 PUD's unified plan of development, meaning they are restricted to one home per 35-acre lot. The County announces it will appeal rather than accept the ruling."},{"date":"2026","title":"Order of Judgment: the disputed parcel ruled NOT part of the 1991 PUD","copy":"In a March 2026 Order of Judgment, a new judge (D. Cory Jackson) enters judgment for the Town and County on the landowners' declaratory claim. The court holds that \"Parcel C\" -- the disputed ~39 acres the County sought to rezone -- is NOT part of the 1991 Aldasoro PUD, so the governments are not required to comply with C.R.S. 24-67-106 or bring a condemnation action to clear the PUD restrictions. The court reasoned the 1991 PUD covered the separate \"Sheep Ranch\" subdistrict, that Parcel C was platted later (1995) from separately purchased acreage, and that the 2000 PUD Assignment Agreement expressly excluded Parcel C. Neighboring landowners are appealing. Case No. 2023CV30044."},{"date":"Next","title":"Appeals pending","copy":"The County is appealing the June 2024 PUD determination. If the appeal fails, it would further solidify the existing development restrictions that landowners have fought to preserve. Neighboring property owners are appealing the ruling that the distinct 39 acres the County and Town sought to rezone is not subject to the 1991 PUD's unified plan of development.","future":true}],"docs":[{"title":"Order of Judgment — Parcel C & the 1991 PUD (March 2026)","copy":"A new judge (D. Cory Jackson) enters final judgment for the Town and County on the landowners' C.R.C.P. 57 declaratory claim, holding that \"Parcel C\" -- the disputed ~39 acres the County sought to rezone -- is NOT part of the 1991 Aldasoro PUD, so the governments need not comply with C.R.S. 24-67-106 or bring a condemnation action to clear PUD restrictions. The court reasoned the 1991 PUD covered the separate \"Sheep Ranch,\" that Parcel C was platted later (1995), and that the 2000 PUD Assignment Agreement expressly excluded it. The landowners are appealing. Case No. 2023CV30044.","tag":"Court Order 2026","href":"/assets/Diamond%20Ridge/diamond-order-judgment-2026.pdf"},{"title":"Plaintiffs' Opening Brief in Support of Declaratory Relief (with Exhibits)","copy":"Landowners' opening brief seeking declaratory relief, filed Dec 16, 2024, including the full exhibit record (large file).","tag":"Brief Dec 2024","href":"/assets/Diamond%20Ridge/diamond-declaratory-opening-brief-2024.pdf"},{"title":"Order RE: Petition for Review — Aldasoro PUD (June 2024)","copy":"Court rules in favor of landowners: Diamond Ranch lots are part of the 1991 Aldasoro PUD unified plan of development. BOCC's contrary interpretation vacated. Case No. 23CV30044.","tag":"Court Order 2024","href":"/assets/Diamond%20Ridge/diamond-order-petition-review-2024.pdf"},{"title":"Plaintiffs' Reply Brief (C.R.C.P. 106(a) Relief)","copy":"Landowners' reply brief in support of C.R.C.P. 106(a) relief (Case No. 23CV30044), May 20, 2024.","tag":"Reply May 2024","href":"/assets/Diamond%20Ridge/diamond-reply-brief-2024.pdf"},{"title":"County's Answer Brief","copy":"San Miguel County's answer brief responding to the landowners' Rule 106 petition (Case No. 23CV30044), May 6, 2024.","tag":"Answer May 2024","href":"/assets/Diamond%20Ridge/diamond-answer-brief-2024.pdf"},{"title":"Plaintiffs' Opening Brief (Rule 106 Review)","copy":"Landowners' opening brief in the C.R.C.P. 106(a)(4) review of the BOCC's Diamond Ridge rezone (Case No. 23CV30044), April 4, 2024.","tag":"Brief Apr 2024","href":"/assets/Diamond%20Ridge/diamond-opening-brief-2024.pdf"},{"title":"Order RE: Rule 106(a)(4) Review — Rezoning (Dec 2022)","copy":"Court rules in favor of landowners: BOCC's rezoning of Diamond Ridge vacated on two grounds -- Commissioner Cooper's participation violated due process, and the rezone constituted illegal spot zoning inconsistent with the Master Plan. Case No. 22CV30023.","tag":"Court Order 2022","href":"/assets/Diamond%20Ridge/diamond-order-106a-review-2022.pdf"},{"title":"San Miguel County CivicClerk Portal","copy":"County-level records including BOCC agendas and Diamond Ridge development materials.","tag":"County Record","href":"https://sanmiguelcoco.portal.civicclerk.com/"}],"legalIssues":[{"icon":"⚖️","title":"Commissioner bias and due process violation","copy":"Text messages showed Commissioner Cooper privately coordinated the purchase and rezone with the Town's representative, advocated declaring an \"emergency\" to rush the process, and then refused to recuse when the matter came before the BOCC. The court found she prejudged the outcome and deprived landowners of a fair hearing."},{"icon":"🗺️","title":"Illegal spot zoning in violation of the Master Plan","copy":"The court found the rezone was incompatible with the comprehensive zoning plan. The Master Plan designates the area as Low Density Residential Cluster (1 unit per 6-8 acres), but the CH zone allows up to 20 units per acre. The court said this bore no relation to the original purpose of the Diamond Ridge PUD."},{"icon":"📋","title":"PUD protections upheld over County objections","copy":"In a second case, the court confirmed that Diamond Ranch lots are part of the 1991 Aldasoro PUD's unified plan of development -- entitling landowners to the protections they bargained for, including 35-acre minimum lots and Department of Wildlife building site approval."},{"icon":"💰","title":"Taxpayer cost of the County's failed strategy","copy":"The County and Town spent $7.2M of public funds on land that remains undeveloped. A $5M DOLA grant expired in November 2023 because the County's rezoning was struck down. When area residents offered $6.15M to buy the property back, the County refused."}],"players":[{"icon":"🏛️","title":"San Miguel County BOCC","copy":"Created the CH zone, approved the rezoning despite a recusal request, and continues to appeal rather than accept the court's rulings protecting existing land use protections."},{"icon":"🏔️","title":"Town of Telluride","copy":"Co-purchaser of Diamond Ridge. Town Program Director Lance McDonald submitted the rezoning application and coordinated with Commissioner Cooper behind the scenes before the public hearing process."},{"icon":"🏠","title":"Deep Creek Mesa / neighboring landowners","copy":"Prevailed in both court challenges -- Bennett v. Vickers (rezoning) and Lucarelli v. BOCC (PUD interpretation). Offered $6.15M to purchase the property and resolve the dispute, but the offer was refused."},{"icon":"👨‍⚖️","title":"Judge J. Steven Patrick","copy":"Ruled in favor of landowners in both cases -- vacating the rezoning in 2022 and confirming Diamond Ranch lots within the Aldasoro PUD in 2024."}],"news":[{"source":"Telluride News","date":"Jul 14, 2024","title":"County to appeal court's land-use ruling on Aldasoro PUD","href":"https://www.telluridenews.com/news/article_5b4df0c2-4180-11ef-aaa5-5b37f7e2a039.html","copy":"Rather than accept a second court loss, San Miguel County announces it will appeal the June 2024 ruling confirming Diamond Ranch lots are protected by the 1991 Aldasoro PUD."},{"source":"Telluride News","date":"Jan 5, 2024","title":"No talks to sell Diamond Ridge property, town says","href":"https://www.telluridenews.com/news/article_1f11df86-a9d4-11ee-b2a1-5fbbd91a6830.html","copy":"Despite losing in court, officials refuse a $6.15M offer from neighboring residents -- nearly the full purchase price -- choosing to hold land they cannot legally develop under current rulings."},{"source":"Telluride News","date":"Nov 17, 2023","title":"State to reallocate grant that was for Diamond Ridge housing project","href":"https://www.telluridenews.com/news/article_48fa9492-85a2-11ee-82bd-7f691ab62966.html","copy":"DOLA reallocates the $5M grant after the County's illegal rezoning was struck down -- a direct consequence of the BOCC's failure to follow its own land use rules."},{"source":"Telluride News (Release)","date":"Nov 15, 2023","title":"State grant for Diamond Ridge housing initiative expires due to litigation delays","href":"https://www.telluridenews.com/news_release/article_09d4da6e-856d-11ee-b27b-a752864d23d8.html","copy":"The $5M DOLA grant officially expires, with funds redirected to other Colorado communities whose housing projects followed proper process."},{"source":"Telluride News","date":"May 5, 2023","title":"Judge: 'Spot zoning' remains illegal for Diamond Ridge project","href":"https://www.telluridenews.com/news/article_04f0e2ae-ead6-11ed-b6cb-4bdfb53b3196.html","copy":"Court reaffirms its December 2022 ruling that the Diamond Ridge rezoning was illegal spot zoning, rejecting the County's attempts to revisit the decision."},{"source":"Telluride News (Opinion)","date":"Jan 12, 2023","title":"The Diamond Ridge fiasco","href":"https://www.telluridenews.com/opinion/article_4e695f38-9144-11ed-8109-efe6161caf94.html","copy":"Opinion piece examining how the County's disregard for process and existing protections led to a costly legal defeat and a stalled housing project."},{"source":"Telluride News","date":"Jan 2, 2023","title":"Legal ruling reverses Diamond Ridge rezone","href":"https://www.telluridenews.com/news/article_85c1c148-8be3-11ed-aaca-0fd1af7ae3da.html","copy":"Judge Patrick's December 2022 order vacates the BOCC's rezoning, vindicating landowners who argued the process was tainted by commissioner bias and violated the Master Plan."},{"source":"Telluride News","date":"Jul 22, 2022","title":"Deep Creek group files lawsuit over zoning decision","href":"https://www.telluridenews.com/news/article_793756f6-094b-11ed-abf3-131792480868.html","copy":"Neighboring landowners take the only recourse available to them -- a Rule 106(a)(4) petition challenging the BOCC's rezoning after their recusal request was ignored."},{"source":"Telluride News","date":"May 20, 2022","title":"Commissioners approve rezone of Diamond Ridge","href":"https://www.telluridenews.com/news/article_eac5e9fa-d704-11ec-8e24-e7d9f2a0067d.html","copy":"BOCC votes 3-0 to rezone 39 acres from F/Ag to Community Housing despite a formal recusal request -- Commissioner Cooper, who privately coordinated the plan, refuses to step aside."},{"source":"Telluride News","date":"May 11, 2022","title":"Commissioner's recusal sought ahead of hearing","href":"https://www.telluridenews.com/news/article_9e0337f8-d308-11ec-acf1-674927587809.html","copy":"Landowners' counsel formally requests Commissioner Cooper recuse herself, citing text messages showing she was a driving force behind the purchase and rezone plan -- a request the Commissioner ignores."},{"source":"Telluride News","date":"Apr 22, 2022","title":"Planning board narrowly OKs zoning change","href":"https://www.telluridenews.com/news/article_f9e1393c-c1cc-11ec-8a85-9fd77399946c.html","copy":"Planning Commission narrowly approves the rezone over significant opposition, sending the controversial decision to the BOCC for final action."},{"source":"Telluride News","date":"Apr 21, 2022","title":"County planning commission begins Diamond Ridge rezoning process","href":"https://www.telluridenews.com/news/article_ac75ddb0-c0f5-11ec-b7c9-c7819ef15cd3.html","copy":"Formal review begins on the application to convert protected open space into high-density housing, prompting immediate concern from Deep Creek Mesa residents."}]},

  "skigate":
    {"ctaTitle":"Follow the case","ctaCopy":"This fight is in the courts, not at a public hearing — the best way to follow it is the filings themselves. Start with the operative complaint, then the dueling dismissal briefs.","ctaLabel":"Read the complaint","ctaHref":"/assets/Ski-Gate/first-amended-complaint-2026-05-08.pdf","lastUpdated":"2026-07-21","category":"Governance","label":"Ski-Gate: Telski v. Former Officials","heroImage":"assets/Ski-Gate/telluride-ski-resort-hero.jpg","heroAlt":"Winter view over the Mountain Village base area of Telluride Ski Resort, seen from the gondola","heroCredit":"Photo: Murray Foubister via Wikimedia Commons, CC BY-SA 2.0","intro":"In late December 2025, at the height of a ski patrol strike that closed the resort during the holiday peak, two sitting elected officials — Telluride's mayor pro tem and Mountain Village's mayor — traveled to California and presented Telski owner Chuck Horning with a signed offer to buy a 51% controlling stake in the resort for $127.5 million on behalf of undisclosed investors. When the trip became public in January, both resigned, both towns commissioned independent investigations, and Telski sued the two former officials and Mountain Village's former town manager. The case the community has dubbed “Ski-Gate” now turns on a hard question: where is the line between public office and private dealmaking?","statusTitle":"Where it stands now","statusCopy":"Three motions are fully briefed and awaiting a ruling in San Miguel County District Court (case 2026CV30011). All three defendants have moved to dismiss, arguing the amended complaint does not plausibly allege they did anything to prolong the strike — pointing to the meeting transcript itself, which they say shows the proposed deal would have ended it. Fee has separately moved to strike the secretly recorded meeting transcript, arguing the recording violated California's all-party-consent law. Telski responds that the signed offer's own terms — official acts listed as “Additional Consideration” — plausibly plead an abuse of public office.","nextStep":"The court's ruling on the motions to dismiss and the motion to strike. If the case survives, it moves into discovery; if it is dismissed, Telski can seek leave to amend or appeal.","metrics":[{"label":"The offer","value":"$127.5M for 51%","sub":"Signed “Offer to Purchase” presented to Telski's owner on Dec 29, 2025, on behalf of the “Telluride Ski Resort Fund”"},{"label":"The strike","value":"Dec 27 – Jan 7","sub":"Ski patrol strike closed the resort at the height of the 2025–26 holiday season; Telski estimates losses of several million dollars"},{"label":"Officials out","value":"3","sub":"Two resigned in January 2026; the former town manager separated from employment May 1"},{"label":"Investigations","value":"2","sub":"Independent reports commissioned by Mountain Village (309 pages) and Telluride"}],"legalIssuesTitle":"The legal questions in play","legalIssues":[{"title":"Tortious interference","copy":"Telski alleges the defendants interfered with its business by representing they could end — and by implication prolong — the strike unless Horning sold a controlling stake. The defendants counter that the complaint alleges no act that prolonged the strike, and that the transcript shows the deal was framed as a way to end it."},{"title":"Civil conspiracy","copy":"The complaint alleges the three coordinated on the offer and related documents, including a draft NDA that Telluride's own CORA production shows was authored by Wisor on January 3, 2026. The defense calls the conspiracy claim derivative and unsupported by any unlawful agreement or overt act."},{"title":"The secret recording","copy":"Telski's key exhibit is a partial transcript of the Newport Beach meeting, recorded by a Telski representative without the officials' knowledge. Fee argues California's all-party-consent law (Cal. Penal Code § 632) makes the recording unlawful and inadmissible; Telski opposes striking it."},{"title":"Public office vs. private gain","copy":"The signed offer's Appendix B listed official public acts — brokering an end to the strike, holding snowmaking water prices, town housing partnerships, regional flight spending — as “Additional Consideration.” Both towns' ethics codes restrict officials from trading on their offices; the two independent investigations reached nuanced conclusions about whether lines were crossed."}],"timeline":[{"date":"Dec 26, 2025","title":"A meeting is arranged","copy":"One day before the ski patrol strike begins, Fee and Prohaska contact Telski owner Chuck Horning to arrange a California meeting, saying they have something that could resolve the looming patrol impasse."},{"date":"Dec 27, 2025","title":"Ski patrol strike closes the resort","copy":"The Telluride Ski Patrol strike shuts the mountain at the height of the holiday season. The closure runs through January 7 and, by Telski's estimate, costs the resort and local businesses millions."},{"date":"Dec 28–29, 2025","title":"The Newport Beach offer","copy":"Fee and Prohaska meet Telski representatives, then Horning. They sign an “Offer to Purchase”: 51% of Telski's assets for $127.5 million via the “Telluride Ski Resort Fund,” with both officials as managing partners. Appendix B lists “Additional Consideration” — official acts including brokering an end to the strike, holding water prices, housing partnerships, and flight spending. Telski does not accept. A Telski representative records the meeting without the officials' knowledge."},{"date":"Jan 7, 2026","title":"The strike ends","copy":"Ski patrol and Telski reach agreement; the resort reopens after roughly ten days dark."},{"date":"Jan 13–14, 2026","title":"The story breaks","copy":"Telski files a CORA request. A Mountain Village executive session about the trip is accidentally livestreamed, and town manager Paul Wisor reveals previously undisclosed details. Prohaska resigns within hours of learning the town wants an outside investigation."},{"date":"Jan 20–26, 2026","title":"Investigations open; Fee resigns","copy":"Telluride's council votes to investigate Fee; Mountain Village hires an independent investigator. Fee resigns as mayor pro tem and councilmember on January 26, writing that “it is impossible to ignore the rift that this episode has caused in our community.”"},{"date":"Feb 24, 2026","title":"Telski sues","copy":"TSG Ski and Golf, LLC files suit in San Miguel County District Court against Fee, Prohaska, and Wisor, claiming tortious interference and civil conspiracy and seeking damages estimated at several million dollars."},{"date":"May 1, 2026","title":"Wisor separates from the town","copy":"After an investigation into his behind-the-scenes role — including drafting transaction documents — Wisor's employment as Mountain Village town manager ends. “Though difficult, this decision is being made in what I believe is the best interest of the organization and the community as a whole,” he says."},{"date":"May 8, 2026","title":"Amended complaint adds the receipts","copy":"Telski files a First Amended Complaint attaching the signed Offer to Purchase, a partial transcript of the recorded Newport Beach meeting, and the Wisor-drafted NDA produced under CORA."},{"date":"Jun 2, 2026","title":"Mountain Village's investigation reports","copy":"The town releases a 309-page independent report: Prohaska “technically” violated no ethics-code provision, but her conduct was “inconsistent with her ethical obligations”; Wisor did not act contrary to code and had negotiated a clause requiring his termination if the deal closed."},{"date":"Jun 10, 2026","title":"Telluride's investigation reports","copy":"The ILG report finds Fee “failed to maintain the line between personal and governmental roles” — noting she used her official email and title to obtain a flight voucher for the trip — while crediting that she may have believed she was acting personally."},{"date":"Jun 5 – Jul 6, 2026","title":"Dismissal fight fully briefed","copy":"All three defendants move to dismiss; Fee also moves to strike the recorded transcript under California's all-party-consent law. Telski responds; the defendants reply. The motions now await the court's ruling."}],"docs":[{"title":"Defendants' Joint Reply in Support of Motions to Dismiss (Jul 6, 2026)","copy":"The defense's last word on dismissal: the complaint pleads no act that prolonged the strike, and its own exhibits contradict it.","tag":"Defense","href":"/assets/Ski-Gate/joint-reply-iso-dismissal-2026-07-06.pdf"},{"title":"Fee's Reply in Support of Motion to Strike (Jul 6, 2026)","copy":"Closing brief on whether the secretly recorded meeting transcript should be struck from the case.","tag":"Defense","href":"/assets/Ski-Gate/fee-reply-iso-strike-2026-07-06.pdf"},{"title":"Telski's Combined Response to Motions to Dismiss (Jun 26, 2026)","copy":"Telski's counter: the signed offer's own terms plausibly plead that public powers were leveraged for a private acquisition.","tag":"Telski","href":"/assets/Ski-Gate/telski-combined-response-2026-06-26.pdf"},{"title":"Telski's Opposition to the Motion to Strike (Jun 26, 2026)","copy":"Why Telski says the transcript of the Newport Beach meeting should stay in the record.","tag":"Telski","href":"/assets/Ski-Gate/telski-opposition-to-strike-2026-06-26.pdf"},{"title":"Fee's Motion to Dismiss (Jun 5, 2026)","copy":"Fee's separate dismissal motion directed at the First Amended Complaint.","tag":"Defense","href":"/assets/Ski-Gate/fee-motion-to-dismiss-2026-06-05.pdf"},{"title":"Fee's Motion to Strike the Recording (Jun 5, 2026)","copy":"Argues the meeting was recorded without consent in violation of Cal. Penal Code § 632, an all-party-consent state, and the transcript is inadmissible and scandalous.","tag":"Defense","href":"/assets/Ski-Gate/fee-motion-to-strike-2026-06-05.pdf"},{"title":"Prohaska & Wisor's Motion to Dismiss (Jun 5, 2026)","copy":"Argues the transcript shows the proposed deal would have ended the strike, not prolonged it, and no plausible claim is stated under Colorado's Twombly/Iqbal standard.","tag":"Defense","href":"/assets/Ski-Gate/prohaska-wisor-motion-to-dismiss-2026-06-05.pdf"},{"title":"First Amended Complaint (May 8, 2026)","copy":"The operative complaint — the $127.5M offer, Appendix B's “Additional Consideration,” the recorded-meeting transcript excerpts, and the two claims for relief.","tag":"Telski","href":"/assets/Ski-Gate/first-amended-complaint-2026-05-08.pdf"}],"players":[{"title":"TSG Ski and Golf, LLC (Telski)","copy":"The independently owned resort operator, and the plaintiff. Owner Chuck Horning received — and declined — the offer; a Telski representative recorded the December meeting."},{"title":"Julie Meehan Fee","copy":"Former Telluride mayor pro tem and councilmember; resigned January 26, 2026. Maintains she acted as a private citizen and that the offer's terms were aspirational; her motions argue the claims fail as a matter of law."},{"title":"Martinique “Marti” Prohaska","copy":"Former Mountain Village mayor (and ski patroller); resigned January 14, 2026. MV's independent report found no technical code violation but conduct “inconsistent with her ethical obligations.”"},{"title":"Paul Wisor","copy":"Former Mountain Village town manager; drafted transaction documents including an NDA. Separated from town employment May 1, 2026. MV's report found he did not act contrary to code."},{"title":"The two towns","copy":"Telluride and Mountain Village are not parties to the lawsuit. Each commissioned an independent investigation and released its report in June 2026."}],"news":[{"source":"Telluride Daily Planet","date":"Jul 21, 2026","title":"Telski amends lawsuit against Prohaska, Wisor and Fee","href":"https://www.telluridenews.com/news/article_fdd6316f-fb0f-4629-87d0-6ae9800e4251.html"},{"source":"Telluride Daily Planet","date":"Jun 10, 2026","title":"Fee failed to maintain line between personal, governmental roles","href":"https://www.telluridenews.com/news/article_7f2f7f97-cfba-4bba-8e22-5cedb5539f85.html"},{"source":"Telluride Daily Planet","date":"Jun 2, 2026","title":"Investigation finds Prohaska 'technically' free of ethics violations","href":"https://www.telluridenews.com/news/article_2fcca626-62fb-459c-9c24-a3ca6915d695.html"},{"source":"Telluride Daily Planet","date":"May 1, 2026","title":"Wisor resigns as Mountain Village town manager","href":"https://www.telluridenews.com/news/article_2c1cc16d-5e4a-4543-86bd-1faadf9f7028.html"},{"source":"Telluride Daily Planet","date":"Mar 6, 2026","title":"Telski lawsuit claims 'civil conspiracy' in 'self-serving scheme'","href":"https://www.telluridenews.com/news/article_dfa5dfbb-25c4-44af-a45f-91b182c88ee0.html"},{"source":"Telluride Daily Planet","date":"Jan 26, 2026","title":"Telluride Mayor Pro Tem Meehan Fee resigns","href":"https://www.telluridenews.com/news/article_ed2fc3f8-8a43-480e-9183-84ea4db0d28c.html"},{"source":"Telluride Daily Planet","date":"Jan 25, 2026","title":"MV opens investigation into former Mayor Marti Prohaska's resignation","href":"https://www.telluridenews.com/news/article_a76bcdfd-ee6f-4be7-b849-c0bc84c01ecc.html"}],"meetings":[]},

  "norwoodwater":
    {"lastUpdated":"2026-07-23","label":"Norwood Water","heroImage":"/images/deep-dives/norwood-water-system.jpg","heroAlt":"Map of the Norwood Water Commission's water system across Wright's Mesa","heroCredit":"Water system overview -- SGM, 2022 Water Supply Adequacy Memo","intro":"Norwood's water is run by the Norwood Water Commission (NWC), a rural system serving the town, Redvale, and the farms and homes of Wright's Mesa through roughly 20 miles of pipe. Nearly all of its firm supply is a single contract: 300 acre-feet a year of raw water from Gurley Reservoir, and Gurley only delivers from April to November -- the winter runs on two small raw-water reservoirs filled each fall. The town's own engineers have warned twice, in the 2020 Water Master Plan and again in a 2022 supply-adequacy memo, that the supply has no redundancy, that drought can threaten it, and that the growth Norwood is approving is on pace to consume the entire allocation within a decade or two. On Wright's Mesa, every subdivision approval draws down the same fixed bucket of water.","statusTitle":"Growth is on pace to use up the whole water contract.","statusCopy":"The 2022 SGM memo puts hard numbers on it: the system was using roughly 198 of its 300 acre-feet, and at the 2% growth rate assumed in the Master Plan the full allocation is reached around 2042 -- at 3% growth, around 2036. Development already approved or in early planning (the 24-lot Pinon Park Subdivision and the 75-100 lot Mountain Village Employee Housing Project) adds an estimated 124 taps and about 310 people, an 11.6% population jump that by itself matches the plan's growth assumptions. The treatment plant faces the same clock: maximum-day demand is projected to hit 92% of its capacity by 2042, and the engineers recommend planning for a new plant in the early 2030s with rate-structure work starting about a decade ahead. Their repeated recommendation is to firm up a second, year-round source -- the San Miguel River diversion the NWC already holds a decreed right for -- and to consider a water-rights dedication ordinance so new development brings water with it.","nextStep":"The Water Commission meets the second Tuesday of each month (tracked on Gov-Hub and the Norwood hub). Watch for movement on the San Miguel River supply project, a water-rights dedication ordinance, rate-structure changes, and how each new subdivision application squares with the 300 acre-foot math.","metrics":[{"label":"Firm supply","value":"300 acre-feet a year -- one contract, one reservoir","sub":"A perpetual 2005 agreement for Gurley Reservoir raw water, deliverable only April-November. Single watershed, drought-vulnerable, no redundant source."},{"label":"The math","value":"Full allocation reached around 2036-2042","sub":"Roughly 198 AF already in use (2022). Approved and planned projects add ~124 taps; 3% growth exhausts the contract by 2036, 2% by 2042."},{"label":"The pipe","value":"One 10-inch line feeds the whole system","sub":"The only transmission line from the treatment plant to town has failed repeatedly and is past the end of its useful life; rural lines are undersized, with low pressure and no fire flows."},{"label":"Treatment","value":"92% of plant capacity by 2042","sub":"The 0.56 million-gallon-per-day plant handles today's demand but engineers recommend planning its replacement in the early 2030s -- financing alone can take a decade."}],"timeline":[{"date":"1993","title":"The NWC is created","copy":"Town and rural Wright's Mesa water service -- historically provided by the San Miguel Water Conservancy District -- is consolidated into the Norwood Water Commission. The Town owns the in-town infrastructure; the NWC operates the entire system as one."},{"date":"1994-2006","title":"Early master plans","copy":"Westwater Engineering prepares the original distribution master plan (1994), a raw-water feasibility report (1995), and a master plan update (2006). Some recommendations are implemented; others are not."},{"date":"April 2005","title":"The 300 acre-foot Gurley contract","copy":"The NWC and the Farmers Water Development Commission sign a perpetual agreement for 300 acre-feet per year of raw, untreated Gurley Reservoir water for domestic use -- the supply the whole system still runs on."},{"date":"2018","title":"A drought exposes the risk","copy":"Water levels drop significantly in Gurley Reservoir and the NWC's raw-water reservoirs. Engineers later conclude that a second consecutive drought year would have left the system unable to supply adequate drinking water without restrictions."},{"date":"November 2020","title":"The SGM Water Master Plan","copy":"A full system study: GIS mapping, a hydraulic model, and a hard look at infrastructure. Findings include undersized and un-looped distribution lines, low pressures and missing fire flows in rural areas, a failing single transmission line, and water-quality compliance tensions. It recommends pursuing the San Miguel River as a second supply and raising service fees gradually to fund aging-infrastructure replacement."},{"date":"August 2022","title":"The supply-adequacy warning","copy":"With Pinon Park approved and the Mountain Village Employee Housing Project in early planning, SGM re-runs the numbers: growth is tracking the high end, the full 300 AF is reached between 2036 and 2042, and the treatment plant nears capacity on the same horizon. The memo urges the NWC to firm up its decreed San Miguel River diversion and consider a water-rights dedication ordinance."},{"date":"July 2026","title":"NWC meetings join Gov-Hub","copy":"Livable Telluride begins tracking the Water Commission's second-Tuesday meetings alongside Norwood's Trustees and P&Z -- agendas, packets, and plain-English summaries as they post."}],"docs":[{"title":"Water Supply Adequacy Memo (SGM, August 2022)","copy":"The growth-versus-supply math: current use against the 300 AF Gurley contract, tap projections for Pinon Park and the Mountain Village Employee Housing Project, treatment-plant capacity timing, and the recommendation to firm up the San Miguel River right.","tag":"Engineering memo","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fnorwoodwater%2FNWC-2022-Water-Supply-Adequacy-Memo.pdf?alt=media&token=b73ca267-3332-460d-9cb0-41ceb0bbb708"},{"title":"NWC Water Master Plan (SGM, November 2020)","copy":"The full system study behind the memo: supply and water rights, treatment and storage, the hydraulic model, infrastructure priorities, and the San Miguel River diversion feasibility work. Large file (~80 MB).","tag":"Master plan","href":"https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/deep-dive-docs%2Fnorwoodwater%2FNWC-2020-Water-Master-Plan.pdf?alt=media&token=81157ef6-a29d-4511-9dd3-c055eda6dad8"}],"legalIssues":[{"icon":"⚖️","title":"A decreed river right, not yet a real supply","copy":"The NWC holds a decreed San Miguel River diversion right (5 cfs -- Case No. 94CW244, diligence Case No. 08CW55) near the confluence with Beaver Creek. Engineers have urged the commission to firm it up as a second, year-round source; building the intake, pump station, and transmission line is a major capital project, and water-court proceedings in a contested basin can take years."},{"icon":"💧","title":"Agricultural rights can't simply become tap water","copy":"Converting agricultural water rights to domestic use requires a change case in water court. A water-rights dedication ordinance -- used by other Western Slope providers -- would require future development or annexations to dedicate rights that offset their demand on the potable system."}],"players":[{"icon":"🚰","title":"Norwood Water Commission","copy":"Operates the entire system -- supply, treatment, storage, and 20 miles of distribution -- for the town and rural Wright's Mesa. Meets the second Tuesday of each month."},{"icon":"🏛️","title":"Town of Norwood -- Trustees & P&Z","copy":"Approve the growth that draws on the fixed water supply. The Town owns the in-town infrastructure; every subdivision decision is also a water decision."},{"icon":"🌾","title":"Farmers Water Development Commission","copy":"The counterparty on the perpetual 2005 Gurley Reservoir contract that supplies the NWC's 300 acre-feet per year."},{"icon":"📐","title":"SGM (town engineers)","copy":"Authors of the 2020 Water Master Plan and the 2022 supply-adequacy memo -- the two documents that lay out the system's risks and the path to a second source."}],"news":[],"category":"Water","chart":{"title":"When the 300-acre-foot contract runs out","yLabel":"Water demand (acre-feet / year)","xs":[2022,2030,2036,2042],"cap":300,"capLabel":"300 AF — the full Gurley contract","series":[{"label":"2% growth","values":[201.6,236.2,266,299.6]},{"label":"3% growth","values":[203.6,257.9,307.9,367.7]},{"label":"4% growth","values":[205.6,281.3,356,450.4]}],"markers":[{"x":2036,"label":"3% hits the cap ~2036"},{"x":2042,"label":"2% hits the cap ~2042"}],"caption":"Projected annual water demand vs. the Norwood Water Commission's firm 300 acre-foot/year Gurley Reservoir supply, at three growth rates. Once demand crosses the dashed line, the town has no firm water left for new taps without a second source. Source: SGM 2022 Water Supply Adequacy Memo, Table 3."}}
};

const GONDOLA_DATA = {
  lastUpdated: '2026-07-20',  // bump when hand-editing this topic
  label: 'Gondola 3A',
  legalSummary: 'This case involved a challenge to the 3A campaign claiming that SMART failed to provide adequate TABOR notice because voters were not told where, when, or how to submit opposing comments for inclusion in the ballot notice. Additionally, the 3A campaign was claimed to be misleading in suggesting the measure would meaningfully fund a new gondola. The district court rejected the plaintiff\'s election claims. However, rather than let the matter rest, the public entities of Mountain Village, Town of Telluride, and SMART brought motions seeking attorney fees for just over $100,000. Plaintiff is currently appealing such award in court. The fee award is now fully briefed before the Colorado Court of Appeals (Case No. 2026CA391): the Towns and SMART filed answer briefs July 2, 2026, and Masson\'s reply briefs answer them -- arguing the trial court never made the findings Colorado\'s fee-shifting statutes require, never addressed the actual claims, and awarded fees under an election statute that requires a judgment no Town obtained.',
  intro: 'Ballot Issue 3A approved ~$8.2M/year in new SMART district tax revenue marketed as funding a new gondola. But the current gondola (built 1996) has a replacement cost estimated at $120-150M+, leaving a significant funding gap. CORA records revealed roughly $125K in campaign consulting before the ballot was referred.',
  statusTitle: 'The gondola funding agreement expires in 2027 -- and the math does not add up.',
  statusCopy: '3A revenue covers a fraction of the replacement cost. CORA requests uncovered roughly $125K in campaign consulting before the ballot was referred. The campaign marketed the measure as funding a "new gondola" but actual revenue only covers operating and partial capital costs.',
  nextStep: 'The fee appeal (2026CA391) is fully briefed -- watch for the Court of Appeals decision. Also watch SMART Board meetings for capital planning, funding strategy, and any new ballot measures or intergovernmental agreements as the 2027 operating-agreement expiration approaches.',
  metrics: [
    { label: 'Core tension', value: '$8.2M/year approved vs. $120-150M+ replacement cost', sub: 'The ballot measure was marketed as funding a new gondola but the revenue covers a fraction of the estimated replacement cost.' },
    { label: 'What CORA revealed', value: '~$125K in pre-ballot campaign consulting', sub: 'CORA records show campaign-consulting spending before the 3A ballot was referred.' }
  ],
  timeline: [
    { date: '1996', title: 'Free gondola connecting Telluride and Mountain Village opens', copy: 'The gondola becomes critical regional infrastructure used by commuters, workers, visitors, and residents daily.' },
    { date: '2024', title: 'Ballot Issue 3A passes', copy: 'Voters approve ~$8.2M/year in new SMART district tax revenue. The campaign frames it as funding a "new gondola" but the revenue covers only a small fraction of estimated replacement cost.' },
    { date: '2025', title: 'CORA records reveal consultant spending and campaign funding', copy: 'Public records requests uncovered roughly $125K in campaign consulting before the ballot was referred, raising transparency questions about how the ballot measure was developed and marketed.' },
    { date: 'Apr 2026', title: 'Appellant files opening appellate brief', copy: 'Emily Masson files her opening brief appealing the district court\'s award of just over $100,000 in attorney fees to SMART, Mountain Village, and the Town of Telluride. The appeal addresses the fee award, not the merits of the election contest.' },
    { date: 'May 2026', title: 'Five entities sign 2026 gondola cost-sharing agreement', copy: 'Mountain Village, TMVOA, the Town of Telluride, San Miguel County, TSG Ski & Golf, and SMART execute the Third Supplement to the 2023 Cost-Sharing IGA, setting a $2,461,032 planning-and-development budget for 2026. SMART funds 50%, the Town of Telluride 25%, and the Mountain Village Entity 25% (split 12.5% Town of Mountain Village / 12.5% TMVOA). The work plans for the gondola after the current operating agreement expires Dec 31, 2027.' },
    { date: 'Jul 2, 2026', title: 'Towns and SMART file answer briefs', copy: 'The Town of Telluride and Mountain Village file a joint answer brief, and SMART files its own, defending the roughly $100,000 fee award against Masson.' },
    { date: 'Jul 2026', title: 'Masson files reply briefs -- the appeal is fully briefed', copy: 'The replies argue the trial court imposed fees without the specific findings Colo. Rev. Stat. 13-17-103(1) requires; that the TABOR-notice theory -- voters must be told when, where, and how to submit comments for the ballot notice -- is a good-faith first-impression reading of Article X, Section 20(3)(b)(v) that the fee-shifting statute expressly protects; that the FCPA claims\' merits (gondola campaign billboards on what Masson reasonably believed was Town property) were never addressed by any court; and that the Towns could not receive fees under the election-contest statute, C.R.S. 1-11-217(2), because they obtained no judgment. Masson also seeks her appellate fees.' },
    { date: 'Next', title: 'Colorado Court of Appeals decides', copy: 'With briefing complete in Case No. 2026CA391, the fee award now rests with the Court of Appeals.', future: true }
  ],
  docs: [
    { title: 'Masson Reply to the Towns (Jul 2026)', copy: 'Argues the fee orders lack the findings required by C.R.S. 13-17-103(1); that misjoinder is not sanctionable conduct; that the FCPA claims\' merits were never addressed; and that no fees were available under C.R.S. 1-11-217(2) because the Towns obtained no judgment.', tag: 'Appeal 2026', href: '/assets/Gondola/3a-appeal-reply-to-towns.pdf' },
    { title: 'Masson Reply to SMART (Jul 2026)', copy: 'Argues SMART attacked a straw man: the actual claim is that TABOR\'s comment-summary provision implies a due-process duty to tell voters when, where, and how to submit comments -- a first-impression theory protected by the good-faith safe harbor of C.R.S. 13-17-102(7).', tag: 'Appeal 2026', href: '/assets/Gondola/3a-appeal-reply-to-smart.pdf' },
    { title: 'Towns\' Joint Answer Brief (Jul 2, 2026)', copy: 'Telluride and Mountain Village\'s joint defense of the fee award.', tag: 'Appeal 2026', href: '/assets/Gondola/3a-appeal-towns-answer-brief.pdf' },
    { title: 'SMART Answer Brief (Jul 2, 2026)', copy: 'SMART\'s defense of the fee award.', tag: 'Appeal 2026', href: '/assets/Gondola/3a-appeal-smart-answer-brief.pdf' },
    { title: '2026 Gondola Cost-Sharing Agreement (Third Supplement to the IGA)', copy: 'Signed May 2026, setting the 2026 planning-and-development budget for the Telluride-Mountain Village gondola at $2,461,032.49. Cost share: SMART 50%, Town of Telluride 25%, Mountain Village Entity 25% (split 12.5% Town of Mountain Village / 12.5% TMVOA). Executed by Mountain Village, the Town of Telluride, San Miguel County, TSG Ski & Golf, and SMART.', tag: 'Cost-Sharing IGA 2026', href: '/assets/Gondola/gondola-cost-sharing-iga-2026.pdf' },
    { title: 'Opening Appellate Brief', copy: 'Appellant Emily Masson\'s opening brief appealing the district court\'s award of just over $100,000 in attorney fees to SMART, Mountain Village, and the Town of Telluride. The appeal addresses the fee award, not the merits of the election contest.', tag: 'Appeal 2026', href: '/assets/Gondola/3a-appeal-opening-brief.pdf' },
    { title: 'Order Following Trial on Election Contest', copy: 'District court order issued after the April 18, 2025 trial in Case 2024CV8. Court found SMART complied with TABOR notice requirements and that ballot language was not misleading.', tag: 'Court Order 2025', href: '/assets/Gondola/3a-order-following-trial.pdf' },
    { title: 'Plaintiff\'s Written Closing Argument', copy: 'Masson\'s post-trial closing argument contending SMART provided no meaningful public notice for opposition comments, and that the TABOR notice misleadingly omitted the "slush fund" nature of capital improvement spending.', tag: 'Closing Arg. 2025', href: '/assets/Gondola/3a-closing-argument.pdf' },
    { title: 'Contestor Emily Masson\'s Trial Brief', copy: 'Pre-trial brief filed by Starritt Legal LLC arguing voters had only 12-24 hours to submit opposition comments and that TABOR notice language regarding "capital improvements" was misleading.', tag: 'Trial Brief 2025', href: '/assets/Gondola/3a-trial-brief.pdf' },
    { title: 'Written Statement to Contest Ballot Issue 3A', copy: 'Original election contest filing by Emily Masson (Case 2024CV8) challenging 3A on grounds of non-resident voter eligibility, inadequate TABOR notice, misleading ballot language, and unlawful public entity campaign contributions.', tag: 'Filing 2024', href: '/assets/Gondola/3a-written-statement-contest.pdf' },
    { title: 'SMART Board Meeting Agendas', copy: 'Official meeting materials for the San Miguel Authority for Regional Transportation.', tag: 'SMART', href: 'https://smartgov.org/meetings/' },
    { title: 'San Miguel County CivicClerk Portal', copy: 'County-level records relevant to SMART district and gondola discussions.', tag: 'County Record', href: 'https://sanmiguelcoco.portal.civicclerk.com/' }
  ],
  legalIssues: [
    { icon: '🏛️', title: 'TABOR notice as due process -- a first-impression question', copy: 'If a public entity relies on written comments to build the for-and-against summaries in its TABOR notice, must it tell voters when, where, and how to submit them? No Colorado appellate decision has addressed Article X, Section 20(3)(b)(v) on this point -- exactly the kind of good-faith new-theory claim C.R.S. 13-17-102(7) protects from fee awards.' },
    { icon: '📝', title: 'Fee awards require findings the trial court never made', copy: 'C.R.S. 13-17-103(1) requires specific findings before attorney fees are imposed -- which claim was sanctionable and why. The replies argue a bare conclusion that claims "lacked substantial justification" is legally insufficient, and that neither the court nor the entities ever addressed the actual merits of the FCPA and due-process claims.' },
    { icon: '⚖️', title: 'No judgment, no fees under the election-contest statute', copy: 'C.R.S. 1-11-217(2) allows fees only to a party who obtains a judgment. The replies argue the Towns obtained none -- the claims against them were dismissed voluntarily -- so the statute cannot support their award.' },
    { icon: '💰', title: 'Funding gap and voter expectations', copy: '3A was marketed as funding a "new gondola," but ~$8.2M/year covers only a fraction of the $120-150M+ estimated replacement cost. Whether the ballot language created enforceable voter expectations is an open question.' },
    { icon: '📋', title: 'Pre-ballot consultant spending', copy: 'CORA records revealed roughly $125K in campaign consulting before the ballot was referred. The timing of this spending raises transparency concerns.' },
    { icon: '🔍', title: 'CORA compliance and public records', copy: 'Multiple CORA requests were required to piece together the full picture of pre-ballot spending. Delayed or incomplete responses raise questions about compliance with Colorado open records requirements.' },
    { icon: '⚖️', title: 'Intergovernmental authority and SMART governance', copy: 'The SMART district spans multiple jurisdictions. Questions persist about accountability, board governance, and whether the taxing authority is being used consistent with its enabling legislation.' }
  ],
  players: [
    { icon: '🚡', title: 'SMART Board', copy: 'Governs gondola operations, maintenance, and capital planning. Key decision-maker on how 3A revenue is allocated.' },
    { icon: '🏔️', title: 'TMVOA / Mountain Village', copy: 'Major stakeholder and campaign contributor. Mountain Village relies heavily on the gondola for connectivity.' },
    { icon: '🏨', title: 'Resort developers', copy: 'Development interests are intertwined with gondola infrastructure.' },
    { icon: '👥', title: 'Taxpayers and commuters', copy: 'Every property taxpayer in the SMART district funds the gondola. Commuters and workers depend on it daily.' }
  ],
  news: [
    { source: 'Telluride News (Letter)', date: 'Jan 19, 2026', title: 'Punishing participation', href: 'https://www.telluridenews.com/opinion/letters_to_editor/article_d1101cd5-a2b2-4593-b795-6132a8527169.html', copy: 'Letter to the editor calling the decision by SMART, Mountain Village, and Telluride to seek ~$100K in attorney fees from Emily Masson for her good-faith 3A election challenge "outrageous."' },
    { source: 'Telluride News', date: 'Jan 6, 2026', title: 'Plaintiff in 3A election challenge ruled liable for costs', href: 'https://www.telluridenews.com/news/article_25c45be0-2135-40c2-82a6-40d059eadb64.html', copy: 'District court rules that the plaintiff who challenged Ballot Question 3A must pay attorney fees sought by SMART, Mountain Village, and Telluride.' },
    { source: 'Telluride News', date: 'Nov 7, 2025', title: 'The people decided: Question 300 goes down', href: 'https://www.telluridenews.com/news/article_ccbaf4e8-3135-4e9d-9e46-4639cc8a1913.html', copy: 'Voters rejected the proposed lift ticket tax measure that would have generated additional gondola replacement funding.' },
    { source: 'Telluride News', date: 'Oct 19, 2025', title: 'Will locals vote to tax visiting skiers?', href: 'https://www.telluridenews.com/news/article_9dca7a70-3126-431d-b0bf-f8f49eeb6394.html', copy: 'Telluride considers a 5% excise tax on ski lift tickets to help fund gondola replacement and infrastructure.' },
    { source: 'Telluride News', date: 'Sep 22, 2025', title: 'Town Council discusses gondola plaza, Chair 7 projects', href: 'https://www.telluridenews.com/news/article_f5e1c120-19b6-4de7-aab1-3b2a3573e792.html', copy: 'Town Council deliberates on gondola plaza development plans and Chair 7 area initiatives.' },
    { source: 'Telluride News', date: 'Aug 15, 2025', title: 'Town Council discusses Oak St. gondola station design', href: 'https://www.telluridenews.com/news/article_75c0d1a7-4053-4682-b40b-b8b8ac9f34c6.html', copy: 'Council examines design proposals for the new Oak Street gondola station as part of the station area planning process.' },
    { source: 'Telluride News', date: 'Apr 25, 2025', title: 'Challenger to ballot measure 3A has day in court', href: 'https://www.telluridenews.com/news/article_7f243b4d-7070-4ee0-a42a-7020c200c614.html', copy: 'Emily Masson\'s legal challenge to 3A gets a hearing in San Miguel County District Court, arguing inadequate TABOR notice and misleading ballot language.' },
    { source: 'Telluride News', date: 'Apr 16, 2025', title: '3A Ballot Measure Challenge: See you in court', href: 'https://www.telluridenews.com/news/article_b55271e8-c2e1-43ff-a147-823e6b2ca11a.html', copy: 'Preview of the upcoming court hearing on the 3A election challenge.' },
    { source: 'Telluride News (Letter)', date: 'Apr 2, 2025', title: 'Setting the record straight about 3A', href: 'https://www.telluridenews.com/letters_to_the_editor/article_05834439-5f66-4cd1-a43e-2d6fc7843c40.html', copy: 'Letter to the editor addressing claims and counter-claims about the 3A ballot measure and its legal challenge.' },
    { source: 'Telluride News', date: 'Jan 29, 2025', title: 'Does the challenge to the 3A ballot initiative add up?', href: 'https://www.telluridenews.com/news/article_57ddd294-ddd0-11ef-b82e-63b5fff81afd.html', copy: 'Analysis of the legal arguments in the challenge to 3A, including TABOR notice requirements, voter eligibility, and campaign finance questions.' },
    { source: 'Telluride News', date: 'Jan 31, 2025', title: 'Gondola station planning kicks off in Mountain Village and Telluride', href: 'https://www.telluridenews.com/news/article_a04537ba-df6b-11ef-99e1-5766ad121de4.html', copy: 'SMART, Mountain Village, and Telluride launch station planning process with public workshops following 3A approval.' },
    { source: 'Telluride News', date: 'Jan 22, 2025', title: 'Gondola project turns towards station planning', href: 'https://www.telluridenews.com/news/article_0f28f2ca-d846-11ef-b17e-2325e21ba586.html', copy: 'The gondola replacement project advances into its next phase, shifting focus to station infrastructure and design.' }
  ]
};

const DEEP_DIVE_PAGES = [
  { label: 'Telluride Debt', href: '/Blog%20Posts/the-growing-weight-of-tellurides-debt/' }
];

// Featured Action of the Week (homepage) — hand override for the automatic
// pick in scripts/build-featured-action.js. Empty {} = automatic (the next
// upcoming meeting that touches a deep-dive topic, earliest first, topic
// priority tie-break). To pin, use STRICT JSON values, e.g.:
//   { "topic": "carhenge", "date": "2026-07-23",
//     "headline": "…optional…", "blurb": "…optional…" }
// The pin is ignored once its date has passed (falls back to automatic).
const FEATURED_ACTION_PIN = {
  "topic": "fieldpaving",
  "date": "2026-07-29",
  "headline": "Town Park Oval paving goes before Parks & Rec on Wednesday, July 29",
  "blurb": "On Wednesday, July 29, at noon, Parks & Rec will take up the already-approved, but very controversial, paving of the Town Park grass oval for basketball/pickleball courts. Local citizens have collected over 400 signatures and letters in opposition to this project."
};

const ENTITY_LOGOS = {
  telluride: '<img src="/logo/Telluride%20Town.png" alt="Town of Telluride" style="width:100%;height:100%;object-fit:contain;">',
  county: '<img src="/logo/San Miguel County.png" alt="San Miguel County" style="width:100%;height:100%;object-fit:contain;">',
  mv: '<img src="/logo/Mountain%20village%20Town.jpg" alt="Mountain Village" style="width:100%;height:100%;object-fit:contain;">',
  school: '<img src="/logo/School%20District%20Telluride.png" alt="Telluride School District" style="width:100%;height:100%;object-fit:contain;">',
  smart: '<img src="/logo/SMART.png" alt="SMART" style="width:100%;height:100%;object-fit:contain;">',
  fire: '<img src="/logo/Telluride Fire.png" alt="Telluride Fire Department" style="width:100%;height:100%;object-fit:contain;">',
  med: '<img src="/logo/Telluride%20Hospital%20Dist.jpeg" alt="Telluride Medical Center" style="width:100%;height:100%;object-fit:contain;">',
  ridgway: '<img src="/logo/Ridgway%20Town.png" alt="Town of Ridgway" style="width:100%;height:100%;object-fit:contain;">',
  norwood: '<img src="/logo/Norwood%20Town.jpeg" alt="Town of Norwood" style="width:100%;height:100%;object-fit:contain;">',
  ophir: '<img src="/logo/Ophir.jpeg" alt="Town of Ophir" style="width:100%;height:100%;object-fit:contain;">',
  rico: '<img src="/logo/Rico%20Town.png" alt="Town of Rico" style="width:100%;height:100%;object-fit:contain;">',
  ttimes: '<img src="/logo/TT%20Logo.png" alt="The Telluride Times" style="width:100%;height:100%;object-fit:contain;">',
  tjc: '<img src="/logo/Telluride%20Jewish.webp" alt="Telluride Jewish Community" style="width:100%;height:100%;object-fit:contain;">',
  tf: '<img src="/logo/Telluride%20Foundation.png" alt="Telluride Foundation" style="width:100%;height:100%;object-fit:contain;">',
  eco: '<img src="/logo/Eco%20Action.webp" alt="EcoAction Partners" style="width:100%;height:100%;object-fit:contain;">',
  soh: '<img src="/logo/Sheridan%20Opera%20House.png" alt="Sheridan Opera House" style="width:100%;height:100%;object-fit:contain;">',
  elks: '<img src="/logo/Elks.png" alt="Telluride Elks Lodge" style="width:100%;height:100%;object-fit:contain;">',
  oray: '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#5a3a2f,#3d2519);display:flex;align-items:center;justify-content:center;font-size:1.1rem;" title="Ouray Ridgway Calendar">🏔️</div>',
  community: '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#2f564d,#22453e);display:flex;align-items:center;justify-content:center;font-size:1.1rem;" title="Community Event">📅</div>',
  localgroup: '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6b5b3a,#8b7332);display:flex;align-items:center;justify-content:center;font-size:1.1rem;" title="Local Group">🤝</div>',
  koto: '<img src="/logo/koto-fm-logo.webp" alt="KOTO Community Radio" style="width:100%;height:100%;object-fit:contain;">',
  wilkinson: '<img src="/logo/Wilkenson.png" alt="Wilkinson Public Library" style="width:100%;height:100%;object-fit:contain;">',
  airport: '<img src="/logo/Airport.png" alt="Telluride Regional Airport" style="width:100%;height:100%;object-fit:contain;">',
  clubs: '<img src="/logo/clubs-icon.png" alt="Local Organizations" style="width:100%;height:100%;object-fit:contain;">',
  'telluride-com': '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1a3a5c,#2a5a8c);display:flex;align-items:center;justify-content:center;font-size:1.1rem;" title="Telluride.com">🎪</div>',
  // San Miguel Basin Forum — transparent PNG at /logo/San Miguel Basin.png
  // (upgraded 2026-07-22 from the white-boxed .jpg, which itself replaced the
  // old "San Miguel Basis Logo.jpg" on 2026-07-02).
  smb: '<img src="/logo/San%20Miguel%20Basin.png" alt="San Miguel Basin Forum" style="width:100%;height:100%;object-fit:contain;">',
  tmvoa: '<img src="/logo/TMVOA%20Logo.png" alt="TMVOA" style="width:100%;height:100%;object-fit:contain;">'
};

const TOWN_IMAGES = {
  norwood: '/logo/Norwood%20Town.jpeg',
  mv: '/logo/Mountain%20village%20Town.jpg',
  telluride: '/logo/Telluride%20Town.png',
  ridgway: '/logo/Ridgway%20Town.png',
  ophir: '/logo/Ophir.jpeg',
  rico: '/logo/Rico%20Town.png',
  placerville: '/logo/Placerville.png',
  ouray: '/logo/Ouray%20Town.png',
  nucla: '/logo/Nucla%20Town.png',
  naturita: '/logo/Naturita%20Town.png'
};

const SOURCE_SHORT_NAME = {
  telluride: 'Telluride',
  county: 'San Miguel County',
  smart: 'SMART',
  mv: 'Mountain Village',
  school: 'School District',
  fire: 'Fire District',
  med: 'Med Center',
  norwood: 'Norwood',
  smb: 'Basin Forum',
  ophir: 'Ophir',
  rico: 'Rico',
  airport: 'TEX',
  wilkinson: 'Wilkinson',
  tmvoa: 'TMVOA'
};

const ENTITY_REMOTE = {
  telluride: {
    livestream: 'https://www.youtube.com/@townoftelluridecolorado8739/streams',
    livestreamLabel: 'Livestream',
    hasZoom: true   // Town Council, P&Z, etc. are hybrid (in-person + Zoom)
  },
  county: {
    livestream: 'https://www.youtube.com/@sanmiguelcountyco/streams',
    livestreamLabel: 'Livestream',
    hasZoom: true   // BOCC, Planning Commission offer Zoom ("view agenda for Zoom Link")
  },
  mv: {
    livestream: 'https://media.avcaptureall.cloud/?customerGuid=f6f590a7-5acc-4d32-9928-ad9ae0d02e06',
    livestreamLabel: 'Livestream'
  },
  school: { hasZoom: true },  // All school board meetings offer Zoom
  rico: {
    livestream: 'https://www.youtube.com/@townofrico/streams',
    livestreamLabel: 'YouTube Live'  // BOT meetings are streamed on the Town's YouTube channel
  },
  smart: {},
  fire: {},
  med: { hasZoom: true },     // Med Center board meets in-person + Zoom
  airport: {},
  ttimes: {},
  tmvoa: {}   // TMVOA meetings offer Zoom on a per-meeting basis — see agenda
};

const ENTITY_ADDRESS = {
  telluride: 'Telluride Town Hall, 113 W Columbia Ave, Telluride, CO 81435',
  county:    'San Miguel County Courthouse, 305 W Colorado Ave, Telluride, CO 81435',
  mv:        'Mountain Village Town Hall, 455 Mountain Village Blvd, Suite A, Mountain Village, CO 81435',
  school:    'Telluride School District, 725 W Colorado Ave, Telluride, CO 81435',
  smart:     'SMART Office, 131 W Columbia Ave, Telluride, CO 81435',
  fire:      'Telluride Fire Protection District, 333 W Colorado Ave, 2nd Floor, Telluride, CO 81435',
  med:       'Telluride Medical Center, 500 W Pacific Ave, Telluride, CO 81435',
  norwood:   'Town of Norwood, 1670 Naturita St, Norwood, CO 81423',
  ophir:     'Town of Ophir, CO 81426',
  rico:      'Rico Town Hall, 2 Commercial St, Rico, CO 81332',
  airport:   'Terminal Observation Lounge, Telluride Regional Airport, Telluride, CO 81435',
  ttimes:    'Telluride, CO',
  tmvoa:     'Mountain Village, CO 81435'
};

const HIDDEN_MEETING_BODIES = [
  'fair board',
  'parks & recreation commission',
  'parks and recreation commission'
];

const GOV_MEETING_PATTERN = /board|council|commission|work\s*session|hearing|planning|zoning|harc|ecology|drb|design\s*review|budget|ordinance|executive|legislative|caucus|quorum|town\s*hall|roundtable|stakeholder|housing\s*code\s*update|\bssr\b/i;

const KEY_ISSUE_TIERS = [
  // Tier weight 25 — Second readings (will pass at this meeting; always top priority)
  { weight: 25, keywords: [
    'second reading'
  ]},
  // Tier weight 15 — Housing (deed restrictions, workforce, affordable, STRs)
  //   Note: Individual unit deed amendments score here but structural/code-level
  //   housing changes are what really matter — pair with ordinance tier for those.
  { weight: 15, keywords: [
    'deed restrict', 'deed-restrict', 'deed amendment', 'deed covenant',
    'workforce housing', 'affordable housing', 'housing authority', 'housing action',
    'housing plan', 'housing code', 'carhenge', 'short-term rental', 'str ',
    'accessory dwelling', 'adu', 'resident occupancy', 'deed-restricted property',
    'wilkin court', 'overlook', 'silver jack', 'element 52'
  ]},
  // Tier weight 12 — First reading of ordinances (new legislation, not yet final)
  { weight: 12, keywords: [
    'first reading'
  ]},
  // Tier weight 8 — Ordinances, resolutions, adoptions (formal contentious actions)
  { weight: 8, keywords: [
    'ordinance', 'resolution', 'adoption of', 'repeal', 'amend the', 'amendment'
  ]},
  // Tier weight 6 — Land Use & Code (zoning, PUD, development, code changes)
  { weight: 6, keywords: [
    'land use', 'zoning', 'pud', 'comprehensive plan', 'code update', 'code change',
    'code amendment', 'land use code', 'rezoning', 'variance', 'subdivision',
    'annexation', 'harc', 'historic', 'wildfire resiliency', 'setback',
    'building code', 'development', 'redevelopment', 'appeal'
  ]}
];

const SKIP_PATTERNS = [
  /continued to/i, /postponed/i, /tabled/i,
  /executive session/i, /town manager evaluation/i,
  /work plan/i, /open space commission/i,
  /consent.*agenda/i, /minutes.*approv/i,
  /adjournment/i
];

const REACTION_MEETING_TYPES = /town council|board of county commissioners|bocc|smart|hospital district|harc|historic.*architectural/i;

const LOCAL_GROUP_SCHEDULES = [
  // Rotary Club of Telluride and Telluride Elks Lodge 692 were removed
  // from the Gov-Hub recurring-meetings list 2026-05-08. Both still
  // appear as cards on the Local Orgs tab, and Elks events still flow
  // through fetchElksEvents() into the Events tab.
];

const TELLURIDE_FESTIVALS = [
  { name: 'Mountainfilm', month: 4, dayStart: 22, dayEnd: 25, icon: '🎥',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Mountain%20Film.png',
    url: 'https://www.mountainfilm.org/', ticketUrl: 'https://www.mountainfilm.org/festival/passes/', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '2026 festival passes on sale now' },
  { name: 'Telluride Chamber Music: MusicFest', month: 5, dayStart: 28, dayEnd: 5, endMonth: 6, icon: '🎻',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Telluride%20Chamber.png',
    url: 'https://telluridechambermusic.org/musicfest/', ticketUrl: 'https://telluridechambermusic.org/musicfest/', ticketLabel: 'Buy Tickets', ticketStatus: 'on-sale', promo: 'June 28–July 5, 2026 — tickets on sale now' },
  { name: 'Original Thinkers', month: 9, dayStart: 1, dayEnd: 4, icon: '💡',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Original%20Thinkers.png',
    url: 'https://www.originalthinkers.com/', ticketUrl: 'https://www.originalthinkers.com/', ticketLabel: 'Get Tickets', ticketStatus: 'default', promo: 'Oct 1–4, 2026 — speakers, documentaries & performances' },
  { name: 'Telluride Americana Music Festival', month: 6, dayStart: 17, dayEnd: 18, icon: '🎤',
    logo: 'https://images.squarespace-cdn.com/content/v1/5e666ebe01b24642410d9f4d/054d4b31-514a-4414-ab61-e14b5c4d1449/TAMF_LogoRGB_2025.png',
    url: 'https://tellurideamericana.com/', ticketUrl: 'https://tellurideamericana.com/events/telluride-americana', ticketLabel: 'Get Tickets', ticketStatus: 'default', promo: 'July 17–18, 2026' },
  { name: 'Telluride Balloon Festival', month: 5, dayStart: 5, dayEnd: 7, icon: '🎈',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Balloon.avif',
    url: 'https://www.tellurideballoonfest.com/', ticketUrl: '', ticketLabel: '', ticketStatus: 'default', promo: 'June 5–7, 2026 — free to attend' },
  { name: 'Telluride Bluegrass Festival', month: 5, dayStart: 18, dayEnd: 21, icon: '🎸',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Blue%20Grass.jpeg',
    url: 'https://bluegrass.com/telluride', ticketUrl: 'https://bluegrass.com/telluride/festival-info/TBF-ticketing-info', ticketLabel: 'Buy Tickets', ticketStatus: 'on-sale', promo: '2026 tickets on sale now via Planet Bluegrass' },
  { name: 'Telluride Blues & Brews Festival', month: 8, dayStart: 18, dayEnd: 20, icon: '🎶',
    logo: 'https://images.squarespace-cdn.com/content/v1/5be480544611a0a58ac2f320/1545422460809-AOUEFR9OODIWJVGFG8YO/General.png',
    url: 'https://www.tellurideblues.com/', ticketUrl: 'https://www.tellurideblues.com/tickets', ticketLabel: 'Buy Tickets', ticketStatus: 'on-sale', promo: '2026 tickets on sale now' },
  { name: 'Telluride Film Festival', month: 8, dayStart: 4, dayEnd: 7, icon: '🎬',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Film%20fest.jpg',
    url: 'https://www.telluridefilmfestival.org/', ticketUrl: 'https://www.telluridefilmfestival.org/show/passes', ticketLabel: 'Passes', ticketStatus: 'sold-out', promo: '2026 passes are sold out — waitlists available' },
  { name: 'Telluride Food + Vine', month: 5, dayStart: 12, dayEnd: 14, icon: '🍷',
    logo: 'https://cdn.prod.website-files.com/63e3b404578d3e63abef7364/69b1ded759adc5521903fd3e_TFV%20Logo%20Full%E2%84%A2.svg',
    url: 'https://www.telluridefoodandvine.com/', ticketUrl: 'https://www.telluridefoodandvine.com/events', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '2026 Weekend Pass and featured events available' },
  { name: 'Telluride Horror Show', month: 9, dayStart: 9, dayEnd: 12, icon: '🎃',
    logo: 'https://images.squarespace-cdn.com/content/v1/635aaf48434dcc204d4bfb34/762ca493-d7d2-459e-86a2-214c641c3695/HorrorShowLogoColor_STRAIGHT.png',
    url: 'https://www.telluridehorrorshow.com/', ticketUrl: 'https://www.telluridehorrorshow.com/', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '3-day passes on sale Mar 25 — 6-packs on sale Jul 1, 2026' },
  { name: 'Telluride Jazz Festival', month: 7, dayStart: 7, dayEnd: 10, icon: '🎷',
    logo: 'https://images.squarespace-cdn.com/content/v1/583db0c9d1758e46ff3221e9/821ecb11-5000-415a-a970-87b539036111/2026-ebony-color-logo-png-for-website-no-dates.png?format=1500w',
    url: 'https://www.telluridejazz.org/', ticketUrl: 'https://www.telluridejazz.org/tickets', ticketLabel: 'Buy Tickets', ticketStatus: 'on-sale', promo: 'Tickets on sale now — Tier 1 pricing until July 15' },
  { name: 'Telluride Mushroom Festival', month: 7, dayStart: 14, dayEnd: 17, icon: '🍄',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Mushroom.png',
    url: 'https://www.tellurideinstitute.org/telluride-mushroom-festival/', ticketUrl: 'https://www.tellurideinstitute.org/passes-telluride-mushroom-festival/', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '2026 passes launched Feb 5 — get them before they sell out' },
  { name: 'Telluride Yoga Festival', month: 5, dayStart: 25, dayEnd: 28, icon: '🧘',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Yoga.webp',
    url: 'https://www.tellurideyogafestival.com/', ticketUrl: 'https://www.tellurideyogafestival.com/passes', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: 'June 25–28, 2026 — festival passes available now' },
  { name: 'Telluride Autumn Classic', month: 8, dayStart: 24, dayEnd: 27, icon: '🏎️',
    logo: 'https://tellurideautumnclassic.com/wp-content/uploads/2021/03/logo-1024x293.webp',
    url: 'https://tellurideautumnclassic.com/', ticketUrl: 'https://registration.guidebook.com/91911f23-f9fc-11f0-8e6b-af6ca49d39b1', ticketLabel: 'Register Now', ticketStatus: 'on-sale', promo: 'Sept 24–27, 2026 — cars, motorcycles, aircraft & fine arts' }
];


const QR_OPTIONS = [
  { key: 'attending',  emoji: '🙋', label: "I'm Attending" },
  { key: 'matters',    emoji: '💡', label: 'This Matters to Me' },
  { key: 'learn',      emoji: '📖', label: 'I Want to Learn More' },
  { key: 'concerns',   emoji: '⚠️', label: 'I Have Concerns' },
  { key: 'handled',    emoji: '✅', label: 'In Support' }
];


const TOPIC_DEFINITIONS = {
  'housing': {
    label: 'Housing',
    icon: '🏠',
    keywords: /housing|deed.restrict|workforce|affordable|lottery|smrha|rent|tenant|overlook|silver jack|element 52|wilkin court/i
  },
  'housing-search': {
    label: 'Housing Search',
    icon: '🔑',
    keywords: /rental|listing|apartment|room.for.rent|vacancy|lease|long.term.rent|housing.search|available.unit|move.in|bedroom.*rent|rent.*bedroom/i
  },
  'land-use': {
    label: 'Land Use & Development',
    icon: '🏗️',
    keywords: /planning|zoning|drb|design.review|building|construction|variance|vesting|remodel|pud|land.use|harc|comprehensive.plan|development|permit|overlay|subdivision/i
  },
  'public-safety': {
    label: 'Public Safety',
    icon: '🔥',
    keywords: /wildfire|fire|marshal|emergency|safety|resiliency|rescue|hazard|evacuation/i
  },
  'budget-finance': {
    label: 'Budget & Finance',
    icon: '💰',
    keywords: /budget|tax|financ|audit|bid|rfp|proposal|funding|expenditure|appropriation|revenue|grant|assessment|exemption/i
  },
  'infrastructure': {
    label: 'Infrastructure',
    icon: '🚰',
    keywords: /water|road|parking|transit|utility|sewer|drain|pipe|overlay|airport|smart|bus|transportation|pavement/i
  },
  'environment': {
    label: 'Environment',
    icon: '🌿',
    keywords: /ecology|open.space|conservation|forestry|burn.pile|wildfire.resiliency|natural.resource|wildlife|forest|environment/i
  },
  'health-education': {
    label: 'Health & Education',
    icon: '🏥',
    keywords: /medical|hospital|school|education|student|health|board of education|tellmed|nurse|clinic|teacher|curriculum|staffing/i
  },
  'legal-governance': {
    label: 'Legal & Governance',
    icon: '⚖️',
    keywords: /ordinance|court|estate|creditor|hearing|resolution|legislation|litigation|statute|code.adopt|proclamation|vested.property/i
  },
  'arts': {
    label: 'Arts & Culture',
    icon: '🎨',
    keywords: /\bart\b|arts|gallery|exhibit|museum|painting|sculpture|artist|cultural|creative|mural|craft|studio|theater|theatre|drama|dance|ballet|performance|film|cinema|festival.*art|photo|literary/i
  },
  'music': {
    label: 'Music',
    icon: '🎵',
    keywords: /music|concert|band|jazz|bluegrass|symphony|choir|opera|acoustic|songwriter|festival.*music|live.music|open.mic|jam|recital|ensemble|orchestra/i
  },
  'recreation': {
    label: 'Recreation & Outdoors',
    icon: '⛷️',
    keywords: /ski|hike|hiking|trail|bike|cycling|climb|mountain|recreation|outdoor|park|camp|fish|kayak|raft|yoga|fitness|run|marathon|race|skating|hockey|swim|golf|tennis|pickleball|nordic|backcountry/i
  },
  'community-events': {
    label: 'Community Events',
    icon: '🎉',
    keywords: /festival|fair|parade|celebration|fundraiser|gala|potluck|volunteer|block.party|farmer.?s?.market|holiday|fourth.of.july|halloween|thanksgiving|christmas|new.year|carnival|benefit|auction|community.event/i
  },
  'food-drink': {
    label: 'Food & Drink',
    icon: '🍽️',
    keywords: /restaurant|food|dining|brewery|wine|tasting|brunch|dinner|chef|culinary|farm.to.table|happy.hour|cocktail|distillery|bar|cafe|coffee|farmer.?s?.market|food.truck/i
  },
  'events-around-me': {
    label: 'Events Around Me',
    icon: '📍',
    keywords: /(?!)/ // proximity-based; does not match by keyword — relies on location filter
  }
};


/* ── Featured organization spotlight ─────────────────────────────────
   Hand-curated copy (sourced from each org's own website). `name` must
   match a LOCAL_ORGS entry exactly — the logo, website, and donate link
   are read live from the directory so they never drift.

   Rotates weekly: index = floor(Date.now() / 604800000) % length, which
   rolls over Thursday 00:00 UTC. Read by BOTH local-orgs.html (the
   Featured organization band) and scripts/weekly-email.js (the digest's
   callout box), so add a new org here and it appears in both.        */
const FEATURED_ORGS = [
  { name: 'True North Youth Program',
    why: 'A space and a support system for every teen in the region — free, year-round, and built around helping kids find their footing on the way to adulthood. Parents say it’s where their teens build confidence and get woven into the community.',
    what: 'Free year-round programs for all teens in San Miguel and West Montrose counties: Rising Stars, Base Camp, college prep and scholarship help, plus river trips, food drives, and community clean-ups.',
    how: 'Volunteer at a trail-work day or event (their activities calendar lists openings), donate, or — if you’re a teen — fill out a waiver (English or Spanish) and show up.' },
  { name: 'Beacon Outreach',
    why: 'Seasonal workers keep this valley running while facing its hardest edges — housing, cost of living, long seasons far from home. Beacon meets them there with mentorship and genuine community.',
    what: 'One-on-one life coaching and mentorship, free community meals, game nights and sober social gatherings, retreats and outdoor trips, and mental-health and practical-resource support for lift ops, servers, guides, and the rest of the resort workforce.',
    how: 'Volunteer through the Get Involved page on their site, donate, or reach out directly at beacontelluride@gmail.com.' }
];

/* ── Local Orgs directory — extracted from index.html ── */
/* Schema matches v2/local-orgs.html. Add `donate: 'URL'` and
   social keys (facebook, instagram, twitter, youtube) per org
   as you discover them. */
const LOCAL_ORGS = [
    {
      name: "Beacon Outreach",
      category: "nonprofits",
      town: "Telluride",
      summary: "A Telluride nonprofit reaching out to the region's seasonal and young-adult workers — building intentional community, mentoring, and hospitality so seasonal workers leave better than they came.",
      website: "https://www.beacontelluride.com/",
      donate: "https://www.beacontelluride.com/donate",
      social: { instagram: "https://www.instagram.com/tellurideya/" },
      logo: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.png"
    },
    {
      name: "Telluride Nordic Association",
      category: "recreation",
      town: "Telluride",
      summary: "A Colorado 501(c)(3) nonprofit dedicated to the education and enhancement of Nordic skiing for individuals of all ages and abilities in the Telluride region.",
      website: "https://www.telluridenordic.com/",
      donate: "https://pymt-at-telluridenordic-dot-com.square.site/home#ZRYHjz",
      social: { facebook: "https://www.facebook.com/TellurideNordic", instagram: "https://www.instagram.com/telluridenordicassociation" },
      logo: "https://livabletelluride.org/logo/Telluride%20Nordic.png"
    },
    {
      name: "Telluride Chamber Music",
      category: "nonprofits",
      town: "Telluride",
      summary: "Chamber music in the Box Canyon since 1973 — bringing world-class musicians to the Telluride region for concerts, workshops, kids' programs, and community performances.",
      website: "https://telluridechambermusic.org/",
      donate: "https://app.arts-people.com/index.php?donation=tcm",
      social: { facebook: "https://www.facebook.com/people/Telluride-Chamber-Music/61577075232852/", instagram: "https://www.instagram.com/telluridechambermusic" },
      logo: "https://livabletelluride.org/logo/Telluride%20Chamber.png"
    },
    {
      name: "Telluride Choral Society",
      category: "nonprofits",
      town: "Telluride",
      summary: "A community choral society presenting seasonal concerts of classical and contemporary choral music in the Telluride region.",
      website: "https://www.telluridechoralsociety.org/",
      donate: "https://www.telluridechoralsociety.org/donate/",
      logo: "https://livabletelluride.org/logo/Telluride%20Choral.png"
    },
    {
      name: "Telluride Theatre",
      category: "nonprofits",
      town: "Telluride",
      summary: "Telluride's professional theatre company — producing original works, cabarets, and the beloved summer \"Shakespeare in the Park,\" reimagined classic productions staged at Town Park since 1990 and made accessible and entertaining for everyone.",
      website: "https://www.telluridetheatre.org/shakespeare",
      donate: "https://www.telluridetheatre.org/#donate",
      social: { facebook: "https://www.facebook.com/telluridetheater/", instagram: "https://www.instagram.com/telluridetheatre/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Theater.png"
    },
    {
      name: "Tri-County Health Network",
      category: "nonprofits",
      town: "Telluride",
      summary: "A nonprofit collaborating with communities across southwest Colorado's tri-county region to improve healthcare access for everyone — running programs in health insurance enrollment, care coordination, food security, mental health, and immigrant and family support.",
      website: "https://tchnetwork.org/",
      donate: "https://tchnetwork.org/donate/",
      social: { facebook: "https://www.facebook.com/TriCountyHealthNetworkTelluride", instagram: "https://www.instagram.com/tchn_co/", twitter: "https://twitter.com/TCHNetwork_CO" },
      logo: "https://livabletelluride.org/logo/Telluride%20Tri-County%20Health.png"
    },
    {
      name: "Telluride Mountain Club",
      category: "recreation",
      town: "Telluride",
      summary: "A community catalyst for sustainable outdoor recreation — maintaining trails, climbing and via ferrata routes, and offering backcountry education across the Telluride region.",
      website: "https://www.telluridemountainclub.org/",
      donate: "https://www.telluridemountainclub.org/membership/",
      social: { facebook: "https://www.facebook.com/telluridemountainclub", instagram: "https://www.instagram.com/telluridemountainclub/" },
      logo: "https://livabletelluride.org/logo/TtMC-logo.webp"
    },
    {
      name: "Telluride Venture Network",
      category: "business",
      town: "Telluride",
      summary: "A nationally recognized, award-winning entrepreneurial ecosystem that supports new, innovative, and growing businesses across Southwest Colorado with mentorship, capital connections, and resources.",
      website: "https://tellurideventurenetwork.com/",
      donate: "https://tellurideventurenetwork.com/donate-now/",
      social: {},
      logo: "https://livabletelluride.org/logo/Telluride%20Venture%20Net.webp"
    },
    {
      name: "Telluride Science",
      category: "nonprofits",
      town: "Telluride",
      summary: "Advances scientific knowledge by bringing global thought-leaders together for workshops on biomedical science, energy, climate, quantum computing, and fundamental research at the Telluride Science & Innovation Center.",
      website: "https://telluridescience.org/",
      donate: "https://telluridescience.org/donate/",
      social: { instagram: "https://www.instagram.com/telluridescience/", twitter: "https://twitter.com/telluridesci" },
      logo: "https://livabletelluride.org/logo/Telluride%20Science.png"
    },
    {
      name: "EcoAction Partners",
      category: "nonprofits",
      town: "Telluride",
      summary: "Works on environmental sustainability, climate action, waste reduction, energy efficiency, and community sustainability programs across San Miguel and Ouray counties.",
      website: "https://ecoactionpartners.org/",
      donate: "https://www.ecoactionpartners.org/donate",
      social: { instagram: "https://www.instagram.com/EcoAction_Partners/" },
      logo: "https://livabletelluride.org/logo/Eco%20Action.webp"
    },
    {
      name: "Lone Cone Legacy Trust",
      category: "nonprofits",
      town: "Nucla/Naturita",
      summary: "Community trust model supporting local philanthropy, resident-driven improvement projects, and civic investment in outlying communities across the West End and surrounding areas.",
      website: "https://loneconelegacy.org/",
      donate: "https://loneconelegacy.org/ways-to-donate",
      social: { facebook: "https://www.facebook.com/LoneConeLegacy/" },
      logo: "https://livabletelluride.org/logo/Norwood.png"
    },
    {
      name: "Sheep Mountain Alliance",
      category: "nonprofits",
      summary: "Southwest Colorado's leading wilderness conservation organization. Works to protect public lands, wildlife, and wild places in the San Juan Mountains and surrounding region through advocacy, education, and community engagement.",
      website: "https://www.sheepmountainalliance.org/",
      donate: "https://www.sheepmountainalliance.org/donate",
      social: { facebook: "https://www.facebook.com/SheepMountainAlliance/", instagram: "https://www.instagram.com/sheepmountainalliance/", twitter: "https://twitter.com/sheepmtn" },
      logo: "https://livabletelluride.org/logo/sheep-mountain.png"
    },
    {
      name: "Sherbino Theater",
      category: "nonprofits",
      town: "Ridgway",
      summary: "Community arts, culture, and performance venue in Ridgway hosting music, film, theater, lectures, community gatherings, and educational events for the broader San Juan region.",
      website: "https://sherbino.org/",
      donate: "https://sherbino.org/contribute/",
      social: { facebook: "https://www.facebook.com/SherbinoTheater", instagram: "https://www.instagram.com/thesherbino/", twitter: "https://twitter.com/SherbinoTheater" },
      logo: "https://livabletelluride.org/logo/Sherbino.png"
    },
    {
      name: "Telluride Foundation",
      category: "nonprofits",
      town: "Telluride",
      summary: "Community foundation serving the Telluride region since 2000. Provides grants to local nonprofits, hosts community events and public forums, runs youth programs, and fosters economic vitality and quality of life across the San Miguel Basin.",
      website: "https://telluridefoundation.org/",
      donate: "https://telluridefoundation.org/donate/",
      social: { facebook: "https://www.facebook.com/TellurideFoundation/", instagram: "https://www.instagram.com/telluridefoundation/", twitter: "https://twitter.com/TellurideFound" },
      logo: "https://livabletelluride.org/logo/tf-foundation.png"
    },
    {
      name: "Norwood Fire Protection District",
      category: "clubs",
      town: "Norwood",
      summary: "Provides fire protection, emergency response, rescue, and public safety services for Norwood and the surrounding Wright's Mesa area. Volunteers welcome.",
      website: "https://norwoodfiredistrict.org/",
      social: { facebook: "https://www.facebook.com/Norwood-Fire-Protection-District-265734354230444", instagram: "https://www.instagram.com/nfpdco/" },
      logo: "https://livabletelluride.org/logo/Norwood%20Fire.jpeg"
    },
    {
      name: "Rotary Club of Telluride",
      category: "clubs",
      town: "Telluride",
      summary: "Service club supporting scholarships, Youth Exchange, international projects, and community grants through the Telluride Rotary Foundation. \"Mountain High Service.\"",
      website: "https://portal.clubrunner.ca/3291",
      donate: "https://portal.clubrunner.ca/3291/donate",
      social: { facebook: "https://www.facebook.com/telluriderotary/", instagram: "https://www.instagram.com/telluriderotary/" },
      logo: "https://clubrunner.blob.core.windows.net/00000003291/thumb/ClubLogo/clublogo.png"
    },
    {
      name: "Telluride Volunteer Fire Department",
      category: "clubs",
      town: "Telluride",
      summary: "Provides fire protection, emergency response, technical rescue, and public safety services for the Telluride Fire Protection District and surrounding communities. Volunteers welcome.",
      website: "https://telluridefire.com/",
      donate: "https://www.telluridefire.com/donate",
      social: { facebook: "https://www.facebook.com/telluridevfd/", instagram: "https://www.instagram.com/telluridefpd/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Fire.png"
    },
    {
      name: "Norwood Park and Recreation District",
      category: "recreation",
      town: "Norwood",
      summary: "Public recreation agency serving over 418,500 acres since 2008. Offers year-round programs including Nordic skiing, ice rink, disc golf, pickleball, fitness classes, youth sports, and arts programming. Manages The Livery event venue, 90+ miles of trails, and community facilities.",
      website: "https://www.norwoodparkandrec.org/",
      social: { facebook: "https://www.facebook.com/norwoodrec/" },
      logo: "https://livabletelluride.org/logo/Norwood%20Parks.png"
    },
    {
      name: "Norwood Roping Club",
      category: "recreation",
      summary: "Roping club based at the San Miguel County Fairgrounds in Norwood. A fairground user group that organizes roping events and activities for the local ranching and rodeo community.",
      website: "https://www.sanmiguelcountyco.gov/431/Fairground-User-Groups",
      social: {},
      logo: "https://livabletelluride.org/logo/roping.png"
    },
    {
      name: "Wright's Mesa Gymkhana Club",
      category: "recreation",
      summary: "Gymkhana club based at the San Miguel County Fairgrounds in Norwood. Organizes timed speed-pattern horse riding events and competitions for riders of all ages in the San Miguel Basin.",
      website: "https://www.sanmiguelcountyco.gov/431/Fairground-User-Groups",
      social: {},
      logo: "https://livabletelluride.org/logo/gymkhana.png"
    },
    {
      name: "San Miguel Basin 4-H Clubs",
      category: "youth",
      town: "Norwood",
      summary: "Part of Colorado State University Extension, 4-H provides project-based learning for youth across agriculture, livestock, horticulture, natural resources, and home &amp; family topics. Members join a local club to participate in hands-on activities, fairs, and community service.",
      website: "https://sanmiguel.extension.colostate.edu/smb-club-list/",
      donate: "https://extension.colostate.edu/san-miguel/give/",
      social: { facebook: "https://www.facebook.com/people/Colorado-State-University-Extension-San-Miguel-Basin-4-H/100079938742937/" },
      logo: "https://livabletelluride.org/logo/4-h.png"
    },
    {
      name: "Telluride Ski &amp; Snowboard Club",
      category: "youth",
      town: "Telluride",
      summary: "Supports youth skiing and snowboarding through competitive programs, coaching, training camps, and mountain-sports development for athletes across the region.",
      website: "https://tssc.org/",
      donate: "https://www.tssc.org/donate",
      social: { instagram: "https://www.instagram.com/tellurideskisnowboardclub/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Ski%20Club.webp"
    },
    {
      name: "Telluride Youth Lacrosse / West Slope Lacrosse",
      category: "youth",
      town: "Telluride",
      summary: "Youth lacrosse programming serving Telluride and the broader western slope region. Contact for current season schedules, registration, and team information.",
      website: "https://www.westslopelacrosse.org/",
      donate: "https://www.telluridelacrosse.com/about/donate/20585",
      social: {},
      logo: "https://livabletelluride.org/logo/West%20Slope%20Lacross.jpeg"
    },
    {
      name: "Telluride Youth Soccer Club",
      category: "youth",
      town: "Telluride",
      summary: "Provides youth soccer programs, training, and recreational opportunities for young players in Telluride and the surrounding region. Programs for a range of ages and skill levels.",
      website: "https://www.telluridesoccer.com/",
      donate: "https://www.telluridesoccer.com/donate/",
      social: { facebook: "https://www.facebook.com/Telluridesoccer/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Soccer.jpeg"
    },
    {
      name: "The Pinhead Institute",
      category: "youth",
      town: "Telluride",
      summary: "Provides STEM education, science programs, youth internships, educational outreach, and hands-on learning opportunities for young people in Telluride and the surrounding region.",
      website: "https://www.pinheadinstitute.org/",
      donate: "https://www.pinheadinstitute.org/donate/",
      social: { facebook: "https://www.facebook.com/pages/Pinhead-Institute-A-Smithsonian-Affiliate/139925686059706", instagram: "https://www.instagram.com/pinheadinstitute/", youtube: "https://www.youtube.com/channel/UCzRuty1yIKquRiWGgYj-7yA" },
      logo: "https://livabletelluride.org/logo/Pinhead.png"
    },
    {
      name: "True North Youth Program",
      category: "youth",
      town: "Nucla/Naturita",
      summary: "Provides youth-development programs, after-school enrichment, outdoor experiences, mentoring, and leadership support for young people in Norwood, Nucla, Naturita, Telluride, and surrounding communities.",
      website: "https://www.truenorthyouthprogram.org/",
      donate: "https://www.coloradogives.org/organization/TrueNorthYouthProgram",
      social: { facebook: "https://www.facebook.com/truenorthyouthprogram/", instagram: "https://www.instagram.com/truenorthyouthprogram/" },
      logo: "https://livabletelluride.org/logo/True%20North.png"
    },
    {
      name: "Youth Soccer Club &amp; County Recreation",
      category: "youth",
      summary: "Youth soccer and recreational sports programming coordinated through San Miguel County. Check the county calendar for upcoming seasons, registration dates, and community recreation events.",
      website: "https://sanmiguelcountyco.gov/Calendar.aspx",
      social: {},
      logo: "https://livabletelluride.org/logo/soccer.png"
    },
    {
      name: "Norwood Chamber of Commerce",
      category: "business",
      town: "Norwood",
      summary: "Supports local business growth and community development in Norwood, Colorado. Maintains a business directory, facilitates networking, and promotes area tourism and economic vitality for this small mountain community.",
      website: "https://norwoodcolorado.com/",
      social: { facebook: "https://www.facebook.com/p/Norwood-Chamber-of-Commerce-of-Wrights-Mesa-61554955367435/" },
      logo: "https://livabletelluride.org/logo/norwood-chamber.png"
    },
    {
      name: "Nucla-Naturita Area Chamber of Commerce",
      category: "business",
      town: "Nucla/Naturita",
      summary: "Promotes local businesses, community events, tourism, and West End identity for Nucla, Naturita, Redvale, Bedrock, Paradox, and nearby communities.",
      website: "https://nucla-naturita.com/",
      social: { facebook: "https://www.facebook.com/NuclaNaturitaAreaChamberofCommerce" },
      logo: "https://livabletelluride.org/logo/Nucla%20Chamber.jpg"
    },
    {
      name: "Ridgway Area Chamber of Commerce",
      category: "business",
      town: "Ridgway",
      summary: "Supports local businesses, tourism, community events, visitor information, and regional economic activity in Ridgway and the surrounding area.",
      website: "https://ridgwaycolorado.com/",
      social: { facebook: "https://www.facebook.com/visitridgwaycolorado", instagram: "https://www.instagram.com/ridgwaycolorado/" },
      logo: "https://livabletelluride.org/logo/Ridgway%20Chamber.png"
    },
    {
      name: "Christ Presbyterian Church Telluride",
      category: "churches",
      town: "Telluride",
      summary: "With roots dating to 1889 as a Congregational church, it became Presbyterian in 1938. A loving and accepting fellowship emphasizing hospitality and community, with children's ministry, contemplative gardens, and local outreach initiatives.",
      website: "https://christpresbyterianchurchtelluride.com/",
      donate: "https://give.tithe.ly/?locationId=0a4029c9-d139-4987-b918-ae3e308bd39e",
      social: { facebook: "https://www.facebook.com/p/Christ-Presbyterian-Church-Telluride-61562972470758/", youtube: "https://www.youtube.com/@ChristPresbyterianChurch-sd1nx" },
      logo: "https://livabletelluride.org/logo/Church.png"
    },
    {
      name: "St. Patrick's Catholic Church",
      category: "churches",
      town: "Telluride",
      summary: "Historic Catholic parish established in 1896, serving the Telluride community at 8,750 feet in the San Juan Mountains. Part of the Diocese of Pueblo, also operating a mission in Nucla.",
      website: "https://stpatrickstelluride.com/",
      donate: "https://stpatrickstelluride.com/donate/",
      social: { facebook: "https://www.facebook.com/StPatricksTelluride/" },
      logo: "https://livabletelluride.org/logo/Church.png"
    },
    {
      name: "Telluride Jewish Community",
      category: "churches",
      town: "Telluride",
      summary: "A lay-led, informal Jewish community serving the Telluride region for 40 years. Welcomes full-time, part-time, and visiting members with Shabbat services, holiday celebrations, youth programs, and cultural events. 501(c)(3) nonprofit; no dues.",
      website: "https://www.telluridejewishcommunity.com/",
      donate: "https://www.telluridejewishcommunity.com/new-page-1",
      social: { email: "mailto:info@telluridejewishcommunity.com" },
      logo: "https://livabletelluride.org/logo/Telluride%20Jewish.webp"
    },
    {
      name: "Telluride Christian Fellowship",
      category: "churches",
      summary: "Non-denominational Christian church serving the Telluride community with worship services, community outreach, and fellowship programs in a welcoming mountain-town setting.",
      website: "https://www.telluridechurch.org/",
      donate: "https://www.telluridechurch.org/give/",
      social: { facebook: "https://www.facebook.com/Telluride-Christian-Fellowship-47477149350", youtube: "https://www.youtube.com/@tcf8750" },
      logo: "https://livabletelluride.org/logo/Church.png"
    },
    /* ── 12 additional verified Telluride-area orgs (2026-05-16 expansion) ── */
    {
      name: "KOTO Community Radio",
      category: "nonprofits",
      town: "Telluride",
      summary: "Community radio station broadcasting on 91.7 FM (Telluride) and 105.5 FM (Norwood). Listener-supported nonprofit serving the San Juan region with local news, music, public affairs, and a community events calendar since 1975.",
      website: "https://koto.org/",
      donate: "https://koto.org/donate/",
      social: { facebook: "https://www.facebook.com/KOTOCommunityRadio/", instagram: "https://www.instagram.com/kotoradio/" },
      logo: "https://livabletelluride.org/logo/koto-fm-logo.webp"
    },
    {
      name: "Telluride Humane Society",
      category: "nonprofits",
      town: "Telluride",
      summary: "Animal welfare nonprofit serving the San Miguel Basin since 1995. Runs the regional shelter, adoption program, low-cost spay/neuter, and humane education. All adoptable cats and dogs are listed on the Local News tab.",
      website: "https://telluridehumanesociety.com/",
      donate: "https://telluridehumanesociety.com/donate/",
      social: { facebook: "https://www.facebook.com/TellurideHumaneSociety/", instagram: "https://www.instagram.com/telluridehumanesociety/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Humane-400x400.png"
    },
    {
      name: "Second Chance Humane Society",
      category: "nonprofits",
      town: "Ridgway",
      summary: "Regional no-kill animal shelter based in Ridgway, serving the San Miguel and Ouray county region. Runs adoption, foster, low-cost spay/neuter, and humane-education programs.",
      website: "https://secondchancehumane.org/",
      donate: "https://secondchancehumane.org/support-us/donate",
      social: { facebook: "https://www.facebook.com/SecondChanceHumaneSociety", instagram: "https://www.instagram.com/secondchancehumanesociety/", twitter: "https://x.com/chancehumane", youtube: "https://www.youtube.com/channel/UC-gw9lq86637HbTJ0su2iiA" },
      logo: "https://livabletelluride.org/logo/Second%20Chance.webp"
    },
    {
      name: "Wilkinson Public Library",
      category: "nonprofits",
      town: "Telluride",
      summary: "Telluride's public library, hosting community programs, author talks, kids' storytime, tech help, meeting rooms, and a robust event calendar. Special district funded through the Telluride Library District.",
      website: "https://telluridelibrary.org/",
      donate: "https://telluridelibrary.org/donate/",
      social: { facebook: "https://www.facebook.com/wilkinsonpubliclibrary/", instagram: "https://www.instagram.com/wilkinsonpubliclibrary/" },
      logo: "https://livabletelluride.org/logo/Wilkenson.png"
    },
    {
      name: "Friends of the Wilkinson Public Library",
      category: "nonprofits",
      town: "Telluride",
      summary: "Volunteer nonprofit supporting Wilkinson Public Library through fundraising, advocacy, and programming the library's operating budget alone can't cover.",
      website: "https://www.telluridelibrary.org/fol",
      logo: "https://livabletelluride.org/logo/Telluriden%20FOT%20Library.webp"
    },
    {
      name: "Sheridan Opera House",
      category: "nonprofits",
      town: "Telluride",
      summary: "Historic 1913 opera house in downtown Telluride, owned and operated by the Sheridan Arts Foundation. Hosts concerts, films, theater, festivals, and the youth Young People's Theater program.",
      website: "https://sheridanoperahouse.com/",
      donate: "https://sheridanoperahouse.com/donate/",
      social: { facebook: "https://www.facebook.com/SheridanOperaHouse/", instagram: "https://www.instagram.com/sheridanoperahouse/" },
      logo: "https://livabletelluride.org/logo/Sheridan%20Opera%20House.png"
    },
    {
      name: "Telluride Mountain Village Owners Association (TMVOA)",
      category: "clubs",
      town: "Mountain Village",
      summary: "Property owners' association governing common areas and amenities in Mountain Village — gondola maintenance contributions, recreation programs, special events, and homeowner services.",
      website: "https://tmvoa.org/",
      social: { facebook: "https://www.facebook.com/tmvoa/" },
      logo: "https://livabletelluride.org/logo/TMVOA%20Logo.png"
    },
    {
      name: "Telluride Film Festival",
      category: "nonprofits",
      town: "Telluride",
      summary: "Independent film festival held every Labor Day weekend since 1974. Nonprofit dedicated to the art of cinema, runs year-round educational programs including the Filmmakers of Tomorrow student program.",
      website: "https://telluridefilmfestival.org/",
      donate: "https://telluridefilmfestival.org/support/",
      social: { facebook: "https://www.facebook.com/telluridefilmfestival/", instagram: "https://www.instagram.com/telluridefilmfestival/", twitter: "https://twitter.com/telluride" },
      logo: "https://livabletelluride.org/logo/Film%20fest.jpg"
    },
    {
      name: "Telluride Bluegrass Festival (Planet Bluegrass)",
      category: "nonprofits",
      town: "Telluride",
      summary: "Four-day bluegrass and roots music festival held each June since 1973 in Town Park. Run by Planet Bluegrass; pairs with the Town of Telluride on community events and sustainability programs.",
      website: "https://bluegrass.com/telluride/",
      social: { facebook: "https://www.facebook.com/PlanetBluegrass/", instagram: "https://www.instagram.com/planetbluegrass/" },
      logo: "https://livabletelluride.org/logo/Blue%20Grass.jpeg"
    },
    {
      name: "Mountainfilm",
      category: "nonprofits",
      town: "Telluride",
      summary: "Documentary film festival held over Memorial Day weekend since 1979. Year-round nonprofit operating the Mountainfilm on Tour program in dozens of cities and the Adventure Film Camp for youth.",
      website: "https://www.mountainfilm.org/",
      donate: "https://www.mountainfilm.org/support/",
      social: { facebook: "https://www.facebook.com/mountainfilm/", instagram: "https://www.instagram.com/mountainfilm/" },
      logo: "https://livabletelluride.org/logo/Mountain%20Film.png"
    },
    {
      name: "Telluride Mushroom Festival",
      category: "nonprofits",
      town: "Telluride",
      summary: "Four-day August festival celebrating fungi through forays, lectures, art, and the Telluride Mushroom Parade. Run as a program of the Telluride Institute since 1981.",
      website: "https://shroomfest.com/",
      donate: "https://shroomfest.com/get-involved/",
      social: { facebook: "https://www.facebook.com/tellurideshroomfest/", instagram: "https://www.instagram.com/tellurideshroomfest/" },
      logo: "https://livabletelluride.org/logo/Mushroom.png"
    },
    {
      name: "Original Thinkers",
      category: "nonprofits",
      town: "Telluride",
      summary: "Annual fall festival of ideas held in Telluride, pairing original films with live conversation. Year-round speaker series and the Original Thinkers Quarterly podcast.",
      website: "https://originalthinkers.com/",
      social: { facebook: "https://www.facebook.com/originalthinkers/", instagram: "https://www.instagram.com/originalthinkers/" },
      logo: "https://livabletelluride.org/logo/Original%20Thinkers.png"
    },
    {
      name: "Habitat for Humanity of the San Juans",
      category: "nonprofits",
      town: "Ridgway",
      summary: "Affordable housing nonprofit serving San Miguel, Ouray, Hinsdale, and surrounding counties. Builds and rehabs homes with partner families and runs a ReStore (Ridgway) selling donated home goods to fund builds.",
      website: "https://www.habitatsanjuans.org/",
      donate: "https://www.habitatsanjuans.org/donate",
      social: { facebook: "https://www.facebook.com/HabitatforHumanityoftheSanJuans/" },
      logo: "https://livabletelluride.org/logo/Habitat-for-Humanit-Logo.jpg"
    },
    {
      name: "Telluride Adaptive Sports Program",
      category: "recreation",
      town: "Telluride",
      summary: "Nonprofit providing adaptive winter and summer recreation experiences for people with physical, cognitive, sensory, and emotional disabilities. Winter ski/snowboard programs with the Telluride Ski Resort; summer hiking, cycling, and water programs.",
      website: "https://tellurideadaptivesports.org/",
      donate: "https://tellurideadaptivesports.org/donate/",
      social: { facebook: "https://www.facebook.com/TellurideAdaptiveSportsProgram/", instagram: "https://www.instagram.com/tellurideadaptivesports/" },
      logo: "https://livabletelluride.org/logo/Telluride%20Ski%20Club.webp"
    },
    {
      name: "Ouray Trail Group",
      category: "recreation",
      town: "Ouray",
      summary: "A nonprofit of volunteers founded in 1986, dedicated to the preservation and safe public use of Ouray County's trails — maintaining 84 mapped trails and providing hiking information across the region.",
      website: "https://ourayco.org/ouray-trail-group/",
      donate: "https://ouraytrails.org/support-us",
      social: { facebook: "https://www.facebook.com/OurayTrailGroup", instagram: "https://www.instagram.com/ouray_trail_group/" },
      logo: "https://livabletelluride.org/logo/Ouray%20Trail%20Club.webp"
    },
    {
      name: "Ouray Christian Fellowship",
      category: "churches",
      town: "Ouray",
      summary: "An EFCA-affiliated church in Ouray announcing \"the hope and truth of the Good News.\" Offers Sunday worship, adult and youth Sunday school, children's ministry, Bible studies, and missions involvement.",
      website: "https://ouraychristianfellowship.org/",
      donate: "https://ouraychristianfellowship.org/online-giving/",
      social: { facebook: "https://www.facebook.com/ouraychristianfellowship/" },
      logo: "https://livabletelluride.org/logo/Ouray%20Christian%20Fellowship.jpg"
    },
    {
      name: "Ouray School District",
      category: "youth",
      town: "Ouray",
      summary: "Ouray's PK-12 public school district (R-1), focused on educating \"the whole learner\" through diverse academic, arts, and outdoor experiences — \"developing minds to match our mountains.\"",
      website: "https://www.ourayschool.org/",
      social: { facebook: "https://www.facebook.com/ourayschool/", instagram: "https://www.instagram.com/ourayschool/" },
      logo: "https://livabletelluride.org/logo/Ouray%20School%20District.jpg"
    },
    {
      name: "Ridgway School District",
      category: "youth",
      town: "Ridgway",
      summary: "Ridgway's PK-12 public school district (R-2) in Ouray County, serving the Ridgway area with academic, arts, and athletic programs.",
      website: "https://www.ridgway.k12.co.us/",
      social: { facebook: "https://www.facebook.com/RidgwaySchoolDistrict/", instagram: "https://www.instagram.com/ridgwayschooldistrictr2/" },
      logo: "https://livabletelluride.org/logo/Ridgway%20School.png"
    },
    {
      name: "Trust for Land Restoration",
      category: "nonprofits",
      town: "Ridgway",
      summary: "Ridgway-based land conservation nonprofit working to preserve scenic landscapes and historic sites in the San Juan Mountains and to restore lands degraded by mining across Ouray, San Miguel, and San Juan counties.",
      website: "https://restorationtrust.org/",
      donate: "https://restorationtrust.org/donation/",
      logo: "https://livabletelluride.org/logo/Ridgway%20Land%20Trust.gif"
    },
    {
      name: "Ridgway Fire Protection District",
      category: "nonprofits",
      town: "Ridgway",
      summary: "Volunteer fire protection district covering about 80 square miles of Ouray County including the town of Ridgway, with members trained in structural and wildland firefighting plus emergency medical, hazmat, and vehicle extrication.",
      website: "https://ridgwayfire.org/",
      social: { facebook: "https://www.facebook.com/RidgwayFire/", instagram: "https://www.instagram.com/ridgwayfire21" },
      logo: "https://livabletelluride.org/logo/Ridgway%20Fire.png"
    },
    {
      name: "Ridgway Community Church",
      category: "churches",
      town: "Ridgway",
      summary: "A Bible-preaching, Bible-teaching church in Ridgway with Sunday worship at 10:15 AM, centered on Scripture and \"Giving All to Christ & Christ to All.\"",
      website: "https://ridgwaychurch.com/",
      donate: "https://ridgwaychurch.com/giving/",
      social: { facebook: "https://www.facebook.com/ridgwaycommunitychurch/", instagram: "https://www.instagram.com/ridgwaycommunitychurch/" },
      logo: "https://livabletelluride.org/logo/Ridgway%20Com%20Church.webp"
    },
    {
      name: "United Church of the San Juans",
      category: "churches",
      town: "Ridgway",
      summary: "An ecumenical united church in Ridgway affiliated with four mainline denominations (ELCA Lutheran, United Methodist, Presbyterian USA, and United Church of Christ), with Sunday worship at 10 AM in person and on Facebook livestream.",
      website: "https://ucsjridgway.org/",
      donate: "https://tithe.ly/give?c=722193",
      social: { facebook: "https://www.facebook.com/ucsjridgway" },
      logo: "https://livabletelluride.org/logo/Ridgway%20United%20Church.jpg"
    },
    {
      name: "Voyager Youth Program",
      category: "youth",
      town: "Ouray",
      summary: "Ouray County youth nonprofit offering after-school enrichment for elementary students, summer programs for kids and tweens, and the H.U.B.B. teen program with events, volunteering, and internships.",
      website: "https://www.voyageryouth.org/our-history",
      donate: "https://www.paypal.com/donate/?hosted_button_id=LVGG2YTMFAP9J",
      social: { facebook: "https://www.facebook.com/voyageryouth/", instagram: "https://www.instagram.com/voyageryouth/" },
      logo: "https://livabletelluride.org/logo/Ouray%20Voyager%20Youth.jpg"
    }
];

/* ── Telluride Jewish Community events — bot will refresh this ── */
/* Source: https://www.telluridejewishcommunity.com/events?format=json
   The fetchTellurideJewishEvents() helper in gov-helpers.js prefers this const
   over the live JSON fetch when present. v2/events.html reads TJC_EVENTS
   directly via data-only.js extraction. */
const TJC_EVENTS = [
  {
    title: "Shabbat!",
    link: "https://www.telluridejewishcommunity.com/events/2026/6/5/shabbat",
    description: "Monthly Kabbalat Shabbat service and potluck dinner. Details to be announced soon. All are welcome \u2014 full-time, part-time, and visiting members.",
    pubDate: new Date("2026-06-05T17:00:00"),
    source: "tjc",
    sourceLabel: "Telluride Jewish Community",
    category: "Community Event",
    location: "Telluride Jewish Community, Telluride, CO",
    imageUrl: ""
  },
  {
    title: "Shabbat!",
    link: "https://www.telluridejewishcommunity.com/events/2026/7/31/shabbat",
    description: "Monthly Kabbalat Shabbat service and potluck dinner. Details to be announced soon.",
    pubDate: new Date("2026-07-31T18:00:00"),
    source: "tjc",
    sourceLabel: "Telluride Jewish Community",
    category: "Community Event",
    location: "Telluride Jewish Community, Telluride, CO",
    imageUrl: ""
  },
  {
    title: "Shabbat!",
    link: "https://www.telluridejewishcommunity.com/events/2026/8/28/shabbat",
    description: "Monthly Kabbalat Shabbat service and potluck dinner. Details to be announced.",
    pubDate: new Date("2026-08-28T18:00:00"),
    source: "tjc",
    sourceLabel: "Telluride Jewish Community",
    category: "Community Event",
    location: "Telluride Jewish Community, Telluride, CO",
    imageUrl: ""
  }
];
