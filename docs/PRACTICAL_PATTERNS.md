# AMR FANS 프로젝트 실무 패턴 전체 분석

> 이 문서는 AMR FANS F1 팬페이지 프로젝트에서 사용된 **170개+ 실무 패턴**을 분석합니다.
> 각 패턴마다 코드 위치, 실제 코드, 사용 목적을 설명합니다.

---

# 파트 A: 클라이언트 JavaScript 패턴 (~68개)

---

## A-1. 모듈화 패턴 (8개)

### A-1-1. IIFE (즉시 실행 함수 표현식)
> 방 안에서 문 잠그고 작업하는 것 — 외부에 변수가 새어나가지 않음

**코드 위치:** `js/attendance.js:5`, `js/errorHandler.js:5`, `js/script.js:5`, `js/news.js:5`

```javascript
// js/attendance.js:5-6
(function() {
    'use strict';
    // ... 모든 코드가 이 안에서 실행됨
})();
```

**왜 이렇게 했는지:** 전역 스코프 오염 방지. 각 모듈의 내부 변수가 다른 스크립트와 충돌하지 않음.

**이 패턴이 없으면?** 모든 변수가 전역에 노출되어, 파일 간 변수명 충돌 및 의도치 않은 덮어쓰기 발생.

---

### A-1-2. IIFE + window 네임스페이스 공개 API
> 잠긴 방에서 필요한 물건만 창문으로 내보내기

**코드 위치:** `js/errorHandler.js:502-516`, `js/news.js:477-481`

```javascript
// js/errorHandler.js:502-516
window.ErrorHandler = {
    ERROR_TYPES,
    ERROR_MESSAGES,
    classifyError,
    handleError,
    safeFirestoreOperation,
    showToast,
    showGlobalAlert,
    showLoading,
    hideLoading,
    forceHideLoading,
    showSectionLoading,
    hideSectionLoading,
    setButtonLoading
};

// js/news.js:477-481
window.NewsModule = {
    openModal: openNewsModal,
    closeModal: closeNewsModal,
    refresh: initNewsSection
};
```

**왜 이렇게 했는지:** IIFE 내부 함수 중 외부에서 필요한 것만 선택적으로 공개. 캡슐화 + 필요한 API만 노출.

---

### A-1-3. 하위 호환성 별칭 (Backward Compatibility Alias)
> 이사할 때 우체국에 전 주소 → 새 주소 포워딩 신청

**코드 위치:** `js/utils.js:152-157`, `js/constants.js:17-22`

```javascript
// js/utils.js:152-154
window.cachedFetch = function(url, options = {}, ttl = apiCache.defaultTTL) {
    return smartFetch(url, options, { useCache: true, ttl });
};
window.safeFetch = function(url, options = {}) {
    return smartFetch(url, options, { useCache: false });
};

// js/constants.js:17-22
const MS_PER_SECOND = TIME_MS.SECOND;
const MS_PER_MINUTE = TIME_MS.MINUTE;
const MS_PER_HOUR = TIME_MS.HOUR;
const MS_PER_DAY = TIME_MS.DAY;
const MS_PER_WEEK = TIME_MS.WEEK;
```

**왜 이렇게 했는지:** 기존 코드가 `cachedFetch`를 사용 중이라면 즉시 깨지지 않도록. 점진적 마이그레이션 지원.

---

### A-1-4. 개발 환경 전용 기능 노출
> 직원 전용 출입구 — 고객(프로덕션)에게는 보이지 않음

**코드 위치:** `js/utils.js:391-407`

```javascript
// js/utils.js:391-407
const IS_DEVELOPMENT = window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('localhost');

if (IS_DEVELOPMENT) {
    window.setTestRace = setTestRace;
    window.clearTestRace = clearTestRace;
    window.checkTestStatus = checkTestStatus;
    window.TEST_MODE = TEST_MODE;
} else {
    window.setTestRace = () => console.warn('프로덕션 환경에서는 테스트 모드를 사용할 수 없습니다.');
    window.clearTestRace = () => {};
    window.checkTestStatus = () => ({ testMode: false, message: '프로덕션 환경' });
}
```

**왜 이렇게 했는지:** 테스트/디버그 함수가 프로덕션에서 악용되는 것을 방지.

---

### A-1-5. typeof 가드 + 조건부 선택
> 물건이 있는지 먼저 확인하고 사용하기

**코드 위치:** `js/f1api.js:47`, `js/errorHandler.js:528`

```javascript
// js/f1api.js:47-48
const fetchFn = typeof safeFetch === 'function' ? safeFetch : fetch;

// js/errorHandler.js:528-530
if (typeof window.showAlert !== 'function') {
    window.showAlert = showGlobalAlert;
}
```

**왜 이렇게 했는지:** 스크립트 로딩 순서에 의존하지 않는 안전한 코드. 함수가 없으면 대체(fallback) 사용.

---

### A-1-6. document.readyState 분기 초기화
> 파티에 늦게 왔으면 즉시 참여, 일찍 왔으면 시작 시그널 대기

**코드 위치:** `js/script.js:188-192`, `js/news.js:487-491`

```javascript
// js/script.js:188-192
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
```

**왜 이렇게 했는지:** `<script>`가 async/defer로 로드되면 DOM이 이미 준비된 상태일 수 있음. 두 경우 모두 안전하게 처리.

---

### A-1-7. Short Alias $ (DOM 단축키)
> 긴 주소 대신 별명으로 부르기

**코드 위치:** `js/paddock.js:15`

```javascript
// js/paddock.js:15
const $ = id => document.getElementById(id);
```

**왜 이렇게 했는지:** `document.getElementById`를 반복 작성하는 번거로움 제거. 코드 가독성 향상.

---

### A-1-8. 싱글톤 패턴 (Singleton)
> 건물에 경비실은 하나만 — 두 번째 만들 필요 없음

**코드 위치:** `js/errorHandler.js:206-215`

```javascript
// js/errorHandler.js:206-215
let toastContainer = null;

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}
```

**왜 이렇게 했는지:** 토스트 컨테이너가 중복 생성되는 것을 방지. 최초 1회만 생성 후 재사용.

---

## A-2. 상태 관리 패턴 (4개)

### A-2-1. 복합 상태 객체 (State Object)
> 서랍장 — 관련 물건을 한 곳에 정리

**코드 위치:** `js/paddock.js:7-11`, `js/podiumBet.js:104-120`, `js/headToHeadBet.js:10-27`, `js/raceEnergy.js:6-18`

```javascript
// js/paddock.js:7-11
const state = {
    posts: [], filter: 'all', search: '', sort: 'latest',
    lastDoc: null, hasMore: true, loading: false,
    postId: null, currentPost: null, deleteType: null, deleteId: null,
    unsubPost: null, unsubComments: null
};

// js/podiumBet.js:104-120
const bettingState = {
    selectedDrivers: { 1: null, 2: null, 3: null },
    betAmounts: { 1: 0, 2: 0, 3: 0 },
    currentPosition: null,
    raceId: null,
    userBets: [],
    countdownInterval: null
};
```

**왜 이렇게 했는지:** 흩어진 변수를 하나의 객체로 관리하면 상태 추적이 쉽고, 디버깅 시 상태를 한눈에 파악 가능.

**이 패턴이 없으면?** 전역 변수가 수십 개 흩어져 어떤 변수가 어떤 기능에 속하는지 알 수 없음.

---

### A-2-2. 중복 실행 방지 플래그 (Guard Flag)
> 회전문에 한 번에 한 명만 — 동시 진입 차단

**코드 위치:** `js/paddock.js:137`, `js/podiumBet.js:179`, `js/leaderboard.js:176`

```javascript
// js/paddock.js:136-138
async function loadPosts(reset = true) {
    if (state.loading) return;
    state.loading = true;
    // ... 작업 수행
    state.loading = false;
}

// js/podiumBet.js:179
let isBettingInProgress = false;
```

**왜 이렇게 했는지:** 사용자가 버튼을 연타하거나, 비동기 작업 중 중복 호출되는 것을 방지.

---

### A-2-3. 전역 가변 상태 + Setter
> 공용 게시판에 공지 붙이기 — 누구나 읽되, 관리자만 수정

**코드 위치:** `js/bettingData.js:117-126`

```javascript
// js/bettingData.js:117-126
let globalDriverStandings = null;
let globalStandingsLastUpdated = null;

function setGlobalDriverStandings(standings) {
    globalDriverStandings = standings;
    globalStandingsLastUpdated = new Date();
}

function getGlobalDriverStandings() {
    return globalDriverStandings;
}
```

**왜 이렇게 했는지:** API에서 가져온 드라이버 순위를 여러 모듈(podiumBet, headToHeadBet)에서 공유. Setter로 업데이트 시점 추적.

---

### A-2-4. 동기/비동기 이중 접근
> 고속도로(빠름)와 일반도로(정확) 두 경로 — 상황에 따라 선택

**코드 위치:** `js/paddock.js:20-32`

```javascript
// js/paddock.js:20-28 (비동기 - 정확한 결과)
const isAdmin = async (u) => {
    if (!u) return false;
    try {
        const token = await u.getIdTokenResult();
        return token.claims.admin === true;
    } catch { return false; }
};

// js/paddock.js:31-32 (동기 - 즉시 렌더링용)
let cachedAdminStatus = false;
const isAdminSync = () => cachedAdminStatus;
```

**왜 이렇게 했는지:** UI 렌더링 시 비동기 호출을 기다릴 수 없을 때 캐시된 동기 값 사용. 이후 비동기로 정확한 값 갱신.

---

## A-3. 비동기 패턴 (7개)

### A-3-1. Promise.race 타임아웃
> 배달앱 — 30분 내 안 오면 자동 취소

**코드 위치:** `js/utils.js:180-185`

```javascript
// js/utils.js:180-185
function withTimeout(promise, ms = 10000) {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT: 요청 시간 초과')), ms);
    });
    return Promise.race([promise, timeout]);
}
```

**왜 이렇게 했는지:** Firestore 요청이 무한 대기하는 것을 방지. 지정 시간 내 응답 없으면 에러 발생.

**이 패턴이 없으면?** 네트워크 불안정 시 사용자가 무한 로딩 화면에 갇힘.

---

### A-3-2. AbortController 타임아웃
> 수도꼭지에 타이머 — 시간 지나면 자동으로 잠김

**코드 위치:** `js/podiumBet.js:182-200`, `js/utils.js:85-91`

```javascript
// js/podiumBet.js:182-200
async function fetchWithTimeout(url, options, timeoutMs = NETWORK_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('요청 시간이 초과되었습니다. 다시 시도해주세요.');
        }
        throw error;
    }
}
```

**왜 이렇게 했는지:** Promise.race와 달리 실제 네트워크 요청 자체를 취소. 리소스 낭비 방지.

---

### A-3-3. Promise 기반 확인 다이얼로그
> window.confirm()의 업그레이드 버전 — 커스텀 UI + async/await 호환

**코드 위치:** `js/podiumBet.js:58-98`

```javascript
// js/podiumBet.js:58-98
function showConfirm(message, title = '확인') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        // ...
        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.classList.add('active');
    });
}
```

**왜 이렇게 했는지:** `const ok = await showConfirm('베팅하시겠습니까?')` 형태로 깔끔하게 사용 가능.

---

### A-3-4. Promise.all 병렬 로드
> 동시에 여러 배달 주문 — 전부 도착하면 식사 시작

**코드 위치:** `js/mypage.js:265`

```javascript
// js/mypage.js:264-268
await Promise.all([
    loadPodiumBets(user),
    loadH2HBetsForMyPage(user)
]);
```

**왜 이렇게 했는지:** 포디움 베팅과 H2H 베팅을 순차가 아닌 병렬로 로드하여 대기 시간 절반으로 단축.

---

### A-3-5. 재시도 카운터 + 최대 제한 + 지수 백오프
> 전화 안 받으면 1분, 2분, 4분, 8분 후 재시도 — 5번까지만

**코드 위치:** `js/headToHeadBet.js:191-220`

```javascript
// js/headToHeadBet.js:191-220
const H2H_LIVE_ODDS_MAX_RETRIES = 5;
let h2hLiveOddsRetryCount = 0;

async function initH2HLiveOdds() {
    if (!h2hState.raceId || typeof db === 'undefined') {
        if (h2hLiveOddsRetryCount >= H2H_LIVE_ODDS_MAX_RETRIES) {
            console.error('최대 재시도 횟수 초과');
            return;
        }
        h2hLiveOddsRetryCount++;
        const backoffDelay = 1000 * Math.pow(2, h2hLiveOddsRetryCount - 1);
        setTimeout(() => initH2HLiveOdds(), backoffDelay);
        return;
    }
    // ...
}
```

