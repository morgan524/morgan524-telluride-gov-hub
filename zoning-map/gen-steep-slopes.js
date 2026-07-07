#!/usr/bin/env node
// Generate a "steep slopes (>30% grade)" overlay for the developable parcels.
// Slope is computed from Mapbox Terrain-RGB tiles (z12 ~30 m/px), clipped to the
// developable parcel footprints, and vectorized (greedy rectangle merge) into
// zoning-map/data/steep-slopes.json.
//
// Usage: node gen-steep-slopes.js <parcel.json> <index.html-for-token> <out.json> [zoom]
const fs = require("fs");
const zlib = require("zlib");
const https = require("https");

const PARCELS = process.argv[2];
const INDEX = process.argv[3];
const OUT = process.argv[4];
const Z = parseInt(process.argv[5] || "12", 10);
const GRADE = 0.30;                       // 30% grade threshold
const TOKEN = (fs.readFileSync(INDEX, "utf8").match(/pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || [])[0];
if (!TOKEN) { console.error("no pk token"); process.exit(1); }

// ---- minimal PNG decoder (8-bit, color type 2/6, no interlace) ----
function decodePNG(buf) {
  let p = 8, width = 0, height = 0, ctype = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); ctype = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ctype === 6 ? 4 : 3;
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let r;
      if (filter === 0) r = v; else if (filter === 1) r = v + a; else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1); else r = v + paeth(a, b, c);
      out[y * stride + x] = r & 0xff;
    }
  }
  return { width, height, ch, data: out };
}
function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const c = []; res.on("data", d => c.push(d)); res.on("end", () => resolve(Buffer.concat(c)));
    }).on("error", reject);
  });
}

// ---- web mercator (global pixel coords at zoom Z) ----
const N = Math.pow(2, Z) * 256;
const lon2px = lon => (lon + 180) / 360 * N;
const lat2px = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N; };
const px2lon = x => x / N * 360 - 180;
const px2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI;

