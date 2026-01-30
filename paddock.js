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
const openWriteModal = () => getCurrentUser() ? (($('postForm').reset(), $('titleCharCount').textContent = '0', $('contentCharCount').textContent = '0'), openModal('writeModal')) : openModal('loginRequiredModal');
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

    document.querySelectorAll('.tag-filter').forEach(btn => btn.addEventListener('click', () => {
        state.filter = btn.dataset.tag;
        document.querySelectorAll('.tag-filter').forEach(b => b.classList.toggle('active', b.dataset.tag === state.filter));
        loadPosts(true);
    }));

    // 글자수 카운트
    $('postTitle')?.addEventListener('input', e => $('titleCharCount').textContent = e.target.value.length);
    $('postContent')?.addEventListener('input', e => $('contentCharCount').textContent = e.target.value.length);
    $('editTitle')?.addEventListener('input', e => $('editTitleCharCount').textContent = e.target.value.length);
    $('editContent')?.addEventListener('input', e => $('editContentCharCount').textContent = e.target.value.length);

    loadPosts(true);

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
        const order = state.sort === 'likes' ? 'likeCount' : 'createdAt';
        let q = db.collection('posts').orderBy(order, 'desc').limit(POSTS_PER_PAGE);

        if (state.filter !== 'all') q = db.collection('posts').where('tag', '==', state.filter).orderBy(order, 'desc').limit(POSTS_PER_PAGE);
        if (state.search) { const k = genKeywords(state.search); if (k.length) q = db.collection('posts').where('searchKeywords', 'array-contains-any', k.slice(0, 10)).orderBy(order, 'desc').limit(POSTS_PER_PAGE); }
        if (state.lastDoc && !reset) q = q.startAfter(state.lastDoc);

        const snap = await q.get();

        if (snap.empty) {
            if (reset) $('noPostsMessage').style.display = 'block';
            state.hasMore = false;
        } else {
            $('noPostsMessage').style.display = 'none';
            // DocumentFragment 사용하여 DOM 리플로우 최소화
            const fragment = document.createDocumentFragment();
            snap.forEach(doc => {
                const p = { id: doc.id, ...doc.data() };
                state.posts.push(p);
                fragment.appendChild(createPostRow(p));
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

// 게시글 행 생성 (DOM 요소 반환)
function createPostRow(p) {
    const tr = document.createElement('tr');
    tr.onclick = () => openPostDetail(p.id);
    const likes = p.likeCount || 0, comments = p.commentCount || 0;
    tr.innerHTML = `<td class="post-likes ${likes ? 'has-likes' : ''}">${likes}</td><td><div class="post-title-cell"><span class="post-title-text">${escapeHtml(p.title)}</span>${comments ? `<span class="post-comment-count">(${comments})</span>` : ''}</div></td><td><div class="post-author-cell">${escapeHtml(p.authorName)}</div></td><td class="post-date-cell">${formatDateShort(p.createdAt)}</td>`;
    return tr;
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
    if (title.length > 100) return showToast('제목은 100자를 초과할 수 없습니다.', 'warning');
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

        // 1. 게시글 생성
        await db.collection('posts').add({
            title, content, tag,
            authorId: user.uid,
            authorName: user.displayName || '익명',
            authorPhoto: user.photoURL,
            likeCount: 0, commentCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            searchKeywords: genKeywords(`${title} ${content}`)
        });

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
            console.log('첫 글 보너스 확인:', bonusError.message);
        }

        closeWriteModal();
        loadPosts(true);
    } catch (e) {
        console.error('게시글 작성 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '게시글 작성에 실패했습니다.', 'error');
    }
    btn.disabled = false; btn.textContent = '등록';
}

// 상세 보기
async function openPostDetail(postId) {
    state.postId = postId;
    state.unsubPost?.();

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

function renderDetail(p) {
    const user = getCurrentUser(), canEdit = user && (user.uid === p.authorId || isAdminSync());
    const safePhoto = getSafePhotoURL(p.authorPhoto);
    // 🔒 보안: data 속성 사용으로 XSS 방지 (onclick 인젝션 차단)
    const safeId = escapeHtml(p.id);
    $('postDetail').innerHTML = `
        <div class="post-detail-header">
            <img src="${safePhoto}" class="post-detail-author-avatar" referrerpolicy="no-referrer">
            <div class="post-detail-author-info"><span class="post-detail-author-name">${escapeHtml(p.authorName)}</span><span class="post-detail-date">${formatDate(p.createdAt)}</span></div>
            ${canEdit ? `<div class="post-detail-actions"><button class="post-action-btn" data-action="edit" data-id="${safeId}">수정</button><button class="post-action-btn delete" data-action="delete" data-id="${safeId}">삭제</button></div>` : ''}
        </div>
        <span class="post-detail-tag ${getTagClass(p.tag)}">#${escapeHtml(p.tag)}</span>
        <h2 class="post-detail-title">${escapeHtml(p.title)}</h2>
        <div class="post-detail-content">${escapeHtml(p.content)}</div>
        <div class="post-detail-footer">
            <button class="like-btn" data-action="like" data-id="${safeId}" id="likeBtn-${safeId}"><span class="icon">🤍</span><span id="likeCount-${safeId}">${p.likeCount || 0}</span></button>
            <button class="report-btn" data-action="report" data-id="${safeId}">신고</button>
        </div>`;
    // 이벤트 위임: 안전하게 이벤트 처리
    $('postDetail').onclick = function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
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
        if (doc.exists) { const btn = $(`likeBtn-${postId}`); if (btn) { btn.classList.add('liked'); btn.querySelector('.icon').textContent = '❤️'; } }
    } catch (e) { console.error('좋아요 상태 확인 실패:', e); }
}

async function toggleLike(postId) {
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const likeRef = db.collection('likes').doc(`${postId}_${user.uid}`), postRef = db.collection('posts').doc(postId);
    try {
        const doc = await withTimeout(likeRef.get(), 5000), batch = db.batch(), btn = $(`likeBtn-${postId}`), cnt = $(`likeCount-${postId}`);
        if (doc.exists) {
            batch.delete(likeRef);
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(-1) });
            await withTimeout(batch.commit(), 5000);
            if (btn) { btn.classList.remove('liked'); btn.querySelector('.icon').textContent = '🤍'; }
            if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent) - 1);
        } else {
            batch.set(likeRef, { postId, userId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(1) });
            await withTimeout(batch.commit(), 5000);
            if (btn) { btn.classList.add('liked'); btn.querySelector('.icon').textContent = '❤️'; }
            if (cnt) cnt.textContent = parseInt(cnt.textContent) + 1;
        }
    } catch (e) {
        console.error('좋아요 토글 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '좋아요 처리에 실패했습니다.', 'error');
    }
}

