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
  'Board of County Commissioners Meeting|2026-04-01': 882,
  'Board of County Commissioners Work Session|2026-04-08': 986,
  'Planning Commission|2026-04-02': 1025,
  'San Miguel County: Planning Commission|2026-04-02': 1025,
};

const COUNTY_CIVICCLERK_AGENDA_FILES = {
  1025: 1652,  // Planning Commission Apr 2 2026
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
    agendaUrl: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/14206/April-SSR-No-5-Meeting-Packet',
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
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'May 20, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'May 27, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  // ── June 2026 ──
  {
    date: 'June 3, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'June 10, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'June 17, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  },
  {
    date: 'June 24, 2026',
    time: '9:30 AM - 3:00 PM',
    title: 'Board of County Commissioners Meeting',
    type: 'bocc',
    location: '305 W Colorado Ave, Telluride, CO 81435',
    civicClerkId: null,
    note: 'Agenda typically posted the Friday before.'
  }
];

const SMART_BOARD_URL = 'https://smarttelluride.colorado.gov/board-meetings';

const SMART_CACHE_DATE = '2026-03-24';

const SMART_CACHED_DATA = [
  {
    date: 'April 9, 2026',
    title: 'SMART Board of Directors',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    note: 'Next scheduled meeting -- agenda and packet will be posted closer to the date.'
  },
  {
    date: 'March 12, 2026',
    title: 'SMART Board of Directors',
    agendaUrl: 'https://smarttelluride.colorado.gov/sites/smarttelluride/files/documents/SMART%20Board%20Agenda_March%2012th%202026_distributed.pdf',
    packetUrl: 'https://smarttelluride.colorado.gov/sites/smarttelluride/files/documents/SMART%20Board%20meeting%20packet_March%2012th%202026.pdf',
    special: false
  },
  {
    date: 'January 8, 2026',
    title: 'SMART Board of Directors',
    agendaUrl: 'https://smarttelluride.colorado.gov/sites/smarttelluride/files/documents/SMART%20Board%20Agenda_January%208th%202026_distributed.pdf',
    packetUrl: 'https://smarttelluride.colorado.gov/sites/smarttelluride/files/documents/SMART%20Board%20meeting%20packet_January%208th%202026.pdf',
    special: false
  }
];

const MV_TC_URL = 'https://townofmountainvillage.com/government/town-council/town-council/';

const MV_DRB_URL = 'https://townofmountainvillage.com/business/planning/design-review-board/';

const MV_CACHE_DATE = '2026-03-24';

const MV_CACHED_DATA = [
  // ── Town Council ──
  {
    date: 'April 23, 2026',
    time: '2:00 PM - 7:00 PM',
    title: 'Town Council Meeting',
    board: 'tc',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A',
    note: 'Next scheduled meeting -- agenda posted the Friday before.'
  },
  {
    date: 'May 21, 2026',
    time: '2:00 PM - 8:00 PM',
    title: 'Town Council Meeting',
    board: 'tc',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  {
    date: 'June 17, 2026',
    time: '8:30 AM - 4:00 PM',
    title: 'Town Council Meeting',
    board: 'tc',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  {
    date: 'March 19, 2026',
    time: '2:00 PM',
    title: 'Town Council Meeting',
    board: 'tc',
    agendaUrl: 'https://townofmountainvillage.com/site/assets/files/48429/march_19-_2026_town_council_meeting_agenda.pdf',
    packetUrl: 'https://townofmountainvillage.com/site/assets/files/48439/march_19-_2026_town_council_meeting_packet.pdf',
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  // ── Design Review Board ──
  {
    date: 'April 2, 2026',
    time: '10:00 AM - 2:00 PM',
    title: 'Design Review Board',
    board: 'drb',
    agendaUrl: 'https://townofmountainvillage.com/site/assets/files/48456/april_2-_2026_design_review_board_meeting_agenda.pdf',
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  {
    date: 'May 7, 2026',
    time: '10:00 AM - 3:00 PM',
    title: 'Design Review Board',
    board: 'drb',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  {
    date: 'June 4, 2026',
    time: '10:00 AM - 3:00 PM',
    title: 'Design Review Board',
    board: 'drb',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  },
  {
    date: 'March 5, 2026',
    time: '10:00 AM',
    title: 'Design Review Board',
    board: 'drb',
    agendaUrl: 'https://townofmountainvillage.com/site/assets/files/48270/march_5-_2026_design_review_board_meeting_agenda.pdf',
    packetUrl: 'https://townofmountainvillage.com/site/assets/files/48363/march_5-_2026_design_review_board_meeting_packet_reduced.pdf',
    special: false,
    location: 'Town Hall, 455 Mountain Village Blvd, Suite A'
  }
];

const SCHOOL_BOARD_URL = 'https://www.tellurideschool.org/agendasandminutes';

const SCHOOL_CACHE_DATE = '2026-03-24';

const SCHOOL_CACHED_DATA = [
  // ── Upcoming (no agendas yet) ──
  {
    date: 'April 20, 2026',
    time: '5:15 PM',
    title: 'Board of Education Special Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: true,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Special meeting -- agenda posted closer to the date.'
  },
  {
    date: 'April 27, 2026',
    time: '3:30 PM',
    title: 'Board of Education Work Session',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Next scheduled work session -- agenda posted closer to the date.'
  },
  {
    date: 'April 28, 2026',
    time: '5:15 PM',
    title: 'Board of Education Monthly Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom',
    note: 'Next scheduled monthly meeting -- agenda posted closer to the date.'
  },
  {
    date: 'May 18, 2026',
    time: '3:30 PM',
    title: 'Board of Education Work Session',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'May 19, 2026',
    time: '5:15 PM',
    title: 'Board of Education Monthly Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'June 9, 2026',
    time: '3:30 PM',
    title: 'Board of Education Work Session',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'June 9, 2026',
    time: '5:15 PM',
    title: 'Board of Education Monthly Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  // ── Recent (with agendas) ──
  {
    date: 'March 16, 2026',
    time: '3:30 PM',
    title: 'Board of Education Work Session',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/31626_ws_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  },
  {
    date: 'March 17, 2026',
    time: '5:15 PM',
    title: 'Board of Education Monthly Meeting',
    agendaUrl: 'https://files.smartsites.parentsquare.com/3403/31726_mm_packet.pdf',
    packetUrl: null,
    special: false,
    location: 'Bridal Veil District Conference Room / Zoom'
  }
];

const FIRE_BOARD_URL = 'https://www.telluridefire.com/board-meetings';

const FIRE_CACHE_DATE = '2026-03-24';

const FIRE_CACHED_DATA = [
  {
    date: 'April 21, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435',
    note: 'Next scheduled meeting -- agenda typically posted a few days before.'
  },
  {
    date: 'March 17, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/3d3e8ccfb/Agenda+-March+17th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  },
  {
    date: 'February 17, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/286ab5c22/Agenda+-February+17th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  },
  {
    date: 'January 20, 2026',
    time: '5:30 PM',
    title: 'Board of Directors Meeting',
    agendaUrl: 'https://www.telluridefire.com/files/cc0cf8d03/Agenda+-January+20th%2C+2026.pdf',
    packetUrl: null,
    special: false,
    location: '131 W Columbia Ave, Telluride, CO 81435'
  }
];

const MED_BOARD_URL = 'https://www.tellmed.org/board-meetings';

const MED_CACHE_DATE = '2026-03-31';

const MED_CACHED_DATA = [
  // ── Upcoming ──
  {
    date: 'April 23, 2026',
    time: '8:30 AM - 11:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom',
    note: 'Next scheduled meeting -- agenda posted before the meeting.'
  },
  {
    date: 'May 28, 2026',
    time: '8:30 AM - 11:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom',
    note: null
  },
  {
    date: 'June 25, 2026',
    time: '8:30 AM - 11:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: null,
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom',
    note: null
  },
  // ── Recent ──
  {
    date: 'March 26, 2026',
    time: '8:30 AM - 11:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: 'https://www.tellmed.org/files/651140033/THD+Reg+BOD+Mtg+3.26.26+Agenda.pdf',
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom',
    note: null
  },
  // ── Recent ──
  {
    date: 'March 9, 2026',
    time: '1:00 PM - 2:00 PM',
    title: 'Special Board Meeting',
    agendaUrl: 'https://www.tellmed.org/files/a6a367fff/THD+Special+Bd+Mtg+Agenda+3.9.25.pdf',
    packetUrl: null,
    special: true,
    location: 'TMC Wellness Annex / Zoom'
  },
  {
    date: 'March 5, 2026',
    time: '8:00 AM - 8:30 AM',
    title: 'Special Board Meeting',
    agendaUrl: 'https://www.tellmed.org/files/5e604df7f/THD+Special+Bd+Mtg+Agenda+3.5.25.pdf',
    packetUrl: null,
    special: true,
    location: 'TMC Wellness Annex / Zoom'
  },
  {
    date: 'February 26, 2026',
    time: '8:30 AM - 11:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: 'https://www.tellmed.org/files/06f7d8cca/THD+Reg+BOD+Mtg+2.26.26+Agenda.pdf',
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom'
  },
  {
    date: 'January 22, 2026',
    time: '8:30 AM',
    title: 'Regular Board Meeting',
    agendaUrl: 'https://www.tellmed.org/files/3252b5faf/THD+BOD+Mtg+1.22.26+Agenda.pdf',
    packetUrl: null,
    special: false,
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom'
  }
];

const NORWOOD_BOT_URL = 'https://www.norwoodtown.com/board-of-trustees-meetings';

const NORWOOD_PZ_URL = 'https://www.norwoodtown.com/planning-and-zoning-commission-meetings';

const NORWOOD_NWC_URL = 'https://www.norwoodtown.com/nwc-meetings';

const NORWOOD_SAN_URL = 'https://www.norwoodtown.com/norwood-sanitation-district-meeting';

const NORWOOD_CACHE_DATE = '2026-03-24';

const NORWOOD_CACHED_DATA = [
  // ── Board of Trustees ──
  {
    date: 'April 8, 2026',
    title: 'Board of Trustees Meeting',
    board: 'bot',
    agendaUrl: null,
    note: 'Next scheduled meeting -- agenda posted before the meeting.'
  },
  {
    date: 'May 12, 2026',
    title: 'Board of Trustees Meeting',
    board: 'bot',
    agendaUrl: null
  },
  {
    date: 'June 9, 2026',
    title: 'Board of Trustees Meeting',
    board: 'bot',
    agendaUrl: null
  },
  {
    date: 'March 11, 2026',
    title: 'Board of Trustees Meeting',
    board: 'bot',
    agendaUrl: 'https://www.norwoodtown.com/files/89dac45c4/03.11.2026+Board+of+Trustee+Agenda+ADA.pdf'
  },
  // ── Planning & Zoning Commission ──
  {
    date: 'April 27, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: null,
    note: 'Next scheduled P&Z meeting -- agenda posted before the meeting.'
  },
  {
    date: 'February 23, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: 'https://www.norwoodtown.com/planning-and-zoning-commission-meetings'
  },
  // ── Water Commission ──
  {
    date: 'April 14, 2026',
    title: 'Norwood Water Commission Meeting',
    board: 'nwc',
    agendaUrl: null,
    note: 'Next scheduled NWC meeting -- agenda posted before the meeting.'
  },
  {
    date: 'March 10, 2026',
    title: 'Norwood Water Commission Meeting',
    board: 'nwc',
    agendaUrl: 'https://www.norwoodtown.com/nwc-meetings'
  },
  // ── Sanitation District ──
  {
    date: 'April 9, 2026',
    title: 'Norwood Sanitation District Meeting',
    board: 'san',
    agendaUrl: null,
    note: 'Next scheduled Sanitation District meeting -- agenda posted before the meeting.'
  },
  {
    date: 'March 12, 2026',
    title: 'Norwood Sanitation District Meeting',
    board: 'san',
    agendaUrl: 'https://www.norwoodtown.com/norwood-sanitation-district-meeting'
  }
];

const OPHIR_GA_URL = 'https://townofophir.colorado.gov/general-assembly-2';

const OPHIR_PZ_URL = 'https://townofophir.colorado.gov/planning-and-zoning';

const OPHIR_CACHE_DATE = '2026-03-24';

const OPHIR_CACHED_DATA = [
  // ── General Assembly ──
  {
    date: 'April 21, 2026',
    title: 'General Assembly Meeting',
    board: 'ga',
    agendaUrl: null,
    note: 'Next scheduled General Assembly -- agenda posted before the meeting.'
  },
  {
    date: 'May 19, 2026',
    title: 'General Assembly Meeting',
    board: 'ga',
    agendaUrl: null
  },
  {
    date: 'June 16, 2026',
    title: 'General Assembly Meeting',
    board: 'ga',
    agendaUrl: null
  },
  {
    date: 'March 17, 2026',
    title: 'General Assembly Meeting',
    board: 'ga',
    agendaUrl: 'https://townofophir.colorado.gov/sites/g/files/lrnvjt831/files/documents/GAMeetingPacketMaterials-March17%2C2026-%282%29.pdf'
  },
  {
    date: 'February 17, 2026',
    title: 'General Assembly Meeting',
    board: 'ga',
    agendaUrl: 'https://townofophir.colorado.gov/sites/g/files/lrnvjt831/files/documents/GAMeetingPacket-February17%2C2026.pdf'
  },
  // ── Planning & Zoning Commission ──
  {
    date: 'April 9, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: null,
    note: 'Next scheduled P&Z meeting -- agenda posted before the meeting.'
  },
  {
    date: 'May 14, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: null
  },
  {
    date: 'March 11, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: 'https://townofophir.colorado.gov/sites/g/files/lrnvjt831/files/documents/OphirPZ_March2026_packet.pdf'
  },
  {
    date: 'February 12, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: 'https://townofophir.colorado.gov/sites/g/files/lrnvjt831/files/documents/Feb2026_OphirPZ_packet.pdf'
  },
  {
    date: 'January 15, 2026',
    title: 'Planning and Zoning Commission Meeting',
    board: 'pz',
    agendaUrl: 'https://townofophir.colorado.gov/sites/g/files/lrnvjt831/files/documents/OphirPZ_Jan26_packet.pdf'
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
    decision: 'Whether to approve a Planned Unit Development (PUD) for the former Carhenge site at 700 W Pacific Ave as affordable housing.',
    who: 'Residents seeking affordable housing, adjacent property owners, and anyone concerned about density in the west end of town.',
    stage: 'Work session -- no binding vote, but direction given here shapes the formal application.',
    impact: 'This site could add deed-restricted workforce housing units near the gondola. Design, density, and traffic impacts will be evaluated. Work sessions are the best time for public input before formal review narrows options.',
    context: 'Affordable housing is among the most pressing issues in Telluride. Recent projects like VooDoo have shown that building at $1M/unit makes truly affordable rents extremely difficult. How this PUD is structured -- density, financing, deed restrictions -- will determine whether it actually serves lower-income workers or becomes another project that primarily benefits higher-AMI residents.'
  },
  {
    match: /chair\s*7/i,
    decision: 'Whether to approve rezoning or development at the Chair 7 base area.',
    who: 'All Telluride residents and visitors -- Chair 7 was dedicated as "Open Space District" in 1979 (ski uses only, no residential or commercial).',
    stage: 'Check agenda for whether this is a work session, public hearing, or vote.',
    impact: 'Any commercial development here would set a precedent for converting dedicated open space to commercial use. The Chair 7 proposal was a primary catalyst for the Measure 300 campaign. In September 2025, Town Council stated they would no longer include hotel plans in this area, but rezoning discussions may continue.',
    context: 'The original Chair 7 proposal included a luxury hotel up to 5.5 stories. Combined with Shandoka and the gondola redesign, these projects totaled ~120,000 sq ft of new commercial space requiring 150-200+ new employees -- with no corresponding housing plan. The community response (Measure 300 receiving 40% YES votes) demonstrated significant concern about this scale of development.'
  },
  {
    match: /society\s*turn/i,
    decision: 'Whether to advance the Society Turn PUD -- a ~400,000 sq ft mixed-use development at the valley entrance including a hospital, hotel, medical offices, retail, and employee housing.',
    who: 'Every resident of the region. The hospital component (~44,000 sq ft) is roughly 10% of the total development. The remaining ~90% is commercial.',
    stage: 'Check agenda -- the PUD has completed 4 of 5 approval steps. Final approval may be pending.',
    impact: 'This would be the largest development project in the region\'s history. Traffic studies relied on March 2020 data (during COVID lockdown). Surveys show ~75% of residents were unaware the hospital was only 10% of total development, and ~79% didn\'t know the full scope was 400,000 sq ft.',
    context: 'The hospital district receives 2.6 acres essentially free (valued $1-2M), but defending a 400,000 sq ft PUD it doesn\'t control. The developer reportedly threatened withdrawal if Measure 300 passed. No wildfire evacuation analysis has been completed for the site, which sits at the single entry/exit point for the entire valley.'
  },
  {
    match: /shandoka/i,
    decision: 'Whether to approve a large parking structure at Shandoka.',
    who: 'Telluride residents, visitors, Mountain Village commuters, and adjacent neighborhoods.',
    stage: 'Check agenda for current phase.',
    impact: 'The proposed 900-space garage would be one of the largest structures in the region. Combined with Chair 7 and gondola redesign proposals, these projects represent a significant escalation of commercial infrastructure. Parking capacity decisions directly influence traffic volume, visitor numbers, and the character of the town.',
    context: 'Doug Sanders, with 20 years in local land development, testified that these projects cannot be evaluated in isolation -- the combined scope approaches $500M and could push the town\'s effective population from ~2,200 toward 3,500.'
  },
  {
    match: /accelerated\s*housing\s*review/i,
    decision: 'Whether to amend the Land Use Code to implement fast-track 90-day review timelines for qualifying affordable housing development applications.',
    who: 'Developers proposing affordable housing, neighbors of potential development sites, and planning staff who must complete reviews within shortened timelines.',
    stage: 'Work session -- joint Planning Commission and BOCC discussion of proposed code language.',
    impact: 'Faster review timelines could accelerate housing production, but also reduce the window for public input on individual projects. This implements state requirements from HB23-1123. The question is how the county balances speed with community participation.',
    context: 'Housing affordability is a central regional concern. VooDoo\'s financial difficulties ($27.4M for 27 units, $23M balloon payment due ~2032) show that merely building faster doesn\'t solve the fundamental math problem: at $1M/unit, truly affordable rents are impossible without significant subsidy.'
  },
  {
    match: /comprehensive\s*plan/i,
    decision: 'Review or update of the town\'s Comprehensive Plan -- the foundational document guiding all future land use and zoning decisions.',
    who: 'Every property owner, resident, and business in the jurisdiction. The Comp Plan sets the framework for what can be built where.',
    stage: 'Check agenda -- typically presented as work session or public hearing.',
    impact: 'Comprehensive Plan changes can reshape development patterns for decades. This is one of the most consequential items a planning body can take up. Public input at this stage has the greatest influence on long-term outcomes.',
    context: 'Recent years have seen $64M in consultant spending (2017-2025), much of it directed by firms like DesignWorkshop that simultaneously work on specific development proposals. How the Comp Plan is framed -- and by whom -- shapes whether future development serves existing residents or primarily facilitates new commercial growth.'
  },

  // ── Wildfire / Safety ──
  {
    match: /wildfire\s*resiliency\s*code|wildland\s*urban\s*interface|wui\s*code/i,
    decision: 'Whether to adopt Colorado\'s Wildfire Resiliency Code and/or the International Wildland Urban Interface (WUI) Code, setting construction and land management standards in fire-prone areas.',
    who: 'All property owners (new construction requirements), current residents (evacuation and defensible space), and the fire district (enforcement and response capacity).',
    stage: 'Check agenda -- may be adoption vote or work session.',
    impact: 'These codes set building material requirements, defensible space mandates, and vegetation management standards. In a box canyon with one primary exit road, wildfire preparedness is an existential community concern. Adoption means new construction and renovations must meet enhanced fire-resistance standards.',
    context: 'Fire mitigation has been identified as a top community priority for the region\'s future. Notably, the Society Turn PUD -- at the valley\'s single entry/exit point -- has not undergone a wildfire evacuation analysis despite its massive proposed scale.'
  },

  // ── Housing / Deed Restrictions ──
  {
    match: /deed\s*restrict|workforce\s*housing\s*deed|housing\s*authority/i,
    decision: 'Whether to approve modifications to deed-restricted property sales or housing program rules.',
    who: 'Current and prospective deed-restricted homeowners and renters -- roughly one-third of Telluride voters live in town-managed housing.',
    stage: 'Check agenda for whether this is an individual property approval or policy change.',
    impact: 'Deed restriction terms determine who can live in these units, at what income levels, and at what price. Changes to individual deeds can set precedents for the broader program. Policy changes can affect affordability for hundreds of households.',
    context: 'The housing affordability paradox is acute: at $1M/unit construction costs, 50% AMI tenants ($42K/year) cannot cover financing. Recent projects saw 60% rent increases over two years. Meanwhile, Measure 2B authorized $64M in new Town debt (with $132M in interest) partially collateralized against housing fund revenue -- creating tension between debt service and keeping units affordable.'
  },

  // ── Budget / Finance ──
  {
    match: /budget\s*reduct|budget\s*session|funding.*staffing|proposed\s*construction\s*projects/i,
    decision: 'Review of proposed spending, staffing levels, or capital construction projects.',
    who: 'All taxpayers and service recipients -- budget decisions determine what services are funded and what gets cut.',
    stage: 'Work session -- input here shapes the final budget before formal adoption.',
    impact: 'The Town of Telluride\'s budget has grown from ~$10M (2015) to ~$95-100M (2025), with 212 employees (~10% of the population). Capital project decisions at this stage determine which infrastructure investments move forward.',
    context: 'Consultant spending alone has totaled $64M over 2017-2025, spiking from $1.9M to $10.5M annually. Measure 2B authorized $64M in additional debt (total cost ~$197M with interest) with no specified projects -- giving Town Council broad spending authority via simple resolution.'
  },

  // ── Gondola / SMART ──
  {
    match: /gondola|smart\s*board|smart\s*transit/i,
    decision: 'SMART Board decisions regarding gondola operations, maintenance, capital planning, or the future of the free gondola connecting Telluride and Mountain Village.',
    who: 'Every commuter, worker, and visitor who uses the gondola, plus all property taxpayers in the SMART district.',
    stage: 'Check agenda for specific action items.',
    impact: 'The gondola (built 1996) is critical regional infrastructure. The current funding agreement expires in 2027. Ballot Issue 3A approved ~$8.2M/year in new tax revenue, but a replacement gondola is estimated at $120-150M+ -- leaving a significant funding gap.',
    context: 'CORA records revealed over $175,000 in consultant spending before the 3A ballot referral, including $68K on polling (Keating Research) and $170K on project management (Kerry Donovan/Ulysses). "Friends of the Gondola" raised $130K, with $60K from TMVOA and $60K from the Four Seasons developer. The campaign marketed the measure as funding a "new gondola" but the actual revenue only covers a fraction of replacement cost.'
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
    match: /jensen\s*partners|healthcare\s*partnership|new\s*facility.*med|hospital\s*district/i,
    decision: 'Whether to pursue a healthcare partnership and/or new medical facility -- potentially tied to the Society Turn development.',
    who: 'All residents who rely on local healthcare, hospital district taxpayers, and the broader region served by Telluride Medical Center.',
    stage: 'Check agenda -- special meetings indicate active decision-making.',
    impact: 'The hospital\'s future is intertwined with the Society Turn PUD. The district receives 2.6 acres at Society Turn essentially free, but the hospital component is only ~10% of a 400,000 sq ft development. Partnership decisions made now will shape healthcare access and costs for decades.',
    context: 'The hospital district board is weighing significant partnership proposals (Jensen Partners consulting). Meanwhile, the Society Turn developer has reportedly conditioned the hospital\'s land allocation on the broader PUD advancing. Community members may want to ask: can the hospital secure a site without being tied to 300,000+ sq ft of commercial development it doesn\'t control?'
  },

  // ── School District ──
  {
    match: /board\s*of\s*education|school\s*district|telluride\s*school/i,
    decision: 'School board decisions on budget, staffing, facilities, and educational programs.',
    who: 'Students, families, teachers, and staff -- plus all property taxpayers who fund the district.',
    stage: 'Check agenda for whether this is a work session, monthly meeting, or special session.',
    impact: 'Staffing and budget decisions directly affect class sizes, programs offered, and the quality of education. The district is considering 2026-27 budget reductions of ~$655K including cuts to teaching positions.',
    context: 'The school district operates in a community under intense development pressure. New commercial projects (hotels, restaurants, retail) increase workforce demand but often don\'t directly generate school funding. Meanwhile, housing costs make it increasingly difficult for teachers and staff to live in the community they serve.'
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
    context: 'CORA requests regarding SMART revealed over $175,000 in consultant spending before the 3A ballot referral. Government responsiveness to records requests is a practical measure of transparency -- delays and excessive fees can effectively block public oversight.'
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
    match: /harc|historic.*architectural.*review|national.*historic.*landmark|historic.*preservation|demolition.*historic/i,
    decision: 'Whether to approve exterior alterations, new construction, demolitions, or signage within Telluride\'s National Historic Landmark District.',
    who: 'Property owners seeking approvals, adjacent property owners, and all residents who value the town\'s historic character.',
    stage: 'Check agenda -- HARC reviews can range from minor alterations (staff-level) to full commission hearings for large-scale projects and demolitions.',
    impact: 'HARC decisions shape the physical character of Telluride\'s historic downtown and residential neighborhoods. Approvals set precedents for building scale, materials, and design. Demolition permits are effectively irreversible -- once a historic structure is gone, it cannot be restored.',
    context: 'Telluride is a designated National Historic Landmark District -- one of the highest levels of historic recognition in the U.S. Development pressure from luxury construction and resort expansion creates ongoing tension between preservation and modernization. HARC also reviews projects tied to larger land use applications (Shandoka, Carhenge) that advance through P&Z and Council.'
  },

  // ── DRB / Design Review Board (Mountain Village) ──
  {
    match: /design\s*review\s*board|drb|mountain\s*village.*design/i,
    decision: 'Whether to approve architectural designs, site plans, and exterior modifications within Mountain Village.',
    who: 'Property owners, developers, and Mountain Village residents affected by building design and neighborhood character.',
    stage: 'Check agenda for specific project reviews.',
    impact: 'DRB decisions control building aesthetics, massing, and materials in Mountain Village. Large projects reviewed here can significantly affect views, traffic, and neighborhood character.',
    context: 'Mountain Village has its own design standards separate from Telluride\'s HARC. Projects like the gondola terminal redesign and resort-area expansions go through DRB review.'
  },

  // ── General fallback for Fire District ──
  {
    match: /fire\s*(protection\s*)?district|station\s*3/i,
    decision: 'Fire district operations, apparatus, and facilities decisions.',
    who: 'All residents within the fire protection district -- fire and EMS response times and capabilities affect every property and person.',
    stage: 'Check agenda for specific items.',
    impact: 'Station 3 updates and apparatus decisions affect the district\'s capacity to respond to structure fires, wildfires, and medical emergencies in a remote mountain setting with limited mutual aid resources.',
    context: 'The fire district is pursuing wildfire resiliency code adoption alongside the town. As development increases (potentially adding 1,000+ new daily occupants across proposed projects), fire and EMS capacity must keep pace.'
  }
];

const GOV_GLOSSARY = {
  'PUD': 'Planned Unit Development -- a special zoning tool that lets a developer propose a custom mix of uses (housing, commercial, open space) that wouldn\'t be allowed under standard zoning rules. The trade-off is that developers get flexibility, but the community gets to negotiate conditions.',
  'deed restriction': 'A legal rule attached to a property\'s title that limits how it can be used -- for example, requiring the owner to live and work locally, or capping resale prices to keep housing affordable.',
  'deed-restricted': 'Housing with a legal rule on the title that limits who can buy or rent it (usually local workers) and often caps the price to keep it affordable.',
  'deed restrictions': 'Legal rules attached to property titles that limit how they can be used -- commonly requiring local residency or capping sale/rental prices to keep housing affordable.',
  'TABOR': 'Taxpayer\'s Bill of Rights -- a Colorado constitutional amendment that limits how much governments can collect and spend. Any new tax or tax increase must be approved by voters.',
  'enterprise fund': 'A government account that runs like a business -- it pays for itself through fees (like water or sewer charges) rather than taxes. Enterprise funds are exempt from TABOR spending limits.',
  'first reading': 'The first time a proposed law (ordinance) is formally presented to the council. It\'s an introduction -- no final vote yet. Public comment is usually accepted.',
  'second reading': 'The second and usually final presentation of a proposed ordinance. This is typically when council takes the official vote to approve or reject it.',
  'work session': 'An informal meeting where elected officials discuss issues and hear presentations, but don\'t take formal votes. These are often the best time for public input because decisions haven\'t been made yet.',
  'quasi-judicial hearing': 'A hearing where elected officials act more like judges than legislators. They must base their decision only on evidence presented and existing rules -- not public opinion or politics. Testimony is usually given under oath.',
  'ballot measure': 'A proposed law or policy question placed on the election ballot for voters to approve or reject directly, instead of being decided by elected officials.',
  'mill levy': 'A property tax rate -- one "mill" equals $1 of tax for every $1,000 of assessed property value. A 10-mill levy on a home assessed at $500,000 means $5,000 in annual property tax.',
  'AMI': 'Area Median Income -- the middle-point household income for the region. Used to set eligibility for affordable housing programs. For example, "60% AMI" means a household earning 60% of the area\'s median income.',
  'ordinance': 'A local law passed by a town council or board of commissioners. Ordinances go through readings and public hearings before they become enforceable.',
  'resolution': 'A formal statement of a decision or policy position by a governing body. Unlike an ordinance, a resolution is not a law -- it expresses intent or direction.',
  'Measure 300': 'A 2024 Telluride ballot measure that proposed requiring voter approval for large commercial developments over 36 feet or 10,000 sq ft. It received ~40% YES votes.',
  'Measure 2B': 'A Telluride ballot measure that authorized $64M in new Town debt (with ~$132M in total interest) for capital projects and housing, partially secured by housing fund revenue.',
  'CORA': 'Colorado Open Records Act -- a state law giving the public the right to inspect and copy most government records. Agencies must respond to requests within 3 business days.',
  'HB24-1107': 'Colorado House Bill 24-1107 -- a state law requiring counties with housing shortages to speed up review of affordable housing projects and reduce regulatory barriers.',
  'HB23-1123': 'Colorado House Bill 23-1123 -- a state law requiring local governments to allow more housing types and streamline housing development approvals.',
  'comprehensive plan': 'A community\'s long-range blueprint for growth and land use. It guides zoning decisions, infrastructure investments, and development policy for 10-20 years.',
  'Comp Plan': 'Short for Comprehensive Plan -- a community\'s long-range blueprint for growth and land use that guides zoning, infrastructure, and development policy.',
  'zoning': 'Local rules that divide a community into areas (zones) and specify what can be built in each -- residential, commercial, industrial, etc. -- plus building height, density, and setback requirements.',
  'rezoning': 'The process of changing a property\'s zoning designation -- for example, from residential to commercial. Usually requires public hearings and approval by the local governing body.',
  'setback': 'The minimum required distance between a building and the property line, street, or other boundary. Setbacks control how close structures can be built to each other or to public spaces.',
  'annexation': 'The process of bringing land outside town boundaries into the town\'s jurisdiction. Once annexed, the land is subject to the town\'s taxes, regulations, and services.',
  'special meeting': 'A government meeting called outside the regular schedule to address specific urgent items. Public notice requirements still apply.',
  'public hearing': 'A formal meeting where community members can testify for or against a proposed action. Officials are required to consider this input before voting.',
  'variance': 'An exception to zoning rules granted for a specific property -- for example, allowing a building to be taller than normally permitted. Requires a showing of hardship.',
  'defensible space': 'The area around a building where vegetation and materials are managed to reduce wildfire risk. Typically divided into zones extending 100+ feet from the structure.'
};

const GLOSSARY_TERMS_SORTED = Object.keys(GOV_GLOSSARY).sort((a, b) => b.length - a.length);

const MEETING_ZOOM_LINKS = {
  // ── Telluride ──
  'telluride|2026-03-26|Planning & Zoning Commission':
    'https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg',

  'telluride|2026-03-31|Town Council':
    'https://us06web.zoom.us/meeting/register/xwQzQrv5TcSwUDVj1eylkg',

  // ── County ──
  'county|2026-03-25|Board of County Commissioners Special Meeting':
    'https://us02web.zoom.us/meeting/register/OtNb_dreTomuYTpzADMLGQ#/registration',
};

const SCHOOL_ZOOM_LINK = 'https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09';

const MEETING_PASSCODES = {
  // ── County BOCC ──
  'county|2026-03-25|Board of County Commissioners Meeting': {
    id: '816 3670 5978',
    passcode: '025045',
    phone: '719-359-4580 or 253-205-0468'
  },
  'county|2026-03-25|Board of County Commissioners Special Meeting': {
    id: '816 3670 5978',
    passcode: '025045',
    phone: '719-359-4580 or 253-205-0468'
  },

  // ── Telluride Town Council ──
  'telluride|2026-03-17|Town Council': {
    id: '839 0705 0138',
    passcode: '404452',
    phone: '(719) 359-4580 or (346) 248-7799'
  },

  // ── Telluride P&Z ──
  'telluride|2026-03-26|Planning & Zoning Commission': {
    id: '846 6324 0731',
    passcode: '464546',
    phone: '1-301-715-8592 or 1-312-626-6799'
  },

  // ── School District (consistent across meetings) ──
  '__school_default__': {
    id: '865 8512 4120',
    passcode: 'TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09',
    phone: ''
  }
};

const LAND_USE_ISSUES = {
  carhenge: {
    label: 'Carhenge / Shandoka',
    heroImage: 'https://ehq-production-us-california.imgix.net/6b1af98643c2eb1d96ea48d001eba309fb722ec3/original/1773791842/3923590257fa65a36b9b6893f6d1adc5_Carhenge-Lot-Header.png?auto=compress%2Cformat&w=1200',
    heroAlt: 'Carhenge Lot Redevelopment site plan showing building layout, green spaces, and pedestrian connections',
    heroCredit: 'Image: Town of Telluride / Engage Telluride',
    intro: 'Two of the most significant in-town redevelopment projects are advancing simultaneously: Carhenge (700 W Pacific) and Shandoka (Lot L). Both propose replacing surface parking with mixed-use neighborhoods combining housing, community space, and structured parking through the PUD and subdivision process.',
    statusTitle: 'Both projects are entering Phase 3 -- formal land use review and entitlement.',
    statusCopy: 'Carhenge is moving into P&Z review for subdivision and PUD approval, with a work session on March 26, 2026. Shandoka advanced Alternative 2 through Town Council in September 2025 and held open houses in March 2026 before entering HARC and P&Z review. The key public questions for both are density, design, actual affordability, neighborhood fit, and whether these projects meaningfully serve the workforce most squeezed by the current market.',
    nextStep: 'Carhenge P&Z work session: March 26, 2026, 5:30 PM (Zoom ID: 846 6324 0731). Shandoka open houses: March 25-26 at Ah Haa School and Cowboy General Store.',
    metrics: [
      { label: 'What to follow', value: 'Affordable housing PUD -- but what kind of affordability?', sub: 'Both projects are precedent-setting decisions, not routine site plans. Projects labeled workforce housing can still miss lower-income workers. The entitlement details matter.' },
      { label: 'Best public moment', value: 'P&Z work sessions and open houses', sub: 'Massing, density, and code fit get defined before formal votes. Engage early.' }
    ],
    timeline: [
      { date: 'Past', title: 'Southwest Area Conceptual Plan sets the stage', copy: 'SWAP and the Lift 7 Neighborhood Planning effort identified both sites as priority in-town redevelopment opportunities aligned with the Telluride Master Plan.' },
      { date: 'Sep 2025', title: 'Town Council endorses Shandoka Alternative 2', copy: 'Council approved the preferred concept for Lot L: below-grade structured parking, separate residential buildings, childcare, transit-oriented commercial, and enhanced pedestrian circulation.' },
      { date: 'Mar 2026', title: 'Carhenge enters formal P&Z review; Shandoka holds open houses', copy: 'Carhenge P&Z work session scheduled March 26 to review subdivision and PUD direction. Shandoka community open houses March 25-26 at Ah Haa School and Cowboy General Store.' },
      { date: 'Next', title: 'Both projects move through HARC, P&Z, and Council', copy: 'Expect formal public hearings for PUD, Subdivision, and Large Scale Activity applications. Watch for revised drawings and staff recommendations.', future: true }
    ],
    docs: [
      { title: 'Carhenge P&Z Work Session Application (Mar 26, 2026)', copy: 'Full application package for the Planning & Zoning work session.', tag: 'Carhenge', href: 'https://engagetelluride.org/32089/widgets/113355/documents/79175' },
      { title: 'Carhenge Site Plan (Mar 26, 2026)', copy: 'Site plan drawings for the proposed redevelopment.', tag: 'Carhenge', href: 'https://engagetelluride.org/32089/widgets/113355/documents/79180' },
      { title: 'Carhenge Application Narrative', copy: 'Project narrative describing the redevelopment concept and entitlement approach.', tag: 'Carhenge', href: 'https://engagetelluride.org/32089/widgets/113355/documents/79178' },
      { title: 'Letter of Authorization (Town of Telluride)', copy: 'Signed authorization letter for the application.', tag: 'Carhenge', href: 'https://engagetelluride.org/32089/widgets/113355/documents/79181' },
      { title: 'Shandoka Lot Redevelopment -- Alternative 2 (PDF)', copy: 'Full concept package for the Council-endorsed Alternative 2 design (29.5 MB).', tag: 'Shandoka', href: 'https://engagetelluride.org/32023/widgets/113083/documents/78970' }
    ],
    meetings: [
      { date: 'Mar 26, 2026', time: '5:30 PM', title: 'P&Z Work Session -- Carhenge Redevelopment (Subdivision & PUD)', source: 'Town of Telluride', location: 'Hybrid / Rebekah Hall, 113 W Columbia Ave', href: 'https://engagetelluride.org/carhenge-lot-redevelopment-project', zoom: 'Meeting ID: 846 6324 0731' },
      { date: 'Mar 25, 2026', time: '4:30 PM', title: 'Shandoka Lot L Open House & Presentation', source: 'Town of Telluride', location: 'Ah Haa School for the Arts', href: 'https://engagetelluride.org/shandoka-lot-redevelopment-project', zoom: '' },
      { date: 'Mar 26, 2026', time: '9:00 AM', title: 'Shandoka Pop-Up Coffee Talk', source: 'Town of Telluride', location: 'Cowboy General Store', href: 'https://engagetelluride.org/shandoka-lot-redevelopment-project', zoom: '' }
    ],
    players: [
      { icon: '🏘️', title: 'Town of Telluride / Design Workshop', copy: 'Design Workshop leads the consultant team for both projects, handling site planning, architecture, infrastructure, and landscape design.' },
      { icon: '📐', title: 'Planning & Zoning Commission', copy: 'First major venue for density, compatibility, and code review. Carhenge work session March 26.' },
      { icon: '🏛️', title: 'Town Council', copy: 'Endorsed Shandoka Alternative 2 in September 2025. Will ultimately decide PUD and ordinance-level questions for both projects.' },
      { icon: '🧭', title: 'Residents and community groups', copy: 'C7CC and neighborhood residents supply the strongest real-world test of whether these projects solve the right problems.' }
    ],
    news: [
      { source: 'Telluride Inside...and Out', date: 'Jun 5, 2025', title: 'Community Opportunities for Lift 7 & Gondola Station Planning', copy: 'Town hosts events June 10-11 to gather feedback on transforming the Lift 7 base area into an affordable, pedestrian-friendly neighborhood.', href: 'https://tellurideinside.com/2025/06/town-of-telluride-community-opportunities-for-lift-7-gondola-station-planning.html' },
      { source: 'Telluride News', date: 'Apr 27, 2025', title: 'Troubled by the communication surrounding Chair 7 redevelopment', copy: 'Letter to the editor expressing concern about transparency and clarity in how the Chair 7 redevelopment project has been communicated to the community.', href: 'https://www.telluridenews.com/letters_to_the_editor/article_639074ba-0d61-4cd9-9fc3-fc4ef2b206b3.html' },
      { source: 'Telluride News', date: 'Oct 30, 2024', title: 'Residents of Chair 7 neighborhood form community coalition', copy: 'Neighbors in the Chair 7 area established the C7CC coalition (180+ members) to have a meaningful role in development plans for Carhenge and Shandoka.', href: 'https://www.telluridenews.com/news/article_389e8d8c-9664-11ef-92b0-1b4c760901b6.html' },
      { source: 'Telluride News', date: 'Sep 1, 2024', title: 'Plan for Lift 7 area comes into focus', copy: 'Emerging details on the development plan for the Lift 7 vicinity, including Carhenge and the Shandoka parking lot.', href: 'https://www.telluridenews.com/news/article_b36a9c76-6807-11ef-8320-e798c816f268.html' },
      { source: 'Telluride News', date: 'Jun 7, 2025', title: 'Parking and People -- When is enough, enough?', copy: 'Letter to the editor examining parking demand and whether current provisions meet community needs amid redevelopment plans.', href: 'https://www.telluridenews.com/letters_to_the_editor/article_8e791e64-4b71-4ce7-8402-9828662eb5c1.html' },
      { source: 'Facebook', date: 'Ongoing', title: 'C7CC -- Chair 7 Community Coalition (Facebook Group)', copy: 'Active community discussion group with 180+ members tracking Chair 7, Carhenge, and Shandoka development concerns.', href: 'https://www.facebook.com/groups/1076276483955655' }
    ]
  },
  society: {
    label: 'Society Turn / Valley Floor Entrance',
    heroImage: 'https://img1.wsimg.com/isteam/ip/3f388f66-602e-4c3d-940c-27e48680fdb9/Society%20Turn%20Aerial.jpg/:/cr=t:0%25,l:0%25,w:100%25,h:100%25/rs=w:1200,cg:true',
    heroAlt: 'Aerial view of the Society Turn development site along Highway 145 between Telluride and Mountain Village',
    heroCredit: 'Image: societyturn.info',
    intro: 'A 19.7-acre mixed-use PUD by Genesee Properties along Highway 145, west of the Society Turn Roundabout. The project bundles a regional hospital site, wastewater expansion, employee housing, medical offices, retail, hotel, and conference facilities -- raising questions about total scale, traffic, wildfire evacuation, and whether one project is being used to justify a broader build-out at the valley entrance.',
    statusTitle: 'Society Turn remains a high-consequence regional development issue.',
    statusCopy: 'Even when framed around public-serving uses, the project raises larger questions about total scale, traffic, wildfire evacuation, environmental limits, and whether one project is being used to justify a much broader build-out.',
    nextStep: 'Track BOCC, Town Council, and any hospital-district discussions that tie facility needs to the larger site plan.',
    metrics: [
      { label: 'Primary tension', value: 'Public benefit vs. total development scale', sub: 'The public-facing rationale and the full project footprint may not be the same thing.' },
      { label: 'Regional concern', value: 'Traffic and emergency access', sub: 'The site sits at a sensitive gateway for movement in and out of the valley.' },
      { label: 'Best source', value: 'Full packets and development summaries', sub: 'Do not rely on summary language alone; the details matter.' }
    ],
    timeline: [
      { date: '2021', title: 'Sketch PUD approved by County Commissioners', copy: 'Planning Commission reviewed and recommended approval of the Sketch PUD for the 19.7-acre Genesee Properties parcel. BOCC approved.' },
      { date: 'Recent', title: 'Preliminary PUD/Subdivision phase begins; public scrutiny grows', copy: 'The project advances toward Preliminary PUD while residents focus on total build-out scale, traffic at the roundabout, and wildfire evacuation concerns.' },
      { date: 'Now', title: 'The issue is no longer just one project', copy: 'It has become a referendum on development scale, sequencing, and whether infrastructure and environmental analysis are keeping up.' },
      { date: 'Next', title: 'Watch for hearings, revised site materials, and hospital-related tie-ins', copy: 'The most important developments may come through linked public bodies, not just one jurisdiction.', future: true }
    ],
    docs: [
      { title: 'Society Turn PUD Information', copy: 'Developer site with aerial imagery, project features, community benefits, and mixed-use development details.', tag: 'Developer', href: 'https://societyturn.info/' },
      { title: 'San Miguel County CivicClerk Portal', copy: 'Best place to look for county-side packets, work sessions, and supporting development materials.', tag: 'County Record', href: 'https://sanmiguelcoco.portal.civicclerk.com/' },
      { title: 'County Commissioners Page', copy: 'Track BOCC agendas and board-level movement on major regional items.', tag: 'BOCC', href: 'https://sanmiguelcountyco.gov/192/Board-of-County-Commissioners' },
      { title: 'Telluride Medical Center Board Meetings', copy: 'Useful when hospital facility planning overlaps with Society Turn discussions.', tag: 'Hospital', href: 'https://www.tellmed.org/board-meetings' }
    ],
    players: [
      { icon: '🏗️', title: 'Project sponsors and consultants', copy: 'Control project framing, phasing, and how public benefits are presented.' },
      { icon: '🌲', title: 'County decision-makers', copy: 'Central to land-use approval, code fit, and regional public process.' },
      { icon: '🏥', title: 'Hospital district leadership', copy: 'Their participation can heavily influence how the project is perceived and justified.' },
      { icon: '🚗', title: 'Regional commuters and residents', copy: 'They bear the real-world consequences of traffic, access, and gateway-scale growth.' }
    ]
  },
  code: {
    label: 'Code Changes & Accelerated Review',
    heroImage: 'assets/ssr/SMC-Housing-Code-Update-infographic.jpg',
    heroAlt: 'San Miguel County Housing Code Update infographic showing Phase 1 Project Foundation (Fall/Winter 2025), Phase 2 Issue Identification & Analysis (Spring 2026), and Phase 3 Final Audit Report and Code Drafting (Summer 2026).',
    heroCredit: 'Source: San Miguel County Housing Code Update project page',
    heroAspect: 'tall',
    legalSummary: 'The current LUCA Draft (April 8, 2026) would create a 90-day "Accelerated Housing Review" track. Compared to the SSR\'s recommendations, the County\'s draft removes (1) language identifying the program as voluntary, (2) the exclusion of PUDs that involve rezoning or subdivision, (3) a 10-unit project-size cap, and (4) the requirement that review default to a two-step Planning-Commission-plus-BOCC process. The redline (linked above) shows SSR additions in blue and County deletions in red.',
    legalIssuesTitle: 'Concerns with the County\'s draft',
    legalIssuesSub: 'Specific places where the County\'s April 8 LUCA Draft removed or weakened SSR-recommended limits on the Accelerated Housing Review process.',
    intro: 'Code reform is often where the biggest long-term land-use changes happen, because one ordinance can affect every future project, not just one site, for better or worse. The most active local example right now is the San Miguel County Housing Code Update, a 15-month land use code audit being shaped by an appointed Stakeholder Strategic Roundtable (SSR).',
    statusTitle: 'The code-change process may matter more than any single project.',
    statusCopy: 'San Miguel County is undertaking a comprehensive land use code audit (June 2025 -- Sept 2026) funded by a Colorado Proposition 123 Local Planning Capacity Grant. The Stakeholder Strategic Roundtable (SSR) -- a mix of County staff, planning commissioners, school and housing officials, and 12 appointed community members -- meets monthly to review existing housing policies and shape draft amendments. The County notes this work also positions it for Proposition 123 "Fast Track Approval" funding, but does NOT satisfy SB24-174, which still requires a separate Housing Action Plan by January 1, 2028. If review timelines shorten or approval standards shift through this code audit, the practical balance between faster housing production and meaningful public review, environmental protection, and growth management changes for years to come.',
    nextStep: 'Read the LUCA Draft (April 8, 2026) and the SSR-vs-County redline below, then attend Spring 2026 community review or submit comments to housingupdate@sanmiguelcountyco.gov.',
    metrics: [
      { label: 'Big question', value: 'Speed vs. scrutiny', sub: 'How much process should be compressed in the name of housing delivery?' },
      { label: 'Who is affected', value: 'Every future applicant and every future neighbor', sub: 'Code amendments are system rules, not one-off exceptions.' },
      { label: 'Best tactic', value: 'Read the draft language', sub: 'The text of the amendment matters more than the summary memo.' }
    ],
    timeline: [
      { date: 'Past', title: 'Housing pressure pushes governments toward procedural reform', copy: 'Fast-track review and code cleanup become recurring policy tools in response to affordability pressure, even as many residents worry about cumulative growth effects.' },
      { date: 'June 2025', title: 'SMC Housing Code Update kicks off after Regional Housing Needs Assessment', copy: 'San Miguel County launches a 15-month land use code audit funded by Colorado\'s Proposition 123 Local Planning Capacity Grant, targeting regulatory barriers in unincorporated areas and implementing East End Master Plan recommendations.' },
      { date: 'Summer 2025', title: 'Community Listening Sessions and Code Review begin', copy: 'First series of community listening sessions held October 6-8, 2025; second series held December 8, 2025. SSR formed to advise staff and consultants on housing policy and code amendments.' },
      { date: 'Fall 2025 - Apr 2026', title: 'SSR meetings 1-5 review existing housing regulations', copy: 'The Stakeholder Strategic Roundtable meets monthly (October, December, January, March, April) to review the Community Housing Zone designation and other housing-related rules. Each meeting packet and high-level summary is posted in the project document center.' },
      { date: 'Now -- Spring 2026', title: 'Community Review of Draft Code Amendments', copy: 'Draft amendments developed over winter are now open for community review. This is the engagement window where the actual ordinance text becomes concrete and residents can weigh in on specifics rather than concepts.' },
      { date: 'Summer-Fall 2026', title: 'Planning Commission and BOCC Work Sessions, then Final Presentations', copy: 'After community review, the Planning Commission and Board of County Commissioners hold work sessions on draft amendments, followed by final code amendment presentations in the fall.', future: true },
      { date: 'Winter 2026', title: 'Adoption process for the final code amendments', copy: 'The County moves to formal adoption of the updated land use code, completing the 15-month process. Adopted text -- not the summary -- is what governs every future application.', future: true }
    ],
    docs: [
      { title: 'Accelerated Housing Review LUCA Draft (April 8, 2026)', copy: 'The actual draft code amendment text the County is currently moving forward. This is the single most important document: every rule in this draft becomes law if adopted. Read this BEFORE the redline below to see where the County landed.', tag: 'Flagship Draft', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/14055/Accelerated-Housing-Review-LUCA-Draft-04082026?bidId=' },
      { title: 'SSR-vs-County redline (offline copy)', copy: 'Mirror of the redlined Accelerated Housing Review draft, with SSR additions in BLUE and County deletions in RED. Stored on this site so it stays available even if SMC moves or removes the original. Use this to see exactly what the SSR recommended versus what the County kept.', tag: 'Redline (mirror)', href: 'assets/ssr/Accelerated-Housing-Review-LUCA-redline-SSR-vs-County.pdf' },
      { title: 'San Miguel County Housing Code Update (project page)', copy: 'Official SMC project page -- timeline, listening sessions, SSR roster, document center, and Spanish-language information. The canonical entry point for everything happening in this code audit.', tag: 'SMC Project Page', href: 'https://www.sanmiguelcountyco.gov/882/Housing-Code-Update' },
      { title: 'San Miguel County Land Use Code (Accelerated Housing Review)', copy: 'The current Land Use Code language that the Accelerated Housing Review draft would amend. Useful for comparing existing rules against the proposed changes.', tag: 'Existing Code', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/14055' },
      { title: 'BOCC Presentation -- Community Engagement Plan', copy: 'Presentation given to the Board of County Commissioners describing the Housing Code Update community engagement strategy.', tag: 'BOCC', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13339/BOCC-Presentation-Community-Engagement-Plan-PDF?bidId=' },
      { title: 'Community Engagement Plan', copy: 'Full Community Engagement Plan describing how the County intends to gather public input throughout the code update.', tag: 'Plan', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13340/Community-Engagement-Plan-PDF?bidId=' },
      { title: 'October SSR No. 1 Meeting Packet', copy: 'First SSR meeting packet (October 2025). Typically the largest packet because it sets up baseline existing-code review.', tag: 'SSR No. 1', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13732/October-SSR-No-1-Meeting-Packet' },
      { title: 'October SSR No. 1 Meeting High-Level Summary', copy: 'Short summary of what was discussed and decided at SSR No. 1.', tag: 'SSR No. 1 Summary', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13734/October-SSR-No-1-Meeting-High-Level-Summary' },
      { title: 'December SSR No. 2 Meeting Packet', copy: 'Second SSR meeting packet (December 2025).', tag: 'SSR No. 2', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13733/December-SSR-No-2-Meeting-Packet' },
      { title: 'December SSR No. 2 Meeting High-Level Summary', copy: 'Short summary of what was discussed and decided at SSR No. 2.', tag: 'SSR No. 2 Summary', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13810/December-SSR-No-Meeting-High-Level-Summary' },
      { title: 'January SSR No. 3 Meeting Packet', copy: 'Third SSR meeting packet (January 2026).', tag: 'SSR No. 3', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13846/January-SSR-No-3-Meeting-Packet' },
      { title: 'January SSR No. 3 Meeting High-Level Summary', copy: 'Short summary of what was discussed and decided at SSR No. 3.', tag: 'SSR No. 3 Summary', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13883/January-SSR-No-3-High-Level-Summary' },
      { title: 'March SSR No. 4 Meeting Packet', copy: 'Fourth SSR meeting packet (March 2026). This is where the Accelerated Housing Review draft language was substantively reworked.', tag: 'SSR No. 4', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/13938/March-SSR-No-4-Meeting-Packet' },
      { title: 'March SSR No. 4 Meeting High-Level Summary', copy: 'Short summary of what was discussed and decided at SSR No. 4.', tag: 'SSR No. 4 Summary', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/14065/March-SSR-No-4-Meeting-High-Level-Summary' },
      { title: 'April SSR No. 5 Meeting Packet', copy: 'Fifth and most recent SSR meeting packet (April 2026). High-level summary not yet posted by SMC at the time of writing.', tag: 'SSR No. 5', href: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/14206/April-SSR-No-5-Meeting-Packet' },
      { title: 'San Miguel County CivicClerk Portal', copy: 'Source for BOCC and Planning Commission packets, staff memos, and joint work sessions where this code update will be debated and ultimately adopted.', tag: 'CivicClerk', href: 'https://sanmiguelcoco.portal.civicclerk.com/' },
      { title: 'Submit comments to the SSR', copy: 'Email housingupdate@sanmiguelcountyco.gov. Comments received by noon a week before a meeting go into the meeting packet; by noon the day before go to the meeting body; later is held until next meeting.', tag: 'Public Comment', href: 'mailto:housingupdate@sanmiguelcountyco.gov' }
    ],
    legalIssues: [
      { icon: '⚖️', title: '3-1501 -- the County removed language identifying the program as voluntary',
        copy: 'The SSR draft kept the phrase "in order to receive financial assistance from the State of Colorado" before the requirement to provide an Accelerated Housing Review. The County removed it. Nothing in C.R.S. 29-32-105 actually requires this 90-day review -- it is a precondition for one funding stream (Proposition 123). Colorado HB26-1360 has eliminated Prop 123 funding for this fiscal year and it may be eliminated again. As written, the County\'s draft reads as a mandate when in fact the program is voluntary tied to a discretionary funding source.' },
      { icon: '🏗️', title: '3-1501 / eligible-vs-ineligible -- new PUDs with rezoning or subdivision could be fast-tracked',
        copy: 'The SSR draft excluded "Planned Unit Development approval or amendment that includes zoning approval or subdivision of land" from the 90-day track -- the same language used by the State of Colorado. The County\'s draft strikes that exclusion AND removes "approval that does not involve rezoning or subdivision of land" from the eligible-projects clause. Read together, the County draft would let a brand-new PUD that requires both rezoning and subdivision proceed through 90-day administrative review, which can apply to projects of any size (see issue 5).' },
      { icon: '🗺️', title: '3-1501 ineligible list -- "Initial Zoning or Rezoning" deleted',
        copy: 'The County\'s draft strikes "Initial Zoning or Rezoning" from the list of project types ineligible for accelerated review. Combined with the change above, this signals that rezoning is now permitted within a 90-day administrative review for both PUDs and other developments. The change is consequential by omission rather than statement.' },
      { icon: '📋', title: '3-1503 -- the two-step process backstop is removed',
        copy: 'The SSR draft kept the language "Unless an alternate process is specified in the Land Use Code, the Accelerated Housing Review process shall be a Two-Step process (review by the Planning Commission + Board of County Commissioners)." The County\'s draft strikes that line entirely. With it gone, the Code does not specify who reviews these applications, what notice is given to neighbors, or whether the public has a hearing -- it could become a fully administrative one-step process. The draft should specify the actual procedure.' },
      { icon: '📐', title: 'Article 7 Definitions -- the 10-unit cap and contiguous-land limit are deleted',
        copy: 'The SSR draft included "No project that includes more than ten (10) total units may be considered for Accelerated Housing Review" along with rules requiring the application to encompass the whole contiguous parcel and preventing future fast-track applications on the same land. The County\'s draft strikes the entire paragraph. Nothing in Proposition 123 requires the fast-track process to apply to projects of any size. As drafted, a 200-unit development could move through 90-day review with limited or no public notice -- a far different posture than the small-project framing the SSR proposed.' }
    ],
    players: [
      { icon: '📜', title: 'Planning staff and consultants', copy: 'They draft and shape the first version of the ordinance language and run the SSR process day-to-day.' },
      { icon: '🌲', title: 'County Planning Commission and BOCC', copy: 'They translate policy goals into enforceable rules and hold the final adoption vote on draft amendments.' },
      { icon: '🏠', title: 'Housing advocates and neighborhood critics', copy: 'Both tend to agree the rules matter -- they just disagree on what problem the rules should solve first.' },
      { icon: '⚖️', title: 'Future applicants and objectors', copy: 'They inherit whatever approval framework gets adopted now.' }
    ],
    roster: {
      title: 'Stakeholder Strategic Roundtable (SSR)',
      subtitle: 'Appointed by San Miguel County to advise on the Housing Code Update. The SSR adheres to a charter with consensus-seeking norms and a 70% super-majority for formal "temperature-check" statements; recap, slide deck, and audio are posted within 72 hours of each meeting.',
      groups: [
        {
          label: 'SSR Project Team',
          members: [
            { name: 'Drea Araiza', role: 'Housing Specialist, San Miguel County staff' },
            { name: 'Hallie Bevan-Simpson', role: 'County Planning Commission' },
            { name: 'Jarrod Biggs', role: 'Deputy County Manager, San Miguel County staff' },
            { name: 'John Miller', role: 'Telluride Ski and Golf' },
            { name: 'Drew Nelson', role: 'Housing Director, Town of Mountain Village' },
            { name: 'John Pandolfo', role: 'Superintendent, Telluride School District R-1' },
            { name: 'Kaye Simonson', role: 'Planning Director, San Miguel County staff' },
            { name: 'Lee Taylor', role: 'County Planning Commission' },
            { name: 'James Van Hooser', role: 'Community Housing Manager, Town of Telluride' },
            { name: 'Lance Waring', role: 'Board of County Commissioners' }
          ]
        },
        {
          label: 'Appointed Individuals',
          members: [
            { name: 'Danny Craft' },
            { name: 'Tony Daranyi' },
            { name: 'Elaine Demas' },
            { name: 'Nick Farkouh' },
            { name: 'Peter Johnson' },
            { name: 'Nina Kothe' },
            { name: 'Amy Levek' },
            { name: 'Paul Major' },
            { name: 'Stefanie Solomon' },
            { name: 'Jason Soules' },
            { name: 'Kathrine Warren' },
            { name: 'Anna Wilson' }
          ]
        }
      ]
    }
  },
  wildfire: {
    label: 'Wildfire Resiliency',
    intro: 'The Town of Telluride, San Miguel County, and the Telluride Fire Protection District are all considering adoption of Colorado\'s Wildfire Resiliency Code and the International Wildland Urban Interface (WUI) Code -- setting construction and land management standards in fire-prone areas.',
    statusTitle: 'Multiple bodies are simultaneously weighing wildfire code adoption.',
    statusCopy: 'In a box canyon with one primary exit road, wildfire preparedness is an existential community concern. These codes would set building material requirements, defensible space mandates, and vegetation management standards for new construction and renovations. The question is how aggressively to adopt fire-resistance standards and how they interact with development approvals.',
    nextStep: 'Watch Town Council, Fire District, and County agendas for wildfire resiliency code hearings and adoption votes.',
    metrics: [
      { label: 'Core question', value: 'How far should fire-resistance standards go?', sub: 'Adoption means new construction and renovations must meet enhanced standards. The scope and cost implications are the main debate.' },
      { label: 'Why it matters here', value: 'Box canyon with one exit road', sub: 'Wildfire evacuation is not theoretical -- the geography makes preparedness an existential priority.' },
      { label: 'Connection to development', value: 'Society Turn and new projects', sub: 'No wildfire evacuation analysis has been completed for the Society Turn PUD at the valley\'s single entry/exit point.' }
    ],
    timeline: [
      { date: 'Past', title: 'Fire mitigation identified as top community priority', copy: 'Regional planning processes consistently rank wildfire preparedness among the most critical long-term concerns for the Telluride region.' },
      { date: 'Recent', title: 'Fire District takes up Wildfire Resiliency and WUI codes', copy: 'Resolutions 2026-02 (Wildfire Resiliency Code) and 2026-03 (WUI Code) introduced at the fire district level, alongside apparatus and Station 3 updates.' },
      { date: 'Now', title: 'Town Council also considering adoption', copy: 'The town\'s April 14 agenda includes adoption of the Colorado Wildfire Resiliency Code alongside other land use code updates.' },
      { date: 'Next', title: 'Watch for adoption votes and implementation details', copy: 'The key details are in the specific requirements adopted -- building materials, defensible space zones, vegetation management, and how they apply to existing vs. new construction.', future: true }
    ],
    docs: [
      { title: 'Town of Telluride Agendas & Minutes', copy: 'Watch for wildfire resiliency code adoption on Town Council agendas.', tag: 'Town Record', href: 'https://telluride-co.civicweb.net/Portal/MeetingTypeList.aspx' },
      { title: 'Telluride Fire Protection District', copy: 'Fire district meetings where WUI and resiliency code resolutions are being considered.', tag: 'Fire District', href: 'https://telluridefire.com/' },
      { title: 'San Miguel County CivicClerk Portal', copy: 'County-level forestry and fire code discussions.', tag: 'County Record', href: 'https://sanmiguelcoco.portal.civicclerk.com/' }
    ],
    players: [
      { icon: '🔥', title: 'Telluride Fire Protection District', copy: 'Leading the push for WUI and resiliency code adoption through Resolutions 2026-02 and 2026-03.' },
      { icon: '🏛️', title: 'Town Council', copy: 'Considering parallel adoption of the Colorado Wildfire Resiliency Code alongside land use code updates.' },
      { icon: '🌲', title: 'County Planning and BOCC', copy: 'County-level forestry regulations affect wildfire risk, watershed health, and ecosystem integrity across the region.' },
      { icon: '🏠', title: 'Property owners and builders', copy: 'Bear the cost of enhanced building standards but also the most direct benefit of reduced fire risk.' }
    ]
  },
  diamond: {
    label: 'Diamond Ridge',
    intro: 'Diamond Ridge is a 105-acre property on Deep Creek Mesa near the Telluride Airport that San Miguel County and the Town of Telluride purchased for $7.2M with plans for high-density affordable housing. Neighboring landowners challenged the rezoning and won twice in court -- first on due process and illegal spot zoning grounds, then on a PUD interpretation that further restricts development. A $5M state grant expired due to the County\'s failed legal strategy, and the land remains idle.',
    statusTitle: 'The courts ruled the County broke its own rules -- twice.',
    statusCopy: 'In 2022, the BOCC rushed through a rezone of 39 acres from protected Forestry/Agricultural land to a brand-new Community Housing zone allowing 20 units per acre. The district court found that a commissioner who helped engineer the purchase and rezone behind the scenes refused to recuse, denying landowners due process. The court also found the rezone was illegal spot zoning that ignored the Master Plan. A second 2024 ruling confirmed that the Diamond Ranch lots are part of the 1991 Aldasoro PUD, meaning they are restricted to one home per 35 acres. The County has appealed the PUD ruling but has not attempted a new rezoning.',
    nextStep: 'Watch for the outcome of the County\'s appeal of the June 2024 PUD ruling, and whether the County attempts any new rezoning or development strategy.',
    metrics: [
      { label: 'Core tension', value: 'Government bypassed its own zoning rules to fast-track development', sub: 'The County invented a new high-density zone and applied it to protected open space -- the court found it violated due process and the Master Plan.' },
      { label: 'What the courts found', value: 'Two rulings vindicating the landowners', sub: 'Dec. 2022: rezoning vacated for commissioner bias and illegal spot zoning. June 2024: Diamond Ranch lots confirmed within the 1991 Aldasoro PUD, restricting development to 35-acre lots.' }
    ],
    timeline: [
      { date: '1991', title: 'Aldasoro Ranch PUD Plan protects the area as open space', copy: 'The Sheep Ranch area (now Diamond Ranch) is zoned Forestry/Agricultural with 35-acre minimum lots, Department of Wildlife building site approval required, and a RETA for transportation mitigation -- protections landowners relied on when purchasing property.' },
      { date: '2021', title: 'BOCC quietly creates a new high-density zone', copy: 'San Miguel County amends the Land Use Code to create the Community Housing zone allowing up to 20 units per acre -- the polar opposite of the F/Ag zoning that had protected the area for decades. Text messages later revealed this was coordinated with the Town\'s purchase plan.' },
      { date: '2022', title: 'Rezone rushed through over objections; court strikes it down', copy: 'Despite a formal recusal request, Commissioner Cooper -- who had privately coordinated the purchase and rezone with the Town -- voted to approve the rezone 3-0. Neighboring landowners sued. In December 2022, Judge Patrick vacated the rezone, finding a due process violation and illegal spot zoning.' },
      { date: '2023', title: '$5M state grant expires; landowners offer to buy the property', copy: 'The County\'s failed legal strategy costs taxpayers the $5M DOLA housing grant, which expires in November 2023. Area residents offer $6.15M to purchase the property -- nearly the full purchase price -- but the County and Town refuse to sell.' },
      { date: '2024', title: 'Second court victory: Diamond Ranch confirmed within Aldasoro PUD', copy: 'In June 2024, Judge Patrick rules that the Diamond Ranch lots are part of the 1991 PUD\'s unified plan of development, meaning they are restricted to one home per 35-acre lot. The County announces it will appeal rather than accept the ruling.' },
      { date: 'Next', title: 'County appeal pending', copy: 'The County is appealing the June 2024 PUD determination. If the appeal fails, it would further solidify the existing development restrictions that landowners have fought to preserve.', future: true }
    ],
    docs: [
      { title: 'Order RE: Petition for Review — Aldasoro PUD (June 2024)', copy: 'Court rules in favor of landowners: Diamond Ranch lots are part of the 1991 Aldasoro PUD unified plan of development. BOCC\'s contrary interpretation vacated. Case No. 23CV30044.', tag: 'Court Order 2024' },
      { title: 'Order RE: Rule 106(a)(4) Review — Rezoning (Dec 2022)', copy: 'Court rules in favor of landowners: BOCC\'s rezoning of Diamond Ridge vacated on two grounds -- Commissioner Cooper\'s participation violated due process, and the rezone constituted illegal spot zoning inconsistent with the Master Plan. Case No. 22CV30023.', tag: 'Court Order 2022' },
      { title: 'San Miguel County CivicClerk Portal', copy: 'County-level records including BOCC agendas and Diamond Ridge development materials.', tag: 'County Record', href: 'https://sanmiguelcoco.portal.civicclerk.com/' }
    ],
    legalIssues: [
      { icon: '⚖️', title: 'Commissioner bias and due process violation', copy: 'Text messages showed Commissioner Cooper privately coordinated the purchase and rezone with the Town\'s representative, advocated declaring an "emergency" to rush the process, and then refused to recuse when the matter came before the BOCC. The court found she prejudged the outcome and deprived landowners of a fair hearing.' },
      { icon: '🗺️', title: 'Illegal spot zoning in violation of the Master Plan', copy: 'The court found the rezone was incompatible with the comprehensive zoning plan. The Master Plan designates the area as Low Density Residential Cluster (1 unit per 6-8 acres), but the CH zone allows up to 20 units per acre. The court said this bore no relation to the original purpose of the Diamond Ridge PUD.' },
      { icon: '📋', title: 'PUD protections upheld over County objections', copy: 'In a second case, the court confirmed that Diamond Ranch lots are part of the 1991 Aldasoro PUD\'s unified plan of development -- entitling landowners to the protections they bargained for, including 35-acre minimum lots and Department of Wildlife building site approval.' },
      { icon: '💰', title: 'Taxpayer cost of the County\'s failed strategy', copy: 'The County and Town spent $7.2M of public funds on land that remains undeveloped. A $5M DOLA grant expired in November 2023 because the County\'s rezoning was struck down. When area residents offered $6.15M to buy the property back, the County refused.' }
    ],
    players: [
      { icon: '🏛️', title: 'San Miguel County BOCC', copy: 'Created the CH zone, approved the rezoning despite a recusal request, and continues to appeal rather than accept the court\'s rulings protecting existing land use protections.' },
      { icon: '🏔️', title: 'Town of Telluride', copy: 'Co-purchaser of Diamond Ridge. Town Program Director Lance McDonald submitted the rezoning application and coordinated with Commissioner Cooper behind the scenes before the public hearing process.' },
      { icon: '🏠', title: 'Deep Creek Mesa / neighboring landowners', copy: 'Prevailed in both court challenges -- Bennett v. Vickers (rezoning) and Lucarelli v. BOCC (PUD interpretation). Offered $6.15M to purchase the property and resolve the dispute, but the offer was refused.' },
      { icon: '👨‍⚖️', title: 'Judge J. Steven Patrick', copy: 'Ruled in favor of landowners in both cases -- vacating the rezoning in 2022 and confirming Diamond Ranch lots within the Aldasoro PUD in 2024.' }
    ],
    news: [
      { source: 'Telluride News', date: 'Jul 14, 2024', title: 'County to appeal court\'s land-use ruling on Aldasoro PUD', href: 'https://www.telluridenews.com/news/article_5b4df0c2-4180-11ef-aaa5-5b37f7e2a039.html', copy: 'Rather than accept a second court loss, San Miguel County announces it will appeal the June 2024 ruling confirming Diamond Ranch lots are protected by the 1991 Aldasoro PUD.' },
      { source: 'Telluride News', date: 'Jan 5, 2024', title: 'No talks to sell Diamond Ridge property, town says', href: 'https://www.telluridenews.com/news/article_1f11df86-a9d4-11ee-b2a1-5fbbd91a6830.html', copy: 'Despite losing in court, officials refuse a $6.15M offer from neighboring residents -- nearly the full purchase price -- choosing to hold land they cannot legally develop under current rulings.' },
      { source: 'Telluride News', date: 'Nov 17, 2023', title: 'State to reallocate grant that was for Diamond Ridge housing project', href: 'https://www.telluridenews.com/news/article_48fa9492-85a2-11ee-82bd-7f691ab62966.html', copy: 'DOLA reallocates the $5M grant after the County\'s illegal rezoning was struck down -- a direct consequence of the BOCC\'s failure to follow its own land use rules.' },
      { source: 'Telluride News (Release)', date: 'Nov 15, 2023', title: 'State grant for Diamond Ridge housing initiative expires due to litigation delays', href: 'https://www.telluridenews.com/news_release/article_09d4da6e-856d-11ee-b27b-a752864d23d8.html', copy: 'The $5M DOLA grant officially expires, with funds redirected to other Colorado communities whose housing projects followed proper process.' },
      { source: 'Telluride News', date: 'May 5, 2023', title: 'Judge: \'Spot zoning\' remains illegal for Diamond Ridge project', href: 'https://www.telluridenews.com/news/article_04f0e2ae-ead6-11ed-b6cb-4bdfb53b3196.html', copy: 'Court reaffirms its December 2022 ruling that the Diamond Ridge rezoning was illegal spot zoning, rejecting the County\'s attempts to revisit the decision.' },
      { source: 'Telluride News (Opinion)', date: 'Jan 12, 2023', title: 'The Diamond Ridge fiasco', href: 'https://www.telluridenews.com/opinion/article_4e695f38-9144-11ed-8109-efe6161caf94.html', copy: 'Opinion piece examining how the County\'s disregard for process and existing protections led to a costly legal defeat and a stalled housing project.' },
      { source: 'Telluride News', date: 'Jan 2, 2023', title: 'Legal ruling reverses Diamond Ridge rezone', href: 'https://www.telluridenews.com/news/article_85c1c148-8be3-11ed-aaca-0fd1af7ae3da.html', copy: 'Judge Patrick\'s December 2022 order vacates the BOCC\'s rezoning, vindicating landowners who argued the process was tainted by commissioner bias and violated the Master Plan.' },
      { source: 'Telluride News', date: 'Jul 22, 2022', title: 'Deep Creek group files lawsuit over zoning decision', href: 'https://www.telluridenews.com/news/article_793756f6-094b-11ed-abf3-131792480868.html', copy: 'Neighboring landowners take the only recourse available to them -- a Rule 106(a)(4) petition challenging the BOCC\'s rezoning after their recusal request was ignored.' },
      { source: 'Telluride News', date: 'May 20, 2022', title: 'Commissioners approve rezone of Diamond Ridge', href: 'https://www.telluridenews.com/news/article_eac5e9fa-d704-11ec-8e24-e7d9f2a0067d.html', copy: 'BOCC votes 3-0 to rezone 39 acres from F/Ag to Community Housing despite a formal recusal request -- Commissioner Cooper, who privately coordinated the plan, refuses to step aside.' },
      { source: 'Telluride News', date: 'May 11, 2022', title: 'Commissioner\'s recusal sought ahead of hearing', href: 'https://www.telluridenews.com/news/article_9e0337f8-d308-11ec-acf1-674927587809.html', copy: 'Landowners\' counsel formally requests Commissioner Cooper recuse herself, citing text messages showing she was a driving force behind the purchase and rezone plan -- a request the Commissioner ignores.' },
      { source: 'Telluride News', date: 'Apr 22, 2022', title: 'Planning board narrowly OKs zoning change', href: 'https://www.telluridenews.com/news/article_f9e1393c-c1cc-11ec-8a85-9fd77399946c.html', copy: 'Planning Commission narrowly approves the rezone over significant opposition, sending the controversial decision to the BOCC for final action.' },
      { source: 'Telluride News', date: 'Apr 21, 2022', title: 'County planning commission begins Diamond Ridge rezoning process', href: 'https://www.telluridenews.com/news/article_ac75ddb0-c0f5-11ec-b7c9-c7819ef15cd3.html', copy: 'Formal review begins on the application to convert protected open space into high-density housing, prompting immediate concern from Deep Creek Mesa residents.' }
    ]
  }
};

const GONDOLA_DATA = {
  legalSummary: 'This case involved a challenge to the 3A campaign claiming that SMART failed to provide adequate TABOR notice because voters were not told where, when, or how to submit opposing comments for inclusion in the ballot notice. Additionally, the 3A campaign was claimed to be misleading in suggesting the measure would meaningfully fund a new gondola. The district court rejected the plaintiff\'s election claims. However, rather than let the matter rest, the public entities of Mountain Village, Town of Telluride, and SMART brought motions seeking attorney fees for just under $100,000. Plaintiff believes these claims were vindictive and is currently appealing such award in court.',
  intro: 'Ballot Issue 3A approved ~$8.2M/year in new SMART district tax revenue marketed as funding a new gondola. But the current gondola (built 1996) has a replacement cost estimated at $120-150M+, leaving a significant funding gap. CORA records revealed over $175,000 in consultant spending before the ballot referral.',
  statusTitle: 'The gondola funding agreement expires in 2027 -- and the math does not add up.',
  statusCopy: '3A revenue covers a fraction of the replacement cost. CORA requests uncovered $68K on polling (Keating Research), $170K on project management (Kerry Donovan/Ulysses), and "Friends of the Gondola" raising $130K -- including $60K from TMVOA and $60K from the Four Seasons developer. The campaign marketed the measure as funding a "new gondola" but actual revenue only covers operating and partial capital costs.',
  nextStep: 'Watch SMART Board meetings for capital planning, funding strategy, and any new ballot measures or intergovernmental agreements.',
  metrics: [
    { label: 'Core tension', value: '$8.2M/year approved vs. $120-150M+ replacement cost', sub: 'The ballot measure was marketed as funding a new gondola but the revenue covers a fraction of the estimated replacement cost.' },
    { label: 'What CORA revealed', value: '$175K+ in pre-ballot consultant spending', sub: '$68K polling, $170K project management, $130K "Friends of the Gondola" campaign -- funded in part by TMVOA and the Four Seasons developer.' }
  ],
  timeline: [
    { date: '1996', title: 'Free gondola connecting Telluride and Mountain Village opens', copy: 'The gondola becomes critical regional infrastructure used by commuters, workers, visitors, and residents daily.' },
    { date: '2024', title: 'Ballot Issue 3A passes', copy: 'Voters approve ~$8.2M/year in new SMART district tax revenue. The campaign frames it as funding a "new gondola" but the revenue covers only a small fraction of estimated replacement cost.' },
    { date: 'Now', title: 'CORA records reveal consultant spending and campaign funding', copy: 'Public records requests uncovered over $175,000 in consultant spending before the 3A referral, raising transparency questions about how the ballot measure was developed and marketed.' },
    { date: 'Next', title: 'Funding agreement expires 2027', copy: 'The current gondola funding structure sunsets soon. Watch for SMART Board capital planning, new ballot measures, or intergovernmental agreements to bridge the gap.', future: true }
  ],
  docs: [
    { title: 'Response on Order to Show Cause — Colorado Supreme Court', copy: 'Appellant Masson\'s response to the Supreme Court\'s order to show cause in Case No. 2026SA40, asserting appellate jurisdiction over the attorney fee awards under CRS \u00A7 1-11-214(2). Appeal addresses fees only, not the merits of the election contest.', tag: 'Supreme Court 2026' },
    { title: 'Order Following Trial on Election Contest', copy: 'District court order issued after the April 18, 2025 trial in Case 2024CV8. Court found SMART complied with TABOR notice requirements and that ballot language was not misleading. Vote tally: 1,956 for / 1,758 against.', tag: 'Court Order 2025' },
    { title: 'Plaintiff\'s Written Closing Argument', copy: 'Masson\'s post-trial closing argument contending SMART provided no meaningful public notice for opposition comments, and that the TABOR notice misleadingly omitted the "slush fund" nature of capital improvement spending.', tag: 'Closing Arg. 2025' },
    { title: 'Contestor Emily Masson\'s Trial Brief', copy: 'Pre-trial brief filed by Starritt Legal LLC arguing voters had only 12-24 hours to submit opposition comments and that TABOR notice language regarding "capital improvements" was misleading.', tag: 'Trial Brief 2025' },
    { title: 'Written Statement to Contest Ballot Issue 3A', copy: 'Original election contest filing by Emily Masson (Case 2024CV8) challenging 3A on grounds of non-resident voter eligibility, inadequate TABOR notice, misleading ballot language, and unlawful public entity campaign contributions.', tag: 'Filing 2024' },
    { title: 'SMART Board Meeting Agendas', copy: 'Official meeting materials for the San Miguel Authority for Regional Transportation.', tag: 'SMART', href: 'https://smartgov.org/meetings/' },
    { title: 'San Miguel County CivicClerk Portal', copy: 'County-level records relevant to SMART district and gondola discussions.', tag: 'County Record', href: 'https://sanmiguelcoco.portal.civicclerk.com/' }
  ],
  legalIssues: [
    { icon: '💰', title: 'Funding gap and voter expectations', copy: '3A was marketed as funding a "new gondola," but ~$8.2M/year covers only a fraction of the $120-150M+ estimated replacement cost. Whether the ballot language created enforceable voter expectations is an open question.' },
    { icon: '📋', title: 'Pre-ballot consultant spending', copy: 'CORA records revealed $68K on polling (Keating Research), $170K on project management (Kerry Donovan/Ulysses), and a "Friends of the Gondola" campaign raising $130K -- including $60K from TMVOA and $60K from a Four Seasons developer. The timing and sourcing of this spending raise transparency concerns.' },
    { icon: '🔍', title: 'CORA compliance and public records', copy: 'Multiple CORA requests were required to piece together the full picture of pre-ballot spending. Delayed or incomplete responses raise questions about compliance with Colorado open records requirements.' },
    { icon: '⚖️', title: 'Intergovernmental authority and SMART governance', copy: 'The SMART district spans multiple jurisdictions. Questions persist about accountability, board governance, and whether the taxing authority is being used consistent with its enabling legislation.' }
  ],
  players: [
    { icon: '🚡', title: 'SMART Board', copy: 'Governs gondola operations, maintenance, and capital planning. Key decision-maker on how 3A revenue is allocated.' },
    { icon: '🏔️', title: 'TMVOA / Mountain Village', copy: 'Major stakeholder and campaign contributor. Mountain Village relies heavily on the gondola for connectivity.' },
    { icon: '🏨', title: 'Resort developers', copy: 'Four Seasons developer contributed $60K to Friends of the Gondola. Development interests are intertwined with gondola infrastructure.' },
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
  { label: 'Telluride Debt', href: '/the-growing-weight-of-tellurides-debt/' }
];

const ENTITY_LOGOS = {
  telluride: '<img src="/logo/Telluride%20Town.png" alt="Town of Telluride" style="width:100%;height:100%;object-fit:contain;">',
  county: '<img src="/logo/San Miguel County.png" alt="San Miguel County" style="width:100%;height:100%;object-fit:contain;">',
  mv: '<img src="https://townofmountainvillage.com/site/themes/vwtheme/build/img/logos/town-of-mountain-village-logo.png" alt="Mountain Village" loading="lazy">',
  school: '<img src="https://files.smartsites.parentsquare.com/3403/design_img__vb3hiz.png" alt="Telluride School District" loading="lazy">',
  smart: '<img src="/logo/SMART.png" alt="SMART" style="width:100%;height:100%;object-fit:contain;">',
  fire: '<img src="/logo/Telluride Fire.png" alt="Telluride Fire Department" style="width:100%;height:100%;object-fit:contain;">',
  med: '<img src="/logo/Medical.jpeg" alt="Telluride Medical Center" style="width:100%;height:100%;object-fit:contain;">',
  norwood: '<img src="/logo/Norwood.jpeg" alt="Town of Norwood" style="width:100%;height:100%;object-fit:contain;">',
  ophir: '<img src="/logo/Ophir.jpeg" alt="Town of Ophir" style="width:100%;height:100%;object-fit:contain;">',
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
  clubs: '<img src="/logo/clubs-icon.png" alt="Local Organizations" style="width:100%;height:100%;object-fit:contain;">'
};

const TOWN_IMAGES = {
  norwood: '/logo/Norwood.jpeg',
  mv: '/logo/Mountain Village.png',
  telluride: '/logo/Telluride.png',
  ridgway: '/logo/Ridgway.png',
  ophir: '/logo/Ophir.jpeg',
  placerville: '/logo/Placerville.png'
};

const SOURCE_SHORT_NAME = {
  telluride: 'Telluride',
  county: 'San Miguel County',
  smart: 'SMART',
  mv: 'Mountain Village',
  school: 'School District',
  fire: 'First District',
  med: 'Med Center',
  norwood: 'Norwood',
  ophir: 'Ophir',
  airport: 'TEX',
  wilkinson: 'Wilkinson'
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
  smart: {},
  fire: {},
  med: { hasZoom: true },     // Med Center board meets in-person + Zoom
  airport: {},
  ttimes: {}
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
  airport:   'Terminal Observation Lounge, Telluride Regional Airport, Telluride, CO 81435',
  ttimes:    'Telluride, CO'
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
  {
    name: 'Rotary Club of Telluride',
    title: 'Rotary Club Meeting',
    rule: [1, 3],        // 1st & 3rd occurrence
    dayOfWeek: 3,        // Wednesday (0=Sun)
    time: '6:00 PM',
    locations: ['Mountain Lodge, 457 Mountain Village Blvd (1st Wed)', 'Announced Telluride location (3rd Wed)'],
    href: 'https://portal.clubrunner.ca/3291',
    note: 'Social at 5:30 PM. No meetings in April. In-person & online options available.',
    skipMonths: [4],     // No meetings in April
    logo: '/logo/Telluride Rotary.png'
  },
  {
    name: 'Telluride Elks Lodge 692',
    title: 'Elks Lodge Regular Meeting',
    rule: [2, 4],        // 2nd & 4th occurrence
    dayOfWeek: 4,        // Thursday
    time: '6:30 PM',
    locations: ['472 W Pacific Ave, Telluride'],
    href: 'https://tellurideelks.org',
    note: 'Board/House Committee meets 2nd Thursdays at 5:30 PM.',
    logo: '/logo/Elks.png'
  }
];

const TELLURIDE_FESTIVALS = [
  { name: 'Mountainfilm', month: 4, dayStart: 22, dayEnd: 25, icon: '🎥',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Mountain%20Film.png',
    url: 'https://www.mountainfilm.org/', ticketUrl: 'https://www.mountainfilm.org/festival/passes/', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '2026 festival passes on sale now' },
  { name: 'MusicFest (Chamber Music)', month: 5, dayStart: 28, dayEnd: 5, endMonth: 6, icon: '🎻',
    logo: 'https://raw.githubusercontent.com/morgan524/morgan524-telluride-gov-hub/main/logo/Chamber.png',
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
    url: 'https://www.telluridehorrorshow.com/', ticketUrl: 'https://www.telluridehorrorshow.com/passes', ticketLabel: 'Buy Passes', ticketStatus: 'on-sale', promo: '3-day passes on sale Mar 25 — 6-packs on sale Jul 1, 2026' },
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

