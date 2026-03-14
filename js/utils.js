// ========================================
// 공통 유틸리티 함수
// ========================================

// ========================================
// API 캐싱 시스템
// ========================================

const apiCache = {
    data: new Map(),  // { cacheKey: { data, timestamp } }
    defaultTTL: 5 * 60 * 1000  // 기본 5분
};

/**
 * 캐시 키 생성
 * @param {string} url - API URL
 * @param {Object} options - fetch 옵션
 * @returns {string} 캐시 키
 */
function getCacheKey(url, options = {}) {
    // Authorization 헤더는 캐시 키에서 제외 (사용자별 캐시 분리)
    const userId = typeof getCurrentUser === 'function' && getCurrentUser()?.uid || 'anonymous';
    return `${userId}:${url}`;
}

// cachedFetch 함수는 smartFetch로 통합됨
// 하위 호환성은 window.cachedFetch = smartFetch(url, options, { useCache: true }) 로 유지

/**
 * 특정 URL 패턴의 캐시 삭제
 * @param {string} pattern - URL에 포함된 문자열
 */
function clearCacheByPattern(pattern) {
    for (const key of apiCache.data.keys()) {
        if (key.includes(pattern)) {
            apiCache.data.delete(key);
            logger.log(`[Cache] 삭제: ${key}`);
        }
    }
}

/**
 * 전체 캐시 삭제
 */
function clearAllCache() {
    apiCache.data.clear();
    logger.log('[Cache] 전체 캐시 삭제됨');
}

/**
 * 통합 Fetch 래퍼 - 타임아웃, 재시도, 캐싱을 하나로 통합
 * @param {string} url - API URL
 * @param {Object} options - fetch 옵션
 * @param {number} options.timeout - 타임아웃 (밀리초, 기본값: 10000)
 * @param {number} options.retries - 재시도 횟수 (기본값: 1)
 * @param {Object} cacheConfig - 캐시 설정
 * @param {boolean} cacheConfig.useCache - 캐시 사용 여부 (기본값: false)
 * @param {number} cacheConfig.ttl - 캐시 유효 시간 (밀리초, 기본값: 5분)
 * @returns {Promise<Response>} fetch 응답
 */
async function smartFetch(url, options = {}, cacheConfig = {}) {
    const { useCache = false, ttl = apiCache.defaultTTL } = cacheConfig;
    const timeout = options.timeout || 10000;
    const retries = options.retries || 1;

    // 1. 캐시 확인 (useCache가 true일 때만)
    if (useCache) {
        const cacheKey = getCacheKey(url, options);
        const cached = apiCache.data.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < ttl) {
            logger.log(`[SmartFetch] 캐시 사용: ${url}`);
            return new Response(JSON.stringify(cached.data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // 2. 타임아웃 + 재시도 로직 (기존 safeFetch 로직)
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const fetchOptions = {
                ...options,
                signal: controller.signal
            };
            delete fetchOptions.timeout;
            delete fetchOptions.retries;

            logger.log(`[SmartFetch] API 호출: ${url}${attempt > 0 ? ` (재시도 ${attempt})` : ''}`);
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            // 3. 성공 시 캐싱 (useCache가 true일 때만)
            if (useCache && response.ok) {
                try {
                    const cacheKey = getCacheKey(url, options);
                    const clonedResponse = response.clone();
                    const data = await clonedResponse.json();
                    apiCache.data.set(cacheKey, {
                        data,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    // JSON 파싱 실패 시 캐싱 스킵
                }
            }

            return response;
        } catch (error) {
            lastError = error;

            // AbortError는 타임아웃으로 변환
            if (error.name === 'AbortError') {
                lastError = new Error('TIMEOUT: 요청 시간 초과');
                lastError.name = 'AbortError';
            }

            // 4xx 에러는 재시도하지 않음
            if (error.status && error.status >= 400 && error.status < 500) {
                break;
            }

            // 재시도 전 대기 (지수 백오프)
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    throw lastError;
}

// 전역 접근용
window.smartFetch = smartFetch;
window.clearCacheByPattern = clearCacheByPattern;
window.clearAllCache = clearAllCache;

// 하위 호환성을 위해 cachedFetch와 safeFetch도 유지 (smartFetch로 포워딩)
window.cachedFetch = function(url, options = {}, ttl = apiCache.defaultTTL) {
    return smartFetch(url, options, { useCache: true, ttl });
};
window.safeFetch = function(url, options = {}) {
    return smartFetch(url, options, { useCache: false });
};

/**
 * 네트워크 에러 판별 함수
 * @param {Error} e - 에러 객체
 * @returns {boolean} - 네트워크 에러 여부
 */
function isNetworkError(e) {
    return e?.code === 'unavailable' ||
           e?.code === 'network-request-failed' ||
           e?.message?.includes('network') ||
           e?.message?.includes('offline') ||
           e?.message?.includes('Failed to fetch') ||
           e?.message?.includes('TIMEOUT') ||
           !navigator.onLine;
}

/**
 * Promise에 타임아웃 적용
 * @param {Promise} promise - 원본 Promise
 * @param {number} ms - 타임아웃 시간 (밀리초)
 * @returns {Promise} - 타임아웃이 적용된 Promise
 */
function withTimeout(promise, ms = 10000) {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT: 요청 시간 초과')), ms);
    });
    return Promise.race([promise, timeout]);
}

/**
 * 비동기 함수 중복 실행 방지 래퍼
 * @param {Function} asyncFunc - 보호할 비동기 함수
 * @returns {Function} 중복 실행이 방지된 함수
 */
function preventDouble(asyncFunc) {
    let running = false;
    return async function(...args) {
        if (running) return;
        running = true;
        try { return await asyncFunc.apply(this, args); }
        finally { running = false; }
    };
}

/**
 * 서버 시간 동기화 — 서버와 클라이언트의 시간 오프셋(ms) 반환
 * @returns {Promise<number>} serverTimeOffset (밀리초)
 */
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
            const offset = serverTime - clientTime;
            logger.log(`서버 시간 동기화 완료: offset=${offset}ms`);
            return offset;
        }
    } catch (error) {
        logger.warn('서버 시간 동기화 실패:', error);
        if (typeof showToast === 'function') {
            showToast('서버 시간 동기화에 실패했습니다. 마감 시간이 부정확할 수 있습니다.', 'warning');
        }
    }
    return 0;
}

