# CF Pages + Firebase Cloud Functions Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate F1 FANS from Vercel to Cloudflare Pages (static) + Firebase Cloud Functions Gen 2 (API) with a Cloudflare Worker proxy.

**Architecture:** Static files served by Cloudflare Pages CDN. API requests (`/api/*`) routed through a Cloudflare Worker proxy to Firebase Cloud Functions Gen 2, which runs the adapted Express app. Scheduled tasks (cron) replaced by Firebase Scheduled Functions.

**Tech Stack:** Firebase Cloud Functions Gen 2, Cloudflare Pages, Cloudflare Workers, Express.js, Firestore

**Spec:** `docs/superpowers/specs/2026-03-14-cf-pages-firebase-functions-migration-design.md`

---

## Chunk 1: Firebase Cloud Functions Project Setup

### Task 1: Create functions/ directory and package.json

**Files:**
- Create: `functions/package.json`
- Create: `functions/.env.example`

- [ ] **Step 1: Create functions/package.json**

```json
{
  "name": "f1fans-functions",
  "description": "F1 FANS Firebase Cloud Functions",
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "dependencies": {
    "firebase-admin": "^13.6.0",
    "firebase-functions": "^6.3.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "rss-parser": "^3.13.0",
    "google-translate-api-x": "^10.7.2",
    "express-rate-limit": "^7.5.1"
  }
}
```

- [ ] **Step 2: Create functions/.env.example**

```
# Cloud Functions에서 자동 주입되는 값 (설정 불필요):
# - Firebase Admin SDK 인증 (Application Default Credentials)

# 수동 설정 필요 (firebase functions:secrets:set 으로 설정):
ADMIN_KEY=your_secret_admin_key_32chars_minimum
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

- [ ] **Step 3: Run npm install**

```bash
cd functions && npm install
```

- [ ] **Step 4: Commit**

```bash
git add functions/package.json functions/.env.example functions/package-lock.json
git commit -m "chore: functions/ 디렉토리 및 의존성 설정"
```

### Task 2: Create firebase.json

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`

- [ ] **Step 1: Create firebase.json**

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "*.log"
      ]
    }
  ]
}
```

Note: No `hosting` section — Cloudflare Pages handles static files, not Firebase Hosting.

- [ ] **Step 2: Create .firebaserc**

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
```

Replace `YOUR_FIREBASE_PROJECT_ID` with the actual project ID from Firebase Console.

- [ ] **Step 3: Commit**

```bash
git add firebase.json .firebaserc
git commit -m "chore: Firebase 프로젝트 설정 파일 추가"
```

---

## Chunk 2: Adapt server.js for Cloud Functions

This is the largest task. We copy the existing `server.js` to `functions/server.js` and make targeted edits. The original `server.js` in the repo root stays untouched (Vercel rollback).

### Task 3: Copy server.js and remove non-Cloud-Functions code

**Files:**
- Create: `functions/server.js` (copy from root `server.js`)