(async () => {
  const fc = JSON.parse(fs.readFileSync(PARCELS, "utf8"));
  const dev = fc.features.filter(f => f.properties.developable === "True");
  // bbox in pixels
  let minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
  const polys = [];
  for (const f of dev) {
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : [].concat(...f.geometry.coordinates);
    const pr = rings.map(r => r.map(([lo, la]) => { const x = lon2px(lo), y = lat2px(la); if (x < minPx) minPx = x; if (x > maxPx) maxPx = x; if (y < minPy) minPy = y; if (y > maxPy) maxPy = y; return [x, y]; }));
    polys.push(pr);
  }
  const tx0 = Math.floor(minPx / 256), tx1 = Math.floor(maxPx / 256);
  const ty0 = Math.floor(minPy / 256), ty1 = Math.floor(maxPy / 256);
  const ox = tx0 * 256, oy = ty0 * 256;              // grid origin (global px)
  const W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
  console.error(`zoom ${Z}: tiles x ${tx0}..${tx1}, y ${ty0}..${ty1} (${(tx1 - tx0 + 1)}x${(ty1 - ty0 + 1)}=${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)}), grid ${W}x${H}`);

  // ---- fetch + decode terrain tiles into an elevation grid (metres) ----
  const elev = new Float32Array(W * H).fill(NaN);
  const tiles = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) tiles.push([tx, ty]);
  let done = 0;
  const CONC = 8;
  for (let i = 0; i < tiles.length; i += CONC) {
    await Promise.all(tiles.slice(i, i + CONC).map(async ([tx, ty]) => {
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`;
      try {
        const png = decodePNG(await fetchBuf(url));
        const gx0 = tx * 256 - ox, gy0 = ty * 256 - oy;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          const k = (y * png.width + x) * png.ch;
          const R = png.data[k], G = png.data[k + 1], B = png.data[k + 2];
          elev[(gy0 + y) * W + (gx0 + x)] = -10000 + (R * 65536 + G * 256 + B) * 0.1;
        }
      } catch (e) { /* leave NaN */ }
      done++;
    }));
    process.stderr.write(`\rtiles ${done}/${tiles.length}`);
  }
  process.stderr.write("\n");

  // ---- rasterize developable parcels into a mask ----
  const mask = new Uint8Array(W * H);
  for (const pr of polys) {
    let ylo = Infinity, yhi = -Infinity;
    for (const ring of pr) for (const [, y] of ring) { if (y < ylo) ylo = y; if (y > yhi) yhi = y; }
    const r0 = Math.max(0, Math.floor(ylo - oy)), r1 = Math.min(H - 1, Math.ceil(yhi - oy));
    for (let row = r0; row <= r1; row++) {
      const yc = oy + row + 0.5, xs = [];
      for (const ring of pr) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][1], yj = ring[j][1];
        if ((yi > yc) !== (yj > yc)) xs.push(ring[i][0] + (yc - yi) / (yj - yi) * (ring[j][0] - ring[i][0]));
      }
      xs.sort((a, b) => a - b);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const c0 = Math.max(0, Math.ceil(xs[s] - ox - 0.5)), c1 = Math.min(W - 1, Math.floor(xs[s + 1] - ox - 0.5));
        for (let col = c0; col <= c1; col++) mask[row * W + col] = 1;
      }
    }
  }

  // ---- slope (grade) per masked cell → steep boolean grid ----
  const steep = new Uint8Array(W * H);
  const mPerPxRow = new Float64Array(H);
  for (let row = 0; row < H; row++) mPerPxRow[row] = 156543.03392 * Math.cos(px2lat(oy + row + 0.5) * Math.PI / 180) / Math.pow(2, Z);
  let steepCount = 0, maskCount = 0;
  for (let row = 1; row < H - 1; row++) {
    const mpp = mPerPxRow[row];
    for (let col = 1; col < W - 1; col++) {
      if (!mask[row * W + col]) continue;
      maskCount++;
      const zL = elev[row * W + col - 1], zR = elev[row * W + col + 1], zU = elev[(row - 1) * W + col], zD = elev[(row + 1) * W + col];
      if (isNaN(zL) || isNaN(zR) || isNaN(zU) || isNaN(zD)) continue;
      const gx = (zR - zL) / (2 * mpp), gy = (zD - zU) / (2 * mpp);
      if (Math.hypot(gx, gy) > GRADE) { steep[row * W + col] = 1; steepCount++; }
    }
  }
  console.error(`developable cells: ${maskCount}, steep (>30% grade): ${steepCount} (${(100 * steepCount / maskCount).toFixed(1)}%)`);

  // ---- greedy rectangle merge of the steep grid → polygons ----
  const feats = [];
  const used = new Uint8Array(W * H);
  const round6 = n => Math.round(n * 1e6) / 1e6;
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W;) {
      if (!steep[row * W + col] || used[row * W + col]) { col++; continue; }
      // extend run right
      let c1 = col; while (c1 + 1 < W && steep[row * W + c1 + 1] && !used[row * W + c1 + 1]) c1++;
      // extend down while full run matches
      let r1 = row;
      outer: while (r1 + 1 < H) {
        for (let c = col; c <= c1; c++) if (!steep[(r1 + 1) * W + c] || used[(r1 + 1) * W + c]) break outer;
        r1++;
      }
      for (let r = row; r <= r1; r++) for (let c = col; c <= c1; c++) used[r * W + c] = 1;
      const lonA = round6(px2lon(ox + col)), lonB = round6(px2lon(ox + c1 + 1));
      const latA = round6(px2lat(oy + row)), latB = round6(px2lat(oy + r1 + 1));
      feats.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[lonA, latA], [lonB, latA], [lonB, latB], [lonA, latB], [lonA, latA]]] } });
      col = c1 + 1;
    }
  }
  const gj = { type: "FeatureCollection", properties: { threshold: "30% grade (~16.7°)", source: `Mapbox Terrain-RGB z${Z} (~30 m), clipped to developable parcels`, note: "Approximate regional slope screen — advisory only, confirm with a survey / county GIS." }, features: feats };
  fs.writeFileSync(OUT, JSON.stringify(gj));
  console.error(`wrote ${OUT}: ${feats.length} polygons, ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
})();