// 댓글
function loadComments(postId) {
    const list = $('commentsList');
    list.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div></div>';
    state.unsubComments?.();

    state.unsubComments = db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snap => {
        list.innerHTML = snap.empty ? '<p style="text-align:center;color:#666;padding:20px">아직 댓글이 없습니다.</p>' : '';
        snap.forEach(doc => renderComment({ id: doc.id, ...doc.data() }, postId));
        $('commentCount').textContent = snap.size;
    }, e => { console.error('댓글 로드 실패:', e); list.innerHTML = '<p style="text-align:center;color:#e74c3c">댓글을 불러오는데 실패했습니다.</p>'; });
}

function renderComment(c, postId) {
    const user = getCurrentUser(), canDel = user && (user.uid === c.authorId || isAdminSync());
    const safePhoto = getSafePhotoURL(c.authorPhoto);
    // 🔒 보안: data 속성 + addEventListener 사용으로 XSS 방지
    const safePostId = escapeHtml(postId);
    const safeCommentId = escapeHtml(c.id);
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `<img src="${safePhoto}" class="comment-avatar" referrerpolicy="no-referrer"><div class="comment-body"><div class="comment-header"><span class="comment-author">${escapeHtml(c.authorName)}</span><span class="comment-date">${formatDate(c.createdAt)}</span>${canDel ? `<button class="comment-delete-btn" data-post-id="${safePostId}" data-comment-id="${safeCommentId}">삭제</button>` : ''}</div><p class="comment-content">${escapeHtml(c.content)}</p></div>`;
    // 삭제 버튼 이벤트 바인딩
    const delBtn = div.querySelector('.comment-delete-btn');
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

    try {
        const batch = db.batch();
        batch.set(db.collection('posts').doc(state.postId).collection('comments').doc(), { content, authorId: user.uid, authorName: user.displayName || '익명', authorPhoto: user.photoURL, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
    if (title.length > 100) return showToast('제목은 100자를 초과할 수 없습니다.', 'warning');
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

        await withTimeout(db.collection('reports').add({ type, targetId, ...targetData, reason, detail: detail || null, reporterId: user.uid, reporterName: user.displayName || '익명', reporterEmail: user.email, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() }), 8000);

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
                    reporterName: user.displayName || '익명'
                })
            });
            if (!notifyRes.ok) {
                console.warn('Discord 알림 전송 실패 (HTTP):', notifyRes.status);
            }
        } catch (notifyError) {
            console.warn('Discord 알림 전송 실패:', notifyError.message);
            // 신고는 DB에 저장됨, 알림만 실패 - 관리자가 DB에서 확인 가능
        }

        closeReportModal();
        openModal('reportSuccessModal');
    } catch (e) {
        console.error('신고 실패:', e);
        showToast(isNetworkError(e) ? '인터넷 연결을 확인해주세요' : '신고 접수에 실패했습니다.', 'error');
    }
}