**왜 이렇게 했는지:** 무한 재시도를 방지하면서, 일시적 오류는 자동 복구. 서버 부하도 줄임.

**이 패턴이 없으면?** 초당 수백 번 재시도하여 브라우저 프리징 + 서버 과부하.

---

### A-3-6. 서버 API + Firestore 폴백 이중 경로
> 엘리베이터 고장나면 비상계단 — 항상 목적지에 도착

**코드 위치:** `js/token.js:13-63`

```javascript
// js/token.js:13-63
async function getUserTokens() {
    const user = getCurrentUser();
    if (!user) return null;
    try {
        // 1차: 서버 API
        const idToken = await user.getIdToken();
        const response = await fetch('/api/token/balance', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success) return { tokens: data.tokens, ... };
        }
        // 2차: Firestore 직접 조회 폴백
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) return doc.data();
        return await initializeUserTokens(user.uid);
    } catch (error) { ... }
}
```

**왜 이렇게 했는지:** 서버 API가 실패해도 Firestore에서 직접 데이터를 가져올 수 있어 서비스 가용성 보장.

---

### A-3-7. 서버 시간 동기화
> 시험장의 공식 시계 — 개인 시계가 아닌 공식 시간 기준

**코드 위치:** `js/podiumBet.js:139-166`

```javascript
// js/podiumBet.js:142-161
async function syncServerTime() {
    try {
        const clientBefore = Date.now();
        const response = await fetch('/api/server-time');
        const clientAfter = Date.now();
        const data = await response.json();
        if (data.success) {
            const networkDelay = (clientAfter - clientBefore) / 2;
            const serverTime = data.timestamp;
            const clientTime = clientBefore + networkDelay;
            serverTimeOffset = serverTime - clientTime;
        }
    } catch (error) { /* offset은 0 유지 */ }
}

function getServerTime() {
    return new Date(Date.now() + serverTimeOffset);
}
```

**왜 이렇게 했는지:** 베팅 마감 시간을 클라이언트 시계 조작으로 우회하는 것을 방지.

---

## A-4. 캐싱/성능 패턴 (7개)

### A-4-1. 클라이언트 메모리 캐시 + TTL
> 냉장고 — 음식을 보관하되 유통기한이 지나면 버림

**코드 위치:** `js/utils.js:9-12`, `js/f1api.js:19-21`

```javascript
// js/utils.js:9-12
const apiCache = {
    data: new Map(),
    defaultTTL: 5 * 60 * 1000  // 기본 5분
};

// js/f1api.js:19-21 (OpenF1 API 캐시)
cache: {},
CACHE_DURATION: F1_API_CONFIG.CACHE_DURATION_MS, // 30분
```

**왜 이렇게 했는지:** 동일 API를 반복 호출하지 않아 응답 속도 향상 + 서버 부하 감소.

**이 패턴이 없으면?** 페이지 이동할 때마다 동일 데이터를 매번 서버에서 가져옴.

---

### A-4-2. DOM 요소 캐싱
> 전화번호부에 자주 쓰는 번호 즐겨찾기

**코드 위치:** `js/attendance.js:11-17`, `js/script.js:16-30`

```javascript
// js/attendance.js:11-17
const elements = {
    btn: null, streak: null, calendar: null,
    miniBtn: null, miniText: null
};

function cacheElements() {
    elements.btn = document.getElementById('attendanceBtn');
    elements.streak = document.getElementById('attendanceStreak');
    // ...
}
```

**왜 이렇게 했는지:** `document.getElementById`는 매번 DOM을 탐색. 캐싱하면 한 번만 탐색 후 재사용.

---

### A-4-3. DocumentFragment
> 편지 여러 장을 봉투에 다 넣고 한 번에 배송

**코드 위치:** `js/paddock.js:158-165`

```javascript
// js/paddock.js:158-165
const fragment = document.createDocumentFragment();
snap.forEach(doc => {
    const p = { id: doc.id, ...doc.data() };
    state.posts.push(p);
    fragment.appendChild(createPostRow(p));
});
$('postsList').appendChild(fragment);
```

**왜 이렇게 했는지:** 개별 DOM 삽입 시 매번 리플로우/리페인트 발생. Fragment에 모아서 한 번에 삽입하면 성능 대폭 향상.

---

### A-4-4. requestAnimationFrame 애니메이션 트리거
> 무대 조명 — 배우가 자리 잡은 후 조명 ON

**코드 위치:** `js/errorHandler.js:245`, `js/errorHandler.js:312`, `js/errorHandler.js:352`

```javascript
// js/errorHandler.js:244-247
container.appendChild(toast);
requestAnimationFrame(() => {
    toast.classList.add('show');
});
```

**왜 이렇게 했는지:** DOM에 요소를 추가한 직후 클래스를 추가하면 브라우저가 최적화로 트랜지션을 건너뜀. rAF로 다음 프레임에 적용하면 CSS 트랜지션이 정상 작동.

---

### A-4-5. Response.clone() 캐시
> 원본은 보관하고 복사본을 돌려주기

**코드 위치:** `js/utils.js:107-119`

```javascript
// js/utils.js:107-119
if (useCache && response.ok) {
    try {
        const cacheKey = getCacheKey(url, options);
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        apiCache.data.set(cacheKey, { data, timestamp: Date.now() });
    } catch (e) { /* 캐싱 실패 시 무시 */ }
}
return response;
```

**왜 이렇게 했는지:** Response body는 한 번만 읽을 수 있음. clone()으로 복사본을 만들어 캐시에 저장하고, 원본은 호출자에게 반환.

---

### A-4-6. cachedData 파라미터 전달 (중복 호출 방지)
> 이미 사온 장보기 목록을 전달 — 다시 마트 안 감

**코드 위치:** `js/token.js:203`

```javascript
// js/token.js:203
async function updateTokenDisplay(cachedData = null) {
    // ...
    const userData = cachedData || await getUserTokens();
    // ...
}

// js/token.js:341 (호출부)
getUserTokens().then(userData => {
    updateTokenDisplay(userData);  // 이미 조회한 데이터 전달
});
```

**왜 이렇게 했는지:** `getUserTokens()`를 2번 호출하는 대신, 이미 조회한 데이터를 파라미터로 전달.

---

### A-4-7. Page Visibility API 리소스 관리
> 사무실을 나갈 때 에어컨 끄고, 돌아오면 다시 켜기

**코드 위치:** `js/script.js:174-181`

```javascript
// js/script.js:174-181
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopCountdown();  // 탭이 숨겨지면 카운트다운 중지
    } else {
        startCountdown(); // 탭이 보이면 다시 시작
    }
});
```

**왜 이렇게 했는지:** 사용자가 다른 탭에 있을 때 불필요한 setInterval 실행을 중단하여 CPU/배터리 절약.

---

## A-5. UI 패턴 (8개)

### A-5-1. 로딩 참조 카운터 (Reference Counter)
> 마지막 사람이 나갈 때만 불 끄기

**코드 위치:** `js/errorHandler.js:329-366`

```javascript
// js/errorHandler.js:329-330
let loadingOverlay = null;
let loadingCounter = 0;

function showLoading(message) {
    loadingCounter++;         // 요청할 때마다 +1
    // ... 오버레이 표시
}

function hideLoading() {
    loadingCounter = Math.max(0, loadingCounter - 1);  // -1
    if (loadingCounter === 0 && loadingOverlay) {       // 0이 되면 숨김
        loadingOverlay.classList.remove('active');
    }
}
```

**왜 이렇게 했는지:** 3개 API를 병렬 호출 중 1개만 끝났을 때 로딩이 사라지면 안 됨. 모든 요청이 끝나야 로딩 해제.

---

### A-5-2. 버튼 상태 백업/복원 via dataset
> 사진 찍어두고 원상복구

**코드 위치:** `js/errorHandler.js:422-436`

```javascript
// js/errorHandler.js:422-436
function setButtonLoading(button, loading, loadingText = '처리 중...') {
    const btn = typeof button === 'string' ? document.querySelector(button) : button;
    if (loading) {
        btn.dataset.originalText = btn.textContent;  // 원본 저장
        btn.textContent = loadingText;
        btn.disabled = true;
        btn.classList.add('loading');
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;  // 복원
        btn.disabled = false;
        btn.classList.remove('loading');
        delete btn.dataset.originalText;
    }
}
```

**왜 이렇게 했는지:** 버튼 텍스트를 '처리 중...'으로 바꿨다가 원래 텍스트로 정확히 복원.

---

### A-5-3. CSS 트랜지션 + setTimeout DOM 제거
> 퇴장 인사 후 무대 뒤로 사라지기

**코드 위치:** `js/errorHandler.js:250-253`, `js/token.js:249-253`

```javascript
// js/errorHandler.js:250-253
setTimeout(() => {
    toast.classList.remove('show');          // 페이드아웃 시작
    setTimeout(() => toast.remove(), 300);  // 300ms 후 DOM에서 제거
}, duration);

// js/podiumBet.js:433-436
btn.style.transition = 'opacity 0.3s, transform 0.3s';
btn.style.opacity = '0';
btn.style.transform = 'scale(0.8)';
setTimeout(() => btn.remove(), 300);
```

**왜 이렇게 했는지:** CSS 트랜지션이 완료된 후 DOM에서 제거. 애니메이션 없이 즉시 제거하면 뚝 끊기는 느낌.

---

### A-5-4. 탭 기반 지연 로딩 (Lazy Load on Tab Switch)
> 메뉴판을 펼쳐야 해당 요리를 만들기 시작

**코드 위치:** `js/news.js:427-432`, `js/mypage.js:85-91`

```javascript
// js/news.js:424-432
if (tabName === 'community') {
    if (!communityContainer.querySelector('.community-card')) {
        initCommunitySection();  // 최초 탭 전환 시에만 로드
    }
}

// js/mypage.js:85-91
if (tabId === 'bets') {
    loadMyBets();
} else if (tabId === 'tokens') {
    loadTokenHistory();
}
```

**왜 이렇게 했는지:** 사용자가 보지 않을 탭의 데이터를 미리 로드하지 않아 초기 로딩 속도 향상.

---

### A-5-5. 동적 모달 생성
> 필요할 때만 임시 부스 설치, 끝나면 철거

**코드 위치:** `js/token.js:270-314`

```javascript
// js/token.js:270-314
async function showTokenModal() {
    const existingModal = document.getElementById('tokenModal');
    if (existingModal) existingModal.remove();  // 기존 모달 제거

    const modal = document.createElement('div');
    modal.id = 'tokenModal';
    modal.className = 'token-modal';
    modal.innerHTML = `...`;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);
}
```

**왜 이렇게 했는지:** HTML에 모달을 미리 넣으면 모든 페이지에 불필요한 DOM 존재. 필요할 때만 생성.

---

### A-5-6. Body Scroll Lock
> 팝업이 열리면 배경 스크롤 잠금

**코드 위치:** `js/utils.js:541-542`, `js/news.js:181`

```javascript
// js/utils.js:541-542 (사이드 메뉴)
if (sideMenu.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
} else {
    document.body.style.overflow = '';
}

// js/news.js:181
document.body.style.overflow = 'hidden';
```

**왜 이렇게 했는지:** 모달/메뉴가 열린 상태에서 배경이 스크롤되면 사용자 경험 저하.

---

### A-5-7. 변경 없으면 조기 반환 (Early Return)
> 같은 층 버튼을 눌러도 엘리베이터는 움직이지 않음

**코드 위치:** `js/leaderboard.js:87-88`

```javascript
// js/leaderboard.js:87-88
function changeType(type) {
    if (leaderboardState.currentType === type) return;
    // ... 이하 변경 로직
}
```

**왜 이렇게 했는지:** 이미 선택된 탭을 다시 클릭했을 때 불필요한 API 호출과 DOM 재렌더링 방지.

---

### A-5-8. 이미지 Fallback onerror
> 사진이 깨지면 이름 이니셜로 대체

**코드 위치:** `js/leaderboard.js:390-392`

```javascript
// js/leaderboard.js:390-392
`<img src="${safePhotoURL}" alt="avatar"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
 <div class="avatar-fallback" style="display:none;">${safeDisplayName[0].toUpperCase()}</div>`
```

**왜 이렇게 했는지:** 프로필 이미지 URL이 만료되거나 접근 불가할 때, 깨진 이미지 대신 이니셜 아바타 표시.

---

## A-6. 이벤트 패턴 (5개)

### A-6-1. 옵저버 패턴 (Observer)
> 신문 구독 — 새 소식이 있으면 자동으로 배달

**코드 위치:** `js/auth.js:139`, `js/headToHeadBet.js:250`

