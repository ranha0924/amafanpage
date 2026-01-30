// ========================================
// 아스톤 마틴 F1 팬페이지 - 메인 스크립트
// ========================================

(function() {
    'use strict';

    // ========================================
    // 상수 정의 - TIME_MS, UI_CONFIG는 constants.js에서 정의됨
    // ========================================
    const COUNTDOWN_INTERVAL = UI_CONFIG.COUNTDOWN_INTERVAL;

    // ========================================
    // DOM 요소 캐싱
    // ========================================
    const elements = {
        // 기존 카운트다운 (다른 페이지용)
        raceName: null,
        raceCircuit: null,
        days: null,
        hours: null,
        mins: null,
        secs: null,
        // 카운트다운 바
        countdownRaceName: null,
        countdownDays: null,
        countdownHours: null,
        countdownMins: null,
        countdownSecs: null
    };

    /**
     * DOM 요소 캐싱 초기화
     */
    function cacheElements() {
        elements.raceName = document.getElementById('raceName');
        elements.raceCircuit = document.getElementById('raceCircuit');
        elements.days = document.getElementById('days');
        elements.hours = document.getElementById('hours');
        elements.mins = document.getElementById('mins');
        elements.secs = document.getElementById('secs');
        elements.countdownRaceName = document.getElementById('countdownRaceName');
        elements.countdownDays = document.getElementById('countdownDays');
        elements.countdownHours = document.getElementById('countdownHours');
        elements.countdownMins = document.getElementById('countdownMins');
        elements.countdownSecs = document.getElementById('countdownSecs');
    }

    /**
     * 숫자를 2자리 문자열로 변환
     * @param {number} num
     * @returns {string}
     */
    function padZero(num) {
        return String(num).padStart(2, '0');
    }

    /**
     * 카운트다운 시간 계산
     * @param {number} diff - 밀리초 차이
     * @returns {Object}
     */
    function calculateCountdown(diff) {
        return {
            days: Math.floor(diff / TIME_MS.DAY),
            hours: Math.floor((diff % TIME_MS.DAY) / TIME_MS.HOUR),
            mins: Math.floor((diff % TIME_MS.HOUR) / TIME_MS.MINUTE),
            secs: Math.floor((diff % TIME_MS.MINUTE) / TIME_MS.SECOND)
        };
    }

    /**
     * 카운트다운 업데이트
     */
    function updateCountdown() {
        // getNextRace는 utils.js에서 정의됨
        if (typeof getNextRace !== 'function') {
            console.warn('getNextRace 함수를 찾을 수 없습니다.');
            return;
        }

        const result = getNextRace();
        if (!result || !result.race) {
            console.warn('다음 레이스 정보를 찾을 수 없습니다.');
            return;
        }

        const nextRace = result.race;
        const raceDate = new Date(nextRace.date);
        const now = new Date();
        const diff = raceDate - now;

        // 레이스 정보 업데이트
        if (elements.raceName) {
            elements.raceName.textContent = nextRace.name;
        }
        if (elements.raceCircuit) {
            elements.raceCircuit.textContent = nextRace.circuit;
        }
        if (elements.countdownRaceName) {
            elements.countdownRaceName.textContent = nextRace.name;
        }

        // 카운트다운이 0 이하면 중단
        if (diff <= 0) {
            return;
        }

        const time = calculateCountdown(diff);

        // 기존 카운트다운 요소 업데이트
        if (elements.days) elements.days.textContent = padZero(time.days);
        if (elements.hours) elements.hours.textContent = padZero(time.hours);
        if (elements.mins) elements.mins.textContent = padZero(time.mins);
        if (elements.secs) elements.secs.textContent = padZero(time.secs);

        // 카운트다운 바 요소 업데이트
        if (elements.countdownDays) elements.countdownDays.textContent = time.days;
        if (elements.countdownHours) elements.countdownHours.textContent = padZero(time.hours);
        if (elements.countdownMins) elements.countdownMins.textContent = padZero(time.mins);
        if (elements.countdownSecs) elements.countdownSecs.textContent = padZero(time.secs);
    }

    /**
     * 스무스 스크롤 초기화
     */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');

                if (href.startsWith('#') && href.length > 1) {
                    const target = document.querySelector(href);

                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });
        });
    }

    // Interval ID 저장 (메모리 누수 방지)
    let countdownInterval = null;

    /**
     * 카운트다운 시작
     */
    function startCountdown() {
        if (countdownInterval) return; // 이미 실행 중이면 무시
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, COUNTDOWN_INTERVAL);
    }

    /**
     * 카운트다운 중지
     */
    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    /**
     * 초기화
     */
    function init() {
        cacheElements();
        startCountdown();
        initSmoothScroll();

        // 페이지 가시성 변경 시 카운트다운 제어 (메모리 누수 방지)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopCountdown();
            } else {
                startCountdown();
            }
        });

        // 페이지 언로드 시 정리
        window.addEventListener('beforeunload', stopCountdown);
    }

    // DOM 로드 완료 시 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
