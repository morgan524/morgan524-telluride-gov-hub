#!/usr/bin/env node
// Re-derive the parcels source for the Mapbox tileset from the v18 export
// (the canonical data with computed fields), strip LEGAL, round coords, and tag
// `high_country:"True"` for parcels whose centroid falls in the HIGH COUNTRY
// AREA zoning district — so the vacant/buildable style filters can exclude them.
// Output: <outDir>/parcel.json  (ready for upload-tilesets.js)

const fs = require('fs');
const path = require('path');

const GIS = '/Volumes/External/Dropbox (Personal)/Claude/Projects/Livable-Telluride2/assets/GIS Data';
const V18 = '/Users/morgansmith/Downloads/Livable-Telluride-Map-v18.html';
const ZON = GIS + '/SanMiguelZoning_-3786858185677232847.geojson';
const IMP = GIS + '/Improvements.geojson';
const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

// ── Assessor Improvements table (keyed by ACCOUNTNO) → per-parcel structure
// classification. This is the authoritative "what is built here" record, far
// better than the imagery footprint flag: it distinguishes homes/commercial
// from barns/sheds, and correctly treats condo units as developed. ──
const impByAcct = {};
for (const f of JSON.parse(fs.readFileSync(IMP, 'utf8')).features) {
  const p = f.properties || {};
  (impByAcct[p.ACCOUNTNO] = impByAcct[p.ACCOUNTNO] || []).push(p);
}
// An improvement is an OUTBUILDING (not a dwelling/commercial building) by its
// build description (PROPERTYTYPE is mostly the parcel's tax class, so the
// structure type lives in BLTASDESCRIPTION).
const OUT_BLT = /barn|shed|equipment|farm util|corral|stable|greenhouse|hangar|hanger|detached garage|pole build|loafing|\bhay\b|granary|silo|utility build|out ?building/i;
const isOutbuilding = p => ['Out Building', 'Parking'].includes(String(p.PROPERTYTYPE)) || OUT_BLT.test(String(p.BLTASDESCRIPTION || ''));
// A residential (dwelling) improvement, per the assessor PROPERTYTYPE. Everything
// else — Commercial, Out Building, Parking — is not a residence.
const RESIDENTIAL_PROPTYPES = new Set(['Residential', 'Condo', 'Duplex', 'DR ADU', 'Multiple Unit', 'Townhouse', 'Mobile Home']);
const hasResidential = imps => imps.some(p => RESIDENTIAL_PROPTYPES.has(String(p.PROPERTYTYPE)));
function structureInfo(acct) {
  const imps = impByAcct[acct] || [];
  // `no_residential` = no identifiable residential structure (vacant land,
  // outbuilding-only, or commercial-only). Drives the Vacant Lots view.
  if (!imps.length) return { structure_class: 'vacant', no_residential: 'True' };
  const cls = imps.every(isOutbuilding) ? 'outbuilding' : 'developed';
  const main = imps.slice().sort((a, b) => (b.IMPSF || 0) - (a.IMPSF || 0))[0];  // biggest structure
  const totalSf = imps.reduce((t, x) => t + (Number(x.IMPSF) || 0), 0);
  const info = { structure_class: cls, imp_count: String(imps.length) };
  if (!hasResidential(imps)) info.no_residential = 'True';
  if (main.BLTASDESCRIPTION) info.imp_desc = String(main.BLTASDESCRIPTION);
  if (main.PROPERTYTYPE) info.imp_type = String(main.PROPERTYTYPE);
  if (totalSf) info.imp_sqft = String(Math.round(totalSf));
  if (main.ADJUSTEDYEARBUILT) info.imp_year = String(main.ADJUSTEDYEARBUILT);
  if (Number(main.BEDROOMCOUNT) > 0) info.imp_bd = String(main.BEDROOMCOUNT);
  if (Number(main.BATHCOUNT) > 0) info.imp_ba = String(main.BATHCOUNT);
  return info;
}

