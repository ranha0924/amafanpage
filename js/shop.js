// ========================================
// 상점 페이지 로직
// ========================================

// 상태 관리
const shopState = {
    currentCategory: 'nickname-color',
    items: [],
    inventory: [],
    balance: 0,
    isLoggedIn: false,
    purchaseTarget: null
};

// 카테고리 라벨
const CATEGORY_LABELS = {
    'nickname-color': '닉네임',
    'badge': '뱃지',
    'team-collection': '팀 컬렉션',
    'profile-border': '프로필 테두리',
    'post-deco': '게시글',
    'functional': '기능성 아이템',
    'profile-bg': '프로필 배경'
};

// 타입 라벨
const TYPE_LABELS = {
    'consumable': '소모품',
    'rental': '기간제',
    'limited': '한정'
};

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initShop();
});

function initShop() {
    // 카테고리 탭 이벤트
    const categoryTabs = document.getElementById('categoryTabs');
    if (categoryTabs) {
        categoryTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.sidebar-tab');
            if (!tab) return;
            const category = tab.dataset.category;
            setActiveCategory(category);
        });
    }

    // 모달 오버레이 클릭으로 닫기
    document.querySelectorAll('.shop-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // 상점 아이템 로드 (인증 불필요)
    loadShopItems();

    // 로그인 상태 감지
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            shopState.isLoggedIn = !!user;
            if (user) {
                shopState.userPhoto = typeof getSafePhotoURL === 'function'
                    ? getSafePhotoURL(user.photoURL)
                    : (user.photoURL || 'images/favicon.svg');
                shopState.userName = user.displayName || '사용자';
                // 커스텀 닉네임 Firestore에서 조회
                if (typeof db !== 'undefined' && db) {
                    db.collection('users').doc(user.uid).get().then(doc => {
                        if (doc.exists && doc.data().customDisplayName) {
                            shopState.userName = doc.data().customDisplayName;
                        }
                        renderShopGrid();
                    }).catch(() => {});
                }
                loadBalance();
                loadInventory();
            } else {
                shopState.userName = null;
                shopState.userPhoto = null;
            }
        });
    }
}

// ========================================
// 데이터 로드
// ========================================

