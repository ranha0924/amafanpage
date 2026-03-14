// ========================================
// AMR Token System - Podium Betting Module v2
// New 2-Column Layout with Podium Design
// ========================================

// ========================================
// 커스텀 모달 시스템
// ========================================

/**
 * 커스텀 알림 모달 표시
 * @param {string} message - 표시할 메시지
 * @param {string} type - 알림 타입 (success, error, warning, info)
 * @param {string} title - 모달 제목 (선택)
 */
function showAlert(message, type = 'info', title = '알림') {
    const modal = document.getElementById('alertModal');
    const iconEl = document.getElementById('alertModalIcon');
    const titleEl = document.getElementById('alertModalTitle');
    const messageEl = document.getElementById('alertModalMessage');

    if (!modal) {
        window.alert(message);
        return;
    }

    const icons = {
        success: '<img src="images/icons/icon-check.svg" alt="" class="inline-icon">',
        error: '<img src="images/icons/icon-cross.svg" alt="" class="inline-icon">',
        warning: '<img src="images/icons/icon-warning.svg" alt="" class="inline-icon">',
        info: '<img src="images/icons/icon-chart.svg" alt="" class="inline-icon">'
    };

    iconEl.innerHTML = icons[type] || icons.info;
    iconEl.className = `alert-modal-icon ${type}`;
    titleEl.textContent = title;
    messageEl.textContent = message;

    modal.classList.add('active');
}

/**
 * 알림 모달 닫기
 */
function closeAlertModal() {
    const modal = document.getElementById('alertModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 커스텀 확인 모달 표시
 * @param {string} message - 표시할 메시지
 * @param {string} title - 모달 제목
 * @returns {Promise<boolean>} - 확인 여부
 */
function showConfirm(message, title = '확인') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmModalMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const overlay = modal ? modal.querySelector('.confirm-modal-overlay') : null;

        if (!modal) {
            resolve(window.confirm(message));
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            if (overlay) overlay.removeEventListener('click', onCancel);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        if (overlay) overlay.addEventListener('click', onCancel);

        modal.classList.add('active');
    });
}

// ========================================
// 베팅 상태
// ========================================

const bettingState = {
    selectedDrivers: {
        1: null,  // P1
        2: null,  // P2
        3: null   // P3
    },
    betAmounts: {
        1: 0,
        2: 0,
        3: 0
    },
    currentPosition: null,
    activeInputPosition: null, // 현재 활성화된 베팅 입력 위치
    raceId: null,
    userBets: [],
    countdownInterval: null // 카운트다운 interval ID
};

// 실시간 배당률 상태
const liveOddsState = {
    totalPool: 0,
    driverPools: {},
    positionPools: {},
    liveOdds: {},
    lastUpdated: null,
    unsubscribe: null
};

// 베팅 설정 - BETTING_CONFIG는 constants.js에서 정의됨
// 로컬에서 사용하는 추가 설정 (포디움 전용)
const PODIUM_BETTING = {
    ONE_HOUR_MS: TIME_MS.HOUR,
    ONE_DAY_MS: TIME_MS.DAY
};

// 🔒 보안 강화: 서버 시간 동기화 (utils.js의 공통 syncServerTime 사용)
let serverTimeOffset = 0; // 서버 시간 - 클라이언트 시간 (밀리초)

// 서버 시간 기준 현재 시간 반환
function getServerTime() {
    return getServerNow(serverTimeOffset);
}

// 배당률 설정 - BETTING_CONFIG에서 가져옴
const ODDS_CONFIG = {
    HOUSE_EDGE: BETTING_CONFIG.PODIUM_HOUSE_EDGE,
    MIN_ODDS: BETTING_CONFIG.PODIUM_MIN_ODDS,
    MAX_ODDS: BETTING_CONFIG.PODIUM_MAX_ODDS,
    MIN_POOL_FOR_LIVE: 1,
    UPDATE_INTERVAL: 30000
};

// 🔒 네트워크 타임아웃 및 중복 클릭 방지
const NETWORK_TIMEOUT_MS = 30000; // 30초 타임아웃
let isBettingInProgress = false; // 베팅 진행 중 플래그

// 타임아웃 적용 fetch 헬퍼
async function fetchWithTimeout(url, options, timeoutMs = NETWORK_TIMEOUT_MS) {
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

// 정렬 상태
let currentSortMode = 'odds-asc'; // 'odds-asc', 'odds-desc', 'number'

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initBettingPage();
});

