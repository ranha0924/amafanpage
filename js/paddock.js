// The Paddock - Community Board
// POSTS_PER_PAGE, POST_COOLDOWN_MS는 UI_CONFIG에서 가져옴 (constants.js)
const POSTS_PER_PAGE = UI_CONFIG.POSTS_PER_PAGE;
const POST_COOLDOWN_MS = UI_CONFIG.POST_COOLDOWN_MS;
// Discord Webhook URL은 서버에서만 관리 (보안상 클라이언트에 노출하지 않음)

const state = {
    posts: [], filter: 'all', search: '', sort: 'latest',
    lastDoc: null, hasMore: true, loading: false,
    postId: null, currentPost: null, deleteType: null, deleteId: null,
    unsubPost: null, unsubComments: null
};

// 유틸
const $ = id => document.getElementById(id);

// C-4: Admin 권한 확인 - Custom Claims 사용 (UI용)
// 실제 권한 검증은 Firestore Rules에서 수행됨
// 캐시된 토큰에서 admin claim 확인
const isAdmin = async (u) => {
    if (!u) return false;
    try {
        const token = await u.getIdTokenResult();
        return token.claims.admin === true;
    } catch {
        return false;
    }
};

// 동기 버전 (캐시된 값 사용, UI 즉시 렌더링용)
let cachedAdminStatus = false;
const isAdminSync = () => cachedAdminStatus;

// Admin 상태 캐시 업데이트
async function updateAdminCache() {
    const user = getCurrentUser();
    if (user) {
        cachedAdminStatus = await isAdmin(user);
    } else {
        cachedAdminStatus = false;
    }
}

// getSafePhotoURL, getTagClass는 utils.js에서 제공

function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts), diff = Date.now() - d;
    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateShort(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function genKeywords(text) {
    if (!text) return [];
    const words = text.toLowerCase().trim().split(/\s+/), keys = new Set();
    words.forEach(w => { if (w.length >= 2) { keys.add(w); for (let i = 0; i < w.length - 1; i++) for (let j = i + 2; j <= Math.min(i + 4, w.length); j++) keys.add(w.substring(i, j)); } });
    return [...keys];
}

// 모달
const openModal = id => $(id)?.classList.add('active');
const closeModal = id => $(id)?.classList.remove('active');
const openWriteModal = async () => {
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    $('postForm').reset();
    $('titleCharCount').textContent = '0';
    $('contentCharCount').textContent = '0';

    // 하이라이트 토글 초기화
    const highlightToggle = $('highlightToggle');
    const highlightToggleWrap = $('highlightToggleWrap');
    if (highlightToggle) highlightToggle.checked = false;
    if (highlightToggleWrap) highlightToggleWrap.style.display = 'none';

    // highlightAvailable 확인
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const available = userDoc.data().highlightAvailable || 0;
            if (available > 0 && highlightToggleWrap) {
                highlightToggleWrap.style.display = 'flex';
                const badge = $('highlightAvailableBadge');
                if (badge) badge.textContent = available;
            }
        }
    } catch (e) { console.warn('하이라이트 확인 실패:', e); }

    // 팀 드롭다운 기본값 설정
    var teamSel = $('postTeamSelect');
    if (teamSel) {
        teamSel.value = localStorage.getItem('selectedTeam') || 'all';
    }

    openModal('writeModal');
};
const closeWriteModal = () => closeModal('writeModal');
const closePostDetailModal = () => { closeModal('postDetailModal'); state.postId = null; state.currentPost = null; state.unsubPost?.(); state.unsubComments?.(); state.unsubPost = state.unsubComments = null; };
const closeEditModal = () => closeModal('editModal');
const closeDeleteConfirmModal = () => { closeModal('deleteConfirmModal'); state.deleteType = state.deleteId = null; };
const closeLoginRequiredModal = () => closeModal('loginRequiredModal');
const closeTagWarningModal = () => closeModal('tagWarningModal');
const closeReportModal = () => closeModal('reportModal');
const closeReportSuccessModal = () => closeModal('reportSuccessModal');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 이벤트 바인딩
    $('writePostBtn')?.addEventListener('click', openWriteModal);
    $('searchBtn')?.addEventListener('click', () => { state.search = $('searchInput').value.trim(); loadPosts(true); });
    $('searchInput')?.addEventListener('keypress', e => e.key === 'Enter' && (state.search = e.target.value.trim(), loadPosts(true)));
    $('sortSelect')?.addEventListener('change', e => { state.sort = e.target.value; loadPosts(true); });
    $('loadMoreBtn')?.addEventListener('click', () => loadPosts(false));
    $('postForm')?.addEventListener('submit', handlePostSubmit);
    $('editForm')?.addEventListener('submit', handleEditSubmit);
    $('commentForm')?.addEventListener('submit', handleCommentSubmit);
    $('reportForm')?.addEventListener('submit', handleReportSubmit);

    document.querySelectorAll('.filter-tab').forEach(btn => btn.addEventListener('click', () => {
        state.filter = btn.dataset.tag;
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tag === state.filter));
        loadPosts(true);
    }));

    // 글자수 카운트
    $('postTitle')?.addEventListener('input', e => $('titleCharCount').textContent = e.target.value.length);
    $('postContent')?.addEventListener('input', e => $('contentCharCount').textContent = e.target.value.length);
    $('editTitle')?.addEventListener('input', e => $('editTitleCharCount').textContent = e.target.value.length);
    $('editContent')?.addEventListener('input', e => $('editContentCharCount').textContent = e.target.value.length);

    // 사이드바 토글 (모바일)
    const sidebarToggle = $('sidebarToggleBtn');
    const sidebarEl = $('paddockSidebar');
    const sidebarOverlay = $('sidebarOverlay');
    if (sidebarToggle && sidebarEl && sidebarOverlay) {
        const toggleSidebar = () => {
            const isOpen = sidebarEl.classList.toggle('open');
            sidebarToggle.classList.toggle('open', isOpen);
            sidebarOverlay.classList.toggle('open', isOpen);
            sidebarToggle.setAttribute('aria-label', isOpen ? '사이드바 닫기' : '사이드바 열기');
        };
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    }

    // 팀 드롭다운: "전체 F1" + "내 팀" 두 옵션만
    var teamSelect = $('postTeamSelect');
    var savedTeamForSelect = localStorage.getItem('selectedTeam');
    if (teamSelect && savedTeamForSelect && typeof F1_TEAMS !== 'undefined' && F1_TEAMS[savedTeamForSelect]) {
        var opt = document.createElement('option');
        opt.value = savedTeamForSelect;
        opt.textContent = F1_TEAMS[savedTeamForSelect].name;
        teamSelect.appendChild(opt);
    }

    // 내 팀 탭 dot 색상 설정
    var myTeamDot = $('myTeamTabDot');
    var savedTeam = localStorage.getItem('selectedTeam');
    if (myTeamDot && savedTeam && typeof F1_TEAMS !== 'undefined' && F1_TEAMS[savedTeam]) {
        myTeamDot.style.background = F1_TEAMS[savedTeam].primary;
    }

    loadPosts(true);
    loadSidebarWidgets();

    // URL 파라미터로 특정 글 열기
    const urlParams = new URLSearchParams(window.location.search);
    const postIdFromUrl = urlParams.get('post');
    if (postIdFromUrl) {
        // 약간의 딜레이 후 모달 열기 (페이지 로드 완료 후)
        setTimeout(() => openPostDetail(postIdFromUrl), 500);
    }

    // Auth 상태 변경 시 UI 업데이트
    if (isAuthConnected()) {
        auth.onAuthStateChanged(async u => {
            // Admin 캐시 업데이트
            await updateAdminCache();

            const btn = $('writePostBtn');
            if (btn) { btn.disabled = !u; btn.title = u ? '' : '로그인이 필요합니다'; }
            // 현재 열린 게시글이 있으면 UI 다시 렌더링
            if (state.postId && state.currentPost) {
                renderDetail(state.currentPost);
                $('commentFormContainer').style.display = u ? 'block' : 'none';
                $('commentLoginRequired').style.display = u ? 'none' : 'block';
            }
        });
    }
});

