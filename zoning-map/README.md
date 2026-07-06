# San Miguel County Zoning & Parcel Map

Single-page Mapbox GL app at `/zoning-map/`. Started as a 26 MB
self-contained HTML export (from Claude Cowork); restructured here so the
heavy data is split out and the biggest layers are served from Mapbox.

## Data architecture

- **Mapbox vector tilesets** (served from Mapbox, not this repo):
  - `livabletelluride.smc_parcels` — parcels (source-layer `parcel`, zoom 9–16).
    Carries the *computed* fields (`built_status_effective`,
    `buildable_unrestricted`, `vacant_lot`, `federal_forest_public_land`,
    `contiguous_owner_group_id`, …) that drive the Vacant Lots / Buildable /
    Built-land views via style filter expressions.
  - `livabletelluride.smc_roads` — roads (source-layer `road`, zoom 9–16).
- **`data/*.json`** (in this repo, fetched at load): everything that needs
  whole-dataset JS logic — `zoning.json` (legend counts + filter),
  `subdivision.json` (filter), `address.json` (text search), the PUD polygons
  (point-in-polygon), `county-outline.json`. The module in `index.html` fetches
  these in parallel via top-level `await` before the map initializes.

The parcel click popup resolves the clicked parcel from the tileset via
`map.queryRenderedFeatures` against the transparent `parcel-hit` fill layer
(there is no in-memory parcel array anymore).

`LEGAL` was dropped from parcels entirely (data + popup) per request.

## Re-uploading the tilesets (when parcel/road data changes)

`upload-tilesets.js` pushes GeoJSON → Mapbox via the Tiling Service (MTS).
It needs a Mapbox **secret** token with `tilesets:write/read/list` at
`/Users/morgansmith/.mapbox_sk` (never commit it; rotate after use), and the
source GeoJSON in a local `data/` dir (regenerate the LEGAL-stripped
`parcel.json`/`roads.json` from `assets/GIS Data/` + the v18 computed fields
first — those large files are intentionally NOT kept in the repo).

`prep-parcels.js` regenerates that `parcel.json` from the v18 export: strips
`LEGAL`, rounds coordinates, and — importantly — spatially tags parcels against
the zoning polygons:
- `high_country:"True"` — centroid in `HIGH COUNTRY AREA` (alpine mining claims)
- `open_space:"True"` — centroid in `OPEN SPACE` / `OPEN SPACE CONSERVATION EASEMENT`
- `airport_restriction:"True"` — parcel *overlaps* a zoning polygon whose
  `NOTES_USE` says "MAY BE SUBJECT TO AIRPORT HEIGHT RESTRICTION"

The Vacant Lots / Buildable filters exclude `high_country` + `open_space` (plus
any `PIN` containing `COMMON`/`OPEN SPACE`); the parcel popup shows a bold notice
for `airport_restriction`. So **a re-upload MUST re-run this tagging** or those
classifications will disappear.

```
node prep-parcels.js /tmp/parcel-upload   # writes /tmp/parcel-upload/parcel.json
# then point upload-tilesets.js's DATA dir at it and run:
node upload-tilesets.js
```

The map reads the tilesets with the public `pk.` token embedded in `index.html`
(restrict it to `livabletelluride.org` in the Mapbox account).
