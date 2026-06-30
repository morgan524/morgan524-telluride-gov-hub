# Mailchimp subscriptions, blog & digest

_Split out of CLAUDE.md 2026-06-22. Covers the two-subscription model, the Subscribe form, the blog-from-campaigns architecture, feed.xml composition, and the RSS-driven digest._

## Mailchimp two-subscription model (restructured 2026-05-31)

The audience now has exactly **two opt-in subscriptions**, both as interest
groups in a single checkbox category **"Email Subscriptions" (category ID
`7915`)** on the Livable Telluride audience (`f83dc56387`, numeric list id
`318095`, single opt-in):

- **Newsletter** — interest ID `24641` (blog posts / long-form).
- **Weekly Update** — interest ID `24642` (the weekly look-ahead digest).

What changed on 2026-05-31:
- The old **"Topics of Interest" category (`7912`)** — ~25 vestigial
  topic/source groups left over from the deleted interests page — was
  **deleted entirely**. Any code referencing `group[7912]` is obsolete.
- All ~846 existing subscribers were **bulk-added to BOTH** new groups
  (everyone defaults to both).
- The **"Livable Telluride RSS Weekly"** RSS campaign (`feed.xml`, Mondays
  7 AM Boise) was **retargeted from a tiny `Frequency=weekly` segment
  (7–8 people) to the Weekly Update group (`24642`, ~846 recipients)** and
  resumed. The weekly now goes to everyone; opt-outs are honored because it
  targets the group.
- Signups (`hub-bub.html` `mcSubscribe`, `js/lt-subscribe.js`) now set both
  groups via the Mailchimp interest format **`group[7915][24641]` and
  `group[7915][24642]`** (replacing the old `group[7912]=1`). `MMERGE9` is
  still set but is no longer used for campaign targeting.
  ⚠️ **Unverified:** a live test signup succeeded but the test address
  hard-bounced (Cleaned), so group attachment for NEW signups wasn't
  confirmed. Verify with a deliverable test email; if it fails, the
  fallback is the legacy bitmask `group[7915]=<bits>` or a Mailchimp
  automation that adds new subscribers to both groups.
- Subscribers can toggle each subscription via the standard "Update your
  preferences" footer link (group checkboxes); a custom preferences center
  was not built.

The older notes below predate this restructure — treat the `7912` /
`Frequency` references as historical.

---

## Subscription + Blog Architecture (updated 2026-04-30)

Major refactor of the Mailchimp pipeline. Three Mailchimp campaigns now
serve three distinct subscriber experiences:

| Campaign | Audience | Feed source | Cadence | What's in it |
| -------- | -------- | ----------- | ------- | ------------ |
| **Daily Digest** | Segment: `Email Frequency = daily AND Date Added is after 04/30/2026` | `feed.xml` | Daily polling | News + meetings + community events |
| **Weekly Digest** | Segment: `Email Frequency = weekly AND Date Added is after 04/30/2026` | `feed.xml` | Weekly | News + meetings + community events |
| **Blog posts** | **Entire audience** (NO segment) | (no RSS — sent directly) | Manual, when user writes a post | Long-form posts authored as regular Mailchimp campaigns |

**The "Date Added is after 04/30/2026" filter is critical.** Existing
~846 subscribers from before that date didn't actively opt into a
digest cadence (the old form defaulted MMERGE9 to "weekly" without
asking). The cutoff scopes digests to people who explicitly chose a
frequency on the simplified post-2026-04-30 form. Legacy subscribers
still receive blog posts (their original "Livable Telluride newsletter"
expectation), but not digests.

### Subscribe form on the site

`index.html` Subscribe tab now has 3 sections only:

1. **How Often** — radio buttons for `daily` / `weekly` (Monthly was
   removed 2026-04-30; we don't run a monthly campaign).
2. **Events Near You (Optional)** — opens the existing proximity
   modal; sets MMERGE10 (address) + MMERGE11 (radius). Optional, no
   gating.
3. **Your Info** — first/last name, email, town (MMERGE6), Hub-Bub
   forum password (creates a Firebase auth account when ≥6 chars).

Removed in the 2026-04-30 simplification: 10 source-group checkboxes
(Town of Telluride, San Miguel County, Mountain Village, …) and 15
topic-group checkboxes (Housing, Land Use, Public Safety, …). The
Mailchimp interest groups under category `7912` are no longer set
during signup — segmentation is via merge fields only. The form's
JSONP submit posts only EMAIL, FNAME, LNAME, MMERGE6, MMERGE9, and
optionally MMERGE10/11.

### Blog architecture: Mailchimp campaigns are the source of truth

The Blog tab on livabletelluride.org reads from a `BLOG_POSTS` const
in `js/gov-helpers.js`. That array has two kinds of entries:

- **Hand-curated posts** (`source: 'livable-telluride.org'`) — 12 posts
  migrated 2026-04-30 from the legacy `LIVABLE_BLOG_POSTS` array (now
  deleted). Each links to a full post page on livabletelluride.org.
  Edit by hand if you want to add another permanent on-site post.
- **Mailchimp campaigns** (`source: 'mailchimp'`) — auto-prepended by
  `scripts/content-refresh.js` Task 6. Every 6 hours the script fetches
  the audience archive feed at
  `https://us15.campaign-archive.com/feed?u=5d9192289b9af78822f2f69bf&id=f83dc56387`
  and adds any campaign it hasn't seen yet (dedup by href AND by
  normalized title — the second guards against a Mailchimp campaign
  duplicating a hand-curated post about the same topic).

