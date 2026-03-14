# 프로젝트 전체 흐름 & 중요 규칙

> Aston Martin F1 Fan Page — 개발 시 반드시 참고해야 할 흐름과 규칙 모음

---

## 1. 프로젝트 개요

### 기술 스택

| 계층 | 기술 | 비고 |
|------|------|------|
| Frontend | HTML + CSS + Vanilla JS | 프레임워크 없음 |
| Backend | Node.js Express (`server.js`) | 단일 파일, Vercel Serverless |
| Database | Firebase Firestore | 실시간 구독 + Admin SDK |
| Authentication | Firebase Auth (Google OAuth) | ID Token 기반 |
| Deploy | Vercel | 정적 파일 + Node.js 함수 |
| External API | OpenF1 API | 레이스 결과, 드라이버 순위 |

### 사이트 맵

```
index.html          — 메인 (카운트다운, 뉴스, 리더보드 위젯, 출석체크)
paddock.html        — 커뮤니티 게시판 (글/댓글/좋아요/신고)
betting.html        — 베팅 (포디움 P1-P2-P3, 1:1 드라이버)
fortune.html        — 오늘의 운세 + 행운 아이템
history.html        — 팀 역사
leaderboard.html    — 리더보드 (적중률, 토큰, 커뮤니티, 출석)
mypage.html         — 마이페이지 (프로필, 내역, 회원탈퇴)
alonso.html         — 알론소 드라이버 페이지
stroll.html         — 스트롤 드라이버 페이지
404.html            — 에러 페이지
privacy.html        — 개인정보방침
terms.html          — 이용약관
```

---

## 2. 전체 아키텍처 흐름

### 3계층 구조

```
┌─────────────────────────────────────────────────────┐
│                   클라이언트 (브라우저)                │
│  HTML/CSS/JS + Firebase SDK (Auth + Firestore)      │
│                                                     │
│  ① 읽기: Firestore 직접 조회 (게시글, 베팅 기록 등)      |
│  ② 쓰기: Firestore 직접 쓰기 (게시글, 댓글, 좋아요)      │
│  ③ API:  서버 API 호출 (토큰, 베팅, 뉴스)              │
└───────────┬────────────────────┬────────────────────┘
            │ ③ REST API         │ ①② Firestore SDK
            ▼                    ▼
┌───────────────────┐   ┌────────────────────┐
│  서버 (server.js)  │   │  Firebase Firestore │
│  Express + Admin   │──▶│  Security Rules     │
│  SDK               │   │  실시간 DB          │
└───────────────────┘   └────────────────────┘
```

### 클라이언트에서 하는 일

- Firebase Auth 로그인/로그아웃
- Firestore에서 게시글, 댓글, 좋아요 직접 읽기/쓰기
- 베팅 기록 조회 (Firestore 직접 읽기)
- 실시간 배당률 계산 (Firestore 실시간 구독)
- UI 렌더링, 폼 검증, 에러 표시

### 서버에서 하는 일

- **토큰 증감** (출석, 보상, 차감 — 모든 토큰 변경)
- **베팅 생성/취소** (배당률 서버 재계산, 금액 검증)
- **자동 정산** (OpenF1 API로 레이스 결과 → 배치 정산)
- **뉴스 수집** (스크래핑 + RSS → 캐싱 → 번역)
- **리더보드 집계** (캐싱 5분)
- **닉네임 변경, 프로필 조회**
- **보안 검증** (쿨다운, 시간 마감, 금지어 등)

---

## 3. 핵심 기능별 흐름

### 3.1 인증 흐름

```
사용자 → Google 팝업 로그인 → Firebase Auth → ID Token 발급
                                                    │
                                          ┌─────────┴─────────┐
                                          ▼                   ▼
                                    클라이언트 저장        서버 API 호출 시
                                    (50분마다 갱신)       Authorization: Bearer {token}
                                                              │
                                                              ▼
                                                     verifyFirebaseToken()
                                                     → req.user = decoded
```

- **ID Token 갱신**: `tokenManager`가 50분마다 자동 갱신 (`auth.js:210-257`)
- **서버 검증**: 모든 보호된 API는 `verifyFirebaseToken` 미들웨어 사용 (`server.js:515-530`)
- **Admin 검증**: Custom Claims 기반, `x-admin-key` 헤더 (`server.js:59-78`)