- [ ] **Step 1: Copy server.js to functions/**

```bash
cp server.js functions/server.js
```

- [ ] **Step 2: Remove line 1-2 — dotenv (Cloud Functions injects env vars)**

Replace:
```javascript
// .env 파일에서 환경변수 로드
require('dotenv').config();
```
With:
```javascript
// Cloud Functions: 환경변수는 Firebase에서 자동 주입
// 로컬 개발 시에만 dotenv 사용
if (process.env.FUNCTIONS_EMULATOR) {
    require('dotenv').config();
}
```

- [ ] **Step 3: Remove node-cron import (line 13)**

Remove:
```javascript
const cron = require('node-cron');
```

- [ ] **Step 4: Remove PORT constant (line 17)**

Remove:
```javascript
const PORT = process.env.PORT || 3000;
```

- [ ] **Step 5: Remove express.static (line 212-213)**

Remove:
```javascript
// 정적 파일 서빙
app.use(express.static(path.join(__dirname)));
```

- [ ] **Step 6: Remove/adapt 404 handler (line 6392-6394)**

Replace:
```javascript
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});
```
With:
```javascript
// Cloud Functions: 404는 API 라우트에만 적용
// 정적 파일 404는 Cloudflare Pages가 처리
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
});
```

- [ ] **Step 7: Remove process event handlers (lines 6401-6413)**

Remove the entire block:
```javascript
process.on('uncaughtException', ...);
process.on('unhandledRejection', ...);
```
Cloud Functions has its own error handling. These handlers can mask errors.

- [ ] **Step 8: Remove initSchedulers function and all cron.schedule calls (lines 6705-6758)**

Remove the entire `initSchedulers()` function body. Leave just a stub:
```javascript
function initSchedulers() {
    // Moved to Cloud Functions scheduled functions (scheduled.js)
    console.log('[Cloud Functions] 스케줄러는 scheduled.js에서 별도 실행됩니다.');
}
```

- [ ] **Step 9: Remove app.listen() block (lines 6761-6792)**

Remove the entire `app.listen(PORT, ...)` block including all initialization inside the callback.

- [ ] **Step 10: Add module.exports and lazy init at the end of the file**

Add at the very end of `functions/server.js`:

```javascript
// ========================================
// Cloud Functions용 내보내기 + 지연 초기화
// ========================================

let _initialized = false;

async function ensureInitialized() {
    if (_initialized) return;
    _initialized = true;

    console.log('[Cloud Functions] 초기화 시작...');
    try {
        await initRacesCollection();
        console.log('[Cloud Functions] 초기화 완료');
    } catch (err) {
        console.error('[Cloud Functions] 초기화 실패:', err.message);
        _initialized = false;
    }
}

// 모든 요청 전에 초기화 보장
app.use(async (req, res, next) => {
    await ensureInitialized();
    next();
});

// 주의: 이 미들웨어는 모든 라우트 정의 뒤, module.exports 앞에 위치해야 함
// 하지만 Express는 미들웨어를 등록 순서대로 실행하므로,
// 라우트 정의 이후에 추가하면 라우트 매칭 후 이 미들웨어 전에 실행됨
// → 해결: 파일 상단(라우트 정의 전)으로 이동 필요

module.exports = app;

// 스케줄 함수에서 사용할 함수들도 내보내기
module.exports.scheduledFunctions = {
    refreshLeaderboardCache,
    weeklyReset,
    monthlyReset,
    seasonEndHandler,
    processExpiredRentals,
    fetchServerDriverStandings,
    deleteOldNews,
    fetchAllNews,
    getNextCheckTime,
    autoSettlement,
    RACE_SCHEDULE
};
```

**Important:** The `ensureInitialized` middleware must be inserted BEFORE route definitions. Move it to right after the middleware setup section (~line 214, after `app.use(express.json())`), not at the end.

- [ ] **Step 11: Commit**

```bash
git add functions/server.js
git commit -m "feat: functions/server.js - Vercel 코드를 Cloud Functions용으로 적응"
```

### Task 4: Replace process.exit() with throw Error

**Files:**
- Modify: `functions/server.js:43,96,121`

- [ ] **Step 1: Replace first process.exit (line ~43)**

Replace:
```javascript
        process.exit(1);
```
With:
```javascript
        throw new Error('프로덕션 필수 환경변수 누락: ' + requiredEnvVars.join(', '));
```

- [ ] **Step 2: Replace second process.exit (line ~96)**

Replace:
```javascript
        process.exit(1);
```
With:
```javascript
        throw new Error(`ADMIN_KEY가 설정되지 않았거나 너무 짧습니다 (최소 ${MIN_ADMIN_KEY_LENGTH}자)`);
```

- [ ] **Step 3: Replace third process.exit (line ~121)**

Replace:
```javascript
    process.exit(1);
```
With:
```javascript
    throw new Error('ALLOWED_ORIGINS가 설정되지 않았습니다');
```

- [ ] **Step 4: Commit**

```bash
git add functions/server.js
git commit -m "fix: process.exit() → throw Error (Cloud Functions 크래시 방지)"
```

### Task 5: Simplify Firebase Admin initialization for Cloud Functions

**Files:**
- Modify: `functions/server.js:47-82`

- [ ] **Step 1: Replace Firebase Admin init block**

Replace lines 47-82 (the entire Firebase Admin initialization section) with:

```javascript
// ========================================
// Firebase Admin 초기화 (Cloud Functions)
// ========================================
let db = null;
try {
    // Cloud Functions: Application Default Credentials 자동 사용
    // 로컬 에뮬레이터에서도 자동으로 작동
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // 명시적 인증 (로컬 개발 또는 외부 환경)
        const serviceAccount = {
            type: 'service_account',
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        // Cloud Functions: ADC 자동 사용
        admin.initializeApp();
    }
    db = admin.firestore();
    console.log('✅ Firebase Admin 초기화 성공');
} catch (error) {
    console.error('❌ Firebase Admin 초기화 실패:', error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/server.js
git commit -m "refactor: Firebase Admin ADC 초기화 (Cloud Functions 호환)"
```

### Task 6: Replace in-memory caches with Firestore cache

**Files:**
- Modify: `functions/server.js` (newsCache at line ~216, serverDriverStandingsCache at line ~2513)

- [ ] **Step 1: Replace newsCache with Firestore-backed cache**

Replace the newsCache variable and CACHE_DURATION (lines ~215-221):
```javascript
// 뉴스 캐시 (Firestore)
const CACHE_DURATION = (parseInt(process.env.NEWS_CACHE_TTL_MIN, 10) || 30) * 60 * 1000;
const CACHE_COLLECTION = 'caches';

async function getNewsFromCache() {
    if (!db) return null;
    try {
        const doc = await db.collection(CACHE_COLLECTION).doc('news').get();
        if (!doc.exists) return null;
        const cache = doc.data();
        if (Date.now() - cache.timestamp < CACHE_DURATION) {
            return cache.data;
        }
    } catch (err) {
        console.error('[캐시] 뉴스 캐시 읽기 실패:', err.message);
    }
    return null;
}

async function setNewsCache(data) {
    if (!db) return;
    try {
        await db.collection(CACHE_COLLECTION).doc('news').set({
            data,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[캐시] 뉴스 캐시 쓰기 실패:', err.message);
    }
}
```

Then update `fetchAllNews()` function (~line 625) to use `getNewsFromCache()` and `setNewsCache()` instead of the in-memory `newsCache` object. Replace:
```javascript
if (newsCache.data && Date.now() - newsCache.timestamp < CACHE_DURATION) {
    return newsCache.data;
}
```
With:
```javascript
const cached = await getNewsFromCache();
if (cached) return cached;
```

And at the end of fetchAllNews, replace:
```javascript
newsCache = { data: allArticles, timestamp: Date.now() };
```
With:
```javascript
await setNewsCache(allArticles);
```

- [ ] **Step 2: Replace serverDriverStandingsCache with Firestore-backed cache**

Replace the `serverDriverStandingsCache` variable (line ~2513):
```javascript
const STANDINGS_CACHE_TTL = 60 * 60 * 1000; // 1시간 유지
```

Add Firestore cache functions right after:
```javascript
async function getDriverStandingsFromCache() {
    if (!db) return null;
    try {
        const doc = await db.collection(CACHE_COLLECTION).doc('driverStandings').get();
        if (!doc.exists) return null;
        const cache = doc.data();
        if (Date.now() - cache.timestamp < STANDINGS_CACHE_TTL) {
            return cache.data;
        }
    } catch (err) {
        console.error('[캐시] 순위 캐시 읽기 실패:', err.message);
    }
    return null;
}

async function setDriverStandingsCache(data) {
    if (!db) return;
    try {
        await db.collection(CACHE_COLLECTION).doc('driverStandings').set({
            data,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[캐시] 순위 캐시 쓰기 실패:', err.message);
    }
}
```

Then update `fetchServerDriverStandings()` to use these instead of the in-memory variable.

- [ ] **Step 3: Commit**

```bash
git add functions/server.js
git commit -m "refactor: 인메모리 캐시 → Firestore 캐시 (news, driverStandings)"
```

---

## Chunk 3: Scheduled Functions & Entry Point

### Task 7: Create scheduled functions

**Files:**
- Create: `functions/scheduled.js`

- [ ] **Step 1: Create functions/scheduled.js**

```javascript
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

// server.js에서 내보낸 함수들 가져오기
// 주의: server.js가 모듈 로드 시 Express 앱을 초기화하므로
// 필요한 함수만 lazy하게 접근
let _server = null;
function getServer() {
    if (!_server) {
        _server = require('./server');
    }
    return _server.scheduledFunctions;
}

// 1. 리더보드 캐시 갱신 (5분마다)
exports.refreshLeaderboard = onSchedule(
    { schedule: 'every 5 minutes', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 리더보드 캐시 갱신');
        await getServer().refreshLeaderboardCache();
    }
);

// 2. 주간 리셋 (매주 월요일 00:00 KST)
exports.weeklyReset = onSchedule(
    { schedule: '0 0 * * 1', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 주간 리셋');
        await getServer().weeklyReset();
    }
);

// 3. 월간 리셋 (매월 마지막 날 23:55 KST)
exports.monthlyReset = onSchedule(
    { schedule: '55 23 28-31 * *', timeZone: 'Asia/Seoul' },
    async () => {
        // 다음 날이 1일인 경우에만 실행 (월 마지막 날 체크)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDate() !== 1) {
            logger.info('[스케줄] 월간 리셋 스킵 (마지막 날 아님)');
            return;
        }
        logger.info('[스케줄] 월간 리셋');
        await getServer().monthlyReset();
    }
);

// 4. 시즌 종료 체크 (매일 00:00 KST)
exports.seasonEndCheck = onSchedule(
    { schedule: '0 0 * * *', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 시즌 종료 체크');
        await getServer().seasonEndHandler();
    }
);

// 5. 만료 렌탈 처리 (매시간)
exports.processExpiredRentals = onSchedule(
    { schedule: '0 * * * *', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 만료 렌탈 처리');
        await getServer().processExpiredRentals();
    }
);

// 6. 드라이버 순위 캐시 갱신 (매시간 :30)
exports.refreshDriverStandings = onSchedule(
    { schedule: '30 * * * *', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 드라이버 순위 캐시 갱신');
        await getServer().fetchServerDriverStandings();
    }
);

// 7. 오래된 뉴스 삭제 (매일 03:00 KST)
exports.deleteOldNews = onSchedule(
    { schedule: '0 3 * * *', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 30일 지난 뉴스 삭제');
        await getServer().deleteOldNews();
    }
);

// 8. 뉴스 캐시 갱신 (30분마다)
exports.refreshNewsCache = onSchedule(
    { schedule: 'every 30 minutes', timeZone: 'Asia/Seoul' },
    async () => {
        logger.info('[스케줄] 뉴스 캐시 갱신');
        await getServer().fetchAllNews();
    }
);

// 9. 자동 정산 (5분마다, 레이스 스케줄 기반 스마트 체크)
exports.checkAndSettleRaces = onSchedule(
    { schedule: 'every 5 minutes', timeZone: 'Asia/Seoul', timeoutSeconds: 300 },
    async () => {
        const server = getServer();
        const next = server.getNextCheckTime();

        if (next.type === 'season_end') {
            // 시즌 종료 - 아무것도 안 함
            return;
        }

        if (next.type === 'wait') {
            // 아직 레이스 체크 시간 아님 - 아무것도 안 함
            logger.info(`[정산] 다음 체크: ${next.raceName} (${next.time})`);
            return;
        }

        // type === 'check_now' - 레이스 결과 확인 및 정산
        logger.info(`[정산] 라운드 ${next.round} (${next.raceName}) 정산 시도`);

        // 기존 server.js의 정산 로직 호출
        // autoSettlement 객체의 isSettling 플래그로 중복 실행 방지
        if (server.autoSettlement.isSettling) {
            logger.warn('[정산] 이미 정산 진행 중 - 스킵');
            return;
        }

        // 여기서 기존 정산 함수 호출 (server.js에서 내보내기 필요)
        // settleRace() 또는 checkAndSettle() 함수를 server.js에서 export해야 함
        try {
            server.autoSettlement.isSettling = true;
            // TODO: 기존 정산 로직 함수를 server.js에서 export하여 호출
            // await server.checkAndSettle(next.round);
            logger.info(`[정산] 라운드 ${next.round} 정산 시도 완료`);
        } finally {
            server.autoSettlement.isSettling = false;
        }
    }
);
```

- [ ] **Step 2: Commit**

```bash
git add functions/scheduled.js
git commit -m "feat: 9개 스케줄 함수 생성 (cron 대체)"
```

### Task 8: Create Cloud Functions entry point

**Files:**
- Create: `functions/index.js`

- [ ] **Step 1: Create functions/index.js**

```javascript
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// Gen 2 전역 설정
setGlobalOptions({
    region: 'asia-northeast3',  // 서울 리전 (한국 사용자 대상)
    maxInstances: 10
});

// Express 앱 가져오기
const app = require('./server');

// HTTP 함수: 모든 /api/* 요청 처리
exports.api = onRequest(
    {
        timeoutSeconds: 300,
        minInstances: 1,
        memory: '512MiB',
        cors: false  // Express의 CORS 미들웨어가 처리
    },
    app
);

// 스케줄 함수들 re-export
const scheduled = require('./scheduled');
Object.keys(scheduled).forEach(key => {
    exports[key] = scheduled[key];
});
```

- [ ] **Step 2: Verify project structure**

```bash
ls -la functions/
# Expected:
# index.js
# scheduled.js
# server.js
# package.json
# package-lock.json
# node_modules/
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat: Cloud Functions 엔트리 포인트 (api + 9 스케줄 함수)"
```

### Task 9: Local verification with Firebase Emulator

- [ ] **Step 1: Install Firebase CLI (if not installed)**

```bash
npm install -g firebase-tools
```

- [ ] **Step 2: Login to Firebase**

```bash
firebase login
```

- [ ] **Step 3: Start emulator**

```bash
cd /path/to/project
firebase emulators:start --only functions
```

- [ ] **Step 4: Test API endpoint**

```bash
# 서버 시간 확인 (인증 불필요)
curl http://localhost:5001/YOUR_PROJECT_ID/asia-northeast3/api/api/server-time

# Expected: { "success": true, "serverTime": "...", ... }
```

- [ ] **Step 5: Fix any errors found during emulator testing**

Common issues:
- Missing `module.exports` → check functions/server.js exports
- Missing dependencies → `cd functions && npm install`
- Port conflicts → check if other services are running

---

## Chunk 4: Cloudflare Configuration

### Task 10: Create .cfignore for Cloudflare Pages

**Files:**
- Create: `.cfignore`

- [ ] **Step 1: Create .cfignore**

```
# Cloud Functions (서버 코드 - Pages에 불필요)
functions/
server.js
scripts/

# 환경변수/설정
.env
.env.*
.firebaserc
firebase.json

# 개발 도구
node_modules/
package.json
package-lock.json
docs/
CLAUDE.md
.claude/

# 기타
*.log
.git/
simulation.jsx
vercel.json
```

- [ ] **Step 2: Commit**

```bash
git add .cfignore
git commit -m "chore: .cfignore - Cloudflare Pages 배포 제외 파일 설정"
```

### Task 11: Create Cloudflare Worker proxy

**Files:**
- Create: `workers/api-proxy.js`
- Create: `workers/wrangler.toml`

- [ ] **Step 1: Create workers/ directory**

```bash
mkdir -p workers
```

- [ ] **Step 2: Create workers/api-proxy.js**

```javascript
/**
 * Cloudflare Worker: API Proxy
 *
 * /api/* 요청을 Firebase Cloud Functions로 전달
 * Cloudflare Pages와 같은 도메인에서 실행되므로 CORS 불필요
 */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // /api/* 경로만 프록시
        if (!url.pathname.startsWith('/api/')) {
            // Pages가 처리하도록 통과
            return new Response('Not Found', { status: 404 });
        }

        // Cloud Functions URL 구성
        const targetUrl = `${env.FUNCTIONS_BASE_URL}${url.pathname}${url.search}`;

        // 원본 요청의 헤더 복사 (Host 제외)
        const headers = new Headers(request.headers);
        headers.delete('host');

        // Cloud Functions로 요청 전달
        const response = await fetch(targetUrl, {
            method: request.method,
            headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? request.body
                : undefined,
            redirect: 'follow'
        });

        // 응답 헤더 복사 및 반환
        const responseHeaders = new Headers(response.headers);
        // Cloudflare가 자동 처리하는 헤더 제거
        responseHeaders.delete('content-encoding');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    }
};
```

- [ ] **Step 3: Create workers/wrangler.toml**

```toml
name = "f1fans-api-proxy"
main = "api-proxy.js"
compatibility_date = "2025-09-15"

