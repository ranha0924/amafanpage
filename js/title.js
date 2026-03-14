// ========================================
// Title Page Module - 칭호 도감 시스템
// ========================================

// 전역 상태
let allTitles = [];
let myTitleMap = {};
let myProgress = [];
let currentCategory = 'all';
let currentSort = 'rarity';
let isLoggedIn = false;
let activeSlotIndex = null;  // 선택 대기 슬롯 인덱스 (null = 비활성)
let recentFeed = [];          // 최근 달성 피드

const RARITY_ORDER = { normal: 0, rare: 1, special: 2, epic: 3, legendary: 4 };

const TITLE_DIFFICULTY = {
    // 베팅 - normal
    'bet-first': 1, 'bet-first-loss': 2, 'bet-5wins': 3, 'bet-10wins': 4,
    // 베팅 - special
    'bet-30wins': 1, 'bet-50wins': 2, 'bet-5loss-streak': 3, 'bet-perfect-week': 4,
    'bet-10streak': 5, 'bet-100wins': 6, 'bet-1000total': 7,
    // 베팅 - legendary
    'bet-not-a-bug': 1,
    // 출석 - rare
    'att-rookie': 1, 'att-ironman': 2, 'att-remember': 3, 'att-regular': 4,
    // 출석 - legendary
    'att-home': 1, 'att-resident': 2,
    // 코인 - normal
    'coin-first-earn': 1,
    // 코인 - rare
    'coin-shopaholic': 1, 'coin-miser': 2, 'coin-wealthy': 3, 'coin-bulk': 4, 'coin-777': 5,
    // 코인 - legendary
    'coin-bigspender': 1, 'coin-mansour': 2, 'coin-lawrence': 3,
    // 커뮤니티 - normal
    'comm-first-post': 1,
    // 커뮤니티 - rare
    'comm-storyteller': 1, 'comm-popular': 2, 'comm-prolific': 3,
    // 커뮤니티 - legendary
    'comm-paddock-og': 1, 'comm-influencer': 2,
    // 특별
    'special-og': 1, 'special-earlybird': 2, 'special-alpha-better': 3, 'special-founder': 4,
    // 히든
    'hidden-null': 1, 'hidden-adrian': 2, 'hidden-deleted': 3,
    'hidden-last-second': 4, 'hidden-watching': 5,
};

const CATEGORY_LABELS = {
    betting: '베팅 칭호',
    attendance: '출석/활동 칭호',
    coin: '코인/경제 칭호',
    community: '커뮤니티 칭호',
    special: '특별 칭호'
};

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSortButtons();
    initModalClose();
    initTitleSidebar();

    // 인증 불필요: 전체 칭호 목록 먼저 로드
    loadAllTitles();

    // 피드 로드 (인증 불필요)
    loadRecentFeed();

    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            const loginPrompt = document.getElementById('titleLoginPrompt');

            if (user) {
                isLoggedIn = true;
                if (loginPrompt) loginPrompt.style.display = 'none';
                await loadMyTitles(user);
            } else {
                isLoggedIn = false;
                myTitleMap = {};
                myProgress = [];
                if (loginPrompt) loginPrompt.style.display = '';
            }
            renderCollection();
            renderSidebarSlots();
            renderSidebarProgress();
            renderCategoryProgress();
            renderHiddenHint();
            updateMiniBar();
        });
    } else {
        document.getElementById('titleLoginPrompt').style.display = '';
        renderCollection();
    }
});

// ========================================
// 데이터 로딩
// ========================================

async function loadAllTitles() {
    try {
        const res = await fetch('/api/titles');
        const data = await res.json();
        if (data.success) {
            allTitles = data.titles;
        }
    } catch (error) {
        console.error('칭호 목록 로드 실패:', error);
        const container = document.getElementById('titleCollection');
        if (container) {
            container.innerHTML = `<div class="title-empty-state">
                <img src="images/icons/icon-trophy.svg" alt="" class="inline-icon title-empty-icon">
                <p>칭호 목록을 불러올 수 없습니다. 새로고침해 주세요.</p>
            </div>`;
        }
    }
}

async function loadMyTitles(user) {
    try {
        const token = await user.getIdToken();
        const res = await fetch('/api/titles/my', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const prevIds = getKnownTitleIds();

            myTitleMap = {};
            for (const mt of data.myTitles) {
                myTitleMap[mt.titleId] = mt;
            }
            myProgress = data.progress || [];

            // 새로 획득한 칭호 감지
            const currentIds = Object.keys(myTitleMap);
            const newIds = currentIds.filter(id => !prevIds.has(id));
            saveKnownTitleIds(currentIds);

            if (newIds.length > 0) {
                // allTitles 로드 대기 후 모달 표시
                setTimeout(() => showCongratsQueue(newIds), 500);
            }
        }
    } catch (error) {
        console.error('내 칭호 로드 실패:', error);
    }
}

