// ========================================
// Inventory Page Module - Genshin Style
// ========================================

const INVENTORY_CATEGORY_LABELS = {
    'profile-border': '테두리',
    'badge': '뱃지',
    'nickname-color': '닉네임 컬러',
    'profile-bg': '프로필 배경',
    'post-deco': '게시물 꾸미기',
    'functional': '기능성'
};

const EQUIP_SLOT_CONFIG = [
    { key: 'profile-border', label: '테두리', icon: 'icon-palette.svg' },
    { key: 'badge', label: '뱃지', icon: 'icon-badge.svg' },
    { key: 'nickname-color', label: '닉네임', icon: 'icon-user.svg' },
    { key: 'post-deco', label: '게시물', icon: 'icon-pencil.svg' },
    { key: 'profile-bg', label: '배경', icon: 'icon-globe.svg' }
];

const TYPE_LABELS = {
    permanent: '영구',
    consumable: '소모품',
    rental: '기간제',
    limited: '한정'
};

/**
 * rental 아이템 남은 기한 텍스트 반환
 */
function getRentalRemainingText(inv) {
    if (inv.type !== 'rental' || !inv.expiresAt || inv.isExpired) return '';
    const expiresMs = inv.expiresAt._seconds
        ? inv.expiresAt._seconds * 1000
        : (inv.expiresAt.seconds ? inv.expiresAt.seconds * 1000 : new Date(inv.expiresAt).getTime());
    const remaining = expiresMs - Date.now();
    if (remaining <= 0) return '만료됨';
    const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
    if (days > 1) return `${days}일 남음`;
    const hours = Math.ceil(remaining / (1000 * 60 * 60));
    return `${hours}시간 남음`;
}

// 인벤토리 상태
const inventoryState = {
    items: [],
    currentFilter: 'profile-border',
    currentTypeFilter: 'all',
    selectedItemId: null,
    equippedItems: {}  // { category: item }
};

document.addEventListener('DOMContentLoaded', () => {
    setupInvCategorySidebar();
    setupSubheaderTabs();
    setupTypeFilter();

    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    await loadMyInventory();
                } catch (e) {
                    console.error('인벤토리 데이터 로드 실패:', e);
                    if (typeof showToast === 'function') {
                        showToast('데이터를 불러오는데 실패했습니다.', 'error');
                    }
                }
            } else {
                showInventoryLoginPrompt();
            }
        });
    }
});

/**
 * 비로그인 시 로그인 유도 모달 표시
 */
function showInventoryLoginPrompt() {
    const modal = document.getElementById('loginPromptModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeLoginPromptModal() {
    const modal = document.getElementById('loginPromptModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 서브헤더 탭 (배낭/장착) 전환
 */
function setupSubheaderTabs() {
    const tabs = document.querySelectorAll('.inv-tab');
    const equipPanel = document.getElementById('invEquipPanel');
    const gridLayout = document.querySelector('.inv-genshin-layout');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (target === 'equip') {
                if (equipPanel) equipPanel.style.display = '';
                if (gridLayout) gridLayout.style.display = 'none';
            } else {
                if (equipPanel) equipPanel.style.display = 'none';
                if (gridLayout) gridLayout.style.display = '';
            }
        });
    });
}

/**
 * 하단 유형 필터
 */
function setupTypeFilter() {
    const bar = document.querySelector('.inv-filter-bar');
    if (!bar) return;

    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.inv-filter-btn');
        if (!btn) return;

        inventoryState.currentTypeFilter = btn.dataset.type;
        bar.querySelectorAll('.inv-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        inventoryState.selectedItemId = null;
        renderDetailPanel();
        renderInventoryGrid();
    });
}

/**
 * 인벤토리 로드
 */
