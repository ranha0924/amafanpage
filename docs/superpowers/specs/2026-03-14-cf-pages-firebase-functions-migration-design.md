# F1 FANS: Cloudflare Pages + Firebase Cloud Functions Migration

**Date**: 2026-03-14
**Status**: Reviewed
**Previous**: Vercel (static + serverless Express)
**Target**: Cloudflare Pages (static) + Firebase Cloud Functions Gen 2 (API) + Cloudflare Worker (proxy)

---

## 1. Architecture

```
User → f1fans domain (Cloudflare DNS)
       │
       ├── Static requests (HTML/CSS/JS/IMG) → Cloudflare Pages
       │
       └── /api/* requests → Cloudflare Worker (proxy)
                                    │
                                    ▼
                             Firebase Cloud Functions Gen 2
                             (timeout: 300s, minInstances: 1)
                                    │
                                    ▼
                              Firestore DB
```

### Why This Architecture

- **Cloudflare Pages**: Global CDN for static files, automatic HTTPS, GitHub auto-deploy
- **Cloudflare Worker proxy**: Keeps `/api/*` relative paths intact so frontend code needs zero changes. Eliminates CORS issues (same origin).
- **Firebase Cloud Functions Gen 2**: Runs existing Express app with all Node.js dependencies (firebase-admin, axios, cheerio, rss-parser, google-translate-api-x). Gen 2 offers longer timeouts (up to 60min), concurrency, and Cloud Run backing.
- **No frontend code changes**: Worker proxy preserves same-origin `/api/*` routing

### Prerequisites

- **Firebase Blaze plan** (pay-as-you-go) required for Cloud Functions
- Cloudflare account (free tier sufficient for Pages + 1 Worker)

## 2. Components

### 2.1 Firebase Cloud Functions

**Entry point** (`functions/index.js`):
- Imports adapted `server.js` which exports Express `app`
- Exports as `onRequest()` HTTP function with `{ timeoutSeconds: 300, minInstances: 1 }`
- Exports scheduled functions from `scheduled.js`

**Adapted server.js** (`functions/server.js`):
- **Add**: `module.exports = app` at the end
- **Remove**: `express.static(__dirname)`, `app.listen()`, all `node-cron` imports/jobs, `setInterval`/`setTimeout` polling, `require('dotenv').config()`
- **Replace**: `process.exit(1)` calls → `throw new Error(...)` (3 places - prevents Cloud Functions crash loops)
- **Keep**: All `/api/*` route handlers, middleware (CORS, security headers, body parsing), Firebase Admin init, helper functions
- **Change**: In-memory caches (news, driver standings) → Firestore cache documents with TTL
- **Simplify**: Firebase Admin init uses Application Default Credentials (no explicit env vars needed in Cloud Functions)

**Initialization logic** (currently inside `app.listen()` callback):
- `initRacesCollection()`, `fetchAllNews()`, `fetchServerDriverStandings()`, `refreshLeaderboardCache()` → Move to module-level or lazy init on first request
- These cannot run at import time (would slow cold starts). Use a one-time init flag pattern.

**Scheduled functions** (`functions/scheduled.js`):
8 scheduled functions replacing node-cron + setInterval:

1. `refreshLeaderboard` - every 5 minutes
2. `weeklyReset` - Monday 00:00 KST
3. `monthlyReset` - last day of month 23:55 KST
4. `seasonEndCheck` - daily 00:00 KST
5. `processExpiredRentals` - hourly
6. `refreshDriverStandings` - hourly at :30
7. `deleteOldNews` - daily 03:00 KST
8. `refreshNewsCache` - every 30 minutes (replaces setInterval)

**Auto-settlement** (currently setTimeout polling chain):
- Replace with smart scheduled function (`checkAndSettleRaces`) every 5 minutes
- Checks `RACE_SCHEDULE` to determine if a race recently ended (within 3 hours)
- Only calls OpenF1 API and processes settlement when race window is active
- No-ops when no race is active (saves invocations and cost)
- Idempotent: dedup via settlementHistory collection (already exists)

**RACE_SCHEDULE sync**:
- `RACE_SCHEDULE` exists in both `js/utils.js` (client) and `server.js` (server)
- Extract to shared `shared/raceSchedule.json` file
- Both `functions/server.js` and `js/utils.js` import from this file
- Alternative: Keep duplicated with a lint check (simpler, matches current pattern)

**File structure:**
```
functions/
├── index.js           # Cloud Functions entry point (exports onRequest + scheduled)
├── server.js          # Adapted Express app (no static/listen/cron, exports app)
├── scheduled.js       # 9 scheduled functions (7 cron + news refresh + settlement)
├── package.json       # Dependencies (firebase-admin, express, axios, cheerio, etc.)
└── .env               # Local dev only (not committed)
```

### 2.2 Cloudflare Pages

**Source**: GitHub repo root (excludes `functions/` directory)
**Build**: None required (static HTML/CSS/JS)
**Deploy**: Auto-deploy on push to main branch

**Included files:**
- `*.html` (index, paddock, betting, shop, leaderboard, mypage, etc.)
- `css/*`, `js/*`, `images/*`
- `404.html` (custom error page)

**Excluded from Pages** (via `.cfignore`):
- `functions/`, `server.js`, `node_modules/`, `scripts/`, `.env*`, `docs/`, `CLAUDE.md`

### 2.3 Cloudflare Worker (API Proxy)

Simple ~20 line Worker that:
1. Intercepts requests matching `/api/*`
2. Forwards to Firebase Cloud Functions URL (stored as Worker env var `FUNCTIONS_BASE_URL`)
3. Passes through all headers (including Authorization), body, and method
4. Returns the Cloud Functions response to the client

