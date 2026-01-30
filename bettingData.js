// ========================================
// 2026 F1 베팅 데이터
// ========================================

// 2026 F1 드라이버 목록 (11개 팀, 22명)
const F1_DRIVERS_2026 = [
    // McLaren
    { number: 1, name: "Lando Norris", team: "McLaren", teamColor: "#FF8000" },
    { number: 81, name: "Oscar Piastri", team: "McLaren", teamColor: "#FF8000" },
    // Mercedes
    { number: 63, name: "George Russell", team: "Mercedes", teamColor: "#27F4D2" },
    { number: 12, name: "Kimi Antonelli", team: "Mercedes", teamColor: "#27F4D2" },
    // Red Bull
    { number: 3, name: "Max Verstappen", team: "Red Bull", teamColor: "#3671C6" },
    { number: 6, name: "Isack Hadjar", team: "Red Bull", teamColor: "#3671C6" },
    // Ferrari
    { number: 44, name: "Lewis Hamilton", team: "Ferrari", teamColor: "#E80020" },
    { number: 16, name: "Charles Leclerc", team: "Ferrari", teamColor: "#E80020" },
    // Aston Martin
    { number: 14, name: "Fernando Alonso", team: "Aston Martin", teamColor: "#006F62" },
    { number: 18, name: "Lance Stroll", team: "Aston Martin", teamColor: "#006F62" },
    // Williams
    { number: 23, name: "Alexander Albon", team: "Williams", teamColor: "#64C4FF" },
    { number: 55, name: "Carlos Sainz", team: "Williams", teamColor: "#64C4FF" },
    // Racing Bulls
    { number: 30, name: "Liam Lawson", team: "Racing Bulls", teamColor: "#6692FF" },
    { number: 40, name: "Arvid Lindblad", team: "Racing Bulls", teamColor: "#6692FF" },
    // Alpine
    { number: 10, name: "Pierre Gasly", team: "Alpine", teamColor: "#FF87BC" },
    { number: 43, name: "Franco Colapinto", team: "Alpine", teamColor: "#FF87BC" },
    // Haas
    { number: 87, name: "Oliver Bearman", team: "Haas", teamColor: "#B6BABD" },
    { number: 31, name: "Esteban Ocon", team: "Haas", teamColor: "#B6BABD" },
    // Audi
    { number: 27, name: "Nico Hulkenberg", team: "Audi", teamColor: "#FF0000" },
    { number: 5, name: "Gabriel Bortoleto", team: "Audi", teamColor: "#FF0000" },
    // Cadillac
    { number: 77, name: "Valtteri Bottas", team: "Cadillac", teamColor: "#000000" },
    { number: 11, name: "Sergio Perez", team: "Cadillac", teamColor: "#000000" }
];

// ========================================
// 2026 드라이버별 배당률 - 30개+ 소스 종합
// ========================================
const DRIVER_ODDS = {
    // TIER 1: 챔피언십 본명 (1.7x ~ 2.2x)
    3: 1.7,   // Max Verstappen - 북메이커 확고한 1위
    63: 1.8,  // George Russell - 북메이커 2위
    1: 2.2,   // Lando Norris - 북메이커 3위

    // TIER 2: 강력한 우승 후보 (3.2x ~ 5.0x)
    81: 3.2,  // Oscar Piastri - 북메이커 4위
    14: 4.5,  // Fernando Alonso - 다크호스
    12: 5.0,  // Kimi Antonelli - Mercedes 루키

    // TIER 3: 다크호스 (6.5x ~ 10.0x)
    16: 6.5,  // Charles Leclerc - Ferrari 에이스
    55: 8.0,  // Carlos Sainz - Williams 핵심
    44: 10.0, // Lewis Hamilton - 7회 챔피언

    // TIER 4: 중상위권 (12.0x ~ 15.0x)
    6: 12.0,  // Isack Hadjar - Red Bull 승격
    23: 12.0, // Alex Albon - Williams
    18: 15.0, // Lance Stroll - Aston Martin

    // TIER 5: 중위권 (18.0x ~ 22.0x)
    30: 18.0, // Liam Lawson - Racing Bulls
    10: 18.0, // Pierre Gasly - Alpine
    27: 20.0, // Nico Hulkenberg - Audi
    87: 22.0, // Oliver Bearman - Haas

    // TIER 6: 중하위권 (25.0x ~ 35.0x)
    31: 25.0, // Esteban Ocon - Haas
    43: 28.0, // Franco Colapinto - Alpine
    40: 30.0, // Arvid Lindblad - Racing Bulls (2026 유일한 루키)
    5: 30.0,  // Gabriel Bortoleto - Audi

    // TIER 7: 하위권 (50.0x)
    77: 50.0, // Valtteri Bottas - Cadillac
    11: 50.0  // Sergio Perez - Cadillac
};

