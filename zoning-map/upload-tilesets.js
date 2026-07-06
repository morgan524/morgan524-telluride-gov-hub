#!/usr/bin/env node
// Upload GeoJSON render layers to Mapbox as vector tilesets via the Tiling
// Service (MTS). Pure HTTP (no AWS tooling). Idempotent: deletes + recreates
// the source, creates-or-updates the tileset recipe, publishes, polls.
//
// Usage: node mapbox-upload.js
const fs = require('fs');
const path = require('path');

const USER = 'livabletelluride';
const TOK = fs.readFileSync('/Users/morgansmith/.mapbox_sk', 'utf8').trim();
const DATA = path.join(__dirname, 'data'); // put LEGAL-stripped parcel.json / roads.json here to (re)upload
const API = 'https://api.mapbox.com/tilesets/v1';

// Layers to move to tilesets. `layer` becomes the vector source-layer name the
// map's style will reference. Zoom ranges tuned per geometry density.
const LAYERS = [
  { file: 'parcel.json',  tileset: 'smc_parcels',      source: 'smc_parcels_src',      layer: 'parcel', minzoom: 9,  maxzoom: 16 },
  { file: 'roads.json',   tileset: 'smc_roads',        source: 'smc_roads_src',        layer: 'road',   minzoom: 9,  maxzoom: 16 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function toLineDelimited(fcPath) {
  const fc = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
  return fc.features.map(f => JSON.stringify(f)).join('\n') + '\n';
}

async function uploadSource(L) {
  // Replace any existing source (idempotent re-run).
  await fetch(`${API}/sources/${USER}/${L.source}?access_token=${TOK}`, { method: 'DELETE' }).catch(() => {});
  const ld = toLineDelimited(path.join(DATA, L.file));
  const fd = new FormData();
  fd.set('file', new Blob([ld], { type: 'application/octet-stream' }), L.file + '.ld');
  const r = await fetch(`${API}/sources/${USER}/${L.source}?access_token=${TOK}`, { method: 'POST', body: fd });
  const t = await r.text();
  if (!r.ok) throw new Error(`source ${L.source} upload ${r.status}: ${t.slice(0, 300)}`);
  console.log(`  source ${L.source}: ${(ld.length / 1e6).toFixed(1)}MB uploaded`);
}

async function createOrUpdateTileset(L) {
  const recipe = { version: 1, layers: { [L.layer]: { source: `mapbox://tileset-source/${USER}/${L.source}`, minzoom: L.minzoom, maxzoom: L.maxzoom } } };
  const id = `${USER}.${L.tileset}`;
  let r = await fetch(`${API}/${id}?access_token=${TOK}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: L.tileset, recipe })
  });
  if (r.status === 400 && /already exists/i.test(await r.clone().text())) {
    // Update the recipe on the existing tileset. The recipe PATCH body is the
    // recipe object itself (NOT wrapped in {recipe}). Note: re-uploading the
    // SOURCE + publishing already refreshes the data; the recipe only needs
    // updating when layers/zoom change.
    const pr = await fetch(`${API}/${id}/recipe?access_token=${TOK}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipe)
    });
    if (!pr.ok) throw new Error(`recipe update ${id} ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
    console.log(`  tileset ${id}: recipe updated`);
  } else if (!r.ok) {
    throw new Error(`create ${id} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  } else {
    console.log(`  tileset ${id}: created`);
  }
}

async function publish(L) {
  const id = `${USER}.${L.tileset}`;
  const r = await fetch(`${API}/${id}/publish?access_token=${TOK}`, { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`publish ${id} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  console.log(`  tileset ${id}: publish job ${j.jobId || '(started)'}`);
}

async function waitFor(L) {
  const id = `${USER}.${L.tileset}`;
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const r = await fetch(`${API}/${id}/status?access_token=${TOK}`);
    const j = await r.json();
    if (j.status === 'success') { console.log(`  ✓ ${id} ready (${i * 10 + 10}s)`); return true; }
    if (j.status === 'failed') { console.log(`  ✗ ${id} FAILED`); return false; }
    if (i % 3 === 0) console.log(`    ${id}: ${j.status}… (${i * 10 + 10}s)`);
  }
  console.log(`  ! ${id} still processing after 10min — check later`);
  return false;
}

(async () => {
  console.log('== upload sources ==');
  for (const L of LAYERS) await uploadSource(L);
  console.log('== create/update tilesets ==');
  for (const L of LAYERS) await createOrUpdateTileset(L);
  console.log('== publish ==');
  for (const L of LAYERS) await publish(L);
  console.log('== wait for processing ==');
  const results = await Promise.all(LAYERS.map(waitFor));
  console.log('\nDone. Tileset IDs:');
  LAYERS.forEach((L, i) => console.log(`  ${USER}.${L.tileset}  (source-layer: ${L.layer})  ${results[i] ? 'READY' : 'PENDING/FAILED'}`));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
