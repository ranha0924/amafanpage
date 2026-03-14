// ========================================
// My Page Module
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMyPage();
});

/**
 * 마이페이지 초기화
 */
function initMyPage() {
    // URL에서 uid 파라미터 확인 (다른 사용자 프로필 보기)
    const urlParams = new URLSearchParams(window.location.search);
    const viewUid = urlParams.get('uid');

    // 탭 이벤트 설정
    setupTabs();

    // 회원 탈퇴 버튼 이벤트
    setupDeleteAccount();

    // 토큰 내역 페이지네이션 이벤트 설정
    setupTokenPagination();

    // 닉네임 변경 이벤트 설정
    setupNicknameChange();

    // Auth 상태 리스너
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            // uid가 있고, 본인이 아닌 경우 → 공개 프로필 모드
            if (viewUid && (!user || user.uid !== viewUid)) {
                showMyPage();
                hidePrivateSections();
                try {
                    await loadPublicProfile(viewUid);
                } catch (e) {
                    console.error('공개 프로필 로드 실패:', e);
                    if (typeof showToast === 'function') {
                        showToast('프로필을 불러오는데 실패했습니다.', 'error');
                    }
                }
                return;
            }

            if (user) {
                showMyPage();
                try {
                    await loadUserProfile(user);
                    await loadBettingWinRate(user);
                    await loadMyPosts();
                    // 인벤토리는 별도 페이지(inventory.html)로 분리됨
                    // 출석체크 UI는 attendance.js에서 자동으로 업데이트됨
                } catch (e) {
                    console.error('마이페이지 데이터 로드 실패:', e);
                    if (typeof showToast === 'function') {
                        showToast('데이터를 불러오는데 실패했습니다.', 'error');
                    }
                }
            } else {
                hideMyPage();
            }
        });
    } else if (viewUid) {
        // auth 객체가 없는 경우에도 공개 프로필은 표시
        showMyPage();
        hidePrivateSections();
        loadPublicProfile(viewUid);
    }
}

/**
 * 마이페이지 표시
 */
function showMyPage() {
    document.getElementById('loginRequiredSection').style.display = 'none';
    document.getElementById('mypageMain').style.display = '';
}

/**
 * 마이페이지 숨김
 */
function hideMyPage() {
    document.getElementById('loginRequiredSection').style.display = 'flex';
    document.getElementById('mypageMain').style.display = 'none';
}

