// ========================================
// 2026 F1 베팅 데이터
// ========================================

// 2026 F1 드라이버 목록 (11개 팀, 22명)
const F1_DRIVERS_2026 = [
    // McLaren
    { number: 4, name: "Lando Norris", team: "McLaren", teamColor: "#FF8000" },
    { number: 81, name: "Oscar Piastri", team: "McLaren", teamColor: "#FF8000" },
    // Mercedes
    { number: 63, name: "George Russell", team: "Mercedes", teamColor: "#27F4D2" },
    { number: 12, name: "Kimi Antonelli", team: "Mercedes", teamColor: "#27F4D2" },
    // Red Bull
    { number: 33, name: "Max Verstappen", team: "Red Bull", teamColor: "#3671C6" },
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
    { number: 36, name: "Arvid Lindblad", team: "Racing Bulls", teamColor: "#6692FF" },
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
// 2026 드라이버별 초기 배당률 - 2025 시즌 최종 순위 기반
// ========================================
// 2026 시즌 순위 기반 배당률 (R1 호주 GP 후 기준)
// 1.RUS(25) 2.ANT(18) 3.LEC(15) 4.HAM(12) 5.NOR(10) 6.VER(8) 7.BEA(6)
// 8.LIN(4) 9.BOR(2) 10.GAS(1) 11~22위: 0pts
const DRIVER_ODDS = {
    // 2026 시즌 1~5위 (1.3x ~ 2.0x)
    63: 1.3,  // George Russell - 2026 1위 (25pts, 1승)
    12: 1.4,  // Kimi Antonelli - 2026 2위 (18pts)
    16: 1.5,  // Charles Leclerc - 2026 3위 (15pts)
    44: 1.7,  // Lewis Hamilton - 2026 4위 (12pts)
    4: 2.0,   // Lando Norris - 2026 5위 (10pts)

    // 2026 시즌 6~10위 (2.3x ~ 3.5x)
    33: 2.3,  // Max Verstappen - 2026 6위 (8pts)
    87: 2.5,  // Oliver Bearman - 2026 7위 (6pts)
    36: 2.8,  // Arvid Lindblad - 2026 8위 (4pts)
    5: 3.0,   // Gabriel Bortoleto - 2026 9위 (2pts)
    10: 3.5,  // Pierre Gasly - 2026 10위 (1pt)

    // 2026 시즌 11~16위 (4.0x ~ 7.5x)
    31: 4.0,  // Esteban Ocon - 2026 11위 (0pts)
    23: 4.0,  // Alexander Albon - 2026 12위 (0pts)
    30: 4.5,  // Liam Lawson - 2026 13위 (0pts)
    43: 5.0,  // Franco Colapinto - 2026 14위 (0pts)
    55: 5.5,  // Carlos Sainz - 2026 15위 (0pts)
    11: 6.5,  // Sergio Perez - 2026 16위 (0pts)

    // 2026 시즌 17~22위 (7.5x ~ 20.0x)
    6: 7.5,   // Isack Hadjar - 2026 17위 (0pts)
    81: 8.5,  // Oscar Piastri - 2026 18위 (0pts)
    27: 10.0, // Nico Hulkenberg - 2026 19위 (0pts)
    14: 15.0, // Fernando Alonso - 2026 20위 (0pts)
    77: 18.0, // Valtteri Bottas - 2026 21위 (0pts)
    18: 20.0  // Lance Stroll - 2026 22위 (0pts)
};

// ========================================
// 베팅 관련 유틸리티 함수
// ========================================

// F1 공식 CDN 팀 슬러그 매핑
const TEAM_IMAGE_SLUGS = {
    'McLaren': 'mclaren',
    'Mercedes': 'mercedes',
    'Red Bull': 'redbullracing',
    'Ferrari': 'ferrari',
    'Aston Martin': 'astonmartin',
    'Williams': 'williams',
    'Racing Bulls': 'racingbulls',
    'Alpine': 'alpine',
    'Haas': 'haasf1team',
    'Audi': 'audi',
    'Cadillac': 'cadillac'
};

// 드라이버 코드 예외 (공식 이름과 표시 이름이 다른 경우)
const DRIVER_CODE_OVERRIDES = {
    'Kimi Antonelli': 'andant'  // 공식 이름: Andrea Kimi Antonelli
};

/**
 * 드라이버 이름과 팀으로 F1 공식 Cloudinary CDN 이미지 URL 생성
 * @param {string} name - 드라이버 풀네임 (예: "Max Verstappen")
 * @param {string} team - 팀 이름 (예: "Red Bull")
 * @returns {string} 이미지 URL (폴백 이미지 자동 포함)
 */
function getDriverImageUrl(name, team) {
    let code = DRIVER_CODE_OVERRIDES[name];
    if (!code) {
        const parts = name.split(' ');
        const first = parts[0];
        const last = parts[parts.length - 1];
        code = (first.slice(0, 3) + last.slice(0, 3)).toLowerCase();
    }
    const teamSlug = TEAM_IMAGE_SLUGS[team] || team.toLowerCase().replace(/\s+/g, '');
    return `https://media.formula1.com/image/upload/f_auto,c_lfill,w_256/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026/${teamSlug}/${code}01/2026${teamSlug}${code}01right.webp`;
}

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

    // API 데이터가 없으면 DRIVER_ODDS를 배당률 오름차순 정렬하여 순위 추정
    const baseOdds = DRIVER_ODDS[driverNumber];
    if (baseOdds) {
        const sortedEntries = Object.entries(DRIVER_ODDS)
            .sort((a, b) => a[1] - b[1]);
        const index = sortedEntries.findIndex(([num]) => parseInt(num) === parseInt(driverNumber));
        return index >= 0 ? index + 1 : 22;
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
