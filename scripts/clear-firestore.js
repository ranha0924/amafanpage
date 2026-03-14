/**
 * Firestore 테스트 데이터 전체 삭제 스크립트
 * 사용법: node scripts/clear-firestore.js
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

// 삭제할 컬렉션 목록 (races는 서버 시작 시 자동 재생성되므로 제외)
const COLLECTIONS = [
    'users',
    'attendance',
    'tokenHistory',
    'posts',
    'likes',
    'headToHeadBets',
    'podiumBets',
    // 'races',  // ⚠️ 삭제 금지: 서버 RACE_SCHEDULE에서 자동 생성되는 레이스 일정
    'settlementHistory',
    'userBettingStats',
    'leaderboards',
    'leaderboardSnapshots',
    'hallOfFame'
];

async function deleteCollection(collectionName) {
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();

    if (snapshot.empty) {
        console.log(`  ${collectionName}: 비어있음 (스킵)`);
        return 0;
    }

    const batchSize = 500;
    let deleted = 0;

    // Firestore batch는 최대 500개씩 처리
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += chunk.length;
    }

    console.log(`  ${collectionName}: ${deleted}개 문서 삭제`);
    return deleted;
}

async function main() {
    console.log('========================================');
    console.log('Firestore 테스트 데이터 전체 삭제');
    console.log('========================================\n');

    let totalDeleted = 0;

    for (const collection of COLLECTIONS) {
        try {
            const count = await deleteCollection(collection);
            totalDeleted += count;
        } catch (error) {
            console.error(`  ${collection}: 삭제 실패 - ${error.message}`);
        }
    }

    console.log(`\n총 ${totalDeleted}개 문서 삭제 완료`);
    console.log('========================================');
    process.exit(0);
}

main();