/**
 * 탭 설정
 */
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // 버튼 활성화
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 탭 컨텐츠 표시
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabId}Tab`).classList.add('active');

            // 탭별 데이터 로드
            if (tabId === 'bets') {
                loadMyBets();
            } else if (tabId === 'tokens') {
                // 페이지네이션 상태 리셋 후 1페이지 로드
                tokenHistoryState.currentPage = 1;
                tokenHistoryState.cursors = { 1: null };
                tokenHistoryState.hasMore = false;
                loadTokenHistory(1);
            }
        });
    });

    // 베팅 서브탭 설정
    setupBetSubTabs();
}

/**
 * 베팅 서브탭 설정 (포디움 / 1:1)
 */
function setupBetSubTabs() {
    const subTabs = document.querySelectorAll('.bet-sub-tab');

    subTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.betTab;

            subTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.bet-sub-content').forEach(c => {
                c.classList.remove('active');
            });

            const contentMap = {
                overall: 'overallBetContent',
                podium: 'podiumBetContent',
                h2h: 'h2hBetContent'
            };
            document.getElementById(contentMap[target]).classList.add('active');
        });
    });
}

/**
 * 사용자 프로필 로드
 */
async function loadUserProfile(user) {
    // 기본 프로필 정보 (🔒 getSafePhotoURL 사용으로 XSS 방지)
    const profilePhotoEl = document.getElementById('profilePhoto');
    profilePhotoEl.src = getSafePhotoURL(user.photoURL, 'images/default-avatar.png');
    document.getElementById('profileName').textContent = user.displayName || '사용자';
    document.getElementById('profileEmail').textContent = user.email || '';

    // 코스메틱 표시
    if (typeof fetchUserCosmetics === 'function' && typeof renderCosmeticAvatar === 'function') {
        try {
            const cosmetics = await fetchUserCosmetics(user.uid);

            // 프로필 아바타에 테두리 적용 (renderCosmeticAvatar 사용)
            const profileSize = profilePhotoEl.offsetWidth || 72;
            const avatarHtml = renderCosmeticAvatar(user.photoURL, cosmetics, profileSize);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = avatarHtml;
            const newAvatarEl = tempDiv.firstElementChild;

            // 기존 wrap이 있으면 교체, 없으면 img를 교체
            const existingWrap = profilePhotoEl.parentElement;
            if (existingWrap && existingWrap.classList.contains('cosmetic-avatar-wrap')) {
                existingWrap.replaceWith(newAvatarEl);
            } else {
                profilePhotoEl.replaceWith(newAvatarEl);
            }

            // renderCosmeticAvatar가 생성한 img에 원래 id/class 복원
            const newImg = newAvatarEl.classList.contains('cosmetic-avatar-wrap')
                ? newAvatarEl.querySelector('.cosmetic-avatar')
                : newAvatarEl;
            newImg.id = 'profilePhoto';
            newImg.classList.add('profile-avatar-lg');

            // 닉네임 컬러 적용 (이전 컬러 클래스 제거 후 새 클래스 추가)
            const nameEl = document.getElementById('profileName');
            if (nameEl) {
                nameEl.className = nameEl.className.replace(/\bcolor-\S+/g, '').trim();
                if (cosmetics.nicknameColor && cosmetics.nicknameColor.cssClass) {
                    nameEl.classList.add(cosmetics.nicknameColor.cssClass);
                }
            }

            // 뱃지 표시 (기존 뱃지 제거 후 재생성)
            const nameRow = document.querySelector('.profile-name-row');
            if (nameRow) {
                const oldBadge = nameRow.querySelector('.cosmetic-badge');
                if (oldBadge) oldBadge.remove();

                if (cosmetics.badge && cosmetics.badge.svgIcon) {
                    const badgeImg = document.createElement('img');
                    badgeImg.src = `images/icons/${cosmetics.badge.svgIcon}`;
                    badgeImg.className = 'cosmetic-badge';
                    badgeImg.alt = cosmetics.badge.name || '';
                    badgeImg.title = cosmetics.badge.name || '';
                    nameRow.insertBefore(badgeImg, nameRow.querySelector('.nickname-btn'));
                }
            }
        } catch (e) {
            console.warn('프로필 코스메틱 로드 실패:', e);
        }
    }

    // 코인 정보 로드
    const userData = await getUserTokens();
    if (userData) {
        document.getElementById('profileTokens').textContent = (userData.tokens || 0).toLocaleString();
        document.getElementById('profileStreak').textContent = `${userData.consecutiveDays || 0}일`;

        // 가입일
        if (userData.createdAt) {
            // 서버에서 받은 Firestore Timestamp 형식 처리
            let joinDate;
            if (userData.createdAt.toDate) {
                joinDate = userData.createdAt.toDate();
            } else if (userData.createdAt._seconds) {
                joinDate = new Date(userData.createdAt._seconds * 1000);
            } else {
                joinDate = new Date(userData.createdAt);
            }
            document.getElementById('profileJoinDate').textContent = formatDate(joinDate);
        } else {
            // 신규 사용자: createdAt이 null인 경우
            document.getElementById('profileJoinDate').textContent = formatDate(new Date());
        }
    }

    // 닉네임 변경 가능 여부 확인
    await checkNicknameChangeAvailable(user);

    // 팀 선택 표시
    loadTeamSelector(user, userData);
}

/**
 * 베팅 적중률 로드 (포디움 + H2H)
 */
async function loadBettingWinRate(user) {
    if (!user) return;

    let totalBets = 0;
    let wonBets = 0;

    try {
        // 🔒 타임아웃 적용 (8초) - 무한 로딩 방지
        // 포디움 베팅 통계
        const podiumSnapshot = await withTimeout(
            db.collection('podiumBets')
                .where('userId', '==', user.uid)
                .get(),
            8000
        );

        podiumSnapshot.docs.forEach(doc => {
            const bet = doc.data();
            // pending이 아닌 베팅만 카운트
            if (bet.status === 'won' || bet.status === 'lost') {
                totalBets++;
                if (bet.status === 'won') wonBets++;
            }
        });

        // H2H 베팅 통계
        const h2hSnapshot = await withTimeout(
            db.collection('headToHeadBets')
                .where('userId', '==', user.uid)
                .get(),
            8000
        );

        h2hSnapshot.docs.forEach(doc => {
            const bet = doc.data();
            // pending, void가 아닌 베팅만 카운트
            if (bet.status === 'won' || bet.status === 'lost') {
                totalBets++;
                if (bet.status === 'won') wonBets++;
            }
        });

        // UI 업데이트
        const winRate = totalBets > 0 ? Math.round(wonBets / totalBets * 100) : 0;
        const winRateEl = document.getElementById('profileWinRate');
        const totalBetsEl = document.getElementById('profileTotalBets');
        const wonBetsEl = document.getElementById('profileWonBets');

        if (winRateEl) {
            // 베팅 기록 없으면 "-" 표시
            winRateEl.textContent = totalBets > 0 ? `${winRate}%` : '2026 시즌 개막 후 업데이트';
        }
        if (totalBetsEl) totalBetsEl.value = totalBets;
        if (wonBetsEl) wonBetsEl.value = wonBets;

    } catch (error) {
        console.error('베팅 적중률 로드 실패:', error);
        // 🔒 타임아웃 에러 시 사용자에게 알림
        if (error.message?.includes('TIMEOUT')) {
            if (typeof showToast === 'function') {
                showToast('데이터 로드가 지연되고 있습니다.', 'warning');
            }
        }
    }
}

/**
 * 내 게시글 로드
 */
async function loadMyPosts() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('myPostsList');

    try {
        // 🔒 타임아웃 적용 (8초) - 무한 로딩 방지
        const snapshot = await withTimeout(
            db.collection('posts')
                .where('authorId', '==', user.uid)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get(),
            8000
        );

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-pencil.svg" alt="" class="empty-icon">
                    <p class="empty-title">작성한 게시글이 없습니다.</p>
                    <a href="paddock.html" class="empty-cta">게시판 바로가기</a>
                </div>
            `;
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const post = doc.data();
            const tagClass = getTagClass(post.tag);
            const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();

            return `
                <div class="post-item" onclick="window.location.href='paddock.html?post=${doc.id}'">
                    <span class="post-tag ${tagClass}">#${post.tag}</span>
                    <div class="post-info">
                        <div class="post-title">${escapeHtml(post.title)}</div>
                        <div class="post-meta">
                            <span>${formatDate(createdAt)}</span>
                            <span>${post.likeCount || 0} 공감</span>
                            <span>${post.commentCount || 0} 댓글</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('게시글 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '게시글을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    }
}

/**
 * 내 베팅 내역 로드 (포디움 + H2H)
 */
async function loadMyBets() {
    const user = getCurrentUser();
    if (!user) return;

    // 포디움 베팅과 H2H 베팅 동시에 로드
    await Promise.all([
        loadPodiumBets(user),
        loadH2HBetsForMyPage(user)
    ]);

    // 전체 통계 업데이트
    updateOverallStats();
}

/**
 * 포디움 베팅 로드
 */
async function loadPodiumBets(user) {
    const container = document.getElementById('myBetsList');

    try {
        const snapshot = await db.collection('podiumBets')
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        // 통계 계산 (정산된 베팅만)
        let totalSettled = 0;
        let wonBets = 0;

        snapshot.docs.forEach(doc => {
            const bet = doc.data();
            if (bet.status === 'won' || bet.status === 'lost') {
                totalSettled++;
                if (bet.status === 'won') wonBets++;
            }
        });

        document.getElementById('totalBets').textContent = snapshot.docs.length;
        document.getElementById('wonBets').textContent = wonBets;
        document.getElementById('winRate').textContent = totalSettled > 0 ? `${Math.round(wonBets / totalSettled * 100)}%` : '0%';

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-target.svg" alt="" class="empty-icon">
                    <p class="empty-title">아직 포디움 베팅 기록이 없습니다</p>
                    <p class="empty-subtitle">첫 예측에 도전해보세요!</p>
                    <a href="betting.html" class="empty-cta">베팅하러 가기 →</a>
                </div>
            `;
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const bet = doc.data();
            const statusClass = bet.status === 'won' ? 'status-won' :
                               bet.status === 'lost' ? 'status-lost' : 'status-pending';
            const statusText = bet.status === 'won' ? '당첨' :
                              bet.status === 'lost' ? '낙첨' : '대기중';

            return `
                <div class="bet-item ${statusClass}">
                    <div class="bet-race">
                        <span class="race-name">${bet.raceName}</span>
                        <span class="bet-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="bet-details">
                        ${bet.bets.map(b => {
                            const driver = typeof getDriverByNumber !== 'undefined' ? getDriverByNumber(b.driverNumber) : null;
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
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('포디움 베팅 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '베팅 내역을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    }
}

/**
 * H2H 베팅 로드 (마이페이지용)
 */
async function loadH2HBetsForMyPage(user) {
    const container = document.getElementById('myH2HBetsListPage');

    try {
        const snapshot = await db.collection('headToHeadBets')
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        // 통계 계산 (정산된 베팅만, void 제외)
        let totalSettled = 0;
        let wonBets = 0;

        snapshot.docs.forEach(doc => {
            const bet = doc.data();
            if (bet.status === 'won' || bet.status === 'lost') {
                totalSettled++;
                if (bet.status === 'won') wonBets++;
            }
        });

        document.getElementById('h2hTotalBets').textContent = snapshot.docs.filter(d => d.data().status !== 'void').length;
        document.getElementById('h2hWonBets').textContent = wonBets;
        document.getElementById('h2hWinRate').textContent = totalSettled > 0 ? `${Math.round(wonBets / totalSettled * 100)}%` : '0%';

        // void 상태 제외한 베팅만 표시
        const activeBets = snapshot.docs.filter(doc => doc.data().status !== 'void');

        if (activeBets.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-swords.svg" alt="" class="empty-icon">
                    <p class="empty-title">아직 1:1 베팅 기록이 없습니다</p>
                    <p class="empty-subtitle">드라이버 대결을 예측해보세요!</p>
                    <a href="betting.html" class="empty-cta">베팅하러 가기 →</a>
                </div>
            `;
            return;
        }

        container.innerHTML = activeBets.map(doc => {
            const bet = doc.data();
            const statusClass = bet.status === 'won' ? 'status-won' :
                               bet.status === 'lost' ? 'status-lost' : 'status-pending';
            const statusText = bet.status === 'won' ? '당첨' :
                              bet.status === 'lost' ? '낙첨' : '대기중';

            // 예측한 드라이버가 A인지 B인지 확인
            const isDriverAPredicted = bet.matchup.driverA.number === bet.predictedWinner;

            return `
                <div class="bet-item h2h-bet-item ${statusClass}">
                    <div class="bet-race">
                        <span class="race-name">${bet.raceName}</span>
                        <span class="bet-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="h2h-matchup-display">
                        <span class="matchup-driver ${isDriverAPredicted ? 'predicted' : ''}">${bet.matchup.driverA.name}</span>
                        <span class="matchup-vs">VS</span>
                        <span class="matchup-driver ${!isDriverAPredicted ? 'predicted' : ''}">${bet.matchup.driverB.name}</span>
                    </div>
                    <div class="bet-total">
                        <span>베팅: ${bet.betAmount} FC x ${bet.odds.toFixed(2)}x</span>
                        <span class="win-amount">예상: ${bet.potentialWin} FC</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('H2H 베팅 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '베팅 내역을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    }
}

/**
 * 전체 베팅 통계 업데이트
 */
function updateOverallStats() {
    // 포디움 통계
    const podiumTotal = parseInt(document.getElementById('totalBets')?.textContent || '0');
    const podiumWon = parseInt(document.getElementById('wonBets')?.textContent || '0');

    // H2H 통계
    const h2hTotal = parseInt(document.getElementById('h2hTotalBets')?.textContent || '0');
    const h2hWon = parseInt(document.getElementById('h2hWonBets')?.textContent || '0');

    // 전체 통계 계산
    const overallTotal = podiumTotal + h2hTotal;
    const overallWon = podiumWon + h2hWon;

    // 정산된 베팅 기준 적중률 계산
    const podiumWinRateText = document.getElementById('winRate')?.textContent || '0%';
    const h2hWinRateText = document.getElementById('h2hWinRate')?.textContent || '0%';

    // 적중률 계산 (정산된 베팅만)
    // 프로필 섹션의 적중률 값 참조
    const profileWinRate = document.getElementById('profileWinRate')?.textContent || '0%';

    document.getElementById('overallTotalBets').textContent = overallTotal;
    document.getElementById('overallWonBets').textContent = overallWon;
    document.getElementById('overallWinRate').textContent = profileWinRate;
}

// 토큰 내역 페이지네이션 상태 (페이지 기반)
const tokenHistoryState = {
    currentPage: 1,
    pageSize: 10,
    cursors: { 1: null },  // 각 페이지별 커서 저장 (뒤로 가기 지원)
    hasMore: false,
    isLoading: false
};

/**
 * 코인 내역 로드 (페이지 기반 페이지네이션)
 * @param {number} page - 로드할 페이지 번호
 */
async function loadTokenHistory(page = 1) {
    const user = getCurrentUser();
    if (!user) return;

    if (tokenHistoryState.isLoading) return;

    const container = document.getElementById('tokenHistoryList');
    const pagination = document.getElementById('tokenPagination');

    tokenHistoryState.isLoading = true;

    container.innerHTML = `
        <div class="loading-indicator">
            <div class="loading-spinner"></div>
        </div>
    `;

    try {
        const idToken = await user.getIdToken();
        let url = `/api/token/history?limit=${tokenHistoryState.pageSize}`;
        const cursor = tokenHistoryState.cursors[page];
        if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '토큰 내역 조회 실패');
        }

        tokenHistoryState.currentPage = page;
        tokenHistoryState.hasMore = data.hasMore;

        // 다음 페이지 커서 저장
        if (data.nextCursor) {
            tokenHistoryState.cursors[page + 1] = data.nextCursor;
        }

        if (data.history.length === 0 && page === 1) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-coins.svg" alt="" class="empty-icon">
                    <p class="empty-title">코인 내역이 없습니다.</p>
                    <a href="betting.html" class="empty-cta">베팅으로 코인 획득하기</a>
                </div>
            `;
            if (pagination) pagination.style.display = 'none';
            return;
        }

        container.innerHTML = data.history.map(item => {
            const timestamp = item.timestamp?._seconds
                ? new Date(item.timestamp._seconds * 1000)
                : new Date();
            const isPositive = item.amount > 0;
            const safeReason = typeof escapeHtml === 'function' ? escapeHtml(item.reason) : item.reason;

            return `
                <div class="token-item">
                    <div>
                        <div class="token-reason">${safeReason}</div>
                        <div class="token-date">${formatDateTime(timestamp)}</div>
                    </div>
                    <div class="token-change ${isPositive ? 'positive' : 'negative'}">
                        ${isPositive ? '+' : ''}${item.amount} FC
                    </div>
                </div>
            `;
        }).join('');

        // 페이지네이션 표시
        if (pagination) {
            const totalKnownPages = Math.max(...Object.keys(tokenHistoryState.cursors).map(Number));
            if (totalKnownPages > 1 || tokenHistoryState.hasMore) {
                pagination.style.display = 'flex';
                renderTokenPagination();
            } else {
                pagination.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('코인 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '코인 내역을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
        if (pagination) pagination.style.display = 'none';
    } finally {
        tokenHistoryState.isLoading = false;
    }
}

/**
 * 토큰 내역 페이지네이션 UI 렌더링
 */
function renderTokenPagination() {
    const pageNumbersContainer = document.getElementById('tokenPageNumbers');
    const prevBtn = document.getElementById('tokenPrevBtn');
    const nextBtn = document.getElementById('tokenNextBtn');
    const currentPage = tokenHistoryState.currentPage;

    // 이전/다음 버튼 표시
    if (prevBtn) {
        prevBtn.style.display = 'flex';
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.style.display = 'flex';
        nextBtn.disabled = !tokenHistoryState.hasMore;
    }

    // 페이지 번호 표시
    if (!pageNumbersContainer) return;

    const totalKnownPages = tokenHistoryState.hasMore
        ? Math.max(currentPage + 1, ...Object.keys(tokenHistoryState.cursors).map(Number))
        : currentPage;

    let pagesHtml = '';
    for (let i = 1; i <= totalKnownPages; i++) {
        // 커서가 존재하는 페이지만 클릭 가능
        const hasCursor = i === 1 || tokenHistoryState.cursors[i];
        if (hasCursor) {
            pagesHtml += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="loadTokenHistory(${i})">${i}</button>`;
        }
    }

    pageNumbersContainer.innerHTML = pagesHtml;
}

/**
 * 토큰 내역 페이지네이션 이벤트 설정
 */
function setupTokenPagination() {
    const prevBtn = document.getElementById('tokenPrevBtn');
    const nextBtn = document.getElementById('tokenNextBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (tokenHistoryState.currentPage > 1) {
                loadTokenHistory(tokenHistoryState.currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (tokenHistoryState.hasMore) {
                loadTokenHistory(tokenHistoryState.currentPage + 1);
            }
        });
    }
}

// ========================================
// 닉네임 변경 기능
// ========================================

/**
 * 닉네임 변경 버튼 및 모달 설정
 */
function setupNicknameChange() {
    const changeBtn = document.getElementById('nicknameChangeBtn');
    const confirmBtn = document.getElementById('confirmNicknameBtn');
    const modal = document.getElementById('nicknameModal');

    if (changeBtn) {
        changeBtn.addEventListener('click', openNicknameModal);
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', changeNickname);
    }

    // 모달 외부 클릭 시 닫기
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeNicknameModal();
            }
        });
    }

    // Enter 키로 제출
    const input = document.getElementById('nicknameInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                changeNickname();
            }
        });
    }
}

/**
 * 닉네임 모달 열기
 */
function openNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.getElementById('nicknameInput').focus();
    }
}

/**
 * 닉네임 모달 닫기
 */
function closeNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        document.getElementById('nicknameInput').value = '';
    }
}

/**
 * 닉네임 변경 처리
 */
async function changeNickname() {
    const user = requireAuth();
    if (!user) return;

    const input = document.getElementById('nicknameInput');
    const confirmBtn = document.getElementById('confirmNicknameBtn');
    const nickname = input.value.trim();

    // 유효성 검증
    if (!nickname || nickname.length < 2 || nickname.length > 10) {
        showGlobalAlert('닉네임은 2~10자로 입력해주세요.', 'warning', '입력 오류');
        return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '변경 중...';

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/user/nickname', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showGlobalAlert(data.error || '닉네임 변경에 실패했습니다.', 'error', '변경 실패');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '변경하기';
            return;
        }

        // 성공: UI 업데이트
        document.getElementById('profileName').textContent = data.nickname;
        document.getElementById('nicknameChangeBtn').style.display = 'none';

        closeNicknameModal();
        showGlobalAlert('닉네임이 변경되었습니다.', 'success', '변경 완료');

    } catch (error) {
        console.error('닉네임 변경 실패:', error);
        showGlobalAlert('닉네임 변경에 실패했습니다.', 'error', '변경 실패');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '변경하기';
    }
}

/**
 * 사용자 프로필에서 닉네임 변경 가능 여부 확인
 */
async function checkNicknameChangeAvailable(user) {
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });

        const data = await response.json();

        if (data.success) {
            const changeBtn = document.getElementById('nicknameChangeBtn');

            // 커스텀 닉네임이 있으면 표시
            if (data.customDisplayName) {
                document.getElementById('profileName').textContent = data.customDisplayName;
            }

            // 아직 닉네임을 변경하지 않았으면 버튼 표시
            if (changeBtn && !data.hasChangedNickname) {
                changeBtn.style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.error('닉네임 변경 가능 여부 확인 실패:', error);
    }
}

// getTagClass는 utils.js에서 제공

/**
 * 날짜 포맷
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

/**
 * 날짜/시간 포맷
 */
function formatDateTime(date) {
    const dateStr = formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}`;
}

// ========================================
// 회원 탈퇴 기능
// ========================================

/**
 * 회원 탈퇴 버튼 이벤트 설정
 */
function setupDeleteAccount() {
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', openDeleteModal);
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', deleteAccount);
    }

    // 모달 외부 클릭 시 닫기
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDeleteModal();
            }
        });
    }
}