// ========================================
// 탭 & 정렬
// ========================================

function initTabs() {
    const tabsEl = document.getElementById('titleTabs');
    if (!tabsEl) return;

    tabsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.title-tab');
        if (!btn) return;

        tabsEl.querySelectorAll('.title-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        renderCollection();
    });
}

function initSortButtons() {
    const sortEl = document.getElementById('titleSort');
    if (!sortEl) return;

    sortEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.title-sort-btn');
        if (!btn) return;

        sortEl.querySelectorAll('.title-sort-btn').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        renderCollection();
    });
}

// ========================================
// 렌더링 - 컬렉션
// ========================================

function renderCollection() {
    const container = document.getElementById('titleCollection');
    if (!container) return;

    if (allTitles.length === 0) {
        container.innerHTML = `<div class="title-empty-state">
            <img src="images/icons/icon-trophy.svg" alt="" class="inline-icon title-empty-icon">
            <p>등록된 칭호가 없습니다</p>
        </div>`;
        return;
    }

    // 1. 카테고리 필터
    let filtered = allTitles;
    if (currentCategory !== 'all') {
        filtered = allTitles.filter(t => t.category === currentCategory);
    }

    // 2. 정렬
    filtered = sortTitles([...filtered]);

    // 3. 렌더
    let html = '';

    if (currentCategory === 'all') {
        // 카테고리별 섹션 헤더 포함
        const grouped = groupByCategory(filtered);
        for (const [cat, titles] of grouped) {
            const ownedCount = titles.filter(t => myTitleMap[t.id]).length;
            const label = CATEGORY_LABELS[cat] || cat;
            html += `<div class="title-category-header">${safeText(label)} (${ownedCount}/${titles.length})</div>`;
            html += titles.map(t => renderTitleCard(t)).join('');
        }
    } else {
        html = filtered.map(t => renderTitleCard(t)).join('');
    }

    if (!html) {
        html = `<div class="title-empty-state">
            <img src="images/icons/icon-trophy.svg" alt="" class="inline-icon title-empty-icon">
            <p>해당 카테고리에 칭호가 없습니다</p>
        </div>`;
    }

    container.innerHTML = html;

    // 선택 모드 반영
    updateCollectionSelectMode();
}

function sortTitles(titles) {
    switch (currentSort) {
        case 'achieved':
            return titles.sort((a, b) => {
                const aOwned = myTitleMap[a.id] ? 1 : 0;
                const bOwned = myTitleMap[b.id] ? 1 : 0;
                if (aOwned !== bOwned) return bOwned - aOwned;

                if (aOwned && bOwned) {
                    // earnedAt 역순 (최신 먼저)
                    const aTime = getEarnedTime(a.id);
                    const bTime = getEarnedTime(b.id);
                    return bTime - aTime;
                }

                // 미달성: 진행도 역순
                const aProgress = getProgressPercent(a.id);
                const bProgress = getProgressPercent(b.id);
                return bProgress - aProgress;
            });

        case 'rarity':
            return titles.sort((a, b) => {
                const aHidden = a.hidden ? 1 : 0;
                const bHidden = b.hidden ? 1 : 0;
                if (aHidden !== bHidden) return aHidden - bHidden;

                const aOrder = RARITY_ORDER[getRarity(a)] ?? 99;
                const bOrder = RARITY_ORDER[getRarity(b)] ?? 99;
                if (aOrder !== bOrder) return aOrder - bOrder;

                return (TITLE_DIFFICULTY[a.id] ?? 50) - (TITLE_DIFFICULTY[b.id] ?? 50);
            });

        case 'recent':
            return titles.sort((a, b) => {
                const aOwned = myTitleMap[a.id] ? 1 : 0;
                const bOwned = myTitleMap[b.id] ? 1 : 0;
                if (aOwned !== bOwned) return bOwned - aOwned;

                const aTime = getEarnedTime(a.id);
                const bTime = getEarnedTime(b.id);
                return bTime - aTime;
            });

        default:
            return titles;
    }
}

function groupByCategory(titles) {
    const order = ['betting', 'attendance', 'coin', 'community', 'special'];
    const map = new Map();

    for (const cat of order) {
        map.set(cat, []);
    }

    for (const t of titles) {
        const cat = t.category || 'special';
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat).push(t);
    }

    // 빈 카테고리 제거
    for (const [key, val] of map) {
        if (val.length === 0) map.delete(key);
    }

    return map;
}