/**
 * 오프셋을 적용한 서버 기준 현재 시간 반환
 * @param {number} offset - syncServerTime()이 반환한 오프셋
 * @returns {Date}
 */
function getServerNow(offset) {
    return new Date(Date.now() + offset);
}

/**
 * 로그인 필수 체크 — 로그인 안 되어 있으면 경고 후 null 반환
 * @param {string} msg - 경고 메시지
 * @returns {Object|null} 현재 사용자 또는 null
 */
function requireAuth(msg = '로그인이 필요합니다.') {
    const user = getCurrentUser();
    if (!user) showGlobalAlert(msg, 'warning', '로그인 필요');
    return user;
}

// 전역 접근용
window.isNetworkError = isNetworkError;
window.withTimeout = withTimeout;
window.preventDouble = preventDouble;
window.syncServerTime = syncServerTime;
window.getServerNow = getServerNow;
window.requireAuth = requireAuth;

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 오늘 날짜를 YYYY-MM-DD 형식의 문자열로 반환
 * @returns {string} 오늘 날짜 문자열
 */
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 주어진 날짜가 오늘인지 확인
 * @param {Date|string|{toDate: function}|{_seconds: number}} date - 확인할 날짜
 * @returns {boolean} 오늘이면 true
 */
function isToday(date) {
    if (!date) return false;

    let checkDate;
    if (date.toDate) {
        // Firestore SDK에서 직접 조회한 Timestamp 객체
        checkDate = date.toDate();
    } else if (date._seconds !== undefined) {
        // 서버 API 응답 JSON (Firestore Timestamp 직렬화 형태)
        checkDate = new Date(date._seconds * 1000);
    } else {
        // 일반 Date 객체, 문자열, 숫자
        checkDate = new Date(date);
    }

    const today = new Date();
    return checkDate.getFullYear() === today.getFullYear() &&
           checkDate.getMonth() === today.getMonth() &&
           checkDate.getDate() === today.getDate();
}

// 허용된 프로필 이미지 도메인 (XSS 방지)
const ALLOWED_PHOTO_DOMAINS = [
    'googleusercontent.com',
    'lh3.googleusercontent.com',
    'lh4.googleusercontent.com',
    'lh5.googleusercontent.com',
    'lh6.googleusercontent.com',
    'gravatar.com',
    'www.gravatar.com'
];

