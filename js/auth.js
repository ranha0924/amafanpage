// ========================================
// Firebase Authentication (Google Login)
// ========================================

// Google 로그인
async function signInWithGoogle() {
    if (!isAuthConnected()) {
        console.warn('Firebase Auth가 연결되지 않았습니다.');
        alert('로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
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

        if (error.code === 'auth/popup-closed-by-user') {
            console.log('사용자가 로그인 창을 닫았습니다.');
        } else if (error.code === 'auth/popup-blocked') {
            alert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
        } else if (error.code === 'auth/operation-not-allowed') {
            alert('Google 로그인이 Firebase Console에서 활성화되지 않았습니다.\n\nFirebase Console > Authentication > Sign-in method에서 Google을 활성화해주세요.');
        } else if (error.code === 'auth/unauthorized-domain') {
            alert('이 도메인은 Firebase에서 승인되지 않았습니다.\n\nFirebase Console > Authentication > Settings > Authorized domains에서 현재 도메인을 추가해주세요.\n\n현재 도메인: ' + window.location.hostname);
        } else {
            alert('로그인 실패: ' + error.code + '\n' + error.message);
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
        alert('로그아웃에 실패했습니다.');
    }
}

// UI 업데이트 - 로그인된 사용자 정보 표시
function updateUIForUser(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;

    if (user) {
        // 로그인 상태
        const photoURL = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
        const displayName = user.displayName || '사용자';

        authContainer.innerHTML = `
            <div class="user-info">
                <img src="${photoURL}" alt="프로필" class="user-avatar" referrerpolicy="no-referrer">
                <span class="user-name">${displayName}</span>
                <button class="logout-btn" onclick="signOutUser()">로그아웃</button>
            </div>
        `;
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
        } else {
            console.log('로그아웃 상태');
        }
    });
}

// 현재 로그인된 사용자 가져오기
function getCurrentUser() {
    if (!isAuthConnected()) return null;
    return auth.currentUser;
}

// 페이지 로드 시 Auth 리스너 초기화
document.addEventListener('DOMContentLoaded', initAuthListener);
