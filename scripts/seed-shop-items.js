/**
 * Firestore shopItems 컬렉션 시드 스크립트
 * 119개 상점 아이템을 일괄 등록합니다. (기존 49 + F1 팀 컬렉션 70)
 * 사용법: node scripts/seed-shop-items.js
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
// 119개 상점 아이템 정의 (기존 49 + F1 팀 컬렉션 70)
// ============================================================

const shopItems = [
    // ── BORDERS (category: 'profile-border', previewType: 'border') ── 12 items
    {
        id: 'border-silver',
        name: '실버 테두리',
        category: 'profile-border',
        rarity: 'common',
        price: 100,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '깔끔한 실버 테두리',
        sortOrder: 1,
        effectData: { cssClass: 'border-silver', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-silver', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-gold',
        name: '골드 테두리',
        category: 'profile-border',
        rarity: 'rare',
        price: 150,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '빛나는 골드 테두리',
        sortOrder: 2,
        effectData: { cssClass: 'border-gold', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-gold', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-amr-green',
        name: 'AMR 그린 테두리',
        category: 'profile-border',
        rarity: 'rare',
        price: 200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '아스톤 마틴 브랜드 그린 테두리',
        sortOrder: 3,
        effectData: { cssClass: 'border-amr-green', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-amr-green', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-lime-glow',
        name: '라임글로우 테두리',
        category: 'profile-border',
        rarity: 'epic',
        price: 300,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '라임 색상 발광 효과 테두리',
        sortOrder: 4,
        effectData: { cssClass: 'border-lime-glow', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-lime-glow', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-sector-purple',
        name: '섹터 퍼플 테두리',
        category: 'profile-border',
        rarity: 'epic',
        price: 500,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '패스티스트 섹터 보라색 테두리',
        sortOrder: 5,
        effectData: { cssClass: 'border-sector-purple', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-sector-purple', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-checkered',
        name: '체커드 플래그',
        category: 'profile-border',
        rarity: 'epic',
        price: 600,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '회전하는 체커드 플래그 테두리',
        sortOrder: 8,
        effectData: { cssClass: 'border-checkered', svgIcon: null, animation: 'rotate-border' },
        previewData: { cssClass: 'border-checkered', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-champion',
        name: '챔피언 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '금빛 챔피언 회전 테두리',
        sortOrder: 9,
        effectData: { cssClass: 'border-champion', svgIcon: null, animation: 'rotate-border' },
        previewData: { cssClass: 'border-champion', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-season-2026',
        name: '시즌한정 2026',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1500,
        isActive: true,
        type: 'limited',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: 'season-2026',
        description: '2026 시즌 한정 AMR 그린-라임 회전 테두리',
        sortOrder: 11,
        effectData: { cssClass: 'border-season-2026', svgIcon: null, animation: 'rotate-border' },
        previewData: { cssClass: 'border-season-2026', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-podium',
        name: '포디움 테두리',
        category: 'profile-border',
        rarity: 'epic',
        price: 300,
        isActive: false,
        type: 'limited',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: 'podium-event',
        description: 'AMR 포디움 달성 시 72시간 한정 판매',
        sortOrder: 12,
        effectData: { cssClass: 'border-podium', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-podium', svgIcon: null, previewType: 'border' }
    },

    // ── NEW BORDERS ── 2 items
    {
        id: 'border-night-race',
        name: '나이트레이스 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '야간 서킷의 조명이 감도는 프리미엄 테두리',
        sortOrder: 13,
        effectData: { cssClass: 'border-night-race', svgIcon: null, animation: 'rotate-border' },
        previewData: { cssClass: 'border-night-race', svgIcon: null, previewType: 'border' }
    },

    // ── GLOW + TIRE + HEADSET BORDERS ── 8 items
    {
        id: 'border-tire-soft',
        name: '소프트 타이어 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '빨간 컴파운드 링 + 질주 펄스 애니메이션',
        sortOrder: 19,
        effectData: { cssClass: 'border-tire-soft', svgIcon: 'tire-soft.png', animation: null },
        previewData: { cssClass: 'border-tire-soft', svgIcon: 'tire-soft.png', previewType: 'border' }
    },
    {
        id: 'border-tire-medium',
        name: '미디엄 타이어 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '노란 컴파운드 링 타이어 테두리',
        sortOrder: 20,
        effectData: { cssClass: 'border-tire-medium', svgIcon: 'tire-medium.png', animation: null },
        previewData: { cssClass: 'border-tire-medium', svgIcon: 'tire-medium.png', previewType: 'border' }
    },
    {
        id: 'border-tire-hard',
        name: '하드 타이어 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '흰색 컴파운드 링 타이어 테두리',
        sortOrder: 21,
        effectData: { cssClass: 'border-tire-hard', svgIcon: 'tire-hard.png', animation: null },
        previewData: { cssClass: 'border-tire-hard', svgIcon: 'tire-hard.png', previewType: 'border' }
    },
    {
        id: 'border-tire-inter',
        name: '인터미디엇 타이어 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '녹색 컴파운드 링 + 빗방울 애니메이션',
        sortOrder: 22,
        effectData: { cssClass: 'border-tire-inter', svgIcon: 'tire-inter.png', animation: null },
        previewData: { cssClass: 'border-tire-inter', svgIcon: 'tire-inter.png', previewType: 'border' }
    },
    {
        id: 'border-tire-wet',
        name: '웻 타이어 테두리',
        category: 'profile-border',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '파란 컴파운드 링 + 비 쏟아지는 애니메이션',
        sortOrder: 23,
        effectData: { cssClass: 'border-tire-wet', svgIcon: 'tire-wet.png', animation: null },
        previewData: { cssClass: 'border-tire-wet', svgIcon: 'tire-wet.png', previewType: 'border' }
    },
    // ── BADGES (category: 'badge', previewType: 'badge') ── 5 items
    {
        id: 'badge-amr-fan',
        name: 'AMR 팬뱃지',
        category: 'badge',
        rarity: 'rare',
        price: 100,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '아스톤 마틴의 진정한 팬',
        sortOrder: 2,
        effectData: { cssClass: '', svgIcon: 'badge-amr-fan.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-amr-fan.svg', previewType: 'badge' }
    },
    {
        id: 'badge-alonso',
        name: '알론소 팬뱃지 (14)',
        category: 'badge',
        rarity: 'epic',
        price: 200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: 'El Plan - 알론소 팬의 증표',
        sortOrder: 3,
        effectData: { cssClass: '', svgIcon: 'badge-alonso.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-alonso.svg', previewType: 'badge' }
    },
    {
        id: 'badge-stroll',
        name: '스트롤 팬뱃지 (18)',
        category: 'badge',
        rarity: 'epic',
        price: 200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '스트롤 팬의 증표',
        sortOrder: 4,
        effectData: { cssClass: '', svgIcon: 'badge-stroll.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-stroll.svg', previewType: 'badge' }
    },
    {
        id: 'badge-og',
        name: 'OG 팬 뱃지',
        category: 'badge',
        rarity: 'legendary',
        price: 0,
        isActive: true,
        type: 'limited',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: 'early-adopter',
        description: '사이트 오픈 2주 내 가입한 OG 팬 전용',
        sortOrder: 6,
        effectData: { cssClass: '', svgIcon: 'badge-og.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-og.svg', previewType: 'badge' }
    },

    // ── NICKNAME COLORS (category: 'nickname-color', previewType: 'color') ── 10 items
    {
        id: 'color-silver',
        name: '실버',
        category: 'nickname-color',
        rarity: 'common',
        price: 100,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '실버 닉네임 컬러',
        sortOrder: 1,
        effectData: { cssClass: 'color-silver', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-silver', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-amr-green',
        name: 'AMR 그린',
        category: 'nickname-color',
        rarity: 'rare',
        price: 150,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '아스톤 마틴 그린 닉네임',
        sortOrder: 2,
        effectData: { cssClass: 'color-amr-green', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-amr-green', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-lime',
        name: '라임',
        category: 'nickname-color',
        rarity: 'rare',
        price: 200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '라임 닉네임 컬러',
        sortOrder: 3,
        effectData: { cssClass: 'color-lime', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-lime', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-gold',
        name: '골드',
        category: 'nickname-color',
        rarity: 'rare',
        price: 200,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '골드 닉네임 컬러',
        sortOrder: 4,
        effectData: { cssClass: 'color-gold', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-gold', svgIcon: null, previewType: 'color' }
    },
    // color-renault-yellow, color-renault-blue 삭제됨 (CSS는 cosmetics.css에 유지)
    {
        id: 'color-sector-purple',
        name: '섹터 퍼플',
        category: 'nickname-color',
        rarity: 'epic',
        price: 400,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '패스티스트 섹터 보라색 닉네임',
        sortOrder: 8,
        effectData: { cssClass: 'color-sector-purple', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-sector-purple', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-neon',
        name: '네온 글로우',
        category: 'nickname-color',
        rarity: 'legendary',
        price: 1000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '발광하는 네온 그린 닉네임',
        sortOrder: 9,
        effectData: { cssClass: 'color-neon', svgIcon: null, animation: 'neon-pulse' },
        previewData: { cssClass: 'color-neon', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-rainbow',
        name: '레인보우 그라데이션',
        category: 'nickname-color',
        rarity: 'legendary',
        price: 5000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '무지개 그라데이션 애니메이션 닉네임',
        sortOrder: 10,
        effectData: { cssClass: 'color-rainbow', svgIcon: null, animation: 'rainbow-text' },
        previewData: { cssClass: 'color-rainbow', svgIcon: null, previewType: 'color' }
    },

    // ── NEW NICKNAME COLORS ── 3 items

    // ── POST DECO (category: 'post-deco', previewType: 'deco') ── 8 items
    {
        id: 'deco-highlight',
        name: '1회용 하이라이트',
        category: 'post-deco',
        rarity: 'common',
        price: 50,
        isActive: true,
        type: 'consumable',
        durationType: '1-use',
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '게시글 1개를 하이라이트 표시',
        sortOrder: 1,
        effectData: { cssClass: 'deco-highlight', svgIcon: null, animation: null, action: 'highlight' },
        previewData: { cssClass: 'deco-highlight', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-amr-green-bg',
        name: 'AMR 그린 글 배경',
        category: 'post-deco',
        rarity: 'rare',
        price: 250,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '게시글에 AMR 그린 배경 적용',
        sortOrder: 2,
        effectData: { cssClass: 'deco-amr-green-bg', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-amr-green-bg', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-gold-bg',
        name: '골드 글 배경',
        category: 'post-deco',
        rarity: 'epic',
        price: 800,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '게시글에 골드 배경 적용',
        sortOrder: 3,
        effectData: { cssClass: 'deco-gold-bg', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-gold-bg', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-pin',
        name: '게시글 고정권',
        category: 'post-deco',
        rarity: 'epic',
        price: 1000,
        isActive: true,
        type: 'consumable',
        durationType: '1-use',
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '게시글 1개를 24시간 상단 고정',
        sortOrder: 4,
        effectData: { cssClass: 'deco-pinned', svgIcon: null, animation: null, action: 'pin' },
        previewData: { cssClass: 'deco-pinned', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-radio-30d',
        name: '팀라디오 박스 (30일)',
        category: 'post-deco',
        rarity: 'epic',
        price: 1500,
        isActive: true,
        type: 'rental',
        durationType: '30-day',
        durationMs: 2592000000,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '30일간 게시글에 팀라디오 스타일 적용',
        sortOrder: 5,
        effectData: { cssClass: 'deco-team-radio', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-team-radio', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-radio-perm',
        name: '팀라디오 박스 (영구)',
        category: 'post-deco',
        rarity: 'legendary',
        price: 3000,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '영구적으로 게시글에 팀라디오 스타일 적용',
        sortOrder: 6,
        effectData: { cssClass: 'deco-team-radio', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-team-radio', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-fastest-30d',
        name: 'Fastest Lap 게시글 (30일)',
        category: 'post-deco',
        rarity: 'epic',
        price: 1000,
        isActive: true,
        type: 'rental',
        durationType: '30-day',
        durationMs: 2592000000,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '30일간 게시글에 Fastest Lap 스타일 적용',
        sortOrder: 7,
        effectData: { cssClass: 'deco-fastest-lap', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-fastest-lap', svgIcon: null, previewType: 'deco' }
    },
    {
        id: 'deco-fastest-perm',
        name: 'Fastest Lap 게시글 (영구)',
        category: 'post-deco',
        rarity: 'legendary',
        price: 2500,
        isActive: true,
        type: 'permanent',
        durationType: null,
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '영구적으로 게시글에 Fastest Lap 스타일 적용',
        sortOrder: 8,
        effectData: { cssClass: 'deco-fastest-lap', svgIcon: null, animation: null },
        previewData: { cssClass: 'deco-fastest-lap', svgIcon: null, previewType: 'deco' }
    },

    // ── FUNCTIONAL (category: 'functional', previewType: 'func') ── 1 item
    {
        id: 'func-nickname',
        name: '닉네임 변경권',
        category: 'functional',
        rarity: 'rare',
        price: 500,
        isActive: true,
        type: 'consumable',
        durationType: '1-use',
        durationMs: null,
        availableFrom: null,
        availableUntil: null,
        limitCondition: null,
        description: '닉네임을 1회 변경할 수 있는 아이템',
        sortOrder: 1,
        effectData: { cssClass: '', svgIcon: null, animation: null, action: 'nickname-change' },
        previewData: { cssClass: '', svgIcon: null, previewType: 'func' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 단색 닉네임 (11개, 150 FC, rare)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'color-redbull-blue', name: '레드불 블루', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱의 시그니처 블루', sortOrder: 101,
        effectData: { cssClass: 'color-redbull-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-redbull-blue', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-mclaren-orange', name: '맥라렌 오렌지', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌의 시그니처 파파야 오렌지', sortOrder: 102,
        effectData: { cssClass: 'color-mclaren-orange', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-mclaren-orange', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-ferrari-red', name: '페라리 레드', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '스쿠데리아 페라리의 로쏘 코르사', sortOrder: 103,
        effectData: { cssClass: 'color-ferrari-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-ferrari-red', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-alpine-blue', name: '알핀 블루', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 F1 팀의 블루', sortOrder: 104,
        effectData: { cssClass: 'color-alpine-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-alpine-blue', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-alpine-pink', name: '알핀 핑크', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 F1 팀의 핑크', sortOrder: 105,
        effectData: { cssClass: 'color-alpine-pink', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-alpine-pink', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-williams-blue', name: '윌리엄스 블루', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 레이싱의 블루', sortOrder: 106,
        effectData: { cssClass: 'color-williams-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-williams-blue', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-rb-blue', name: '레이싱 불스 블루', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스의 네이비 블루', sortOrder: 107,
        effectData: { cssClass: 'color-rb-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-rb-blue', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-haas-red', name: '하스 레드', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 F1 팀의 레드', sortOrder: 108,
        effectData: { cssClass: 'color-haas-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-haas-red', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-audi-silver', name: '아우디 실버', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 F1 팀의 실버', sortOrder: 109,
        effectData: { cssClass: 'color-audi-silver', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-audi-silver', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-audi-red', name: '아우디 레드', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 F1 팀의 레드', sortOrder: 110,
        effectData: { cssClass: 'color-audi-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-audi-red', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-cadillac-black', name: '캐딜락 블랙', category: 'nickname-color', collection: 'team',
        rarity: 'rare', price: 150, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 F1 팀의 블랙', sortOrder: 111,
        effectData: { cssClass: 'color-cadillac-black', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-cadillac-black', svgIcon: null, previewType: 'color' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 단색 테두리 (11개, 200 FC, rare)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'border-redbull-blue', name: '레드불 블루 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱 테마 테두리', sortOrder: 201,
        effectData: { cssClass: 'border-redbull-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-redbull-blue', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-mclaren-orange', name: '맥라렌 오렌지 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌 레이싱 테마 테두리', sortOrder: 202,
        effectData: { cssClass: 'border-mclaren-orange', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-mclaren-orange', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-ferrari-red', name: '페라리 레드 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '페라리 레이싱 테마 테두리', sortOrder: 203,
        effectData: { cssClass: 'border-ferrari-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-ferrari-red', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-alpine-blue', name: '알핀 블루 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 레이싱 테마 테두리', sortOrder: 204,
        effectData: { cssClass: 'border-alpine-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-alpine-blue', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-alpine-pink', name: '알핀 핑크 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 레이싱 테마 핑크 테두리', sortOrder: 205,
        effectData: { cssClass: 'border-alpine-pink', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-alpine-pink', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-williams-blue', name: '윌리엄스 블루 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 레이싱 테마 테두리', sortOrder: 206,
        effectData: { cssClass: 'border-williams-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-williams-blue', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-rb-blue', name: '레이싱 불스 블루 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스 테마 테두리', sortOrder: 207,
        effectData: { cssClass: 'border-rb-blue', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-rb-blue', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-haas-red', name: '하스 레드 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 레이싱 테마 테두리', sortOrder: 208,
        effectData: { cssClass: 'border-haas-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-haas-red', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-audi-silver', name: '아우디 실버 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 레이싱 테마 테두리', sortOrder: 209,
        effectData: { cssClass: 'border-audi-silver', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-audi-silver', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-audi-red', name: '아우디 레드 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 레이싱 테마 레드 테두리', sortOrder: 210,
        effectData: { cssClass: 'border-audi-red', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-audi-red', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-cadillac-black', name: '캐딜락 블랙 테두리', category: 'profile-border', collection: 'team',
        rarity: 'rare', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 레이싱 테마 테두리', sortOrder: 211,
        effectData: { cssClass: 'border-cadillac-black', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-cadillac-black', svgIcon: null, previewType: 'border' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 그라데이션 닉네임 (9개, 500 FC, epic)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'color-redbull-gradient', name: '레드불 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱의 블루-레드 그라데이션', sortOrder: 301,
        effectData: { cssClass: 'color-redbull-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-redbull-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-mclaren-gradient', name: '맥라렌 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌의 오렌지-블랙 그라데이션', sortOrder: 302,
        effectData: { cssClass: 'color-mclaren-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-mclaren-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-ferrari-gradient', name: '페라리 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '페라리의 레드-옐로우 그라데이션', sortOrder: 303,
        effectData: { cssClass: 'color-ferrari-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-ferrari-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-alpine-gradient', name: '알핀 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀의 블루-핑크 그라데이션', sortOrder: 304,
        effectData: { cssClass: 'color-alpine-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-alpine-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-williams-gradient', name: '윌리엄스 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스의 블루-화이트 그라데이션', sortOrder: 305,
        effectData: { cssClass: 'color-williams-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-williams-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-rb-gradient', name: '레이싱 불스 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스의 네이비-화이트 그라데이션', sortOrder: 306,
        effectData: { cssClass: 'color-rb-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-rb-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-haas-gradient', name: '하스 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스의 레드-화이트 그라데이션', sortOrder: 307,
        effectData: { cssClass: 'color-haas-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-haas-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-audi-gradient', name: '아우디 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디의 실버-레드 그라데이션', sortOrder: 308,
        effectData: { cssClass: 'color-audi-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-audi-gradient', svgIcon: null, previewType: 'color' }
    },
    {
        id: 'color-cadillac-gradient', name: '캐딜락 그라데이션', category: 'nickname-color', collection: 'team',
        rarity: 'epic', price: 500, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락의 블랙-화이트 그라데이션', sortOrder: 309,
        effectData: { cssClass: 'color-cadillac-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'color-cadillac-gradient', svgIcon: null, previewType: 'color' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 그라데이션 테두리 (9개, 600 FC, epic)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'border-redbull-gradient', name: '레드불 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 블루-레드 그라데이션 테두리', sortOrder: 401,
        effectData: { cssClass: 'border-redbull-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-redbull-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-mclaren-gradient', name: '맥라렌 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌 오렌지-블랙 그라데이션 테두리', sortOrder: 402,
        effectData: { cssClass: 'border-mclaren-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-mclaren-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-ferrari-gradient', name: '페라리 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '페라리 레드-옐로우 그라데이션 테두리', sortOrder: 403,
        effectData: { cssClass: 'border-ferrari-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-ferrari-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-alpine-gradient', name: '알핀 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 블루-핑크 그라데이션 테두리', sortOrder: 404,
        effectData: { cssClass: 'border-alpine-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-alpine-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-williams-gradient', name: '윌리엄스 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 블루-화이트 그라데이션 테두리', sortOrder: 405,
        effectData: { cssClass: 'border-williams-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-williams-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-rb-gradient', name: '레이싱 불스 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스 네이비-화이트 그라데이션 테두리', sortOrder: 406,
        effectData: { cssClass: 'border-rb-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-rb-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-haas-gradient', name: '하스 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 레드-화이트 그라데이션 테두리', sortOrder: 407,
        effectData: { cssClass: 'border-haas-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-haas-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-audi-gradient', name: '아우디 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 실버-레드 그라데이션 테두리', sortOrder: 408,
        effectData: { cssClass: 'border-audi-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-audi-gradient', svgIcon: null, previewType: 'border' }
    },
    {
        id: 'border-cadillac-gradient', name: '캐딜락 그라데이션 테두리', category: 'profile-border', collection: 'team',
        rarity: 'epic', price: 600, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 블랙-화이트 그라데이션 테두리', sortOrder: 409,
        effectData: { cssClass: 'border-cadillac-gradient', svgIcon: null, animation: null },
        previewData: { cssClass: 'border-cadillac-gradient', svgIcon: null, previewType: 'border' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 드라이버 번호 뱃지 (20개, 200 FC, epic)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'badge-driver-1', name: '노리스 팬뱃지 (1)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌 F1 팀 - 란도 노리스', sortOrder: 501,
        effectData: { cssClass: '', svgIcon: 'badge-driver-1.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-1.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-81', name: '피아스트리 팬뱃지 (81)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌 F1 팀 - 오스카 피아스트리', sortOrder: 502,
        effectData: { cssClass: '', svgIcon: 'badge-driver-81.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-81.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-63', name: '러셀 팬뱃지 (63)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '메르세데스 F1 팀 - 조지 러셀', sortOrder: 503,
        effectData: { cssClass: '', svgIcon: 'badge-driver-63.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-63.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-12', name: '안토넬리 팬뱃지 (12)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '메르세데스 F1 팀 - 안드레아 키미 안토넬리', sortOrder: 504,
        effectData: { cssClass: '', svgIcon: 'badge-driver-12.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-12.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-3', name: '페르스타펜 팬뱃지 (3)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱 - 막스 페르스타펜', sortOrder: 505,
        effectData: { cssClass: '', svgIcon: 'badge-driver-3.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-3.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-6', name: '하자르 팬뱃지 (6)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱 - 이삭 하자르', sortOrder: 506,
        effectData: { cssClass: '', svgIcon: 'badge-driver-6.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-6.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-44', name: '해밀턴 팬뱃지 (44)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '스쿠데리아 페라리 - 루이스 해밀턴', sortOrder: 507,
        effectData: { cssClass: '', svgIcon: 'badge-driver-44.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-44.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-16', name: '르클레르 팬뱃지 (16)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '스쿠데리아 페라리 - 샤를 르클레르', sortOrder: 508,
        effectData: { cssClass: '', svgIcon: 'badge-driver-16.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-16.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-23', name: '알본 팬뱃지 (23)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 레이싱 - 알렉산더 알본', sortOrder: 509,
        effectData: { cssClass: '', svgIcon: 'badge-driver-23.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-23.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-55', name: '사인츠 팬뱃지 (55)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 레이싱 - 카를로스 사인츠', sortOrder: 510,
        effectData: { cssClass: '', svgIcon: 'badge-driver-55.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-55.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-30', name: '로슨 팬뱃지 (30)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스 - 리암 로슨', sortOrder: 511,
        effectData: { cssClass: '', svgIcon: 'badge-driver-30.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-30.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-40', name: '린드블라드 팬뱃지 (40)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스 - 아르빗 린드블라드', sortOrder: 512,
        effectData: { cssClass: '', svgIcon: 'badge-driver-40.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-40.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-10', name: '가슬리 팬뱃지 (10)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 F1 팀 - 피에르 가슬리', sortOrder: 513,
        effectData: { cssClass: '', svgIcon: 'badge-driver-10.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-10.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-43', name: '콜라핀토 팬뱃지 (43)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 F1 팀 - 프랑코 콜라핀토', sortOrder: 514,
        effectData: { cssClass: '', svgIcon: 'badge-driver-43.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-43.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-87', name: '베어먼 팬뱃지 (87)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 F1 팀 - 올리버 베어먼', sortOrder: 515,
        effectData: { cssClass: '', svgIcon: 'badge-driver-87.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-87.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-31', name: '오콘 팬뱃지 (31)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 F1 팀 - 에스테반 오콘', sortOrder: 516,
        effectData: { cssClass: '', svgIcon: 'badge-driver-31.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-31.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-27', name: '휠켄베르크 팬뱃지 (27)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 F1 팀 - 니코 휠켄베르크', sortOrder: 517,
        effectData: { cssClass: '', svgIcon: 'badge-driver-27.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-27.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-5', name: '보르톨레토 팬뱃지 (5)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 F1 팀 - 가브리엘 보르톨레토', sortOrder: 518,
        effectData: { cssClass: '', svgIcon: 'badge-driver-5.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-5.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-77', name: '보타스 팬뱃지 (77)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 F1 팀 - 발테리 보타스', sortOrder: 519,
        effectData: { cssClass: '', svgIcon: 'badge-driver-77.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-77.svg', previewType: 'badge' }
    },
    {
        id: 'badge-driver-11', name: '페레즈 팬뱃지 (11)', category: 'badge', collection: 'team',
        rarity: 'epic', price: 200, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 F1 팀 - 세르히오 페레즈', sortOrder: 520,
        effectData: { cssClass: '', svgIcon: 'badge-driver-11.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-driver-11.svg', previewType: 'badge' }
    },

    // ══════════════════════════════════════════════════════════════
    // F1 팀 컬렉션 — 팀 뱃지 (10개, 100 FC, rare)
    // ══════════════════════════════════════════════════════════════
    {
        id: 'badge-team-rbr', name: '레드불 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레드불 레이싱 팀 뱃지', sortOrder: 601,
        effectData: { cssClass: '', svgIcon: 'badge-team-rbr.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-rbr.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-mcl', name: '맥라렌 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '맥라렌 레이싱 팀 뱃지', sortOrder: 602,
        effectData: { cssClass: '', svgIcon: 'badge-team-mcl.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-mcl.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-fer', name: '페라리 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '스쿠데리아 페라리 팀 뱃지', sortOrder: 603,
        effectData: { cssClass: '', svgIcon: 'badge-team-fer.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-fer.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-mer', name: '메르세데스 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '메르세데스 AMG 팀 뱃지', sortOrder: 604,
        effectData: { cssClass: '', svgIcon: 'badge-team-mer.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-mer.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-alp', name: '알핀 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '알핀 F1 팀 뱃지', sortOrder: 605,
        effectData: { cssClass: '', svgIcon: 'badge-team-alp.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-alp.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-wil', name: '윌리엄스 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '윌리엄스 레이싱 팀 뱃지', sortOrder: 606,
        effectData: { cssClass: '', svgIcon: 'badge-team-wil.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-wil.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-rb', name: '레이싱 불스 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '레이싱 불스 팀 뱃지', sortOrder: 607,
        effectData: { cssClass: '', svgIcon: 'badge-team-rb.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-rb.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-has', name: '하스 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '하스 F1 팀 뱃지', sortOrder: 608,
        effectData: { cssClass: '', svgIcon: 'badge-team-has.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-has.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-aud', name: '아우디 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '아우디 F1 팀 뱃지', sortOrder: 609,
        effectData: { cssClass: '', svgIcon: 'badge-team-aud.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-aud.svg', previewType: 'badge' }
    },
    {
        id: 'badge-team-cad', name: '캐딜락 팀뱃지', category: 'badge', collection: 'team',
        rarity: 'rare', price: 100, isActive: true, type: 'permanent',
        durationType: null, durationMs: null, availableFrom: null, availableUntil: null, limitCondition: null,
        description: '캐딜락 F1 팀 뱃지', sortOrder: 610,
        effectData: { cssClass: '', svgIcon: 'badge-team-cad.svg', animation: null },
        previewData: { cssClass: '', svgIcon: 'badge-team-cad.svg', previewType: 'badge' }
    }
];

// ============================================================
// 시드 실행
// ============================================================

async function main() {
    console.log('========================================');
    console.log('shopItems 컬렉션 시드 시작');
    console.log(`총 ${shopItems.length}개 아이템 등록 예정`);
    console.log('========================================\n');

    const batch = db.batch();
    const collectionRef = db.collection('shopItems');

    // 삭제된 아이템 정리
    const removedIds = ['badge-rookie', 'color-renault-yellow', 'color-renault-blue', 'badge-helmet', 'border-drs-glow', 'border-safety-car', 'border-carbon', 'border-headset', 'border-fire', 'badge-alonso-helmet', 'border-racing-point', 'border-racing-point-glow', 'color-racing-point', 'color-racing-point-glow', 'border-renault-2005', 'border-renault-2005-glow', 'color-renault-gradient', 'color-renault-gradient-glow'];
    for (const id of removedIds) {
        batch.delete(collectionRef.doc(id));
        console.log(`  [삭제] ${id}`);
    }

    for (const item of shopItems) {
        const docRef = collectionRef.doc(item.id);
        // id 필드는 문서 ID로 사용하므로 문서 데이터에서 제거
        const { id, ...docData } = item;
        batch.set(docRef, docData);
        console.log(`  [준비] ${item.id} - ${item.name} (${item.category}, ${item.rarity}, ${item.price} FC)`);
    }

    console.log('\n배치 쓰기 커밋 중...');

    try {
        await batch.commit();
        console.log(`\n${shopItems.length}개 아이템 등록 완료`);
    } catch (error) {
        console.error('\n배치 쓰기 실패:', error.message);
        process.exit(1);
    }

    console.log('========================================');
    console.log('카테고리별 요약:');

    const summary = {};
    for (const item of shopItems) {
        if (!summary[item.category]) {
            summary[item.category] = { count: 0, totalPrice: 0 };
        }
        summary[item.category].count++;
        summary[item.category].totalPrice += item.price;
    }

    for (const [category, data] of Object.entries(summary)) {
        console.log(`  ${category}: ${data.count}개 (총 가격 합계: ${data.totalPrice} FC)`);
    }

    console.log('========================================');
    process.exit(0);
}

main();
