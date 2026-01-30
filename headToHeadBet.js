// ========================================
// AMR Token System - Head-to-Head Betting Module
// 1:1 Driver Betting System
// ========================================

// ========================================
// 상태 관리
// ========================================

const h2hState = {
    selectedDrivers: {
        A: null,
        B: null
    },
    predictedWinner: null, // 'A' or 'B'
    betAmount: 0,
    currentOdds: {
        A: 0,
        B: 0
    },
    currentPickerSlot: null, // 'A' or 'B'
    raceId: null,
    raceName: null,
    // API에서 가져온 실시간 드라이버 순위
    apiDriverStandings: null,
    standingsLastUpdated: null
};

// 실시간 배당률 상태 (유저 베팅 기반)
const h2hLiveOddsState = {
    // 매치업별 베팅 풀: { "1_3": { driverA: 100, driverB: 200, total: 300 }, ... }
    matchupPools: {},
    // 매치업별 실시간 배당률: { "1_3": { A: 2.5, B: 1.5 }, ... }
    liveOdds: {},
    // Firestore 리스너
    unsubscribe: null,
    // 마지막 업데이트
    lastUpdated: null
};

// 배당률 설정 (1:1 베팅용) - H2H_CONFIG는 constants.js에서 정의됨
// 로컬 참조용 alias (기존 코드와 호환성 유지)
const H2H_ODDS_CONFIG = H2H_CONFIG;

// 🔒 네트워크 타임아웃 및 중복 클릭 방지
const H2H_NETWORK_TIMEOUT_MS = 30000; // 30초 타임아웃
let isH2HBettingInProgress = false; // 베팅 진행 중 플래그

// 타임아웃 적용 fetch 헬퍼
async function h2hFetchWithTimeout(url, options, timeoutMs = H2H_NETWORK_TIMEOUT_MS) {
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

// 시간 상수 - TIME_MS는 constants.js에서 정의됨
const H2H_TIME_CONSTANTS = {
    ONE_SECOND_MS: TIME_MS.SECOND,
    ONE_MINUTE_MS: TIME_MS.MINUTE,
    ONE_HOUR_MS: TIME_MS.HOUR,
    ONE_DAY_MS: TIME_MS.DAY
};
const H2H_ONE_HOUR_MS = TIME_MS.HOUR; // 하위 호환성

// 🔒 보안 강화: 서버 시간 동기화 (클라이언트/서버 시간 불일치 해결)
let h2hServerTimeOffset = 0; // 서버 시간 - 클라이언트 시간 (밀리초)

async function syncH2HServerTime() {
    try {
        const clientBefore = Date.now();
        const response = await fetch('/api/server-time');
        const clientAfter = Date.now();
        const data = await response.json();

        if (data.success) {
            // 네트워크 지연 보정 (요청 왕복 시간의 절반)
            const networkDelay = (clientAfter - clientBefore) / 2;
            const serverTime = data.timestamp;
            const clientTime = clientBefore + networkDelay;
            h2hServerTimeOffset = serverTime - clientTime;
            console.log(`1:1 베팅 서버 시간 동기화 완료: offset=${h2hServerTimeOffset}ms`);
        }
    } catch (error) {
        console.warn('1:1 베팅 서버 시간 동기화 실패:', error);
    }
}

// 서버 시간 기준 현재 시간 반환
function getH2HServerTime() {
    return new Date(Date.now() + h2hServerTimeOffset);
}

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initH2HBetting();
});

async function initH2HBetting() {
    // 🔒 서버 시간 동기화 (베팅 마감 시간 정확 검증)
    await syncH2HServerTime();

    // 레이스 정보 로드
    loadH2HRaceInfo();

    // 카운트다운 시작
    startH2HCountdown();

    // F1 API에서 드라이버 순위 로드
    loadDriverStandingsFromAPI();

    // 실시간 배당률 초기화
    initH2HLiveOdds();

    // 금액 입력 이벤트 리스너
    const amountInput = document.getElementById('h2hBetAmount');
    if (amountInput) {
        amountInput.addEventListener('input', onH2HAmountChange);
    }

    // Auth 상태 변경 리스너
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await updateH2HBalanceDisplay();
                await loadUserH2HBets();
                await loadPopularMatchups();
            } else {
                document.getElementById('h2hCurrentBalance').textContent = '0';
                document.getElementById('myH2HBetsList').innerHTML = '<p class="no-bets">로그인하여 베팅 내역을 확인하세요</p>';
            }
        });
    }
}

// ========================================
// 1:1 베팅 튜토리얼
// ========================================

function showH2HTutorial() {
    const modal = document.getElementById('h2hTutorialModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeH2HTutorial() {
    const modal = document.getElementById('h2hTutorialModal');
    const dontShowAgain = document.getElementById('h2hDontShowAgain');

    if (modal) {
        modal.classList.remove('active');
    }

    // "다시 보지 않기" 체크 시 저장
    if (dontShowAgain && dontShowAgain.checked) {
        localStorage.setItem('h2hTutorialSeen', 'true');
    }
}

function checkH2HFirstTimeVisitor() {
    const tutorialSeen = localStorage.getItem('h2hTutorialSeen');
    if (!tutorialSeen) {
        // 약간 딜레이 후 튜토리얼 표시
        setTimeout(() => {
            showH2HTutorial();
        }, 1000);
    }
}

// ========================================
// 실시간 배당률 (유저 베팅 기반)
// ========================================

// 🔒 무한 재시도 방지: 최대 재시도 횟수 및 지수 백오프
const H2H_LIVE_ODDS_MAX_RETRIES = 5;
let h2hLiveOddsRetryCount = 0;

async function initH2HLiveOdds() {
    // 로그인 안 했으면 실시간 배당률 비활성화
    if (!auth?.currentUser) {
        console.log('1:1 실시간 배당률: 로그인 필요');
        return;
    }

    if (!h2hState.raceId || typeof db === 'undefined') {
        // 🔒 최대 재시도 횟수 초과 시 중단
        if (h2hLiveOddsRetryCount >= H2H_LIVE_ODDS_MAX_RETRIES) {
            console.error('1:1 실시간 배당률 로드 실패: 최대 재시도 횟수 초과');
            if (typeof showToast === 'function') {
                showToast('실시간 배당률을 불러올 수 없습니다. 새로고침해주세요.', 'warning');
            }
            return;
        }

        console.log('1:1 실시간 배당률: 대기 중...');
        h2hLiveOddsRetryCount++;
        // 🔒 지수 백오프: 1초, 2초, 4초, 8초, 16초
        const backoffDelay = 1000 * Math.pow(2, h2hLiveOddsRetryCount - 1);
        setTimeout(() => {
            if (h2hState.raceId) {
                initH2HLiveOdds();
            }
        }, backoffDelay);
        return;
    }

    // 🔒 메모리 누수 방지: 이전 구독 해제 후 새 구독 시작
    if (h2hLiveOddsState.unsubscribe) {
        h2hLiveOddsState.unsubscribe();
        h2hLiveOddsState.unsubscribe = null;
    }

    try {
        // 현재 레이스의 모든 1:1 베팅을 실시간으로 구독
        h2hLiveOddsState.unsubscribe = db.collection('headToHeadBets')
            .where('raceId', '==', h2hState.raceId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                // 🔒 성공 시 재시도 카운터 리셋
                h2hLiveOddsRetryCount = 0;
                calculateH2HLiveOdds(snapshot);
                // 현재 선택된 매치업의 배당률 업데이트
                if (h2hState.selectedDrivers.A && h2hState.selectedDrivers.B) {
                    updateH2HLiveOddsDisplay();
                }
            }, (error) => {
                console.error('1:1 실시간 배당률 리스너 오류:', error);
                // 🔒 보안: 네트워크 오류 시 사용자에게 알림
                if (typeof showToast === 'function') {
                    if (error.code === 'unavailable' || error.code === 'failed-precondition') {
                        showToast('네트워크 연결이 불안정합니다. 배당률이 업데이트되지 않을 수 있습니다.', 'warning');
                    }
                }
                // 🔒 에러 시 재시도 (최대 횟수 제한)
                if (h2hLiveOddsRetryCount < H2H_LIVE_ODDS_MAX_RETRIES) {
                    h2hLiveOddsRetryCount++;
                    const backoffDelay = 1000 * h2hLiveOddsRetryCount;
                    setTimeout(() => initH2HLiveOdds(), backoffDelay);
                }
            });

        console.log('1:1 실시간 배당률 리스너 시작');
    } catch (error) {
        console.error('1:1 실시간 배당률 초기화 실패:', error);
        // 🔒 예외 시 재시도
        if (h2hLiveOddsRetryCount < H2H_LIVE_ODDS_MAX_RETRIES) {
            h2hLiveOddsRetryCount++;
            const backoffDelay = 1000 * h2hLiveOddsRetryCount;
            setTimeout(() => initH2HLiveOdds(), backoffDelay);
        }
    }
}

