// ========================================
// AMR Token System - Core Module
// TOKEN_CONFIG는 constants.js에서 정의됨
// ========================================

// ========================================
// 코인 관련 유틸리티 함수
// ========================================

/**
 * 현재 사용자의 코인 정보 가져오기 (서버 API 사용)
 */
async function getUserTokens() {
    const user = getCurrentUser();
    if (!user) return null;

    try {
        // 서버 API로 조회 (더 안전)
        const idToken = await user.getIdToken();
        const response = await fetch('/api/token/balance', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (response.ok) {
            // 🔒 보안: JSON 파싱 에러 처리 (H-4)
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('토큰 API JSON 파싱 실패:', parseError);
                // Firestore 폴백으로 진행
                data = { success: false };
            }

            if (data.success) {
                return {
                    tokens: data.tokens,
                    totalEarned: data.totalEarned,
                    consecutiveDays: data.consecutiveDays,
                    lastAttendance: data.lastAttendance
                };
            }
        }

        // 서버 API 실패시 Firestore 직접 조회 폴백
        if (!isFirebaseConnected()) return null;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            return doc.data();
        }
        // 신규 사용자인 경우 초기화
        return await initializeUserTokens(user.uid);
    } catch (error) {
        console.error('코인 정보 가져오기 실패:', error);
        if (isNetworkError(error) && typeof showToast === 'function') {
            showToast('인터넷 연결을 확인해주세요', 'error');
        }
        return null;
    }
}

/**
 * 신규 사용자 코인 계정 초기화
 */
async function initializeUserTokens(userId) {
    if (!isFirebaseConnected()) return null;

    const initialData = {
        tokens: 0,
        totalEarned: 0,
        lastAttendance: null,
        consecutiveDays: 0,
        firstPostDate: null,
        lastShareDate: null,
        lastLuckyItemDate: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('users').doc(userId).set(initialData, { merge: true });
        console.log('코인 계정 초기화 완료');
        return initialData;
    } catch (error) {
        console.error('코인 계정 초기화 실패:', error);
        if (isNetworkError(error) && typeof showToast === 'function') {
            showToast('인터넷 연결을 확인해주세요', 'error');
        }
        return null;
    }
}

/**
 * 코인 양 유효성 검증
 * @param {number} amount - 검증할 코인 양
 * @returns {boolean} 유효 여부
 */
function isValidTokenAmount(amount) {
    // 베팅에서 최대 3000 (3포지션 x 1000) 까지 사용 가능
    return Number.isInteger(amount) && amount >= 1 && amount <= 3000;
}

/**
 * 코인 추가 - 클라이언트에서 직접 호출 금지 (어뷰징 방지)
 * 서버 API를 통해서만 토큰 지급 가능
 * 🔒 보안 강화: throw Error로 변경하여 함수 재정의 악용 방지
 * @deprecated 서버 API(/api/token/attendance, /api/token/first-post 등)를 사용하세요
 */
async function addTokens(amount, reason) {
    throw new Error('Unauthorized: 토큰 지급은 서버에서만 가능합니다. 사용 가능한 API: /api/token/attendance, /api/token/first-post, /api/token/lucky-item');
}

/**
 * 코인 차감 (서버 API 사용 - 어뷰징 방지)
 * @param {number} amount - 차감할 코인 양
 * @param {string} reason - 차감 사유
 */
async function deductTokens(amount, reason) {
    const user = getCurrentUser();
    if (!user) return false;

    // 코인 양 유효성 검증
    if (!isValidTokenAmount(amount)) {
        console.error('잘못된 코인 양:', amount);
        return false;
    }

    // 🔒 보안: reason 검증 (H-12)
    if (typeof reason !== 'string' || reason.length === 0 || reason.length > 200) {
        console.error('잘못된 차감 사유:', reason);
        return false;
    }

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/token/deduct', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount, reason })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.error?.includes('부족')) {
                showGlobalAlert('코인이 부족합니다!', 'warning', '잔액 부족');
            } else {
                // 🔒 보안: 서버 에러 메시지 직접 노출 방지
                console.error('코인 차감 서버 에러:', data.error);
                throw new Error('코인 차감에 실패했습니다.');
            }
            return false;
        }

        // UI 업데이트
        updateTokenDisplay();

        console.log(`코인 차감: ${amount} AMR (${reason})`);
        return true;
    } catch (error) {
        console.error('코인 차감 실패:', error);
        if (isNetworkError(error)) {
            if (typeof showToast === 'function') showToast('인터넷 연결을 확인해주세요', 'error');
        }
        return false;
    }
}

/**
 * 오늘 이미 보상을 받았는지 확인
 * @param {string} field - 확인할 필드명 (lastAttendance, lastShareDate 등)
 */
async function hasClaimedToday(field) {
    const userData = await getUserTokens();
    if (!userData || !userData[field]) return false;

    const lastDate = userData[field].toDate ? userData[field].toDate() : new Date(userData[field]);
    const today = new Date();

    return lastDate.getFullYear() === today.getFullYear() &&
           lastDate.getMonth() === today.getMonth() &&
           lastDate.getDate() === today.getDate();
}

