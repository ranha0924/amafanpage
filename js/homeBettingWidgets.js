// ========================================
// Home Betting Widgets Module
// ========================================

(function() {
    'use strict';

    // ========================================
    // 유틸리티
    // ========================================

    function hwGetOddsTierClass(odds) {
        if (odds >= 5.0) return 'odds-extreme';
        if (odds >= 3.0) return 'odds-high';
        if (odds >= 2.0) return 'odds-mid';
        return 'odds-low';
    }

    function maskName(name) {
        if (!name || name.length < 2) return '***';
        if (name.length === 2) return name[0] + '*';
        const first = name[0];
        const last = name[name.length - 1];
        const middle = '*'.repeat(Math.min(name.length - 2, 3));
        return escapeHtml(first + middle + last);
    }

    // ========================================
    // 포디움 예측 현황 위젯
    // ========================================

    function renderPodiumWidget(data) {
        const body = document.getElementById('homePodiumBody');
        if (!body) return;

        const { podium } = data;
        const participants = podium ? podium.totalParticipants : 0;
        const totalBet = podium ? podium.totalBetAmount : 0;

        // 마감까지 남은 시간 계산 (히어로 섹션과 동일 형식)
        const nextRace = typeof getNextRace === 'function' ? getNextRace() : null;
        let deadlineText = '--';
        if (nextRace && nextRace.race) {
            const diff = new Date(nextRace.race.date) - Date.now();
            if (diff > 0) {
                const days = Math.floor(diff / 86400000);
                const hours = Math.floor((diff % 86400000) / 3600000);
                deadlineText = `${days}일 ${hours}시간`;
            } else {
                deadlineText = '마감됨';
            }
        }

        const metaHtml = `
            <div class="hw-podium-meta">
                <span class="hw-meta-item">
                    <img src="images/icons/icon-user.svg" alt="" class="hw-meta-icon">
                    참여 <strong>${participants}명</strong>
                </span>
                <span class="hw-meta-item">
                    <img src="images/icons/icon-coins.svg" alt="" class="hw-meta-icon">
                    총 베팅 <strong>${totalBet.toLocaleString()} FC</strong>
                </span>
                <span class="hw-meta-item">
                    <img src="images/icons/icon-clock.svg" alt="" class="hw-meta-icon">
                    마감 <strong>${deadlineText}</strong>
                </span>
            </div>`;

        // 실시간 배당률 우선, 없으면 클라이언트 배당률 폴백
        const liveOdds = podium?.liveOdds || {};
        const top5 = (typeof F1_DRIVERS_2026 !== 'undefined' ? F1_DRIVERS_2026 : [])
            .map(d => ({
                ...d,
                odds: liveOdds[d.number] ?? 99
            }))
            .sort((a, b) => a.odds - b.odds)
            .slice(0, 5);

        let driversHtml = '<div class="hw-list-header">낮은 배당률 TOP 5</div>';
        driversHtml += '<div class="hw-driver-list">';
        top5.forEach(d => {
            const safeColor = d.teamColor && /^#[0-9A-Fa-f]{6}$/.test(d.teamColor) ? d.teamColor : '#888';
            const imgUrl = typeof getDriverImageUrl === 'function'
                ? getDriverImageUrl(d.name, d.team) : '';
            const safeName = escapeHtml(d.name);

            driversHtml += `
                <div class="hw-driver-row">
                    <div class="hw-team-bar" style="background:${safeColor}"></div>
                    <img src="${imgUrl}" alt="" class="hw-driver-avatar" loading="lazy" onerror="this.style.display='none'">
                    <div class="hw-driver-info">
                        <span class="hw-driver-number" style="color:${safeColor}">#${d.number}</span>
                        <span class="hw-driver-name">${safeName}</span>
                    </div>
                    <span class="hw-driver-odds ${hwGetOddsTierClass(d.odds)}">${d.odds.toFixed(1)}x</span>
                </div>`;
        });
        driversHtml += '</div>';

        body.innerHTML = metaHtml + driversHtml;
    }

    // ========================================
    // 1:1 매치업 위젯
    // ========================================

    function renderMatchupWidget(data) {
        const body = document.getElementById('homeMatchupBody');
        if (!body) return;

        const { matchups } = data;

        if (!matchups || matchups.length === 0) {
            body.innerHTML = `
                <div class="empty-state empty-state--compact">
                    <img src="images/icons/icon-swords.svg" alt="" class="empty-icon">
                    <p class="empty-title">아직 매치업 베팅이 없습니다</p>
                    <a href="betting.html#h2h" class="empty-cta">매치업 베팅하기</a>
                </div>`;
            return;
        }

        let html = '<div class="hw-matchup-list">';
        matchups.slice(0, 5).forEach(m => {
            const nameA = m.driverA ? m.driverA.name : '?';
            const nameB = m.driverB ? m.driverB.name : '?';
            const teamA = m.driverA ? m.driverA.team : '';
            const teamB = m.driverB ? m.driverB.team : '';
            const shortA = nameA.split(' ').pop().slice(0, 3).toUpperCase();
            const shortB = nameB.split(' ').pop().slice(0, 3).toUpperCase();

            html += `
                <div class="hw-matchup-row">
                    <div class="hw-matchup-driver">
                        <span class="hw-matchup-name hw-matchup-a">${escapeHtml(shortA)}</span>
                        <span class="hw-matchup-team">${escapeHtml(teamA)}</span>
                    </div>
                    <div class="hw-matchup-center">
                        <span class="hw-vs-text">VS</span>
                        <div class="hw-matchup-bar">
                            <div class="hw-matchup-bar-a" style="width:${m.percentA}%"></div>
                            <div class="hw-matchup-bar-b" style="width:${m.percentB}%"></div>
                        </div>
                        <div class="hw-matchup-percents">
                            <span class="hw-percent-a">${m.percentA}%</span>
                            <span class="hw-percent-b">${m.percentB}%</span>
                        </div>
                        <span class="hw-matchup-participants">${m.participants}명 참여</span>
                    </div>
                    <div class="hw-matchup-driver">
                        <span class="hw-matchup-name hw-matchup-b">${escapeHtml(shortB)}</span>
                        <span class="hw-matchup-team">${escapeHtml(teamB)}</span>
                    </div>
                </div>`;
        });
        html += '</div>';

        body.innerHTML = html;
    }

    // ========================================
    // 베팅 프리뷰 데이터 로드
    // ========================================

    async function loadHomeBettingPreview() {
        try {
            const response = await fetch('/api/betting/home-preview');
            if (!response.ok) throw new Error('API 오류');
            const data = await response.json();
            if (!data.success) throw new Error('데이터 오류');

            renderPodiumWidget(data);
            renderMatchupWidget(data);
        } catch (error) {
            console.error('홈 베팅 프리뷰 로드 실패:', error);
            // 에러 시 빈 상태 표시
            renderPodiumWidget({ podium: { totalParticipants: 0, totalBetAmount: 0, topDrivers: [] } });
            renderMatchupWidget({ matchups: [] });
        }
    }

    // ========================================
    // 내 대시보드 위젯
    // ========================================

    async function loadHomeDashboard() {
        const body = document.getElementById('homeDashboardBody');
        if (!body) return;

        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

        if (!user) {
            body.innerHTML = `
                <div class="hw-dash-guest">
                    <img src="images/icons/icon-user.svg" alt="" class="hw-dash-guest-icon">
                    <p class="hw-dash-guest-title">로그인하고 베팅에 참여하세요</p>
                    <button class="hw-dash-login-btn" onclick="signInWithGoogle()">
                        <svg class="google-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Google 로그인
                    </button>
                </div>`;
            return;
        }

        // 로그인 상태 - 사용자 정보 표시
        try {
            const displayName = typeof getEffectiveDisplayName === 'function'
                ? getEffectiveDisplayName(user) : (user.displayName || '사용자');
            const photoURL = typeof getSafePhotoURL === 'function'
                ? getSafePhotoURL(user.photoURL) : user.photoURL;
            const safeDisplayName = escapeHtml(displayName);

            // 병렬 데이터 페칭
            const [userData, cosmetics, rankResult] = await Promise.all([
                typeof getUserTokens === 'function' ? getUserTokens() : null,
                typeof fetchUserCosmetics === 'function' ? fetchUserCosmetics(user.uid) : null,
                (async () => {
                    try {
                        const idToken = await user.getIdToken();
                        const res = await fetch('/api/leaderboard/betting-accuracy/my-rank?subType=total&period=all', {
                            headers: { 'Authorization': `Bearer ${idToken}` }
                        });
                        if (res.ok) return await res.json();
                    } catch (e) { /* 조용히 실패 */ }
                    return null;
                })()
            ]);

            const tokens = userData?.tokens || 0;
            const consecutiveDays = userData?.consecutiveDays || 0;
            const hasAttendedToday = userData?.lastAttendance && typeof isToday === 'function'
                ? isToday(userData.lastAttendance) : false;

            // 칭호 (비활성화)
            // const titleName = cosmetics?.titles?.[0]?.name || '칭호 없음';

            // 적중률/순위
            let accuracy = '---';
            let rank = '---';
            if (rankResult?.success && rankResult.myRank) {
                accuracy = rankResult.myRank.accuracy ? rankResult.myRank.accuracy.toFixed(1) + '%' : '---';
                rank = rankResult.myRank.rank ? '#' + rankResult.myRank.rank : '---';
            }

            // 스트릭 계산
            const filledDots = consecutiveDays % 7 || (consecutiveDays >= 7 ? 7 : 0);
            const nextDayInCycle = (consecutiveDays % 7) + 1;
            const nextReward = nextDayInCycle === 7
                ? TOKEN_CONFIG.ATTENDANCE + TOKEN_CONFIG.ATTENDANCE_STREAK_BONUS
                : TOKEN_CONFIG.ATTENDANCE;
            const rewardLabel = hasAttendedToday ? '내일 보상' : '출석 보상';

            // 스트릭 dots HTML
            let dotsHtml = '';
            for (let i = 0; i < 7; i++) {
                dotsHtml += `<span class="hw-streak-dot${i < filledDots ? ' filled' : ''}"></span>`;
            }

            // 레이스 참여 상태
            let raceHtml = '';
            try {
                const nextRace = typeof getNextRace === 'function' ? getNextRace() : null;
                if (nextRace?.race) {
                    const raceDate = new Date(nextRace.race.date);
                    const kst = typeof getKSTDateParts === 'function' ? getKSTDateParts(raceDate) : null;
                    if (kst) {
                        const raceId = `race_${nextRace.index + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;
                        let participated = false;
                        try {
                            if (typeof db !== 'undefined') {
                                const betDoc = await db.collection('podiumBets').doc(raceId + '_' + user.uid).get();
                                participated = betDoc.exists;
                            }
                        } catch (e) { /* 조용히 실패 */ }

                        const raceName = escapeHtml(nextRace.race.name.replace(/🧪\s*/, ''));
                        if (participated) {
                            raceHtml = `
                                <div class="hw-dash-race">
                                    <span>${raceName}</span>
                                    <span class="hw-dash-race-status participated">참여완료</span>
                                </div>`;
                        } else {
                            raceHtml = `
                                <div class="hw-dash-race">
                                    <span>${raceName}</span>
                                    <span class="hw-dash-race-status not-participated">미참여</span>
                                    <a href="betting.html" class="hw-dash-race-go">GO
                                        <img src="images/icons/icon-arrow-right.svg" alt="" class="hw-dash-race-go-icon">
                                    </a>
                                </div>`;
                        }
                    }
                }
            } catch (e) { /* 레이스 상태 실패 시 표시하지 않음 */ }

            const avatarHtml = photoURL
                ? `<img src="${escapeHtml(photoURL)}" alt="" class="hw-dash-avatar" onerror="this.outerHTML='<div class=hw-dash-avatar-fallback>${safeDisplayName[0].toUpperCase()}</div>'">`
                : `<div class="hw-dash-avatar-fallback">${safeDisplayName[0].toUpperCase()}</div>`;

            const attendanceBtnHtml = hasAttendedToday
                ? `<button class="hw-dash-attendance-btn completed" disabled>
                       <img src="images/icons/icon-check.svg" alt="" class="hw-btn-icon"> 출석 완료
                   </button>`
                : `<button class="hw-dash-attendance-btn" id="homeDashAttendanceBtn">
                       <img src="images/icons/icon-calendar.svg" alt="" class="hw-btn-icon"> 출석하기
                   </button>`;

            body.innerHTML = `
                <div class="hw-dash-header">
                    ${avatarHtml}
                    <div class="hw-dash-user-detail">
                        <span class="hw-dash-name">${safeDisplayName}</span>
                        <!-- 칭호 비활성화 -->
                    </div>
                </div>
                <div class="hw-dash-body">
                    <div class="hw-dash-coins">
                        <img src="images/AMRcoin.png" alt="" class="hw-dash-coins-icon">
                        ${tokens.toLocaleString()} FC
                    </div>
                    <div class="hw-dash-streak-section">
                        <span class="hw-dash-streak-label">연속 출석</span>
                        <div class="hw-dash-streak-dots">
                            ${dotsHtml}
                            <span class="hw-dash-streak-count">${filledDots}/7</span>
                        </div>
                        <span class="hw-dash-streak-next">${rewardLabel}: +${nextReward} FC</span>
                    </div>
                </div>
                <div class="hw-dash-attendance">
                    ${attendanceBtnHtml}
                </div>
                <div class="hw-dash-stats-row">
                    <span>적중률 ${accuracy}</span>
                    <span class="hw-dash-stats-row-dot"></span>
                    <span>순위 ${rank}</span>
                </div>
                ${raceHtml}`;

            // 출석 버튼 이벤트
            const attendanceBtn = document.getElementById('homeDashAttendanceBtn');
            if (attendanceBtn && typeof performAttendance === 'function') {
                attendanceBtn.addEventListener('click', async () => {
                    const result = await performAttendance();
                    if (result) {
                        loadHomeDashboard();
                    }
                });
            }

        } catch (error) {
            console.error('대시보드 로드 실패:', error);
            body.innerHTML = `
                <div class="empty-state empty-state--compact">
                    <img src="images/icons/icon-warning.svg" alt="" class="empty-icon">
                    <p class="empty-title">대시보드를 불러올 수 없습니다</p>
                </div>`;
        }
    }

    // ========================================
    // TOP 베터 리더보드 위젯
    // ========================================

    async function loadHomeLeaderboard() {
        const body = document.getElementById('homeLeaderboardBody');
        if (!body) return;

        try {
            const response = await fetch('/api/leaderboard/widget/podium-accuracy');
            if (!response.ok) throw new Error('API 오류');

            const data = await response.json();
            if (!data.success || !data.topThree || data.topThree.length === 0) {
                body.innerHTML = `
                    <div class="empty-state empty-state--compact">
                        <img src="images/icons/icon-trophy.svg" alt="" class="empty-icon">
                        <p class="empty-title">첫번째 TOP 베터가 되어보세요!</p>
                    </div>`;
                return;
            }

            let html = '<div class="hw-lb-list">';
            const rankClasses = ['hw-lb-gold', 'hw-lb-silver', 'hw-lb-bronze'];

            data.topThree.forEach((item, i) => {
                const safeName = maskName(item.displayName);
                const photoHtml = item.photoURL
                    ? `<img src="${escapeHtml(item.photoURL)}" alt="" class="hw-lb-avatar" onerror="this.outerHTML='<div class=hw-lb-avatar-fallback>${escapeHtml((item.displayName || '?')[0].toUpperCase())}</div>'">`
                    : `<div class="hw-lb-avatar-fallback">${escapeHtml((item.displayName || '?')[0].toUpperCase())}</div>`;

                html += `
                    <div class="hw-lb-row">
                        <span class="hw-lb-rank ${rankClasses[i] || ''}">${i + 1}</span>
                        ${photoHtml}
                        <span class="hw-lb-name">${safeName}</span>
                        <span class="hw-lb-score">${item.accuracy ? item.accuracy.toFixed(1) : 0}%</span>
                    </div>`;
            });
            html += '</div>';

            body.innerHTML = html;

        } catch (error) {
            console.error('리더보드 위젯 로드 실패:', error);
            body.innerHTML = `
                <div class="empty-state empty-state--compact">
                    <img src="images/icons/icon-warning.svg" alt="" class="empty-icon">
                    <p class="empty-title">리더보드를 불러올 수 없습니다</p>
                </div>`;
        }
    }

    // ========================================
    // 커뮤니티 위젯 (카드 4개)
    // ========================================

    async function loadHomeCommunity() {
        const body = document.getElementById('homeCommunityBody');
        if (!body || typeof db === 'undefined') return;

        try {
            const snapshot = await db.collection('posts')
                .orderBy('likeCount', 'desc')
                .limit(4)
                .get();

            if (snapshot.empty) {
                body.innerHTML = `
                    <div class="empty-state empty-state--compact">
                        <img src="images/icons/icon-chat.svg" alt="" class="empty-icon">
                        <p class="empty-title">아직 작성된 글이 없습니다</p>
                        <a href="paddock.html" class="empty-cta">첫 글 쓰러 가기</a>
                    </div>`;
                return;
            }

            // 작성자 닉네임 배치 조회
            const authorIds = [...new Set(snapshot.docs.map(d => d.data().authorId).filter(Boolean))];
            let cosMap = {};
            if (typeof fetchCosmeticsBatch === 'function' && authorIds.length > 0) {
                try { cosMap = await fetchCosmeticsBatch(authorIds); } catch (e) { /* ignore */ }
            }

            let html = '<div class="hw-community-list">';
            snapshot.forEach(doc => {
                const post = doc.data();
                const safeTitle = escapeHtml(post.title || '');
                const name = (cosMap[post.authorId] && cosMap[post.authorId].customDisplayName) || post.authorName || '';
                const safeName = escapeHtml(name);

                const tagClass = {
                    '질문': 'hw-tag-question',
                    '응원': 'hw-tag-cheer',
                    '분석': 'hw-tag-analysis',
                    '자유': 'hw-tag-free',
                    '다른팀': 'hw-tag-other'
                }[post.tag] || 'hw-tag-free';

                html += `
                    <div class="hw-community-card" onclick="window.location.href='paddock.html?post=${doc.id}'">
                        <div class="hw-community-top">
                            ${post.tag ? `<span class="hw-community-tag ${tagClass}">#${escapeHtml(post.tag)}</span>` : ''}
                            <span class="hw-community-likes">
                                <img src="images/icons/icon-heart.svg" alt="" class="inline-icon"> ${post.likeCount || 0}
                            </span>
                        </div>
                        <div class="hw-community-title">${safeTitle}</div>
                        <div class="hw-community-author">${safeName}</div>
                    </div>`;
            });
            html += '</div>';

            body.innerHTML = html;

        } catch (e) {
            console.error('홈 커뮤니티 로드 실패:', e);
            body.innerHTML = `
                <div class="empty-state empty-state--compact">
                    <img src="images/icons/icon-warning.svg" alt="" class="empty-icon">
                    <p class="empty-title">커뮤니티를 불러올 수 없습니다</p>
                </div>`;
        }
    }

    // ========================================
    // 초기화
    // ========================================

    function init() {
        loadHomeBettingPreview();

        // 포디움 예측 현황 60초마다 갱신
        let bettingPollTimer = setInterval(loadHomeBettingPreview, 60000);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(bettingPollTimer);
            } else {
                loadHomeBettingPreview();
                bettingPollTimer = setInterval(loadHomeBettingPreview, 60000);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
