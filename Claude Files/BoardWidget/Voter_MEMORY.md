# Board Vote Tracker — Project Memory

*A context primer for picking this project back up (e.g. in Claude Desktop). Paste or
open this file at the start of a new chat to restore the full picture of how the
Livable Telluride board voting system works and where it stands.*

---

## What this is
A self-contained voting system for the **Livable Telluride** board (a 501(c)(3) civic
news nonprofit). It emails each board member a personalized HTML ballot, records their
**Yes / No / Abstained** vote when they click a button, tracks everything in a Google
Sheet, and emails the final result to everyone once the last person votes. Matters are
often votes on an attached document (budget, motion, resolution).

## Why it's built the way it is
HTML email clients strip JavaScript, so a button in an email can't write to a Sheet on
its own. The working pattern: each button is a **signed link** to a **Google Apps Script
web app** bound to the Sheet. Clicking the link records the vote and shows a confirmation
page. Links carry an HMAC token so they can't be guessed or forged. Re-clicking a
different option changes a vote (last click wins); every click is also logged.

## Architecture
- **One Google Sheet** = the database. Tabs: `Board`, `Votes`, `Log`.
- **One Apps Script project** (Extensions ▸ Apps Script), bound to that Sheet, with files:
  - `Code.gs` — all server logic (send ballots, record votes, tally, result email, optional AI summary).
  - `Ballot.html` — the personalized ballot email (Yes / No / Abstain + optional "open document" button).
  - `Confirmation.html` — the page a member sees after voting (shows their choice + live tally).
  - `Result.html` — the result email sent to all members when voting completes.
  - `Compose.html` — the "New matter" dialog (title, matter text, optional file upload, summary override).
- **Deployed as a Web App** (Execute as: Me, Access: Anyone) so members can click links without a Google login.

## Deployment URL (current)
`https://script.google.com/macros/s/AKfycbw932V45fnstX-ZJ5cNdBV96jsnl83LsIaIePVPCIE1sVSpkY3iJDC5rY8jmE9k6wsVxA/exec`

The script discovers this URL itself via `ScriptApp.getService().getUrl()` — it is **not**
hardcoded anywhere. The URL only changes if a *brand-new* deployment is created. When
updating the script, always use **Manage deployments ▸ Edit ▸ New version** (not New
deployment) so existing ballot links keep working.

## Board members (5)
Morgan Smith · Keith Hill · John Metzger · David Lavender · Emily Masson
Names + emails live on the **Board** tab (rows 2–6). The script reads members from there,
so adding/removing a member is a Sheet edit, not a code change.

## Votes tab — the record (exact column order)
`Date · Matter ID · Summary · Document · Morgan Smith · Keith Hill · John Metzger · David Lavender · Emily Masson · Yes · No · Abstained · Result`

- One row per matter. Each member cell holds Yes / No / Abstained and carries a note with
  the exact date/time they voted.
- The five member columns (E–I) **must** match the order of names in Board rows 2–6, or
  votes land under the wrong name. Running **Board Votes ▸ Set up sheets** guarantees this.
- `Log` tab = append-only audit trail of every click.

## Key rules / config
- **Majority threshold:** 3 of 5 (Passed if Yes ≥ 3, Failed if No ≥ 3, else Pending).
- **Abstentions** are tracked separately and do **not** count toward the majority.
- **Result email** fires when all members have voted, once per outcome. If a member later
  changes a vote and the result flips, the new result emails once; toggling back to the
  same outcome won't resend.
- **Document upload (optional):** attached to every ballot and saved to a Drive folder
  ("Board Vote Documents") with a view link in the Document column. Keep files under ~24 MB.
  Sharing is currently **"anyone with the link can view"** (so members on any email domain
  can open without login) — revisit if documents are ever sensitive.
- **Auto-summary (optional):** if an `ANTHROPIC_API_KEY` is set in Script Properties, each
  matter is summarized from its text via the Anthropic API (Haiku). No key = first lines of
  the matter text are used. Billed separately from a Claude subscription; pennies per matter.

## How to use it (normal workflow)
1. **Board Votes ▸ New matter & send ballot.** Enter a title, paste the matter text,
   optionally attach a document. It summarizes, creates the Votes row, and emails all five
   members their ballots.
2. Each member clicks **Yes / No / Abstain** once. Their vote fills the Votes row; the tally
   and result update live; they see a confirmation page.
3. When the fifth member votes, everyone gets the **result email** (final tally, Passed/Failed,
   and how each member voted).
4. **Re-send if needed:** Board Votes ▸ Re-send ballot for a matter (enter the Matter ID).

## Setup recap (if rebuilding from scratch)
1. New Google Sheet ▸ Extensions ▸ Apps Script.
2. Add the five files above (HTML files via the **+ ▸ HTML** button; exact names, no extension).
3. Reload the Sheet ▸ **Board Votes ▸ Set up sheets** (creates tabs + headers). Approve permissions.
4. Fill in board emails on the Board tab.
5. **Deploy ▸ New deployment ▸ Web app** (Execute as: Me, Access: Anyone).
6. (Optional) Add `ANTHROPIC_API_KEY` in Project Settings ▸ Script Properties; test via
   **Board Votes ▸ Test summary API key**.