async function initBettingPage() {
    // 🔒 서버 시간 동기화 (베팅 마감 시간 정확 검증)
    serverTimeOffset = await syncServerTime();

    // 레이스 정보 로드
    loadNextRaceInfo();

    // F1 API에서 드라이버 순위 로드 (배당률 계산에 필요)
    await loadDriverStandingsForPodium();

    // 실시간 배당률 초기화
    await initLiveOdds();

    // 배당률 테이블 생성
    renderDriverOddsList();

    // 드라이버 피커 생성
    renderDriverPicker();

    // 카운트다운 시작
    startBettingCountdown();

    // 첫 방문자 튜토리얼 체크
    checkFirstTimeVisitor();

    // Auth 상태 변경 리스너
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            const bettingContent = document.getElementById('bettingContent');

            // 항상 베팅 콘텐츠 표시
            if (bettingContent) bettingContent.style.display = 'block';

            // 로그인 오버레이 토글
            updateLoginOverlay(!user);

            if (user) {
                // 로그인됨
                await updateBalanceDisplay();
                await loadUserBets();

                // 실시간 배당률 초기화 (로그인 후)
                await initLiveOdds();
            } else {
                // 로그아웃됨: 배당률은 표시하되 잔액과 베팅 내역만 초기화
                document.getElementById('currentBalance').textContent = '0';
                document.getElementById('myBetsList').innerHTML = '<div class="empty-state empty-state--compact"><img src="images/icons/icon-chart.svg" alt="" class="empty-icon"><p class="empty-title">로그인하여 베팅 내역을 확인하세요</p></div>';

                // 비로그인 상태에서도 배당률 초기화
                await initLiveOdds();
            }
        });
    }
}

// ========================================
// 로그인 오버레이 관리
// ========================================

/**
 * 로그인 오버레이 표시/숨김
 * @param {boolean} show - 표시 여부
 */
function updateLoginOverlay(show) {
    // 포디움 베팅 오버레이
    const betSlipOverlay = document.getElementById('betSlipLoginOverlay');
    const betSlipPanel = document.getElementById('betSlipPanel');

    if (betSlipOverlay) {
        betSlipOverlay.classList.toggle('active', show);
    }
    if (betSlipPanel) {
        betSlipPanel.classList.toggle('needs-login', show);
    }

    // 1:1 베팅 오버레이
    const h2hOverlay = document.getElementById('h2hLoginOverlay');
    if (h2hOverlay) {
        h2hOverlay.classList.toggle('active', show);
    }

    // 인기 매치업 오버레이
    const matchupsOverlay = document.getElementById('matchupsLoginOverlay');
    const matchupsList = document.getElementById('popularMatchupsList');
    if (matchupsOverlay) {
        matchupsOverlay.classList.toggle('active', show);
    }
    if (matchupsList) {
        matchupsList.classList.toggle('blurred', show);
    }
}

// ========================================
// 정렬 기능
// ========================================

function sortDrivers(mode) {
    currentSortMode = mode;

    // 버튼 활성화 상태 업데이트
    const sortBtns = document.querySelectorAll('.sort-btn');
    sortBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === mode);
    });

    // 드라이버 리스트 다시 렌더링
    renderDriverOddsList();
}

// ========================================
// 튜토리얼 기능
// ========================================

