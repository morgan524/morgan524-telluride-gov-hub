/* Valley Project Map — Livable Telluride
   Phase 1: Mapbox GL JS + static data/projects.json + GitHub Pages
   Phase 2 (future): Supabase/PostGIS + MapLibre
*/

mapboxgl.accessToken = 'pk.eyJ1IjoibGl2YWJsZXRlbGx1cmlkZSIsImEiOiJjbXA0NTVva3EwNXo1MnBwcmhnaHhka3dsIn0.8erE-LUnadeYwRSwdr20_w';

// ─── Preset regional views ────────────────────────────────────────────────────
const PRESET_VIEWS = [
  { label: 'Countywide',            center: [-108.00, 38.00], zoom: 9.2  },
  { label: 'Telluride / East End',  center: [-107.830, 37.940], zoom: 12.2 },
  { label: 'Mountain Village',      center: [-107.849, 37.941], zoom: 13.0 },
  { label: "Norwood / Wright's Mesa", center: [-108.281, 38.130], zoom: 11.5 },
  { label: 'Nucla / Naturita / West End', center: [-108.545, 38.250], zoom: 11.0 },
  { label: 'Ophir',                 center: [-107.825, 37.856], zoom: 13.2 },
  { label: 'Ridgway / Regional',    center: [-107.760, 38.153], zoom: 11.0 },
];

// ─── Status → pin color ───────────────────────────────────────────────────────
const STATUS_COLORS = {
  'Proposed':             '#dc2626', // red
  'Under Review':         '#ea580c', // orange
  'Approved':             '#16a34a', // green
  'Litigation':           '#7c3aed', // purple
  'Built':                '#6b7280', // gray
  'Public Infrastructure':'#2563eb', // blue
};

// ─── 3D massing colors by status ─────────────────────────────────────────────
const MASSING_COLORS = {
  'Proposed':             '#d95f02',
  'Under Review':         '#f0a202',
  'Approved':             '#2f7a5f',
  'Public Infrastructure':'#376980',
  'Disputed':             '#6b4f87',
};

// ─── State ────────────────────────────────────────────────────────────────────
let allProjects      = [];
let filteredProjects = [];
let activeFilters    = { search: '' };  // only the search box remains; chip filters were removed
let map;
let markers          = []; // { mapMarker, el, project }
let activeProject    = null;
let massingLoaded    = false;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function init() {
  // Init map
  // Default to the corridor from Telluride through Mountain Village to Society Turn
  // Telluride: 37.936,-107.814 | MV: 37.931,-107.856 | Society Turn: 37.950,-107.871
  const DEFAULT_VIEW = { center: [-107.843, 37.938], zoom: 12.3 };
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12',
    center: DEFAULT_VIEW.center,
    zoom:   DEFAULT_VIEW.zoom,
  });
  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  // Load data
  try {
    const resp = await fetch('data/projects.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    allProjects = await resp.json();
  } catch (e) {
    console.error('Failed to load projects.json:', e);
    document.getElementById('project-list').innerHTML =
      '<div class="no-results">⚠️ Could not load project data.</div>';
    return;
  }

  buildPresetButtons();
  buildLegend();
  applyFilters();

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    activeFilters.search = e.target.value.toLowerCase().trim();
    applyFilters();
  });

  // Close drawer on map click (not on marker or massing)
  map.on('click', e => {
    const massingFeatures = map.queryRenderedFeatures(e.point, { layers: ['proposed-massing-layer', 'proposed-massing-flat-layer'] });
    if (massingFeatures.length === 0 && activeProject) closeDrawer();
  });

  // Load 3D massing after style is fully ready
  map.on('load', () => {
    // 3D terrain via Mapbox DEM. Gives the Telluride valley its actual
    // mountain context — proposed buildings then read in relation to
    // the box-canyon topography rather than floating on flat ground.
    // Exaggeration 1.4 makes the verticals feel like the canyon
    // actually does at street level without going cartoonish.
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url:  'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom:  14,
      });
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 });

    // Soft warm directional light — matches the Telluride afternoon look
    // and gives fill-extrusions readable shading. Uses the classic
    // setLight (singular) API; setLights (plural) is reserved for the
    // newer Standard style.
    map.setLight({
      anchor:    'viewport',
      color:     'rgb(255, 245, 225)',
      intensity: 0.5,
      position:  [1.5, 60, 30],
    });

    loadMassingLayer();
  });
}