## Current status (as of last session, June 2026)
- Web app **deployed and live** at the URL above.
- Sheet tabs **Board / Votes / Log created**; column headers added.
- Default `Sheet1` can be deleted (script doesn't use it).
- **Next step: a solo end-to-end test** — temporarily leave only Morgan's name+email on the
  Board tab, send a ballot, click a vote, and confirm: vote lands in Votes, confirmation page
  shows, and (since it's a 1-person board) the result email arrives. Then restore all five
  members before going live.

## Open decisions / to confirm
- Confirm 3-of-5 majority is the desired threshold.
- Decide whether uploaded documents should stay "anyone with link" or be locked to specific
  accounts.
- Optionally add the Anthropic API key to enable real auto-summaries.
- Possible future enhancement discussed: per-member Google-login verification for stronger
  vote authentication (not built — current model trusts the tokenized links).

## v2 (2026-06-16): motion / second / vote + PDF record

The flow is now parliamentary, driven by a **live status page** (one email per
member with a tokenized link; the page shows the right control for the current
stage and updates as others act):

- **Move to Approve** — first click wins the motion; also records that member's Yes.
- **Second** — any *other* member; also records their Yes; opens voting and sends a
  one-time "voting is now open" email to all.
- **Yes / No / Abstain** — GATED: inert until both a motion and a second exist.
- **PDF record** — when decided (majority either way, or all voted), the script builds
  a PDF (motion text, summary, mover+seconder w/ times, each member's vote, tally,
  result) via `Utilities.newBlob(html,'text/html').getAs('application/pdf')`, saves it
  to Drive folder **"Board Vote Records"** (anyone-with-link), writes the link into the
  Votes tab `Record PDF` column, and emails it to all members as an attachment.

**Action links use `?act=move|second|yes|no|abstain`** (param name `act`, plain `<a>`
links so anonymous/external members work; verified `act` passes Google's edge).

**New Votes-tab columns** (run Set up sheets after upgrading; old rows must be deleted):
`Date | Matter ID | Title | Summary | Document | Motion Text | Moved By | Moved At |
Seconded By | Seconded At | <member1..5> | Yes | No | Abstained | Result | Record PDF`.
Indices live in the `COL` object + `tallyCols_(n)` in Code.gs.

**Files:** `Code.gs` + `Compose.html` (unchanged) + `Ballot.html` (invite / voting-open
email, `phase` var) + `Confirmation.html` (the live action page) + `Result.html`
(result email + PDF). Editing the live project still needs Deploy > New version.

## Gotchas (hard-won)

- **Never name a web-app query parameter `c`.** Google's edge rejects any request
  to `…/exec?c=<anything>` (yes/no/abstain — all of them) with **HTTP 400**, which
  renders as a generic **"Google Drive — Sorry, unable to open the file"** page —
  *before* `doGet` ever runs. This silently broke every vote link for days. The
  vote choice param is therefore named **`ch`** (not `c`): links are
  `?m=…&v=…&ch=yes&k=…` and `doGet` reads `p.ch`. Verified empirically on the live
  deployment: `?ch=yes` → 200, `?c=yes` → 400. `m`, `v`, `k` are all fine.
- **Hardcode `WEB_APP_URL`.** `ScriptApp.getService().getUrl()` on this
  Workspace-owned (info@livabletelluride.org) script returns a **domain-scoped**
  URL (`/a/livabletelluride.org/macros/…` or `/a/macros/livabletelluride.org/…`)
  that 404s for anyone not signed into the org — and even info@ gets redirected to
  the broken form. The code now hardcodes the public `/macros/s/<id>/exec` URL of
  the "Anyone" deployment in the `WEB_APP_URL` const; `webAppUrl_()` prefers it.
- **Two-sided change = redeploy.** Link generation (`voteUrl_`) runs from the editor
  head code at send time; vote recording (`doGet`) runs from the **deployed
  snapshot**. After editing either, you must **Deploy ▸ Manage deployments ▸ Edit ▸
  New version** AND send a *fresh* ballot — old emails keep their old (broken) links.
- **Source backup lives in the repo** at `Claude Files/BoardWidget/` (Code.gs +
  Compose/Ballot/Confirmation/Result .html). The deployed Apps Script project once
  had *only* Code.gs (the four HTML files were never pasted in → "No HTML file named
  Compose"). Keep the repo copy in sync when editing the live project.

## Note on the source files
The deployable files (`Code.gs`, `Ballot.html`, `Confirmation.html`, `Result.html`,
`Compose.html`) and `SETUP.md` were generated in the working session that produced this
memo. If they're not at hand, they can be regenerated from this description.