```javascript
// js/auth.js:139
auth.onAuthStateChanged((user) => {
    updateUIForUser(user);
    // ...
});

// Firestore onSnapshot (실시간 구독)
// js/headToHeadBet.js (h2hLiveOddsState.unsubscribe = db.collection(...).onSnapshot(...))
```

**왜 이렇게 했는지:** 로그인 상태 변경이나 베팅 풀 변경을 실시간으로 감지하여 UI 자동 업데이트.

**이 패턴이 없으면?** 매번 새로고침하거나 주기적 폴링 필요.

---

### A-6-2. 이벤트 위임 + data-attribute + closest()
> 접수 데스크 — 개별 직원이 아닌 데스크에서 모든 요청을 처리

**코드 위치:** `js/paddock.js:355-364`

```javascript
// js/paddock.js:354-364
$('postDetail').onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'edit') openEditModal(id);
    else if (action === 'delete') confirmDeletePost(id);
    else if (action === 'like') toggleLike(id);
    else if (action === 'report') openReportModal(id, 'post');
};
```

**왜 이렇게 했는지:** 동적으로 생성되는 요소에 개별 이벤트 리스너를 달 필요 없음. 부모에 하나만 등록.

**이 패턴이 없으면?** 게시글을 로드할 때마다 각 버튼에 이벤트를 일일이 등록해야 하고, 메모리 누수 위험.

---

### A-6-3. 키보드 접근성 (Enter/Space)
> 마우스 없이도 모든 기능 사용 가능

**코드 위치:** `js/news.js:339-345`

```javascript
// js/news.js:339-345
newsContainer.querySelectorAll('.news-card').forEach((card, index) => {
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openNewsModal(index);
        }
    });
});
```

**왜 이렇게 했는지:** 웹 접근성(a11y) 준수. 스크린 리더 사용자도 뉴스를 열 수 있음.

---

### A-6-4. beforeunload 다중 리소스 정리
> 퇴근할 때 PC 끄고, 에어컨 끄고, 문 잠그기

**코드 위치:** `js/auth.js:271-273`, `js/podiumBet.js:397-407`, `js/raceEnergy.js:469-476`

```javascript
// js/podiumBet.js:397-407
window.addEventListener('beforeunload', () => {
    if (bettingState.countdownInterval) clearInterval(bettingState.countdownInterval);
    if (liveOddsState.unsubscribe) liveOddsState.unsubscribe();
    if (cancelButtonTimerId) clearInterval(cancelButtonTimerId);
});

// js/auth.js:271-272
window.addEventListener('beforeunload', () => {
    tokenManager.stopAutoRefresh();
});
```

**왜 이렇게 했는지:** 페이지 이탈 시 setInterval, Firestore 구독, 토큰 갱신 등을 정리하여 메모리 누수 방지.

---

### A-6-5. 네트워크 상태 감지 (online/offline)
> 와이파이 신호등 — 끊기면 빨간불, 연결되면 초록불

**코드 위치:** `js/errorHandler.js:466-478`

```javascript
// js/errorHandler.js:466-478
let wasOffline = false;

window.addEventListener('online', function() {
    if (wasOffline) {
        showToast('인터넷에 다시 연결되었습니다', 'success');
        wasOffline = false;
    }
});

window.addEventListener('offline', function() {
    wasOffline = true;
    showToast('인터넷 연결이 끊어졌습니다', 'error', 6000);
});
```

**왜 이렇게 했는지:** 네트워크 끊김/복구를 사용자에게 즉시 알려 혼란 방지.

---

## A-7. 보안 패턴 (8개)

### A-7-1. XSS 방지 escapeHtml
> 편지에 있는 폭탄을 제거하고 내용만 전달

**코드 위치:** `js/utils.js:196-201`

```javascript
// js/utils.js:196-201
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

**왜 이렇게 했는지:** 사용자 입력에 `<script>` 태그가 있어도 실행되지 않고 문자열로 표시.

**이 패턴이 없으면?** 게시판에 악성 스크립트 삽입 → 다른 사용자의 쿠키/토큰 탈취 가능 (XSS 공격).

---

### A-7-2. URL 도메인 화이트리스트 (getSafePhotoURL)
> 신분증 확인 — 허가된 도메인의 이미지만 허용

**코드 위치:** `js/utils.js:242-270`

```javascript
// js/utils.js:242-270
const ALLOWED_PHOTO_DOMAINS = [
    'googleusercontent.com', 'lh3.googleusercontent.com',
    'gravatar.com', 'www.gravatar.com'
];

function getSafePhotoURL(url, fallback = 'https://www.gravatar.com/avatar/?d=mp') {
    if (!url) return fallback;
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:') return fallback;
        const isAllowed = ALLOWED_PHOTO_DOMAINS.some(domain =>
            parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
        );
        return isAllowed ? url : fallback;
    } catch { return fallback; }
}
```

**왜 이렇게 했는지:** 악의적인 사용자가 프로필 이미지 URL을 `javascript:` 또는 악성 서버로 변경하는 것을 방지.

---

### A-7-3. Hex 색상 정규식 검증
> 페인트통 라벨 확인 — 진짜 색상 코드인지 검증

**코드 위치:** `js/podiumBet.js:678`

```javascript
// js/podiumBet.js:678
const safeColor = d.teamColor && /^#[0-9A-Fa-f]{6}$/.test(d.teamColor) ? d.teamColor : '#ffffff';
```

**왜 이렇게 했는지:** teamColor에 CSS injection 코드가 들어가는 것을 방지. 정확히 `#RRGGBB` 형식만 허용.

---

### A-7-4. 서버 에러 메시지 은닉
> 내부 사정은 알려주지 않고 "잠시 후 다시 시도해주세요"만 표시

**코드 위치:** `js/auth.js:51-53`

```javascript
// js/auth.js:51-53
console.error('로그인 에러 상세:', error.code, error.message);
showGlobalAlert('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error', '로그인 실패');
```

**왜 이렇게 했는지:** 상세 에러 정보(스택 트레이스, 내부 코드)를 사용자에게 노출하면 공격자에게 힌트가 됨.

---

### A-7-5. 클라이언트 토큰 지급 함수 차단 (addTokens throw)
> 금고에 자물쇠 + 경보 — 무단 접근 시 즉시 차단

**코드 위치:** `js/token.js:116-118`

```javascript
// js/token.js:116-118
async function addTokens(amount, reason) {
    throw new Error('Unauthorized: 토큰 지급은 서버에서만 가능합니다.');
}
```

**왜 이렇게 했는지:** 개발자 도구에서 `addTokens(99999)` 호출로 무한 토큰 생성 방지. 토큰 지급은 서버 API만 가능.

**이 패턴이 없으면?** 누구나 브라우저 콘솔에서 토큰을 무한 생성 가능.

---

### A-7-6. 입력 길이 제한 (DoS 방지)
> 편지 봉투에 크기 제한 — 100kg짜리 소포는 접수 거부

**코드 위치:** `js/paddock.js:235-236`, `js/token.js:136`

```javascript
// js/paddock.js:235-236
if (title.length > 100) return showToast('제목은 100자를 초과할 수 없습니다.', 'warning');
if (content.length > 5000) return showToast('내용은 5000자를 초과할 수 없습니다.', 'warning');

// js/token.js:136
if (typeof reason !== 'string' || reason.length === 0 || reason.length > 200) {
    console.error('잘못된 차감 사유:', reason);
    return false;
}
```

**왜 이렇게 했는지:** 수백만 글자를 전송하여 서버/DB를 마비시키는 DoS 공격 방지.

---

### A-7-7. 서버 쿨다운 검증
> 출입 기록 — localStorage 우회 방지

**코드 위치:** `js/paddock.js:240-253`

```javascript
// js/paddock.js:240-253
const idToken = await user.getIdToken();
const cooldownRes = await fetch('/api/post/check-cooldown', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
    }
});
const cooldownData = await cooldownRes.json();
if (!cooldownData.canPost) {
    return showToast(cooldownData.message || '잠시 후 다시 시도해주세요.', 'warning');
}
```

**왜 이렇게 했는지:** 클라이언트 쿨다운(localStorage)은 개발자 도구로 우회 가능. 서버에서 최종 검증.

---

### A-7-8. JSON 파싱 에러 안전 처리
> 택배 포장이 손상되었을 때 — 열어보기 전에 확인

**코드 위치:** `js/attendance.js:94-100`, `js/token.js:28-35`

```javascript
// js/attendance.js:94-100
let data;
try {
    data = await response.json();
} catch (parseError) {
    console.error('JSON 파싱 실패:', parseError);
    throw new Error('서버 응답 형식 오류');
}
```

**왜 이렇게 했는지:** 서버가 HTML 에러 페이지를 반환하거나 응답이 손상된 경우, `response.json()`이 throw. 이를 안전하게 처리.

---

## A-8. 데이터 패턴 (7개)

### A-8-1. Firestore Timestamp 다형성 처리
> 같은 시간이 세 가지 포장 — 어떤 형태로 와도 처리

**코드 위치:** `js/utils.js:220-233`, `js/mypage.js:112-119`

```javascript
// js/utils.js:220-233
function isToday(date) {
    if (!date) return false;
    let checkDate;
    if (date.toDate) {
        checkDate = date.toDate();           // Firestore SDK Timestamp
    } else if (date._seconds !== undefined) {
        checkDate = new Date(date._seconds * 1000);  // 서버 API JSON
    } else {
        checkDate = new Date(date);          // 일반 Date/문자열
    }
    // ...
}
```

**왜 이렇게 했는지:** Firestore에서 직접 조회하면 `Timestamp` 객체, 서버 API 경유하면 `{_seconds, _nanoseconds}` JSON. 두 경로 모두 지원.

---

### A-8-2. 커서 기반 페이지네이션
> 책갈피 — 마지막으로 읽은 곳부터 이어서

**코드 위치:** `js/paddock.js:149`, `js/mypage.js:462-467`

```javascript
// js/paddock.js:149
if (state.lastDoc && !reset) q = q.startAfter(state.lastDoc);

// js/mypage.js:462-467
const tokenHistoryState = {
    nextCursor: null,
    isLoading: false,
    allItems: []
};
```

**왜 이렇게 했는지:** offset 방식보다 Firestore에 최적화. 문서 수가 많아도 성능 일정.

---

### A-8-3. N-gram 검색 키워드 생성
> 단어를 조각내서 부분 검색 지원

**코드 위치:** `js/paddock.js:62-67`

```javascript
// js/paddock.js:62-67
function genKeywords(text) {
    if (!text) return [];
    const words = text.toLowerCase().trim().split(/\s+/), keys = new Set();
    words.forEach(w => {
        if (w.length >= 2) {
            keys.add(w);
            for (let i = 0; i < w.length - 1; i++)
                for (let j = i + 2; j <= Math.min(i + 4, w.length); j++)
                    keys.add(w.substring(i, j));
        }
    });
    return [...keys];
}
```

**왜 이렇게 했는지:** Firestore는 LIKE 검색을 지원하지 않음. N-gram으로 부분 문자열을 키워드 배열에 저장하여 `array-contains-any`로 검색.

---

### A-8-4. 상대 시간 포맷팅
> "3시간 전" — 절대 시간보다 직관적

**코드 위치:** `js/paddock.js:46-53`

```javascript
// js/paddock.js:46-53
function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts), diff = Date.now() - d;
    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
```

**왜 이렇게 했는지:** SNS 스타일 시간 표시로 사용자 경험 향상. 7일 이후는 절대 날짜로 전환.

---

### A-8-5. localStorage 영속화 + 만료 정리
> 냉장고 뒷정리 — 유통기한 지난 것 주기적 제거

**코드 위치:** `js/raceEnergy.js:46-103`

```javascript
// js/raceEnergy.js:46-68 (저장)
const notified = localStorage.getItem(`settlement_notified_${raceId}`);

// js/raceEnergy.js:73-103 (7일 초과 기록 정리)
function cleanupOldSettlementRecords() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('settlement_notified_')) {
            const match = key.match(/settlement_notified_race_\d+_(\d{8})/);
            if (match) {
                // ... 날짜 파싱 후 7일 초과 확인
                if (daysDiff > 7) keysToRemove.push(key);
            }
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}
```

**왜 이렇게 했는지:** localStorage에 계속 쌓이면 용량 한계에 도달. 오래된 기록을 자동 정리.

---

### A-8-6. Matchup ID 정규화 (Canonical Key)
> A vs B = B vs A — 항상 같은 키로 저장

**코드 위치:** `js/headToHeadBet.js:367-368`