function calculateH2HLiveOdds(snapshot) {
    // 매치업별 베팅 풀 초기화
    h2hLiveOddsState.matchupPools = {};

    snapshot.forEach(doc => {
        const bet = doc.data();
        const matchupId = bet.matchupId;
        if (!matchupId) return;

        // 매치업 풀 초기화
        if (!h2hLiveOddsState.matchupPools[matchupId]) {
            h2hLiveOddsState.matchupPools[matchupId] = {
                total: 0,
                // 드라이버 번호별 베팅 금액
                drivers: {}
            };
        }

        const pool = h2hLiveOddsState.matchupPools[matchupId];
        const predictedWinner = bet.predictedWinner; // 드라이버 번호
        const amount = bet.betAmount || 0;

        pool.total += amount;
        pool.drivers[predictedWinner] = (pool.drivers[predictedWinner] || 0) + amount;
    });

    // 각 매치업의 실시간 배당률 계산
    h2hLiveOddsState.liveOdds = {};

    Object.entries(h2hLiveOddsState.matchupPools).forEach(([matchupId, pool]) => {
        if (pool.total === 0) return;

        const parts = matchupId.split('_');
        // 🔒 matchupId 형식 검증
        if (parts.length !== 2) {
            console.warn('잘못된 matchupId 형식:', matchupId);
            return;
        }
        const [numA, numB] = parts.map(Number);
        if (isNaN(numA) || isNaN(numB)) {
            console.warn('잘못된 드라이버 번호:', matchupId);
            return;
        }
        // 🔒 보안: 드라이버 번호 범위 검증 (H-18)
        if (numA < 1 || numA > 99 || numB < 1 || numB > 99) {
            console.warn('드라이버 번호 범위 초과:', matchupId);
            return;
        }
        const payoutPool = pool.total * (1 - H2H_ODDS_CONFIG.HOUSE_EDGE);

        const poolA = pool.drivers[numA] || 0;
        const poolB = pool.drivers[numB] || 0;

        // 배당률 계산: 총 지급 풀 / 해당 드라이버 베팅 풀
        let oddsA, oddsB;

        if (poolA > 0) {
            oddsA = payoutPool / poolA;
            oddsA = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsA));
        } else {
            // 아무도 베팅하지 않은 드라이버는 기본 배당률 사용
            oddsA = getBaseOddsForMatchup(numA, numB, numA);
        }

        if (poolB > 0) {
            oddsB = payoutPool / poolB;
            oddsB = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsB));
        } else {
            oddsB = getBaseOddsForMatchup(numA, numB, numB);
        }

        h2hLiveOddsState.liveOdds[matchupId] = {
            [numA]: Math.round(oddsA * 100) / 100,
            [numB]: Math.round(oddsB * 100) / 100,
            poolA: poolA,
            poolB: poolB,
            total: pool.total
        };
    });

    h2hLiveOddsState.lastUpdated = new Date();
}

// 특정 매치업의 기본 배당률 계산 (베팅 없을 때)
function getBaseOddsForMatchup(driverNumA, driverNumB, targetDriverNum) {
    const rankA = getDriverSeasonRank(driverNumA);
    const rankB = getDriverSeasonRank(driverNumB);
    const oddsA = getOddsFromRank(rankA);
    const oddsB = getOddsFromRank(rankB);

    const { oddsForA, oddsForB } = calculateDynamicOdds(rankA, rankB, oddsA, oddsB);

    return targetDriverNum === driverNumA ? oddsForA : oddsForB;
}

// 현재 선택된 매치업의 실시간 배당률 가져오기
function getH2HLiveOdds(driverNumA, driverNumB) {
    const nums = [driverNumA, driverNumB].sort((a, b) => a - b);
    const matchupId = `${nums[0]}_${nums[1]}`;

    const liveOdds = h2hLiveOddsState.liveOdds[matchupId];

    if (liveOdds) {
        // driverNumA가 정렬된 배열의 첫 번째면 poolA, 아니면 poolB
        const isAFirst = driverNumA === nums[0];
        return {
            oddsA: isAFirst ? liveOdds[nums[0]] : liveOdds[nums[1]],
            oddsB: isAFirst ? liveOdds[nums[1]] : liveOdds[nums[0]],
            poolA: isAFirst ? liveOdds.poolA : liveOdds.poolB,
            poolB: isAFirst ? liveOdds.poolB : liveOdds.poolA,
            total: liveOdds.total,
            isLive: true
        };
    }

    // 실시간 데이터 없으면 기본 배당률 계산
    return null;
}

// 실시간 배당률로 UI 업데이트
function updateH2HLiveOddsDisplay() {
    const driverA = h2hState.selectedDrivers.A;
    const driverB = h2hState.selectedDrivers.B;

    if (!driverA || !driverB) return;

    const liveData = getH2HLiveOdds(driverA.number, driverB.number);

    if (liveData && liveData.isLive) {
        // 실시간 배당률 적용
        h2hState.currentOdds.A = liveData.oddsA;
        h2hState.currentOdds.B = liveData.oddsB;
    }
    // 실시간 데이터 없으면 기존 calculateH2HOdds()가 계산한 값 유지

    // UI 업데이트
    updateH2HOddsDisplay();
    updateH2HSummary();
}

// ========================================
// F1 API 드라이버 순위 로드
// ========================================

