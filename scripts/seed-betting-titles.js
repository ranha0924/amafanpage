/**
 * Firestore titles 컬렉션 시드 스크립트 (베팅 칭호 12개)
 * 사용법: node scripts/seed-betting-titles.js
 */
require('dotenv').config();
const admin = require('firebase-admin');

// Firebase 초기화
let serviceAccount = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
}

if (!serviceAccount) {
    console.error('Firebase 서비스 계정이 설정되지 않았습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================================
// 베팅 칭호 11개 정의
// ============================================================

const bettingTitles = [
    {
        id: 'bet-first',
        name: '첫 발',
        hint: '첫 베팅에 참여하세요',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'normal', cssClass: null, extraIcon: null },
        progressType: 'betting_total_bets',
        progressTarget: 1
    },
    {
        id: 'bet-5wins',
        name: '눈썰미',
        hint: '베팅 5회 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'normal', cssClass: null, extraIcon: null },
        progressType: 'betting_total_wins',
        progressTarget: 5
    },
    {
        id: 'bet-first-loss',
        name: '이것도 경험',
        hint: '첫 베팅 실패를 경험하세요',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'normal', cssClass: null, extraIcon: null },
        progressType: 'betting_total_losses',
        progressTarget: 1
    },
    {
        id: 'bet-10wins',
        name: '감이 좋은',
        hint: '베팅 10회 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'normal', cssClass: null, extraIcon: null },
        progressType: 'betting_total_wins',
        progressTarget: 10
    },
    {
        id: 'bet-30wins',
        name: '족집게',
        hint: '베팅 30회 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-chalkboard', extraIcon: null },
        progressType: 'betting_total_wins',
        progressTarget: 30
    },
    {
        id: 'bet-50wins',
        name: '선견지명',
        hint: '베팅 50회 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-gold', extraIcon: null },
        progressType: 'betting_total_wins',
        progressTarget: 50
    },
    {
        id: 'bet-100wins',
        name: '예언자',
        hint: '베팅 100회 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-prophet', extraIcon: null },
        progressType: 'betting_total_wins',
        progressTarget: 100
    },
    {
        id: 'bet-10streak',
        name: '연승머신',
        hint: '베팅 10연속 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-streak', extraIcon: null },
        progressType: 'betting_max_win_streak',
        progressTarget: 10
    },
    {
        id: 'bet-5loss-streak',
        name: 'DNF',
        hint: '베팅 5연속 실패',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-dnf', extraIcon: null },
        progressType: 'betting_max_lose_streak',
        progressTarget: 5
    },
    {
        id: 'bet-perfect-week',
        name: '퍼펙트 위크',
        hint: '한 주간 모든 베팅 적중',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-perfect', extraIcon: null }
    },
    {
        id: 'bet-1000total',
        name: '살아있는 전설',
        hint: '총 베팅 1000회 참여',
        hidden: false,
        icon: null,
        category: 'betting',
        style: { rarity: 'special', cssClass: 'title-style-legend', extraIcon: null },
        progressType: 'betting_total_bets',
        progressTarget: 1000
    },
    {
        id: 'bet-not-a-bug',
        name: '버그 아닙니다',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'betting',
        style: { rarity: 'legendary', cssClass: 'title-style-not-a-bug', extraIcon: null }
    }
];

// ============================================================
// 시드 실행
// ============================================================

async function main() {
    console.log('========================================');
    console.log('베팅 칭호 시드 시작');
    console.log(`총 ${bettingTitles.length}개 칭호 등록 예정`);
    console.log('========================================\n');

    const batch = db.batch();
    const collectionRef = db.collection('titles');

    for (const title of bettingTitles) {
        const docRef = collectionRef.doc(title.id);
        const { id, ...docData } = title;
        batch.set(docRef, {
            ...docData,
            holderCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`  [준비] ${title.id} - ${title.name} (${title.style.rarity})`);
    }

    console.log('\n배치 쓰기 커밋 중...');

    try {
        await batch.commit();
        console.log(`\n${bettingTitles.length}개 베팅 칭호 등록 완료`);
    } catch (error) {
        console.error('\n배치 쓰기 실패:', error.message);
        process.exit(1);
    }

    console.log('========================================');
    console.log('등급별 요약:');

    const normalCount = bettingTitles.filter(t => t.style.rarity === 'normal').length;
    const specialCount = bettingTitles.filter(t => t.style.rarity === 'special').length;
    console.log(`  normal: ${normalCount}개`);
    console.log(`  special: ${specialCount}개`);

    console.log('========================================');
    process.exit(0);
}

main();