// ─── 3D Massing layer ─────────────────────────────────────────────────────────
function loadMassingLayer() {
  // Add GeoJSON source — inlined to avoid async file-load race
  map.addSource('proposed-massing', {
    type: 'geojson',
    data: 'data/proposed-massing.geojson',
  });

  // Add fill-extrusion layer for proposed project massing.
  //
  // Style follows the Mapbox doc "Style an individual layer" pattern
  // (https://docs.mapbox.com/help/dive-deeper/z_add-3d-buildings-studio/):
  // identity mapping from the data's height_m → fill-extrusion-height
  // and from base_m → fill-extrusion-base. No more zoom-based 4×
  // exaggeration — blocks render at true real-world scale at every zoom
  // level. Below ~zoom 14 individual buildings are tiny but the cluster
  // of pins + status colors still tells the cumulative-impact story; the
  // 3D massing reveal as the user zooms in to street-level is the point.
  // Color expression shared by both massing layers (terrain-aligned + flat).
  const MASSING_COLOR = [
    'match',
    ['get', 'status'],
    'Proposed',              '#d95f02',
    'Under Review',          '#f0a202',
    'Approved',              '#2f7a5f',
    'Public Infrastructure', '#376980',
    'Disputed',              '#6b4f87',
    '#888888',
  ];

  // Default terrain-aligned layer: extrusion base/height measured from
  // the DEM under each polygon vertex. Features draped on the slope show
  // their base following terrain.
  map.addLayer({
    id: 'proposed-massing-layer',
    type: 'fill-extrusion',
    source: 'proposed-massing',
    // Skip features that opt into flat alignment — they render in the
    // companion flat-layer below.
    filter: ['!=', ['coalesce', ['get', 'flatten'], false], true],
    layout: {
      visibility: 'none',
    },
    paint: {
      'fill-extrusion-color': MASSING_COLOR,
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], 20],
      'fill-extrusion-base':   ['coalesce', ['get', 'base_m'], 0],
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-ambient-occlusion-intensity': 0.35,
      'fill-extrusion-ambient-occlusion-radius':    3.0,
    },
  });

  // Flat-aligned layer: extrusion sits as a uniform slab over terrain
  // rather than draping each vertex onto the DEM. Used for sites that
  // are graded flat in real life (e.g. Carhenge — leveled pad, not
  // stair-stepping up Kid's Hill). Requires Mapbox GL JS v3.8+; we're
  // on v3.10. Alignment properties are PAINT properties per the
  // style spec.
  map.addLayer({
    id: 'proposed-massing-flat-layer',
    type: 'fill-extrusion',
    source: 'proposed-massing',
    filter: ['==', ['get', 'flatten'], true],
    layout: {
      'visibility': 'none',
    },
    paint: {
      'fill-extrusion-color': MASSING_COLOR,
      // Static numeric values — Mapbox's experimental flat-alignment is
      // picky about expressions on the base/height it pairs with.
      // Carhenge graded pad ≈ 2666 m (8747 ft); 45 ft slab → top 2680 m.
      'fill-extrusion-base':              2666,
      'fill-extrusion-height':            2680,
      'fill-extrusion-base-alignment':    'flat',
      'fill-extrusion-height-alignment':  'flat',
      'fill-extrusion-opacity':           0.85,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-ambient-occlusion-intensity': 0.35,
      'fill-extrusion-ambient-occlusion-radius':    3.0,
    },
  });

  // Surface any alignment-related Mapbox errors so we can see the cause
  // when this experimental property doesn't kick in.
  map.on('error', (e) => {
    if (e && e.error && /alignment|flatten/i.test(e.error.message || '')) {
      console.warn('[massing-flat-layer]', e.error.message);
    }
  });

  // Add existing-buildings layer for surrounding context. Same identity
  // mapping pattern as Mapbox doc Option 2: height from `height` field,
  // base from `min_height`. Now visible starting at zoom 13 (was 15) so
  // proposed massing has neighbors to compare against from a wider view.
  map.addLayer({
    id: 'existing-buildings-3d',
    type: 'fill-extrusion',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    minzoom: 13,
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': '#c8c0b4',
      // Identity mapping — height/min_height from Mapbox Streets v8
      // building tiles. Brief fade-in over zoom 13 → 13.5 to avoid a
      // hard pop when crossing the minzoom threshold.
      // Mapbox Streets v8 building heights for Telluride often run ~2× real
      // (OSM tags inflated by attic/parapet rules). Scale by 0.5, then cap
      // at 12 m (~40 ft) so the tallest OSM-tagged buildings on the slope
      // (Mountainside Inn cluster, Camel's Garden) don't tower over the
      // 2–3-story buildings across W Pacific Ave. The cap matches the
      // Telluride town 35 ft ridge limit + a little parapet allowance.
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        13,   0,
        13.5, ['min', 12, ['*', 0.5, ['coalesce', ['get', 'height'], 6]]],
      ],
      'fill-extrusion-base': [
        'interpolate', ['linear'], ['zoom'],
        13,   0,
        13.5, ['coalesce', ['get', 'min_height'], 0],
      ],
      'fill-extrusion-opacity': 0.55,
      'fill-extrusion-vertical-gradient': true,
    },
  }, 'proposed-massing-layer'); // render existing buildings BEHIND proposed massing

  massingLoaded = true;

  // Click on a massing block → open project drawer. Wire BOTH terrain-
  // aligned and flat-aligned layers (Carhenge etc. live in the flat one).
  const massingClickHandler = e => {
    const props = e.features[0].properties;
    const project = allProjects.find(p => p.id === props.project_id);
    if (project) {
      openDrawer(project);
    } else {
      openMassingDrawer(props);
    }
    e.originalEvent.stopPropagation();
  };
  map.on('click', 'proposed-massing-layer',      massingClickHandler);
  map.on('click', 'proposed-massing-flat-layer', massingClickHandler);

  // Hover: pointer cursor
  const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const onLeave = () => { map.getCanvas().style.cursor = ''; };
  map.on('mouseenter', 'proposed-massing-layer',      onEnter);
  map.on('mouseleave', 'proposed-massing-layer',      onLeave);
  map.on('mouseenter', 'proposed-massing-flat-layer', onEnter);
  map.on('mouseleave', 'proposed-massing-flat-layer', onLeave);

  // Wire toggle
  const toggle = document.getElementById('toggleMassing');
  if (toggle) {
    toggle.addEventListener('change', e => {
      const visible = e.target.checked;
      map.setLayoutProperty('proposed-massing-layer',      'visibility', visible ? 'visible' : 'none');
      map.setLayoutProperty('proposed-massing-flat-layer', 'visibility', visible ? 'visible' : 'none');
      map.setLayoutProperty('existing-buildings-3d',       'visibility', visible ? 'visible' : 'none');
      // When enabling, fly to the main Telluride–MV corridor zoomed in enough to see blocks
      map.easeTo({
        ...(visible ? { center: [-107.843, 37.938], zoom: 13.5 } : {}),
        pitch:    visible ? 58 : 0,
        bearing:  visible ? -20 : 0,
        duration: visible ? 1100 : 700,
      });

      // Show/hide disclaimer
      const disclaimer = document.getElementById('massing-disclaimer');
      if (disclaimer) disclaimer.style.display = visible ? 'block' : 'none';

      // Update massing legend visibility
      const massingLegend = document.getElementById('massing-legend-section');
      if (massingLegend) massingLegend.style.display = visible ? 'block' : 'none';
    });
  }
}