async function loadMyInventory() {
    const user = getCurrentUser();
    if (!user) return;

    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shop/inventory', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await response.json();

        if (!data.success || !data.inventory || data.inventory.length === 0) {
            inventoryState.items = [];
            inventoryState.equippedItems = {};
            renderEquipmentSlots();
            updateInvStats();
            grid.innerHTML = `
                <div class="empty-state">
                    <img src="images/icons/icon-bag.svg" alt="" class="empty-icon">
                    <p class="empty-title">보유 아이템이 없습니다</p>
                    <a href="shop.html" class="empty-cta">상점 둘러보기</a>
                </div>`;
            return;
        }

        // 사용 완료된 소모품 제외
        inventoryState.items = data.inventory.filter(inv =>
            !(inv.type === 'consumable' && inv.isExpired)
        );

        // 장착 아이템 맵 구축
        inventoryState.equippedItems = {};
        data.inventory.forEach(inv => {
            if (inv.equipped && !inv.isExpired) {
                inventoryState.equippedItems[inv.category] = inv;
            }
        });

        renderEquipmentSlots();
        renderInventoryGrid();
        updateInvStats();

    } catch (error) {
        console.error('인벤토리 로드 실패:', error);
        grid.innerHTML = '<div class="empty-state"><p>인벤토리를 불러오는데 실패했습니다.</p></div>';
    }
}

/**
 * 서브헤더 아이템 수 갱신
 */
function updateInvStats() {
    const itemEl = document.getElementById('invItemCount');
    if (itemEl) {
        itemEl.textContent = inventoryState.items.length;
    }
}

/**
 * 장착 슬롯 렌더링
 */
function renderEquipmentSlots() {
    const container = document.getElementById('equipmentSlots');
    if (!container) return;

    container.innerHTML = EQUIP_SLOT_CONFIG.map(slot => {
        const equipped = inventoryState.equippedItems[slot.key];
        const filledClass = equipped ? 'filled' : '';
        const nameText = equipped
            ? (typeof escapeHtml === 'function' ? escapeHtml(equipped.itemName) : equipped.itemName)
            : '비어있음';

        return `
            <div class="equip-slot ${filledClass}">
                <img src="images/icons/${slot.icon}" alt="" class="equip-slot-icon">
                <span class="equip-slot-label">${slot.label}</span>
                <span class="equip-slot-name">${nameText}</span>
            </div>`;
    }).join('');

    renderEquipPreview();
}

/**
 * 장착 탭 프로필 미리보기 렌더링
 * 실제 프로필 사진 + 장착 코스메틱 적용 모습 표시
 */
async function renderEquipPreview() {
    const previewEl = document.getElementById('invEquipPreview');
    if (!previewEl) return;

    const user = getCurrentUser();
    if (!user) {
        previewEl.innerHTML = '<p style="color:var(--text-disabled);font-size:0.85rem;">로그인이 필요합니다</p>';
        return;
    }

    const photoUrl = user.photoURL || '';
    const displayName = user.displayName || 'F1 Fan';

    // 장착 코스메틱 정보 구성
    const eq = inventoryState.equippedItems;
    const cosmetics = {
        border: eq['profile-border'] ? { cssClass: eq['profile-border'].previewData?.cssClass || '', svgIcon: eq['profile-border'].previewData?.svgIcon || null, animation: eq['profile-border'].effectData?.animation || null } : null,
        badge: eq['badge'] ? { svgIcon: eq['badge'].previewData?.svgIcon || null, name: eq['badge'].itemName || '' } : null,
        nicknameColor: eq['nickname-color'] ? { cssClass: eq['nickname-color'].previewData?.cssClass || '' } : null,
        postDeco: eq['post-deco'] ? { cssClass: eq['post-deco'].previewData?.cssClass || '' } : null
    };

    // 아바타 렌더링 (cosmetics.js의 renderCosmeticAvatar 활용)
    let avatarHtml = '';
    if (typeof renderCosmeticAvatar === 'function') {
        avatarHtml = renderCosmeticAvatar(photoUrl, cosmetics, 64);
    } else {
        const safePhoto = typeof getSafePhotoURL === 'function' ? getSafePhotoURL(photoUrl) : photoUrl;
        avatarHtml = `<img src="${safePhoto}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer" alt="">`;
    }

    // 닉네임 렌더링
    let nameHtml = '';
    if (typeof renderCosmeticName === 'function') {
        nameHtml = renderCosmeticName(displayName, cosmetics);
    } else {
        nameHtml = `<span>${typeof escapeHtml === 'function' ? escapeHtml(displayName) : displayName}</span>`;
    }

    previewEl.innerHTML = `
        <div class="inv-equip-avatar-area">${avatarHtml}</div>
        <div class="inv-equip-info">
            <div class="inv-equip-name">${nameHtml}</div>
            <div class="inv-equip-title">${eq['profile-bg'] ? escapeHtml(eq['profile-bg'].itemName) : '배경 없음'}</div>
        </div>`;
}

