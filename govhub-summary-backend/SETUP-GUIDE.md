# Telluride Gov Hub — Claude AI Summary Pipeline Setup Guide

## Architecture Overview

```
┌─────────────────────────┐
│  GitHub Pages (static)  │
│  telluride-gov-hub.html │
│                         │
│  On page load:          │
│  fetch /getSummaries    │────────┐
│                         │        │
│  Renders meeting cards  │        │
│  with AI summaries      │        ▼
└─────────────────────────┘  ┌───────────────────────┐
                             │  Firebase Cloud Funcs  │
                             │                        │
                             │  getSummaries (batch)  │
                             │  getSummary (single)   │
                             │  refreshSummary (admin)│
                             │  refreshUpcoming (bulk)│
                             │  scheduledRefresh (6h) │
                             │  adminStatus           │
                             │                        │
                             │  Calls Claude API      │◄── Anthropic API Key
                             │  Extracts agenda text  │    (stored in Firebase
                             │  Caches in Firestore   │     config, never in
                             └──────────┬─────────────┘     browser)
                                        │
                                        ▼
                             ┌───────────────────────┐
                             │  Firestore Database    │
                             │                        │
                             │  summaries/{docId}     │
                             │  - shortSummary        │
                             │  - topics[]            │
                             │  - whyItMatters        │
                             │  - agendaHash          │
                             │  - generatedAt         │
                             └───────────────────────┘
```

**Why this is safer than putting Claude in the browser:** The Anthropic API key
never leaves the server. Cloud Functions act as a secure middleman — the browser
only reads cached summaries from Firestore via the Cloud Function HTTP endpoint.

## Prerequisites

1. **Firebase project:** Already exists (`telluride-gov-hub`). The HTML file
   already has Firebase/Firestore configured for comments.
2. **Anthropic API key:** Get one from https://console.anthropic.com
3. **Firebase CLI:** Install with `npm install -g firebase-tools`
4. **Node.js 20+**

## Step-by-Step Deployment

### 1. Install Firebase CLI and log in

```bash
npm install -g firebase-tools
firebase login
```

### 2. Set up the backend project

```bash
cd govhub-summary-backend
firebase use telluride-gov-hub
cd functions
npm install
cd ..
```

### 3. Configure secrets

Store the Anthropic API key and admin secret securely in Firebase config
(never in code or environment files):

```bash
# Set your Anthropic API key
firebase functions:config:set anthropic.api_key="sk-ant-api03-YOUR-KEY-HERE"

# Set an admin secret (you'll use this in the admin dashboard)
firebase functions:config:set govhub.admin_secret="your-random-admin-secret-here"
```

To verify:
```bash
firebase functions:config:get
```

### 4. Deploy Firestore security rules

```bash
firebase deploy --only firestore:rules
```

### 5. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

After deployment, you'll see URLs like:
```
✔ Function getSummary: https://us-central1-telluride-gov-hub.cloudfunctions.net/getSummary
✔ Function getSummaries: https://us-central1-telluride-gov-hub.cloudfunctions.net/getSummaries
✔ Function refreshSummary: https://us-central1-telluride-gov-hub.cloudfunctions.net/refreshSummary
✔ Function refreshUpcoming: https://us-central1-telluride-gov-hub.cloudfunctions.net/refreshUpcoming
✔ Function scheduledRefresh: https://us-central1-telluride-gov-hub.cloudfunctions.net/scheduledRefresh
✔ Function adminStatus: https://us-central1-telluride-gov-hub.cloudfunctions.net/adminStatus
```

### 6. Update the HTML file

In `telluride-gov-hub.html`, verify this line near the top of the summary
section matches your actual Cloud Functions URL:

```javascript
const GOVHUB_FUNCTIONS_BASE = 'https://us-central1-telluride-gov-hub.cloudfunctions.net';
```

### 7. Push the updated HTML to GitHub

Copy the updated `telluride-gov-hub.html` content to the GitHub repo.

## Testing

### Test a single summary

```bash
curl "https://us-central1-telluride-gov-hub.cloudfunctions.net/getSummary?source=telluride&date=2026-03-31&title=Town%20Council&agendaUrl=https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=XXXX"
```