function loadDriverStandingsFromAPI() {
    const container = document.getElementById('driverStandingsList');
    const updateTimeEl = document.getElementById('standingsUpdateTime');

    if (!container) return;

    // 2026 시즌 전: F1_DRIVERS_2026 데이터로 드라이버 목록 표시
    // 시즌 시작 후 API 데이터가 있으면 그때 전환

    // 🔒 보안: escapeHtml 적용 (정적 데이터지만 방어적 코딩)
    // 팀 순서대로 정렬된 드라이버 목록 표시
    container.innerHTML = F1_DRIVERS_2026.map((driver, index) => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(driver.name) : driver.name;
        const safeTeam = typeof escapeHtml === 'function' ? escapeHtml(driver.team) : driver.team;
        return `
            <div class="standing-item" onclick="quickSelectDriver(${driver.number})" title="클릭하여 선택">
                <span class="standing-rank">#${driver.number}</span>
                <div class="standing-driver-info">
                    <span class="standing-driver-name" style="border-left-color: ${driver.teamColor}">
                        ${safeName}
                    </span>
                    <span class="standing-team">${safeTeam}</span>
                </div>
                <div class="standing-stats">
                    <span class="standing-points">-</span>
                    <span class="standing-points-label">PTS</span>
                </div>
            </div>
        `;
    }).join('');

    // 업데이트 시간 표시
    if (updateTimeEl) {
        updateTimeEl.textContent = '시즌 전';
    }
}

// 순위 클릭 시 빠른 드라이버 선택
function quickSelectDriver(driverNumber) {
    // 빈 슬롯에 드라이버 선택
    if (!h2hState.selectedDrivers.A) {
        selectH2HDriver('A', driverNumber);
    } else if (!h2hState.selectedDrivers.B) {
        if (h2hState.selectedDrivers.A.number !== driverNumber) {
            selectH2HDriver('B', driverNumber);
        }
    } else {
        // 둘 다 선택된 경우 A를 교체
        selectH2HDriver('A', driverNumber);
    }
}

// ========================================
// 탭 전환
// ========================================

