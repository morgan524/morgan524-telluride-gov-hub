# Local News tab — sources & card behavior

_Split out of CLAUDE.md 2026-06-22. Everything that renders on the Local News tab: San Miguel Basin Forum, Telluride Humane Society, plus card overrides / filtering / logo alignment._

## San Miguel Basin Forum — West End news on Local News

Live at /#local-news and refreshed every 6 hours alongside TT/KOTO.
Storage: `SMB_FORUM_ARTICLES` in `js/gov-helpers.js`. Renderer:
`local-news.html` `loadLiveData()` slices the first 15.

**SMBF uses Creative Circle CMS** (same publishing platform as
Telluride Times) BUT has the `/search/?f=rss` RSS endpoint DISABLED —
returns HTTP 403 from Varnish. So instead of TT's RSS pattern, the
refresh scrapes the `/news/` landing page HTML and pairs each
`<div class="landing-story row">` block with its `<h3 class="heading-3">`
headline, `<div class="lead">` summary, and `<img class="photo">`.

**Date model — print-first publishing convention (2026-05-26).**
SMBF is a print-first weekly. Stories appear in the print edition
days-to-weeks before they're posted online, so the article's online
byline date (`datePublished` in schema.org JSON-LD) understates
freshness. Per user direction we use a different convention than
TT/KOTO: the "publish date" shown on Local News = the day the bot
first observes the story on the SMBF website (`firstSeen`), NOT the
byline date. The displayed `date` field mirrors `firstSeen` in human
form. Side benefit: no per-article detail-page fetches are needed
anymore — the landing page has everything the renderer reads.

**No-flood seeding.** On the very first run after deploy, every
article on SMBF's landing page would otherwise look "new" and get
stamped with today's date — flooding Local News with 25 stories of
varying actual age. To prevent this, `SMB_FORUM_ARTICLES` in
`js/gov-helpers.js` is seeded with the entire current landing page:
the two articles the user wanted to feature on launch day carry
`firstSeen` = launch date (visible), the other 23 carry a sentinel
`firstSeen='2025-01-01'` so the bot recognises them as "already
known" and `local-news.html`'s 35-day-firstSeen filter hides them.
As real new stories appear at the top of the landing page over the
following weeks, the bot adds them with today's `firstSeen` and the
sentinel entries gradually fall out of relevance.

Knobs in `scripts/content-refresh.js`:
- `SMBF_NEWS_URL` — the landing page to scrape.
- `SMBF_MAX_AGE_DAYS = 35` — articles whose `firstSeen` is older than
  this AND that have rolled off the landing page get dropped. The
  35-day window is wider than the 14-day default because SMBF only
  publishes ~1 story per week.

In `local-news.html`'s `loadLiveData()`, the same 35-day window is
applied as a display filter on `firstSeen` — sentinel-dated entries
never render even though they live in the array.

Cloudflare Worker allow-list: `sanmiguelbasinforum.com` and
`www.sanmiguelbasinforum.com` are in both `cloudflare-worker/.../worker.js`
ALLOWED_HOSTS and `scripts/content-refresh.js` PROXY_HOSTS. The
preflight drift check at refresh-start guarantees these stay in sync.

Logo: `/logo/San Miguel Basis Logo.jpg` (note: filename intentionally
"Basis" not "Basin" — kept as user provided it). Wired into
`ENTITY_LOGOS['smb']` in `gov-data.js` and as a fallback img in
`local-news.html`'s `imgFor()`.

Digest: `scripts/build-rss-feed.js` includes SMBF articles in
`feed.xml` alongside TT/KOTO via `buildNewsItems('smbf', smbf, ...)`,
so daily/weekly Mailchimp digests include West End stories.

## Telluride Humane Society — adoptable animals on Local News

Live at /#local-news and refreshed every 6 hours. Source of truth is
the Shelterluv API for organization GID `36337`:

```
https://www.shelterluv.com/api/v3/available-animals/36337
```

Returns dogs and cats currently up for adoption. `scripts/content-refresh.js`
Task 7 (`syncHumaneSocietyAnimals`) hits this endpoint, parses each
animal record, and writes a normalized `HUMANE_SOCIETY_ANIMALS` array
into `js/gov-helpers.js`. The animal record schema we keep:

```js
{ id, name, species, breed, ageGroup, sex, photo, profileUrl, summary,
  firstSeen, revealDate, lastSeen }
```

The three trailing scheduling fields are added by the sync (NOT the
API) and control the staggered reveal behavior described below.

Important shapes to remember when reading the Shelterluv response:
- `age_group` is an OBJECT (`{name: "Young Dog", duration: "(1-5 years)", ...}`).
  Pull `.name` for display.
- `photos` is an array of OBJECTS (`{id, name, url, isCover, ...}`). Pull
  `.url` from the cover photo (or first one) — never use the array entry
  directly, that's an object.
