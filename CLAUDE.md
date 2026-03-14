# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aston Martin F1 fan site (AMR FANS). Fans earn and spend virtual tokens (AMR coins) through race betting, community boards, attendance, and a shop system. Korean-language UI with auto-translated English news.

**Stack**: Vanilla JS (no framework, no ES modules) + Node.js Express + Firebase Firestore + Vercel deployment.

## Commands

```bash
npm run dev     # Development server with nodemon auto-restart
npm start       # Production server
```

Required env vars are documented in `.env.example`. Firebase Admin SDK credentials and `ADMIN_KEY` (32+ chars) are mandatory.

## Architecture

```
Browser (HTML/CSS/Vanilla JS + Firebase SDK CDN)
    |
    |-- fetch('/api/*') ---------> server.js (Express / Vercel Serverless)
    |                                  |-- Firebase Admin SDK --> Firestore
    |                                  |-- axios/cheerio --> F1 site scraping
    |                                  |-- rss-parser --> Motorsport/Autosport RSS
    |                                  |-- google-translate-api-x --> Korean translation
    |
    |-- Firebase SDK direct -----> Firestore (posts/comments/likes realtime read/write)
    |-- Firebase Auth -----------> Google OAuth login
```

### Client vs Server Responsibility (Critical)

| Client (OK) | Server (MUST) |
|---|---|
| Post/comment CRUD via Firestore | Token grant/deduct (NEVER on client) |
| Like toggle | Betting create/cancel/settlement |
| Read betting records | Odds calculation (client values ignored) |
| UI rendering, form validation | Cooldown/deadline enforcement (server time) |
| News/leaderboard display | News collection/translation, leaderboard aggregation |

### Monolithic server.js

`server.js` is a single ~6000-line file containing all API endpoints (40+), auto-settlement cron, news scraping/translation, and leaderboard aggregation. There is no file splitting.

## JS Load Order (Dependency Chain)

All HTML pages load scripts in this exact order. **Breaking this order causes ReferenceError.**

```
1. Firebase SDK (CDN - gstatic.com)
2. constants.js     -- TIME_MS, TOKEN_CONFIG etc. registered on window
3. utils.js         -- smartFetch, escapeHtml, RACE_SCHEDULE, logger
4. errorHandler.js  -- showToast, showGlobalAlert
5. firebaseConfig.js -- db, auth global variables
6. auth.js          -- signInWithGoogle, getFreshIdToken, tokenManager
7. token.js         -- getUserTokens, updateTokenDisplay
8. Page-specific modules (attendance, paddock, podiumBet, etc.)
```

## Key Patterns

### Global Scope Sharing (No ES Modules)

```javascript
// constants.js -- registers on window
window.TIME_MS = Object.freeze(TIME_MS);
// Other files use directly: TOKEN_CONFIG.ATTENDANCE, TIME_MS.MINUTE
```

### IIFE Module Pattern

Each JS file wraps in IIFE to prevent global pollution, exposing only needed functions via `window.SomeModule`.

### API Authentication

```javascript
// Client
const token = await getFreshIdToken();
fetch('/api/...', { headers: { 'Authorization': `Bearer ${token}` } });

// Server -- verifyFirebaseToken middleware
const decoded = await admin.auth().verifyIdToken(idToken);
req.user = decoded;  // req.user.uid identifies user
```

### smartFetch (utils.js)

All client API calls should use `smartFetch()` which provides cache + timeout + retry.

### XSS Prevention

- User input display: always use `escapeHtml()`
- Profile image URLs: always use `getSafePhotoURL()` (allows only googleusercontent.com, gravatar.com)

### Conditional Logger

```javascript
// utils.js -- production suppresses log/warn, error always outputs
const logger = { log, warn, error };
```

## CSS Architecture

