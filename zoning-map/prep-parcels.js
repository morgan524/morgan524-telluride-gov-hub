#!/usr/bin/env node
// Re-derive the parcels source for the Mapbox tileset from the v18 export
// (the canonical data with computed fields), strip LEGAL, round coords, and tag
// `high_country:"True"` for parcels whose centroid falls in the HIGH COUNTRY
// AREA zoning district — so the vacant/buildable style filters can exclude them.
// Output: <outDir>/parcel.json  (ready for upload-tilesets.js)

const fs = require('fs');
const path = require('path');

const V18 = '/Users/morgansmith/Downloads/Livable-Telluride-Map-v18.html';
const ZON = '/Volumes/External/Dropbox (Personal)/Claude/Projects/Livable-Telluride2/assets/GIS Data/SanMiguelZoning_-3786858185677232847.geojson';
const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

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
const hcRings = [], osRings = [];
const OPEN_SPACE_ZONES = new Set(['OPEN SPACE', 'OPEN SPACE CONSERVATION EASEMENT']);
for (const f of zon.features) {
  const z = String((f.properties || {}).ZONING || '');
  if (z === 'HIGH COUNTRY AREA') hcRings.push(...ringsOf(f.geometry));
  else if (OPEN_SPACE_ZONES.has(z)) osRings.push(...ringsOf(f.geometry));
}
function ptInRing(x, y, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function centroid(g) { const rs = ringsOf(g); if (!rs.length) return null; const r = rs[0]; let xs = 0, ys = 0, n = 0; for (const c of r) { xs += c[0]; ys += c[1]; n++; } return n ? [xs / n, ys / n] : null; }

const round6 = n => Math.round(n * 1e6) / 1e6;
function roundCoords(node) { if (Array.isArray(node)) return node.map(roundCoords); if (node && typeof node === 'object') { const o = {}; for (const k of Object.keys(node)) o[k] = k === 'coordinates' ? roundNums(node[k]) : roundCoords(node[k]); return o; } return node; }
function roundNums(n) { return Array.isArray(n) ? n.map(roundNums) : (typeof n === 'number' ? round6(n) : n); }

let taggedHc = 0, taggedOs = 0;
for (const f of parcelData.features) {
  if (f.properties) delete f.properties.LEGAL;
  const c = centroid(f.geometry);
  if (!c) continue;
  f.properties = f.properties || {};
  if (hcRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.high_country = 'True'; taggedHc++; }
  // OPEN SPACE / OPEN SPACE CONSERVATION EASEMENT zoning = protected, not developable
  if (osRings.some(r => ptInRing(c[0], c[1], r))) { f.properties.open_space = 'True'; taggedOs++; }
}
const rounded = roundCoords(parcelData);
fs.writeFileSync(path.join(outDir, 'parcel.json'), JSON.stringify(rounded));
console.log('tagged high_country:', taggedHc, '| tagged open_space:', taggedOs);
console.log('wrote', path.join(outDir, 'parcel.json'), (fs.statSync(path.join(outDir, 'parcel.json')).size / 1e6).toFixed(1) + 'MB');
