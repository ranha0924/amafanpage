# AMR FANS 프로젝트 전체 흐름 & 아키텍처 분석

## Context
이 문서는 AMR FANS 프로젝트의 전체 구조를 **코드를 직접 인용하며** 설명하는 교육용 분석 자료입니다.
AI 도움으로 코드를 작성했지만, 실제로 어떻게 동작하는지 깊이 이해하고 싶다는 요청에 대한 답변입니다.

---

# 1. 프로젝트 구조 전체 맵

## 1-1. 파일/폴더 구조

```
amafanpage/
│
├── 📄 HTML 페이지 (12개) ─────────────────────────
│   ├── index.html          ← 메인 홈페이지 (카운트다운, 뉴스, 리더보드 위젯)
│   ├── betting.html        ← 베팅 시스템 (포디움 + 1:1 드라이버 베팅)
│   ├── paddock.html        ← 커뮤니티 게시판 (The Paddock)
│   ├── leaderboard.html    ← 리더보드 (적중률/토큰/커뮤니티/출석 순위)
│   ├── mypage.html         ← 마이페이지 (프로필, 토큰 내역, 베팅 기록)
│   ├── fortune.html        ← 운세 페이지 (준비 중)
│   ├── history.html        ← 팀 역사 (정적 콘텐츠)
│   ├── alonso.html         ← 알론소(#14) 드라이버 프로필
│   ├── stroll.html         ← 스트롤(#18) 드라이버 프로필
│   ├── 404.html            ← 404 에러 페이지
│   ├── privacy.html        ← 개인정보처리방침
│   └── terms.html          ← 이용약관
│
├── 📁 css/ (10개) ────────────────────────────────
│   ├── style.css           ← 🔑 메인 공통 스타일 (헤더, 사이드메뉴, 레이아웃, 카운트다운, 뉴스)
│   ├── betting.css         ← 포디움 베팅 + 1:1 베팅 UI
│   ├── paddock.css         ← 게시판 (게시글 카드, 모달, 검색/필터)
│   ├── mypage.css          ← 마이페이지 (프로필, 내역 테이블)
│   ├── leaderboard.css     ← 리더보드 (랭킹 테이블, 탭)
│   ├── driver.css          ← 드라이버 페이지 (프로필 카드)
│   ├── token.css           ← 토큰/코인 UI (보상 알림, 잔액 표시)
│   ├── fortune.css         ← 운세 페이지
│   ├── history.css         ← 팀 역사 타임라인
│   └── errorHandler.css    ← 에러 토스트/모달 알림
│
├── 📁 js/ (17개) ─────────────────────────────────
│   │
│   │  ── 🏗️ 코어 모듈 (모든 페이지에서 로드) ──
│   ├── constants.js        ← 전역 상수 정의 (시간, 토큰, 베팅, API 설정)
│   ├── utils.js            ← 공통 유틸리티 (smartFetch, 캐싱, escapeHtml)
│   ├── errorHandler.js     ← 전역 에러 처리 (toast, modal 알림)
│   ├── firebaseConfig.js   ← Firebase 초기화 (App, Auth, Firestore)
│   ├── auth.js             ← Google 로그인/로그아웃/토큰 갱신
│   ├── token.js            ← AMR 코인 관리 (잔액 조회, UI 업데이트)
│   ├── attendance.js       ← 일일 출석체크 시스템
│   ├── raceEnergy.js       ← 레이스 응원 에너지 수집
│   │
│   │  ── 📰 홈페이지 전용 ──
│   ├── script.js           ← 레이스 카운트다운, 스무스 스크롤
│   ├── news.js             ← 뉴스 로드/렌더링 (서버 API 호출)
│   │
│   │  ── 🎰 베팅 시스템 ──
│   ├── bettingData.js      ← 드라이버/팀 데이터 상수, 베팅 API 호출
│   ├── podiumBet.js        ← 포디움 베팅 (P1/P2/P3 예측)
│   ├── headToHeadBet.js    ← 1:1 드라이버 베팅
│   ├── f1api.js            ← OpenF1 API 연동 (드라이버 순위, 레이스 결과)
│   │
│   │  ── 📋 기타 페이지 전용 ──
│   ├── paddock.js          ← 게시판 CRUD + 댓글 + 좋아요 + 신고
│   ├── leaderboard.js      ← 리더보드 데이터 로드/렌더링
│   └── mypage.js           ← 마이페이지 (프로필, 내역, 탈퇴)
│
├── 📁 images/ ─────────────────────────────────────
│   ├── AMRcoin.png         ← 토큰 아이콘
│   ├── favicon.svg         ← 사이트 아이콘
│   ├── amr24.webp          ← 2024 시즌 차량
│   ├── AMR25.jpg           ← 2025 시즌 차량
│   ├── alonso.avif         ← 알론소 프로필
│   ├── lance.avif          ← 스트롤 프로필
│   ├── 타이어.png           ← 로딩 스피너 애니메이션
│   └── icons/              ← SVG 아이콘 33개 (icon-heart, icon-trophy 등)
│
├── 📁 docs/ ───────────────────────────────────────
│   ├── PROJECT_STRUCTURE.md        ← 프로젝트 구조 상세 설명
│   ├── PROJECT_RULES_AND_FLOW.md   ← 프로젝트 흐름 및 핵심 규칙
│   ├── architecture-patterns.md    ← 아키텍처 패턴 및 설계 원칙
│   └── ARCHITECTURE_OVERVIEW.md    ← 📌 이 문서 (전체 아키텍처 통합 분석)
│
├── 📁 scripts/ ────────────────────────────────────
│   └── clear-firestore.js  ← Firestore 데이터 초기화 스크립트
│
├── ⚙️ 설정 파일 ──────────────────────────────────
│   ├── server.js           ← 🔑 Express 백엔드 서버 (API 엔드포인트 15+개)
│   ├── package.json        ← npm 의존성 + 스크립트
│   ├── vercel.json         ← Vercel 배포 설정
│   ├── firestore.rules     ← Firestore 보안 규칙
│   ├── .env.example        ← 환경변수 템플릿
│   ├── .gitignore          ← Git 제외 파일 목록
│   ├── setAdmin.js         ← 관리자 권한 설정 스크립트
│   └── cors.json           ← CORS 설정
```