**Route precedence**: Worker routes take priority over Pages on the same Cloudflare zone. Configure `domain.com/api/*` as Worker route in Cloudflare Dashboard.

Deployed as a Cloudflare Worker Route on the custom domain.

### 2.4 DNS & Domain

- Purchase domain via Cloudflare Registrar (cheapest option, no markup)
- DNS managed by Cloudflare (automatic with purchase)
- Pages custom domain: `domain.com` and `www.domain.com`
- Worker route: `domain.com/api/*` → Worker

## 3. Migration Details

### 3.1 What Changes

| Component | Before (Vercel) | After (CF + Firebase) |
|---|---|---|
| Static files | Vercel CDN | Cloudflare Pages CDN |
| API server | Vercel Serverless (server.js) | Cloud Functions Gen 2 (300s timeout, minInstances: 1) |
| Cron jobs | node-cron in server process | Firebase Scheduled Functions (9 functions) |
| Rate limiting | express-rate-limit (in-memory) | Cloudflare Rate Limiting (edge) |
| News cache | In-memory Map | Firestore `caches/news` document |
| Driver standings cache | In-memory | Firestore `caches/driverStandings` document |
| Auto-settlement | setTimeout polling chain | Smart scheduled function (5-min, race-aware) |
| News refresh | setInterval 30min | Scheduled function every 30 min |
| Domain/SSL | Vercel auto | Cloudflare auto |
| Logging | Vercel logs | Google Cloud Logging (Firebase Console) |

### 3.2 What Stays the Same

- All 40+ API endpoint logic (unchanged)
- Firebase Auth flow (unchanged)
- Firestore data model (unchanged)
- Frontend code (unchanged - Worker preserves /api/* paths)
- Security headers middleware (unchanged)
- CORS middleware (update allowed origins only)

### 3.3 Environment Variables

**Cloud Functions** (set via `firebase functions:secrets:set`):
- `ADMIN_KEY` (required, 32+ chars)
- `ALLOWED_ORIGINS` (update to new domain)
- `DISCORD_WEBHOOK_URL` (optional)
- Note: Firebase credentials NOT needed (Application Default Credentials auto-injected)

**Cloudflare Worker** (set via Wrangler or Dashboard):
- `FUNCTIONS_BASE_URL` (Cloud Functions URL, e.g. `https://api-xxxx.a.run.app`)

## 4. Cron to Scheduled Functions Detail

All scheduled functions use `timeZone: 'Asia/Seoul'` (KST).

| # | Function | Schedule | Replaces |
|---|---|---|---|
| 1 | refreshLeaderboard | every 5 minutes | node-cron `*/5 * * * *` |
| 2 | weeklyReset | Monday 00:00 | node-cron `0 0 * * 1` |
| 3 | monthlyReset | 28-31st 23:55 | node-cron `55 23 28-31 * *` |
| 4 | seasonEndCheck | daily 00:00 | node-cron `0 0 * * *` |
| 5 | processExpiredRentals | hourly | node-cron `0 * * * *` |
| 6 | refreshDriverStandings | hourly at :30 | node-cron `30 * * * *` |
| 7 | deleteOldNews | daily 03:00 | node-cron `0 3 * * *` |
| 8 | refreshNewsCache | every 30 minutes | setInterval NEWS_CACHE_TTL |
| 9 | checkAndSettleRaces | every 5 minutes | setTimeout polling chain |

**checkAndSettleRaces logic:**
```
1. Check RACE_SCHEDULE for race that ended within last 3 hours
2. If no active race window → return (no-op, saves cost)
3. Query unsettled bets from Firestore
4. Fetch race results from OpenF1 API
5. Process settlement (existing logic, already idempotent)
```

## 5. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Cold start latency | Gen 2 `minInstances: 1` keeps one instance warm |
| Worker proxy latency | Cloudflare edge → Cloud Run is ~50ms. Acceptable. |
| In-memory cache loss | Firestore cache docs with TTL. Slightly slower but persistent. |
| Rate limiting across instances | Cloudflare edge rate limiting (5 rules matching current limiters) |
| `process.exit()` crashes | Replace with `throw new Error()` (3 locations) |
| `app.listen()` init logic | Move to lazy init with one-time flag |
| google-translate-api-x blocked from GCP IPs | Monitor; fallback to Google Cloud Translation API if needed |
| Scheduled function costs | Smart settlement (race-aware) reduces unnecessary invocations |
| Cloud Functions timeout | Set 300s explicitly; news translation on cold start is slow |
| Worker/Pages route conflict | Worker routes take precedence; configure `/api/*` route explicitly |

## 6. Deployment Steps

1. **Firebase setup**: Ensure Blaze plan, enable Cloud Functions Gen 2
2. **Create `functions/` directory**: Adapt server.js (remove static/listen/cron, add exports, fix process.exit)
3. **Extract scheduled functions**: 9 functions in `scheduled.js`
4. **Local test**: `firebase emulators:start` to test API + scheduled functions
5. **Deploy Cloud Functions**: `firebase deploy --only functions`
6. **Test API**: Verify all endpoints via Cloud Functions URL directly
7. **Cloudflare Pages**: Connect GitHub repo, configure build (none), deploy
8. **Cloudflare Worker**: Deploy proxy script, configure route
9. **Domain**: Purchase via Cloudflare, configure Pages custom domain + Worker route
10. **Update ALLOWED_ORIGINS**: Add new domain to Cloud Functions secrets
11. **Verify**: Full site functionality on new domain
12. **Parallel run**: Keep Vercel active for 1-2 weeks as rollback
13. **Cleanup**: Remove Vercel project, `vercel.json` after stable period
