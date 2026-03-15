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
                    lastAttendance: data.lastAttendance,
                    createdAt: data.createdAt,
                    selectedTeam: data.selectedTeam,
                    lastTeamChange: data.lastTeamChange
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

    // Firebase Auth에서 현재 사용자 정보 가져오기
    const user = getCurrentUser();

    const initialData = {
        tokens: 0,
        totalEarned: 0,
        lastAttendance: null,
        consecutiveDays: 0,
        firstPostDate: null,
        lastShareDate: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        // 사용자 프로필 정보 (리더보드용)
        displayName: (typeof getEffectiveDisplayName === 'function' ? getEffectiveDisplayName(user) : user?.displayName) || '익명',
        photoURL: user?.photoURL || null
    };

    try {
        await db.collection('users').doc(userId).set(initialData, { merge: true });
        logger.log('코인 계정 초기화 완료');
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

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('JSON 파싱 실패:', parseError);
            throw new Error('서버 응답 형식 오류');
        }

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

        logger.log(`코인 차감: ${amount} FC (${reason})`);
        return true;
    } catch (error) {
        console.error('코인 차감 실패:', error);
        if (isNetworkError(error)) {
            if (typeof showToast === 'function') showToast('인터넷 연결을 확인해주세요', 'error');
        }
        return false;
    }
}

// ========================================
// UI 관련 함수
// ========================================

/**
 * 헤더에 코인 표시 업데이트
 * @param {Object|null} cachedData - 이미 조회한 사용자 데이터 (중복 API 호출 방지)
 */
async function updateTokenDisplay(cachedData = null) {
    const tokenDisplay = document.getElementById('tokenDisplay');
    if (!tokenDisplay) return;

    const user = getCurrentUser();
    if (!user) {
        tokenDisplay.style.display = 'none';
        return;
    }

    // 캐시된 데이터가 있으면 사용, 없으면 API 호출
    const userData = cachedData || await getUserTokens();
    if (userData) {
        // 🔒 undefined 방지: tokens가 없으면 0으로 처리
        const tokens = userData.tokens ?? 0;
        tokenDisplay.innerHTML = `
            <div class="token-balance">
                <img src="images/AMRcoin.png" alt="FC" class="token-icon-img">
                <span class="token-amount">${tokens.toLocaleString()}</span>
                <span class="token-label">FC</span>
            </div>
        `;
        tokenDisplay.style.display = 'flex';
    }
}

/**
 * 코인 획득 알림 표시 (showToast 스타일 통일)
 */
function showTokenNotification(amount, reason) {
    if (typeof showToast === 'function') {
        showToast(`+${amount} FC  ${reason}`, 'success');
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
                    updateTokenDisplay(userData);  // 이미 조회한 데이터 전달 (중복 API 호출 방지)
                });
            } else {
                updateTokenDisplay(null);
            }
        });
    }
});
