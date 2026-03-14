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
        MAX_ITEMS: 3,
        COMMUNITY_MAX_ITEMS: 6,
        REFRESH_INTERVAL: API_CONFIG.NEWS_REFRESH_INTERVAL
    };

    // ========================================
    // 상태 관리
    // ========================================
    let currentNewsData = [];
    let allFetchedNews = [];
    let currentTab = 'news';
    let newsLoadFailed = false;
    let currentTeamName = null;

    // ========================================
    // 유틸리티 함수
    // ========================================

    /**
     * 날짜 포맷팅 (paddock.js formatDate와 동일한 로직)
     * @param {string} dateStr
     * @returns {string}
     */
    function formatNewsDate(dateStr) {
        const date = new Date(dateStr);
        const diff = Date.now() - date;

        if (diff < 60000) return '방금 전';  // 1분 미만
        if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;  // 1시간 미만
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;  // 24시간 미만
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`;  // 7일 미만

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
        const hasImage = news.image && news.image.length > 0;
        const sourceClass = news.source === 'Formula 1' ? 'source-f1' :
                            news.source.includes('Motorsport') ? 'source-motorsport' : 'source-autosport';
        const sourceInitial = news.source === 'Formula 1' ? 'F1' :
                             news.source.includes('Motorsport') ? 'MS' : 'AS';

        const thumbContent = hasImage
            ? `<img src="${escapeHtml(news.image)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              + `<div class="news-card-placeholder ${sourceClass}" style="display:none"><span>${sourceInitial}</span></div>`
            : `<div class="news-card-placeholder ${sourceClass}"><span>${sourceInitial}</span></div>`;

        return `
            <article class="news-card" onclick="NewsModule.openModal(${index})" role="article" tabindex="0">
                <div class="news-card-thumb">
                    ${thumbContent}
                </div>
                <div class="news-card-info">
                    <h3 class="news-title">${escapeHtml(news.title)}</h3>
                    <div class="news-meta">
                        <span class="news-source">${escapeHtml(news.source)}</span>
                        <span class="news-date">${formatNewsDate(news.pubDate)}</span>
                    </div>
                </div>
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
     * @param {string} type - 'news' 또는 'community'
     * @returns {string}
     */
    function renderEmpty(message, type = 'news') {
        const icons = { news: '<img src="images/icons/icon-newspaper.svg" alt="" class="empty-icon">', community: '<img src="images/icons/icon-comment.svg" alt="" class="empty-icon">' };
        const ctas = {
            news: '',
            community: '<a href="paddock.html" class="empty-cta">커뮤니티 가기</a>'
        };
        return `
            <div class="empty-state" role="status">
                ${icons[type] || '<img src="images/icons/icon-mailbox.svg" alt="" class="empty-icon">'}
                <p class="empty-title">${escapeHtml(message)}</p>
                ${ctas[type] || ''}
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
        const diff = Date.now() - date;

        let dateStr;
        if (diff < 60000) dateStr = '방금 전';  // 1분 미만
        else if (diff < 3600000) dateStr = `${Math.floor(diff / 60000)}분 전`;  // 1시간 미만
        else if (diff < 86400000) dateStr = `${Math.floor(diff / 3600000)}시간 전`;  // 24시간 미만
        else if (diff < 604800000) dateStr = `${Math.floor(diff / 86400000)}일 전`;  // 7일 미만
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
                        <span class="community-likes"><img src="images/icons/icon-heart.svg" alt="" class="inline-icon"> ${post.likeCount || 0}</span>
                        <span class="community-comments"><img src="images/icons/icon-comment.svg" alt="" class="inline-icon"> ${post.commentCount || 0}</span>
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
        if (!modal || !modalTitle || !modalContent) return;

        // 기본 정보 설정
        modalTitle.textContent = news.title;
        if (modalSource) modalSource.textContent = news.source;
        if (modalDate) modalDate.textContent = formatNewsDate(news.pubDate);

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
            const response = await smartFetch(`${CONFIG.ARTICLE_API_URL}?url=${encodeURIComponent(news.link)}`, { timeout: 15000 });

            // 🔒 보안: JSON 파싱 에러 처리 (H-4)
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('기사 API JSON 파싱 실패:', parseError);
                showFallbackContent(modalContent, news.description, news.link);
                return;
            }

            if (data.success && data.content) {
                const paragraphs = data.content
                    .split('\n\n')
                    .filter(p => p.trim())
                    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
                    .join('');

                modalContent.innerHTML = (paragraphs || '<p>기사 내용을 표시할 수 없습니다.</p>') + createReadMoreLink(news.link);
            } else {
                showFallbackContent(modalContent, news.description, news.link);
            }
        } catch (error) {
            console.error('기사 로드 실패:', error);
            showFallbackContent(modalContent, news.description, news.link);
        }
    }

    /**
     * 더 자세한 내용보기 링크 생성
     * @param {string} link
     * @returns {string}
     */
    function createReadMoreLink(link) {
        return `
            <div class="news-read-more">
                <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="news-read-more-link">
                    더 자세한 내용보기 →
                </a>
            </div>
        `;
    }

    /**
     * 기사 로드 실패 시 대체 콘텐츠 표시
     * @param {HTMLElement} container
     * @param {string} description
     * @param {string} link
     */
    function showFallbackContent(container, description, link) {
        container.innerHTML = `
            <p>${escapeHtml(description)}</p>
            ${createReadMoreLink(link)}
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

    //비동기 함수

    async function fetchNews() {
        try {
            const response = await smartFetch(CONFIG.API_URL, { timeout: 15000, retries: 2 });
            const data = await response.json();

            if (data.success && Array.isArray(data.articles)) {
                allFetchedNews = data.articles;
                applyTeamFilter();
                return currentNewsData;
            }

            return [];
        } catch (error) {
            console.error('뉴스 로드 실패:', error);
            if (typeof ErrorHandler !== 'undefined') {
                ErrorHandler.handleError(error, { silent: true });
            }
            return [];
        }
    }

    /**
     * 팀별 뉴스 필터링
     * titleOriginal(영문 제목)에서 팀 키워드 매칭
     */
    function filterNewsByTeam(articles) {
        var teamId = localStorage.getItem('selectedTeam');
        if (!teamId || typeof F1_TEAMS === 'undefined' || !F1_TEAMS[teamId]) {
            return { filtered: articles, teamName: null };
        }
        var team = F1_TEAMS[teamId];
        var keywords = team.keywords || [];
        // 단어 경계 매칭 (예: "audi"가 "Saudi"에 매칭되지 않도록)
        var patterns = keywords.map(function(kw) {
            var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('\\b' + escaped + '\\b', 'i');
        });
        var teamNews = articles.filter(function(article) {
            var title = article.titleOriginal || article.title || '';
            return patterns.some(function(re) { return re.test(title); });
        });
        if (teamNews.length === 0) {
            return { filtered: articles, teamName: null };
        }
        return { filtered: teamNews, teamName: team.name };
    }

    /**
     * 팀 필터 적용 + 뉴스 제목 업데이트
     */
    function applyTeamFilter() {
        var result = filterNewsByTeam(allFetchedNews);
        currentNewsData = result.filtered.slice(0, CONFIG.MAX_ITEMS);
        currentTeamName = result.teamName;
        updateNewsSectionTitle();
    }

    /**
     * 뉴스 섹션 제목 업데이트
     */
    function updateNewsSectionTitle() {
        var titleEl = document.getElementById('newsSectionTitle');
        if (!titleEl) return;
        titleEl.textContent = currentTeamName ? (currentTeamName + ' 뉴스') : 'F1 뉴스';
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
     * 뉴스 카드 렌더링 (분리된 함수)
     */
    function renderNewsCards() {
        const newsContainer = document.getElementById('newsContainer');
        if (!newsContainer) return;

        if (currentNewsData.length > 0) {
            newsLoadFailed = false;
            newsContainer.innerHTML = currentNewsData.map((item, index) => renderNewsCard(item, index)).join('');

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
        }
    }

    /**
     * 뉴스 섹션 초기화
     */
    async function initNewsSection() {
        const newsContainer = document.getElementById('newsContainer');
        if (!newsContainer) return;

        // 로딩 중 제목 숨김
        var titleEl = document.getElementById('newsSectionTitle');
        if (titleEl) titleEl.style.opacity = '0';

        newsContainer.innerHTML = renderLoading();

        try {
            const news = await fetchNews();
            renderNewsCards();
        } catch (error) {
            console.error('뉴스 로드 실패:', error);
            newsLoadFailed = true;
            const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '뉴스를 불러올 수 없습니다.';
            newsContainer.innerHTML = renderEmpty(msg);
        }

        // 로딩 완료 후 제목 표시
        if (titleEl) titleEl.style.opacity = '1';
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
                communityContainer.innerHTML = renderEmpty('아직 작성된 글이 없습니다.', 'community');
            }
        } catch (error) {
            console.error('커뮤니티 글 로드 실패:', error);
            const msg = isNetworkError(error) ? '인터넷 연결을 확인해주세요' : '커뮤니티 글을 불러올 수 없습니다.';
            communityContainer.innerHTML = renderEmpty(msg, 'community');
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
            if (newsContainer) newsContainer.style.display = 'flex';
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

        // 팀 변경 시 뉴스 재필터링
        document.addEventListener('teamChanged', function() {
            if (allFetchedNews.length > 0) {
                applyTeamFilter();
                renderNewsCards();
            }
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
        refresh: initNewsSection,
        refilter: function() { applyTeamFilter(); renderNewsCards(); }
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