function showTutorial() {
    const modal = document.getElementById('tutorialModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeTutorial() {
    const modal = document.getElementById('tutorialModal');
    const dontShowAgain = document.getElementById('dontShowAgain');

    if (modal) {
        modal.classList.remove('active');
    }

    // "다시 보지 않기" 체크 시 저장
    if (dontShowAgain && dontShowAgain.checked) {
        localStorage.setItem('bettingTutorialSeen', 'true');
    }
}

function checkFirstTimeVisitor() {
    const tutorialSeen = localStorage.getItem('bettingTutorialSeen');
    if (!tutorialSeen) {
        // 약간 딜레이 후 튜토리얼 표시
        setTimeout(() => {
            showTutorial();
        }, 1000);
    }
}

// ========================================
// 레이스 정보
// ========================================

function loadNextRaceInfo() {
    const result = getNextRace();

    // 레이스 정보가 없으면 에러 처리
    if (!result || !result.race) {
        logger.warn('레이스 정보를 찾을 수 없습니다.');
        const raceNameEl = document.getElementById('bettingRaceName');
        const raceCircuitEl = document.getElementById('bettingRaceCircuit');
        if (raceNameEl) raceNameEl.textContent = '레이스 정보 없음';
        if (raceCircuitEl) raceCircuitEl.textContent = '';
        return;
    }

    const { race, index } = result;
    const raceDate = new Date(race.date);

    const kst = getKSTDateParts(raceDate);
    bettingState.raceId = `race_${index + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;

    document.getElementById('bettingRaceName').textContent = race.name;
    document.getElementById('bettingRaceCircuit').textContent = race.circuit;
}

function startBettingCountdown() {
    // 기존 interval 정리
    if (bettingState.countdownInterval) {
        clearInterval(bettingState.countdownInterval);
    }
    updateBettingCountdown();
    bettingState.countdownInterval = setInterval(updateBettingCountdown, 1000);
}

// 취소 버튼 타이머 ID
let cancelButtonTimerId = null;

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    if (bettingState.countdownInterval) {
        clearInterval(bettingState.countdownInterval);
    }
    if (liveOddsState.unsubscribe) {
        liveOddsState.unsubscribe();
    }
    if (cancelButtonTimerId) {
        clearInterval(cancelButtonTimerId);
    }
});

/**
 * 취소 버튼 실시간 업데이트 시작
 */
function startCancelButtonTimer() {
    if (cancelButtonTimerId) {
        clearInterval(cancelButtonTimerId);
    }

    cancelButtonTimerId = setInterval(updateCancelButtons, 1000);
}

/**
 * 모든 취소 버튼의 남은 시간 업데이트
 */
function updateCancelButtons() {
    const buttons = document.querySelectorAll('#myBetsList .cancel-bet-btn[data-expiry]');
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
                const minutesLeft = Math.floor(timeLeft / 60000);
                const secondsLeft = Math.floor(timeLeft / 1000);

                if (secondsLeft <= 60) {
                    // 1분 이하면 초 단위로 표시
                    timeLeftSpan.textContent = `(${secondsLeft}초 남음)`;
                    timeLeftSpan.style.color = 'var(--color-error)';
                } else {
                    timeLeftSpan.textContent = `(${minutesLeft}분 남음)`;
                    timeLeftSpan.style.color = '';
                }
            }
        }
    });
}

function updateBettingCountdown() {
    const { race } = getNextRace();
    const raceDate = new Date(race.date);
    // 🔒 서버 시간 기준으로 카운트다운
    const now = getServerTime();
    const diff = raceDate - now;

    const countdownEl = document.getElementById('bettingTimeLeft');
    const betBtn = document.getElementById('placeBetBtn');

    if (diff <= 0) {
        countdownEl.textContent = '베팅 마감';
        countdownEl.classList.add('closed');
        if (betBtn) {
            betBtn.disabled = true;
            betBtn.textContent = '베팅 마감';
        }
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const wrap = s => s.replace(/\d/g, d => `<span class="cd">${d}</span>`);
    if (days > 0) {
        countdownEl.innerHTML = wrap(`${days}일 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    } else {
        countdownEl.innerHTML = wrap(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }
}

// ========================================
// F1 API 드라이버 순위 로드 (배당률 계산용)
// ========================================

async function loadDriverStandingsForPodium() {
    try {
        const standings = await F1_API.getDriverStandings();
        if (standings && standings.length > 0) {
            setGlobalDriverStandings(standings);
            logger.log('포디움 베팅: API 순위 로드 성공 (' + standings.length + '명)');
        }
    } catch (error) {
        logger.warn('포디움 베팅: 순위 로드 실패, 폴백 사용 -', error.message);
    }
}

// ========================================
// 실시간 배당률
// ========================================

async function initLiveOdds() {
    // 로그인 안 했으면 실시간 배당률 비활성화
    if (!auth?.currentUser) {
        logger.log('실시간 배당률: 로그인 필요');
        return;
    }

    if (!bettingState.raceId || !isFirebaseConnected()) {
        logger.log('실시간 배당률: Firebase 연결 대기 중...');
        return;
    }

    // 🔒 메모리 누수 방지: 이전 구독 해제 후 새 구독 시작
    if (liveOddsState.unsubscribe) {
        liveOddsState.unsubscribe();
        liveOddsState.unsubscribe = null;
    }

    try {
        liveOddsState.unsubscribe = db.collection('podiumBets')
            .where('raceId', '==', bettingState.raceId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                calculateLiveOdds(snapshot);
                renderDriverOddsList();
                renderDriverPicker();
                updatePodiumOdds();
            }, (error) => {
                console.error('실시간 배당률 리스너 오류:', error);
                // 🔒 보안: 네트워크 오류 시 사용자에게 알림
                if (typeof showToast === 'function') {
                    if (error.code === 'unavailable' || error.code === 'failed-precondition') {
                        showToast('네트워크 연결이 불안정합니다. 배당률이 업데이트되지 않을 수 있습니다.', 'warning');
                    }
                }
            });
    } catch (error) {
        console.error('실시간 배당률 초기화 실패:', error);
    }
}

function calculateLiveOdds(snapshot) {
    liveOddsState.totalPool = 0;
    liveOddsState.driverPools = {};
    liveOddsState.positionPools = { 1: {}, 2: {}, 3: {} };

    snapshot.forEach(doc => {
        const bet = doc.data();
        if (bet.bets && Array.isArray(bet.bets)) {
            bet.bets.forEach(b => {
                const driverNum = b.driverNumber;
                const amount = b.betAmount || 0;
                const position = b.position;

                liveOddsState.totalPool += amount;
                liveOddsState.driverPools[driverNum] = (liveOddsState.driverPools[driverNum] || 0) + amount;

                if (position >= 1 && position <= 3) {
                    liveOddsState.positionPools[position][driverNum] =
                        (liveOddsState.positionPools[position][driverNum] || 0) + amount;
                }
            });
        }
    });

    const payoutPool = liveOddsState.totalPool * (1 - ODDS_CONFIG.HOUSE_EDGE);

    F1_DRIVERS_2026.forEach(driver => {
        const driverPool = liveOddsState.driverPools[driver.number] || 0;
        const baseOdds = getDriverOdds(driver.number);

        if (driverPool > 0 && liveOddsState.totalPool > 0) {
            let calculatedOdds = payoutPool / driverPool;
            calculatedOdds = Math.max(ODDS_CONFIG.MIN_ODDS, Math.min(ODDS_CONFIG.MAX_ODDS, calculatedOdds));
            liveOddsState.liveOdds[driver.number] = Math.round(calculatedOdds * 10) / 10;
        } else {
            liveOddsState.liveOdds[driver.number] = baseOdds;
        }
    });

    liveOddsState.lastUpdated = new Date();
}

