# East End Buildable-Land Inventory — first pass (2026-07-31)

**Method:** turf.js analysis of the zoning map's GIS layers
(`zoning-map/data/`): San Miguel County East End Future Land Use (211
polygons), steep-slopes (>30% grade, Terrain-RGB derived), conservation
easements, county address points (5,082), municipal boundaries. Raw overlay
output: `east-end-flu-constraints.json`.

## Headline numbers

The unincorporated East End FLU area covers **~20,250 acres**. Development
today: **~1,256 address points** across it. By FLU class:

| FLU class | Acres | Addresses | Acres/address | Steep (>30%)* | Easement |
|---|---|---|---|---|---|
| Conservation & Large Lots | 8,510 | 78 | 109.1 | 904 | 696 |
| Residential Low | 8,976 | 538 | 16.7 | 49 | 251 |
| Residential Medium | 1,302 | 294 | 4.4 | 53 | 0 |
| Residential High/Mixed Use | 476 | 280 | 1.7 | 35 | 2 |
| Commercial/Industrial | 145 | 37 | 3.9 | 6 | 0 |
| Public/Institutional | 625 | 27 | 23.1 | 7 | 8 |
| Parks & Open Space | 163 | 2 | 81.7 | 0 | 126 |

\* **Big caveat (grade B, not A):** the steep-slope layer was generated
*clipped to developable parcel footprints* (see `gen-steep-slopes.js`), so it
badly understates steep terrain across whole FLU polygons — the box canyon
walls inside Conservation polygons are mostly NOT in this layer. Treat the
steep acres as a floor. Terrain is the dominant real constraint in the East
End and needs a full-DEM pass (or county slope layer) to be quantified
honestly.

## What this says about capacity

1. **The developed pattern is already close to the plan's vision in the
   dense classes.** RH/MU runs one address per 1.7 acres and holds most of
   the region's multifamily (Lawson Hill etc.). Remaining capacity there is
   parcel-by-parcel infill — likely tens of units, not hundreds, pending a
   parcel-vacancy pass.
2. **The big acreages are 1-unit-per-35-acres country.** Under the county's
   by-right density (1 unit/35 ac in density/ag districts — the East End
   crux), the Conservation class's 8,510 acres supports ~243 theoretical
   units, of which ~78 exist → **~165 by-right lots**, most on constrained
   terrain that the slope layer undercounts. RL's 8,976 acres at its
   prevailing built density (16.7 ac/address) is largely subdivided mesa
   land; remaining lots ≈ platted-but-vacant inventory (needs assessor
   vacant-land pull to count).
3. **Meaningful new multifamily capacity therefore requires either PUD
   upzoning (a political decision, not a land fact) or town-boundary
   projects** — which is exactly what the Town has been doing (Voodoo,
   Sunnyside on town land).

**First-order conclusion (to refine):** the East End's *by-right*
unincorporated capacity is a few hundred large-lot units; its *multifamily*
capacity is a policy variable, not a land-supply variable, bounded mostly by
infrastructure (WWTP, water, Hwy 145) and political will. This reframes Q1:
the carrying-capacity question is really "what infrastructure and character
envelope does the region choose," which is exactly how the peer communities
(TRPA, Whistler, Aspen) ended up framing it.

## To firm this up

- [ ] SMC **East End Area Plan FLU density table** (units/acre per class) —
      replaces my by-right assumption with adopted vision densities. Source:
      sanmiguelcountyco.gov master plan docs (Claude can fetch).
- [ ] **Parcel-level vacant-land pass** — assessor data: improved vs vacant
      parcels by FLU class (the map's parcel layer is a Mapbox tileset; raw
      source needed, or assessor export).
- [ ] **Full-DEM slope constraint** across all FLU polygons.
- [ ] **Infrastructure envelopes** (Workstream D): Telluride Regional WWTP
      rated vs current load; water taps; Hwy 145/Society Turn traffic.

*Grades: acreage/address computations A (deterministic from county GIS);
slope overlay B (coverage caveat); by-right density assumption A for
density/ag districts (county LUC), X for FLU-class vision densities pending
the area plan table.*
