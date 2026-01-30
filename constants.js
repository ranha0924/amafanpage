// ========================================
// 공통 상수 정의
// 모든 JS 파일에서 이 파일의 상수를 사용합니다
// ========================================

// ========================================
// 시간 상수 (밀리초)
// ========================================
const TIME_MS = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000
};

// 하위 호환성을 위한 개별 상수 (점진적 마이그레이션용)
const MS_PER_SECOND = TIME_MS.SECOND;
const MS_PER_MINUTE = TIME_MS.MINUTE;
const MS_PER_HOUR = TIME_MS.HOUR;
const MS_PER_DAY = TIME_MS.DAY;
const MS_PER_WEEK = TIME_MS.WEEK;

// ========================================
// 토큰 설정
// ========================================
const TOKEN_CONFIG = {
    // 보상
    ATTENDANCE: 10,                    // 출석체크 보상
    ATTENDANCE_STREAK_BONUS: 50,       // 7일 연속 출석 보너스
    STREAK_DAYS: 7,                    // 연속 출석 보너스 일수
    SHARE_PREDICTION: 10,              // 순위 예측 공유 보상
    FIRST_POST: 20,                    // 게시판 첫 글 작성 보상
    LUCKY_ITEM: 5,                     // 행운 아이템 보기 보상
    RACE_ENERGY: 5,                    // 응원 에너지 보상

    // 제한
    RACE_ENERGY_INTERVAL: 10,          // 응원 에너지 수집 간격 (분)
    RACE_DURATION: 120,                // 레이스 응원 가능 시간 (분)
    MAX_TOKEN_CHANGE: 1000             // 한 번에 변경 가능한 최대 토큰
};

// ========================================
// 베팅 설정
// ========================================
const BETTING_CONFIG = {
    // 포디움 베팅
    PODIUM_POSITIONS: 3,               // 포디움 순위 (P1, P2, P3)
    MIN_BET: 1,                        // 최소 베팅 금액
    MAX_BET: 1000,                     // 최대 베팅 금액 (단일)
    MAX_PODIUM_TOTAL: 3000,            // 포디움 베팅 최대 총액 (3포지션 x 1000)

    // 배당률 (포디움)
    PODIUM_HOUSE_EDGE: 0.1,            // 10% 하우스 엣지
    PODIUM_MIN_ODDS: 1.1,
    PODIUM_MAX_ODDS: 50.0,

    // 취소 관련
    CANCEL_WINDOW_MS: TIME_MS.HOUR     // 베팅 후 취소 가능 시간 (1시간)
};

// ========================================
// 1:1 베팅 설정
// ========================================
const H2H_CONFIG = {
    // 배당률
    HOUSE_EDGE: 0.08,                  // 8% 하우스 엣지
    MIN_ODDS: 1.05,
    MAX_ODDS: 15.0,

    // 어뷰징 방지
    LOW_ODDS_THRESHOLD: 1.10,          // 낮은 배당률 기준
    LOW_ODDS_MAX_BET: 50,              // 낮은 배당률 시 최대 베팅

    // 취소 관련
    CANCEL_WINDOW_MS: TIME_MS.HOUR     // 베팅 후 취소 가능 시간 (1시간)
};

// ========================================
// API 설정
// ========================================
const API_CONFIG = {
    // F1 API
    F1_BASE_URL: 'https://api.jolpi.ca/ergast/f1',
    F1_CACHE_DURATION: 30 * TIME_MS.MINUTE,
    F1_TIMEOUT: 15000,
    F1_RETRIES: 1,

    // 뉴스 API
    NEWS_URL: '/api/news',
    ARTICLE_URL: '/api/article',
    NEWS_REFRESH_INTERVAL: 30 * TIME_MS.MINUTE,
    NEWS_MAX_ITEMS: 6
};

// ========================================
// UI 설정
// ========================================
const UI_CONFIG = {
    // 게시판
    POSTS_PER_PAGE: 20,
    POST_COOLDOWN_MS: TIME_MS.MINUTE,  // 게시글 작성 쿨다운

    // 카운트다운
    COUNTDOWN_INTERVAL: TIME_MS.SECOND,

    // 애니메이션
    TOAST_DURATION: 3000,
    MODAL_TRANSITION: 300
};

// ========================================
// 전역 노출 (브라우저 환경)
// ========================================
if (typeof window !== 'undefined') {
    // 🔒 보안: Object.freeze로 상수 동결 (개발자 도구 조작 방지)
    // 참고: 서버에서도 반드시 재검증해야 함 (이것은 추가 방어선)
    Object.freeze(TIME_MS);
    Object.freeze(TOKEN_CONFIG);
    Object.freeze(BETTING_CONFIG);
    Object.freeze(H2H_CONFIG);
    Object.freeze(API_CONFIG);
    Object.freeze(UI_CONFIG);

    window.TIME_MS = TIME_MS;
    window.MS_PER_SECOND = MS_PER_SECOND;
    window.MS_PER_MINUTE = MS_PER_MINUTE;
    window.MS_PER_HOUR = MS_PER_HOUR;
    window.MS_PER_DAY = MS_PER_DAY;
    window.MS_PER_WEEK = MS_PER_WEEK;
    window.TOKEN_CONFIG = TOKEN_CONFIG;
    window.BETTING_CONFIG = BETTING_CONFIG;
    window.H2H_CONFIG = H2H_CONFIG;
    window.API_CONFIG = API_CONFIG;
    window.UI_CONFIG = UI_CONFIG;
}