/**
 * 카테고리 사이드바 이벤트 설정
 */
function setupInvCategorySidebar() {
    const sidebar = document.getElementById('invCategoryTabs');
    if (!sidebar) return;

    sidebar.addEventListener('click', (e) => {
        const btn = e.target.closest('.inv-icon-tab');
        if (!btn) return;

        const cat = btn.dataset.cat;
        inventoryState.currentFilter = cat;
        inventoryState.selectedItemId = null;

        sidebar.querySelectorAll('.inv-icon-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderDetailPanel();
        renderInventoryGrid();
    });
}

/**
 * 인벤토리 그리드 렌더링
 */
function renderInventoryGrid() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;

    const catFilter = inventoryState.currentFilter;
    const typeFilter = inventoryState.currentTypeFilter;
    const isPostDeco = catFilter === 'post-deco';

    // post-deco일 때 가로 레이아웃 토글
    grid.classList.toggle('inv-grid--post-deco', isPostDeco);

    // 카테고리 필터
    let filtered = catFilter === 'all'
        ? inventoryState.items
        : inventoryState.items.filter(inv => inv.category === catFilter);

    // 유형 필터
    if (typeFilter !== 'all') {
        filtered = filtered.filter(inv => inv.type === typeFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <img src="images/icons/icon-bag.svg" alt="" class="empty-icon">
                <p class="empty-title">해당 카테고리에 아이템이 없습니다</p>
            </div>`;
        return;
    }

    grid.innerHTML = filtered.map(inv => {
        const safeId = typeof escapeHtml === 'function' ? escapeHtml(inv.itemId) : inv.itemId;
        const isEquipped = inv.equipped;
        const isExpired = inv.isExpired;
        const itemType = inv.type || 'permanent';
        const typeLabel = TYPE_LABELS[itemType] || itemType;
        const isSelected = inventoryState.selectedItemId === inv.itemId;

        // 배지
        let badgeHtml = '';
        if (isExpired) {
            badgeHtml = '<span class="inv-card-badge badge-expired">만료</span>';
        } else if (isEquipped) {
            badgeHtml = '<span class="inv-card-badge badge-equipped">장착중</span>';
        }

        // rental 남은 기한
        const rentalText = getRentalRemainingText(inv);
        const rentalHtml = rentalText ? `<span class="inv-card-rental-remaining">${rentalText}</span>` : '';

        // 미리보기
        const previewHtml = getInventoryPreviewHtml(inv, isPostDeco ? 'post-card' : 'card');
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(inv.itemName) : inv.itemName;
        const categoryLabel = INVENTORY_CATEGORY_LABELS[inv.category] || inv.category;

        // post-deco: 가로 카드 (미리보기 + 우측 메타)
        if (isPostDeco) {
            return `
            <div class="inv-card ${isSelected ? 'selected' : ''} ${isExpired ? 'expired' : ''}" onclick="selectInvItem('${safeId}')">
                <div class="inv-card-bg inv-card-bg--${itemType}"></div>
                <div class="inv-card-icon">
                    <div class="inv-card-preview">${previewHtml}</div>
                </div>
                ${badgeHtml}
                <div class="inv-card-meta-side">
                    <div class="inv-card-side-name">${safeName}</div>
                    <div class="inv-card-side-category">${categoryLabel}</div>
                    <span class="inv-card-type-label" style="position:static;background:none;padding:0;color:var(--text-disabled);font-size:0.6rem;">${typeLabel}</span>
                    ${rentalText ? `<span class="inv-card-rental-remaining" style="position:static;margin-top:2px;">${rentalText}</span>` : ''}
                </div>
            </div>`;
        }

        return `
            <div class="inv-card ${isSelected ? 'selected' : ''} ${isExpired ? 'expired' : ''}" onclick="selectInvItem('${safeId}')">
                <div class="inv-card-bg inv-card-bg--${itemType}"></div>
                <div class="inv-card-icon">
                    <div class="inv-card-preview">${previewHtml}</div>
                </div>
                ${badgeHtml}
                ${rentalHtml}
                <span class="inv-card-type-label">${typeLabel}</span>
            </div>`;
    }).join('');
}

/**
 * 아이템 선택 -> 디테일 패널 표시
 */
function selectInvItem(itemId) {
    inventoryState.selectedItemId = itemId;

    // 카드 선택 표시 갱신
    const grid = document.getElementById('inventoryGrid');
    if (grid) {
        grid.querySelectorAll('.inv-card').forEach(card => {
            card.classList.remove('selected');
        });
        const clicked = grid.querySelector(`.inv-card[onclick*="${itemId}"]`);
        if (clicked) clicked.classList.add('selected');
    }

    renderDetailPanel();

    // 모바일: 바텀시트 활성화
    if (window.innerWidth <= 768) {
        const panel = document.getElementById('invDetailPanel');
        if (panel) panel.classList.add('active');

        // 백드롭 생성
        let backdrop = document.querySelector('.inv-detail-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'inv-detail-backdrop';
            backdrop.onclick = closeDetailPanel;
            document.body.appendChild(backdrop);
        }
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * 디테일 패널 렌더링
 */
function renderDetailPanel() {
    const panel = document.getElementById('invDetailPanel');
    if (!panel) return;

    const itemId = inventoryState.selectedItemId;
    if (!itemId) {
        panel.innerHTML = `
            <div class="inv-detail-empty">
                <img src="images/icons/icon-package.svg" alt="" class="inv-detail-empty-icon">
                <p>아이템을 선택하세요</p>
            </div>`;
        return;
    }

    const inv = inventoryState.items.find(i => i.itemId === itemId);
    if (!inv) return;

    const safeName = typeof escapeHtml === 'function' ? escapeHtml(inv.itemName) : inv.itemName;
    const safeId = typeof escapeHtml === 'function' ? escapeHtml(inv.itemId) : inv.itemId;
    const categoryLabel = INVENTORY_CATEGORY_LABELS[inv.category] || inv.category;
    const itemType = inv.type || 'permanent';
    const typeLabel = TYPE_LABELS[itemType] || itemType;
    const isEquipped = inv.equipped;
    const isExpired = inv.isExpired;
    const isConsumable = inv.type === 'consumable';

    // 미리보기
    const previewHtml = getInventoryPreviewHtml(inv, 'detail');

    // 액션 버튼
    let actionHtml = '';
    if (!isExpired && !isConsumable) {
        if (isEquipped) {
            actionHtml = `<div class="inv-detail-actions"><button class="inv-detail-btn btn-unequip" onclick="toggleInventoryEquip('${safeId}', false)">해제</button></div>`;
        } else {
            actionHtml = `<div class="inv-detail-actions"><button class="inv-detail-btn btn-equip" onclick="toggleInventoryEquip('${safeId}', true)">장착</button></div>`;
        }
    }

    if (!isExpired && isConsumable && inv.usesRemaining > 0) {
        const safeInvId = typeof escapeHtml === 'function' ? escapeHtml(inv.id) : inv.id;
        const action = inv.consumableAction || '';
        actionHtml = `<div class="inv-detail-actions">
            <button class="inv-detail-btn btn-use"
                onclick="onUseConsumable('${safeInvId}', '${action}')">사용</button>
        </div>`;
    }

    // 사용 횟수 (소모품)
    let usesHtml = '';
    if (isConsumable) {
        const uses = inv.usesRemaining != null ? inv.usesRemaining : '?';
        usesHtml = `<div class="inv-detail-uses">남은 횟수: ${uses}</div>`;
    }

    // 남은 기한 (rental)
    let rentalDetailHtml = '';
    const detailRentalText = getRentalRemainingText(inv);
    if (detailRentalText) {
        rentalDetailHtml = `<div class="inv-detail-rental">${detailRentalText}</div>`;
    }

    panel.innerHTML = `
        <div class="inv-detail-preview inv-detail-preview--${itemType}">
            ${previewHtml}
        </div>
        <div class="inv-detail-info">
            <div class="inv-detail-name">${safeName}</div>
            <div class="inv-detail-category">${categoryLabel}</div>
            <span class="inv-detail-type-badge inv-detail-type-badge--${itemType}">${typeLabel}</span>
            ${usesHtml}
            ${rentalDetailHtml}
            <div class="inv-detail-divider"></div>
        </div>
        ${actionHtml}`;
}

/**
 * 모바일 바텀시트 닫기
 */
function closeDetailPanel() {
    const panel = document.getElementById('invDetailPanel');
    if (panel) panel.classList.remove('active');

    const backdrop = document.querySelector('.inv-detail-backdrop');
    if (backdrop) backdrop.classList.remove('active');

    document.body.style.overflow = '';
}

/**
 * 카테고리별 미리보기 HTML 생성
 */
function getInventoryPreviewHtml(inv, context) {
    if (typeof getPreviewIcon === 'function' && context !== 'card') {
        return getPreviewIcon(inv.category, inv);
    }

    const cssClass = inv.previewData?.cssClass || '';

    // post-deco 정사각 카드: 간단 아이콘만
    if (inv.category === 'post-deco' && context === 'card') {
        return '<img src="images/icons/icon-sparkle.svg" alt="" class="inv-card-post-icon">';
    }

    // post-deco 가로 카드: 전체 미리보기 (아래 switch의 post-deco case로 진행)
    // context === 'post-card' 일 때는 아이콘 대신 전체 게시물 미리보기

    switch (inv.category) {
        case 'profile-border': {
            const svgIcon = inv.previewData?.svgIcon || null;
            const isTire = cssClass.startsWith('border-tire-');
            let overlayHtml = '';
            if (svgIcon) {
                overlayHtml = `<img src="images/icons/${escapeHtml(svgIcon)}" class="cosmetic-border-overlay" alt="">`;
            }
            return `<span class="cosmetic-avatar-wrap ${escapeHtml(cssClass)} preview-border-demo${isTire ? ' preview-tire' : ''}">`
                 + `<img src="images/favicon.svg" class="cosmetic-avatar" alt="">`
                 + overlayHtml
                 + `</span>`;
        }
        case 'nickname-color':
            return `<span class="cosmetic-name ${escapeHtml(cssClass)} preview-color-demo">F1 Fan</span>`;
        case 'badge':
            if (inv.previewData?.svgIcon) {
                return `<img src="images/icons/${escapeHtml(inv.previewData.svgIcon)}" alt="" class="preview-badge-icon">`;
            }
            return `<img src="images/icons/icon-badge.svg" alt="" class="preview-svg-icon">`;
        case 'post-deco': {
            const isFLP = cssClass === 'deco-fastest-lap';
            const isTR = cssClass === 'deco-team-radio';
            let decoLabel = '';
            if (isFLP) {
                decoLabel = `<div class="fastest-lap-label">`
                    + `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">`
                    + `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`
                    + `</svg>FASTEST LAP</div>`;
            } else if (isTR) {
                decoLabel = `<div class="team-radio-wave">${'<span></span>'.repeat(15)}</div>`;
            }
            const cSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
            const vSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
            return `<div class="preview-post-wrap">`
                 + `<div class="preview-post-demo ${escapeHtml(cssClass)}">`
                 + `<div class="preview-post-vote">`
                 + `<span class="preview-vote-count">3</span>`
                 + `<span class="preview-vote-label">공감</span>`
                 + `</div>`
                 + `<div class="preview-post-main">`
                 + `<div class="preview-post-header">`
                 + `<span class="preview-post-tag">자유</span>`
                 + `<span class="preview-post-avatar"></span>`
                 + `<span class="preview-post-name">F1 Fan</span>`
                 + (isTR ? `<span class="team-radio-tag">RADIO</span>` : '')
                 + `<span class="preview-post-time">· 방금 전</span>`
                 + `</div>`
                 + decoLabel
                 + `<div class="preview-post-title">알론소 오늘 FP1 페이스 미쳤다</div>`
                 + `<div class="preview-post-body">`
                 + `<span class="preview-post-line"></span>`
                 + `<span class="preview-post-line"></span>`
                 + `</div>`
                 + `<div class="preview-post-stats">`
                 + `<span class="preview-post-stat">${cSvg} 5</span>`
                 + `<span class="preview-post-stat">${vSvg} 12</span>`
                 + `</div>`
                 + `</div>`
                 + `</div>`
                 + `<div class="preview-post-demo preview-post-ghost">`
                 + `<div class="preview-post-vote">`
                 + `<span class="preview-vote-count">1</span>`
                 + `<span class="preview-vote-label">공감</span>`
                 + `</div>`
                 + `<div class="preview-post-main">`
                 + `<div class="preview-post-header">`
                 + `<span class="preview-post-avatar"></span>`
                 + `<span class="preview-post-name">F1 Lover</span>`
                 + `</div>`
                 + `<div class="preview-post-title">스트롤 시즌 기대된다</div>`
                 + `</div>`
                 + `</div>`
                 + `</div>`;
        }
        default: {
            const icons = {
                'profile-bg': 'icon-globe.svg',
                'functional': 'icon-lightning.svg'
            };
            const file = icons[inv.category] || 'icon-package.svg';
            return `<img src="images/icons/${file}" alt="" class="preview-svg-icon">`;
        }
    }
}

