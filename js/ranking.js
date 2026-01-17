// ========================================
// Race Prediction Slot Machine
// 2026 시즌 분석 기반 + Firebase Firestore 투표 시스템
// (utils.js 필요)
// ========================================

// 코멘트
const alonsoComments = {
    podium: ["MAGIC ALONSO! 뉴이의 머신과 전설의 조합!", "EL PLAN이 드디어 완성되다!", "44세의 포디움, 역시 살아있는 전설!", "혼다 파워와 알론소의 레이스 크래프트!", "스페인의 자존심이 다시 빛난다!"],
    top6: ["뉴이 머신의 잠재력을 보여주는 결과!", "포인트 잔뜩 챙겼습니다!", "꾸준함이 챔피언십의 비결!", "충분히 만족스러운 레이스!", "다음 레이스엔 포디움을!"],
    midfield: ["오늘은 차 세팅이 아쉬웠어요...", "전략이 아쉬웠지만 괜찮아요", "다음 레이스에서 만회합시다!", "Still we rise!", "새 머신 적응 중입니다!"],
    low: ["GP2 엔진이 돌아왔나... 아, 이제 혼다지!", "오늘은 운이 없었네요", "이건 레이싱이 아니야!", "다음에는 꼭 더 좋은 결과를!", "뉴이 업데이트가 필요해!"]
};

const strollComments = {
    podium: ["터키 GP의 영웅 재림!", "스트롤이 뉴이 머신으로 증명했다!", "누가 스트롤을 무시하나요?!", "드디어 잠재력이 폭발하다!", "캐나다의 자랑!"],
    top6: ["스트롤, 오늘 뉴이 머신과 찰떡궁합!", "팀에 좋은 포인트를 안겼습니다!", "점점 좋아지고 있어요!", "다음엔 포디움!", "아버지도 기뻐하실 결과!"],
    midfield: ["My tyres feel... okay today", "그럭저럭 괜찮은 레이스였어요", "페이스는 있었는데 운이 없었네요", "다음 레이스 기대해주세요!", "새 머신에 적응 중!"],
    low: ["MY MEDIUMS FEEL LIKE 100 LAPS OLD!", "오늘은 정말 힘들었어요...", "타이어가 죽었어요!", "다음엔 더 잘할게요...", "뉴이 업데이트 기다리는 중!"]
};

const teamSummaries = {
    doublePodium: ["애스턴마틴 역사상 최고의 레이스! 뉴이+혼다의 더블 포디움!", "그린 팀이 오늘 서킷을 지배했습니다!", "실버스톤에서 샴페인 파티가 벌어지겠네요!"],
    onePodium: ["포디움 하나 확보! 뉴이 머신의 잠재력!", "팀에게 좋은 결과입니다. 다음엔 더블 포디움!", "샴페인 스프레이 준비!"],
    bothPoints: ["두 드라이버 모두 포인트 획득! 좋은 팀워크!", "컨스트럭터 순위에 도움이 되는 레이스!", "꾸준함이 승리의 비결입니다!"],
    onePoints: ["한 명이라도 포인트를 챙겼네요!", "아쉽지만 다음 레이스를 기대해봅시다!", "긍정적으로 생각합시다!"],
    noPoints: ["오늘은 힘든 레이스였습니다...", "다음 레이스에서 반격합시다!", "이런 날도 있는 거죠..."]
};

// 상태 변수
let isSpinning = false;
let alonsoPosition = 0;
let strollPosition = 0;
let currentRaceId = null;
let unsubscribeAlonso = null;
let unsubscribeStroll = null;

// ========================================
// 레이스 관련 함수
// ========================================

