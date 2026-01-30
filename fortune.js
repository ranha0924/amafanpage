// ========================================
// Fortune Page JavaScript
// (utils.js, tarotData.js 필요)
// ========================================

// 현재 선택된 드라이버
let currentZodiac = null;

// 카운트다운 인터벌 ID 저장
let countdownIntervals = {};

// 드라이버 정보
const driverInfo = {
    leo: { name: '페르난도 알론소', number: '14', zodiac: '♌ 사자자리' },
    scorpio: { name: '랜스 스트롤', number: '18', zodiac: '♏ 전갈자리' }
};


// ========================================
// 드라이버 옵션 모달
// ========================================

function showDriverOptions(zodiac) {
    currentZodiac = zodiac;
    const modal = document.getElementById('driverOptionsModal');
    const info = driverInfo[zodiac];

    // 모달 내용 업데이트
    document.getElementById('optionsDriverNumber').textContent = info.number;
    document.getElementById('optionsDriverName').textContent = info.name;
    document.getElementById('optionsDriverZodiac').textContent = info.zodiac;

    // 타로 버튼 상태 업데이트
    const tarotText = document.getElementById('tarotOptionText');
    const tarotDesc = document.getElementById('tarotOptionDesc');

    tarotText.textContent = `${info.name}의 이번 경기 타로 보기`;
    tarotDesc.textContent = '경기 운세 카드 뽑기';

    modal.classList.add('active');
}

function closeDriverOptions() {
    const modal = document.getElementById('driverOptionsModal');
    modal.classList.remove('active');
}

// ========================================
// 섹션 표시
// ========================================

function hideAllSections() {
    document.querySelectorAll('.fortune-content').forEach(el => {
        el.classList.remove('active');
    });
}