function switchBettingType(type) {
    // 탭 활성화 상태 변경
    const tabs = document.querySelectorAll('.betting-type-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    // 섹션 표시/숨김
    const podiumSection = document.getElementById('podiumBettingSection');
    const h2hSection = document.getElementById('h2hBettingSection');

    // 모든 섹션 비활성화
    podiumSection.classList.remove('active');
    h2hSection.classList.remove('active');

    if (type === 'podium') {
        podiumSection.classList.add('active');
    } else if (type === 'h2h') {
        h2hSection.classList.add('active');
        // 1:1 베팅 섹션 활성화 시 데이터 로드
        loadPopularMatchups();
        // 처음 방문자 튜토리얼 체크
        checkH2HFirstTimeVisitor();
    }
}

// ========================================
// 레이스 정보
// ========================================

function loadH2HRaceInfo() {
    const result = getNextRace();

    // 레이스 정보가 없으면 에러 처리
    if (!result || !result.race) {
        console.warn('1:1 베팅: 레이스 정보를 찾을 수 없습니다.');
        const raceNameEl = document.getElementById('h2hRaceName');
        const circuitEl = document.getElementById('h2hRaceCircuit');
        if (raceNameEl) raceNameEl.textContent = '레이스 정보 없음';
        if (circuitEl) circuitEl.textContent = '';
        return;
    }

    const { race, index } = result;
    const raceDate = new Date(race.date);

    h2hState.raceId = `race_${index + 1}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;
    h2hState.raceName = race.name;

    const raceNameEl = document.getElementById('h2hRaceName');
    const circuitEl = document.getElementById('h2hRaceCircuit');

    if (raceNameEl) raceNameEl.textContent = race.name;
    if (circuitEl) circuitEl.textContent = race.circuit;
}

function startH2HCountdown() {
    updateH2HCountdown();
    setInterval(updateH2HCountdown, 1000);
}

function updateH2HCountdown() {
    const { race } = getNextRace();
    const raceDate = new Date(race.date);
    // 🔒 서버 시간 기준으로 카운트다운
    const now = getH2HServerTime();
    const diff = raceDate - now;

    const countdownEl = document.getElementById('h2hTimeLeft');
    const betBtn = document.getElementById('h2hPlaceBetBtn');

    if (!countdownEl) return;

    if (diff <= 0) {
        countdownEl.textContent = '베팅 마감';
        countdownEl.classList.add('closed');
        if (betBtn) {
            betBtn.disabled = true;
            betBtn.textContent = '베팅 마감';
        }
        return;
    }

    const days = Math.floor(diff / H2H_TIME_CONSTANTS.ONE_DAY_MS);
    const hours = Math.floor((diff % H2H_TIME_CONSTANTS.ONE_DAY_MS) / H2H_TIME_CONSTANTS.ONE_HOUR_MS);
    const minutes = Math.floor((diff % H2H_TIME_CONSTANTS.ONE_HOUR_MS) / H2H_TIME_CONSTANTS.ONE_MINUTE_MS);
    const seconds = Math.floor((diff % H2H_TIME_CONSTANTS.ONE_MINUTE_MS) / H2H_TIME_CONSTANTS.ONE_SECOND_MS);

    if (days > 0) {
        countdownEl.textContent = `${days}일 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        countdownEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// ========================================
// 잔액 표시
// ========================================

async function updateH2HBalanceDisplay() {
    const userData = await getUserTokens();
    if (userData) {
        const balanceEl = document.getElementById('h2hCurrentBalance');
        if (balanceEl) {
            balanceEl.textContent = userData.tokens.toLocaleString();
        }
    }
}

// ========================================
// 드라이버 선택
// ========================================

function openH2HDriverPicker(slot) {
    h2hState.currentPickerSlot = slot;

    const modal = document.getElementById('h2hDriverPickerModal');
    const titleEl = document.getElementById('h2hPickerTitle');
    const container = document.getElementById('h2hPickerTeams');

    if (!modal || !container) return;

    // 제목 업데이트
    titleEl.textContent = slot === 'A' ? '드라이버 A 선택' : '드라이버 B 선택';

    // 이미 선택된 드라이버 확인
    const otherSlot = slot === 'A' ? 'B' : 'A';
    const otherDriver = h2hState.selectedDrivers[otherSlot];

    // 팀별로 드라이버 그룹화
    const teams = {};
    F1_DRIVERS_2026.forEach(driver => {
        if (!teams[driver.team]) {
            teams[driver.team] = {
                color: driver.teamColor,
                drivers: []
            };
        }
        teams[driver.team].drivers.push(driver);
    });

    // 🔒 보안: XSS 방지를 위해 escapeHtml 적용
    container.innerHTML = Object.entries(teams).map(([team, data]) => {
        const safeTeam = typeof escapeHtml === 'function' ? escapeHtml(team) : team;
        const safeColor = data.color && /^#[0-9A-Fa-f]{6}$/.test(data.color) ? data.color : '#ffffff';

        return `
        <div class="picker-team">
            <div class="picker-team-header" style="border-left-color: ${safeColor}">
                ${safeTeam}
            </div>
            <div class="picker-drivers">
                ${data.drivers.map(d => {
                    const driverRank = getDriverSeasonRank(d.number);
                    const isSameDriver = otherDriver && d.number === otherDriver.number;
                    const isDisabled = isSameDriver;

                    // API 순위 기반 배당률 사용
                    const baseOdds = getOddsFromRank(driverRank);

                    // 상대가 선택된 경우 예상 배당률 계산
                    let previewOdds = null;
                    if (otherDriver) {
                        previewOdds = calculatePreviewOdds(d.number, otherDriver.number, slot);
                    }

                    // 표시할 배당률 결정
                    const displayOdds = previewOdds || baseOdds;
                    const oddsClass = displayOdds < H2H_ODDS_CONFIG.LOW_ODDS_THRESHOLD ? 'low-odds' : displayOdds >= 3.0 ? 'high-odds' : '';

                    // 🔒 보안: 드라이버 이름 escapeHtml 적용
                    const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;

                    return `
                        <button class="picker-driver-btn ${isDisabled ? 'disabled' : ''}"
                                data-number="${d.number}"
                                onclick="${isDisabled ? '' : `selectH2HDriver('${slot}', ${d.number})`}"
                                ${isDisabled ? 'disabled' : ''}
                                title="시즌 ${driverRank}위">
                            <span class="driver-num" style="color: ${safeColor}">#${d.number}</span>
                            <span class="driver-name">${safeName}</span>
                            <span class="driver-rank-badge">시즌 ${driverRank}위</span>
                            <span class="driver-odds ${oddsClass}">${displayOdds.toFixed(2)}x</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    }).join('');

    modal.classList.add('active');
}

// 예상 배당률 미리보기 계산
function calculatePreviewOdds(driverNumber, otherDriverNumber, slot) {
    const driver = getDriverByNumber(driverNumber);
    const otherDriver = getDriverByNumber(otherDriverNumber);
    if (!driver || !otherDriver) return null;

    // 실시간 배당률 먼저 확인
    const driverA = slot === 'A' ? driverNumber : otherDriverNumber;
    const driverB = slot === 'A' ? otherDriverNumber : driverNumber;
    const liveData = getH2HLiveOdds(driverA, driverB);

    if (liveData && liveData.isLive) {
        // 실시간 배당률 사용
        return slot === 'A' ? liveData.oddsA : liveData.oddsB;
    }

    // 실시간 데이터 없으면 기본 배당률 계산
    const rankA = slot === 'A' ? getDriverSeasonRank(driverNumber) : getDriverSeasonRank(otherDriverNumber);
    const rankB = slot === 'A' ? getDriverSeasonRank(otherDriverNumber) : getDriverSeasonRank(driverNumber);

    const oddsA = getOddsFromRank(rankA);
    const oddsB = getOddsFromRank(rankB);

    const { oddsForA, oddsForB } = calculateDynamicOdds(rankA, rankB, oddsA, oddsB);

    return slot === 'A' ? oddsForA : oddsForB;
}

function closeH2HDriverPicker() {
    const modal = document.getElementById('h2hDriverPickerModal');
    if (modal) {
        modal.classList.remove('active');
    }
    h2hState.currentPickerSlot = null;
}

function selectH2HDriver(slot, driverNumber) {
    const driver = getDriverByNumber(driverNumber);
    if (!driver) return;

    // 같은 드라이버를 양쪽에 선택할 수 없음
    const otherSlot = slot === 'A' ? 'B' : 'A';
    if (h2hState.selectedDrivers[otherSlot] && h2hState.selectedDrivers[otherSlot].number === driverNumber) {
        showAlert('동일한 드라이버를 양쪽에 선택할 수 없습니다.', 'warning', '중복 선택');
        return;
    }

    // 드라이버 정보와 시즌 랭크 가져오기
    const seasonRank = getDriverSeasonRank(driverNumber);

    h2hState.selectedDrivers[slot] = {
        number: driver.number,
        name: driver.name,
        team: driver.team,
        teamColor: driver.teamColor,
        seasonRank: seasonRank
    };

    // UI 업데이트
    updateVSDriverSlot(slot, driver, seasonRank);

    // 양쪽 모두 선택되었으면 배당률 계산
    if (h2hState.selectedDrivers.A && h2hState.selectedDrivers.B) {
        calculateH2HOdds();
        showH2HBettingPanel();
        showMatchupMessage(); // UX 메시지 표시
    }

    closeH2HDriverPicker();
}

// 매치업에 따른 UX 메시지 표시
function showMatchupMessage() {
    const driverA = h2hState.selectedDrivers.A;
    const driverB = h2hState.selectedDrivers.B;
    if (!driverA || !driverB) return;

    const rankDiff = Math.abs(driverA.seasonRank - driverB.seasonRank);
    const underdog = driverA.seasonRank > driverB.seasonRank ? driverA : driverB;
    const favorite = driverA.seasonRank > driverB.seasonRank ? driverB : driverA;

    let message = '';
    let messageType = 'info';

    if (rankDiff >= 15) {
        message = `🔥 역전의 용사에게 베팅하시겠습니까?\n${underdog.name}이(가) ${favorite.name}을(를) 이기면 최대 ${H2H_ODDS_CONFIG.MAX_ODDS}배!`;
        messageType = 'info';
    } else if (rankDiff >= 10) {
        message = `⚡ 다윗 vs 골리앗!\n${underdog.name}의 대역전 배당률이 높습니다!`;
        messageType = 'info';
    } else if (rankDiff >= 5) {
        message = `🎯 흥미로운 매치업입니다!\n${underdog.name} vs ${favorite.name}`;
        messageType = 'info';
    }

    if (message) {
        // 매치업 메시지 표시 (옵션)
        const messageEl = document.getElementById('h2hMatchupMessage');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = `h2h-matchup-message ${messageType}`;
            messageEl.style.display = 'block';
        }
    }
}

function getDriverSeasonRank(driverNumber) {
    // API 데이터가 있으면 실제 순위 사용
    if (h2hState.apiDriverStandings && h2hState.apiDriverStandings.length > 0) {
        // 먼저 드라이버 번호로 매칭 시도
        let standing = h2hState.apiDriverStandings.find(s =>
            parseInt(s.driver.number) === parseInt(driverNumber)
        );

        // 번호 매칭 실패시 이름으로 매칭 시도
        if (!standing) {
            const driver = getDriverByNumber(driverNumber);
            if (driver) {
                const lastName = driver.name.split(' ').pop().toLowerCase();
                standing = h2hState.apiDriverStandings.find(s =>
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

    // API 데이터가 없거나 매칭 실패시 폴백 데이터에서 찾기
    const fallbackStandings = F1_API.getFallbackDriverStandings();
    const fallbackStanding = fallbackStandings.find(s =>
        parseInt(s.driver.number) === parseInt(driverNumber)
    );
    if (fallbackStanding) {
        return fallbackStanding.position;
    }

    // 그래도 못 찾으면 마지막 순위 반환
    return 22;
}

// API 순위 기반 배당률 계산
// 순위에 따라 배당률을 동적으로 계산 (1위: 1.3x ~ 22위: 15x)
function getOddsFromRank(rank) {
    // 순위 범위 제한 (1-22)
    const safeRank = Math.max(1, Math.min(22, rank));

    // 지수적 배당률 계산 (상위권은 낮은 배당, 하위권은 높은 배당)
    // 1위: ~1.3x, 5위: ~2.0x, 10위: ~3.5x, 15위: ~6.5x, 20위: ~11x, 22위: ~15x
    const baseOdds = 1.3;
    const growthFactor = 0.12; // 순위당 증가율 (15x 맞추기 위해 조정)

    const odds = baseOdds * Math.pow(1 + growthFactor, safeRank - 1);

    // 범위 제한: MIN_ODDS ~ MAX_ODDS (1.05x ~ 15x)
    return Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, odds));
}

// 드라이버 포인트 가져오기 (API 데이터)
function getDriverPoints(driverNumber) {
    if (h2hState.apiDriverStandings && h2hState.apiDriverStandings.length > 0) {
        const standing = h2hState.apiDriverStandings.find(s =>
            parseInt(s.driver.number) === parseInt(driverNumber)
        );
        if (standing) {
            return standing.points;
        }
    }
    return 0;
}

function updateVSDriverSlot(slot, driver, seasonRank) {
    const slotEl = document.getElementById(`vsDriver${slot}`);
    if (!slotEl) return;

    // API에서 포인트 가져오기
    const points = getDriverPoints(driver.number);

    slotEl.classList.add('selected');
    slotEl.innerHTML = `
        <div class="vs-driver-info">
            <span class="driver-number" style="color: ${driver.teamColor}">#${driver.number}</span>
            <span class="driver-name">${driver.name}</span>
            <span class="driver-team">${driver.team} · P${seasonRank}</span>
        </div>
    `;
}

// ========================================
// 배당률 계산
// ========================================

// 동적 배당률 계산 핵심 함수
// 순위 차이 기반 승률 계산 후 배당률 산출
function calculateDynamicOdds(rankA, rankB, baseOddsA, baseOddsB) {
    // 순위 차이 계산 (양수: A가 낮은 순위 = A가 약팀)
    const rankDiff = rankA - rankB;

    // 순위 차이에 따른 승률 계산 (로지스틱 함수 사용)
    // k값이 클수록 순위 차이에 민감하게 반응
    const k = 0.15; // 순위당 승률 변화 계수

    // 시그모이드 함수로 A의 승률 계산
    // rankDiff > 0이면 A가 약팀이므로 승률 감소
    // rankDiff < 0이면 A가 강팀이므로 승률 증가
    const probA = 1 / (1 + Math.exp(k * rankDiff));
    const probB = 1 - probA;

    // 하우스 엣지 적용한 배당률 계산
    // 배당률 = 1 / (승률 * (1 + 마진))
    const margin = 1 + H2H_ODDS_CONFIG.HOUSE_EDGE;

    let oddsA = 1 / (probA * margin);
    let oddsB = 1 / (probB * margin);

    // 범위 제한
    oddsA = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsA));
    oddsB = Math.max(H2H_ODDS_CONFIG.MIN_ODDS, Math.min(H2H_ODDS_CONFIG.MAX_ODDS, oddsB));

    // 소수점 2자리로 반올림
    oddsA = Math.round(oddsA * 100) / 100;
    oddsB = Math.round(oddsB * 100) / 100;

    return { oddsForA: oddsA, oddsForB: oddsB };
}

function calculateH2HOdds() {
    const driverA = h2hState.selectedDrivers.A;
    const driverB = h2hState.selectedDrivers.B;

    if (!driverA || !driverB) return;

    // 먼저 실시간 배당률 확인
    const liveData = getH2HLiveOdds(driverA.number, driverB.number);

    if (liveData && liveData.isLive) {
        // 실시간 배당률 사용
        h2hState.currentOdds.A = liveData.oddsA;
        h2hState.currentOdds.B = liveData.oddsB;
    } else {
        // 실시간 데이터 없으면 기본 배당률 계산
        const baseOddsA = getOddsFromRank(driverA.seasonRank);
        const baseOddsB = getOddsFromRank(driverB.seasonRank);

        const { oddsForA, oddsForB } = calculateDynamicOdds(
            driverA.seasonRank,
            driverB.seasonRank,
            baseOddsA,
            baseOddsB
        );

        h2hState.currentOdds.A = Math.round(oddsForA * 100) / 100;
        h2hState.currentOdds.B = Math.round(oddsForB * 100) / 100;
    }

    // UI 업데이트
    updateH2HOddsDisplay();
}

function updateH2HOddsDisplay() {
    const driverA = h2hState.selectedDrivers.A;
    const driverB = h2hState.selectedDrivers.B;

    // 배당률 표시 업데이트
    const driverNameA = document.getElementById('oddsDriverA');
    const driverNameB = document.getElementById('oddsDriverB');
    const oddsValueA = document.getElementById('oddsValueA');
    const oddsValueB = document.getElementById('oddsValueB');

    if (driverNameA) driverNameA.textContent = driverA ? driverA.name : '-';
    if (driverNameB) driverNameB.textContent = driverB ? driverB.name : '-';

    if (oddsValueA) {
        const newOddsA = h2hState.currentOdds.A ? `${h2hState.currentOdds.A.toFixed(2)}x` : '-';
        if (oddsValueA.textContent !== newOddsA) {
            oddsValueA.textContent = newOddsA;
            animateOddsChange(oddsValueA, h2hState.currentOdds.A);
        }
    }

    if (oddsValueB) {
        const newOddsB = h2hState.currentOdds.B ? `${h2hState.currentOdds.B.toFixed(2)}x` : '-';
        if (oddsValueB.textContent !== newOddsB) {
            oddsValueB.textContent = newOddsB;
            animateOddsChange(oddsValueB, h2hState.currentOdds.B);
        }
    }

    // 배당률에 따른 클래스 추가 (색상 변경)
    const oddsItemA = document.getElementById('oddsItemA');
    const oddsItemB = document.getElementById('oddsItemB');

    if (oddsItemA) {
        oddsItemA.classList.remove('low-odds', 'high-odds', 'normal-odds');
        if (h2hState.currentOdds.A < H2H_ODDS_CONFIG.LOW_ODDS_THRESHOLD) {
            oddsItemA.classList.add('low-odds');
        } else if (h2hState.currentOdds.A >= 3.0) {
            oddsItemA.classList.add('high-odds');
        } else {
            oddsItemA.classList.add('normal-odds');
        }
    }

    if (oddsItemB) {
        oddsItemB.classList.remove('low-odds', 'high-odds', 'normal-odds');
        if (h2hState.currentOdds.B < H2H_ODDS_CONFIG.LOW_ODDS_THRESHOLD) {
            oddsItemB.classList.add('low-odds');
        } else if (h2hState.currentOdds.B >= 3.0) {
            oddsItemB.classList.add('high-odds');
        } else {
            oddsItemB.classList.add('normal-odds');
        }
    }

    // 승자 버튼 이름 업데이트
    const winnerNameA = document.getElementById('winnerNameA');
    const winnerNameB = document.getElementById('winnerNameB');
    if (winnerNameA) winnerNameA.textContent = driverA ? driverA.name : '-';
    if (winnerNameB) winnerNameB.textContent = driverB ? driverB.name : '-';
}

// 배당률 변경 애니메이션
function animateOddsChange(element, odds) {
    // 배당률에 따른 글로우 효과
    element.classList.remove('odds-glow-low', 'odds-glow-high', 'odds-glow-normal');

    if (odds < H2H_ODDS_CONFIG.LOW_ODDS_THRESHOLD) {
        element.classList.add('odds-glow-low');
    } else if (odds >= 5.0) {
        element.classList.add('odds-glow-high');
    } else {
        element.classList.add('odds-glow-normal');
    }

    // 펄스 애니메이션
    element.classList.add('odds-pulse');
    setTimeout(() => {
        element.classList.remove('odds-pulse');
    }, 600);
}

function showH2HBettingPanel() {
    const panel = document.getElementById('h2hBettingPanel');
    if (panel) {
        panel.style.display = 'block';
    }
}

// ========================================
// 승자 선택
// ========================================

function selectH2HWinner(winner) {
    h2hState.predictedWinner = winner;

    // 버튼 활성화 상태 업데이트
    const btnA = document.getElementById('winnerBtnA');
    const btnB = document.getElementById('winnerBtnB');
    const oddsItemA = document.getElementById('oddsItemA');
    const oddsItemB = document.getElementById('oddsItemB');

    btnA.classList.toggle('selected', winner === 'A');
    btnB.classList.toggle('selected', winner === 'B');
    oddsItemA.classList.toggle('selected', winner === 'A');
    oddsItemB.classList.toggle('selected', winner === 'B');

    // 요약 업데이트
    updateH2HSummary();
}

// ========================================
// 금액 입력
// ========================================

function onH2HAmountChange() {
    const input = document.getElementById('h2hBetAmount');
    if (!input) return;

    let value = parseInt(input.value) || 0;

    // 최대 1000 AMR만 제한 (잔액 체크는 베팅 시 수행)
    value = Math.min(Math.max(0, value), 1000);

    h2hState.betAmount = value;
    updateH2HSummary();
}

function addH2HQuickAmount(amount) {
    const input = document.getElementById('h2hBetAmount');
    if (!input) return;

    const balance = parseInt(document.getElementById('h2hCurrentBalance').textContent.replace(/,/g, '')) || 0;
    const currentValue = parseInt(input.value) || 0;

    let newValue;
    if (amount === 'max') {
        // MAX 버튼은 잔액까지만
        newValue = Math.min(balance, 1000);
    } else {
        // 일반 버튼은 1000까지 허용 (잔액 체크는 베팅 시 수행)
        newValue = Math.min(currentValue + amount, 1000);
    }

    input.value = newValue;
    h2hState.betAmount = newValue;
    updateH2HSummary();
}

function updateH2HSummary() {
    const betDisplay = document.getElementById('h2hBetDisplay');
    const oddsDisplay = document.getElementById('h2hOddsDisplay');
    const potentialWin = document.getElementById('h2hPotentialWin');

    if (!betDisplay || !oddsDisplay || !potentialWin) return;

    betDisplay.textContent = `${h2hState.betAmount.toLocaleString()} AMR`;

    if (h2hState.predictedWinner) {
        const odds = h2hState.currentOdds[h2hState.predictedWinner];
        oddsDisplay.textContent = `${odds.toFixed(2)}x`;

        const winAmount = Math.floor(h2hState.betAmount * odds);
        potentialWin.textContent = `${winAmount.toLocaleString()} AMR`;
    } else {
        oddsDisplay.textContent = '-';
        potentialWin.textContent = '0 AMR';
    }
}

// ========================================
// 베팅 실행
// ========================================

async function placeH2HBet() {
    // 🔒 중복 클릭 방지
    if (isH2HBettingInProgress) {
        showAlert('베팅이 처리 중입니다. 잠시만 기다려주세요.', 'info', '처리 중');
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        showAlert('로그인이 필요합니다.', 'warning', '로그인 필요');
        return;
    }

    // 검증
    if (!h2hState.selectedDrivers.A || !h2hState.selectedDrivers.B) {
        showAlert('두 명의 드라이버를 선택해주세요.', 'warning', '드라이버 선택');
        return;
    }

    if (!h2hState.predictedWinner) {
        showAlert('승자를 예측해주세요.', 'warning', '승자 선택');
        return;
    }

    // 🔒 보안: 기본 금액 검증 + 정수 검증 (H-8)
    if (!Number.isInteger(h2hState.betAmount) || h2hState.betAmount < 1 || h2hState.betAmount > 1000) {
        showAlert('베팅 금액은 1~1000 AMR 범위의 정수여야 합니다.', 'warning', '금액 오류');
        return;
    }

    // 잔액 체크 (빠른 피드백)
    const currentBalance = parseInt(document.getElementById('h2hCurrentBalance').textContent.replace(/,/g, '')) || 0;
    if (currentBalance < h2hState.betAmount) {
        showAlert(`코인이 부족합니다!\n\n보유: ${currentBalance.toLocaleString()} AMR\n베팅: ${h2hState.betAmount.toLocaleString()} AMR\n\n마이페이지에서 출석체크로 코인을 획득하세요.`, 'error', '토큰 부족');
        return;
    }

    const { race } = getNextRace();
    const raceDate = new Date(race.date);
    // 🔒 서버 시간 기준으로 마감 검증
    if (getH2HServerTime() >= raceDate) {
        showAlert('베팅이 마감되었습니다.', 'error', '베팅 마감');
        return;
    }

    const betAmount = h2hState.betAmount;
    const predictedWinnerDriver = h2hState.selectedDrivers[h2hState.predictedWinner];

    const btn = document.getElementById('h2hPlaceBetBtn');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    isH2HBettingInProgress = true;

    try {
        // ✅ 서버 API 호출 (보안 강화 - 클라이언트 직접 Firestore 쓰기 제거)
        // 🔒 네트워크 타임아웃 적용
        const idToken = await user.getIdToken();
        const response = await h2hFetchWithTimeout('/api/bet/h2h', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raceId: h2hState.raceId,
                raceName: h2hState.raceName,
                matchup: {
                    driverA: h2hState.selectedDrivers.A,
                    driverB: h2hState.selectedDrivers.B
                },
                predictedWinner: predictedWinnerDriver.number,
                betAmount: betAmount
                // odds는 서버에서 계산 (클라이언트 값 무시)
            })
        });

        // 🔒 보안: JSON 파싱 에러 처리 (H-11)
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('H2H 베팅 응답 JSON 파싱 실패:', parseError);
            throw new Error('서버 응답을 처리할 수 없습니다.');
        }

        if (!response.ok) {
            throw new Error(data.error || '베팅 실패');
        }

        // 성공 처리
        await updateH2HBalanceDisplay();
        await updateBalanceDisplay();
        await updateTokenDisplay();
        await loadUserH2HBets();
        await loadPopularMatchups();

        // 성공 메시지 (서버에서 계산된 배당률 사용)
        const serverOdds = data.odds;
        const potentialWin = data.potentialWin;

        let successMessage = `베팅 완료!\n${betAmount} AMR을 베팅했습니다.`;
        if (serverOdds >= 3.0) {
            successMessage += `\n\n🔥 역전의 용사에게 베팅! 당첨 시 ${potentialWin} AMR!`;
        } else if (serverOdds >= 2.0) {
            successMessage += `\n\n예상 당첨: ${potentialWin} AMR`;
        }

        resetH2HBettingForm();

        showAlert(successMessage, 'success', '베팅 성공');
    } catch (error) {
        const msg = error.message || '';
        if (msg.includes('부족')) {
            showAlert('코인이 부족합니다!\n마이페이지에서 출석체크로 코인을 획득하세요.', 'error', '토큰 부족');
        } else if (msg.includes('사용자')) {
            showAlert('사용자 정보를 찾을 수 없습니다.', 'error', '오류');
        } else if (msg.includes('마감')) {
            showAlert('베팅이 마감되었습니다.', 'error', '베팅 마감');
        } else if (msg.includes('낮은 배당률')) {
            showAlert(msg, 'warning', '베팅 제한');
        } else if (msg.includes('시간이 초과')) {
            showAlert('요청 시간이 초과되었습니다.\n네트워크 상태를 확인 후 다시 시도해주세요.', 'error', '타임아웃');
        } else if (isNetworkError(error)) {
            showAlert('인터넷 연결을 확인해주세요', 'error', '네트워크 오류');
        } else {
            console.error('1:1 베팅 실패:', error);
            showAlert(msg || '베팅에 실패했습니다.\n다시 시도해주세요.', 'error', '베팅 실패');
        }
    }

    btn.disabled = false;
    btn.textContent = '베팅하기';
    isH2HBettingInProgress = false;
}