// Fallback drawer for massing blocks not linked to a project
function openMassingDrawer(props) {
  const drawer = document.getElementById('drawer');
  const color  = MASSING_COLORS[props.status] || '#888888';

  const confClass = 'confidence-' + (props.source_confidence || 'unknown').toLowerCase().replace(/[^a-z]/g, '-');

  const statsHtml = (() => {
    const parts = [];
    if (props.sqft)        parts.push(`<div class="stat"><span>${(props.sqft/1000).toFixed(0)}K</span>sq ft</div>`);
    if (props.hotel_rooms) parts.push(`<div class="stat"><span>${props.hotel_rooms}</span>hotel rooms</div>`);
    if (props.housing_units) parts.push(`<div class="stat"><span>${props.housing_units}</span>units</div>`);
    if (props.height_ft)   parts.push(`<div class="stat"><span>${props.height_ft} ft</span>approx height</div>`);
    if (props.floors)      parts.push(`<div class="stat"><span>${props.floors}</span>floors</div>`);
    return parts.length
      ? `<div class="drawer-section"><div class="drawer-label">Approximate Scale</div><div class="drawer-stats-grid">${parts.join('')}</div></div>`
      : '';
  })();

  const linksHtml = (() => {
    const parts = [];
    if (props.deep_dive_url)     parts.push(`<a href="${props.deep_dive_url}" target="_blank" rel="noopener" class="drawer-btn drawer-btn-primary">Deep Dive →</a>`);
    if (props.primary_source_url) parts.push(`<a href="${props.primary_source_url}" target="_blank" rel="noopener" class="drawer-btn">Primary Source →</a>`);
    return parts.join('');
  })();

  drawer.innerHTML = `
    <div class="drawer-header" style="background:${color}">
      <button class="drawer-close" onclick="closeDrawer()" title="Close">✕</button>
      <div class="drawer-status-badge" style="outline:1px solid rgba(255,255,255,0.35)">${props.status}</div>
      <h2 class="drawer-title">${props.name}</h2>
      <div class="drawer-meta">${props.project_type}</div>
    </div>
    <div class="drawer-body">
      <div class="drawer-section">
        <div class="drawer-label">3D Massing Block</div>
        <p style="font-size:0.8rem;color:#555;font-style:italic">This block shows the approximate physical scale of the proposed project. It is not an architectural rendering.</p>
      </div>
      ${statsHtml}
      <div class="drawer-section">
        <div class="drawer-label">Source Confidence</div>
        <div class="confidence-badge ${confClass}">${props.source_confidence || 'Unknown'}</div>
        ${props.source_note ? `<p style="font-size:0.72rem;color:#6b7280;margin-top:6px">${props.source_note}</p>` : ''}
      </div>
      ${linksHtml ? `<div class="drawer-links">${linksHtml}</div>` : ''}
      <div class="drawer-footer">Last updated: ${props.last_updated || '—'}</div>
    </div>
  `;

  activeProject = { id: props.project_id };
  drawer.classList.add('open');
}