### 각 CSS 파일의 역할 상세

**`style.css`** (77KB) — 프로젝트에서 가장 큰 CSS. 모든 페이지가 이 파일을 로드합니다.
```css
/* 색상 체계의 핵심 (style.css 상단) */
:root {
    --primary-green: #006f62;   /* 애스턴마틴 브랜드 그린 */
    --accent-lime: #c4ff00;     /* 라임 액센트 (강조색) */
    --bg-base: #1a1a1a;         /* 어두운 배경 */
}
```
→ 헤더(고정 포지션 + backdrop-filter 블러), 사이드 메뉴(모바일), 로딩 애니메이션(타이어 스피너), 카운트다운 UI, 뉴스 카드 등을 담당

**`betting.css`** (103KB) — 두 번째로 큰 CSS. 포디움 3포지션 카드 + 1:1 베팅 인터페이스 + 배당률 표시 + 베팅 결과 모달

**`token.css`** (11KB) — AMR 코인 관련 UI. 헤더의 토큰 잔액 표시, 보상 알림 팝업 등

**`errorHandler.css`** (9KB) — 토스트 알림(화면 하단 슬라이드업)과 전역 경고 모달

### 공통 유틸리티/헬퍼

프로젝트의 공통 유틸은 2개 파일에 집중:

1. **`js/constants.js`** — 모든 매직 넘버를 여기서 관리
2. **`js/utils.js`** — API 호출, HTML 이스케이프, 캐싱 등 재사용 함수

---

## 1-2. 의존성 & 라이브러리

### npm 패키지 (server.js에서 사용)

`package.json`의 모든 의존성을 하나씩 설명합니다:

```
server.js 1~13줄의 실제 코드:
```
```javascript
require('dotenv').config();                          // ① .env 파일 로드
const express = require('express');                   // ② 웹 서버 프레임워크
const cors = require('cors');                         // ③ 교차 출처 요청 허용
const axios = require('axios');                       // ④ HTTP 클라이언트
const cheerio = require('cheerio');                   // ⑤ HTML 파싱 (스크래핑)
const RSSParser = require('rss-parser');              // ⑥ RSS 피드 파싱
const path = require('path');                         // ⑦ Node 내장: 파일 경로
const translate = require('google-translate-api-x');  // ⑧ 뉴스 한국어 번역
const rateLimit = require('express-rate-limit');      // ⑨ API 요청 제한
const admin = require('firebase-admin');              // ⑩ Firebase 서버 SDK
const cron = require('node-cron');                    // ⑪ 백그라운드 스케줄링
```

