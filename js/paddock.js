// The Paddock - Community Board
const POSTS_PER_PAGE = 20;
const POST_COOLDOWN_MS = 60000;
const ADMIN_EMAIL = 'ranha.park@gmail.com';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1462116084265128000/BmOkiwQ3Y8gmbD2DFahrO5lmgH_jjwiYImA2WXjBAFZkk1xxe9sE3V7TUK2BcZuoLixE';

const state = {
    posts: [], filter: 'all', search: '', sort: 'latest',
    lastDoc: null, hasMore: true, loading: false,
    postId: null, currentPost: null, deleteType: null, deleteId: null,
    unsubPost: null, unsubComments: null
};

// 유틸
const $ = id => document.getElementById(id);
const escapeHtml = t => { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
const isAdmin = u => u?.email === ADMIN_EMAIL;
const getTagClass = t => ({ '질문': 'tag-question', '응원': 'tag-cheer', '분석': 'tag-analysis', '자유': 'tag-free', '다른팀': 'tag-other' }[t] || 'tag-free');

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

    // Auth 상태 변경 시 UI 업데이트
    if (isAuthConnected()) {
        auth.onAuthStateChanged(u => {
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
            snap.forEach(doc => { const p = { id: doc.id, ...doc.data() }; state.posts.push(p); renderRow(p); });
            state.lastDoc = snap.docs[snap.docs.length - 1];
            state.hasMore = snap.docs.length === POSTS_PER_PAGE;
        }
        $('loadMoreBtn').style.display = state.hasMore ? 'block' : 'none';
    } catch (e) { console.error('게시글 로드 실패:', e); alert('게시글을 불러오는데 실패했습니다.'); }

    state.loading = false;
    $('loadingPosts').style.display = 'none';
}

function renderRow(p) {
    const tr = document.createElement('tr');
    tr.onclick = () => openPostDetail(p.id);
    const likes = p.likeCount || 0, comments = p.commentCount || 0;
    tr.innerHTML = `<td class="post-likes ${likes ? 'has-likes' : ''}">${likes}</td><td><div class="post-title-cell"><span class="post-title-text">${escapeHtml(p.title)}</span>${comments ? `<span class="post-comment-count">(${comments})</span>` : ''}</div></td><td><div class="post-author-cell">${escapeHtml(p.authorName)}</div></td><td class="post-date-cell">${formatDateShort(p.createdAt)}</td>`;
    $('postsList').appendChild(tr);
}

// 게시글 작성
async function handlePostSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const key = `lastPostTime_${user.uid}`, last = localStorage.getItem(key);
    if (last && Date.now() - parseInt(last) < POST_COOLDOWN_MS) return alert(`도배 방지를 위해 ${Math.ceil((POST_COOLDOWN_MS - (Date.now() - parseInt(last))) / 1000)}초 후에 글을 작성할 수 있습니다.`);

    const btn = $('submitPostBtn'), tag = document.querySelector('input[name="postTag"]:checked')?.value, title = $('postTitle').value.trim(), content = $('postContent').value.trim();
    if (!tag) return openModal('tagWarningModal');
    if (!title) return alert('제목을 입력해주세요.');
    if (!content) return alert('내용을 입력해주세요.');

    btn.disabled = true; btn.textContent = '등록 중...';
    try {
        await db.collection('posts').add({ title, content, tag, authorId: user.uid, authorName: user.displayName || '익명', authorPhoto: user.photoURL, likeCount: 0, commentCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), searchKeywords: genKeywords(`${title} ${content}`) });
        localStorage.setItem(key, Date.now().toString());
        closeWriteModal();
        loadPosts(true);
    } catch (e) { console.error('게시글 작성 실패:', e); alert('게시글 작성에 실패했습니다.'); }
    btn.disabled = false; btn.textContent = '등록';
}

