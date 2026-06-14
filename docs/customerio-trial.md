# Customer.io trial — parallel test alongside Mailchimp

Goal: prove out how Livable Telluride's **per-interest** updates would work in
Customer.io, **without disturbing the live Mailchimp setup**. Mailchimp stays
the system of record during the trial; Customer.io gets a handful of test
people only until we're satisfied.

## Decisions (2026-06-13)

- **End state: eventually FULLY MIGRATE to Customer.io** and retire Mailchimp
  once confident. Build toward that, but keep Mailchimp running in parallel
  through the trial.
- **First milestone: the weekly "Week Ahead"** — reproduce the email currently
  built by `scripts/weekly-email.js` and send it from Customer.io to a
  **Weekly Update** segment. (Daily digest is a later add — its own segment +
  morning trigger — even though it was the original motivation.)

## Status / checklist

- [x] Customer.io account + `Livable Telluride` workspace (US data center)
- [x] Track API key → secrets `CUSTOMERIO_SITE_ID`, `CUSTOMERIO_TRACK_API_KEY`
- [x] **App API key** → secret `CUSTOMERIO_APP_API_KEY`
      ⚠️ Gotcha that cost us several rounds: the **App API key lives on its own
      "App API keys" tab**, NOT the "Create Track API Key" button. Track keys
      and the Site ID are 20 hex chars; a real App API key is **32 chars**.
      `customerio-appcheck.js` prints `key shape: length=…` so a wrong (20-char)
      paste is obvious.
- [x] Seed script + workflow (`scripts/customerio-test.js`,
      `.github/workflows/customerio-test.yml`) — 2 test people seed OK
- [x] App API auth verified (`scripts/customerio-appcheck.js` → `✓ HTTP 200`,
      lists the 9 built-in default segments)
- [ ] Build one **segment per interest** (recipes below) — only the built-in
      defaults exist so far
- [ ] **Verify a sending domain** (workspace is in "test mode" until then —
      no real delivery). Recommend a dedicated subdomain so it's separate from
      the Mailchimp DKIM on the apex.
- [ ] Build the **weekly send** → target the Weekly Update segment → test to
      one address → verify
- [ ] (later) Daily-digest builder + scheduled morning send
- [ ] (later) Full-list import + signup/profile-update wiring → migrate off
      Mailchimp

> ⚠️ The Track key was visible in screenshots during setup — regenerate it in
> Customer.io when convenient and re-set the secret.

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