/**
 * 탈퇴 모달 열기
 */
function openDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * 탈퇴 모달 닫기
 */
function closeDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * 회원 탈퇴 처리
 */
async function deleteAccount() {
    const user = requireAuth();
    if (!user) return;

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '탈퇴 처리 중...';

    try {
        const uid = user.uid;

        // 삭제할 문서들을 수집
        const docsToDelete = [];
        const deleteWarnings = [];

        // 1. 사용자의 게시글과 그 게시글의 댓글 삭제
        const postsSnapshot = await db.collection('posts')
            .where('authorId', '==', uid)
            .get();

        for (const postDoc of postsSnapshot.docs) {
            // 게시글의 댓글들도 삭제
            const commentsSnapshot = await postDoc.ref.collection('comments').get();
            commentsSnapshot.docs.forEach(commentDoc => {
                docsToDelete.push(commentDoc.ref);
            });
            docsToDelete.push(postDoc.ref);
        }

        // 2. 다른 게시글에 달린 내 댓글 삭제 (서브컬렉션 그룹 쿼리)
        try {
            const myCommentsSnapshot = await db.collectionGroup('comments')
                .where('authorId', '==', uid)
                .get();
            myCommentsSnapshot.docs.forEach(doc => {
                docsToDelete.push(doc.ref);
            });
        } catch (e) {
            logger.log('댓글 삭제 스킵 (인덱스 없음):', e);
            deleteWarnings.push('일부 댓글이 삭제되지 않았을 수 있습니다.');
        }

        // 3. 포디움 베팅 내역 삭제
        const podiumBetsSnapshot = await db.collection('podiumBets')
            .where('userId', '==', uid)
            .get();
        podiumBetsSnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 4. H2H 베팅 내역 삭제
        const h2hBetsSnapshot = await db.collection('headToHeadBets')
            .where('userId', '==', uid)
            .get();
        h2hBetsSnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 5. 토큰 히스토리 삭제
        const tokenHistorySnapshot = await db.collection('tokenHistory')
            .where('userId', '==', uid)
            .get();
        tokenHistorySnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 6. 출석 기록 삭제
        const attendanceSnapshot = await db.collection('attendance')
            .where('userId', '==', uid)
            .get();
        attendanceSnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 7. 좋아요 기록 삭제
        const likesSnapshot = await db.collection('likes')
            .where('userId', '==', uid)
            .get();
        likesSnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 9. 운세 기록 삭제
        const fortuneSnapshot = await db.collection('fortunes')
            .where('userId', '==', uid)
            .get();
        fortuneSnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 10. 사용자 문서 삭제
        docsToDelete.push(db.collection('users').doc(uid));

        // 배치로 삭제 (500개씩 나눠서)
        const batchSize = 400;
        for (let i = 0; i < docsToDelete.length; i += batchSize) {
            const batch = db.batch();
            const chunk = docsToDelete.slice(i, i + batchSize);
            chunk.forEach(ref => batch.delete(ref));
            await withTimeout(batch.commit(), 15000);
        }

        // Firebase Auth에서 사용자 삭제
        await user.delete();

        // 모달 닫기
        closeDeleteModal();

        // 완료 메시지 및 홈으로 이동
        const warningText = deleteWarnings.length > 0 ? '\n\n' + deleteWarnings.join('\n') : '';
        showGlobalAlert('회원 탈퇴가 완료되었습니다.\n그동안 이용해 주셔서 감사합니다.' + warningText, 'success', '탈퇴 완료');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error('회원 탈퇴 실패:', error);

        let errorMsg = '회원 탈퇴에 실패했습니다.';

        if (error.code === 'auth/requires-recent-login') {
            errorMsg = '보안을 위해 다시 로그인 후 탈퇴해 주세요.';
            // 로그아웃 처리
            await auth.signOut();
        } else if (isNetworkError(error)) {
            errorMsg = '인터넷 연결을 확인해주세요.';
        }

        showGlobalAlert(errorMsg, 'error', '탈퇴 실패');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '탈퇴하기';
    }
}