function resetH2HBettingForm() {
    // 상태 초기화
    h2hState.selectedDrivers = { A: null, B: null };
    h2hState.predictedWinner = null;
    h2hState.betAmount = 0;
    h2hState.currentOdds = { A: 0, B: 0 };

    // VS 슬롯 초기화
    ['A', 'B'].forEach(slot => {
        const slotEl = document.getElementById(`vsDriver${slot}`);
        if (slotEl) {
            slotEl.classList.remove('selected');
            slotEl.innerHTML = `
                <div class="vs-driver-placeholder">
                    <span class="vs-select-text">드라이버 선택</span>
                    <span class="vs-select-hint">클릭하여 선택</span>
                </div>
            `;
        }
    });

    // 베팅 패널 숨기기
    const panel = document.getElementById('h2hBettingPanel');
    if (panel) {
        panel.style.display = 'none';
    }

    // 금액 입력 초기화
    const input = document.getElementById('h2hBetAmount');
    if (input) {
        input.value = '';
    }

    // 버튼 상태 초기화
    ['A', 'B'].forEach(slot => {
        document.getElementById(`winnerBtn${slot}`)?.classList.remove('selected');
        document.getElementById(`oddsItem${slot}`)?.classList.remove('selected');
        document.getElementById(`oddsItem${slot}`)?.classList.remove('low-odds', 'high-odds', 'normal-odds');
    });

    // UX 메시지 숨기기
    const matchupMessage = document.getElementById('h2hMatchupMessage');
    if (matchupMessage) {
        matchupMessage.style.display = 'none';
        matchupMessage.textContent = '';
    }

    updateH2HSummary();
}