function getLiveOdds(driverNumber) {
    return liveOddsState.liveOdds[driverNumber] || getDriverOdds(driverNumber);
}

function getOddsTierClass(odds) {
    if (odds >= 5.0) return 'odds-extreme';
    if (odds >= 3.0) return 'odds-high';
    if (odds >= 2.0) return 'odds-mid';
    return 'odds-low';
}

function getDriverBetPool(driverNumber) {
    return liveOddsState.driverPools[driverNumber] || 0;
}

function getOddsTrend(driverNumber) {
    const liveOdds = liveOddsState.liveOdds[driverNumber];
    const baseOdds = getDriverOdds(driverNumber);

    if (!liveOdds || Math.abs(liveOdds - baseOdds) < 0.1) return '';
    if (liveOdds > baseOdds) return '↑';
    return '↓';
}

// 선택 영역의 배당률 업데이트
function updatePodiumOdds() {
    for (let pos = 1; pos <= 3; pos++) {
        const driverNum = bettingState.selectedDrivers[pos];
        if (driverNum) {
            const odds = getLiveOdds(driverNum);
            const trend = getOddsTrend(driverNum);

            // 선택 행의 배당률 업데이트
            const selectionOdds = document.getElementById(`selectionOdds${pos}`);
            if (selectionOdds) {
                selectionOdds.textContent = `${odds.toFixed(1)}x`;
                selectionOdds.className = `selection-odds ${trend === '↓' ? 'hot' : ''}`;
            }

            // 베팅 입력 행의 배당률도 업데이트
            const inputOddsEl = document.querySelector(`#betInputRow${pos} .bet-input-odds`);
            if (inputOddsEl) {
                inputOddsEl.textContent = `${odds.toFixed(1)}x`;
            }
        }
    }
    updateTotals();
}

// ========================================
// 잔액 표시
// ========================================

async function updateBalanceDisplay() {
    const userData = await getUserTokens();
    if (userData) {
        document.getElementById('currentBalance').textContent = userData.tokens.toLocaleString();
    }
}

// ========================================
// 드라이버 배당률 리스트 렌더링
// ========================================

function renderDriverOddsList() {
    const container = document.getElementById('driverOddsList');
    if (!container) return;

    const driversWithOdds = F1_DRIVERS_2026.map(driver => ({
        ...driver,
        liveOdds: getLiveOdds(driver.number),
        betPool: getDriverBetPool(driver.number),
        trend: getOddsTrend(driver.number)
    }));

    // 정렬 모드에 따라 정렬
    switch (currentSortMode) {
        case 'odds-asc':
            // 배당률 낮은 순 (우승확률 높은 순)
            driversWithOdds.sort((a, b) => a.liveOdds - b.liveOdds);
            break;
        case 'odds-desc':
            // 배당률 높은 순 (고배당순)
            driversWithOdds.sort((a, b) => b.liveOdds - a.liveOdds);
            break;
        case 'number':
            // 번호순
            driversWithOdds.sort((a, b) => a.number - b.number);
            break;
        default:
            driversWithOdds.sort((a, b) => a.liveOdds - b.liveOdds);
    }

    // 🔒 C-5 수정: XSS 방지 - escapeHtml() 적용
    container.innerHTML = driversWithOdds.map((d, index) => {
        const rank = index + 1;
        const topClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
        const trendClass = d.trend === '↓' ? 'hot' : d.trend === '↑' ? 'cold' : '';
        const tierClass = getOddsTierClass(d.liveOdds);
        const oddsClass = `${trendClass} ${tierClass}`.trim();
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
        const safeColor = d.teamColor && /^#[0-9A-Fa-f]{6}$/.test(d.teamColor) ? d.teamColor : '#ffffff';

        const oddsImageUrl = getDriverImageUrl(d.name, d.team);
        return `
            <div class="odds-item ${topClass}" onclick="selectDriverFromList(${d.number})">
                <div class="odds-team-bar" style="background: ${safeColor}"></div>
                <img class="driver-avatar driver-avatar--odds" src="${oddsImageUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
                <div class="odds-driver-info">
                    <span class="odds-driver-number" style="color: ${safeColor}">#${d.number}</span>
                    <span class="odds-driver-name">${safeName}</span>
                </div>
                <span class="odds-value ${oddsClass}">${d.liveOdds.toFixed(1)}x</span>
            </div>
        `;
    }).join('');
}

// 리스트에서 드라이버 선택 시 첫 번째 비어있는 슬롯에 배치
function selectDriverFromList(driverNumber) {
    // 이미 선택된 드라이버인지 확인
    const alreadySelected = Object.values(bettingState.selectedDrivers).includes(driverNumber);
    if (alreadySelected) {
        showAlert('이미 선택된 드라이버입니다.', 'warning', '중복 선택');
        return;
    }

    // 첫 번째 비어있는 슬롯 찾기
    let emptySlot = null;
    for (let i = 1; i <= 3; i++) {
        if (!bettingState.selectedDrivers[i]) {
            emptySlot = i;
            break;
        }
    }

    if (!emptySlot) {
        showAlert('모든 포지션이 선택되었습니다.\n변경하려면 포디움을 클릭하세요.', 'info', '슬롯 가득');
        return;
    }

    bettingState.currentPosition = emptySlot;
    selectDriver(driverNumber);
}