/**
 * photoURL이 허용된 도메인인지 확인하고 안전한 URL 반환
 * @param {string} url - 검증할 URL
 * @param {string} fallback - 기본 대체 URL (기본값: gravatar)
 * @returns {string} 안전한 URL 또는 대체 URL
 */
function getSafePhotoURL(url, fallback = 'https://www.gravatar.com/avatar/?d=mp') {
    if (!url) return fallback;
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:') return fallback;
        const isAllowed = ALLOWED_PHOTO_DOMAINS.some(domain =>
            parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
        );
        return isAllowed ? url : fallback;
    } catch {
        return fallback;
    }
}

/**
 * 태그 종류에 따른 CSS 클래스 반환
 * @param {string} tag - 태그 이름
 * @returns {string} CSS 클래스명
 */
function getTagClass(tag) {
    const tagMap = {
        '질문': 'tag-question',
        '응원': 'tag-cheer',
        '분석': 'tag-analysis',
        '자유': 'tag-free',
        '다른팀': 'tag-other'
    };
    return tagMap[tag] || 'tag-free';
}

// ========================================
// 테스트 모드 (개발용)
// ========================================
const TEST_MODE = {
    enabled: false,
    raceDate: null  // 테스트용 레이스 시간
};

/**
 * 테스트 모드 활성화 - 콘솔에서 사용
 * @param {number} minutesFromNow - 현재 시간으로부터 몇 분 후에 레이스 시작할지
 * @example
 *   setTestRace(5)   // 5분 후 레이스 시작
 *   setTestRace(0.5) // 30초 후 레이스 시작
 *   setTestRace(30)  // 30분 후 레이스 시작
 */
function setTestRace(minutesFromNow) {
    const testDate = new Date(Date.now() + minutesFromNow * 60 * 1000);
    TEST_MODE.enabled = true;
    TEST_MODE.raceDate = testDate;

    logger.log('========================================');
    logger.log('🏎️ 테스트 모드 활성화!');
    logger.log(`📅 테스트 레이스 시간: ${testDate.toLocaleString()}`);
    logger.log(`⏱️ 레이스까지 ${minutesFromNow}분 남음`);
    logger.log('========================================');
    logger.log('💡 사용법:');
    logger.log('   setTestRace(5)    → 5분 후 레이스');
    logger.log('   setTestRace(0.5)  → 30초 후 레이스');
    logger.log('   clearTestRace()   → 테스트 모드 해제');
    logger.log('========================================');

    // 베팅 페이지 카운트다운 갱신
    if (typeof updateBettingCountdown === 'function') updateBettingCountdown();
    if (typeof updateH2HCountdown === 'function') updateH2HCountdown();

    // 베팅 내역 다시 로드 (취소 버튼 갱신)
    if (typeof loadUserBets === 'function') loadUserBets();
    if (typeof loadUserH2HBets === 'function') loadUserH2HBets();

    return `테스트 레이스: ${testDate.toLocaleTimeString()} (${minutesFromNow}분 후)`;
}

/**
 * 테스트 모드 해제
 */
function clearTestRace() {
    TEST_MODE.enabled = false;
    TEST_MODE.raceDate = null;

    logger.log('========================================');
    logger.log('✅ 테스트 모드 해제됨');
    logger.log('   실제 레이스 일정으로 복원');
    logger.log('========================================');

    // 카운트다운 갱신
    if (typeof updateBettingCountdown === 'function') updateBettingCountdown();
    if (typeof updateH2HCountdown === 'function') updateH2HCountdown();
    if (typeof loadUserBets === 'function') loadUserBets();
    if (typeof loadUserH2HBets === 'function') loadUserH2HBets();

    return '테스트 모드 해제됨';
}

/**
 * 현재 테스트 상태 확인 (콘솔용)
 */
function checkTestStatus() {
    const { race } = getNextRace();
    const raceDate = new Date(race.date);
    const now = new Date();
    const diff = raceDate - now;

    logger.log('========================================');
    logger.log('📊 현재 상태');
    logger.log('========================================');
    logger.log(`테스트 모드: ${TEST_MODE.enabled ? '✅ 활성화' : '❌ 비활성화'}`);
    logger.log(`레이스 이름: ${race.name}`);
    logger.log(`레이스 시간: ${raceDate.toLocaleString()}`);
    logger.log(`현재 시간: ${now.toLocaleString()}`);

    if (diff > 0) {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        logger.log(`레이스까지: ${minutes}분 ${seconds}초 남음`);
        logger.log('========================================');
        logger.log('💡 취소 가능 시간 = min(베팅 후 60분, 레이스까지 남은 시간)');
        logger.log(`   예: 지금 베팅하면 취소 가능 시간 = ${Math.min(60, minutes)}분`);
    } else {
        logger.log('⚠️ 레이스 시작됨! (베팅 취소 불가)');
    }
    logger.log('========================================');

    return {
        testMode: TEST_MODE.enabled,
        raceName: race.name,
        raceDate: raceDate,
        minutesUntilRace: Math.max(0, Math.floor(diff / 60000))
    };
}