```javascript
// js/headToHeadBet.js:367-368
function getH2HLiveOdds(driverNumA, driverNumB) {
    const nums = [driverNumA, driverNumB].sort((a, b) => a - b);
    const matchupId = `${nums[0]}_${nums[1]}`;
    // ...
}
```

**왜 이렇게 했는지:** 14 vs 18과 18 vs 14는 같은 매치업. 항상 작은 번호가 앞에 오도록 정규화하여 중복 방지.

---

### A-8-7. 상수 동결 Object.freeze
> 유리 케이스 안의 전시품 — 볼 수 있지만 수정 불가

**코드 위치:** `js/constants.js:185-198`

```javascript
// js/constants.js:185-198
if (typeof window !== 'undefined') {
    Object.freeze(TIME_MS);
    Object.freeze(TOKEN_CONFIG);
    Object.freeze(BETTING_CONFIG);
    Object.freeze(H2H_CONFIG);
    Object.freeze(API_CONFIG);
    Object.freeze(UI_CONFIG);
    Object.freeze(SEASON_CONFIG);
    Object.freeze(LEADERBOARD_CONFIG);
}
```

**왜 이렇게 했는지:** 개발자 도구에서 `TOKEN_CONFIG.ATTENDANCE = 99999`로 변경하는 것을 차단. (단, 서버에서도 재검증 필수)

---

## A-9. 수학/알고리즘 패턴 (8개)

### A-9-1. 시그모이드 함수 확률 계산
> S자 곡선 — 순위 차이를 승률로 변환

**코드 위치:** `js/headToHeadBet.js:862-873`

```javascript
// js/headToHeadBet.js:862-873
function calculateDynamicOdds(rankA, rankB, baseOddsA, baseOddsB) {
    const rankDiff = rankA - rankB;
    const k = 0.15;

    // 시그모이드 함수: 1 / (1 + e^(k * rankDiff))
    const probA = 1 / (1 + Math.exp(k * rankDiff));
    const probB = 1 - probA;

    const margin = 1 + H2H_ODDS_CONFIG.HOUSE_EDGE;
    let oddsA = 1 / (probA * margin);
    let oddsB = 1 / (probB * margin);

    oddsA = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsA));
    oddsB = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsB));
    // ...
}
```

**왜 이렇게 했는지:** 로지스틱 함수(시그모이드)는 순위 차이를 0~1 확률로 자연스럽게 변환. 스포츠 베팅 업계 표준 방식.

---

### A-9-2. 지수적 배당률 계산
> 순위가 내려갈수록 배당률이 기하급수적으로 증가

**코드 위치:** `js/bettingData.js:199-211`

```javascript
// js/bettingData.js:199-211
function getOddsFromSeasonRank(rank) {
    const safeRank = Math.max(1, Math.min(22, rank));
    const baseOdds = 1.3;
    const growthFactor = 0.12;
    const odds = baseOdds * Math.pow(1 + growthFactor, safeRank - 1);
    return Math.max(1.1, Math.min(50.0, Math.round(odds * 10) / 10));
}
```

**왜 이렇게 했는지:** 1위(1.3x)와 22위(~15x) 사이의 배당률을 자연스러운 곡선으로 배분.

---

### A-9-3. 시드 기반 의사 난수
> 같은 날에는 같은 결과 — 새로고침해도 동일

**코드 위치:** `js/utils.js:485-498`

```javascript
// js/utils.js:485-498
function generateDailySeed() {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}
```

**왜 이렇게 했는지:** 하루 동안 동일한 콘텐츠를 표시해야 하는 경우 (예: 오늘의 운세). 서버 없이 클라이언트에서 재현 가능한 랜덤.

---

### A-9-4. 다단계 매칭 전략 (번호 → 이름)
> 주민등록번호로 못 찾으면 이름으로, 이름으로도 못 찾으면 별명으로

**코드 위치:** `js/bettingData.js:141-162`

```javascript
// js/bettingData.js:140-162
function getDriverSeasonRankFromStandings(driverNumber) {
    if (globalDriverStandings && globalDriverStandings.length > 0) {
        // 1단계: 드라이버 번호로 매칭
        let standing = globalDriverStandings.find(s =>
            parseInt(s.driver.number) === parseInt(driverNumber)
        );
        // 2단계: 번호 매칭 실패 시 이름으로 매칭
        if (!standing) {
            const driver = getDriverByNumber(driverNumber);
            if (driver) {
                const lastName = driver.name.split(' ').pop().toLowerCase();
                standing = globalDriverStandings.find(s =>
                    s.driver.lastName.toLowerCase() === lastName ||
                    s.driver.lastName.toLowerCase().includes(lastName)
                );
            }
        }
        if (standing) return standing.position;
    }
    // 3단계: 하드코딩된 배당률 기반 순위 추정
    const baseOdds = DRIVER_ODDS[driverNumber];
    // ...
}
```

**왜 이렇게 했는지:** 외부 API(OpenF1)의 드라이버 번호 체계와 내부 체계가 다를 수 있어 다단계 폴백 매칭.

---

### A-9-5. 3단계 폴백 데이터 전략
> 1차 식당 만석 → 2차 식당 → 편의점 도시락

**코드 위치:** `js/f1api.js:254`

```javascript
// js/f1api.js:254 (getDriverStandings)
// 1단계: OpenF1 API (현재 시즌)
// 2단계: OpenF1 API (이전 시즌, 시즌-1, 시즌-2 순서)
// 3단계: 하드코딩 폴백 (DRIVER_ODDS 기반)
const seasonsToTry = [season, season - 1, season - 2];
for (const s of seasonsToTry) {
    try {
        const sessionKey = await OPENF1_API.getLatestRaceSessionKey(s);
        if (!sessionKey) continue;
        // ...
    } catch { continue; }
}
```

**왜 이렇게 했는지:** 시즌 초기에는 현재 시즌 데이터가 없을 수 있음. 이전 시즌 → 하드코딩 순서로 항상 데이터 제공.

---

### A-9-6. Range Clamping (값 범위 제한)
> 온도 조절기 — 18°C~30°C 사이만 허용

**코드 위치:** `js/bettingData.js:201`, `js/bettingData.js:210`

```javascript
// js/bettingData.js:201
const safeRank = Math.max(1, Math.min(22, rank));

// js/bettingData.js:210
return Math.max(1.1, Math.min(50.0, Math.round(odds * 10) / 10));
```

**왜 이렇게 했는지:** 배당률이 0.5x(손해 보장)나 999x(무한 이익)가 되는 것을 방지.

---

### A-9-7. 한국어 숫자 포맷팅
> 12345 → "1.2만"

**코드 위치:** `js/leaderboard.js:697-705`

```javascript
// js/leaderboard.js:697-705
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '만';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}
```

**왜 이렇게 했는지:** 한국어 사용자에게 "10000"보다 "1만"이 직관적.

---

### A-9-8. 개인정보 마스킹
> 홍길동 → 홍*동

**코드 위치:** `js/leaderboard.js:682-695`

```javascript
// js/leaderboard.js:682-695
function maskName(name) {
    if (!name || name.length < 2) return '***';
    if (name.length === 2) return name[0] + '*';
    const first = name[0];
    const last = name[name.length - 1];
    const middle = '*'.repeat(Math.min(name.length - 2, 3));
    return first + middle + last;
}
```

**왜 이렇게 했는지:** 리더보드에 전체 이름을 표시하면 개인정보 노출. 마스킹으로 프라이버시 보호.

---

# 파트 B: 서버 패턴 (~62개)

> 모든 줄 번호는 `server.js` 기준

---

## B-1. 미들웨어 패턴 (4개)

### B-1-1. 글로벌 미들웨어 체인 순서
> 공항 보안 — 입국 심사 → 세관 검사 → 수화물 찾기 순서가 정해져 있음

**코드 위치:** `server.js:80-153`

```javascript
// 1단계: CORS (줄 85-95)
app.use(cors({ origin: function(origin, callback) { ... } }));

// 2단계: Rate Limiting (줄 97-126)
app.use('/api/', apiLimiter);

// 3단계: 보안 헤더 (줄 128-147)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // ...
});

// 4단계: Body Parser + Static (줄 149-153)
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));
```

**왜 이렇게 했는지:** CORS → Rate Limit → 보안 헤더 → 파싱 순서. CORS 실패하면 요청 자체를 차단, Rate Limit이 파싱 전에 걸려야 대용량 본문 파싱 방지.

**이 패턴이 없으면?** 순서가 바뀌면 Rate Limiting 전에 큰 JSON을 파싱하여 DoS 공격에 취약.

---

### B-1-2. 커스텀 인증 미들웨어 (verifyFirebaseToken)
> 사원증 확인 — 정문에서 한 번 확인하면 내부에서는 자유롭게

**코드 위치:** `server.js:540-555`

```javascript
// server.js:540-555
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: '인증 필요' });
    }
    try {
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: '인증 실패' });
    }
}
```

**왜 이렇게 했는지:** 각 라우트마다 인증 로직을 반복하지 않고, 미들웨어 하나로 통일. `req.user`에 검증된 사용자 정보 주입.

---

### B-1-3. 라우트별 조건부 미들웨어
> VIP 라운지 — 특정 구역에만 추가 보안 검사

**코드 위치:** `server.js:577`, `server.js:1945`

```javascript
// server.js:577 (인증이 필요한 라우트에만 적용)
app.post('/api/token/attendance', verifyFirebaseToken, async (req, res) => { ... });

// server.js:1945 (뉴스 기사 API에만 별도 Rate Limiter)
app.get('/api/article', articleLimiter, async (req, res) => { ... });
```

**왜 이렇게 했는지:** 뉴스 조회는 인증 불필요, 출석체크는 인증 필수. 라우트마다 필요한 미들웨어만 적용.

---

### B-1-4. Catch-All 404 미들웨어
> 안내 데스크 — 잘못된 주소로 온 손님을 안내

**코드 위치:** `server.js:4031-4034`

```javascript
// server.js:4031-4034
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});
```

**왜 이렇게 했는지:** 존재하지 않는 API/페이지 요청 시 기본 에러 대신 커스텀 404 페이지 표시.

---

## B-2. 보안 패턴 (13개)

### B-2-1. 화이트리스트 CORS
> 초대장이 있는 손님만 입장

**코드 위치:** `server.js:80-95`

```javascript
// server.js:80-82
const ALLOWED_ORIGINS = [
    'https://amrfans.vercel.app',
    // ...
];
app.use(cors({
    origin: function(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
```

**왜 이렇게 했는지:** 다른 도메인에서 API를 무단 호출하는 것을 차단.

---

### B-2-2. 다중 Rate Limiting (4단계)
> 놀이공원 — 구역마다 다른 입장 제한

**코드 위치:** `server.js:97-126`

```javascript
// server.js:99-105 (일반 API: 15분, 100회)
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: IS_DEV ? 1000 : 100 });

// server.js:108-112 (기사 API: 5분, 30회)
const articleLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 30 });

// server.js:115-121 (관리자 API: 15분, 10회)
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
```

**왜 이렇게 했는지:** API 종류마다 적절한 제한. 관리자 API는 더 엄격하게, 개발 환경은 느슨하게.

---

### B-2-3. OWASP 보안 헤더
> 건물 외벽 보강 — 여러 공격 벡터를 미리 차단

**코드 위치:** `server.js:128-147`

```javascript
// server.js:128-147
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');     // MIME 스니핑 방지
    res.setHeader('X-Frame-Options', 'DENY');               // 클릭재킹 방지
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');     // XSS 필터
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');  // HTTPS 강제
    res.setHeader('Content-Security-Policy', "default-src 'self'; ...");  // CSP
    next();
});
```

**왜 이렇게 했는지:** OWASP Top 10 취약점에 대한 기본 방어선.

---

### B-2-4. SSRF 방지 도메인 화이트리스트
> 택배 발송 — 허가된 주소로만 배송 가능

**코드 위치:** `server.js:1911-1942`

```javascript
// server.js:1912-1920
const ALLOWED_NEWS_DOMAINS = [
    'formula1.com', 'www.formula1.com',
    'motorsport.com', 'www.motorsport.com',
    'autosport.com', 'www.autosport.com'
];

function isAllowedNewsUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        return ALLOWED_NEWS_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    } catch { return false; }
}
```

**왜 이렇게 했는지:** 사용자가 `/api/article?url=http://내부서버` 형태로 내부 네트워크 접근하는 SSRF 공격 차단.

**이 패턴이 없으면?** 서버가 프록시 역할을 해서 내부 인프라에 접근 가능.

---

### B-2-5. 금지어 필터 + 우회 방지
> 공항 보안 — 금지 물품을 여러 방식으로 숨겨도 탐지

**코드 위치:** `server.js:999-1038`