function showZodiacSection() {
    closeDriverOptions();
    hideAllSections();

    const section = document.getElementById(`zodiac-${currentZodiac}`);
    section.classList.add('active');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showTarotSection() {
    closeDriverOptions();
    hideAllSections();

    const section = document.getElementById(`tarot-${currentZodiac}`);
    section.classList.add('active');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 카운트다운 초기화
    initValidityCountdown(currentZodiac);

    // 셔플 상태 리셋 (여러 번 뽑기 가능)
    resetTarotState(currentZodiac);

    // 셔플 이벤트 설정
    setupShuffleEvents(currentZodiac);
}

function backToSelection() {
    hideAllSections();
    // "내 운세" 상태도 리셋
    resetLuckyItemState('my');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================
// 타로 상태 리셋 (여러 번 뽑기 가능)
// ========================================

function resetTarotState(zodiac) {
    // 셔플 상태 리셋
    shuffleState[zodiac] = { initialized: false, shuffled: false, cardSelected: false };

    // UI 리셋
    const shuffleContainer = document.getElementById(`shuffleContainer-${zodiac}`);
    const selectedCardDisplay = document.getElementById(`selectedCard-${zodiac}`);
    const tarotReading = document.getElementById(`tarotReading-${zodiac}`);
    const fixedNotice = document.getElementById(`fixedNotice-${zodiac}`);
    const shuffleBtn = document.getElementById(`shuffleBtn-${zodiac}`);
    const instruction = document.getElementById(`shuffleInstruction-${zodiac}`);
    const deck = document.getElementById(`shuffleDeck-${zodiac}`);

    // 🔒 null 참조 방지: 필수 요소 검증
    if (!shuffleContainer || !deck) {
        console.error(`운세 요소를 찾을 수 없음: ${zodiac}`);
        return;
    }

    const cards = deck.querySelectorAll('.shuffle-card');

    // 컨테이너 표시
    shuffleContainer.style.display = 'flex';
    if (selectedCardDisplay) selectedCardDisplay.style.display = 'none';
    if (tarotReading) tarotReading.classList.remove('show');
    if (fixedNotice) fixedNotice.style.display = 'none';

    // 버튼과 안내 텍스트 리셋
    if (shuffleBtn) {
        shuffleBtn.classList.remove('hidden');
        shuffleBtn.disabled = false;
    }
    if (instruction) {
        instruction.textContent = '카드를 섞어주세요';
        instruction.classList.remove('hidden');
    }

    // 카드 상태 리셋
    cards.forEach(card => {
        card.classList.remove('selected', 'not-selected', 'selectable');
    });

    // 카드 뒤집기 상태 리셋
    if (selectedCardDisplay) {
        const tarotCard = selectedCardDisplay.querySelector('.tarot-card');
        if (tarotCard) {
            tarotCard.classList.remove('flipped');
        }
    }

    // 행운 아이템 상태 리셋
    resetLuckyItemState(zodiac);
}

// ========================================
// 유효 기간 카운트다운
// ========================================

function initValidityCountdown(zodiac) {
    if (countdownIntervals[zodiac]) {
        clearInterval(countdownIntervals[zodiac]);
    }

    updateValidityCountdown(zodiac);

    countdownIntervals[zodiac] = setInterval(() => {
        updateValidityCountdown(zodiac);
    }, 1000);
}

function updateValidityCountdown(zodiac) {
    // 🔒 null 참조 방지: getNextRace() 결과 검증
    const result = getNextRace();
    if (!result || !result.race || !result.race.date) {
        console.warn('다음 레이스 정보 없음');
        const countdownEl = document.getElementById(`validityCountdown-${zodiac}`);
        if (countdownEl) {
            countdownEl.textContent = '레이스 정보 없음';
        }
        // 인터벌 정리
        if (countdownIntervals[zodiac]) {
            clearInterval(countdownIntervals[zodiac]);
            countdownIntervals[zodiac] = null;
        }
        return;
    }

    const nextRace = result.race;
    const raceDate = new Date(nextRace.date);
    const now = new Date();
    const diff = raceDate - now;

    const raceEl = document.getElementById(`validityRace-${zodiac}`);
    if (raceEl) {
        raceEl.textContent = nextRace.name;
    }

    const countdownEl = document.getElementById(`validityCountdown-${zodiac}`);
    const noticeEl = document.getElementById(`validityNotice-${zodiac}`);

    if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        // 🔒 보안: textContent 사용 (XSS 방지)
        let countdownText = '경기 시작까지 ';
        if (days > 0) {
            countdownText += `${days}일 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            countdownText += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (countdownEl) {
            countdownEl.textContent = countdownText;
        }

        if (noticeEl) {
            if (diff < 24 * 60 * 60 * 1000) {
                noticeEl.classList.add('urgent');
            } else {
                noticeEl.classList.remove('urgent');
            }
        }
    } else {
        if (countdownEl) {
            countdownEl.textContent = '레이스 진행 중!';
        }
        if (noticeEl) {
            noticeEl.classList.add('urgent');
        }
        // 🔒 카운트다운 종료 시 인터벌 정리 (메모리 누수 방지)
        if (countdownIntervals[zodiac]) {
            clearInterval(countdownIntervals[zodiac]);
            countdownIntervals[zodiac] = null;
        }
    }
}

// ========================================
// 셔플 기능
// ========================================

const shuffleState = {
    leo: { initialized: false, shuffled: false, cardSelected: false },
    scorpio: { initialized: false, shuffled: false, cardSelected: false }
};

function setupShuffleEvents(zodiac) {
    if (shuffleState[zodiac].initialized) return;
    shuffleState[zodiac].initialized = true;

    const shuffleBtn = document.getElementById(`shuffleBtn-${zodiac}`);
    const deck = document.getElementById(`shuffleDeck-${zodiac}`);
    const cards = deck.querySelectorAll('.shuffle-card');

    shuffleBtn.addEventListener('click', () => {
        if (!shuffleState[zodiac].shuffled) {
            startShuffle(zodiac);
        }
    });

    cards.forEach((card, index) => {
        card.addEventListener('click', () => {
            if (shuffleState[zodiac].shuffled && !shuffleState[zodiac].cardSelected) {
                selectShuffleCard(zodiac, card, index);
            }
        });
    });
}

function startShuffle(zodiac) {
    const deck = document.getElementById(`shuffleDeck-${zodiac}`);
    const shuffleBtn = document.getElementById(`shuffleBtn-${zodiac}`);
    const instruction = document.getElementById(`shuffleInstruction-${zodiac}`);

    shuffleBtn.disabled = true;
    deck.classList.add('shuffling');

    setTimeout(() => {
        deck.classList.remove('shuffling');
        shuffleState[zodiac].shuffled = true;

        shuffleBtn.classList.add('hidden');
        instruction.textContent = '카드를 선택하세요';

        const cards = deck.querySelectorAll('.shuffle-card');
        cards.forEach(card => {
            card.classList.add('selectable');
        });
    }, 1500);
}

function selectShuffleCard(zodiac, cardElement, cardIndex) {
    const deck = document.getElementById(`shuffleDeck-${zodiac}`);
    const cards = deck.querySelectorAll('.shuffle-card');
    const instruction = document.getElementById(`shuffleInstruction-${zodiac}`);

    shuffleState[zodiac].cardSelected = true;

    // 선택된 카드 강조 (위치 유지, 하이라이트만)
    cardElement.classList.add('selected');
    cardElement.classList.remove('selectable');

    // 나머지 카드 페이드 아웃
    cards.forEach((card, index) => {
        if (index !== cardIndex) {
            card.classList.add('not-selected');
            card.classList.remove('selectable');
        }
    });

    instruction.classList.add('hidden');

    // 잠시 후 결과 공개
    setTimeout(() => {
        revealSelectedCard(zodiac);
    }, 1000);
}

function revealSelectedCard(zodiac) {
    const selectedCardDisplay = document.getElementById(`selectedCard-${zodiac}`);
    const tarotReading = document.getElementById(`tarotReading-${zodiac}`);
    const fixedNotice = document.getElementById(`fixedNotice-${zodiac}`);

    // 카드 데이터 로드
    let card = selectTarotCard(zodiac);

    // 🔒 undefined 방지: 카드가 없으면 기본 카드 사용
    if (!card) {
        console.warn('타로 카드 선택 실패, 기본 카드 사용');
        // tarotCards가 정의되어 있다면 첫 번째 카드 사용
        if (typeof tarotCards !== 'undefined' && tarotCards.length > 0) {
            card = tarotCards[0];
        } else {
            return; // 카드가 아예 없으면 중단
        }
    }

    // 카드 정보 업데이트
    document.getElementById(`tarotSymbol-${zodiac}`).textContent = card.symbol;
    document.getElementById(`tarotCardName-${zodiac}`).textContent = card.name;
    document.getElementById(`tarotCardNameEn-${zodiac}`).textContent = card.nameEn;

    // F1 맥락 결과 업데이트
    document.getElementById(`tarotF1Meaning-${zodiac}`).textContent = card.f1Meaning;
    document.getElementById(`tarotSituation-${zodiac}`).textContent = card.situationReading;
    document.getElementById(`tarotDriverAdvice-${zodiac}`).textContent = card.driverReading[zodiac];
    document.getElementById(`tarotPitStrategy-${zodiac}`).textContent = card.pitStrategy;

    // 키워드 업데이트
    document.getElementById(`keyword1-${zodiac}`).textContent = card.keywords[0];
    document.getElementById(`keyword2-${zodiac}`).textContent = card.keywords[1];
    document.getElementById(`keyword3-${zodiac}`).textContent = card.keywords[2];

    // 선택된 카드 표시 (덱 아래에)
    selectedCardDisplay.style.display = 'flex';

    // 카드 뒤집기 애니메이션
    const tarotCard = selectedCardDisplay.querySelector('.tarot-card');
    tarotCard.classList.remove('flipped');

    setTimeout(() => {
        tarotCard.classList.add('flipped');
    }, 100);

    // 결과 표시
    setTimeout(() => {
        tarotReading.classList.add('show');
        tarotReading.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            fixedNotice.style.display = 'block';
        }, 500);
    }, 900);
}

// ========================================
// 타로 카드 선택 (날짜 + 별자리 기반)
// ========================================

function selectTarotCard(zodiac) {
    const seed = generateDailySeed();
    const zodiacOffset = zodiac === 'leo' ? 0 : 7;
    const cardIndex = (seed + zodiacOffset) % tarotCards.length;
    return tarotCards[cardIndex];
}

// ========================================
// 행운의 아이템 기능
// ========================================

const luckyItemState = {
    leo: { opened: false },
    scorpio: { opened: false },
    my: { opened: false }
};

function setupLuckyItemEvents(zodiac) {
    const box = document.getElementById(`luckyItemBox-${zodiac}`);
    if (box && !box.hasAttribute('data-initialized')) {
        box.setAttribute('data-initialized', 'true');
        box.addEventListener('click', () => {
            if (!luckyItemState[zodiac].opened) {
                openLuckyItemBox(zodiac);
            }
        });
    }
}

function selectLuckyItem(zodiac) {
    const seed = generateDailySeed();
    let zodiacOffset;
    if (zodiac === 'leo') {
        zodiacOffset = 3;
    } else if (zodiac === 'scorpio') {
        zodiacOffset = 11;
    } else {
        // 'my' - 사용자 자신의 운세
        zodiacOffset = 7;
    }
    const itemIndex = (seed + zodiacOffset) % luckyItems.length;
    return luckyItems[itemIndex];
}

async function openLuckyItemBox(zodiac) {
    luckyItemState[zodiac].opened = true;

    const box = document.getElementById(`luckyItemBox-${zodiac}`);
    const item = selectLuckyItem(zodiac);

    // 상자 안 아이콘 미리 설정
    document.getElementById(`luckyItemIcon-${zodiac}`).textContent = item.icon;

    // 상자 열기 애니메이션
    box.classList.add('opened');

    // 토큰 보상 지급 (서버 API - 어뷰징 방지)
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user) {
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/token/lucky-item', {
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

            if (data.success) {
                if (typeof showTokenNotification === 'function') {
                    showTokenNotification(TOKEN_CONFIG.LUCKY_ITEM, '오늘의 행운 아이템');
                }
                if (typeof updateTokenDisplay === 'function') {
                    updateTokenDisplay();
                }
            }
        } catch (error) {
            console.error('행운 아이템 보상 지급 실패:', error);
            // 🔒 보안: 실패 시 사용자에게 알림 (UX 개선)
            if (typeof showToast === 'function') {
                showToast('보상 지급에 실패했습니다. 나중에 다시 시도해주세요.', 'warning');
            }
        }
    }

    // 결과 표시
    setTimeout(() => {
        showLuckyItemResult(zodiac, item);
    }, 800);
}

function showLuckyItemResult(zodiac, item) {
    const resultContainer = document.getElementById(`luckyItemResult-${zodiac}`);

    // 결과 정보 업데이트
    document.getElementById(`luckyItemIconLarge-${zodiac}`).textContent = item.icon;
    document.getElementById(`luckyItemName-${zodiac}`).textContent = item.name;
    document.getElementById(`luckyItemNameEn-${zodiac}`).textContent = item.nameEn;
    document.getElementById(`luckyItemMeaning-${zodiac}`).textContent = item.meaning;
    document.getElementById(`luckyItemAdvice-${zodiac}`).textContent = item.advice;
    document.getElementById(`luckyItemColor-${zodiac}`).textContent = item.luckyColor;
    document.getElementById(`luckyItemNumber-${zodiac}`).textContent = item.luckyNumber;

    // 결과 표시
    resultContainer.style.display = 'block';

    // "내 운세" 섹션이면 돌아가기 버튼 표시
    if (zodiac === 'my') {
        const actionsContainer = document.getElementById('myFortuneActions');
        if (actionsContainer) {
            actionsContainer.style.display = 'flex';
        }
    }

    // 스크롤
    setTimeout(() => {
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function showLuckyItemSection(zodiac) {
    const section = document.getElementById(`luckyItemSection-${zodiac}`);
    section.style.display = 'block';
    setupLuckyItemEvents(zodiac);
}

function resetLuckyItemState(zodiac) {
    luckyItemState[zodiac].opened = false;

    const box = document.getElementById(`luckyItemBox-${zodiac}`);
    const resultContainer = document.getElementById(`luckyItemResult-${zodiac}`);
    const section = document.getElementById(`luckyItemSection-${zodiac}`);

    if (box) box.classList.remove('opened');
    if (resultContainer) resultContainer.style.display = 'none';
    if (section && zodiac !== 'my') section.style.display = 'none';

    // "내 운세" 섹션이면 돌아가기 버튼도 숨김
    if (zodiac === 'my') {
        const actionsContainer = document.getElementById('myFortuneActions');
        if (actionsContainer) {
            actionsContainer.style.display = 'none';
        }
    }
}

// ========================================
// 내 운세 보기 기능
// ========================================

function showMyFortuneSection() {
    hideAllSections();

    const section = document.getElementById('my-fortune');
    section.classList.add('active');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 행운 아이템 상태 리셋 및 이벤트 설정
    resetLuckyItemState('my');
    setupLuckyItemEvents('my');
}

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    const hash = window.location.hash;
    if (hash === '#alonso' || hash === '#leo') {
        setTimeout(() => showDriverOptions('leo'), 100);
    } else if (hash === '#stroll' || hash === '#scorpio') {
        setTimeout(() => showDriverOptions('scorpio'), 100);
    }
});

window.addEventListener('hashchange', function() {
    const hash = window.location.hash;
    if (hash === '#alonso' || hash === '#leo') {
        showDriverOptions('leo');
    } else if (hash === '#stroll' || hash === '#scorpio') {
        showDriverOptions('scorpio');
    }
});

window.addEventListener('beforeunload', function() {
    Object.values(countdownIntervals).forEach(interval => {
        clearInterval(interval);
    });
});
