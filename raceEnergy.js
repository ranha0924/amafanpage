// ========================================
// AMR Token System - Race Energy Module
// ========================================

// 응원 에너지 상태
const raceEnergyState = {
    isRaceActive: false,
    raceId: null,
    raceName: null,
    raceEndTime: null,
    lastClaimTime: null,
    nextClaimTime: null,
    claimCount: 0,
    maxClaims: TOKEN_CONFIG.RACE_DURATION / TOKEN_CONFIG.RACE_ENERGY_INTERVAL, // 최대 12회
    checkInterval: null,
    countdownInterval: null,
    settlementNotified: false  // 정산 알림 전송 여부
};

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initRaceEnergy();
});

function initRaceEnergy() {
    // 이전 정산 알림 상태 복원 (페이지 새로고침 대비)
    restoreSettlementState();

    // 레이스 상태 체크 (30초마다)
    checkRaceStatus();
    raceEnergyState.checkInterval = setInterval(checkRaceStatus, 30000);

    // 배너 이벤트 설정
    const claimBtn = document.getElementById('energyClaimBtn');
    if (claimBtn) {
        claimBtn.addEventListener('click', claimRaceEnergy);
    }
}

/**
 * 정산 알림 상태 복원 (페이지 새로고침 시)
 */
function restoreSettlementState() {
    try {
        const result = getNextRace();
        if (!result || !result.race) return;

        const { race, index } = result;
        const raceDate = new Date(race.date);
        const raceId = `race_${index + 1}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;

        // 로컬 스토리지에서 알림 상태 확인
        const notified = localStorage.getItem(`settlement_notified_${raceId}`);
        if (notified === 'true') {
            raceEnergyState.settlementNotified = true;
            console.log(`정산 알림 상태 복원: ${raceId} (이미 알림됨)`);
        }

        // 오래된 정산 기록 정리 (7일 이상)
        cleanupOldSettlementRecords();
    } catch (e) {
        // 로컬 스토리지 접근 실패 무시
    }
}

/**
 * 오래된 정산 기록 정리
 */
function cleanupOldSettlementRecords() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('settlement_notified_')) {
                // race_N_YYYYMMDD 형식에서 날짜 추출
                const match = key.match(/settlement_notified_race_\d+_(\d{8})/);
                if (match) {
                    const dateStr = match[1];
                    const year = parseInt(dateStr.substring(0, 4));
                    const month = parseInt(dateStr.substring(4, 6)) - 1;
                    const day = parseInt(dateStr.substring(6, 8));
                    const recordDate = new Date(year, month, day);
                    const daysDiff = (Date.now() - recordDate.getTime()) / (1000 * 60 * 60 * 24);

                    if (daysDiff > 7) {
                        keysToRemove.push(key);
                    }
                }
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));
        if (keysToRemove.length > 0) {
            console.log(`오래된 정산 기록 ${keysToRemove.length}개 정리됨`);
        }
    } catch (e) {
        // 무시
    }
}

// ========================================
// 레이스 상태 체크
// ========================================

function checkRaceStatus() {
    const result = getNextRace();

    // getNextRace() 반환값 검증
    if (!result || !result.race) {
        console.warn('레이스 정보를 가져올 수 없습니다.');
        return;
    }

    const { race, index } = result;
    const raceDate = new Date(race.date);
    const raceEndDate = new Date(raceDate.getTime() + TOKEN_CONFIG.RACE_DURATION * 60 * 1000);
    const now = new Date();

    // 레이스 ID 생성
    const raceId = `race_${index + 1}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;

    // 레이스 진행 중인지 확인 (시작 시간 ~ 시작 + 2시간)
    if (now >= raceDate && now < raceEndDate) {
        if (!raceEnergyState.isRaceActive || raceEnergyState.raceId !== raceId) {
            // 새 레이스 시작
            raceEnergyState.isRaceActive = true;
            raceEnergyState.raceId = raceId;
            raceEnergyState.raceName = race.name;
            raceEnergyState.raceEndTime = raceEndDate;
            raceEnergyState.claimCount = 0;
            raceEnergyState.settlementNotified = false;  // 새 레이스이므로 리셋

            loadUserEnergyStatus(raceId);
        }
        showRaceEnergyBanner(race.name);
    } else {
        // 레이스 진행 중 아님
        if (raceEnergyState.isRaceActive) {
            hideRaceEnergyBanner();

            // 레이스 종료 감지 → 서버에 정산 요청
            if (!raceEnergyState.settlementNotified && raceEnergyState.raceId) {
                notifyRaceEnded(
                    raceEnergyState.raceId,
                    raceEnergyState.raceName,
                    raceEnergyState.raceEndTime
                );
            }

            raceEnergyState.isRaceActive = false;
        }
    }
}

// ========================================
// 레이스 종료 알림 (자동 정산 트리거)
// ========================================

/**
 * 레이스 종료를 서버에 알림 (정산 큐에 추가)
 */
async function notifyRaceEnded(raceId, raceName, raceEndTime) {
    // 이미 알림 전송했으면 스킵
    if (raceEnergyState.settlementNotified) {
        return;
    }

    try {
        console.log(`🏁 레이스 종료 감지: ${raceName}`);

        const response = await fetch('/api/race-ended', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                raceId: raceId,
                raceName: raceName,
                raceEndTime: raceEndTime ? raceEndTime.toISOString() : new Date().toISOString()
            })
        });

        // 🔒 응답 검증 추가 (HTTP 에러 처리)
        if (!response.ok) {
            throw new Error(`서버 에러: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            console.log(`✅ 정산 큐 등록 완료: ${raceName}`);
            raceEnergyState.settlementNotified = true;

            // 로컬 스토리지에도 기록 (페이지 새로고침 대비)
            try {
                localStorage.setItem(`settlement_notified_${raceId}`, 'true');
            } catch (e) {
                // 로컬 스토리지 접근 실패 무시
            }
        } else {
            console.warn('정산 큐 등록 실패:', data.error);
        }
    } catch (error) {
        console.error('레이스 종료 알림 실패:', error);
        // 실패해도 다음 체크에서 재시도됨
    }
}

// ========================================
// 사용자 에너지 상태 로드
// ========================================

async function loadUserEnergyStatus(raceId) {
    const user = getCurrentUser();
    if (!user) return;

    try {
        // 이 레이스에서 수집한 에너지 기록 조회
        const snapshot = await db.collection('raceEnergy')
            .where('userId', '==', user.uid)
            .where('raceId', '==', raceId)
            .orderBy('claimTime', 'desc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const lastClaim = snapshot.docs[0].data();
            raceEnergyState.lastClaimTime = lastClaim.claimTime.toDate();

            // 이 레이스에서 총 수집 횟수 계산
            const countSnapshot = await db.collection('raceEnergy')
                .where('userId', '==', user.uid)
                .where('raceId', '==', raceId)
                .get();

            raceEnergyState.claimCount = countSnapshot.size;
        } else {
            raceEnergyState.lastClaimTime = null;
            raceEnergyState.claimCount = 0;
        }

        updateEnergyBannerUI();
    } catch (error) {
        console.error('에너지 상태 로드 실패:', error);
        if (isNetworkError(error) && typeof showToast === 'function') {
            showToast('인터넷 연결을 확인해주세요', 'error');
        }
    }
}

// ========================================
// 배너 UI
// ========================================

function showRaceEnergyBanner(raceName) {
    let banner = document.getElementById('raceEnergyBanner');

    if (!banner) {
        // 배너 동적 생성
        banner = document.createElement('div');
        banner.id = 'raceEnergyBanner';
        banner.className = 'race-energy-banner';
        banner.innerHTML = `
            <div class="energy-banner-content">
                <span class="energy-icon">🏁</span>
                <div class="energy-info">
                    <h4 id="energyRaceName">${raceName} 진행 중!</h4>
                    <div class="energy-timer" id="energyTimer">다음 응원까지: --:--</div>
                    <div class="energy-collected" id="energyCollected">수집: 0/${raceEnergyState.maxClaims}</div>
                </div>
                <button class="energy-claim-btn" id="energyClaimBtn">
                    +${TOKEN_CONFIG.RACE_ENERGY} AMR
                </button>
            </div>
        `;
        document.body.appendChild(banner);

        // 버튼 이벤트
        document.getElementById('energyClaimBtn').addEventListener('click', claimRaceEnergy);
    }

    document.getElementById('energyRaceName').textContent = `${raceName} 진행 중!`;
    banner.classList.add('active');

    updateEnergyBannerUI();
    startEnergyCountdown();
}

function hideRaceEnergyBanner() {
    const banner = document.getElementById('raceEnergyBanner');
    if (banner) {
        banner.classList.remove('active');
    }

    if (raceEnergyState.countdownInterval) {
        clearInterval(raceEnergyState.countdownInterval);
    }
}

function updateEnergyBannerUI() {
    const user = getCurrentUser();
    const btn = document.getElementById('energyClaimBtn');
    const timerEl = document.getElementById('energyTimer');
    const collectedEl = document.getElementById('energyCollected');

    if (!btn) return;

    // 수집 횟수 표시
    if (collectedEl) {
        collectedEl.textContent = `수집: ${raceEnergyState.claimCount}/${raceEnergyState.maxClaims}`;
    }

    // 최대 수집 횟수 도달
    if (raceEnergyState.claimCount >= raceEnergyState.maxClaims) {
        btn.disabled = true;
        btn.textContent = '완료!';
        if (timerEl) timerEl.textContent = '오늘 응원 완료!';
        return;
    }

    // 로그인 필요
    if (!user) {
        btn.disabled = true;
        btn.textContent = '로그인 필요';
        if (timerEl) timerEl.textContent = '로그인하여 응원하세요';
        return;
    }

    // 다음 수집 가능 시간 계산
    if (raceEnergyState.lastClaimTime) {
        const nextClaim = new Date(raceEnergyState.lastClaimTime.getTime() + TOKEN_CONFIG.RACE_ENERGY_INTERVAL * 60 * 1000);
        const now = new Date();

        if (now < nextClaim) {
            raceEnergyState.nextClaimTime = nextClaim;
            btn.disabled = true;
            return;
        }
    }

    // 수집 가능
    btn.disabled = false;
    btn.textContent = `+${TOKEN_CONFIG.RACE_ENERGY} AMR`;
    if (timerEl) timerEl.textContent = '지금 응원하세요!';
    raceEnergyState.nextClaimTime = null;
}

function startEnergyCountdown() {
    if (raceEnergyState.countdownInterval) {
        clearInterval(raceEnergyState.countdownInterval);
    }

    raceEnergyState.countdownInterval = setInterval(() => {
        const timerEl = document.getElementById('energyTimer');
        const btn = document.getElementById('energyClaimBtn');

        if (!timerEl || !raceEnergyState.nextClaimTime) return;

        const now = new Date();
        const diff = raceEnergyState.nextClaimTime - now;

        if (diff <= 0) {
            // 수집 가능
            timerEl.textContent = '지금 응원하세요!';
            if (btn) {
                btn.disabled = false;
                btn.textContent = `+${TOKEN_CONFIG.RACE_ENERGY} AMR`;
            }
            raceEnergyState.nextClaimTime = null;
        } else {
            // 카운트다운 표시
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            timerEl.textContent = `다음 응원까지: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// ========================================
// 에너지 수집
// ========================================

async function claimRaceEnergy() {
    const user = getCurrentUser();
    if (!user) {
        showGlobalAlert('로그인이 필요합니다.', 'warning', '로그인 필요');
        return;
    }

    if (!raceEnergyState.isRaceActive) {
        showToast('현재 레이스가 진행 중이 아닙니다.', 'info');
        return;
    }

    // 클라이언트 측 쿨다운 확인 (UX용, 실제 검증은 서버에서)
    if (raceEnergyState.nextClaimTime && new Date() < raceEnergyState.nextClaimTime) {
        return;
    }

    const btn = document.getElementById('energyClaimBtn');
    btn.disabled = true;
    btn.textContent = '수집 중...';

    const raceId = raceEnergyState.raceId;
    const cooldownMs = TOKEN_CONFIG.RACE_ENERGY_INTERVAL * 60 * 1000;

    try {
        // 서버 API 호출 (어뷰징 방지)
        const idToken = await user.getIdToken();
        const response = await fetch('/api/token/race-energy', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raceId })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.error?.includes('쿨다운')) {
                throw new Error('COOLDOWN_NOT_EXPIRED');
            } else if (data.error?.includes('최대')) {
                throw new Error('MAX_CLAIMS_REACHED');
            }
            throw new Error(data.error || '에너지 수집 실패');
        }

        // 상태 업데이트
        const now = new Date();
        raceEnergyState.lastClaimTime = now;
        raceEnergyState.claimCount = data.claimCount;
        raceEnergyState.nextClaimTime = new Date(now.getTime() + cooldownMs);

        // UI 업데이트
        updateEnergyBannerUI();
        updateTokenDisplay();
        showTokenNotification(TOKEN_CONFIG.RACE_ENERGY, '레이스 응원!');

        console.log(`응원 에너지 수집: ${TOKEN_CONFIG.RACE_ENERGY} AMR (${data.claimCount}/${data.maxClaims})`);
    } catch (error) {
        console.error('에너지 수집 실패:', error);

        let msg = '응원 에너지 수집에 실패했습니다.';
        if (error.message === 'COOLDOWN_NOT_EXPIRED') {
            msg = '아직 쿨다운 중입니다. 잠시 후 다시 시도해주세요.';
        } else if (error.message === 'MAX_CLAIMS_REACHED') {
            msg = '이 레이스에서 최대 응원 횟수에 도달했습니다.';
            raceEnergyState.claimCount = raceEnergyState.maxClaims;
            updateEnergyBannerUI();
            return;
        } else if (isNetworkError(error)) {
            msg = '인터넷 연결을 확인해주세요';
        }

        showToast(msg, 'error');
        btn.disabled = false;
        btn.textContent = `+${TOKEN_CONFIG.RACE_ENERGY} AMR`;
    }
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    if (raceEnergyState.checkInterval) {
        clearInterval(raceEnergyState.checkInterval);
    }
    if (raceEnergyState.countdownInterval) {
        clearInterval(raceEnergyState.countdownInterval);
    }
});