- `species` is `"Dog"` or `"Cat"`. Other values are filtered out.

### Staggered reveal scheduling (2026-05-26)

Per user direction: animals shouldn't all land on Local News the same
day they get added to Shelterluv. Rules:

1. The day an animal is FIRST SEEN on Shelterluv, the bot stores it
   with `firstSeen = today` and tentatively `revealDate = today`. The
   card becomes eligible to render on `local-news.html` on its
   `revealDate`.
2. If multiple animals of the same species are first-seen on the same
   day, only ONE reveals immediately. The second is queued for +2
   days, the third +4 days, etc. Dogs and cats run independent queues
   so they don't compete with each other.
3. If a new animal arrives while an existing same-species animal is
   still queued (its `revealDate` is in the future), the newcomer
   chains onto the back of the queue at `latest_existing_revealDate
   + 2 days` — so users see a steady drip, not a clump.
4. Cards drop when EITHER (a) `revealDate` is more than 30 days in
   the past OR (b) the animal disappears from the Shelterluv API
   (= adopted or removed). Whichever happens first.

The state machine lives entirely inside `syncHumaneSocietyAnimals` —
it runs every 6 hours, carries `firstSeen` / `revealDate` forward
across runs, and re-derives the visible set deterministically. The
renderer (`local-news.html`'s `loadLiveData()`) just compares each
entry's `revealDate` against today's ISO date and skips queued ones.

### Carry-forward on API errors

If the Shelterluv fetch or JSON parse errors, the sync returns the
existing array unchanged — animal cards survive transient outages
instead of vanishing when the API hiccups. (Previously it returned
`null` and the caller skipped the write, which had the same effect
in practice but was easy to misread.)

### Card rendering

Each animal becomes one card with `sourceKey: 'humane-society'`,
sorted into the Local News feed by `revealDate`. The card itself
follows the normal layout: title ("Meet <Name> — adoptable
dog/cat at Telluride Humane Society"), photo, summary, link to the
Shelterluv profile page (`profileUrl`).

Per-card behavior (some inherited from v1 / not all reimplemented in
the v2 standalone `local-news.html` yet):

- **Small source logo is hidden** for humane-society cards (the animal
  photo is the brand marker; hiding the small logo gives the title text
  more horizontal room).
- **Suggest Correction** is suppressed via the
  `js/corrections.js` skip-list (alongside `ttimes`, `koto`, `smb` —
  corrections to upstream-sourced cards belong to the source).

Adding to `corrections.js`'s skip-list when introducing new
upstream-sourced card sources: see `addCorrectionTriggers()` around
line 207.

## Local News card overrides

`LOCAL_NEWS_LINK_OVERRIDES` (in `js/gov-helpers.js`) is a title→URL map.
At render time, when an article's title matches a key, the
"Read full article →" link goes to the override URL instead of the
article's original `href`. Used when an article ANNOUNCES something
and readers should click straight through to the destination
instead of the announcement page.

Existing entry:
- `"New Wildfire Information Site Launched"` →
  `https://wildfire-sanmiguelco.hub.arcgis.com/`

Add new entries by appending to the map. Match is by exact title
string (case-sensitive) — fine because TT and gov RSS titles are
stable.

## Local News card-logo vertical alignment

`#tab-local-news .card-logo` has `align-self: center` so the small
source logo (TT, KOTO) vertically centers with the article photo on
each card. Setting `align-items: center` on the parent flex
(`.card-body`) didn't reliably win the cascade in practice; the
child-level `align-self` is the bulletproof rule. Belt + suspenders
— both rules are present.

## Local News card filtering (`isRedundantLocalNewsTitle`)

`collectLocalNewsArticles()` in `js/gov-helpers.js` runs every TT/gov entry
through `isRedundantLocalNewsTitle(title)` and SKIPS items that are
already covered by other tabs:

- **Legal-notices roundups** (titles starting with `Legals` … `Notices`,
  e.g. "Legals and Public Notices for April 30-May 6, 2026") — already
  covered by the dedicated Legal Notices section, so they'd be
  duplicate noise on Local News.
- **Government meeting announcements** with dates in the title (e.g.
  "County Planning Commission 5/14 Meeting in TELLURIDE") — already
  covered by the Gov-Hub tab.
- **Meeting announcements with a named governmental body** (Planning
  Commission, Town Council, BOCC, HARC, School Board, Fire District,
  Hospital District, Open Space Commission, SMART, Telluride Housing
  Authority) plus "Meeting" in the title.

The filter is render-time only (it doesn't strip from
`TELLURIDE_TIMES_ARTICLES` itself), so the items are still available
for any other consumer (the email digest, Gov-Hub, etc.). If a
legitimate news article happens to match the patterns by accident,
loosen the regex; the existing patterns are tight enough that real
news passes through (e.g. "Telski update to council" stays because
there's no `Meeting` keyword paired with the body name).