```javascript
// server.js:999-1038
function containsBadWords(text) {
    const BAD_WORDS = ['시발', '씨발', /* ... */];
    const BAD_CONSONANTS = ['ㅅㅂ', 'ㅂㅅ', /* ... */];

    const lower = text.toLowerCase();
    // 특수문자 제거한 버전으로 우회 방지
    const stripped = lower.replace(/[^가-힣a-z0-9]/g, '');

    for (const word of BAD_WORDS) {
        if (lower.includes(word) || stripped.includes(word)) return true;
    }
    // 자음만으로 된 욕설도 검사
    for (const consonant of BAD_CONSONANTS) {
        if (text.includes(consonant)) return true;
    }
    return false;
}
```

**왜 이렇게 했는지:** "시@발" 같은 특수문자 삽입 우회를 stripped 버전으로 탐지.

---

### B-2-6. Server-Side Timestamp (KST)
> 공식 시계 — 클라이언트가 아닌 서버 시간 기준

**코드 위치:** `server.js:585-591`

```javascript
// server.js:585-591
const now = new Date();
const kstOffset = 9 * 60 * 60 * 1000;
const kstDate = new Date(now.getTime() + kstOffset);
const dateStr = kstDate.toISOString().split('T')[0].replace(/-/g, '');
const attendanceId = `${userId}_${dateStr}`;
```

**왜 이렇게 했는지:** 출석체크 중복 방지를 위한 문서 ID를 서버 시간 기준 KST로 생성. 클라이언트 시간 조작 방지.

---

### B-2-7. Admin Key 최소 길이 + 환경별 분기
> 열쇠 복잡도 — 프로덕션은 복잡한 열쇠 필수

**코드 위치:** `server.js:59-78`

```javascript
// server.js:59-78
const MIN_ADMIN_KEY_LENGTH = 32;
if (!ADMIN_KEY || ADMIN_KEY.length < MIN_ADMIN_KEY_LENGTH) {
    if (IS_PRODUCTION) {
        console.error('FATAL: ADMIN_KEY가 설정되지 않았거나 너무 짧습니다.');
        process.exit(1);  // 프로덕션에서는 서버 시작 차단
    } else {
        console.warn('개발 환경: ADMIN_KEY 경고 (최소 32자 권장)');
    }
}
```

**왜 이렇게 했는지:** 약한 Admin Key로 프로덕션 서버가 실행되는 것을 원천 차단.

---

### B-2-8. Server-Authoritative 배당률 계산
> 심판의 판정 — 선수(클라이언트)가 점수를 정할 수 없음

**코드 위치:** `server.js:1532-1555`

```javascript
// server.js:1532-1555
// 클라이언트가 보낸 배당률을 무시하고 서버에서 재계산
const serverOdds = calculateServerOdds(driverNumber, position, raceId);
// 서버 계산 배당률을 사용하여 베팅 처리
```

**왜 이렇게 했는지:** 클라이언트에서 배당률을 조작하여 보낼 수 있으므로, 서버에서 독립적으로 재계산.

---

### B-2-9. 배당률 조작 감지 로그
> CCTV — 이상 행동 자동 감지 및 기록

**코드 위치:** `server.js:2471-2476`

```javascript
// server.js:2471-2476
const oddsDiff = Math.abs(serverOdds - clientOdds);
if (oddsDiff > 0.5) {
    console.warn(`⚠️ H2H 배당률 조작 의심: userId=${userId}, client=${clientOdds}, server=${serverOdds}`);
}
```

**왜 이렇게 했는지:** 클라이언트가 보낸 배당률과 서버 계산 배당률이 크게 다르면 조작 시도로 의심하고 로그 기록.

---

### B-2-10. 저배당 어뷰징 방지
> 확정 수익 차단 — 1.05배당에 대량 베팅하는 꼼수 방지

**코드 위치:** `server.js:1755-1761`

```javascript
// server.js:1755-1761
if (serverOdds < 1.10 && betAmount > 50) {
    return res.status(400).json({
        success: false,
        error: '매우 낮은 배당률(1.10x 미만)에서는 50 AMR 이상 베팅할 수 없습니다.'
    });
}
```

**왜 이렇게 했는지:** 배당률 1.05x에 10000 토큰 베팅 = 거의 확실한 500 토큰 이익. 이런 어뷰징 방지.

---

### B-2-11. 시간 기반 베팅 마감
> 경매 종료 — 망치가 내려간 후에는 입찰 불가

**코드 위치:** `server.js:1557-1581`

```javascript
// server.js:1557-1581
function validateRaceTime(raceId) {
    // 레이스 시작 시간 조회 후 현재 시간과 비교
    const raceDate = new Date(race.date);
    const now = new Date();
    if (now >= raceDate) {
        throw new Error('레이스가 이미 시작되었습니다. 베팅이 마감되었습니다.');
    }
}
```

**왜 이렇게 했는지:** 레이스 결과를 알고 나서 베팅하는 것을 서버 레벨에서 차단.

---

### B-2-12. 입력 검증 + 길이 제한
> 세관 검사 — 모든 화물의 크기와 내용물 검사

**코드 위치:** 다수 (`server.js` 전반)

```javascript
// 제목 길이 제한, 내용 길이 제한, 숫자 범위 검증, 타입 검증 등
if (typeof title !== 'string' || title.length > 100) { ... }
if (!Number.isInteger(amount) || amount < 1 || amount > 3000) { ... }
```

**왜 이렇게 했는지:** 클라이언트 검증은 우회 가능. 서버에서 모든 입력을 재검증.

---

### B-2-13. JSON 파싱 에러 안전 처리
> 서버 응답도 안전하게 파싱

**코드 위치:** 다수 (클라이언트에서 서버 응답 수신 시)

**왜 이렇게 했는지:** 서버가 예상치 못한 HTML 에러 페이지를 반환할 때 `response.json()` 실패를 안전하게 처리.

---

## B-3. 데이터베이스 패턴 (9개)

### B-3-1. Firestore 트랜잭션
> 은행 송금 — 출금과 입금이 반드시 동시에 완료

**코드 위치:** `server.js:594-692`

```javascript
// server.js:594-692
await db.runTransaction(async (transaction) => {
    // 1. 기존 출석 기록 확인 (중복 방지)
    const existingAttendance = await transaction.get(attendanceRef);
    if (existingAttendance.exists) throw new Error('이미 출석체크를 완료했습니다.');

    // 2. 사용자 데이터 조회
    const userDoc = await transaction.get(userRef);

    // 3. 출석 기록 생성 + 사용자 토큰 업데이트 + 토큰 내역 기록
    transaction.set(attendanceRef, { ... });
    transaction.update(userRef, { tokens: FieldValue.increment(totalReward), ... });
    transaction.set(historyRef, { ... });
});
```

**왜 이렇게 했는지:** 출석 기록 생성 → 토큰 지급이 원자적으로 실행. 중간에 실패하면 전부 롤백.

**이 패턴이 없으면?** 출석 기록은 저장됐는데 토큰이 안 지급되는 불일치 발생 가능.

---

### B-3-2. FieldValue.increment() 원자적 증감
> 카운터 — 동시에 여러 명이 눌러도 정확하게 +1

**코드 위치:** `server.js:652-653`

```javascript
// server.js:652-653
tokens: admin.firestore.FieldValue.increment(totalReward),
totalEarned: admin.firestore.FieldValue.increment(totalReward),
```

**왜 이렇게 했는지:** `tokens = tokens + reward`는 읽기-수정-쓰기 사이에 다른 요청이 끼어들 수 있음. `increment()`는 원자적 연산.

---

### B-3-3. 결정론적 문서 ID (중복 방지)
> 주민등록번호 — 같은 사람에게 두 번 발급 불가

**코드 위치:** `server.js:591`

```javascript
// server.js:591
const attendanceId = `${userId}_${dateStr}`;  // "uid123_20260208"
```

**왜 이렇게 했는지:** 사용자 ID + 날짜로 문서 ID를 생성하면, 같은 날 같은 사용자의 출석은 같은 문서 ID → 중복 생성 불가.

---

### B-3-4. Batch Write 분할 처리
> 택배 묶음 배송 — 500개를 한 트럭에 모아서

**코드 위치:** `server.js:2586-2607`

```javascript
// server.js:2586-2607
const batch = db.batch();
for (const race of RACE_SCHEDULE) {
    batch.set(raceRef, { ... });
}
await batch.commit();
```

**왜 이렇게 했는지:** 24개 레이스 문서를 개별 `set()`으로 24번 호출하는 대신, batch로 1회 네트워크 요청.

---

### B-3-5. FieldValue.serverTimestamp()
> 공증 도장 — 서버가 정확한 시간을 찍어줌

**코드 위치:** `server.js:644`, `server.js:654`

```javascript
// server.js:644
timestamp: admin.firestore.FieldValue.serverTimestamp(),
// server.js:654
lastAttendance: admin.firestore.FieldValue.serverTimestamp(),
```

**왜 이렇게 했는지:** 클라이언트 시간이 아닌 Firestore 서버 시간 사용. 시간 조작 방지.

---

### B-3-6. merge: true Upsert
> 있으면 업데이트, 없으면 생성

**코드 위치:** `server.js:1261`

```javascript
// server.js:1261
await db.collection('users').doc(userId).set({ ... }, { merge: true });
```

**왜 이렇게 했는지:** 기존 문서가 있으면 지정한 필드만 업데이트, 없으면 새 문서 생성. 기존 데이터를 덮어쓰지 않음.

---

### B-3-7. FieldValue.delete() 필드 삭제
> 이력서에서 특정 항목만 삭제

**코드 위치:** `server.js:1144-1146`

```javascript
// server.js:1144-1146
customDisplayName: admin.firestore.FieldValue.delete(),
nicknameChangedAt: admin.firestore.FieldValue.delete(),
```

**왜 이렇게 했는지:** 닉네임을 원래대로 초기화할 때 커스텀 닉네임 필드 자체를 삭제. `null`로 설정하는 것과 다름.

---

### B-3-8. 커서 기반 서버 페이지네이션
> 도서관 서가 — 마지막으로 읽은 책 번호부터 다음 10권

**코드 위치:** `server.js:937-993`

```javascript
// server.js:937-993
let query = db.collection('tokenHistory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(20);

if (cursor) {
    const cursorDoc = await db.collection('tokenHistory').doc(cursor).get();
    if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
    }
}
```

**왜 이렇게 했는지:** offset 기반 페이지네이션은 데이터가 많아지면 느려짐. cursor 기반은 항상 일정한 성능.

---

### B-3-9. count() 집계 쿼리
> 전체 인원수만 빠르게 파악

**코드 위치:** `server.js:949-953`

```javascript
// server.js:949-953
const countSnapshot = await db.collection('tokenHistory')
    .where('userId', '==', userId)
    .count()
    .get();
const totalCount = countSnapshot.data().count;
```

**왜 이렇게 했는지:** 전체 문서를 다 가져와서 `length`를 세는 대신, Firestore 집계 쿼리로 효율적으로 개수만 조회.

---

## B-4. 캐싱 패턴 (4개)

### B-4-1. 메모리 캐시 + TTL (뉴스 30분)
> 자판기 재고 — 30분마다 보충

**코드 위치:** `server.js:155-160`

```javascript
// server.js:156-160
const newsCache = { data: null, timestamp: 0 };
const CACHE_DURATION = 30 * 60 * 1000;

// 캐시 확인
if (newsCache.data && Date.now() - newsCache.timestamp < CACHE_DURATION) {
    return newsCache.data;
}
```

**왜 이렇게 했는지:** 뉴스 API/스크래핑은 시간이 오래 걸림. 30분 캐시로 빠른 응답 + 외부 사이트 부하 감소.

---

### B-4-2. 리더보드 다중 키 캐시 (5분)
> 성적표 종류별 캐시 — 전체 성적, 과목별 성적 각각 저장

**코드 위치:** `server.js:3163-3181`

```javascript
// server.js:3163-3181
const LEADERBOARD_CONFIG_SERVER = {
    CACHE_TTL_MS: 5 * 60 * 1000,  // 5분
};
const leaderboardCache = {};  // { "token-all": { data, timestamp }, "betting-total": ... }
```

**왜 이렇게 했는지:** 리더보드 유형(토큰, 베팅, 출석 등) × 기간(전체, 주간, 월간)별로 개별 캐시.

---

### B-4-3. 수동 캐시 무효화 (/api/refresh)
> 비상 버튼 — 관리자가 캐시를 강제로 새로고침

**코드 위치:** `server.js:1988 근처`

```javascript
// /api/refresh 엔드포인트
app.post('/api/refresh', adminLimiter, async (req, res) => {
    newsCache.data = null;
    newsCache.timestamp = 0;
    // ... 캐시 초기화
});
```

