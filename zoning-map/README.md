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
  (point-in-polygon), `county-outline.json`, `east-end-flu.json` (East End
  Master Plan future land use — overlay + point-in-polygon for popups). The
  module in `index.html` fetches these in parallel via top-level `await` before
  the map initializes.

The parcel click popup resolves the clicked parcel from the tileset via
`map.queryRenderedFeatures` against the transparent `parcel-hit` fill layer
(there is no in-memory parcel array anymore).

`LEGAL` was dropped from parcels entirely (data + popup) per request.

## East End Master Plan (Future Land Use) overlay

The **East End Master Plan** map view overlays the county's 2024 East End
Master Plan *Future Land Use* map (Map 11) on the parcels. Data is
`data/east-end-flu.json` — the county's published ArcGIS layer
(`services.arcgis.com/aXqye4IXyXsdIpPb/.../County_Land_Use/FeatureServer/7`,
211 polygons), downloaded as WGS84 GeoJSON and precision-trimmed. Each polygon
carries `FLU` (code) + `FLUDesc` (category name).

`EAST_END_FLU` (const near the top of the module in `index.html`) maps each
`FLUDesc` to its plan color (sampled from the PDF's Map 11 legend) and advisory
density, and drives three things: the overlay `fill-color` match expression,
the legend, and the popup. The overlay draws below `parcel-line` so parcel
outlines stay visible.

**Densities are advisory** future-land-use recommendations from the plan, **not
current zoning** (the plan explicitly does not rezone anything). Popups label
them as such. The seven categories + densities: Residential Low (1/7–35 ac),
Residential Medium (1/1–7 ac), Residential High/Mixed Use (>1/ac),
Commercial/Industrial, Public/Institutional, Conservation & Large Lots
(1/35+ ac), Parks & Open Space. Incorporated towns (Telluride, Mountain Village
core) are intentionally absent from the layer — the county plan excludes them,
so clicks there show no future-land-use row. To refresh the data, re-query the
ArcGIS layer as GeoJSON (`?where=1=1&outFields=FLU,FLUDesc&outSR=4326&f=geojson`)
and drop it in as `data/east-end-flu.json`; no tileset re-upload is needed (it's
a client-side GeoJSON overlay, like Parcel C).

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

It also joins the county assessor **`Improvements.geojson`** (by `ACCOUNTNO`) to
tag each parcel's `structure_class` — `vacant` (no improvements) / `outbuilding`
(only a barn/shed/etc., classified from `BLTASDESCRIPTION`) / `developed` (has a
dwelling or commercial building; condos count here) — plus `imp_desc`/`imp_type`/
`imp_sqft`/`imp_year`/`imp_bd`/`imp_ba`/`imp_count` for the popup. This is the
authoritative "what's built here" source and drives the **Vacant/Developable
Land** view (shows `vacant` + `outbuilding`) and colors (blue / teal / amber).

The Vacant Land filter selects `structure_class` in {vacant, outbuilding} and
excludes `high_country` + `open_space` (plus any `PIN` containing
`COMMON`/`OPEN SPACE`); the popup shows structure details + a bold
`airport_restriction` notice. So **a re-upload MUST re-run this tagging** or
those classifications disappear.

```
node prep-parcels.js /tmp/parcel-upload   # writes /tmp/parcel-upload/parcel.json
# then point upload-tilesets.js's DATA dir at it and run:
node upload-tilesets.js
```

The map reads the tilesets with the public `pk.` token embedded in `index.html`
(restrict it to `livabletelluride.org` in the Mapbox account).