// ── extract `const parcelData = {...};` from v18 via brace matching ──
const raw = fs.readFileSync(V18, 'utf8');
function matchObject(str, open) {
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < str.length; i++) {
    const c = str[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('unbalanced');
}
const decl = raw.indexOf('const parcelData = {');
const open = raw.indexOf('{', decl);
const parcelData = JSON.parse(raw.slice(open, matchObject(raw, open)));
console.log('parcels from v18:', parcelData.features.length);

// ── HIGH COUNTRY AREA zoning rings ──
const zon = JSON.parse(fs.readFileSync(ZON, 'utf8'));
function ringsOf(g) { const o = []; if (!g) return o; if (g.type === 'Polygon') o.push(...g.coordinates); else if (g.type === 'MultiPolygon') for (const p of g.coordinates) o.push(...p); return o; }
const hcRings = [], osRings = [], airRings = [];
// Zones that are public/protected land, never vacant/developable housing sites.
// PARK is included so town/county parks drop out of the Vacant + Developable views
// (they share the open_space exclusion). OSCE parcels whose centroid lands in a PARK
// polygon are covered here too.
const OPEN_SPACE_ZONES = new Set(['OPEN SPACE', 'OPEN SPACE CONSERVATION EASEMENT', 'PARK']);
for (const f of zon.features) {
  const props = f.properties || {};
  const z = String(props.ZONING || '');
  if (z === 'HIGH COUNTRY AREA') hcRings.push(...ringsOf(f.geometry));
  else if (OPEN_SPACE_ZONES.has(z)) osRings.push(...ringsOf(f.geometry));
  // Airport height restriction is a NOTES_USE annotation on certain zoning
  // polygons (independent of the base ZONING value). Applied by OVERLAP, not
  // centroid — the note says "MAY BE SUBJECT" and parcels straddle the edge.
  if (/airport height restriction/i.test(String(props.NOTES_USE || ''))) airRings.push(...ringsOf(f.geometry));
}
function ptInRing(x, y, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function centroid(g) { const rs = ringsOf(g); if (!rs.length) return null; const r = rs[0]; let xs = 0, ys = 0, n = 0; for (const c of r) { xs += c[0]; ys += c[1]; n++; } return n ? [xs / n, ys / n] : null; }
function ringBbox(rings) { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (const c of r) { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } return b; }
function bboxOverlap(a, b) { return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]); }
const airBbox = ringBbox(airRings);
// A parcel is airport-restricted if it OVERLAPS any airport-restriction ring:
// any parcel vertex inside an airport ring, or any airport vertex inside a
// parcel ring (hole-free polygons). Gated by a bbox pre-filter for speed.
function airportOverlap(pRings) {
  if (!bboxOverlap(ringBbox(pRings), airBbox)) return false;
  for (const pr of pRings) for (const c of pr) if (airRings.some(ar => ptInRing(c[0], c[1], ar))) return true;
  for (const ar of airRings) for (const c of ar) if (pRings.some(pr => ptInRing(c[0], c[1], pr))) return true;
  return false;
}

// ── Developable-land division-potential inputs ──
// Min lot size (acres) per future-land-use / zoning category, as a [lo, hi]
// range (the plan densities are ranges). Additional lots = floor(acres/minlot)
// − current units. Non-residential FLU categories = null (no home-lot split).
const FLU_MINLOT = {
  'Residential Low': [7, 35],
  'Residential Medium': [1, 7],
  'Residential High/Mixed Use': [0.25, 1],
  'Conservation and Large Lots': [35, 35],
  'Wrights Mesa Town Residential': [1 / 12, 1 / 6],
  'Wrights Mesa Rural/Agricultural': [17.5, 35],
  'Commercial/Industrial': null, 'Public/Institutional': null, 'Parks and Open Space': null,
  'Wrights Mesa Light Industrial': null, 'Public': null,
};
// Fallback by current zoning where a parcel is outside both plan areas.
const ZONING_MINLOT = {
  'FORESTRY/AGRICULTURE': [35, 35],
  'LOW DENSITY': [2, 2], 'MEDIUM DENSITY': [1, 1],
  'RESIDENTIAL': [0.5, 0.5], 'TELLURIDE RESIDENTIAL': [0.25, 0.25],
  'MOBILE HOME': [0.5, 0.5], 'NORWOOD R1': [0.25, 0.25],
};
const DEFAULT_MINLOT = [35, 35];  // rural baseline (~1 unit / 35 ac) when nothing else known

// ── Manual developable-classification overrides (corrections the automated flags
// miss). FORCE_NOT_DEVELOPABLE: parcels actually in a PUD/entitled area that the
// PUD detection missed. FORCE_DEVELOPABLE: developable parcels wrongly excluded
// (e.g. a conservation-easement or federal-land false positive). ──
const FORCE_NOT_DEVELOPABLE = new Set([
  '456530420167', '456519400011',  // in the Aldasoro PUD (missed by in_pud_or_subdivision)
  '477905400009',
  '456533200030',  // Town of Telluride wastewater treatment plant — public infrastructure
  '456532200006',  // per request (the other four in that request are airport land, already excluded)
]);
const FORCE_DEVELOPABLE = new Set([
  '477920100505', '477917300502', '477920200503', '477920200504', '477917300013',
  // (477920200506 was a typo — not in the county parcel data)
]);
// The Genesee parcels in the Society Turn Business Park PUD determine uses via the
// PUD, so they are not independently developable.
const genseeAtSocietyTurn = p =>
  /GENESEE PROPERTIES/i.test(String(p.NAMEDISPLAY || p.NAME1 || '')) &&
  /SOCIETY TURN/i.test(String(p.SUBNAME || ''));