/**
 * 장착/해제 토글
 */
const toggleInventoryEquip = preventDouble(async function toggleInventoryEquip(itemId, equip) {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shop/equip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ itemId, equipped: equip })
        });

        const data = await response.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message, 'success');

            // 코스메틱 캐시 무효화
            if (typeof invalidateCosmeticsCache === 'function') {
                invalidateCosmeticsCache(user.uid);
            }

            // 인벤토리 새로고침
            await loadMyInventory();

            // 디테일 패널 갱신
            renderDetailPanel();
        } else {
            if (typeof showToast === 'function') showToast(data.error || '처리에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('장착/해제 실패:', error);
        if (typeof showToast === 'function') showToast('장착/해제에 실패했습니다.', 'error');
    }
});

// ========================================
// 소모품 사용
// ========================================

const CONSUMABLE_ACTION_LABELS = {
    'highlight': '게시글 하이라이트',
    'pin': '게시글 고정 (24시간)',
    'nickname-change': '닉네임 변경권'
};

/**
 * 소모품 사용 버튼 클릭 핸들러
 */
function onUseConsumable(inventoryId, action) {
    if (!action) {
        if (typeof showToast === 'function') showToast('사용할 수 없는 아이템입니다.', 'warning');
        return;
    }

    if (action === 'nickname-change') {
        showUseConfirmModal(inventoryId, action);
    } else if (action === 'highlight') {
        showHighlightConfirmModal(inventoryId);
    } else if (action === 'pin') {
        showPostPickerModal(inventoryId, action);
    } else {
        if (typeof showToast === 'function') showToast('사용할 수 없는 아이템입니다.', 'warning');
    }
}

