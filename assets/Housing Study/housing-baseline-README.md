# Housing Survey Baseline — how to use `housing-baseline.json`

**Rule zero:** no number appears in the Livable Telluride housing survey — not in a
question, an answer band, or a published result — unless it traces to an entry in
`housing-baseline.json`. That file is the backbone; this README is the operator's card.

## Reliability grades

| Grade | Meaning | Public use? |
|-------|---------|-------------|
| A | Official statistic or adopted regulation (ACS, CHFA, THA Guidelines, Assessor/MLS) | Yes |
| B | Professional study estimate with known n (2025 HNA model, 2024 RRC surveys) | Yes, with source named |
| C | Point-in-time observation or secondary-source figure pending primary verification | No — internal only |
| X | Placeholder / not yet collected | No |

## The honest-framing rules (why this survey will be defensible)

1. **There is no single "true rent."** The county ACS median ($1,267, 2018–2022) and
   the 2024 household-survey market-rate median ($1,848) are both real and both
   limited. Present the range, name both sources.
2. **Utilities normalize everything.** Deed-restricted max rents *include* utilities;
   market listings usually don't. Every rent question asks "does that include
   heat/electric/internet?"
3. **Three separate populations:** market-rate, deed-restricted, employer-provided.
   Every baseline in the file splits by these; the survey must too.
4. **Anecdotes stay anecdotes.** The March 2025 Zillow/Facebook listings (grade C)
   justify building a listing audit — they are never quoted as market statistics.
5. **Jurisdiction matters.** Telluride vs. Norwood rents differ ~$600/mo in every
   source; report by place.

## Statistical validity targets

- ~4,000 occupied households in San Miguel County; ~1,360 renter households.
- 95% confidence / ±5%: **n ≈ 351** all households, **n ≈ 300** renters.
- Benchmark: the 2024 RRC regional survey got 1,129 total / 821 SMC / 338 renters.

## Update cadence

- CHFA income & rent limits: annually (~May).
- HUD Fair Market Rents: annually (effective Oct 1).
- ACS 5-year: each December release.
- Telluride Guidelines Appendix A/B: whenever THA amends (last: 2025-10-21).
- Bump `meta.last_updated` and `meta.version` on any change.

## Gap-filling status (2026-07-31, v0.2.0)

Filled from primary sources: HUD FY2025+FY2026 FMRs (official), CHFA 2025 and
2026 full rent/income grids, ACS 2020-2024 rents/burden/tenure/bedrooms with
MOEs, BLS QCEW 2024 county wages by sector. News-sourced (grade C, verify):
town-managed rental regime (Shandoka/Sunnyside/Voodoo), SMPA rates.

**Four rental populations, not three:** market-rate, deed-restricted flat-max,
town-managed *income-based* (rent = % of gross income since Jan 2025), and
employer-provided. The survey must distinguish all four.

v0.3.0 additions: agency listings snapshot from the Livable Telluride housing
page (the $1,883 room listing exactly matches the THA Tier 2 max — formula
confirmed in practice); official town-owned unit counts from telluride.gov.
Utility tariff detail removed from scope — the survey only asks whether rent
includes utilities.

Remaining items need a human: see `download_list` in the JSON. The one that
matters: the Town's **2026 Rent Calculator + Employee Rental Housing Policies**
from https://www.telluride.gov/745/Town-Owned-Rental-Properties — that upgrades
the town-managed rent rules from news-sourced (C) to official (A). The rest
(CHAS, OEWS, 2011 topline, STR counts) are optional depth.

Listing audit: log rows into `listing-audit-template.csv` (copy to
`listing-audit.csv`); fields are fixed — don't add columns midstream.
