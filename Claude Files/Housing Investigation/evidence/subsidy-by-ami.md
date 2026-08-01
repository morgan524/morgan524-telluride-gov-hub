# The real subsidy per unit, by AMI tier (Workstream F, first pass 2026-07-31)

**Question 3: what does each subsidized unit actually cost the public,
depending on who it's priced for?**

## Method

Capital subsidy = total development cost per unit (TDC) minus the debt the
unit's own rent stream can carry. Rent = CHFA 2026 maximum for a 2-bedroom
at each AMI band [A, baseline v0.4.0]. Net operating income = rent × 12 ×
95% occupancy − $9,500/yr operating cost [EST; range $7–12k tested below].
Supportable debt = NOI capitalized over 30 years at 5.0% [EST; the Town's
2021–2023 bond series ran roughly 2.5–5.5%]. TDC from the cost tracker's
documented models (`projects-map/data/projects.json`):

- **Sunnyside**: $516k/unit (land contributed free by the County)
- **VooDoo**: $1,256k/unit (includes $5M land; actuals ~$25.8M all-in for 27 units)
- **Shandoka Lot L (proposed, Alt 2B)**: $3,296k/unit (garage-burdened)

Raw output: `subsidy-by-ami.json`.

## Result: capital subsidy per unit

| Rent tier | 2BR rent | Debt the rent carries | Sunnyside ($516k) | VooDoo ($1.26M) | Shandoka L ($3.3M) |
|---|---|---|---|---|---|
| 30% AMI | $885 | $9k | $507k (98%) | $1,247k (99%) | $3,287k (100%) |
| 50% AMI | $1,475 | $112k | $404k (78%) | $1,143k (91%) | $3,184k (97%) |
| 60% AMI | $1,770 | $164k | $352k (68%) | $1,091k (87%) | $3,132k (95%) |
| 80% AMI | $2,360 | $268k | $249k (48%) | $988k (79%) | $3,029k (92%) |
| 100% AMI | $2,950 | $371k | $145k (28%) | $885k (70%) | $2,925k (89%) |
| 120% AMI | $3,540 | $474k | $42k (8%) | $781k (62%) | $2,822k (86%) |
| 140% AMI | $4,130 | $578k | $0 (0%) | $678k (54%) | $2,718k (82%) |
| 160% AMI | $4,720 | $681k | $0 (0%) | $575k (46%) | $2,615k (79%) |

(%) = subsidy as share of development cost.

## What this explains

1. **Why the Town prices new units at 150–175% AMI.** At VooDoo's real cost,
   even the highest legal program rent covers barely half the building. The
   only way to make the pro-forma look survivable is to charge the top of
   the scale — the pricing follows the construction cost, not the demand.
2. **Why those units sit vacant while VCA's waitlist is capped.** The demand
   (Q2 revealed preference) is at ≤60% AMI; the supply is priced at
   140–175% because that's where the subsidy math hurts least. The vacancy
   is the gap between those two curves, made visible.
3. **The subsidy is never small.** Even at 160% AMI rents, a VooDoo-cost
   unit carries a ~$575k public subsidy. A 60%-AMI unit — the kind people
   actually queue for — carries ~$1.09M at VooDoo cost. At Shandoka Lot L's
   proposed cost the rent tier almost doesn't matter: subsidy is 79–100%
   regardless.
4. **The cross-check that matters (from peer research):** Vail InDEED buys
   permanent occupancy deed restrictions on existing units for ~$62–68k
   each. Against a $575k–$1.25M subsidy per new-built unit, restriction
   purchase delivers workforce capacity at roughly **5–15 cents on the
   dollar** — the strongest single argument for Q6's "buy vs build"
   question, subject to the real constraint that there must be units
   available to restrict.

## Not yet counted (all push subsidy UP)

Forgone property tax (a $1.35M market condo pays roughly $4–5k/yr; town
units pay none), replacement reserves and 30-year capex, housing-dept
administration, and land opportunity cost where "free" public land was
contributed (Sunnyside). Operating-cost sensitivity: at $12k opex the
60%-AMI Sunnyside subsidy rises ~$39k; at $7k it falls ~$39k — second-order
next to TDC.

*Grades: rents A; TDC models B (cost-tracker documented models; VooDoo has
bond actuals); opex/rate/vacancy EST pending Town operating budgets (on
Morgan's records list).*