**왜 이렇게 했는지:** 긴급 뉴스가 나왔을 때 30분을 기다리지 않고 즉시 캐시 갱신.

---

### B-4-4. Write-Through 이중 캐시
> 장부를 PC와 노트에 동시 기록

**코드 위치:** `server.js:2619-2713`

```javascript
// 메모리 캐시 (settledRaces Set) + Firestore 저장
// isRaceSettled()는 메모리 먼저 확인, 없으면 Firestore 조회
const settledRaces = new Set();

async function isRaceSettled(raceId) {
    if (settledRaces.has(raceId)) return true;  // 메모리 캐시
    // Firestore 폴백 조회
    const doc = await db.collection('settlements').doc(raceId).get();
    if (doc.exists) {
        settledRaces.add(raceId);  // 메모리에도 추가
        return true;
    }
    return false;
}
```

**왜 이렇게 했는지:** 정산 여부를 매번 Firestore 조회하지 않고 메모리에서 즉시 확인. 서버 재시작 시 Firestore에서 복원.

---

## B-5. 외부 API 연동 패턴 (8개)

### B-5-1. Promise.all 병렬 수집
> 세 명이 동시에 장보기

**코드 위치:** `server.js:436-440`

```javascript
// server.js:436-440
const [f1News, motorsportNews, autosportNews] = await Promise.all([
    scrapeF1News(),
    fetchMotorsportRSS(),
    fetchAutosportRSS()
]);
```

**왜 이렇게 했는지:** 3개 소스를 순차 호출하면 15초, 병렬이면 5초. 3배 속도 향상.

---

### B-5-2. 웹 스크래핑 + User-Agent 위장
> 사람인 척 — 봇 차단을 우회

**코드 위치:** `server.js:238-287`

```javascript
// server.js:241-243
const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...' }
});
```

**왜 이렇게 했는지:** 많은 사이트가 봇(기본 User-Agent)을 차단. 브라우저와 동일한 User-Agent로 접근.

---

### B-5-3. 사이트별 셀렉터 전략
> 각 신문사마다 다른 레이아웃 — 맞춤 독법

**코드 위치:** `server.js:351-401`

```javascript
// server.js:351-401
// F1 공식: '.f1-race-hub--scroll-text a'
// Motorsport.com: 'article p', '.article-body p'
// Autosport: 'article p', '.ms-article-body p'
```

**왜 이렇게 했는지:** 각 사이트의 HTML 구조가 달라 사이트별 CSS 셀렉터를 지정.

---

### B-5-4. RSS 파싱 + 정규화
> 다른 형식의 데이터를 통일된 형식으로 변환

**코드 위치:** `server.js:293-326`

```javascript
// RSS 피드를 파싱하여 { title, description, link, pubDate, source } 형식으로 정규화
const feed = await parser.parseURL(rssFeedUrl);
return feed.items.map(item => ({
    title: item.title,
    description: item.contentSnippet || item.title,
    link: item.link,
    pubDate: item.pubDate,
    source: 'Motorsport.com'
}));
```

**왜 이렇게 했는지:** RSS 피드마다 필드명이 다름(contentSnippet vs content 등). 정규화하여 프론트엔드가 일관되게 사용.

---

### B-5-5. 번역 텍스트 문장 단위 자르기
> 1500자 제한에서 문장 중간이 아닌 마침표에서 자르기

**코드 위치:** `server.js:208-233`

```javascript
// server.js:213-220
if (text.length > 1500) {
    const trimmed = text.substring(0, 1500);
    const lastPeriod = trimmed.lastIndexOf('.');
    const lastQuote = trimmed.lastIndexOf('"');
    const cutPoint = Math.max(lastPeriod, lastQuote);
    if (cutPoint > 1000) text = trimmed.substring(0, cutPoint + 1);
}
```

**왜 이렇게 했는지:** 번역 API의 글자 수 제한. 문장 중간에서 자르면 번역 품질 저하.

---

### B-5-6. OpenF1 API 3단계 체이닝
> 주소 → 건물 → 방 번호 순서로 찾아가기

**코드 위치:** `server.js:2218-2292`

```javascript
// 1단계: getMeetingKey(year) → meeting_key
// 2단계: getSessionKey(meetingKey) → session_key
// 3단계: getPositions(sessionKey) → 결과 데이터
```

**왜 이렇게 했는지:** OpenF1 API는 시즌 → 미팅 → 세션 → 결과 순서로 데이터를 조회해야 함. 각 단계의 ID가 다음 단계의 입력.

---

### B-5-7. 유사도 기반 뉴스 중복 제거
> 같은 뉴스를 다른 사이트에서 가져온 경우 하나만 표시

**코드 위치:** `server.js:468-483`

```javascript
// server.js:468-483
// 제목에서 공통 단어 비율이 60% 이상이면 중복으로 판단
function isSimilar(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const common = [...wordsA].filter(w => wordsB.has(w));
    return common.length / Math.min(wordsA.size, wordsB.size) > 0.6;
}
```

**왜 이렇게 했는지:** F1 공식, Motorsport, Autosport에서 같은 사건을 다룬 기사가 중복 표시되는 것을 방지.

---

### B-5-8. Discord Webhook Fire-and-Forget
> 편지만 보내고 답장은 기다리지 않기

**코드 위치:** `server.js:2109-2167`

```javascript
// server.js:2144-2165
try {
    await axios.post(DISCORD_WEBHOOK_URL, {
        embeds: [{ title: '🚨 신고 접수', ... }]
    });
} catch (webhookError) {
    console.error('Discord 알림 실패:', webhookError);
    // 실패해도 신고 자체는 성공으로 처리
}
res.json({ success: true });
```

**왜 이렇게 했는지:** Discord 알림 실패가 신고 기능 자체를 실패시키면 안 됨. 신고는 DB에 저장되었으니 알림은 부가 기능.

---

## B-6. 스케줄링 패턴 (5개)

### B-6-1. node-cron 기반 스케줄러
> 알람 시계 — 정해진 시간에 자동 실행

**코드 위치:** `server.js:4300-4334`

```javascript
// server.js:4300-4334
function initSchedulers() {
    // 5분마다 리더보드 갱신
    cron.schedule('*/5 * * * *', () => updateLeaderboard());
    // 월요일 00:00 KST 주간 리셋
    cron.schedule('0 15 * * 0', () => weeklyReset());     // UTC 15시 = KST 월요일 00시
    // 매월 말 월간 리셋
    cron.schedule('55 14 28-31 * *', () => monthlyReset()); // UTC 14:55 = KST 23:55
    // 매일 자정 시즌 종료 체크
    cron.schedule('0 15 * * *', () => seasonEndHandler());
}
```

**왜 이렇게 했는지:** 리더보드 갱신, 주간/월간 리셋 등 반복 작업을 자동화.

---

### B-6-2. 적응형 폴링 자동 정산
> 경비원 순찰 — 평소엔 1시간, 이상 징후 시 5분 간격

**코드 위치:** `server.js:2615-2890`

```javascript
// normalInterval (1시간) & retryInterval (5분)
// 정산 성공 시 → 1시간 후 다시 체크
// 정산 실패 시 → 5분 후 재시도
```

**왜 이렇게 했는지:** 평소에는 서버 리소스를 아끼고, 레이스 종료 직후에는 빠르게 정산 처리.

---

### B-6-3. 이벤트 트리거 즉시 정산
> 화재 감지 → 즉시 소방차 출동

**코드 위치:** `server.js:1883-1898`

```javascript
// server.js:1883-1898
app.post('/api/race-ended', async (req, res) => {
    // 클라이언트에서 레이스 종료 감지 → 즉시 정산 시작
    checkForNewResults();
    res.json({ success: true });
});
```

**왜 이렇게 했는지:** cron 폴링만으로는 최대 5분 지연. 클라이언트가 레이스 종료를 감지하면 즉시 정산 트리거.

---

### B-6-4. 주간/월간 리셋 + 아카이브
> 월말 정산 — 기록을 보관하고 새로 시작

**코드 위치:** `server.js:4108-4212`

```javascript
// server.js:4108-4160
async function weeklyReset() {
    // 1. 현재 리더보드를 아카이브에 저장
    await db.collection('leaderboardSnapshots').doc(snapshotId).set({ ... });

    // 2. 주간 적립금 리셋
    // periodicEarnings.weeklyEarned = 0
}
```

**왜 이렇게 했는지:** 주간/월간 랭킹을 초기화하면서 이전 기록을 아카이브에 보존.

---

### B-6-5. 시즌 종료 멱등 처리
> 같은 버튼을 100번 눌러도 결과는 한 번만

**코드 위치:** `server.js:4238-4295`

```javascript
// server.js:4238-4295
async function seasonEndHandler() {
    // 이미 처리되었는지 확인
    const existing = await db.collection('hallOfFame').doc(seasonId).get();
    if (existing.exists) return;  // 멱등성 보장

    // 명예의 전당 저장
    await db.collection('hallOfFame').doc(seasonId).set({ ... });
}
```

**왜 이렇게 했는지:** cron이 매일 실행되므로, 이미 처리된 시즌은 건너뜀. 중복 처리 방지.

---

## B-7. 에러 처리 패턴 (6개)

### B-7-1. 에러 코드 throw + 메시지 매핑
> 에러 번호표 — 번호로 정확한 안내문을 찾기

**코드 위치:** `server.js:1407-1419`

```javascript
// 비즈니스 로직에서는 에러 코드만 throw
throw new Error('ALREADY_BET');

// 응답부에서 메시지 매핑
const errorMessages = {
    'ALREADY_BET': '이미 이 레이스에 베팅했습니다.',
    'INSUFFICIENT_BALANCE': '코인이 부족합니다.',
    // ...
};
```

**왜 이렇게 했는지:** 비즈니스 로직과 사용자 메시지를 분리. 다국어 지원 시에도 로직 변경 불필요.

---

### B-7-2. 에러 메시지에 데이터 포함 (COOLDOWN:N)
> 에러 메시지에 남은 시간 데이터를 함께 전달

**코드 위치:** `server.js:1235`, `server.js:1309`

```javascript
// server.js:1235
throw new Error(`COOLDOWN:${remaining}`);  // "COOLDOWN:45"

// server.js:1309
if (error.message.startsWith('COOLDOWN:')) {
    const seconds = parseInt(error.message.split(':')[1]);
    res.json({ canPost: false, message: `${seconds}초 후에 다시 작성할 수 있습니다.` });
}
```

**왜 이렇게 했는지:** 단순 "쿨다운 중"이 아닌 정확한 남은 시간을 사용자에게 알려줌.

---

### B-7-3. 전역 에러 핸들러 (process.on)
> 최후의 안전망 — 처리되지 않은 에러도 포착

**코드 위치:** `server.js:4040-4052`

```javascript
// server.js:4041-4052
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // 서버 종료하지 않고 로그만 기록
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
```

**왜 이렇게 했는지:** 예상치 못한 에러로 서버가 갑자기 종료되는 것을 방지.

---

### B-7-4. Graceful Degradation
> 주 시스템 고장 시 — 최소한의 서비스라도 유지

**코드 위치:** `server.js:810 근처`, `server.js:2985-3001`

```javascript
// 정산 실패 시 환불 처리
// 데이터 누락으로 정산할 수 없는 베팅은 원금 환불
```

**왜 이렇게 했는지:** 레이스 결과 데이터를 가져오지 못해도 사용자의 토큰을 영원히 묶어두지 않음.

---

### B-7-5. 배치 실패 재시도
> 여러 건 처리 중 일부 실패 → 실패 건만 재시도

**코드 위치:** `server.js:2936-3151`

```javascript
// MAX_RETRIES = 3으로 배치 정산 재시도
// 각 사용자의 정산이 독립적으로 실행되어 한 명의 실패가 전체에 영향 없음
```

**왜 이렇게 했는지:** 100명 중 1명의 정산이 실패해도 나머지 99명은 정상 처리.

---

### B-7-6. DB 미연결 가드 (503)
> 시스템 점검 중 — 서비스 일시 중단 안내

**코드 위치:** `server.js:578-579`

```javascript
// server.js:578-579
if (!db) {
    return res.status(503).json({ success: false, error: '서버 연결 오류' });
}
```

**왜 이렇게 했는지:** Firestore 연결이 안 된 상태에서 작업을 시도하면 예측 불가한 에러. 사전 차단.

---

## B-8. 인증/인가 패턴 (4개)

### B-8-1. Firebase Admin ID Token 검증
> 위조 방지 — 서버에서 토큰의 서명을 검증

**코드 위치:** `server.js:540-555`

