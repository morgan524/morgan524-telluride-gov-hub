# Livable Telluride — First Weekly Review — 2026-06-13

## A. Non-technical summary
The site is in **good health (🟢)**. All 8 automated jobs ran successfully today/this week, no
secrets are exposed, the community-forum security rules are solid, and the news/meeting/event
pipelines are current. **One thing needs your decision (High):** confirm that the *weekly
subscriber email is actually being sent* in Mailchimp — the system builds and emails you a draft,
but the send to ~900 subscribers is a manual step, and the maintenance log says no
auto-campaign has ever gone out. Two easy improvements (Medium): add `robots.txt` + `sitemap.xml`
so search engines index civic pages, and decide whether to front the domain with Cloudflare so we
can add security headers (GitHub Pages can't). No Critical issues.

## B. Verified facts (this review)
- Deploy: GitHub Pages, `livabletelluride.org` (CNAME), branch `main`, no build step.
- **Workflows — all green:** content-refresh `15:04Z`, maintenance `14:11Z`, weekly-preview
  `15:16Z`, smc-watch `14:26Z` (all today); housing-refresh 6/11, citation-audit 6/01,
  deploy-worker 6/12, festival-ticket-check 6/08. **No open GitHub issues** (no failure issues).
- **Architecture respected:** no page loads `js/gov-hub.js` (only stale comments mention it);
  gov-data.js + gov-helpers.js split intact; `sw.js` CACHE_NAME `livable-tlr-v19-20260612`.
- **Secrets:** 7 GH secrets, all expected; ANTHROPIC_API_KEY rotated today 13:43Z. **No `.env`,
  service-account, or private-key files tracked.** Only client-side key is the **public** Firebase
  Web API key (by design).
- **Firebase:** firestore.rules (16 KB) + storage.rules (4 KB); **default-deny**; admin =
  `info@livabletelluride.org` server-enforced; per-collection create/update/delete gates; reaction
  counters allow-listed; submissions admin-gated; Storage writes scoped to owner-uid or admin.
- **Worker + feed (indirectly verified):** content-refresh does a Worker `/health` preflight and
  **fails the run if the Worker is down** — it ran green at 15:04Z, so the Worker is healthy and
  `feed.xml` was rebuilt today.

## C. Could-not-verify-from-review-environment (run these)
- Live security headers: `curl -I https://livabletelluride.org/` (and Mozilla Observatory).
- feed.xml `lastBuildDate`: `curl -s https://livabletelluride.org/feed.xml | grep lastBuildDate`.
- Worker JSON: `curl -s https://livabletelluride-rss-proxy.morgan-8f0.workers.dev/health`.
- Mailchimp campaign **send** history + groups (Mailchimp UI/API).
- Email-to-events Apps Script trigger/auth (Google account for events@).
- Lighthouse/axe/page-speed (run `@lhci/cli` + `@axe-core/cli`).

## D. Pipeline dashboard
| System | Status | Last success | Risk | Notes |
|---|---|---|---|---|
| Content refresh | ✅ Pass | 2026-06-13 15:04Z | Low | summaries+news+events+feed |
| RSS feed.xml | ✅ Fresh (indirect) | 2026-06-13 15:04Z | Low | rebuilt every content-refresh |
| Housing refresh | ✅ Pass | 2026-06-11 | Low | daily |
| Community events (Task 5) | ✅ Pass (indirect) | 2026-06-13 | Low | within content-refresh |
| Maintenance | ✅ Pass | 2026-06-13 14:11Z | Low | wrote 6 advisory warnings |
| Citation audit | ✅ Pass | 2026-06-01 | Low | monthly |
| smc-watch | ✅ Pass | 2026-06-13 14:26Z | Low | |
| festival-ticket-check | ✅ Pass | 2026-06-08 | Low | |
| deploy-worker | ✅ Pass | 2026-06-12 | Low | auto-deploys Worker |
| GitHub Pages deploy | 🟡 Unverified | — | Low | confirm latest commit live |
| Cloudflare Worker /health | ✅ OK (indirect) | 2026-06-13 15:04Z | Low | preflight passed |
| Weekly Mailchimp SEND | 🟡 Needs owner confirm | — | **High** | review email ≠ subscriber send |
| Email-to-events | 🟡 Unverified | — | Medium | Apps Script outside repo |

## E. Findings (risk-classified)

### CRITICAL — none.

### HIGH
1. **Weekly subscriber email may not be reaching subscribers.** `maintenance-issues.log`:
   *"No RSS-driven Mailchimp campaigns have EVER been sent."* The current design (Option A) is a
   **manual REGULAR campaign**: `scripts/weekly-email.js` builds the HTML, the Saturday workflow
   emails a *review copy to `info@`*, and the owner pastes it into Mailchimp and clicks Send. If
   that manual send isn't happening, ~900 subscribers get nothing. **Status: Needs owner decision.**
   - *Action:* Mailchimp → Campaigns — confirm a Weekly Update campaign was *sent* this week. If
     not, either commit to the weekly manual send, or we wire an automated path (a regular-campaign
     create+send via the Mailchimp API in a workflow). Also update maintenance.yml's Mailchimp
     check to look for the regular campaign, not RSS (see Medium #3) so the warning stops misleading.

### MEDIUM
2. **No `robots.txt` / `sitemap.xml`.** ✅ **FIXED 2026-06-13 (commit f3b82cc)** — added both
   (sitemap = 27 public pages). Follow-up: auto-maintain the sitemap in content-refresh.
3. **Maintenance Mailchimp check is obsolete.** ✅ **FIXED 2026-06-13 (commit f3b82cc)** —
   `checkMailchimpDigests` now drops the `type=rss` filter, checks for ANY sent campaign on a
   weekly (216h) cadence, and is reworded for the manual Weekly Update regular-campaign model.
4. **No custom security headers.** GitHub Pages cannot set `Content-Security-Policy`,
   `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
   `X-Content-Type-Options`. HTTPS + HSTS-via-preload exist at the platform level, but app-level
   headers are absent. *Mitigation: proxy `livabletelluride.org` through the existing Cloudflare
   account and add headers via a Transform Rule / Worker; or accept the limitation.* Status: Needs
   owner decision. (Unverified live — run Observatory to confirm exact current headers.)
5. **`TT_AUTH_COOKIE` will expire.** The Telluride Times authenticated-scrape cookie (set 2026-05-05)
   has no expiry tracking; when it lapses, TT news silently degrades. *Fix: add a maintenance probe
   that flags TT 401/empty results; document a refresh procedure.* Status: Open.
6. **Link-checker false positives.** maintenance-issues.log flags KOTO + Ridgway URLs as dead
   (403) — these are runner-IP blocks, not real breakage (they work in a browser). *Fix: route the
   link checker's KOTO/Ridgway/CivicWeb checks through the Worker, or allow-list 403 for those
   hosts, so genuine dead links aren't buried.* Status: Open. (One item — a **2022** Ridgway
   packet PDF — may be genuinely gone; verify.)

### LOW
7. Stale comments referencing `gov-hub.js` in events.html/gov-hub.html/legal-notices.html/
   local-news.html (no functional impact; cleanup).
8. Admin identity is email-based (`info@`) rather than Firebase Custom Claims — a documented,
   acceptable tradeoff; future hardening (single admin today).
9. `CLOUDFLAIR_WORKER` secret name is a typo (cosmetic; works).

## F. Proposed safe patches (for review — NOT applied)

**robots.txt** (new file at repo root):
```
User-agent: *
Allow: /
Sitemap: https://livabletelluride.org/sitemap.xml
```

**sitemap.xml** — generate from the 31 HTML pages. Best as a tiny content-refresh step so it stays
current; minimal static version:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://livabletelluride.org/</loc></url>
  <url><loc>https://livabletelluride.org/gov-hub.html</loc></url>
  <url><loc>https://livabletelluride.org/events.html</loc></url>
  <url><loc>https://livabletelluride.org/local-news.html</loc></url>
  <url><loc>https://livabletelluride.org/housing.html</loc></url>
  <url><loc>https://livabletelluride.org/deep-dives.html</loc></url>
  <url><loc>https://livabletelluride.org/hub-bub.html</loc></url>
  <url><loc>https://livabletelluride.org/local-orgs.html</loc></url>
  <url><loc>https://livabletelluride.org/about.html</loc></url>
  <url><loc>https://livabletelluride.org/donate.html</loc></url>
  <!-- + legal-notices, privacy-policy, community-guidelines, each deep-dive-*.html -->
</urlset>
```
(I can produce the full sitemap from all 31 pages and a content-refresh step to auto-maintain it.)

**maintenance.yml Mailchimp check** — change the assertion from "an RSS campaign sent in 48h" to
"a *regular* Weekly Update campaign sent in 8 days" (or remove it and rely on the owner checklist).

## G. Prioritized developer action list
1. **(High, owner)** Confirm/repair the weekly Mailchimp *send*; fix the obsolete maintenance check.
2. **(Medium)** Add `robots.txt` + `sitemap.xml` (+ auto-maintain sitemap in content-refresh).
3. **(Medium, owner)** Decide on Cloudflare-proxy for security headers; if yes, add CSP/HSTS/etc.
4. **(Medium)** Add a TT_AUTH_COOKIE liveness probe; route link-checker through the Worker for
   KOTO/Ridgway/CivicWeb.
5. **(Low)** Remove stale gov-hub.js comments; (later) move admin to Firebase Custom Claims.
6. **Run once now:** Lighthouse + axe + Observatory baselines into `baselines/`; `gitleaks detect`
   full-history; `cd scripts && npm audit`.

## H. Likely high-risk areas (from CLAUDE.md + this review)
- The **manual** weekly Mailchimp send (human-in-the-loop → easiest thing to silently lapse).
- **Worker allow-list ↔ PROXY_HOSTS drift** (mitigated: preflight + deploy-worker auto-deploy).
- **Apps Script** pieces (events@ ingestion, lede reply-watcher) — outside the repo, can lose auth.
- **Summary accuracy** — agenda extraction + Claude; key rotation already bit once (2026-06-13).
- **Email-based admin** — single point; rules are server-enforced but key the whole moderation/admin
  surface to one inbox's security.