# 환경변수 (민감하지 않은 값)
# FUNCTIONS_BASE_URL은 Cloudflare Dashboard에서 Secret으로 설정
# 예: wrangler secret put FUNCTIONS_BASE_URL
# 값: https://api-XXXX-XXXX.asia-northeast3.run.app

[env.production]
# 프로덕션 라우트는 도메인 구매 후 설정
# routes = [{ pattern = "yourdomain.com/api/*", zone_name = "yourdomain.com" }]
```

- [ ] **Step 4: Commit**

```bash
git add workers/
git commit -m "feat: Cloudflare Worker API 프록시 스크립트"
```

---

## Chunk 5: Deployment & Configuration Guide

### Task 12: Deploy Firebase Cloud Functions

- [ ] **Step 1: Set Firebase secrets**

```bash
# ADMIN_KEY 설정 (32자 이상)
firebase functions:secrets:set ADMIN_KEY
# 프롬프트에 값 입력

# ALLOWED_ORIGINS 설정 (나중에 도메인 확정 후 업데이트)
firebase functions:secrets:set ALLOWED_ORIGINS
# 값: https://yourdomain.com,https://www.yourdomain.com

# Discord webhook (선택)
firebase functions:secrets:set DISCORD_WEBHOOK_URL
```

- [ ] **Step 2: Deploy functions**

```bash
firebase deploy --only functions
```

Expected output:
```
✔  functions: Finished running predeploy script.
✔  functions[api(asia-northeast3)]: Successful create operation.
✔  functions[refreshLeaderboard(asia-northeast3)]: Successful create operation.
... (9 scheduled functions)

