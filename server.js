// .env 파일에서 환경변수 로드
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const RSSParser = require('rss-parser');
const path = require('path');
const translate = require('google-translate-api-x');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const cron = require('node-cron');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const rssParser = new RSSParser({
    customFields: {
        item: [
            ['media:content', 'media:content', { keepArray: false }],
            ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
        ]
    }
});

// ========================================
// 🔒 B-1: 프로덕션 필수 환경변수 종합 검증
// ========================================
if (process.env.NODE_ENV === 'production') {
    const requiredEnvVars = [];
    // Firebase는 개별 환경변수 또는 JSON 블롭 중 하나 필요
    if (!process.env.FIREBASE_SERVICE_ACCOUNT &&
        !(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)) {
        requiredEnvVars.push('FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (또는 FIREBASE_SERVICE_ACCOUNT)');
    }
    if (!process.env.ADMIN_KEY) requiredEnvVars.push('ADMIN_KEY');
    if (!process.env.ALLOWED_ORIGINS) requiredEnvVars.push('ALLOWED_ORIGINS');

    if (requiredEnvVars.length > 0) {
        console.error('❌ 프로덕션 필수 환경변수 누락:');
        requiredEnvVars.forEach(v => console.error(`   - ${v}`));
        process.exit(1);
    }
}

// ========================================
// Firebase Admin 초기화
// ========================================
let db = null;
try {
    // 🔒 보안 강화: 개별 환경변수 우선 사용 (JSON 블롭보다 안전)
    let serviceAccount = null;

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // 개별 환경변수 방식 (권장)
        serviceAccount = {
            type: 'service_account',
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            // private_key의 이스케이프된 \n을 실제 줄바꿈으로 변환
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
        console.log('ℹ️  Firebase: 개별 환경변수 방식 사용');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // 기존 JSON 블롭 방식 (하위 호환성)
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('ℹ️  Firebase: JSON 블롭 방식 사용 (개별 환경변수 권장)');
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log('✅ Firebase Admin 초기화 성공');
    } else {
        console.warn('⚠️  Firebase 서비스 계정이 설정되지 않았습니다. 정산 API가 비활성화됩니다.');
    }
} catch (error) {
    console.error('❌ Firebase Admin 초기화 실패:', error.message);
}

// 환경 설정
// ⚠️ 프로덕션에서는 반드시 환경변수로 ADMIN_KEY를 설정하세요!
// 예: ADMIN_KEY=복잡한비밀번호123!@# node server.js
const ADMIN_KEY = process.env.ADMIN_KEY;
const MIN_ADMIN_KEY_LENGTH = 32; // 🔒 최소 32자 이상 필요

if (!ADMIN_KEY || ADMIN_KEY.length < MIN_ADMIN_KEY_LENGTH) {
    // 🔒 보안 강화: 모든 환경에서 ADMIN_KEY 최소 길이 검증
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ 치명적 오류: ADMIN_KEY가 설정되지 않았거나 너무 짧습니다!');
        console.error(`❌ ADMIN_KEY는 최소 ${MIN_ADMIN_KEY_LENGTH}자 이상이어야 합니다.`);
        console.error('❌ 설정 방법: ADMIN_KEY=매우복잡한비밀번호32자이상 node server.js');
        process.exit(1);
    } else {
        if (!ADMIN_KEY) {
            console.warn('⚠️  경고: ADMIN_KEY 환경변수가 설정되지 않았습니다!');
            console.warn('⚠️  관리자 API가 비활성화됩니다. 프로덕션에서는 반드시 설정하세요.');
        } else {
            console.warn(`⚠️  경고: ADMIN_KEY가 너무 짧습니다! (현재: ${ADMIN_KEY.length}자, 권장: ${MIN_ADMIN_KEY_LENGTH}자 이상)`);
            console.warn('⚠️  보안을 위해 더 긴 키를 사용하세요.');
        }
    }
}

// 🔒 S-3: 관리자 키 타이밍 공격 방지 (crypto.timingSafeEqual 사용)
function verifyAdminKey(input) {
    if (!ADMIN_KEY || !input) return false;
    const a = Buffer.from(ADMIN_KEY);
    const b = Buffer.from(String(input));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// 🔒 S-1: 프로덕션에서 ALLOWED_ORIGINS 미설정 시 서버 시작 차단
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
    console.error('❌ 치명적 오류: ALLOWED_ORIGINS가 설정되지 않았습니다!');
    console.error('❌ 예: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com');
    process.exit(1);
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// CORS 설정 - 허용된 도메인만
// 🔒 A-4: origin 없는 요청(서버-서버, curl 등) 프로덕션 경고 로그
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) {
            // origin 없는 요청 허용 (서버 간 통신, 헬스체크 등)
            // API는 Firebase 토큰 인증 필수이므로 실질 위험 제한적
            if (process.env.NODE_ENV === 'production') {
                // 프로덕션에서는 로그로 모니터링
            }
            callback(null, true);
        } else if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

// Rate Limiting - API 남용 방지
const isDev = process.env.NODE_ENV !== 'production';
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: isDev ? 1000 : 100, // 개발: 1000회, 프로덕션: 100회
    message: { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false
});

// 기사 스크래핑 Rate Limit (더 엄격)
const articleLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5분
    max: 30, // IP당 최대 30회
    message: { success: false, error: '기사 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

// 🔒 관리자 API Rate Limit (brute force 공격 방지)
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 15분당 10회만 허용
    message: { success: false, error: '관리자 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false
});

// 🔒 상점 구매 Rate Limit (어뷰징 방지)
const shopPurchaseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 30, // 15분당 30회
    message: { success: false, error: '구매 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false
});

// API 라우트에 Rate Limiting 적용
app.use('/api/', apiLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/refresh', adminLimiter);

// M-3: 보안 헤더 설정
app.use((req, res, next) => {
    // XSS 방지
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 클릭재킹 방지
    res.setHeader('X-Frame-Options', 'DENY');
    // Referrer 정책
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // XSS 필터 (레거시 브라우저용)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // HTTPS 강제 (HSTS) - 프로덕션 환경에서 활성화
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_HSTS === 'true') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // CSP - Firebase, Google 서비스, Analytics 허용
    // ⚠️ 보안 강화: unsafe-eval 제거 (XSS 방지)
    // 주의: Firebase SDK 일부 기능이 영향받을 수 있음 - 테스트 필요
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://*.firebaseio.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://www.gstatic.com wss://*.firebaseio.com https://www.googletagmanager.com https://www.google-analytics.com https://api.jolpi.ca https://region1.google-analytics.com; frame-src 'self' https://accounts.google.com https://*.firebaseapp.com;");
    next();
});

// JSON 바디 파싱
app.use(express.json());

// 정적 파일 서빙
app.use(express.static(path.join(__dirname)));

// 뉴스 캐시 (메모리)
let newsCache = {
    data: null,
    timestamp: 0
};
// 🔒 B-5: 환경변수로 캐시 TTL 설정 가능 (분 단위, 기본 30분)
const CACHE_DURATION = (parseInt(process.env.NEWS_CACHE_TTL_MIN, 10) || 30) * 60 * 1000;

// Google Translate (무료, API 키 불필요)

// [DEPRECATED] Aston Martin 키워드 — 클라이언트에서 팀별 필터링으로 대체됨 (teams.js F1_TEAMS.keywords 참고)
const KEYWORDS = [
    // 팀명
    'aston martin', 'amr', 'aston',
    // 드라이버
    'alonso', 'fernando alonso', 'stroll', 'lance stroll',
    // 주요 인물
    'lawrence stroll', 'mike krack', 'adrian newey', 'andy cowell',
    'dan fallows', 'tom mccullough', 'bob bell', 'martin whitmarsh',
    // 스폰서/파트너
    'aramco', 'cognizant', 'valvoline',
    // 기술/차량
    'amr24', 'amr25', 'amr26', 'silverstone factory'
];

// [DEPRECATED] 다른 팀 제외 키워드 — 클라이언트에서 팀별 필터링으로 대체됨
const EXCLUDE_TEAMS = [
    'red bull', 'redbull', 'ferrari', 'mercedes', 'mclaren',
    'alpine', 'williams', 'haas', 'rb ', 'visa rb', 'vcarb',
    'sauber', 'audi', 'alfa romeo'
];

/**
 * [DEPRECATED] 텍스트가 Aston Martin 관련인지 확인 — 클라이언트 팀별 필터링으로 대체됨
 */
function isAstonMartinRelated(text) {
    const lowerText = text.toLowerCase();

    // 제목에 다른 팀 이름이 있으면 제외 (AM도 함께 언급된 경우는 포함)
    const hasOtherTeam = EXCLUDE_TEAMS.some(team => lowerText.includes(team));
    const hasAMKeyword = KEYWORDS.some(keyword => lowerText.includes(keyword));

    // AM 키워드가 있고, 다른 팀만 언급된 게 아니면 true
    if (hasAMKeyword && !hasOtherTeam) return true;

    // AM 팀명이 명시적으로 있으면 다른 팀 언급과 상관없이 포함
    if (lowerText.includes('aston martin') || lowerText.includes('aston')) return true;

    return false;
}

/**
 * 한국어 번역 (Google Translate - 무료, API 키 불필요)
 */
async function translateToKorean(text) {
    if (!text) return text;

    try {
        let toTranslate = text;
        if (toTranslate.length > 1500) {
            toTranslate = toTranslate.slice(0, 1500);
            const lastDot = toTranslate.lastIndexOf('.');
            const lastQuote = toTranslate.lastIndexOf('"');
            const cutAt = Math.max(lastDot, lastQuote);
            if (cutAt > 0) {
                toTranslate = toTranslate.slice(0, cutAt + 1);
            }
        }
        const result = await translate(toTranslate, {
            from: 'en',
            to: 'ko'
        });
        return result.text;
    } catch (error) {
        console.log('Google 번역 실패:', error.message);
    }

    // 실패 시 원문 반환
    return text;
}

/**
 * 동시 요청 수를 제한하여 병렬 실행
 */
async function parallelLimit(tasks, concurrency = 5) {
    const results = [];
    let index = 0;
    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
    return results;
}

/**
 * 기사 페이지에서 og:image, og:article:published_time 메타 태그 추출
 */
async function fetchOgMeta(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            },
            timeout: 10000,
            maxRedirects: 3
        });
        const $ = cheerio.load(response.data);
        let ogImage = $('meta[property="og:image"]').attr('content') || '';
        if (ogImage && ogImage.includes('media.formula1.com')) {
            ogImage = ogImage.replace(/w_\d+/, 'w_480');
        }
        const pubDate = $('meta[property="article:published_time"]').attr('content') || '';
        return { image: ogImage, pubDate };
    } catch {
        return { image: '', pubDate: '' };
    }
}

/**
 * Formula1.com RSS + og:image 하이브리드 방식
 */
async function scrapeF1News() {
    try {
        const feed = await rssParser.parseURL(
            'https://www.formula1.com/content/fom-website/en/latest/all.xml'
        );
        const items = feed.items.slice(0, 20);

        const articles = await parallelLimit(
            items.map((item) => async () => {
                let og = { image: '', pubDate: '' };
                try {
                    og = await fetchOgMeta(item.link);
                } catch (e) {
                    console.log(`og 메타 추출 실패: ${item.link}`);
                }
                const finalPubDate = og.pubDate || item.pubDate || item.isoDate || new Date().toISOString();
                if (!og.pubDate && !item.pubDate && !item.isoDate) {
                    console.log(`[WARN] F1 날짜 없음, 현재시간 사용: ${item.title?.slice(0, 40)}`);
                }
                return {
                    title: item.title,
                    description: item.contentSnippet || item.content || item.title,
                    link: item.link,
                    pubDate: finalPubDate,
                    source: 'Formula 1',
                    image: og.image
                };
            }),
            5
        );

        console.log(`[DEBUG] F1 RSS+og:image 결과: ${articles.length}개`);
        return articles;
    } catch (error) {
        console.error('F1 RSS/og:image 실패:', error.message);
        return [];
    }
}

/**
 * Motorsport.com RSS 피드
 */
async function fetchMotorsportRSS() {
    try {
        const feed = await rssParser.parseURL('https://www.motorsport.com/rss/f1/news/');
        return feed.items.slice(0, 20).map(item => ({
            title: item.title,
            description: item.contentSnippet || item.content || item.title,
            link: item.link,
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Motorsport.com',
            image: extractRSSImage(item)
        }));
    } catch (error) {
        console.error('Motorsport RSS 실패:', error.message);
        return [];
    }
}

/**
 * Autosport RSS 피드
 */
async function fetchAutosportRSS() {
    try {
        const feed = await rssParser.parseURL('https://www.autosport.com/rss/feed/f1');
        return feed.items.slice(0, 20).map(item => ({
            title: item.title,
            description: item.contentSnippet || item.content || item.title,
            link: item.link,
            pubDate: item.pubDate || new Date().toISOString(),
            source: 'Autosport',
            image: extractRSSImage(item)
        }));
    } catch (error) {
        console.error('Autosport RSS 실패:', error.message);
        return [];
    }
}

/**
 * RSS 아이템에서 이미지 URL 추출 (여러 필드를 fallback 체인으로 검색)
 */
function extractRSSImage(item) {
    // 1. enclosure (표준 RSS)
    if (item.enclosure?.url) return item.enclosure.url;
    // 2. media:content
    if (item['media:content']?.['$']?.url) return item['media:content']['$'].url;
    // 3. media:thumbnail
    if (item['media:thumbnail']?.['$']?.url) return item['media:thumbnail']['$'].url;
    // 4. content/content:encoded 내 <img> 태그에서 추출
    const htmlContent = item['content:encoded'] || item.content || '';
    const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
    return '';
}

/**
 * 기사 상세 내용 스크래핑
 */
async function scrapeArticleContent(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);

        // 불필요한 요소 제거 (사이드바, 관련 기사, 광고 등)
        $('aside, nav, .sidebar, .related-articles, .recommended, .trending').remove();
        $('[class*="sidebar"], [class*="related"], [class*="recommended"]').remove();
        $('[class*="promo"], [class*="newsletter"], [class*="alert"]').remove();
        $('script, style, iframe, noscript').remove();

        // 사이트별 셀렉터 (더 구체적으로)
        const siteSelectors = {
            'motorsport.com': [
                '.ms-article-content p',
                '[class*="ArticleTextContent"] p',
                '[class*="article-content"] p'
            ],
            'autosport.com': [
                '[class*="ArticleTextContent"] p',
                '[class*="article-content"] p',
                'article [class*="content"] p'
            ],
            'formula1.com': [
                '.f1-article--body p',
                '[class*="article-body"] p'
            ],
            'default': [
                'article p',
                '.article-content p',
                '.article-body p'
            ]
        };

        // URL에서 사이트 결정
        let selectors = siteSelectors.default;
        for (const [site, siteSelector] of Object.entries(siteSelectors)) {
            if (url.includes(site)) {
                selectors = [...siteSelector, ...siteSelectors.default];
                break;
            }
        }

        let content = '';

        // 각 셀렉터 시도
        for (const selector of selectors) {
            const paragraphs = $(selector);
            if (paragraphs.length > 0) {
                paragraphs.each((i, el) => {
                    const text = $(el).text().trim();
                    // 광고, 구독 관련 텍스트 필터링
                    if (text && text.length > 30 &&
                        !text.includes('Subscribe') &&
                        !text.includes('Sign up') &&
                        !text.includes('newsletter') &&
                        !text.includes('Cookie')) {
                        content += text + '\n\n';
                    }
                });
                if (content.length > 300) break;
            }
        }

        // 여전히 없으면 모든 p 태그 시도
        if (content.length < 100) {
            $('p').each((i, el) => {
                if (content.length > 2000) return false;
                const text = $(el).text().trim();
                if (text && text.length > 50 &&
                    !text.includes('Subscribe') &&
                    !text.includes('Cookie')) {
                    content += text + '\n\n';
                }
            });
        }

        console.log(`기사 스크래핑: ${url.slice(0, 50)}... (${content.length}자)`);
        return content.trim() || null;
    } catch (error) {
        console.error('기사 스크래핑 실패:', error.message);
        return null;
    }
}

/**
 * 모든 소스에서 뉴스 가져오기
 */
/**
 * 뉴스 기사를 Firestore에 저장 (링크 기반 중복 방지)
 */
async function saveNewsToFirestore(articles) {
    if (!db || articles.length === 0) return;
    try {
        const batch = db.batch();
        let savedCount = 0;
        for (const article of articles) {
            // 링크를 해시해서 문서 ID로 사용 (URL에 특수문자가 많으므로)
            const docId = crypto.createHash('md5').update(article.link).digest('hex');
            const docRef = db.collection('news').doc(docId);
            const doc = await docRef.get();
            if (!doc.exists) {
                batch.set(docRef, {
                    ...article,
                    savedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                savedCount++;
            }
        }
        if (savedCount > 0) {
            await batch.commit();
            console.log(`[뉴스 DB] ${savedCount}개 새 기사 Firestore 저장 완료`);
        }
    } catch (error) {
        console.error('[뉴스 DB] Firestore 저장 실패:', error.message);
    }
}

/**
 * Firestore에서 저장된 뉴스 불러오기 (30일 이내)
 */
async function loadNewsFromFirestore() {
    if (!db) return [];
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const snapshot = await db.collection('news')
            .where('savedAt', '>=', thirtyDaysAgo)
            .orderBy('savedAt', 'desc')
            .get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            // savedAt을 ISO 문자열로 변환 (Firestore Timestamp → Date)
            const savedAtDate = data.savedAt && data.savedAt.toDate
                ? data.savedAt.toDate().toISOString()
                : null;
            return {
                title: data.title,
                description: data.description,
                link: data.link,
                pubDate: data.pubDate,
                savedAt: savedAtDate,
                source: data.source,
                image: data.image || '',
                titleOriginal: data.titleOriginal || '',
                descriptionOriginal: data.descriptionOriginal || ''
            };
        });
    } catch (error) {
        console.error('[뉴스 DB] Firestore 로드 실패:', error.message);
        return [];
    }
}

/**
 * 30일 지난 뉴스 자동 삭제
 */
async function deleteOldNews() {
    if (!db) return;
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const snapshot = await db.collection('news')
            .where('savedAt', '<', thirtyDaysAgo)
            .get();
        if (snapshot.empty) {
            console.log('[뉴스 정리] 삭제할 오래된 뉴스 없음');
            return;
        }
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`[뉴스 정리] ${snapshot.size}개 오래된 뉴스 삭제 완료`);
    } catch (error) {
        console.error('[뉴스 정리] 삭제 실패:', error.message);
    }
}

async function fetchAllNews() {
    // 캐시 확인
    if (newsCache.data && Date.now() - newsCache.timestamp < CACHE_DURATION) {
        return newsCache.data;
    }

    console.log('뉴스 새로 가져오는 중...');

    // 병렬로 모든 소스에서 가져오기
    const [f1News, motorsportNews, autosportNews] = await Promise.all([
        scrapeF1News(),
        fetchMotorsportRSS(),
        fetchAutosportRSS()
    ]);

    console.log(`[DEBUG] F1: ${f1News.length}개, Motorsport: ${motorsportNews.length}개, Autosport: ${autosportNews.length}개`);

    // 모든 뉴스 합치기
    let allNews = [...f1News, ...motorsportNews, ...autosportNews];
    console.log(`[DEBUG] 전체 뉴스: ${allNews.length}개`);

    // HTML 태그 제거 (description 글자 수 늘림)
    allNews = allNews.map(item => ({
        ...item,
        image: item.image || '',
        title: item.title.replace(/<[^>]*>/g, '').trim(),
        description: item.description.replace(/<[^>]*>/g, '').slice(0, 500).trim()
    }));

    // 팀별 필터링은 클라이언트에서 처리 (모든 뉴스 전달)
    let newsToUse = allNews;

    // 중복 제거 (제목 유사도 기반)
    newsToUse = removeDuplicateNews(newsToUse);

    // 날짜순 정렬
    newsToUse.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // 최대 50개 번역 (30분 캐시로 서버 부하 없음)
    const newsToTranslate = newsToUse.slice(0, 50);

    // 한국어 번역
    console.log('번역 중...');
    const translatedNews = await Promise.all(
        newsToTranslate.map(async (item) => {
            const [titleKo, descKo] = await Promise.all([
                translateToKorean(item.title),
                translateToKorean(item.description)
            ]);
            return {
                ...item,
                title: titleKo,
                description: descKo,
                titleOriginal: item.title,
                descriptionOriginal: item.description
            };
        })
    );

    // Firestore에 번역된 뉴스 저장 (비동기, 실패해도 진행)
    saveNewsToFirestore(translatedNews).catch(err =>
        console.error('[뉴스 DB] 백그라운드 저장 실패:', err.message)
    );

    // Firestore에서 과거 뉴스 불러와 합치기
    const storedNews = await loadNewsFromFirestore();
    const merged = mergeAndDeduplicateNews(translatedNews, storedNews);

    // 캐시 저장
    newsCache = {
        data: merged,
        timestamp: Date.now()
    };

    console.log(`뉴스 ${merged.length}개 로드 완료 (RSS: ${translatedNews.length}개, DB 포함 총: ${merged.length}개)`);
    return merged;
}

/**
 * 중복 제거 (제목 유사도 기반)
 */
function removeDuplicateNews(newsList) {
    return newsList.filter((item, index, arr) => {
        const title = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const words = title.split(/\s+/).filter(w => w.length > 2);
        for (let i = 0; i < index; i++) {
            const otherTitle = arr[i].title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
            const otherWords = otherTitle.split(/\s+/).filter(w => w.length > 2);
            if (words.length > 0 && otherWords.length > 0) {
                const common = words.filter(w => otherWords.includes(w)).length;
                const similarity = common / Math.min(words.length, otherWords.length);
                if (similarity >= 0.6) return false;
            }
        }
        return true;
    });
}

/**
 * RSS 최신 뉴스 + Firestore 저장 뉴스 병합 (중복 제거 후 날짜순 정렬)
 */
function mergeAndDeduplicateNews(freshNews, storedNews) {
    // Firestore 저장 뉴스를 링크로 빠르게 조회할 수 있도록 맵 생성
    const storedMap = new Map(storedNews.map(n => [n.link, n]));
    const seen = new Set();
    const unique = [];

    // RSS 최신 뉴스 처리 (Firestore에 저장된 원본 pubDate 우선 사용)
    for (const fresh of freshNews) {
        seen.add(fresh.link);
        const stored = storedMap.get(fresh.link);
        if (stored) {
            // Firestore에 저장된 원본 pubDate 사용 (서버 재시작 시 new Date()로 바뀌는 것 방지)
            unique.push({ ...fresh, pubDate: stored.pubDate || fresh.pubDate });
        } else {
            unique.push(fresh);
        }
    }

    // Firestore에만 있는 과거 뉴스 추가
    for (const stored of storedNews) {
        if (!seen.has(stored.link)) {
            seen.add(stored.link);
            unique.push(stored);
        }
    }

    // 날짜순 정렬
    unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return unique;
}

// ============ 토큰 API (어뷰징 방지 - 서버에서만 토큰 변경) ============

// 토큰 설정 (constants.js와 동일)
const TOKEN_CONFIG = {
    ATTENDANCE: 10,
    ATTENDANCE_STREAK_BONUS: 50,
    STREAK_DAYS: 7,
    FIRST_POST: 20,
    SHARE_PREDICTION: 10
};

// Firebase Auth 토큰 검증 미들웨어
// 비동기 함수.
// authHeader이라는 상수로 요청의 헤더의 인증 값 ( 코드 : 'Authorization': `Bearer ${idToken}` ) 가 베리어 토큰이 아닌지, 헤더가 없는지 확인
// http 상태를 401 ( 인증 필요 )로 응답을 보내고 함수를 끝냄
// 토큰이 있으면 베리어 토큰의 문자열만 뽑음
// 파이어 베이스 SDK로 토큰 검증
// 검증 성공하면 decoded에 유저 고유 id, 이메일( 없을수도 있음 ), 만료시간 ,기타 사용자정보 들어있음
// req에 사용자 검증 정보를 넣어서 다음 코드가 쓰게만들고 다음 미들웨어, 라우터로 넘김
// 인증 실패하면 에러 메시지 콘솔에 띄우고 함수 종료!
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    }

    try {
        const idToken = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.user = decoded;
        next(); 
    } catch (error) {
        console.error('토큰 검증 실패:', error.message);
        return res.status(401).json({ success: false, error: '인증이 만료되었습니다. 다시 로그인해주세요.' });
    }
}

/**
 * Firebase Auth에서 사용자 프로필(displayName, photoURL) 가져오기
 * ID Token의 name/picture 클레임은 선택적이므로 admin.auth().getUser()를 사용
 */
async function getAuthProfile(userId, fallbackName, fallbackPhoto) {
    try {
        const authUser = await admin.auth().getUser(userId);
        return {
            displayName: authUser.displayName || fallbackName || '익명',
            photoURL: authUser.photoURL || fallbackPhoto || null
        };
    } catch (err) {
        return {
            displayName: fallbackName || '익명',
            photoURL: fallbackPhoto || null
        };
    }
}

