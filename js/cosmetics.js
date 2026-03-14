// ========================================
// 코스메틱 공통 헬퍼
// 모든 페이지(shop, mypage, paddock)에서 import
// ========================================

const cosmeticsCache = {
    data: {},
    timestamp: 0
};

const COSMETICS_CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * 다수 사용자 코스메틱 배치 조회 (캐시 적용)
 * @param {string[]} userIds
 * @returns {Promise<Object>} { [userId]: { border, badge, nicknameColor, postDeco } }
 */
async function fetchCosmeticsBatch(userIds) {
    if (!userIds || userIds.length === 0) return {};

    const now = Date.now();
    const needFetch = [];
    const result = {};

    // 캐시에서 조회
    for (const uid of userIds) {
        if (cosmeticsCache.data[uid] && (now - (cosmeticsCache.data[uid]._cachedAt || 0)) < COSMETICS_CACHE_TTL) {
            result[uid] = cosmeticsCache.data[uid];
        } else {
            needFetch.push(uid);
        }
    }

    if (needFetch.length === 0) return result;

    // 30개씩 나눠서 요청
    for (let i = 0; i < needFetch.length; i += 30) {
        const batch = needFetch.slice(i, i + 30);
        try {
            const response = await fetch('/api/user/cosmetics-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: batch })
            });
            const data = await response.json();
            if (data.success && data.cosmetics) {
                for (const [uid, cos] of Object.entries(data.cosmetics)) {
                    cos._cachedAt = now;
                    cosmeticsCache.data[uid] = cos;
                    result[uid] = cos;
                }
            }
        } catch (error) {
            console.error('코스메틱 배치 조회 실패:', error);
        }
    }

    // 캐시에 없고 서버에서도 못 가져온 사용자는 기본값
    for (const uid of userIds) {
        if (!result[uid]) {
            result[uid] = { border: null, badge: null, nicknameColor: null, postDeco: null, titles: [] };
        }
    }

    return result;
}

/**
 * 단일 사용자 코스메틱 조회
 * @param {string} userId
 * @returns {Promise<Object>} { border, badge, nicknameColor, postDeco }
 */
async function fetchUserCosmetics(userId) {
    if (!userId) return { border: null, badge: null, nicknameColor: null, postDeco: null, titles: [] };

    const now = Date.now();
    if (cosmeticsCache.data[userId] && (now - (cosmeticsCache.data[userId]._cachedAt || 0)) < COSMETICS_CACHE_TTL) {
        return cosmeticsCache.data[userId];
    }

    try {
        const response = await fetch(`/api/user/cosmetics/${encodeURIComponent(userId)}`);
        const data = await response.json();
        if (data.success && data.cosmetics) {
            data.cosmetics._cachedAt = now;
            cosmeticsCache.data[userId] = data.cosmetics;
            return data.cosmetics;
        }
    } catch (error) {
        console.error('코스메틱 조회 실패:', error);
    }

    return { border: null, badge: null, nicknameColor: null, postDeco: null, titles: [] };
}

/**
 * 아바타 + 테두리 HTML 생성
 * @param {string} photoUrl
 * @param {Object|null} cosmetics
 * @param {number} size - 아바타 크기 (px)
 * @returns {string} HTML 문자열
 */