// ========================================
// 인기 매치업 로드
// ========================================

// 매치업 아이템 렌더링 헬퍼 함수
function renderMatchupItem(data, rank) {
    const totalAmount = data.totalBetAmount || 0;
    const amountText = totalAmount >= 1000
        ? `${(totalAmount / 1000).toFixed(1)}K`
        : totalAmount.toLocaleString();

    return `
        <div class="matchup-item" onclick="selectPopularMatchup('${data.driverA.number}', '${data.driverB.number}')">
            <span class="matchup-rank">${rank}</span>
            <div class="matchup-drivers">
                <span class="matchup-driver-a">${data.driverA.name}</span>
                <span class="matchup-vs">vs</span>
                <span class="matchup-driver-b">${data.driverB.name}</span>
            </div>
            <div class="matchup-stats">
                <span class="matchup-amount">${amountText} AMR</span>
                <span class="matchup-count">${data.totalBets || 0}건</span>
            </div>
        </div>
    `;
}

async function loadPopularMatchups() {
    const container = document.getElementById('popularMatchupsList');
    if (!container) return;

    if (!h2hState.raceId) {
        container.innerHTML = '<p class="no-matchups">레이스 정보를 불러오는 중...</p>';
        return;
    }

    try {
        // 현재 레이스의 pending 상태 베팅만 가져와서 집계
        const snapshot = await db.collection('headToHeadBets')
            .where('raceId', '==', h2hState.raceId)
            .where('status', '==', 'pending')
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p class="no-matchups">아직 매치업 데이터가 없습니다</p>';
            return;
        }

        // 매치업별로 집계
        const matchupMap = {};
        snapshot.forEach(doc => {
            const bet = doc.data();
            const matchupId = bet.matchupId;
            if (!matchupId) return;

            if (!matchupMap[matchupId]) {
                matchupMap[matchupId] = {
                    matchupId: matchupId,
                    driverA: bet.matchup.driverA,
                    driverB: bet.matchup.driverB,
                    totalBets: 0,
                    totalBetAmount: 0
                };
            }

            matchupMap[matchupId].totalBets++;
            matchupMap[matchupId].totalBetAmount += bet.betAmount;
        });

        // 베팅 금액 기준 정렬, 상위 5개
        const sortedMatchups = Object.values(matchupMap)
            .sort((a, b) => b.totalBetAmount - a.totalBetAmount)
            .slice(0, 5);

        if (sortedMatchups.length === 0) {
            container.innerHTML = '<p class="no-matchups">아직 매치업 데이터가 없습니다</p>';
            return;
        }

        container.innerHTML = sortedMatchups.map((data, index) =>
            renderMatchupItem(data, index + 1)
        ).join('');

    } catch (error) {
        console.error('인기 매치업 로드 실패:', error);
        container.innerHTML = '<p class="no-matchups">매치업 데이터를 불러오는데 실패했습니다</p>';
    }
}