| # | 패키지 | 버전 | 프로젝트에서 하는 일 |
|---|--------|------|---------------------|
| ① | **dotenv** | ^16.3.1 | `.env` 파일의 환경변수(Firebase 키, 관리자 키 등)를 `process.env`에 로드 |
| ② | **express** | ^4.18.2 | 백엔드 웹 서버. 모든 `/api/*` 엔드포인트를 처리 |
| ③ | **cors** | ^2.8.5 | 프론트엔드(다른 도메인)에서 API를 호출할 수 있도록 CORS 헤더 추가 |
| ④ | **axios** | ^1.6.0 | F1 공식 사이트 뉴스 크롤링, OpenF1 API 호출에 사용 |
| ⑤ | **cheerio** | ^1.0.0-rc.12 | F1 공식 사이트 HTML을 파싱하여 뉴스 제목/링크 추출 (jQuery 문법으로 서버에서 DOM 조작) |
| ⑥ | **rss-parser** | ^3.13.0 | Motorsport.com, Autosport의 RSS 피드를 읽어서 뉴스 목록 생성 |
| ⑦ | **path** | (내장) | `express.static()`에서 정적 파일 경로 지정 |
| ⑧ | **google-translate-api-x** | ^10.7.2 | 영어 뉴스를 한국어로 자동 번역 |
| ⑨ | **express-rate-limit** | ^7.5.1 | API 남용 방지. 15분당 100요청 제한 |
| ⑩ | **firebase-admin** | ^13.6.0 | 서버에서 Firestore 직접 접근 + 사용자 ID 토큰 검증 |
| ⑪ | **node-cron** | ^3.0.3 | 뉴스 자동 수집, 리더보드 갱신 등 예약 작업 실행 |

**개발 의존성:**
| 패키지 | 버전 | 역할 |
|--------|------|------|
| **nodemon** | ^3.0.2 | 코드 수정 시 서버 자동 재시작 (`npm run dev`) |
| **sharp** | ^0.34.5 | 이미지 리사이즈/최적화 (선택사항) |

### Firebase SDK (클라이언트 — CDN)

`index.html:302~304`에서 확인:
```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
```

| 모듈 | 역할 |
|------|------|
| **firebase-app-compat** | Firebase 앱 초기화. 다른 모듈의 기반 |
| **firebase-auth-compat** | Google 로그인/로그아웃, ID 토큰 발급 |
| **firebase-firestore-compat** | 게시판 실시간 읽기/쓰기 (클라이언트에서 직접 Firestore 접근) |

> **왜 "compat" 버전인가?**
> Firebase v9부터 모듈러(import/export) 방식이 도입됐지만, 이 프로젝트는 `<script>` 태그로 로드하는 전통적 방식을 사용.
> `compat` = "compatibility" = 구버전(v8) 문법과 호환되는 래퍼.
> `firebase.initializeApp()`, `firebase.firestore()` 같은 네임스페이스 방식을 쓸 수 있게 해줌.

### CDN 외부 라이브러리 (모든 HTML 공통)

| 라이브러리 | URL | 역할 |
|-----------|-----|------|
| **Google Fonts (Orbitron)** | `fonts.googleapis.com/css2?family=Orbitron:wght@700;900` | 로고/카운트다운용 레이싱 느낌 폰트 |
| **Google Analytics** | `googletagmanager.com/gtag/js?id=G-2Z7RRYD2E5` | 방문자 분석 |
| **Vercel Analytics** | `/_vercel/insights/script.js` | 프로덕션 환경에서만 로드 (성능 모니터링) |

> 특이사항: React, Vue 같은 프레임워크 없이 **순수 Vanilla JS**만 사용. jQuery도 없음!

### Firebase Config 위치

`js/firebaseConfig.js:28~35`에 정의:
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyBxa1Zq_jty8FHcymG8WHnrjdvDLM4x43c",
    authDomain: "amf1-fanpage-13063.firebaseapp.com",
    projectId: "amf1-fanpage-13063",
    storageBucket: "amf1-fanpage-13063.firebasestorage.app",
    messagingSenderId: "869691536939",
    appId: "1:869691536939:web:8108f8ec955217fa1d9c6e"
};
```
→ 이 키는 **클라이언트에서 공개**됨 (Firebase의 설계상 의도적). 보안은 Firestore Rules + 서버 측 검증이 담당

---

## 1-3. 파일 간 연결 관계

### JS 로드 순서 (의존성 체인)

모든 HTML 파일은 아래 **코어 모듈**을 동일한 순서로 로드합니다:

```
① Firebase SDK (CDN)
   ↓ 전역 객체 firebase 생성
② constants.js
   ↓ TIME_MS, TOKEN_CONFIG 등 상수 → window에 등록
③ utils.js
   ↓ smartFetch(), escapeHtml() 등 → constants.js의 상수 사용
④ errorHandler.js
   ↓ showToast(), showGlobalAlert() → utils.js 함수 사용
⑤ firebaseConfig.js
   ↓ firebase.initializeApp() → db, auth 전역 변수 생성
⑥ auth.js
   ↓ signInWithGoogle() → firebase auth 사용, utils.js의 escapeHtml() 사용