// 게시글 로드
async function loadPosts(reset = true) {
    if (state.loading) return;
    state.loading = true;
    $('loadingPosts').style.display = 'flex';

    if (reset) { state.posts = []; state.lastDoc = null; state.hasMore = true; $('postsList').innerHTML = ''; }

    try {
        // 첫 페이지 로드 시 pinned 게시글 별도 쿼리
        let pinnedIds = new Set();
        if (reset && !state.search) {
            try {
                const now = firebase.firestore.Timestamp.now();
                const pinnedSnap = await db.collection('posts')
                    .where('pinnedUntil', '>', now)
                    .orderBy('pinnedUntil', 'desc')
                    .limit(5)
                    .get();

                if (!pinnedSnap.empty) {
                    const pinnedAuthorIds = [...new Set(pinnedSnap.docs.map(d => d.data().authorId).filter(Boolean))];
                    let pinnedCosMap = {};
                    if (typeof fetchCosmeticsBatch === 'function' && pinnedAuthorIds.length > 0) {
                        try { pinnedCosMap = await fetchCosmeticsBatch(pinnedAuthorIds); } catch (e) { /* ignore */ }
                    }

                    const pinnedFragment = document.createDocumentFragment();
                    pinnedSnap.forEach(doc => {
                        const p = { id: doc.id, ...doc.data(), _isPinned: true };
                        pinnedIds.add(doc.id);
                        state.posts.push(p);
                        pinnedFragment.appendChild(createPostRow(p, pinnedCosMap[p.authorId] || null));
                    });
                    $('postsList').appendChild(pinnedFragment);
                }
            } catch (e) { console.warn('Pinned 게시글 로드 실패:', e); }
        }

        const order = state.sort === 'likes' ? 'likeCount' : 'createdAt';
        let q = db.collection('posts');

        if (state.search) {
            const k = genKeywords(state.search);
            if (k.length) q = q.where('searchKeywords', 'array-contains-any', k.slice(0, 10));
        } else if (state.filter === 'mine') {
            var myTeam = localStorage.getItem('selectedTeam');
            if (myTeam) q = q.where('team', '==', myTeam);
        } else if (state.filter !== 'all') {
            q = q.where('tag', '==', state.filter);
        }

        q = q.orderBy(order, 'desc').limit(POSTS_PER_PAGE);
        if (state.lastDoc && !reset) q = q.startAfter(state.lastDoc);

        const snap = await q.get();

        if (snap.empty) {
            if (reset && pinnedIds.size === 0) {
                var noPostsEl = $('noPostsMessage');
                var emptyTitle = noPostsEl ? noPostsEl.querySelector('.empty-title') : null;
                if (emptyTitle && state.filter === 'mine' && localStorage.getItem('selectedTeam')) {
                    var teamData = (typeof F1_TEAMS !== 'undefined') ? F1_TEAMS[localStorage.getItem('selectedTeam')] : null;
                    var teamName = teamData ? teamData.name : '';
                    emptyTitle.textContent = teamName + ' 첫 번째 글을 작성해보세요!';
                } else if (emptyTitle) {
                    emptyTitle.textContent = '아직 게시글이 없습니다';
                }
                if (noPostsEl) noPostsEl.style.display = 'block';
            }
            state.hasMore = false;
        } else {
            $('noPostsMessage').style.display = 'none';

            // 작성자 코스메틱 배치 조회
            const authorIds = [...new Set(snap.docs.map(doc => doc.data().authorId).filter(Boolean))];
            let cosmeticsMap = {};
            if (typeof fetchCosmeticsBatch === 'function' && authorIds.length > 0) {
                try { cosmeticsMap = await fetchCosmeticsBatch(authorIds); } catch (e) { console.warn('코스메틱 로드 실패:', e); }
            }

            // DocumentFragment 사용하여 DOM 리플로우 최소화
            const fragment = document.createDocumentFragment();
            snap.forEach(doc => {
                // pinned 중복 제거
                if (pinnedIds.has(doc.id)) return;
                const p = { id: doc.id, ...doc.data() };
                state.posts.push(p);
                fragment.appendChild(createPostRow(p, cosmeticsMap[p.authorId] || null));
            });
            $('postsList').appendChild(fragment);
            state.lastDoc = snap.docs[snap.docs.length - 1];
            state.hasMore = snap.docs.length === POSTS_PER_PAGE;
        }
        $('loadMoreBtn').style.display = state.hasMore ? 'block' : 'none';
    } catch (e) { console.error('게시글 로드 실패:', e); showToast('게시글을 불러오는데 실패했습니다.', 'error'); }

    state.loading = false;
    $('loadingPosts').style.display = 'none';
}

