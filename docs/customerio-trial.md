# Customer.io trial — parallel test alongside Mailchimp

Goal: prove out how Livable Telluride's **per-interest** updates would work in
Customer.io, **without disturbing the live Mailchimp setup**. Mailchimp stays
the system of record; Customer.io gets a handful of test people only until
we're satisfied.

## Status / checklist

- [x] Customer.io account + `Livable Telluride` workspace (US data center)
- [x] Track API key created → stored as GitHub secrets
      `CUSTOMERIO_SITE_ID`, `CUSTOMERIO_TRACK_API_KEY`
- [ ] **App API key** created → secret `CUSTOMERIO_APP_API_KEY` (needed only to
      *send* broadcasts; not needed to seed people)
- [x] Seed script + workflow (`scripts/customerio-test.js`,
      `.github/workflows/customerio-test.yml`)
- [ ] Run the seed workflow, confirm test people appear in **People**
- [ ] Build one **segment per interest** (recipes below)
- [ ] Build a test **broadcast/newsletter** → send to one segment → verify
- [ ] (later) Daily-digest builder + scheduled send

> ⚠️ The original Track key was visible in a screenshot during setup — regenerate
> it in Customer.io if that wasn't already done, and re-set the secret.

## Attribute schema (trial source of truth)

People are identified by **email** (lowercased). Each interest is a boolean
attribute that mirrors a Mailchimp interest 1:1:

| Customer.io attribute | Type | Mailchimp equivalent |
|---|---|---|
| `email` | string (identifier) | EMAIL |
| `first_name` | string | FNAME |
| `region` | string | MMERGE6 (Region) |
| `sub_newsletter` | bool | "Newsletter" interest `24641` |
| `sub_weekly_update` | bool | "Weekly Update" interest `24642` |
| `topic_music_arts` | bool | Event Topics → "Music & Arts" |
| `topic_gov_meetings` | bool | Event Topics → "Government Meetings" |
| `topic_family_kids` | bool | Event Topics → "Family & Kids" |
| `topic_outdoors_rec` | bool | Event Topics → "Outdoors & Recreation" |
| `source` | string | (trial marker, e.g. `trial-seed`) |
| `sub_daily` | bool | *(future)* — the daily-update opt-in, not in Mailchimp |

The big win over Mailchimp: one person can match several segments and receive a
**single combined** message, instead of separate per-group campaigns.

## Segment recipes (build in Customer.io → Segments → Create → attribute-based)

Each is a one-condition data segment:

- **Newsletter** — `sub_newsletter` is `true`
- **Weekly Update** — `sub_weekly_update` is `true`
- **Topic · Music & Arts** — `topic_music_arts` is `true`
- **Topic · Government Meetings** — `topic_gov_meetings` is `true`
- **Topic · Family & Kids** — `topic_family_kids` is `true`
- **Topic · Outdoors & Recreation** — `topic_outdoors_rec` is `true`
- **Daily Update** *(future)* — `sub_daily` is `true`

## How sending will work (once the App API key exists)

A scheduled GitHub Action builds the digest HTML (same approach as
`scripts/weekly-email.js`) and triggers a Customer.io **broadcast** via the App
API, targeted at the relevant segment. Weekly and daily can each be their own
segment + their own scheduled trigger, so a subscriber gets exactly the
cadence(s) they opted into.

## Running the seed test

```bash
gh workflow run customerio-test.yml --repo morgan524/morgan524-telluride-gov-hub
```

Then watch the run; success looks like `✓ 200 <email>` per person. Confirm in
Customer.io → **People** (filter `source = trial-seed`). Edit the `PEOPLE`
array in `scripts/customerio-test.js` to add more test addresses.