// ========================================
// 인라인 아이콘 헬퍼
// ========================================

function renderExtraIcon(extraIcon) {
    return '';
}

// ========================================
// 렌더링 - 칭호 카드
// ========================================

function renderTitleCard(t) {
    const owned = myTitleMap[t.id];
    const isOwned = !!owned;
    const isHidden = t.hidden && !isOwned;

    const style = t.style;
    const rarity = getRarity(t);
    const cssClass = (style && style.cssClass) ? style.cssClass : '';
    const extraIcon = (style && style.extraIcon) ? style.extraIcon : '';

    // ctitle-* 클래스: 텍스트에만 적용
    const inlineClass = cssClass ? 'ctitle-' + cssClass.replace('title-style-', '') : '';

    // 카드 클래스
    let cardClass = 'title-collection-card';
    if (isOwned) {
        cardClass += ' title-card-achieved';
    } else if (isHidden) {
        cardClass += ' title-card-hidden';
    } else {
        cardClass += ' title-card-locked';
    }

    const rarityAttr = ` data-rarity="${rarity}"`;

    // 상태 아이콘
    let statusHtml = '';
    if (isOwned) {
        statusHtml = `<div class="title-card-status title-card-status-achieved"><img src="images/icons/icon-check.svg" alt="" class="inline-icon"></div>`;
    } else if (isHidden) {
        statusHtml = `<div class="title-card-status title-card-status-hidden"><img src="images/icons/icon-question.svg" alt="" class="inline-icon"></div>`;
    } else {
        statusHtml = `<div class="title-card-status title-card-status-locked"><img src="images/icons/icon-lock.svg" alt="" class="inline-icon"></div>`;
    }

    // 추가 아이콘 (인라인)
    const extraIconHtml = extraIcon ? renderExtraIcon(extraIcon) : '';

    // 칭호명 - 항상 표시
    const displayName = safeText(t.name);

    // 조건 힌트
    const displayHint = isHidden ? '??????' : safeText(t.hint || '');

    // 진행도 바 (미달성 + 로그인 시)
    let progressHtml = '';
    if (!isOwned && isLoggedIn && !isHidden) {
        const prog = getProgressData(t.id);
        if (prog) {
            const percent = prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;
            progressHtml = `<div class="title-card-progress">
                <div class="title-card-progress-bar"><div class="title-card-progress-fill" style="width:${percent}%"></div></div>
                <div class="title-card-progress-text">${prog.current}/${prog.target}</div>
            </div>`;
        }
    }

    // 보유자 목록
    let holdersHtml = '';
    if (t.holders && t.holders.length > 0) {
        const maxShow = 5;
        const avatars = t.holders.slice(0, maxShow).map(h => {
            const photo = typeof getSafePhotoURL === 'function' ? getSafePhotoURL(h.photoURL || '') : (h.photoURL || '');
            return `<img src="${photo}" alt="" class="title-card-holder-avatar" onclick="event.stopPropagation();location.href='mypage.html?uid=${safeAttr(h.uid)}'" referrerpolicy="no-referrer">`;
        }).join('');
        const moreCount = t.holders.length - maxShow;
        const moreHtml = moreCount > 0 ? `<span class="title-card-holder-more">+${moreCount}</span>` : '';
        holdersHtml = `<div class="title-card-holders">${avatars}${moreHtml}</div>`;
    } else if (t.holderCount > 0 && t.holderCount > 20) {
        holdersHtml = `<div class="title-card-holder-count">${t.holderCount}명 보유</div>`;
    }

    return `<div class="title-collection-card${cardClass.replace('title-collection-card', '')}"${rarityAttr} data-title-id="${safeAttr(t.id)}" onclick="handleCardClick('${safeAttr(t.id)}')">
        ${statusHtml}
        <div class="title-card-name${inlineClass ? ' ' + inlineClass : ''}">${displayName}</div>
        <div class="title-card-hint">${displayHint}</div>
        ${progressHtml}
        ${holdersHtml}
    </div>`;
}

// ========================================
// 사이드바 - 초기화 & 토글
// ========================================

function initTitleSidebar() {
    const sidebar = document.getElementById('titleSidebar');
    if (!sidebar) return;

    // 모바일: 기본 접힌 상태
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) {
        sidebar.classList.add('collapsed');
    }
}

function toggleTitleSidebar() {
    const sidebar = document.getElementById('titleSidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');
}

