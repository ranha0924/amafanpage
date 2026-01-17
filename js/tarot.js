// ========================================
// F1 경기 타로 기능
// ========================================

// 날짜 기반 시드 생성
function generateDailySeed() {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

// 타로 카드 선택 (날짜 + 별자리 기반)
function selectTarotCard(zodiac) {
    const seed = generateDailySeed();
    const zodiacOffset = zodiac === 'leo' ? 0 : 7; // 다른 드라이버는 다른 카드
    const cardIndex = (seed + zodiacOffset) % tarotCards.length;
    return tarotCards[cardIndex];
}

// 타로 카드 뒤집기
function flipTarotCard() {
    const tarotCard = document.getElementById('tarotCard');
    if (!tarotCard.classList.contains('flipped')) {
        tarotCard.classList.add('flipped');
    }
}

// 타로 카드 초기화 (뒷면으로)
function resetTarotCard() {
    const tarotCard = document.getElementById('tarotCard');
    tarotCard.classList.remove('flipped');
}

// 타로 모달 표시
function showTarot(zodiac) {
    const nextRace = getNextRace();
    const card = selectTarotCard(zodiac);
    const driver = driverData[zodiac];

    // 카드 초기화 (뒷면으로)
    resetTarotCard();

    // 모달 업데이트
    document.getElementById('tarotRaceName').textContent = nextRace.name;
    document.getElementById('tarotDriverNumber').textContent = driver.number;
    document.getElementById('tarotDriverName').textContent = driver.name;
    document.getElementById('tarotSymbol').textContent = card.symbol;
    document.getElementById('tarotCardName').textContent = card.name;
    document.getElementById('tarotCardNameEn').textContent = card.nameEn;
    document.getElementById('tarotMeaning').textContent = card.meaning;
    document.getElementById('tarotRaceReading').textContent = card.raceReading[zodiac];
    document.getElementById('keyword1').textContent = card.keywords[0];
    document.getElementById('keyword2').textContent = card.keywords[1];
    document.getElementById('keyword3').textContent = card.keywords[2];
    document.getElementById('tarotAdvice').textContent = card.advice;

    // 모달 표시
    document.getElementById('tarotModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 타로 모달 닫기
function closeTarot() {
    document.getElementById('tarotModal').classList.remove('active');
    document.body.style.overflow = '';
    // 모달 닫을 때 카드 초기화
    setTimeout(resetTarotCard, 300);
}

// 타로 모달 외부 클릭 시 닫기
document.getElementById('tarotModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeTarot();
    }
});

// ESC 키로 타로 모달 닫기
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeTarot();
    }
});

// ========================================
// 별자리 토글 기능
// ========================================

function toggleZodiac(driver) {
    const zodiacEl = document.getElementById(`zodiac-${driver}`);
    const buttons = document.querySelectorAll('.zodiac-toggle-btn');

    if (zodiacEl.classList.contains('active')) {
        zodiacEl.classList.remove('active');
        buttons.forEach(btn => btn.classList.remove('active'));
    } else {
        document.querySelectorAll('.driver-zodiac').forEach(el => el.classList.remove('active'));
        buttons.forEach(btn => btn.classList.remove('active'));
        zodiacEl.classList.add('active');
        event.currentTarget.classList.add('active');
    }
}
