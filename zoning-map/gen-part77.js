#!/usr/bin/env node
// Generate FAA Part 77 imaginary-surface polygons for Telluride Regional
// Airport (KTEX) from published runway geometry + the 2016 Part 77 sheet.
// Output: zoning-map/data/part77-surfaces.json (a GeoJSON FeatureCollection).
//
// Surfaces (14 CFR 77.19, "runway larger than utility, non-precision
// instrument approach, vis min > 3/4 mile" — the case that yields the
// 9,220 / 9,420 ft MSL ceilings shown on the master-plan sheet):
//   horizontal  radius 10,000 ft, ceiling 9,220 ft MSL (150' above field)
//   conical     +4,000 ft outward, ceiling rises 9,220 -> 9,420 ft MSL
//   approach    inner 500 ft / outer 3,500 ft / length 10,000 ft, 34:1
//   primary     500 ft wide, +200 ft past each runway end
// All derived/approximate — advisory only.

const fs = require('fs');
const path = require('path');

const FIELD_ELEV = 9070;              // ft MSL (surveyed 9,069.7)
// Runway end coordinates (AirNav, decimal degrees)
const RW9  = { lat: 37.9563, lon: -107.9204 };
const RW27 = { lat: 37.9517, lon: -107.8969 };
const FT = 0.3048;                    // ft -> m

// local equirectangular projection about the field
const lat0 = (RW9.lat + RW27.lat) / 2;
const M_PER_DEG_LAT = 111132.0;
const M_PER_DEG_LON = 111320.0 * Math.cos(lat0 * Math.PI / 180);
const toXY = (p) => ({ x: (p.lon) * M_PER_DEG_LON, y: (p.lat) * M_PER_DEG_LAT });
const toLL = (q) => ({ lon: q.x / M_PER_DEG_LON, lat: q.y / M_PER_DEG_LAT });

const A = toXY(RW9), B = toXY(RW27);   // runway ends in metres

function circlePts(c, rMeters, n = 240) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    out.push({ x: c.x + rMeters * Math.cos(t), y: c.y + rMeters * Math.sin(t) });
  }
  return out;
}

// Andrew's monotone-chain convex hull
function hull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// capsule (stadium) around the runway = convex hull of two circles
function capsule(rFt) {
  const r = rFt * FT;
  return hull(circlePts(A, r).concat(circlePts(B, r)));
}

const ring = (poly) => {
  const r = poly.map(toLL).map((p) => [ +p.lon.toFixed(6), +p.lat.toFixed(6) ]);
  r.push(r[0]);
  return r;
};

const horizontal = capsule(10000);          // inner
const conicalOut = capsule(14000);          // 10,000 + 4,000

// ---- approach surfaces: trapezoids off each runway end ----
// bearing from one end toward the other (runway centerline), extend outward
function unit(from, to) { const dx = to.x - from.x, dy = to.y - from.y; const d = Math.hypot(dx, dy); return { x: dx / d, y: dy / d }; }
function approach(end, awayFrom) {
  const f = unit(awayFrom, end);            // points outward from the field
  const n = { x: -f.y, y: f.x };            // left normal
  const start = 200 * FT;                   // primary surface extends 200' past end
  const len = 10000 * FT;
  const innerHalf = (500 / 2) * FT;
  const outerHalf = (3500 / 2) * FT;
  const s = { x: end.x + f.x * start, y: end.y + f.y * start };
  const e = { x: end.x + f.x * (start + len), y: end.y + f.y * (start + len) };
  const poly = [
    { x: s.x + n.x * innerHalf, y: s.y + n.y * innerHalf },
    { x: e.x + n.x * outerHalf, y: e.y + n.y * outerHalf },
    { x: e.x - n.x * outerHalf, y: e.y - n.y * outerHalf },
    { x: s.x - n.x * innerHalf, y: s.y - n.y * innerHalf },
  ];
  return poly;
}
const app9  = approach(A, B);   // off the RW9 end (west)
const app27 = approach(B, A);   // off the RW27 end (east)

const fc = {
  type: 'FeatureCollection',
  properties: {
    airport: 'Telluride Regional Airport (KTEX)',
    field_elev_ft: FIELD_ELEV,
    source: '2016 TEX Master Plan Part 77 sheet + AirNav runway geometry',
    note: 'Approximate imaginary surfaces derived from published Part 77 parameters. Advisory only — confirm with the airport / San Miguel County.'
  },
  features: [
    { type: 'Feature',
      properties: { surface: 'conical', label: 'Conical surface', ceiling_ft: '9,220 → 9,420 ft MSL (rising)' },
      geometry: { type: 'Polygon', coordinates: [ ring(conicalOut), ring(horizontal).slice().reverse() ] } },
    { type: 'Feature',
      properties: { surface: 'horizontal', label: 'Horizontal surface', ceiling_ft: '9,220 ft MSL' },
      geometry: { type: 'Polygon', coordinates: [ ring(horizontal) ] } },
    { type: 'Feature',
      properties: { surface: 'approach', label: 'Approach surface (RW 9)', ceiling_ft: 'sloped 34:1 down toward the runway' },
      geometry: { type: 'Polygon', coordinates: [ ring(app9) ] } },
    { type: 'Feature',
      properties: { surface: 'approach', label: 'Approach surface (RW 27)', ceiling_ft: 'sloped 34:1 down toward the runway' },
      geometry: { type: 'Polygon', coordinates: [ ring(app27) ] } },
  ]
};

const outPath = process.argv[2];
fs.writeFileSync(outPath, JSON.stringify(fc));
console.log('wrote', outPath);
console.log('features:', fc.features.map(f => f.properties.surface).join(', '));
console.log('horizontal ring pts:', horizontal.length, ' conical outer pts:', conicalOut.length);
