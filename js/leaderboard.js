// ========================================
// AMR Token System - Leaderboard Module
// 서버 API 기반 리더보드 시스템
// ========================================

// getSafePhotoURL, escapeHtml은 utils.js에서 제공

// ========================================
// 상태 관리
// ========================================

const leaderboardState = {
    rankings: [],
    myRank: null,
    currentType: 'betting-accuracy',
    currentSubType: 'total',
    currentPeriod: 'season',
    totalParticipants: 0,
    isLoading: false,
    lastUpdated: null,
    cosmeticsMap: {}
};

// ========================================
// 초기화
// ========================================

function initLeaderboard() {
    logger.log('[Leaderboard] initLeaderboard() 시작');

    // 타입 탭 이벤트
    const typeTabs = document.querySelectorAll('.type-tab');
    typeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.dataset.type;
            changeType(type);
        });
    });

    // 서브타입 필터 이벤트
    const subTypeBtns = document.querySelectorAll('.filter-btn[data-subtype]');
    subTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const subType = btn.dataset.subtype;
            changeSubType(subType);
        });
    });

    // 기간 필터 이벤트
    const periodBtns = document.querySelectorAll('.filter-btn[data-period]');
    periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            changePeriod(period);
        });
    });

    // 초기 필터 가시성 설정
    updateSubTypeVisibility(leaderboardState.currentType);

    logger.log('[Leaderboard] 이벤트 리스너 등록 완료, 초기 로드 시작');

    // 초기 로드
    loadLeaderboard();

    // auth 상태 변경 시 내 순위 카드 다시 렌더링
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(() => {
            if (!leaderboardState.isLoading) {
                loadMyRank().then(() => {
                    const container = document.getElementById('leaderboardContent');
                    if (container) {
                        const existingCard = container.querySelector('.my-rank-card');
                        if (existingCard) {
                            existingCard.outerHTML = renderMyRankCard();
                        }
                    }
                });
            }
        });
    }
}

// ========================================
// 필터 변경 핸들러
// ========================================

function changeType(type) {
    if (leaderboardState.currentType === type) return;

    leaderboardState.currentType = type;

    // 탭 활성화
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
    });

    // 서브타입 필터 가시성 업데이트
    updateSubTypeVisibility(type);

    // 기본 서브타입 설정
    if (type === 'betting-accuracy') {
        leaderboardState.currentSubType = 'total';
    } else if (type === 'attendance') {
        leaderboardState.currentSubType = 'consecutive';
    } else {
        leaderboardState.currentSubType = '';
    }

    loadLeaderboard();
}

function changeSubType(subType) {
    if (leaderboardState.currentSubType === subType) return;

    leaderboardState.currentSubType = subType;

    // 버튼 활성화
    document.querySelectorAll('.filter-btn[data-subtype]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtype === subType);
    });

    loadLeaderboard();
}

function changePeriod(period) {
    if (leaderboardState.currentPeriod === period) return;

    leaderboardState.currentPeriod = period;

    // 버튼 활성화
    document.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });

    loadLeaderboard();
}

function updateSubTypeVisibility(type) {
    const subTypeFilter = document.getElementById('subTypeFilter');
    if (!subTypeFilter) return;

    const btns = subTypeFilter.querySelectorAll('.filter-btn');

    if (type === 'betting-accuracy') {
        // 베팅 적중률: 통합, 포디움, 1:1
        subTypeFilter.style.display = 'flex';
        btns[0]?.setAttribute('data-subtype', 'total');
        btns[0] && (btns[0].textContent = '통합');
        btns[1]?.setAttribute('data-subtype', 'podium');
        btns[1] && (btns[1].textContent = '포디움');
        btns[2]?.setAttribute('data-subtype', 'h2h');
        btns[2] && (btns[2].textContent = '1:1');
        btns[2] && (btns[2].style.display = '');
        btns.forEach((btn, i) => btn.classList.toggle('active', i === 0));
    } else if (type === 'attendance') {
        // 출석: 연속 출석, 누적 출석
        subTypeFilter.style.display = 'flex';
        btns[0]?.setAttribute('data-subtype', 'consecutive');
        btns[0] && (btns[0].textContent = '연속 출석');
        btns[1]?.setAttribute('data-subtype', 'cumulative');
        btns[1] && (btns[1].textContent = '누적 출석');
        btns[2] && (btns[2].style.display = 'none');
        btns.forEach((btn, i) => btn.classList.toggle('active', i === 0));
    } else {
        subTypeFilter.style.display = 'none';
    }
}

