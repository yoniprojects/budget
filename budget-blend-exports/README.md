# Budget Blend scheduled export emails

Two GitHub Actions workflows that read your budget data straight from
Firestore (the same doc the app itself uses) and email you:

- **Daily backup** (`daily-backup.yml`) — the same JSON as the app's "Export
  backup" button, once a day.
- **Monthly Excel export** (`monthly-excel.yml`) — the same .xlsx as the
  app's "Export to Excel" button, once a month, targeting 23:59 Israel time
  on the last day of the month.

No server of your own is needed — GitHub runs these on its own schedule for
free.

## One-time setup

### 1. Create a private GitHub repo

Push this folder to a **private** repository (it will hold a service account
key as a secret, so keep it private regardless).

### 2. Get a Firebase service account key

In the [Firebase console](https://console.firebase.google.com/), open your
`budget-1d27f` project → gear icon → **Project settings** → **Service
accounts** tab → **Generate new private key**. This downloads a JSON file —
keep it safe, it grants full access to your Firestore data.

### 3. Create a Gmail app password

Your regular Gmail password won't work for SMTP. In your Google Account →
**Security** → turn on **2-Step Verification** (if not already on) → **App
passwords** → create one (name it e.g. "budget-blend-exports"). Copy the
16-character password it gives you.

### 4. Add GitHub repo secrets

In your repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**, add each of these:

| Secret name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The **entire contents** of the service account JSON file from step 2, pasted as-is |
| `FIRESTORE_SECRET_ID` | Your app's `SECRET_ID` value (find it near the top of `budget_blend.html`, next to `firebaseConfig`) |
| `GMAIL_USER` | The Gmail address to send *from*, e.g. `you@gmail.com` |
| `GMAIL_APP_PASSWORD` | The 16-character app password from step 3 |
| `BACKUP_TO_EMAIL` | The address to send *to* (can be the same Gmail address) |

### 5. Enable and test

Workflows in a new repo are enabled automatically. To test without waiting
for the schedule: repo → **Actions** tab → pick a workflow → **Run
workflow** (this works because both workflows include a manual
`workflow_dispatch` trigger). Check the run logs, then check your inbox.

## Schedule notes

- **Daily backup** runs at 00:00 UTC (~02:00–03:00 Israel time, depending on
  daylight saving). Edit the `cron:` line in `daily-backup.yml` if you'd
  prefer a different time — exact timing doesn't matter much for a daily
  backup.
- **Monthly Excel export** runs twice a day (20:59 and 21:59 UTC) but only
  actually *sends* on one of those two runs — the script checks the real
  current time in `Asia/Jerusalem` and only proceeds when it's 23:59 Israel
  time **and** the last day of the month. This two-cron trick is what makes
  it correct across the daylight-saving change without drifting.
- GitHub's scheduler isn't perfectly precise — during periods of high load
  across GitHub, a scheduled run can start a few minutes late. Not
  something to worry about for either of these.

## What's NOT included in the daily backup email

The app's "Export backup" button also includes two small UI preferences —
`hiddenCategories` and `theme` — but those live only in your browser's
`localStorage`, never in Firestore. Since this script reads only Firestore,
it can't include them. Everything that holds actual budget data (period,
categories, income sources, budgets, transactions, and the full yearly
archive) IS included — that's the part that actually matters for a backup.

## Files

```
lib/
  _template.js     - the blank .xlsx template (base64), copied from the app
  xlsxExport.js     - ports buildExportWorkbook() from the app, unchanged logic
  firestore.js      - reads the budgetApp/{SECRET_ID} Firestore doc
  email.js          - sends an email with one attachment via Gmail SMTP
scripts/
  daily-backup.js   - entry point for the daily workflow
  monthly-excel.js  - entry point for the monthly workflow
.github/workflows/
  daily-backup.yml
  monthly-excel.yml
```