function selectPopularMatchup(driverANumber, driverBNumber) {
    const numA = parseInt(driverANumber);
    const numB = parseInt(driverBNumber);

    // 드라이버 A 선택
    h2hState.currentPickerSlot = 'A';
    selectH2HDriver('A', numA);

    // 드라이버 B 선택 (약간의 딜레이로 UI 업데이트 보장)
    setTimeout(() => {
        h2hState.currentPickerSlot = 'B';
        selectH2HDriver('B', numB);
    }, 100);
}

// ========================================
// 내 베팅 내역
// ========================================

async function loadUserH2HBets() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('myH2HBetsList');
    if (!container) return;

    // 로딩 표시
    container.innerHTML = '<div class="section-loading"><div class="loading-spinner small"></div><span>베팅 내역 로딩 중...</span></div>';

    try {
        const snapshot = await db.collection('headToHeadBets')
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p class="no-bets">1:1 베팅 내역이 없습니다</p>';
            return;
        }

        const now = new Date();

        // void(무효/환불) 상태는 내역에서 제외
        const activeBets = snapshot.docs.filter(doc => doc.data().status !== 'void');

        if (activeBets.length === 0) {
            container.innerHTML = '<p class="no-bets">1:1 베팅 내역이 없습니다</p>';
            return;
        }

        container.innerHTML = activeBets.map(doc => {
            const bet = doc.data();

            const statusClass = bet.status === 'won' ? 'status-won' :
                               bet.status === 'lost' ? 'status-lost' : 'status-pending';
            const statusText = bet.status === 'won' ? '당첨' :
                              bet.status === 'lost' ? '낙첨' :
                              bet.status === 'void' ? '무효(환불됨)' : '대기중';

            // 취소 가능 여부 확인 (1시간 이내 또는 레이스 시작 전까지)
            let canCancel = false;
            let timeLeftText = '';
            // pending 상태이거나, status가 없는 경우(신규 베팅)도 취소 가능
            if (bet.status === 'pending' || !bet.status) {
                // 레이스 시간 가져오기
                const { race } = getNextRace();
                const raceDate = new Date(race.date);
                const timeUntilRace = raceDate - now;

                // 레이스 시작되면 취소 불가
                if (timeUntilRace <= 0) {
                    canCancel = false;
                } else if (!bet.createdAt) {
                    // createdAt이 없으면 (방금 생성됨) 취소 가능으로 처리
                    canCancel = true;
                    // 레이스까지 60분 이상 남았으면 60분, 아니면 레이스까지 남은 시간
                    const minutesLeft = Math.min(60, Math.ceil(timeUntilRace / (60 * 1000)));
                    timeLeftText = `(${minutesLeft}분 남음)`;
                } else {
                    try {
                        const createdAt = bet.createdAt.toDate ? bet.createdAt.toDate() : new Date(bet.createdAt);
                        const timeSinceBet = now - createdAt;
                        const oneHour = H2H_ONE_HOUR_MS;

                        // NaN 체크 추가 (타임스탬프 파싱 오류 대비)
                        if (isNaN(timeSinceBet)) {
                            canCancel = true;
                            const minutesLeft = Math.min(60, Math.ceil(timeUntilRace / (60 * 1000)));
                            timeLeftText = `(${minutesLeft}분 남음)`;
                        } else if (timeSinceBet < oneHour) {
                            // 베팅 후 1시간까지 남은 시간
                            const timeLeftFromBet = oneHour - timeSinceBet;
                            // 실제 취소 가능 시간 = min(베팅 후 60분까지, 레이스까지)
                            const actualTimeLeft = Math.min(timeLeftFromBet, timeUntilRace);

                            if (actualTimeLeft > 0) {
                                canCancel = true;
                                const minutesLeft = Math.ceil(actualTimeLeft / (60 * 1000));
                                timeLeftText = `(${minutesLeft}분 남음)`;
                            }
                        }
                    } catch (e) {
                        // createdAt 파싱 오류 시 레이스 시간 기준으로 처리
                        canCancel = true;
                        const minutesLeft = Math.min(60, Math.ceil(timeUntilRace / (60 * 1000)));
                        timeLeftText = `(${minutesLeft}분 남음)`;
                    }
                }
            }

            // 예측한 드라이버가 A인지 B인지 확인
            const isDriverAPredicted = bet.matchup.driverA.number === bet.predictedWinner;

            return `
                <div class="h2h-bet-item ${statusClass}">
                    <div class="h2h-bet-header">
                        <span class="h2h-bet-race">${bet.raceName}</span>
                        <span class="bet-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="h2h-bet-matchup">
                        <span class="h2h-matchup-driver ${isDriverAPredicted ? 'predicted' : ''}">${bet.matchup.driverA.name}</span>
                        <span class="h2h-matchup-vs">vs</span>
                        <span class="h2h-matchup-driver ${!isDriverAPredicted ? 'predicted' : ''}">${bet.matchup.driverB.name}</span>
                    </div>
                    <div class="h2h-bet-details">
                        <span>베팅: ${bet.betAmount} AMR x ${bet.odds.toFixed(2)}x</span>
                        <span class="h2h-bet-win">예상: ${bet.potentialWin} AMR</span>
                    </div>
                    ${canCancel ? (() => {
                        // 만료 시간 계산 (취소 버튼용)
                        const { race: r } = getNextRace();
                        const raceTime = new Date(r.date).getTime();
                        const betCreatedAt = bet.createdAt ? (bet.createdAt.toDate ? bet.createdAt.toDate() : new Date(bet.createdAt)) : new Date();
                        const betExpiry = betCreatedAt.getTime() + H2H_ONE_HOUR_MS;
                        const expiryTime = Math.min(betExpiry, raceTime);
                        // 🔒 보안 강화: data-refund 제거 - 환불 금액은 서버에서만 조회
                        return `
                        <button class="h2h-cancel-btn"
                                data-expiry="${expiryTime}"
                                data-bet-id="${doc.id}"
                                onclick="cancelH2HBet('${doc.id}')">
                            취소하기 <span class="cancel-time-left">${timeLeftText}</span>
                        </button>
                    `;
                    })() : ''}
                </div>
            `;
        }).join('');

        // 취소 버튼 실시간 업데이트 타이머 시작
        startH2HCancelButtonTimer();
    } catch (error) {
        console.error('1:1 베팅 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '베팅 내역을 불러오는데 실패했습니다';
        container.innerHTML = `<p class="no-bets">${msg}</p>`;
    }
}

