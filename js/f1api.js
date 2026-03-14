// ========================================
// F1 API Module - f1api.dev Integration
// ========================================

// API 설정 상수
const F1_API_CONFIG = {
    BASE_URL: 'https://f1api.dev/api',
    CACHE_DURATION_MS: 30 * 60 * 1000,  // 30분
    REQUEST_TIMEOUT_MS: 15000,           // 15초
    REQUEST_RETRIES: 1,
    CURRENT_SEASON: new Date().getFullYear()
};

// ========================================
// F1_API 객체
// ========================================
const F1_API = {
    BASE_URL: F1_API_CONFIG.BASE_URL,
    CURRENT_SEASON: F1_API_CONFIG.CURRENT_SEASON,

    // 캐시 (API 요청 최소화)
    cache: {},
    CACHE_DURATION: F1_API_CONFIG.CACHE_DURATION_MS,

    /**
     * API 요청 헬퍼
     * @param {string} endpoint - API 엔드포인트 (예: '/2026/1/race')
     * @returns {Promise<object|null>} - API 응답 데이터
     */
    async fetch(endpoint) {
        const cacheKey = endpoint;
        const cached = this.cache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
            logger.log('F1 API 캐시 사용:', endpoint);
            return cached.data;
        }

        try {
            const url = `${this.BASE_URL}${endpoint}`;
            logger.log('F1 API 요청:', url);

            const fetchFn = typeof safeFetch === 'function' ? safeFetch : fetch;
            const fetchOptions = typeof safeFetch === 'function' ? {
                timeout: F1_API_CONFIG.REQUEST_TIMEOUT_MS,
                retries: F1_API_CONFIG.REQUEST_RETRIES
            } : {};

            const response = await fetchFn(url, fetchOptions);
            if (!response.ok) {
                if (response.status === 404) {
                    logger.log('F1 API 404:', endpoint);
                    return null;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data) {
                this.cache[cacheKey] = { data, timestamp: Date.now() };
                logger.log('F1 API 성공:', endpoint);
                return data;
            }
            return null;
        } catch (error) {
            console.error('F1 API 요청 실패:', error.message);
            if (typeof ErrorHandler !== 'undefined' && error.message && error.message.includes('timeout')) {
                ErrorHandler.handleError(error, { silent: true });
            }
            return null;
        }
    },

    /**
     * 드라이버 정보 보강 (driver_number → 상세 정보)
     * f1api.dev 번호가 프로젝트 번호와 다를 수 있으므로 코드 매칭도 시도
     * @param {number} driverNumber - 드라이버 번호
     * @param {string} shortName - 드라이버 코드 (VER, NOR 등)
     * @returns {object|null} - 드라이버 상세 정보
     */
    enrichDriverInfo(driverNumber, shortName) {
        if (typeof F1_DRIVERS_2026 === 'undefined') return null;

        // 번호 매칭 우선
        let driver = F1_DRIVERS_2026.find(d => d.number === parseInt(driverNumber));

        // 번호 불일치 시 코드로 매칭 (예: Verstappen 33→3, Norris 4→1)
        if (!driver && shortName) {
            const codeMap = this.getDriverCodeMap();
            driver = F1_DRIVERS_2026.find(d => codeMap[d.name] === shortName.toUpperCase());
        }

        if (driver) {
            const nameParts = driver.name.split(' ');
            return {
                number: String(driver.number),
                code: this.getDriverCode(driver.name),
                firstName: nameParts[0],
                lastName: nameParts.slice(1).join(' '),
                team: driver.team
            };
        }
        return null;
    },

    /**
     * 드라이버 이름 → 코드 맵
     */
    getDriverCodeMap() {
        return {
            'Lando Norris': 'NOR', 'Oscar Piastri': 'PIA',
            'George Russell': 'RUS', 'Kimi Antonelli': 'ANT',
            'Max Verstappen': 'VER', 'Isack Hadjar': 'HAD',
            'Lewis Hamilton': 'HAM', 'Charles Leclerc': 'LEC',
            'Fernando Alonso': 'ALO', 'Lance Stroll': 'STR',
            'Alexander Albon': 'ALB', 'Carlos Sainz': 'SAI',
            'Liam Lawson': 'LAW', 'Arvid Lindblad': 'LIN',
            'Pierre Gasly': 'GAS', 'Franco Colapinto': 'COL',
            'Oliver Bearman': 'BEA', 'Esteban Ocon': 'OCO',
            'Nico Hulkenberg': 'HUL', 'Gabriel Bortoleto': 'BOR',
            'Valtteri Bottas': 'BOT', 'Sergio Perez': 'PER'
        };
    },

    /**
     * 드라이버 이름에서 3글자 코드 생성
     */
    getDriverCode(name) {
        const codeMap = this.getDriverCodeMap();
        return codeMap[name] || name.substring(0, 3).toUpperCase();
    },

    /**
     * RACE_SCHEDULE 기반 최근 완료 라운드 탐색
     */
    findLatestCompletedRound() {
        if (typeof RACE_SCHEDULE === 'undefined') return null;
        const now = new Date();
        for (let i = RACE_SCHEDULE.length - 1; i >= 0; i--) {
            const raceDate = new Date(RACE_SCHEDULE[i].date);
            const raceEndEstimate = new Date(raceDate.getTime() + 3 * 60 * 60 * 1000);
            if (raceEndEstimate < now) {
                return i + 1;
            }
        }
        return null;
    },

    /**
     * 드라이버 순위 조회 (API → 폴백)
     * @param {number} season - 시즌 연도
     * @returns {Promise<Array>} - 드라이버 순위 목록
     */
    async getDriverStandings(season = F1_API_CONFIG.CURRENT_SEASON) {
        try {
            const data = await this.fetch(`/${season}/drivers-championship`);
            if (data && data.drivers_championship && data.drivers_championship.length > 0) {
                const standings = data.drivers_championship;

                // 포인트가 있는 경우에만 API 데이터 사용 (시즌 미시작 시 0점이라 폴백 사용)
                const hasPoints = standings.some(s => s.points > 0);
                if (hasPoints) {
                    logger.log(`F1 API: ${season} 시즌 드라이버 순위 로드 성공`);
                    return standings.map(s => {
                        const driverInfo = this.enrichDriverInfo(s.driver?.number, s.driver?.shortName);
                        return {
                            position: s.position,
                            points: s.points || 0,
                            wins: s.wins || 0,
                            driver: {
                                id: s.driverId || `driver_${s.driver?.number}`,
                                number: driverInfo?.number || String(s.driver?.number || 0),
                                code: driverInfo?.code || s.driver?.shortName || 'UNK',
                                firstName: driverInfo?.firstName || s.driver?.name || '',
                                lastName: driverInfo?.lastName || s.driver?.surname || '',
                                nationality: s.driver?.nationality || ''
                            },
                            constructor: {
                                id: s.teamId || '',
                                name: driverInfo?.team || s.team?.teamName || ''
                            }
                        };
                    });
                }
            }
        } catch (error) {
            console.error(`F1 API 드라이버 순위 조회 실패:`, error.message);
        }

        logger.log('F1 API: 폴백 데이터 사용');
        return this.getFallbackDriverStandings();
    },

    /**
     * 폴백 드라이버 순위 (API 실패 시)
     * 2026 시즌 R1 호주 GP 후 기준
     */
    getFallbackDriverStandings() {
        return [
            { position: 1, points: 25, wins: 1, driver: { number: '63', code: 'RUS', firstName: 'George', lastName: 'Russell', nationality: 'British' }, constructor: { name: 'Mercedes' }},
            { position: 2, points: 18, wins: 0, driver: { number: '12', code: 'ANT', firstName: 'Kimi', lastName: 'Antonelli', nationality: 'Italian' }, constructor: { name: 'Mercedes' }},
            { position: 3, points: 15, wins: 0, driver: { number: '16', code: 'LEC', firstName: 'Charles', lastName: 'Leclerc', nationality: 'Monegasque' }, constructor: { name: 'Ferrari' }},
            { position: 4, points: 12, wins: 0, driver: { number: '44', code: 'HAM', firstName: 'Lewis', lastName: 'Hamilton', nationality: 'British' }, constructor: { name: 'Ferrari' }},
            { position: 5, points: 10, wins: 0, driver: { number: '4', code: 'NOR', firstName: 'Lando', lastName: 'Norris', nationality: 'British' }, constructor: { name: 'McLaren' }},
            { position: 6, points: 8, wins: 0, driver: { number: '33', code: 'VER', firstName: 'Max', lastName: 'Verstappen', nationality: 'Dutch' }, constructor: { name: 'Red Bull' }},
            { position: 7, points: 6, wins: 0, driver: { number: '87', code: 'BEA', firstName: 'Oliver', lastName: 'Bearman', nationality: 'British' }, constructor: { name: 'Haas' }},
            { position: 8, points: 4, wins: 0, driver: { number: '36', code: 'LIN', firstName: 'Arvid', lastName: 'Lindblad', nationality: 'British' }, constructor: { name: 'Racing Bulls' }},
            { position: 9, points: 2, wins: 0, driver: { number: '5', code: 'BOR', firstName: 'Gabriel', lastName: 'Bortoleto', nationality: 'Brazilian' }, constructor: { name: 'Audi' }},
            { position: 10, points: 1, wins: 0, driver: { number: '10', code: 'GAS', firstName: 'Pierre', lastName: 'Gasly', nationality: 'French' }, constructor: { name: 'Alpine' }},
            { position: 11, points: 0, wins: 0, driver: { number: '31', code: 'OCO', firstName: 'Esteban', lastName: 'Ocon', nationality: 'French' }, constructor: { name: 'Haas' }},
            { position: 12, points: 0, wins: 0, driver: { number: '23', code: 'ALB', firstName: 'Alexander', lastName: 'Albon', nationality: 'Thai' }, constructor: { name: 'Williams' }},
            { position: 13, points: 0, wins: 0, driver: { number: '30', code: 'LAW', firstName: 'Liam', lastName: 'Lawson', nationality: 'New Zealander' }, constructor: { name: 'Racing Bulls' }},
            { position: 14, points: 0, wins: 0, driver: { number: '43', code: 'COL', firstName: 'Franco', lastName: 'Colapinto', nationality: 'Argentine' }, constructor: { name: 'Alpine' }},
            { position: 15, points: 0, wins: 0, driver: { number: '55', code: 'SAI', firstName: 'Carlos', lastName: 'Sainz', nationality: 'Spanish' }, constructor: { name: 'Williams' }},
            { position: 16, points: 0, wins: 0, driver: { number: '11', code: 'PER', firstName: 'Sergio', lastName: 'Perez', nationality: 'Mexican' }, constructor: { name: 'Cadillac' }},
            { position: 17, points: 0, wins: 0, driver: { number: '6', code: 'HAD', firstName: 'Isack', lastName: 'Hadjar', nationality: 'French' }, constructor: { name: 'Red Bull' }},
            { position: 18, points: 0, wins: 0, driver: { number: '81', code: 'PIA', firstName: 'Oscar', lastName: 'Piastri', nationality: 'Australian' }, constructor: { name: 'McLaren' }},
            { position: 19, points: 0, wins: 0, driver: { number: '27', code: 'HUL', firstName: 'Nico', lastName: 'Hulkenberg', nationality: 'German' }, constructor: { name: 'Audi' }},
            { position: 20, points: 0, wins: 0, driver: { number: '14', code: 'ALO', firstName: 'Fernando', lastName: 'Alonso', nationality: 'Spanish' }, constructor: { name: 'Aston Martin' }},
            { position: 21, points: 0, wins: 0, driver: { number: '77', code: 'BOT', firstName: 'Valtteri', lastName: 'Bottas', nationality: 'Finnish' }, constructor: { name: 'Cadillac' }},
            { position: 22, points: 0, wins: 0, driver: { number: '18', code: 'STR', firstName: 'Lance', lastName: 'Stroll', nationality: 'Canadian' }, constructor: { name: 'Aston Martin' }}
        ];
    },

    /**
     * 컨스트럭터(팀) 순위 조회
     */
    async getConstructorStandings(season = F1_API_CONFIG.CURRENT_SEASON) {
        try {
            const data = await this.fetch(`/${season}/constructors-championship`);
            if (data && data.constructors_championship && data.constructors_championship.length > 0) {
                const standings = data.constructors_championship;
                const hasPoints = standings.some(s => s.points > 0);
                if (hasPoints) {
                    return standings.map(s => ({
                        position: s.position,
                        points: s.points || 0,
                        wins: s.wins || 0,
                        constructor: {
                            id: s.teamId || '',
                            name: s.team?.teamName || '',
                            nationality: s.team?.country || ''
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('F1 API 팀 순위 조회 실패:', error.message);
        }

        // API 실패 시 드라이버 순위에서 팀별 집계
        const driverStandings = await this.getDriverStandings(season);
        if (!driverStandings || driverStandings.length === 0) {
            return this.getFallbackConstructorStandings();
        }

        const teamPoints = {};
        for (const standing of driverStandings) {
            const teamName = standing.constructor?.name || 'Unknown';
            if (!teamPoints[teamName]) {
                teamPoints[teamName] = { name: teamName, points: 0, wins: 0 };
            }
            teamPoints[teamName].points += standing.points || 0;
            teamPoints[teamName].wins += standing.wins || 0;
        }

        return Object.values(teamPoints)
            .sort((a, b) => b.points - a.points)
            .map((team, index) => ({
                position: index + 1,
                points: team.points,
                wins: team.wins,
                constructor: {
                    id: team.name.toLowerCase().replace(/\s/g, '_'),
                    name: team.name,
                    nationality: ''
                }
            }));
    },

    /**
     * 폴백 컨스트럭터 순위
     */
    getFallbackConstructorStandings() {
        return [
            { position: 1, points: 0, wins: 0, constructor: { name: 'McLaren', nationality: 'British' }},
            { position: 2, points: 0, wins: 0, constructor: { name: 'Ferrari', nationality: 'Italian' }},
            { position: 3, points: 0, wins: 0, constructor: { name: 'Red Bull', nationality: 'Austrian' }},
            { position: 4, points: 0, wins: 0, constructor: { name: 'Mercedes', nationality: 'German' }},
            { position: 5, points: 0, wins: 0, constructor: { name: 'Aston Martin', nationality: 'British' }},
            { position: 6, points: 0, wins: 0, constructor: { name: 'Williams', nationality: 'British' }},
            { position: 7, points: 0, wins: 0, constructor: { name: 'Alpine', nationality: 'French' }},
            { position: 8, points: 0, wins: 0, constructor: { name: 'Racing Bulls', nationality: 'Italian' }},
            { position: 9, points: 0, wins: 0, constructor: { name: 'Haas', nationality: 'American' }},
            { position: 10, points: 0, wins: 0, constructor: { name: 'Audi', nationality: 'German' }},
            { position: 11, points: 0, wins: 0, constructor: { name: 'Cadillac', nationality: 'American' }}
        ];
    },

    /**
     * 최근 레이스 결과 조회
     */
    async getLastRaceResults(season = F1_API_CONFIG.CURRENT_SEASON) {
        // RACE_SCHEDULE에서 최근 완료 라운드 탐색
        const round = this.findLatestCompletedRound();
        if (round) {
            const result = await this.getRaceResults(season, round);
            if (result) return result;
        }

        // 폴백: 이전 시즌 마지막 라운드 시도
        try {
            const prevData = await this.fetch(`/${season - 1}`);
            if (prevData && prevData.races) {
                const races = Array.isArray(prevData.races) ? prevData.races : [prevData.races];
                const lastRound = races.length;
                if (lastRound > 0) {
                    return await this.getRaceResults(season - 1, lastRound);
                }
            }
        } catch (error) {
            logger.log('이전 시즌 레이스 결과 조회 실패:', error.message);
        }

        return null;
    },

    /**
     * 특정 레이스 결과 조회
     * @param {number} season - 시즌 연도
     * @param {number} round - 라운드 번호
     * @returns {Promise<object|null>} - 레이스 결과
     */
    async getRaceResults(season, round) {
        try {
            const data = await this.fetch(`/${season}/${round}/race`);
            if (!data || !data.races) return null;

            const race = data.races;
            if (!race.results || race.results.length === 0) return null;

            return {
                season: String(season),
                round: race.round || round,
                raceName: race.raceName || 'Unknown Race',
                circuit: {
                    id: race.circuit?.circuitId || '',
                    name: race.circuit?.circuitName || '',
                    location: race.circuit?.city || '',
                    country: race.circuit?.country || ''
                },
                date: race.date || '',
                time: race.time || '',
                results: race.results.map(result => {
                    const driverInfo = this.enrichDriverInfo(result.driver?.number, result.driver?.shortName);
                    return {
                        position: result.position,
                        points: result.points || this.getPointsForPosition(result.position),
                        driver: {
                            id: result.driver?.driverId || `driver_${result.driver?.number}`,
                            code: driverInfo?.code || result.driver?.shortName || 'UNK',
                            firstName: driverInfo?.firstName || result.driver?.name || '',
                            lastName: driverInfo?.lastName || result.driver?.surname || '',
                            number: driverInfo?.number || String(result.driver?.number || 0)
                        },
                        constructor: driverInfo?.team || result.team?.teamName || '',
                        grid: result.grid || 0,
                        laps: 0,
                        status: result.retired ? String(result.retired) : 'Finished',
                        time: result.time || null,
                        fastestLap: result.fastLap || null
                    };
                })
            };
        } catch (error) {
            console.error(`레이스 결과 조회 실패 (${season}/${round}):`, error.message);
            return null;
        }
    },

    /**
     * 순위별 포인트 계산
     */
    getPointsForPosition(position) {
        const pointsMap = {
            1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
            6: 8, 7: 6, 8: 4, 9: 2, 10: 1
        };
        return pointsMap[position] || 0;
    },

    /**
     * 다음 레이스 정보 조회 (RACE_SCHEDULE 사용)
     */
    async getNextRace() {
        if (typeof getNextRace === 'function') {
            const { race, index } = getNextRace();
            if (race) {
                return {
                    season: String(F1_API_CONFIG.CURRENT_SEASON),
                    round: index + 1,
                    raceName: race.name,
                    circuit: {
                        id: '',
                        name: race.circuit,
                        location: race.circuit,
                        country: ''
                    },
                    date: race.date.split('T')[0],
                    time: race.date.split('T')[1] || '00:00:00',
                    raceDateTime: new Date(race.date)
                };
            }
        }
        return null;
    },

    /**
     * 시즌 레이스 스케줄 조회 (RACE_SCHEDULE 폴백)
     */
    async getSchedule(season = F1_API_CONFIG.CURRENT_SEASON) {
        // RACE_SCHEDULE 사용 (2026 시즌, 가장 정확)
        if (typeof RACE_SCHEDULE !== 'undefined' && season === 2026) {
            return RACE_SCHEDULE.map((race, index) => ({
                season: '2026',
                round: index + 1,
                raceName: race.name,
                circuit: {
                    id: '',
                    name: race.circuit,
                    location: race.circuit,
                    country: ''
                },
                date: race.date.split('T')[0],
                time: race.date.split('T')[1] || ''
            }));
        }

        // 다른 시즌은 API 조회
        try {
            const data = await this.fetch(`/${season}`);
            if (data && data.races) {
                const races = Array.isArray(data.races) ? data.races : [data.races];
                return races.map((race, index) => ({
                    season: String(season),
                    round: race.round || index + 1,
                    raceName: race.raceName || '',
                    circuit: {
                        id: race.circuit?.circuitId || '',
                        name: race.circuit?.circuitName || '',
                        location: race.circuit?.city || '',
                        country: race.circuit?.country || ''
                    },
                    date: race.date || '',
                    time: race.time || ''
                }));
            }
        } catch (error) {
            console.error('레이스 스케줄 조회 실패:', error.message);
        }

        return [];
    },

    /**
     * 포디움 결과 조회 (P1, P2, P3)
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