async function loadShopItems() {
    try {
        let url;
        if (shopState.currentCategory === 'team-collection') {
            url = '/api/shop/items?collection=team';
        } else {
            url = `/api/shop/items?category=${encodeURIComponent(shopState.currentCategory)}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            shopState.items = data.items;
        } else {
            shopState.items = [];
        }
    } catch (error) {
        console.error('상점 아이템 로드 실패:', error);
        shopState.items = [];
    }

    renderShopGrid();
}

async function loadInventory() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shop/inventory', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await response.json();

        if (data.success) {
            shopState.inventory = data.inventory;
        } else {
            shopState.inventory = [];
        }
    } catch (error) {
        console.error('인벤토리 로드 실패:', error);
        shopState.inventory = [];
    }

    renderShopGrid();
}

async function loadBalance() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/token/balance', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await response.json();

        if (data.success) {
            shopState.balance = data.tokens || 0;
        }
    } catch (error) {
        console.error('잔액 로드 실패:', error);
    }
}

// ========================================
// 카테고리 전환
// ========================================

function setActiveCategory(category) {
    shopState.currentCategory = category;

    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });

    loadShopItems();
}

// ========================================
// 렌더링
// ========================================

function renderShopGrid() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid) return;

    // 보유 중인 소모품 (미사용) 필터링용 Set
    const ownedConsumableIds = new Set(
        shopState.inventory
            .filter(inv => inv.type === 'consumable' && !inv.isExpired)
            .map(inv => inv.itemId)
    );

    // 소모품 보유 시 상점에서 숨김 + 가격순 정렬
    const items = shopState.items.filter(item => {
        if (item.type === 'consumable' && ownedConsumableIds.has(item.id)) return false;
        return true;
    }).sort((a, b) => a.price - b.price);

    grid.classList.toggle('shop-grid--horizontal', shopState.currentCategory === 'post-deco');

    const ownedItemIds = new Set(shopState.inventory.filter(inv => !inv.isExpired).map(inv => inv.itemId));

    if (items.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <img src="images/icons/icon-cart.svg" alt="" class="empty-icon">
                <p class="empty-title">아이템 준비 중</p>
                <p class="empty-subtitle">곧 멋진 아이템들이 추가될 예정입니다!</p>
            </div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const isOwned = item.type !== 'functional' && ownedItemIds.has(item.id);
        const equippedItem = item.type !== 'functional' && shopState.inventory.find(inv => inv.itemId === item.id && inv.equipped);
        const safeName = escapeHtml(item.name);
        const itemType = item.type || 'permanent';
        const typeBadge = (itemType !== 'permanent' && TYPE_LABELS[itemType])
            ? `<span class="card-type-badge type-${escapeHtml(itemType)}">${TYPE_LABELS[itemType]}</span>` : '';

        return `
            <div class="shop-item-card${isOwned ? ' owned' : ''}${equippedItem ? ' equipped' : ''}"
                 onclick="onShopItemClick('${escapeHtml(item.id)}')"
                 data-item-id="${escapeHtml(item.id)}">
                ${typeBadge}
                ${isOwned ? `
                    <div class="owned-overlay">
                        <div class="owned-stamp">
                            <img src="images/icons/icon-check.svg" alt="" class="owned-stamp-icon">
                            <span>${equippedItem ? '장착중' : '보유중'}</span>
                        </div>
                    </div>` : ''}
                <div class="card-visual${item.category === 'nickname-color' ? ' card-visual--nickname-color' : ''}"${item.category === 'nickname-color' && item.previewData?.color ? ` style="--item-color: ${escapeHtml(item.previewData.color)}"` : ''}>
                    <div class="card-visual-bg"></div>
                    <div class="card-icon">${getPreviewIcon(item.category, item)}</div>
                </div>
                <div class="card-meta">
                    <div class="card-name">${safeName}</div>
                    <div class="card-bottom">
                        <span class="card-price">
                            <img src="images/AMRcoin.png" alt="FC" class="coin-icon">
                            ${item.price.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// 카테고리별 라이브 미리보기
function getPreviewIcon(category, item) {
    const cssClass = item?.previewData?.cssClass || '';
    const previewPhoto = shopState.userPhoto || 'images/favicon.svg';
    const previewName = shopState.userName || 'F1 Fan';

    switch (category) {
        case 'profile-border': {
            // 실제 테두리가 적용된 사용자 아바타
            const svgIcon = item?.previewData?.svgIcon || null;
            const isTire = cssClass.startsWith('border-tire-');
            let overlayHtml = '';
            if (svgIcon) {
                overlayHtml = `<img src="images/icons/${escapeHtml(svgIcon)}" class="cosmetic-border-overlay" alt="">`;
            }
            return `<span class="cosmetic-avatar-wrap ${escapeHtml(cssClass)} preview-border-demo${isTire ? ' preview-tire' : ''}">`
                 + `<img src="${escapeHtml(previewPhoto)}" class="cosmetic-avatar" alt="">`
                 + overlayHtml
                 + `</span>`;
        }

        case 'nickname-color':
            // 실제 컬러가 적용된 사용자 닉네임
            return `<span class="cosmetic-name ${escapeHtml(cssClass)} preview-color-demo">${escapeHtml(previewName)}</span>`;

        case 'badge':
            // 개별 SVG 뱃지 아이콘
            if (item?.previewData?.svgIcon) {
                return `<img src="images/icons/${escapeHtml(item.previewData.svgIcon)}" alt="" class="preview-badge-icon">`;
            }
            return `<img src="images/icons/icon-badge.svg" alt="" class="preview-svg-icon">`;

        case 'post-deco': {
            // 게시글 리스트 모형 (데코 적용 + 일반 포스트)
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
                 + `<span class="preview-post-avatar"${shopState.userPhoto ? ` style="background-image:url('${escapeHtml(shopState.userPhoto)}')"` : ''}></span>`
                 + `<span class="preview-post-name">${escapeHtml(previewName)}</span>`
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

        default:
            // functional 등 기본 아이콘
            const icons = {
                'profile-bg': 'icon-globe.svg',
                'functional': 'icon-lightning.svg'
            };
            const file = icons[category] || 'icon-package.svg';
            return `<img src="images/icons/${file}" alt="" class="preview-svg-icon">`;
    }
}

// ========================================
// 아이템 클릭 핸들러
// ========================================

function onShopItemClick(itemId) {
    if (!shopState.isLoggedIn) {
        showLoginPromptModal();
        return;
    }

    const item = shopState.items.find(i => i.id === itemId);
    if (!item) return;

    const ownedItem = shopState.inventory.find(inv => inv.itemId === itemId && !inv.isExpired);

    if (ownedItem) {
        // consumable은 장착 불가
        if (ownedItem.type === 'consumable') {
            showToast('소모품은 인벤토리에서 사용할 수 있습니다.');
            return;
        }
        // functional은 무한 구매 가능
        if (ownedItem.type === 'functional') {
            showPurchaseModal(item);
            return;
        }
        showEquipModal(item, ownedItem);
        return;
    }

    // 영구 아이템 중복 구매 방지 (만료된 것 포함하여 보유 이력 확인)
    if (item.type === 'permanent' || item.type === 'limited') {
        const anyOwned = shopState.inventory.find(inv => inv.itemId === itemId);
        if (anyOwned) {
            showToast('이미 보유 중인 아이템입니다.');
            return;
        }
    }

    showPurchaseModal(item);
}

// ========================================
// 구매 모달
// ========================================

function showPurchaseModal(item) {
    shopState.purchaseTarget = item;

    const modal = document.getElementById('purchaseModal');
    const modalInner = document.getElementById('purchaseModalInner');
    const previewEl = document.getElementById('purchasePreview');
    const nameEl = document.getElementById('purchaseItemName');
    const descEl = document.getElementById('purchaseItemDesc');
    const priceEl = document.getElementById('purchasePrice');
    const currentEl = document.getElementById('purchaseCurrentBalance');
    const afterEl = document.getElementById('purchaseAfterBalance');
    const afterRow = document.getElementById('purchaseAfterRow');
    const confirmBtn = document.getElementById('purchaseConfirmBtn');

    if (modalInner) {
        modalInner.className = 'shop-modal purchase-modal';
    }

    if (previewEl) previewEl.innerHTML = getPreviewIcon(item.category, item);
    if (nameEl) nameEl.textContent = item.name;

    // 타입 정보 + 설명
    const typeInfo = item.type && item.type !== 'permanent' && TYPE_LABELS[item.type] ? `[${TYPE_LABELS[item.type]}] ` : '';
    const durationInfo = item.durationType === '30-day' ? '(30일) ' : item.durationType === '1-use' ? '(1회용) ' : '';
    if (descEl) descEl.textContent = typeInfo + durationInfo + (item.description || '');
    if (priceEl) priceEl.textContent = `-${item.price.toLocaleString()} FC`;
    if (currentEl) currentEl.textContent = `${shopState.balance.toLocaleString()} FC`;

    const afterBalance = shopState.balance - item.price;
    if (afterEl) afterEl.textContent = `${afterBalance.toLocaleString()} FC`;

    const isInsufficient = afterBalance < 0;
    if (afterRow) afterRow.classList.toggle('insufficient', isInsufficient);
    if (confirmBtn) {
        confirmBtn.disabled = isInsufficient;
        confirmBtn.textContent = isInsufficient ? '코인 부족' : '구매하기';
    }

    if (modal) modal.classList.add('active');
}

function closePurchaseModal() {
    const modal = document.getElementById('purchaseModal');
    if (modal) modal.classList.remove('active');
    shopState.purchaseTarget = null;
}

async function confirmPurchase() {
    const item = shopState.purchaseTarget;
    if (!item) return;

    const user = getCurrentUser();
    if (!user) {
        closePurchaseModal();
        showLoginPromptModal();
        return;
    }

    const confirmBtn = document.getElementById('purchaseConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '구매 중...';
    }

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shop/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ itemId: item.id })
        });

        const data = await response.json();

        if (data.success) {
            shopState.balance = data.newBalance;

            if (typeof updateTokenDisplay === 'function') {
                updateTokenDisplay({ tokens: data.newBalance });
            }

            closePurchaseModal();
            showToast(`${item.name} 구매 완료!`);

            await loadInventory();
        } else {
            showToast(data.error || '구매에 실패했습니다.');
        }
    } catch (error) {
        console.error('구매 실패:', error);
        showToast('구매에 실패했습니다.');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '구매하기';
        }
    }
}

