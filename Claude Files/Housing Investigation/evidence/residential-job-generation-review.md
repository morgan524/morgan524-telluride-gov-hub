# Residential Job Generation — critical review of the nexus studies + a closed-loop model (2026-08-01)

Reviews the four documents in `!LDC/County & Town/!Impact Fee/Research/`:

1. **2000 Residential Job Generation Study** (The Housing Collaborative / RRC
   Associates; Teton, Gunnison, Breckenridge/Upper Blue, San Miguel)
2. **2005 Employee Housing Impact Fee Support Study** (RPI Consulting, for SMC;
   update of the 2002 original)
3. **2013 Employee Generation by Land Use (Nexus) Study** (Clarion Associates /
   Dr. James C. Nicholas / RRC, for Teton County & Jackson)
4. **2011 The Role of Affordable Housing in Creating Jobs** (Center for Housing
   Policy literature review — the advocacy-side mirror image)

Purpose: determine what in the "every new home creates worker demand" chain is
empirically solid vs. constructed, then state the model Livable Telluride
should use. Same A/B/C/X grading as the baseline.

---

## 1. What each study actually measured

**2000 RRC.** Two primary surveys. (a) Construction: 45 builders/subs, 461
units — but only **13 units in San Miguel County (12 custom homes averaging
7,784 sf, 87.5% costing $300+/sf, + 1 condo)**. Output: FTE-years per 1,000 sf
— Method 1 (contractor observation) avg 2.3; Method 2 (contract dollars ÷
wages) avg 4.4; non-monotonic across size bins. The study itself warns the
sample is self-selected and "should not be used to describe the overall
construction industry." (b) Ongoing maintenance/operations: 2,792 homeowner
responses (35% response) + 17 property-management firms. **Total ongoing
employment ≈ 0.23 FTE/unit overall (SMC 0.29)**; by size: <3,000 sf 0.13 →
3–4k 0.16 → 4–5k 0.29 → 5–6k 0.42 → 6–8k 0.90 → >8,000 sf 1.10 (n=44).
SF homes 0.24 vs condos 0.14. Primary residents 0.21 vs second homeowners
0.22. **Sampling choice that matters: every local primary residence under
3,000 sf was deliberately excluded** — the sample is the second-home/large-
home market by design.

**2005 RPI.** Converts RRC rates into SMC's impact fee. Ongoing: fits an
exponential Y = .070174·e^(.000322·sqft) to the RRC size bins. Construction:
4.4 FTE-yr/1,000 sf ÷ **40-year career** = 0.11 permanent FTE/1,000 sf.
Mitigation rate = existing level of service: 1,790 employees in deed-
restricted units ÷ 4,777 R-1 jobholders = **37%**. Subsidy: 6 projects
1997–2005, weighted avg **$67,500/unit ÷ 1.6 employees/unit = $42,200/
employee** (credited to $42,100 after a $84 sales-tax credit). Fee =
FTE × 37% × $42,100; schedule runs ~$1,500 (1,000 sf) to ~$72k (13,000 sf).

**2013 Clarion/Nicholas (Teton).** The most defensible method. Construction:
ES-202 building-construction employment ÷ ten years of permitted sq ft =
1.234 FTE-yr/1,000 sf, ÷ **30-year career**, ÷ 1.774 employees/construction-
household → **0.023 housing units needed per 1,000 sf**. O&M: fresh 2012 RRC
homeowner survey (978 responses; 87 FTE across 648 answering = **0.134
FTE/unit average**), then a log regression Employment = EXP(−14.17 −
0.65·Local − 1.32·SFD + 1.59·ln(sf²)), R² = 0.32, **explicitly cut off at
7,000 sf for lack of data**. Adds critical service providers (fire/EMS +
police allocated by call share): 0.00077 units/1,000 sf. Totals: a 3,000 sf
non-locally-owned SFD needs **0.106 affordable units** (construction 0.070 =
66% of it); the same house locally owned: 0.090; a modest 1,000 sf local
condo: **0.036** (construction 0.023 = 64%).

**2011 CHP review.** Input-output side: building 100 LIHTC family units →
80 direct/indirect + 42 induced construction-phase jobs, and — the number the
resort studies never use — **30 ongoing local jobs supported by the new
residents' consumer spending (~0.30 jobs per occupied unit)**.

