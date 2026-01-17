// ========================================
// 공통 유틸리티 함수
// ========================================

// 2026 시즌 전체 레이스 일정
const RACE_SCHEDULE = [
    { name: "호주 그랑프리", circuit: "앨버트 파크 서킷 · 멜버른", date: "2026-03-16T05:00:00" },
    { name: "중국 그랑프리", circuit: "상하이 인터내셔널 서킷 · 상하이", date: "2026-03-30T07:00:00" },
    { name: "일본 그랑프리", circuit: "스즈카 서킷 · 스즈카", date: "2026-04-06T06:00:00" },
    { name: "바레인 그랑프리", circuit: "바레인 인터내셔널 서킷 · 사키르", date: "2026-04-13T18:00:00" },
    { name: "사우디 아라비아 그랑프리", circuit: "제다 코르니쉬 서킷 · 제다", date: "2026-04-20T20:00:00" },
    { name: "마이애미 그랑프리", circuit: "마이애미 인터내셔널 오토드롬 · 마이애미", date: "2026-05-04T20:00:00" },
    { name: "에밀리아 로마냐 그랑프리", circuit: "이몰라 서킷 · 이몰라", date: "2026-05-18T15:00:00" },
    { name: "모나코 그랑프리", circuit: "몬테카를로 시가지 서킷 · 모나코", date: "2026-05-25T15:00:00" },
    { name: "스페인 그랑프리", circuit: "카탈루냐 서킷 · 바르셀로나", date: "2026-06-01T15:00:00" },
    { name: "캐나다 그랑프리", circuit: "질 빌뇌브 서킷 · 몬트리올", date: "2026-06-15T20:00:00" },
    { name: "오스트리아 그랑프리", circuit: "레드불 링 · 슈필베르크", date: "2026-06-29T15:00:00" },
    { name: "영국 그랑프리", circuit: "실버스톤 서킷 · 실버스톤", date: "2026-07-06T15:00:00" },
    { name: "벨기에 그랑프리", circuit: "스파-프랑코르샹 · 스파", date: "2026-07-27T15:00:00" },
    { name: "헝가리 그랑프리", circuit: "헝가로링 · 부다페스트", date: "2026-08-03T15:00:00" },
    { name: "네덜란드 그랑프리", circuit: "잔드보르트 서킷 · 잔드보르트", date: "2026-08-31T15:00:00" },
    { name: "이탈리아 그랑프리", circuit: "몬자 서킷 · 몬자", date: "2026-09-07T15:00:00" },
    { name: "아제르바이잔 그랑프리", circuit: "바쿠 시티 서킷 · 바쿠", date: "2026-09-21T13:00:00" },
    { name: "싱가포르 그랑프리", circuit: "마리나 베이 시가지 서킷 · 싱가포르", date: "2026-10-05T20:00:00" },
    { name: "미국 그랑프리", circuit: "서킷 오브 디 아메리카스 · 오스틴", date: "2026-10-19T20:00:00" },
    { name: "멕시코 그랑프리", circuit: "에르마노스 로드리게스 서킷 · 멕시코시티", date: "2026-10-26T20:00:00" },
    { name: "브라질 그랑프리", circuit: "인테르라고스 · 상파울루", date: "2026-11-09T18:00:00" },
    { name: "라스베가스 그랑프리", circuit: "라스베가스 스트립 서킷 · 라스베가스", date: "2026-11-22T06:00:00" },
    { name: "카타르 그랑프리", circuit: "루사일 인터내셔널 서킷 · 루사일", date: "2026-11-30T18:00:00" },
    { name: "아부다비 그랑프리", circuit: "야스 마리나 서킷 · 아부다비", date: "2026-12-07T17:00:00" }
];

/**
 * 다음 레이스 찾기 (현재 시간보다 미래인 첫 번째 레이스)
 * @returns {Object} 다음 레이스 정보 { race, index }
 */
function getNextRace() {
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
