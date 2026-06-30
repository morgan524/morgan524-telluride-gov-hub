/* Events Around Me — Geocoding & Proximity Filter */

// ══════════════════════════════════════════════════════════════
// ── Events Around Me -- Geocoding & Proximity Filter ──
// ══════════════════════════════════════════════════════════════
//
// PURPOSE: Alert subscribers when a planning decision, development project,
// or board/commission determination involves property near THEIR address.
// This is NOT about meeting venue locations (those never change).
//
// PRIORITY TIERS:
//   1. Planning & board/commission decisions involving specific properties
//   2. Arts & cultural events (festivals, community events)
//
// HOW IT WORKS:
//   - Scans meeting summaries & WHY_THIS_MATTERS for street addresses
//   - Maps known project sites to coordinates
//   - Geocodes the subscriber's address via OpenStreetMap Nominatim
//   - Calculates distance and filters by chosen radius
//

(function() {
  'use strict';

  // ── Known PROJECT / PROPERTY site coordinates ──
  // These are the actual development sites, not where the meetings are held.
  // Update as new projects enter the pipeline.
  const PROJECT_SITES = [
    // ── Active planning / development projects ──
    { lat: 37.9383, lon: -107.8173, name: 'Carhenge Redevelopment (700 W Pacific Ave)', keywords: /carhenge|700 w pacific/i, tier: 1 },
    { lat: 37.9378, lon: -107.8095, name: 'Silver Jack (155 W Pacific Ave)', keywords: /silver jack|155 w pacific/i, tier: 1 },
    { lat: 37.9365, lon: -107.8100, name: 'Element 52 (398 S Davis St)', keywords: /element 52|398 s davis/i, tier: 1 },
    { lat: 37.9370, lon: -107.8068, name: 'Chair 7 Base Area', keywords: /chair\s*7/i, tier: 1 },
    { lat: 37.9536, lon: -107.9085, name: 'Society Turn PUD', keywords: /society\s*turn/i, tier: 1 },
    { lat: 37.9358, lon: -107.8095, name: 'Shandoka Parking Structure', keywords: /shandoka/i, tier: 1 },
    { lat: 37.9387, lon: -107.8160, name: 'Overlook at Telluride Subdivision', keywords: /overlook/i, tier: 1 },
    { lat: 37.9374, lon: -107.8115, name: 'Wilkin Court', keywords: /wilkin court/i, tier: 1 },
    { lat: 37.9390, lon: -107.8150, name: 'Stender Residence (HARC appeal)', keywords: /stender/i, tier: 1 },
    { lat: 37.9383, lon: -107.8210, name: 'Lawson Hill Housing Site', keywords: /lawson hill/i, tier: 1 },
    { lat: 37.9374, lon: -107.8130, name: 'Aldasoro / Diamond Ranch PUD', keywords: /aldasoro|diamond ranch|lucarelli/i, tier: 1 },

    // ── Arts & cultural event venues (secondary priority) ──
    { lat: 37.9377, lon: -107.8118, name: 'Town Park (festivals)', keywords: /bluegrass|blues.*brews|jazz|ride\s*festival|film\s*festival|mountainfilm|wine\s*festival|yoga\s*festival|mushroom|horror\s*show|fourth.*july|nothing\s*festival/i, tier: 2 },
    { lat: 37.9372, lon: -107.8102, name: 'Sheridan Opera House', keywords: /sheridan|opera\s*house/i, tier: 2 },
    { lat: 37.9368, lon: -107.8078, name: 'Ah Haa School for the Arts', keywords: /ah\s*haa/i, tier: 2 },
    { lat: 37.9370, lon: -107.8090, name: 'Wilkinson Public Library', keywords: /wilkinson|library/i, tier: 2 },
    { lat: 37.9375, lon: -107.8108, name: 'Telluride Arts District', keywords: /arts?\s*district|gallery|community\s*event/i, tier: 2 },
  ];

  // ── Haversine distance (miles) ──
  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── Geocode via OpenStreetMap Nominatim (free, no API key) ──
  async function geocodeAddress(address) {
    // Check if address matches a known project site first
    const lower = address.toLowerCase();
    for (const site of PROJECT_SITES) {
      if (site.keywords.test(lower)) return { lat: site.lat, lon: site.lon };
    }
    // Append region context for better geocoding results
    const query = address.match(/telluride|mountain village|norwood|ophir|san miguel/i)
      ? address
      : address + ', San Miguel County, Colorado';
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const resp = await fetch(url, { headers: { 'User-Agent': 'TellurideGovHub/1.0' } });
    const data = await resp.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name };
    }
    return null;
  }

  // ── Match a meeting item to nearby project sites by scanning its text ──
  // Returns an array of { site, distance } for all project sites referenced
  // in the meeting's title, summary, or WHY_THIS_MATTERS content.
  function getItemProjectSites(item) {
    // Build a searchable text blob from the meeting's content
    const title = item.title || '';
    const desc = item.description || '';
    const summary = (typeof getMeetingSummary === 'function') ? (getMeetingSummary(item) || '') : '';
    const searchText = title + ' | ' + summary + ' | ' + desc;

    const matches = [];
    for (const site of PROJECT_SITES) {
      if (site.keywords.test(searchText)) {
        matches.push(site);
      }
    }
    return matches;
  }

  // ── State ──
  let proxCoords = null;
  let proxRadius = 0.5;
  let proxAddress = '';

  // ── DOM refs ──
  const overlay   = document.getElementById('proxOverlay');
  const closeBtn  = document.getElementById('proxClose');
  const addrInput = document.getElementById('proxAddress');
  const applyBtn  = document.getElementById('proxApply');
  const statusEl  = document.getElementById('proxStatus');
  const radiusRow = document.getElementById('proxRadiusRow');
  const banner    = document.getElementById('proxActiveBanner');
  const bannerTxt = document.getElementById('proxActiveText');
  const clearBtn  = document.getElementById('proxActiveClear');

  // ── Open / close modal (triggered from "Events Around Me" topic checkbox) ──
  closeBtn.addEventListener('click', () => { overlay.classList.remove('open'); });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  // ── Radius chip selection ──
  radiusRow.querySelectorAll('.prox-radius-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      radiusRow.querySelectorAll('.prox-radius-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      proxRadius = parseFloat(chip.dataset.miles);
    });
  });

  // ── Enter key triggers apply ──
  addrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
  });

  // ── Apply: geocode & count nearby projects ──
  applyBtn.addEventListener('click', async () => {
    const addr = addrInput.value.trim();
    if (!addr) {
      statusEl.textContent = 'Please enter an address.';
      statusEl.className = 'prox-modal-status error';
      return;
    }
    applyBtn.disabled = true;
    applyBtn.textContent = 'Looking up address…';
    statusEl.textContent = '';
    statusEl.className = 'prox-modal-status';

    try {
      const coords = await geocodeAddress(addr);
      if (!coords) {
        statusEl.textContent = 'Could not find that address. Try including the town name (e.g., "200 W Colorado Ave, Telluride").';
        statusEl.className = 'prox-modal-status error';
        applyBtn.disabled = false;
        applyBtn.textContent = 'Find Events Near This Address';
        return;
      }
      proxCoords = coords;
      proxAddress = addr;

      // Count nearby projects by tier
      const meetings = window.__allMeetingsCache || [];
      const { planning, cultural } = countNearbyByTier(meetings);
      const total = planning + cultural;

      let msg = 'Found your location! ';
      if (total === 0) {
        msg += 'No active projects or events within ' + formatRadius(proxRadius) + ' right now. We\'ll notify you when something comes up.';
      } else {
        const parts = [];
        if (planning > 0) parts.push('<strong>' + planning + ' planning/board decision' + (planning !== 1 ? 's' : '') + '</strong>');
        if (cultural > 0) parts.push('<strong>' + cultural + ' arts/cultural event' + (cultural !== 1 ? 's' : '') + '</strong>');
        msg += parts.join(' and ') + ' within ' + formatRadius(proxRadius) + '.';
      }
      statusEl.innerHTML = msg;
      statusEl.className = 'prox-modal-status success';

      // Update banner
      bannerTxt.innerHTML = '📍 Notify me about projects within <strong>' + formatRadius(proxRadius) + '</strong> of ' + shortenAddr(addr);
      banner.classList.add('visible');

      // Auto-select "Events Around Me" topic checkbox
      const eamCheckbox = document.querySelector('#topicEventsAroundMe input[type="checkbox"]');
      if (eamCheckbox && !eamCheckbox.checked) {
        eamCheckbox.checked = true;
        eamCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setTimeout(() => { overlay.classList.remove('open'); }, 1500);

    } catch (err) {
      statusEl.textContent = 'Network error — please check your connection and try again.';
      statusEl.className = 'prox-modal-status error';
    }
    applyBtn.disabled = false;
    applyBtn.textContent = 'Find Events Near This Address';
  });

  // ── Clear ──
  clearBtn.addEventListener('click', () => {
    proxCoords = null;
    proxAddress = '';
    banner.classList.remove('visible');
    statusEl.textContent = '';
    // Uncheck "Events Around Me" topic checkbox
    const eamCheckbox = document.querySelector('#topicEventsAroundMe input[type="checkbox"]');
    if (eamCheckbox && eamCheckbox.checked) {
      eamCheckbox.checked = false;
      eamCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // ── Count nearby meetings grouped by tier ──
  function countNearbyByTier(items) {
    let planning = 0, cultural = 0;
    if (!proxCoords || !items.length) return { planning, cultural };

    // Track which meetings we've already counted (avoid double-counting
    // a meeting that references multiple nearby projects)
    const counted = new Set();

    items.forEach((item, idx) => {
      const sites = getItemProjectSites(item);
      if (!sites.length) return;

      let bestTier = 99;
      let isNear = false;
      for (const site of sites) {
        const dist = haversineMiles(proxCoords.lat, proxCoords.lon, site.lat, site.lon);
        if (dist <= proxRadius) {
          isNear = true;
          if (site.tier < bestTier) bestTier = site.tier;
        }
      }

      if (isNear && !counted.has(idx)) {
        counted.add(idx);
        if (bestTier === 1) planning++;
        else cultural++;
      }
    });
    return { planning, cultural };
  }

  function formatRadius(miles) {
    if (miles === 0.25) return '¼ mile';
    if (miles === 0.5)  return '½ mile';
    return miles + (miles === 1 ? ' mile' : ' miles');
  }

  function shortenAddr(addr) {
    return addr.replace(/,?\s*(CO|Colorado|81435|USA|United States).*/i, '').trim();
  }

  // ── Expose for subscribe form & email integration ──
  window._proximityFilter = {
    isActive: () => !!proxCoords,
    getCoords: () => proxCoords,
    getRadius: () => proxRadius,
    getAddress: () => proxAddress,
    // Check if a meeting involves a project site near the user's address
    isNearby: (item) => {
      if (!proxCoords) return true; // no filter active = include everything
      const sites = getItemProjectSites(item);
      if (!sites.length) return false; // no project address = skip
      for (const site of sites) {
        if (haversineMiles(proxCoords.lat, proxCoords.lon, site.lat, site.lon) <= proxRadius) {
          return true;
        }
      }
      return false;
    },
    // Get the tier (1 = planning, 2 = cultural) for a nearby item
    getNearbyTier: (item) => {
      if (!proxCoords) return null;
      const sites = getItemProjectSites(item);
      let best = null;
      for (const site of sites) {
        if (haversineMiles(proxCoords.lat, proxCoords.lon, site.lat, site.lon) <= proxRadius) {
          if (!best || site.tier < best) best = site.tier;
        }
      }
      return best;
    }
  };

})();