// ─── Preset buttons ──────────────────────────────────────────────────────────
function buildPresetButtons() {
  const container = document.getElementById('preset-buttons');
  PRESET_VIEWS.forEach((view, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = view.label;
    btn.addEventListener('click', () => {
      map.flyTo({ center: view.center, zoom: view.zoom, speed: 0.9 });
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    container.appendChild(btn);
  });
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function buildLegend() {
  const container = document.getElementById('legend-items');
  const entries = [
    ['Proposed',              STATUS_COLORS['Proposed'],             ''],
    ['Under Review',          STATUS_COLORS['Under Review'],         ''],
    ['Approved',              STATUS_COLORS['Approved'],             ''],
    ['Litigation',            STATUS_COLORS['Litigation'],           ''],
    ['Public Infrastructure', STATUS_COLORS['Public Infrastructure'],''],
    ['Built / Historical',    STATUS_COLORS['Built'],                ''],
  ];
  entries.forEach(([label, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${color}"></div><span>${label}</span>`;
    container.appendChild(item);
  });

  // Massing legend (hidden until toggle is on)
  const massingSection = document.getElementById('massing-legend-section');
  if (massingSection) {
    const massingEntries = [
      ['Proposed / Under Review', '#d95f02'],
      ['Approved (not yet built)', '#2f7a5f'],
      ['Public / Civic',          '#376980'],
      ['Disputed',                '#6b4f87'],
    ];
    massingEntries.forEach(([label, color]) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<div class="legend-block" style="background:${color}"></div><span>${label}</span>`;
      massingSection.appendChild(item);
    });
  }
}

// ─── Filter & render ─────────────────────────────────────────────────────────
function applyFilters() {
  filteredProjects = allProjects.filter(p => {
    if (activeFilters.search) {
      const haystack = [
        p.name, p.shortName, p.location, p.keyQuestion || '',
        ...p.projectType, p.communityArea, p.jurisdiction,
        p.decisionBody || '', p.whyItMatters || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(activeFilters.search)) return false;
    }
    return true;
  });

  renderProjectList();
  renderMarkers();
  updateMassingFilter();
}

// The two massing layers have static filters that partition the source
// by `flatten` flag (terrain-aligned vs. flat-aligned). When we layer an
// additional filter (e.g. project_id), it has to be combined with the
// static one or the partition is lost and Carhenge would render in both
// layers.
const FLAT_FILTER     = ['==', ['coalesce', ['get', 'flatten'], false], true];
const TERRAIN_FILTER  = ['!=', ['coalesce', ['get', 'flatten'], false], true];
function setMassingFilters(extra) {
  if (extra) {
    map.setFilter('proposed-massing-layer',      ['all', TERRAIN_FILTER, extra]);
    map.setFilter('proposed-massing-flat-layer', ['all', FLAT_FILTER,    extra]);
  } else {
    map.setFilter('proposed-massing-layer',      TERRAIN_FILTER);
    map.setFilter('proposed-massing-flat-layer', FLAT_FILTER);
  }
}

// Update massing layer to match visible project IDs
function updateMassingFilter() {
  if (!massingLoaded) return;
  const visibleIds = filteredProjects.map(p => p.id);
  const hasActiveFilter = !!activeFilters.search;
  if (hasActiveFilter) {
    setMassingFilters(['in', ['get', 'project_id'], ['literal', visibleIds]]);
  } else {
    setMassingFilters(null); // show all
  }
}

// ─── Project list ─────────────────────────────────────────────────────────────
function renderProjectList() {
  const list = document.getElementById('project-list');
  list.innerHTML = '';

  if (filteredProjects.length === 0) {
    list.innerHTML = '<div class="no-results">No projects match your filters.</div>';
    return;
  }

  filteredProjects.forEach(p => {
    const item  = document.createElement('div');
    item.className = 'project-item' + (activeProject?.id === p.id ? ' active' : '');

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.style.background = STATUS_COLORS[p.status] || '#6b7280';

    const text = document.createElement('div');
    text.className = 'project-item-text';
    text.innerHTML = `<strong>${p.name}</strong><span>${p.communityArea} · ${p.status}</span>`;

    item.appendChild(dot);
    item.appendChild(text);
    item.addEventListener('click', () => openDrawer(p));
    list.appendChild(item);
  });
}

// ─── Map markers ─────────────────────────────────────────────────────────────
function renderMarkers() {
  markers.forEach(({ mapMarker }) => mapMarker.remove());
  markers = [];

  filteredProjects.forEach(p => {
    const color = STATUS_COLORS[p.status] || '#6b7280';
    const el    = document.createElement('div');
    el.className = 'map-marker' + (activeProject?.id === p.id ? ' active-marker' : '');
    el.style.background = color;
    el.title = p.name;

    const mapMarker = new mapboxgl.Marker({ element: el })
      .setLngLat([p.longitude, p.latitude])
      .addTo(map);

    el.addEventListener('click', e => {
      e.stopPropagation();
      openDrawer(p);
    });

    markers.push({ mapMarker, el, project: p });
  });
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function openDrawer(project) {
  activeProject = project;
  const color = STATUS_COLORS[project.status] || '#6b7280';

  // Update marker classes
  markers.forEach(({ el, project: p }) => {
    el.classList.toggle('active-marker', p.id === project.id);
  });

  // Fly to location and show 3D massing for this project.
  // Per-project overrides on projects.json let individual sites pick
  // a better camera angle when the default NE-leaning view is blocked
  // by a hillside or otherwise awkward (e.g. Carhenge faces a steep
  // south-side ridge; looking west reads better).
  const camTarget = {
    center:  [project.longitude, project.latitude],
    zoom:    project.cameraZoom    || 17,
    pitch:   project.cameraPitch   || 60,
    bearing: project.cameraBearing != null ? project.cameraBearing : -22,
  };
  map.easeTo({ ...camTarget, duration: 1200 });
  // Terrain DEM tiles for hillside projects often aren't loaded when the
  // first easeTo kicks off, leaving the camera one click short of the
  // intended pitch/zoom on the slope. Re-apply the target once the
  // animation lands — by then the terrain tile is in and the second snap
  // settles onto the correct elevation in a single sidebar click.
  map.once('moveend', () => {
    map.easeTo({ ...camTarget, duration: 250 });
  });
  if (massingLoaded) {
    map.setLayoutProperty('proposed-massing-layer',      'visibility', 'visible');
    map.setLayoutProperty('proposed-massing-flat-layer', 'visibility', 'visible');
    map.setLayoutProperty('existing-buildings-3d',       'visibility', 'visible');
    setMassingFilters(['==', ['get', 'project_id'], project.id]);
    const toggle = document.getElementById('toggleMassing');
    if (toggle) toggle.checked = true;
    const disclaimer = document.getElementById('massing-disclaimer');
    if (disclaimer) disclaimer.style.display = 'block';
    const massingLegend = document.getElementById('massing-legend-section');
    if (massingLegend) massingLegend.style.display = 'block';
  }

  const drawer = document.getElementById('drawer');

  const statsHtml = (() => {
    const parts = [];
    if (project.squareFootage)     parts.push(`<div class="stat"><span>${(project.squareFootage/1000).toFixed(0)}K</span>sq ft</div>`);
    if (project.hotelRooms)        parts.push(`<div class="stat"><span>${project.hotelRooms}</span>hotel rooms</div>`);
    if (project.housingUnits)      parts.push(`<div class="stat"><span>${project.housingUnits}</span>units</div>`);
    if (project.estimatedEmployees)parts.push(`<div class="stat"><span>${project.estimatedEmployees.toLocaleString()}</span>employees</div>`);
    if (project.publicDebtSubsidy) parts.push(`<div class="stat"><span>$${(project.publicDebtSubsidy/1e6).toFixed(1)}M</span>public debt</div>`);
    if (project.parkingSpaces)     parts.push(`<div class="stat"><span>${project.parkingSpaces.toLocaleString()}</span>parking spaces</div>`);
    if (project.estimatedTotalCost) parts.push(`<div class="stat"><span>$${(project.estimatedTotalCost/1e6).toFixed(1)}M</span>est. total cost</div>`);
    if (project.estimatedCostPerUnit) parts.push(`<div class="stat"><span>$${(project.estimatedCostPerUnit/1000).toFixed(0)}K</span>est. cost/unit</div>`);
    return parts.length ? `<div class="drawer-section"><div class="drawer-label">Key Numbers</div><div class="drawer-stats-grid">${parts.join('')}</div></div>` : '';
  })();

  const datesHtml = (() => {
    const parts = [];
    if (project.nextMeetingDate) {
      const label = project.nextMeetingType || 'Next Meeting';
      const timeStr = project.nextMeetingTime ? ` &nbsp;·&nbsp; ${project.nextMeetingTime}` : '';
      parts.push(`<div class="drawer-label">${label}</div><p class="drawer-date">${project.nextMeetingDate}${timeStr}</p>`);
    }
    if (project.publicCommentDeadline) parts.push(`<div class="drawer-label" style="margin-top:6px">Comment Deadline</div><p class="drawer-date">${project.publicCommentDeadline}</p>`);
    return parts.length ? `<div class="drawer-section">${parts.join('')}</div>` : '';
  })();

  const upcomingHearingsHtml = (() => {
    if (!Array.isArray(project.upcomingHearings) || !project.upcomingHearings.length) return '';
    const cards = project.upcomingHearings.map(h => {
      const d = new Date(h.date + 'T12:00:00');
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const links = [];
      if (h.agendaUrl)   links.push(`<a href="${h.agendaUrl}" target="_blank" rel="noopener" class="hearing-link">Full Agenda →</a>`);
      if (h.zoomUrl)     links.push(`<a href="${h.zoomUrl}" target="_blank" rel="noopener" class="hearing-link">Join Zoom →</a>`);
      if (h.calendarUrl) links.push(`<a href="${h.calendarUrl}" target="_blank" rel="noopener" class="hearing-link">Add to Calendar</a>`);
      return `<div class="hearing-card">
        <div class="hearing-type">${h.type}</div>
        <div class="hearing-date">${dateStr} · ${h.time}</div>
        ${h.description ? `<div class="hearing-desc">${h.description}</div>` : ''}
        ${links.length ? `<div class="hearing-links">${links.join('')}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="drawer-section"><div class="drawer-label hearing-alert-label">⚠ Upcoming Hearing</div>${cards}</div>`;
  })();

  const documentsHtml = (() => {
    if (!Array.isArray(project.documents) || !project.documents.length) return '';
    const btns = project.documents.map((doc, i) =>
      `<a href="${doc.url}" target="_blank" rel="noopener" class="drawer-btn ${i === 0 ? 'drawer-btn-download' : ''}">
        ⬇ ${doc.title}${doc.size ? ' (' + doc.size + ')' : ''}
      </a>`
    ).join('');
    return `<div class="drawer-section"><div class="drawer-label">Project Documents</div><div class="drawer-links" style="margin-top:6px">${btns}</div></div>`;
  })();

  const confClass = 'confidence-' + (project.sourceConfidence || 'Unknown').toLowerCase().replace(/[^a-z]/g, '-');

  const linksHtml = (() => {
    const parts = [];
    if (project.deepDiveUrl)     parts.push(`<a href="${project.deepDiveUrl}" target="_blank" rel="noopener" class="drawer-btn drawer-btn-primary">Deep Dive →</a>`);
    if (project.primarySourceUrl) parts.push(`<a href="${project.primarySourceUrl}" target="_blank" rel="noopener" class="drawer-btn">Primary Source →</a>`);
    const subject = encodeURIComponent(`Correction or addition: ${project.name}`);
    const body    = encodeURIComponent(`Project: ${project.name}\n\nMy correction or missing detail:\n`);
    parts.push(`<a href="mailto:info@livabletelluride.org?subject=${subject}&body=${body}" class="drawer-btn drawer-btn-subtle">Submit Correction / Addition</a>`);
    return parts.join('');
  })();

  drawer.innerHTML = `
    <div class="drawer-toggle-bar" onclick="toggleDrawerHeight()" title="Tap to expand or collapse"></div>
    <div class="drawer-header">
      <button class="drawer-close" onclick="closeDrawer()" title="Close">✕</button>
      <div class="drawer-status-badge" style="outline:1px solid rgba(255,255,255,0.35)">${project.status}</div>
      <h2 class="drawer-title">${project.name}</h2>
      <div class="drawer-meta">${project.projectType.join(' · ')} &nbsp;·&nbsp; ${project.communityArea}</div>
    </div>
    <div class="drawer-body">
      ${project.publiclyFunded ? `
        <a class="drawer-btn drawer-btn-primary drawer-cost-tracker-btn"
           href="cost-tracker.html${project.costTrackerKey ? '?project=' + encodeURIComponent(project.costTrackerKey) : ''}"
           target="_blank" rel="noopener"
           style="display:flex;align-items:center;justify-content:center;gap:8px;background:#b98b34;color:#fff;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;font-size:0.78rem;padding:14px 16px;border-radius:12px;margin-bottom:14px;text-decoration:none;box-shadow:0 4px 14px rgba(185,139,52,0.32);">
          📊 Cost &amp; Debt Tracker →
        </a>` : ''}
      ${project.estimatedTotalCost ? `
        <div class="drawer-section drawer-cost-banner">
          <div class="drawer-label">Estimated Project Cost</div>
          <div style="font-size:1.75rem;font-weight:800;color:#111;line-height:1.1;margin-top:2px">$${(project.estimatedTotalCost/1e6).toFixed(1)}M</div>
          ${project.estimatedCostPerUnit ? `<div style="font-size:0.95rem;font-weight:600;color:#374151;margin-top:3px">$${(project.estimatedCostPerUnit/1000).toFixed(0)}K per unit</div>` : ''}
          ${project.costNote ? `<div style="font-size:0.7rem;color:#9ca3af;margin-top:5px;font-style:italic;line-height:1.4">${project.costNote}</div>` : ''}
        </div>` : ''}
      ${project.keyQuestion ? `
        <div class="drawer-section">
          <div class="drawer-label">Key Question</div>
          <p class="drawer-key-question">${project.keyQuestion}</p>
        </div>` : ''}
      ${project.whyItMatters ? `
        <div class="drawer-section">
          <div class="drawer-label">Why It Matters</div>
          <p>${project.whyItMatters}</p>
        </div>` : ''}
      ${statsHtml}
      <div class="drawer-section">
        <div class="drawer-label">Jurisdiction</div>
        <p style="margin-bottom:4px">${project.jurisdiction}</p>
        <div class="drawer-label">Decision Body</div>
        <p>${project.decisionBody}</p>
      </div>
      ${datesHtml}
      ${upcomingHearingsHtml}
      ${documentsHtml}
      <div class="drawer-section">
        <div class="drawer-label">Source Confidence</div>
        <div class="confidence-badge ${confClass}">${project.sourceConfidence || 'Unknown'}</div>
        ${project.costNote ? `<div class="drawer-label" style="margin-top:8px">Cost Note</div><p style="font-size:0.72rem;color:#6b7280">${project.costNote}</p>` : ''}
        <div class="drawer-label" style="margin-top:6px">Editorial Status</div>
        <p style="font-size:0.72rem;color:#6b7280">${project.editorialStatus || 'Needs Review'}</p>
      </div>
      <div class="drawer-links">${linksHtml}</div>
      <div class="drawer-footer">Last updated: ${project.lastUpdated}</div>
    </div>
  `;

  drawer.classList.add('open');
  renderProjectList(); // update active state in list
}

function closeDrawer() {
  activeProject = null;
  document.getElementById('drawer').classList.remove('open');
  markers.forEach(({ el }) => el.classList.remove('active-marker'));
  renderProjectList();

  // Return to flat view, hide massing, restore full filter
  map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  if (massingLoaded) {
    map.setLayoutProperty('proposed-massing-layer',      'visibility', 'none');
    map.setLayoutProperty('proposed-massing-flat-layer', 'visibility', 'none');
    map.setLayoutProperty('existing-buildings-3d',       'visibility', 'none');
    setMassingFilters(null);
    const toggle = document.getElementById('toggleMassing');
    if (toggle) toggle.checked = false;
    const disclaimer = document.getElementById('massing-disclaimer');
    if (disclaimer) disclaimer.style.display = 'none';
    const massingLegend = document.getElementById('massing-legend-section');
    if (massingLegend) massingLegend.style.display = 'none';
  }
}

// Expose for inline handlers
window.closeDrawer = closeDrawer;

// ─── Mobile bottom-sheet drawer height toggle ────────────────────────────────
// Cycles: default (~55% screen) → expanded (full) → collapsed (peek) → default.
// Only relevant on mobile (≤860px); on desktop the .expanded / .collapsed
// classes are no-ops since the drawer's CSS isn't bottom-sheet there.
function toggleDrawerHeight() {
  const d = document.getElementById('drawer');
  if (!d) return;
  if (d.classList.contains('expanded')) {
    d.classList.remove('expanded');
    d.classList.add('collapsed');
  } else if (d.classList.contains('collapsed')) {
    d.classList.remove('collapsed');
    // → default state (no class)
  } else {
    d.classList.add('expanded');
  }
}
window.toggleDrawerHeight = toggleDrawerHeight;

// ─── Mobile left-panel drawer toggle ──────────────────────────────────────────
function initMobilePanelToggle() {
  const toggle   = document.getElementById('mobile-filter-toggle');
  const closeBtn = document.getElementById('mobile-panel-close');
  const backdrop = document.getElementById('mobile-panel-backdrop');
  const panel    = document.getElementById('left-panel');
  if (!toggle || !closeBtn || !backdrop || !panel) return;

  function open() {
    panel.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('left-panel-open');
    toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('left-panel-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  // Tapping a project in the list closes the panel so the user sees the map
  panel.addEventListener('click', function(e) {
    const item = e.target.closest('.project-item');
    if (item) close();
  });
  // Esc closes the panel
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
// app.js is injected via a dynamically-appended <script> (async) near the end
// of index.html, so DOMContentLoaded has usually ALREADY fired by the time this
// runs — a plain addEventListener('DOMContentLoaded', …) would then never fire
// and the map/list would never initialize. Guard on readyState so we run
// immediately if the DOM is already parsed, and wait only if it genuinely isn't.
function startProjectsMap() {
  init();
  initMobilePanelToggle();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startProjectsMap);
} else {
  startProjectsMap();
}
