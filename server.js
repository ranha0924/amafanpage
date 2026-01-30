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

const app = express();
const PORT = process.env.PORT || 3000;
const rssParser = new RSSParser();

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

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// CORS 설정 - 허용된 도메인만
app.use(cors({
    origin: function(origin, callback) {
        // 서버 내부 요청(origin이 없음) 또는 허용된 도메인
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

// Rate Limiting - API 남용 방지
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // IP당 최대 100회
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
const CACHE_DURATION = 30 * 60 * 1000; // 30분

// Google Translate (무료, API 키 불필요)

// Aston Martin 키워드 (확장)
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

// 다른 팀 제외 키워드 (이 키워드가 제목에 있으면 AM 관련 아님)
const EXCLUDE_TEAMS = [
    'red bull', 'redbull', 'ferrari', 'mercedes', 'mclaren',
    'alpine', 'williams', 'haas', 'rb ', 'visa rb', 'vcarb',
    'sauber', 'kick sauber', 'alfa romeo'
];

/**
 * 텍스트가 Aston Martin 관련인지 확인
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
        const result = await translate(text.slice(0, 1500), {
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
 * Formula1.com에서 뉴스 스크래핑
 */
async function scrapeF1News() {
    try {
        const response = await axios.get('https://www.formula1.com/en/latest/all', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        const $ = cheerio.load(response.data);
        const articles = [];
        const seen = new Set();

        // F1 공식 사이트 기사 파싱 - 기사 링크 찾기
        $('a[href*="/en/latest/article/"]').each((i, el) => {
            if (articles.length >= 20) return false;

            const $el = $(el);
            const href = $el.attr('href');

            // 중복 방지
            if (seen.has(href)) return;
            seen.add(href);

            // 제목 찾기 - 여러 방법 시도
            let title = $el.find('[class*="title"]').text().trim() ||
                       $el.find('span').text().trim() ||
                       $el.text().trim();

            // 제목이 너무 짧거나 긴 경우 스킵
            if (!title || title.length < 10 || title.length > 300) return;

            const link = href.startsWith('http') ? href : 'https://www.formula1.com' + href;

            articles.push({
                title,
                description: title,
                link,
                pubDate: new Date().toISOString(),
                source: 'Formula 1'
            });
        });

        console.log(`[DEBUG] F1 스크래핑 결과: ${articles.length}개`);
        return articles;
    } catch (error) {
        console.error('F1 스크래핑 실패:', error.message);
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
            source: 'Motorsport.com'
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
            source: 'Autosport'
        }));
    } catch (error) {
        console.error('Autosport RSS 실패:', error.message);
        return [];
    }
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
        title: item.title.replace(/<[^>]*>/g, '').trim(),
        description: item.description.replace(/<[^>]*>/g, '').slice(0, 500).trim()
    }));

    // Aston Martin 관련 기사 필터링
    const amNews = allNews.filter(item =>
        isAstonMartinRelated(item.title)
    );

    console.log(`[DEBUG] AM 관련 뉴스: ${amNews.length}개`);
    if (amNews.length > 0) {
        console.log(`[DEBUG] AM 뉴스 제목들:`, amNews.map(n => n.title.slice(0, 50)));
    }

    // AM 뉴스만 사용 (없으면 빈 배열 - 다른 팀 뉴스는 표시 안함)
    let newsToUse = amNews;

    // 중복 제거 (제목 기준)
    const seen = new Set();
    newsToUse = newsToUse.filter(item => {
        const key = item.title.toLowerCase().slice(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 날짜순 정렬
    newsToUse.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // 최대 15개
    newsToUse = newsToUse.slice(0, 15);

    // 한국어 번역
    console.log('번역 중...');
    const translatedNews = await Promise.all(
        newsToUse.map(async (item) => {
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

    // 캐시 저장
    newsCache = {
        data: translatedNews,
        timestamp: Date.now()
    };

    console.log(`뉴스 ${translatedNews.length}개 로드 완료`);
    return translatedNews;
}

// ============ 토큰 API (어뷰징 방지 - 서버에서만 토큰 변경) ============

// 토큰 설정 (constants.js와 동일)
const TOKEN_CONFIG = {
    ATTENDANCE: 10,
    ATTENDANCE_STREAK_BONUS: 50,
    STREAK_DAYS: 7,
    FIRST_POST: 20,
    SHARE_PREDICTION: 10,
    LUCKY_ITEM: 5,
    RACE_ENERGY: 5
};

// Firebase Auth 토큰 검증 미들웨어
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

// 출석체크 API
app.post('/api/token/attendance', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
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
            if (userDoc.exists) {
                transaction.update(userRef, {
                    tokens: admin.firestore.FieldValue.increment(totalReward),
                    totalEarned: admin.firestore.FieldValue.increment(totalReward),
                    lastAttendance: admin.firestore.FieldValue.serverTimestamp(),
                    consecutiveDays
                });
            } else {
                transaction.set(userRef, {
                    tokens: totalReward,
                    totalEarned: totalReward,
                    lastAttendance: admin.firestore.FieldValue.serverTimestamp(),
                    consecutiveDays,
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

            transaction.update(userRef, {
                tokens: currentTokens - amount
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

// 행운 아이템 보상 API
app.post('/api/token/lucky-item', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();

            // 오늘 이미 받았는지 확인
            if (userData.lastLuckyItemDate) {
                const lastDate = userData.lastLuckyItemDate.toDate();
                lastDate.setHours(0, 0, 0, 0);
                if (lastDate.getTime() === today.getTime()) {
                    throw new Error('ALREADY_CLAIMED');
                }
            }

            const reward = TOKEN_CONFIG.LUCKY_ITEM;

            // 🔒 C-3 수정: FieldValue.increment() 사용으로 Race Condition 방지
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(reward),
                totalEarned: admin.firestore.FieldValue.increment(reward),
                lastLuckyItemDate: admin.firestore.FieldValue.serverTimestamp()
            });

            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: reward,
                reason: '행운 아이템 보기',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { reward };
        });

        res.json({ success: true, reward: result.reward });

    } catch (error) {
        if (error.message === 'ALREADY_CLAIMED') {
            return res.status(400).json({ success: false, error: '오늘은 이미 행운 아이템 보상을 받았습니다.' });
        }
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(400).json({ success: false, error: '사용자 정보가 없습니다.' });
        }
        console.error('행운 아이템 보상 실패:', error);
        res.status(500).json({ success: false, error: '보상 지급에 실패했습니다.' });
    }
});

// 사용자 토큰 정보 조회 API
app.get('/api/token/balance', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;

    try {
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            // 신규 사용자면 0으로 반환
            return res.json({
                success: true,
                tokens: 0,
                totalEarned: 0,
                consecutiveDays: 0
            });
        }

        const userData = userDoc.data();
        res.json({
            success: true,
            tokens: userData.tokens || 0,
            totalEarned: userData.totalEarned || 0,
            consecutiveDays: userData.consecutiveDays || 0,
            lastAttendance: userData.lastAttendance
        });

    } catch (error) {
        console.error('토큰 조회 실패:', error);
        res.status(500).json({ success: false, error: '토큰 조회에 실패했습니다.' });
    }
});

// 레이스 응원 에너지 API
// 🔒 보안 강화: 트랜잭션 내에서 쿨다운/최대 횟수 검증 (Race Condition 방지)
app.post('/api/token/race-energy', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: '서버 연결 오류' });
    }

    const userId = req.user.uid;
    const { raceId } = req.body;

    if (!raceId) {
        return res.status(400).json({ success: false, error: '레이스 ID가 필요합니다.' });
    }

    // 쿨다운 시간 (분) - 클라이언트와 동일하게 설정
    const COOLDOWN_MINUTES = 10;
    const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
    const MAX_CLAIMS = 12; // 최대 수집 횟수
    // 🔒 버그 수정: 클라이언트(TOKEN_CONFIG.RACE_ENERGY = 5)와 금액 통일
    const RACE_ENERGY_REWARD = TOKEN_CONFIG.RACE_ENERGY; // 5 AMR

    try {
        const result = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);

            // 🔒 트랜잭션 내에서 쿨다운 검증 (Race Condition 방지)
            // 주의: Firestore 트랜잭션에서 쿼리는 transaction.get()으로 직접 지원되지 않음
            // 대신 유저별 에너지 수집 문서를 고유 ID로 관리
            const energyDocId = `${userId}_${raceId}_energy`;
            const energyStatusRef = db.collection('raceEnergyStatus').doc(energyDocId);
            const energyStatusDoc = await transaction.get(energyStatusRef);

            let claimCount = 0;
            let lastClaimTime = null;

            if (energyStatusDoc.exists) {
                const statusData = energyStatusDoc.data();
                claimCount = statusData.claimCount || 0;
                lastClaimTime = statusData.lastClaimTime;

                // 🔒 쿨다운 검증 (트랜잭션 내부)
                if (lastClaimTime) {
                    const lastTime = lastClaimTime.toDate();
                    const elapsed = Date.now() - lastTime.getTime();
                    if (elapsed < COOLDOWN_MS) {
                        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
                        throw new Error(`COOLDOWN:${remaining}`);
                    }
                }

                // 🔒 최대 횟수 검증 (트랜잭션 내부)
                if (claimCount >= MAX_CLAIMS) {
                    throw new Error('MAX_CLAIMS_REACHED');
                }
            }

            // 사용자 정보 조회
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userDoc.data();
            const newClaimCount = claimCount + 1;

            // 🔒 에너지 상태 업데이트 (원자적 연산)
            transaction.set(energyStatusRef, {
                userId,
                raceId,
                claimCount: newClaimCount,
                lastClaimTime: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 에너지 기록 저장 (히스토리용)
            const energyRef = db.collection('raceEnergy').doc();
            transaction.set(energyRef, {
                userId,
                raceId,
                claimTime: admin.firestore.FieldValue.serverTimestamp(),
                tokens: RACE_ENERGY_REWARD,
                claimNumber: newClaimCount
            });

            // 토큰 지급 (increment 사용)
            transaction.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(RACE_ENERGY_REWARD),
                totalEarned: admin.firestore.FieldValue.increment(RACE_ENERGY_REWARD)
            });

            // 토큰 내역 기록
            const historyRef = db.collection('tokenHistory').doc();
            transaction.set(historyRef, {
                userId,
                amount: RACE_ENERGY_REWARD,
                reason: '레이스 응원 에너지',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                reward: RACE_ENERGY_REWARD,
                claimCount: newClaimCount,
                maxClaims: MAX_CLAIMS
            };
        });

        res.json({
            success: true,
            reward: result.reward,
            claimCount: result.claimCount,
            maxClaims: result.maxClaims
        });

    } catch (error) {
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        }
        if (error.message === 'MAX_CLAIMS_REACHED') {
            return res.status(400).json({ success: false, error: '최대 수집 횟수에 도달했습니다.' });
        }
        if (error.message.startsWith('COOLDOWN:')) {
            const remaining = parseInt(error.message.split(':')[1]);
            return res.status(400).json({
                success: false,
                error: '쿨다운 중입니다.',
                remainingSeconds: remaining
            });
        }
        console.error('레이스 에너지 수집 실패:', error);
        res.status(500).json({ success: false, error: '에너지 수집에 실패했습니다.' });
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

            // 🔒 C-4 수정: 환불 금액 유효성 검증 (포디움은 최대 3000 AMR)
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
    const k = 0.15;
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
// 🔒 보안 강화: 레이스 시작 2분 전 베팅 마감 (레이스 진행 중 베팅 방지)
const BETTING_CUTOFF_MS = 2 * 60 * 1000; // 레이스 시작 2분 전 마감