// 출석체크 API
app.post('/api/token/attendance', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    // 🔒 A-2: 토큰 클레임에서 프로필 사용 (매번 Firebase Auth API 호출 방지)
    // 신규 사용자인 경우에만 getAuthProfile 호출 (트랜잭션 내에서 판단)
    const tokenProfile = {
        displayName: req.user.name || '익명',
        photoURL: req.user.picture || null
    };
    // 🔒 보안: 서버 시간 사용 (클라이언트 시간 조작 방지)
    const today = new Date();
    // KST 기준으로 날짜 계산 (UTC+9)
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(today.getTime() + kstOffset);
    const dateStr = `${kstDate.getUTCFullYear()}${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}${String(kstDate.getUTCDate()).padStart(2, '0')}`;
    const attendanceId = `${userId}_${dateStr}`;

    try {
        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const attendanceRef = db.collection('attendance').doc(attendanceId);

            // 중복 출석 확인
            const attendanceDoc = await transaction.get(attendanceRef);
            if (attendanceDoc.exists) {
                throw new Error('ALREADY_ATTENDED');
            }

            // 사용자 정보 조회
            const userDoc = await transaction.get(userRef);
            let userData = userDoc.exists ? userDoc.data() : {
                tokens: 0,
                totalEarned: 0,
                lastAttendance: null,
                consecutiveDays: 0
            };

            // 연속 출석 계산 (KST 날짜 기준)
            let consecutiveDays = userData.consecutiveDays || 0;
            if (userData.lastAttendance) {
                const lastDate = userData.lastAttendance.toDate();
                // KST 기준 날짜로 변환하여 비교
                const lastKstDate = new Date(lastDate.getTime() + kstOffset);
                const todayKstDateOnly = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate()));
                const lastKstDateOnly = new Date(Date.UTC(lastKstDate.getUTCFullYear(), lastKstDate.getUTCMonth(), lastKstDate.getUTCDate()));
                const diffDays = Math.floor((todayKstDateOnly - lastKstDateOnly) / (24 * 60 * 60 * 1000));
                if (diffDays === 1) {
                    consecutiveDays += 1;
                } else if (diffDays > 1) {
                    consecutiveDays = 1;
                }
                // diffDays === 0인 경우는 위에서 ALREADY_ATTENDED로 처리됨
            } else {
                consecutiveDays = 1;
            }

            // 🔒 보너스 확인 (7일차에만 보너스, 7의 배수마다 X)
            // 연속 7일 달성 시 1회만 보너스 지급 (14일, 21일 등에서 추가 보너스 없음)
            const isBonus = consecutiveDays === TOKEN_CONFIG.STREAK_DAYS;
            const totalReward = TOKEN_CONFIG.ATTENDANCE + (isBonus ? TOKEN_CONFIG.ATTENDANCE_STREAK_BONUS : 0);

            // 출석 기록 저장
            transaction.set(attendanceRef, {
                userId,
                date: dateStr,
                tokens: totalReward,
                isBonus,
                consecutiveDays,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🔒 C-1 수정: FieldValue.increment() 사용으로 Race Condition 방지
            // 사용자 정보 업데이트 (신규 사용자면 set, 기존이면 update)
            // 리더보드용 cumulativeAttendanceDays 및 periodicEarnings 추가
            if (userDoc.exists) {
                transaction.update(userRef, {
                    tokens: admin.firestore.FieldValue.increment(totalReward),
                    totalEarned: admin.firestore.FieldValue.increment(totalReward),
                    lastAttendance: admin.firestore.FieldValue.serverTimestamp(),
                    consecutiveDays,
                    cumulativeAttendanceDays: admin.firestore.FieldValue.increment(1),
                    'periodicEarnings.weeklyEarned': admin.firestore.FieldValue.increment(totalReward),
                    'periodicEarnings.monthlyEarned': admin.firestore.FieldValue.increment(totalReward),
                    'periodicEarnings.seasonEarned': admin.firestore.FieldValue.increment(totalReward)
                });
            } else {
                transaction.set(userRef, {
                    tokens: totalReward,
                    totalEarned: totalReward,
                    lastAttendance: admin.firestore.FieldValue.serverTimestamp(),
                    consecutiveDays,
                    cumulativeAttendanceDays: 1,
                    periodicEarnings: {
                        weeklyEarned: totalReward,
                        monthlyEarned: totalReward,
                        seasonEarned: totalReward,
                        weekStart: admin.firestore.FieldValue.serverTimestamp(),
                        monthStart: admin.firestore.FieldValue.serverTimestamp(),
                        seasonStart: admin.firestore.FieldValue.serverTimestamp()
                    },
                    displayName: tokenProfile.displayName,
                    photoURL: tokenProfile.photoURL,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 토큰 내역 기록
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: totalReward,
                reason: isBonus ? `출석체크 + ${TOKEN_CONFIG.STREAK_DAYS}일 연속 보너스` : '출석체크',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { totalReward, consecutiveDays, isBonus };
        });

        // [칭호 비활성화] "지켜보고 있다" 칭호 판정
        // if (result.consecutiveDays >= 30) {
        //     (async () => {
        //         try {
        //             const existingTitle = await db.collection('userTitles')
        //                 .doc(`${userId}_hidden-watching`).get();
        //             if (existingTitle.exists) return;
        //             const [podiumSnap, h2hSnap, postsSnap, commentsSnap] = await Promise.all([
        //                 db.collection('podiumBets').where('userId', '==', userId).limit(1).get(),
        //                 db.collection('headToHeadBets').where('userId', '==', userId).limit(1).get(),
        //                 db.collection('posts').where('authorId', '==', userId).limit(1).get(),
        //                 db.collectionGroup('comments').where('authorId', '==', userId).limit(1).get()
        //             ]);
        //             if (podiumSnap.empty && h2hSnap.empty && postsSnap.empty && commentsSnap.empty) {
        //                 await awardTitleIfNotOwned(userId, 'hidden-watching');
        //             }
        //         } catch (e) {
        //             console.error('지켜보고 있다 칭호 판정 실패:', e.message);
        //         }
        //     })();
        // }

        res.json({
            success: true,
            reward: result.totalReward,
            consecutiveDays: result.consecutiveDays,
            isBonus: result.isBonus
        });

    } catch (error) {
        if (error.message === 'ALREADY_ATTENDED') {
            return res.status(400).json({ success: false, error: '오늘은 이미 출석체크를 완료했습니다.' });
        }
        console.error('출석체크 실패:', error);
        res.status(500).json({ success: false, error: '출석체크에 실패했습니다.' });
    }
});

// 첫 글 보너스 API
app.post('/api/token/first-post', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);

            const reward = TOKEN_CONFIG.FIRST_POST;

            if (!userDoc.exists) {
                // 사용자 문서가 없으면 생성하면서 첫 글 보너스 지급
                transaction.set(userRef, {
                    tokens: reward,
                    totalEarned: reward,
                    firstPostDate: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                const userData = userDoc.data();
                if (userData.firstPostDate) {
                    throw new Error('ALREADY_CLAIMED');
                }

                // 🔒 C-2 수정: FieldValue.increment() 사용으로 Race Condition 방지
                transaction.update(userRef, {
                    tokens: admin.firestore.FieldValue.increment(reward),
                    totalEarned: admin.firestore.FieldValue.increment(reward),
                    'periodicEarnings.weeklyEarned': admin.firestore.FieldValue.increment(reward),
                    'periodicEarnings.monthlyEarned': admin.firestore.FieldValue.increment(reward),
                    'periodicEarnings.seasonEarned': admin.firestore.FieldValue.increment(reward),
                    firstPostDate: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: reward,
                reason: '첫 글 작성 보너스',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { reward };
        });

        res.json({ success: true, reward: result.reward });

    } catch (error) {
        if (error.message === 'ALREADY_CLAIMED') {
            return res.json({ success: false, alreadyClaimed: true });
        }
        console.error('첫 글 보너스 실패:', error);
        res.status(500).json({ success: false, error: '보너스 지급에 실패했습니다.' });
    }
});

// 글 작성 쿨다운 검증 API (도배 방지 - 서버 검증)
const POST_COOLDOWN_MS = 60000; // 60초

app.post('/api/post/check-cooldown', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        // 사용자의 가장 최근 게시글 조회
        const lastPostQuery = await db.collection('posts')
            .where('authorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (lastPostQuery.empty) {
            // 첫 글이면 쿨다운 없음
            return res.json({ success: true, canPost: true });
        }

        const lastPostData = lastPostQuery.docs[0].data();
        const lastPostTime = lastPostData.createdAt?.toMillis() || 0;
        const now = Date.now();
        const elapsed = now - lastPostTime;

        if (elapsed < POST_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((POST_COOLDOWN_MS - elapsed) / 1000);
            return res.json({
                success: true,
                canPost: false,
                remainingSeconds,
                message: `도배 방지를 위해 ${remainingSeconds}초 후에 글을 작성할 수 있습니다.`
            });
        }

        return res.json({ success: true, canPost: true });

    } catch (error) {
        console.error('쿨다운 검증 실패:', error);
        // 오류 시에도 글 작성은 허용 (서비스 안정성 우선)
        res.json({ success: true, canPost: true });
    }
});

// 베팅 토큰 차감 API
app.post('/api/token/deduct', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { amount, reason } = req.body;

    // 금액 검증
    if (!Number.isInteger(amount) || amount < 1 || amount > 3000) {
        return res.status(400).json({ success: false, error: '잘못된 금액입니다.' });
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const currentTokens = userData.tokens || 0;

            if (currentTokens < amount) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 🔒 보안 강화: FieldValue.increment()로 Race Condition 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(-amount)
            });

            const historyRef = db.collection('tokenHistory').doc();
            // 🔒 보안 강화: reason 필드 길이 제한 (DoS 공격 방지)
            transaction.set(historyRef, {
                userId,
                amount: -amount,
                reason: String(reason || '토큰 사용').slice(0, 100),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { newBalance: currentTokens - amount };
        });

        res.json({ success: true, newBalance: result.newBalance });

    } catch (error) {
        if (error.message === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ success: false, error: '토큰이 부족합니다.' });
        }
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(400).json({ success: false, error: '사용자 정보가 없습니다.' });
        }
        console.error('토큰 차감 실패:', error);
        res.status(500).json({ success: false, error: '토큰 차감에 실패했습니다.' });
    }
});

// 사용자 토큰 정보 조회 API
app.get('/api/token/balance', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // 신규 사용자: 문서 생성 + Firebase Auth에서 정확한 프로필 가져오기
            const profile = await getAuthProfile(userId, req.user.name, req.user.picture);
            await userRef.set({
                tokens: 0,
                totalEarned: 0,
                consecutiveDays: 0,
                displayName: profile.displayName,
                photoURL: profile.photoURL,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.json({
                success: true,
                tokens: 0,
                totalEarned: 0,
                consecutiveDays: 0,
                createdAt: null
            });
        }

        const userData = userDoc.data();

        // 프로필 누락 시 Firebase Auth에서 동기화
        if (!userData.displayName || userData.displayName === '익명') {
            const profile = await getAuthProfile(userId, req.user.name, req.user.picture);
            if (profile.displayName !== '익명') {
                await userRef.update({
                    displayName: profile.displayName,
                    photoURL: profile.photoURL
                });
            }
        }

        res.json({
            success: true,
            tokens: userData.tokens || 0,
            totalEarned: userData.totalEarned || 0,
            consecutiveDays: userData.consecutiveDays || 0,
            lastAttendance: userData.lastAttendance,
            createdAt: userData.createdAt,
            selectedTeam: userData.selectedTeam || null,
            lastTeamChange: userData.lastTeamChange || null
        });

    } catch (error) {
        console.error('토큰 조회 실패:', error);
        res.status(500).json({ success: false, error: '토큰 조회에 실패했습니다.' });
    }
});

// 토큰 내역 조회 API (커서 기반 페이지네이션)
app.get('/api/token/history', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const cursor = req.query.cursor || null; // 마지막 문서 ID (커서)

    try {
        // 총 개수 조회
        const countSnapshot = await db.collection('tokenHistory')
            .where('userId', '==', userId)
            .count()
            .get();
        const totalCount = countSnapshot.data().count;

        // 쿼리 구성
        let query = db.collection('tokenHistory')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc');

        // 커서가 있으면 해당 문서 이후부터 조회
        if (cursor) {
            const cursorDoc = await db.collection('tokenHistory').doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.limit(limit).get();
        const history = snapshot.docs.map(doc => ({
            id: doc.id,
            amount: doc.data().amount,
            reason: doc.data().reason,
            timestamp: doc.data().timestamp
        }));

        // 다음 페이지 커서: 마지막 문서의 ID
        const nextCursor = snapshot.docs.length === limit
            ? snapshot.docs[snapshot.docs.length - 1].id
            : null;

        res.json({
            success: true,
            history,
            totalCount,
            nextCursor,
            hasMore: nextCursor !== null
        });

    } catch (error) {
        console.error('토큰 내역 조회 실패:', error);
        res.status(500).json({ success: false, error: '토큰 내역 조회에 실패했습니다.' });
    }
});

// ========================================
// 닉네임 변경 API (1회 제한)
// ========================================

// 금지어 목록 (욕설 + 선정적/성적 단어)
const BAD_WORDS = [
    // 욕설
    '시발', '씨발', '병신', '지랄', '개새끼', '좆', '보지', '자지',
    '창녀', '걸레', '니미', '느금', '애미', '애비', '장애인',
    '새끼', '개자식', '빡대가리', '쓰레기', '찐따', '씹', '븅신',
    // 선정적/성적 단어
    '섹스', '야동', '포르노', '성인', '성관계', '자위', '오르가즘',
    '강간', '음란', '변태', '노출', '페니스', '바기나', '딸딸이',
    '떡치', '박히', '따먹', '빨아', '핑보', '꼬추', '젖꼭지',
    '야설', '몰카', '도촬', '성매매', '원조교제', '조건만남',
    '풍속점', '안마방', '키스방', '오피', '유흥', '룸살롱'
];
const BAD_CONSONANTS = ['ㅅㅂ', 'ㅄ', 'ㅂㅅ', 'ㅈㄹ', 'ㄱㅅㄲ', 'ㅁㅊ', 'ㅈㅇ'];

/**
 * 금지어 포함 여부 확인
 * - 원본 텍스트 체크 + 숫자/공백/특수문자 제거 후 체크 (우회 방지)
 */
function containsBadWords(text) {
    const lowerText = text.toLowerCase();
    // 숫자, 공백, 특수문자(_제외) 제거한 버전 (씨1발, 씨 발 등 우회 방지)
    const strippedText = lowerText.replace(/[0-9\s~!@#$%^&*()\-+=\[\]{}|\\:;"'<>,.?/]/g, '');

    // 금지어 목록 체크 (원본 + stripped 버전 모두)
    for (const word of BAD_WORDS) {
        if (lowerText.includes(word) || strippedText.includes(word)) {
            return true;
        }
    }

    // 자음 조합 체크
    for (const consonant of BAD_CONSONANTS) {
        if (lowerText.includes(consonant) || strippedText.includes(consonant)) {
            return true;
        }
    }

    return false;
}

// 닉네임 변경 API
app.post('/api/user/nickname', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { nickname } = req.body;

    // 닉네임 유효성 검증
    if (!nickname || typeof nickname !== 'string') {
        return res.status(400).json({ success: false, error: '닉네임을 입력해주세요.' });
    }

    const trimmedNickname = nickname.trim();

    // 길이 검증 (2-10자)
    if (trimmedNickname.length < 2 || trimmedNickname.length > 10) {
        return res.status(400).json({ success: false, error: '닉네임은 2~10자로 입력해주세요.' });
    }

    // 금지어 검증
    if (containsBadWords(trimmedNickname)) {
        return res.status(400).json({ success: false, error: '사용할 수 없는 닉네임입니다.' });
    }

    // 특수문자 제한 (한글, 영문, 숫자, 공백, 언더스코어만 허용)
    const validNicknameRegex = /^[가-힣a-zA-Z0-9_\s]+$/;
    if (!validNicknameRegex.test(trimmedNickname)) {
        return res.status(400).json({ success: false, error: '닉네임에 특수문자를 사용할 수 없습니다.' });
    }

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        const userData = userDoc.data();
        const allowedByItem = userData.nicknameChangeAllowed === true;

        // 이미 닉네임 변경 이력이 있으면 거부 (아이템 사용 시 우회)
        if (userData.hasChangedNickname === true && !allowedByItem) {
            return res.status(400).json({ success: false, error: '닉네임은 1회만 변경 가능합니다. 닉네임 변경권을 사용해주세요.' });
        }

        // 닉네임 업데이트
        const updateData = {
            customDisplayName: trimmedNickname,
            hasChangedNickname: true,
            nicknameChangedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (allowedByItem) {
            updateData.nicknameChangeAllowed = false;
        }
        await userRef.update(updateData);

        res.json({ success: true, nickname: trimmedNickname });

    } catch (error) {
        console.error('닉네임 변경 실패:', error);
        res.status(500).json({ success: false, error: '닉네임 변경에 실패했습니다.' });
    }
});

// 닉네임 초기화 API (관리자 전용) - 부적절한 닉네임 초기화용
app.post('/api/admin/reset-nickname', async (req, res) => {
    if (!ADMIN_KEY) {
        return res.status(503).json({ success: false, error: '관리자 API가 비활성화되어 있습니다.' });
    }
    const adminKey = req.headers['x-admin-key'];
    if (!verifyAdminKey(adminKey)) {
        return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
    }
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const { uid, customDisplayName } = req.body;

    try {
        let targetUid = uid;

        // UID가 없으면 customDisplayName으로 검색
        if (!targetUid && customDisplayName) {
            const snapshot = await db.collection('users')
                .where('customDisplayName', '==', customDisplayName)
                .limit(1)
                .get();
            if (snapshot.empty) {
                return res.status(404).json({ success: false, error: '해당 닉네임의 사용자를 찾을 수 없습니다.' });
            }
            targetUid = snapshot.docs[0].id;
        }

        if (!targetUid) {
            return res.status(400).json({ success: false, error: 'uid 또는 customDisplayName을 제공해주세요.' });
        }

        const userRef = db.collection('users').doc(targetUid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        const oldNickname = userDoc.data().customDisplayName;
        await userRef.update({
            customDisplayName: admin.firestore.FieldValue.delete(),
            hasChangedNickname: false,
            nicknameChangedAt: admin.firestore.FieldValue.delete()
        });

        console.log(`[관리자] 닉네임 초기화: ${targetUid} (기존: ${oldNickname})`);
        res.json({ success: true, message: `닉네임 초기화 완료 (기존: ${oldNickname})`, uid: targetUid });
    } catch (error) {
        console.error('닉네임 초기화 실패:', error);
        res.status(500).json({ success: false, error: '닉네임 초기화에 실패했습니다.' });
    }
});

// 사용자 정보 조회 API (닉네임 변경 가능 여부 포함)
app.get('/api/user/profile', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return res.json({
                success: true,
                customDisplayName: null,
                hasChangedNickname: false
            });
        }

        const userData = userDoc.data();
        res.json({
            success: true,
            customDisplayName: userData.customDisplayName || null,
            hasChangedNickname: userData.hasChangedNickname || false
        });

    } catch (error) {
        console.error('사용자 정보 조회 실패:', error);
        res.status(500).json({ success: false, error: '사용자 정보 조회에 실패했습니다.' });
    }
});

// 공개 프로필 조회 API (인증 불필요)
app.get('/api/user/public-profile/:uid', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const { uid } = req.params;

    if (!uid || typeof uid !== 'string' || uid.length > 128) {
        return res.status(400).json({ success: false, error: '유효하지 않은 사용자 ID입니다.' });
    }

    try {
        // users 문서와 userCosmetics 문서 동시 조회
        const [userDoc, cosmeticsDoc] = await Promise.all([
            db.collection('users').doc(uid).get(),
            db.collection('userCosmetics').doc(uid).get()
        ]);

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }

        const userData = userDoc.data();
        const cosmeticsData = cosmeticsDoc.exists ? cosmeticsDoc.data() : null;

        // 공개 필드만 반환
        res.json({
            success: true,
            profile: {
                displayName: userData.displayName || '사용자',
                photoURL: userData.photoURL || null,
                tokens: userData.tokens || 0,
                consecutiveDays: userData.consecutiveDays || 0,
                createdAt: userData.createdAt || null,
                customDisplayName: cosmeticsData?.customDisplayName || null
            }
        });

    } catch (error) {
        console.error('공개 프로필 조회 실패:', error);
        res.status(500).json({ success: false, error: '프로필 조회에 실패했습니다.' });
    }
});

// 1:1 베팅 취소 API (토큰 환불)
app.post('/api/bet/h2h/cancel', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { betId } = req.body;

    if (!betId) {
        return res.status(400).json({ success: false, error: '베팅 ID가 필요합니다.' });
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;

    try {
        const result = await db.runTransaction(async (transaction) => {
            const betRef = db.collection('headToHeadBets').doc(betId);
            const userRef = db.collection('users').doc(userId);

            const betDoc = await transaction.get(betRef);
            if (!betDoc.exists) {
                throw new Error('BET_NOT_FOUND');
            }

            const bet = betDoc.data();

            if (bet.userId !== userId) {
                throw new Error('NOT_OWNER');
            }

            if (bet.status !== 'pending') {
                throw new Error('ALREADY_SETTLED');
            }

            // createdAt 검증
            if (!bet.createdAt) {
                throw new Error('INVALID_BET_DATA');
            }

            const createdAt = bet.createdAt.toDate();
            const now = new Date();
            const timeDiff = now - createdAt;

            if (timeDiff >= ONE_HOUR_MS) {
                throw new Error('TIME_EXPIRED');
            }

            // 사용자 정보 조회
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const refundAmount = bet.betAmount;

            // 🔒 C-4 수정: 환불 금액 유효성 검증
            if (!Number.isInteger(refundAmount) || refundAmount < 1 || refundAmount > 1000) {
                throw new Error('INVALID_REFUND_AMOUNT');
            }

            // 베팅 삭제
            transaction.delete(betRef);

            // 🔒 토큰 환불 - increment() 사용으로 동시성 문제 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(refundAmount)
            });

            // 토큰 히스토리 기록
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: refundAmount,
                reason: `1:1 베팅 취소 환불 (${bet.matchup?.driverA?.name || '?'} vs ${bet.matchup?.driverB?.name || '?'})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { refundAmount };
        });

        // 홈 프리뷰 캐시 무효화
        bettingPreviewCache = { data: null, timestamp: 0 };

        res.json({ success: true, refundAmount: result.refundAmount });

    } catch (error) {
        const errorMessages = {
            'BET_NOT_FOUND': '베팅을 찾을 수 없습니다.',
            'NOT_OWNER': '본인의 베팅만 취소할 수 있습니다.',
            'ALREADY_SETTLED': '이미 정산된 베팅은 취소할 수 없습니다.',
            'TIME_EXPIRED': '베팅 후 1시간이 지나 취소할 수 없습니다.',
            'USER_NOT_FOUND': '사용자를 찾을 수 없습니다.',
            'INVALID_BET_DATA': '베팅 데이터가 유효하지 않습니다.',
            'INVALID_REFUND_AMOUNT': '환불 금액이 유효하지 않습니다.'
        };

        if (errorMessages[error.message]) {
            return res.status(400).json({ success: false, error: errorMessages[error.message] });
        }

        console.error('1:1 베팅 취소 실패:', error);
        res.status(500).json({ success: false, error: '베팅 취소에 실패했습니다.' });
    }
});

// 포디움 베팅 취소 API (토큰 환불)
app.post('/api/bet/podium/cancel', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { betId } = req.body;

    if (!betId) {
        return res.status(400).json({ success: false, error: '베팅 ID가 필요합니다.' });
    }

    const ONE_HOUR_MS = 60 * 60 * 1000;

    try {
        const result = await db.runTransaction(async (transaction) => {
            const betRef = db.collection('podiumBets').doc(betId);
            const userRef = db.collection('users').doc(userId);

            const betDoc = await transaction.get(betRef);
            if (!betDoc.exists) {
                throw new Error('BET_NOT_FOUND');
            }

            const bet = betDoc.data();

            if (bet.userId !== userId) {
                throw new Error('NOT_OWNER');
            }

            if (bet.status !== 'pending') {
                throw new Error('ALREADY_SETTLED');
            }

            // createdAt 검증
            if (!bet.createdAt) {
                throw new Error('INVALID_BET_DATA');
            }

            const createdAt = bet.createdAt.toDate();
            const now = new Date();
            const timeDiff = now - createdAt;

            if (timeDiff >= ONE_HOUR_MS) {
                throw new Error('TIME_EXPIRED');
            }

            // 사용자 정보 조회
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const refundAmount = bet.totalAmount;

            // 🔒 C-4 수정: 환불 금액 유효성 검증 (포디움은 최대 3000 FC)
            if (!Number.isInteger(refundAmount) || refundAmount < 1 || refundAmount > 3000) {
                throw new Error('INVALID_REFUND_AMOUNT');
            }

            // 베팅 삭제
            transaction.delete(betRef);

            // 🔒 토큰 환불 - increment() 사용으로 동시성 문제 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(refundAmount)
            });

            // 토큰 히스토리 기록
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: refundAmount,
                reason: '포디움 베팅 취소 환불',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { refundAmount };
        });

        // 홈 프리뷰 캐시 무효화
        bettingPreviewCache = { data: null, timestamp: 0 };

        res.json({ success: true, refundAmount: result.refundAmount });

    } catch (error) {
        const errorMessages = {
            'BET_NOT_FOUND': '베팅을 찾을 수 없습니다.',
            'NOT_OWNER': '본인의 베팅만 취소할 수 있습니다.',
            'ALREADY_SETTLED': '이미 정산된 베팅은 취소할 수 없습니다.',
            'TIME_EXPIRED': '베팅 후 1시간이 지나 취소할 수 없습니다.',
            'USER_NOT_FOUND': '사용자를 찾을 수 없습니다.',
            'INVALID_BET_DATA': '베팅 데이터가 유효하지 않습니다.',
            'INVALID_REFUND_AMOUNT': '환불 금액이 유효하지 않습니다.'
        };

        if (errorMessages[error.message]) {
            return res.status(400).json({ success: false, error: errorMessages[error.message] });
        }

        console.error('포디움 베팅 취소 실패:', error);
        res.status(500).json({ success: false, error: '베팅 취소에 실패했습니다.' });
    }
});

// ============ 베팅 생성 API (보안 강화 - 서버에서만 처리) ============

// 서버 측 배당률 계산 함수 (클라이언트 조작 완전 방지)
function calculateServerOdds(seasonRank) {
    const safeRank = Math.max(1, Math.min(22, seasonRank || 22));
    const baseOdds = 1.3;
    const growthFactor = 0.12;
    const odds = baseOdds * Math.pow(1 + growthFactor, safeRank - 1);
    return Math.max(1.1, Math.min(50.0, Math.round(odds * 10) / 10));
}

// 1:1 베팅 동적 배당률 계산 (서버 측)
function calculateH2HServerOdds(rankA, rankB) {
    const k = 0.25;
    const probA = 1 / (1 + Math.exp(k * (rankA - rankB)));
    const probB = 1 - probA;
    const margin = 1.08; // 8% 하우스 엣지

    let oddsA = 1 / (probA * margin);
    let oddsB = 1 / (probB * margin);

    oddsA = Math.round(Math.max(1.05, Math.min(15.0, oddsA)) * 100) / 100;
    oddsB = Math.round(Math.max(1.05, Math.min(15.0, oddsB)) * 100) / 100;

    return { oddsForA: oddsA, oddsForB: oddsB };
}

// 레이스 시간 검증 헬퍼
// 🔒 보안 강화: 레이스 시작 시점에 베팅 마감 (클라이언트와 동일)
async function validateRaceTime(raceId) {
    if (!raceId) return { valid: false, error: '레이스 ID가 필요합니다.' };

    const raceDoc = await db.collection('races').doc(raceId).get();
    if (!raceDoc.exists) {
        return { valid: false, error: '유효하지 않은 레이스입니다.' };
    }

    const raceData = raceDoc.data();

    if (!raceData.startTime) {
        return { valid: false, error: '레이스 시간 데이터가 없습니다.' };
    }

    const now = admin.firestore.Timestamp.now();

    // 🔒 레이스 시작 시점에 베팅 마감
    if (now >= raceData.startTime) {
        return { valid: false, error: '베팅이 마감되었습니다. (레이스 시작)' };
    }

    return { valid: true, race: raceData };
}

// 포디움 베팅 생성 API (서버에서 배당률 계산)
app.post('/api/bet/podium', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { raceId, raceName, bets } = req.body;

    // 입력 검증
    if (!raceId || !raceName || !Array.isArray(bets) || bets.length === 0) {
        return res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
    }

    // 베팅 데이터 검증
    let totalAmount = 0;
    const validatedBets = [];

    for (const bet of bets) {
        // 필수 필드 검증
        if (!bet.position || !bet.driverNumber || !bet.driverName || !bet.betAmount) {
            return res.status(400).json({ success: false, error: '베팅 데이터가 불완전합니다.' });
        }

        // 포지션 검증 (1, 2, 3)
        if (![1, 2, 3].includes(bet.position)) {
            return res.status(400).json({ success: false, error: '유효하지 않은 포지션입니다.' });
        }

        // 금액 검증 (정수, 1-1000)
        if (!Number.isInteger(bet.betAmount) || bet.betAmount < 1 || bet.betAmount > 1000) {
            return res.status(400).json({ success: false, error: '베팅 금액은 1-1000 FC 범위의 정수여야 합니다.' });
        }

        // ✅ 서버에서 순위 독립 조회 + 배당률 계산 (클라이언트 값 완전 무시)
        const serverSeasonRank = await getServerSeasonRank(bet.driverNumber);
        const serverOdds = calculateServerOdds(serverSeasonRank);

        // 포디움 베팅은 P1/P2/P3 정확히 맞춰야 하므로 낮은 배당률 제한 없음
        // (1:1 베팅과 달리 맞추기 어려움)

        validatedBets.push({
            position: bet.position,
            driverNumber: bet.driverNumber,
            driverName: String(bet.driverName).slice(0, 50),
            seasonRank: serverSeasonRank,
            betAmount: bet.betAmount,
            odds: serverOdds  // 서버 계산 값 사용
        });

        totalAmount += bet.betAmount;
    }

    // 총 금액 검증
    if (totalAmount > 3000) {
        return res.status(400).json({ success: false, error: '총 베팅 금액은 3000 FC를 초과할 수 없습니다.' });
    }

    // 레이스 시간 사전 검증 (빠른 실패)
    const raceValidation = await validateRaceTime(raceId);
    if (!raceValidation.valid) {
        return res.status(400).json({ success: false, error: raceValidation.error });
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
            // 🔒 S-2: 트랜잭션 내부에서 레이스 시간 재검증 (Race Condition 방지)
            const raceRef = db.collection('races').doc(raceId);
            const raceDoc = await transaction.get(raceRef);
            if (!raceDoc.exists) {
                throw new Error('INVALID_RACE');
            }
            const raceData = raceDoc.data();
            if (raceData.startTime && admin.firestore.Timestamp.now() >= raceData.startTime) {
                throw new Error('RACE_STARTED');
            }

            // 마지막 1초 판정
            const msUntilStart = raceData.startTime.toMillis() - admin.firestore.Timestamp.now().toMillis();
            const isLastSecondBet = msUntilStart >= 0 && msUntilStart <= 1000;

            const userRef = db.collection('users').doc(userId);
            const betRef = db.collection('podiumBets').doc(`${raceId}_${userId}`);

            // 중복 베팅 확인
            const existingBet = await transaction.get(betRef);
            if (existingBet.exists) {
                throw new Error('ALREADY_BET');
            }

            // 사용자 토큰 확인
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const currentTokens = userData.tokens || 0;

            if (currentTokens < totalAmount) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 베팅 생성
            transaction.set(betRef, {
                userId,
                raceId,
                raceName: String(raceName).slice(0, 100),
                bets: validatedBets,
                totalAmount,
                status: 'pending',
                winAmount: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🔒 보안 강화: increment() 사용으로 동시성 문제 해결
            // 두 탭에서 동시 베팅 시 이중 차감 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(-totalAmount)
            });

            // 토큰 히스토리 (서버에서만 생성)
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: -totalAmount,
                reason: `포디움 베팅 (${raceName})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { totalAmount, newBalance: currentTokens - totalAmount, isLastSecondBet };
        });

        // [칭호 비활성화] 마지막 1초 칭호 부여
        // if (result.isLastSecondBet) {
        //     awardTitleIfNotOwned(userId, 'hidden-last-second').catch(e =>
        //         console.error('마지막 1초 칭호 부여 실패:', e.message)
        //     );
        // }

        res.json({
            success: true,
            totalAmount: result.totalAmount,
            newBalance: result.newBalance
        });

    } catch (error) {
        const errorMessages = {
            'ALREADY_BET': '이미 이 레이스에 베팅하셨습니다.',
            'USER_NOT_FOUND': '사용자 정보를 찾을 수 없습니다.',
            'INSUFFICIENT_BALANCE': '토큰이 부족합니다.',
            'INVALID_RACE': '유효하지 않은 레이스입니다.',
            'RACE_STARTED': '베팅이 마감되었습니다. (레이스 시작)'
        };

        if (errorMessages[error.message]) {
            return res.status(400).json({ success: false, error: errorMessages[error.message] });
        }

        console.error('포디움 베팅 생성 실패:', error);
        res.status(500).json({ success: false, error: '베팅에 실패했습니다.' });
    }
});