// 전역 접근용 (개발 환경에서만 사용)
// 프로덕션에서는 테스트 함수 비활성화
const IS_DEVELOPMENT = window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('localhost');

// 조건부 로거 — 프로덕션에서는 log/warn 무시, error는 항상 출력
const logger = {
    log: (...a) => IS_DEVELOPMENT && console.log(...a),
    warn: (...a) => IS_DEVELOPMENT && console.warn(...a),
    error: (...a) => console.error(...a),
};
window.logger = logger;

if (IS_DEVELOPMENT) {
    window.setTestRace = setTestRace;
    window.clearTestRace = clearTestRace;
    window.checkTestStatus = checkTestStatus;
    window.TEST_MODE = TEST_MODE;
    logger.log('🧪 개발 모드: 테스트 함수 활성화됨 (setTestRace, clearTestRace, checkTestStatus)');
} else {
    // 프로덕션에서는 빈 함수로 대체
    window.setTestRace = () => console.warn('프로덕션 환경에서는 테스트 모드를 사용할 수 없습니다.');
    window.clearTestRace = () => {};
    window.checkTestStatus = () => ({ testMode: false, message: '프로덕션 환경' });
    window.TEST_MODE = { enabled: false, raceDate: null };
}

// 2026 시즌 전체 레이스 일정 (공식 F1 캘린더 기준, 한국 시간 KST)
// 출처: https://www.formula1.com/en/racing/2026
const RACE_SCHEDULE = [
    { name: "호주 그랑프리", circuit: "앨버트 파크 서킷 · 멜버른", date: "2026-03-08T13:00:00+09:00" },
    { name: "중국 그랑프리", circuit: "상하이 인터내셔널 서킷 · 상하이", date: "2026-03-15T16:00:00+09:00" },
    { name: "일본 그랑프리", circuit: "스즈카 서킷 · 스즈카", date: "2026-03-29T14:00:00+09:00" },
    { name: "바레인 그랑프리", circuit: "바레인 인터내셔널 서킷 · 사키르", date: "2026-04-13T00:00:00+09:00" },
    { name: "사우디 아라비아 그랑프리", circuit: "제다 코르니쉬 서킷 · 제다", date: "2026-04-20T02:00:00+09:00" },
    { name: "마이애미 그랑프리", circuit: "마이애미 인터내셔널 오토드롬 · 마이애미", date: "2026-05-04T05:00:00+09:00" },
    { name: "캐나다 그랑프리", circuit: "질 빌뇌브 서킷 · 몬트리올", date: "2026-05-25T05:00:00+09:00" },
    { name: "모나코 그랑프리", circuit: "몬테카를로 시가지 서킷 · 모나코", date: "2026-06-07T22:00:00+09:00" },
    { name: "스페인 그랑프리", circuit: "카탈루냐 서킷 · 바르셀로나", date: "2026-06-14T22:00:00+09:00" },
    { name: "오스트리아 그랑프리", circuit: "레드불 링 · 슈필베르크", date: "2026-06-28T22:00:00+09:00" },
    { name: "영국 그랑프리", circuit: "실버스톤 서킷 · 실버스톤", date: "2026-07-05T23:00:00+09:00" },
    { name: "벨기에 그랑프리", circuit: "스파-프랑코르샹 · 스파", date: "2026-07-19T22:00:00+09:00" },
    { name: "헝가리 그랑프리", circuit: "헝가로링 · 부다페스트", date: "2026-07-26T22:00:00+09:00" },
    { name: "네덜란드 그랑프리", circuit: "잔드보르트 서킷 · 잔드보르트", date: "2026-08-23T22:00:00+09:00" },
    { name: "이탈리아 그랑프리", circuit: "몬자 서킷 · 몬자", date: "2026-09-06T22:00:00+09:00" },
    { name: "마드리드 그랑프리", circuit: "마드리드 시가지 서킷 · 마드리드", date: "2026-09-13T22:00:00+09:00" },
    { name: "아제르바이잔 그랑프리", circuit: "바쿠 시티 서킷 · 바쿠", date: "2026-09-26T20:00:00+09:00" },
    { name: "싱가포르 그랑프리", circuit: "마리나 베이 시가지 서킷 · 싱가포르", date: "2026-10-11T21:00:00+09:00" },
    { name: "미국 그랑프리", circuit: "서킷 오브 디 아메리카스 · 오스틴", date: "2026-10-26T05:00:00+09:00" },
    { name: "멕시코 그랑프리", circuit: "에르마노스 로드리게스 서킷 · 멕시코시티", date: "2026-11-02T05:00:00+09:00" },
    { name: "브라질 그랑프리", circuit: "인테르라고스 · 상파울루", date: "2026-11-09T02:00:00+09:00" },
    { name: "라스베가스 그랑프리", circuit: "라스베가스 스트립 서킷 · 라스베가스", date: "2026-11-22T13:00:00+09:00" },
    { name: "카타르 그랑프리", circuit: "루사일 인터내셔널 서킷 · 루사일", date: "2026-11-30T01:00:00+09:00" },
    { name: "아부다비 그랑프리", circuit: "야스 마리나 서킷 · 아부다비", date: "2026-12-06T22:00:00+09:00" }
];

