# Email-to-events ingestion pipeline

_Split out of CLAUDE.md 2026-06-22. The events@ Gmail → Apps Script → Google Sheet → content-refresh Task 5 pipeline, its debug runbook, the current-state baseline, and the six install gotchas._

## Email-to-events ingestion pipeline

The site lets community members get events on the calendar without filing a
PR or using the form: forward an email about the event to
`events@livabletelluride.org` and the system parses + queues + publishes it.
This is structurally similar to the Mailchimp pipeline (a signup form on the
site, but the actual sending lives elsewhere) — the parsing and queueing
live INSIDE a Google account, not in this repo.

**Pipeline stages (data flows top-to-bottom):**

```
   1. Sender (you, a community member, an org)
        forwards an event email to:        events@livabletelluride.org
        │
        ▼
   2. Google Apps Script (deployed inside the events@ Gmail account)
        - polls 'is:unread -label:Processed' every 5 minutes
        - parses date/location/time/description with regexes
        - writes a row to the "Event Inbox" Google Sheet
        - applies a "Processed" Gmail label so each thread runs once
        - emails info@livabletelluride.org a receipt summary
        Source: email-to-events-appscript.SOURCE.js at the repo root.
        The .SOURCE suffix is a flag — this file does not run anywhere.
        The deployed copy lives inside the events@ Gmail account at
        Extensions → Apps Script. Edits here are reference-only until
        someone manually pastes them into the Apps Script editor.
        │
        ▼
   3. Google Sheet "Event Inbox", published as CSV.
        URL stored in email-events-config.json (sheetCsvUrl).
        Headers: Status | Title | Date | EndDate | Location | Time |
        Description | SourceURL | SubmittedAt | EmailSubject | EmailFrom
        │
        ▼
   4. GH Actions content-refresh.yml — Task 5 (syncEmailEvents())
        - every 6 hours, fetches the CSV
        - parses rows, writes them to community-events.json at the repo root
        - bumps Status from "new" to "added" for items it picks up
        │
        ▼
   5. The site reads community-events.json and renders events on the
      Events tab. Each event displays date / location / description / link.

   6. (Round-trip) Apps Script's checkAddedEvents() polls the Sheet every
      10 minutes for rows whose Status = "added" and emails info@ a "now
      live on site" confirmation, then bumps Status to "notified".
```

**Important deployment fact:** the Apps Script in this repo is the *source
copy*. The actual running script lives inside the Gmail account at
`events@livabletelluride.org` — Extensions → Apps Script. If `EMAIL-EVENTS-SETUP.md`
hasn't been completed end-to-end (script pasted, `setupTrigger` run once,
auth granted), nothing happens at stage 2 even though stages 3-5 still pull
from an empty Sheet.

### "I forwarded an event and it never showed up" — debug order

Walk this in order; each step rules out one stage of the pipeline.

1. **Confirm the email actually arrived at events@.** Log into the Gmail
   account; check Inbox + Spam. If it's missing, the issue is upstream
   (sender's deliverability, Google's spam filter, etc.) — not on us.

2. **Confirm the Apps Script is deployed and running.** In the Gmail
   account: Extensions → Apps Script → check the project is present and
   `setupTrigger` was run. Triggers tab should show two:
   `processNewEmails` (every 5 min) and `checkAddedEvents` (every 10 min).
   If those don't exist, paste the contents of
   `email-to-events-appscript.SOURCE.js` (at the repo root) into the
   Apps Script editor, save, then run `setupTrigger` once and authorize.
   See the file's top-of-file header for full deploy instructions.

3. **Check the Apps Script's Execution log.** Apps Script editor → Executions
   tab. Look for recent `processNewEmails` runs and what they logged. The
   script verbose-logs whether it found unread threads, which subjects it
   processed, and which fields it parsed. If runs are failing, the error
   trace is here.

4. **Confirm the Sheet has a new row.** Open the "Event Inbox" Sheet. Each
   forwarded email should produce one row with Status=`new`. If the Apps
   Script ran but no row appeared, the parser bailed (rare).

5. **Confirm the published CSV is up to date.** Sometimes Google Sheets'
   "Publish to web" caches aggressively:
   `curl -sL '<sheetCsvUrl from email-events-config.json>' | head`.
   If the live CSV doesn't show your new row even though the Sheet does,
   re-publish (File → Share → Publish to web → Publish again).

6. **Confirm the GH Action picked it up.** Latest content-refresh run logs
   should show `Task 5: Syncing email events ... Found N events from sheet`
   and `Wrote N events to community-events.json`. If it logs `No events in
   sheet`, the CSV is empty — go back to step 5.

7. **Confirm the site is rendering it.** Hard-refresh livabletelluride.org
   (Cmd-Shift-R). If `community-events.json` was updated but the Events tab
   still doesn't show the event, the cache buster on `index.html`'s
   reference to gov-hub.js / community-events.json may need bumping.

### Current state baseline (as of 2026-04-30)

- `email-events-config.json` has `sheetCsvUrl` set; the URL responds 200
  with `Content-Type: text/csv` — publish is configured.
- The published Sheet currently has **0 data rows**. Every content-refresh
  run logs "No events in sheet". `community-events.json` was last touched
  on 2026-03-27 and only contains the hardcoded Telluride Balloon Festival
  entry.
- This means either no event emails have been forwarded yet (most likely),
  or the Apps Script half of the pipeline isn't actually deployed in the
  events@ Gmail account. Walk the debug order above to tell which.

### Six gotchas hit during the 2026-04-30 install — read this before debugging

These all came up during the events@ deployment that day and are easy to
fall into again. All have been fixed in the codebase, but the symptoms can
recur if the wrong copy of the script is pasted, the Sheet is recreated
under a different tab name, or someone reverts a content-refresh fix.

