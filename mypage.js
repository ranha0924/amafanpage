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
    // 탭 이벤트 설정
    setupTabs();

    // 회원 탈퇴 버튼 이벤트
    setupDeleteAccount();

    // Auth 상태 리스너
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                showMyPage();
                try {
                    await loadUserProfile(user);
                    await loadBettingWinRate(user);
                    await loadMyPosts();
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
    }
}

/**
 * 마이페이지 표시
 */
function showMyPage() {
    document.getElementById('loginRequiredSection').style.display = 'none';
    document.getElementById('mypageMain').style.display = 'block';
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
                loadTokenHistory();
            }
        });
    });
}

/**
 * 사용자 프로필 로드
 */
async function loadUserProfile(user) {
    // 기본 프로필 정보 (🔒 getSafePhotoURL 사용으로 XSS 방지)
    document.getElementById('profilePhoto').src = getSafePhotoURL(user.photoURL, 'images/default-avatar.png');
    document.getElementById('profileName').textContent = user.displayName || '사용자';
    document.getElementById('profileEmail').textContent = user.email || '';

    // 코인 정보 로드
    const userData = await getUserTokens();
    if (userData) {
        document.getElementById('profileTokens').textContent = (userData.tokens || 0).toLocaleString();
        document.getElementById('profileTotalEarned').textContent = `${(userData.totalEarned || 0).toLocaleString()} AMR`;
        document.getElementById('profileStreak').textContent = `${userData.consecutiveDays || 0}일`;

        // 가입일
        if (userData.createdAt) {
            const joinDate = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
            document.getElementById('profileJoinDate').textContent = formatDate(joinDate);
        }
    }
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
            winRateEl.textContent = `${winRate}%`;

            // 적중률에 따른 색상 클래스 적용
            winRateEl.classList.remove('high', 'medium', 'low', 'none');
            if (totalBets === 0) {
                winRateEl.classList.add('none');
            } else if (winRate >= 60) {
                winRateEl.classList.add('high');
            } else if (winRate >= 40) {
                winRateEl.classList.add('medium');
            } else {
                winRateEl.classList.add('low');
            }
        }
        if (totalBetsEl) totalBetsEl.textContent = totalBets;
        if (wonBetsEl) wonBetsEl.textContent = wonBets;

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
                    <p>작성한 게시글이 없습니다.</p>
                    <a href="paddock.html">게시판 바로가기</a>
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
                    <p>포디움 베팅 내역이 없습니다.</p>
                    <a href="betting.html">베팅하러 가기</a>
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
                                    <span class="bet-amount">${b.betAmount} AMR x ${b.odds}x</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="bet-total">
                        <span>총 베팅: ${bet.totalAmount} AMR</span>
                        ${bet.winAmount !== null ? `<span class="win-amount">당첨금: ${bet.winAmount} AMR</span>` : ''}
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
                    <p>1:1 베팅 내역이 없습니다.</p>
                    <a href="betting.html">베팅하러 가기</a>
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
                        <span>베팅: ${bet.betAmount} AMR x ${bet.odds.toFixed(2)}x</span>
                        <span class="win-amount">예상: ${bet.potentialWin} AMR</span>
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

/**
 * 코인 내역 로드
 */
async function loadTokenHistory() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('tokenHistoryList');

    try {
        const snapshot = await db.collection('tokenHistory')
            .where('userId', '==', user.uid)
            .orderBy('timestamp', 'desc')
            .limit(30)
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>코인 내역이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const history = doc.data();
            const timestamp = history.timestamp?.toDate ? history.timestamp.toDate() : new Date();
            const isPositive = history.amount > 0;

            // 🔒 보안: XSS 방지를 위해 reason에 escapeHtml 적용
            const safeReason = typeof escapeHtml === 'function' ? escapeHtml(history.reason) : history.reason;

            return `
                <div class="token-item">
                    <div>
                        <div class="token-reason">${safeReason}</div>
                        <div class="token-date">${formatDateTime(timestamp)}</div>
                    </div>
                    <div class="token-change ${isPositive ? 'positive' : 'negative'}">
                        ${isPositive ? '+' : ''}${history.amount} AMR
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('코인 내역 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '코인 내역을 불러오는데 실패했습니다.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
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
    const user = getCurrentUser();
    if (!user) {
        showGlobalAlert('로그인이 필요합니다.', 'warning', '로그인 필요');
        return;
    }

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '탈퇴 처리 중...';

    try {
        const uid = user.uid;

        // 삭제할 문서들을 수집
        const docsToDelete = [];

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
            console.log('댓글 삭제 스킵 (인덱스 없음):', e);
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

        // 7. 레이스 에너지 기록 삭제
        const raceEnergySnapshot = await db.collection('raceEnergy')
            .where('userId', '==', uid)
            .get();
        raceEnergySnapshot.docs.forEach(doc => docsToDelete.push(doc.ref));

        // 8. 좋아요 기록 삭제
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
        showGlobalAlert('회원 탈퇴가 완료되었습니다.\n그동안 이용해 주셔서 감사합니다.', 'success', '탈퇴 완료');
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