// 1:1 베팅 생성 API (서버에서 배당률 계산)
app.post('/api/bet/h2h', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { raceId, raceName, matchup, predictedWinner, betAmount } = req.body;

    // 입력 검증
    if (!raceId || !raceName || !matchup || !predictedWinner || !betAmount) {
        return res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
    }

    // 매치업 검증
    if (!matchup.driverA || !matchup.driverB) {
        return res.status(400).json({ success: false, error: '매치업 정보가 불완전합니다.' });
    }

    // 금액 검증 (정수, 1-1000)
    if (!Number.isInteger(betAmount) || betAmount < 1 || betAmount > 1000) {
        return res.status(400).json({ success: false, error: '베팅 금액은 1-1000 FC 범위의 정수여야 합니다.' });
    }

    // ✅ 서버에서 순위 독립 조회 + 배당률 계산 (클라이언트 값 완전 무시)
    const rankA = await getServerSeasonRank(matchup.driverA.number);
    const rankB = await getServerSeasonRank(matchup.driverB.number);
    const { oddsForA, oddsForB } = calculateH2HServerOdds(rankA, rankB);

    // 예측 승자에 따른 배당률 결정
    const isDriverAPredicted = matchup.driverA.number === predictedWinner;
    const serverOdds = isDriverAPredicted ? oddsForA : oddsForB;

    // 배당률 단계별 베팅 한도 (어뷰징 방지)
    let maxBetByOdds = 1000;
    if (serverOdds < 1.15) {
        maxBetByOdds = 50;
    } else if (serverOdds < 1.30) {
        maxBetByOdds = 200;
    } else if (serverOdds < 1.50) {
        maxBetByOdds = 500;
    }

    if (betAmount > maxBetByOdds) {
        return res.status(400).json({
            success: false,
            error: `배당률 ${serverOdds}x 구간은 최대 ${maxBetByOdds} FC까지만 베팅 가능합니다.`
        });
    }

    // 레이스 시간 사전 검증 (빠른 실패)
    const raceValidation = await validateRaceTime(raceId);
    if (!raceValidation.valid) {
        return res.status(400).json({ success: false, error: raceValidation.error });
    }

    // 매치업 ID 생성
    const driverNumbers = [matchup.driverA.number, matchup.driverB.number].sort((a, b) => a - b);
    const matchupId = `${driverNumbers[0]}_${driverNumbers[1]}`;

    const potentialWin = Math.floor(betAmount * serverOdds);

    try {
        const result = await db.runTransaction(async (transaction) => {
            // 🔒 S-2: 트랜잭션 내부에서 레이스 시간 재검증 (Race Condition 방지)
            const raceRef = db.collection('races').doc(raceId);
            const raceDoc = await transaction.get(raceRef);
            if (!raceDoc.exists) {
                throw new Error('INVALID_RACE');
            }
            const raceData = raceDoc.data();
            if (raceData.startTime && admin.firestore.Timestamp.now() >= raceData.startTime) {
                throw new Error('RACE_STARTED');
            }

            // 마지막 1초 판정
            const msUntilStart = raceData.startTime.toMillis() - admin.firestore.Timestamp.now().toMillis();
            const isLastSecondBet = msUntilStart >= 0 && msUntilStart <= 1000;

            // 동일 매치업 중복 베팅 검증
            const existingBetsSnap = await db.collection('headToHeadBets')
                .where('userId', '==', userId)
                .where('raceId', '==', raceId)
                .where('matchupId', '==', matchupId)
                .where('status', '==', 'pending')
                .limit(1)
                .get();

            if (!existingBetsSnap.empty) {
                throw new Error('DUPLICATE_MATCHUP');
            }

            const userRef = db.collection('users').doc(userId);
            const betRef = db.collection('headToHeadBets').doc();

            // 사용자 토큰 확인
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const currentTokens = userData.tokens || 0;

            if (currentTokens < betAmount) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 베팅 생성
            transaction.set(betRef, {
                userId,
                raceId,
                raceName: String(raceName).slice(0, 100),
                matchup: {
                    driverA: {
                        number: matchup.driverA.number,
                        name: String(matchup.driverA.name).slice(0, 50),
                        team: String(matchup.driverA.team || '').slice(0, 50),
                        seasonRank: rankA
                    },
                    driverB: {
                        number: matchup.driverB.number,
                        name: String(matchup.driverB.name).slice(0, 50),
                        team: String(matchup.driverB.team || '').slice(0, 50),
                        seasonRank: rankB
                    }
                },
                matchupId,
                predictedWinner,
                predictedWinnerName: isDriverAPredicted
                    ? String(matchup.driverA.name).slice(0, 50)
                    : String(matchup.driverB.name).slice(0, 50),
                betAmount,
                odds: serverOdds,  // 서버 계산 값
                potentialWin,
                status: 'pending',
                result: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 🔒 보안 강화: increment() 사용으로 동시성 문제 해결
            // 두 탭에서 동시 베팅 시 이중 차감 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(-betAmount)
            });

            // 토큰 히스토리 (서버에서만 생성)
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: -betAmount,
                reason: `1:1 베팅 (${matchup.driverA.name} vs ${matchup.driverB.name})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                betAmount,
                odds: serverOdds,
                potentialWin,
                newBalance: currentTokens - betAmount,
                isLastSecondBet
            };
        });

        // [칭호 비활성화] 마지막 1초 칭호 부여
        // if (result.isLastSecondBet) {
        //     awardTitleIfNotOwned(userId, 'hidden-last-second').catch(e =>
        //         console.error('마지막 1초 칭호 부여 실패:', e.message)
        //     );
        // }

        res.json({
            success: true,
            betAmount: result.betAmount,
            odds: result.odds,
            potentialWin: result.potentialWin,
            newBalance: result.newBalance
        });

    } catch (error) {
        const errorMessages = {
            'USER_NOT_FOUND': '사용자 정보를 찾을 수 없습니다.',
            'INSUFFICIENT_BALANCE': '토큰이 부족합니다.',
            'INVALID_RACE': '유효하지 않은 레이스입니다.',
            'RACE_STARTED': '베팅이 마감되었습니다. (레이스 시작)',
            'DUPLICATE_MATCHUP': '이미 이 매치업에 베팅하셨습니다. 동일 매치업에는 한 번만 베팅할 수 있습니다.'
        };

        if (errorMessages[error.message]) {
            return res.status(400).json({ success: false, error: errorMessages[error.message] });
        }

        console.error('1:1 베팅 생성 실패:', error);
        res.status(500).json({ success: false, error: '베팅에 실패했습니다.' });
    }
});

// ============ API 엔드포인트 ============

// 🔒 보안 강화: 서버 시간 동기화 API (클라이언트/서버 시간 불일치 해결)
app.get('/api/server-time', (req, res) => {
    const serverTime = new Date();
    res.json({
        success: true,
        serverTime: serverTime.toISOString(),
        timestamp: serverTime.getTime()
    });
});

// 뉴스 목록
app.get('/api/news', async (req, res) => {
    try {
        const news = await fetchAllNews();
        res.json({ success: true, articles: news });
    } catch (error) {
        console.error('뉴스 API 에러:', error);
        res.status(500).json({ success: false, error: '뉴스를 가져올 수 없습니다.' });
    }
});

// 허용된 뉴스 도메인 (SSRF 방지)
const ALLOWED_NEWS_DOMAINS = [
    'formula1.com',
    'www.formula1.com',
    'motorsport.com',
    'www.motorsport.com',
    'kr.motorsport.com',
    'autosport.com',
    'www.autosport.com'
];

/**
 * URL이 허용된 도메인인지 확인 (SSRF 방지)
 * 🔒 보안 강화: 정규식으로 정확한 도메인 매칭 (우회 공격 방지)
 * 예: attacker.formula1.com.evil.com 같은 악성 도메인 차단
 */
function isAllowedNewsUrl(urlString) {
    try {
        const url = new URL(urlString);
        // HTTPS만 허용
        if (url.protocol !== 'https:') return false;
        // 허용된 도메인인지 확인 (정규식으로 정확한 매칭)
        return ALLOWED_NEWS_DOMAINS.some(domain => {
            // 도메인의 점(.)을 이스케이프하고, 정확한 도메인 또는 서브도메인만 매칭
            const escapedDomain = domain.replace(/\./g, '\\.');
            const regex = new RegExp(`^(.*\\.)?${escapedDomain}$`);
            return regex.test(url.hostname);
        });
    } catch {
        return false;
    }
}

// 기사 상세 내용
app.get('/api/article', articleLimiter, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL이 필요합니다.' });
        }

        // SSRF 방지: 허용된 도메인만 스크래핑
        if (!isAllowedNewsUrl(url)) {
            return res.status(403).json({
                success: false,
                error: '허용되지 않은 URL입니다.'
            });
        }

        const content = await scrapeArticleContent(url);
        if (content) {
            // 2000자 근처에서 . 또는 "로 깔끔하게 끊기
            let trimmed = content;
            if (trimmed.length > 2000) {
                trimmed = trimmed.slice(0, 2000);
                const lastDot = trimmed.lastIndexOf('.');
                const lastQuote = trimmed.lastIndexOf('"');
                const cutAt = Math.max(lastDot, lastQuote);
                if (cutAt > 0) {
                    trimmed = trimmed.slice(0, cutAt + 1);
                }
            }
            const translatedContent = await translateToKorean(trimmed);
            res.json({
                success: true,
                content: translatedContent,
                contentOriginal: content
            });
        } else {
            res.json({ success: false, error: '기사 내용을 가져올 수 없습니다.' });
        }
    } catch (error) {
        console.error('기사 API 에러:', error);
        res.status(500).json({ success: false, error: '기사를 가져올 수 없습니다.' });
    }
});

// 캐시 초기화 (관리자 전용)
app.get('/api/refresh', async (req, res) => {
    // ADMIN_KEY가 설정되지 않으면 관리자 API 비활성화
    if (!ADMIN_KEY) {
        return res.status(503).json({
            success: false,
            error: '관리자 API가 비활성화되어 있습니다. 서버 환경변수를 확인하세요.'
        });
    }

    // H-6: API 키 인증 - 헤더만 허용 (URL 쿼리 금지: 로그/브라우저 히스토리 노출 방지)
    const adminKey = req.headers['x-admin-key'];
    if (!verifyAdminKey(adminKey)) {
        return res.status(401).json({ success: false, error: '인증이 필요합니다. x-admin-key 헤더를 사용하세요.' });
    }

    try {
        newsCache = { data: null, timestamp: 0 };
        const news = await fetchAllNews();
        res.json({ success: true, message: '캐시 갱신 완료', count: news.length });
    } catch (error) {
        console.error('캐시 갱신 에러:', error);
        res.status(500).json({ success: false, error: '캐시 갱신 실패' });
    }
});

// 수동 정산 API (관리자 전용)
app.post('/api/admin/settle', async (req, res) => {
    if (!ADMIN_KEY) {
        return res.status(503).json({ success: false, error: '관리자 API가 비활성화되어 있습니다.' });
    }
    const adminKey = req.headers['x-admin-key'];
    if (!verifyAdminKey(adminKey)) {
        return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
    }
    if (!db) {
        return res.status(503).json({ success: false, error: 'Firebase가 초기화되지 않았습니다.' });
    }

    const { round } = req.body;
    const season = new Date().getFullYear();

    // 정산 동시 실행 방지
    if (autoSettlement.isSettling) {
        return res.status(409).json({ success: false, error: '다른 정산이 진행 중입니다. 잠시 후 다시 시도해주세요.' });
    }

    try {
        console.log(`수동 정산 요청: 시즌 ${season}, 라운드 ${round || '최신'}`);

        const raceResults = await fetchF1RaceResults(season, round || null);

        if (!raceResults || !raceResults.results || raceResults.results.length === 0) {
            return res.status(404).json({ success: false, error: '레이스 결과를 찾을 수 없습니다.' });
        }

        if (!raceResults.round) {
            return res.status(400).json({ success: false, error: 'round 정보가 없어 raceId를 생성할 수 없습니다.' });
        }

        // raceId 생성 (RACE_SCHEDULE 날짜 기준 - 베팅 시 사용한 raceId와 일치)
        const roundNum = raceResults.round;
        const scheduleDate = RACE_SCHEDULE[roundNum - 1]?.date;
        const kst = scheduleDate
            ? getKSTDateParts(new Date(scheduleDate))
            : getKSTDateParts(new Date(raceResults.date));
        const raceId = `race_${roundNum}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;

        // 이미 정산된 레이스 확인
        const alreadySettled = await isRaceSettled(raceId);
        if (alreadySettled) {
            return res.json({ success: true, message: `이미 정산 완료된 레이스입니다: ${raceResults.raceName} (${raceId})` });
        }

        // 정산 실행
        await settleAllBets(raceId, raceResults);

        res.json({
            success: true,
            message: `정산 완료: ${raceResults.raceName}`,
            raceId,
            raceName: raceResults.raceName,
            round: roundNum
        });
    } catch (error) {
        console.error('❌ 수동 정산 실패:', error.message);
        res.status(500).json({ success: false, error: '정산 중 오류 발생: ' + error.message });
    }
});

// 사용자 프로필 마이그레이션 API (관리자 전용)
app.post('/api/admin/migrate-user-profiles', async (req, res) => {
    if (!ADMIN_KEY) {
        return res.status(503).json({
            success: false,
            error: '관리자 API가 비활성화되어 있습니다.'
        });
    }

    const adminKey = req.headers['x-admin-key'];
    if (!verifyAdminKey(adminKey)) {
        return res.status(401).json({
            success: false,
            error: '인증이 필요합니다. x-admin-key 헤더를 사용하세요.'
        });
    }

    if (!db) {
        return res.status(503).json({
            success: false,
            error: 'Firebase가 초기화되지 않았습니다.'
        });
    }

    try {
        console.log('🔄 사용자 프로필 마이그레이션 시작...');

        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;
        let updated = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];

        console.log(`📊 총 ${totalUsers}명의 사용자 처리 중...`);

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();

            if (userData.displayName && userData.displayName !== '익명') {
                skipped++;
                continue;
            }

            try {
                const authUser = await admin.auth().getUser(userId);
                const updateData = {};

                if (authUser.displayName) {
                    updateData.displayName = authUser.displayName;
                }
                if (authUser.photoURL) {
                    updateData.photoURL = authUser.photoURL;
                }

                if (Object.keys(updateData).length > 0) {
                    await db.collection('users').doc(userId).update(updateData);
                    updated++;
                    console.log(`✅ ${userId}: ${updateData.displayName || '(이름없음)'}`);
                } else {
                    skipped++;
                }
            } catch (authError) {
                if (authError.code === 'auth/user-not-found') {
                    skipped++;
                    console.log(`⚠️  ${userId}: Firebase Auth에 없음`);
                } else {
                    failed++;
                    errors.push({ userId, error: authError.message });
                    console.error(`❌ ${userId}: ${authError.message}`);
                }
            }
        }

        console.log('🎉 마이그레이션 완료!');
        console.log(`   - 업데이트: ${updated}명`);
        console.log(`   - 스킵: ${skipped}명`);
        console.log(`   - 실패: ${failed}명`);

        res.json({
            success: true,
            message: '사용자 프로필 마이그레이션 완료',
            stats: { total: totalUsers, updated, skipped, failed },
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error.message);
        res.status(500).json({
            success: false,
            error: '마이그레이션 중 오류 발생: ' + error.message
        });
    }
});

// ============ Discord 신고 알림 API ============

// Discord 신고 알림 Rate Limit (매우 엄격)
const reportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 3, // IP당 최대 3회
    message: { success: false, error: '신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

// 신고 알림 전송 (Discord Webhook URL은 서버에만 저장)
app.post('/api/report-notify', reportLimiter, async (req, res) => {
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

    // Webhook URL이 설정되지 않으면 무시 (알림 없이 성공 반환)
    if (!DISCORD_WEBHOOK_URL) {
        console.log('Discord Webhook URL이 설정되지 않음 - 알림 스킵');
        return res.json({ success: true, message: '알림 스킵됨 (Webhook 미설정)' });
    }

    try {
        const { reason, detail, postTitle, postAuthorName, reporterName } = req.body;

        // 필수 필드 검증
        if (!reason || !reporterName) {
            return res.status(400).json({ success: false, error: '필수 정보가 누락되었습니다.' });
        }

        // 입력값 길이 제한 (악용 방지)
        const safeReason = String(reason).slice(0, 100);
        const safeDetail = detail ? String(detail).slice(0, 500) : '없음';
        const safePostTitle = postTitle ? String(postTitle).slice(0, 200) : '알 수 없음';
        const safePostAuthorName = postAuthorName ? String(postAuthorName).slice(0, 50) : '알 수 없음';
        const safeReporterName = String(reporterName).slice(0, 50);

        // Discord로 전송
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: '🚨 새 신고 접수',
                color: 0xFF0000,
                fields: [
                    { name: '신고 사유', value: safeReason, inline: true },
                    { name: '상세 내용', value: safeDetail, inline: true },
                    { name: '신고 대상 게시글', value: safePostTitle },
                    { name: '게시글 작성자', value: safePostAuthorName, inline: true },
                    { name: '신고자', value: safeReporterName, inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        }, {
            timeout: 5000
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Discord 알림 전송 실패:', error.message);
        // Discord 실패해도 신고 자체는 성공으로 처리 (Firestore에는 저장됨)
        res.json({ success: true, message: '알림 전송 실패 (신고는 접수됨)' });
    }
});

// ========================================
// 베팅 정산 API (관리자 전용 - 서버 사이드)
// ========================================

// F1 결과 스크래핑 (formula1.com)

// 2026 드라이버 정보 (서버용 - 클라이언트 F1_DRIVERS_2026과 동일)
const F1_DRIVERS_2026_SERVER = [
    { number: 4, name: "Lando Norris", team: "McLaren", code: "NOR" },
    { number: 81, name: "Oscar Piastri", team: "McLaren", code: "PIA" },
    { number: 63, name: "George Russell", team: "Mercedes", code: "RUS" },
    { number: 12, name: "Kimi Antonelli", team: "Mercedes", code: "ANT" },
    { number: 33, name: "Max Verstappen", team: "Red Bull", code: "VER" },
    { number: 6, name: "Isack Hadjar", team: "Red Bull", code: "HAD" },
    { number: 44, name: "Lewis Hamilton", team: "Ferrari", code: "HAM" },
    { number: 16, name: "Charles Leclerc", team: "Ferrari", code: "LEC" },
    { number: 14, name: "Fernando Alonso", team: "Aston Martin", code: "ALO" },
    { number: 18, name: "Lance Stroll", team: "Aston Martin", code: "STR" },
    { number: 23, name: "Alexander Albon", team: "Williams", code: "ALB" },
    { number: 55, name: "Carlos Sainz", team: "Williams", code: "SAI" },
    { number: 30, name: "Liam Lawson", team: "Racing Bulls", code: "LAW" },
    { number: 36, name: "Arvid Lindblad", team: "Racing Bulls", code: "LIN" },
    { number: 10, name: "Pierre Gasly", team: "Alpine", code: "GAS" },
    { number: 43, name: "Franco Colapinto", team: "Alpine", code: "COL" },
    { number: 87, name: "Oliver Bearman", team: "Haas", code: "BEA" },
    { number: 31, name: "Esteban Ocon", team: "Haas", code: "OCO" },
    { number: 27, name: "Nico Hulkenberg", team: "Audi", code: "HUL" },
    { number: 5, name: "Gabriel Bortoleto", team: "Audi", code: "BOR" },
    { number: 77, name: "Valtteri Bottas", team: "Cadillac", code: "BOT" },
    { number: 11, name: "Sergio Perez", team: "Cadillac", code: "PER" }
];

// ========================================
// 서버 측 드라이버 순위 캐시 (배당률 조작 방지)
// ========================================
let serverDriverStandingsCache = { data: null, timestamp: 0 };
const STANDINGS_CACHE_TTL = 60 * 60 * 1000; // 1시간

// 2026 시즌 폴백 순위 (R1 호주 GP 후 기준, API 장애 시 사용)
const FALLBACK_DRIVER_STANDINGS_2026 = [
    { position: 1, driverNumber: 63, code: 'RUS' },
    { position: 2, driverNumber: 12, code: 'ANT' },
    { position: 3, driverNumber: 16, code: 'LEC' },
    { position: 4, driverNumber: 44, code: 'HAM' },
    { position: 5, driverNumber: 4, code: 'NOR' },
    { position: 6, driverNumber: 3, code: 'VER' },
    { position: 7, driverNumber: 87, code: 'BEA' },
    { position: 8, driverNumber: 36, code: 'LIN' },
    { position: 9, driverNumber: 5, code: 'BOR' },
    { position: 10, driverNumber: 10, code: 'GAS' },
    { position: 11, driverNumber: 31, code: 'OCO' },
    { position: 12, driverNumber: 23, code: 'ALB' },
    { position: 13, driverNumber: 30, code: 'LAW' },
    { position: 14, driverNumber: 43, code: 'COL' },
    { position: 15, driverNumber: 55, code: 'SAI' },
    { position: 16, driverNumber: 11, code: 'PER' },
    { position: 17, driverNumber: 6, code: 'HAD' },
    { position: 18, driverNumber: 81, code: 'PIA' },
    { position: 19, driverNumber: 27, code: 'HUL' },
    { position: 20, driverNumber: 14, code: 'ALO' },
    { position: 21, driverNumber: 77, code: 'BOT' },
    { position: 22, driverNumber: 18, code: 'STR' }
];

/**
 * 서버 측 드라이버 순위 조회 (f1api.dev → 캐시 → 폴백)
 * 배당률 계산 시 클라이언트 값 대신 이 함수의 결과를 사용
 */
async function fetchServerDriverStandings() {
    // 캐시 유효 시 즉시 반환
    if (serverDriverStandingsCache.data && (Date.now() - serverDriverStandingsCache.timestamp < STANDINGS_CACHE_TTL)) {
        return serverDriverStandingsCache.data;
    }

    const season = new Date().getFullYear();
    try {
        const response = await axios.get(`https://f1api.dev/api/${season}/drivers-championship`, { timeout: 15000 });
        const standings = response.data?.drivers_championship;

        if (standings && standings.length > 0) {
            // 포인트가 모두 0이면 시즌 미시작 → 폴백 사용
            const hasPoints = standings.some(s => s.points > 0);
            if (hasPoints) {
                const result = standings.map(s => {
                    const apiNumber = s.driver?.number;
                    const apiCode = s.driver?.shortName;

                    // 1차: 번호 매칭, 2차: 코드 매칭 (번호 변경 대비)
                    let matchedDriver = F1_DRIVERS_2026_SERVER.find(d => d.number === apiNumber);
                    if (!matchedDriver && apiCode) {
                        matchedDriver = F1_DRIVERS_2026_SERVER.find(d => d.code === apiCode);
                    }

                    return {
                        position: s.position,
                        driverNumber: matchedDriver ? matchedDriver.number : apiNumber,
                        code: matchedDriver ? matchedDriver.code : (apiCode || 'UNK')
                    };
                });

                serverDriverStandingsCache = { data: result, timestamp: Date.now() };
                console.log(`[순위 캐시] f1api.dev ${season} 시즌 순위 로드 성공 (${result.length}명)`);
                return result;
            }
            console.log('[순위 캐시] 시즌 미시작 (포인트 0) → 2026 폴백 사용');
        }
    } catch (error) {
        console.error('[순위 캐시] f1api.dev 조회 실패:', error.message);

        // 만료된 캐시라도 재사용
        if (serverDriverStandingsCache.data) {
            console.log('[순위 캐시] 만료된 캐시 재사용');
            // 10분 후 재시도 허용 (TTL을 10분 전으로 설정)
            serverDriverStandingsCache.timestamp = Date.now() - STANDINGS_CACHE_TTL + 10 * 60 * 1000;
            return serverDriverStandingsCache.data;
        }
    }

    // 최종 폴백: 2025 시즌 순위
    serverDriverStandingsCache = { data: FALLBACK_DRIVER_STANDINGS_2026, timestamp: Date.now() - STANDINGS_CACHE_TTL + 10 * 60 * 1000 };
    console.log('[순위 캐시] 2026 폴백 데이터 사용 (10분 후 재시도)');
    return FALLBACK_DRIVER_STANDINGS_2026;
}

/**
 * 특정 드라이버의 시즌 순위 조회
 * @param {number|string} driverNumber - 드라이버 번호
 * @returns {Promise<number>} - 순위 (매칭 실패 시 22)
 */
async function getServerSeasonRank(driverNumber) {
    const standings = await fetchServerDriverStandings();
    const num = parseInt(driverNumber);

    // 1차: 번호 매칭
    let entry = standings.find(s => s.driverNumber === num);
    if (entry) return entry.position;

    // 2차: 코드 매칭 (번호-코드 매핑을 통해)
    const driverInfo = F1_DRIVERS_2026_SERVER.find(d => d.number === num);
    if (driverInfo) {
        entry = standings.find(s => s.code === driverInfo.code);
        if (entry) return entry.position;
    }

    return 22; // 기본값
}

// 드라이버 번호로 정보 조회 (서버용)
function getDriverInfoByNumber(driverNumber) {
    const driver = F1_DRIVERS_2026_SERVER.find(d => d.number === parseInt(driverNumber));
    if (driver) {
        const nameParts = driver.name.split(' ');
        return {
            number: String(driver.number),
            code: driver.code,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(' '),
            team: driver.team
        };
    }
    return null;
}

// 드라이버 코드로 정보 조회
function getDriverInfoByCode(code) {
    if (!code) return null;
    const driver = F1_DRIVERS_2026_SERVER.find(d => d.code === code.toUpperCase());
    if (driver) {
        const nameParts = driver.name.split(' ');
        return {
            number: String(driver.number),
            code: driver.code,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(' '),
            team: driver.team
        };
    }
    return null;
}

// 드라이버 이름(name/surname)으로 정보 조회 (3차 폴백 - 번호/코드 불일치 대비)
function getDriverInfoByName(name, surname) {
    if (!name) return null;
    const fullName = `${name} ${surname || ''}`.trim().toLowerCase();
    const driver = F1_DRIVERS_2026_SERVER.find(d =>
        d.name.toLowerCase() === fullName ||
        d.name.toLowerCase().includes(name.toLowerCase())
    );
    if (driver) {
        const nameParts = driver.name.split(' ');
        return {
            number: String(driver.number),
            code: driver.code,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(' '),
            team: driver.team
        };
    }
    return null;
}

/**
 * RACE_SCHEDULE 기반 최근 완료 라운드 탐색
 * 레이스 시작 시간 + 3시간(레이스 종료 예상) 지나야 완료로 판단
 */
function findLatestCompletedRound() {
    const now = new Date();
    for (let i = RACE_SCHEDULE.length - 1; i >= 0; i--) {
        const raceDate = new Date(RACE_SCHEDULE[i].date);
        const raceEndEstimate = new Date(raceDate.getTime() + 3 * 60 * 60 * 1000);
        if (raceEndEstimate < now) {
            return i + 1; // 1-indexed round
        }
    }
    return null;
}

/**
 * formula1.com 스크래핑으로 레이스 결과 조회
 * @param {number} season - 시즌 연도
 * @param {number|null} round - 라운드 번호 (null이면 최신 완료 레이스)
 */
async function fetchF1RaceResults(season, round) {
    try {
        // 라운드 미지정 시 RACE_SCHEDULE에서 최근 완료 라운드 탐색
        if (!round) {
            round = findLatestCompletedRound();
            if (!round) {
                console.log('formula1.com scrape: 완료된 레이스 없음 (RACE_SCHEDULE 기준)');
                return null;
            }
        }

        const raceInfo = F1_RACE_IDS_2026[round];
        if (!raceInfo) {
            console.log(`formula1.com scrape: ${round} 라운드 매핑 없음`);
            return null;
        }

        const url = `https://www.formula1.com/en/results/${season}/races/${raceInfo.id}/${raceInfo.slug}/race-result`;
        console.log(`formula1.com scrape 요청: ${url}`);

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const rows = $('table tbody tr');

        if (rows.length === 0) {
            console.log(`formula1.com scrape: ${round} 라운드 결과 테이블 없음 (아직 미진행)`);
            return null;
        }

        const results = [];
        rows.each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length < 7) return;

            const posText = $(cells[0]).text().trim();
            const carNumber = $(cells[1]).text().trim();
            const driverCell = $(cells[2]);
            // 드라이버 셀에서 3-letter code 추출 (마지막 span 또는 대문자 3글자)
            const driverCode = driverCell.find('span.f1-uppercase').last().text().trim()
                || driverCell.text().match(/\b([A-Z]{3})\b/)?.[1]
                || '';
            const team = $(cells[3]).text().trim();
            const timeOrStatus = $(cells[5]).text().trim();

            // Status 판정
            let position, status;
            const dnfStatuses = ['DNF', 'DNS', 'DSQ', 'NC'];
            if (dnfStatuses.includes(posText.toUpperCase())) {
                position = null;
                status = posText.toUpperCase() === 'NC' ? 'DNF' : posText.toUpperCase();
            } else if (dnfStatuses.includes(timeOrStatus.toUpperCase())) {
                position = null;
                status = timeOrStatus.toUpperCase() === 'NC' ? 'DNF' : timeOrStatus.toUpperCase();
            } else {
                position = parseInt(posText) || null;
                status = 'Finished';
            }

            // 드라이버 매칭: 코드 → 번호 → 폴백
            const driverInfo = getDriverInfoByCode(driverCode)
                || getDriverInfoByNumber(carNumber)
                || {
                    number: String(carNumber || 0),
                    code: driverCode || 'UNK',
                    firstName: '',
                    lastName: driverCode || `Driver ${carNumber}`
                };

            results.push({
                position,
                driver: {
                    number: driverInfo.number,
                    code: driverInfo.code,
                    firstName: driverInfo.firstName,
                    lastName: driverInfo.lastName
                },
                constructor: driverInfo.team || team,
                status
            });
        });

        if (results.length === 0) {
            console.log(`formula1.com scrape: ${round} 라운드 파싱 결과 0건`);
            return null;
        }

        console.log(`formula1.com scrape: ${round} 라운드 ${results.length}명 결과 파싱 완료`);
        return {
            season: String(season),
            round,
            raceName: RACE_SCHEDULE[round - 1]?.name || 'Unknown Race',
            date: RACE_SCHEDULE[round - 1]?.date || '',
            results
        };
    } catch (error) {
        if (error.response?.status === 404) {
            console.log(`formula1.com scrape: ${season} 시즌 ${round} 라운드 결과 없음 (404)`);
        } else {
            console.error('formula1.com scrape 실패:', error.message);
        }
        return null;
    }
}

