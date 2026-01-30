// ========================================
// AMR Token System - Leaderboard Module
// 베팅 리더보드 시스템
// ========================================

// getSafePhotoURL은 utils.js에서 제공

// ========================================
// 상태 관리
// ========================================

const leaderboardState = {
    data: [],
    filteredData: [],
    currentFilter: 'netProfit', // 기본 정렬: 순이익
    myRank: null,
    isLoading: false,
    lastUpdated: null
};

// 필터 옵션
const LEADERBOARD_FILTERS = {
    netProfit: {
        label: '순이익',
        field: 'combined.netProfit',
        order: 'desc'
    },
    totalWin: {
        label: '총 당첨금',
        field: 'combined.totalWinAmount',
        order: 'desc'
    },
    winRate: {
        label: '승률',
        field: 'combined.winRate',
        order: 'desc'
    }
};

// ========================================
// 초기화
// ========================================

function initLeaderboard() {
    // 필터 탭 이벤트 리스너 설정
    const filterTabs = document.querySelectorAll('.leaderboard-filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.dataset.filter;
            changeLeaderboardFilter(filter);
        });
    });
}

// ========================================
// 리더보드 로드
// ========================================

async function loadLeaderboard() {
    if (leaderboardState.isLoading) return;

    leaderboardState.isLoading = true;

    const container = document.getElementById('leaderboardContent');
    if (!container) return;

    // 로딩 표시
    container.innerHTML = `
        <div class="leaderboard-loading">
            <span class="loading-spinner"></span>
            <span>리더보드 로딩 중...</span>
        </div>
    `;

    try {
        // Firestore에서 userBettingStats 컬렉션 조회
        const snapshot = await db.collection('userBettingStats')
            .orderBy('combined.netProfit', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="leaderboard-empty">
                    <span class="empty-icon">&#128202;</span>
                    <p>아직 리더보드 데이터가 없습니다</p>
                    <p class="empty-hint">베팅 정산 후 순위가 표시됩니다</p>
                </div>
            `;
            leaderboardState.isLoading = false;
            return;
        }

        // 데이터 가공
        leaderboardState.data = snapshot.docs.map((doc, index) => {
            const data = doc.data();
            return {
                id: doc.id,
                rank: index + 1,
                userId: data.userId,
                displayName: data.displayName || '익명',
                photoURL: data.photoURL || null,
                combined: {
                    totalBets: data.combined?.totalBets || 0,
                    wonBets: data.combined?.wonBets || 0,
                    totalWinAmount: data.combined?.totalWinAmount || 0,
                    netProfit: data.combined?.netProfit || 0,
                    // 🔒 0으로 나누기 방지: totalBets가 0이면 winRate도 0
                    winRate: (data.combined?.totalBets && data.combined.totalBets > 0)
                        ? Math.round((data.combined?.wonBets || 0) / data.combined.totalBets * 100)
                        : 0
                },
                podium: data.podium || {},
                headToHead: data.headToHead || {},
                lastUpdated: data.lastUpdated
            };
        });

        // 현재 필터로 정렬
        applyFilter();

        // 내 순위 찾기
        await findMyRank();

        // 렌더링
        renderLeaderboard();

        leaderboardState.lastUpdated = new Date();

    } catch (error) {
        console.error('리더보드 로드 실패:', error);
        const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '리더보드를 불러오는데 실패했습니다';
        container.innerHTML = `
            <div class="leaderboard-error">
                <span class="error-icon">&#9888;</span>
                <p>${msg}</p>
                <button class="retry-btn" onclick="loadLeaderboard()">다시 시도</button>
            </div>
        `;
    }

    leaderboardState.isLoading = false;
}

// ========================================
// 필터 변경
// ========================================

function changeLeaderboardFilter(filter) {
    if (!LEADERBOARD_FILTERS[filter]) return;

    leaderboardState.currentFilter = filter;

    // 탭 활성화 상태 변경
    const tabs = document.querySelectorAll('.leaderboard-filter-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });

    // 재정렬 및 렌더링
    applyFilter();
    renderLeaderboard();
}

function applyFilter() {
    const filter = LEADERBOARD_FILTERS[leaderboardState.currentFilter];
    const fieldPath = filter.field.split('.');

    leaderboardState.filteredData = [...leaderboardState.data].sort((a, b) => {
        let valA = a;
        let valB = b;

        for (const key of fieldPath) {
            valA = valA?.[key] || 0;
            valB = valB?.[key] || 0;
        }

        return filter.order === 'desc' ? valB - valA : valA - valB;
    });

    // 순위 재부여
    leaderboardState.filteredData.forEach((item, index) => {
        item.rank = index + 1;
    });
}

// ========================================
// 내 순위 찾기
// ========================================

async function findMyRank() {
    const user = getCurrentUser();
    if (!user) {
        leaderboardState.myRank = null;
        return;
    }

    // 현재 데이터에서 내 순위 찾기
    const myData = leaderboardState.filteredData.find(d => d.userId === user.uid);

    if (myData) {
        leaderboardState.myRank = myData;
    } else {
        // 상위 50명에 없으면 별도로 조회
        try {
            const myStats = await db.collection('userBettingStats').doc(user.uid).get();

            if (myStats.exists) {
                const data = myStats.data();

                // 전체 순위 계산 (순이익 기준)
                const countSnapshot = await db.collection('userBettingStats')
                    .where('combined.netProfit', '>', data.combined?.netProfit || 0)
                    .get();

                leaderboardState.myRank = {
                    rank: countSnapshot.size + 1,
                    userId: user.uid,
                    displayName: data.displayName || user.displayName || '익명',
                    photoURL: data.photoURL || user.photoURL,
                    combined: {
                        totalBets: data.combined?.totalBets || 0,
                        wonBets: data.combined?.wonBets || 0,
                        totalWinAmount: data.combined?.totalWinAmount || 0,
                        netProfit: data.combined?.netProfit || 0,
                        winRate: data.combined?.totalBets > 0
                            ? Math.round((data.combined?.wonBets || 0) / data.combined.totalBets * 100)
                            : 0
                    }
                };
            } else {
                leaderboardState.myRank = null;
            }
        } catch (error) {
            console.error('내 순위 조회 실패:', error);
            leaderboardState.myRank = null;
        }
    }
}

// ========================================
// 렌더링
// ========================================

function renderLeaderboard() {
    const container = document.getElementById('leaderboardContent');
    if (!container) return;

    const data = leaderboardState.filteredData;

    if (data.length === 0) {
        container.innerHTML = `
            <div class="leaderboard-empty">
                <span class="empty-icon">&#128202;</span>
                <p>아직 리더보드 데이터가 없습니다</p>
            </div>
        `;
        return;
    }

    // 상위 3명과 나머지 분리
    const topThree = data.slice(0, 3);
    const rest = data.slice(3);

    container.innerHTML = `
        ${renderTopThree(topThree)}
        ${renderLeaderboardList(rest)}
        ${renderMyRankCard()}
    `;
}

function renderTopThree(topThree) {
    if (topThree.length === 0) return '';

    const user = getCurrentUser();
    const filterConfig = LEADERBOARD_FILTERS[leaderboardState.currentFilter];

    // 포디움 순서: 2등, 1등, 3등
    const podiumOrder = [1, 0, 2];

    return `
        <div class="leaderboard-podium">
            ${podiumOrder.map(index => {
                const item = topThree[index];
                if (!item) return `<div class="podium-slot empty"></div>`;

                const isMe = user && item.userId === user.uid;
                const position = index + 1;
                const positionClass = position === 1 ? 'gold' : position === 2 ? 'silver' : 'bronze';

                let statValue, statLabel;
                switch (leaderboardState.currentFilter) {
                    case 'netProfit':
                        statValue = formatNumber(item.combined.netProfit);
                        statLabel = 'AMR';
                        break;
                    case 'totalWin':
                        statValue = formatNumber(item.combined.totalWinAmount);
                        statLabel = 'AMR';
                        break;
                    case 'winRate':
                        statValue = item.combined.winRate;
                        statLabel = '%';
                        break;
                }

                const safePhotoURL = getSafePhotoURL(item.photoURL, null);
                const safeDisplayName = escapeHtml(item.displayName || '?');
                const safeMaskedName = escapeHtml(maskName(item.displayName));

                return `
                    <div class="podium-slot ${positionClass} ${isMe ? 'is-me' : ''}">
                        <div class="podium-avatar">
                            ${safePhotoURL
                                ? `<img src="${safePhotoURL}" alt="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                                   <div class="avatar-fallback" style="display:none;">${safeDisplayName[0].toUpperCase()}</div>`
                                : `<div class="avatar-fallback">${safeDisplayName[0].toUpperCase()}</div>`
                            }
                            <span class="podium-badge">${position}</span>
                        </div>
                        <div class="podium-name">${isMe ? safeDisplayName : safeMaskedName}${isMe ? ' <span class="me-badge">(나)</span>' : ''}</div>
                        <div class="podium-stat">
                            <span class="stat-value ${item.combined.netProfit >= 0 ? 'positive' : 'negative'}">${statValue}</span>
                            <span class="stat-label">${statLabel}</span>
                        </div>
                        <div class="podium-sub-stats">
                            <span>${item.combined.wonBets}승 / ${item.combined.totalBets}전</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderLeaderboardList(items) {
    if (items.length === 0) return '';

    const user = getCurrentUser();
    const filterConfig = LEADERBOARD_FILTERS[leaderboardState.currentFilter];

    return `
        <div class="leaderboard-list">
            ${items.map(item => {
                const isMe = user && item.userId === user.uid;

                let statValue, statLabel;
                switch (leaderboardState.currentFilter) {
                    case 'netProfit':
                        statValue = formatNumber(item.combined.netProfit);
                        statLabel = 'AMR';
                        break;
                    case 'totalWin':
                        statValue = formatNumber(item.combined.totalWinAmount);
                        statLabel = 'AMR';
                        break;
                    case 'winRate':
                        statValue = item.combined.winRate;
                        statLabel = '%';
                        break;
                }

                const safePhotoURL = getSafePhotoURL(item.photoURL, null);
                const safeDisplayName = escapeHtml(item.displayName || '?');
                const safeMaskedName = escapeHtml(maskName(item.displayName));

                return `
                    <div class="leaderboard-item ${isMe ? 'is-me' : ''}">
                        <span class="item-rank">${item.rank}</span>
                        <div class="item-avatar">
                            ${safePhotoURL
                                ? `<img src="${safePhotoURL}" alt="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                                   <div class="avatar-fallback" style="display:none;">${safeDisplayName[0].toUpperCase()}</div>`
                                : `<div class="avatar-fallback">${safeDisplayName[0].toUpperCase()}</div>`
                            }
                        </div>
                        <div class="item-info">
                            <span class="item-name">${isMe ? safeDisplayName : safeMaskedName}${isMe ? ' <span class="me-badge">(나)</span>' : ''}</span>
                            <span class="item-record">${item.combined.wonBets}승 / ${item.combined.totalBets}전 (${item.combined.winRate}%)</span>
                        </div>
                        <div class="item-stat ${item.combined.netProfit >= 0 ? 'positive' : 'negative'}">
                            <span class="stat-value">${statValue}</span>
                            <span class="stat-label">${statLabel}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderMyRankCard() {
    const user = getCurrentUser();

    if (!user) {
        return `
            <div class="my-rank-card guest">
                <div class="my-rank-content">
                    <span class="guest-icon">&#128100;</span>
                    <span class="guest-text">로그인하여 내 순위를 확인하세요</span>
                </div>
            </div>
        `;
    }

    const myRank = leaderboardState.myRank;

    if (!myRank) {
        return `
            <div class="my-rank-card no-data">
                <div class="my-rank-content">
                    <span class="no-data-icon">&#128200;</span>
                    <span class="no-data-text">아직 베팅 기록이 없습니다</span>
                    <span class="no-data-hint">베팅에 참여하고 순위에 도전하세요!</span>
                </div>
            </div>
        `;
    }

    // 이미 상위 50명에 표시되어 있으면 간단하게 표시
    if (myRank.rank <= 50) {
        return `
            <div class="my-rank-card in-list">
                <div class="my-rank-header">
                    <span class="my-rank-label">내 순위</span>
                    <span class="my-rank-value">${myRank.rank}위</span>
                </div>
            </div>
        `;
    }

    let statValue, statLabel;
    switch (leaderboardState.currentFilter) {
        case 'netProfit':
            statValue = formatNumber(myRank.combined.netProfit);
            statLabel = 'AMR';
            break;
        case 'totalWin':
            statValue = formatNumber(myRank.combined.totalWinAmount);
            statLabel = 'AMR';
            break;
        case 'winRate':
            statValue = myRank.combined.winRate;
            statLabel = '%';
            break;
    }

    const safePhotoURL = getSafePhotoURL(myRank.photoURL, null);
    const safeDisplayName = escapeHtml(myRank.displayName || '?');

    return `
        <div class="my-rank-card">
            <div class="my-rank-header">
                <span class="my-rank-label">내 순위</span>
                <span class="my-rank-value">${myRank.rank}위</span>
            </div>
            <div class="my-rank-body">
                <div class="my-rank-avatar">
                    ${safePhotoURL
                        ? `<img src="${safePhotoURL}" alt="avatar">`
                        : `<div class="avatar-fallback">${safeDisplayName[0].toUpperCase()}</div>`
                    }
                </div>
                <div class="my-rank-info">
                    <span class="my-rank-name">${safeDisplayName}</span>
                    <span class="my-rank-record">${myRank.combined.wonBets}승 / ${myRank.combined.totalBets}전 (${myRank.combined.winRate}%)</span>
                </div>
                <div class="my-rank-stat ${myRank.combined.netProfit >= 0 ? 'positive' : 'negative'}">
                    <span class="stat-value">${statValue}</span>
                    <span class="stat-label">${statLabel}</span>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// 유틸리티 함수
// ========================================

function maskName(name) {
    if (!name || name.length < 2) return '***';

    if (name.length === 2) {
        return name[0] + '*';
    }

    // 첫 글자와 마지막 글자만 표시
    const first = name[0];
    const last = name[name.length - 1];
    const middle = '*'.repeat(Math.min(name.length - 2, 3));

    return first + middle + last;
}

function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '만';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

// ========================================
// 관리자 - 기존 데이터 마이그레이션
// ========================================

async function migrateExistingBets() {
    const user = getCurrentUser();
    if (!user) {
        console.error('로그인이 필요합니다.');
        return;
    }

    // C-4: Custom Claims로 관리자 확인
    try {
        const tokenResult = await user.getIdTokenResult();
        if (tokenResult.claims.admin !== true) {
            console.error('관리자 권한이 필요합니다.');
            return;
        }
    } catch {
        console.error('권한 확인 실패');
        return;
    }

    console.log('기존 베팅 데이터 마이그레이션 시작...');

    try {
        // 모든 사용자별 통계 집계
        const userStats = {};

        // 1. 포디움 베팅 조회
        console.log('포디움 베팅 조회 중...');
        const podiumSnapshot = await db.collection('podiumBets')
            .where('status', 'in', ['won', 'lost'])
            .get();

        podiumSnapshot.forEach(doc => {
            const bet = doc.data();
            const userId = bet.userId;

            if (!userStats[userId]) {
                userStats[userId] = {
                    podium: { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 },
                    headToHead: { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 }
                };
            }

            userStats[userId].podium.totalBets++;
            userStats[userId].podium.totalBetAmount += bet.totalBetAmount || 0;

            if (bet.status === 'won') {
                userStats[userId].podium.wonBets++;
                userStats[userId].podium.totalWinAmount += bet.winAmount || 0;
            }
        });

        console.log(`포디움 베팅 ${podiumSnapshot.size}건 처리`);

        // 2. 1:1 베팅 조회
        console.log('1:1 베팅 조회 중...');
        const h2hSnapshot = await db.collection('headToHeadBets')
            .where('status', 'in', ['won', 'lost'])
            .get();

        h2hSnapshot.forEach(doc => {
            const bet = doc.data();
            const userId = bet.userId;

            if (!userStats[userId]) {
                userStats[userId] = {
                    podium: { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 },
                    headToHead: { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 }
                };
            }

            userStats[userId].headToHead.totalBets++;
            userStats[userId].headToHead.totalBetAmount += bet.betAmount || 0;

            if (bet.status === 'won') {
                userStats[userId].headToHead.wonBets++;
                userStats[userId].headToHead.totalWinAmount += bet.result?.winAmount || bet.potentialWin || 0;
            }
        });

        console.log(`1:1 베팅 ${h2hSnapshot.size}건 처리`);

        // 3. 사용자 정보 조회 및 통계 저장
        console.log('사용자 통계 저장 중...');
        const batch = db.batch();
        let batchCount = 0;

        for (const [userId, stats] of Object.entries(userStats)) {
            // 사용자 정보 조회
            const userDoc = await db.collection('users').doc(userId).get();
            let displayName = '익명';
            let photoURL = null;

            if (userDoc.exists) {
                const userData = userDoc.data();
                displayName = userData.displayName || userData.name || '익명';
                photoURL = userData.photoURL || null;
            }

            // 통합 통계 계산
            const combined = {
                totalBets: stats.podium.totalBets + stats.headToHead.totalBets,
                wonBets: stats.podium.wonBets + stats.headToHead.wonBets,
                totalWinAmount: stats.podium.totalWinAmount + stats.headToHead.totalWinAmount,
                totalBetAmount: stats.podium.totalBetAmount + stats.headToHead.totalBetAmount,
                netProfit: (stats.podium.totalWinAmount + stats.headToHead.totalWinAmount) -
                           (stats.podium.totalBetAmount + stats.headToHead.totalBetAmount)
            };

            const statsRef = db.collection('userBettingStats').doc(userId);
            batch.set(statsRef, {
                userId,
                displayName,
                photoURL,
                combined,
                podium: stats.podium,
                headToHead: stats.headToHead,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            batchCount++;

            // 500개 단위로 커밋 (Firestore 배치 제한)
            if (batchCount >= 500) {
                await batch.commit();
                console.log(`${batchCount}명 저장 완료`);
                batchCount = 0;
            }
        }

        // 남은 데이터 커밋
        if (batchCount > 0) {
            await batch.commit();
        }

        console.log(`마이그레이션 완료: 총 ${Object.keys(userStats).length}명의 통계 저장`);

        // 리더보드 새로고침
        loadLeaderboard();

    } catch (error) {
        console.error('마이그레이션 실패:', error);
    }
}

// 정산 시 userBettingStats 업데이트 (기존 정산 함수에서 호출)
async function updateUserBettingStats(userId, betType, isWon, betAmount, winAmount) {
    try {
        const statsRef = db.collection('userBettingStats').doc(userId);
        const statsDoc = await statsRef.get();

        // 사용자 정보 조회
        const userDoc = await db.collection('users').doc(userId).get();
        let displayName = '익명';
        let photoURL = null;

        if (userDoc.exists) {
            const userData = userDoc.data();
            displayName = userData.displayName || userData.name || '익명';
            photoURL = userData.photoURL || null;
        }

        if (statsDoc.exists) {
            const stats = statsDoc.data();
            const typeKey = betType === 'podium' ? 'podium' : 'headToHead';

            // 기존 통계 업데이트
            const newTypeStats = {
                totalBets: (stats[typeKey]?.totalBets || 0) + 1,
                wonBets: (stats[typeKey]?.wonBets || 0) + (isWon ? 1 : 0),
                totalWinAmount: (stats[typeKey]?.totalWinAmount || 0) + (isWon ? winAmount : 0),
                totalBetAmount: (stats[typeKey]?.totalBetAmount || 0) + betAmount
            };

            // 통합 통계 재계산
            const otherKey = typeKey === 'podium' ? 'headToHead' : 'podium';
            const otherStats = stats[otherKey] || { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 };

            const combined = {
                totalBets: newTypeStats.totalBets + otherStats.totalBets,
                wonBets: newTypeStats.wonBets + otherStats.wonBets,
                totalWinAmount: newTypeStats.totalWinAmount + otherStats.totalWinAmount,
                totalBetAmount: newTypeStats.totalBetAmount + otherStats.totalBetAmount,
                netProfit: (newTypeStats.totalWinAmount + otherStats.totalWinAmount) -
                           (newTypeStats.totalBetAmount + otherStats.totalBetAmount)
            };

            await statsRef.update({
                displayName,
                photoURL,
                [typeKey]: newTypeStats,
                combined,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // 새 통계 문서 생성
            const typeKey = betType === 'podium' ? 'podium' : 'headToHead';
            const otherKey = typeKey === 'podium' ? 'headToHead' : 'podium';

            const newTypeStats = {
                totalBets: 1,
                wonBets: isWon ? 1 : 0,
                totalWinAmount: isWon ? winAmount : 0,
                totalBetAmount: betAmount
            };

            const emptyStats = { totalBets: 0, wonBets: 0, totalWinAmount: 0, totalBetAmount: 0 };

            const combined = {
                totalBets: newTypeStats.totalBets,
                wonBets: newTypeStats.wonBets,
                totalWinAmount: newTypeStats.totalWinAmount,
                totalBetAmount: newTypeStats.totalBetAmount,
                netProfit: newTypeStats.totalWinAmount - newTypeStats.totalBetAmount
            };

            await statsRef.set({
                userId,
                displayName,
                photoURL,
                [typeKey]: newTypeStats,
                [otherKey]: emptyStats,
                combined,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('사용자 베팅 통계 업데이트 실패:', error);
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initLeaderboard();
});