⑦ token.js
   ↓ getUserTokens() → auth.js의 getCurrentUser(), smartFetch() 사용
⑧ attendance.js / raceEnergy.js
   ↓ → auth.js, token.js 사용
⑨ 페이지별 모듈 (script.js, paddock.js, podiumBet.js 등)
```

**핵심 원리**: `<script>` 태그는 위에서 아래로 순서대로 실행됨.
→ `auth.js`가 `firebaseConfig.js`보다 먼저 로드되면 `auth` 변수가 아직 없으므로 에러 발생!
→ 그래서 로드 순서가 곧 의존성 순서입니다.

### 페이지별 JS 로드 목록

**index.html** (홈):
```
코어 7개 + attendance.js + raceEnergy.js + news.js + script.js
```

**betting.html** (베팅):
```
코어 7개 + bettingData.js + f1api.js + podiumBet.js + headToHeadBet.js + raceEnergy.js
```

**paddock.html** (게시판):
```
코어 7개 + attendance.js + paddock.js + raceEnergy.js
```

**leaderboard.html** (리더보드):
```
코어 7개 + leaderboard.js + raceEnergy.js
```

**mypage.html** (마이페이지):
```
코어 7개 + bettingData.js + attendance.js + mypage.js + raceEnergy.js
```

**alonso.html / stroll.html** (드라이버):
```
코어 7개 + script.js + raceEnergy.js
```

### 모듈 간 통신 방식 — "전역 스코프 공유"

이 프로젝트는 ES Module(`import/export`)을 사용하지 않습니다.
대신 **전역 변수(window 객체)**를 통해 파일 간 데이터를 공유합니다:

```javascript
// constants.js:200~212 — 상수를 window에 등록
if (typeof window !== 'undefined') {
    Object.freeze(TIME_MS);        // 조작 방지
    window.TIME_MS = TIME_MS;
    window.TOKEN_CONFIG = TOKEN_CONFIG;
    window.BETTING_CONFIG = BETTING_CONFIG;
    // ... 나머지 상수들
}
```
→ 다른 모든 JS 파일에서 `TIME_MS.MINUTE`, `TOKEN_CONFIG.ATTENDANCE` 등으로 바로 접근 가능

```javascript
// firebaseConfig.js:38~45 — db, auth를 전역 변수로 선언
let db = null;     // ← 전역! 어떤 JS 파일에서든 db 사용 가능
let auth = null;   // ← 전역! 어떤 JS 파일에서든 auth 사용 가능

firebaseApp = firebase.initializeApp(firebaseConfig);
db = firebase.firestore();   // → paddock.js에서 db.collection('posts') 사용
auth = firebase.auth();      // → auth.js에서 auth.signInWithPopup() 사용
```

### 프론트엔드 → 백엔드 연결

프론트엔드 JS에서 `fetch('/api/...')`로 서버에 요청 → `server.js`가 처리:

```
[프론트엔드]                          [백엔드 server.js]

news.js
  fetch('/api/news')          →      GET /api/news (뉴스 목록 반환)

token.js
  fetch('/api/token/balance') →      GET /api/token/balance (잔액 조회)

attendance.js
  fetch('/api/token/attendance') →   POST /api/token/attendance (출석체크)

podiumBet.js
  fetch('/api/bets')          →      POST /api/bets (베팅 배치)

leaderboard.js
  fetch('/api/leaderboard/..') →     GET /api/leaderboard/:type (순위 조회)
```

모든 인증이 필요한 API 호출에는 이 패턴 사용:
```javascript
// auth.js의 getFreshIdToken()으로 토큰 획득 후 헤더에 첨부
const token = await getFreshIdToken();
fetch('/api/token/balance', {
    headers: { 'Authorization': `Bearer ${token}` }
});
```
→ 서버에서 `admin.auth().verifyIdToken(token)`으로 검증

### 의존성 그래프 (화살표 = "~를 사용함")

```
constants.js ←── utils.js ←── errorHandler.js
                    ↑               ↑
                    │               │
firebaseConfig.js ←── auth.js ←── token.js ←── attendance.js
       ↑               ↑   ↑                      ↑
       │               │   │                       │
       │     paddock.js ┘   └── podiumBet.js       │
       │                        headToHeadBet.js   │
       │                        leaderboard.js     │
       │                        mypage.js ─────────┘
       │
       └── raceEnergy.js