// Public infrastructure / state conservation land is not a development
// opportunity (airport, special districts, cemetery, CDOT, and all State of
// Colorado / Division of Wildlife / Land Board parcels). MUNICIPAL land — Town
// of *, San Miguel County, Mountain Village — is KEPT (potential housing sites).
const isPublicInfraOwner = (p) => {
  const o = String(p.NAMEDISPLAY || p.NAME1 || '').toUpperCase();
  return /\bAIRPORT\b/.test(o) ||
         /\bCEMETERY\b/.test(o) ||
         /SANITATION/.test(o) ||
         /WATER (DISTRICT|CONSERVANCY|AUTHORITY)/.test(o) ||
         /METRO(POLITAN)? DISTRICT/.test(o) ||
         /FIRE PROTECTION/.test(o) ||
         /STATE OF COLORADO/.test(o) ||       // incl. DOW, Land Board, CDOT, DPW
         /DIVISION OF WILDLIFE/.test(o) ||
         /BOARD OF LAND COMMISSION/.test(o);
};

const DATA = path.join(__dirname, 'data');
const loadFC = p => JSON.parse(fs.readFileSync(p, 'utf8'));

// FLU category rings (labelled) — East End (FLUDesc) + Wright's Mesa (NAME).
const fluCatRings = [];
for (const f of loadFC(path.join(DATA, 'east-end-flu.json')).features) {
  const cat = String((f.properties || {}).FLUDesc || ''); if (cat) fluCatRings.push({ cat, rings: ringsOf(f.geometry) });
}
for (const f of loadFC(path.join(DATA, 'wrights-mesa-flu.json')).features) {
  const cat = String((f.properties || {}).NAME || ''); if (cat) fluCatRings.push({ cat, rings: ringsOf(f.geometry) });
}
function fluCatAt(c) { for (const g of fluCatRings) if (g.rings.some(r => ptInRing(c[0], c[1], r))) return g.cat; return null; }

// Zoning category rings (labelled by ZONING) for the min-lot fallback.
const zoneCatRings = [];
for (const f of zon.features) { const z = String((f.properties || {}).ZONING || ''); if (z) zoneCatRings.push({ cat: z, rings: ringsOf(f.geometry) }); }
function zoneCatAt(c) { for (const g of zoneCatRings) if (g.rings.some(r => ptInRing(c[0], c[1], r))) return g.cat; return null; }

// Conservation easement rings (Land Heritage Program + other easements) = protected.
const easeRings = [];
for (const src of ['LandHeritageProgram.geojson', 'OtherConservationEasements.geojson']) {
  for (const f of loadFC(GIS + '/' + src).features) easeRings.push(...ringsOf(f.geometry));
}

// Named-subdivision rings — the exact polygons drawn on the "Show subdivisions" map
// (data/subdivision.json + Backman Village). A parcel whose centroid falls inside
// one is "in a mapped subdivision" (in_named_subdivision), so the Developable view's
// Hide-subdivisions toggle can mirror that map precisely (incl. the whole Aldasoro
// Ranch subdivision, even though it's also a PUD). Bbox-indexed for speed.
const subRingsBbox = [];
for (const src of ['subdivision.json', 'backman-village-subdivision.json']) {
  for (const f of loadFC(path.join(DATA, src)).features) {
    for (const ring of ringsOf(f.geometry)) subRingsBbox.push({ ring, bb: ringBbox([ring]) });
  }
}
function inNamedSubdivision(c) {
  for (const s of subRingsBbox) {
    if (c[0] < s.bb[0] || c[0] > s.bb[2] || c[1] < s.bb[1] || c[1] > s.bb[3]) continue;
    if (ptInRing(c[0], c[1], s.ring)) return true;
  }
  return false;
}

const round6 = n => Math.round(n * 1e6) / 1e6;
function roundCoords(node) { if (Array.isArray(node)) return node.map(roundCoords); if (node && typeof node === 'object') { const o = {}; for (const k of Object.keys(node)) o[k] = k === 'coordinates' ? roundNums(node[k]) : roundCoords(node[k]); return o; } return node; }
function roundNums(n) { return Array.isArray(n) ? n.map(roundNums) : (typeof n === 'number' ? round6(n) : n); }