**Authoring workflow for new blog posts:** user creates a regular
campaign in the Mailchimp UI, sends to whichever audience/segment they
want, hits Send. Within 6 hours the next content-refresh tick syncs
it into BLOG_POSTS and it appears on the Blog tab. Card title links
out to the Mailchimp `mailchi.mp/...` archive URL — full post with
all formatting/images preserved.

**Skipping a campaign from the public blog:** put `[private]`,
`[skip]`, `[internal]`, or `[test]` (case-insensitive) in the
Mailchimp campaign title. Task 6 filters those out.

**Auto-skipped: daily / weekly digest campaigns.** The RSS-driven
Mailchimp campaigns that send to opt-in subscribers (segments
`MMERGE9 = daily` and `= weekly`) generate subjects like
`Posts from Livable Telluride for MM/DD/YYYY` from the `*|RSSFEED:DATE|*`
template. Those auto-generated digest emails would clutter the public
blog feed if synced, so Task 6 actively skips ANY campaign whose title
matches `/^Posts from Livable Telluride for /i` or
`/Daily Digest|Weekly Digest|Daily Update|Weekly Update/i`. The skip
is also retroactive: existing `source: 'mailchimp'` entries in
`BLOG_POSTS` that match the digest pattern are pruned from the array
on every Task 6 run, so any past leakage self-cleans.

If you ever rename the digest subject lines or add new digest cadences,
update the regex in `scripts/content-refresh.js`'s `syncMailchimpBlog()`.

### BLOG_POSTS canonical schema

```js
{
  title:    string,                // required
  date:     string,                // any format new Date() can parse
  excerpt:  string,                // shown on the card; emails too
  href:     string,                // where "Read full post →" goes
  image:    string,                // optional card image (with onerror fallback)
  category: string,                // optional (e.g. "Town of Telluride", "Newsletter")
  readTime: string,                // optional ("3 min", "5 min")
  source:   'livable-telluride.org' | 'mailchimp',
  body:     string,                // optional HTML — when present, "Read more"
                                   // expands in-place instead of opening href
  author:   string,                // optional
}
```

The legacy `LIVABLE_BLOG_POSTS` const was DELETED 2026-04-30. Don't
recreate it — anything that was reading from it (the Local-News-tab
sidebar `renderBlogSidebar`) now reads from BLOG_POSTS with field
fallbacks (`post.href || post.url`, `post.excerpt || post.summary`).

### feed.xml content composition (updated 2026-04-30)

`scripts/build-rss-feed.js` emits ONE feed (not two — feed-blog.xml
was retired 2026-04-30 and is no longer emitted; the buildBlogItems
function and BLOG_FEED_* constants are kept commented out at the
writeRssFeed call site in case we want to re-enable). The single
`feed.xml` contains:

- **News** — last 7 days from `TELLURIDE_TIMES_ARTICLES`,
  `KOTO_NEWSCASTS`, `KOTO_FEATURED_STORIES`.
- **Meetings** — last 7 days + next 14 days from `MANUAL_SUMMARIES`
  (keyed `source|date|title`). Each item carries the full agenda
  summary in the description. Source label map:
  telluride / mv / county / smart / school / fire / med / norwood /
  ophir / smrha → human-readable names.
- **Events** — next 60 days from `COMMUNITY_EVENTS` array AND
  `community-events.json` (the email-ingestion path).

Removed 2026-04-30: legal notices (no longer in the digest). Blog
posts are NOT in feed.xml — they go out as direct Mailchimp campaigns
to the entire audience instead.

Window helpers: `withinWindow(d, days)` for backward windows (news);
`withinRollingWindow(d, daysBehind, daysAhead)` for the news + future
range used by meetings/events.

### Subscriber merge fields on the audience

Set by the post-2026-04-30 form:
- `EMAIL`, `FNAME`, `LNAME`
- `MMERGE6` = Town
- `MMERGE9` = Email Frequency (`daily` | `weekly`; `monthly` removed)
- `MMERGE10` = Proximity Address (optional)
- `MMERGE11` = Proximity Radius miles (optional)

Pre-2026-04-30 form ALSO set MMERGE7 (Sources Subscribed text mirror)
and MMERGE8 (Topics Subscribed text mirror) and `group[7912][N]`
interest-group checkboxes. Those legacy fields may still have values
on existing subscribers but are no longer being WRITTEN by the form
and aren't used for anything in the current campaign segments.

## Email subscriptions / Mailchimp daily digest

