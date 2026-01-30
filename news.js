// ========================================
// Team News Module (Backend API 사용)
// ========================================

(function() {
    'use strict';

    // ========================================
    // 설정
    // ========================================
    const CONFIG = {
        API_URL: '/api/news',
        ARTICLE_API_URL: '/api/article',
        MAX_ITEMS: 6,
        COMMUNITY_MAX_ITEMS: 6,
        REFRESH_INTERVAL: 30 * 60 * 1000 // 30분
    };

    // ========================================
    // 상태 관리
    // ========================================
    let currentNewsData = [];
    let currentTab = 'news';
    let newsLoadFailed = false;

    // ========================================
    // 유틸리티 함수
    // ========================================

    /**
     * 날짜 포맷팅
     * @param {string} dateStr
     * @returns {string}
     */
    function formatNewsDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return '방금 전';
        if (diffHours < 24) return `${diffHours}시간 전`;
        if (diffDays < 7) return `${diffDays}일 전`;

        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    // ========================================
    // 렌더링 함수
    // ========================================

    /**
     * 뉴스 카드 HTML 생성
     * @param {Object} news
     * @param {number} index
     * @returns {string}
     */
    function renderNewsCard(news, index) {
        return `
            <article class="news-card" onclick="NewsModule.openModal(${index})" role="article" tabindex="0">
                <div class="news-meta">
                    <span class="news-source">${escapeHtml(news.source)}</span>
                    <span class="news-date">${formatNewsDate(news.pubDate)}</span>
                </div>
                <h3 class="news-title">${escapeHtml(news.title)}</h3>
                <p class="news-description">${escapeHtml(news.description)}</p>
            </article>
        `;
    }

    /**
     * 로딩 상태 HTML
     * @returns {string}
     */
    function renderLoading() {
        return `
            <div class="news-loading" role="status" aria-live="polite">
                <div class="news-spinner" aria-hidden="true"></div>
                <p>뉴스를 불러오는 중...</p>
            </div>
        `;
    }

    /**
     * 빈 상태 HTML
     * @param {string} message
     * @returns {string}
     */
    function renderEmpty(message) {
        return `
            <div class="news-empty" role="status">
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }

    /**
     * 커뮤니티 글 카드 HTML 생성
     * @param {Object} post
     * @returns {string}
     */
    function renderCommunityCard(post) {
        const tagClass = {
            '질문': 'tag-question',
            '응원': 'tag-cheer',
            '분석': 'tag-analysis',
            '자유': 'tag-free',
            '다른팀': 'tag-other'
        }[post.tag] || 'tag-free';

        const date = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt);
        const diffMs = Date.now() - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let dateStr;
        if (diffHours < 1) dateStr = '방금 전';
        else if (diffHours < 24) dateStr = `${diffHours}시간 전`;
        else if (diffDays < 7) dateStr = `${diffDays}일 전`;
        else dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

        return `
            <article class="community-card" onclick="window.location.href='paddock.html?post=${post.id}'" role="article" tabindex="0">
                <div class="community-meta">
                    <span class="community-tag ${tagClass}">#${escapeHtml(post.tag)}</span>
                    <span class="community-date">${dateStr}</span>
                </div>
                <h3 class="community-title">${escapeHtml(post.title)}</h3>
                <div class="community-footer">
                    <span class="community-author">${escapeHtml(post.authorName)}</span>
                    <div class="community-stats">
                        <span class="community-likes">❤️ ${post.likeCount || 0}</span>
                        <span class="community-comments">💬 ${post.commentCount || 0}</span>
                    </div>
                </div>
            </article>
        `;
    }

    // ========================================
    // 모달 관련 함수
    // ========================================

    /**
     * 뉴스 모달 열기
     * @param {number} index
     */
    async function openNewsModal(index) {
        const news = currentNewsData[index];
        if (!news) return;

        const modal = document.getElementById('newsModal');
        const modalTitle = document.getElementById('newsModalTitle');
        const modalSource = document.getElementById('newsModalSource');
        const modalDate = document.getElementById('newsModalDate');
        const modalContent = document.getElementById('newsModalContent');
        const modalLink = document.getElementById('newsModalLink');

        if (!modal || !modalTitle || !modalContent) return;

        // 기본 정보 설정
        modalTitle.textContent = news.title;
        if (modalSource) modalSource.textContent = news.source;
        if (modalDate) modalDate.textContent = formatNewsDate(news.pubDate);
        if (modalLink) modalLink.href = news.link;

        // 로딩 상태 표시
        modalContent.innerHTML = `
            <div class="news-modal-loading" role="status">
                <div class="news-spinner" aria-hidden="true"></div>
                <p>기사를 불러오는 중...</p>
            </div>
        `;

        // 모달 열기
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 포커스 관리
        modal.focus();

        // 기사 내용 가져오기
        try {
            const response = await safeFetch(`${CONFIG.ARTICLE_API_URL}?url=${encodeURIComponent(news.link)}`, { timeout: 15000 });

            // 🔒 보안: JSON 파싱 에러 처리 (H-4)
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('기사 API JSON 파싱 실패:', parseError);
                showFallbackContent(modalContent, news.description);
                return;
            }

            if (data.success && data.content) {
                const paragraphs = data.content
                    .split('\n\n')
                    .filter(p => p.trim())
                    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
                    .join('');

                modalContent.innerHTML = paragraphs || '<p>기사 내용을 표시할 수 없습니다.</p>';
            } else {
                showFallbackContent(modalContent, news.description);
            }
        } catch (error) {
            console.error('기사 로드 실패:', error);
            showFallbackContent(modalContent, news.description);
        }
    }

    /**
     * 기사 로드 실패 시 대체 콘텐츠 표시
     * @param {HTMLElement} container
     * @param {string} description
     */
    function showFallbackContent(container, description) {
        container.innerHTML = `
            <p>${escapeHtml(description)}</p>
            <p style="margin-top: 20px; color: var(--light-gray);">
                전체 기사는 위의 "원문 보기" 링크를 클릭해주세요.
            </p>
        `;
    }

    /**
     * 뉴스 모달 닫기
     */
    function closeNewsModal() {
        const modal = document.getElementById('newsModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ========================================
    // API 함수
    // ========================================

    /**
     * 백엔드에서 뉴스 가져오기
     * @returns {Promise<Array>}
     */
    async function fetchNews() {
        try {
            const response = await safeFetch(CONFIG.API_URL, { timeout: 15000, retries: 2 });
            const data = await response.json();

            if (data.success && Array.isArray(data.articles)) {
                currentNewsData = data.articles.slice(0, CONFIG.MAX_ITEMS);
                return currentNewsData;
            }

            return [];
        } catch (error) {
            console.error('뉴스 로드 실패:', error);
            // ErrorHandler를 통해 에러 유형별 메시지 표시
            if (typeof ErrorHandler !== 'undefined') {
                ErrorHandler.handleError(error, { silent: true });
            }
            return [];
        }
    }

    /**
     * Firestore에서 커뮤니티 글 가져오기
     * @returns {Promise<Array>}
     */
    async function fetchCommunityPosts() {
        try {
            // Firebase가 초기화되어 있는지 확인
            if (typeof db === 'undefined') {
                console.error('Firebase Firestore가 초기화되지 않았습니다.');
                return [];
            }

            const snapshot = await db.collection('posts')
                .orderBy('createdAt', 'desc')
                .limit(CONFIG.COMMUNITY_MAX_ITEMS)
                .get();

            const posts = [];
            snapshot.forEach(doc => {
                posts.push({ id: doc.id, ...doc.data() });
            });

            return posts;
        } catch (error) {
            console.error('커뮤니티 글 로드 실패:', error);
            if (isNetworkError(error) && typeof showToast === 'function') {
                showToast('인터넷 연결을 확인해주세요', 'error');
            }
            return [];
        }
    }

    // ========================================
    // 초기화 함수
    // ========================================

    /**
     * 뉴스 섹션 초기화
     */
    async function initNewsSection() {
        const newsContainer = document.getElementById('newsContainer');
        if (!newsContainer) return;

        // 로딩 상태 표시
        newsContainer.innerHTML = renderLoading();

        try {
            const news = await fetchNews();

            if (news.length > 0) {
                newsLoadFailed = false;
                newsContainer.innerHTML = news.map((item, index) => renderNewsCard(item, index)).join('');

                // 키보드 접근성 추가
                newsContainer.querySelectorAll('.news-card').forEach((card, index) => {
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openNewsModal(index);
                        }
                    });
                });
            } else {
                newsLoadFailed = true;
                newsContainer.innerHTML = renderEmpty('뉴스를 찾을 수 없습니다.');
                // 뉴스가 없으면 자동으로 커뮤니티 탭으로 전환
                switchToTab('community');
            }
        } catch (error) {
            console.error('뉴스 로드 실패:', error);
            newsLoadFailed = true;
            const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '뉴스를 불러올 수 없습니다.';
            newsContainer.innerHTML = renderEmpty(msg);
            // 뉴스 로드 실패 시 자동으로 커뮤니티 탭으로 전환
            switchToTab('community');
        }
    }

    /**
     * 커뮤니티 섹션 초기화
     */
    async function initCommunitySection() {
        const communityContainer = document.getElementById('communityContainer');
        if (!communityContainer) return;

        // 로딩 상태 표시
        communityContainer.innerHTML = renderLoading();

        try {
            const posts = await fetchCommunityPosts();

            if (posts.length > 0) {
                communityContainer.innerHTML = posts.map(post => renderCommunityCard(post)).join('');

                // 키보드 접근성 추가
                communityContainer.querySelectorAll('.community-card').forEach(card => {
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            window.location.href = 'paddock.html';
                        }
                    });
                });
            } else {
                communityContainer.innerHTML = renderEmpty('아직 작성된 글이 없습니다.');
            }
        } catch (error) {
            console.error('커뮤니티 글 로드 실패:', error);
            const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '커뮤니티 글을 불러올 수 없습니다.';
            communityContainer.innerHTML = renderEmpty(msg);
        }
    }

    /**
     * 탭 전환
     * @param {string} tabName - 'news' 또는 'community'
     */
    function switchToTab(tabName) {
        currentTab = tabName;

        const newsContainer = document.getElementById('newsContainer');
        const communityContainer = document.getElementById('communityContainer');
        const updateInfo = document.getElementById('sectionUpdateInfo');
        const tabs = document.querySelectorAll('.news-tab');

        // 탭 버튼 상태 업데이트
        tabs.forEach(tab => {
            const isActive = tab.dataset.tab === tabName;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });

        // 컨테이너 표시/숨김
        if (tabName === 'news') {
            if (newsContainer) newsContainer.style.display = 'block';
            if (communityContainer) communityContainer.style.display = 'none';
            if (updateInfo) updateInfo.textContent = '30분마다 갱신';
        } else {
            if (newsContainer) newsContainer.style.display = 'none';
            if (communityContainer) {
                communityContainer.style.display = 'block';
                // 커뮤니티 글이 로드되지 않았으면 로드
                if (!communityContainer.querySelector('.community-card')) {
                    initCommunitySection();
                }
            }
            if (updateInfo) updateInfo.textContent = 'The Paddock 최신 글';
        }
    }

    /**
     * 이벤트 리스너 설정
     */
    function setupEventListeners() {
        // 모달 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('newsModal');
            if (e.target === modal) {
                closeNewsModal();
            }
        });

        // ESC 키로 모달 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeNewsModal();
            }
        });

        // 탭 클릭 이벤트
        document.querySelectorAll('.news-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchToTab(tabName);
            });
        });
    }

    /**
     * 메인 초기화
     */
    function init() {
        initNewsSection();
        setupEventListeners();

        // 30분마다 뉴스 자동 갱신
        setInterval(initNewsSection, CONFIG.REFRESH_INTERVAL);
    }

    // ========================================
    // 전역 API 노출
    // ========================================
    window.NewsModule = {
        openModal: openNewsModal,
        closeModal: closeNewsModal,
        refresh: initNewsSection
    };

    // 전역 함수 (onclick 호환용)
    window.closeNewsModal = closeNewsModal;

    // DOM 로드 완료 시 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