// ========================================
// 리더보드 로드
// ========================================

async function loadLeaderboard() {
    logger.log('[Leaderboard] loadLeaderboard() 호출됨');

    if (leaderboardState.isLoading) {
        logger.log('[Leaderboard] 이미 로딩 중, 스킵');
        return;
    }

    leaderboardState.isLoading = true;

    const container = document.getElementById('leaderboardContent');
    if (!container) {
        console.error('[Leaderboard] leaderboardContent 컨테이너를 찾을 수 없음');
        return;
    }

    // 로딩 표시
    container.innerHTML = `
        <div class="leaderboard-loading">
            <div class="loading-spinner"></div>
            <span>리더보드 로딩 중...</span>
        </div>
    `;

    try {
        const { currentType, currentSubType, currentPeriod } = leaderboardState;
        logger.log('[Leaderboard] 현재 상태:', { currentType, currentSubType, currentPeriod });

        // API 타입 매핑
        let apiType = currentType;

        // API URL 구성
        let url = `/api/leaderboard/${apiType}?limit=50&period=${currentPeriod}`;

        // 서브타입 파라미터 전달 (베팅 적중률, 출석)
        if (currentSubType && (currentType === 'betting-accuracy' || currentType === 'attendance')) {
            url += `&subType=${currentSubType}`;
        }

        logger.log('[Leaderboard] API 요청 URL:', url);

        // API 호출 (캐싱 적용 - 5분)
        const response = await smartFetch(url, {}, { useCache: true, ttl: LEADERBOARD_CONFIG.CACHE_TTL_MS });
        logger.log('[Leaderboard] API 응답 상태:', response.status, response.statusText);
        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '리더보드 조회 실패');
        }

        leaderboardState.rankings = data.rankings || [];
        leaderboardState.totalParticipants = data.totalParticipants || 0;
        leaderboardState.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : new Date();

        // 코스메틱 배치 조회
        if (typeof fetchCosmeticsBatch === 'function' && leaderboardState.rankings.length > 0) {
            const userIds = leaderboardState.rankings.map(r => r.userId).filter(Boolean);
            leaderboardState.cosmeticsMap = await fetchCosmeticsBatch(userIds);
        }

        // 내 순위 조회
        await loadMyRank();

        // 렌더링
        renderLeaderboard();

    } catch (error) {
        console.error('[Leaderboard] 리더보드 로드 실패:', error);
        console.error('[Leaderboard] 에러 상세:', error.message, error.stack);
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
    logger.log('[Leaderboard] 로딩 완료');
}

async function loadMyRank() {
    const user = getCurrentUser();
    if (!user) {
        leaderboardState.myRank = null;
        return;
    }

    try {
        const { currentType, currentSubType, currentPeriod } = leaderboardState;

        let apiType = currentType;

        let url = `/api/leaderboard/${apiType}/my-rank`;
        const params = [`period=${currentPeriod}`];

        // 서브타입 파라미터 전달 (베팅 적중률, 출석)
        if (currentSubType && (currentType === 'betting-accuracy' || currentType === 'attendance')) {
            params.push(`subType=${currentSubType}`);
        }
        url += '?' + params.join('&');

        // 인증 토큰 포함 (캐싱 적용 - 5분)
        const idToken = await user.getIdToken();
        const response = await smartFetch(url, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        }, { useCache: true, ttl: LEADERBOARD_CONFIG.CACHE_TTL_MS });

        if (!response.ok) {
            leaderboardState.myRank = null;
            return;
        }

        const data = await response.json();
        if (data.success && data.myRank) {
            leaderboardState.myRank = data.myRank;
            if (data.totalParticipants !== undefined) {
                leaderboardState.totalParticipants = data.totalParticipants;
            }
        } else {
            leaderboardState.myRank = null;
        }
    } catch (error) {
        console.error('내 순위 조회 실패:', error);
        leaderboardState.myRank = null;
    }
}

// ========================================
// 렌더링
// ========================================

