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

    // 제한
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

    // 어뷰징 방지 (배당률 단계별 베팅 한도)
    ODDS_TIERS: [
        { threshold: 1.15, maxBet: 50 },
        { threshold: 1.30, maxBet: 200 },
        { threshold: 1.50, maxBet: 500 }
    ],
    DEFAULT_MAX_BET: 1000,
    LOW_ODDS_THRESHOLD: 1.15,          // 낮은 배당률 UI 표시 기준
    LOW_ODDS_MAX_BET: 50,              // 하위 호환용

    // 취소 관련
    CANCEL_WINDOW_MS: TIME_MS.HOUR     // 베팅 후 취소 가능 시간 (1시간)
};

// ========================================
// API 설정
// ========================================
const API_CONFIG = {
    // F1 API (f1api.dev - 무료, 인증 불필요)
    F1_API_BASE_URL: 'https://f1api.dev/api',
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
    AUTH_REFRESH_INTERVAL: 50 * TIME_MS.MINUTE,  // ID Token 갱신 주기 (50분)

    // 애니메이션
    TOAST_DURATION: 3000,
    MODAL_TRANSITION: 300
};

// ========================================
// 시즌 설정
// ========================================
const SEASON_CONFIG = {
    // 2026 시즌 기간 (KST 기준)
    YEAR: 2026,
    START_DATE: '2026-03-08T13:00:00+09:00',  // 호주 그랑프리
    END_DATE: '2026-12-06T22:00:00+09:00',    // 아부다비 그랑프리

    // 시즌 상태
    isInSeason: function() {
        const now = new Date();
        const start = new Date(this.START_DATE);
        const end = new Date(this.END_DATE);
        return now >= start && now <= end;
    },

    // 시즌 시작까지 남은 시간 (밀리초)
    getTimeUntilSeasonStart: function() {
        const now = new Date();
        const start = new Date(this.START_DATE);
        return Math.max(0, start - now);
    }
};

// ========================================
// 리더보드 설정
// ========================================
const LEADERBOARD_CONFIG = {
    // 랭킹 타입
    TYPES: {
        BETTING_ACCURACY: 'betting_accuracy',
        COIN: 'coin',
        COMMUNITY: 'community',
        ATTENDANCE: 'attendance'
    },

    // 서브타입
    SUB_TYPES: {
        PODIUM: 'podium',
        H2H: 'h2h',
        TOTAL: 'total',
        LIKES: 'likes',
        CONSECUTIVE: 'consecutive',
        CUMULATIVE: 'cumulative'
    },

    // 기간
    PERIODS: {
        WEEKLY: 'weekly',
        MONTHLY: 'monthly',
        SEASON: 'season',
        ALL: 'all'
    },

    // 최소 참여 조건 (적중률 랭킹)
    MIN_BETS: {
        PODIUM: 3,    // P1, P2, P3 각 1회 이상
        H2H: 3        // 1:1 베팅 3회 이상
    },

    // 캐시 설정
    CACHE_TTL_MS: 5 * TIME_MS.MINUTE,   // 5분 캐시
    TOP_LIMIT: 100,                      // TOP 100

    // 표시 설정
    DISPLAY_LIMIT: 50,                   // 화면 표시 제한
    MY_RANK_THRESHOLD: 50                // 내 순위 별도 표시 기준
};

// ========================================
// 상점 설정
// ========================================
const SHOP_CONFIG = {
    CATEGORIES: {
        PROFILE_BORDER: 'profile-border',
        NICKNAME_COLOR: 'nickname-color',
        PROFILE_BG: 'profile-bg',
        POST_DECO: 'post-deco',
        FUNCTIONAL: 'functional',
        BADGE: 'badge'
    },
    ITEM_TYPES: {
        PERMANENT: 'permanent',
        CONSUMABLE: 'consumable',
        RENTAL: 'rental',
        LIMITED: 'limited'
    },
    RARITIES: {
        COMMON: 'common',
        RARE: 'rare',
        EPIC: 'epic',
        LEGENDARY: 'legendary'
    },
    MAX_EQUIPPED_PER_CATEGORY: 1,
    CACHE_TTL_MS: 5 * TIME_MS.MINUTE,
    RENTAL_30_DAY_MS: 30 * TIME_MS.DAY,
    SITE_OPEN_DATE: '2026-03-12'
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
    Object.freeze(SEASON_CONFIG);
    Object.freeze(LEADERBOARD_CONFIG.TYPES);
    Object.freeze(LEADERBOARD_CONFIG.SUB_TYPES);
    Object.freeze(LEADERBOARD_CONFIG.PERIODS);
    Object.freeze(LEADERBOARD_CONFIG.MIN_BETS);
    Object.freeze(LEADERBOARD_CONFIG);
    Object.freeze(SHOP_CONFIG.CATEGORIES);
    Object.freeze(SHOP_CONFIG.ITEM_TYPES);
    Object.freeze(SHOP_CONFIG.RARITIES);
    Object.freeze(SHOP_CONFIG);

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
    window.SEASON_CONFIG = SEASON_CONFIG;
    window.LEADERBOARD_CONFIG = LEADERBOARD_CONFIG;
    window.SHOP_CONFIG = SHOP_CONFIG;
}
