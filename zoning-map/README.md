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
  (point-in-polygon), `county-outline.json`, `east-end-flu.json` +
  `wrights-mesa-flu.json` (master-plan future land use — overlay +
  point-in-polygon for popups), `conservation-easements.json`
  (protected/not-developable land). The module in `index.html` fetches these in
  parallel via top-level `await` before the map initializes.

The parcel click popup resolves the clicked parcel from the tileset via
`map.queryRenderedFeatures` against the transparent `parcel-hit` fill layer
(there is no in-memory parcel array anymore).

`LEGAL` was dropped from parcels entirely (data + popup) per request.

## Future Land Use view (East End + Wright's Mesa + protected land)

One **"Future Land Use"** map view (`setFutureLandUseView`) overlays the county's
adopted master-plan *Future Land Use* maps on the parcels. The two plan areas
don't overlap, so both show at once and the user sees whichever they pan to. All
overlays are client-side GeoJSON from the county's published ArcGIS
`County_Land_Use` FeatureServer (`services.arcgis.com/aXqye4IXyXsdIpPb`),
downloaded as WGS84 GeoJSON and precision-trimmed — **no tileset re-upload
needed** (like Parcel C). Each FLU overlay draws below `parcel-line` so parcel
outlines stay visible on top. `futureLandUseLayerIds` = both FLU overlays +
`notDevelopableLayerIds` (federal gray + easement hatch).

- **East End Master Plan** — `data/east-end-flu.json` (FeatureServer/**7**, 211
  polygons; `FLU` code + `FLUDesc` category). Colors sampled from the plan's
  Map 11 legend. Seven categories: Residential Low (1/7–35 ac), Residential
  Medium (1/1–7 ac), Residential High/Mixed Use (>1/ac), Commercial/Industrial,
  Public/Institutional, Conservation & Large Lots (1/35+ ac, dark green), Parks &
  Open Space. Incorporated towns (Telluride, Mountain Village core) are absent
  from the layer by design → no future-land-use row when clicked.
- **Wright's Mesa Plan** — `data/wrights-mesa-flu.json` (FeatureServer/**8**, 29
  polygons; `NAME` category), Norwood / Wright's Mesa area (western county).
  Four categories: Town Residential (6–12/ac, up to 15 rare), Light Industrial
  (non-residential), Rural/Agricultural (1/35 ac, up to 2 via Open Land
  Protection), Public. Densities are from the Wright's Mesa Master Plan
  (sanmiguelcountyco.gov).

Each has a config const near the top of the module in `index.html`
(`EAST_END_FLU` keyed by `FLUDesc`, `WRIGHTS_MESA_FLU` keyed by `NAME`) mapping
each category → color + advisory density; it drives the overlay `fill-color`
match expression, the legend, and the popup. Popups do point-in-polygon against
both datasets (`fluInfoFromFeature` / `wmInfoFromFeature`) and show the plan
name + category + density.

**Densities are advisory** future-land-use recommendations, **not current
zoning** — the plans explicitly do not rezone anything; popups label them as
such. To refresh either dataset, re-query its ArcGIS layer as GeoJSON
(`?where=1=1&outFields=*&outSR=4326&f=geojson`) and drop it in as the matching
`data/*.json`.

The view also layers on **not-developable land** for contrast:
- **Forest Service / BLM** — parcels flagged `federal_forest_public_land` filled
  gray (`federal-public-fill`, above the FLU fills) so public land fades back.
- **Conservation easements** — `data/conservation-easements.json` (the county's
  `LandHeritageProgram.geojson` + `OtherConservationEasements.geojson` merged,
  146 polygons, `grantee`/`acres`/`src`) shown as a diagonal **hatch**
  (`conservation-easements-fill` + canvas-generated `conservation-hatch`
  pattern) — permanently protected, not developable.

Popups surface both regardless of view (facts about the parcel/location, useful
for the developable-land analysis too): a bold "Federal public land … not
developable" note (`fedNote`) and a "Conservation easement … permanently
protected, not developable (grantee)" note (`easementNote`, point-in-polygon).

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
`imp_sqft`/`imp_year`/`imp_bd`/`imp_ba`/`imp_count` for the popup.

**Conservation easements + developable-land estimate** (added for the Developable
Land view): prep also spatially tags —
- `conservation_easement:"True"` — centroid in `LandHeritageProgram.geojson` or
  `OtherConservationEasements.geojson` (protected, not developable).
- `dev_cat` / `min_lot_lo` / `min_lot_hi` — the parcel's future-land-use category
  (East End `east-end-flu.json` / Wright's Mesa `wrights-mesa-flu.json`) or, outside
  those plan areas, current `ZONING`, mapped to a min-lot-size **range** via
  `FLU_MINLOT` / `ZONING_MINLOT` (rural default 35 ac). Densities are ranges, so
  min-lot is `[lo, hi]`.
- `cur_units` (0 vacant/outbuilding, 1 developed), `dev_lots_lo` / `dev_lots_hi`
  = `max(0, floor(NETACRES / min_lot) − cur_units)` (hi uses the smaller lot).
- `developable:"True"` — not `in_pud_or_subdivision`, not federal / high country /
  open space / conservation easement, not ROW/COMMON, and `dev_lots_hi ≥ 1`
  (i.e. room to add a lot, **regardless of an existing house**). Airport-restricted
  parcels stay in (a height limit caps scale, not permission).

The **Developable Land** view (`parcel-development-fill`) filters on
`developable` and shades by `dev_lots_hi` (purple ramp: 1 / 2–4 / 5–19 / 20+); an
amber dashed outline marks airport-height parcels; the popup shows the estimated
new-lot range + density basis + min lot (`devPotentialRows`). So **a re-upload
MUST re-run this tagging** or the classifications + estimate disappear.

```
node prep-parcels.js /tmp/parcel-upload   # writes /tmp/parcel-upload/parcel.json
# then upload the parcels source + publish smc_parcels (parcels only):
node upload-tilesets.js   # (or a parcels-only uploader pointed at the /tmp file)
```

The map reads the tilesets with the public `pk.` token embedded in `index.html`
(restrict it to `livabletelluride.org` in the Mapbox account).