// ========================================
// 로그인 유도 모달
// ========================================

function showLoginPromptModal() {
    const modal = document.getElementById('loginPromptModal');
    if (modal) modal.classList.add('active');
}

function closeLoginPromptModal() {
    const modal = document.getElementById('loginPromptModal');
    if (modal) modal.classList.remove('active');
}

// ========================================
// 유틸리티
// ========================================

// ========================================
// 장착/해제 모달
// ========================================

function showEquipModal(item, inventoryItem) {
    const isEquipped = inventoryItem.equipped;

    shopState.purchaseTarget = item;
    shopState.equipTarget = inventoryItem;

    const modal = document.getElementById('purchaseModal');
    const modalInner = document.getElementById('purchaseModalInner');
    const previewEl = document.getElementById('purchasePreview');
    const nameEl = document.getElementById('purchaseItemName');
    const descEl = document.getElementById('purchaseItemDesc');
    const priceInfo = document.querySelector('.modal-price-info');
    const confirmBtn = document.getElementById('purchaseConfirmBtn');
    const cancelBtn = document.querySelector('.purchase-modal .btn-cancel');

    if (modalInner) modalInner.className = 'shop-modal purchase-modal';
    if (previewEl) previewEl.innerHTML = getPreviewIcon(item.category, item);
    if (nameEl) nameEl.textContent = item.name;
    if (descEl) descEl.textContent = isEquipped ? '이 아이템을 해제하시겠습니까?' : '이 아이템을 장착하시겠습니까?';
    if (priceInfo) priceInfo.style.display = 'none';

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = isEquipped ? '해제하기' : '장착하기';
        confirmBtn.onclick = () => confirmEquip(item.id, !isEquipped);
    }
    if (cancelBtn) cancelBtn.onclick = () => closeEquipModal();

    if (modal) modal.classList.add('active');
}