// ========================================
// 취소 버튼 실시간 업데이트
// ========================================

let h2hCancelButtonTimerId = null;

/**
 * 1:1 베팅 취소 버튼 실시간 업데이트 시작
 */
function startH2HCancelButtonTimer() {
    if (h2hCancelButtonTimerId) {
        clearInterval(h2hCancelButtonTimerId);
    }

    h2hCancelButtonTimerId = setInterval(updateH2HCancelButtons, 1000);
}

/**
 * 모든 1:1 베팅 취소 버튼의 남은 시간 업데이트
 */
function updateH2HCancelButtons() {
    const buttons = document.querySelectorAll('#myH2HBetsList .h2h-cancel-btn[data-expiry]');
    const now = Date.now();

    buttons.forEach(btn => {
        const expiry = parseInt(btn.dataset.expiry);
        const timeLeft = expiry - now;

        if (timeLeft <= 0) {
            // 시간 만료 - 버튼 숨기기 (애니메이션)
            btn.style.transition = 'opacity 0.3s, transform 0.3s';
            btn.style.opacity = '0';
            btn.style.transform = 'scale(0.8)';
            setTimeout(() => btn.remove(), 300);
        } else {
            // 남은 시간 업데이트
            const timeLeftSpan = btn.querySelector('.cancel-time-left');
            if (timeLeftSpan) {
                const minutesLeft = Math.ceil(timeLeft / 60000);
                const secondsLeft = Math.ceil(timeLeft / 1000);

                if (secondsLeft <= 60) {
                    // 1분 이하면 초 단위로 표시
                    timeLeftSpan.textContent = `(${secondsLeft}초 남음)`;
                    timeLeftSpan.style.color = '#ff4444';
                } else {
                    timeLeftSpan.textContent = `(${minutesLeft}분 남음)`;
                    timeLeftSpan.style.color = '';
                }
            }
        }
    });
}

// 페이지 언로드 시 타이머 정리
window.addEventListener('beforeunload', () => {
    if (h2hCancelButtonTimerId) {
        clearInterval(h2hCancelButtonTimerId);
    }
});

// ========================================
// 베팅 취소
// ========================================

// 🔒 보안 강화: refundAmount 파라미터 제거 - 환불 금액은 서버에서 조회
async function cancelH2HBet(betId) {
    const user = getCurrentUser();
    if (!user) {
        showAlert('로그인이 필요합니다.', 'warning', '로그인 필요');
        return;
    }

    const confirmed = await showConfirm('정말 베팅을 취소하시겠습니까?\n코인이 환불됩니다.', '베팅 취소');
    if (!confirmed) {
        return;
    }

    try {
        // 서버 API 호출 (토큰 환불은 서버에서만 가능)
        const idToken = await user.getIdToken();
        const response = await fetch('/api/bet/h2h/cancel', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ betId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '베팅 취소 실패');
        }

        await updateH2HBalanceDisplay();
        await updateBalanceDisplay();
        await updateTokenDisplay();
        await loadUserH2HBets();
        await loadPopularMatchups();

        showAlert(`베팅이 취소되었습니다.\n${data.refundAmount} AMR이 환불되었습니다.`, 'success', '취소 완료');
    } catch (error) {
        const msg = error.message || '';
        if (msg.includes('찾을 수 없')) {
            showAlert('베팅을 찾을 수 없습니다.', 'error', '오류');
        } else if (msg.includes('본인')) {
            showAlert('본인의 베팅만 취소할 수 있습니다.', 'error', '권한 없음');
        } else if (msg.includes('정산')) {
            showAlert('이미 정산된 베팅은 취소할 수 없습니다.', 'warning', '취소 불가');
        } else if (msg.includes('1시간')) {
            showAlert('베팅 후 1시간이 지나 취소할 수 없습니다.', 'warning', '시간 초과');
        } else if (msg.includes('유효하지')) {
            showAlert('베팅 데이터에 문제가 있습니다.\n관리자에게 문의하세요.', 'error', '데이터 오류');
        } else if (isNetworkError(error)) {
            showAlert('인터넷 연결을 확인해주세요', 'error', '네트워크 오류');
        } else {
            console.error('1:1 베팅 취소 실패:', error);
            showAlert('베팅 취소에 실패했습니다.\n다시 시도해주세요.', 'error', '취소 실패');
        }
    }
}