let taggedHc = 0, taggedOs = 0, taggedAir = 0, taggedEase = 0, taggedDev = 0, taggedSub = 0;
const clsCount = { vacant: 0, outbuilding: 0, developed: 0 };
for (const f of parcelData.features) {
  if (f.properties) delete f.properties.LEGAL;
  const c = centroid(f.geometry);
  if (!c) continue;
  f.properties = f.properties || {};
  if (hcRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.high_country = 'True'; taggedHc++; }
  // In a mapped subdivision polygon (drives the Developable Hide-subdivisions toggle).
  if (inNamedSubdivision(c)) { f.properties.in_named_subdivision = 'True'; taggedSub++; }
  // OPEN SPACE / OPEN SPACE CONSERVATION EASEMENT zoning = protected, not developable
  if (osRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.open_space = 'True'; taggedOs++; }
  // Airport height restriction — parcel OVERLAP (not centroid), shown in the popup
  if (airportOverlap(ringsOf(f.geometry))) { f.properties.airport_restriction = 'True'; taggedAir++; }
  // Assessor structure classification + popup details (join by ACCOUNTNO)
  const si = structureInfo(String(f.properties.ACCOUNTNO || ''));
  Object.assign(f.properties, si);
  clsCount[si.structure_class] = (clsCount[si.structure_class] || 0) + 1;

  // Conservation easement (protected, not developable)
  if (easeRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.conservation_easement = 'True'; taggedEase++; }

  // ── Maximum-development estimate ──
  // The land could be sold for maximum development regardless of any existing
  // structure, so this is the TOTAL lots the parcel could support (not "additional
  // beyond what's there"): max(1, floor(net acres / min lot)). Min lot from the
  // future-land-use category (plan), else current zoning, else a rural default.
  // Range because plan densities are ranges.
  const flu = fluCatAt(c);
  const zcat = zoneCatAt(c);
  const cat = flu || zcat;
  const ml = (flu && FLU_MINLOT[flu]) || (zcat && ZONING_MINLOT[zcat]) || DEFAULT_MINLOT;
  if (cat) f.properties.dev_cat = cat;
  f.properties.cur_units = si.structure_class === 'developed' ? 1 : 0;
  const acres = Number(f.properties.NETACRES) || 0;
  f.properties.min_lot_lo = round6(ml[0]); f.properties.min_lot_hi = round6(ml[1]);
  f.properties.dev_lots_hi = Math.max(1, Math.floor(acres / ml[0]));  // smaller lot → more lots
  f.properties.dev_lots_lo = Math.max(1, Math.floor(acres / ml[1]));  // larger lot → fewer

  // Developable = land NOT in conservation / forest / BLM / PUD / subdivision.
  // An existing structure is IRRELEVANT — the owner could sell it for maximum
  // development regardless. So there is NO current-structure or lot-count gate
  // (every non-excluded parcel supports at least 1 lot). Airport-restricted
  // parcels stay IN (a height limit caps scale, doesn't prohibit). High-country
  // alpine terrain is unbuildable, so it stays excluded.
  const pin = String(f.properties.PIN || '').toLowerCase();
  const rawPin = String(f.properties.PIN || '');
  let developable =
    f.properties.in_pud_or_subdivision !== 'True' &&           // not in a PUD or subdivision
    String(f.properties.federal_forest_public_land) !== 'True' && // not Forest Service / BLM
    f.properties.conservation_easement !== 'True' &&           // not a conservation easement
    f.properties.open_space !== 'True' &&                      // not open-space/conservation zoning
    f.properties.high_country !== 'True' &&                    // not unbuildable alpine terrain
    pin !== 'row' && !pin.includes('open space') && !pin.includes('common');
  // Manual corrections (owner/PIN cases the automated flags miss).
  if (FORCE_NOT_DEVELOPABLE.has(rawPin) || genseeAtSocietyTurn(f.properties) || isPublicInfraOwner(f.properties)) developable = false;
  if (FORCE_DEVELOPABLE.has(rawPin)) developable = true;
  if (developable) { f.properties.developable = 'True'; taggedDev++; }
}
const rounded = roundCoords(parcelData);
fs.writeFileSync(path.join(outDir, 'parcel.json'), JSON.stringify(rounded));
console.log('tagged high_country:', taggedHc, '| tagged open_space:', taggedOs, '| tagged airport_restriction:', taggedAir, '| tagged in_named_subdivision:', taggedSub);
console.log('tagged conservation_easement:', taggedEase, '| tagged developable:', taggedDev);
console.log('structure_class:', JSON.stringify(clsCount));
console.log('wrote', path.join(outDir, 'parcel.json'), (fs.statSync(path.join(outDir, 'parcel.json')).size / 1e6).toFixed(1) + 'MB');