```

→ 화살표 방향이 **한 방향**으로만 흐름 = 순환 의존성 없음 (좋은 설계!)
→ 맨 아래 계층(constants, utils)을 수정하면 위의 모든 모듈에 영향

---

# 2. 시각적 아키텍처 다이어그램

## 2-1. 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        사용자의 브라우저                               │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │index.html│  │betting   │  │paddock   │  │mypage    │  ...      │
│  │          │  │.html     │  │.html     │  │.html     │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │              │                 │
│       └──────────────┴──────────────┴──────────────┘                │
│                              │                                      │
│              ┌───────────────┼───────────────┐                      │
│              ▼               ▼               ▼                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  코어 JS 7개  │  │ Firebase SDK │  │ 페이지별 JS  │             │
│  │ constants    │  │ (CDN v10.7.1)│  │ paddock.js   │             │
│  │ utils        │  │              │  │ podiumBet.js │             │
│  │ errorHandler │  │ firebase-app │  │ leaderboard  │             │
│  │ firebaseCfg  │  │ firebase-auth│  │ mypage.js    │             │
│  │ auth         │  │ firebase-fs  │  │ news.js      │             │
│  │ token        │  │              │  │ ...          │             │
│  │ attendance   │  │              │  │              │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                  │                      │
└─────────┼─────────────────┼──────────────────┼──────────────────────┘
          │                 │                  │
          │  fetch('/api/*')│ 직접 연결         │  fetch('/api/*')
          │                 │                  │
          ▼                 ▼                  ▼
┌─────────────────────┐   ┌──────────────────────────┐
│                     │   │                          │
│   server.js         │   │  Firebase Cloud          │
│   (Express/Vercel)  │   │                          │
│                     │   │  ┌──────────────────┐    │
│  /api/news          │   │  │ Authentication   │    │
│  /api/token/*       │   │  │ (Google OAuth)   │    │
│  /api/bets/*        │   │  └──────────────────┘    │
│  /api/leaderboard/* │   │                          │
│  /api/admin/*       │   │  ┌──────────────────┐    │
│                     │   │  │ Firestore DB     │    │
│  firebase-admin ────┼───┤  │                  │    │
│  (서버→DB 직접)      │   │  │ users            │    │
│                     │   │  │ posts/comments   │    │
└────────┬────────────┘   │  │ bets             │    │
         │                │  │ attendance       │    │
         │                │  │ tokenHistory     │    │
         ▼                │  │ leaderboards     │    │
┌──────────────────┐      │  │ ...              │    │
│ 외부 데이터 소스   │      │  └──────────────────┘    │
│                  │      │                          │
│ F1공식 (스크래핑)  │      └──────────────────────────┘
│ Motorsport (RSS) │
│ Autosport  (RSS) │
│ OpenF1 API       │
│ Google Translate  │
└──────────────────┘
```

**데이터 흐름 방향 요약:**
- 브라우저 → server.js: `fetch('/api/*')` (REST API)
- 브라우저 → Firebase: `db.collection().onSnapshot()` (실시간 리스너)
- server.js → Firebase: `admin.firestore()` (서버 SDK)
- server.js → 외부 소스: `axios.get()` + `cheerio` + `rss-parser`

## 2-2. 페이지 ↔ 파일 매핑 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                         HTML 페이지                              │
├─────────────┬───────────────────────────────────────────────────┤
│             │           로드하는 CSS         로드하는 JS          │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ index.html  │  style + token + errorHandler    코어7 + news     │
│  (홈)       │                                  + script         │
│             │                                  + attendance     │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ betting     │  style + token + betting         코어7            │
│  (베팅)     │  + errorHandler                  + bettingData    │
│             │                                  + f1api          │
│             │                                  + podiumBet      │
│             │                                  + headToHeadBet  │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ paddock     │  style + token + paddock         코어7            │
│  (게시판)   │  + errorHandler                  + attendance     │
│             │                                  + paddock        │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ leaderboard │  style + token + betting         코어7            │
│  (리더보드) │  + leaderboard + errorHandler    + leaderboard    │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ mypage      │  style + token + mypage          코어7            │
│  (마이페이지)│  + errorHandler                  + bettingData    │
│             │                                  + attendance     │
│             │                                  + mypage         │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ alonso/     │  style + driver + token          코어7            │
│ stroll      │  + errorHandler                  + script         │
│  (드라이버) │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ history     │  style + token + history         코어7            │
│  (역사)     │  + errorHandler                  + attendance     │
│             │                                  + raceEnergy     │
├─────────────┼───────────────────────────────────────────────────┤
│             │                                                   │
│ fortune     │  style + token + fortune         코어7            │
│  (운세)     │  + errorHandler                  + attendance     │
│             │                                  + raceEnergy     │
└─────────────┴───────────────────────────────────────────────────┘

코어 7개 = constants → utils → errorHandler → firebaseConfig → auth → token → (attendance)
```

## 2-3. 인증(Auth) 플로우 다이어그램

```
사용자가 "구글 로그인" 버튼 클릭
         │
         ▼