### 3.2 토큰(AMR 코인) 시스템 흐름

#### 획득 경로 (모두 서버 API)

| 경로 | 보상 | API | 제한 |
|------|------|-----|------|
| 일일 출석 | 10 AMR | `POST /api/token/attendance` | 1일 1회 (KST 자정 기준) |
| 7일 연속 출석 | +50 AMR | 위와 동일 | 7일차 1회만 |
| 첫 글 작성 | 20 AMR | `POST /api/token/first-post` | 계정당 1회 |
| 행운 아이템 | 5 AMR | `POST /api/token/lucky-item` | 1일 1회 |
| 레이스 응원 | 5 AMR | `POST /api/token/race-energy` | 10분 쿨다운, 레이스당 최대 12회 |
| 베팅 당첨 | 배당률 × 베팅액 | 자동 정산 | - |

#### 차감 경로

| 경로 | 범위 | API |
|------|------|-----|
| 포디움 베팅 | 1~1000 AMR/포지션, 합계 ≤ 3000 | `POST /api/bet/podium` |
| 1:1 베팅 | 1~1000 AMR | `POST /api/bet/h2h` |

#### 감사 로그

모든 토큰 변경은 `tokenHistory` 컬렉션에 기록됨:
```
{ userId, type, amount, reason, balance, timestamp }
```

### 3.3 베팅 흐름

#### 포디움 베팅 (P1, P2, P3 예측)

```
사용자가 드라이버+포지션+금액 선택
        │
        ▼
클라이언트: 기본 검증 (금액 범위, 정수 여부)
        │
        ▼
POST /api/bet/podium  ──→  서버 검증:
                            ├─ Firebase 토큰 인증
                            ├─ 레이스 마감 시간 확인 (서버 시간)
                            ├─ 배당률 서버에서 재계산 (클라이언트 값 무시)
                            ├─ 금액 범위 검증 (1~1000, 합계 ≤ 3000)
                            ├─ 잔액 확인 + 차감 (트랜잭션)
                            └─ 베팅 기록 저장
```

**배당률 공식** (`server.js:1526-1532`):
```
odds = 1.3 × (1.12)^(순위-1)
범위: 1.1x ~ 50.0x
```

#### 1:1 베팅 (드라이버 A vs B)

```
사용자가 매치업+승자+금액 선택
        │
        ▼
POST /api/bet/h2h  ──→  서버 검증:
                         ├─ 시그모이드 함수로 배당률 재계산
                         ├─ 저배당 어뷰징 방지 (< 1.10x → 최대 50 AMR)
                         ├─ 잔액 확인 + 차감 (트랜잭션)
                         └─ 베팅 기록 저장
```

**배당률 공식** (`server.js:1535-1548`):
```
probA = 1 / (1 + e^(0.15 × (rankA - rankB)))
oddsA = 1 / (probA × 1.08)        ← 8% 하우스 엣지
범위: 1.05x ~ 15.0x
```

#### 베팅 취소

- 상태: `pending`만 취소 가능
- 시간: 베팅 후 **1시간 이내**만 가능
- 환불: 베팅액 전액 반환 (서버에서 처리)

### 3.4 자동 정산 시스템

```
┌─────────────────────────────────────────┐
│          자동 정산 루프                    │
│                                         │
│  정상 모드: 1시간마다 체크                  │
│  재시도 모드: 5분마다 체크 (미처리 시)       │
│                                         │
│  1. OpenF1 API로 최신 레이스 결과 조회      │
│  2. 이미 정산된 레이스인지 확인              │
│     (Firestore settlementHistory)         │
│  3. pending 베팅을 166개씩 배치 처리        │
│  4. 배당률 재검증 (조작 의심 시 경고 로그)    │
│  5. 당첨자 토큰 지급, 패배자 상태 변경       │
│  6. 정산 기록 저장                         │
│  7. 모든 배치 완료 → 1시간 모드 복귀        │
│     미처리 존재 → 5분 재시도 모드 전환       │
└─────────────────────────────────────────┘
```

**배치 처리** (`server.js:2878-3137`):
- 배치 크기: 166건 (Firestore 배치 500개 작업 / 3개 = 166)
- 재시도: 최대 3회, 2초 대기
- 실패 시: 다음 사이클에서 재처리