**1. The Apps Script's `SHEET_NAME` is a TAB name, not a file name.**

`SHEET_NAME = 'Event Inbox'` is matched against `getSheetByName()`, which
returns the sheet *tab* with that exact name. When a user creates a new
spreadsheet, names the *file* "Event Inbox", and pastes headers into the
default tab (which is still called `Sheet1`), the script can't find a tab
called "Event Inbox" — so it *creates a second tab* called "Event Inbox"
and writes rows there. The user keeps refreshing the `Sheet1` tab and sees
nothing, while rows pile up in the script-created tab.

Symptom: receipt notification email arrives with a Sheet URL, but when you
open the Sheet you see no rows.

Fix: at the bottom of the Sheets window, look for the tab bar. Either
delete the empty `Sheet1` and let the script-created `Event Inbox` tab
become the only/active tab, or rename `Sheet1` to `Event Inbox` (after
first deleting the script-created duplicate).

**2. Publishing "Entire Document" as CSV serves only the first/active tab.**

Even after fixing gotcha #1, if the wrong tab is the first one, publish-to-web
serves the wrong tab. Re-publishing the same Sheet always returns the same
opaque `pub` URL, so re-publishing won't help unless you also delete the
unwanted first tab. After deleting, click File → Share → Publish to web →
**Stop publishing**, then click Publish to web → Publish *again*. Confirm
the new URL serves the rows you expect (`curl -sL '<url>' | head`).

**3. Drive can quietly accumulate duplicate "Event Inbox" spreadsheets.**

If the Apps Script gets installed in two different spreadsheets (e.g. user
reinstalled, or duplicated the file in Drive) and `setupTrigger` was run in
both, Gmail polling runs twice and writes to two different sheets. The
receipt URLs in the notification emails will start pointing at different
spreadsheet IDs depending on which copy of the script ran most recently.

Fix: open Drive in the events@ account, search "Event Inbox", trash any
duplicates, and confirm there is only ONE script project bound to the
remaining Sheet (Apps Script editor → its left-rail Triggers count should
be exactly 2: one `processNewEmails` and one `checkAddedEvents`).

**4. The Apps Script's body-cleanup regex used to eat user "Date:" lines.**

The original `parseEventEmail()` did:
```js
body = body.replace(/^From:.*$/im, '');
body = body.replace(/^Date:.*$/im, '');
body = body.replace(/^Subject:.*$/im, '');
body = body.replace(/^To:.*$/im, '');
```
unconditionally — to clean up forwarded-message headers. But for non-forwarded
mail, it *also* stripped the user's literal "Date: May 15, 2026" line,
producing rows with empty Date. Fixed: those replaces now only run when
`---------- Forwarded message ----------` is actually present in the body.

If you see Date columns coming through empty for non-forwarded events,
the deployed Apps Script is probably the pre-fix version. Confirm by
opening Extensions → Apps Script and Cmd-F for "Forwarded message" — the
fixed version has `if (/^-+\s*Forwarded message\s*-+/im.test(body)) {`.

**5. content-refresh.js Task 5's CSV parser used to split on raw commas.**

Google Sheets exports cells like `"Town Park, Telluride"` and multi-line
descriptions as RFC 4180-quoted fields with embedded commas / newlines.
The previous `lines.split('\n')` + `vals.split(',')` parser shifted every
column right by one whenever a Location had a comma in it, and split a
multi-line description across multiple rows.

Fixed: there's now a tiny inline RFC-4180 parser (`parseCSV()`) in
`scripts/content-refresh.js` that handles quoted commas / quoted newlines /
escaped quotes. If you see column-shift bugs in `community-events.json`
(time = "Telluride", description = "4:00 PM - 8:00 PM" pattern), someone
reverted that parser.

**Status-column allow-list:** Task 5 only emits rows whose `Status` is
empty, `new`, or `added`. To suppress a row from going to the live site,
set Status to anything else (`skipped`, `duplicate`, `notified`, etc.).

**6. Pre-fix `main()` only wrote `community-events.json` when `events.length > 0`.**

Effect: marking every Sheet row as `skipped` (or sending zero events
through Task 5 for any reason) left the previous JSON in place forever.
Once a stale event landed in `community-events.json`, you couldn't unstick
it without manual intervention — the next refresh would skip the write
because there was nothing to write, and the old contents persisted on the
live site indefinitely.

Fix: the script now writes `community-events.json` whenever
`syncEmailEvents()` returned successfully, including the empty-array case.
It also short-circuits to a no-op when the new JSON is byte-identical to
the previous content, so we don't churn unnecessary commits.

Symptom of a regression: after the user marks a row `skipped` and triggers
a refresh, Task 5 logs `Found 0 events from sheet` but the row keeps
appearing on the Events tab. If `community-events.json` on `origin/main`
also still has the row even though the Sheet doesn't, someone reverted
this fix.

### Operational notes for editing the pipeline

- **Editing the parser?** Update `email-to-events-appscript.SOURCE.js`
  here AND paste the updated copy into the events@ Gmail account's
  Apps Script editor. Without the second step the live behavior does
  not change. The `.SOURCE` suffix in the filename and the prominent
  header comment exist specifically to prevent this footgun.
- **Changing Sheet shape?** Headers must match `appendToSheet()`'s order
  exactly (Status | Title | Date | EndDate | Location | Time | Description |
  SourceURL | SubmittedAt | EmailSubject | EmailFrom). Reordering breaks
  the CSV parsing in `scripts/content-refresh.js` Task 5.
- **Rotating the Sheet?** If the Sheet is replaced (new file, new URL),
  publish-to-web the new one and update `email-events-config.json` with
  the new `sheetCsvUrl`. No restart needed; the next 6h cron picks it up.