/**
 * KST 기준 날짜 부분 추출 (타임존 변환 후 raceId 생성용)
 * UTC 기준 getDate()가 KST 날짜와 다를 수 있으므로 KST 기준으로 변환
 */
function getKSTDateParts(date) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return {
        year: kst.getUTCFullYear(),
        month: kst.getUTCMonth() + 1,
        day: kst.getUTCDate()
    };
}

/**
 * 다음 레이스 찾기 (현재 시간보다 미래인 첫 번째 레이스)
 * @returns {Object} 다음 레이스 정보 { race, index }
 */
function getNextRace() {
    // 테스트 모드일 때는 테스트 레이스 반환
    if (TEST_MODE.enabled && TEST_MODE.raceDate) {
        return {
            race: {
                name: "🧪 테스트 그랑프리",
                circuit: "테스트 서킷 · 개발환경",
                date: TEST_MODE.raceDate.toISOString()
            },
            index: -1  // 테스트 레이스 표시
        };
    }

    const now = new Date();
    for (let i = 0; i < RACE_SCHEDULE.length; i++) {
        const raceDate = new Date(RACE_SCHEDULE[i].date);
        // 레이스 종료 시간 (레이스 시작 + 2시간)
        const raceEndDate = new Date(raceDate.getTime() + 2 * 60 * 60 * 1000);
        if (raceEndDate > now) {
            return { race: RACE_SCHEDULE[i], index: i };
        }
    }
    // 모든 레이스가 끝났으면 첫 번째 레이스 반환 (다음 시즌 대비)
    return { race: RACE_SCHEDULE[0], index: 0 };
}

/**
 * 날짜 기반 시드 생성 (하루 동안 동일한 값)
 * @returns {number} YYYYMMDD 형식의 시드값
 */
function generateDailySeed() {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

/**
 * 시드 기반 의사 난수 생성기
 * @param {number} seed - 시드값
 * @returns {number} 0-1 사이의 난수
 */
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// ========================================
// 사이드 메뉴 (햄버거 메뉴) 기능
// ========================================

/**
 * 사이드 메뉴 초기화
 */
function initSideMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    if (!hamburgerBtn || !sideMenu || !menuOverlay) return;

    // 햄버거 버튼 클릭
    hamburgerBtn.addEventListener('click', toggleSideMenu);

    // 오버레이 클릭 시 메뉴 닫기
    menuOverlay.addEventListener('click', closeSideMenu);

    // ESC 키로 메뉴 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sideMenu.classList.contains('active')) {
            closeSideMenu();
        }
    });
}

/**
 * 사이드 메뉴 토글
 */
function toggleSideMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    hamburgerBtn.classList.toggle('active');
    sideMenu.classList.toggle('active');
    menuOverlay.classList.toggle('active');

    // 메뉴가 열리면 스크롤 방지
    if (sideMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

/**
 * 사이드 메뉴 닫기
 */
function closeSideMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    hamburgerBtn.classList.remove('active');
    sideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// DOM 로드 완료 시 사이드 메뉴 초기화
document.addEventListener('DOMContentLoaded', initSideMenu);