// ========================================
// 사이드바 - 슬롯 렌더링
// ========================================

function renderSidebarSlots() {
    const slotsEl = document.getElementById('titleSidebarSlots');
    if (!slotsEl) return;

    // titles 배열에서 스타일 정보 맵 생성
    const titleStyleMap = {};
    for (const t of allTitles) {
        if (t.style) titleStyleMap[t.id] = t.style;
    }

    const equipped = Object.values(myTitleMap).filter(t => t.equipped);

    let html = '';
    for (let i = 0; i < 3; i++) {
        const eq = equipped[i];
        if (eq && isLoggedIn) {
            const safeName = safeText(eq.titleName);
            const style = titleStyleMap[eq.titleId];
            const cssClass = style && style.cssClass ? style.cssClass : '';
            const inlineClass = cssClass
                ? 'ctitle-' + cssClass.replace('title-style-', '')
                : '';
            const isActive = activeSlotIndex === i;
            html += `<div class="title-sidebar-slot title-sidebar-slot-filled${isActive ? ' title-sidebar-slot-active' : ''}" onclick="handleSlotClick(${i})">
                <span class="title-sidebar-slot-name ${safeText(inlineClass)}">${safeName}</span>
                <button class="title-sidebar-slot-remove" onclick="event.stopPropagation();handleSlotRemove('${safeAttr(eq.titleId)}')">
                    <img src="images/icons/icon-cross.svg" alt="해제" class="inline-icon">
                </button>
            </div>`;
        } else {
            const isActive = activeSlotIndex === i;
            html += `<div class="title-sidebar-slot title-sidebar-slot-empty${isActive ? ' title-sidebar-slot-active' : ''}" onclick="handleSlotClick(${i})">
                <img src="images/icons/icon-plus.svg" alt="" class="inline-icon">
                <span>칭호를 선택하세요</span>
            </div>`;
        }
    }

    slotsEl.innerHTML = html;
}

// ========================================
// 사이드바 - 달성률 렌더링
// ========================================

function renderSidebarProgress() {
    const valueEl = document.getElementById('titleProgressValue');
    const fillEl = document.getElementById('titleProgressFill');
    if (!valueEl || !fillEl) return;

    const total = allTitles.length;
    const owned = Object.keys(myTitleMap).length;
    const percent = total > 0 ? Math.round((owned / total) * 100) : 0;

    valueEl.textContent = `${owned}/${total} 달성 (${percent}%)`;
    fillEl.style.width = `${percent}%`;
}

