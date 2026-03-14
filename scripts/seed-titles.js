/**
 * Firestore titles 컬렉션 시드 스크립트 (출석/코인/커뮤니티/특별/히든 칭호 29개)
 * 베팅 칭호(11개)는 seed-betting-titles.js에서 별도 등록됨
 * 사용법: node scripts/seed-titles.js
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
// 칭호 정의 (28개)
// ============================================================

const titles = [

    // ─── 출석/활동 (attendance) ─── 6개 ───

    // 희귀
    {
        id: 'att-rookie',
        name: '루키시즌',
        hint: '7일 출석 달성',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'rare', cssClass: 'title-style-rookie', extraIcon: null }
    },
    {
        id: 'att-ironman',
        name: '아이언맨',
        hint: '30일 연속 출석',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'rare', cssClass: 'title-style-ironman', extraIcon: null }
    },
    {
        id: 'att-regular',
        name: '단골손님',
        hint: '100일 출석 달성',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'rare', cssClass: 'title-style-regular', extraIcon: null }
    },
    {
        id: 'att-remember',
        name: '기억나?',
        hint: '90일 이상 미출석 후 출석',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'rare', cssClass: 'title-style-remember', extraIcon: null }
    },
    // 전설
    {
        id: 'att-home',
        name: 'Home sweet Home',
        hint: '200일 출석 달성',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'legendary', cssClass: 'title-style-home', extraIcon: null }
    },
    {
        id: 'att-resident',
        name: '여기 살아?',
        hint: '300일 출석 달성',
        hidden: false,
        icon: null,
        category: 'attendance',
        style: { rarity: 'legendary', cssClass: 'title-style-resident', extraIcon: null }
    },

    // ─── 코인/경제 (coin) ─── 9개 ───

    // 일반
    {
        id: 'coin-first-earn',
        name: '첫 월급',
        hint: '코인 100 달성',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'normal', cssClass: null, extraIcon: null }
    },
    // 희귀
    {
        id: 'coin-shopaholic',
        name: '쇼핑 중독',
        hint: '상점에서 10번 이상 구매',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'rare', cssClass: 'title-style-shopaholic', extraIcon: null }
    },
    {
        id: 'coin-miser',
        name: '짠돌이',
        hint: '코인을 사용하지 않고 1000코인 모으기',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'rare', cssClass: 'title-style-miser', extraIcon: null }
    },
    {
        id: 'coin-wealthy',
        name: '자산가',
        hint: '코인 5000개 이상 보유',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'rare', cssClass: 'title-style-wealthy', extraIcon: null }
    },
    // 전설
    {
        id: 'coin-bigspender',
        name: '큰손',
        hint: '한 번에 10000코인 이상 사용',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'legendary', cssClass: 'title-style-bigspender', extraIcon: null }
    },
    {
        id: 'coin-mansour',
        name: '만수르',
        hint: '코인 10000개 이상 보유',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'legendary', cssClass: 'title-style-mansour', extraIcon: null }
    },
    {
        id: 'coin-lawrence',
        name: '로렌스의 지갑',
        hint: '50000코인 이상 보유',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'legendary', cssClass: 'title-style-lawrence', extraIcon: null }
    },
    {
        id: 'coin-777',
        name: '777',
        hint: '코인 잔액이 정확히 777',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'legendary', cssClass: 'title-style-777', extraIcon: null }
    },
    {
        id: 'coin-bulk',
        name: '사재기',
        hint: '한 번에 5000코인 이상 지출',
        hidden: false,
        icon: null,
        category: 'coin',
        style: { rarity: 'rare', cssClass: 'title-style-bulk', extraIcon: null }
    },

    // ─── 커뮤니티 (community) ─── 6개 ───

    // 일반
    {
        id: 'comm-first-post',
        name: '첫 마디',
        hint: '첫 게시글을 작성하세요',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'normal', cssClass: null, extraIcon: null }
    },
    // 희귀
    {
        id: 'comm-storyteller',
        name: '이야기꾼',
        hint: '게시글 30개 작성',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'rare', cssClass: 'title-style-storyteller', extraIcon: null }
    },
    {
        id: 'comm-prolific',
        name: '다작러',
        hint: '게시글 100개 작성',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'rare', cssClass: 'title-style-prolific', extraIcon: null }
    },
    {
        id: 'comm-popular',
        name: '인기쟁이',
        hint: '총 좋아요 100개 받기',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'rare', cssClass: 'title-style-popular', extraIcon: null }
    },
    // 전설
    {
        id: 'comm-paddock-og',
        name: '패독 터줏대감',
        hint: '게시글 500개 작성',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'legendary', cssClass: 'title-style-paddock-og', extraIcon: null }
    },
    {
        id: 'comm-influencer',
        name: '인플루언서',
        hint: '총 좋아요 1000개 받기',
        hidden: false,
        icon: null,
        category: 'community',
        style: { rarity: 'legendary', cssClass: 'title-style-influencer', extraIcon: null }
    },

    // ─── 특별 (special) ─── 5개 ───

    {
        id: 'special-og',
        name: 'OG',
        hint: '사이트 런칭일에 가입',
        hidden: false,
        icon: null,
        category: 'special',
        style: { rarity: 'special', cssClass: 'title-style-og', extraIcon: null }
    },
    {
        id: 'special-alpha-better',
        name: '알파 베터',
        hint: '사이트 런칭 이후 최초로 베팅에 참여',
        hidden: false,
        icon: null,
        category: 'special',
        style: { rarity: 'special', cssClass: 'title-style-alpha-better', extraIcon: null }
    },
    {
        id: 'special-earlybird',
        name: '얼리버드',
        hint: '사이트 런칭 이후 최초로 출석 체크',
        hidden: false,
        icon: null,
        category: 'special',
        style: { rarity: 'special', cssClass: 'title-style-earlybird', extraIcon: null }
    },
    {
        id: 'special-founder',
        name: '개국공신',
        hint: '사이트 런칭 이후 최초로 게시글 작성',
        hidden: false,
        icon: null,
        category: 'special',
        style: { rarity: 'special', cssClass: 'title-style-founder', extraIcon: null }
    },

    // ─── 히든 (special 카테고리, hidden: true) ─── 5개 ───

    {
        id: 'hidden-null',
        name: '\u2205',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'special',
        style: { rarity: 'legendary', cssClass: 'title-style-null', extraIcon: null }
    },
    {
        id: 'hidden-adrian',
        name: 'Adrian의 메모',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'special',
        style: { rarity: 'legendary', cssClass: 'title-style-adrian-memo', extraIcon: 'icon-note' }
    },
    {
        id: 'hidden-deleted',
        name: '[삭제된 기록]',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'special',
        style: { rarity: 'rare', cssClass: 'title-style-deleted', extraIcon: null }
    },
    {
        id: 'hidden-last-second',
        name: '마지막 1초',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'special',
        style: { rarity: 'legendary', cssClass: 'title-style-last-second', extraIcon: null }
    },
    {
        id: 'hidden-watching',
        name: '지켜보고 있다',
        hint: '???',
        hidden: true,
        icon: null,
        category: 'special',
        style: { rarity: 'legendary', cssClass: 'title-style-watching', extraIcon: null }
    }
];

// ============================================================
// 삭제 대상 (이전 시드에서 등록되었으나 제거된 칭호)
// ============================================================

const deleteTitleIds = [
    'att-7days',        // 일주일째
    'coin-first-spend', // 첫 소비
    'comm-first-like',  // 첫 하트
    'special-welcome',  // 환영합니다
    'special-profile',  // 자기소개
    'hidden-why',       // 나는 왜 여기있나
    'att-first-checkin', // 첫 출근
    'special-allclear',  // 올클리어
];

// ============================================================
// 시드 실행
// ============================================================

async function main() {
    console.log('========================================');
    console.log('칭호 시드 시작 (베팅 제외)');
    console.log(`총 ${titles.length}개 등록 / ${deleteTitleIds.length}개 삭제 예정`);
    console.log('========================================\n');

    const batch = db.batch();
    const collectionRef = db.collection('titles');

    // 삭제
    for (const id of deleteTitleIds) {
        batch.delete(collectionRef.doc(id));
        console.log(`  [삭제] ${id}`);
    }

    // 등록/업데이트
    for (const title of titles) {
        const docRef = collectionRef.doc(title.id);
        const { id, ...docData } = title;
        batch.set(docRef, {
            ...docData,
            holderCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const rarityTag = title.style.rarity.padEnd(10);
        const hiddenTag = title.hidden ? ' [HIDDEN]' : '';
        console.log(`  [준비] ${rarityTag} ${title.category.padEnd(12)} ${title.id} - ${title.name}${hiddenTag}`);
    }

    console.log('\n배치 쓰기 커밋 중...');

    try {
        await batch.commit();
        console.log(`\n${deleteTitleIds.length}개 삭제 + ${titles.length}개 등록 완료`);
    } catch (error) {
        console.error('\n배치 쓰기 실패:', error.message);
        process.exit(1);
    }

    // 요약 출력
    console.log('\n========================================');
    console.log('카테고리별 요약:');

    const categories = ['attendance', 'coin', 'community', 'special'];
    for (const cat of categories) {
        const catTitles = titles.filter(t => t.category === cat);
        console.log(`  ${cat}: ${catTitles.length}개`);
    }

    console.log('\n등급별 요약:');
    const rarities = ['normal', 'rare', 'legendary', 'special'];
    for (const r of rarities) {
        const count = titles.filter(t => t.style.rarity === r).length;
        if (count > 0) console.log(`  ${r}: ${count}개`);
    }

    const hiddenCount = titles.filter(t => t.hidden).length;
    console.log(`\n히든 칭호: ${hiddenCount}개`);

    console.log('========================================');
    process.exit(0);
}

main();