┌─────────────────────────────────────┐
│ auth.js: signInWithGoogle()         │
│                                     │
│ const provider = new               │
│   firebase.auth.GoogleAuthProvider()│
│ auth.signInWithPopup(provider)      │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Google 로그인 팝업 창 표시           │
│ 사용자가 Google 계정 선택            │
└────────────┬────────────────────────┘
             │ 성공
             ▼
┌─────────────────────────────────────┐
│ Firebase Auth가 user 객체 반환       │
│ { uid, displayName, email,          │
│   photoURL, getIdToken() }          │
└────────────┬────────────────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
┌──────────┐  ┌──────────────────────┐
│ UI 업데이트│  │ Firestore 유저 문서   │
│           │  │ 생성/업데이트          │
│ 프로필사진 │  │                      │
│ 닉네임    │  │ db.collection('users')│
│ 토큰 잔액 │  │  .doc(user.uid)      │
│ 로그아웃  │  │  .set({...})         │
│ 버튼 표시 │  │                      │
└──────────┘  └──────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ tokenManager.startAutoRefresh()     │
│                                     │
│ 50분마다 ID Token 자동 갱신          │
│ (Firebase ID Token 유효기간 = 1시간) │
│                                     │
│ setInterval(() => {                 │
│   user.getIdToken(true)             │
│ }, 50 * 60 * 1000)                  │
└─────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ API 호출 시 토큰 사용 패턴:          │
│                                     │
│ const token = await                 │
│   getFreshIdToken();                │
│                                     │
│ fetch('/api/token/balance', {       │
│   headers: {                        │
│     'Authorization':                │
│       `Bearer ${token}`             │
│   }                                 │
│ })                                  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ server.js에서 토큰 검증:             │
│                                     │
│ const decoded = await               │
│   admin.auth()                      │
│   .verifyIdToken(token);            │
│                                     │
│ const userId = decoded.uid;         │
│ // → 이 사용자의 데이터만 접근 허용   │
└─────────────────────────────────────┘
```

## 2-4. 베팅 시스템 데이터 흐름

```
┌──────────────────────────────────────────────────────────────────┐
│                    포디움 베팅 흐름                                │
└──────────────────────────────────────────────────────────────────┘

 사용자 행동                    프론트엔드                    서버
 ──────────                    ──────────                    ──────

 드라이버 선택    ──→  podiumBet.js
 (P1/P2/P3)           │ selectDriver(position, driverNum)
                      │ 배당률 계산 & 표시
                      ▼
 금액 입력       ──→  validateBetAmount()
 (1~1000 AMR)         │ 최소/최대 검증
                      │ 잔액 확인
                      ▼
 "베팅하기" 클릭  ──→  placePodiumBet()
                      │
                      │  fetch('/api/bets', {
                      │    method: 'POST',
                      │    body: { raceId, position,  ──────→  server.js
                      │           driverNum, amount }        │
                      │  })                                  │ ① 토큰 검증
                      │                                      │ ② 레이스 마감시간 확인
                      │                                      │ ③ 배당률 서버 재계산
                      │                                      │ ④ 잔액 확인
                      │                                      │ ⑤ 트랜잭션:
                      │                                      │    토큰 차감 +
                      │                                      │    베팅 기록 저장
                      │        { success, odds,       ◀──────│
                      │          betId }
                      ▼
                 UI 업데이트
                 토큰 잔액 갱신
                 베팅 내역 표시


                      ...레이스 종료 후...

                                              server.js (cron)
                                              │
                                              │ OpenF1 API로
                                              │ 레이스 결과 조회
                                              │
                                              ▼
                                         자동 정산
                                         │ 결과 비교
                                         │ 당첨: 배당률 × 베팅액
                                         │ 토큰 지급
                                         ▼
                                    Firestore 업데이트
                                    tokenHistory 기록
```

## 2-5. 뉴스 수집 & 표시 흐름

```
┌──────────────────────────────────────────────────────────────────┐
│                    뉴스 데이터 흐름                                │
└──────────────────────────────────────────────────────────────────┘

  외부 소스                    server.js                     브라우저
  ──────────                   ─────────                     ────────

  F1 공식 사이트  ──axios──→  cheerio로 HTML 파싱
  (영어 기사)                  │ <a> 태그에서 제목/링크 추출
                              ▼
  Motorsport.com ──rss────→  rss-parser로 RSS 파싱
  (영어 RSS)                  │ title, contentSnippet, link 추출
                              ▼
  Autosport      ──rss────→  rss-parser로 RSS 파싱
  (영어 RSS)                  │ title, contentSnippet, link 추출
                              ▼
                         3개 소스 합치기 + 날짜순 정렬
                              │
                              ▼
                         google-translate-api-x
                         │ 영어 → 한국어 번역
                         │ (제목 + 요약)
                              │
                              ▼
                         메모리 캐시에 저장
                         (30분 유효)
                              │
                              │
              GET /api/news   │
  news.js  ──fetch──────────→ │
  │                           │ 캐시 데이터 반환
  │      ◀─── JSON 응답 ──────┘
  │       [{title, description,
  │         source, link, date}]
  ▼
  renderNewsCard()
  │ HTML 카드 생성
  │ 뉴스 목록 DOM에 삽입
  ▼
  사용자가 카드 클릭
  │
  ▼
  openModal(index)
  │ 상세 모달 표시
  │ 원문 링크 제공