async function validateRaceTime(raceId) {
    if (!raceId) return { valid: false, error: '레이스 ID가 필요합니다.' };

    const raceDoc = await db.collection('races').doc(raceId).get();
    if (!raceDoc.exists) {
        return { valid: false, error: '유효하지 않은 레이스입니다.' };
    }

    const raceData = raceDoc.data();
    const now = admin.firestore.Timestamp.now();

    // 🔒 레이스 시작 2분 전에 베팅 마감
    const cutoffSeconds = raceData.startTime.seconds - Math.floor(BETTING_CUTOFF_MS / 1000);
    const cutoffTime = new admin.firestore.Timestamp(cutoffSeconds, raceData.startTime.nanoseconds);

    if (now >= cutoffTime) {
        return { valid: false, error: '베팅이 마감되었습니다. (레이스 시작 2분 전)' };
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
            return res.status(400).json({ success: false, error: '베팅 금액은 1-1000 AMR 범위의 정수여야 합니다.' });
        }

        // ✅ 서버에서 배당률 계산 (클라이언트 값 무시)
        const serverOdds = calculateServerOdds(bet.seasonRank || 22);

        // 포디움 베팅은 P1/P2/P3 정확히 맞춰야 하므로 낮은 배당률 제한 없음
        // (1:1 베팅과 달리 맞추기 어려움)

        validatedBets.push({
            position: bet.position,
            driverNumber: bet.driverNumber,
            driverName: String(bet.driverName).slice(0, 50),
            seasonRank: bet.seasonRank || 22,
            betAmount: bet.betAmount,
            odds: serverOdds  // 서버 계산 값 사용
        });

        totalAmount += bet.betAmount;
    }

    // 총 금액 검증
    if (totalAmount > 3000) {
        return res.status(400).json({ success: false, error: '총 베팅 금액은 3000 AMR을 초과할 수 없습니다.' });
    }

    // 레이스 시간 검증
    const raceValidation = await validateRaceTime(raceId);
    if (!raceValidation.valid) {
        return res.status(400).json({ success: false, error: raceValidation.error });
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
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

            return { totalAmount, newBalance: currentTokens - totalAmount };
        });

        res.json({
            success: true,
            totalAmount: result.totalAmount,
            newBalance: result.newBalance
        });

    } catch (error) {
        const errorMessages = {
            'ALREADY_BET': '이미 이 레이스에 베팅하셨습니다.',
            'USER_NOT_FOUND': '사용자 정보를 찾을 수 없습니다.',
            'INSUFFICIENT_BALANCE': '토큰이 부족합니다.'
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
        return res.status(400).json({ success: false, error: '베팅 금액은 1-1000 AMR 범위의 정수여야 합니다.' });
    }

    // ✅ 서버에서 배당률 계산 (클라이언트 값 완전 무시)
    const rankA = matchup.driverA.seasonRank || 22;
    const rankB = matchup.driverB.seasonRank || 22;
    const { oddsForA, oddsForB } = calculateH2HServerOdds(rankA, rankB);

    // 예측 승자에 따른 배당률 결정
    const isDriverAPredicted = matchup.driverA.number === predictedWinner;
    const serverOdds = isDriverAPredicted ? oddsForA : oddsForB;

    // 낮은 배당률 어뷰징 방지
    if (serverOdds < 1.10 && betAmount > 50) {
        return res.status(400).json({
            success: false,
            error: `낮은 배당률(${serverOdds}x) 베팅은 최대 50 AMR까지만 가능합니다.`
        });
    }

    // 레이스 시간 검증
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
                newBalance: currentTokens - betAmount
            };
        });

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
            'INSUFFICIENT_BALANCE': '토큰이 부족합니다.'
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
            const translatedContent = await translateToKorean(content.slice(0, 5000));
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
    if (!adminKey || adminKey !== ADMIN_KEY) {
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

// F1 API 헬퍼 (서버용)
const F1_API_BASE = 'https://api.jolpi.ca/ergast/f1';

async function fetchF1RaceResults(season, round) {
    try {
        const endpoint = round ? `/${season}/${round}/results` : `/${season}/last/results`;
        const response = await axios.get(`${F1_API_BASE}${endpoint}.json`, { timeout: 15000 });

        if (!response.data?.MRData?.RaceTable?.Races?.[0]) {
            return null;
        }

        const race = response.data.MRData.RaceTable.Races[0];
        return {
            season: race.season,
            round: parseInt(race.round),
            raceName: race.raceName,
            date: race.date,
            results: race.Results.map(r => ({
                position: parseInt(r.position),
                driver: {
                    number: r.Driver.permanentNumber,
                    code: r.Driver.code,
                    firstName: r.Driver.givenName,
                    lastName: r.Driver.familyName
                },
                constructor: r.Constructor.name,
                status: r.status
            }))
        };
    } catch (error) {
        console.error('F1 API 요청 실패:', error.message);
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
    const k = 0.15; // 순위당 승률 변화 계수

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
    { name: "호주 그랑프리", circuit: "앨버트 파크 서킷 · 멜버른", date: "2026-03-08T06:00:00" },
    { name: "중국 그랑프리", circuit: "상하이 인터내셔널 서킷 · 상하이", date: "2026-03-15T16:00:00" },
    { name: "일본 그랑프리", circuit: "스즈카 서킷 · 스즈카", date: "2026-03-29T14:00:00" },
    { name: "바레인 그랑프리", circuit: "바레인 인터내셔널 서킷 · 사키르", date: "2026-04-13T00:00:00" },
    { name: "사우디 아라비아 그랑프리", circuit: "제다 코르니쉬 서킷 · 제다", date: "2026-04-20T02:00:00" },
    { name: "마이애미 그랑프리", circuit: "마이애미 인터내셔널 오토드롬 · 마이애미", date: "2026-05-04T05:00:00" },
    { name: "캐나다 그랑프리", circuit: "질 빌뇌브 서킷 · 몬트리올", date: "2026-05-25T03:00:00" },
    { name: "모나코 그랑프리", circuit: "몬테카를로 시가지 서킷 · 모나코", date: "2026-06-07T22:00:00" },
    { name: "스페인 그랑프리", circuit: "카탈루냐 서킷 · 바르셀로나", date: "2026-06-14T22:00:00" },
    { name: "오스트리아 그랑프리", circuit: "레드불 링 · 슈필베르크", date: "2026-06-28T22:00:00" },
    { name: "영국 그랑프리", circuit: "실버스톤 서킷 · 실버스톤", date: "2026-07-05T23:00:00" },
    { name: "벨기에 그랑프리", circuit: "스파-프랑코르샹 · 스파", date: "2026-07-19T22:00:00" },
    { name: "헝가리 그랑프리", circuit: "헝가로링 · 부다페스트", date: "2026-07-26T22:00:00" },
    { name: "네덜란드 그랑프리", circuit: "잔드보르트 서킷 · 잔드보르트", date: "2026-08-23T22:00:00" },
    { name: "이탈리아 그랑프리", circuit: "몬자 서킷 · 몬자", date: "2026-09-06T22:00:00" },
    { name: "마드리드 그랑프리", circuit: "마드리드 시가지 서킷 · 마드리드", date: "2026-09-13T22:00:00" },
    { name: "아제르바이잔 그랑프리", circuit: "바쿠 시티 서킷 · 바쿠", date: "2026-09-26T20:00:00" },
    { name: "싱가포르 그랑프리", circuit: "마리나 베이 시가지 서킷 · 싱가포르", date: "2026-10-11T21:00:00" },
    { name: "미국 그랑프리", circuit: "서킷 오브 디 아메리카스 · 오스틴", date: "2026-10-26T04:00:00" },
    { name: "멕시코 그랑프리", circuit: "에르마노스 로드리게스 서킷 · 멕시코시티", date: "2026-11-02T05:00:00" },
    { name: "브라질 그랑프리", circuit: "인테르라고스 · 상파울루", date: "2026-11-08T02:00:00" },
    { name: "라스베가스 그랑프리", circuit: "라스베가스 스트립 서킷 · 라스베가스", date: "2026-11-22T15:00:00" },
    { name: "카타르 그랑프리", circuit: "루사일 인터내셔널 서킷 · 루사일", date: "2026-11-29T23:00:00" },
    { name: "아부다비 그랑프리", circuit: "야스 마리나 서킷 · 아부다비", date: "2026-12-06T22:00:00" }
];

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

            // raceId 형식: race_{round}_{YYYYMMDD}
            const raceId = `race_${i + 1}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;

            const raceRef = db.collection('races').doc(raceId);
            batch.set(raceRef, {
                name: race.name,
                circuit: race.circuit,
                startTime: admin.firestore.Timestamp.fromDate(raceDate),
                round: i + 1,
                season: raceDate.getFullYear()
            }, { merge: true });
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
    normalInterval: 60 * 60 * 1000,  // 1시간
    retryInterval: 5 * 60 * 1000,    // 5분
    timer: null,
    isRetrying: false,
    isInitialized: false          // 초기화 완료 여부
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

        console.log(`💾 정산 기록 저장 완료: ${raceId}`);
    } catch (error) {
        console.error('❌ 정산 기록 저장 실패:', error.message);
        throw error;  // 저장 실패 시 에러 전파
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
        console.log('⚠️  Firebase 미초기화 - 자동 정산 비활성화');
        return;
    }

    console.log('🏎️  자동 정산 시스템 초기화 중...');

    // 🔒 기존 정산 기록 로드 (서버 재시작 시 중복 정산 방지)
    const loaded = await loadSettlementHistory();
    if (!loaded) {
        console.error('❌ 정산 기록 로드 실패 - 안전을 위해 자동 정산 비활성화');
        console.error('❌ 수동으로 /api/admin/settle API를 사용하세요.');
        return;
    }

    autoSettlement.isInitialized = true;
    console.log('🏎️  자동 정산 시스템 시작 (1시간 간격 체크)');

    // 즉시 한 번 체크
    checkForNewResults();

    // 1시간마다 체크
    autoSettlement.timer = setInterval(checkForNewResults, autoSettlement.normalInterval);
}

/**
 * 새 레이스 결과 확인 및 정산
 */
async function checkForNewResults() {
    // 🔒 초기화 완료 전에는 정산 시도 안 함
    if (!autoSettlement.isInitialized) {
        console.log('⏳ 정산 시스템 초기화 대기 중...');
        return;
    }

    try {
        console.log('🔍 F1 API 레이스 결과 확인 중...');

        // F1 API에서 최근 레이스 결과 가져오기
        const raceResults = await fetchF1RaceResults(new Date().getFullYear(), null);

        if (!raceResults || !raceResults.results || raceResults.results.length === 0) {
            console.log('📭 새 레이스 결과 없음');

            // 재시도 모드에서 결과 없으면 1시간 간격으로 복귀
            if (autoSettlement.isRetrying) {
                switchToNormalInterval();
            }
            return;
        }

        // 레이스 ID 생성
        const raceDate = new Date(raceResults.date);
        const raceId = `race_${raceResults.round}_${raceDate.getFullYear()}${String(raceDate.getMonth() + 1).padStart(2, '0')}${String(raceDate.getDate()).padStart(2, '0')}`;

        // 🔒 이미 정산한 레이스인지 확인 (Firestore 포함)
        const alreadySettled = await isRaceSettled(raceId);
        if (alreadySettled) {
            console.log(`✅ 이미 정산 완료: ${raceResults.raceName} (${raceId})`);
            return;
        }

        console.log(`🏁 새 레이스 결과 발견: ${raceResults.raceName}`);

        // 정산 실행
        await settleAllBets(raceId, raceResults);

    } catch (error) {
        console.error('❌ 자동 정산 체크 실패:', error.message);

        // 실패 시 5분 간격 재시도 모드로 전환
        if (!autoSettlement.isRetrying) {
            switchToRetryInterval();
        }
    }
}

/**
 * 모든 베팅 정산 실행
 */
async function settleAllBets(raceId, raceResults) {
    console.log(`🔄 정산 시작: ${raceResults.raceName} (${raceId})`);

    let h2hResult = { total: 0, won: 0, lost: 0, void: 0 };
    let podiumResult = { total: 0, won: 0, lost: 0 };
    let hasError = false;

    // 1:1 베팅 정산
    try {
        h2hResult = await executeAutoSettlement('h2h', raceId, raceResults);
        console.log(`✅ 1:1 베팅 정산: ${h2hResult.total}건 (당첨: ${h2hResult.won}, 낙첨: ${h2hResult.lost}, 무효: ${h2hResult.void})`);
    } catch (error) {
        console.error('❌ 1:1 베팅 정산 실패:', error.message);
        hasError = true;
        // 1:1 실패해도 포디움은 계속 진행
    }

    // 포디움 베팅 정산
    try {
        podiumResult = await executeAutoSettlement('podium', raceId, raceResults);
        console.log(`✅ 포디움 베팅 정산: ${podiumResult.total}건 (당첨: ${podiumResult.won}, 낙첨: ${podiumResult.lost})`);
    } catch (error) {
        console.error('❌ 포디움 베팅 정산 실패:', error.message);
        hasError = true;
    }

    // 🔒 정산 완료 기록 Firestore에 저장 (영속화)
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

        // 1시간 간격으로 복귀
        if (autoSettlement.isRetrying) {
            switchToNormalInterval();
        }

        console.log(`🎉 ${raceResults.raceName} 정산 완료!`);
    } else {
        // 미처리 베팅 존재 - 완료 표시 안 함 (다음 사이클에서 재시도)
        const remainingCount = (remainingH2H.empty ? 0 : '1+') + ' H2H, ' +
                              (remainingPodium.empty ? 0 : '1+') + ' Podium';
        console.warn(`⚠️ 미처리 베팅 존재: ${remainingCount} - 다음 사이클에서 재시도`);

        // 5분 간격 재시도 모드로 전환
        if (!autoSettlement.isRetrying) {
            switchToRetryInterval();
        }
    }
}

/**
 * 1시간 간격으로 전환
 */
function switchToNormalInterval() {
    autoSettlement.isRetrying = false;
    clearInterval(autoSettlement.timer);
    autoSettlement.timer = setInterval(checkForNewResults, autoSettlement.normalInterval);
    console.log('✅ 1시간 간격 체크로 복귀');
}

/**
 * 5분 간격 재시도 모드로 전환
 */
function switchToRetryInterval() {
    autoSettlement.isRetrying = true;
    clearInterval(autoSettlement.timer);
    autoSettlement.timer = setInterval(checkForNewResults, autoSettlement.retryInterval);
    console.log('⏰ 5분 간격 재시도 모드로 전환');
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
                                // ✅ 서버 재계산 배당률 사용 (조작 불가)
                                const safeWin = Math.floor(bet.betAmount * serverOdds);

                                batch.update(db.collection('users').doc(bet.userId), {
                                    tokens: admin.firestore.FieldValue.increment(safeWin)
                                });
                                batch.set(db.collection('tokenHistory').doc(), {
                                    userId: bet.userId,
                                    amount: safeWin,
                                    reason: `1:1 베팅 당첨 (${raceResults.raceName})`,
                                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                                });
                                batchResults.won++;
                            } else {
                                batchResults.lost++;
                            }
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
                                tokens: admin.firestore.FieldValue.increment(winAmount)
                            });
                            batch.set(db.collection('tokenHistory').doc(), {
                                userId: bet.userId,
                                amount: winAmount,
                                reason: `포디움 베팅 당첨 (${raceResults.raceName})`,
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });
                            batchResults.won++;
                        } else {
                            batchResults.lost++;
                        }
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

// 서버 시작
app.listen(PORT, async () => {
    console.log(`====================================`);
    console.log(`  AMR 팬페이지 서버 시작!`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`====================================`);

    // 서버 시작 시 뉴스 미리 로드
    fetchAllNews().catch(console.error);

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
});
