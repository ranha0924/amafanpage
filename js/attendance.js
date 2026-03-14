// ========================================
// AMR Token System - Attendance Module
// ========================================

(function() {
    'use strict';

    // ========================================
    // DOM 요소 캐싱
    // ========================================
    const elements = {
        btn: null,
        streak: null,
        calendar: null,
        miniBtn: null,
        miniText: null
    };

    /**
     * DOM 요소 캐싱
     */
    function cacheElements() {
        elements.btn = document.getElementById('attendanceBtn');
        elements.streak = document.getElementById('attendanceStreak');
        elements.calendar = document.getElementById('attendanceCalendar');
        elements.miniBtn = document.getElementById('attendanceMiniBtn');
        elements.miniText = document.getElementById('attendanceMiniText');
    }

    // ========================================
    // 시간 상수 - TIME_MS는 constants.js에서 정의됨
    // ========================================
    const TIME_CONSTANTS = {
        ONE_DAY_MS: TIME_MS.DAY  // 1일 (밀리초)
    };

    // ========================================
    // 유틸리티 함수
    // ========================================

    /**
     * 오늘 날짜 문자열 생성 (YYYYMMDD)
     * @returns {string}
     */
    function getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    // isToday는 utils.js에서 제공 (전역 함수)

    // ========================================
    // 출석체크 로직
    // ========================================

    // 🔒 C-1: 더블 클릭 방지 플래그
    let isProcessing = false;

    /**
     * 출석체크 수행 (서버 API 호출 - 어뷰징 방지)
     * @returns {Promise<boolean>}
     */
    async function performAttendance() {
        if (isProcessing) return false;
        isProcessing = true;

        const user = requireAuth();
        if (!user) { isProcessing = false; return false; }

        // 버튼 비활성화
        if (elements.btn) {
            elements.btn.disabled = true;
            elements.btn.textContent = '처리 중...';
        }
        if (elements.miniBtn) {
            elements.miniBtn.disabled = true;
        }

        try {
            // Firebase ID 토큰 가져오기
            const idToken = await user.getIdToken();

            // 서버 API 호출
            const response = await fetch('/api/token/attendance', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                }
            });

            // 🔒 보안: JSON 파싱 에러 처리 (H-4)
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('JSON 파싱 실패:', parseError);
                throw new Error('서버 응답 형식 오류');
            }

            if (!response.ok) {
                throw new Error(data.error || '출석체크 실패');
            }

            // 성공 후 UI 업데이트
            handleAttendanceSuccess({
                totalReward: data.reward,
                consecutiveDays: data.consecutiveDays,
                isBonus: data.isBonus
            });
            return true;

        } catch (error) {
            handleAttendanceError(error);
            // 버튼 복구
            if (elements.btn) {
                elements.btn.disabled = false;
                elements.btn.textContent = `출석체크 (+${TOKEN_CONFIG.ATTENDANCE} FC)`;
            }
            if (elements.miniBtn) {
                elements.miniBtn.disabled = false;
            }
            return false;
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 출석 성공 처리
     * @param {Object} result
     */
    function handleAttendanceSuccess(result) {
        updateTokenDisplay();
        updateAttendanceUI(result.consecutiveDays, true);
        updateMiniButtonUI(true, result.consecutiveDays);

        if (result.isBonus) {
            showTokenNotification(result.totalReward, `${TOKEN_CONFIG.STREAK_DAYS}일 연속 출석 보너스!`);
        } else {
            showTokenNotification(TOKEN_CONFIG.ATTENDANCE, '출석체크 완료!');
        }

        logger.log(`출석체크 완료: ${result.totalReward} FC (연속 ${result.consecutiveDays}일)`);
    }

    /**
     * 출석 에러 처리
     * @param {Error} error
     */
    function handleAttendanceError(error) {
        const msg = error.message || '';
        if (msg.includes('이미 출석체크')) {
            showToast('오늘은 이미 출석체크를 완료했습니다!', 'info');
        } else if (isNetworkError(error)) {
            showToast('인터넷 연결을 확인해주세요', 'error');
        } else {
            console.error('출석체크 실패:', error);
            showToast(msg || '출석체크에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }

    // ========================================
    // UI 업데이트
    // ========================================

    /**
     * 출석체크 UI 업데이트
     * @param {number} consecutiveDays
     * @param {boolean} justCompleted
     */
    async function updateAttendanceUI(consecutiveDays, justCompleted = false) {
        if (!elements.btn) return;

        const user = getCurrentUser();

        if (!user) {
            setButtonDisabled('로그인 필요');
            return;
        }

        const userData = await getUserTokens();
        const hasAttendedToday = userData?.lastAttendance && isToday(userData.lastAttendance);
        let streakDays = consecutiveDays || (userData?.consecutiveDays || 0);

        // 연속 출석 유효성 검사: 마지막 출석이 어제도 오늘도 아니면 리셋
        if (!hasAttendedToday && !justCompleted && streakDays > 0 && userData?.lastAttendance) {
            const lastDate = userData.lastAttendance.toDate
                ? userData.lastAttendance.toDate()
                : new Date(userData.lastAttendance);
            const now = new Date();
            const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffDays = Math.round((today - lastDay) / TIME_CONSTANTS.ONE_DAY_MS);
            if (diffDays > 1) {
                streakDays = 0;
            }
        }

        // 버튼 상태 업데이트
        if (hasAttendedToday || justCompleted) {
            setButtonCompleted();
        } else {
            setButtonReady();
        }

        // 연속 출석 표시
        updateStreakDisplay(streakDays);

        // 캘린더 표시
        if (elements.calendar) {
            renderCalendar(streakDays, hasAttendedToday || justCompleted);
        }
    }

    /**
     * 버튼 비활성화 상태
     * @param {string} text
     */
    function setButtonDisabled(text) {
        elements.btn.disabled = true;
        elements.btn.classList.remove('completed');
        elements.btn.textContent = text;
    }

    /**
     * 버튼 완료 상태
     */
    function setButtonCompleted() {
        elements.btn.disabled = true;
        elements.btn.classList.add('completed');
        elements.btn.textContent = '오늘 출석 완료!';
    }

    /**
     * 버튼 준비 상태
     */
    function setButtonReady() {
        elements.btn.disabled = false;
        elements.btn.classList.remove('completed');
        elements.btn.textContent = `출석하기`;
    }

    /**
     * 연속 출석 표시 업데이트
     * @param {number} streakDays
     */
    function updateStreakDisplay(streakDays) {
        if (!elements.streak) return;

        // 새 레이아웃: 연속 X일 배지
        elements.streak.textContent = `연속 ${streakDays}일`;
    }

    /**
     * 출석 캘린더 렌더링 (게임 스타일 7일 달력)
     * @param {number} consecutiveDays
     * @param {boolean} todayCompleted
     */
    function renderCalendar(consecutiveDays, todayCompleted) {
        elements.calendar.innerHTML = '';

        // todayCompleted=true: consecutiveDays는 오늘 포함 값
        // todayCompleted=false: consecutiveDays는 어제까지 값, 오늘은 +1
        const effectiveDays = todayCompleted ? consecutiveDays : consecutiveDays + 1;
        const dayInCycle = effectiveDays % TOKEN_CONFIG.STREAK_DAYS || TOKEN_CONFIG.STREAK_DAYS;

        // 일별 보상 (7일차 보너스)
        const rewards = [10, 10, 10, 10, 10, 15, 30];
        const labels = ['1일', '2일', '3일', '4일', '5일', '6일', '보너스'];

        for (let i = 1; i <= TOKEN_CONFIG.STREAK_DAYS; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'attendance-day';
            dayEl.setAttribute('role', 'listitem');

            // 완료된 날 표시
            if (i < dayInCycle || (i === dayInCycle && todayCompleted)) {
                dayEl.classList.add('completed');
            }

            // 오늘 표시 (출석 안 한 경우)
            if (i === dayInCycle && !todayCompleted) {
                dayEl.classList.add('today');
            }

            // 보너스 날 (7일차)
            if (i === TOKEN_CONFIG.STREAK_DAYS) {
                dayEl.classList.add('bonus');
            }

            // 내부 구조 생성
            dayEl.innerHTML = `
                <span class="attendance-day-number">${i}일차</span>
                <span class="attendance-day-reward">${rewards[i - 1]}</span>
                <span class="attendance-day-label">${i === dayInCycle && !todayCompleted ? '오늘' : (i === TOKEN_CONFIG.STREAK_DAYS ? '<img src="images/icons/icon-gift.svg" alt="" class="inline-icon">' : 'FC')}</span>
            `;
            dayEl.setAttribute('aria-label', `${i}일차 ${rewards[i - 1]} FC`);

            elements.calendar.appendChild(dayEl);
        }
    }

    /**
     * 미니 버튼 UI 업데이트
     * @param {boolean} completed - 오늘 출석 완료 여부
     * @param {number} streakDays - 연속 출석일
     */
    function updateMiniButtonUI(completed, streakDays = 0) {
        if (!elements.miniBtn) return;

        if (completed) {
            elements.miniBtn.disabled = true;
            elements.miniBtn.classList.add('checked');
            if (elements.miniText) {
                elements.miniText.textContent = `${streakDays}일`;
            }
        } else {
            elements.miniBtn.disabled = false;
            elements.miniBtn.classList.remove('checked');
            if (elements.miniText) {
                elements.miniText.textContent = '출석';
            }
        }
    }

    /**
     * 미니 버튼 로그인 필요 상태
     */
    function setMiniButtonDisabled() {
        if (!elements.miniBtn) return;
        elements.miniBtn.disabled = true;
        elements.miniBtn.classList.remove('checked');
        if (elements.miniText) {
            elements.miniText.textContent = '로그인';
        }
    }

    // ========================================
    // 초기화
    // ========================================

    /**
     * 출석체크 섹션 초기화
     */
    function init() {
        cacheElements();

        if (elements.btn) {
            elements.btn.addEventListener('click', performAttendance);
        }

        // 미니 버튼 이벤트 리스너
        if (elements.miniBtn) {
            elements.miniBtn.addEventListener('click', performAttendance);
        }

        // Auth 상태 변경 시 UI 업데이트
        if (typeof auth !== 'undefined' && auth) {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    updateAttendanceUI();
                    // 미니 버튼 UI 업데이트
                    const userData = await getUserTokens();
                    const hasAttendedToday = userData?.lastAttendance && isToday(userData.lastAttendance);
                    const streakDays = userData?.consecutiveDays || 0;
                    updateMiniButtonUI(hasAttendedToday, streakDays);
                } else {
                    if (elements.btn) {
                        setButtonDisabled('로그인 필요');
                    }
                    setMiniButtonDisabled();
                }
            });
        }
    }

    // 전역 노출 (홈 대시보드 위젯에서 사용)
    window.performAttendance = performAttendance;

    // DOM 로드 완료 시 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