// Batch 분할 처리 상수
const BATCH_LIMIT = 166; // 500개 작업 / 3개 작업(bet update, user update, history) = 약 166

// ========================================
// 배당률 재계산 (서버 사이드 - 조작 방지)
// ========================================

// H2H 배당률 설정 (constants.js와 동일하게 유지)
const H2H_SERVER_CONFIG = {
    HOUSE_EDGE: 0.08,
    MIN_ODDS: 1.05,
    MAX_ODDS: 15.0
};

/**
 * 순위 기반 배당률 계산 (클라이언트 로직과 동일)
 * @param {number} rank - 드라이버 시즌 순위 (1-22)
 * @returns {number} 기본 배당률
 */
function getOddsFromRankServer(rank) {
    const safeRank = Math.max(1, Math.min(22, rank || 22));
    const baseOdds = 1.3;
    const growthFactor = 0.12;
    const odds = baseOdds * Math.pow(1 + growthFactor, safeRank - 1);
    return Math.max(H2H_SERVER_CONFIG.MIN_ODDS, Math.min(H2H_SERVER_CONFIG.MAX_ODDS, odds));
}

/**
 * 1:1 베팅 동적 배당률 계산 (클라이언트 로직과 동일)
 * @param {number} rankA - 드라이버 A 순위
 * @param {number} rankB - 드라이버 B 순위
 * @returns {{ oddsForA: number, oddsForB: number }}
 */
function calculateDynamicOddsServer(rankA, rankB) {
    const rankDiff = rankA - rankB;
    const k = 0.25; // 순위당 승률 변화 계수

    // 시그모이드 함수로 승률 계산
    const probA = 1 / (1 + Math.exp(k * rankDiff));
    const probB = 1 - probA;

    // 하우스 엣지 적용
    const margin = 1 + H2H_SERVER_CONFIG.HOUSE_EDGE;

    let oddsA = 1 / (probA * margin);
    let oddsB = 1 / (probB * margin);

    // 범위 제한 및 반올림
    oddsA = Math.round(Math.max(H2H_SERVER_CONFIG.MIN_ODDS, Math.min(H2H_SERVER_CONFIG.MAX_ODDS, oddsA)) * 100) / 100;
    oddsB = Math.round(Math.max(H2H_SERVER_CONFIG.MIN_ODDS, Math.min(H2H_SERVER_CONFIG.MAX_ODDS, oddsB)) * 100) / 100;

    return { oddsForA: oddsA, oddsForB: oddsB };
}

/**
 * 1:1 베팅 데이터에서 서버 측 배당률 재계산
 * @param {Object} bet - 베팅 데이터
 * @returns {number} 서버 계산 배당률
 */
function recalculateOddsServer(bet) {
    const driverA = bet.matchup?.driverA;
    const driverB = bet.matchup?.driverB;

    // 순위 정보가 없으면 클라이언트 odds 사용 (범위 제한)
    if (!driverA?.seasonRank || !driverB?.seasonRank) {
        console.warn(`⚠️  순위 정보 없음 (betId: ${bet.id || 'unknown'}), 클라이언트 odds 범위 제한 적용`);
        return Math.max(H2H_SERVER_CONFIG.MIN_ODDS, Math.min(H2H_SERVER_CONFIG.MAX_ODDS, bet.odds || H2H_SERVER_CONFIG.MIN_ODDS));
    }

    const { oddsForA, oddsForB } = calculateDynamicOddsServer(driverA.seasonRank, driverB.seasonRank);

    // 예측한 승자에 따라 배당률 반환
    const predictedWinner = bet.predictedWinner;
    const isDriverAPredicted = driverA.number === predictedWinner;

    const serverOdds = isDriverAPredicted ? oddsForA : oddsForB;

    // 클라이언트 odds와 차이가 크면 경고 로그
    const clientOdds = bet.odds || 0;
    const oddsDiff = Math.abs(serverOdds - clientOdds);
    if (oddsDiff > 0.5) {
        console.warn(`⚠️  H2H 배당률 조작 의심: client=${clientOdds}, server=${serverOdds}, diff=${oddsDiff.toFixed(2)}, user=${bet.userId}`);
    }

    return serverOdds;
}

// 포디움 베팅 배당률 설정
const PODIUM_SERVER_CONFIG = {
    HOUSE_EDGE: 0.1,
    MIN_ODDS: 1.1,
    MAX_ODDS: 50.0
};

/**
 * 포디움 베팅 배당률 재계산 (순위 기반)
 * @param {Object} betItem - 개별 베팅 아이템 (position, driverNumber, seasonRank, odds 등)
 * @returns {number} 서버 계산 배당률
 */
function recalculatePodiumOddsServer(betItem) {
    // 순위 정보가 없으면 클라이언트 odds 사용 (범위 제한)
    if (!betItem.seasonRank) {
        console.warn(`⚠️  포디움 순위 정보 없음 (driver: ${betItem.driverNumber}), 클라이언트 odds 범위 제한 적용`);
        return Math.max(PODIUM_SERVER_CONFIG.MIN_ODDS, Math.min(PODIUM_SERVER_CONFIG.MAX_ODDS, betItem.odds || PODIUM_SERVER_CONFIG.MIN_ODDS));
    }

    // 순위 기반 기본 배당률 계산
    const baseOdds = getOddsFromRankServer(betItem.seasonRank);

    // 포디움은 더 넓은 범위 허용
    const serverOdds = Math.round(Math.max(PODIUM_SERVER_CONFIG.MIN_ODDS, Math.min(PODIUM_SERVER_CONFIG.MAX_ODDS, baseOdds)) * 10) / 10;

    // 클라이언트 odds와 차이가 크면 경고 로그
    const clientOdds = betItem.odds || 0;
    const oddsDiff = Math.abs(serverOdds - clientOdds);
    if (oddsDiff > 1.0) {
        console.warn(`⚠️  포디움 배당률 조작 의심: driver=${betItem.driverNumber}, client=${clientOdds}, server=${serverOdds}, diff=${oddsDiff.toFixed(2)}`);
    }

    return serverOdds;
}

// ========================================
// 레이스 컬렉션 초기화 (베팅 시간 검증용)
// ========================================

// 2026 시즌 레이스 일정 (클라이언트 utils.js와 동일, 한국 시간 KST)
// 출처: https://www.formula1.com/en/racing/2026
const RACE_SCHEDULE = [
    { name: "호주 그랑프리", circuit: "앨버트 파크 서킷 · 멜버른", date: "2026-03-08T13:00:00+09:00" },
    { name: "중국 그랑프리", circuit: "상하이 인터내셔널 서킷 · 상하이", date: "2026-03-15T16:00:00+09:00" },
    { name: "일본 그랑프리", circuit: "스즈카 서킷 · 스즈카", date: "2026-03-29T14:00:00+09:00" },
    { name: "바레인 그랑프리", circuit: "바레인 인터내셔널 서킷 · 사키르", date: "2026-04-13T00:00:00+09:00" },
    { name: "사우디 아라비아 그랑프리", circuit: "제다 코르니쉬 서킷 · 제다", date: "2026-04-20T02:00:00+09:00" },
    { name: "마이애미 그랑프리", circuit: "마이애미 인터내셔널 오토드롬 · 마이애미", date: "2026-05-04T05:00:00+09:00" },
    { name: "캐나다 그랑프리", circuit: "질 빌뇌브 서킷 · 몬트리올", date: "2026-05-25T05:00:00+09:00" },
    { name: "모나코 그랑프리", circuit: "몬테카를로 시가지 서킷 · 모나코", date: "2026-06-07T22:00:00+09:00" },
    { name: "스페인 그랑프리", circuit: "카탈루냐 서킷 · 바르셀로나", date: "2026-06-14T22:00:00+09:00" },
    { name: "오스트리아 그랑프리", circuit: "레드불 링 · 슈필베르크", date: "2026-06-28T22:00:00+09:00" },
    { name: "영국 그랑프리", circuit: "실버스톤 서킷 · 실버스톤", date: "2026-07-05T23:00:00+09:00" },
    { name: "벨기에 그랑프리", circuit: "스파-프랑코르샹 · 스파", date: "2026-07-19T22:00:00+09:00" },
    { name: "헝가리 그랑프리", circuit: "헝가로링 · 부다페스트", date: "2026-07-26T22:00:00+09:00" },
    { name: "네덜란드 그랑프리", circuit: "잔드보르트 서킷 · 잔드보르트", date: "2026-08-23T22:00:00+09:00" },
    { name: "이탈리아 그랑프리", circuit: "몬자 서킷 · 몬자", date: "2026-09-06T22:00:00+09:00" },
    { name: "마드리드 그랑프리", circuit: "마드리드 시가지 서킷 · 마드리드", date: "2026-09-13T22:00:00+09:00" },
    { name: "아제르바이잔 그랑프리", circuit: "바쿠 시티 서킷 · 바쿠", date: "2026-09-26T20:00:00+09:00" },
    { name: "싱가포르 그랑프리", circuit: "마리나 베이 시가지 서킷 · 싱가포르", date: "2026-10-11T21:00:00+09:00" },
    { name: "미국 그랑프리", circuit: "서킷 오브 디 아메리카스 · 오스틴", date: "2026-10-26T05:00:00+09:00" },
    { name: "멕시코 그랑프리", circuit: "에르마노스 로드리게스 서킷 · 멕시코시티", date: "2026-11-02T05:00:00+09:00" },
    { name: "브라질 그랑프리", circuit: "인테르라고스 · 상파울루", date: "2026-11-09T02:00:00+09:00" },
    { name: "라스베가스 그랑프리", circuit: "라스베가스 스트립 서킷 · 라스베가스", date: "2026-11-22T13:00:00+09:00" },
    { name: "카타르 그랑프리", circuit: "루사일 인터내셔널 서킷 · 루사일", date: "2026-11-30T01:00:00+09:00" },
    { name: "아부다비 그랑프리", circuit: "야스 마리나 서킷 · 아부다비", date: "2026-12-06T22:00:00+09:00" }
];

// formula1.com 결과 페이지 race ID + slug 매핑 (2026 시즌)
// URL: https://www.formula1.com/en/results/2026/races/{id}/{slug}/race-result
const F1_RACE_IDS_2026 = {
    1:  { id: 1279, slug: 'australia' },
    2:  { id: 1280, slug: 'china' },
    3:  { id: 1281, slug: 'japan' },
    4:  { id: 1282, slug: 'bahrain' },
    5:  { id: 1283, slug: 'saudi-arabia' },
    6:  { id: 1284, slug: 'miami' },
    7:  { id: 1285, slug: 'canada' },
    8:  { id: 1286, slug: 'monaco' },
    9:  { id: 1287, slug: 'spain' },
    10: { id: 1288, slug: 'austria' },
    11: { id: 1289, slug: 'great-britain' },
    12: { id: 1290, slug: 'belgium' },
    13: { id: 1291, slug: 'hungary' },
    14: { id: 1292, slug: 'netherlands' },
    15: { id: 1293, slug: 'italy' },
    16: { id: 1294, slug: 'madrid' },
    17: { id: 1295, slug: 'azerbaijan' },
    18: { id: 1296, slug: 'singapore' },
    19: { id: 1297, slug: 'united-states' },
    20: { id: 1298, slug: 'mexico' },
    21: { id: 1299, slug: 'brazil' },
    22: { id: 1300, slug: 'las-vegas' },
    23: { id: 1301, slug: 'qatar' },
    24: { id: 1302, slug: 'abu-dhabi' }
};

/**
 * KST 기준 날짜 부분 추출 (타임존 변환 후 raceId 생성용)
 * UTC 기준 getDate()가 KST 날짜와 다를 수 있으므로 KST 기준으로 변환
 */
function getKSTDateParts(date) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return {
        year: kst.getUTCFullYear(),
        month: kst.getUTCMonth() + 1,
        day: kst.getUTCDate()
    };
}

// RACE_SCHEDULE 날짜 기반 round 매칭 (API 순서 불일치 대비 안전장치)
function findRoundFromSchedule(raceDate) {
    const target = getKSTDateParts(new Date(raceDate));
    for (let i = 0; i < RACE_SCHEDULE.length; i++) {
        const sched = getKSTDateParts(new Date(RACE_SCHEDULE[i].date));
        if (sched.year === target.year && sched.month === target.month && sched.day === target.day) {
            return i + 1;
        }
    }
    return null;
}

/**
 * races 컬렉션 초기화 - Firestore 규칙에서 베팅 시간 검증에 사용
 */
async function initRacesCollection() {
    if (!db) {
        console.log('⚠️  Firebase 미초기화 - races 컬렉션 초기화 스킵');
        return;
    }

    try {
        console.log('📅 races 컬렉션 초기화 중...');

        const batch = db.batch();

        for (let i = 0; i < RACE_SCHEDULE.length; i++) {
            const race = RACE_SCHEDULE[i];
            const raceDate = new Date(race.date);

            // raceId 형식: race_{round}_{YYYYMMDD} (KST 기준 날짜)
            const kst = getKSTDateParts(raceDate);
            const raceId = `race_${i + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;

            const raceRef = db.collection('races').doc(raceId);
            batch.set(raceRef, {
                name: race.name,
                circuit: race.circuit,
                startTime: admin.firestore.Timestamp.fromDate(raceDate),
                round: i + 1,
                season: raceDate.getFullYear()
            }, { merge: true });
            console.log(`  [${i + 1}] ${raceId} | ${race.name}`);
        }

        await batch.commit();
        console.log(`✅ races 컬렉션 초기화 완료 (${RACE_SCHEDULE.length}개 레이스)`);

    } catch (error) {
        console.error('❌ races 컬렉션 초기화 실패:', error.message);
    }
}

// ========================================
// 자동 정산 시스템 (영속성 강화)
// ========================================

const autoSettlement = {
    settledRaces: new Set(),      // 메모리 캐시 (Firestore와 동기화)
    lastCheckedRound: null,       // 마지막으로 확인한 라운드
    checkInterval: 5 * 60 * 1000,    // 5분 (결과 감시 간격)
    timer: null,
    currentRaceRound: null,       // 현재 감시 중인 라운드
    consecutiveFailures: 0,       // 연속 API 실패 카운터
    MAX_CONSECUTIVE_FAILURES: 5,  // Discord 알림 트리거 횟수
    isInitialized: false,         // 초기화 완료 여부
    isSettling: false             // 정산 실행 중 잠금 (수동/자동 동시 실행 방지)
};

/**
 * 🔒 Firestore에서 기존 정산 기록 로드
 * 서버 재시작 시에도 정산 상태 유지
 */
async function loadSettlementHistory() {
    try {
        console.log('📂 기존 정산 기록 로드 중...');

        const snapshot = await db.collection('settlementHistory')
            .where('status', '==', 'completed')
            .get();

        snapshot.forEach(doc => {
            autoSettlement.settledRaces.add(doc.id);
        });

        console.log(`✅ 정산 기록 로드 완료: ${autoSettlement.settledRaces.size}개 레이스`);
        return true;
    } catch (error) {
        console.error('❌ 정산 기록 로드 실패:', error.message);
        return false;
    }
}

/**
 * 🔒 정산 완료 기록을 Firestore에 저장
 * @param {string} raceId - 레이스 ID
 * @param {object} results - 정산 결과 요약
 */
async function saveSettlementRecord(raceId, raceResults, h2hResult, podiumResult) {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await db.collection('settlementHistory').doc(raceId).set({
                raceId,
                raceName: raceResults.raceName,
                round: raceResults.round,
                season: new Date(raceResults.date).getFullYear(),
                status: 'completed',
                h2h: {
                    total: h2hResult.total,
                    won: h2hResult.won,
                    lost: h2hResult.lost,
                    void: h2hResult.void
                },
                podium: {
                    total: podiumResult.total,
                    won: podiumResult.won,
                    lost: podiumResult.lost
                },
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 메모리 캐시도 업데이트
            autoSettlement.settledRaces.add(raceId);

            console.log(`정산 기록 저장 완료: ${raceId}`);
            return; // 성공 시 즉시 반환
        } catch (error) {
            console.error(`정산 기록 저장 실패 (시도 ${attempt}/${MAX_RETRIES}):`, error.message);
            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * attempt;
                console.log(`${delay}ms 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // 최종 실패 - 메모리 캐시라도 업데이트하여 현재 세션 내 중복 정산 방지
                autoSettlement.settledRaces.add(raceId);
                console.error(`정산 기록 저장 최종 실패: ${raceId} - 메모리 캐시만 업데이트됨 (서버 재시작 시 재정산 위험)`);
                throw error;
            }
        }
    }
}

/**
 * 🔒 Firestore에서 정산 완료 여부 확인
 * 메모리 캐시 미스 시 Firestore 직접 조회
 */
async function isRaceSettled(raceId) {
    // 1. 메모리 캐시 확인
    if (autoSettlement.settledRaces.has(raceId)) {
        return true;
    }

    // 2. Firestore 직접 조회 (캐시 미스 대비)
    try {
        const doc = await db.collection('settlementHistory').doc(raceId).get();
        if (doc.exists && doc.data().status === 'completed') {
            // 캐시에 추가
            autoSettlement.settledRaces.add(raceId);
            return true;
        }
    } catch (error) {
        console.error('❌ 정산 기록 조회 실패:', error.message);
    }

    return false;
}

/**
 * 자동 정산 시스템 초기화
 */
async function initAutoSettlement() {
    if (!db) {
        console.log('자동 정산: Firebase 미초기화 - 비활성화');
        return;
    }

    console.log('자동 정산 시스템 초기화 중...');

    // 기존 정산 기록 로드 (서버 재시작 시 중복 정산 방지)
    const loaded = await loadSettlementHistory();
    if (!loaded) {
        console.error('정산 기록 로드 실패 - 안전을 위해 자동 정산 비활성화');
        console.error('수동으로 /api/admin/settle API를 사용하세요.');
        return;
    }

    autoSettlement.isInitialized = true;
    console.log('자동 정산 시스템 시작 (레이스 스케줄 기반)');

    // 스케줄 기반 다음 체크 예약
    scheduleNextCheck();
}

/**
 * RACE_SCHEDULE 기반 다음 체크 시점 계산
 * @returns {{ type: 'wait'|'check_now'|'season_end', time?: Date, round?: number }}
 */
function getNextCheckTime() {
    const now = new Date();

    for (let i = 0; i < RACE_SCHEDULE.length; i++) {
        const raceStart = new Date(RACE_SCHEDULE[i].date);
        const checkStart = new Date(raceStart.getTime() + 1 * 60 * 60 * 1000); // 레이스 시작 + 1시간
        const kst = getKSTDateParts(raceStart);
        const raceId = `race_${i + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;

        // 이미 정산된 레이스는 스킵
        if (autoSettlement.settledRaces.has(raceId)) {
            continue;
        }

        if (checkStart > now) {
            // 아직 체크 시간 안 됨 -> 이 시간에 깨어남
            return { type: 'wait', time: checkStart, round: i + 1, raceName: RACE_SCHEDULE[i].name };
        }

        // 체크 시간 지났고 미정산 -> 즉시 체크
        return { type: 'check_now', round: i + 1, raceName: RACE_SCHEDULE[i].name };
    }

    // 시즌 종료 (모든 레이스 정산 완료)
    return { type: 'season_end' };
}

/**
 * 스케줄 기반 다음 체크 예약
 */
function scheduleNextCheck() {
    // 기존 타이머 정리
    if (autoSettlement.timer) {
        clearTimeout(autoSettlement.timer);
        autoSettlement.timer = null;
    }

    const next = getNextCheckTime();

    if (next.type === 'season_end') {
        console.log('자동 정산: 시즌 종료 - 모든 레이스 정산 완료');
        return;
    }

    if (next.type === 'wait') {
        const waitMs = next.time.getTime() - Date.now();
        const waitHours = (waitMs / (60 * 60 * 1000)).toFixed(1);
        console.log(`자동 정산: 다음 체크 대기 - ${next.raceName} (R${next.round}) | ${waitHours}시간 후`);
        autoSettlement.currentRaceRound = next.round;
        autoSettlement.consecutiveFailures = 0;
        autoSettlement.timer = setTimeout(() => {
            console.log(`자동 정산: ${next.raceName} 결과 감시 시작 (5분 간격)`);
            checkForNewResults();
        }, waitMs);
        return;
    }

    if (next.type === 'check_now') {
        console.log(`자동 정산: ${next.raceName} (R${next.round}) 미정산 - 즉시 체크 시작`);
        autoSettlement.currentRaceRound = next.round;
        checkForNewResults();
    }
}

/**
 * 새 레이스 결과 확인 및 정산
 */
async function checkForNewResults() {
    // 초기화 완료 전에는 정산 시도 안 함
    if (!autoSettlement.isInitialized) {
        console.log('정산 시스템 초기화 대기 중...');
        return;
    }

    try {
        const round = autoSettlement.currentRaceRound;
        console.log(`F1 API 레이스 결과 확인 중... (R${round || '?'})`);

        // F1 API에서 감시 중인 라운드 결과 가져오기
        const raceResults = await fetchF1RaceResults(new Date().getFullYear(), round || null);

        // API 성공 -> 연속 실패 카운터 리셋
        autoSettlement.consecutiveFailures = 0;

        if (!raceResults || !raceResults.results || raceResults.results.length === 0) {
            console.log('새 레이스 결과 없음 - 5분 후 재확인');
            // 5분 후 재시도
            autoSettlement.timer = setTimeout(checkForNewResults, autoSettlement.checkInterval);
            return;
        }

        // round 방어 코드 - round 정보 없으면 raceId 불일치 방지
        if (!raceResults.round) {
            console.error('round 정보 없음 - 정산 스킵 (raceId 불일치 방지)');
            autoSettlement.timer = setTimeout(checkForNewResults, autoSettlement.checkInterval);
            return;
        }

        // 레이스 ID 생성 (KST 기준 날짜) - RACE_SCHEDULE 날짜 기준으로 생성 (베팅 시 사용한 raceId와 일치)
        const roundNum = raceResults.round;
        const scheduleDate = RACE_SCHEDULE[roundNum - 1]?.date;
        const kst = scheduleDate
            ? getKSTDateParts(new Date(scheduleDate))
            : getKSTDateParts(new Date(raceResults.date));
        const raceId = `race_${roundNum}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;

        // 이미 정산한 레이스인지 확인 (Firestore 포함)
        const alreadySettled = await isRaceSettled(raceId);
        if (alreadySettled) {
            console.log(`이미 정산 완료: ${raceResults.raceName} (${raceId})`);
            // 다음 레이스로 스케줄 이동
            scheduleNextCheck();
            return;
        }

        console.log(`새 레이스 결과 발견: ${raceResults.raceName}`);

        // 정산 실행
        await settleAllBets(raceId, raceResults);

    } catch (error) {
        console.error('자동 정산 체크 실패:', error.message);

        // 연속 실패 카운터 증가
        autoSettlement.consecutiveFailures++;

        if (autoSettlement.consecutiveFailures >= autoSettlement.MAX_CONSECUTIVE_FAILURES) {
            // 5회 연속 실패 -> Discord 알림
            sendSettlementNotification('api_error', {
                round: autoSettlement.currentRaceRound,
                raceName: RACE_SCHEDULE[autoSettlement.currentRaceRound - 1]?.name || 'Unknown',
                failures: autoSettlement.consecutiveFailures,
                error: error.message
            });
            // 카운터 리셋 (동일 알림 반복 방지)
            autoSettlement.consecutiveFailures = 0;
        }

        // 5분 후 재시도 계속
        autoSettlement.timer = setTimeout(checkForNewResults, autoSettlement.checkInterval);
    }
}