function closeEquipModal() {
    const modal = document.getElementById('purchaseModal');
    if (modal) modal.classList.remove('active');
    shopState.purchaseTarget = null;
    shopState.equipTarget = null;

    // 가격 정보 영역 복원
    const priceInfo = document.querySelector('.modal-price-info');
    if (priceInfo) priceInfo.style.display = '';

    // 구매 버튼 복원
    const confirmBtn = document.getElementById('purchaseConfirmBtn');
    if (confirmBtn) confirmBtn.onclick = () => confirmPurchase();

    const cancelBtn = document.querySelector('.purchase-modal .btn-cancel');
    if (cancelBtn) cancelBtn.onclick = () => closePurchaseModal();
}

async function confirmEquip(itemId, equip) {
    const user = getCurrentUser();
    if (!user) return;

    const confirmBtn = document.getElementById('purchaseConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = equip ? '장착 중...' : '해제 중...';
    }

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
            closeEquipModal();
            showToast(data.message);

            // 코스메틱 캐시 무효화
            if (typeof invalidateCosmeticsCache === 'function') {
                invalidateCosmeticsCache(user.uid);
            }

            await loadInventory();
        } else {
            showToast(data.error || '처리에 실패했습니다.');
        }
    } catch (error) {
        console.error('장착/해제 실패:', error);
        showToast('장착/해제에 실패했습니다.');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '장착하기';
        }
    }
}

// ========================================
// 유틸리티
// ========================================

if (typeof escapeHtml !== 'function') {
    function escapeHtml(str) {
        if (!str) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(str).replace(/[&<>"']/g, c => map[c]);
    }
}

function showToast(message) {
    if (typeof window.showGlobalToast === 'function') {
        window.showGlobalToast(message);
        return;
    }

    const existing = document.querySelector('.shop-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'shop-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.85); color: #fff; padding: 12px 24px;
        border-radius: 4px; font-size: 0.85rem; z-index: 9999;
        animation: fadeInUp 0.3s ease-out;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, UI_CONFIG?.TOAST_DURATION || 3000);
}
