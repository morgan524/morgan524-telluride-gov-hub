# Valley Project Map — Livable Telluride

An interactive map showing how separate public decisions add up across San Miguel County, Colorado.

**Live site:** https://morgan524.github.io/livable-telluride-valley-map/

## Core message

> *"How separate public decisions add up."*

Abstract numbers — 400,000 sq ft, $40M gondola debt, 1,058 new hotel employees — become real when placed on a map together with their neighbors.

## Phase 1 Stack

```
Mapbox GL JS + static data/projects.json + GitHub Pages
```

No server required. All data is in `data/projects.json`.

## File structure

```
livable-telluride-valley-map/
├── index.html          Main map UI
├── css/styles.css      All styles
├── js/app.js           Map logic, filters, drawer, counter
├── data/
│   └── projects.json   All project data (16 initial entries)
└── README.md
```

## Mapbox token

Public browser token (`pk.` prefix — safe for client-side JS).
Restrict in Mapbox dashboard to: `localhost:*, morgan524.github.io/*, livabletelluride.org/*`

## Pin colors by status

| Color  | Status |
|--------|--------|
| 🔴 Red    | Proposed / Major Pending Decision |
| 🟠 Orange | Under Review |
| 🟢 Green  | Approved |
| 🟣 Purple | Litigation / Legal / Ballot |
| 🔵 Blue   | Public Infrastructure |
| ⚫ Gray   | Built / Historical |

## Adding or updating projects

Edit `data/projects.json`. Each entry has these fields:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | URL-safe slug |
| `name` | string | Full display name |
| `shortName` | string | Compact name for tight spaces |
| `location` | string | Plain-English location |
| `communityArea` | string | One of: Telluride, Mountain Village, East End, Countywide, Norwood / Wright's Mesa, West End |
| `jurisdiction` | string | Governing entity |
| `projectType` | string[] | Housing, Hotel/Lodging, Public Finance/Debt, Transportation, Water/Infrastructure, Legal/Governance, Open Space, Civic Facility, Medical, Commercial, Land Use |
| `status` | string | Proposed, Under Review, Approved, Litigation, Built, Public Infrastructure |
| `latitude` / `longitude` | number | WGS84 decimal degrees |
| `squareFootage` | number\|null | |
| `housingUnits` | number\|null | |
| `hotelRooms` | number\|null | |
| `estimatedEmployees` | number\|null | |
| `publicDebtSubsidy` | number\|null | Dollars |
| `decisionBody` | string | Who makes the call |
| `nextMeetingDate` | string\|null | ISO date YYYY-MM-DD |
| `publicCommentDeadline` | string\|null | ISO date YYYY-MM-DD |
| `keyQuestion` | string | The core civic question |
| `whyItMatters` | string | Non-partisan explainer |
| `deepDiveUrl` | string | livabletelluride.org deep-dive page |
| `primarySourceUrl` | string | Government or court source |
| `lastUpdated` | string | ISO date |
| `sourceConfidence` | string | Confirmed, Estimated, Disputed, Unknown |
| `editorialStatus` | string | Needs Source, Needs Review, Ready, Published, Needs Update, Archived |

## Phase 2 (future)

Migrate `data/projects.json` to Supabase/PostGIS tables with the same schema. Switch rendering to MapLibre GL JS. Add public submission form backed by Supabase.

Five tables: `projects`, `project_sources`, `project_updates`, `meetings`, `public_submissions`.

## To deploy

Push to `main` branch. GitHub Pages serves from root.

## To submit a missing project or correction

Email info@livabletelluride.org or use the "+ Submit Missing Project" button in the map header.