// ========================================
// 공개 프로필 보기 (다른 사용자)
// ========================================

/**
 * 비공개 섹션 숨김 (다른 사용자 프로필 볼 때)
 */
function hidePrivateSections() {
    // 이메일 숨김
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.style.display = 'none';

    // 베팅 내역/코인 내역 탭 숨김 (게시글 탭만 표시)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        if (btn.dataset.tab !== 'posts') {
            btn.style.display = 'none';
        }
    });

    // 출석체크 섹션 숨김
    const attendanceSection = document.querySelector('.attendance-game-section');
    if (attendanceSection) attendanceSection.style.display = 'none';

    // 닉네임 변경 버튼 숨김
    const nicknameBtn = document.getElementById('nicknameChangeBtn');
    if (nicknameBtn) nicknameBtn.style.display = 'none';

    // 회원 탈퇴 버튼 숨김
    const dangerZone = document.querySelector('.danger-zone');
    if (dangerZone) dangerZone.style.display = 'none';

    // 인벤토리 버튼 숨김
    const inventoryBtn = document.querySelector('.sidebar-inventory-btn');
    if (inventoryBtn) inventoryBtn.style.display = 'none';

    // 적중률 카드는 공개 프로필에서도 표시
}

/**
 * 다른 사용자의 공개 프로필 로드
 */