```

## 2-6. 출석체크 시스템 흐름

```
  사용자                  attendance.js              server.js              Firestore
  ──────                  ──────────────              ─────────              ─────────

  로그인 상태에서
  "출석 체크" 클릭
       │
       ▼
  performAttendance()
       │
       │  POST /api/token/attendance
       │  Authorization: Bearer {token}
       ├──────────────────────────────→  verifyIdToken()
       │                                      │
       │                                      ▼
       │                                 오늘 출석 여부 확인 ──→ attendance
       │                                      │                  컬렉션 조회
       │                                      │
       │                              ┌───────┴───────┐
       │                              │               │
       │                           이미 출석       미출석
       │                              │               │
       │                              ▼               ▼
       │                         에러 반환        Firestore 트랜잭션:
       │                         "이미 출석        │
       │                          했습니다"         ├─ attendance 문서 생성
       │                                           ├─ users.tokens += 10
       │                                           ├─ tokenHistory 기록
       │                                           │
       │                                           ▼
       │                                      연속 출석 계산
       │                                      │
       │                                ┌─────┴─────┐
       │                                │           │
       │                             7일 미만    7일 달성!
       │                                │           │
       │                                ▼           ▼
       │                           토큰 +10     토큰 +10 +50
       │                           반환          (보너스!) 반환
       │                                │           │
       │    ◀───── 응답 ────────────────┴───────────┘
       │    { tokens: 10, streak: N,
       │      bonusTokens: 0 or 50 }
       ▼
  updateAttendanceUI()
       │
       ├─ 출석 버튼 비활성화
       ├─ 연속 출석 일수 표시
       ├─ 토큰 잔액 갱신
       └─ (보너스 시) 축하 애니메이션
```

## 2-7. 배포 아키텍처 (Vercel)

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel 배포 구조                          │
│                                                                  │
│  vercel.json이 라우팅 규칙을 정의:                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                     요청 라우터                          │     │
│  │                                                         │     │
│  │  /api/*  ──────────────→  server.js                     │     │
│  │                           (Serverless Function)         │     │
│  │                           @vercel/node로 빌드            │     │
│  │                                                         │     │
│  │  *.html, *.css, *.js ──→  정적 파일 직접 서빙            │     │
│  │  *.png, *.jpg, *.svg      (CDN 캐시)                    │     │
│  │                                                         │     │
│  │  그 외 경로 ────────────→  해당 파일 서빙                 │     │
│  │  (예: /betting → betting.html)                          │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  실제 vercel.json 라우팅:                                         │
│  ┌──────────────────────────────────────────────┐                │
│  │ { "src": "/api/(.*)", "dest": "server.js" }  │                │
│  │ { "src": "/(.*\\.(html|css|js|png|...))",     │                │
│  │   "dest": "/$1" }                            │                │
│  │ { "src": "/(.*)", "dest": "/$1" }            │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
│  핵심: server.js 하나가 모든 API를 처리하는 "모놀리식 서버리스"     │
│  → 별도 빌드 과정 없이 server.js를 그대로 Vercel Function으로 변환  │
└──────────────────────────────────────────────────────────────────┘
```

## 2-8. Firestore 데이터베이스 컬렉션 구조