function getCurrentRaceId() {
    const { race, index } = getNextRace();
    const raceDate = new Date(race.date);
    return `race_${index + 1}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;
}

function updateNextRaceInfo() {
    const { race } = getNextRace();
    document.getElementById('nextRaceName').textContent = race.name;
    document.getElementById('nextRaceCircuit').textContent = race.circuit;
    currentRaceId = getCurrentRaceId();
}

// ========================================
// 난수 및 순위 생성
// ========================================

function generatePosition(driver, seed) {
    const random = seededRandom(seed);
    if (driver === 'alonso') {
        if (random < 0.15) return Math.floor(seededRandom(seed * 2) * 3) + 1;
        if (random < 0.45) return Math.floor(seededRandom(seed * 3) * 3) + 4;
        if (random < 0.75) return Math.floor(seededRandom(seed * 4) * 4) + 7;
        if (random < 0.93) return Math.floor(seededRandom(seed * 5) * 5) + 11;
        return Math.floor(seededRandom(seed * 6) * 7) + 16;
    } else {
        if (random < 0.08) return Math.floor(seededRandom(seed * 2) * 3) + 1;
        if (random < 0.28) return Math.floor(seededRandom(seed * 3) * 3) + 4;
        if (random < 0.63) return Math.floor(seededRandom(seed * 4) * 4) + 7;
        if (random < 0.90) return Math.floor(seededRandom(seed * 5) * 5) + 11;
        return Math.floor(seededRandom(seed * 6) * 7) + 16;
    }
}

function getComment(driver, position) {
    const comments = driver === 'alonso' ? alonsoComments : strollComments;
    const seed = generateDailySeed() + position;
    let category;
    if (position <= 3) category = comments.podium;
    else if (position <= 6) category = comments.top6;
    else if (position <= 10) category = comments.midfield;
    else category = comments.low;
    return category[Math.floor(seededRandom(seed) * category.length)];
}

function getTeamSummary(alonsoPos, strollPos) {
    const seed = generateDailySeed();
    let category;
    if (alonsoPos <= 3 && strollPos <= 3) category = teamSummaries.doublePodium;
    else if (alonsoPos <= 3 || strollPos <= 3) category = teamSummaries.onePodium;
    else if (alonsoPos <= 10 && strollPos <= 10) category = teamSummaries.bothPoints;
    else if (alonsoPos <= 10 || strollPos <= 10) category = teamSummaries.onePoints;
    else category = teamSummaries.noPoints;
    return category[Math.floor(seededRandom(seed * 7) * category.length)];
}

// ========================================
// 슬롯머신 애니메이션
// ========================================

function startSpin() {
    if (isSpinning) return;
    isSpinning = true;

    const spinButton = document.getElementById('spinButton');
    spinButton.disabled = true;
    spinButton.classList.add('spinning');

    document.getElementById('resultSection').classList.remove('show');
    document.getElementById('alonsoSlot').classList.add('spinning');
    document.getElementById('strollSlot').classList.add('spinning');
    document.getElementById('alonsoSlot').classList.remove('podium');
    document.getElementById('strollSlot').classList.remove('podium');
    document.getElementById('alonsoPosition').textContent = '';
    document.getElementById('strollPosition').textContent = '';

    const baseSeed = generateDailySeed();
    alonsoPosition = generatePosition('alonso', baseSeed);
    strollPosition = generatePosition('stroll', baseSeed + 1000);

    if (alonsoPosition === strollPosition) {
        strollPosition = strollPosition < 22 ? strollPosition + 1 : strollPosition - 1;
    }

    spinReel('alonsoReel', alonsoPosition, 2000, () => {
        document.getElementById('alonsoSlot').classList.remove('spinning');
        if (alonsoPosition <= 3) document.getElementById('alonsoSlot').classList.add('podium');
        document.getElementById('alonsoPosition').textContent = `P${alonsoPosition}`;
    });

    spinReel('strollReel', strollPosition, 2800, () => {
        document.getElementById('strollSlot').classList.remove('spinning');
        if (strollPosition <= 3) document.getElementById('strollSlot').classList.add('podium');
        document.getElementById('strollPosition').textContent = `P${strollPosition}`;
        setTimeout(() => showResults(), 500);
    });
}

function spinReel(reelId, finalPosition, duration, callback) {
    const reel = document.getElementById(reelId);
    const startTime = Date.now();
    let currentSpin = 0;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);

        if (progress < 1) {
            const spinSpeed = Math.max(50, 200 * (1 - easeOut));
            if (elapsed - currentSpin * spinSpeed > spinSpeed) {
                currentSpin++;
                reel.innerHTML = `<div class="slot-number">${Math.floor(Math.random() * 22) + 1}</div>`;
            }
            requestAnimationFrame(animate);
        } else {
            reel.innerHTML = `<div class="slot-number">${finalPosition}</div>`;
            callback();
        }
    }
    animate();
}

function showResults() {
    document.getElementById('alonsoFinalPosition').textContent = `P${alonsoPosition}`;
    document.getElementById('alonsoComment').textContent = getComment('alonso', alonsoPosition);
    document.getElementById('strollFinalPosition').textContent = `P${strollPosition}`;
    document.getElementById('strollComment').textContent = getComment('stroll', strollPosition);

    const alonsoCard = document.getElementById('alonsoResult');
    const strollCard = document.getElementById('strollResult');
    alonsoCard.classList.toggle('podium', alonsoPosition <= 3);
    strollCard.classList.toggle('podium', strollPosition <= 3);

    document.getElementById('teamSummaryText').textContent = getTeamSummary(alonsoPosition, strollPosition);
    document.getElementById('alonsoVotePredicted').textContent = `P${alonsoPosition}`;
    document.getElementById('strollVotePredicted').textContent = `P${strollPosition}`;

    loadVotes();
    document.getElementById('resultSection').classList.add('show');

    if (alonsoPosition <= 3 || strollPosition <= 3) launchConfetti();

    // 스핀 완료 후 버튼 숨기기, 안내 메시지 표시 및 오늘 스핀 완료 저장
    document.getElementById('spinButton').style.display = 'none';
    document.getElementById('alreadySpunMessage').classList.add('show');
    localStorage.setItem('amf1_last_spin_date', generateDailySeed().toString());
    isSpinning = false;
}

function resetSlots() {
    document.getElementById('resultSection').classList.remove('show');
    document.getElementById('alonsoReel').innerHTML = '<div class="slot-number">?</div>';
    document.getElementById('strollReel').innerHTML = '<div class="slot-number">?</div>';
    document.getElementById('alonsoPosition').textContent = '';
    document.getElementById('strollPosition').textContent = '';
    document.getElementById('alonsoSlot').classList.remove('podium', 'spinning');
    document.getElementById('strollSlot').classList.remove('podium', 'spinning');
    resetVoteButtons();
    document.querySelector('.slot-machine-section').scrollIntoView({ behavior: 'smooth' });
}

// ========================================
// Firebase Firestore 투표 시스템
// ========================================

// 사용자 ID 초기화
var userId = localStorage.getItem('amf1_user_id');
if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('amf1_user_id', userId);
}

function getUserId() {
    return userId;
}

function canUseFirebase() {
    return typeof isFirebaseConnected === 'function' && isFirebaseConnected();
}

function castVote(driver, voteType) {
    if (canUseFirebase()) {
        castVoteFirestore(driver, voteType);
    } else {
        castVoteLocal(driver, voteType);
    }

    updateVoteButtons(driver, voteType);
    localStorage.setItem(`vote_${currentRaceId}_${driver}`, voteType);

    const voteLabels = { higher: '더 높을 것', correct: '딱 맞을 것', lower: '더 낮을 것' };
    document.getElementById(`${driver}VoteStatus`).textContent = `"${voteLabels[voteType]}"에 투표하셨습니다!`;
}

async function castVoteFirestore(driver, voteType) {
    const oderId = getUserId();
    const voteDocRef = db.collection('votes').doc(currentRaceId);
    const userVoteDocRef = db.collection('userVotes').doc(`${currentRaceId}_${oderId}_${driver}`);

    try {
        // 이전 투표 확인
        const userVoteDoc = await userVoteDocRef.get();
        const previousVote = userVoteDoc.exists ? userVoteDoc.data().vote : null;

        // 배치 쓰기로 원자적 업데이트
        const batch = db.batch();

        // 이전 투표 감소
        if (previousVote) {
            batch.update(voteDocRef, {
                [`${driver}.${previousVote}`]: firebase.firestore.FieldValue.increment(-1)
            });
        }

        // 새 투표 증가
        batch.set(voteDocRef, {
            [driver]: {
                [voteType]: firebase.firestore.FieldValue.increment(1)
            }
        }, { merge: true });

        // 사용자 투표 기록
        batch.set(userVoteDocRef, { vote: voteType });

        await batch.commit();
    } catch (error) {
        console.error('투표 저장 실패:', error);
        // 폴백으로 로컬 저장
        castVoteLocal(driver, voteType);
    }
}

function castVoteLocal(driver, voteType) {
    const storageKey = `amf1_votes_${currentRaceId}`;
    let votes = JSON.parse(localStorage.getItem(storageKey) || '{}');

    if (!votes[driver]) votes[driver] = { higher: 0, correct: 0, lower: 0 };

    const prevVoteKey = `vote_${currentRaceId}_${driver}`;
    const previousVote = localStorage.getItem(prevVoteKey);

    if (previousVote && votes[driver][previousVote] > 0) {
        votes[driver][previousVote]--;
    }

    votes[driver][voteType]++;
    localStorage.setItem(storageKey, JSON.stringify(votes));
    updateVoteUI(driver, votes[driver]);
}

function loadVotes() {
    if (canUseFirebase()) {
        loadVotesFirestore();
    } else {
        loadVotesLocal();
    }

    // 이전 투표 상태 복원
    ['alonso', 'stroll'].forEach(driver => {
        const prevVote = localStorage.getItem(`vote_${currentRaceId}_${driver}`);
        if (prevVote) {
            updateVoteButtons(driver, prevVote);
            const voteLabels = { higher: '더 높을 것', correct: '딱 맞을 것', lower: '더 낮을 것' };
            document.getElementById(`${driver}VoteStatus`).textContent = `"${voteLabels[prevVote]}"에 투표하셨습니다!`;
        }
    });
}

function loadVotesFirestore() {
    const voteDocRef = db.collection('votes').doc(currentRaceId);

    // 이전 리스너 해제
    if (unsubscribeAlonso) unsubscribeAlonso();
    if (unsubscribeStroll) unsubscribeStroll();

    // 실시간 리스너 설정
    const unsubscribe = voteDocRef.onSnapshot(doc => {
        const data = doc.data() || {};

        const alonsoVotes = data.alonso || { higher: 0, correct: 0, lower: 0 };
        const strollVotes = data.stroll || { higher: 0, correct: 0, lower: 0 };

        updateVoteUI('alonso', alonsoVotes);
        updateVoteUI('stroll', strollVotes);
    }, error => {
        console.error('실시간 데이터 로드 실패:', error);
        loadVotesLocal();
    });

    // 나중에 정리할 수 있도록 저장
    unsubscribeAlonso = unsubscribe;
}

function loadVotesLocal() {
    const storageKey = `amf1_votes_${currentRaceId}`;
    const votes = JSON.parse(localStorage.getItem(storageKey) || '{}');

    ['alonso', 'stroll'].forEach(driver => {
        updateVoteUI(driver, votes[driver] || { higher: 0, correct: 0, lower: 0 });
    });
}

function updateVoteUI(driver, votes) {
    const higher = votes.higher || 0;
    const correct = votes.correct || 0;
    const lower = votes.lower || 0;
    const total = higher + correct + lower;

    if (total === 0) {
        document.getElementById(`${driver}HigherBar`).style.width = '0%';
        document.getElementById(`${driver}CorrectBar`).style.width = '0%';
        document.getElementById(`${driver}LowerBar`).style.width = '0%';
        document.getElementById(`${driver}HigherPct`).textContent = '0';
        document.getElementById(`${driver}CorrectPct`).textContent = '0';
        document.getElementById(`${driver}LowerPct`).textContent = '0';
        document.getElementById(`${driver}TotalVotes`).textContent = '0';
        return;
    }

    const higherPct = Math.round((higher / total) * 100);
    const correctPct = Math.round((correct / total) * 100);
    const lowerPct = Math.round((lower / total) * 100);

    document.getElementById(`${driver}HigherBar`).style.width = `${higherPct}%`;
    document.getElementById(`${driver}CorrectBar`).style.width = `${correctPct}%`;
    document.getElementById(`${driver}LowerBar`).style.width = `${lowerPct}%`;
    document.getElementById(`${driver}HigherPct`).textContent = higherPct;
    document.getElementById(`${driver}CorrectPct`).textContent = correctPct;
    document.getElementById(`${driver}LowerPct`).textContent = lowerPct;
    document.getElementById(`${driver}TotalVotes`).textContent = total;
}

function updateVoteButtons(driver, selectedVote) {
    const card = document.getElementById(`${driver}VoteCard`);
    card.querySelectorAll('.vote-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.classList.contains(selectedVote));
    });
}

function resetVoteButtons() {
    document.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('alonsoVoteStatus').textContent = '';
    document.getElementById('strollVoteStatus').textContent = '';
}

// ========================================
// Confetti 효과
// ========================================

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#c4ff00', '#006f62', '#00897b', '#ffd700', '#ff6b6b', '#4ecdc4'];
    const confetti = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 4 - 2,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 10 - 5
    }));

    const startTime = Date.now();
    let animationFrame;

    function animate() {
        if (Date.now() - startTime > 4000) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(animationFrame);
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confetti.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;
            if (p.y > canvas.height) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });
        animationFrame = requestAnimationFrame(animate);
    }
    animate();
}

// ========================================
// 하루 한 번 스핀 체크
// ========================================

function hasSpunToday() {
    const lastSpinDate = localStorage.getItem('amf1_last_spin_date');
    const todaySeed = generateDailySeed().toString();
    return lastSpinDate === todaySeed;
}

function showResultsInstantly() {
    const baseSeed = generateDailySeed();
    alonsoPosition = generatePosition('alonso', baseSeed);
    strollPosition = generatePosition('stroll', baseSeed + 1000);

    if (alonsoPosition === strollPosition) {
        strollPosition = strollPosition < 22 ? strollPosition + 1 : strollPosition - 1;
    }

    // 슬롯에 결과 표시
    document.getElementById('alonsoReel').innerHTML = `<div class="slot-number">${alonsoPosition}</div>`;
    document.getElementById('strollReel').innerHTML = `<div class="slot-number">${strollPosition}</div>`;
    document.getElementById('alonsoPosition').textContent = `P${alonsoPosition}`;
    document.getElementById('strollPosition').textContent = `P${strollPosition}`;

    if (alonsoPosition <= 3) document.getElementById('alonsoSlot').classList.add('podium');
    if (strollPosition <= 3) document.getElementById('strollSlot').classList.add('podium');

    // 결과 섹션 표시
    document.getElementById('alonsoFinalPosition').textContent = `P${alonsoPosition}`;
    document.getElementById('alonsoComment').textContent = getComment('alonso', alonsoPosition);
    document.getElementById('strollFinalPosition').textContent = `P${strollPosition}`;
    document.getElementById('strollComment').textContent = getComment('stroll', strollPosition);

    const alonsoCard = document.getElementById('alonsoResult');
    const strollCard = document.getElementById('strollResult');
    alonsoCard.classList.toggle('podium', alonsoPosition <= 3);
    strollCard.classList.toggle('podium', strollPosition <= 3);

    document.getElementById('teamSummaryText').textContent = getTeamSummary(alonsoPosition, strollPosition);
    document.getElementById('alonsoVotePredicted').textContent = `P${alonsoPosition}`;
    document.getElementById('strollVotePredicted').textContent = `P${strollPosition}`;

    loadVotes();
    document.getElementById('resultSection').classList.add('show');

    // 스핀 버튼 숨기기 및 안내 메시지 표시
    document.getElementById('spinButton').style.display = 'none';
    document.getElementById('alreadySpunMessage').classList.add('show');
}

// ========================================
// 공유하기 기능
// ========================================

function sharePrediction() {
    const { race } = getNextRace();
    const today = new Date();
    const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    const shareText = `🏎️ ${race.name} 순위 예측!\n\n` +
        `🇪🇸 알론소: P${alonsoPosition}\n` +
        `🇨🇦 스트롤: P${strollPosition}\n\n` +
        `📅 ${dateStr} 예측\n` +
        `나도 예측해보기 👉`;

    const shareUrl = window.location.href;

    // Web Share API 지원 확인
    if (navigator.share) {
        navigator.share({
            title: 'Aston Martin F1 순위 예측',
            text: shareText,
            url: shareUrl
        }).then(() => {
            document.getElementById('shareStatus').textContent = '공유 완료!';
        }).catch((error) => {
            if (error.name !== 'AbortError') {
                copyToClipboard(shareText + ' ' + shareUrl);
            }
        });
    } else {
        // Web Share API 미지원시 클립보드 복사
        copyToClipboard(shareText + ' ' + shareUrl);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        document.getElementById('shareStatus').textContent = '클립보드에 복사되었습니다!';
        setTimeout(() => {
            document.getElementById('shareStatus').textContent = '';
        }, 3000);
    }).catch(() => {
        // 폴백: textarea 사용
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        document.getElementById('shareStatus').textContent = '클립보드에 복사되었습니다!';
        setTimeout(() => {
            document.getElementById('shareStatus').textContent = '';
        }, 3000);
    });
}

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    updateNextRaceInfo();

    if (hasSpunToday()) {
        // 이미 오늘 스핀했으면 결과 바로 표시
        showResultsInstantly();
    } else {
        // 아직 스핀 안 했으면 초기 상태
        document.getElementById('alonsoReel').innerHTML = '<div class="slot-number">?</div>';
        document.getElementById('strollReel').innerHTML = '<div class="slot-number">?</div>';
    }

    setTimeout(() => {
        if (canUseFirebase()) {
            console.log('Firebase Firestore 모드 - 실시간 투표 공유 활성화');
        } else {
            console.log('로컬 모드 - Firebase 설정을 확인하세요');
        }
    }, 1000);
});

window.addEventListener('resize', () => {
    const canvas = document.getElementById('confettiCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
