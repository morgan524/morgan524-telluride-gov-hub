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
function structureInfo(acct) {
  const imps = impByAcct[acct] || [];
  if (!imps.length) return { structure_class: 'vacant' };
  const cls = imps.every(isOutbuilding) ? 'outbuilding' : 'developed';
  const main = imps.slice().sort((a, b) => (b.IMPSF || 0) - (a.IMPSF || 0))[0];  // biggest structure
  const totalSf = imps.reduce((t, x) => t + (Number(x.IMPSF) || 0), 0);
  const info = { structure_class: cls, imp_count: String(imps.length) };
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
const OPEN_SPACE_ZONES = new Set(['OPEN SPACE', 'OPEN SPACE CONSERVATION EASEMENT']);
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

const round6 = n => Math.round(n * 1e6) / 1e6;
function roundCoords(node) { if (Array.isArray(node)) return node.map(roundCoords); if (node && typeof node === 'object') { const o = {}; for (const k of Object.keys(node)) o[k] = k === 'coordinates' ? roundNums(node[k]) : roundCoords(node[k]); return o; } return node; }
function roundNums(n) { return Array.isArray(n) ? n.map(roundNums) : (typeof n === 'number' ? round6(n) : n); }

let taggedHc = 0, taggedOs = 0, taggedAir = 0;
const clsCount = { vacant: 0, outbuilding: 0, developed: 0 };
for (const f of parcelData.features) {
  if (f.properties) delete f.properties.LEGAL;
  const c = centroid(f.geometry);
  if (!c) continue;
  f.properties = f.properties || {};
  if (hcRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.high_country = 'True'; taggedHc++; }
  // OPEN SPACE / OPEN SPACE CONSERVATION EASEMENT zoning = protected, not developable
  if (osRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.open_space = 'True'; taggedOs++; }
  // Airport height restriction — parcel OVERLAP (not centroid), shown in the popup
  if (airportOverlap(ringsOf(f.geometry))) { f.properties.airport_restriction = 'True'; taggedAir++; }
  // Assessor structure classification + popup details (join by ACCOUNTNO)
  const si = structureInfo(String(f.properties.ACCOUNTNO || ''));
  Object.assign(f.properties, si);
  clsCount[si.structure_class] = (clsCount[si.structure_class] || 0) + 1;
}
const rounded = roundCoords(parcelData);
fs.writeFileSync(path.join(outDir, 'parcel.json'), JSON.stringify(rounded));
console.log('tagged high_country:', taggedHc, '| tagged open_space:', taggedOs, '| tagged airport_restriction:', taggedAir);
console.log('structure_class:', JSON.stringify(clsCount));
console.log('wrote', path.join(outDir, 'parcel.json'), (fs.statSync(path.join(outDir, 'parcel.json')).size / 1e6).toFixed(1) + 'MB');
