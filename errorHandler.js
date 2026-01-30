// ========================================
// 전역 에러 핸들러 모듈
// ========================================

(function() {
    'use strict';

    // ========================================
    // 에러 타입 정의
    // ========================================
    const ERROR_TYPES = {
        NETWORK: 'network',
        SERVER: 'server',
        UNAUTHORIZED: 'unauthorized',
        NOT_FOUND: 'not_found',
        FIREBASE: 'firebase',
        VALIDATION: 'validation',
        TIMEOUT: 'timeout',
        UNKNOWN: 'unknown'
    };

    // ========================================
    // 에러 메시지 정의
    // ========================================
    const ERROR_MESSAGES = {
        [ERROR_TYPES.NETWORK]: '인터넷 연결을 확인해주세요',
        [ERROR_TYPES.SERVER]: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요',
        [ERROR_TYPES.UNAUTHORIZED]: '다시 로그인해주세요',
        [ERROR_TYPES.NOT_FOUND]: '요청한 페이지를 찾을 수 없습니다',
        [ERROR_TYPES.FIREBASE]: '데이터 처리 중 오류가 발생했습니다',
        [ERROR_TYPES.VALIDATION]: '입력 값을 확인해주세요',
        [ERROR_TYPES.TIMEOUT]: '요청 시간이 초과되었습니다. 다시 시도해주세요',
        [ERROR_TYPES.UNKNOWN]: '오류가 발생했습니다'
    };

    // ========================================
    // 에러 분류
    // ========================================

    /**
     * HTTP 상태 코드 또는 에러 객체로 에러 타입 분류
     * @param {Error|Response|number} error - 분류할 에러
     * @returns {string} 에러 타입
     */
    function classifyError(error) {
        // HTTP 상태 코드
        if (typeof error === 'number') {
            if (error === 401 || error === 403) return ERROR_TYPES.UNAUTHORIZED;
            if (error === 404) return ERROR_TYPES.NOT_FOUND;
            if (error >= 500) return ERROR_TYPES.SERVER;
            return ERROR_TYPES.UNKNOWN;
        }

        // Response 객체
        if (error instanceof Response) {
            return classifyError(error.status);
        }

        // Error 객체
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            const name = error.name.toLowerCase();

            // 네트워크 에러
            if (name === 'typeerror' && message.includes('failed to fetch')) {
                return ERROR_TYPES.NETWORK;
            }
            if (message.includes('network') || message.includes('offline')) {
                return ERROR_TYPES.NETWORK;
            }

            // 타임아웃
            if (message.includes('timeout') || name === 'aborterror') {
                return ERROR_TYPES.TIMEOUT;
            }

            // Firebase 에러
            if (error.code) {
                return classifyFirebaseError(error.code);
            }
        }

        return ERROR_TYPES.UNKNOWN;
    }

    /**
     * Firebase 에러 코드 분류
     * @param {string} code - Firebase 에러 코드
     * @returns {string} 에러 타입
     */
    function classifyFirebaseError(code) {
        if (!code) return ERROR_TYPES.UNKNOWN;

        // 인증 에러
        if (code.startsWith('auth/')) {
            if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
                return ERROR_TYPES.UNAUTHORIZED;
            }
            if (code === 'auth/network-request-failed') {
                return ERROR_TYPES.NETWORK;
            }
            return ERROR_TYPES.UNAUTHORIZED;
        }

        // Firestore 에러
        if (code.startsWith('permission-denied') || code === 'permission-denied') {
            return ERROR_TYPES.UNAUTHORIZED;
        }
        if (code === 'not-found') {
            return ERROR_TYPES.NOT_FOUND;
        }
        if (code === 'unavailable') {
            return ERROR_TYPES.NETWORK;
        }

        return ERROR_TYPES.FIREBASE;
    }

    // ========================================
    // 에러 처리
    // ========================================

    /**
     * 에러 타입에 따라 처리
     * @param {Error} error - 처리할 에러
     * @param {Object} options - 옵션
     * @param {boolean} options.silent - 알림 표시 안 함
     * @param {string} options.customMessage - 커스텀 에러 메시지
     */
    function handleError(error, options = {}) {
        const errorType = classifyError(error);
        const message = options.customMessage || ERROR_MESSAGES[errorType];

        console.error('[ErrorHandler]', errorType, error);

        // silent 옵션이면 알림 표시 안 함
        if (options.silent) return;

        // 에러 타입별 처리
        switch (errorType) {
            case ERROR_TYPES.UNAUTHORIZED:
                // 모달 표시 (선택적으로 로그아웃)
                showGlobalAlert(message, 'warning', '인증 필요');
                if (typeof signOutUser === 'function' && error?.code?.startsWith('auth/')) {
                    // 인증 에러는 자동 로그아웃하지 않음, 사용자가 결정하도록
                }
                break;

            case ERROR_TYPES.NOT_FOUND:
                // 페이지를 찾을 수 없을 때 404 페이지로 리다이렉트
                if (options.redirect !== false) {
                    // 이미 404 페이지에 있으면 리다이렉트 안 함
                    if (!window.location.pathname.includes('404.html')) {
                        // API 404는 리다이렉트하지 않고 토스트만 표시
                        showToast(message, 'warning');
                    }
                }
                break;

            case ERROR_TYPES.NETWORK:
                showToast(message, 'error');
                break;

            case ERROR_TYPES.SERVER:
                showToast(message, 'error');
                break;

            case ERROR_TYPES.TIMEOUT:
                showToast(message, 'warning');
                break;

            default:
                showToast(message, 'error');
        }
    }

    // ========================================
    // 안전한 Fetch 래퍼
    // ========================================

    /**
     * 타임아웃, 재시도, 에러 분류가 적용된 안전한 fetch
     * @param {string} url - fetch할 URL
     * @param {Object} options - fetch 옵션
     * @param {number} options.timeout - 타임아웃 (밀리초, 기본값: 10000)
     * @param {number} options.retries - 재시도 횟수 (기본값: 1)
     * @returns {Promise<Response>}
     */
    async function safeFetch(url, options = {}) {
        const timeout = options.timeout || 10000;
        const retries = options.retries || 1;
        let lastError;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const fetchOptions = {
                    ...options,
                    signal: controller.signal
                };
                delete fetchOptions.timeout;
                delete fetchOptions.retries;

                const response = await fetch(url, fetchOptions);
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const error = new Error(`HTTP ${response.status}`);
                    error.status = response.status;
                    error.response = response;
                    throw error;
                }

                return response;
            } catch (error) {
                lastError = error;

                // 특정 에러는 재시도하지 않음
                if (error.name === 'AbortError') {
                    lastError = new Error('Request timeout');
                    lastError.name = 'AbortError';
                }

                // 4xx 에러는 재시도하지 않음 (타임아웃 제외)
                if (error.status && error.status >= 400 && error.status < 500) {
                    break;
                }

                // 재시도 전 대기 (지수 백오프)
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }

        throw lastError;
    }

    // ========================================
    // 안전한 Firebase 작업 래퍼
    // ========================================

    /**
     * 에러 처리가 적용된 Firebase 작업 래퍼
     * @param {Function} operation - 실행할 Firebase 작업
     * @param {Object} options - 옵션
     * @returns {Promise<any>}
     */
    async function safeFirestoreOperation(operation, options = {}) {
        try {
            return await operation();
        } catch (error) {
            handleError(error, options);
            throw error;
        }
    }

    // ========================================
    // 토스트 알림
    // ========================================

    let toastContainer = null;

    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /**
     * 토스트 알림 표시
     * @param {string} message - 표시할 메시지
     * @param {string} type - 토스트 타입 (success, error, warning, info)
     * @param {number} duration - 표시 시간 (밀리초, 기본값: 4000)
     */
    function showToast(message, type = 'info', duration = 4000) {
        const container = getToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '&#10003;',
            error: '&#10007;',
            warning: '&#9888;',
            info: '&#8505;'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtmlSafe(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;

        container.appendChild(toast);

        // 애니메이션 트리거
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 자동 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ========================================
    // 전역 알림 모달
    // ========================================

    /**
     * 전역 알림 모달 표시 (기존 showAlert와 호환)
     * @param {string} message - 표시할 메시지
     * @param {string} type - 알림 타입 (success, error, warning, info)
     * @param {string} title - 모달 제목
     */
    function showGlobalAlert(message, type = 'info', title = '알림') {
        // 기존 showAlert 함수가 있는지 확인 (betting.html)
        if (typeof window.showAlert === 'function' && window.showAlert !== showGlobalAlert) {
            window.showAlert(message, type, title);
            return;
        }

        // DOM에 알림 모달이 있는지 확인
        const existingModal = document.getElementById('alertModal');
        if (existingModal && typeof window.showAlert === 'function') {
            window.showAlert(message, type, title);
            return;
        }

        // 동적 모달 생성
        showDynamicAlertModal(message, type, title);
    }

    function showDynamicAlertModal(message, type, title) {
        // 기존 동적 모달 제거
        const existingDynamic = document.getElementById('dynamicAlertModal');
        if (existingDynamic) existingDynamic.remove();

        const icons = {
            success: '&#10003;',
            error: '&#10007;',
            warning: '&#9888;',
            info: '&#8505;'
        };

        const modal = document.createElement('div');
        modal.id = 'dynamicAlertModal';
        modal.className = 'alert-modal dynamic-alert-modal';
        modal.innerHTML = `
            <div class="alert-modal-overlay" onclick="closeDynamicAlertModal()"></div>
            <div class="alert-modal-content">
                <div class="alert-modal-icon ${type}">${icons[type] || icons.info}</div>
                <h3 class="alert-modal-title">${escapeHtmlSafe(title)}</h3>
                <p class="alert-modal-message">${escapeHtmlSafe(message)}</p>
                <button class="alert-modal-btn" onclick="closeDynamicAlertModal()">확인</button>
            </div>
        `;

        document.body.appendChild(modal);

        // 애니메이션 트리거
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    }

    function closeDynamicAlertModal() {
        const modal = document.getElementById('dynamicAlertModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }

    // ========================================
    // 로딩 오버레이
    // ========================================

    let loadingOverlay = null;
    let loadingCounter = 0;

    /**
     * 전역 로딩 오버레이 표시
     * @param {string} message - 로딩 메시지 (선택)
     */
    function showLoading(message = '로딩 중...') {
        loadingCounter++;

        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <p class="loading-message">${escapeHtmlSafe(message)}</p>
            `;
            document.body.appendChild(loadingOverlay);
        } else {
            const messageEl = loadingOverlay.querySelector('.loading-message');
            if (messageEl) messageEl.textContent = message;
        }

        requestAnimationFrame(() => {
            loadingOverlay.classList.add('active');
        });
    }

    /**
     * 전역 로딩 오버레이 숨기기
     */
    function hideLoading() {
        loadingCounter = Math.max(0, loadingCounter - 1);

        if (loadingCounter === 0 && loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    /**
     * 모든 로딩 오버레이 강제 숨기기
     */
    function forceHideLoading() {
        loadingCounter = 0;
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    // ========================================
    // 섹션 로딩
    // ========================================

    /**
     * 특정 요소에 로딩 스피너 표시
     * @param {string|HTMLElement} container - 컨테이너 선택자 또는 요소
     * @param {string} message - 로딩 메시지
     */
    function showSectionLoading(container, message = '로딩 중...') {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) return;

        el.dataset.originalContent = el.innerHTML;
        el.innerHTML = `
            <div class="section-loading">
                <div class="loading-spinner small"></div>
                <span>${escapeHtmlSafe(message)}</span>
            </div>
        `;
    }

    /**
     * 섹션 로딩 숨기고 원래 내용 복원
     * @param {string|HTMLElement} container - 컨테이너 선택자 또는 요소
     */
    function hideSectionLoading(container) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el || !el.dataset.originalContent) return;

        el.innerHTML = el.dataset.originalContent;
        delete el.dataset.originalContent;
    }

    // ========================================
    // 버튼 로딩 상태
    // ========================================

    /**
     * 버튼 로딩 상태 설정
     * @param {string|HTMLElement} button - 버튼 선택자 또는 요소
     * @param {boolean} loading - 로딩 상태
     * @param {string} loadingText - 로딩 중 표시할 텍스트
     */
    function setButtonLoading(button, loading, loadingText = '처리 중...') {
        const btn = typeof button === 'string' ? document.querySelector(button) : button;
        if (!btn) return;

        if (loading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = loadingText;
            btn.disabled = true;
            btn.classList.add('loading');
        } else {
            btn.textContent = btn.dataset.originalText || btn.textContent;
            btn.disabled = false;
            btn.classList.remove('loading');
            delete btn.dataset.originalText;
        }
    }

    // ========================================
    // 전역 에러 핸들러
    // ========================================

    // 처리되지 않은 에러
    window.onerror = function(message, source, lineno, colno, error) {
        console.error('[Global Error]', { message, source, lineno, colno, error });
        // 스크립트 에러는 토스트 표시 안 함 (스팸 방지)
        return false;
    };

    // 처리되지 않은 Promise rejection
    window.addEventListener('unhandledrejection', function(event) {
        console.error('[Unhandled Promise Rejection]', event.reason);
        // 특정 에러만 토스트 표시
        if (event.reason instanceof Error) {
            const errorType = classifyError(event.reason);
            if (errorType === ERROR_TYPES.NETWORK) {
                showToast(ERROR_MESSAGES[ERROR_TYPES.NETWORK], 'error');
            }
        }
    });

    // ========================================
    // 네트워크 상태 감지
    // ========================================

    let wasOffline = false;

    window.addEventListener('online', function() {
        if (wasOffline) {
            showToast('인터넷에 다시 연결되었습니다', 'success');
            wasOffline = false;
        }
    });

    window.addEventListener('offline', function() {
        wasOffline = true;
        showToast('인터넷 연결이 끊어졌습니다', 'error', 6000);
    });

    // ========================================
    // 유틸리티 함수
    // ========================================

    /**
     * HTML 이스케이프 (기존 함수 존재 여부 확인하는 안전한 버전)
     * @param {string} str - 이스케이프할 문자열
     * @returns {string} 이스케이프된 문자열
     */
    function escapeHtmlSafe(str) {
        if (typeof escapeHtml === 'function') {
            return escapeHtml(str);
        }
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========================================
    // 전역 스코프로 내보내기
    // ========================================

    window.ErrorHandler = {
        ERROR_TYPES,
        ERROR_MESSAGES,
        classifyError,
        handleError,
        safeFetch,
        safeFirestoreOperation,
        showToast,
        showGlobalAlert,
        showLoading,
        hideLoading,
        forceHideLoading,
        showSectionLoading,
        hideSectionLoading,
        setButtonLoading
    };

    // 자주 사용하는 함수 직접 노출
    window.showToast = showToast;
    window.showGlobalAlert = showGlobalAlert;
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    window.safeFetch = safeFetch;
    window.closeDynamicAlertModal = closeDynamicAlertModal;

    // showAlert 통일: 페이지별 showAlert가 없으면 showGlobalAlert 사용
    // 중요한 알림(에러, 경고)은 showAlert(모달), 가벼운 알림은 showToast
    if (typeof window.showAlert !== 'function') {
        window.showAlert = showGlobalAlert;
    }

})();
