# Regional sections in the weekly email

The weekly email (`scripts/weekly-email.js`) includes **Last Week's Meetings,
Recapped**: short teasers of the meeting recaps from the five business days
(Mon–Fri) before the email's week, each linking to the full recap on
`gov-hub-past.html#r-…`. Rico and TMVOA recaps never appear in the email (they
stay on the website).

**Since 2026-10-04** the same recaps also go out as their own opt-in Monday
email, **Past Meetings** (`scripts/past-meetings-email.js`): one non-regional
list to the `sub_past_meetings` audience through its own broadcast
(`CUSTOMERIO_PAST_BROADCAST_ID`, broadcast 5). The weekly's bottom box (where
the donate box was) invites readers to sign up.

**Public Meetings This Week** is regional too, using the same body map
plus **Rico in the East End** (`MEETING_REGIONS`; Ophir is already East End).
Bodies in no region (e.g. TMVOA) appear only in the all-area list. A region
with nothing scheduled gets a "No public meetings in your area" note linking
to Gov-Hub.

**What to Attend** is regional too: each region gets its own best event per
day (`eventRegion()` places an event by its location/title, then its source
feed; Rico events have no region). A day with nothing local takes a fallback
pick so the list stays a full week: West End falls back to the East End pick,
the others to the all-area pick. Readers with no region get the list as it has
always been.

Each reader sees the list for their region (`customer.region`, set from the
profile form's Region field):

| Region | Bodies |
|---|---|
| East End | Town of Telluride, Mountain Village, Telluride R-1 School District, SMART, Telluride Regional Airport, Telluride Regional Medical Center, San Miguel County, Ophir, Telluride Fire Protection District |
| West End | Norwood, SMART, San Miguel County |
| Ridgway/Ouray | City of Ouray, Ouray County, Town of Ridgway |
| *(blank)* | Everything above |

The mapping lives in `scripts/lib/recap-regions.js` (`RECAP_REGIONS`).

## How the email carries it

The email file ships each regional section as an ALL copy plus hidden East
End / West End / Ridgway/Ouray copies between `<!--LT-RGN-->` markers
(`scripts/lib/recap-regions.js`). The regional copies are wrapped in
`<!--[if !mso]><!--><tbody style="display:none;">` … `</tbody><!--<![endif]-->`,
so anything that renders the file as-is (Review Desk preview, blog archive)
shows only the ALL copies.

## How it is sent (digest Worker)

Customer.io caps a broadcast trigger's `data` at **50 KB**, and an email
carrying every regional copy is 110 KB+ (the 422 "data exceeds the 50KB
limit", 2026-09-30). So `ltSendBroadcast()` in
`cloudflare-worker/livabletelluride-digest/worker.js` splits a regional email
into four one-region emails and sends each as its own trigger of the same
broadcast, with a `recipients` filter:

| Send | Recipients |
|---|---|
| East End | broadcast audience AND `region` = "East End" |
| West End | broadcast audience AND `region` = "West End" |
| Ridgway/Ouray | broadcast audience AND `region` = "Ridgway/Ouray" |
| everyone else | broadcast audience AND NOT any of the three |

API recipients **replace** the audience set in the UI, so the Worker restates
it, looking the segments up by name: Weekly Digest = "Weekly Update
subscribers" AND NOT "Yahoo & AOL Recipients"; Weekly Digest TEST = "Me Only".
If those segments are renamed, set `CUSTOMERIO_WEEKLY_AUDIENCE` /
`CUSTOMERIO_TEST_AUDIENCE` (a JSON recipients filter) on the Worker.

Customer.io allows one broadcast trigger every 10 seconds, so a regional send
takes about 35 seconds. Every version is size-checked before the first send, so
an oversized email is refused whole rather than half-sent. Emails without
regional sections (one-off newsletters) still go out as one trigger to the
broadcast's UI audience.

**Style compression.** Each regional email is 30–53 KB raw. With
`CIO_TEMPLATE_DICT = "1"` (wrangler.toml `[vars]`), the Worker replaces every
repeated long inline style / site URL prefix / UTM string with a short `§n§`
token and sends the originals once in `trigger.dict`; the template below
expands them. That brings the largest version to ~36 KB. Only turn it on once
**both** broadcasts carry the template below — otherwise readers see raw
`§n§` codes.

## Customer.io template (both broadcasts)

Paste this over the whole body of the **Weekly Digest Email** action in
**Weekly Digest TEST** (broadcast 2) and **Weekly Digest** (broadcast 1). It
expands `trigger.dict` (a no-op when there is none) and keeps the existing
merge-tag replacements. Its output is byte-identical to the original template
for uncompressed emails (verified with liquidjs), so it is safe to paste before
compression is switched on.

```liquid
{% assign region_value = customer.region | default: "" %}{% capture unsub %}{% unsubscribe_url %}{% endcapture %}{% assign lt_body = trigger.body %}{% for lt_d in trigger.dict %}{% assign lt_body = lt_body | replace: lt_d.k, lt_d.v %}{% endfor %}{{ lt_body | replace: '*|UNSUB|*', unsub | replace: '*|EMAIL|*', customer.email | replace: '*|FNAME|*', customer.first_name | replace: '*|MMERGE6|*', region_value }}
```

The original template, for rollback:

```liquid
{% assign region_value = customer.region | default: "" %}{% capture unsub %}{% unsubscribe_url %}{% endcapture %}{{ trigger.body | replace: '*|UNSUB|*', unsub | replace: '*|EMAIL|*', customer.email | replace: '*|FNAME|*', customer.first_name | replace: '*|MMERGE6|*', region_value }}
```

The subject field's "undefined variable: trigger" warning in the editor is a
preview artifact (no trigger data loaded) and does not affect sending.

Test with the Review Desk's **full-process test**: the TEST broadcast then
sends four emails, and you receive the one for your own `region`.