// 게시글 카드 생성 (DOM 요소 반환)
function createPostRow(p, cosmetics) {
    const card = document.createElement('article');
    const decoClass = p.postDecoClass || '';
    const highlightClass = p.highlight ? 'deco-highlight' : '';
    const pinnedClass = p._isPinned ? 'deco-pinned' : '';
    card.className = `post-card ${decoClass} ${highlightClass} ${pinnedClass}`.trim();
    card.setAttribute('data-tag', p.tag);
    card.onclick = () => openPostDetail(p.id);

    const likes = p.likeCount || 0;
    const comments = p.commentCount || 0;
    const views = p.viewCount || 0;
    const preview = (p.content || '').substring(0, 100);

    const isFastestLap = decoClass === 'deco-fastest-lap';
    const isTeamRadio = decoClass === 'deco-team-radio';

    // 코스메틱 아바타/닉네임
    const displayName = (cosmetics && cosmetics.customDisplayName) || p.authorName;
    const avatarHtml = (cosmetics && typeof renderCosmeticAvatar === 'function')
        ? renderCosmeticAvatar(p.authorPhoto, cosmetics, 24)
        : `<img src="${getSafePhotoURL(p.authorPhoto)}" class="post-author-avatar" referrerpolicy="no-referrer" alt="">`;
    const nameHtml = (cosmetics && typeof renderCosmeticName === 'function')
        ? renderCosmeticName(displayName, cosmetics)
        : `<span class="post-author-name">${escapeHtml(displayName)}</span>`;

    // 프로필 링크 (클릭 시 마이페이지 이동, 카드 클릭 전파 방지)
    const profileLink = `<a href="mypage.html?uid=${encodeURIComponent(p.authorId)}" class="profile-link" onclick="event.stopPropagation()">${avatarHtml}${nameHtml}</a>`;

    // 팀 영어 이름 (닉네임 앞에 표시)
    let teamTagHtml = '';
    if (p.team && p.team !== 'all' && typeof F1_TEAMS !== 'undefined' && F1_TEAMS[p.team]) {
        var td = F1_TEAMS[p.team];
        teamTagHtml = '<span class="post-team-name" style="color:' + td.primary + '">' + escapeHtml(td.name) + '</span>';
    }

    // TEAM RADIO: 태그 뱃지 유지 + "TEAM RADIO" 라벨 추가
    let metaHtml;
    if (isTeamRadio) {
        metaHtml = `
            <div class="post-meta">
                <span class="post-tag tag-${escapeHtml(p.tag)}">${escapeHtml(p.tag)}</span>
                <div class="post-author">
                    ${teamTagHtml}${profileLink}
                    <span class="team-radio-tag">RADIO</span>
                    <span class="post-time">· ${formatDate(p.createdAt)}</span>
                </div>
            </div>`;
    } else {
        metaHtml = `
            <div class="post-meta">
                <span class="post-tag tag-${escapeHtml(p.tag)}">${escapeHtml(p.tag)}</span>
                <div class="post-author">
                    ${teamTagHtml}${profileLink}
                    <span class="post-time">· ${formatDate(p.createdAt)}</span>
                </div>
            </div>`;
    }

    // 제목 위 데코 요소
    let decoHtml = '';
    if (isFastestLap) {
        decoHtml = `
            <div class="fastest-lap-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                FASTEST LAP
            </div>`;
    } else if (isTeamRadio) {
        decoHtml = `<div class="team-radio-wave">${'<span></span>'.repeat(15)}</div>`;
    }

    card.innerHTML = `
        <div class="post-vote">
            <span class="vote-count ${likes ? 'has-votes' : ''}">${likes}</span>
            <span class="vote-label">공감</span>
        </div>
        <div class="post-content">
            ${metaHtml}
            ${decoHtml}
            <h3 class="post-title">${escapeHtml(p.title)}</h3>
            ${preview ? `<p class="post-preview">${escapeHtml(preview)}${p.content.length > 100 ? '...' : ''}</p>` : ''}
            <div class="post-stats">
                <span class="post-stat">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    ${comments}
                </span>
                <span class="post-stat">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    ${views}
                </span>
            </div>
        </div>
    `;
    return card;
}

