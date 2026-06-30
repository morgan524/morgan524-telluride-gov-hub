# Firestore security rules & Hub-Bub auth

_Split out of CLAUDE.md 2026-06-22. Server-side rules in firestore.rules, the admin-email check, the dropped email-verification flow, and the protected collections._

## Firestore security rules — single source of truth is `firestore.rules`

The site's Firebase Firestore rules live in `firestore.rules` at the repo
root, wired up via `firebase.json`. They enforce server-side what the
client-side admin check (`user.email === 'info@livabletelluride.org'`,
~6 callsites across `js/hub-bub.js` and `js/gov-helpers.js`) cannot — without
these rules, any authenticated user can DevTools their way into deleting
any post, flipping `approved: true` on any comment, or stuffing reaction
counters, because the client checks alone are bypassable.

**Email verification was DROPPED 2026-05-28 — do not reintroduce.** The
verify flow was too unreliable (emails to spam, dead-end Firebase landing
page, stale tokens, device rate-limits) and blocked legitimate users.
`isVerifiedUser()` in `firestore.rules` no longer checks `email_verified`
— it now means "signed in with a real email account (password signup, not
anonymous) OR admin." The matching client gates in `js/hub-bub.js`
(hbExpandCompose, post/reply/reaction submits, hbUpdateAuthUI) were also
relaxed to only require a logged-in user, and `hub-bub.html` no longer
sends verification emails or shows verify/resend UI. All three layers must
stay consistent. See the `hub-bub-auth` memory note for the full picture.
Also note Hub-Bub runs TWO Firebase SDKs (modular v11 inline + compat v10
in hub-bub.js), posts must carry BOTH `authorUid` (rule) and `authorId`
(legacy readers), and photo uploads are governed by `storage.rules`
(deploy with `firebase deploy --only storage`).

**Collections protected:**
- `users/{uid}` — owner writes only (or admin)
- `posts/{postId}` + `posts/{postId}/replies/{replyId}` — verified users
  create their own, author or admin edits/deletes; counter fields
  (`replyCount`, `reactions`, `lastReplyAt`) can be bumped by other
  verified users via a `diff().affectedKeys().hasOnly([...])` allow-list
- `replies` (top-level, legacy) — same shape as the subcollection
- `reactions/{docId}` — signed-in users (including anonymous Firebase
  Auth users) can create/update counters; admin-only delete. As of
  2026-05-14 the client uses Firebase Auth uid as the voter identifier
  (see `getVoterId()` in `js/gov-helpers.js`) and the rules enforce that
  every write must place the caller's uid into at least one of the
  voters arrays (`attending_voters`, `matters_voters`, `learn_voters`,
  `concerns_voters`, `handled_voters` — the suffixes of `QR_OPTIONS` in
  `js/gov-data.js`). If you ever change `QR_OPTIONS`, update `firestore.rules`
  to match or reactions silently fail to write.

  **Manual one-time setup required:** anonymous Firebase Auth must be
  enabled in the Firebase Console (Authentication → Sign-in method →
  Anonymous → Enable). Until it is, anonymous visitors fall back to a
  localStorage fingerprint that the new rules reject, so reactions only
  work for users who have signed into Hub-Bub. The fallback logs a
  one-time `console.warn` with the enable URL so you'll spot it in DevTools.
- `govhub_comments/{commentId}` — anyone signed-in can create with
  `approved: false`; admin flips to `approved: true`; the `useful`
  counter is the only field other users can update
- Default-deny on any unmatched path

**Deploy:**
```bash
firebase deploy --only firestore:rules
# or paste firestore.rules into:
# Firebase Console → Firestore Database → Rules → Publish
```

**If you rotate the admin email** — currently `info@livabletelluride.org`
— update BOTH the client check sites (grep for the literal string) AND
the `isAdmin()` function in `firestore.rules`. The two MUST agree.

**Future improvement:** replace email-based admin check with Firebase
Custom Claims (`request.auth.token.admin == true`) set via the Firebase
Admin SDK. That eliminates the email-as-identity coupling and lets you
have multiple admins without touching code. Out of scope for the
initial rules deploy.