// 상세 보기
async function openPostDetail(postId) {
    state.postId = postId;
    state.unsubPost?.();

    state.unsubPost = db.collection('posts').doc(postId).onSnapshot(doc => {
        if (!doc.exists) { alert('게시글을 찾을 수 없습니다.'); closePostDetailModal(); return; }
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
    const user = getCurrentUser(), canEdit = user && (user.uid === p.authorId || isAdmin(user));
    $('postDetail').innerHTML = `
        <div class="post-detail-header">
            <img src="${p.authorPhoto || 'https://www.gravatar.com/avatar/?d=mp'}" class="post-detail-author-avatar" referrerpolicy="no-referrer">
            <div class="post-detail-author-info"><span class="post-detail-author-name">${escapeHtml(p.authorName)}</span><span class="post-detail-date">${formatDate(p.createdAt)}</span></div>
            ${canEdit ? `<div class="post-detail-actions"><button class="post-action-btn" onclick="openEditModal('${p.id}')">수정</button><button class="post-action-btn delete" onclick="confirmDeletePost('${p.id}')">삭제</button></div>` : ''}
        </div>
        <span class="post-detail-tag ${getTagClass(p.tag)}">#${escapeHtml(p.tag)}</span>
        <h2 class="post-detail-title">${escapeHtml(p.title)}</h2>
        <div class="post-detail-content">${escapeHtml(p.content)}</div>
        <div class="post-detail-footer">
            <button class="like-btn" onclick="toggleLike('${p.id}')" id="likeBtn-${p.id}"><span class="icon">🤍</span><span id="likeCount-${p.id}">${p.likeCount || 0}</span></button>
            <button class="report-btn" onclick="openReportModal('${p.id}','post')">신고</button>
        </div>`;
    checkLikeStatus(p.id);
}

// 좋아요
async function checkLikeStatus(postId) {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const doc = await db.collection('likes').doc(`${postId}_${user.uid}`).get();
        if (doc.exists) { const btn = $(`likeBtn-${postId}`); if (btn) { btn.classList.add('liked'); btn.querySelector('.icon').textContent = '❤️'; } }
    } catch (e) { console.error('좋아요 상태 확인 실패:', e); }
}

async function toggleLike(postId) {
    const user = getCurrentUser();
    if (!user) return openModal('loginRequiredModal');

    const likeRef = db.collection('likes').doc(`${postId}_${user.uid}`), postRef = db.collection('posts').doc(postId);
    try {
        const doc = await likeRef.get(), batch = db.batch(), btn = $(`likeBtn-${postId}`), cnt = $(`likeCount-${postId}`);
        if (doc.exists) {
            batch.delete(likeRef);
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(-1) });
            await batch.commit();
            if (btn) { btn.classList.remove('liked'); btn.querySelector('.icon').textContent = '🤍'; }
            if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent) - 1);
        } else {
            batch.set(likeRef, { postId, userId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            batch.update(postRef, { likeCount: firebase.firestore.FieldValue.increment(1) });
            await batch.commit();
            if (btn) { btn.classList.add('liked'); btn.querySelector('.icon').textContent = '❤️'; }
            if (cnt) cnt.textContent = parseInt(cnt.textContent) + 1;
        }
    } catch (e) { console.error('좋아요 토글 실패:', e); alert('좋아요 처리에 실패했습니다.'); }
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
    const user = getCurrentUser(), canDel = user && (user.uid === c.authorId || isAdmin(user));
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `<img src="${c.authorPhoto || 'https://www.gravatar.com/avatar/?d=mp'}" class="comment-avatar" referrerpolicy="no-referrer"><div class="comment-body"><div class="comment-header"><span class="comment-author">${escapeHtml(c.authorName)}</span><span class="comment-date">${formatDate(c.createdAt)}</span>${canDel ? `<button class="comment-delete-btn" onclick="confirmDeleteComment('${postId}','${c.id}')">삭제</button>` : ''}</div><p class="comment-content">${escapeHtml(c.content)}</p></div>`;
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
        await batch.commit();
        input.value = '';
    } catch (e) { console.error('댓글 작성 실패:', e); alert('댓글 작성에 실패했습니다.'); }
}