// 게시글 작성
async function handlePostSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const btn = $('submitPostBtn'), tag = document.querySelector('input[name="postTag"]:checked')?.value, title = $('postTitle').value.trim(), content = $('postContent').value.trim();
    if (!tag) return openModal('tagWarningModal');
    if (!title) return showToast('제목을 입력해주세요.', 'warning');
    if (!content) return showToast('내용을 입력해주세요.', 'warning');
    // 🔒 보안: 길이 제한 (DoS 방지)
    if (title.length > 20) return showToast('제목은 20자를 초과할 수 없습니다.', 'warning');
    if (content.length > 5000) return showToast('내용은 5000자를 초과할 수 없습니다.', 'warning');

    btn.disabled = true; btn.textContent = '등록 중...';
    try {
        // 🔒 보안: 서버에서 쿨다운 검증 (localStorage 우회 방지)
        const idToken = await user.getIdToken();
        const cooldownRes = await fetch('/api/post/check-cooldown', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });
        const cooldownData = await cooldownRes.json();
        if (!cooldownData.canPost) {
            btn.disabled = false; btn.textContent = '등록';
            return showToast(cooldownData.message || '잠시 후 다시 시도해주세요.', 'warning');
        }

        // 1. 게시글 생성 (작성 시점의 데코 클래스 저장)
        let postDecoClass = '';
        if (typeof fetchUserCosmetics === 'function') {
            try {
                const myCosmetics = await fetchUserCosmetics(user.uid);
                postDecoClass = (typeof getPostDecoClass === 'function') ? getPostDecoClass(myCosmetics) : '';
            } catch (e) { /* ignore */ }
        }

        // 하이라이트 토글 확인
        const highlightToggle = $('highlightToggle');
        const useHighlight = highlightToggle && highlightToggle.checked;

        var teamSelEl = $('postTeamSelect');
        var selectedTeam = teamSelEl ? teamSelEl.value : (localStorage.getItem('selectedTeam') || 'all');

        const postData = {
            title, content, tag,
            team: selectedTeam,
            authorId: user.uid,
            authorName: getEffectiveDisplayName(user) || '익명',
            authorPhoto: user.photoURL,
            postDecoClass: postDecoClass || null,
            likeCount: 0, commentCount: 0, viewCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            searchKeywords: genKeywords(`${title} ${content}`)
        };
        if (useHighlight) {
            postData.highlight = true;
        }
        await db.collection('posts').add(postData);

        // 하이라이트 카운터 차감
        if (useHighlight) {
            try {
                const hlToken = await user.getIdToken();
                await fetch('/api/post/consume-highlight', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hlToken}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (hlErr) {
                console.warn('하이라이트 카운터 차감 실패:', hlErr);
            }
        }

        // 2. 첫 글 보너스 (서버 API 호출 - 어뷰징 방지)
        try {
            const idToken = await user.getIdToken();
            const bonusRes = await fetch('/api/token/first-post', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const bonusData = await bonusRes.json();
            if (bonusData.success) {
                if (typeof showTokenNotification === 'function') {
                    showTokenNotification(TOKEN_CONFIG.FIRST_POST, '첫 글 작성 보너스');
                }
                if (typeof updateTokenDisplay === 'function') {
                    updateTokenDisplay();
                }
            }
        } catch (bonusError) {
            // 첫 글 보너스 실패해도 게시글은 이미 작성됨
            logger.log('첫 글 보너스 확인:', bonusError.message);
        }

        closeWriteModal();
        loadPosts(true);
    } catch (e) {
        console.error('게시글 작성 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '게시글 작성에 실패했습니다.', 'error');
    }
    btn.disabled = false; btn.textContent = '등록';
}

// 조회수 증가 (모달 열릴 때마다 +1)
async function incrementViewCount(postId) {
    try {
        await db.collection('posts').doc(postId).update({
            viewCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (e) {
        logger.warn('조회수 증가 실패:', e);
    }
}

// 상세 보기
async function openPostDetail(postId) {
    state.postId = postId;
    state.unsubPost?.();

    // 조회수 증가 (에러 무시)
    incrementViewCount(postId).catch(console.warn);

    state.unsubPost = db.collection('posts').doc(postId).onSnapshot(doc => {
        if (!doc.exists) { showToast('게시글을 찾을 수 없습니다.', 'warning'); closePostDetailModal(); return; }
        state.currentPost = { id: doc.id, ...doc.data() };
        renderDetail(state.currentPost);
    }, e => console.error('게시글 로드 실패:', e));

    loadComments(postId);
    const user = getCurrentUser();
    $('commentFormContainer').style.display = user ? 'block' : 'none';
    $('commentLoginRequired').style.display = user ? 'none' : 'block';
    openModal('postDetailModal');
}

async function renderDetail(p) {
    const user = getCurrentUser(), canEdit = user && (user.uid === p.authorId || isAdminSync());
    const views = p.viewCount || 0;
    // 🔒 보안: data 속성 사용으로 XSS 방지 (onclick 인젝션 차단)
    const safeId = escapeHtml(p.id);

    // 코스메틱 조회
    let cosmetics = null;
    if (typeof fetchUserCosmetics === 'function' && p.authorId) {
        try { cosmetics = await fetchUserCosmetics(p.authorId); } catch (e) { /* ignore */ }
    }

    // postDecoClass 결정 (목록 뷰와 동일한 로직)
    const decoClass = p.postDecoClass || '';
    const isFastestLap = decoClass === 'deco-fastest-lap';
    const isTeamRadio = decoClass === 'deco-team-radio';

    // #postDetail 요소에 데코 클래스/속성 적용
    const detailEl = $('postDetail');
    detailEl.className = `post-detail ${decoClass}`.trim();
    detailEl.setAttribute('data-tag', p.tag);

    // 모달 전체에도 데코 클래스 적용 (배경색 등)
    const modalEl = detailEl.closest('.detail-modal');
    if (modalEl) {
        modalEl.className = `modal-content detail-modal ${decoClass}`.trim();
        if (decoClass) modalEl.setAttribute('data-tag', p.tag);
        else modalEl.removeAttribute('data-tag');
    }

    const detailDisplayName = (cosmetics && cosmetics.customDisplayName) || p.authorName;
    const avatarHtml = (cosmetics && typeof renderCosmeticAvatar === 'function')
        ? renderCosmeticAvatar(p.authorPhoto, cosmetics, 36)
        : `<img src="${getSafePhotoURL(p.authorPhoto)}" class="detail-avatar" referrerpolicy="no-referrer" alt="">`;
    const nameHtml = (cosmetics && typeof renderCosmeticName === 'function')
        ? renderCosmeticName(detailDisplayName, cosmetics)
        : `<span>${escapeHtml(detailDisplayName)}</span>`;

    // 데코 전용 UI 요소
    let decoHtml = '';
    if (isFastestLap) {
        decoHtml = `
            <div class="fastest-lap-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                FASTEST LAP
            </div>`;
    } else if (isTeamRadio) {
        decoHtml = `<div class="team-radio-wave">${'<span></span>'.repeat(15)}</div>`;
    }

    // TEAM RADIO 라벨
    const radioTagHtml = isTeamRadio ? '<span class="team-radio-tag">RADIO</span>' : '';

    // 상세 모달 팀 표시 (닉네임 아래, 영어 이름)
    let detailTeamHtml = '';
    if (p.team && p.team !== 'all' && typeof F1_TEAMS !== 'undefined' && F1_TEAMS[p.team]) {
        var tdInfo = F1_TEAMS[p.team];
        detailTeamHtml = '<div class="detail-team" style="color:' + tdInfo.primary + '">'
            + escapeHtml(tdInfo.name) + '</div>';
    }

    detailEl.innerHTML = `
        <div class="detail-header">
            <a href="mypage.html?uid=${encodeURIComponent(p.authorId)}" class="profile-link detail-profile-link" data-action="profile">
                ${avatarHtml}
            </a>
            <div class="detail-author-info">
                <a href="mypage.html?uid=${encodeURIComponent(p.authorId)}" class="profile-link detail-profile-link" data-action="profile">
                    <div class="detail-author-name">${nameHtml}${radioTagHtml}</div>
                </a>
                ${detailTeamHtml}
                <div class="detail-meta">${formatDate(p.createdAt)} · ${views} 조회</div>
            </div>
            ${canEdit ? `<div class="detail-actions"><button class="detail-action-btn" data-action="edit" data-id="${safeId}">수정</button><button class="detail-action-btn delete" data-action="delete" data-id="${safeId}">삭제</button></div>` : ''}
        </div>
        <span class="detail-tag post-tag tag-${escapeHtml(p.tag)}">${escapeHtml(p.tag)}</span>
        ${decoHtml}
        <h2 class="detail-title">${escapeHtml(p.title)}</h2>
        <div class="detail-content">${escapeHtml(p.content)}</div>
        <div class="detail-footer">
            <button class="btn-like" data-action="like" data-id="${safeId}" id="likeBtn-${safeId}"><img class="like-icon" src="images/icons/icon-heart-outline.svg" alt=""><span id="likeCount-${safeId}">${p.likeCount || 0}</span></button>
            <button class="btn-report" data-action="report" data-id="${safeId}">신고</button>
        </div>`;
    // 이벤트 위임: 안전하게 이벤트 처리
    $('postDetail').onclick = function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'profile') return; // 프로필 링크는 기본 동작(페이지 이동) 허용
        const id = btn.dataset.id;
        if (action === 'edit') openEditModal(id);
        else if (action === 'delete') confirmDeletePost(id);
        else if (action === 'like') toggleLike(id);
        else if (action === 'report') openReportModal(id, 'post');
    };
    checkLikeStatus(p.id);
}

// 좋아요
async function checkLikeStatus(postId) {
    const user = getCurrentUser();
    if (!user) return;
    try {
        // 🔒 보안: 타임아웃 적용 (네트워크 지연 방지)
        const doc = await withTimeout(db.collection('likes').doc(`${postId}_${user.uid}`).get(), 5000);
        const btn = $(`likeBtn-${postId}`);
        if (doc.exists && btn) {
            btn.classList.add('liked');
            btn.querySelector('.like-icon').src = 'images/icons/icon-heart.svg';
        }
    } catch (e) { console.error('좋아요 상태 확인 실패:', e); }
}

const toggleLike = preventDouble(async function toggleLike(postId) {
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const likeRef = db.collection('likes').doc(`${postId}_${user.uid}`), postRef = db.collection('posts').doc(postId);
    try {
        const doc = await withTimeout(likeRef.get(), 5000), batch = db.batch(), btn = $(`likeBtn-${postId}`), cnt = $(`likeCount-${postId}`);
        if (doc.exists) {
            batch.delete(likeRef);
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(-1) });
            await withTimeout(batch.commit(), 5000);
            if (btn) { btn.classList.remove('liked'); btn.querySelector('.like-icon').src = 'images/icons/icon-heart-outline.svg'; }
            if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent) - 1);
        } else {
            batch.set(likeRef, { postId, userId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(1) });
            await withTimeout(batch.commit(), 5000);
            if (btn) { btn.classList.add('liked'); btn.querySelector('.like-icon').src = 'images/icons/icon-heart.svg'; }
            if (cnt) cnt.textContent = parseInt(cnt.textContent) + 1;
        }
    } catch (e) {
        console.error('좋아요 토글 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '좋아요 처리에 실패했습니다.', 'error');
    }
});