/**
 * 모든 베팅 정산 실행
 */
async function settleAllBets(raceId, raceResults) {
    // 동시 실행 잠금 (수동/자동 정산 충돌 방지)
    if (autoSettlement.isSettling) {
        console.warn(`정산 이미 진행 중 - 요청 무시됨: ${raceId}`);
        throw new Error('SETTLEMENT_IN_PROGRESS');
    }
    autoSettlement.isSettling = true;

    console.log(`정산 시작: ${raceResults.raceName} (${raceId})`);

    let h2hResult = { total: 0, won: 0, lost: 0, void: 0 };
    let podiumResult = { total: 0, won: 0, lost: 0 };
    let hasError = false;

    try {
        // 1:1 베팅 정산
        try {
            h2hResult = await executeAutoSettlement('h2h', raceId, raceResults);
            console.log(`1:1 베팅 정산: ${h2hResult.total}건 (당첨: ${h2hResult.won}, 낙첨: ${h2hResult.lost}, 무효: ${h2hResult.void})`);
        } catch (error) {
            console.error('1:1 베팅 정산 실패:', error.message);
            hasError = true;
            // 1:1 실패해도 포디움은 계속 진행
        }

        // 포디움 베팅 정산
        try {
            podiumResult = await executeAutoSettlement('podium', raceId, raceResults);
            console.log(`포디움 베팅 정산: ${podiumResult.total}건 (당첨: ${podiumResult.won}, 낙첨: ${podiumResult.lost})`);
        } catch (error) {
            console.error('포디움 베팅 정산 실패:', error.message);
            hasError = true;
        }

        // 정산 완료 기록 Firestore에 저장 (영속화)
        // 모든 pending 베팅이 처리되었는지 확인
        const remainingH2H = await db.collection('headToHeadBets')
            .where('raceId', '==', raceId)
            .where('status', '==', 'pending')
            .limit(1)
            .get();

        const remainingPodium = await db.collection('podiumBets')
            .where('raceId', '==', raceId)
            .where('status', '==', 'pending')
            .limit(1)
            .get();

        if (remainingH2H.empty && remainingPodium.empty) {
            // 모든 베팅 정산 완료 - 기록 저장
            await saveSettlementRecord(raceId, raceResults, h2hResult, podiumResult);
            autoSettlement.lastCheckedRound = raceResults.round;

            console.log(`${raceResults.raceName} 정산 완료!`);

            // Discord 성공 알림
            sendSettlementNotification('success', {
                raceName: raceResults.raceName,
                round: raceResults.round,
                h2h: h2hResult,
                podium: podiumResult
            });

            // 다음 레이스로 스케줄 이동
            scheduleNextCheck();

            // [칭호 비활성화] 베팅 칭호 시스템
            // try {
            //     await updateCombinedStatsAndAwardTitles(raceId);
            // } catch (titleError) {
            //     console.error('베팅 칭호 처리 실패:', titleError.message);
            // }
        } else {
            // 미처리 베팅 존재 - 완료 표시 안 함 (다음 사이클에서 재시도)
            const remainingCount = (remainingH2H.empty ? 0 : '1+') + ' H2H, ' +
                                  (remainingPodium.empty ? 0 : '1+') + ' Podium';
            console.warn(`미처리 베팅 존재: ${remainingCount} - 5분 후 재시도`);

            // 5분 후 재시도
            autoSettlement.timer = setTimeout(checkForNewResults, autoSettlement.checkInterval);
        }

        // 에러 발생 시 Discord 알림
        if (hasError) {
            sendSettlementNotification('failure', {
                raceName: raceResults.raceName,
                round: raceResults.round,
                h2h: h2hResult,
                podium: podiumResult
            });
        }
    } finally {
        autoSettlement.isSettling = false;
    }
}

/**
 * 정산 관련 Discord 알림 전송
 * @param {'success'|'failure'|'api_error'} type - 알림 유형
 * @param {Object} data - 알림 데이터
 */
async function sendSettlementNotification(type, data) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    let embed;
    try {
        if (type === 'success') {
            embed = {
                title: '정산 완료',
                color: 0x00C853,
                fields: [
                    { name: '레이스', value: `${data.raceName} (R${data.round})`, inline: true },
                    { name: 'H2H', value: `${data.h2h.total}건 (당첨: ${data.h2h.won}, 낙첨: ${data.h2h.lost}, 무효: ${data.h2h.void})`, inline: false },
                    { name: 'Podium', value: `${data.podium.total}건 (당첨: ${data.podium.won}, 낙첨: ${data.podium.lost})`, inline: false }
                ],
                timestamp: new Date().toISOString()
            };
        } else if (type === 'failure') {
            embed = {
                title: '정산 부분 실패',
                color: 0xFF9800,
                fields: [
                    { name: '레이스', value: `${data.raceName} (R${data.round})`, inline: true },
                    { name: 'H2H', value: `${data.h2h.total}건 처리`, inline: true },
                    { name: 'Podium', value: `${data.podium.total}건 처리`, inline: true }
                ],
                description: '일부 베팅 정산 중 오류 발생. 다음 사이클에서 재시도됩니다.',
                timestamp: new Date().toISOString()
            };
        } else if (type === 'api_error') {
            embed = {
                title: 'F1 API 연속 실패',
                color: 0xFF0000,
                fields: [
                    { name: '레이스', value: `${data.raceName} (R${data.round})`, inline: true },
                    { name: '연속 실패', value: `${data.failures}회`, inline: true },
                    { name: '에러', value: String(data.error).slice(0, 200), inline: false }
                ],
                description: '수동 정산이 필요할 수 있습니다. /api/admin/settle 사용을 검토하세요.',
                timestamp: new Date().toISOString()
            };
        }

        await axios.post(webhookUrl, { embeds: [embed] });
    } catch (err) {
        console.error('Discord 정산 알림 전송 실패:', err.message);
    }
}

// ========================================
// 범용 칭호 부여 헬퍼
// ========================================

/**
 * 범용 칭호 부여 (이미 보유 시 무시)
 * @param {string} userId
 * @param {string} titleId
 */
async function awardTitleIfNotOwned(userId, titleId) {
    const userTitleRef = db.collection('userTitles').doc(`${userId}_${titleId}`);
    const titleRef = db.collection('titles').doc(titleId);

    return await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(userTitleRef);
        if (existing.exists) return false;

        const titleDoc = await transaction.get(titleRef);
        if (!titleDoc.exists) return false;

        transaction.set(userTitleRef, {
            userId,
            titleId,
            titleName: titleDoc.data().name,
            equipped: false,
            earnedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        transaction.update(titleRef, {
            holderCount: admin.firestore.FieldValue.increment(1)
        });
        console.log(`[칭호] ${userId}: '${titleDoc.data().name}' 부여`);
        return true;
    });
}

// ========================================
// 베팅 칭호 시스템
// ========================================

const BETTING_TITLES = [
    { id: 'bet-first',        check: s => s.totalBets >= 1 },
    { id: 'bet-5wins',        check: s => s.totalWins >= 5 },
    { id: 'bet-first-loss',   check: s => s.totalLosses >= 1 },
    { id: 'bet-10wins',       check: s => s.totalWins >= 10 },
    { id: 'bet-30wins',       check: s => s.totalWins >= 30 },
    { id: 'bet-50wins',       check: s => s.totalWins >= 50 },
    { id: 'bet-100wins',      check: s => s.totalWins >= 100 },
    { id: 'bet-10streak',     check: s => s.maxWinStreak >= 10 },
    { id: 'bet-5loss-streak', check: s => s.maxLoseStreak >= 5 },
    { id: 'bet-1000total',    check: s => s.totalBets >= 1000 }
    // bet-perfect-week는 정산 시 별도 판정
];

/**
 * 베팅 칭호 검사 및 부여
 */
async function checkAndAwardBettingTitles(userId, combinedStats, extraTitles) {
    const titlesToAward = [];

    // BETTING_TITLES 조건 검사
    for (const titleDef of BETTING_TITLES) {
        if (titleDef.check(combinedStats)) {
            titlesToAward.push(titleDef.id);
        }
    }

    // 퍼펙트 위크 등 추가 칭호
    if (extraTitles && extraTitles.length > 0) {
        titlesToAward.push(...extraTitles);
    }

    if (titlesToAward.length === 0) return;

    // 이미 부여된 칭호 확인
    const statsRef = db.collection('userBettingStats').doc(userId);
    const statsDoc = await statsRef.get();
    const awardedTitles = (statsDoc.exists && statsDoc.data().awardedTitles) || [];

    const newTitles = titlesToAward.filter(id => !awardedTitles.includes(id));
    if (newTitles.length === 0) return;

    // 배치 전 title names 미리 조회
    const titleNames = {};
    for (const titleId of newTitles) {
        const titleDoc = await db.collection('titles').doc(titleId).get();
        if (titleDoc.exists) titleNames[titleId] = titleDoc.data().name;
    }

    // 배치로 칭호 부여
    const batch = db.batch();

    for (const titleId of newTitles) {
        // userTitles 문서 생성
        const userTitleRef = db.collection('userTitles').doc(`${userId}_${titleId}`);
        batch.set(userTitleRef, {
            userId,
            titleId,
            titleName: titleNames[titleId] || titleId,
            equipped: false,
            earnedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // titles 컬렉션 holderCount 증가
        const titleRef = db.collection('titles').doc(titleId);
        batch.update(titleRef, {
            holderCount: admin.firestore.FieldValue.increment(1)
        });
    }

    // awardedTitles 배열 업데이트
    batch.set(statsRef, {
        awardedTitles: admin.firestore.FieldValue.arrayUnion(...newTitles)
    }, { merge: true });

    await batch.commit();

    console.log(`🏅 ${userId}: 새 베팅 칭호 ${newTitles.length}개 부여 - [${newTitles.join(', ')}]`);
}

/**
 * 정산 후 combined 통계 업데이트 + 칭호 부여
 */
async function updateCombinedStatsAndAwardTitles(raceId) {
    console.log(`📊 combined 통계 업데이트 시작 (raceId: ${raceId})`);

    // 정산된 모든 베팅 조회 (won/lost만, void 제외)
    const [h2hSnapshot, podiumSnapshot] = await Promise.all([
        db.collection('headToHeadBets')
            .where('raceId', '==', raceId)
            .where('status', 'in', ['won', 'lost'])
            .get(),
        db.collection('podiumBets')
            .where('raceId', '==', raceId)
            .where('status', 'in', ['won', 'lost'])
            .get()
    ]);

    // 유저별 베팅 결과 그룹핑
    const userBets = {};

    for (const doc of h2hSnapshot.docs) {
        const bet = doc.data();
        if (!userBets[bet.userId]) userBets[bet.userId] = [];
        userBets[bet.userId].push({
            type: 'h2h',
            won: bet.status === 'won',
            createdAt: bet.createdAt
        });
    }

    for (const doc of podiumSnapshot.docs) {
        const bet = doc.data();
        if (!userBets[bet.userId]) userBets[bet.userId] = [];
        userBets[bet.userId].push({
            type: 'podium',
            won: bet.status === 'won',
            createdAt: bet.createdAt
        });
    }

    // 퍼펙트 위크 판정용 데이터
    const perfectWeekUsers = new Set();

    for (const doc of podiumSnapshot.docs) {
        const bet = doc.data();
        if (bet.status === 'won' && bet.settledBets) {
            const allPositionsCorrect = bet.settledBets.every(sb => sb.won);
            if (allPositionsCorrect && bet.settledBets.length === 3) {
                // 포디움 3포지션 전부 적중 - 1:1 베팅도 모두 적중인지 확인
                const userH2hBets = h2hSnapshot.docs
                    .filter(d => d.data().userId === bet.userId)
                    .map(d => d.data());
                const allH2hWon = userH2hBets.length > 0 && userH2hBets.every(b => b.status === 'won');
                if (allH2hWon) {
                    perfectWeekUsers.add(bet.userId);
                }
            }
        }
    }

    // 각 유저별 combined 통계 업데이트
    for (const [userId, bets] of Object.entries(userBets)) {
        try {
            const statsRef = db.collection('userBettingStats').doc(userId);
            const statsDoc = await statsRef.get();
            const existing = (statsDoc.exists && statsDoc.data().combined) || {
                totalBets: 0,
                totalWins: 0,
                totalLosses: 0,
                currentWinStreak: 0,
                currentLoseStreak: 0,
                maxWinStreak: 0,
                maxLoseStreak: 0
            };

            // 베팅을 createdAt 순으로 정렬
            bets.sort((a, b) => {
                const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
                const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
                return aTime - bTime;
            });

            let { currentWinStreak, currentLoseStreak, maxWinStreak, maxLoseStreak } = existing;
            let addedWins = 0;
            let addedLosses = 0;

            for (const bet of bets) {
                if (bet.won) {
                    addedWins++;
                    currentWinStreak++;
                    currentLoseStreak = 0;
                    if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
                } else {
                    addedLosses++;
                    currentLoseStreak++;
                    currentWinStreak = 0;
                    if (currentLoseStreak > maxLoseStreak) maxLoseStreak = currentLoseStreak;
                }
            }

            const updatedCombined = {
                totalBets: existing.totalBets + bets.length,
                totalWins: existing.totalWins + addedWins,
                totalLosses: existing.totalLosses + addedLosses,
                currentWinStreak,
                currentLoseStreak,
                maxWinStreak,
                maxLoseStreak
            };

            await statsRef.set({ combined: updatedCombined }, { merge: true });

            // [칭호 비활성화] 칭호 부여 검사
            // const extraTitles = perfectWeekUsers.has(userId) ? ['bet-perfect-week'] : [];
            // await checkAndAwardBettingTitles(userId, updatedCombined, extraTitles);

        } catch (error) {
            console.error(`❌ ${userId} combined 통계 업데이트 실패:`, error.message);
        }
    }

    console.log(`📊 combined 통계 업데이트 완료 (${Object.keys(userBets).length}명)`);
}

/**
 * 자동 정산 실행 (내부 함수)
 * 🔒 배치 실패 시 재시도 로직 추가
 */
async function executeAutoSettlement(type, targetRaceId, raceResults) {
    const results = { total: 0, won: 0, lost: 0, void: 0 };

    // 드라이버 순위/DNF 매핑
    const driverPositions = {};
    const dnfDrivers = new Set();

    // 🔒 완료 상태 정의 강화 (DNF 판정 정확도 향상)
    const FINISHED_STATUSES = ['Finished', '+1 Lap', '+2 Laps', '+3 Laps', '+4 Laps', '+5 Laps'];

    raceResults.results.forEach(result => {
        const driverNum = parseInt(result.driver.number);
        const status = result.status || '';
        const isFinished = FINISHED_STATUSES.some(s => status.includes(s)) ||
                          (result.position && result.position <= 20 && !['DNF', 'DNS', 'DSQ', 'Retired', 'Accident', 'Collision', 'Engine', 'Gearbox', 'Hydraulics', 'Brakes', 'Suspension', 'Wheel', 'Puncture', 'Spin', 'Damage'].some(dnf => status.includes(dnf)));

        if (isFinished && result.position) {
            driverPositions[driverNum] = result.position;
        } else {
            dnfDrivers.add(driverNum);
        }
    });

    const collection = type === 'h2h' ? 'headToHeadBets' : 'podiumBets';

    // pending 베팅 조회
    const betsSnapshot = await db.collection(collection)
        .where('raceId', '==', targetRaceId)
        .where('status', '==', 'pending')
        .get();

    if (betsSnapshot.empty) {
        console.log(`📭 ${type} 정산 대상 없음`);
        return results;
    }

    const betDocs = betsSnapshot.docs;
    const totalBatches = Math.ceil(betDocs.length / BATCH_LIMIT);
    console.log(`📦 ${type} 정산: ${betDocs.length}건 (${totalBatches}개 배치)`);

    // 🔒 Batch 분할 처리 (실패 시 재시도)
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    for (let i = 0; i < betDocs.length; i += BATCH_LIMIT) {
        const batchIndex = Math.floor(i / BATCH_LIMIT) + 1;
        const batchDocs = betDocs.slice(i, i + BATCH_LIMIT);

        let retryCount = 0;
        let batchSuccess = false;

        while (retryCount < MAX_RETRIES && !batchSuccess) {
            try {
                const batch = db.batch();
                const batchResults = { won: 0, lost: 0, void: 0 };

                for (const betDoc of batchDocs) {
                    const bet = betDoc.data();

                    if (type === 'h2h') {
                        // 1:1 베팅 정산 로직
                        const driverANum = bet.matchup.driverA.number;
                        const driverBNum = bet.matchup.driverB.number;
                        const driverAPos = driverPositions[driverANum];
                        const driverBPos = driverPositions[driverBNum];
                        const isDriverADNF = dnfDrivers.has(driverANum);
                        const isDriverBDNF = dnfDrivers.has(driverBNum);

                        if (isDriverADNF && isDriverBDNF) {
                            // 양측 DNF - 환불
                            batch.update(betDoc.ref, {
                                status: 'void',
                                result: { reason: '양측 DNF', settledAt: admin.firestore.FieldValue.serverTimestamp() }
                            });
                            batch.update(db.collection('users').doc(bet.userId), {
                                tokens: admin.firestore.FieldValue.increment(bet.betAmount)
                            });
                            batch.set(db.collection('tokenHistory').doc(), {
                                userId: bet.userId,
                                amount: bet.betAmount,
                                reason: `1:1 베팅 무효 환불 (양측 DNF - ${raceResults.raceName})`,
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });
                            batchResults.void++;
                        } else {
                            let actualWinner;
                            if (isDriverADNF) actualWinner = driverBNum;
                            else if (isDriverBDNF) actualWinner = driverANum;
                            else if (driverAPos && driverBPos) actualWinner = driverAPos < driverBPos ? driverANum : driverBNum;
                            else {
                                // 데이터 누락 - 환불
                                batch.update(betDoc.ref, {
                                    status: 'void',
                                    result: { reason: '데이터 누락', settledAt: admin.firestore.FieldValue.serverTimestamp() }
                                });
                                batch.update(db.collection('users').doc(bet.userId), {
                                    tokens: admin.firestore.FieldValue.increment(bet.betAmount)
                                });
                                batch.set(db.collection('tokenHistory').doc(), {
                                    userId: bet.userId,
                                    amount: bet.betAmount,
                                    reason: `1:1 베팅 무효 환불 (데이터 누락 - ${raceResults.raceName})`,
                                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                                });
                                batchResults.void++;
                                continue;
                            }

                            const isWin = bet.predictedWinner === actualWinner;

                            // ✅ 서버에서 배당률 재계산 (클라이언트 조작 완전 방지)
                            const serverOdds = recalculateOddsServer(bet);

                            batch.update(betDoc.ref, {
                                status: isWin ? 'won' : 'lost',
                                result: {
                                    actualWinner,
                                    clientOdds: bet.odds,      // 클라이언트가 보낸 값 (감사용)
                                    serverOdds: serverOdds,    // 서버 재계산 값 (실제 적용)
                                    settledAt: admin.firestore.FieldValue.serverTimestamp()
                                }
                            });

                            if (isWin) {
                                // 서버 재계산 배당률 사용 (조작 불가)
                                const safeWin = Math.floor(bet.betAmount * serverOdds);

                                batch.update(db.collection('users').doc(bet.userId), {
                                    tokens: admin.firestore.FieldValue.increment(safeWin),
                                    totalEarned: admin.firestore.FieldValue.increment(safeWin),
                                    'periodicEarnings.weeklyEarned': admin.firestore.FieldValue.increment(safeWin),
                                    'periodicEarnings.monthlyEarned': admin.firestore.FieldValue.increment(safeWin),
                                    'periodicEarnings.seasonEarned': admin.firestore.FieldValue.increment(safeWin),
                                    pendingSettlementResults: admin.firestore.FieldValue.arrayUnion({
                                        raceName: raceResults.raceName, type: 'h2h',
                                        result: 'won', amount: safeWin, timestamp: Date.now()
                                    })
                                });
                                batch.set(db.collection('tokenHistory').doc(), {
                                    userId: bet.userId,
                                    amount: safeWin,
                                    reason: `1:1 베팅 당첨 (${raceResults.raceName})`,
                                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                                });
                                batchResults.won++;
                            } else {
                                batch.update(db.collection('users').doc(bet.userId), {
                                    pendingSettlementResults: admin.firestore.FieldValue.arrayUnion({
                                        raceName: raceResults.raceName, type: 'h2h',
                                        result: 'lost', amount: bet.betAmount, timestamp: Date.now()
                                    })
                                });
                                batchResults.lost++;
                            }

                            // 리더보드용: userBettingStats accuracyDetails 업데이트
                            const statsRef = db.collection('userBettingStats').doc(bet.userId);
                            batch.set(statsRef, {
                                userId: bet.userId,
                                'accuracyDetails.h2h.totalBets': admin.firestore.FieldValue.increment(1),
                                'accuracyDetails.h2h.correctBets': admin.firestore.FieldValue.increment(isWin ? 1 : 0),
                                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                    } else {
                        // 포디움 베팅 정산 로직
                        const podiumResults = raceResults.results.filter(r => r.position <= 3);
                        let winAmount = 0;
                        let hasWin = false;
                        const settledBets = [];  // 정산 상세 기록용

                        for (const betItem of bet.bets) {
                            const actual = podiumResults.find(r => r.position === betItem.position);
                            const isDNF = dnfDrivers.has(betItem.driverNumber);

                            // ✅ 서버에서 배당률 재계산 (클라이언트 조작 완전 방지)
                            const serverOdds = recalculatePodiumOddsServer(betItem);

                            if (actual && parseInt(actual.driver.number) === betItem.driverNumber && !isDNF) {
                                winAmount += Math.floor(betItem.betAmount * serverOdds);
                                hasWin = true;
                                settledBets.push({
                                    position: betItem.position,
                                    driverNumber: betItem.driverNumber,
                                    clientOdds: betItem.odds,
                                    serverOdds: serverOdds,
                                    won: true
                                });
                            } else {
                                settledBets.push({
                                    position: betItem.position,
                                    driverNumber: betItem.driverNumber,
                                    clientOdds: betItem.odds,
                                    serverOdds: serverOdds,
                                    won: false
                                });
                            }
                        }

                        batch.update(betDoc.ref, {
                            status: hasWin ? 'won' : 'lost',
                            winAmount: winAmount,
                            settledBets: settledBets,  // 정산 상세 기록 (감사용)
                            settledAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        if (hasWin) {
                            batch.update(db.collection('users').doc(bet.userId), {
                                tokens: admin.firestore.FieldValue.increment(winAmount),
                                totalEarned: admin.firestore.FieldValue.increment(winAmount),
                                'periodicEarnings.weeklyEarned': admin.firestore.FieldValue.increment(winAmount),
                                'periodicEarnings.monthlyEarned': admin.firestore.FieldValue.increment(winAmount),
                                'periodicEarnings.seasonEarned': admin.firestore.FieldValue.increment(winAmount),
                                pendingSettlementResults: admin.firestore.FieldValue.arrayUnion({
                                    raceName: raceResults.raceName, type: 'podium',
                                    result: 'won', amount: winAmount, timestamp: Date.now()
                                })
                            });
                            batch.set(db.collection('tokenHistory').doc(), {
                                userId: bet.userId,
                                amount: winAmount,
                                reason: `포디움 베팅 당첨 (${raceResults.raceName})`,
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });
                            batchResults.won++;
                        } else {
                            batch.update(db.collection('users').doc(bet.userId), {
                                pendingSettlementResults: admin.firestore.FieldValue.arrayUnion({
                                    raceName: raceResults.raceName, type: 'podium',
                                    result: 'lost', amount: bet.totalBetAmount || 0, timestamp: Date.now()
                                })
                            });
                            batchResults.lost++;
                        }

                        // 리더보드용: userBettingStats accuracyDetails 업데이트
                        // 각 포지션별 베팅/적중 횟수 집계
                        const statsRef = db.collection('userBettingStats').doc(bet.userId);
                        const podiumStatsUpdate = {
                            userId: bet.userId,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        };

                        for (const settled of settledBets) {
                            const posKey = `p${settled.position}`;
                            podiumStatsUpdate[`accuracyDetails.podium.${posKey}Bets`] =
                                admin.firestore.FieldValue.increment(1);
                            if (settled.won) {
                                podiumStatsUpdate[`accuracyDetails.podium.${posKey}Correct`] =
                                    admin.firestore.FieldValue.increment(1);
                            }
                        }

                        batch.set(statsRef, podiumStatsUpdate, { merge: true });
                    }
                }

                // 배치 커밋
                await batch.commit();

                // 🔒 배치 성공 - 결과 집계
                results.won += batchResults.won;
                results.lost += batchResults.lost;
                results.void += batchResults.void;
                results.total += batchDocs.length;

                batchSuccess = true;
                console.log(`  ✅ 배치 ${batchIndex}/${totalBatches} 완료 (${batchDocs.length}건)`);

            } catch (batchError) {
                retryCount++;
                console.error(`  ❌ 배치 ${batchIndex}/${totalBatches} 실패 (시도 ${retryCount}/${MAX_RETRIES}): ${batchError.message}`);

                if (retryCount < MAX_RETRIES) {
                    // 재시도 전 대기
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
                    console.log(`  🔄 배치 ${batchIndex} 재시도 중...`);
                } else {
                    // 최대 재시도 초과 - 에러 전파하지 않고 다음 배치 진행
                    console.error(`  ⚠️ 배치 ${batchIndex} 최대 재시도 초과 - 다음 사이클에서 재처리됨`);
                    // 해당 배치의 베팅들은 여전히 pending 상태이므로 다음에 다시 시도됨
                }
            }
        }
    }

    return results;
}


// ========================================
// 리더보드 시스템 API
// ========================================

// 리더보드 설정
const LEADERBOARD_CONFIG_SERVER = {
    CACHE_TTL_MS: 5 * 60 * 1000,  // 5분 캐시
    TOP_LIMIT: 100,
    MIN_BETS: {
        PODIUM: 3,
        H2H: 3
    },
    SEASON: {
        YEAR: 2026,
        START: new Date('2026-03-08T06:00:00+09:00'),
        END: new Date('2026-12-06T22:00:00+09:00')
    }
};

// 메모리 캐시
const leaderboardCache = {
    data: {},       // { [cacheKey]: { rankings, lastUpdated } }
    lastUpdated: null
};

/**
 * 시즌 날짜 정보 반환
 */
function getSeasonDates() {
    return {
        year: LEADERBOARD_CONFIG_SERVER.SEASON.YEAR,
        start: LEADERBOARD_CONFIG_SERVER.SEASON.START,
        end: LEADERBOARD_CONFIG_SERVER.SEASON.END,
        isInSeason: () => {
            const now = new Date();
            return now >= LEADERBOARD_CONFIG_SERVER.SEASON.START &&
                   now <= LEADERBOARD_CONFIG_SERVER.SEASON.END;
        }
    };
}

/**
 * 기간 키 생성 (주간: 2026W05, 월간: 202602, 시즌: 2026, 전체: all)
 */
function getPeriodKey(period) {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // KST

    switch (period) {
        case 'weekly': {
            const year = kstNow.getUTCFullYear();
            const startOfYear = new Date(Date.UTC(year, 0, 1));
            const days = Math.floor((kstNow - startOfYear) / (24 * 60 * 60 * 1000));
            const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
            return `${year}W${String(weekNumber).padStart(2, '0')}`;
        }
        case 'monthly': {
            const year = kstNow.getUTCFullYear();
            const month = kstNow.getUTCMonth() + 1;
            return `${year}${String(month).padStart(2, '0')}`;
        }
        case 'season':
            return String(LEADERBOARD_CONFIG_SERVER.SEASON.YEAR);
        case 'all':
        default:
            return 'all';
    }
}

/**
 * 캐시 키 생성
 */
/**
 * 기간별 날짜 범위 반환 (Date 객체 - Firestore timestamp 쿼리용)
 */
function getPeriodDateRange(period) {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);

    let start;
    switch (period) {
        case 'weekly': {
            const day = kstNow.getUTCDay();
            const diff = day === 0 ? 6 : day - 1;
            const mondayKST = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - diff, 0, 0, 0));
            start = new Date(mondayKST.getTime() - kstOffset);
            break;
        }
        case 'monthly': {
            const firstDayKST = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1, 0, 0, 0));
            start = new Date(firstDayKST.getTime() - kstOffset);
            break;
        }
        case 'season': {
            start = LEADERBOARD_CONFIG_SERVER.SEASON.START;
            break;
        }
        default:
            start = new Date(0);
    }
    return { start, end: now };
}

/**
 * 기간별 날짜 범위 반환 (YYYYMMDD 문자열 - attendance date 필드 쿼리용)
 */
function getPeriodDateStrRange(period) {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);

    const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const endStr = fmt(kstNow);
    let startStr;

    switch (period) {
        case 'weekly': {
            const day = kstNow.getUTCDay();
            const diff = day === 0 ? 6 : day - 1;
            const monday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - diff));
            startStr = fmt(monday);
            break;
        }
        case 'monthly':
            startStr = `${kstNow.getUTCFullYear()}${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}01`;
            break;
        case 'season':
            startStr = `${LEADERBOARD_CONFIG_SERVER.SEASON.YEAR}0101`;
            break;
        default:
            startStr = '00000000';
    }
    return { startStr, endStr };
}