✔  Deploy complete!
```

- [ ] **Step 3: Note the Cloud Functions URL**

After deployment, the URL will be printed:
```
Function URL (api(asia-northeast3)): https://api-XXXX-XXXX.asia-northeast3.run.app
```

Save this URL — it's needed for the Cloudflare Worker `FUNCTIONS_BASE_URL`.

- [ ] **Step 4: Test deployed API**

```bash
# 서버 시간 확인
curl https://api-XXXX-XXXX.asia-northeast3.run.app/api/server-time

# 뉴스 조회
curl https://api-XXXX-XXXX.asia-northeast3.run.app/api/news
```

### Task 13: Set up Cloudflare Pages (Manual — Dashboard)

These steps are performed in the Cloudflare Dashboard (https://dash.cloudflare.com):

- [ ] **Step 1: Create Cloudflare account** (if not already)

Visit https://dash.cloudflare.com/sign-up

- [ ] **Step 2: Connect GitHub repository**

1. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select GitHub account → Select `ranha0924/amafanpage` repository
3. **Build settings:**
   - Build command: (leave empty)
   - Build output directory: `/` (root — static files are at root level)
   - Root directory: `/` (root)
4. Click **Save and Deploy**

- [ ] **Step 3: Verify Pages deployment**

Visit the generated `xxx.pages.dev` URL. Static pages should load (but API calls will fail until Worker is deployed).

### Task 14: Deploy Cloudflare Worker

- [ ] **Step 1: Install Wrangler CLI**

```bash
npm install -g wrangler
```

- [ ] **Step 2: Login to Cloudflare**

```bash
wrangler login
```

- [ ] **Step 3: Set the FUNCTIONS_BASE_URL secret**

```bash
cd workers/
wrangler secret put FUNCTIONS_BASE_URL
# 값 입력: https://api-XXXX-XXXX.asia-northeast3.run.app
```

- [ ] **Step 4: Deploy Worker**

```bash
cd workers/
wrangler deploy
```

- [ ] **Step 5: Configure Worker Route** (after domain purchase)

Done via Cloudflare Dashboard:
1. **Your domain** → **Workers Routes** → **Add Route**
2. Route: `yourdomain.com/api/*`
3. Worker: `f1fans-api-proxy`

### Task 15: Purchase and configure custom domain

- [ ] **Step 1: Search and purchase domain**

Cloudflare Dashboard → **Domain Registration** → **Register Domains**
Search for desired domain (e.g., `f1fans.kr`, `f1fanpage.com`, etc.)
Purchase the domain.

- [ ] **Step 2: Connect domain to Pages**

1. **Workers & Pages** → Select your Pages project → **Custom domains**
2. Add: `yourdomain.com` and `www.yourdomain.com`
3. Cloudflare auto-configures DNS records

- [ ] **Step 3: Configure Worker route on domain**

1. **Your domain zone** → **Workers Routes** → **Add Route**
2. Pattern: `yourdomain.com/api/*`
3. Worker: `f1fans-api-proxy`
4. Also add: `www.yourdomain.com/api/*` → `f1fans-api-proxy`

- [ ] **Step 4: Update ALLOWED_ORIGINS**

```bash
firebase functions:secrets:set ALLOWED_ORIGINS
# 값: https://yourdomain.com,https://www.yourdomain.com
```

- [ ] **Step 5: Redeploy functions with updated origins**

```bash
firebase deploy --only functions
```

### Task 16: Final verification

- [ ] **Step 1: Verify static pages load**

Visit `https://yourdomain.com` — homepage should load correctly.

- [ ] **Step 2: Verify API proxy works**

Open browser dev tools → Network tab. Check that `/api/news` returns data.

- [ ] **Step 3: Verify auth flow**

Login with Google → Check token display updates → Make authenticated API calls.

- [ ] **Step 4: Verify betting pages**

Navigate to betting page → Verify odds load → Place test bet (if possible).

- [ ] **Step 5: Verify scheduled functions in Firebase Console**

Firebase Console → Functions → Check that all 10 functions are deployed and running.

- [ ] **Step 6: Final commit — update CSP header**

In `functions/server.js`, update the Content-Security-Policy `connect-src` to include the new domain:

```javascript
connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app ...
```

- [ ] **Step 7: Keep Vercel active for 1-2 weeks as rollback**

Do not delete Vercel project yet. Monitor the new deployment for stability.

- [ ] **Step 8: Commit all final changes**

```bash
git add -A
git commit -m "feat: Cloudflare Pages + Firebase Cloud Functions 마이그레이션 완료"
```
