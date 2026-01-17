// ========================================
// 아스톤 마틴 F1 팬페이지 - 카운트다운 타이머
// (utils.js 필요)
// ========================================

// 카운트다운 업데이트
function updateCountdown() {
    const { race: nextRace } = getNextRace();
    const raceDate = new Date(nextRace.date);
    const now = new Date();
    const diff = raceDate - now;

    // 레이스 정보 업데이트 (요소가 존재할 때만)
    const raceNameEl = document.getElementById('raceName');
    const raceCircuitEl = document.getElementById('raceCircuit');
    if (raceNameEl) raceNameEl.textContent = nextRace.name;
    if (raceCircuitEl) raceCircuitEl.textContent = nextRace.circuit;

    // 카운트다운 계산
    if (diff > 0) {
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minsEl = document.getElementById('mins');
        const secsEl = document.getElementById('secs');

        if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
    }
}

// 페이지 로드 시 즉시 실행
updateCountdown();

// 1초마다 업데이트
setInterval(updateCountdown, 1000);

// 스무스 스크롤 처리
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
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
