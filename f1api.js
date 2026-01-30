// ========================================
// F1 API Module - Ergast API Integration
// ========================================

// API 설정 상수
const F1_API_CONFIG = {
    CACHE_DURATION_MS: 30 * 60 * 1000,  // 30분
    REQUEST_TIMEOUT_MS: 15000,           // 15초
    REQUEST_RETRIES: 1
};

const F1_API = {
    // Jolpica API - Ergast API 대체 (2024년 Ergast 종료 후 대안)
    BASE_URL: 'https://api.jolpi.ca/ergast/f1',
    CURRENT_SEASON: new Date().getFullYear(),
    // 캐시 (API 요청 최소화)
    cache: {},
    CACHE_DURATION: F1_API_CONFIG.CACHE_DURATION_MS,

    /**
     * API 요청 헬퍼
     * @param {string} endpoint - API 엔드포인트
     * @returns {Promise<object>} - API 응답 데이터
     */
    async fetch(endpoint) {
        // 캐시 확인
        const cacheKey = endpoint;
        const cached = this.cache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
            console.log('F1 API 캐시 사용:', endpoint);
            return cached.data;
        }

        try {
            const url = `${this.BASE_URL}${endpoint}.json`;
            console.log('F1 API 요청:', url);

            // safeFetch 사용
            const fetchFn = typeof safeFetch === 'function' ? safeFetch : fetch;
            const fetchOptions = typeof safeFetch === 'function' ? {
                timeout: F1_API_CONFIG.REQUEST_TIMEOUT_MS,
                retries: F1_API_CONFIG.REQUEST_RETRIES
            } : {};

            const response = await fetchFn(url, fetchOptions);

            const data = await response.json();

            if (data && data.MRData) {
                // 캐시 저장
                this.cache[cacheKey] = {
                    data: data.MRData,
                    timestamp: Date.now()
                };
                console.log('F1 API 성공:', endpoint);
                return data.MRData;
            }
            return null;
        } catch (error) {
            console.error('F1 API 요청 실패:', error.message);
            // 네트워크 에러 토스트 표시 (조용히)
            if (typeof ErrorHandler !== 'undefined' && error.message && error.message.includes('timeout')) {
                ErrorHandler.handleError(error, { silent: true });
            }
            return null;
        }
    },

    /**
     * 드라이버 순위 조회 (자동 시즌 폴백)
     * @param {number} season - 시즌 연도 (기본값: 현재 시즌)
     * @returns {Promise<Array>} - 드라이버 순위 목록
     */
    async getDriverStandings(season = this.CURRENT_SEASON) {
        // 현재 시즌부터 과거로 시도
        const seasonsToTry = [season, season - 1, season - 2, 'current'];

        for (const s of seasonsToTry) {
            const data = await this.fetch(`/${s}/driverStandings`);
            if (data && data.StandingsTable && data.StandingsTable.StandingsLists) {
                const standingsList = data.StandingsTable.StandingsLists[0];
                if (standingsList && standingsList.DriverStandings && standingsList.DriverStandings.length > 0) {
                    console.log(`F1 API: ${s} 시즌 데이터 로드 성공`);
                    return standingsList.DriverStandings.map(standing => {
                        // 🔒 NaN 방지: parseInt/parseFloat 실패 시 기본값 사용
                        const position = parseInt(standing.position);
                        const points = parseFloat(standing.points);
                        const wins = parseInt(standing.wins);
                        return {
                            position: isNaN(position) ? 99 : position,
                            points: isNaN(points) ? 0 : points,
                            wins: isNaN(wins) ? 0 : wins,
                            driver: {
                                id: standing.Driver.driverId,
                                number: standing.Driver.permanentNumber || '0',
                                code: standing.Driver.code || 'UNK',
                                firstName: standing.Driver.givenName || '',
                                lastName: standing.Driver.familyName || '',
                                nationality: standing.Driver.nationality || ''
                            },
                            constructor: {
                                id: standing.Constructors[0]?.constructorId || '',
                                name: standing.Constructors[0]?.name || ''
                            }
                        };
                    });
                }
            }
        }

        // API 실패 시 폴백 데이터 반환
        console.log('F1 API: 폴백 데이터 사용');
        return this.getFallbackDriverStandings();
    },

    /**
     * 폴백 드라이버 순위 (API 실패 시)
     * 2026 시즌 예상 순위 - F1_DRIVERS_2026 배열과 일치하는 번호 사용
     */
    getFallbackDriverStandings() {
        return [
            { position: 1, points: 0, wins: 0, driver: { number: '1', code: 'NOR', firstName: 'Lando', lastName: 'Norris', nationality: 'British' }, constructor: { name: 'McLaren' }},
            { position: 2, points: 0, wins: 0, driver: { number: '3', code: 'VER', firstName: 'Max', lastName: 'Verstappen', nationality: 'Dutch' }, constructor: { name: 'Red Bull' }},
            { position: 3, points: 0, wins: 0, driver: { number: '16', code: 'LEC', firstName: 'Charles', lastName: 'Leclerc', nationality: 'Monegasque' }, constructor: { name: 'Ferrari' }},
            { position: 4, points: 0, wins: 0, driver: { number: '81', code: 'PIA', firstName: 'Oscar', lastName: 'Piastri', nationality: 'Australian' }, constructor: { name: 'McLaren' }},
            { position: 5, points: 0, wins: 0, driver: { number: '44', code: 'HAM', firstName: 'Lewis', lastName: 'Hamilton', nationality: 'British' }, constructor: { name: 'Ferrari' }},
            { position: 6, points: 0, wins: 0, driver: { number: '63', code: 'RUS', firstName: 'George', lastName: 'Russell', nationality: 'British' }, constructor: { name: 'Mercedes' }},
            { position: 7, points: 0, wins: 0, driver: { number: '55', code: 'SAI', firstName: 'Carlos', lastName: 'Sainz', nationality: 'Spanish' }, constructor: { name: 'Williams' }},
            { position: 8, points: 0, wins: 0, driver: { number: '14', code: 'ALO', firstName: 'Fernando', lastName: 'Alonso', nationality: 'Spanish' }, constructor: { name: 'Aston Martin' }},
            { position: 9, points: 0, wins: 0, driver: { number: '12', code: 'ANT', firstName: 'Kimi', lastName: 'Antonelli', nationality: 'Italian' }, constructor: { name: 'Mercedes' }},
            { position: 10, points: 0, wins: 0, driver: { number: '6', code: 'HAD', firstName: 'Isack', lastName: 'Hadjar', nationality: 'French' }, constructor: { name: 'Red Bull' }},
            { position: 11, points: 0, wins: 0, driver: { number: '27', code: 'HUL', firstName: 'Nico', lastName: 'Hulkenberg', nationality: 'German' }, constructor: { name: 'Audi' }},
            { position: 12, points: 0, wins: 0, driver: { number: '10', code: 'GAS', firstName: 'Pierre', lastName: 'Gasly', nationality: 'French' }, constructor: { name: 'Alpine' }},
            { position: 13, points: 0, wins: 0, driver: { number: '23', code: 'ALB', firstName: 'Alexander', lastName: 'Albon', nationality: 'Thai' }, constructor: { name: 'Williams' }},
            { position: 14, points: 0, wins: 0, driver: { number: '18', code: 'STR', firstName: 'Lance', lastName: 'Stroll', nationality: 'Canadian' }, constructor: { name: 'Aston Martin' }},
            { position: 15, points: 0, wins: 0, driver: { number: '30', code: 'LAW', firstName: 'Liam', lastName: 'Lawson', nationality: 'New Zealander' }, constructor: { name: 'Racing Bulls' }},
            { position: 16, points: 0, wins: 0, driver: { number: '31', code: 'OCO', firstName: 'Esteban', lastName: 'Ocon', nationality: 'French' }, constructor: { name: 'Haas' }},
            { position: 17, points: 0, wins: 0, driver: { number: '87', code: 'BEA', firstName: 'Oliver', lastName: 'Bearman', nationality: 'British' }, constructor: { name: 'Haas' }},
            { position: 18, points: 0, wins: 0, driver: { number: '5', code: 'BOR', firstName: 'Gabriel', lastName: 'Bortoleto', nationality: 'Brazilian' }, constructor: { name: 'Audi' }},
            { position: 19, points: 0, wins: 0, driver: { number: '43', code: 'COL', firstName: 'Franco', lastName: 'Colapinto', nationality: 'Argentine' }, constructor: { name: 'Alpine' }},
            { position: 20, points: 0, wins: 0, driver: { number: '77', code: 'BOT', firstName: 'Valtteri', lastName: 'Bottas', nationality: 'Finnish' }, constructor: { name: 'Cadillac' }},
            { position: 21, points: 0, wins: 0, driver: { number: '11', code: 'PER', firstName: 'Sergio', lastName: 'Perez', nationality: 'Mexican' }, constructor: { name: 'Cadillac' }},
            { position: 22, points: 0, wins: 0, driver: { number: '40', code: 'LIN', firstName: 'Arvid', lastName: 'Lindblad', nationality: 'British' }, constructor: { name: 'Racing Bulls' }}
        ];
    },

    /**
     * 컨스트럭터(팀) 순위 조회
     * @param {number} season - 시즌 연도 (기본값: 현재 시즌)
     * @returns {Promise<Array>} - 팀 순위 목록
     */
    async getConstructorStandings(season = this.CURRENT_SEASON) {
        const data = await this.fetch(`/${season}/constructorStandings`);
        if (!data || !data.StandingsTable || !data.StandingsTable.StandingsLists) {
            return [];
        }

        const standingsList = data.StandingsTable.StandingsLists[0];
        if (!standingsList || !standingsList.ConstructorStandings) {
            return [];
        }

        return standingsList.ConstructorStandings.map(standing => ({
            position: parseInt(standing.position),
            points: parseFloat(standing.points),
            wins: parseInt(standing.wins),
            constructor: {
                id: standing.Constructor.constructorId,
                name: standing.Constructor.name,
                nationality: standing.Constructor.nationality
            }
        }));
    },

    /**
     * 최근 레이스 결과 조회
     * @param {number} season - 시즌 연도 (기본값: 현재 시즌)
     * @returns {Promise<object|null>} - 최근 레이스 결과
     */
    async getLastRaceResults(season = this.CURRENT_SEASON) {
        const data = await this.fetch(`/${season}/last/results`);
        if (!data || !data.RaceTable || !data.RaceTable.Races || data.RaceTable.Races.length === 0) {
            return null;
        }

        const race = data.RaceTable.Races[0];
        return {
            season: race.season,
            round: parseInt(race.round),
            raceName: race.raceName,
            circuit: {
                id: race.Circuit.circuitId,
                name: race.Circuit.circuitName,
                location: race.Circuit.Location.locality,
                country: race.Circuit.Location.country
            },
            date: race.date,
            time: race.time,
            results: race.Results.map(result => ({
                position: parseInt(result.position),
                points: parseFloat(result.points),
                driver: {
                    id: result.Driver.driverId,
                    code: result.Driver.code,
                    firstName: result.Driver.givenName,
                    lastName: result.Driver.familyName,
                    number: result.Driver.permanentNumber
                },
                constructor: result.Constructor.name,
                grid: parseInt(result.grid),
                laps: parseInt(result.laps),
                status: result.status,
                time: result.Time?.time || null,
                fastestLap: result.FastestLap ? {
                    rank: parseInt(result.FastestLap.rank),
                    lap: parseInt(result.FastestLap.lap),
                    time: result.FastestLap.Time?.time
                } : null
            }))
        };
    },

    /**
     * 다음 레이스 정보 조회
     * @param {number} season - 시즌 연도 (기본값: 현재 시즌)
     * @returns {Promise<object|null>} - 다음 레이스 정보
     */
    async getNextRace(season = this.CURRENT_SEASON) {
        const data = await this.fetch(`/${season}`);
        if (!data || !data.RaceTable || !data.RaceTable.Races) {
            return null;
        }

        const now = new Date();
        const races = data.RaceTable.Races;

        // 아직 열리지 않은 다음 레이스 찾기
        for (const race of races) {
            const raceDate = new Date(`${race.date}T${race.time || '00:00:00Z'}`);
            if (raceDate > now) {
                return {
                    season: race.season,
                    round: parseInt(race.round),
                    raceName: race.raceName,
                    circuit: {
                        id: race.Circuit.circuitId,
                        name: race.Circuit.circuitName,
                        location: race.Circuit.Location.locality,
                        country: race.Circuit.Location.country
                    },
                    date: race.date,
                    time: race.time,
                    raceDateTime: raceDate
                };
            }
        }

        return null;
    },

    /**
     * 시즌 레이스 스케줄 조회
     * @param {number} season - 시즌 연도 (기본값: 현재 시즌)
     * @returns {Promise<Array>} - 레이스 스케줄 목록
     */
    async getSchedule(season = this.CURRENT_SEASON) {
        const data = await this.fetch(`/${season}`);
        if (!data || !data.RaceTable || !data.RaceTable.Races) {
            return [];
        }

        return data.RaceTable.Races.map(race => ({
            season: race.season,
            round: parseInt(race.round),
            raceName: race.raceName,
            circuit: {
                id: race.Circuit.circuitId,
                name: race.Circuit.circuitName,
                location: race.Circuit.Location.locality,
                country: race.Circuit.Location.country
            },
            date: race.date,
            time: race.time
        }));
    },

    /**
     * 특정 레이스 결과 조회
     * @param {number} season - 시즌 연도
     * @param {number} round - 라운드 번호
     * @returns {Promise<object|null>} - 레이스 결과
     */
    async getRaceResults(season, round) {
        const data = await this.fetch(`/${season}/${round}/results`);
        if (!data || !data.RaceTable || !data.RaceTable.Races || data.RaceTable.Races.length === 0) {
            return null;
        }

        const race = data.RaceTable.Races[0];
        return {
            season: race.season,
            round: parseInt(race.round),
            raceName: race.raceName,
            circuit: {
                id: race.Circuit.circuitId,
                name: race.Circuit.circuitName,
                location: race.Circuit.Location.locality,
                country: race.Circuit.Location.country
            },
            date: race.date,
            results: race.Results.map(result => ({
                position: parseInt(result.position),
                points: parseFloat(result.points),
                driver: {
                    id: result.Driver.driverId,
                    code: result.Driver.code,
                    firstName: result.Driver.givenName,
                    lastName: result.Driver.familyName,
                    number: result.Driver.permanentNumber
                },
                constructor: result.Constructor.name,
                status: result.status
            }))
        };
    },

    /**
     * 포디움 결과 조회 (P1, P2, P3)
     * @param {number} season - 시즌 연도
     * @param {number} round - 라운드 번호
     * @returns {Promise<Array>} - 포디움 순위 (1~3위)
     */
    async getPodiumResults(season, round) {
        const raceResults = await this.getRaceResults(season, round);
        if (!raceResults || !raceResults.results) {
            return [];
        }

        return raceResults.results
            .filter(r => r.position <= 3)
            .map(r => ({
                position: r.position,
                driverNumber: parseInt(r.driver.number),
                driverName: `${r.driver.firstName} ${r.driver.lastName}`,
                driverCode: r.driver.code,
                team: r.constructor
            }));
    }
};

// ========================================
// 베팅 정산 함수는 podiumBet.js로 이동됨
// ========================================