// ========================================
// 헬퍼 함수
// ========================================

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '255, 255, 255';
}

// ========================================
// 드라이버 선택 (포디움 슬롯)
// ========================================

function renderDriverPicker() {
    const container = document.getElementById('pickerTeams');
    if (!container) return;

    const teams = {};
    F1_DRIVERS_2026.forEach(driver => {
        if (!teams[driver.team]) {
            teams[driver.team] = {
                color: driver.teamColor,
                drivers: []
            };
        }
        teams[driver.team].drivers.push({
            ...driver,
            liveOdds: getLiveOdds(driver.number),
            trend: getOddsTrend(driver.number)
        });
    });

    // 🔒 C-5 수정: XSS 방지 - escapeHtml() 적용
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
                    const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
                    const pickerImgUrl = getDriverImageUrl(d.name, d.team);
                    return `
                    <button class="picker-driver-btn"
                            data-number="${d.number}"
                            onclick="selectDriver(${d.number})"
                            style="--team-color: ${safeColor}; --team-color-rgb: ${hexToRgb(safeColor)}">
                        <img class="driver-avatar driver-avatar--picker" src="${pickerImgUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
                        <span class="driver-num" style="color: ${safeColor}">#${d.number}</span>
                        <span class="driver-name">${safeName}</span>
                        <span class="driver-odds ${d.trend === '↓' ? 'hot' : d.trend === '↑' ? 'cold' : ''}">
                            ${d.liveOdds.toFixed(1)}x
                        </span>
                    </button>
                `;
                }).join('')}
            </div>
        </div>
    `;
    }).join('');
}

function openDriverPicker(position) {
    bettingState.currentPosition = position;

    const modal = document.getElementById('driverPickerModal');
    const buttons = modal.querySelectorAll('.picker-driver-btn');

    buttons.forEach(btn => {
        const driverNum = parseInt(btn.dataset.number);
        const isSelected = Object.values(bettingState.selectedDrivers).includes(driverNum);
        btn.classList.toggle('disabled', isSelected);
        btn.disabled = isSelected;
    });

    modal.classList.add('active');
}

function closeDriverPicker() {
    document.getElementById('driverPickerModal').classList.remove('active');
    bettingState.currentPosition = null;
}

function selectDriver(driverNumber) {
    if (!bettingState.currentPosition) return;

    const driver = getDriverByNumber(driverNumber);
    if (!driver) return;

    const position = bettingState.currentPosition;
    bettingState.selectedDrivers[position] = driverNumber;

    // 포디움 슬롯 UI 업데이트
    updatePodiumSlot(position, driver);

    // 베팅 입력 섹션 업데이트
    updateBettingInputSection();

    // 빠른 금액 섹션 표시
    showQuickAmountSection();

    closeDriverPicker();
}

function updatePodiumSlot(position, driver) {
    // 새로운 bet slip 선택 행 업데이트
    const selectionRow = document.getElementById(`selectionRow${position}`);
    const selectionDriver = document.getElementById(`selectionDriver${position}`);
    const selectionOdds = document.getElementById(`selectionOdds${position}`);

    if (selectionRow && selectionDriver && selectionOdds) {
        const liveOdds = getLiveOdds(driver.number);
        const trend = getOddsTrend(driver.number);
        // 🔒 C-5 수정: XSS 방지
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(driver.name) : driver.name;
        const safeColor = driver.teamColor && /^#[0-9A-Fa-f]{6}$/.test(driver.teamColor) ? driver.teamColor : '#ffffff';

        const slotImageUrl = getDriverImageUrl(driver.name, driver.team);
        selectionRow.classList.add('selected');
        selectionDriver.innerHTML = `
            <div class="selected-driver-info">
                <img class="driver-avatar driver-avatar--slip" src="${slotImageUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
                <span class="driver-number" style="color: ${safeColor}">#${driver.number}</span>
                <span class="driver-name">${safeName}</span>
            </div>
        `;
        selectionOdds.textContent = `${liveOdds.toFixed(1)}x`;
        selectionOdds.className = `selection-odds ${trend === '↓' ? 'hot' : ''}`;
    }
}

function resetPodiumSlot(position) {
    // 새로운 bet slip 선택 행 초기화
    const selectionRow = document.getElementById(`selectionRow${position}`);
    const selectionDriver = document.getElementById(`selectionDriver${position}`);
    const selectionOdds = document.getElementById(`selectionOdds${position}`);

    if (selectionRow && selectionDriver && selectionOdds) {
        selectionRow.classList.remove('selected');
        selectionDriver.innerHTML = `<span class="select-placeholder">드라이버 선택</span>`;
        selectionOdds.textContent = '-';
        selectionOdds.className = 'selection-odds';
    }
}

// ========================================
// 베팅 입력 섹션
// ========================================

function updateBettingInputSection() {
    const container = document.getElementById('bettingInputSection');
    if (!container) return;

    let html = '';

    for (let pos = 1; pos <= 3; pos++) {
        const driverNum = bettingState.selectedDrivers[pos];
        if (driverNum) {
            const driver = getDriverByNumber(driverNum);
            const odds = getLiveOdds(driverNum);
            const amount = bettingState.betAmounts[pos] || 0;

            html += `
                <div class="bet-input-row" id="betInputRow${pos}">
                    <span class="bet-input-position p${pos}">P${pos}</span>
                    <span class="bet-input-driver">${driver.name}</span>
                    <div class="bet-input-wrapper">
                        <input type="number"
                               id="betAmount${pos}"
                               min="0"
                               value="${amount}"
                               onchange="onBetAmountChange(${pos})"
                               onfocus="setActiveInputPosition(${pos})">
                        <span class="bet-input-unit">FC</span>
                    </div>
                    <span class="bet-input-odds">${odds.toFixed(1)}x</span>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // 포디움 예상 당첨금 업데이트
    updateTotals();
}