/**
 * 게시글 선택 모달 (highlight / pin)
 */
async function showPostPickerModal(inventoryId, action) {
    const user = getCurrentUser();
    if (!user) return;

    const modal = document.getElementById('consumableModal');
    const titleEl = document.getElementById('consumableModalTitle');
    const descEl = document.getElementById('consumableModalDesc');
    const bodyEl = document.getElementById('consumableModalBody');
    if (!modal || !bodyEl) return;

    const actionLabel = CONSUMABLE_ACTION_LABELS[action] || action;
    titleEl.textContent = actionLabel;
    descEl.textContent = '효과를 적용할 게시글을 선택하세요.';
    bodyEl.innerHTML = '<div class="consumable-loading">게시글을 불러오는 중...</div>';
    modal.classList.add('active');

    try {
        const snapshot = await db.collection('posts')
            .where('authorId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        if (snapshot.empty) {
            bodyEl.innerHTML = '<div class="consumable-empty">작성한 게시글이 없습니다.</div>';
            return;
        }

        let listHtml = '<div class="consumable-post-list">';
        snapshot.forEach(doc => {
            const post = doc.data();
            const title = typeof escapeHtml === 'function'
                ? escapeHtml(post.title || '(제목 없음)')
                : (post.title || '(제목 없음)');
            const date = post.createdAt?.toDate
                ? post.createdAt.toDate().toLocaleDateString('ko-KR')
                : '';
            const safePostId = typeof escapeHtml === 'function' ? escapeHtml(doc.id) : doc.id;
            const safeInvId = typeof escapeHtml === 'function' ? escapeHtml(inventoryId) : inventoryId;
            listHtml += `<button class="consumable-post-item" onclick="useConsumableApi('${safeInvId}', { type: '${action}', postId: '${safePostId}' })">
                <span class="consumable-post-title">${title}</span>
                <span class="consumable-post-date">${date}</span>
            </button>`;
        });
        listHtml += '</div>';
        bodyEl.innerHTML = listHtml;
    } catch (error) {
        console.error('게시글 목록 조회 실패:', error);
        bodyEl.innerHTML = '<div class="consumable-empty">게시글을 불러오지 못했습니다.</div>';
    }
}