**즉시 정산 트리거**:
- 클라이언트가 레이스 종료 감지 → `POST /api/race-ended` → 즉시 정산 시작
- 중복 알림 방지: localStorage로 추적 (`raceEnergy.js:57`)

### 3.5 커뮤니티(게시판) 흐름

```
글 작성 → 서버 쿨다운 검증 (60초) → Firestore 직접 저장
                                      │
                          첫 글이면 → POST /api/token/first-post (20 AMR)
                                      │
댓글 작성 → Firestore 직접 저장 (서버 경유 X)
좋아요 → Firestore 배치 작업 (likeCount ±1)
신고 → Firestore 저장 + Discord 웹훅 알림
삭제 → Admin Claims 확인 → Firestore 삭제
```

**Firestore Security Rules로 보호되는 것**:
- `likeCount`는 ±1만 변경 가능
- 본인 글/댓글만 수정/삭제 (Admin 제외)
- 좋아요는 본인만 취소 가능

### 3.6 출석체크 흐름

```
출석 버튼 클릭
    │
    ▼
POST /api/token/attendance
    │
    ▼
서버에서 KST 날짜 확인 (YYYYMMDD)
    │
    ├─ 이미 출석 → 에러 반환
    │
    └─ 미출석 → 트랜잭션:
               ├─ 연속일 계산 (어제 출석? +1 : 1로 리셋)
               ├─ 10 AMR 지급
               ├─ 7일차면 +50 AMR 보너스
               ├─ attendance 기록 저장
               └─ tokenHistory 기록 저장
```

### 3.7 뉴스 시스템 흐름

```
GET /api/news
    │
    ▼
캐시 확인 (30분 TTL)
    │
    ├─ 유효 → 캐시 반환
    │
    └─ 만료 → 3개 소스 병렬 수집:
               ├─ F1 공식: 웹 스크래핑 (제목만, 설명 = 제목)
               ├─ Motorsport.com: RSS (contentSnippet 있음)
               └─ Autosport: RSS (contentSnippet 있음)
               │
               ▼
          AM 관련 필터링 (키워드 매칭 + 타팀 제외)
               │
               ▼
          중복 제거 → 날짜순 정렬 → 최대 15개
               │
               ▼
          Google Translate로 한국어 번역
               │
               ▼
          캐시 저장 + 반환
```

**기사 상세**: `GET /api/article?url=...`
- SSRF 방지: 도메인 화이트리스트 검증 (`server.js:1920-1935`)
- Rate Limit: 5분당 30회
- 본문 최대 5000자

### 3.8 리더보드 흐름

```
GET /api/leaderboard/:type
    │
    ▼
서버 캐시 확인 (5분 TTL)
    │
    ├─ 유효 → 캐시 반환
    │
    └─ 만료 → Firestore에서 집계:
               ├─ betting-accuracy: 적중률 (최소 3판 이상)
               ├─ coin: 토큰 획득량
               ├─ community: 공감 수
               └─ attendance: 연속/누적 출석
               │
               ▼
          기간별 필터: all / season / monthly / weekly
               │
               ▼
          상위 100명 + 캐시 저장
```

---

## 4. 중요 규칙 (반드시 지켜야 할 것들)

### 4.1 보안 규칙

| 규칙 | 이유 | 위치 |
|------|------|------|
| 토큰 증감은 **반드시 서버에서** | 클라이언트 조작 방지 | `token.js:117-119` — `addTokens()` 호출 시 Error throw |
| 배당률은 **서버에서 재계산** | 클라이언트가 보낸 배당률 무시 | `server.js:1610` |
| 뉴스 URL은 **화이트리스트 검증** | SSRF 방지 | `server.js:1920-1935` |
| Admin 키는 **헤더로만** 전달 | URL 쿼리 → 로그 노출 | `server.js:59-78` |
| Admin 키 최소 **32자** | 브루트포스 방지 | `server.js:64` |
| HTTPS만 허용 (프로필 이미지) | 중간자 공격 방지 | `utils.js:262` |
| 보안 헤더 적용 | XSS, 클릭재킹 방지 | `server.js:129-147` |

### 4.2 데이터 무결성 규칙