function getCacheKey(type, subType, period) {
    const periodKey = getPeriodKey(period);
    return `${type}_${subType}_${period}_${periodKey}`;
}

/**
 * 캐시된 리더보드 반환 또는 새로 계산
 */
async function getLeaderboard(type, subType, period, limit = 50, sortBy = 'earned') {
    const cacheKey = getCacheKey(type, subType, period) + (type === 'coin' ? `-${sortBy}` : '');
    const cached = leaderboardCache.data[cacheKey];

    // 캐시 유효성 확인
    if (cached && (Date.now() - cached.lastUpdated) < LEADERBOARD_CONFIG_SERVER.CACHE_TTL_MS) {
        return {
            rankings: cached.rankings.slice(0, limit),
            totalParticipants: cached.totalParticipants,
            lastUpdated: cached.lastUpdated,
            fromCache: true
        };
    }

    // 새로 계산
    const result = await calculateLeaderboard(type, subType, period, sortBy);

    // 캐시 저장
    leaderboardCache.data[cacheKey] = {
        rankings: result.rankings,
        totalParticipants: result.totalParticipants,
        lastUpdated: Date.now()
    };

    return {
        rankings: result.rankings.slice(0, limit),
        totalParticipants: result.totalParticipants,
        lastUpdated: Date.now(),
        fromCache: false
    };
}

/**
 * 리더보드 계산
 */
async function calculateLeaderboard(type, subType, period, sortBy = 'earned') {
    let result;
    switch (type) {
        case 'betting-accuracy':
            result = await calculateBettingAccuracyLeaderboard(subType, period);
            break;
        case 'coin':
            result = await calculateCoinLeaderboard(subType, period, sortBy);
            break;
        case 'community':
            result = await calculateCommunityLeaderboard(subType, period);
            break;
        case 'attendance':
            result = await calculateAttendanceLeaderboard(subType, period);
            break;
        default:
            return { rankings: [], totalParticipants: 0 };
    }

    // '익명' 항목을 Firebase Auth에서 보정 + Firestore 업데이트
    await fixAnonymousProfiles(result.rankings);
    return result;
}

/**
 * 리더보드에서 '익명' 프로필을 Firebase Auth 정보로 보정
 * Firestore users 문서도 함께 업데이트하여 다음 조회부터는 정상 표시
 */
async function fixAnonymousProfiles(rankings) {
    const anonymousEntries = rankings.filter(r => !r.displayName || r.displayName === '익명');
    if (anonymousEntries.length === 0) return;

    await Promise.all(anonymousEntries.map(async (entry) => {
        const profile = await getAuthProfile(entry.userId);
        entry.displayName = profile.displayName;
        if (!entry.photoURL) {
            entry.photoURL = profile.photoURL;
        }
        // Firestore users 문서도 업데이트 (다음 조회부터 정상 표시)
        if (profile.displayName !== '익명') {
            try {
                await db.collection('users').doc(entry.userId).update({
                    displayName: profile.displayName,
                    photoURL: profile.photoURL
                });
            } catch (e) {
                // 업데이트 실패해도 현재 응답에는 영향 없음
            }
        }
    }));
}

/**
 * 베팅 적중률 리더보드 계산
 */
async function calculateBettingAccuracyLeaderboard(subType, period) {
    if (!db) return { rankings: [], totalParticipants: 0 };

    try {
        // userBettingStats에서 집계
        const statsSnapshot = await db.collection('userBettingStats').get();

        if (statsSnapshot.empty) {
            return { rankings: [], totalParticipants: 0 };
        }

        const rankings = [];

        for (const doc of statsSnapshot.docs) {
            const data = doc.data();

            // 기간 필터 (시즌/전체만 적중률 표시)
            // 주간/월간은 적중률 미표시 (데이터 부족)
            if (period === 'weekly' || period === 'monthly') {
                continue;
            }

            let totalBets = 0;
            let correctBets = 0;

            if (subType === 'podium') {
                // 포디움 적중률: accuracyDetails 사용 또는 기본 계산
                const podium = data.accuracyDetails?.podium || data.podium || {};
                totalBets = (podium.p1Bets || 0) + (podium.p2Bets || 0) + (podium.p3Bets || 0) ||
                           podium.totalBets || 0;
                correctBets = (podium.p1Correct || 0) + (podium.p2Correct || 0) + (podium.p3Correct || 0) ||
                             podium.wonBets || 0;
            } else if (subType === 'h2h') {
                // 1:1 적중률
                const h2h = data.accuracyDetails?.h2h || data.headToHead || {};
                totalBets = h2h.totalBets || 0;
                correctBets = h2h.correctBets || h2h.wonBets || 0;
            } else {
                // 전체 (total)
                const podium = data.podium || {};
                const h2h = data.headToHead || {};
                totalBets = (podium.totalBets || 0) + (h2h.totalBets || 0);
                correctBets = (podium.wonBets || 0) + (h2h.wonBets || 0);
            }

            // 최소 참여 조건 확인
            const minBets = subType === 'h2h' ?
                LEADERBOARD_CONFIG_SERVER.MIN_BETS.H2H :
                LEADERBOARD_CONFIG_SERVER.MIN_BETS.PODIUM;

            if (totalBets < minBets) continue;

            const accuracy = totalBets > 0 ? (correctBets / totalBets * 100) : 0;

            // users 컬렉션에서 닉네임(customDisplayName) 우선 조회
            let displayName = '익명';
            let photoURL = data.photoURL || null;

            try {
                const userDoc = await db.collection('users').doc(doc.id).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    displayName = userData.customDisplayName || userData.displayName || userData.name || '익명';
                    if (!photoURL) {
                        photoURL = userData.photoURL || null;
                    }
                }
            } catch (userErr) {
                displayName = data.displayName || '익명';
            }

            rankings.push({
                rank: 0,
                userId: data.userId || doc.id,
                displayName: displayName || '익명',
                photoURL: photoURL || null,
                accuracy: Math.round(accuracy * 10) / 10,
                totalBets,
                correctBets
            });
        }

        // 적중률 내림차순, 동률 시 참여 횟수 내림차순
        rankings.sort((a, b) => {
            if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
            return b.totalBets - a.totalBets;
        });

        // 순위 부여
        rankings.forEach((item, index) => {
            item.rank = index + 1;
        });

        return {
            rankings: rankings.slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT),
            totalParticipants: rankings.length
        };

    } catch (error) {
        console.error('베팅 적중률 리더보드 계산 실패:', error);
        return { rankings: [], totalParticipants: 0 };
    }
}

/**
 * 코인 리더보드 계산
 * @param {string} subType - 서브타입
 * @param {string} period - 기간 ('weekly', 'monthly', 'season', 'all')
 * @param {string} sortBy - 정렬 기준 (현재 미사용, 기간별로 자동 결정)
 */
async function calculateCoinLeaderboard(subType, period, sortBy = 'earned') {
    if (!db) return { rankings: [], totalParticipants: 0 };

    try {
        // 기간별 정렬 필드 결정
        let sortField;
        let periodEarnedField;
        switch (period) {
            case 'weekly':
                sortField = 'periodicEarnings.weeklyEarned';
                periodEarnedField = 'weeklyEarned';
                break;
            case 'monthly':
                sortField = 'periodicEarnings.monthlyEarned';
                periodEarnedField = 'monthlyEarned';
                break;
            case 'season':
                sortField = 'periodicEarnings.seasonEarned';
                periodEarnedField = 'seasonEarned';
                break;
            case 'all':
            default:
                sortField = 'totalEarned';
                periodEarnedField = null;
                break;
        }

        // users 컬렉션에서 조회
        const usersSnapshot = await db.collection('users')
            .orderBy(sortField, 'desc')
            .limit(LEADERBOARD_CONFIG_SERVER.TOP_LIMIT)
            .get();

        if (usersSnapshot.empty) {
            return { rankings: [], totalParticipants: 0 };
        }

        const rankings = usersSnapshot.docs.map((doc, index) => {
            const data = doc.data();
            const periodicEarnings = data.periodicEarnings || {};

            // 기간별 획득량 결정
            let periodEarned;
            if (periodEarnedField) {
                periodEarned = periodicEarnings[periodEarnedField] || 0;
            } else {
                periodEarned = data.totalEarned || 0;
            }

            return {
                rank: index + 1,
                userId: doc.id,
                displayName: data.customDisplayName || data.displayName || data.name || '익명',
                photoURL: data.photoURL || null,
                periodEarned: periodEarned,
                totalEarned: data.totalEarned || 0,
                tokens: data.tokens || 0,
                currentTokens: data.tokens || 0
            };
        });

        // 총 참여자 수 (별도 조회)
        const countSnapshot = await db.collection('users')
            .where('totalEarned', '>', 0)
            .get();

        return {
            rankings,
            totalParticipants: countSnapshot.size
        };

    } catch (error) {
        console.error('코인 리더보드 계산 실패:', error);
        return { rankings: [], totalParticipants: 0 };
    }
}

/**
 * 커뮤니티 활동 리더보드 계산
 */
async function calculateCommunityLeaderboard(subType, period) {
    if (!db) return { rankings: [], totalParticipants: 0 };

    try {
        // 주간/월간: posts 컬렉션에서 기간별 집계
        if (period === 'weekly' || period === 'monthly') {
            const dateRange = getPeriodDateRange(period);

            const postsSnapshot = await db.collection('posts')
                .where('createdAt', '>=', dateRange.start)
                .where('createdAt', '<=', dateRange.end)
                .get();

            const userLikes = {};
            postsSnapshot.forEach(doc => {
                const post = doc.data();
                const authorId = post.authorId;
                if (!authorId) return;
                const likeCount = post.likeCount || 0;

                if (!userLikes[authorId]) {
                    userLikes[authorId] = { receivedLikes: 0, postCount: 0, photoURL: post.authorPhoto || null };
                }
                userLikes[authorId].receivedLikes += likeCount;
                userLikes[authorId].postCount++;
            });

            // users 컬렉션에서 닉네임 조회
            const authorIds = Object.keys(userLikes);
            if (authorIds.length > 0) {
                const authorDocs = await Promise.all(
                    authorIds.map(id => db.collection('users').doc(id).get())
                );
                authorDocs.forEach((userDoc, i) => {
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        userLikes[authorIds[i]].displayName = userData.customDisplayName || userData.displayName || userData.name || '익명';
                        userLikes[authorIds[i]].photoURL = userLikes[authorIds[i]].photoURL || userData.photoURL || null;
                    } else {
                        userLikes[authorIds[i]].displayName = '익명';
                    }
                });
            }

            const rankings = Object.entries(userLikes)
                .map(([userId, stats]) => ({
                    rank: 0, userId,
                    displayName: stats.displayName || '익명',
                    photoURL: stats.photoURL,
                    receivedLikes: stats.receivedLikes,
                    postCount: stats.postCount,
                    commentCount: 0
                }))
                .sort((a, b) => b.receivedLikes - a.receivedLikes)
                .slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT);

            rankings.forEach((item, index) => { item.rank = index + 1; });
            return { rankings, totalParticipants: Object.keys(userLikes).length };
        }

        // 시즌/전체: communityStats 사용 (또는 posts fallback)
        const usersSnapshot = await db.collection('users')
            .orderBy('communityStats.receivedLikes', 'desc')
            .limit(LEADERBOARD_CONFIG_SERVER.TOP_LIMIT)
            .get();

        // communityStats 필드가 없는 경우 posts에서 집계
        if (usersSnapshot.empty || !usersSnapshot.docs[0].data().communityStats) {
            let postsQuery = db.collection('posts');
            if (period === 'season') {
                const dateRange = getPeriodDateRange('season');
                postsQuery = postsQuery.where('createdAt', '>=', dateRange.start);
            }
            const postsSnapshot = await postsQuery.get();
            const userLikes = {};

            postsSnapshot.forEach(doc => {
                const post = doc.data();
                const authorId = post.authorId;
                if (!authorId) return;
                const likeCount = post.likeCount || 0;

                if (!userLikes[authorId]) {
                    userLikes[authorId] = { receivedLikes: 0, postCount: 0, photoURL: post.authorPhoto || null };
                }
                userLikes[authorId].receivedLikes += likeCount;
                userLikes[authorId].postCount++;
            });

            // users 컬렉션에서 닉네임 조회
            const authorIds = Object.keys(userLikes);
            if (authorIds.length > 0) {
                const authorDocs = await Promise.all(
                    authorIds.map(id => db.collection('users').doc(id).get())
                );
                authorDocs.forEach((userDoc, i) => {
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        userLikes[authorIds[i]].displayName = userData.customDisplayName || userData.displayName || userData.name || '익명';
                        userLikes[authorIds[i]].photoURL = userLikes[authorIds[i]].photoURL || userData.photoURL || null;
                    } else {
                        userLikes[authorIds[i]].displayName = '익명';
                    }
                });
            }

            const rankings = Object.entries(userLikes)
                .map(([userId, stats]) => ({
                    rank: 0, userId,
                    displayName: stats.displayName || '익명',
                    photoURL: stats.photoURL,
                    receivedLikes: stats.receivedLikes,
                    postCount: stats.postCount,
                    commentCount: 0
                }))
                .sort((a, b) => b.receivedLikes - a.receivedLikes)
                .slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT);

            rankings.forEach((item, index) => { item.rank = index + 1; });
            return { rankings, totalParticipants: Object.keys(userLikes).length };
        }

        const rankings = usersSnapshot.docs.map((doc, index) => {
            const data = doc.data();
            const communityStats = data.communityStats || {};
            return {
                rank: index + 1,
                userId: doc.id,
                displayName: data.customDisplayName || data.displayName || data.name || '익명',
                photoURL: data.photoURL || null,
                receivedLikes: communityStats.receivedLikes || 0,
                postCount: communityStats.postCount || 0,
                commentCount: communityStats.commentCount || 0
            };
        });

        return { rankings, totalParticipants: rankings.length };

    } catch (error) {
        console.error('커뮤니티 리더보드 계산 실패:', error);
        return { rankings: [], totalParticipants: 0 };
    }
}

/**
 * 출석 리더보드 계산
 */
async function calculateAttendanceLeaderboard(subType, period) {
    if (!db) return { rankings: [], totalParticipants: 0 };

    try {
        // 주간/월간/시즌: attendance 컬렉션에서 기간별 출석일수 집계
        if (period === 'weekly' || period === 'monthly' || period === 'season') {
            const { startStr, endStr } = getPeriodDateStrRange(period);

            const attendanceSnapshot = await db.collection('attendance')
                .where('date', '>=', startStr)
                .where('date', '<=', endStr)
                .get();

            const userAttendance = {};
            attendanceSnapshot.forEach(doc => {
                const data = doc.data();
                const userId = data.userId;
                if (!userId) return;

                if (!userAttendance[userId]) {
                    userAttendance[userId] = { cumulativeDays: 0 };
                }
                userAttendance[userId].cumulativeDays++;
            });

            // users 컬렉션에서 닉네임, 연속출석 조회
            const userIds = Object.keys(userAttendance);
            if (userIds.length === 0) return { rankings: [], totalParticipants: 0 };

            const userDocs = await Promise.all(
                userIds.map(id => db.collection('users').doc(id).get())
            );

            const rankings = userIds.map((userId, i) => {
                const userData = userDocs[i].exists ? userDocs[i].data() : {};
                return {
                    rank: 0,
                    userId,
                    displayName: userData.customDisplayName || userData.displayName || userData.name || '익명',
                    photoURL: userData.photoURL || null,
                    cumulativeDays: userAttendance[userId].cumulativeDays,
                    consecutiveDays: userData.consecutiveDays || 0
                };
            });

            if (subType === 'consecutive') {
                rankings.sort((a, b) => b.consecutiveDays - a.consecutiveDays);
            } else {
                rankings.sort((a, b) => b.cumulativeDays - a.cumulativeDays);
            }

            rankings.forEach((item, index) => { item.rank = index + 1; });

            return {
                rankings: rankings.slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT),
                totalParticipants: userIds.length
            };
        }

        // 전체(all): users 컬렉션의 누적 필드 사용
        const orderField = subType === 'consecutive' ? 'consecutiveDays' : 'cumulativeAttendanceDays';

        const usersSnapshot = await db.collection('users')
            .orderBy(orderField, 'desc')
            .limit(LEADERBOARD_CONFIG_SERVER.TOP_LIMIT)
            .get();

        // 해당 필드가 없는 경우 attendance 컬렉션에서 집계
        if (usersSnapshot.empty ||
            (usersSnapshot.docs[0].data()[orderField] === undefined && subType !== 'consecutive')) {
            const attendanceSnapshot = await db.collection('attendance').get();
            const userAttendance = {};

            attendanceSnapshot.forEach(doc => {
                const data = doc.data();
                const userId = data.userId;
                if (!userId) return;

                if (!userAttendance[userId]) {
                    userAttendance[userId] = { cumulativeDays: 0 };
                }
                userAttendance[userId].cumulativeDays++;
            });

            const userIds = Object.keys(userAttendance).slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT * 2);
            const userDocs = await Promise.all(
                userIds.map(id => db.collection('users').doc(id).get())
            );

            const rankings = userIds.map((userId, i) => {
                const userData = userDocs[i].exists ? userDocs[i].data() : {};
                return {
                    rank: 0,
                    userId,
                    displayName: userData.customDisplayName || userData.displayName || userData.name || '익명',
                    photoURL: userData.photoURL || null,
                    cumulativeDays: userAttendance[userId].cumulativeDays,
                    consecutiveDays: userData.consecutiveDays || 0
                };
            });

            if (subType === 'consecutive') {
                rankings.sort((a, b) => b.consecutiveDays - a.consecutiveDays);
            } else {
                rankings.sort((a, b) => b.cumulativeDays - a.cumulativeDays);
            }

            rankings.forEach((item, index) => { item.rank = index + 1; });

            return {
                rankings: rankings.slice(0, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT),
                totalParticipants: Object.keys(userAttendance).length
            };
        }

        const rankings = usersSnapshot.docs.map((doc, index) => {
            const data = doc.data();
            return {
                rank: index + 1,
                userId: doc.id,
                displayName: data.customDisplayName || data.displayName || data.name || '익명',
                photoURL: data.photoURL || null,
                consecutiveDays: data.consecutiveDays || 0,
                cumulativeDays: data.cumulativeAttendanceDays || 0
            };
        });

        return { rankings, totalParticipants: rankings.length };

    } catch (error) {
        console.error('출석 리더보드 계산 실패:', error);
        return { rankings: [], totalParticipants: 0 };
    }
}

// 리더보드 조회 API
app.get('/api/leaderboard/:type', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const { type } = req.params;
    const { subType = 'total', period = 'all', limit = 50, sortBy = 'earned' } = req.query;

    // 유효한 타입 확인
    const validTypes = ['betting-accuracy', 'coin', 'community', 'attendance'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 리더보드 타입입니다.' });
    }

    // 유효한 기간 확인
    const validPeriods = ['weekly', 'monthly', 'season', 'all'];
    if (!validPeriods.includes(period)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 기간입니다.' });
    }

    try {
        const result = await getLeaderboard(type, subType, period, Math.min(parseInt(limit) || 50, 100), sortBy);

        res.json({
            success: true,
            type,
            subType,
            period,
            sortBy,
            periodKey: getPeriodKey(period),
            ...result
        });

    } catch (error) {
        console.error('리더보드 조회 실패:', error);
        res.status(500).json({ success: false, error: '리더보드 조회에 실패했습니다.' });
    }
});

// 내 순위 조회 API
app.get('/api/leaderboard/:type/my-rank', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { type } = req.params;
    const { subType = 'total', period = 'all', sortBy = 'earned' } = req.query;

    try {
        // 전체 리더보드 가져오기 (캐시 활용)
        const result = await getLeaderboard(type, subType, period, LEADERBOARD_CONFIG_SERVER.TOP_LIMIT, sortBy);

        // 내 순위 찾기
        const myRank = result.rankings.find(r => r.userId === userId);

        if (myRank) {
            return res.json({
                success: true,
                myRank,
                totalParticipants: result.totalParticipants
            });
        }

        // TOP 100에 없으면 별도로 내 데이터 조회
        let myData = null;
        let estimatedRank = null;

        if (type === 'betting-accuracy') {
            const statsDoc = await db.collection('userBettingStats').doc(userId).get();
            if (statsDoc.exists) {
                const data = statsDoc.data();
                const userDoc = await db.collection('users').doc(userId).get();
                const userData = userDoc.exists ? userDoc.data() : {};

                let totalBets = 0;
                let correctBets = 0;

                if (subType === 'podium') {
                    totalBets = data.podium?.totalBets || 0;
                    correctBets = data.podium?.wonBets || 0;
                } else if (subType === 'h2h') {
                    totalBets = data.headToHead?.totalBets || 0;
                    correctBets = data.headToHead?.wonBets || 0;
                } else {
                    totalBets = (data.podium?.totalBets || 0) + (data.headToHead?.totalBets || 0);
                    correctBets = (data.podium?.wonBets || 0) + (data.headToHead?.wonBets || 0);
                }

                const accuracy = totalBets > 0 ? (correctBets / totalBets * 100) : 0;

                myData = {
                    userId,
                    displayName: userData.displayName || userData.name || '익명',
                    photoURL: userData.photoURL || null,
                    accuracy: Math.round(accuracy * 10) / 10,
                    totalBets,
                    correctBets
                };

                // 순위 추정 (내 적중률보다 높은 사용자 수 + 1)
                const countSnapshot = await db.collection('userBettingStats').get();
                let higherCount = 0;
                countSnapshot.forEach(doc => {
                    if (doc.id === userId) return;
                    const d = doc.data();
                    let tb = 0, cb = 0;
                    if (subType === 'podium') {
                        tb = d.podium?.totalBets || 0;
                        cb = d.podium?.wonBets || 0;
                    } else if (subType === 'h2h') {
                        tb = d.headToHead?.totalBets || 0;
                        cb = d.headToHead?.wonBets || 0;
                    } else {
                        tb = (d.podium?.totalBets || 0) + (d.headToHead?.totalBets || 0);
                        cb = (d.podium?.wonBets || 0) + (d.headToHead?.wonBets || 0);
                    }
                    if (tb >= 3) {
                        const acc = tb > 0 ? (cb / tb * 100) : 0;
                        if (acc > accuracy) higherCount++;
                    }
                });
                estimatedRank = higherCount + 1;
            }
        } else if (type === 'coin') {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                myData = {
                    userId,
                    displayName: data.displayName || data.name || '익명',
                    photoURL: data.photoURL || null,
                    totalEarned: data.totalEarned || 0,
                    currentTokens: data.tokens || 0
                };

                const countSnapshot = await db.collection('users')
                    .where('totalEarned', '>', data.totalEarned || 0)
                    .get();
                estimatedRank = countSnapshot.size + 1;
            }
        }

        if (myData) {
            myData.rank = estimatedRank;
            return res.json({
                success: true,
                myRank: myData,
                totalParticipants: result.totalParticipants,
                isEstimated: true
            });
        }

        res.json({
            success: true,
            myRank: null,
            message: '순위 데이터가 없습니다.'
        });

    } catch (error) {
        console.error('내 순위 조회 실패:', error);
        res.status(500).json({ success: false, error: '순위 조회에 실패했습니다.' });
    }
});

// ========================================
// 커뮤니티 API (리더보드 연동)
// ========================================