function setActiveInputPosition(position) {
    bettingState.activeInputPosition = position;
}

function onBetAmountChange(position) {
    const input = document.getElementById(`betAmount${position}`);
    if (!input) return;

    let value = parseInt(input.value) || 0;

    // 잔액 확인 및 제한
    const balance = parseInt(document.getElementById('currentBalance').textContent.replace(/,/g, '')) || 0;
    let otherBets = 0;
    for (let i = 1; i <= 3; i++) {
        if (i !== position) {
            otherBets += bettingState.betAmounts[i] || 0;
        }
    }
    const maxAllowed = balance - otherBets;
    value = Math.min(Math.max(0, value), maxAllowed);

    input.value = value;
    bettingState.betAmounts[position] = value;

    updateTotals();
}

function showQuickAmountSection() {
    const section = document.getElementById('quickAmountSection');
    if (section) {
        const hasSelectedDriver = Object.values(bettingState.selectedDrivers).some(d => d !== null);
        section.style.display = hasSelectedDriver ? 'block' : 'none';
    }
}

function addQuickAmount(amount) {
    // 현재 활성화된 입력 위치 또는 첫 번째 선택된 드라이버 찾기
    let targetPosition = bettingState.activeInputPosition;

    if (!targetPosition || !bettingState.selectedDrivers[targetPosition]) {
        for (let i = 1; i <= 3; i++) {
            if (bettingState.selectedDrivers[i]) {
                targetPosition = i;
                break;
            }
        }
    }

    if (!targetPosition) return;

    const input = document.getElementById(`betAmount${targetPosition}`);
    if (!input) return;

    const balance = parseInt(document.getElementById('currentBalance').textContent.replace(/,/g, '')) || 0;
    const currentValue = bettingState.betAmounts[targetPosition] || 0;

    // 다른 포지션 베팅 금액 합산
    let otherBets = 0;
    for (let i = 1; i <= 3; i++) {
        if (i !== targetPosition) {
            otherBets += bettingState.betAmounts[i] || 0;
        }
    }

    const maxAllowed = balance - otherBets;

    let newValue;
    if (amount === 'all') {
        newValue = maxAllowed;
    } else {
        newValue = Math.min(currentValue + amount, maxAllowed);
    }

    input.value = newValue;
    bettingState.betAmounts[targetPosition] = newValue;

    updateTotals();
}

// ========================================
// 합계 업데이트
// ========================================

function updateTotals() {
    let totalBet = 0;
    let totalPotentialWin = 0;
    let hasValidBet = false; // 유효한 베팅이 있는지

    for (let pos = 1; pos <= 3; pos++) {
        const driverNum = bettingState.selectedDrivers[pos];
        const amount = bettingState.betAmounts[pos] || 0;
        totalBet += amount;

        if (driverNum && amount > 0) {
            hasValidBet = true; // 드라이버 선택 + 금액 입력 완료
            const odds = getLiveOdds(driverNum);
            totalPotentialWin += Math.floor(amount * odds);
        } else if (driverNum) {
            const odds = getLiveOdds(driverNum);
            totalPotentialWin += Math.floor(amount * odds);
        }
    }

    document.getElementById('totalBetAmount').textContent = `${totalBet.toLocaleString()} FC`;
    document.getElementById('totalPotentialWin').textContent = `${totalPotentialWin.toLocaleString()} FC`;

    // 모바일 미니 바 업데이트
    updateMiniBar(totalPotentialWin);

    // 베팅 버튼 활성화/비활성화 (베팅 마감이 아닌 경우에만)
    const betBtn = document.getElementById('placeBetBtn');
    if (betBtn && betBtn.textContent !== '베팅 마감') {
        betBtn.disabled = !hasValidBet;
    }
}

// ========================================
// 베팅 실행
// ========================================

