// ========================================
// Firebase Authentication (Google Login)
// ========================================

// ALLOWED_PHOTO_DOMAINS, getSafePhotoURL은 utils.js에서 제공

// Google 로그인
async function signInWithGoogle() {
    if (!isAuthConnected()) {
        console.warn('Firebase Auth가 연결되지 않았습니다.');
        showGlobalAlert('로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.', 'error', '연결 오류');
        return;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        console.log('Google 로그인 성공:', result.user.displayName);
    } catch (error) {
        console.error('Google 로그인 실패:', error);
        console.error('에러 코드:', error.code);
        console.error('에러 메시지:', error.message);

        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            console.log('사용자가 로그인 창을 닫았습니다.');
        } else if (error.code === 'auth/popup-blocked') {
            showGlobalAlert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.', 'warning', '팝업 차단');
        } else if (error.code === 'auth/operation-not-allowed') {
            showGlobalAlert('Google 로그인이 Firebase Console에서 활성화되지 않았습니다.\n\nFirebase Console > Authentication > Sign-in method에서 Google을 활성화해주세요.', 'error', '설정 오류');
        } else if (error.code === 'auth/unauthorized-domain') {
            showGlobalAlert('이 도메인은 Firebase에서 승인되지 않았습니다.\n\nFirebase Console > Authentication > Settings > Authorized domains에서 현재 도메인을 추가해주세요.\n\n현재 도메인: ' + window.location.hostname, 'error', '도메인 오류');
        } else if (isNetworkError(error)) {
            showGlobalAlert('인터넷 연결을 확인해주세요', 'error', '네트워크 오류');
        } else {
            // H-5: 보안을 위해 상세 에러 정보는 콘솔에만 기록, 사용자에게는 일반 메시지 표시
            console.error('로그인 에러 상세:', error.code, error.message);
            showGlobalAlert('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error', '로그인 실패');
        }
    }
}

// 로그아웃
async function signOutUser() {
    if (!isAuthConnected()) {
        console.warn('Firebase Auth가 연결되지 않았습니다.');
        return;
    }

    try {
        await auth.signOut();
        console.log('로그아웃 성공');
    } catch (error) {
        console.error('로그아웃 실패:', error);
        showGlobalAlert(isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '로그아웃에 실패했습니다.', 'error', '로그아웃 실패');
    }
}

// UI 업데이트 - 로그인된 사용자 정보 표시
function updateUIForUser(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;

    if (user) {
        // 로그인 상태
        const displayName = user.displayName || '사용자';

        // XSS 방지: displayName 이스케이프 (C-1)
        const safeDisplayName = escapeHtml(displayName);
        // photoURL 검증: 허용된 도메인만 (XSS 방지) - utils.js의 getSafePhotoURL 사용
        const safePhotoURL = getSafePhotoURL(user.photoURL);

        authContainer.innerHTML = `
            <div id="tokenDisplay" class="token-display"></div>
            <div class="user-info">
                <img src="${safePhotoURL}" alt="프로필" class="user-avatar" referrerpolicy="no-referrer">
                <span class="user-name">${safeDisplayName}</span>
                <button class="logout-btn" onclick="signOutUser()">로그아웃</button>
            </div>
        `;

        // 토큰 표시 업데이트
        if (typeof updateTokenDisplay === 'function') {
            updateTokenDisplay();
        }
    } else {
        // 로그아웃 상태
        authContainer.innerHTML = `
            <button class="login-btn" onclick="signInWithGoogle()">
                <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                로그인
            </button>
        `;
    }
}

// Auth 상태 변경 리스너 초기화
function initAuthListener() {
    if (!isAuthConnected()) {
        console.warn('Firebase Auth가 연결되지 않았습니다.');
        // Auth 없이도 UI 초기화 (로그인 버튼 표시)
        updateUIForUser(null);
        return;
    }

    auth.onAuthStateChanged((user) => {
        updateUIForUser(user);
        if (user) {
            console.log('로그인 상태:', user.displayName);
            // 🔒 ID Token 자동 갱신 시작
            tokenManager.startAutoRefresh();
        } else {
            console.log('로그아웃 상태');
            // ID Token 갱신 중지
            tokenManager.stopAutoRefresh();
        }
    });
}

// 현재 로그인된 사용자 가져오기
function getCurrentUser() {
    if (!isAuthConnected()) return null;
    return auth.currentUser;
}

// ========================================
// 🔒 보안 강화: ID Token 자동 갱신 로직
// Firebase ID Token은 1시간 후 만료됨
// ========================================

// Token 갱신 관리자
const tokenManager = {
    refreshInterval: null,
    REFRESH_INTERVAL_MS: 50 * 60 * 1000, // 50분마다 갱신 (만료 10분 전)

    // 토큰 갱신 시작
    startAutoRefresh() {
        this.stopAutoRefresh(); // 기존 interval 정리

        // 즉시 한 번 갱신 시도
        this.refreshToken();

        // 주기적 갱신 설정
        this.refreshInterval = setInterval(() => {
            this.refreshToken();
        }, this.REFRESH_INTERVAL_MS);

        console.log('ID Token 자동 갱신 시작');
    },

    // 토큰 갱신 중지
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },

    // 토큰 갱신 실행
    async refreshToken() {
        const user = getCurrentUser();
        if (!user) return;

        try {
            // forceRefresh: true로 강제 갱신
            await user.getIdToken(true);
            console.log('ID Token 갱신 완료');
        } catch (error) {
            console.error('ID Token 갱신 실패:', error);
            // 갱신 실패 시 사용자에게 재로그인 안내
            if (error.code === 'auth/user-token-expired' ||
                error.code === 'auth/invalid-user-token') {
                showGlobalAlert('세션이 만료되었습니다. 다시 로그인해주세요.', 'warning', '세션 만료');
                // 로그아웃 처리
                signOutUser();
            }
        }
    }
};

// 신선한 토큰 가져오기 (API 호출 시 사용)
async function getFreshIdToken() {
    const user = getCurrentUser();
    if (!user) {
        throw new Error('로그인이 필요합니다.');
    }
    // forceRefresh: false (캐시된 토큰이 유효하면 사용)
    return await user.getIdToken();
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
    tokenManager.stopAutoRefresh();
});

// 페이지 로드 시 Auth 리스너 초기화
document.addEventListener('DOMContentLoaded', initAuthListener);