// 댓글
function loadComments(postId) {
    const list = $('commentsList');
    list.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
    state.unsubComments?.();

    state.unsubComments = db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snap => {
        list.innerHTML = snap.empty ? '<div class="empty-state empty-state--compact"><img src="images/icons/icon-chat.svg" alt="" class="empty-icon"><p class="empty-title">아직 댓글이 없습니다.</p></div>' : '';
        snap.forEach(doc => renderComment({ id: doc.id, ...doc.data() }, postId));
        $('commentCount').textContent = snap.size;
    }, e => { console.error('댓글 로드 실패:', e); list.innerHTML = '<div class="empty-state empty-state--compact empty-state--error"><img src="images/icons/icon-warning.svg" alt="" class="empty-icon"><p class="empty-title">댓글을 불러오는데 실패했습니다.</p></div>'; });
}

async function renderComment(c, postId) {
    const user = getCurrentUser(), canDel = user && (user.uid === c.authorId || isAdminSync());
    // 🔒 보안: data 속성 + addEventListener 사용으로 XSS 방지
    const safePostId = escapeHtml(postId);
    const safeCommentId = escapeHtml(c.id);

    // 코스메틱 조회
    let cosmetics = null;
    if (typeof fetchUserCosmetics === 'function' && c.authorId) {
        try { cosmetics = await fetchUserCosmetics(c.authorId); } catch (e) { /* ignore */ }
    }

    const commentDisplayName = (cosmetics && cosmetics.customDisplayName) || c.authorName;
    const avatarHtml = (cosmetics && typeof renderCosmeticAvatar === 'function')
        ? renderCosmeticAvatar(c.authorPhoto, cosmetics, 28)
        : `<img src="${getSafePhotoURL(c.authorPhoto)}" class="comment-avatar" referrerpolicy="no-referrer" alt="">`;
    const nameHtml = (cosmetics && typeof renderCosmeticName === 'function')
        ? renderCosmeticName(commentDisplayName, cosmetics)
        : `<span class="comment-author">${escapeHtml(commentDisplayName)}</span>`;

    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <a href="mypage.html?uid=${encodeURIComponent(c.authorId)}" class="profile-link comment-profile-link">${avatarHtml}</a>
        <div class="comment-body">
            <div class="comment-header">
                <a href="mypage.html?uid=${encodeURIComponent(c.authorId)}" class="profile-link comment-profile-link">${nameHtml}</a>
                <span class="comment-time">${formatDate(c.createdAt)}</span>
                ${canDel ? `<button class="comment-delete" data-post-id="${safePostId}" data-comment-id="${safeCommentId}">삭제</button>` : ''}
            </div>
            <p class="comment-text">${escapeHtml(c.content)}</p>
        </div>`;
    // 삭제 버튼 이벤트 바인딩
    const delBtn = div.querySelector('.comment-delete');
    if (delBtn) {
        delBtn.addEventListener('click', () => confirmDeleteComment(delBtn.dataset.postId, delBtn.dataset.commentId));
    }
    $('commentsList').appendChild(div);
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');
    if (!state.postId) return;

    const input = $('commentContent'), content = input.value.trim();
    if (!content) return;
    if (content.length > 2000) return showToast('댓글은 2000자까지 입력할 수 있습니다.', 'warning');

    try {
        const batch = db.batch();
        batch.set(db.collection('posts').doc(state.postId).collection('comments').doc(), { content, authorId: user.uid, authorName: getEffectiveDisplayName(user) || '익명', authorPhoto: user.photoURL, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('posts').doc(state.postId), { commentCount: firebase.firestore.FieldValue.increment(1) });
        await withTimeout(batch.commit(), 8000);
        input.value = '';
    } catch (e) {
        console.error('댓글 작성 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '댓글 작성에 실패했습니다.', 'error');
    }
}

// 수정
async function openEditModal(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) return showToast('게시글을 찾을 수 없습니다.', 'warning');
        const p = doc.data();
        $('editPostId').value = postId;
        $('editTitle').value = p.title || '';
        $('editContent').value = p.content || '';
        $('editTitleCharCount').textContent = (p.title || '').length;
        $('editContentCharCount').textContent = (p.content || '').length;
        const tagInput = document.querySelector(`input[name="editTag"][value="${p.tag}"]`);
        if (tagInput) tagInput.checked = true;
        else document.querySelector('input[name="editTag"][value="자유"]').checked = true;
        closePostDetailModal();
        openModal('editModal');
    } catch (e) { console.error('게시글 로드 실패:', e); showToast('게시글을 불러오는데 실패했습니다.', 'error'); }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const postId = $('editPostId').value, tag = document.querySelector('input[name="editTag"]:checked')?.value, title = $('editTitle').value.trim(), content = $('editContent').value.trim();
    if (!tag) return openModal('tagWarningModal');
    if (!title) return showToast('제목을 입력해주세요.', 'warning');
    if (!content) return showToast('내용을 입력해주세요.', 'warning');
    // 🔒 보안: 길이 제한 (DoS 방지)
    if (title.length > 20) return showToast('제목은 20자를 초과할 수 없습니다.', 'warning');
    if (content.length > 5000) return showToast('내용은 5000자를 초과할 수 없습니다.', 'warning');

    const userIsAdmin = await isAdmin(user);

    try {
        const doc = await withTimeout(db.collection('posts').doc(postId).get(), 8000);
        if (!doc.exists || (doc.data().authorId !== user.uid && !userIsAdmin)) return showGlobalAlert('본인이 작성한 게시글만 수정할 수 있습니다.', 'warning', '권한 없음');
        await withTimeout(db.collection('posts').doc(postId).update({ title, content, tag, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), searchKeywords: genKeywords(`${title} ${content}`) }), 8000);
        closeEditModal();
        loadPosts(true);
    } catch (e) {
        console.error('게시글 수정 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '게시글 수정에 실패했습니다.', 'error');
    }
}

// 삭제
function confirmDeletePost(postId) { state.deleteType = 'post'; state.deleteId = postId; $('deleteConfirmMessage').textContent = '이 게시글을 삭제하시겠습니까?'; $('confirmDeleteBtn').onclick = executeDelete; openModal('deleteConfirmModal'); }
function confirmDeleteComment(postId, commentId) { state.deleteType = 'comment'; state.deleteId = { postId, commentId }; $('deleteConfirmMessage').textContent = '이 댓글을 삭제하시겠습니까?'; $('confirmDeleteBtn').onclick = executeDelete; openModal('deleteConfirmModal'); }

async function executeDelete() {
    const user = getCurrentUser();
    const deleteType = state.deleteType;
    const deleteId = state.deleteId;
    closeDeleteConfirmModal();
    if (!user) return showGlobalAlert('로그인이 필요합니다.', 'warning', '로그인 필요');

    const userIsAdmin = await isAdmin(user);

    try {
        if (deleteType === 'post') {
            const doc = await withTimeout(db.collection('posts').doc(deleteId).get(), 8000);
            if (!doc.exists) return showToast('게시글을 찾을 수 없습니다.', 'warning');
            if (doc.data().authorId !== user.uid && !userIsAdmin) return showGlobalAlert('본인이 작성한 게시글만 삭제할 수 있습니다.', 'warning', '권한 없음');
            state.unsubPost?.(); state.unsubComments?.(); state.unsubPost = state.unsubComments = null;
            await withTimeout(db.collection('posts').doc(deleteId).delete(), 8000);
            closePostDetailModal();
            loadPosts(true);
        } else if (deleteType === 'comment') {
            const { postId, commentId } = deleteId;
            const doc = await withTimeout(db.collection('posts').doc(postId).collection('comments').doc(commentId).get(), 8000);
            if (!doc.exists) return showToast('댓글을 찾을 수 없습니다.', 'warning');
            if (doc.data().authorId !== user.uid && !userIsAdmin) return showGlobalAlert('본인이 작성한 댓글만 삭제할 수 있습니다.', 'warning', '권한 없음');
            const batch = db.batch();
            batch.delete(db.collection('posts').doc(postId).collection('comments').doc(commentId));
            batch.update(db.collection('posts').doc(postId), { commentCount: firebase.firestore.FieldValue.increment(-1) });
            await withTimeout(batch.commit(), 8000);
        }
    } catch (e) {
        console.error('삭제 실패:', e);
        if (isNetworkError(e)) showToast('인터넷 연결을 확인해주세요', 'error');
        else if (e.code === 'permission-denied') showGlobalAlert('권한이 없습니다. Firebase Console에서 Firestore 규칙을 확인해주세요.', 'error', '권한 오류');
        else showToast('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
}

// 신고
function openReportModal(targetId, type) {
    if (!getCurrentUser()) return openModal('loginRequiredModal');
    $('reportForm').reset();
    $('reportPostId').value = targetId;
    $('reportType').value = type;
    openModal('reportModal');
}

async function handleReportSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const targetId = $('reportPostId').value, type = $('reportType').value, reason = document.querySelector('input[name="reportReason"]:checked')?.value, detail = $('reportDetail').value.trim();
    if (!reason) return showToast('신고 사유를 선택해주세요.', 'warning');

    // 🔒 보안: 신고 상세 길이 제한 (H-10)
    if (detail && detail.length > 1000) {
        return showToast('신고 상세는 1000자 이내로 작성해주세요.', 'warning');
    }

    try {
        let targetData = {};
        if (type === 'post') {
            const doc = await withTimeout(db.collection('posts').doc(targetId).get(), 8000);
            if (doc.exists) { const p = doc.data(); targetData = { postId: targetId, postTitle: p.title, postContent: p.content.substring(0, 200), postAuthorId: p.authorId, postAuthorName: p.authorName }; }
        }

        await withTimeout(db.collection('reports').add({ type, targetId, ...targetData, reason, detail: detail || null, reporterId: user.uid, reporterName: getEffectiveDisplayName(user) || '익명', reporterEmail: user.email, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() }), 8000);

        // 🔒 보안: Discord 알림 전송 (에러 로깅 추가)
        try {
            const notifyRes = await fetch('/api/report-notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason,
                    detail: detail || null,
                    postTitle: targetData.postTitle,
                    postAuthorName: targetData.postAuthorName,
                    reporterName: getEffectiveDisplayName(user) || '익명'
                })
            });
            if (!notifyRes.ok) {
                logger.warn('Discord 알림 전송 실패 (HTTP):', notifyRes.status);
            }
        } catch (notifyError) {
            logger.warn('Discord 알림 전송 실패:', notifyError.message);
            // 신고는 DB에 저장됨, 알림만 실패 - 관리자가 DB에서 확인 가능
        }

        closeReportModal();
        openModal('reportSuccessModal');
    } catch (e) {
        console.error('신고 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '신고 접수에 실패했습니다.', 'error');
    }
}

// ========================================
// 사이드바 위젯
// ========================================

async function loadSidebarWidgets() {
    loadTopPosts();
    loadRecentActivity();
    loadTagStats();
}

async function loadTopPosts() {
    const container = $('sidebarTopPosts');
    if (!container || typeof db === 'undefined') return;

    try {
        const snapshot = await db.collection('posts')
            .orderBy('likeCount', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-disabled);text-align:center;">아직 글이 없습니다</p>';
            return;
        }

        // 작성자 닉네임 배치 조회
        const topAuthorIds = [...new Set(snapshot.docs.map(d => d.data().authorId).filter(Boolean))];
        let topCosMap = {};
        if (typeof fetchCosmeticsBatch === 'function' && topAuthorIds.length > 0) {
            try { topCosMap = await fetchCosmeticsBatch(topAuthorIds); } catch (e) { /* ignore */ }
        }

        container.innerHTML = '';
        let rankNum = 0;
        snapshot.forEach(doc => {
            rankNum++;
            const post = doc.data();
            const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(post.title) : post.title;
            const topName = (topCosMap[post.authorId] && topCosMap[post.authorId].customDisplayName) || post.authorName || '';
            container.innerHTML += `
                <div class="sidebar-post-item" onclick="openPostDetail('${doc.id}')">
                    <div class="sidebar-post-title"><span class="sidebar-rank">${rankNum}</span>${safeTitle}</div>
                    <div class="sidebar-post-meta"><img src="images/icons/icon-heart.svg" alt="" class="inline-icon"> ${post.likeCount || 0} · ${typeof escapeHtml === 'function' ? escapeHtml(topName) : topName}</div>
                </div>`;
        });
    } catch (e) {
        console.error('인기글 로드 실패:', e);
        container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-disabled);text-align:center;">로드 실패</p>';
    }
}

async function loadRecentActivity() {
    const container = $('sidebarActivity');
    if (!container || typeof db === 'undefined') return;

    try {
        const snapshot = await db.collection('posts')
            .orderBy('createdAt', 'desc')
            .limit(8)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-disabled);text-align:center;">아직 활동이 없습니다</p>';
            return;
        }

        // 작성자 닉네임 배치 조회
        const actAuthorIds = [...new Set(snapshot.docs.map(d => d.data().authorId).filter(Boolean))];
        let actCosMap = {};
        if (typeof fetchCosmeticsBatch === 'function' && actAuthorIds.length > 0) {
            try { actCosMap = await fetchCosmeticsBatch(actAuthorIds); } catch (e) { /* ignore */ }
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const post = doc.data();
            const date = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
            const diff = Date.now() - date;
            let dateStr;
            if (diff < 60000) dateStr = '방금 전';
            else if (diff < 3600000) dateStr = `${Math.floor(diff / 60000)}분 전`;
            else if (diff < 86400000) dateStr = `${Math.floor(diff / 3600000)}시간 전`;
            else dateStr = `${Math.floor(diff / 86400000)}일 전`;

            const actName = (actCosMap[post.authorId] && actCosMap[post.authorId].customDisplayName) || post.authorName || '?';
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(actName) : actName;
            container.innerHTML += `
                <div class="sidebar-activity-item" onclick="openPostDetail('${doc.id}')" style="cursor:pointer;">
                    <strong>${safeName}</strong>님이 글을 작성했습니다 · <span style="color:var(--text-disabled)">${dateStr}</span>
                </div>`;
        });
    } catch (e) {
        console.error('최근 활동 로드 실패:', e);
        container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-disabled);text-align:center;">로드 실패</p>';
    }
}

async function loadTagStats() {
    const container = $('sidebarTagStats');
    if (!container || typeof db === 'undefined') return;

    const tags = ['질문', '응원', '분석', '자유', '다른팀'];

    try {
        const counts = {};
        for (const tag of tags) {
            const snapshot = await db.collection('posts')
                .where('tag', '==', tag)
                .limit(100)
                .get();
            counts[tag] = snapshot.size;
        }

        container.innerHTML = tags.map(tag =>
            `<div class="sidebar-tag-item">
                <span class="sidebar-tag-name">#${tag}</span>
                <span class="sidebar-tag-count">${counts[tag]}</span>
            </div>`
        ).join('');
    } catch (e) {
        console.error('태그 통계 로드 실패:', e);
        container.innerHTML = '<p style="font-size:0.78rem;color:var(--text-disabled);text-align:center;">로드 실패</p>';
    }
}