## 2. What holds up (use these)

- **The concept is real and confirmed independently twice, 12 years apart.**
  Homes generate ongoing paid service employment; it scales steeply with
  size; non-local/second-home units out-hire local ones (locals do their own
  upkeep — the 2013 Local dummy is negative and significant); condos shift
  labor to PM firms/HOAs but don't escape it. Grade B.
- **Magnitude, ongoing channel:** ~**0.10–0.23 paid FTE per average unit**,
  ~0.03–0.13 for modest local-occupied units, ~0.2–0.5 for large non-local
  homes, approaching ~1 FTE only above 6,000–8,000 sf. The 2013 survey's
  0.134 average vs the 2000 survey's 0.23 brackets the truth. Grade B.
- **Occupied units also create demand-side jobs** (groceries, schools,
  medical, retail): ~0.3 jobs/occupied unit nationally (NAHB); the resort
  nexus studies omit this channel entirely — it is the bigger channel for
  occupied modest housing, and it is *zero* for a second home sitting vacant
  51% of the year. Grade B (national; local capture lower from leakage).
- **The legal architecture** (Beaver Meadows, SB15 impact-fee authority,
  level-of-service framing) — sound as law, whatever the inputs. Grade A.

## 3. What does not hold up (the serious flaws)

1. **Construction is the biggest number and the weakest.** It is 60–80% of
   the claimed per-unit need in both fee frameworks, and it rests on
   amortizing a temporary, project-following job across an assumed 30/40-year
   locally-resident career. The 2000 study itself found **the majority of SMC
   construction workers commute from outside the county** (GCs: 51%
   out-of-county; subs: 80%) and 18% are temporary residents. A fee that
   charges a Telluride house for permanently housing a Montrose-resident
   framer mostly buys housing for a demand that lands elsewhere. Honest
   treatment: construction workforce housing is a **flow** sized by the
   region's construction *volume* (the pipeline ledger), not a perpetual
   per-house increment.
2. **The 2005 exponential extrapolates far beyond any observation.** RRC's
   top measured bin is ">8,000 sf = 1.10 FTE" (n = 44). The fitted curve
   asserts 1.76 FTE at 10,000 sf, 3.34 at 12,000, 6.36 at 14,000 — **six
   times the largest number ever measured**, produced by the choice of
   functional form. The 2013 study refused to predict beyond 7,000 sf for
   exactly this reason. Any fee bracket above ~8,000 sf is resting on
   invented data.
3. **Sample bias runs upward throughout the 2000 rates.** Construction: 12
   custom SMC homes averaging 7,784 sf. Ongoing: local primary homes <3,000
   sf excluded by design. Applying those rates to *all* new housing —
   including modest and deed-restricted units — overstates their generation.
4. **Double counting across the residential and commercial schedules.**
   PM-company, landscaping, and housekeeping labor is charged to residences
   per-unit, while "real estate/property management" appears in the
   commercial table at 5.9 FTE/1,000 sf (RRC 2001 composite). Levy both fees
   and the same worker is mitigated twice. (The 2000 study excluded front
   desk/reservations for this reason — but only that.)