function renderCosmeticAvatar(photoUrl, cosmetics, size) {
    const sz = size || 30;
    const safePhoto = typeof getSafePhotoURL === 'function' ? getSafePhotoURL(photoUrl) : (photoUrl || '');
    const borderClass = cosmetics && cosmetics.border ? cosmetics.border.cssClass : '';

    if (borderClass) {
        const isTire = borderClass.startsWith('border-tire-');
        const isAnimatedBefore = cosmetics.border.animation === 'rotate-border';

        // Size tier class
        let szClass = sz <= 30 ? 'cosmetic-sz-sm' : sz <= 50 ? 'cosmetic-sz-md' : '';

        let wrapSz, overlaySz;
        if (isTire) {
            // 타이어: 오버레이를 아바타의 1.8배로 (림 구멍 ≈ 55%이므로 아바타에 딱 맞음)
            overlaySz = Math.round(sz * 1.8);
            wrapSz = overlaySz;
        } else if (isAnimatedBefore) {
            // 애니메이션 테두리(::before): wrapper = avatar 동일 크기 (경계 제거)
            wrapSz = sz;
            overlaySz = sz;
        } else {
            // 일반 테두리: 기존 사이즈 티어 로직
            let borderPad, overlayExtra;
            if (sz <= 30)      { borderPad = 6;  overlayExtra = 10; }
            else if (sz <= 50) { borderPad = 7;  overlayExtra = 12; }
            else               { borderPad = 6;  overlayExtra = 18; }
            wrapSz = sz + borderPad;
            overlaySz = sz + overlayExtra;
        }

        const wrapClasses = ['cosmetic-avatar-wrap', szClass, escapeHtml(borderClass)].filter(Boolean).join(' ');

        const svgIcon = cosmetics.border.svgIcon || null;
        let overlayHtml = '';
        if (svgIcon) {
            overlayHtml = `<img src="images/icons/${escapeHtml(svgIcon)}" class="cosmetic-border-overlay" style="width:${overlaySz}px;height:${overlaySz}px;" alt="">`;
        }
        return `<span class="${wrapClasses}" style="width:${wrapSz}px;height:${wrapSz}px;">` +
            `<img src="${safePhoto}" class="cosmetic-avatar" style="width:${sz}px;height:${sz}px;" referrerpolicy="no-referrer" alt="">` +
            overlayHtml +
            `</span>`;
    }

    return `<img src="${safePhoto}" class="cosmetic-avatar cosmetic-avatar-plain" style="width:${sz}px;height:${sz}px;" referrerpolicy="no-referrer" alt="">`;
}

/**
 * 닉네임 + 컬러 + 뱃지 HTML 생성
 * @param {string} name
 * @param {Object|null} cosmetics
 * @returns {string} HTML 문자열
 */
function renderCosmeticName(name, cosmetics) {
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(name) : name;
    const colorClass = cosmetics && cosmetics.nicknameColor ? cosmetics.nicknameColor.cssClass : '';
    let html = `<span class="cosmetic-name ${escapeHtml(colorClass)}">${safeName}</span>`;

    if (cosmetics && cosmetics.badge && cosmetics.badge.svgIcon) {
        html += `<img src="images/icons/${escapeHtml(cosmetics.badge.svgIcon)}" class="cosmetic-badge" alt="${escapeHtml(cosmetics.badge.name || '')}" title="${escapeHtml(cosmetics.badge.name || '')}">`;
    }

    // 칭호 텍스트 추가
    if (cosmetics && cosmetics.titles && cosmetics.titles.length > 0) {
        let titlesHtml = '<span class="cosmetic-titles">';
        for (const t of cosmetics.titles) {
            // 'title-style-gold' → 'ctitle-gold'
            const inlineClass = t.cssClass
                ? 'ctitle-' + t.cssClass.replace('title-style-', '')
                : '';
            titlesHtml += `<span class="cosmetic-title-tag ${escapeHtml(inlineClass)}">${escapeHtml(t.name)}</span>`;
        }
        titlesHtml += '</span>';
        html += titlesHtml;
    }

    return html;
}

/**
 * 게시글 데코 CSS 클래스 반환
 * @param {Object|null} cosmetics
 * @returns {string} CSS 클래스
 */
function getPostDecoClass(cosmetics) {
    if (cosmetics && cosmetics.postDeco && cosmetics.postDeco.cssClass) {
        return cosmetics.postDeco.cssClass;
    }
    return '';
}

/**
 * 코스메틱 캐시 무효화 (장착/해제 후 호출)
 * @param {string} userId
 */
function invalidateCosmeticsCache(userId) {
    if (userId && cosmeticsCache.data[userId]) {
        delete cosmeticsCache.data[userId];
    }
}