```javascript
const decoded = await admin.auth().verifyIdToken(token);
req.user = decoded;
```

**왜 이렇게 했는지:** 클라이언트가 보낸 토큰이 Firebase에서 발급한 진짜인지 서버에서 검증.

---

### B-8-2. Auth 프로필 폴백 체인
> 이름표가 없으면 "방문자"로 표시

**코드 위치:** `server.js:561-574`

```javascript
// server.js:561-574
async function getAuthProfile(uid) {
    try {
        const userRecord = await admin.auth().getUser(uid);
        return {
            displayName: userRecord.displayName || '사용자',
            photoURL: userRecord.photoURL || null
        };
    } catch {
        return { displayName: '사용자', photoURL: null };
    }
}
```

**왜 이렇게 했는지:** Firebase Auth에서 프로필 조회 실패해도 서비스가 중단되지 않도록 기본값 제공.

---

### B-8-3. Admin Key 헤더 인증
> 마스터키 — 특수 관리 기능용

**코드 위치:** `server.js:1103-1110 근처`

```javascript
// Admin Key 헤더로 관리자 인증
const adminKey = req.headers['x-admin-key'];
if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: '권한 없음' });
}
```

**왜 이렇게 했는지:** Firebase Token과 별개로, 서버 관리 API는 별도의 Admin Key로 인증.

---

### B-8-4. 리소스 소유권 검증
> 남의 택배를 열 수 없음

**코드 위치:** `server.js:1349`

```javascript
// server.js:1349
if (bet.userId !== userId) {
    return res.status(403).json({ success: false, error: '본인의 베팅만 취소할 수 있습니다.' });
}
```

**왜 이렇게 했는지:** 다른 사용자의 베팅을 취소하는 것을 방지.

---

## B-9. 기타 패턴 (9개)

### B-9-1. 환경변수 기반 분기
> 개발 모드와 운영 모드 — 같은 코드, 다른 설정

**코드 위치:** `server.js:24-41`

```javascript
// server.js:24-41
const IS_DEV = process.env.NODE_ENV !== 'production';
// Firebase 환경변수: 개별 변수 우선, JSON 블롭 폴백
```

**왜 이렇게 했는지:** 로컬 개발은 .env 파일, Vercel 배포는 환경변수로 설정. 코드 변경 없이 환경 전환.

---

### B-9-2. 그레이스풀 서버 초기화
> 준비가 다 되면 개점

**코드 위치:** `server.js:4337-4365`

```javascript
// server.js:4337-4365
app.listen(PORT, async () => {
    console.log(`서버 시작: ${PORT}`);
    // 비동기 초기화 작업들
    await fetchAllNews();           // 뉴스 미리 로드
    await initRacesCollection();    // 레이스 컬렉션 초기화
    startAutoSettlement();          // 자동 정산 시작
    initSchedulers();               // 스케줄러 시작
});
```

**왜 이렇게 했는지:** 서버가 포트를 열고 나서 비동기 초기화를 수행. 준비 완료 전에도 요청은 받을 수 있음.

---

### B-9-3. 일관된 API 응답 형식 {success}
> 모든 편지에 같은 봉투 사용

**코드 위치:** 전체

```javascript
// 성공
res.json({ success: true, data: ..., tokens: ..., message: ... });

// 실패
res.status(400).json({ success: false, error: '에러 메시지' });
```

**왜 이렇게 했는지:** 클라이언트가 `data.success`만 확인하면 성공/실패 판단 가능. 일관된 에러 처리.

---

### B-9-4. 키워드 필터링 (Include/Exclude)
> 관련 뉴스만 골라내기

**코드 위치:** `server.js:164-202`

```javascript
// server.js:165-184
const KEYWORDS = ['aston martin', 'alonso', 'stroll', ...];
const EXCLUDE_TEAMS = ['red bull', 'mercedes', ...];

function isAstonMartinRelated(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    return KEYWORDS.some(keyword => text.includes(keyword))
        && !EXCLUDE_TEAMS.some(team => text.startsWith(team));
}
```

**왜 이렇게 했는지:** F1 뉴스 중 아스톤 마틴 관련 기사만 필터링. 다른 팀 기사 제외.

---

### B-9-5. 서버 시간 동기화 API
> 클라이언트에게 공식 시간 알려주기

**코드 위치:** `server.js:1873-1881`

```javascript
// server.js:1873-1881
app.get('/api/server-time', (req, res) => {
    res.json({ success: true, timestamp: Date.now() });
});
```

**왜 이렇게 했는지:** 클라이언트가 서버 시간과의 차이를 계산하여 베팅 마감 카운트다운을 정확하게 표시.

---

### B-9-6. 익명 프로필 자동 보정
> "익명" 사용자 → Firebase Auth에서 실제 이름 복구

**코드 위치:** `server.js:3297-3323`

```javascript
// server.js:3297-3323
async function fixAnonymousProfiles() {
    // Firestore에 '익명'으로 저장된 사용자의 프로필을 Firebase Auth에서 조회하여 보정
}
```

**왜 이렇게 했는지:** 초기 가입 시 닉네임이 '익명'으로 저장된 경우, 실제 Google 닉네임으로 업데이트.

---

### B-9-7. 리더보드 이중 구조 영속화
> 메모리 + DB — 서버 재시작해도 데이터 유지

**코드 위치:** `server.js:4083-4091`

```javascript
// Memory cache + Firestore 동시 저장
// 서버 재시작 시 Firestore에서 메모리로 복원
```

**왜 이렇게 했는지:** 리더보드는 빠른 응답을 위해 메모리에 캐시하되, 서버 재시작에 대비해 Firestore에도 저장.

---

### B-9-8. HTML 태그 제거
> 스크래핑한 텍스트에서 태그만 벗기기

**코드 위치:** `server.js:449`

```javascript
// server.js:449
text.replace(/<[^>]*>/g, '')
```

**왜 이렇게 했는지:** RSS 피드에 HTML 태그가 포함된 경우, 순수 텍스트만 추출.

---

### B-9-9. KST 타임존 유틸리티
> 항상 한국 시간 기준으로 처리

**코드 위치:** `server.js:2549-2560`

```javascript
// server.js:2549-2560
function getKSTDateParts(date) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return {
        year: kst.getUTCFullYear(),
        month: kst.getUTCMonth() + 1,
        day: kst.getUTCDate()
    };
}
```

**왜 이렇게 했는지:** 서버가 UTC로 실행되더라도 한국 사용자 기준 날짜(출석, 리셋 등)를 정확히 계산.

---

# 파트 C: CSS 패턴 (~19개)

---

### C-1. CSS Custom Properties 디자인 토큰 시스템
> 페인트 가게 — 색상 번호만 바꾸면 전체 건물 색이 바뀜

**코드 위치:** `css/style.css:7-192`

```css
:root {
    --color-brand: #006f62;        /* 브랜드 컬러 */
    --color-lime: #c4ff00;         /* 액센트 컬러 */
    --bg-body: #0d0d0d;            /* 배경 */
    --text-primary: #f0f0f0;       /* 텍스트 */
    --blur-md: 8px;                /* 블러 */
    --z-header: 1000;              /* Z-Index */
    --font-lg: clamp(0.9rem, 0.75rem + 0.6vw, 1.2rem);  /* 반응형 폰트 */
}
```

**왜 이렇게 했는지:** 색상/사이즈를 한 곳에서 관리. 다크 테마 전환 시 `:root` 변수만 변경하면 됨.

---

### C-2. 반응형 3단계 브레이크포인트
> 대형 TV → 노트북 → 스마트폰에 맞는 레이아웃

**코드 위치:** `css/style.css:1527`, `css/betting.css:130`, `css/mypage.css:79`

```css
/* 데스크톱 (1024px+) */
@media (min-width: 1024px) { .mypage-main { grid-template-columns: 260px 1fr; } }

/* 태블릿 (768px) */
@media (max-width: 768px) { .header { padding: 8px 12px; } }

/* 모바일 (480px) */
@media (max-width: 480px) { .prediction-hero { padding: 16px; } }
```

---

### C-3. Flexbox/Grid 혼합 레이아웃
> 큰 틀은 Grid, 세부 배치는 Flexbox

**코드 위치:** `css/mypage.css:79` (Grid), `css/style.css` 전반 (Flex)

```css
/* Grid: 전체 페이지 레이아웃 */
.mypage-main { display: grid; grid-template-columns: 260px 1fr; }

/* Flex: 컴포넌트 내부 정렬 */
.token-balance { display: flex; align-items: center; gap: 6px; }
```

---

### C-4. @keyframes 애니메이션 (20+)
> 움직이는 요소들의 안무표

**코드 위치:** `css/style.css:291` (spin), `css/token.css:79` (tokenPulse), `css/betting.css:3103` (oddsPulse) 외 다수

```css
/* css/style.css:291 — 로딩 스피너 */
@keyframes spin { to { transform: rotate(360deg); } }

/* css/token.css:79 — 코인 획득 효과 */
@keyframes tokenPulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } }

/* css/betting.css:3103 — 배당률 변경 효과 */
@keyframes oddsPulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } }
```

---

### C-5. backdrop-filter 유리 효과 (Glass Morphism)
> 반투명 유리 뒤의 배경이 블러 처리

**코드 위치:** `css/style.css:219`, `css/style.css:315`, `css/betting.css:2543`

```css
backdrop-filter: blur(var(--blur-md));
-webkit-backdrop-filter: blur(var(--blur-md));
```

---

### C-6. Scroll Snap 캐러셀
> 슬라이드가 딱딱 맞춰서 멈춤

**코드 위치:** `css/style.css:953-978`

```css
.race-slider { scroll-snap-type: x mandatory; overflow-x: auto; }
.race-slider-item { scroll-snap-align: center; flex-shrink: 0; }
```

---

### C-7. :focus-within / :has() 모던 셀렉터
> 자식 요소의 상태로 부모 스타일 변경

**코드 위치:** `css/betting.css:693` (:focus-within), `css/mypage.css:7` (:has)

```css
/* :focus-within — 입력 필드에 포커스 시 래퍼 하이라이트 */
.bet-input-wrapper:focus-within { border-color: var(--color-lime); }

/* :has() — 특정 자식이 있는 body에 배경 적용 */
body:has(.mypage-main) { background-color: var(--bg-base); }
```

---

### C-8. 텍스트 말줄임 (Line Clamp)
> 긴 글의 미리보기 — 넘치는 부분은 ...으로 표시

**코드 위치:** `css/style.css:2242` (멀티라인), `css/style.css:1464` (싱글라인)

```css
/* 멀티라인 말줄임 */
.news-item-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* 싱글라인 말줄임 */
.text-truncate { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
```

---

### C-9. will-change GPU 최적화
> 무거운 짐을 들기 전에 미리 준비 자세

**코드 위치:** `css/style.css:265-266`

```css
.tire-spinner .tire { will-change: transform; backface-visibility: hidden; }
```

**왜 이렇게 했는지:** 브라우저에게 "이 요소가 곧 변할 거야"라고 알려서 GPU 레이어를 미리 생성. 애니메이션 끊김 방지.

---

### C-10. inset 단축 속성
> top/right/bottom/left를 한 줄로

**코드 위치:** `css/paddock.css:419`, `css/betting.css:1481`

```css
.modal-overlay { position: fixed; inset: 0; z-index: var(--z-modal); }
```

---

### C-11. 스크롤바 숨김
> 스크롤은 되지만 스크롤바는 보이지 않음

**코드 위치:** `css/paddock.css:90`, `css/mypage.css:1284`

```css
.filter-tabs { scrollbar-width: none; }
.filter-tabs::-webkit-scrollbar { display: none; }
```

---

### C-12. Empty State 통일 컴포넌트
> "데이터 없음" 화면의 일관된 디자인

**코드 위치:** `css/style.css:2428-2494`

```css
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
.empty-state--compact { padding: 24px 16px; }
.empty-state--error .empty-title { color: var(--color-danger); }
```

---

### C-13. 3D CSS Transform 카드 뒤집기
> 카드를 뒤집으면 뒷면이 보임

**코드 위치:** `css/style.css:538-552`

```css
.tarot-card { perspective: 1000px; }
.tarot-card-inner { transform-style: preserve-3d; transition: transform 0.8s; }
.tarot-card.flipped .tarot-card-inner { transform: rotateY(180deg); }
.tarot-card-front { transform: rotateY(180deg); }
```

---

### C-14. 커스텀 Select (appearance: none)
> 브라우저 기본 드롭다운을 커스텀 디자인으로 대체

**코드 위치:** `css/paddock.css:188-189`

```css
.sort-dropdown { appearance: none; background-image: url("data:image/svg+xml,..."); }
```