// 좋아요 API (서버에서 communityStats 업데이트)
app.post('/api/community/like', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { postId, action } = req.body;  // action: 'like' | 'unlike'

    if (!postId || !['like', 'unlike'].includes(action)) {
        return res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
            const postRef = db.collection('posts').doc(postId);
            const likeRef = db.collection('likes').doc(`${postId}_${userId}`);

            const postDoc = await transaction.get(postRef);
            if (!postDoc.exists) {
                throw new Error('POST_NOT_FOUND');
            }

            const post = postDoc.data();
            const authorId = post.authorId;

            if (action === 'like') {
                // 이미 좋아요했는지 확인
                const existingLike = await transaction.get(likeRef);
                if (existingLike.exists) {
                    throw new Error('ALREADY_LIKED');
                }

                // 좋아요 생성
                transaction.set(likeRef, {
                    userId,
                    postId,
                    authorId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 게시글 좋아요 수 증가
                transaction.update(postRef, {
                    likeCount: admin.firestore.FieldValue.increment(1)
                });

                // 작성자의 communityStats.receivedLikes 증가
                const authorRef = db.collection('users').doc(authorId);
                transaction.set(authorRef, {
                    communityStats: {
                        receivedLikes: admin.firestore.FieldValue.increment(1)
                    }
                }, { merge: true });

                return { action: 'liked', newLikeCount: (post.likeCount || 0) + 1 };

            } else {
                // 좋아요 취소
                const existingLike = await transaction.get(likeRef);
                if (!existingLike.exists) {
                    throw new Error('NOT_LIKED');
                }

                // 좋아요 삭제
                transaction.delete(likeRef);

                // 게시글 좋아요 수 감소
                transaction.update(postRef, {
                    likeCount: admin.firestore.FieldValue.increment(-1)
                });

                // 작성자의 communityStats.receivedLikes 감소
                const authorRef = db.collection('users').doc(authorId);
                transaction.set(authorRef, {
                    communityStats: {
                        receivedLikes: admin.firestore.FieldValue.increment(-1)
                    }
                }, { merge: true });

                return { action: 'unliked', newLikeCount: Math.max(0, (post.likeCount || 0) - 1) };
            }
        });

        res.json({ success: true, ...result });

    } catch (error) {
        const errorMessages = {
            'POST_NOT_FOUND': '게시글을 찾을 수 없습니다.',
            'ALREADY_LIKED': '이미 좋아요한 게시글입니다.',
            'NOT_LIKED': '좋아요하지 않은 게시글입니다.'
        };

        if (errorMessages[error.message]) {
            return res.status(400).json({ success: false, error: errorMessages[error.message] });
        }

        console.error('좋아요 처리 실패:', error);
        res.status(500).json({ success: false, error: '좋아요 처리에 실패했습니다.' });
    }
});

// 게시글 작성 시 communityStats 업데이트
app.post('/api/community/post-created', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        // communityStats.postCount 증가
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
            communityStats: {
                postCount: admin.firestore.FieldValue.increment(1)
            }
        }, { merge: true });

        res.json({ success: true });

    } catch (error) {
        console.error('게시글 카운트 업데이트 실패:', error);
        // 실패해도 게시글 작성은 성공으로 처리
        res.json({ success: true, warning: '통계 업데이트 실패' });
    }
});

// 게시글 삭제 시 communityStats 업데이트
app.post('/api/community/post-deleted', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { likeCount = 0 } = req.body;  // 삭제되는 게시글의 좋아요 수

    try {
        // communityStats 업데이트
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
            communityStats: {
                postCount: admin.firestore.FieldValue.increment(-1),
                receivedLikes: admin.firestore.FieldValue.increment(-likeCount)
            }
        }, { merge: true });

        res.json({ success: true });

    } catch (error) {
        console.error('게시글 삭제 통계 업데이트 실패:', error);
        res.json({ success: true, warning: '통계 업데이트 실패' });
    }
});

// 홈페이지 위젯용 API (포디움 적중률 TOP 3)
app.get('/api/leaderboard/widget/podium-accuracy', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    try {
        const result = await getLeaderboard('betting-accuracy', 'podium', 'all', 3);

        res.json({
            success: true,
            topThree: result.rankings,
            totalParticipants: result.totalParticipants,
            lastUpdated: result.lastUpdated
        });

    } catch (error) {
        console.error('위젯 데이터 조회 실패:', error);
        res.status(500).json({ success: false, error: '데이터 조회에 실패했습니다.' });
    }
});

// ========================================
// 홈페이지 베팅 프리뷰 API
// ========================================

// 30초 메모리 캐시
let bettingPreviewCache = { data: null, timestamp: 0 };
const BETTING_PREVIEW_CACHE_TTL = 30 * 1000;

/**
 * 현재(가장 가까운 미래) 레이스 ID 계산
 */
function getCurrentRaceInfo() {
    const now = new Date();
    for (let i = 0; i < RACE_SCHEDULE.length; i++) {
        const raceDate = new Date(RACE_SCHEDULE[i].date);
        // 레이스 종료 시간 (시작 + 2시간) - 클라이언트 getNextRace()와 동일 로직
        const raceEndDate = new Date(raceDate.getTime() + 2 * 60 * 60 * 1000);
        if (raceEndDate > now) {
            const kst = getKSTDateParts(raceDate);
            const raceId = `race_${i + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;
            return { raceId, raceName: RACE_SCHEDULE[i].name, round: i + 1 };
        }
    }
    // 시즌 종료 시 마지막 레이스
    const last = RACE_SCHEDULE.length - 1;
    const kst = getKSTDateParts(new Date(RACE_SCHEDULE[last].date));
    const raceId = `race_${last + 1}_${kst.year}${String(kst.month).padStart(2, '0')}${String(kst.day).padStart(2, '0')}`;
    return { raceId, raceName: RACE_SCHEDULE[last].name, round: last + 1 };
}

app.get('/api/betting/home-preview', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    // 캐시 확인
    if (bettingPreviewCache.data && Date.now() - bettingPreviewCache.timestamp < BETTING_PREVIEW_CACHE_TTL) {
        return res.json(bettingPreviewCache.data);
    }

    try {
        const { raceId, raceName } = getCurrentRaceInfo();

        // 포디움 베팅 집계: 현재 레이스의 pending 베팅
        const podiumSnap = await db.collection('podiumBets')
            .where('raceId', '==', raceId)
            .where('status', '==', 'pending')
            .get();

        let totalParticipants = podiumSnap.size;
        let totalBetAmount = 0;
        const driverP1Counts = {};
        const driverPools = {};

        podiumSnap.forEach(doc => {
            const bet = doc.data();
            totalBetAmount += bet.totalAmount || 0;
            // bets 배열에서 P1 (position === 1) 드라이버 카운트
            if (Array.isArray(bet.bets)) {
                const p1Bet = bet.bets.find(b => b.position === 1);
                if (p1Bet) {
                    const key = p1Bet.driverNumber;
                    driverP1Counts[key] = (driverP1Counts[key] || 0) + 1;
                }
                // 드라이버별 베팅액 집계 (liveOdds 계산용)
                bet.bets.forEach(b => {
                    if (b.driverNumber != null) {
                        driverPools[b.driverNumber] = (driverPools[b.driverNumber] || 0) + (b.betAmount || 0);
                    }
                });
            }
        });

        // 실시간 배당률 계산: (총풀 × 0.9) / 드라이버풀
        let liveOdds = null;
        if (totalBetAmount > 0 && Object.keys(driverPools).length > 0) {
            liveOdds = {};
            for (const [num, pool] of Object.entries(driverPools)) {
                if (pool > 0) {
                    let odds = Math.round(((totalBetAmount * 0.9) / pool) * 10) / 10;
                    odds = Math.max(1.1, Math.min(50.0, odds));
                    liveOdds[num] = odds;
                }
            }
        }

        // P1 예측 상위 3 드라이버
        const topDrivers = Object.entries(driverP1Counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([driverNumber, count]) => ({
                driverNumber: parseInt(driverNumber),
                count,
                percentage: totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0
            }));

        // H2H 베팅 집계: 현재 레이스의 pending 베팅
        const h2hSnap = await db.collection('headToHeadBets')
            .where('raceId', '==', raceId)
            .where('status', '==', 'pending')
            .get();

        const matchupData = {};
        h2hSnap.forEach(doc => {
            const bet = doc.data();
            const mid = bet.matchupId;
            if (!mid) return;
            if (!matchupData[mid]) {
                matchupData[mid] = {
                    matchupId: mid,
                    driverA: bet.matchup?.driverA || null,
                    driverB: bet.matchup?.driverB || null,
                    totalAmount: 0,
                    participants: 0,
                    amountA: 0,
                    amountB: 0,
                    countA: 0,
                    countB: 0
                };
            }
            matchupData[mid].totalAmount += bet.betAmount || 0;
            matchupData[mid].participants += 1;
            // 누가 선택했는지에 따라 금액/인원 분배
            if (bet.predictedWinner === matchupData[mid].driverA?.number) {
                matchupData[mid].amountA += bet.betAmount || 0;
                matchupData[mid].countA += 1;
            } else {
                matchupData[mid].amountB += bet.betAmount || 0;
                matchupData[mid].countB += 1;
            }
        });

        // 참여자 수 기준 상위 3개 매치업
        const matchups = Object.values(matchupData)
            .sort((a, b) => b.participants - a.participants)
            .slice(0, 3)
            .map(m => {
                const totalCount = m.countA + m.countB;
                return {
                    matchupId: m.matchupId,
                    driverA: m.driverA,
                    driverB: m.driverB,
                    participants: m.participants,
                    totalAmount: m.totalAmount,
                    percentA: totalCount > 0 ? Math.round((m.countA / totalCount) * 100) : 50,
                    percentB: totalCount > 0 ? Math.round((m.countB / totalCount) * 100) : 50
                };
            });

        const responseData = {
            success: true,
            raceId,
            raceName,
            podium: { totalParticipants, totalBetAmount, topDrivers, ...(liveOdds && { liveOdds }) },
            matchups
        };

        // 캐시 저장
        bettingPreviewCache = { data: responseData, timestamp: Date.now() };

        res.json(responseData);

    } catch (error) {
        console.error('베팅 프리뷰 API 오류:', error);
        res.status(500).json({ success: false, error: '데이터 조회에 실패했습니다.' });
    }
});

// ========================================
// 상점 API
// ========================================

// 카테고리 화이트리스트
const SHOP_CATEGORIES = ['profile-border', 'nickname-color', 'profile-bg', 'post-deco', 'functional', 'badge'];

// 아이템 ID 검증 (영숫자 + 하이픈 + 밑줄, 1~50자)
function isValidItemId(id) {
    return typeof id === 'string' && id.length >= 1 && id.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(id);
}

// GET /api/shop/items - 상점 아이템 목록 (인증 불필요)
app.get('/api/shop/items', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    try {
        let query = db.collection('shopItems').where('isActive', '==', true);

        // 카테고리 필터 (화이트리스트 검증)
        const { category, collection } = req.query;
        if (category) {
            if (!SHOP_CATEGORIES.includes(category)) {
                return res.status(400).json({ success: false, error: '유효하지 않은 카테고리입니다.' });
            }
            query = query.where('category', '==', category);
        }

        // 컬렉션 필터 (팀 컬렉션 등)
        const VALID_COLLECTIONS = ['team'];
        if (collection) {
            if (!VALID_COLLECTIONS.includes(collection)) {
                return res.status(400).json({ success: false, error: '유효하지 않은 컬렉션입니다.' });
            }
            query = query.where('collection', '==', collection);
        }

        query = query.orderBy('sortOrder', 'asc');

        const snapshot = await query.get();
        const items = [];

        const now = Date.now();
        snapshot.forEach(doc => {
            const data = doc.data();

            // limited 아이템: 판매 기간 체크
            if (data.type === 'limited') {
                const from = data.availableFrom ? data.availableFrom.toMillis() : null;
                const until = data.availableUntil ? data.availableUntil.toMillis() : null;
                // availableFrom/Until이 설정된 경우 기간 외이면 목록에서 제외
                if (from && now < from) return;
                if (until && now > until) return;
            }

            // 민감 정보(effectData 내부 구조) 제외
            items.push({
                id: doc.id,
                name: data.name,
                description: data.description || '',
                category: data.category,
                rarity: data.rarity,
                price: data.price,
                type: data.type || 'permanent',
                durationType: data.durationType || null,
                sortOrder: data.sortOrder,
                previewData: data.previewData || null,
                collection: data.collection || null
            });
        });

        res.json({ success: true, items });

    } catch (error) {
        console.error('상점 아이템 조회 실패:', error);
        res.status(500).json({ success: false, error: '아이템 목록을 불러오는데 실패했습니다.' });
    }
});

// GET /api/shop/inventory - 내 보유 아이템 (인증 필요)
app.get('/api/shop/inventory', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const snapshot = await db.collection('userInventory')
            .where('userId', '==', userId)
            .orderBy('purchasedAt', 'desc')
            .get();

        const inventory = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            inventory.push({
                id: doc.id,
                itemId: data.itemId,
                itemName: data.itemName,
                category: data.category,
                rarity: data.rarity,
                type: data.type || 'permanent',
                equipped: data.equipped || false,
                purchasedAt: data.purchasedAt,
                price: data.price,
                expiresAt: data.expiresAt || null,
                usesRemaining: data.usesRemaining != null ? data.usesRemaining : null,
                isExpired: data.isExpired || false
            });
        });

        // shopItems에서 previewData + effectData 조회
        const itemIds = [...new Set(inventory.map(inv => inv.itemId))];
        const shopDataMap = {};

        // 10개씩 배치로 병렬 조회
        for (let i = 0; i < itemIds.length; i += 10) {
            const batch = itemIds.slice(i, i + 10);
            const results = await Promise.all(
                batch.map(id => db.collection('shopItems').doc(id).get())
            );
            results.forEach(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    shopDataMap[doc.id] = {
                        previewData: data.previewData || null,
                        effectData: data.effectData || null
                    };
                }
            });
        }

        // inventory에 previewData + consumableAction 매핑
        inventory.forEach(inv => {
            const shopData = shopDataMap[inv.itemId];
            inv.previewData = shopData?.previewData || null;
            if (inv.type === 'consumable' && shopData?.effectData) {
                inv.consumableAction = shopData.effectData.action || null;
            }
        });

        res.json({ success: true, inventory });

    } catch (error) {
        console.error('인벤토리 조회 실패:', error);
        res.status(500).json({ success: false, error: '인벤토리를 불러오는데 실패했습니다.' });
    }
});

// POST /api/shop/purchase - 아이템 구매 (인증 필요 + 트랜잭션)
app.post('/api/shop/purchase', verifyFirebaseToken, shopPurchaseLimiter, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { itemId } = req.body;

    // 입력값 검증
    if (!isValidItemId(itemId)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 아이템입니다.' });
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
            // 1. 아이템 존재 & 활성 확인 (서버에서 가격 직접 조회 - 가격 조작 방지)
            const itemRef = db.collection('shopItems').doc(itemId);
            const itemDoc = await transaction.get(itemRef);

            if (!itemDoc.exists) {
                throw new Error('ITEM_NOT_FOUND');
            }

            const itemData = itemDoc.data();

            if (!itemData.isActive) {
                throw new Error('ITEM_INACTIVE');
            }

            if (typeof itemData.price !== 'number' || itemData.price < 0) {
                throw new Error('INVALID_PRICE');
            }

            const price = itemData.price;
            const itemType = itemData.type || 'permanent';

            // 2. limited 아이템 자격 검증
            if (itemType === 'limited' && itemData.limitCondition) {
                const cond = itemData.limitCondition;
                if (cond === 'early-adopter') {
                    // 사용자 가입일이 2026-03-12 ~ 2026-03-26 범위인지 확인
                    const userRefCheck = db.collection('users').doc(userId);
                    const userDocCheck = await transaction.get(userRefCheck);
                    if (userDocCheck.exists) {
                        const createdAt = userDocCheck.data().createdAt;
                        if (createdAt) {
                            const createdMs = createdAt.toMillis ? createdAt.toMillis() : new Date(createdAt).getTime();
                            const openDate = new Date('2026-03-12T00:00:00+09:00').getTime();
                            const cutoffDate = new Date('2026-03-26T23:59:59+09:00').getTime();
                            if (createdMs < openDate || createdMs > cutoffDate) {
                                throw new Error('LIMITED_NOT_ELIGIBLE');
                            }
                        }
                    }
                }
                if (cond === 'podium-event') {
                    const from = itemData.availableFrom ? itemData.availableFrom.toMillis() : null;
                    const until = itemData.availableUntil ? itemData.availableUntil.toMillis() : null;
                    const now = Date.now();
                    if ((from && now < from) || (until && now > until)) {
                        throw new Error('LIMITED_NOT_AVAILABLE');
                    }
                }
                if (cond === 'season-2026') {
                    const seasonEnd = new Date('2026-12-06T22:00:00+09:00').getTime();
                    if (Date.now() > seasonEnd) {
                        throw new Error('LIMITED_NOT_AVAILABLE');
                    }
                }
            }

            // 3. 중복 구매 확인
            // consumable/functional은 중복 구매 허용 (고유 ID 사용)
            let inventoryId;
            if (itemType === 'consumable' || itemType === 'functional') {
                inventoryId = `${userId}_${itemId}_${Date.now()}`;
            } else {
                inventoryId = `${userId}_${itemId}`;
                const invRef = db.collection('userInventory').doc(inventoryId);
                const invDoc = await transaction.get(invRef);
                if (invDoc.exists) {
                    throw new Error('ALREADY_OWNED');
                }
            }

            const invRef = db.collection('userInventory').doc(inventoryId);

            // 4. 잔액 확인
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const currentTokens = userDoc.data().tokens || 0;

            if (currentTokens < price) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 5. 코인 차감
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(-price)
            });

            // 6. 인벤토리에 추가
            const invData = {
                userId,
                itemId,
                itemName: String(itemData.name).slice(0, 100),
                category: itemData.category,
                rarity: itemData.rarity,
                type: itemType,
                equipped: false,
                purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
                price,
                isExpired: false
            };

            // rental: 만료 시간 설정
            if (itemType === 'rental' && itemData.durationMs) {
                invData.expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + itemData.durationMs);
            }

            // consumable: 사용 횟수 설정
            if (itemType === 'consumable') {
                invData.usesRemaining = itemData.usesRemaining || 1;
            }

            transaction.set(invRef, invData);

            // 7. 토큰 히스토리 기록
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: -price,
                reason: `상점 구매: ${String(itemData.name).slice(0, 50)}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { newBalance: currentTokens - price, itemName: itemData.name };
        });

        res.json({
            success: true,
            message: `${result.itemName} 구매 완료!`,
            newBalance: result.newBalance
        });

    } catch (error) {
        const errorMap = {
            'ITEM_NOT_FOUND': { status: 404, message: '아이템을 찾을 수 없습니다.' },
            'ITEM_INACTIVE': { status: 400, message: '현재 판매 중이지 않은 아이템입니다.' },
            'INVALID_PRICE': { status: 400, message: '아이템 가격 정보가 올바르지 않습니다.' },
            'ALREADY_OWNED': { status: 409, message: '이미 보유한 아이템입니다.' },
            'USER_NOT_FOUND': { status: 400, message: '사용자 정보가 없습니다.' },
            'INSUFFICIENT_BALANCE': { status: 400, message: 'FC 코인이 부족합니다.' },
            'LIMITED_NOT_ELIGIBLE': { status: 403, message: '구매 자격이 없는 한정 아이템입니다.' },
            'LIMITED_NOT_AVAILABLE': { status: 400, message: '판매 기간이 아닌 한정 아이템입니다.' }
        };

        const mapped = errorMap[error.message];
        if (mapped) {
            return res.status(mapped.status).json({ success: false, error: mapped.message });
        }

        console.error('상점 구매 실패:', error);
        res.status(500).json({ success: false, error: '구매에 실패했습니다.' });
    }
});

// POST /api/shop/equip - 아이템 장착/해제 (인증 필요)
app.post('/api/shop/equip', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { itemId, equipped } = req.body;

    // 입력값 검증
    if (!isValidItemId(itemId)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 아이템입니다.' });
    }

    if (typeof equipped !== 'boolean') {
        return res.status(400).json({ success: false, error: '장착 상태가 올바르지 않습니다.' });
    }

    try {
        const inventoryId = `${userId}_${itemId}`;
        const invRef = db.collection('userInventory').doc(inventoryId);

        await db.runTransaction(async (transaction) => {
            const invDoc = await transaction.get(invRef);

            if (!invDoc.exists) {
                throw new Error('NOT_OWNED');
            }

            const invData = invDoc.data();

            if (invData.userId !== userId) {
                throw new Error('FORBIDDEN');
            }

            if (invData.type === 'consumable') {
                throw new Error('IS_CONSUMABLE');
            }

            // rental 만료 체크
            if (invData.type === 'rental' && invData.expiresAt) {
                const expiresMs = invData.expiresAt.toMillis ? invData.expiresAt.toMillis() : new Date(invData.expiresAt).getTime();
                if (Date.now() > expiresMs) {
                    transaction.update(invRef, { isExpired: true, equipped: false });
                    throw new Error('EXPIRED');
                }
            }

            if (invData.isExpired) {
                throw new Error('EXPIRED');
            }

            if (equipped) {
                // 같은 카테고리의 기존 장착 아이템 해제
                const equippedSnapshot = await transaction.get(
                    db.collection('userInventory')
                        .where('userId', '==', userId)
                        .where('category', '==', invData.category)
                        .where('equipped', '==', true)
                );
                equippedSnapshot.forEach(doc => {
                    if (doc.id !== inventoryId) {
                        transaction.update(doc.ref, { equipped: false });
                    }
                });
                transaction.update(invRef, { equipped: true });
            } else {
                transaction.update(invRef, { equipped: false });
            }
        });

        // userCosmetics 캐시 갱신 (트랜잭션 밖에서 실행)
        await updateUserCosmetics(userId);

        res.json({
            success: true,
            message: equipped ? '아이템을 장착했습니다.' : '아이템을 해제했습니다.',
            equipped
        });

    } catch (error) {
        const errorMap = {
            'NOT_OWNED': { status: 404, message: '보유하지 않은 아이템입니다.' },
            'FORBIDDEN': { status: 403, message: '권한이 없습니다.' },
            'IS_CONSUMABLE': { status: 400, message: '소모품은 장착할 수 없습니다. 사용하기를 이용해주세요.' },
            'EXPIRED': { status: 400, message: '만료된 아이템입니다.' }
        };
        const mapped = errorMap[error.message];
        if (mapped) {
            return res.status(mapped.status).json({ success: false, error: mapped.message });
        }
        console.error('장착/해제 실패:', error);
        res.status(500).json({ success: false, error: '장착/해제에 실패했습니다.' });
    }
});

// ========================================
// userCosmetics 캐시 갱신 헬퍼
// ========================================

async function updateUserCosmetics(userId) {
    if (!db) return;

    try {
        // 장착 중인 아이템 조회
        const equippedSnapshot = await db.collection('userInventory')
            .where('userId', '==', userId)
            .where('equipped', '==', true)
            .where('isExpired', '==', false)
            .get();

        const cosmetics = {
            border: null,
            badge: null,
            nicknameColor: null,
            postDeco: null,
            titles: [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        for (const doc of equippedSnapshot.docs) {
            const inv = doc.data();
            // shopItems에서 effectData 조회
            const itemDoc = await db.collection('shopItems').doc(inv.itemId).get();
            if (!itemDoc.exists) continue;
            const itemData = itemDoc.data();
            const effect = itemData.effectData || {};

            switch (inv.category) {
                case 'profile-border':
                    cosmetics.border = { itemId: inv.itemId, cssClass: effect.cssClass || '', svgIcon: effect.svgIcon || null, animation: effect.animation || null };
                    break;
                case 'badge':
                    cosmetics.badge = { itemId: inv.itemId, svgIcon: effect.svgIcon || '', name: inv.itemName };
                    break;
                case 'nickname-color':
                    cosmetics.nicknameColor = { itemId: inv.itemId, cssClass: effect.cssClass || '', animation: effect.animation || null };
                    break;
                case 'post-deco':
                    cosmetics.postDeco = { itemId: inv.itemId, cssClass: effect.cssClass || '', animation: effect.animation || null };
                    break;
            }
        }

        // 장착 중인 칭호 조회 (최대 3개)
        const equippedTitles = await db.collection('userTitles')
            .where('userId', '==', userId)
            .where('equipped', '==', true)
            .limit(3)
            .get();

        for (const doc of equippedTitles.docs) {
            const t = doc.data();
            // titleId로 titles 문서 조회하여 cssClass 포함
            const titleDoc = await db.collection('titles').doc(t.titleId).get();
            const titleData = titleDoc.exists ? titleDoc.data() : {};
            const style = titleData.style || {};
            cosmetics.titles.push({
                titleId: t.titleId,
                name: t.titleName,
                cssClass: style.cssClass || null
            });
        }

        await db.collection('userCosmetics').doc(userId).set(cosmetics);
    } catch (error) {
        console.error('userCosmetics 갱신 실패:', error);
    }
}

// ========================================
// POST /api/shop/use - 소모품 사용 (인증 필요)
// ========================================

app.post('/api/shop/use', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { inventoryId, context } = req.body;

    if (!inventoryId || typeof inventoryId !== 'string') {
        return res.status(400).json({ success: false, error: '유효하지 않은 인벤토리 ID입니다.' });
    }

    const VALID_CONTEXT_TYPES = ['highlight', 'pin', 'nickname-change'];
    if (!context || !VALID_CONTEXT_TYPES.includes(context.type)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 사용 컨텍스트입니다.' });
    }

    try {
        const invRef = db.collection('userInventory').doc(inventoryId);
        const contextType = context.type;

        const result = await db.runTransaction(async (transaction) => {
            const invDoc = await transaction.get(invRef);

            if (!invDoc.exists) {
                throw new Error('ITEM_NOT_FOUND');
            }

            const invData = invDoc.data();

            if (invData.userId !== userId) {
                throw new Error('FORBIDDEN');
            }

            if (invData.type !== 'consumable') {
                throw new Error('NOT_CONSUMABLE');
            }

            if (invData.isExpired || (invData.usesRemaining != null && invData.usesRemaining <= 0)) {
                throw new Error('ALREADY_USED');
            }

            // 사용 횟수 차감
            const newUses = (invData.usesRemaining || 1) - 1;
            const updates = { usesRemaining: newUses };
            if (newUses <= 0) {
                updates.isExpired = true;
            }
            transaction.update(invRef, updates);

            // 컨텍스트별 효과 적용
            if (contextType === 'highlight' && !context.postId) {
                // 하이라이트 충전 모드: postId 없이 사용 → highlightAvailable 증가
                const userRef = db.collection('users').doc(userId);
                transaction.update(userRef, {
                    highlightAvailable: admin.firestore.FieldValue.increment(1)
                });
            } else if (contextType === 'highlight' && context.postId) {
                // 기존 직접 적용 모드 (호환성 유지)
                const postRef = db.collection('posts').doc(context.postId);
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists || postDoc.data().authorId !== userId) {
                    throw new Error('POST_NOT_OWNED');
                }
                transaction.update(postRef, { highlight: true });
            } else if (contextType === 'pin' && context.postId) {
                const postRef = db.collection('posts').doc(context.postId);
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists || postDoc.data().authorId !== userId) {
                    throw new Error('POST_NOT_OWNED');
                }
                transaction.update(postRef, {
                    pinnedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
                });
            } else if (contextType === 'pin' && !context.postId) {
                throw new Error('POST_REQUIRED');
            } else if (contextType === 'nickname-change') {
                transaction.update(db.collection('users').doc(userId), {
                    nicknameChangeAllowed: true
                });
            }

            return newUses;
        });

        res.json({ success: true, message: '아이템을 사용했습니다.', usesRemaining: result });

    } catch (error) {
        const errorMap = {
            'ITEM_NOT_FOUND': { status: 404, message: '아이템을 찾을 수 없습니다.' },
            'FORBIDDEN': { status: 403, message: '권한이 없습니다.' },
            'NOT_CONSUMABLE': { status: 400, message: '소모품만 사용할 수 있습니다.' },
            'ALREADY_USED': { status: 400, message: '이미 사용된 아이템입니다.' },
            'POST_NOT_OWNED': { status: 403, message: '본인의 게시글에만 사용할 수 있습니다.' },
            'POST_REQUIRED': { status: 400, message: '게시글을 선택해야 합니다.' }
        };
        const mapped = errorMap[error.message];
        if (mapped) {
            return res.status(mapped.status).json({ success: false, error: mapped.message });
        }
        console.error('소모품 사용 실패:', error);
        res.status(500).json({ success: false, error: '아이템 사용에 실패했습니다.' });
    }
});