/**
 * 닉네임 변경권 모달 (닉네임 입력 폼)
 */
function showUseConfirmModal(inventoryId, action) {
    const modal = document.getElementById('consumableModal');
    const titleEl = document.getElementById('consumableModalTitle');
    const descEl = document.getElementById('consumableModalDesc');
    const bodyEl = document.getElementById('consumableModalBody');
    if (!modal || !bodyEl) return;

    titleEl.textContent = '닉네임 변경권';
    descEl.textContent = '새로운 닉네임을 입력해주세요.';

    const safeInvId = typeof escapeHtml === 'function' ? escapeHtml(inventoryId) : inventoryId;
    bodyEl.innerHTML = `
        <div class="consumable-nickname-form">
            <input type="text" id="nicknameChangeInput" class="consumable-input"
                placeholder="새 닉네임 (2~10자)" maxlength="10" autocomplete="off">
            <p class="consumable-nickname-hint">한글, 영문, 숫자, 언더스코어만 사용 가능</p>
            <div class="consumable-confirm-actions">
                <button class="inv-detail-btn btn-use" id="nicknameChangeBtn"
                    onclick="handleNicknameChangeItem('${safeInvId}')">변경하기</button>
                <button class="inv-detail-btn btn-unequip" onclick="closeConsumableModal()">취소</button>
            </div>
        </div>`;
    modal.classList.add('active');

    // 입력 필드 포커스
    setTimeout(() => {
        const input = document.getElementById('nicknameChangeInput');
        if (input) input.focus();
    }, 100);
}