**Important architectural fact (easy to misread).** The site has a Mailchimp
signup form (`js/gov-helpers.js` ~line 6357), but **no code anywhere in this
project sends digest emails**. There is no Firebase function, GH workflow,
or Cloudflare Worker that emails subscribers. The form is a vanilla
JSONP-embed signup — it just adds the email + frequency preference to
Mailchimp's audience and stops there.

Layout of the pieces:

| Component                    | Where it lives                                  | Owner          |
| ---------------------------- | ----------------------------------------------- | -------------- |
| Subscribe form (UI)          | `js/gov-helpers.js` ~6357                            | This repo      |
| Mailchimp audience           | `letpeopledecide.us15.list-manage.com`, list `f83dc56387` | Mailchimp UI |
| Frequency preference         | merge field `MMERGE9` ("daily" / "weekly" / …)  | Mailchimp     |
| Topics & sources              | interest groups under category `7912`           | Mailchimp     |
| Source RSS feed for digests  | `https://livabletelluride.org/feed.xml`         | This repo     |
| Daily-send mechanism         | **Mailchimp "RSS-driven email" campaign**        | **Mailchimp UI — must be configured** |

The `feed.xml` half is automated:

- `scripts/build-rss-feed.js` reads `js/gov-helpers.js` (TT articles, KOTO
  newscasts/features, legal notices) and emits `feed.xml` at the repo root.
- The content-refresh workflow runs it every 6 hours alongside the news scrape,
  so the feed is always fresh.
- 7-day window for news, max 30 items, max 8 legal notices.
- GUIDs are stable (`href` for news, synthetic title-hash for legal notices),
  so Mailchimp won't re-send the same item across daily campaigns.

**The other half — actually sending email — is one-time Mailchimp UI work**
that has to happen INSIDE the Mailchimp account at
`https://us15.admin.mailchimp.com/`. Steps (do these once; they keep running
forever):

1. Log in → **Campaigns → Create Campaign → Email → RSS-driven email**.
2. **RSS feed URL:** `https://livabletelluride.org/feed.xml`.
3. **Send schedule:** every day, at the time of day you want the digest to
   land. (Site updates land on the 6h cron, so any time after 12:30 UTC
   includes everything from the morning's refresh.)
4. **Audience:** "Livable Telluride" (audience ID `f83dc56387`).
5. **Segment:** if you want true daily-vs-weekly differentiation, segment by
   merge field `MMERGE9 == "daily"`, then make a second campaign for
   `MMERGE9 == "weekly"` with weekly cadence. Otherwise just send to the
   whole audience and ignore `MMERGE9`.
6. **Subject line:** Mailchimp lets you template with `*|RSSITEM:TITLE|*` and
   `*|RSSFEED:DATE|*` — e.g. `Livable Telluride — *|RSSFEED:DATE|*`.
7. **Confirm sender domain DKIM/SPF** in Mailchimp's domain settings — if
   livabletelluride.org isn't authenticated, deliveries hit spam.
8. **Send a test to your own address** before activating to catch any
   formatting / template issues.

### "I subscribed and got nothing" — debug order

1. **Confirm the user is actually in the Mailchimp audience.** Log into
   Mailchimp → Audience → search for the email. Status should be
   `Subscribed` (not `Pending`, not `Cleaned`, not `Unsubscribed`).
2. **If status is `Pending`**, double opt-in is on (default for Mailchimp).
   Either ask the user to click the confirmation link in their inbox/spam,
   or turn off double opt-in in Audience → Settings → Audience name and
   defaults (only do this if the form privacy policy already covers it).
3. **Confirm a daily campaign actually exists.** Campaigns tab → look for an
   active "RSS-driven email" pointing at livabletelluride.org/feed.xml.
   If there isn't one, that's the bug — set it up per the steps above.
4. **Check the campaign's recent send log.** If sends are failing, the most
   common causes are: feed unreachable (rare — see below), authenticated
   sender domain not set up, or recipient address bouncing.
5. **Confirm the feed itself is fresh and reachable.**
   `curl -I https://livabletelluride.org/feed.xml` should return 200 with
   `Content-Type: application/xml`. If the feed has a stale `lastBuildDate`,
   investigate the content-refresh workflow (see "Common 'news isn't refreshing'"
   above — same pipeline).
6. **Always check spam.** First-send open rates for any new sender domain
   are bad until DKIM/SPF/DMARC is in place; tell the user to whitelist the
   sender in Gmail/Outlook.

### Updating what goes into the digest

`scripts/build-rss-feed.js` is the one place to change the digest contents.
Knobs:

- `MAX_AGE_DAYS = 7` — content older than this is dropped from the feed.
- `MAX_ITEMS = 30` — feed cap.
- `MAX_LEGAL_NOTICES = 8` — never let legal notices push out news.

If you want meeting summaries / Hub-Bub posts / housing listings in the
digest, extend the `main()` builder to read those arrays from `js/gov-helpers.js`
and produce more `buildXItems(...)` flatMaps. The pattern is the same as the
existing news/legal builders.