// ========================================
// UI 관련 함수
// ========================================

/**
 * 헤더에 코인 표시 업데이트
 */
async function updateTokenDisplay() {
    const tokenDisplay = document.getElementById('tokenDisplay');
    if (!tokenDisplay) return;

    const user = getCurrentUser();
    if (!user) {
        tokenDisplay.style.display = 'none';
        return;
    }

    const userData = await getUserTokens();
    if (userData) {
        // 🔒 undefined 방지: tokens가 없으면 0으로 처리
        const tokens = userData.tokens ?? 0;
        tokenDisplay.innerHTML = `
            <div class="token-balance" onclick="showTokenModal()">
                <img src="images/AMRcoin.png" alt="AMR" class="token-icon-img">
                <span class="token-amount">${tokens.toLocaleString()}</span>
                <span class="token-label">AMR</span>
            </div>
        `;
        tokenDisplay.style.display = 'flex';
    }
}

/**
 * 코인 획득 알림 표시
 */
function showTokenNotification(amount, reason) {
    // 기존 알림 제거
    const existingNotif = document.querySelector('.token-notification');
    if (existingNotif) existingNotif.remove();

    const notification = document.createElement('div');
    notification.className = 'token-notification';
    notification.innerHTML = `
        <div class="token-notif-content">
            <img src="images/AMRcoin.png" alt="AMR" class="token-notif-icon-img">
            <span class="token-notif-text">+${amount} AMR</span>
            <span class="token-notif-reason">${reason}</span>
        </div>
    `;
    document.body.appendChild(notification);

    // 애니메이션 후 제거
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * 코인 상세 모달 표시
 */
async function showTokenModal() {
    const user = getCurrentUser();
    if (!user) return;

    const userData = await getUserTokens();
    if (!userData) return;

    // 기존 모달 제거
    const existingModal = document.getElementById('tokenModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'tokenModal';
    modal.className = 'token-modal';
    modal.innerHTML = `
        <div class="token-modal-overlay" onclick="closeTokenModal()"></div>
        <div class="token-modal-content">
            <button class="token-modal-close" onclick="closeTokenModal()">&times;</button>
            <h2 class="token-modal-title">내 AMR 코인</h2>

            <div class="token-balance-large">
                <img src="images/AMRcoin.png" alt="AMR" class="token-icon-large-img">
                <span class="token-amount-large">${userData.tokens.toLocaleString()}</span>
                <span class="token-label-large">AMR</span>
            </div>

            <div class="token-stats">
                <div class="token-stat">
                    <span class="stat-label">누적 획득</span>
                    <span class="stat-value">${userData.totalEarned.toLocaleString()} AMR</span>
                </div>
                <div class="token-stat">
                    <span class="stat-label">연속 출석</span>
                    <span class="stat-value">${userData.consecutiveDays}일</span>
                </div>
            </div>

            <div class="token-earn-methods">
                <h3>코인 획득 방법</h3>
                <ul>
                    <li><span class="earn-icon">📅</span> 출석체크 <span class="earn-amount">+${TOKEN_CONFIG.ATTENDANCE} AMR</span></li>
                    <li><span class="earn-icon">🔥</span> 7일 연속 출석 보너스 <span class="earn-amount">+${TOKEN_CONFIG.ATTENDANCE_STREAK_BONUS} AMR</span></li>
                    <li><span class="earn-icon">📊</span> 순위 예측 공유 <span class="earn-amount">+${TOKEN_CONFIG.SHARE_PREDICTION} AMR</span></li>
                    <li><span class="earn-icon">✏️</span> 첫 글 작성 <span class="earn-amount">+${TOKEN_CONFIG.FIRST_POST} AMR</span></li>
                    <li><span class="earn-icon">🎁</span> 행운 아이템 보기 <span class="earn-amount">+${TOKEN_CONFIG.LUCKY_ITEM} AMR</span></li>
                    <li><span class="earn-icon">🏁</span> 레이스 응원 <span class="earn-amount">+${TOKEN_CONFIG.RACE_ENERGY} AMR/10분</span></li>
                </ul>
            </div>

            <div class="token-modal-actions">
                <a href="betting.html" class="token-action-btn">🎰 포디움 베팅하러 가기</a>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);
}

/**
 * 코인 모달 닫기
 */
function closeTokenModal() {
    const modal = document.getElementById('tokenModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

// ========================================
// 초기화
// ========================================

// Auth 상태 변경 시 코인 표시 업데이트
document.addEventListener('DOMContentLoaded', () => {
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                // 코인 계정이 없으면 초기화
                getUserTokens().then(userData => {
                    if (!userData) {
                        initializeUserTokens(user.uid);
                    }
                    updateTokenDisplay();
                });
            } else {
                updateTokenDisplay();
            }
        });
    }
});