| 상황 | 사용 방법 | 이유 |
|------|----------|------|
| 토큰 잔액 변경 | `FieldValue.increment()` | Race Condition 방지 |
| 토큰 차감 + 베팅 생성 | Firestore **트랜잭션** | 원자적 처리 (부분 실패 방지) |
| 좋아요 토글 | Firestore **배치 작업** | like 문서 + likeCount 동시 업데이트 |
| 정산 처리 | 166건 **배치**, 3회 재시도 | Firestore 배치 500개 제한 준수 |
| 정산 중복 방지 | `settlementHistory` 컬렉션 | 서버 재시작 시에도 중복 정산 X |

### 4.3 클라이언트 vs 서버 책임 분리

```
┌──────────────────────────────────┬──────────────────────────────────┐
│         클라이언트 (OK)           │          서버 (MUST)             │
├──────────────────────────────────┼──────────────────────────────────┤
│ 게시글/댓글 CRUD                  │ 토큰 지급/차감                    │
│ 좋아요 토글                       │ 베팅 생성/취소/정산               │
│ 베팅 기록 읽기                    │ 배당률 계산                      │
│ 실시간 배당률 표시 (참고용)         │ 쿨다운/마감 시간 검증             │
│ 폼 입력 검증 (UX)                │ 입력 검증 (보안)                  │
│ 뉴스/리더보드 표시                │ 뉴스 수집/번역, 리더보드 집계      │
│ UI 상태 관리                     │ 닉네임 변경, 프로필 조회           │
│ 레이스 종료 감지 (알림용)          │ 자동 정산 실행                    │
└──────────────────────────────────┴──────────────────────────────────┘
```

### 4.4 Firestore Security Rules 핵심

| 컬렉션 | 클라이언트가 할 수 있는 것 | 할 수 없는 것 |
|--------|------------------------|--------------|
| `users` | 본인 읽기, 토큰 **차감**만 | 토큰 **증가** 불가 |
| `posts` | 읽기, 생성, 본인 수정/삭제 | 타인 글 수정/삭제 |
| `podiumBets` | 로그인 후 읽기만 | 생성/수정/삭제 (서버 Admin만) |
| `headToHeadBets` | 로그인 후 읽기만 | 생성/수정/삭제 (서버 Admin만) |
| `tokenHistory` | 본인 것만 읽기 | 생성/수정/삭제 (서버 Admin만) |
| `attendance` | 로그인 후 읽기 | 24시간 내 재생성 불가 |
| `reports` | 생성만 | 읽기 (Admin만) |

### 4.5 입력 검증 규칙

| 대상 | 규칙 | 위치 |
|------|------|------|
| 베팅 금액 | 1~1000 AMR, 정수만 (`Number.isInteger`) | `server.js:1586-1590` |
| 포디움 합계 | ≤ 3000 AMR | `server.js:1596` |
| 닉네임 | 2~20자, 금지어 필터 적용 | `server.js:1050` |
| 기사 제목/설명 | 최대 500자 | `server.js:442` |
| 기사 본문 | 최대 5000자 | 스크래핑 시 잘림 |
| 신고 상세 | 최대 1000자 | `paddock.js:573` |
| 토큰 차감 사유 | 1~200자 | `token.js:137` |
| 프로필 이미지 URL | `googleusercontent.com`, `gravatar.com`만 | `utils.js:242-250` |

**금지어 필터** (`server.js:993-1031`):
- 욕설, 선정적 단어 약 50개
- 자음 조합 우회 방지 (`ㅅㅂ` 등)
- 숫자/공백/특수문자 제거 후 재검증

### 4.6 Rate Limiting 규칙

| 대상 | 윈도우 | 제한 | 위치 |
|------|--------|------|------|
| 일반 API | 15분 | 100회 (프로덕션) / 1000회 (개발) | `server.js:99-105` |
| 기사 스크래핑 | 5분 | 30회 | `server.js:108-112` |
| 관리자 API | 15분 | 10회 | `server.js:115-121` |

### 4.7 시간 관련 규칙

모든 시간 검증은 **서버 시간(KST)** 기준:

| 규칙 | 시간 | 위치 |
|------|------|------|
| 출석체크 기준 | KST 자정 (00:00) | `server.js:540-545` |
| 글 작성 쿨다운 | 60초 | `server.js:722` |
| 베팅 취소 | 생성 후 1시간 이내 | `server.js:1328, 1432` |
| 레이스 응원 쿨다운 | 10분 | `server.js:1197` |
| 응원 최대 횟수 | 레이스당 12회 | `server.js:1199` |
| 베팅 마감 | 레이스 시작 시간 | `server.js:1569` |
| 레이스 진행 시간 | 시작 ~ 시작 + 2시간 | `raceEnergy.js:128` |
| 시즌 기간 | 2026-03-08 ~ 2026-12-06 (KST) | `server.js` LEADERBOARD_CONFIG |

**클라이언트-서버 시간 동기화** (`podiumBet.js:142-161`):
- `GET /api/server-time`으로 서버 시간 조회
- 오프셋 계산 후 마감 시간 검증에 사용

### 4.8 배당률 규칙

#### 포디움 배당률 (순위 기반)

```
공식: odds = 1.3 × (1.12)^(순위-1)
범위: 1.1x ~ 50.0x (0.1 단위 반올림)

예시:
  1위 → 1.3x
  5위 → 1.8x
  10위 → 3.5x
  20위 → 28.5x
  22위 → 50.0x (상한)
```

#### 1:1 배당률 (시그모이드 함수)

```
공식:
  probA = 1 / (1 + e^(0.15 × (rankA - rankB)))
  oddsA = 1 / (probA × 1.08)

하우스 엣지: 8%
범위: 1.05x ~ 15.0x (0.01 단위 반올림)

예시 (A vs B):
  1위 vs 22위 → A: 1.10x / B: 10.50x
  10위 vs 10위 → A: 1.45x / B: 1.45x
```

#### 저배당 어뷰징 방지

```
배당률 < 1.10x → 최대 50 AMR까지만 베팅 가능
(server.js:1748-1754)
```

#### 배당률 재검증 (정산 시)

- 정산 시 배당률을 서버에서 재계산
- 차이가 큰 경우 경고 로그 출력:
  - H2H: 차이 > 0.5 → 조작 의심 경고 (`server.js:2455`)
  - 포디움: 차이 > 1.0 → 조작 의심 경고 (`server.js:2490`)

### 4.9 캐싱 규칙

| 대상 | TTL | 캐시 위치 | 갱신 방법 |
|------|-----|----------|----------|
| 뉴스 | 30분 | 서버 메모리 | 자동 만료 또는 `GET /api/refresh` (Admin) |
| 리더보드 | 5분 | 서버 메모리 | 자동 만료 |
| API 응답 (클라이언트) | 5분 | 클라이언트 메모리 (smartFetch) | 자동 만료 |
| OpenF1 API | 30분 | 클라이언트 메모리 | 자동 만료 |
| 정산 기록 | 영구 | Firestore (`settlementHistory`) | 정산 완료 시 저장 |

---

## 5. 개발 시 주의사항 (DOs & DON'Ts)

### DO (해야 할 것)

- **새 토큰 획득 경로 추가 시**: 반드시 `server.js`에 새 API 엔드포인트 생성
- **베팅 로직 수정 시**: `server.js` (서버 검증) + 클라이언트 JS (UI) **양쪽 수정**
- **상수 수정 시**: `js/constants.js` + `server.js` **양쪽 동기화** (Object.freeze 적용됨)
- **새 Firestore 컬렉션 추가 시**: `firestore.rules`에 보안 규칙 추가
- **사용자 입력 표시 시**: `escapeHtml()` 사용 (XSS 방지)
- **프로필 이미지 표시 시**: `getSafePhotoURL()` 사용 (도메인 검증)
- **API 호출 시**: `smartFetch()` 사용 (타임아웃, 재시도, 캐싱 내장)
- **Firestore 작업 시**: `withTimeout()` 감싸기 (5~8초)
- **금액 관련 작업 시**: `Number.isInteger()` + 범위 검증

### DON'T (하면 안 되는 것)

- **클라이언트에서 `addTokens()` 호출 금지** → Error가 throw됨 (`token.js:117-119`)
- **클라이언트에서 배당률을 서버에 전달하지 말 것** → 서버가 무시하고 재계산
- **Firestore에 직접 토큰 증가 쓰기 금지** → Security Rules가 차단 (`tokens < resource.data.tokens`)
- **ID Token을 로컬 스토리지에 저장 금지** → 메모리에서만 관리
- **`window.setTestRace()`를 프로덕션에서 사용 금지** → 개발 환경에서만 노출
- **환불 금액을 클라이언트에서 계산하지 말 것** → 서버에서 처리
- **Admin 키를 URL 쿼리로 전달 금지** → 로그에 노출됨