### Test the batch endpoint (what the frontend calls)

```bash
curl "https://us-central1-telluride-gov-hub.cloudfunctions.net/getSummaries?days=30"
```

### Test the admin status

```bash
curl -H "x-govhub-admin-key: your-admin-secret" \
  "https://us-central1-telluride-gov-hub.cloudfunctions.net/adminStatus"
```

### Force refresh a summary

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-govhub-admin-key: your-admin-secret" \
  -d '{"source":"telluride","date":"2026-03-31","title":"Town Council","agendaUrl":"https://..."}' \
  "https://us-central1-telluride-gov-hub.cloudfunctions.net/refreshSummary"
```

## Admin Dashboard

Open `admin.html` in your browser (it's a local file — no server needed).
Enter the Cloud Functions URL and your admin secret, then click Connect.

From the dashboard you can:
- See all cached summaries and their status
- Force-refresh any individual summary
- Bulk-refresh all summaries in the next 7 or 30 days
- See whether each summary has topic bullets and "why it matters" context

## How Summaries Get Updated

1. **Automatic (every 6 hours):** The `scheduledRefresh` Cloud Function runs
   automatically. It checks all summaries for meetings in the next 30 days,
   re-fetches each agenda URL, and regenerates the summary if the agenda
   text has changed.

2. **Manual admin refresh:** Use the admin dashboard or the API endpoints.

3. **On-demand (first request):** When a viewer loads the page and a meeting
   has no cached summary, the frontend doesn't call Claude directly — it just
   shows the manual fallback. To generate AI summaries for new meetings, use
   the admin dashboard's "Refresh Next 30 Days" button.

## Firestore Summary Document Schema

```
Collection: summaries
Document ID: "{source}|{YYYY-MM-DD}|{meetingTitle}"

Fields:
  source          string      Entity key (telluride, county, etc.)
  date            string      YYYY-MM-DD
  meetingTitle    string      Meeting name
  shortSummary    string      1-3 sentence card summary
  topics          string[]    3-6 bullet key topics
  whyItMatters    string      Context paragraph (may be empty)
  agendaUrl       string      URL of agenda that was summarized
  agendaHash      string      Hash for change detection
  sourceText      string      First 2000 chars of extracted text
  generatedAt     timestamp   When summary was generated
  model           string      Claude model used
  error           string      Error message if generation failed
```

## Cost Estimates

- **Claude API:** ~$0.01-0.03 per summary (Sonnet, ~500 input + ~300 output tokens)
- **At 50 meetings/month:** ~$0.50-1.50/month in Claude costs
- **Firebase:** Free tier covers this easily (50K reads/day, 20K writes/day)
- **Cloud Functions:** Free tier covers 2M invocations/month

## Fallback Behavior

If the Cloud Functions endpoint is unreachable:
1. `loadAISummaries()` logs a warning to console
2. `getMeetingSummary()` falls through to `MANUAL_SUMMARIES`
3. All existing cards render exactly as before — no broken UI
4. The `ai-badge`, topic bullets, and "why it matters" simply don't appear

## Files Created

```
govhub-summary-backend/
  ├── firebase.json            # Firebase project config
  ├── .firebaserc              # Project alias
  ├── firestore.rules          # Security rules
  ├── firestore.indexes.json   # Firestore indexes
  ├── admin.html               # Admin dashboard (open locally)
  └── functions/
      ├── package.json         # Dependencies
      └── index.js             # All Cloud Functions
```

## Modifications to telluride-gov-hub.html

1. **MEETING_SUMMARIES → MANUAL_SUMMARIES:** Renamed to clarify it's the fallback.
2. **New: AI_SUMMARIES + loadAISummaries():** Fetches from Cloud Function on load.
3. **Modified: getMeetingSummary():** Checks AI cache first, then manual fallback.
4. **New: getMeetingTopics(), getAIWhyItMatters():** Read AI-specific fields.
5. **Modified: renderMeetings(), renderMeetingsWithTopic():** Show AI topic
   bullets, "AI Summary" badge, and "why it matters" section when available.
6. **New CSS:** `.ai-topics-list`, `.ai-badge`, `.ai-why-matters`
7. **New: loadAISummaries() call** in the page init block.