// ========================================
// 베팅 관련 유틸리티 함수
// ========================================

/**
 * 드라이버 번호로 드라이버 정보 가져오기
 */
function getDriverByNumber(number) {
    return F1_DRIVERS_2026.find(d => d.number === number);
}

/**
 * 팀별 드라이버 목록 가져오기
 */
function getDriversByTeam(team) {
    return F1_DRIVERS_2026.filter(d => d.team === team);
}

/**
 * 드라이버의 배당률 가져오기 (순위 기반 동적 배당률)
 */
function getDriverOdds(driverNumber) {
    // 순위 기반 동적 배당률 사용
    const rank = getDriverSeasonRankFromStandings(driverNumber);
    return getOddsFromSeasonRank(rank);
}

// ========================================
// 공통 순위 기반 배당률 시스템
// ========================================

// API에서 가져온 드라이버 순위 데이터 (공통)
let globalDriverStandings = null;
let globalStandingsLastUpdated = null;

/**
 * 드라이버 순위 데이터 설정 (API 로드 후 호출)
 */
function setGlobalDriverStandings(standings) {
    globalDriverStandings = standings;
    globalStandingsLastUpdated = new Date();
}

/**
 * 드라이버 순위 데이터 가져오기
 */
function getGlobalDriverStandings() {
    return globalDriverStandings;
}

/**
 * 드라이버 번호로 시즌 순위 가져오기 (공통)
 */
function getDriverSeasonRankFromStandings(driverNumber) {
    // API 데이터가 있으면 실제 순위 사용
    if (globalDriverStandings && globalDriverStandings.length > 0) {
        // 먼저 드라이버 번호로 매칭 시도
        let standing = globalDriverStandings.find(s =>
            parseInt(s.driver.number) === parseInt(driverNumber)
        );

        // 번호 매칭 실패시 이름으로 매칭 시도
        if (!standing) {
            const driver = getDriverByNumber(driverNumber);
            if (driver) {
                const lastName = driver.name.split(' ').pop().toLowerCase();
                standing = globalDriverStandings.find(s =>
                    s.driver.lastName.toLowerCase() === lastName ||
                    s.driver.lastName.toLowerCase().includes(lastName) ||
                    lastName.includes(s.driver.lastName.toLowerCase())
                );
            }
        }

        if (standing) {
            return standing.position;
        }
    }

    // API 데이터가 없으면 기본 DRIVER_ODDS 기반 순위 추정
    // 배당률이 낮을수록 높은 순위
    const baseOdds = DRIVER_ODDS[driverNumber];
    if (baseOdds) {
        // 배당률을 순위로 변환 (대략적인 매핑)
        if (baseOdds <= 2.0) return 1;
        if (baseOdds <= 2.5) return 2;
        if (baseOdds <= 3.5) return 4;
        if (baseOdds <= 5.0) return 6;
        if (baseOdds <= 8.0) return 8;
        if (baseOdds <= 12.0) return 10;
        if (baseOdds <= 18.0) return 14;
        if (baseOdds <= 25.0) return 17;
        if (baseOdds <= 35.0) return 19;
        return 21;
    }

    return 22; // 기본값: 최하위
}

/**
 * 순위 기반 배당률 계산 (공통)
 * 1위: ~1.3x, 5위: ~2.0x, 10위: ~3.5x, 15위: ~6.5x, 20위: ~11x, 22위: ~15x
 */
function getOddsFromSeasonRank(rank) {
    // 순위 범위 제한 (1-22)
    const safeRank = Math.max(1, Math.min(22, rank));

    // 지수적 배당률 계산
    const baseOdds = 1.3;
    const growthFactor = 0.12;

    const odds = baseOdds * Math.pow(1 + growthFactor, safeRank - 1);

    // 범위 제한: 1.1x ~ 50x (포디움 베팅은 더 넓은 범위)
    return Math.max(1.1, Math.min(50.0, Math.round(odds * 10) / 10));
}