function renderCategoryProgress() {
    const container = document.getElementById('titleCategoryProgress');
    if (!container) return;

    if (!isLoggedIn || allTitles.length === 0) {
        container.innerHTML = '';
        return;
    }

    const categories = ['betting', 'attendance', 'coin', 'community', 'special'];
    const shortLabels = {
        betting: '베팅',
        attendance: '출석',
        coin: '코인',
        community: '커뮤니티',
        special: '특별'
    };

    let html = '';
    for (const cat of categories) {
        const catTitles = allTitles.filter(t => t.category === cat);
        if (catTitles.length === 0) continue;
        const catOwned = catTitles.filter(t => myTitleMap[t.id]).length;
        const catPct = Math.round((catOwned / catTitles.length) * 100);
        html += `<div class="title-cat-progress-row">
            <div class="title-cat-progress-info">
                <span class="title-cat-progress-label">${shortLabels[cat]}</span>
                <span class="title-cat-progress-value">${catOwned}/${catTitles.length}</span>
            </div>
            <div class="title-cat-progress-bar">
                <div class="title-cat-progress-fill" style="width:${catPct}%"></div>
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function renderHiddenHint() {
    const container = document.getElementById('titleSidebarHidden');
    if (!container) return;

    const hiddenTitles = allTitles.filter(t => t.hidden);
    const discoveredHidden = hiddenTitles.filter(t => myTitleMap[t.id]);
    const undiscovered = hiddenTitles.length - discoveredHidden.length;

    if (undiscovered > 0) {
        container.innerHTML = `<img src="images/icons/icon-question.svg" alt="" class="inline-icon"> 아직 발견되지 않은 칭호 ${undiscovered}개`;
    } else {
        container.innerHTML = '';
    }
}

function updateMiniBar() {
    const miniSlots = document.getElementById('titleMiniSlots');
    const miniProgress = document.getElementById('titleMiniProgress');

    if (miniSlots) {
        const equipped = Object.values(myTitleMap).filter(t => t.equipped);
        miniSlots.textContent = `${equipped.length}/3 장착`;
    }

    if (miniProgress) {
        const total = allTitles.length;
        const owned = Object.keys(myTitleMap).length;
        const percent = total > 0 ? Math.round((owned / total) * 100) : 0;
        miniProgress.textContent = `${percent}%`;
    }
}

// ========================================
// 클릭-투-장착 인터랙션
// ========================================

function handleCardClick(titleId) {
    // 선택 모드 + 로그인 상태일 때
    if (activeSlotIndex !== null && isLoggedIn) {
        equipToActiveSlot(titleId);
        return;
    }
    // 기존 동작: 모달 열기
    openTitleModal(titleId);
}

async function equipToActiveSlot(titleId) {
    // 보유 확인
    if (!myTitleMap[titleId]) {
        if (typeof showNotification === 'function') {
            showNotification('보유하지 않은 칭호입니다.', 'error');
        }
        return;
    }

    // 이미 장착 중인지 확인
    if (myTitleMap[titleId].equipped) {
        if (typeof showNotification === 'function') {
            showNotification('이미 장착 중인 칭호입니다.', 'error');
        }
        activeSlotIndex = null;
        updateCollectionSelectMode();
        renderSidebarSlots();
        return;
    }

    // 장착 API 호출
    activeSlotIndex = null;
    updateCollectionSelectMode();
    await toggleTitleEquip(titleId, true);
}

function handleSlotClick(slotIndex) {
    if (!isLoggedIn) return;

    const equipped = Object.values(myTitleMap).filter(t => t.equipped);

    // 채워진 슬롯 클릭 -> 이미 활성 상태면 취소
    if (activeSlotIndex === slotIndex) {
        activeSlotIndex = null;
    } else {
        // 빈 슬롯이거나 교체를 위해 선택 모드 활성화
        activeSlotIndex = slotIndex;
    }

    updateCollectionSelectMode();
    renderSidebarSlots();

    // 모바일: 선택 모드 활성화 시 사이드바 접기
    if (activeSlotIndex !== null) {
        const sidebar = document.getElementById('titleSidebar');
        const isMobile = window.matchMedia('(max-width: 900px)').matches;
        if (isMobile && sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
        }
    }
}

async function handleSlotRemove(titleId) {
    if (!isLoggedIn) return;
    await toggleTitleEquip(titleId, false);
}

function updateCollectionSelectMode() {
    const collection = document.getElementById('titleCollection');
    if (!collection) return;

    if (activeSlotIndex !== null) {
        collection.classList.add('title-collection-select-mode');
    } else {
        collection.classList.remove('title-collection-select-mode');
    }
}

// ========================================
// 피드 관련
// ========================================

async function loadRecentFeed() {
    try {
        const res = await fetch('/api/titles/recent-achievements');
        const data = await res.json();
        if (data.success) {
            recentFeed = data.achievements;
            renderRecentFeed();
        }
    } catch (error) {
        console.error('최근 달성 피드 로드 실패:', error);
        const feedList = document.getElementById('titleFeedList');
        if (feedList) {
            feedList.innerHTML = '<span class="title-sidebar-feed-empty">피드를 불러올 수 없습니다</span>';
        }
    }
}

function renderRecentFeed() {
    const feedList = document.getElementById('titleFeedList');
    if (!feedList) return;

    if (recentFeed.length === 0) {
        feedList.innerHTML = '<span class="title-sidebar-feed-empty">최근 희귀 칭호 달성 기록이 없습니다</span>';
        return;
    }

    let html = '';
    for (const ach of recentFeed) {
        const photo = typeof getSafePhotoURL === 'function' ? getSafePhotoURL(ach.userPhoto || '') : (ach.userPhoto || '');
        const timeStr = formatTimeAgo(ach.earnedAt);
        html += `<div class="title-sidebar-feed-item">
            <img src="${photo}" alt="" class="title-feed-avatar" referrerpolicy="no-referrer">
            <span class="title-feed-text"><strong>${safeText(ach.userName)}</strong>님이 '${safeText(ach.titleName)}' 달성!</span>
            <span class="title-feed-time">${timeStr}</span>
        </div>`;
    }

    feedList.innerHTML = html;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    let ms;
    if (timestamp._seconds !== undefined) {
        ms = timestamp._seconds * 1000;
    } else if (timestamp.seconds !== undefined) {
        ms = timestamp.seconds * 1000;
    } else {
        ms = new Date(timestamp).getTime();
    }

    if (!Number.isFinite(ms)) return '';

    const diff = Date.now() - ms;
    if (diff < 0) return '방금';
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
}

// ========================================
// 상세 모달
// ========================================

function openTitleModal(titleId) {
    const title = allTitles.find(t => t.id === titleId);
    if (!title) return;

    const overlay = document.getElementById('titleModalOverlay');
    const modal = document.getElementById('titleModal');
    const content = document.getElementById('titleModalContent');
    if (!overlay || !modal || !content) return;

    const owned = myTitleMap[titleId];
    const isOwned = !!owned;
    const isHidden = title.hidden && !isOwned;
    const rarity = getRarity(title);
    const style = title.style;
    const cssClass = (style && style.cssClass) ? style.cssClass : '';
    const inlineClass = cssClass ? 'ctitle-' + cssClass.replace('title-style-', '') : '';

    // 모바일 바텀시트
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    modal.classList.toggle('bottomsheet', isMobile);

    // 모달 콘텐츠 생성
    // 히든 칭호: 모달에서는 이름+디자인 공개, 조건만 숨김
    const isHiddenTitle = !!title.hidden;
    const iconFile = isOwned ? null : 'icon-lock.svg';
    const displayName = safeText(title.name);
    const displayHint = (isHiddenTitle && !isOwned) ? '???' : safeText(title.hint || '');
    const categoryLabel = CATEGORY_LABELS[title.category] || title.category || '-';

    // 등급 표시
    const rarityLabels = { legendary: '전설', epic: '영웅', rare: '희귀', special: '특별', normal: '일반' };
    const rarityLabel = rarityLabels[rarity] || rarity;

    let html = '';

    // 프리뷰
    const extraIcon = (style && style.extraIcon) ? style.extraIcon : '';

    html += `<div class="title-modal-preview">
        ${iconFile ? `<div class="title-modal-icon"><img src="images/icons/${iconFile}" alt="" class="inline-icon"></div>` : ''}
        <div class="title-modal-name${inlineClass ? ' ' + inlineClass : ''}">${displayName}</div>
        <div class="title-modal-badges">
            <span class="title-modal-badge title-modal-badge-rarity">${safeText(rarityLabel)}</span>
            <span class="title-modal-badge">${safeText(categoryLabel)}</span>
        </div>
    </div>`;

    // 구분선
    html += `<div class="title-modal-divider"></div>`;

    // 달성 조건
    html += `<div class="title-modal-section-label">달성 조건</div>`;
    if (isHiddenTitle && !isOwned) {
        html += `<div class="title-modal-condition" style="color:var(--text-disabled);font-style:italic">조건 비공개</div>`;
    } else {
        html += `<div class="title-modal-condition">${displayHint}</div>`;
    }

    // 진행도 (미달성 + 로그인 시)
    if (!isOwned && isLoggedIn && !isHidden) {
        const prog = getProgressData(titleId);
        if (prog) {
            const percent = prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;
            html += `<div class="title-modal-progress">
                <div class="title-modal-progress-info">
                    <span class="title-modal-progress-label">진행도</span>
                    <span class="title-modal-progress-value">${prog.current}/${prog.target} (${percent}%)</span>
                </div>
                <div class="title-modal-progress-bar"><div class="title-modal-progress-fill" style="width:${percent}%"></div></div>
            </div>`;
        }
    }

    // 보유자 정보
    html += `<div class="title-modal-divider"></div>`;
    html += `<div class="title-modal-holders">`;
    html += `<div class="title-modal-section-label">보유자 ${title.holderCount || 0}명</div>`;

    if (title.holders && title.holders.length > 0) {
        html += `<div class="title-modal-holder-list">`;
        for (const h of title.holders) {
            const photo = typeof getSafePhotoURL === 'function' ? getSafePhotoURL(h.photoURL || '') : (h.photoURL || '');
            html += `<a href="mypage.html?uid=${safeAttr(h.uid)}" class="title-modal-holder">
                <img src="${photo}" alt="" class="title-modal-holder-avatar" referrerpolicy="no-referrer">
                <span class="title-modal-holder-name">${safeText(h.displayName || 'F1 Fan')}</span>
            </a>`;
        }
        html += `</div>`;
    } else if (title.holderCount > 20) {
        html += `<div class="title-modal-holder-count">${title.holderCount}명이 이 칭호를 보유하고 있습니다</div>`;
    } else if (title.holderCount === 0) {
        html += `<div class="title-modal-holder-count">아직 아무도 획득하지 못했습니다</div>`;
    }
    html += `</div>`;

    // 액션 버튼
    if (isLoggedIn && isOwned) {
        const isEquipped = owned.equipped;
        html += `<div class="title-modal-actions">`;
        if (isEquipped) {
            html += `<button class="title-modal-equip-btn title-modal-equip-btn-secondary" onclick="handleEquipFromModal('${safeAttr(titleId)}', false)">해제하기</button>`;
        } else {
            html += `<button class="title-modal-equip-btn title-modal-equip-btn-primary" onclick="handleEquipFromModal('${safeAttr(titleId)}', true)">장착하기</button>`;
        }
        html += `<button class="title-modal-close-btn" onclick="closeTitleModal()">닫기</button>`;
        html += `</div>`;
    } else {
        html += `<div class="title-modal-actions">
            <button class="title-modal-close-btn" onclick="closeTitleModal()">닫기</button>
        </div>`;
    }

    content.innerHTML = html;

    // 모달 표시
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 바텀시트 드래그 닫기
    if (isMobile) {
        initBottomSheetDrag(overlay, modal);
    }
}

function closeTitleModal() {
    if (bottomSheetAbortController) {
        bottomSheetAbortController.abort();
        bottomSheetAbortController = null;
    }
    const overlay = document.getElementById('titleModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function initModalClose() {
    // 상세 모달 오버레이 클릭 닫기
    const overlay = document.getElementById('titleModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTitleModal();
        });
    }

    // 장착 변경 모달 오버레이 클릭 닫기
    const equipOverlay = document.getElementById('titleEquipOverlay');
    if (equipOverlay) {
        equipOverlay.addEventListener('click', (e) => {
            if (e.target === equipOverlay) closeEquipModal();
        });
    }
}

// ========================================
// 바텀시트 드래그 닫기
// ========================================

let bottomSheetAbortController = null;

function initBottomSheetDrag(overlay, modal, closeCallback) {
    if (bottomSheetAbortController) bottomSheetAbortController.abort();
    bottomSheetAbortController = new AbortController();
    const signal = bottomSheetAbortController.signal;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handle = modal.querySelector('.title-modal-drag-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        modal.style.transition = 'none';
    }, { passive: true, signal });

    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            modal.style.transform = `translateY(${diff}px)`;
        }
    }, { passive: true, signal });

    handle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        modal.style.transition = '';
        const diff = currentY - startY;
        if (diff > 100) {
            if (closeCallback) closeCallback();
            else closeTitleModal();
        } else {
            modal.style.transform = '';
        }
    }, { signal });
}

// ========================================
// 장착 변경 모달
// ========================================

function openEquipModal() {
    if (!isLoggedIn) return;

    const overlay = document.getElementById('titleEquipOverlay');
    const modal = document.getElementById('titleEquipModal');
    const listEl = document.getElementById('titleEquipList');
    if (!overlay || !modal || !listEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    modal.classList.toggle('bottomsheet', isMobile);

    // 보유 칭호 리스트 생성
    const ownedTitles = allTitles.filter(t => myTitleMap[t.id]);

    if (ownedTitles.length === 0) {
        listEl.innerHTML = `<div class="title-empty-state" style="padding:20px"><p>보유한 칭호가 없습니다</p></div>`;
    } else {
        let html = '';
        for (const t of ownedTitles) {
            const mt = myTitleMap[t.id];
            const isEquipped = mt && mt.equipped;
            const style = t.style;
            const cssClass = (style && style.cssClass) ? style.cssClass : '';
            const inlineClass = cssClass ? 'ctitle-' + cssClass.replace('title-style-', '') : '';

            const extraIcon = (style && style.extraIcon) ? style.extraIcon : '';

            html += `<div class="title-equip-item${isEquipped ? ' title-equip-item-equipped' : ''}">
                <span class="title-equip-item-name${inlineClass ? ' ' + inlineClass : ''}">${safeText(t.name)}</span>
                ${isEquipped
                    ? `<span class="title-equip-item-badge">장착중</span>
                       <button class="title-equip-item-action title-equip-item-action-unequip" onclick="handleEquipChange('${safeAttr(t.id)}', false)">해제</button>`
                    : `<button class="title-equip-item-action title-equip-item-action-equip" onclick="handleEquipChange('${safeAttr(t.id)}', true)">장착</button>`
                }
            </div>`;
        }
        listEl.innerHTML = html;
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (isMobile) {
        initBottomSheetDrag(overlay, modal, closeEquipModal);
    }
}

function closeEquipModal() {
    if (bottomSheetAbortController) {
        bottomSheetAbortController.abort();
        bottomSheetAbortController = null;
    }
    const overlay = document.getElementById('titleEquipOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ========================================
// 장착/해제 API
// ========================================

async function handleEquipFromModal(titleId, equip) {
    await toggleTitleEquip(titleId, equip);
    closeTitleModal();
}

async function handleEquipChange(titleId, equip) {
    await toggleTitleEquip(titleId, equip);
    closeEquipModal();
}

async function toggleTitleEquip(titleId, equip) {
    if (!auth || !auth.currentUser) return;

    const user = auth.currentUser;

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/titles/equip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ titleId, equipped: equip })
        });

        const data = await response.json();

        if (!data.success) {
            if (typeof showNotification === 'function') {
                showNotification(data.error || '장착/해제에 실패했습니다.', 'error');
            }
            return;
        }

        if (typeof showNotification === 'function') {
            showNotification(data.message, 'success');
        }

        // 코스메틱 캐시 무효화
        if (typeof invalidateCosmeticsCache === 'function') {
            invalidateCosmeticsCache(user.uid);
        }

        // 로컬 상태 갱신 후 재렌더링
        await loadMyTitles(user);
        renderCollection();
        renderSidebarSlots();
        renderSidebarProgress();
        renderCategoryProgress();
        updateMiniBar();
    } catch (error) {
        console.error('칭호 장착/해제 실패:', error);
        if (typeof showNotification === 'function') {
            showNotification('칭호 장착/해제에 실패했습니다.', 'error');
        }
    }
}

// ========================================
// 유틸리티
// ========================================

function getRarity(title) {
    return (title.style && title.style.rarity) || 'normal';
}

function getEarnedTime(titleId) {
    const mt = myTitleMap[titleId];
    if (!mt || !mt.earnedAt) return 0;
    if (mt.earnedAt._seconds) return mt.earnedAt._seconds * 1000;
    if (mt.earnedAt.seconds) return mt.earnedAt.seconds * 1000;
    return new Date(mt.earnedAt).getTime() || 0;
}

function getProgressData(titleId) {
    return myProgress.find(p => p.titleId === titleId) || null;
}

function getProgressPercent(titleId) {
    const prog = getProgressData(titleId);
    if (!prog || !prog.target) return 0;
    return Math.min(100, Math.round((prog.current / prog.target) * 100));
}

function safeText(str) {
    if (!str) return '';
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function safeAttr(str) {
    if (!str) return '';
    return str.replace(/['"&<>]/g, c => ({
        "'": '&#39;', '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;'
    })[c]);
}

// ========================================
// 칭호 획득 축하 모달
// ========================================

const KNOWN_TITLES_KEY = 'amr_known_titles';

function getKnownTitleIds() {
    try {
        const raw = localStorage.getItem(KNOWN_TITLES_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveKnownTitleIds(ids) {
    try {
        localStorage.setItem(KNOWN_TITLES_KEY, JSON.stringify(ids));
    } catch { /* ignore */ }
}

/** 새 칭호 ID 배열을 순서대로 모달로 표시 */
function showCongratsQueue(titleIds) {
    if (!titleIds || titleIds.length === 0) return;
    const queue = [...titleIds];

    function showNext() {
        if (queue.length === 0) return;
        const id = queue.shift();
        showCongratsModal(id, showNext);
    }

    showNext();
}

function showCongratsModal(titleId, onClose) {
    const title = allTitles.find(t => t.id === titleId);
    if (!title) {
        if (onClose) onClose();
        return;
    }

    const style = title.style;
    const rarity = getRarity(title);
    const cssClass = (style && style.cssClass) ? style.cssClass : '';
    const inlineClass = cssClass ? 'ctitle-' + cssClass.replace('title-style-', '') : '';
    const rarityLabels = { legendary: '전설', epic: '영웅', rare: '희귀', special: '특별', normal: '일반' };
    const rarityLabel = rarityLabels[rarity] || rarity;

    // 기존 모달 제거
    const existing = document.getElementById('titleCongratsOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'titleCongratsOverlay';
    overlay.className = 'title-congrats-overlay';
    overlay.innerHTML = `
        <div class="title-congrats-modal">
            <div class="title-congrats-label">NEW TITLE UNLOCKED</div>
            <div class="title-congrats-name${inlineClass ? ' ' + inlineClass : ''}">${safeText(title.name)}</div>
            <div class="title-congrats-badge">${safeText(rarityLabel)}</div>
            <div class="title-congrats-hint">${safeText(title.hint || '')}</div>
            <button class="title-congrats-btn" id="titleCongratsCloseBtn">확인</button>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    function close() {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            if (onClose) onClose();
        }, 300);
    }

    document.getElementById('titleCongratsCloseBtn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
}