/**
 * 소모품 사용 API 호출
 */
const useConsumableApi = preventDouble(async function useConsumableApi(inventoryId, context) {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shop/use', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ inventoryId, context })
        });

        const data = await response.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast(data.message || '아이템을 사용했습니다.', 'success');

            closeConsumableModal();
            await loadMyInventory();
            renderDetailPanel();
        } else {
            if (typeof showToast === 'function') showToast(data.error || '사용에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('소모품 사용 실패:', error);
        if (typeof showToast === 'function') showToast('아이템 사용에 실패했습니다.', 'error');
    }
});

/**
 * 닉네임 변경권 아이템 사용 처리
 * Step 1: /api/shop/use (아이템 소모 + nicknameChangeAllowed 설정)
 * Step 2: /api/user/nickname (실제 닉네임 변경)
 */
const handleNicknameChangeItem = preventDouble(async function handleNicknameChangeItem(inventoryId) {
    const user = getCurrentUser();
    if (!user) return;

    const input = document.getElementById('nicknameChangeInput');
    const nickname = input ? input.value.trim() : '';
    if (!nickname) {
        if (typeof showToast === 'function') showToast('닉네임을 입력해주세요.', 'warning');
        return;
    }
    if (nickname.length < 2 || nickname.length > 10) {
        if (typeof showToast === 'function') showToast('닉네임은 2~10자로 입력해주세요.', 'warning');
        return;
    }
    const validRegex = /^[가-힣a-zA-Z0-9_\s]+$/;
    if (!validRegex.test(nickname)) {
        if (typeof showToast === 'function') showToast('닉네임에 특수문자를 사용할 수 없습니다.', 'warning');
        return;
    }

    const btn = document.getElementById('nicknameChangeBtn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

    try {
        const idToken = await user.getIdToken();

        // Step 1: 아이템 소모 (nicknameChangeAllowed = true)
        const useRes = await fetch('/api/shop/use', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ inventoryId, context: { type: 'nickname-change' } })
        });
        const useData = await useRes.json();
        if (!useData.success) {
            if (typeof showToast === 'function') showToast(useData.error || '아이템 사용에 실패했습니다.', 'error');
            return;
        }

        // Step 2: 실제 닉네임 변경
        const nickRes = await fetch('/api/user/nickname', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ nickname })
        });
        const nickData = await nickRes.json();
        if (!nickData.success) {
            if (typeof showToast === 'function') showToast(nickData.error || '닉네임 변경에 실패했습니다.', 'error');
            // nicknameChangeAllowed가 남아있으므로 마이페이지에서 재시도 가능
            return;
        }

        if (typeof showToast === 'function') showToast(`닉네임이 '${nickData.nickname}'(으)로 변경되었습니다.`, 'success');
        closeConsumableModal();
        await loadMyInventory();
        renderDetailPanel();

        // 헤더 닉네임 반영
        if (typeof updateAuthUI === 'function') updateAuthUI(user);

    } catch (error) {
        console.error('닉네임 변경권 사용 실패:', error);
        if (typeof showToast === 'function') showToast('닉네임 변경에 실패했습니다.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '변경하기'; }
    }
});

/**
 * 하이라이트 충전 확인 모달
 * postId 없이 사용 → highlightAvailable 증가
 */
function showHighlightConfirmModal(inventoryId) {
    const modal = document.getElementById('consumableModal');
    const titleEl = document.getElementById('consumableModalTitle');
    const descEl = document.getElementById('consumableModalDesc');
    const bodyEl = document.getElementById('consumableModalBody');
    if (!modal || !bodyEl) return;

    titleEl.textContent = '게시글 하이라이트';
    descEl.textContent = '하이라이트를 충전합니다. 게시글 작성 시 적용할 수 있습니다.';

    const safeInvId = typeof escapeHtml === 'function' ? escapeHtml(inventoryId) : inventoryId;
    bodyEl.innerHTML = `<div class="consumable-confirm-actions">
        <button class="inv-detail-btn btn-use" onclick="useConsumableApi('${safeInvId}', { type: 'highlight' })">충전하기</button>
        <button class="inv-detail-btn btn-unequip" onclick="closeConsumableModal()">취소</button>
    </div>`;
    modal.classList.add('active');
}

/**
 * 소모품 모달 닫기
 */
function closeConsumableModal() {
    const modal = document.getElementById('consumableModal');
    if (modal) modal.classList.remove('active');
}