// 수정
async function openEditModal(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) return alert('게시글을 찾을 수 없습니다.');
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
    } catch (e) { console.error('게시글 로드 실패:', e); alert('게시글을 불러오는데 실패했습니다.'); }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const postId = $('editPostId').value, tag = document.querySelector('input[name="editTag"]:checked')?.value, title = $('editTitle').value.trim(), content = $('editContent').value.trim();
    if (!tag) return openModal('tagWarningModal');
    if (!title) return alert('제목을 입력해주세요.');
    if (!content) return alert('내용을 입력해주세요.');

    try {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists || (doc.data().authorId !== user.uid && !isAdmin(user))) return alert('본인이 작성한 게시글만 수정할 수 있습니다.');
        await db.collection('posts').doc(postId).update({ title, content, tag, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), searchKeywords: genKeywords(`${title} ${content}`) });
        closeEditModal();
        loadPosts(true);
    } catch (e) { console.error('게시글 수정 실패:', e); alert('게시글 수정에 실패했습니다.'); }
}

// 삭제
function confirmDeletePost(postId) { state.deleteType = 'post'; state.deleteId = postId; $('deleteConfirmMessage').textContent = '이 게시글을 삭제하시겠습니까?'; $('confirmDeleteBtn').onclick = executeDelete; openModal('deleteConfirmModal'); }
function confirmDeleteComment(postId, commentId) { state.deleteType = 'comment'; state.deleteId = { postId, commentId }; $('deleteConfirmMessage').textContent = '이 댓글을 삭제하시겠습니까?'; $('confirmDeleteBtn').onclick = executeDelete; openModal('deleteConfirmModal'); }

async function executeDelete() {
    const user = getCurrentUser();
    const deleteType = state.deleteType;
    const deleteId = state.deleteId;
    closeDeleteConfirmModal();
    if (!user) return alert('로그인이 필요합니다.');

    try {
        if (deleteType === 'post') {
            const doc = await db.collection('posts').doc(deleteId).get();
            if (!doc.exists) return alert('게시글을 찾을 수 없습니다.');
            if (doc.data().authorId !== user.uid && !isAdmin(user)) return alert('본인이 작성한 게시글만 삭제할 수 있습니다.');
            state.unsubPost?.(); state.unsubComments?.(); state.unsubPost = state.unsubComments = null;
            await db.collection('posts').doc(deleteId).delete();
            closePostDetailModal();
            loadPosts(true);
        } else if (deleteType === 'comment') {
            const { postId, commentId } = deleteId;
            const doc = await db.collection('posts').doc(postId).collection('comments').doc(commentId).get();
            if (!doc.exists) return alert('댓글을 찾을 수 없습니다.');
            if (doc.data().authorId !== user.uid && !isAdmin(user)) return alert('본인이 작성한 댓글만 삭제할 수 있습니다.');
            const batch = db.batch();
            batch.delete(db.collection('posts').doc(postId).collection('comments').doc(commentId));
            batch.update(db.collection('posts').doc(postId), { commentCount: firebase.firestore.FieldValue.increment(-1) });
            await batch.commit();
        }
    } catch (e) {
        console.error('삭제 실패:', e);
        if (e.code === 'permission-denied') alert('권한이 없습니다. Firebase Console에서 Firestore 규칙을 확인해주세요.');
        else alert('삭제에 실패했습니다: ' + e.message);
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
    if (!reason) return alert('신고 사유를 선택해주세요.');

    try {
        let targetData = {};
        if (type === 'post') {
            const doc = await db.collection('posts').doc(targetId).get();
            if (doc.exists) { const p = doc.data(); targetData = { postId: targetId, postTitle: p.title, postContent: p.content.substring(0, 200), postAuthorId: p.authorId, postAuthorName: p.authorName }; }
        }

        await db.collection('reports').add({ type, targetId, ...targetData, reason, detail: detail || null, reporterId: user.uid, reporterName: user.displayName || '익명', reporterEmail: user.email, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });

        if (DISCORD_WEBHOOK_URL) {
            fetch(DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [{ title: '새 신고 접수', color: 0xFF0000, fields: [{ name: '신고 사유', value: reason, inline: true }, { name: '상세 내용', value: detail || '없음', inline: true }, { name: '신고 대상 게시글', value: targetData.postTitle || '알 수 없음' }, { name: '게시글 작성자', value: targetData.postAuthorName || '알 수 없음', inline: true }, { name: '신고자', value: user.displayName || '익명', inline: true }], timestamp: new Date().toISOString() }] }) }).catch(() => {});
        }

        closeReportModal();
        openModal('reportSuccessModal');
    } catch (e) { console.error('신고 실패:', e); alert('신고 접수에 실패했습니다.'); }
}