// ========================================
// POST /api/post/consume-highlight - 하이라이트 카운터 차감 (인증 필요)
// ========================================

app.post('/api/post/consume-highlight', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const userRef = db.collection('users').doc(userId);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }
            const available = userDoc.data().highlightAvailable || 0;
            if (available <= 0) {
                throw new Error('NO_HIGHLIGHT');
            }
            transaction.update(userRef, {
                highlightAvailable: admin.firestore.FieldValue.increment(-1)
            });
        });

        res.json({ success: true, message: '하이라이트가 적용되었습니다.' });

    } catch (error) {
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }
        if (error.message === 'NO_HIGHLIGHT') {
            return res.status(400).json({ success: false, error: '사용 가능한 하이라이트가 없습니다.' });
        }
        console.error('하이라이트 차감 실패:', error);
        res.status(500).json({ success: false, error: '하이라이트 적용에 실패했습니다.' });
    }
});

// ========================================
// GET /api/user/cosmetics/:userId - 단일 사용자 코스메틱 조회
// ========================================

app.get('/api/user/cosmetics/:userId', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const { userId } = req.params;
    if (!userId || typeof userId !== 'string' || userId.length > 128) {
        return res.status(400).json({ success: false, error: '유효하지 않은 사용자 ID입니다.' });
    }

    try {
        const [cosDoc, userDoc] = await Promise.all([
            db.collection('userCosmetics').doc(userId).get(),
            db.collection('users').doc(userId).get()
        ]);
        const data = cosDoc.exists ? cosDoc.data() : {};
        const userData = userDoc.exists ? userDoc.data() : {};
        res.json({
            success: true,
            cosmetics: {
                border: data.border || null,
                badge: data.badge || null,
                nicknameColor: data.nicknameColor || null,
                postDeco: data.postDeco || null,
                titles: data.titles || [],
                customDisplayName: userData.customDisplayName || null
            }
        });
    } catch (error) {
        console.error('코스메틱 조회 실패:', error);
        res.status(500).json({ success: false, error: '코스메틱 정보를 불러오는데 실패했습니다.' });
    }
});

// ========================================
// POST /api/user/cosmetics-batch - 다수 사용자 코스메틱 일괄 조회
// ========================================

app.post('/api/user/cosmetics-batch', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 30) {
        return res.status(400).json({ success: false, error: '사용자 ID 배열이 필요합니다 (최대 30개).' });
    }

    // 입력 검증
    for (const id of userIds) {
        if (typeof id !== 'string' || id.length > 128) {
            return res.status(400).json({ success: false, error: '유효하지 않은 사용자 ID가 포함되어 있습니다.' });
        }
    }

    try {
        const cosRefs = userIds.map(uid => db.collection('userCosmetics').doc(uid));
        const userRefs = userIds.map(uid => db.collection('users').doc(uid));
        const [cosDocs, userDocs] = await Promise.all([
            db.getAll(...cosRefs),
            db.getAll(...userRefs)
        ]);

        const result = {};
        userIds.forEach((uid, index) => {
            const cosData = cosDocs[index].exists ? cosDocs[index].data() : {};
            const userData = userDocs[index].exists ? userDocs[index].data() : {};
            result[uid] = {
                border: cosData.border || null,
                badge: cosData.badge || null,
                nicknameColor: cosData.nicknameColor || null,
                postDeco: cosData.postDeco || null,
                titles: cosData.titles || [],
                customDisplayName: userData.customDisplayName || null
            };
        });

        res.json({ success: true, cosmetics: result });
    } catch (error) {
        console.error('배치 코스메틱 조회 실패:', error);
        res.status(500).json({ success: false, error: '코스메틱 정보를 불러오는데 실패했습니다.' });
    }
});

// ========================================
// 칭호 시스템 API
// ========================================

// GET /api/titles - 전체 칭호 목록 조회 (인증 불필요)
app.get('/api/titles', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    try {
        const snapshot = await db.collection('titles').orderBy('createdAt', 'asc').get();
        const titles = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const titleObj = {
                id: doc.id,
                name: data.name,
                hint: data.hint || '',
                hidden: data.hidden || false,
                icon: data.icon || 'icon-trophy.svg',
                holderCount: data.holderCount || 0,
                category: data.category || null,
                style: data.style || null
            };

            // holderCount <= 20인 칭호: 보유자 목록 포함
            if (titleObj.holderCount > 0 && titleObj.holderCount <= 20) {
                try {
                    const holdersSnap = await db.collection('userTitles')
                        .where('titleId', '==', doc.id)
                        .get();

                    const holderUids = holdersSnap.docs.map(d => d.data().userId);
                    const holders = [];

                    for (const uid of holderUids) {
                        try {
                            const userDoc = await db.collection('users').doc(uid).get();
                            if (userDoc.exists) {
                                const userData = userDoc.data();
                                holders.push({
                                    uid,
                                    displayName: userData.displayName || 'F1 Fan',
                                    photoURL: userData.photoURL || ''
                                });
                            }
                        } catch (e) {
                            // 개별 유저 조회 실패 무시
                        }
                    }

                    titleObj.holders = holders;
                } catch (e) {
                    titleObj.holders = [];
                }
            }

            titles.push(titleObj);
        }

        res.json({ success: true, titles });
    } catch (error) {
        console.error('칭호 목록 조회 실패:', error);
        res.status(500).json({ success: false, error: '칭호 목록을 불러오는데 실패했습니다.' });
    }
});

// GET /api/titles/my - 내 보유 칭호 조회 + 미보유 진행도 (인증 필요)
app.get('/api/titles/my', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const snapshot = await db.collection('userTitles')
            .where('userId', '==', userId)
            .get();

        const myTitles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                titleId: data.titleId,
                titleName: data.titleName,
                equipped: data.equipped || false,
                earnedAt: data.earnedAt || data.awardedAt
            };
        });

        const ownedSet = new Set(myTitles.map(t => t.titleId));

        // 미보유 칭호의 진행도 계산
        const progress = [];
        try {
            const titlesSnap = await db.collection('titles').get();
            const unownedWithProgress = titlesSnap.docs.filter(doc => {
                const data = doc.data();
                return !ownedSet.has(doc.id) && data.progressType && data.progressTarget;
            });

            if (unownedWithProgress.length > 0) {
                // 유저 통계 한 번에 조회
                const stats = await calculateUserProgress(userId);

                for (const doc of unownedWithProgress) {
                    const data = doc.data();
                    const current = stats[data.progressType] || 0;
                    progress.push({
                        titleId: doc.id,
                        current: Math.min(current, data.progressTarget),
                        target: data.progressTarget
                    });
                }
            }
        } catch (progressError) {
            console.error('진행도 계산 실패:', progressError);
            // 진행도 실패해도 myTitles는 반환
        }

        res.json({ success: true, myTitles, progress });
    } catch (error) {
        console.error('내 칭호 조회 실패:', error);
        res.status(500).json({ success: false, error: '보유 칭호를 불러오는데 실패했습니다.' });
    }
});

/**
 * 유저 진행도 통계 일괄 계산
 * @param {string} userId
 * @returns {Object} { progressType: currentValue }
 */
async function calculateUserProgress(userId) {
    const stats = {};

    try {
        // 1. 베팅 관련 통계
        const betsSnap = await db.collection('bets')
            .where('userId', '==', userId)
            .get();

        let totalBets = 0;
        let podiumCorrect = 0;
        let h2hCorrect = 0;

        for (const doc of betsSnap.docs) {
            const data = doc.data();
            totalBets++;
            if (data.type === 'podium' && data.result === 'correct') podiumCorrect++;
            if (data.type === 'h2h' && data.result === 'correct') h2hCorrect++;
        }

        stats.total_bets = totalBets;
        stats.podium_correct = podiumCorrect;
        stats.h2h_correct = h2hCorrect;

        // 베팅 칭호용 통계 (userBettingStats에서 조회)
        const bettingStatsDoc = await db.collection('userBettingStats').doc(userId).get();
        if (bettingStatsDoc.exists) {
            const combined = bettingStatsDoc.data().combined || {};
            stats.betting_total_bets = combined.totalBets || 0;
            stats.betting_total_wins = combined.totalWins || 0;
            stats.betting_total_losses = combined.totalLosses || 0;
            stats.betting_max_win_streak = combined.maxWinStreak || 0;
            stats.betting_max_lose_streak = combined.maxLoseStreak || 0;
        }

        // 2. 출석 관련 통계
        const attendanceSnap = await db.collection('attendanceRecords')
            .where('userId', '==', userId)
            .get();

        stats.attendance_days = attendanceSnap.size;

        // 연속 출석 계산
        if (attendanceSnap.size > 0) {
            const dates = attendanceSnap.docs
                .map(d => {
                    const ts = d.data().date || d.data().timestamp;
                    if (!ts) return null;
                    const date = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
                    return date.toISOString().split('T')[0];
                })
                .filter(Boolean)
                .sort()
                .reverse();

            let streak = 1;
            for (let i = 1; i < dates.length; i++) {
                const curr = new Date(dates[i - 1]);
                const prev = new Date(dates[i]);
                const diff = (curr - prev) / (1000 * 60 * 60 * 24);
                if (diff === 1) {
                    streak++;
                } else {
                    break;
                }
            }
            stats.attendance_streak = streak;
        } else {
            stats.attendance_streak = 0;
        }

        // 3. 코인 통계
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            stats.coin_total = userData.totalCoinsEarned || userData.coins || 0;
        }

        // 4. 커뮤니티 통계 (게시글 수, 받은 좋아요)
        const postsSnap = await db.collection('posts')
            .where('authorId', '==', userId)
            .get();

        stats.post_count = postsSnap.size;

        let totalLikes = 0;
        for (const doc of postsSnap.docs) {
            const data = doc.data();
            totalLikes += data.likeCount || 0;
        }
        stats.like_count = totalLikes;

    } catch (error) {
        console.error('유저 통계 계산 중 오류:', error);
    }

    return stats;
}

// GET /api/titles/user/:uid - 특정 유저 보유 칭호 조회 (공개 프로필용, 인증 불필요)
app.get('/api/titles/user/:uid', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.params.uid;

    try {
        const snapshot = await db.collection('userTitles')
            .where('userId', '==', userId)
            .get();

        const userTitles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                titleId: data.titleId,
                titleName: data.titleName,
                equipped: data.equipped || false
            };
        });

        res.json({ success: true, userTitles });
    } catch (error) {
        console.error('유저 칭호 조회 실패:', error);
        res.status(500).json({ success: false, error: '칭호를 불러오는데 실패했습니다.' });
    }
});

// POST /api/titles/equip - 칭호 장착/해제 (인증 필요)
app.post('/api/titles/equip', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { titleId, equipped } = req.body;

    if (!titleId || typeof titleId !== 'string') {
        return res.status(400).json({ success: false, error: '유효하지 않은 칭호 ID입니다.' });
    }
    if (typeof equipped !== 'boolean') {
        return res.status(400).json({ success: false, error: 'equipped 값은 boolean이어야 합니다.' });
    }

    try {
        const docId = `${userId}_${titleId}`;
        const userTitleRef = db.collection('userTitles').doc(docId);

        await db.runTransaction(async (transaction) => {
            const userTitleDoc = await transaction.get(userTitleRef);

            // 보유 여부 확인
            if (!userTitleDoc.exists) {
                throw new Error('NOT_OWNED');
            }

            if (equipped) {
                // 장착: 현재 장착 수 확인 (최대 3개)
                const equippedQuery = db.collection('userTitles')
                    .where('userId', '==', userId)
                    .where('equipped', '==', true);
                const equippedSnapshot = await transaction.get(equippedQuery);

                // 이미 장착 중인 경우 중복 카운트 방지
                const currentEquipped = equippedSnapshot.docs.filter(d => d.id !== docId);
                if (currentEquipped.length >= 3) {
                    throw new Error('MAX_EQUIPPED');
                }
            }

            transaction.update(userTitleRef, { equipped });
        });

        // 코스메틱 캐시 갱신
        await updateUserCosmetics(userId);

        const message = equipped ? '칭호를 장착했습니다.' : '칭호를 해제했습니다.';
        res.json({ success: true, message, equipped });
    } catch (error) {
        if (error.message === 'NOT_OWNED') {
            return res.status(403).json({ success: false, error: '보유하지 않은 칭호입니다.' });
        }
        if (error.message === 'MAX_EQUIPPED') {
            return res.status(400).json({ success: false, error: '칭호는 최대 3개까지 장착할 수 있습니다.' });
        }
        console.error('칭호 장착/해제 실패:', error);
        res.status(500).json({ success: false, error: '칭호 장착/해제에 실패했습니다.' });
    }
});

// GET /api/titles/recent-achievements - 최근 희귀 칭호 달성 피드 (인증 불필요)
app.get('/api/titles/recent-achievements', async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    try {
        // 1. 희귀 칭호 ID 수집 (holderCount <= 20 && holderCount > 0)
        const titlesSnap = await db.collection('titles').get();
        const rareTitleIds = new Set();
        const titleNameMap = {};
        for (const doc of titlesSnap.docs) {
            const data = doc.data();
            titleNameMap[doc.id] = data.name || doc.id;
            const hc = data.holderCount || 0;
            if (hc > 0 && hc <= 20) {
                rareTitleIds.add(doc.id);
            }
        }

        if (rareTitleIds.size === 0) {
            return res.json({ success: true, achievements: [] });
        }

        // 2. 최근 7일 이내 달성 기록 조회
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentSnap = await db.collection('userTitles')
            .where('earnedAt', '>=', sevenDaysAgo)
            .orderBy('earnedAt', 'desc')
            .limit(20)
            .get();

        // 3. 희귀 칭호만 필터
        const rareAchievements = [];
        for (const doc of recentSnap.docs) {
            const data = doc.data();
            if (rareTitleIds.has(data.titleId)) {
                rareAchievements.push(data);
            }
            if (rareAchievements.length >= 10) break;
        }

        // 4. userId로 유저 정보 조회
        const achievements = [];
        for (const ach of rareAchievements) {
            let userName = 'F1 Fan';
            let userPhoto = '';
            try {
                const userDoc = await db.collection('users').doc(ach.userId).get();
                if (userDoc.exists) {
                    const u = userDoc.data();
                    userName = u.displayName || 'F1 Fan';
                    userPhoto = u.photoURL || '';
                }
            } catch (e) {
                // 유저 조회 실패 시 기본값 사용
            }
            achievements.push({
                titleId: ach.titleId,
                titleName: titleNameMap[ach.titleId] || ach.titleId,
                userName,
                userPhoto,
                earnedAt: ach.earnedAt
            });
        }

        res.json({ success: true, achievements });
    } catch (error) {
        console.error('최근 달성 피드 조회 실패:', error);
        res.status(500).json({ success: false, error: '최근 달성 정보를 불러오는데 실패했습니다.' });
    }
});

// 404 핸들러 - 존재하지 않는 페이지
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ========================================
// 전역 에러 핸들러 (서버 종료 방지)
// ========================================

// 처리되지 않은 예외
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error(err.stack);
    // 프로세스 종료하지 않고 계속 실행
});

// 처리되지 않은 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    // 프로세스 종료하지 않고 계속 실행
});

// ========================================
// 리더보드 스케줄러 (node-cron)
// ========================================

/**
 * 리더보드 캐시 갱신 (Firestore에 저장)
 */
async function refreshLeaderboardCache() {
    if (!db) return;

    console.log('[스케줄러] 리더보드 캐시 갱신 시작...');

    try {
        const types = ['betting-accuracy', 'coin', 'community', 'attendance'];
        const subTypes = {
            'betting-accuracy': ['podium', 'h2h', 'total'],
            'coin': ['total'],
            'community': ['likes'],
            'attendance': ['consecutive', 'cumulative']
        };
        const periods = ['all', 'season'];  // 주간/월간은 데이터 부족으로 제외

        for (const type of types) {
            for (const subType of subTypes[type] || ['total']) {
                for (const period of periods) {
                    try {
                        const result = await getLeaderboard(type, subType, period, 100);
                        const docId = getCacheKey(type, subType, period);

                        // Firestore에 저장
                        await db.collection('leaderboards').doc(docId).set({
                            type,
                            subType,
                            period,
                            periodKey: getPeriodKey(period),
                            rankings: result.rankings,
                            totalParticipants: result.totalParticipants,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        });

                    } catch (error) {
                        console.error(`[스케줄러] ${type}/${subType}/${period} 캐시 실패:`, error.message);
                    }
                }
            }
        }

        console.log('[스케줄러] 리더보드 캐시 갱신 완료');

    } catch (error) {
        console.error('[스케줄러] 리더보드 캐시 갱신 실패:', error);
    }
}

/**
 * 주간 리셋 (월요일 00:00 KST)
 * - leaderboardSnapshots에 주간 랭킹 아카이브
 * - periodicEarnings.weeklyEarned 리셋
 */
async function weeklyReset() {
    if (!db) return;

    console.log('[스케줄러] 주간 리셋 시작...');

    try {
        // 이전 주 키
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastWeekKey = getPeriodKeyForDate(lastWeek, 'weekly');

        // 주간 랭킹 아카이브 저장
        const types = ['coin'];
        for (const type of types) {
            const result = await getLeaderboard(type, 'total', 'weekly', 100);
            await db.collection('leaderboardSnapshots').doc(`${type}_weekly_${lastWeekKey}`).set({
                type,
                subType: 'total',
                period: 'weekly',
                periodKey: lastWeekKey,
                rankings: result.rankings,
                totalParticipants: result.totalParticipants,
                archivedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // periodicEarnings.weeklyEarned 리셋 (배치 처리)
        const usersSnapshot = await db.collection('users')
            .where('periodicEarnings.weeklyEarned', '>', 0)
            .get();

        if (!usersSnapshot.empty) {
            const batch = db.batch();
            usersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    'periodicEarnings.weeklyEarned': 0,
                    'periodicEarnings.weekStart': admin.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }

        console.log('[스케줄러] 주간 리셋 완료');

    } catch (error) {
        console.error('[스케줄러] 주간 리셋 실패:', error);
    }
}

/**
 * 월간 리셋 (1일 00:00 KST)
 */
async function monthlyReset() {
    if (!db) return;

    console.log('[스케줄러] 월간 리셋 시작...');

    try {
        // 이전 월 키
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthKey = getPeriodKeyForDate(lastMonth, 'monthly');

        // 월간 랭킹 아카이브 저장
        const types = ['coin'];
        for (const type of types) {
            const result = await getLeaderboard(type, 'total', 'monthly', 100);
            await db.collection('leaderboardSnapshots').doc(`${type}_monthly_${lastMonthKey}`).set({
                type,
                subType: 'total',
                period: 'monthly',
                periodKey: lastMonthKey,
                rankings: result.rankings,
                totalParticipants: result.totalParticipants,
                archivedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // periodicEarnings.monthlyEarned 리셋
        const usersSnapshot = await db.collection('users')
            .where('periodicEarnings.monthlyEarned', '>', 0)
            .get();

        if (!usersSnapshot.empty) {
            const batch = db.batch();
            usersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    'periodicEarnings.monthlyEarned': 0,
                    'periodicEarnings.monthStart': admin.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }

        console.log('[스케줄러] 월간 리셋 완료');

    } catch (error) {
        console.error('[스케줄러] 월간 리셋 실패:', error);
    }
}

/**
 * 특정 날짜의 기간 키 생성
 */
function getPeriodKeyForDate(date, period) {
    const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

    switch (period) {
        case 'weekly': {
            const year = kstDate.getUTCFullYear();
            const startOfYear = new Date(Date.UTC(year, 0, 1));
            const days = Math.floor((kstDate - startOfYear) / (24 * 60 * 60 * 1000));
            const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
            return `${year}W${String(weekNumber).padStart(2, '0')}`;
        }
        case 'monthly': {
            const year = kstDate.getUTCFullYear();
            const month = kstDate.getUTCMonth() + 1;
            return `${year}${String(month).padStart(2, '0')}`;
        }
        default:
            return 'all';
    }
}

/**
 * 시즌 종료 처리 (명예의 전당 저장)
 */
async function seasonEndHandler() {
    if (!db) return;

    const season = getSeasonDates();
    const now = new Date();

    // 시즌 종료 후 24시간 이내인지 확인
    const hoursSinceEnd = (now - season.end) / (60 * 60 * 1000);
    if (hoursSinceEnd < 0 || hoursSinceEnd > 24) return;

    console.log('[스케줄러] 시즌 종료 처리 시작...');

    try {
        // 명예의 전당 저장 (이미 저장되었는지 확인)
        const hofId = `${season.year}`;
        const hofDoc = await db.collection('hallOfFame').doc(hofId).get();

        if (hofDoc.exists) {
            console.log('[스케줄러] 명예의 전당 이미 저장됨');
            return;
        }

        const hofData = {
            season: season.year,
            categories: {}
        };

        // 각 카테고리별 TOP 10 저장
        const categories = [
            { type: 'betting-accuracy', subType: 'podium', label: '포디움 적중왕' },
            { type: 'betting-accuracy', subType: 'h2h', label: '1:1 적중왕' },
            { type: 'coin', subType: 'total', label: '코인 부자' },
            { type: 'community', subType: 'likes', label: '인기왕' },
            { type: 'attendance', subType: 'cumulative', label: '출석왕' }
        ];

        for (const cat of categories) {
            const result = await getLeaderboard(cat.type, cat.subType, 'season', 10);
            hofData.categories[`${cat.type}_${cat.subType}`] = {
                label: cat.label,
                rankings: result.rankings
            };
        }

        await db.collection('hallOfFame').doc(hofId).set({
            ...hofData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('[스케줄러] 명예의 전당 저장 완료');

    } catch (error) {
        console.error('[스케줄러] 시즌 종료 처리 실패:', error);
    }
}

/**
 * Rental 아이템 만료 처리
 */
async function processExpiredRentals() {
    if (!db) return;

    console.log('[스케줄러] Rental 만료 처리 시작...');

    try {
        const now = admin.firestore.Timestamp.now();
        const snapshot = await db.collection('userInventory')
            .where('type', '==', 'rental')
            .where('isExpired', '==', false)
            .where('expiresAt', '<', now)
            .limit(100)
            .get();

        if (snapshot.empty) {
            console.log('[스케줄러] 만료된 rental 아이템 없음');
            return;
        }

        const affectedUsers = new Set();
        const batch = db.batch();

        snapshot.forEach(doc => {
            batch.update(doc.ref, { isExpired: true, equipped: false });
            affectedUsers.add(doc.data().userId);
        });

        await batch.commit();

        // 영향받은 사용자들의 코스메틱 캐시 갱신
        for (const userId of affectedUsers) {
            await updateUserCosmetics(userId);
        }

        console.log(`[스케줄러] Rental 만료 처리 완료: ${snapshot.size}개 아이템, ${affectedUsers.size}명 사용자`);

    } catch (error) {
        console.error('[스케줄러] Rental 만료 처리 실패:', error);
    }
}

/**
 * 스케줄러 초기화
 */
function initSchedulers() {
    console.log('[스케줄러] 초기화 중...');

    // 5분마다 리더보드 캐시 갱신
    cron.schedule('*/5 * * * *', () => {
        refreshLeaderboardCache().catch(console.error);
    });

    // 주간 리셋: 매주 월요일 00:00 KST
    cron.schedule('0 0 * * 1', () => {
        weeklyReset().catch(console.error);
    }, { timezone: 'Asia/Seoul' });

    // 월간 리셋: 매월 마지막 날 23:55 KST
    // node-cron은 'L' 미지원 → 28-31일에 실행하고 다음 날이 1일인지 체크
    cron.schedule('55 23 28-31 * *', () => {
        // 다음 날이 1일인 경우에만 실행 (월 마지막 날 체크)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDate() === 1) {
            monthlyReset().catch(console.error);
        }
    }, { timezone: 'Asia/Seoul' });

    // 시즌 종료 체크: 매일 00:00 KST
    cron.schedule('0 0 * * *', () => {
        seasonEndHandler().catch(console.error);
    }, { timezone: 'Asia/Seoul' });

    // Rental 아이템 만료 처리: 매시간
    cron.schedule('0 * * * *', () => {
        processExpiredRentals().catch(console.error);
    });

    // 드라이버 순위 캐시 갱신: 매시간 (배당률 계산용)
    cron.schedule('30 * * * *', () => {
        serverDriverStandingsCache.timestamp = 0;
        fetchServerDriverStandings().catch(console.error);
    });

    // 30일 지난 뉴스 자동 삭제: 매일 03:00 KST
    cron.schedule('0 3 * * *', () => {
        deleteOldNews().catch(console.error);
    }, { timezone: 'Asia/Seoul' });

    console.log('[스케줄러] 초기화 완료');
    console.log('  - 리더보드 캐시: 5분마다');
    console.log('  - 주간 리셋: 월요일 00:00 KST');
    console.log('  - 월간 리셋: 1일 00:00 KST');
    console.log('  - 시즌 종료 체크: 매일 00:00 KST');
    console.log('  - Rental 만료 처리: 매시간');
    console.log('  - 드라이버 순위 캐시: 매시간');
    console.log('  - 오래된 뉴스 정리: 매일 03:00 KST');
}

// 서버 시작
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`====================================`);
    console.log(`  F1 팬페이지 서버 시작!`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`====================================`);

    // 서버 시작 시 뉴스 미리 로드
    fetchAllNews().catch(console.error);

    // 서버 시작 시 드라이버 순위 캐시 초기화
    fetchServerDriverStandings().catch(err => console.error('[시작] 순위 캐시 초기화 실패:', err.message));

    // 30분마다 뉴스 자동 갱신 (클라이언트 접속 여부와 무관하게)
    setInterval(() => {
        console.log('[자동 갱신] 뉴스 캐시 초기화 및 새로 로드...');
        newsCache = { data: null, timestamp: 0 };
        fetchAllNews().catch(console.error);
    }, CACHE_DURATION);

    // races 컬렉션 초기화 (베팅 시간 검증용)
    await initRacesCollection();

    // 🔒 자동 정산 시스템 시작 (races 초기화 후 실행)
    // Firestore에서 기존 정산 기록을 먼저 로드하므로 await 필요
    await initAutoSettlement();

    // 리더보드 스케줄러 초기화
    initSchedulers();

    // 서버 시작 시 리더보드 캐시 즉시 갱신
    refreshLeaderboardCache().catch(console.error);
});
