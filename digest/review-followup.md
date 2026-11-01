# Digest review follow-up: week of November 2, 2026

**1. This morning's Sunday render overwrote John Metzger's edited draft (again).**
John's edits were applied on Oct 31 (commit `014dbbb3`, freeze written). The Sunday review workflow renders with `force: true`, so it re-rendered over the freeze. The draft you'll see now has lost:
- the title "The Week Ahead" and the heading "Events to Attend"
- the single 10:30 AM P&Z Chair card (the duplicate 9:00 AM `/Special Meeting` card is back)
- the removal of the Bike & Brewery Tour and of the Aldasoro "Why This Matters" box on the BOCC card
- John's wording on the Medical Center, BOCC, Design Review Board, Norwood, school board and event cards

The same thing happened on Oct 25 (fixed in `fe6e33af`). The intro survived because it's pinned in `data/week-ahead-lede.json`. I tried to restore John's version, but the restore was blocked, so I left the draft alone.
**Recommendation:** restore `digest/week.html` from `014dbbb3`, then apply these three fixes:
- "interview board candidates" → "interview student candidates for the Student Representative seat"
- "second in size only to Kaiser Permanente" → "one of the largest nonprofit hospital systems in the country"
- "Medical Center Regular Board Meeting" → "Medical Center Special Board Meeting" (tellmed.org calls Nov 3 a Special Meeting)

Make the same three changes in `data/week-ahead-lede.json`, or any later render will bring the old wording back. I didn't edit John's pinned intro myself. Longer term, the Sunday review probably shouldn't force-render over a hand-edited draft.

**2. I didn't re-render.** A re-render would have dropped the review's fixes to the intro (the pinned intro still has the old wording) and wouldn't bring back John's edits. Source fixes are pushed in `447fdf29`, and future digests get them automatically:
- the Telluride sync keeps one card when a meeting is continued to a later slot the same day, and drops the "Rescheduled/" and "at 10:30 AM" title debris
- specials that are flagged but titled "Regular …" now read "Special …"
- events described as "throughout the summer" are skipped from November to March

**3. Out-of-season events still in this draft (also in John's version):**
- **Movies Under the Stars, Sat Nov 7:** an outdoor summer series at dusk. **Recommendation:** remove it, the same call you made on Bike & Brewery.
- **Facing the Mourning, Thu Nov 5:** KOTO's own text says "every Thursday throughout September". KOTO repeats it every Thursday through Feb 2027, including Thanksgiving and Christmas Eve, which looks like a stale repeat. John changed the text to "November". **Recommendation:** remove it unless someone confirms with Tri County Health Network (970-708-7096) that a November series is running.
- **Market on the Plaza, Wed Nov 4 (East End/West End), probably also summer-only.** Worth a glance.

Tests: 435/435 pass. Two leftover scratch files (`scratch-john.html`, `scratch-week.html`) are untracked in the Mac mini checkout. I wasn't allowed to delete them, so it's safe to delete them yourself.