- CSS variables defined in `style.css` `:root` (`--primary-green: #006f62`, `--accent-lime: #c4ff00`, `--bg-base: #1a1a1a`)
- All pages load `style.css` + `token.css` + `errorHandler.css`
- Page-specific CSS loaded only on relevant pages
- Icons: MUST use SVG files from `images/icons/` only. No emoji, no Font Awesome.

## Firebase / Firestore

### Key Collections

| Collection | Purpose | Write Access |
|---|---|---|
| `users` | Profile + token balance | Client: decrease only. Admin SDK: increase |
| `posts` / `posts/{id}/comments` | Community board | Client: own CRUD |
| `likes` | Like records (`{postId}_{userId}` doc ID) | Client: own create/delete |
| `podiumBets`, `headToHeadBets` | Betting records | Admin SDK only |
| `tokenHistory` | Token audit log | Admin SDK only |
| `settlementHistory` | Settlement dedup records | Admin SDK only |
| `leaderboards` | Leaderboard cache (5min refresh) | Admin SDK only |
| `shopItems` | Shop items | Admin SDK only |
| `userInventory` | User owned items | Admin SDK only (write: false) |
| `userCosmetics` | Equipped cosmetics (public read) | Admin SDK only |
| `titles`, `userTitles` | Title system | Admin SDK only |
| `attendance` | Attendance records | Client: create with 24h cooldown |
| `reports` | Reports (admin read only) | Client: create only |

### Security Rules Summary

- `users.tokens`: Client can only decrease (never increase or keep same). Admin SDK bypasses rules.
- Betting/tokenHistory collections: Admin SDK only for all writes.
- Posts `likeCount`/`commentCount`: only +/-1 change allowed per update.
- Admin check: `request.auth.token.admin == true` (Custom Claims).

## Token System

### Earning (all via server API)

| Source | Reward | Limit |
|---|---|---|
| Daily attendance | +10 AMR | 1/day (KST midnight) |
| 7-day streak bonus | +50 AMR | On 7th day |
| First post | +20 AMR | Once per account |
| Betting win | odds x bet amount | Auto-settlement |

### Spending

- Podium bet: 1-1000 AMR/position, total max 3000
- H2H bet: 1-1000 AMR
- Shop cosmetic items

## Betting System

### Podium Odds Formula

```
odds = 1.3 * (1.12)^(rank-1)
Range: 1.1x - 50.0x
```

### H2H Odds Formula (Sigmoid)

```
probA = 1 / (1 + e^(0.25 * (rankA - rankB)))
oddsA = 1 / (probA * 1.08)    // 8% house edge
Range: 1.05x - 15.0x
Low odds abuse prevention: odds < 1.15x -> max 50 AMR bet
```

### Auto-Settlement

- OpenF1 API for race results
- Batch size: 166 (Firestore 500-op batch limit / 3 ops per bet)
- Retry: max 3 times, 2s delay
- Dedup: `settlementHistory` collection

## Deployment (Vercel)

`vercel.json` routes `/api/*` to `server.js` (Serverless Function via `@vercel/node`), everything else served as static files.

## Development Checklist

When adding new features:

- Token-related: Create server API endpoint in `server.js` (never grant tokens client-side)
- User input display: Apply `escapeHtml()`
- New Firestore collection: Add security rules in `firestore.rules`
- Time validation: Use server time (KST), not client time
- Constants: Sync both `js/constants.js` AND `server.js`
- API calls: Use `smartFetch()`
- Error handling: Follow `showToast`/`showGlobalAlert` pattern
- Double-click prevention: Add `isXxxInProgress` flag
- Icons: Use SVG from `images/icons/` only

## Documentation

Detailed architecture docs are in `docs/`:
- `ARCHITECTURE_OVERVIEW.md` - Full system architecture with diagrams
- `PROJECT_RULES_AND_FLOW.md` - Rules and flow for each feature
- `PRACTICAL_PATTERNS.md` - Code patterns and design decisions
- `PROJECT_STRUCTURE.md` - File structure reference