function renderLeaderboard() {
    const container = document.getElementById('leaderboardContent');
    if (!container) return;

    const { rankings, currentType } = leaderboardState;

    if (rankings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <img src="images/icons/icon-chart.svg" alt="" class="empty-icon">
                <p class="empty-title">시즌이 시작되면 랭킹이 업데이트됩니다</p>
                <p class="empty-subtitle">${getEmptyHint(currentType)}</p>
                <a href="betting.html" class="empty-cta">베팅 참여하기</a>
            </div>
            ${renderMyRankCard()}
        `;
        return;
    }

    // 통합 리스트로 렌더링
    container.innerHTML = `
        ${renderRankingList(rankings)}
        ${renderMyRankCard()}
    `;
}

function getEmptyHint(type) {
    switch (type) {
        case 'betting-accuracy':
            return '베팅 정산 후 순위가 표시됩니다';
        case 'coin':
            return '토큰을 획득하면 순위가 표시됩니다';
        case 'community':
            return '커뮤니티 활동을 시작해보세요';
        case 'attendance':
            return '출석체크를 하면 순위가 표시됩니다';
        default:
            return '';
    }
}

// ========================================
// 테이블 렌더링
// ========================================

function renderRankingList(rankings) {
    if (rankings.length === 0) return '';

    const user = getCurrentUser();
    const { currentType } = leaderboardState;
    const headers = getTableHeaders(currentType);

    return `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>유저</th>
                    ${headers.map(h => `<th class="${h.hideOnMobile ? 'hide-mobile' : ''}">${h.label}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rankings.map((item, index) => renderTableRow(item, index + 1, user, currentType, headers)).join('')}
            </tbody>
        </table>
    `;
}

function renderTableRow(item, position, user, type, headers) {
    const isMe = user && item.userId === user.uid;
    const safePhotoURL = getSafePhotoURL(item.photoURL, null);
    const safeDisplayName = escapeHtml(item.displayName || '?');
    const cosmetics = leaderboardState.cosmeticsMap[item.userId] || null;

    let rankClass = '';
    if (position === 1) rankClass = 'top-1';
    else if (position === 2) rankClass = 'top-2';
    else if (position === 3) rankClass = 'top-3';

    // 코스메틱 아바타 렌더링
    let avatarHtml;
    if (typeof renderCosmeticAvatar === 'function' && cosmetics) {
        avatarHtml = renderCosmeticAvatar(item.photoURL, cosmetics, 30);
    } else if (safePhotoURL) {
        avatarHtml = `<img src="${safePhotoURL}" alt="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                      <div class="avatar-fallback" style="display:none;">${safeDisplayName[0].toUpperCase()}</div>`;
    } else {
        avatarHtml = `<div class="avatar-fallback">${safeDisplayName[0].toUpperCase()}</div>`;
    }

    // 코스메틱 닉네임 렌더링
    let nameHtml;
    if (typeof renderCosmeticName === 'function' && cosmetics) {
        nameHtml = renderCosmeticName(item.displayName || '?', cosmetics);
    } else {
        nameHtml = `<span class="cosmetic-name">${safeDisplayName}</span>`;
    }

    return `
        <tr class="${isMe ? 'is-me' : ''}">
            <td><span class="rank-num ${rankClass}">${position}</span></td>
            <td>
                <a href="mypage.html?uid=${encodeURIComponent(item.userId)}" class="user-cell-link">
                    <div class="user-cell">
                        <div class="user-avatar">
                            ${avatarHtml}
                        </div>
                        <span class="user-name">${nameHtml}${isMe ? '<span class="me-badge">나</span>' : ''}</span>
                    </div>
                </a>
            </td>
            ${headers.map(h => `<td class="${h.hideOnMobile ? 'hide-mobile' : ''}">${getTableCellValue(item, h.key, type)}</td>`).join('')}
        </tr>
    `;
}

function getTableHeaders(type) {
    switch (type) {
        case 'betting-accuracy':
            return [
                { label: '적중률', key: 'accuracy' },
                { label: '참여', key: 'totalBets', hideOnMobile: true },
                { label: '연속', key: 'streak' }
            ];
        case 'coin':
            return [
                { label: '획득량', key: 'periodEarned' },
                { label: '보유량', key: 'tokens', hideOnMobile: true }
            ];
        case 'community':
            return [
                { label: '공감', key: 'receivedLikes' },
                { label: '게시글', key: 'postCount', hideOnMobile: true },
                { label: '댓글', key: 'commentCount', hideOnMobile: true }
            ];
        case 'attendance':
            if (leaderboardState.currentSubType === 'consecutive') {
                return [
                    { label: '연속 출석', key: 'consecutiveDays' },
                    { label: '누적', key: 'cumulativeDays', hideOnMobile: true }
                ];
            } else {
                return [
                    { label: '누적 출석', key: 'cumulativeDays' },
                    { label: '연속', key: 'consecutiveDays', hideOnMobile: true }
                ];
            }
        default:
            return [];
    }
}

function getTableCellValue(item, key, type) {
    switch (key) {
        case 'accuracy':
            return `<span class="stat-primary">${item.accuracy ? item.accuracy.toFixed(1) : '0.0'}%</span>`;
        case 'totalBets':
            return `<span class="stat-secondary">${item.totalBets || 0}회</span>`;
        case 'streak':
            const streak = item.consecutiveDays || item.currentStreak || item.streak || 0;
            if (streak >= 3) {
                return `<span class="streak-badge hot">${streak}연속<img src="images/icons/icon-fire.svg" alt="" class="inline-icon"></span>`;
            } else if (streak > 0) {
                return `<span class="streak-badge">${streak}연속</span>`;
            }
            return '<span class="stat-secondary">-</span>';
        case 'tokens':
            return `<span class="stat-primary">${formatNumber(item.tokens || item.currentTokens || 0)}</span>`;
        case 'totalEarned':
            return `<span class="stat-secondary">${formatNumber(item.totalEarned || 0)}</span>`;
        case 'periodEarned':
            return `<span class="stat-primary">${formatNumber(item.periodEarned || item.totalEarned || 0)}</span>`;
        case 'receivedLikes':
            return `<span class="stat-primary">${formatNumber(item.receivedLikes || 0)}</span>`;
        case 'postCount':
            return `<span class="stat-secondary">${item.postCount || 0}</span>`;
        case 'commentCount':
            return `<span class="stat-secondary">${item.commentCount || 0}</span>`;
        case 'consecutiveDays':
            const consecutive = item.consecutiveDays || 0;
            if (consecutive >= 7) {
                return `<span class="streak-badge hot">${consecutive}일<img src="images/icons/icon-fire.svg" alt="" class="inline-icon"></span>`;
            } else if (consecutive >= 3) {
                return `<span class="streak-badge">${consecutive}일</span>`;
            }
            return `<span class="stat-primary">${consecutive}일</span>`;
        case 'cumulativeDays':
            return `<span class="stat-primary">${item.cumulativeDays || 0}일</span>`;
        case 'days':
            return `<span class="stat-primary">${item.days || 0}일</span>`;
        default:
            return '-';
    }
}

function getStatDisplay(item, type) {
    switch (type) {
        case 'betting-accuracy':
            return {
                value: item.accuracy ? item.accuracy.toFixed(1) : '0.0',
                label: '%'
            };
        case 'coin':
            return {
                value: formatNumber(item.periodEarned || item.totalEarned || 0),
                label: 'FC'
            };
        case 'community':
            return {
                value: formatNumber(item.receivedLikes || 0),
                label: '공감'
            };
        case 'attendance':
            if (leaderboardState.currentSubType === 'consecutive') {
                return {
                    value: item.consecutiveDays || 0,
                    label: '일 연속'
                };
            } else {
                return {
                    value: item.cumulativeDays || 0,
                    label: '일'
                };
            }
        default:
            return { value: '-', label: '' };
    }
}

function getSubStatText(item, type) {
    switch (type) {
        case 'betting-accuracy':
            return `${item.correctBets || 0}승 / ${item.totalBets || 0}전`;
        case 'coin':
            return `보유: ${formatNumber(item.tokens || item.currentTokens || 0)} FC`;
        case 'community':
            return `게시글 ${item.postCount || 0} / 댓글 ${item.commentCount || 0}`;
        case 'attendance':
            const streak = item.consecutiveDays || item.currentStreak || item.streak || 0;
            if (leaderboardState.currentSubType === 'consecutive') {
                return `누적 출석: ${item.cumulativeDays || 0}일`;
            } else {
                if (streak > 0) {
                    return `${streak}일 연속 출석 중`;
                }
                return `연속 출석: ${streak}일`;
            }
        default:
            return '';
    }
}

function renderMyRankCard() {
    const user = getCurrentUser();
    const { currentType, totalParticipants } = leaderboardState;

    if (!user) {
        return `
            <div class="my-rank-card guest">
                <span class="guest-icon"><img src="images/icons/icon-user.svg" alt="" class="inline-icon"></span>
                <span class="guest-text">로그인해서 경쟁에 참여해보세요!</span>
            </div>
        `;
    }

    const myRank = leaderboardState.myRank;

    if (!myRank) {
        const noDataText = currentType === 'betting-accuracy'
            ? '아직 베팅 정보가 없습니다!'
            : '아직 순위정보가 없습니다';
        return `
            <div class="my-rank-card no-data">
                <span class="no-data-icon"><img src="images/icons/icon-chart.svg" alt="" class="inline-icon"></span>
                <span class="no-data-text">${noDataText}</span>
                <span class="no-data-hint">${getParticipateHint(currentType)}</span>
            </div>
        `;
    }

    const { value, label } = getStatDisplay(myRank, currentType);
    const subStats = getMyRankStats(myRank, currentType);

    // 다음 순위까지 차이 계산
    const nextRankInfo = getNextRankInfo(myRank, currentType);

    // 필터별 순위 표시
    let rankBadgeHtml = '';
    if (totalParticipants > 0) {
        const percentile = Math.round((myRank.rank / totalParticipants) * 100);
        rankBadgeHtml = `<span class="my-rank-percentile">${totalParticipants}명 중 ${myRank.rank}위</span>`;
        if (totalParticipants >= 10) {
            rankBadgeHtml += `<span class="my-rank-percentile">상위 ${percentile}%</span>`;
        }
    }

    return `
        <div class="my-rank-card">
            <div class="my-rank-header">
                <span class="my-rank-icon"><img src="images/icons/icon-pin.svg" alt="" class="inline-icon"></span>
                <span class="my-rank-title">내 순위</span>
            </div>
            <div class="my-rank-main">
                <span class="my-rank-position">${myRank.rank}위</span>
                ${rankBadgeHtml}
            </div>
            <div class="my-rank-stats">
                ${subStats.map(s => `<span>${s.label}: <span class="stat-value">${s.value}</span></span>`).join('')}
            </div>
            ${nextRankInfo ? `
                <div class="my-rank-next">
                    <span>⬆️</span>
                    <span>${nextRankInfo}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function getMyRankStats(myRank, type) {
    switch (type) {
        case 'betting-accuracy':
            return [
                { label: '적중률', value: `${myRank.accuracy ? myRank.accuracy.toFixed(1) : '0.0'}%` },
                { label: '참여', value: `${myRank.totalBets || 0}회` },
                { label: '연속', value: `${myRank.currentStreak || 0}회` }
            ];
        case 'coin':
            return [
                { label: '획득량', value: `${formatNumber(myRank.periodEarned || myRank.totalEarned || 0)} FC` },
                { label: '보유량', value: `${formatNumber(myRank.tokens || 0)} FC` }
            ];
        case 'community':
            return [
                { label: '공감', value: formatNumber(myRank.receivedLikes || 0) },
                { label: '게시글', value: myRank.postCount || 0 },
                { label: '댓글', value: myRank.commentCount || 0 }
            ];
        case 'attendance':
            if (leaderboardState.currentSubType === 'consecutive') {
                return [
                    { label: '연속 출석', value: `${myRank.consecutiveDays || myRank.currentStreak || 0}일` },
                    { label: '누적', value: `${myRank.cumulativeDays || 0}일` }
                ];
            } else {
                return [
                    { label: '누적 출석', value: `${myRank.cumulativeDays || 0}일` },
                    { label: '연속', value: `${myRank.consecutiveDays || myRank.currentStreak || 0}일` }
                ];
            }
        default:
            return [];
    }
}

function getNextRankInfo(myRank, type) {
    if (myRank.rank <= 1) return null;

    const diff = myRank.nextRankDiff;
    if (!diff) return null;

    switch (type) {
        case 'betting-accuracy':
            return `${myRank.rank - 1}위까지 ${diff.toFixed(1)}% 차이`;
        case 'coin':
            return `${myRank.rank - 1}위까지 ${formatNumber(diff)} FC 차이`;
        case 'community':
            return `${myRank.rank - 1}위까지 ${diff}개 공감 차이`;
        case 'attendance':
            return `${myRank.rank - 1}위까지 ${diff}일 차이`;
        default:
            return null;
    }
}

function getParticipateHint(type) {
    switch (type) {
        case 'betting-accuracy':
            return '베팅에 참여하고 순위에 도전하세요!';
        case 'coin':
            return '다양한 활동으로 토큰을 획득하세요!';
        case 'community':
            return '게시글을 작성하고 공감을 받아보세요!';
        case 'attendance':
            return '매일 출석체크에 참여하세요!';
        default:
            return '';
    }
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
// 페이지 로드 시 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initLeaderboard();
});
