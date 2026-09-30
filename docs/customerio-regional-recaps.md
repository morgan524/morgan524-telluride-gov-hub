# Regional sections in the weekly email

The weekly email (`scripts/weekly-email.js`) includes **Last Week's Meetings,
Recapped**: short teasers of the meeting recaps from the five business days
(Mon–Fri) before the email's week, each linking to the full recap on
`gov-hub-past.html#r-…`. Rico and TMVOA recaps never appear in the email (they
stay on the website).

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

The broadcast template does **not** render Liquid inside `trigger.body`, so the
email ships every variant and the template picks one. Each regional section is

```
<!--LT-RGN--> ALL <!--LT-RGN--> East (hidden) <!--LT-RGN--> West (hidden) <!--LT-RGN--> Ridgway/Ouray (hidden) <!--LT-RGN-->
```

so an email with k regional sections splits on `<!--LT-RGN-->` into 5k+1
parts: part *i* is shared email content when *i* mod 5 = 0, otherwise the ALL
(1), East End (2), West End (3) or Ridgway/Ouray (4) copy of a section.

The regional copies are wrapped in
`<!--[if !mso]><!--><tbody style="display:none;">` … `</tbody><!--<![endif]-->`,
so anything that renders the body as-is (direct test sends, the Review Desk
preview, the blog archive, or a template without the region logic) shows only
the ALL copies.

## One-time Customer.io template change

Paste this over the whole body of the **Weekly Digest Email** action, first in
**Weekly Digest TEST** (broadcast 2), then **Weekly Digest** (broadcast 1).
It keeps the existing merge-tag replacements unchanged and picks the reader's copy of every regional section:

```liquid
{% assign region_value = customer.region | default: "" %}{% capture unsub %}{% unsubscribe_url %}{% endcapture %}{% assign lt_body = trigger.body | replace: '*|UNSUB|*', unsub | replace: '*|EMAIL|*', customer.email | replace: '*|FNAME|*', customer.first_name | replace: '*|MMERGE6|*', region_value %}{% assign lt_parts = lt_body | split: "<!--LT-RGN-->" %}{% assign lt_extra = lt_parts.size | modulo: 5 %}{% if lt_parts.size > 1 and lt_extra == 1 %}{% assign lt_region = region_value | strip %}{% assign lt_off = 1 %}{% if lt_region == "East End" %}{% assign lt_off = 2 %}{% elsif lt_region == "West End" %}{% assign lt_off = 3 %}{% elsif lt_region == "Ridgway/Ouray" %}{% assign lt_off = 4 %}{% endif %}{% for lt_p in lt_parts %}{% assign lt_m = forloop.index0 | modulo: 5 %}{% if lt_m == 0 %}{{ lt_p }}{% elsif lt_m == lt_off %}{{ lt_p | remove: '<!--[if !mso]><!--><tbody style="display:none;">' | remove: '</tbody><!--<![endif]-->' }}{% endif %}{% endfor %}{% else %}{{ lt_body }}{% endif %}
```

The template it replaces (as of 2026-09-30), for rollback:

```liquid
{% assign region_value = customer.region | default: "" %}{% capture unsub %}{% unsubscribe_url %}{% endcapture %}{{ trigger.body | replace: '*|UNSUB|*', unsub | replace: '*|EMAIL|*', customer.email | replace: '*|FNAME|*', customer.first_name | replace: '*|MMERGE6|*', region_value }}
```

An email without markers takes the `else` branch and is sent exactly as before
(verified against the original template with liquidjs).

Test it with the Review Desk's **full-process test** (the test broadcast),
setting your own profile's region to each value in turn.