5. **The 37% mitigation rate measures the status quo, not need.** It is the
   share of the existing workforce already in deed-restricted housing — a
   policy artifact ratified as a ceiling ("essentially limited from requiring
   more than 37%"). It would fall if the county under-built and rise if it
   over-built: circular by construction.
6. **The subsidy input is ~15× stale.** $42,200/employee was calibrated to
   1997–2005 projects ($50k–$107k/unit). Today's demonstrated range is
   $137k (Meadowlark) to $955k+ (VooDoo) per *unit* — ≈ $90k–$680k per
   employee at the same 1.6 employees/unit. Every fee computed from the 2005
   number under-charges by an order of magnitude relative to its own logic.
7. **Low explanatory power, stated honestly by the 2013 authors:** R² = 0.32
   — two-thirds of the variance (wealth, age, personal taste) is outside the
   land-use variables. Fine for setting averages; weak for claiming precision.
8. **None of the studies close the loop.** They stop at the first round of
   workers. The workers' own households occupy units, spend, and require
   teachers, nurses, and clerks — and, conversely, the studies never credit
   that deed-restricted local units are the *lowest*-generating product in
   the entire table while vacant luxury homes are the highest. The loop is
   the actual question, and it has a clean mathematical answer (below).

## 4. The Livable Telluride model — two channels, closed loop

**Per-unit annual local job generation g, by product (grade B/E ranges):**

| Product | Upkeep (paid) | Resident spending | g total |
|---|---|---|---|
| Deed-restricted / modest local unit (<2,000 sf) | 0.03–0.10 | 0.15–0.30 | **0.2–0.4** |
| Mid-size local SFD (3,000–5,000 sf) | 0.10–0.25 | 0.15–0.30 | 0.25–0.55 |
| Large non-local second home (5,000–8,000 sf) | 0.2–0.9 | ~0.05–0.15 (present ~25 wks) | **0.3–1.0** |
| Hotel key (from hotel-externality-model.md) | 1.5–2.5 staff/key | n/a | 1.5–2.5 |

**The recursion.** Each housed worker household generates g jobs; each job
converts to housed-household demand at ÷1.2 jobs/worker ÷1.5–1.8
workers/household ≈ ×0.5. So the feedback ratio r = 0.5·g ≈ **0.10–0.20**
for workforce housing, and total need is a convergent geometric series:

  **Multiplier M = 1/(1 − r) ≈ 1.10–1.25** (≈1.35 at the pessimistic edge).

Three conclusions the studies' own data force:

1. **The spiral is real but converges.** Housing workers does create demand
   for more workers — about **10–25 additional units per 100 built**, not a
   runaway loop. This independently reproduces the 15–35% service-population
   overhead already in the public report (fiscal-secondary-costs.md) by a
   completely different route — two methods, one answer. Every housing-need
   number should carry the ×1.1–1.35 markup, and every project pro-forma
   should disclose it.
2. **Affordable units are the lightest load in the ledger.** ~0.01–0.04
   units of induced need per modest local unit (2013 Teton, honest version)
   vs ~0.1–0.5 for large second homes — a 5–10× per-unit difference. "New
   homes create worker demand" is most true of exactly the product that pays
   the least mitigation today.
3. **Construction belongs in the flow account, not the stock account.**
   Count construction employment against the region's rolling pipeline
   (Society Turn, hotels, Ilium, the new WWTP — the R2 capacity ledger), at
   its actual residency split (most of it commutes in), rather than as a
   per-house perpetuity. This is also where the 2011 CHP framing matters:
   the *same* construction jobs the nexus studies count as a burden are the
   ones the advocacy literature counts as a benefit — neither is wrong;
   they're describing a flow that follows construction volume wherever it
   goes.

**A modern restatement of the impact-fee case (honest version).** A 6,000 sf
non-local home at g ≈ 0.3–0.9 → 0.15–0.45 direct worker households → ×M →
~0.17–0.55 housed households of induced need → at today's demonstrated
public delivery costs ($145k–$700k/unit for the relevant tiers) ≈ **$25k–
$350k of public housing capital embedded in one large second home** — versus
a 2005-calibrated fee of roughly $7k–$9k at that size. The fee architecture
is legally sound and directionally right; its inputs are 20 years stale, its
construction component is misattributed, and its top brackets are
extrapolated. Rebuilt on current subsidy costs, measured (not extrapolated)
generation rates, and flow-based construction accounting, the honest fee for
large homes is several times today's — and the honest charge on modest local
units is close to zero.

## 5. Open items

- Whether/what the County currently levies from the 2005 schedule (check the
  LUC's employee housing mitigation section; the 15% subdivision-era rule vs
  the RPI fee) — needed before quoting "the current fee" publicly.
- The 2013-style regression could be re-run on a Telluride-region survey —
  Livable Telluride's own survey could carry the 5 employment questions and
  produce the first locally-measured rates since 2000.
- Local job-capture share for resident spending (Montrose/online leakage) —
  bounds the consumption channel; QCEW retail/services mix can bracket it.
- 2011 CHP review pp. 9+ (foreclosure/fiscal sections) not yet read in full —
  peripheral to this model.