---

### C-15. font-variant-numeric: tabular-nums
> 숫자 너비 고정 — 카운트다운에서 숫자가 흔들리지 않음

**코드 위치:** `css/style.css:2912`

```css
.prediction-countdown-number { font-variant-numeric: tabular-nums; }
```

---

### C-16. 타임라인 교차 nth-child
> 좌-우-좌-우 번갈아가는 타임라인 레이아웃

**코드 위치:** `css/style.css:814-824`

```css
.timeline-item:nth-child(odd) .timeline-content { text-align: right; }
.timeline-item:nth-child(even) .timeline-content { text-align: left; }
```

---

### C-17. 버튼 로딩 스피너
> 버튼 안에서 도는 로딩 애니메이션

**코드 위치:** `css/betting.css:2596`

```css
.loading-spinner {
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: var(--color-lime);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
```

---

### C-18. 커스텀 스크롤바 그래디언트
> 스크롤바에 브랜드 색상 그래디언트

**코드 위치:** `css/style.css:962-973`

```css
.race-slider::-webkit-scrollbar-thumb {
    background: linear-gradient(90deg, var(--color-brand), var(--color-lime));
    border-radius: 10px;
}
```

---

### C-19. 반응형 토스트 방향 전환
> 데스크톱은 우하단, 모바일은 상단 중앙

**코드 위치:** `css/errorHandler.css` 전반

```css
/* 데스크톱: 우하단 */
.toast-container { position: fixed; bottom: 20px; right: 20px; }

/* 모바일: 상단 중앙 */
@media (max-width: 768px) {
    .toast-container { top: 20px; bottom: auto; right: 0; left: 0; }
}
```

---

# 파트 D: HTML 패턴 (~13개)

---

### D-1. 시맨틱 HTML 태그
> 구역마다 의미 있는 이름표

**코드 위치:** `index.html:79` (nav), `index.html:99` (header), `index.html:133` (main), `index.html:135` (section), `index.html:260` (footer)

```html
<header class="header">
    <nav aria-label="메인 네비게이션">...</nav>
</header>
<main>
    <section aria-label="다음 레이스 예측">...</section>
</main>
<footer class="footer">...</footer>
```

---

### D-2. SEO Meta 태그
> 검색엔진에게 사이트 소개

**코드 위치:** `index.html:4-8`

```html
<meta name="description" content="애스턴마틴 아람코 F1 팀 팬페이지 - 최신 뉴스, 드라이버 정보">
<meta name="keywords" content="애스턴마틴, F1, 포뮬러1, 알론소, 스트롤">
```

---

### D-3. Open Graph 태그
> SNS 공유 시 썸네일과 설명

**코드 위치:** `index.html:19-22`

```html
<meta property="og:title" content="AMR FANS">
<meta property="og:description" content="애스턴마틴 아람코 F1 팀 팬페이지">
<meta property="og:type" content="website">
```

---

### D-4. Critical CSS 인라인 (FOUC 방지)
> 첫 화면에 필요한 CSS만 HTML에 직접 삽입

**코드 위치:** `index.html:34-56`

```html
<style>
    *{margin:0;padding:0;box-sizing:border-box}
    :root{--primary-green:#006f62;--accent-lime:#c4ff00;...}
    body{font-family:var(--font-body);background-color:var(--bg-base);...}
    .header{position:fixed;...backdrop-filter:blur(10px);...}
</style>
```

**왜 이렇게 했는지:** 외부 CSS 로딩 전 잠깐 스타일 없이 보이는 현상(FOUC) 방지.

---

### D-5. 폰트 Preconnect
> DNS 조회를 미리 해두기

**코드 위치:** `index.html:30-32`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

**왜 이렇게 했는지:** 폰트 서버 연결을 미리 수립하여 폰트 로딩 시간 단축.

---

### D-6. loading="lazy" 이미지 지연 로딩
> 스크롤해서 보일 때만 이미지 다운로드

**코드 위치:** `index.html:173`, `index.html:185`

```html
<img src="images/alonso.avif" alt="Fernando Alonso" loading="lazy">
```

---

### D-7. ARIA 접근성 (tablist, dialog, feed, timer)
> 스크린 리더가 UI 구조를 이해할 수 있게

**코드 위치:** `index.html:140` (timer), `index.html:217` (tablist), `index.html:226` (feed), `index.html:283` (dialog)

```html
<div role="timer">...</div>
<div role="tablist" aria-label="콘텐츠 탭">
    <button role="tab" aria-selected="true">F1 뉴스</button>
</div>
<div role="feed" aria-label="뉴스 목록">...</div>
<div role="dialog" aria-modal="true" aria-labelledby="newsModalTitle">...</div>
```

---

### D-8. data-* 속성 활용
> HTML 요소에 커스텀 데이터 저장

**코드 위치:** `index.html:218`, `index.html:221`

```html
<button data-tab="news" role="tab">F1 뉴스</button>
<button data-tab="community" role="tab">커뮤니티</button>
```

---

### D-9. 외부 링크 보안 (rel="noopener noreferrer")
> 외부 링크에서 원본 페이지 정보 노출 방지

**코드 위치:** `index.html:267-270`

```html
<a href="https://www.astonmartinf1.com" target="_blank" rel="noopener noreferrer">공식 웹사이트</a>
```

**왜 이렇게 했는지:** `target="_blank"` 없이 `noopener`가 없으면 새 창에서 `window.opener`로 원본 페이지를 조작 가능 (Tabnapping 공격).

---

### D-10. 조건부 스크립트 로딩 (Vercel Analytics)
> 프로덕션에서만 분석 스크립트 로드

**코드 위치:** `index.html:395-403`

```html
<script>
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        var s = document.createElement('script');
        s.defer = true;
        s.src = '/_vercel/insights/script.js';
        document.body.appendChild(s);
    }
</script>
```

---

### D-11. async 서드파티 스크립트
> 메인 렌더링을 블로킹하지 않고 비동기 로드

**코드 위치:** `index.html:11`

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-2Z7RRYD2E5"></script>
```

---

### D-12. 동기 스크립트 의존성 체인
> constants.js → utils.js → auth.js → token.js 순서 보장

**코드 위치:** `index.html` 하단 스크립트 영역

```html
<script src="js/constants.js"></script>    <!-- 1. 상수 정의 -->
<script src="js/errorHandler.js"></script> <!-- 2. 에러 핸들러 -->
<script src="js/utils.js"></script>        <!-- 3. 유틸리티 (constants 의존) -->
<script src="js/auth.js"></script>         <!-- 4. 인증 (utils 의존) -->
<script src="js/token.js"></script>        <!-- 5. 토큰 (auth 의존) -->
```

**왜 이렇게 했는지:** 번들러 없이 vanilla JS로 의존성 순서를 보장하는 방법.

---

### D-13. XSS 방어 인라인 이스케이프
> HTML 내 인라인 스크립트에서도 XSS 방지

**코드 위치:** `index.html:351`, `index.html:389`

```javascript
const safeDisplayName = item.displayName ?
    item.displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '?';
```

---

# 파트 E: 배포 & Firestore Rules 패턴 (~12개)

---

### E-1. Vercel 서버리스 + 정적 하이브리드 라우팅
> API는 서버리스 함수, 나머지는 정적 파일

**코드 위치:** `vercel.json:9-22`

```json
{
  "routes": [
    { "src": "/api/(.*)", "dest": "server.js" },
    { "src": "/(.*\\.(html|css|js|png|jpg|svg))", "dest": "/$1" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

---

### E-2. 환경 변수 분리 관리
> 비밀번호는 금고에, 코드는 책상에

**코드 위치:** `.env.example`, `.gitignore:2-8`

```
# .gitignore
.env
serviceAccountKey.json
*-firebase-adminsdk-*.json
setAdmin.js
cors.json
```

**왜 이렇게 했는지:** API 키, 서비스 계정 키 등 민감 정보가 GitHub에 올라가는 것을 방지.

---

### E-3. Custom Claims Admin 체크
> Firestore Rules에서 관리자 권한 확인

**코드 위치:** `firestore.rules:6-10`

```
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}
```

**왜 이렇게 했는지:** Firebase Custom Claims를 사용하여 서버에서 설정한 관리자 권한을 Rules에서 검증.

---

### E-4. Author ID Binding 소유권 확인
> 자기가 쓴 글만 수정/삭제 가능

**코드 위치:** `firestore.rules:20-21`, `firestore.rules:34`

```
allow create: if request.resource.data.authorId == request.auth.uid;
allow update: if request.auth.uid == resource.data.authorId;
```

---

### E-5. 증분 ±1 어뷰징 방지
> 좋아요는 +1 또는 -1만 가능

**코드 위치:** `firestore.rules:40-57`

```
request.resource.data.likeCount >= resource.data.likeCount - 1 &&
request.resource.data.likeCount <= resource.data.likeCount + 1 &&
request.resource.data.likeCount >= 0
```

**왜 이렇게 했는지:** 클라이언트에서 likeCount를 +1000으로 조작하는 것을 Rules 레벨에서 차단.

---

### E-6. 복합키 중복 좋아요 방지
> 문서 ID = "게시글ID_사용자ID" → 같은 글에 두 번 좋아요 불가

**코드 위치:** `firestore.rules:96-101`

```
allow create: if request.auth != null
  && likeId == request.resource.data.postId + '_' + request.auth.uid;
```

---

### E-7. 토큰 차감만 허용 (증가 차단)
> 금고에서 꺼내기만 가능 — 넣기는 은행(서버)만 가능

**코드 위치:** `firestore.rules:134-147`

```
allow update: if
  request.resource.data.tokens < resource.data.tokens      // 차감만
  && request.resource.data.tokens >= 0                     // 음수 방지
  && request.resource.data.totalEarned == resource.data.totalEarned; // 누적 변경 불가
```

**왜 이렇게 했는지:** 클라이언트에서 토큰을 임의로 증가시키는 어뷰징 차단. 토큰 지급은 Admin SDK(서버)만 가능.

**이 패턴이 없으면?** 개발자 도구에서 Firestore 직접 수정으로 무한 토큰 생성 가능.

---

### E-8. 출석 24시간 시간 게이트
> 하루에 한 번만 출석 가능 (Rules 레벨 보장)

**코드 위치:** `firestore.rules:160-172`

```
allow create: if
  request.time > get(.../users/$(request.auth.uid)).data.lastAttendance + duration.value(24, 'h')
```

---

### E-9. 서버 전용 컬렉션 (write: false)
> 클라이언트에서는 읽기만 — 수정은 서버만

**코드 위치:** `firestore.rules:180-181`, `firestore.rules:334`

```
match /races/{raceId} { allow read: if true; allow write: if false; }
match /raceEnergyStatus/{statusId} { allow write: if false; }
```

---

### E-10. 본인 데이터만 읽기
> 남의 토큰 내역은 볼 수 없음

**코드 위치:** `firestore.rules:120`, `firestore.rules:159`, `firestore.rules:324`

```
allow read: if request.auth != null && request.auth.uid == userId;
allow read: if request.auth != null && resource.data.userId == request.auth.uid;
```

---

### E-11. 감사 로그 조작 방지 (Admin Only)
> 토큰 내역은 서버(관리자)만 생성 가능

**코드 위치:** `firestore.rules:221-227`

```
match /tokenHistory/{historyId} {
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow create, update, delete: if request.auth != null && isAdmin();
}
```

**왜 이렇게 했는지:** 토큰 내역을 클라이언트에서 생성/수정할 수 있으면 가짜 내역을 만들 수 있음.

---

### E-12. 보안 .gitignore 와일드카드
> 민감 파일 패턴을 와일드카드로 포괄적 차단

**코드 위치:** `.gitignore:2-8`

```
.env
serviceAccountKey.json
*-firebase-adminsdk-*.json
amf1-fanpage-*.json
setAdmin.js
cors.json
```

**왜 이렇게 했는지:** Firebase 서비스 계정 키는 파일명이 다양할 수 있어 와일드카드로 모든 변형 차단.

---

# 부록: 패턴 요약 통계

| 분류 | 개수 | 주요 파일 |
|------|------|----------|
| **파트 A: 클라이언트 JS** | 68개 | 16개 JS 파일 |
| **파트 B: 서버** | 62개 | server.js |
| **파트 C: CSS** | 19개 | 10개 CSS 파일 |
| **파트 D: HTML** | 13개 | index.html 외 |
| **파트 E: 배포 & Rules** | 12개 | firestore.rules, vercel.json 등 |
| **총계** | **174개** | |

---

> 이 문서는 2026년 2월 8일 기준으로 작성되었습니다.
> 코드 변경 시 줄 번호가 달라질 수 있습니다.