async function placeBet() {
    // 🔒 중복 클릭 방지
    if (isBettingInProgress) {
        showAlert('베팅이 처리 중입니다. 잠시만 기다려주세요.', 'info', '처리 중');
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        showAlert('로그인이 필요합니다.', 'warning', '로그인 필요');
        return;
    }

    const { race } = getNextRace();
    const raceDate = new Date(race.date);
    // 🔒 서버 시간 기준으로 마감 검증
    if (getServerTime() >= raceDate) {
        showAlert('베팅이 마감되었습니다.', 'error', '베팅 마감');
        return;
    }

    const bets = [];
    let totalAmount = 0;

    for (let i = 1; i <= 3; i++) {
        const driverNum = bettingState.selectedDrivers[i];
        const amount = bettingState.betAmounts[i] || 0;

        if (amount > 0) {
            if (!driverNum) {
                showAlert(`P${i} 드라이버를 선택해주세요.`, 'warning', '드라이버 선택');
                return;
            }

            // 🔒 보안: 정수 검증 추가 (H-8)
            if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
                showAlert('베팅 금액은 1~1000 FC 범위의 정수여야 합니다.', 'warning', '금액 오류');
                return;
            }

            const driver = getDriverByNumber(driverNum);
            const seasonRank = getDriverSeasonRankFromStandings(driverNum);

            bets.push({
                position: i,
                driverNumber: driverNum,
                driverName: driver?.name || 'Unknown',
                seasonRank: seasonRank,
                betAmount: amount
                // odds는 서버에서 계산 (클라이언트 값 무시)
            });

            totalAmount += amount;
        }
    }

    if (bets.length === 0) {
        showAlert('최소 하나 이상의 베팅을 해주세요.', 'warning', '베팅 필요');
        return;
    }

    const btn = document.getElementById('placeBetBtn');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    isBettingInProgress = true;

    try {
        // ✅ 서버 API 호출 (보안 강화 - 클라이언트 직접 Firestore 쓰기 제거)
        // 🔒 네트워크 타임아웃 적용
        const idToken = await user.getIdToken();
        const response = await fetchWithTimeout('/api/bet/podium', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raceId: bettingState.raceId,
                raceName: race.name,
                bets: bets
            })
        });

        // 🔒 보안: JSON 파싱 에러 처리 (H-11)
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('베팅 응답 JSON 파싱 실패:', parseError);
            throw new Error('서버 응답을 처리할 수 없습니다.');
        }

        if (!response.ok) {
            throw new Error(data.error || '베팅 실패');
        }

        await updateBalanceDisplay();
        await updateTokenDisplay();
        await loadUserBets();

        resetBettingForm();

        showAlert(`베팅 완료!\n${data.totalAmount} FC을 베팅했습니다.`, 'success', '베팅 성공');
    } catch (error) {
        const msg = error.message || '';
        if (msg.includes('이미') || msg.includes('중복')) {
            showAlert('이미 이 레이스에 베팅하셨습니다.', 'warning', '중복 베팅');
        } else if (msg.includes('부족')) {
            showAlert('코인이 부족합니다!\n마이페이지에서 출석체크로 코인을 획득하세요.', 'error', '코인 부족');
        } else if (msg.includes('마감')) {
            showAlert('베팅이 마감되었습니다.', 'error', '베팅 마감');
        } else if (msg.includes('사용자')) {
            showAlert('사용자 정보를 찾을 수 없습니다.', 'error', '오류');
        } else if (msg.includes('시간이 초과')) {
            showAlert('요청 시간이 초과되었습니다.\n네트워크 상태를 확인 후 다시 시도해주세요.', 'error', '타임아웃');
        } else if (isNetworkError(error)) {
            showAlert('인터넷 연결을 확인해주세요', 'error', '네트워크 오류');
        } else {
            console.error('베팅 실패:', error);
            showAlert(msg || '베팅에 실패했습니다.\n다시 시도해주세요.', 'error', '베팅 실패');
        }
    }

    btn.disabled = false;
    btn.textContent = '베팅하기';
    isBettingInProgress = false;
}

function resetBettingForm() {
    // 상태 초기화
    bettingState.selectedDrivers = { 1: null, 2: null, 3: null };
    bettingState.betAmounts = { 1: 0, 2: 0, 3: 0 };
    bettingState.activeInputPosition = null;

    // 선택 행 초기화
    for (let i = 1; i <= 3; i++) {
        resetPodiumSlot(i);
    }

    // 베팅 입력 섹션 초기화
    const inputSection = document.getElementById('bettingInputSection');
    if (inputSection) inputSection.innerHTML = '';

    // 빠른 금액 섹션 숨김
    const quickSection = document.getElementById('quickAmountSection');
    if (quickSection) quickSection.style.display = 'none';

    updateTotals();
}

// ========================================
// 내 베팅 내역
// ========================================

