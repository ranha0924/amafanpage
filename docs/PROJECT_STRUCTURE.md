                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       # Aston Martin F1 Fan Page - 프로젝트 구조 문서

## 목차

1. [폴더/파일 구조](#1-폴더파일-구조)
2. [JS 파일 상세 설명](#2-js-파일-상세-설명)
3. [Firebase 구조](#3-firebase-구조)
4. [주요 기능 흐름](#4-주요-기능-흐름)
5. [외부 의존성](#5-외부-의존성)

---

## 1. 폴더/파일 구조

### 전체 디렉토리 트리

```
amafanpage/
├── docs/                    # 문서 폴더
│   └── PROJECT_STRUCTURE.md # 프로젝트 구조 문서
├── css/                     # 스타일시트
│   ├── style.css           # 메인 스타일
│   ├── betting.css         # 베팅 페이지 스타일
│   ├── driver.css          # 드라이버 페이지 스타일
│   ├── errorHandler.css    # 에러 핸들러 스타일
│   ├── fortune.css         # 운세 페이지 스타일
│   ├── mypage.css          # 마이페이지 스타일
│   ├── paddock.css         # 게시판 스타일
│   └── token.css           # 토큰 관련 스타일
├── images/                  # 이미지 리소스
│   ├── AMRcoin.png         # AMR 토큰 아이콘
│   └── favicon.svg         # 파비콘
├── js/                      # JavaScript 파일
│   ├── auth.js             # 인증 시스템
│   ├── attendance.js       # 출석체크 시스템
│   ├── bettingData.js      # 베팅용 드라이버 데이터
│   ├── errorHandler.js     # 전역 에러 핸들링
│   ├── f1api.js            # F1 API 연동
│   ├── firebaseConfig.js   # Firebase 초기화
│   ├── fortune.js          # 운세 기능
│   ├── headToHeadBet.js    # 1:1 베팅
│   ├── leaderboard.js      # 리더보드
│   ├── mypage.js           # 마이페이지
│   ├── news.js             # 뉴스 표시
│   ├── paddock.js          # 게시판 (패독)
│   ├── podiumBet.js        # 포디움 베팅
│   ├── raceEnergy.js       # 레이스 응원 에너지
│   ├── script.js           # 메인 스크립트 (카운트다운)
│   ├── tarot.js            # 타로 카드 기능
│   ├── tarotData.js        # 타로 카드 데이터
│   ├── testMode.js         # 테스트 모드 (관리자용)
│   ├── token.js            # 토큰 시스템
│   └── utils.js            # 공통 유틸리티
├── node_modules/            # npm 패키지
├── 404.html                # 404 에러 페이지
├── alonso.html             # 알론소 드라이버 페이지
├── betting.html            # 베팅 페이지
├── fortune.html            # 운세 페이지
├── history.html            # 히스토리 페이지
├── index.html              # 메인 페이지
├── mypage.html             # 마이페이지
├── paddock.html            # 게시판 페이지
├── privacy.html            # 개인정보처리방침
├── stroll.html             # 스트롤 드라이버 페이지
├── terms.html              # 이용약관
├── firestore.rules         # Firestore 보안 규칙
├── package.json            # npm 설정
├── package-lock.json       # npm 의존성 잠금
└── server.js               # Express 서버
```

### 폴더별 역할

| 폴더 | 역할 |
|------|------|
| `docs/` | 프로젝트 문서 저장소 |
| `css/` | 모든 스타일시트 파일 |
| `images/` | 이미지 리소스 (아이콘, 파비콘 등) |
| `js/` | 클라이언트 JavaScript 파일 (19개) |
| `node_modules/` | npm 패키지 (서버용) |

### 주요 HTML 파일별 역할

| 파일 | 역할 |
|------|------|
| `index.html` | 메인 페이지 - 카운트다운, 뉴스, 출석체크 |
| `betting.html` | 베팅 페이지 - 포디움/1:1 베팅 |
| `paddock.html` | 게시판 페이지 - 커뮤니티 |
| `fortune.html` | 운세 페이지 - 타로 카드, 오늘의 운세 |
| `mypage.html` | 마이페이지 - 프로필, 토큰 내역, 탈퇴 |
| `alonso.html` | 페르난도 알론소 드라이버 프로필 |
| `stroll.html` | 랜스 스트롤 드라이버 프로필 |

---

## 2. JS 파일 상세 설명

### 2.1 auth.js - 인증 시스템

**목적**: Google OAuth 기반 로그인/로그아웃 처리, 사용자 세션 관리

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initAuth()` | 없음 | void | Firebase Auth 상태 리스너 설정 |
| `getCurrentUser()` | 없음 | User \| null | 현재 로그인된 사용자 반환 |
| `googleLogin()` | 없음 | Promise | Google 로그인 팝업 실행 |
| `logout()` | 없음 | Promise | 로그아웃 처리 |
| `updateUserUI(user)` | user: User \| null | void | 로그인 상태에 따라 UI 업데이트 |
| `syncUserToFirestore(user)` | user: User | Promise | 사용자 정보를 Firestore에 동기화 |

**의존 파일**: `firebaseConfig.js`, `token.js`

**사용 컬렉션**: `users`

---

### 2.2 attendance.js - 출석체크 시스템

**목적**: 일일 출석체크 기능, 연속 출석 보너스 관리

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initAttendance()` | 없음 | void | 출석체크 시스템 초기화 |
| `checkAttendance()` | 없음 | Promise | 출석체크 실행 |
| `updateAttendanceUI()` | 없음 | void | 출석 상태 UI 업데이트 |
| `loadAttendanceStatus()` | 없음 | Promise | 사용자의 출석 상태 로드 |
| `calculateStreak(lastDate)` | lastDate: Date | number | 연속 출석 일수 계산 |

**의존 파일**: `auth.js`, `token.js`, `utils.js`

**사용 컬렉션**: `users`, `attendance`, `tokenHistory`

**출석 보상 규칙**:
- 기본 출석: 10 AMR
- 7일 연속 출석 보너스: +50 AMR

---

### 2.3 bettingData.js - 베팅 데이터

**목적**: F1 드라이버 정보 및 팀 데이터 정의

**주요 상수**

| 상수명 | 타입 | 설명 |
|--------|------|------|
| `F1_DRIVERS` | Array | 전체 드라이버 목록 (이름, 팀, 번호) |
| `F1_TEAMS` | Array | 전체 팀 목록 |
| `DRIVER_IMAGES` | Object | 드라이버별 이미지 URL |

**의존 파일**: 없음

**사용 컬렉션**: 없음

---

### 2.4 errorHandler.js - 전역 에러 핸들러

**목적**: JavaScript 오류 및 Promise rejection 전역 처리

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initErrorHandler()` | 없음 | void | 전역 에러 핸들러 등록 |
| `handleError(error)` | error: Error | void | 에러 처리 및 사용자 알림 |
| `showErrorModal(message)` | message: string | void | 에러 모달 표시 |

**의존 파일**: 없음

**사용 컬렉션**: 없음

---

### 2.5 f1api.js - F1 API 연동

**목적**: 외부 F1 데이터 API 연동

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `fetchDriverStandings()` | 없음 | Promise<Array> | 드라이버 순위 조회 |
| `fetchConstructorStandings()` | 없음 | Promise<Array> | 컨스트럭터 순위 조회 |
| `fetchRaceResults(round)` | round: number | Promise<Object> | 특정 라운드 결과 조회 |

**의존 파일**: 없음

**사용 컬렉션**: 없음

---

### 2.6 firebaseConfig.js - Firebase 설정

**목적**: Firebase 앱 초기화 및 서비스 인스턴스 생성

**주요 상수/변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `firebaseConfig` | Object | Firebase 프로젝트 설정 |
| `app` | FirebaseApp | Firebase 앱 인스턴스 |
| `auth` | Auth | Firebase Auth 인스턴스 |
| `db` | Firestore | Firestore 인스턴스 |

**의존 파일**: Firebase SDK (CDN)

**사용 컬렉션**: 모든 컬렉션의 기반

---

### 2.7 fortune.js - 운세 기능

**목적**: 일일 운세 및 타로 카드 뽑기 기능

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initFortune()` | 없음 | void | 운세 시스템 초기화 |
| `drawTarotCard()` | 없음 | Promise | 타로 카드 뽑기 |
| `getDailyFortune()` | 없음 | Object | 오늘의 운세 가져오기 |
| `saveFortune(fortune)` | fortune: Object | Promise | 운세 결과 저장 |
| `checkFortuneStatus()` | 없음 | Promise | 오늘 운세 확인 여부 체크 |

**의존 파일**: `auth.js`, `tarotData.js`, `token.js`, `utils.js`

**사용 컬렉션**: `fortunes`, `users`, `tokenHistory`

---

### 2.8 headToHeadBet.js - 1:1 베팅

**목적**: 두 드라이버 간 1:1 예측 베팅

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initHeadToHead()` | 없음 | void | 1:1 베팅 초기화 |
| `loadMatchups()` | 없음 | Promise | 매치업 목록 로드 |
| `placeBet(matchupId, choice, amount)` | matchupId: string, choice: string, amount: number | Promise | 베팅 실행 |
| `getMatchupStats(matchupId)` | matchupId: string | Promise<Object> | 매치업 통계 조회 |
| `settleBets(matchupId, winner)` | matchupId: string, winner: string | Promise | 베팅 정산 (관리자) |

**의존 파일**: `auth.js`, `token.js`, `bettingData.js`

**사용 컬렉션**: `headToHeadBets`, `matchupStats`, `users`, `tokenHistory`

---

### 2.9 leaderboard.js - 리더보드

**목적**: 사용자 순위 및 리더보드 표시

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initLeaderboard()` | 없음 | void | 리더보드 초기화 |
| `loadLeaderboard(type)` | type: string | Promise | 순위 데이터 로드 |
| `updateLeaderboardUI(data)` | data: Array | void | 리더보드 UI 업데이트 |
| `getUserRank(userId)` | userId: string | Promise<number> | 특정 사용자 순위 조회 |

**의존 파일**: `auth.js`, `utils.js`

**사용 컬렉션**: `users`, `leaderboardStats`

---

### 2.10 mypage.js - 마이페이지

**목적**: 사용자 프로필 관리, 토큰 내역, 회원 탈퇴

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initMyPage()` | 없음 | void | 마이페이지 초기화 |
| `loadUserProfile()` | 없음 | Promise | 사용자 프로필 로드 |
| `loadTokenHistory()` | 없음 | Promise | 토큰 거래 내역 로드 |
| `loadBettingHistory()` | 없음 | Promise | 베팅 내역 로드 |
| `deleteAccount()` | 없음 | Promise | 회원 탈퇴 처리 |
| `deleteUserData(userId)` | userId: string | Promise | 사용자 데이터 삭제 |

**의존 파일**: `auth.js`, `token.js`

**사용 컬렉션**: `users`, `tokenHistory`, `posts`, `comments`, `likes`, `bets`, `headToHeadBets`, `attendance`, `fortunes`, `raceEnergy`

**회원 탈퇴 시 삭제 데이터**:
- 사용자 문서 (`users`)
- 토큰 내역 (`tokenHistory`)
- 작성 글 (`posts`)
- 작성 댓글 (`comments`)
- 좋아요 (`likes`)
- 베팅 기록 (`bets`, `headToHeadBets`)
- 출석 기록 (`attendance`)
- 운세 기록 (`fortunes`)
- 응원 에너지 기록 (`raceEnergy`)

---

### 2.11 news.js - 뉴스 표시

**목적**: F1 관련 뉴스 표시

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initNews()` | 없음 | void | 뉴스 시스템 초기화 |
| `loadNews()` | 없음 | Promise | 뉴스 데이터 로드 |
| `renderNews(articles)` | articles: Array | void | 뉴스 UI 렌더링 |

**의존 파일**: `utils.js`

**사용 컬렉션**: 없음 (서버 API 사용)

---

### 2.12 paddock.js - 게시판 (패독)

**목적**: 커뮤니티 게시판 - 글쓰기, 댓글, 좋아요, 신고

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initPaddock()` | 없음 | void | 게시판 초기화 |
| `loadPosts(page)` | page: number | Promise | 게시글 목록 로드 |
| `createPost(title, content)` | title: string, content: string | Promise | 새 게시글 작성 |
| `loadPost(postId)` | postId: string | Promise | 게시글 상세 로드 |
| `addComment(postId, content)` | postId: string, content: string | Promise | 댓글 작성 |
| `toggleLike(postId)` | postId: string | Promise | 좋아요 토글 |
| `reportPost(postId, reason)` | postId: string, reason: string | Promise | 게시글 신고 |
| `deletePost(postId)` | postId: string | Promise | 게시글 삭제 |
| `deleteComment(commentId)` | commentId: string | Promise | 댓글 삭제 |

**의존 파일**: `auth.js`, `token.js`, `utils.js`

**사용 컬렉션**: `posts`, `comments`, `likes`, `reports`, `users`, `tokenHistory`

**토큰 보상**:
- 첫 게시글 작성: +20 AMR

---

### 2.13 podiumBet.js - 포디움 베팅

**목적**: 레이스 포디움 (1-2-3위) 예측 베팅

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initPodiumBet()` | 없음 | void | 포디움 베팅 초기화 |
| `loadRaces()` | 없음 | Promise | 베팅 가능 레이스 로드 |
| `placePodiumBet(raceId, selections)` | raceId: string, selections: Object | Promise | 포디움 베팅 실행 |
| `loadUserBets()` | 없음 | Promise | 사용자 베팅 내역 로드 |
| `settlePodiumBets(raceId, results)` | raceId: string, results: Object | Promise | 포디움 베팅 정산 (관리자) |
| `sharePrediction(betId)` | betId: string | Promise | 예측 공유 |

**의존 파일**: `auth.js`, `token.js`, `bettingData.js`, `utils.js`

**사용 컬렉션**: `bets`, `users`, `tokenHistory`

**토큰 보상**:
- 예측 공유: +10 AMR

---

### 2.14 raceEnergy.js - 레이스 응원 에너지

**목적**: 레이스 진행 중 응원 에너지 수집 시스템

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initRaceEnergy()` | 없음 | void | 레이스 에너지 시스템 초기화 |
| `checkRaceStatus()` | 없음 | void | 현재 레이스 진행 상태 확인 |
| `loadUserEnergyStatus(raceId)` | raceId: string | Promise | 사용자 에너지 수집 상태 로드 |
| `showRaceEnergyBanner(raceName)` | raceName: string | void | 레이스 에너지 배너 표시 |
| `claimRaceEnergy()` | 없음 | Promise | 응원 에너지 수집 |
| `startEnergyCountdown()` | 없음 | void | 다음 수집까지 카운트다운 |

**의존 파일**: `auth.js`, `token.js`, `utils.js`

**사용 컬렉션**: `raceEnergy`, `users`, `tokenHistory`

**상태 관리** (`raceEnergyState`):
```javascript
{
    isRaceActive: false,      // 레이스 진행 중 여부
    raceId: null,             // 현재 레이스 ID
    raceEndTime: null,        // 레이스 종료 시간
    lastClaimTime: null,      // 마지막 수집 시간
    nextClaimTime: null,      // 다음 수집 가능 시간
    claimCount: 0,            // 현재 수집 횟수
    maxClaims: 12             // 최대 수집 횟수 (120분 / 10분)
}
```

**에너지 수집 규칙**:
- 레이스 시작 시간 ~ +2시간 동안 활성화
- 10분마다 수집 가능
- 1회 수집: +5 AMR
- 레이스당 최대 12회 수집 가능 (총 60 AMR)

---

### 2.15 script.js - 메인 스크립트

**목적**: 메인 카운트다운 타이머, 스무스 스크롤

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `init()` | 없음 | void | 메인 스크립트 초기화 |
| `cacheElements()` | 없음 | void | DOM 요소 캐싱 |
| `updateCountdown()` | 없음 | void | 카운트다운 업데이트 |
| `calculateCountdown(diff)` | diff: number | Object | 남은 시간 계산 |
| `startCountdown()` | 없음 | void | 카운트다운 시작 |
| `stopCountdown()` | 없음 | void | 카운트다운 중지 |
| `initSmoothScroll()` | 없음 | void | 스무스 스크롤 초기화 |

**의존 파일**: `utils.js`

**사용 컬렉션**: 없음

**페이지 가시성 최적화**:
- 탭이 숨겨지면 카운트다운 중지
- 탭이 보이면 카운트다운 재시작

---

### 2.16 tarot.js - 타로 카드

**목적**: 타로 카드 뽑기 및 결과 표시

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initTarot()` | 없음 | void | 타로 시스템 초기화 |
| `drawCard()` | 없음 | Object | 타로 카드 뽑기 |
| `getRandomLuckyItem()` | 없음 | string | 랜덤 행운의 아이템 선택 |
| `renderCardResult(card)` | card: Object | void | 카드 결과 렌더링 |
| `animateCardDraw()` | 없음 | void | 카드 뽑기 애니메이션 |

**의존 파일**: `tarotData.js`, `utils.js`

**사용 컬렉션**: 없음 (fortune.js에서 저장 처리)

---

### 2.17 tarotData.js - 타로 데이터

**목적**: 타로 카드 및 행운의 아이템 데이터 정의

**주요 상수**

| 상수명 | 타입 | 설명 |
|--------|------|------|
| `TAROT_CARDS` | Array (22개) | 메이저 아르카나 카드 데이터 |
| `LUCKY_ITEMS` | Array (16개) | F1 테마 행운의 아이템 |

**타로 카드 구조**:
```javascript
{
    id: number,           // 카드 ID (0-21)
    name: string,         // 카드 이름 (한글)
    englishName: string,  // 영문 이름
    keywords: string[],   // 키워드 배열
    meaning: string,      // 정방향 의미
    reversed: string,     // 역방향 의미
    advice: string        // 조언
}
```

**행운의 아이템** (F1 테마):
- 페르난도의 선글라스
- 아스톤 마틴 그린 반다나
- 랜스의 행운의 동전
- 미니어처 AMR23 모형
- 등 16개 아이템

**의존 파일**: 없음

**사용 컬렉션**: 없음

---

### 2.18 testMode.js - 테스트 모드

**목적**: 관리자용 베팅 시스템 테스트 도구

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initTestMode()` | 없음 | void | 테스트 모드 초기화 |
| `isAdmin(user)` | user: User | boolean | 관리자 권한 확인 |
| `showTestPanel()` | 없음 | void | 테스트 패널 표시 |
| `simulateRaceResult(raceId)` | raceId: string | Promise | 레이스 결과 시뮬레이션 |
| `forceSettleBets(raceId)` | raceId: string | Promise | 베팅 강제 정산 |
| `resetBets(raceId)` | raceId: string | Promise | 베팅 초기화 |

**의존 파일**: `auth.js`, `podiumBet.js`, `headToHeadBet.js`

**사용 컬렉션**: `bets`, `headToHeadBets`, `users`

**접근 제한**: 관리자(admin) 권한 필요

---

### 2.19 token.js - 토큰 시스템

**목적**: AMR 토큰 관리 (지급, 차감, 조회)

**주요 상수**

```javascript
const TOKEN_CONFIG = {
    ATTENDANCE: 10,              // 출석 보상
    ATTENDANCE_STREAK_BONUS: 50, // 7일 연속 출석 보너스
    STREAK_DAYS: 7,              // 연속 출석 기준 일수
    SHARE_PREDICTION: 10,        // 예측 공유 보상
    FIRST_POST: 20,              // 첫 게시글 보상
    LUCKY_ITEM: 5,               // 행운의 아이템 보상
    RACE_ENERGY: 5,              // 레이스 응원 1회당 보상
    RACE_ENERGY_INTERVAL: 10,    // 응원 간격 (분)
    RACE_DURATION: 120           // 레이스 지속 시간 (분)
};
```

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `initTokenSystem()` | 없음 | void | 토큰 시스템 초기화 |
| `getUserTokens(userId)` | userId: string | Promise<number> | 사용자 토큰 잔액 조회 |
| `addTokens(userId, amount, reason)` | userId: string, amount: number, reason: string | Promise | 토큰 지급 |
| `deductTokens(userId, amount, reason)` | userId: string, amount: number, reason: string | Promise | 토큰 차감 |
| `updateTokenDisplay()` | 없음 | void | 토큰 표시 UI 업데이트 |
| `showTokenNotification(amount, reason)` | amount: number, reason: string | void | 토큰 획득 알림 표시 |
| `recordTokenHistory(userId, amount, reason)` | userId: string, amount: number, reason: string | Promise | 토큰 거래 내역 기록 |

**의존 파일**: `auth.js`, `firebaseConfig.js`

**사용 컬렉션**: `users`, `tokenHistory`

---

### 2.20 utils.js - 공통 유틸리티

**목적**: 전역 유틸리티 함수 및 레이스 일정 데이터

**주요 상수**

| 상수명 | 타입 | 설명 |
|--------|------|------|
| `RACE_SCHEDULE` | Array (24개) | 2026 시즌 전체 레이스 일정 |

**주요 함수**

| 함수명 | 매개변수 | 반환값 | 설명 |
|--------|----------|--------|------|
| `isNetworkError(e)` | e: Error | boolean | 네트워크 에러 판별 |
| `withTimeout(promise, ms)` | promise: Promise, ms: number | Promise | Promise에 타임아웃 적용 |
| `escapeHtml(str)` | str: string | string | HTML 특수문자 이스케이프 (XSS 방지) |
| `getTodayDateString()` | 없음 | string | 오늘 날짜 문자열 (YYYY-MM-DD) |
| `isToday(date)` | date: Date \| string | boolean | 주어진 날짜가 오늘인지 확인 |
| `getNextRace()` | 없음 | Object | 다음 레이스 정보 반환 `{ race, index }` |
| `generateDailySeed()` | 없음 | number | 날짜 기반 시드 생성 |
| `seededRandom(seed)` | seed: number | number | 시드 기반 의사 난수 생성 |
| `initSideMenu()` | 없음 | void | 사이드 메뉴 초기화 |
| `toggleSideMenu()` | 없음 | void | 사이드 메뉴 토글 |
| `closeSideMenu()` | 없음 | void | 사이드 메뉴 닫기 |

**의존 파일**: 없음

**사용 컬렉션**: 없음

**레이스 일정 구조**:
```javascript
{
    name: "호주 그랑프리",
    circuit: "앨버트 파크 서킷 · 멜버른",
    date: "2026-03-16T05:00:00"
}
```

---

## 3. Firebase 구조

### 3.1 Firestore 컬렉션 목록

| 컬렉션명 | 용도 |
|----------|------|
| `users` | 사용자 정보 및 토큰 잔액 |
| `tokenHistory` | 토큰 거래 내역 |
| `posts` | 게시판 글 |
| `comments` | 게시글 댓글 |
| `likes` | 게시글 좋아요 |
| `reports` | 게시글/댓글 신고 |
| `attendance` | 출석체크 기록 |
| `bets` | 포디움 베팅 기록 |
| `headToHeadBets` | 1:1 베팅 기록 |
| `matchupStats` | 1:1 매치업 통계 |
| `raceEnergy` | 레이스 응원 에너지 기록 |
| `leaderboardStats` | 리더보드 통계 |
| `fortunes` | 운세/타로 기록 |

### 3.2 컬렉션별 문서 필드 구조

#### users
```javascript
{
    uid: string,              // Firebase Auth UID
    email: string,            // 이메일
    displayName: string,      // 표시 이름
    photoURL: string,         // 프로필 사진 URL
    tokens: number,           // 현재 토큰 잔액
    totalEarned: number,      // 총 획득 토큰
    totalSpent: number,       // 총 사용 토큰
    isAdmin: boolean,         // 관리자 여부
    createdAt: Timestamp,     // 가입 시간
    lastLogin: Timestamp,     // 마지막 로그인
    streak: number,           // 연속 출석 일수
    lastAttendance: Timestamp // 마지막 출석 시간
}
```

#### tokenHistory
```javascript
{
    userId: string,           // 사용자 UID
    amount: number,           // 토큰 양 (+/-)
    reason: string,           // 사유
    timestamp: Timestamp      // 거래 시간
}
```

#### posts
```javascript
{
    title: string,            // 제목
    content: string,          // 내용
    authorId: string,         // 작성자 UID
    authorName: string,       // 작성자 이름
    authorPhoto: string,      // 작성자 사진
    createdAt: Timestamp,     // 작성 시간
    updatedAt: Timestamp,     // 수정 시간
    likeCount: number,        // 좋아요 수
    commentCount: number,     // 댓글 수
    viewCount: number         // 조회수
}
```

#### comments
```javascript
{
    postId: string,           // 게시글 ID
    content: string,          // 댓글 내용
    authorId: string,         // 작성자 UID
    authorName: string,       // 작성자 이름
    authorPhoto: string,      // 작성자 사진
    createdAt: Timestamp      // 작성 시간
}
```

#### likes
```javascript
{
    postId: string,           // 게시글 ID
    oderId: string,           // 사용자 UID
    createdAt: Timestamp      // 좋아요 시간
}
```

#### reports
```javascript
{
    type: string,             // 신고 유형 (post/comment)
    targetId: string,         // 신고 대상 ID
    reporterId: string,       // 신고자 UID
    reason: string,           // 신고 사유
    createdAt: Timestamp      // 신고 시간
}
```

#### attendance
```javascript
{
    userId: string,           // 사용자 UID
    date: string,             // 날짜 (YYYY-MM-DD)
    timestamp: Timestamp,     // 출석 시간
    tokens: number            // 받은 토큰
}
```

#### bets (포디움 베팅)
```javascript
{
    userId: string,           // 사용자 UID
    raceId: string,           // 레이스 ID
    raceName: string,         // 레이스 이름
    predictions: {            // 예측
        first: string,        // 1위 예측
        second: string,       // 2위 예측
        third: string         // 3위 예측
    },
    amount: number,           // 베팅 금액
    status: string,           // 상태 (pending/won/lost)
    createdAt: Timestamp,     // 베팅 시간
    settledAt: Timestamp,     // 정산 시간
    winAmount: number         // 당첨 금액
}
```

#### headToHeadBets (1:1 베팅)
```javascript
{
    userId: string,           // 사용자 UID
    matchupId: string,        // 매치업 ID
    raceId: string,           // 레이스 ID
    choice: string,           // 선택 (driver1/driver2)
    amount: number,           // 베팅 금액
    status: string,           // 상태 (pending/won/lost)
    createdAt: Timestamp,     // 베팅 시간
    settledAt: Timestamp,     // 정산 시간
    winAmount: number         // 당첨 금액
}
```

#### matchupStats
```javascript
{
    matchupId: string,        // 매치업 ID
    driver1: string,          // 드라이버1
    driver2: string,          // 드라이버2
    driver1Bets: number,      // 드라이버1 베팅 수
    driver2Bets: number,      // 드라이버2 베팅 수
    totalAmount: number       // 총 베팅 금액
}
```

#### raceEnergy
```javascript
{
    userId: string,           // 사용자 UID
    raceId: string,           // 레이스 ID
    claimTime: Timestamp,     // 수집 시간
    tokens: number            // 받은 토큰
}
```

#### fortunes
```javascript
{
    userId: string,           // 사용자 UID
    date: string,             // 날짜 (YYYY-MM-DD)
    cardId: number,           // 뽑은 카드 ID
    isReversed: boolean,      // 역방향 여부
    luckyItem: string,        // 행운의 아이템
    createdAt: Timestamp      // 생성 시간
}
```

### 3.3 Firestore Security Rules

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // 사용자 본인 확인 함수
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    // 관리자 확인 함수
    function isAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    // 로그인 사용자 확인
    function isAuthenticated() {
      return request.auth != null;
    }

    // users 컬렉션
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isOwner(userId) || isAdmin();
    }

    // tokenHistory 컬렉션
    match /tokenHistory/{docId} {
      allow read: if isAuthenticated() &&
                    (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isAuthenticated();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }

    // posts 컬렉션
    match /posts/{postId} {
      allow read: if true;
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() &&
                      (resource.data.authorId == request.auth.uid || isAdmin());
      allow delete: if isAuthenticated() &&
                      (resource.data.authorId == request.auth.uid || isAdmin());
    }

    // comments 컬렉션
    match /comments/{commentId} {
      allow read: if true;
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() &&
                      (resource.data.authorId == request.auth.uid || isAdmin());
      allow delete: if isAuthenticated() &&
                      (resource.data.authorId == request.auth.uid || isAdmin());
    }

    // likes 컬렉션
    match /likes/{likeId} {
      allow read: if true;
      allow create: if isAuthenticated();
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // reports 컬렉션
    match /reports/{reportId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
    }

    // attendance 컬렉션
    match /attendance/{docId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }

    // bets 컬렉션 (포디움)
    match /bets/{betId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAdmin();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }

    // headToHeadBets 컬렉션
    match /headToHeadBets/{betId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAdmin();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }

    // matchupStats 컬렉션
    match /matchupStats/{matchupId} {
      allow read: if true;
      allow write: if isAuthenticated();
    }

    // raceEnergy 컬렉션
    match /raceEnergy/{docId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }

    // leaderboardStats 컬렉션
    match /leaderboardStats/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // fortunes 컬렉션
    match /fortunes/{fortuneId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow delete: if isOwner(resource.data.userId) || isAdmin();
    }
  }
}
```

### 3.4 권한 매트릭스

| 컬렉션 | 비로그인 읽기 | 로그인 읽기 | 본인 쓰기 | 관리자 쓰기 | 본인 삭제 | 관리자 삭제 |
|--------|:-------------:|:-----------:|:---------:|:-----------:|:---------:|:-----------:|
| users | - | O | O | O | O | O |
| tokenHistory | - | 본인만 | O | - | O | O |
| posts | O | O | O | O | O | O |
| comments | O | O | O | O | O | O |
| likes | O | O | O | - | O | - |
| reports | - | - | O | O | - | - |
| attendance | - | O | O | - | O | O |
| bets | - | O | O | O | O | O |
| headToHeadBets | - | O | O | O | O | O |
| matchupStats | O | O | O | O | - | - |
| raceEnergy | - | O | O | - | O | O |
| leaderboardStats | O | O | - | O | - | O |
| fortunes | - | O | O | - | O | O |

---

## 4. 주요 기능 흐름

### 4.1 로그인/로그아웃 흐름

```
[로그인 흐름]
1. 사용자가 "Google 로그인" 버튼 클릭
2. googleLogin() 호출 → Google 팝업 표시
3. Google 인증 성공
4. Firebase Auth 상태 변경 감지 (onAuthStateChanged)
5. syncUserToFirestore() → users 컬렉션에 사용자 정보 저장/업데이트
6. updateUserUI() → 로그인 UI로 변경
7. updateTokenDisplay() → 토큰 잔액 표시

[로그아웃 흐름]
1. 사용자가 "로그아웃" 버튼 클릭
2. logout() 호출 → firebase.auth().signOut()
3. Firebase Auth 상태 변경 감지
4. updateUserUI() → 비로그인 UI로 변경
```

### 4.2 베팅 흐름

#### 포디움 베팅
```
1. 사용자가 베팅 페이지 접속
2. loadRaces() → 베팅 가능한 레이스 표시
3. 사용자가 1위, 2위, 3위 드라이버 선택
4. 사용자가 베팅 금액 입력
5. placePodiumBet() 호출
   - 토큰 잔액 확인
   - 토큰 차감 (deductTokens)
   - bets 컬렉션에 베팅 기록 저장
6. 레이스 종료 후 관리자가 결과 입력
7. settlePodiumBets() → 당첨자에게 토큰 지급
```

#### 1:1 베팅
```
1. 사용자가 매치업 목록 확인
2. 두 드라이버 중 한 명 선택
3. 베팅 금액 입력
4. placeBet() 호출
   - 토큰 잔액 확인
   - 토큰 차감
   - headToHeadBets에 기록 저장
   - matchupStats 업데이트
5. 레이스 종료 후 settleBets()로 정산
```

### 4.3 게시판 흐름

```
[글쓰기]
1. 로그인 상태 확인
2. 제목/내용 입력
3. createPost() 호출
   - posts 컬렉션에 저장
   - 첫 게시글인 경우 +20 AMR 지급

[댓글]
1. 게시글 상세 페이지에서 댓글 입력
2. addComment() 호출
   - comments 컬렉션에 저장
   - 게시글의 commentCount 증가

[좋아요]
1. 좋아요 버튼 클릭
2. toggleLike() 호출
   - likes 컬렉션에서 기존 좋아요 확인
   - 없으면 추가, 있으면 삭제
   - 게시글의 likeCount 업데이트

[신고]
1. 신고 버튼 클릭
2. 신고 사유 선택
3. reportPost() 호출
   - reports 컬렉션에 저장
   - 관리자가 확인 후 처리
```

### 4.4 출석체크 흐름

```
1. 메인 페이지 접속
2. loadAttendanceStatus() → 오늘 출석 여부 확인
3. 미출석 시 출석체크 버튼 활성화
4. 버튼 클릭 → checkAttendance() 호출
   - 오늘 날짜로 attendance에 기록
   - 연속 출석 계산 (calculateStreak)
   - 기본 보상 +10 AMR
   - 7일 연속 시 추가 +50 AMR
   - users 문서 업데이트 (streak, lastAttendance)
5. UI 업데이트 (버튼 비활성화, 토큰 표시)
```

### 4.5 토큰 시스템 흐름

```
[토큰 획득]
- 출석체크: +10 AMR (7일 연속 +50 AMR 보너스)
- 레이스 응원: +5 AMR (10분마다, 최대 12회)
- 예측 공유: +10 AMR
- 첫 게시글: +20 AMR
- 행운의 아이템: +5 AMR
- 베팅 당첨: 베팅 배당에 따름

[토큰 사용]
- 포디움 베팅
- 1:1 베팅

[토큰 내역 기록]
모든 토큰 변동은 tokenHistory에 기록:
{userId, amount, reason, timestamp}
```

### 4.6 회원 탈퇴 흐름

```
1. 마이페이지에서 "회원 탈퇴" 클릭
2. 확인 모달 표시
3. 사용자 확인 후 deleteAccount() 호출
4. deleteUserData(userId) 실행:
   - posts에서 userId로 작성한 글 삭제
   - comments에서 userId로 작성한 댓글 삭제
   - likes에서 userId로 한 좋아요 삭제
   - bets에서 userId의 베팅 기록 삭제
   - headToHeadBets에서 userId의 베팅 삭제
   - attendance에서 userId의 출석 기록 삭제
   - fortunes에서 userId의 운세 기록 삭제
   - raceEnergy에서 userId의 에너지 기록 삭제
   - tokenHistory에서 userId의 토큰 내역 삭제
   - users에서 userId 문서 삭제
5. Firebase Auth에서 사용자 삭제
6. 로그아웃 처리 후 메인 페이지로 이동
```

---

## 5. 외부 의존성

### 5.1 npm 패키지 (package.json)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `express` | ^4.21.2 | Node.js 웹 서버 프레임워크 |
| `cors` | ^2.8.5 | CORS(Cross-Origin Resource Sharing) 처리 |
| `axios` | ^1.7.9 | HTTP 클라이언트 (뉴스 스크래핑) |
| `cheerio` | ^1.0.0 | HTML 파싱 (뉴스 스크래핑) |
| `rss-parser` | ^3.13.0 | RSS 피드 파싱 |
| `google-translate-api-x` | ^10.7.1 | 뉴스 한글 번역 |
| `express-rate-limit` | ^7.5.0 | API 요청 제한 |

### 5.2 Firebase 서비스

| 서비스 | 용도 |
|--------|------|
| Firebase Authentication | Google OAuth 로그인 |
| Cloud Firestore | 데이터베이스 |
| Firebase Hosting | 웹 호스팅 (선택적) |

### 5.3 외부 API 및 서비스

| 서비스 | 용도 | 엔드포인트/URL |
|--------|------|----------------|
| Formula1.com | F1 뉴스 스크래핑 | formula1.com/en/latest/all |
| Motorsport.com | F1 뉴스 스크래핑 | motorsport.com/f1/news |
| Autosport.com | F1 뉴스 RSS | autosport.com/rss/feed/f1 |
| Discord Webhook | 알림 전송 (선택적) | 설정된 Webhook URL |

### 5.4 CDN 라이브러리 (HTML에서 로드)

| 라이브러리 | 용도 |
|------------|------|
| Firebase SDK | Firebase 서비스 클라이언트 |
| Font Awesome | 아이콘 |
| Google Fonts | 웹 폰트 |

### 5.5 서버 엔드포인트 (server.js)

| 엔드포인트 | 메서드 | 용도 | 제한 |
|------------|--------|------|------|
| `/api/news` | GET | 번역된 F1 뉴스 목록 | 100회/15분 |
| `/api/article` | GET | 개별 기사 내용 | 30회/5분 |
| `/api/health` | GET | 서버 상태 확인 | - |

**서버 보안 설정**:
- CORS: 지정된 origin만 허용
- Rate Limiting: 일반 100회/15분, 기사 30회/5분
- SSRF 방지: 허용된 도메인만 프록시 가능
  - formula1.com
  - motorsport.com
  - autosport.com

---

## 문서 정보

- **작성일**: 2026-01-22
- **버전**: 1.0
- **프로젝트**: Aston Martin F1 Fan Page