async function loadPublicProfile(uid) {
    try {
        const response = await fetch(`/api/user/public-profile/${encodeURIComponent(uid)}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || '프로필 조회 실패');
        }

        const profile = data.profile;

        // 프로필 사진
        const profilePhotoEl = document.getElementById('profilePhoto');
        if (profilePhotoEl) {
            profilePhotoEl.src = getSafePhotoURL(profile.photoURL, 'images/default-avatar.png');
        }

        // 이름 (커스텀 닉네임 우선)
        const displayName = profile.customDisplayName || profile.displayName;
        document.getElementById('profileName').textContent = displayName;

        // 토큰
        document.getElementById('profileTokens').textContent = (profile.tokens || 0).toLocaleString();

        // 연속 출석
        document.getElementById('profileStreak').textContent = `${profile.consecutiveDays || 0}일`;

        // 적중률 (포디움 + H2H 베팅 조회)
        try {
            let totalBets = 0;
            let wonBets = 0;

            const [podiumSnap, h2hSnap] = await Promise.all([
                withTimeout(db.collection('podiumBets').where('userId', '==', uid).get(), 8000),
                withTimeout(db.collection('headToHeadBets').where('userId', '==', uid).get(), 8000)
            ]);

            podiumSnap.docs.forEach(doc => {
                const bet = doc.data();
                if (bet.status === 'won' || bet.status === 'lost') {
                    totalBets++;
                    if (bet.status === 'won') wonBets++;
                }
            });

            h2hSnap.docs.forEach(doc => {
                const bet = doc.data();
                if (bet.status === 'won' || bet.status === 'lost') {
                    totalBets++;
                    if (bet.status === 'won') wonBets++;
                }
            });

            const winRate = totalBets > 0 ? Math.round(wonBets / totalBets * 100) : 0;
            const winRateEl = document.getElementById('profileWinRate');
            if (winRateEl) {
                winRateEl.textContent = totalBets > 0 ? `${winRate}%` : '2026 시즌 개막 후 업데이트';
            }
        } catch (e) {
            console.warn('공개 프로필 적중률 로드 실패:', e);
        }

        // 가입일
        if (profile.createdAt) {
            let joinDate;
            if (profile.createdAt._seconds) {
                joinDate = new Date(profile.createdAt._seconds * 1000);
            } else {
                joinDate = new Date(profile.createdAt);
            }
            document.getElementById('profileJoinDate').textContent = formatDate(joinDate);
        }

        // 코스메틱 적용 (아바타 테두리, 닉네임 컬러 등)
        if (typeof fetchUserCosmetics === 'function' && typeof renderCosmeticAvatar === 'function') {
            try {
                const cosmetics = await fetchUserCosmetics(uid);

                const profileSize = profilePhotoEl.offsetWidth || 72;
                const avatarHtml = renderCosmeticAvatar(profile.photoURL, cosmetics, profileSize);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = avatarHtml;
                const newAvatarEl = tempDiv.firstElementChild;

                const existingWrap = profilePhotoEl.parentElement;
                if (existingWrap && existingWrap.classList.contains('cosmetic-avatar-wrap')) {
                    existingWrap.replaceWith(newAvatarEl);
                } else {
                    profilePhotoEl.replaceWith(newAvatarEl);
                }

                const newImg = newAvatarEl.classList.contains('cosmetic-avatar-wrap')
                    ? newAvatarEl.querySelector('.cosmetic-avatar')
                    : newAvatarEl;
                newImg.id = 'profilePhoto';
                newImg.classList.add('profile-avatar-lg');

                // 닉네임 컬러 적용
                const nameEl = document.getElementById('profileName');
                if (nameEl && cosmetics.nicknameColor && cosmetics.nicknameColor.cssClass) {
                    nameEl.className = nameEl.className.replace(/\bcolor-\S+/g, '').trim();
                    nameEl.classList.add(cosmetics.nicknameColor.cssClass);
                }

                // 뱃지 표시
                const nameRow = document.querySelector('.profile-name-row');
                if (nameRow && cosmetics.badge && cosmetics.badge.svgIcon) {
                    const oldBadge = nameRow.querySelector('.cosmetic-badge');
                    if (oldBadge) oldBadge.remove();
                    const badgeImg = document.createElement('img');
                    badgeImg.src = `images/icons/${cosmetics.badge.svgIcon}`;
                    badgeImg.className = 'cosmetic-badge';
                    badgeImg.alt = cosmetics.badge.name || '';
                    badgeImg.title = cosmetics.badge.name || '';
                    nameRow.appendChild(badgeImg);
                }
            } catch (e) {
                console.warn('공개 프로필 코스메틱 로드 실패:', e);
            }
        }

        // 해당 유저의 게시글 로드
        await loadUserPosts(uid);

        // 칭호 컬렉션 렌더링 (비활성화)
        // renderProfileTitles(uid);

    } catch (error) {
        console.error('공개 프로필 로드 실패:', error);
        document.getElementById('profileName').textContent = '사용자를 찾을 수 없습니다';
        const container = document.getElementById('myPostsList');
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>프로필을 불러올 수 없습니다.</p></div>';
        }
    }
}

/**
 * 특정 사용자의 게시글 로드 (공개 프로필용)
 */
async function loadUserPosts(uid) {
    const container = document.getElementById('myPostsList');

    // 게시글 탭 제목 변경
    const cardTitle = container?.closest('.content-card')?.querySelector('.card-title');
    if (cardTitle) cardTitle.textContent = '작성한 게시글';

    try {
        const snapshot = await withTimeout(
            db.collection('posts')
                .where('authorId', '==', uid)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get(),
            8000
        );

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-pencil.svg" alt="" class="empty-icon">
                    <p class="empty-title">작성한 게시글이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const post = doc.data();
            const tagClass = getTagClass(post.tag);
            const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();

            return `
                <div class="post-item" onclick="window.location.href='paddock.html?post=${doc.id}'">
                    <span class="post-tag ${tagClass}">#${post.tag}</span>
                    <div class="post-info">
                        <div class="post-title">${escapeHtml(post.title)}</div>
                        <div class="post-meta">
                            <span>${formatDate(createdAt)}</span>
                            <span>${post.likeCount || 0} 공감</span>
                            <span>${post.commentCount || 0} 댓글</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('유저 게시글 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '게시글을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    }
}

// ========================================
// 칭호 컬렉션 (공개 프로필)
// ========================================

/**
 * 공개 프로필에서 칭호 컬렉션 렌더링
 */
async function renderProfileTitles(uid) {
    const section = document.getElementById('profileTitlesSection');
    const grid = document.getElementById('profileTitlesGrid');
    const countEl = document.getElementById('profileTitlesCount');
    if (!section || !grid) return;

    try {
        // 전체 칭호 목록 + 해당 유저 보유 칭호 병렬 조회
        const [titlesRes, userTitlesRes] = await Promise.all([
            fetch('/api/titles').then(r => r.json()),
            fetch(`/api/titles/user/${encodeURIComponent(uid)}`).then(r => r.json())
        ]);

        const titles = titlesRes.success ? titlesRes.titles : [];
        const userTitles = userTitlesRes.success ? userTitlesRes.userTitles : [];

        if (titles.length === 0) return;

        // 보유 칭호 맵
        const ownedMap = {};
        for (const ut of userTitles) {
            ownedMap[ut.titleId] = ut;
        }

        const ownedCount = Object.keys(ownedMap).length;
        if (countEl) countEl.textContent = `${ownedCount} / ${titles.length}`;

        grid.innerHTML = titles.map(t => {
            const owned = ownedMap[t.id];
            const isOwned = !!owned;
            const isEquipped = owned && owned.equipped;

            const style = t.style;
            const rarity = (style && style.rarity) || 'normal';
            const cssClass = (isOwned && style && style.cssClass) ? style.cssClass : '';
            const extraIcon = (isOwned && style && style.extraIcon) ? style.extraIcon : '';
            const inlineClass = cssClass ? 'ctitle-' + cssClass.replace('title-style-', '') : '';

            let cardClass = isOwned
                ? (isEquipped ? 'title-card title-unlocked title-equipped' : 'title-card title-unlocked')
                : 'title-card title-locked';

            const iconFile = isOwned ? (t.icon || 'icon-trophy.svg') : 'icon-lock.svg';
            const displayName = isOwned ? escapeHtml(t.name) : '???';
            const displayHint = escapeHtml(t.hint);
            const rarityAttr = isOwned ? ` data-rarity="${rarity}"` : '';

            let extraIconHtml = '';
            if (extraIcon) {
                extraIconHtml = `<span class="ctitle-icon" style="-webkit-mask-image:url('images/icons/${extraIcon}');mask-image:url('images/icons/${extraIcon}')"></span>`;
            }

            return `<div class="${cardClass}"${rarityAttr}>
                <div class="title-icon"><img src="images/icons/${iconFile}" alt="" class="inline-icon"></div>
                <div class="title-name${inlineClass ? ' ' + inlineClass : ''}">${extraIconHtml}${displayName}</div>
                <div class="title-hint">${displayHint}</div>
            </div>`;
        }).join('');

        section.style.display = '';
    } catch (error) {
        console.error('칭호 컬렉션 로드 실패:', error);
    }
}

/**
 * 팀 선택 표시 및 변경 버튼 설정
 */
function loadTeamSelector(user, userData) {
    const selector = document.getElementById('profileTeamSelector');
    const dot = document.getElementById('profileTeamDot');
    const nameEl = document.getElementById('profileTeamName');
    const changeBtn = document.getElementById('teamChangeBtn');
    if (!selector || !dot || !nameEl || !changeBtn) return;

    const teamId = userData && userData.selectedTeam ? userData.selectedTeam : localStorage.getItem('selectedTeam');
    const team = teamId && typeof F1_TEAMS !== 'undefined' ? F1_TEAMS[teamId] : null;

    if (team) {
        dot.style.background = team.primary;
        nameEl.textContent = team.name;
    } else {
        dot.style.background = 'var(--text-disabled)';
        nameEl.textContent = '팀 미선택';
    }

    // 쿨다운 체크
    const lastChange = userData && userData.lastTeamChange;
    if (lastChange && teamId) {
        let lastDate;
        if (lastChange.toDate) lastDate = lastChange.toDate();
        else if (lastChange._seconds) lastDate = new Date(lastChange._seconds * 1000);
        else lastDate = new Date(lastChange);

        const diff = Date.now() - lastDate.getTime();
        const cooldownMs = 7 * 24 * 60 * 60 * 1000;
        if (diff < cooldownMs) {
            const remainDays = Math.ceil((cooldownMs - diff) / (24 * 60 * 60 * 1000));
            changeBtn.textContent = remainDays + '일 후 변경 가능';
            changeBtn.disabled = true;
        }
    }

    changeBtn.addEventListener('click', function() {
        if (changeBtn.disabled) return;
        if (typeof showTeamSelectModal !== 'function') return;

        showTeamSelectModal({
            closable: true,
            currentTeam: teamId,
            onSelect: function(newTeamId) {
                // 같은 팀 재선택 시 불필요한 write 방지 (쿨다운 리셋 악용 차단)
                if (newTeamId === teamId) return;
                return db.collection('users').doc(user.uid).update({
                    selectedTeam: newTeamId,
                    lastTeamChange: firebase.firestore.FieldValue.serverTimestamp()
                }).then(function() {
                    if (typeof applyTeamThemeWithTransition === 'function') {
                        applyTeamThemeWithTransition(newTeamId);
                    }
                    // UI 업데이트
                    var t = F1_TEAMS[newTeamId];
                    if (t) {
                        dot.style.background = t.primary;
                        nameEl.textContent = t.name;
                    }
                    changeBtn.textContent = '7일 후 변경 가능';
                    changeBtn.disabled = true;
                    if (typeof showToast === 'function') {
                        showToast('팀이 변경되었습니다!', 'success');
                    }
                });
            }
        });
    });
}

// 인벤토리 기능은 별도 페이지(inventory.html + js/inventory.js)로 분리됨