async function loadUserBets() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('myBetsList');

    // 로딩 표시
    container.innerHTML = '<div class="section-loading"><div class="loading-spinner small"></div><span>베팅 내역 로딩 중...</span></div>';

    try {
        const snapshot = await db.collection('podiumBets')
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-trophy.svg" alt="" class="empty-icon">
                    <p class="empty-title">베팅 내역이 없습니다</p>
                    <p class="empty-subtitle">포디움 순위를 예측하고 베팅해보세요!</p>
                </div>
            `;
            return;
        }

        const now = getServerTime();

        container.innerHTML = snapshot.docs.map(doc => {
            const bet = doc.data();
            const statusClass = bet.status === 'won' ? 'status-won' :
                               bet.status === 'lost' ? 'status-lost' : 'status-pending';
            const statusText = bet.status === 'won' ? '당첨' :
                              bet.status === 'lost' ? '낙첨' : '대기중';

            let canCancel = false;
            let timeLeftText = '';
            if (bet.status === 'pending') {
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
                    const minutesLeft = Math.min(60, Math.ceil(timeUntilRace / (60 * 1000)));
                    timeLeftText = `(${minutesLeft}분 남음)`;
                } else {
                    const createdAt = bet.createdAt.toDate ? bet.createdAt.toDate() : new Date(bet.createdAt);
                    const timeSinceBet = now - createdAt;
                    const oneHour = TIME_MS.HOUR;

                    if (timeSinceBet < oneHour) {
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
                }
            }

            return `
                <div class="bet-item ${statusClass}">
                    <div class="bet-race">
                        <span class="race-name">${bet.raceName}</span>
                        <span class="bet-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="bet-details">
                        ${bet.bets.map(b => {
                            const driver = getDriverByNumber(b.driverNumber);
                            return `
                                <div class="bet-position">
                                    <span class="pos-badge">P${b.position}</span>
                                    <span class="driver-name">${driver ? driver.name : 'Unknown'}</span>
                                    <span class="bet-amount">${b.betAmount} FC x ${b.odds}x</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="bet-total">
                        <span>총 베팅: ${bet.totalAmount} FC</span>
                        ${bet.winAmount !== null ? `<span class="win-amount">당첨금: ${bet.winAmount} FC</span>` : ''}
                    </div>
                    ${canCancel ? (() => {
                        // 만료 시간 계산 (취소 버튼용)
                        const { race: r } = getNextRace();
                        const raceTime = new Date(r.date).getTime();
                        const betCreatedAt = bet.createdAt ? (bet.createdAt.toDate ? bet.createdAt.toDate() : new Date(bet.createdAt)) : new Date();
                        const betExpiry = betCreatedAt.getTime() + TIME_MS.HOUR;
                        const expiryTime = Math.min(betExpiry, raceTime);
                        // 🔒 보안 강화: data-refund 제거 - 환불 금액은 서버에서만 조회
                        return `
                        <button class="cancel-bet-btn"
                                data-expiry="${expiryTime}"
                                data-bet-id="${doc.id}"
                                onclick="cancelBet('${doc.id}')">
                            취소하기 <span class="cancel-time-left">${timeLeftText}</span>
                        </button>
                    `;
                    })() : ''}
                </div>
            `;
        }).join('');

        // 취소 버튼 실시간 업데이트 타이머 시작
        startCancelButtonTimer();
    } catch (error) {
        console.error('베팅 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '베팅 내역을 불러오는데 실패했습니다';
        container.innerHTML = `<div class="empty-state empty-state--compact"><img src="images/icons/icon-warning.svg" alt="" class="empty-icon"><p class="empty-title">${msg}</p></div>`;
    }
}

// 🔒 보안 강화: refundAmount 파라미터 제거 - 환불 금액은 서버에서 조회
async function cancelBet(betId) {
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
        const response = await fetch('/api/bet/podium/cancel', {
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

        await updateBalanceDisplay();
        await updateTokenDisplay();
        await loadUserBets();

        showAlert(`베팅이 취소되었습니다.\n${data.refundAmount} FC이 환불되었습니다.`, 'success', '취소 완료');
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
            console.error('베팅 취소 실패:', error);
            showAlert('베팅 취소에 실패했습니다.\n다시 시도해주세요.', 'error', '취소 실패');
        }
    }
}

// ========================================
// 모바일 BET SLIP 토글
// ========================================

/**
 * BET SLIP 접기/펼치기 토글
 */
function toggleBetSlip() {
    const panel = document.getElementById('betSlipPanel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

/**
 * 모바일 미니 바 정보 업데이트
 */
function updateMiniBar(totalPotentialWin) {
    const miniSelections = document.getElementById('miniSelections');
    const miniPotential = document.getElementById('miniPotential');

    if (miniSelections) {
        // 선택된 드라이버 수 계산
        let selectedCount = 0;
        for (let pos = 1; pos <= 3; pos++) {
            if (bettingState.selectedDrivers[pos]) {
                selectedCount++;
            }
        }
        miniSelections.textContent = `${selectedCount}/3 선택`;
    }

    if (miniPotential) {
        miniPotential.textContent = `${totalPotentialWin.toLocaleString()} FC`;
    }
}

/**
 * 모바일 BET SLIP 초기화 (페이지 로드 시)
 */
function initMobileBetSlip() {
    const panel = document.getElementById('betSlipPanel');
    if (panel && window.innerWidth <= 768) {
        // 모바일에서 기본적으로 접힌 상태로 시작
        panel.classList.add('collapsed');
    }

    // 화면 크기 변경 시 처리
    window.addEventListener('resize', () => {
        if (panel) {
            if (window.innerWidth > 768) {
                // 데스크톱으로 전환 시 collapsed 제거
                panel.classList.remove('collapsed');
            } else if (!panel.classList.contains('collapsed') && !panel.dataset.userOpened) {
                // 모바일로 전환 시 기본 접힘 상태
                panel.classList.add('collapsed');
            }
        }
    });
}

// DOMContentLoaded 시 모바일 BET SLIP 초기화
document.addEventListener('DOMContentLoaded', initMobileBetSlip);