### 새 기능 추가 시 체크리스트

```
□ 토큰 관련 → 서버 API 생성했는가?
□ 사용자 입력 → escapeHtml() 적용했는가?
□ Firestore 쓰기 → Security Rules 추가했는가?
□ 시간 검증 필요 → 서버 시간(KST) 기준인가?
□ 상수 사용 → constants.js + server.js 동기화했는가?
□ API 호출 → smartFetch() 사용했는가?
□ 에러 처리 → errorHandler 패턴 따랐는가?
□ 중복 클릭 → 플래그(isXxxInProgress) 추가했는가?
```

---

## 6. 환경 설정 & 배포

### 필수 환경변수

```env
# 서버 설정
NODE_ENV=production          # development | production
PORT=3000                   # 서버 포트

# Firebase (둘 중 하나 선택)
# 방법 1: 개별 설정 (권장)
FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# 방법 2: JSON 블롭
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# 보안
ADMIN_KEY=최소32자이상의관리자키      # 프로덕션 필수
ALLOWED_ORIGINS=https://yourdomain.com  # CORS (쉼표 구분)

# 선택사항
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...  # 신고 알림
ENABLE_HSTS=true             # HSTS 강제 (프로덕션 권장)
```

### Vercel 배포 구조

```json
{
  "builds": [
    { "src": "server.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server.js" },
    { "src": "/(.*\\.html)", "dest": "/$1" },
    { "src": "/(.*\\.css)", "dest": "/$1" },
    { "src": "/(.*\\.js)", "dest": "/$1" },
    { "src": "/(images/.*)", "dest": "/$1" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

- `/api/*` → Node.js 서버리스 함수 (server.js)
- 나머지 → 정적 파일 그대로 서빙

### 서버 시작 시 자동 실행

1. Firebase Admin SDK 초기화
2. `initAutoSettlement()` — 정산 기록 로드 + 1시간 체크 시작
3. `updateLeaderboardCache()` — 리더보드 초기 캐싱
4. Express 서버 리스닝

---

## 부록: 파일별 핵심 역할 요약

| 파일 | 역할 | 핵심 라인 |
|------|------|----------|
| `server.js` | 백엔드 전체 (API, 정산, 뉴스) | 4310줄 |
| `js/auth.js` | Firebase 인증, 토큰 갱신 | 210-257 (tokenManager) |
| `js/token.js` | AMR 코인 조회/차감, 지급 차단 | 117-119 (addTokens 차단) |
| `js/constants.js` | 전역 상수 (동결됨) | 188-199 (Object.freeze) |
| `js/paddock.js` | 커뮤니티 게시판 CRUD | 225-298 (글 작성) |
| `js/podiumBet.js` | 포디움 베팅 UI/로직 | 1029-1155 (베팅 실행) |
| `js/headToHeadBet.js` | 1:1 베팅 UI/로직 | 1102-1236 (베팅 실행) |
| `js/bettingData.js` | 드라이버 데이터, 배당률 | 51-83 (DRIVER_ODDS) |
| `js/attendance.js` | 출석체크 | 63-126 (출석 실행) |
| `js/news.js` | 뉴스 표시 | 264-283 (뉴스 로드) |
| `js/leaderboard.js` | 리더보드 표시 | 156-235 (리더보드 로드) |
| `js/raceEnergy.js` | 레이스 응원 + 정산 트리거 | 388-466 (에너지 수집) |
| `js/mypage.js` | 마이페이지 전체 기능 | 681-734 (닉네임 변경) |
| `js/f1api.js` | OpenF1 API 통합 | 254-313 (드라이버 순위) |
| `js/utils.js` | 유틸 (fetch, XSS, 캐시) | 61-144 (smartFetch) |
| `js/errorHandler.js` | 전역 에러 처리 | 130-175 (handleError) |
| `js/script.js` | 카운트다운, 스크롤 | 75-122 (카운트다운) |
| `firestore.rules` | DB 보안 규칙 | 전체 |