```
Firestore Database
│
├── users/                      ← 사용자 프로필 + 토큰 잔액
│   └── {userId}/
│       ├── displayName: "홍길동"
│       ├── email: "user@gmail.com"
│       ├── photoURL: "https://..."
│       ├── tokens: 150
│       ├── customDisplayName: "레이서킹"
│       ├── isAdmin: false
│       └── createdAt: Timestamp
│
├── posts/                      ← 커뮤니티 게시글
│   └── {postId}/
│       ├── title: "알론소 멋지다"
│       ├── content: "오늘 레이스..."
│       ├── authorId: "userId123"
│       ├── authorName: "레이서킹"
│       ├── tags: ["잡담"]
│       ├── likes: 5
│       ├── commentCount: 3
│       ├── createdAt: Timestamp
│       │
│       └── comments/           ← 하위 컬렉션 (서브컬렉션)
│           └── {commentId}/
│               ├── content: "동의합니다!"
│               ├── authorId: "userId456"
│               └── createdAt: Timestamp
│
├── likes/                      ← 좋아요 (중복 방지)
│   └── {postId}_{userId}/      ← 문서ID가 곧 유니크 키!
│       ├── postId: "post123"
│       └── userId: "user456"
│
├── attendance/                 ← 출석 기록
│   └── {attendanceId}/
│       ├── userId: "userId123"
│       ├── date: "20260208"
│       ├── tokens: 10
│       ├── streak: 5
│       └── timestamp: Timestamp
│
├── podiumBets/                 ← 포디움 베팅
│   └── {betId}/
│       ├── userId: "userId123"
│       ├── raceId: "bahrain_2026"
│       ├── position: 1  (P1)
│       ├── driverNumber: 14  (알론소)
│       ├── amount: 100
│       ├── odds: 8.5
│       ├── status: "pending" | "won" | "lost"
│       └── createdAt: Timestamp
│
├── headToHeadBets/             ← 1:1 베팅
│   └── {betId}/
│       ├── userId, raceId
│       ├── driverA: 14, driverB: 18
│       ├── selectedDriver: 14
│       ├── amount: 50
│       ├── odds: 1.85
│       └── status: "pending"
│
├── tokenHistory/               ← 토큰 거래 감사 로그
│   └── {historyId}/
│       ├── userId: "userId123"
│       ├── type: "ATTENDANCE" | "BET_PLACE" | "BET_WIN"
│       ├── amount: +10 | -100
│       ├── reason: "일일 출석 보상"
│       └── timestamp: Timestamp
│
├── leaderboards/               ← 리더보드 캐시 (5분마다 갱신)
│   └── {type}_{period}/
│       └── rankings: [...]
│
├── races/                      ← 레이스 정보
│   └── {raceId}/
│       ├── name: "Bahrain GP"
│       ├── date: Timestamp
│       ├── status: "upcoming" | "live" | "finished"
│       └── results: [...]
│
└── reports/                    ← 신고 (관리자만 읽기)
    └── {reportId}/
        ├── postId, reporterId
        ├── reason: "부적절한 내용"
        └── timestamp: Timestamp
```

## 2-9. CSS 공유 관계 다이어그램

```
                    ┌─────────────────────────────┐
                    │       style.css (공통)       │
                    │  헤더, 사이드메뉴, 레이아웃    │
                    │  로딩 애니메이션, 풋터         │
                    └──────────┬──────────────────┘
                               │
              모든 페이지가 이 CSS를 로드
                               │
         ┌─────────┬───────────┼───────────┬──────────┐
         ▼         ▼           ▼           ▼          ▼
    index.html  betting   paddock     mypage      driver
         │      .html     .html       .html       .html
         │         │         │           │          │
         │    betting.css paddock.css mypage.css driver.css
         │    (포디움+1:1) (게시글)    (프로필)    (프로필)
         │
         └── (추가 CSS 없음 - style.css가 카운트다운/뉴스 모두 포함)


    ┌──────────────────────────────────────────────────────────┐
    │                    공통 CSS (거의 모든 페이지)              │
    │                                                          │
    │  token.css ─────── 헤더의 "💰 150 AMR" 토큰 잔액 표시     │
    │  errorHandler.css ─ 토스트 알림, 에러 모달                 │
    └──────────────────────────────────────────────────────────┘
```

---

# 검증 방법

이것은 코드 분석/교육 문서이므로, 아래와 같이 직접 확인할 수 있습니다:

1. **파일 구조 확인**: 프로젝트 폴더 탐색기에서 위 트리와 대조
2. **로드 순서 확인**: 아무 HTML 파일을 열어 `<script>` 태그 순서 확인
3. **전역 변수 확인**: 브라우저 개발자도구(F12) → Console에서 `window.TIME_MS`, `window.db` 등 입력하여 확인
4. **API 연결 확인**: 개발자도구 → Network 탭에서 `/api/news` 등의 요청/응답 확인

---

## 관련 문서

| 문서 | 설명 |
|------|------|
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | 파일 목록 + 함수 테이블 (참조 문서) |
| [PROJECT_RULES_AND_FLOW.md](./PROJECT_RULES_AND_FLOW.md) | 규칙 + 흐름 요약 (개발자 가이드) |
| [architecture-patterns.md](./architecture-patterns.md) | 디자인 패턴 분석 (교육용) |

---

*작성일: 2026-02-08*
*분석 대상: AMR FANS (Aston Martin F1 Fan Page) 프로젝트*
