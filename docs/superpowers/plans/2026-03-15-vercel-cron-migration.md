# Vercel Serverless Cron 마이그레이션 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel Serverless에서 작동하지 않는 node-cron/setTimeout 기반 스케줄 작업 9개를 GitHub Actions + Lazy Refresh로 전환

**Architecture:** 캐시 갱신 류(리더보드, 드라이버 순위, 뉴스, Rental 만료)는 API 호출 시 자동 갱신(lazy refresh)으로 전환. 정산/리셋/정리 작업은 GitHub Actions가 주기적으로 API 엔드포인트를 호출하여 트리거.

**Tech Stack:** GitHub Actions (cron), Express API endpoints, Firebase Admin SDK

---

## Task 1: `/api/cron/tasks` 엔드포인트 추가

**Files:**
- Modify: `server.js` (새 엔드포인트 추가, `app.post('/api/admin/settle')` 근처)

- [ ] **Step 1: `/api/cron/tasks` POST 엔드포인트 작성**

`server.js`에서 `/api/admin/settle` 엔드포인트(라인 2323) 뒤에 추가:

```javascript
// GitHub Actions 등 외부 cron에서 호출하는 스케줄 작업 엔드포인트
app.post('/api/cron/tasks', async (req, res) => {
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

    const { task } = req.body;
    const validTasks = ['weekly-reset', 'monthly-reset', 'season-check', 'delete-old-news', 'process-rentals', 'refresh-leaderboard'];

    if (!task || !validTasks.includes(task)) {
        return res.status(400).json({ success: false, error: `유효하지 않은 작업입니다. 가능: ${validTasks.join(', ')}` });
    }

    try {
        console.log(`[CRON] 외부 트리거: ${task}`);

        switch (task) {
            case 'weekly-reset':
                await weeklyReset();
                break;
            case 'monthly-reset':
                await monthlyReset();
                break;
            case 'season-check':
                await seasonEndHandler();
                break;
            case 'delete-old-news':
                await deleteOldNews();
                break;
            case 'process-rentals':
                await processExpiredRentals();
                break;
            case 'refresh-leaderboard':
                await refreshLeaderboardCache();
                break;
        }

        res.json({ success: true, message: `${task} 완료` });
    } catch (error) {
        console.error(`[CRON] ${task} 실패:`, error.message);
        res.status(500).json({ success: false, error: `${task} 실패: ${error.message}` });
    }
});
```

- [ ] **Step 2: 로컬에서 수동 테스트**

```bash
npm run dev
# 별도 터미널에서:
curl -X POST http://localhost:3000/api/cron/tasks \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -d '{"task":"refresh-leaderboard"}'
# Expected: {"success":true,"message":"refresh-leaderboard 완료"}

curl -X POST http://localhost:3000/api/cron/tasks \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -d '{"task":"invalid"}'
# Expected: 400 에러
```

- [ ] **Step 3: 커밋**

```bash
git add server.js
git commit -m "feat: 외부 cron 트리거용 /api/cron/tasks 엔드포인트 추가"
```

---

## Task 2: Lazy 리더보드 캐시 갱신

**Files:**
- Modify: `server.js` (라인 4755-4792: `/api/leaderboard/:type` 엔드포인트)

- [ ] **Step 1: 리더보드 API 응답 후 Firestore 캐시 비동기 업데이트**

`/api/leaderboard/:type` 엔드포인트(라인 4775-4786)에서, `res.json()` 뒤에 비동기 캐시 업데이트 추가:

```javascript
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

        // Lazy: Firestore 캐시도 업데이트 (비동기, 실패해도 무시)
        const docId = getCacheKey(type, subType, period);
        db.collection('leaderboards').doc(docId).set({
            type,
            subType,
            period,
            periodKey: getPeriodKey(period),
            rankings: result.rankings,
            totalParticipants: result.totalParticipants,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error('[Lazy 캐시] 리더보드 캐시 업데이트 실패:', err.message));

    } catch (error) {
```

- [ ] **Step 2: 커밋**

```bash
git add server.js
git commit -m "feat: 리더보드 API에 lazy Firestore 캐시 업데이트 추가"
```

---

## Task 3: Lazy Rental 만료 처리

**Files:**
- Modify: `server.js` (라인 5362-5431: `/api/shop/inventory`, 라인 5606: `/api/shop/equip`)

- [ ] **Step 1: `checkUserExpiredRentals(userId)` 헬퍼 함수 추가**

`processExpiredRentals()` 함수(라인 6681) 바로 위에 추가:

```javascript
// Lazy rental 만료 체크: 특정 유저의 만료된 rental 아이템 처리
async function checkUserExpiredRentals(userId) {
    if (!db) return;

    try {
        const now = admin.firestore.Timestamp.now();
        const snapshot = await db.collection('userInventory')
            .where('userId', '==', userId)
            .where('type', '==', 'rental')
            .where('isExpired', '==', false)
            .where('expiresAt', '<', now)
            .get();

        if (snapshot.empty) return;

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { isExpired: true, equipped: false });
        });
        await batch.commit();

        // 코스메틱 캐시 갱신
        await updateUserCosmetics(userId);
        console.log(`[Lazy Rental] ${userId}: ${snapshot.size}개 만료 처리`);
    } catch (error) {
        console.error(`[Lazy Rental] ${userId} 처리 실패:`, error.message);
    }
}
```

- [ ] **Step 2: `/api/shop/inventory`에 lazy 체크 추가**

라인 5368 (`const userId = req.user.uid;`) 뒤에 추가:

```javascript
    const userId = req.user.uid;

    // Lazy: 만료된 rental 아이템 자동 처리
    await checkUserExpiredRentals(userId);
```

- [ ] **Step 3: `/api/shop/equip`에 lazy 체크 추가**

`/api/shop/equip` 엔드포인트 시작 부분에서 userId 추출 후 추가:

```javascript
    // Lazy: 만료된 rental 아이템 자동 처리
    await checkUserExpiredRentals(req.user.uid);
```

- [ ] **Step 4: 커밋**

```bash
git add server.js
git commit -m "feat: 인벤토리/장착 API에 lazy rental 만료 처리 추가"
```

---

## Task 4: Vercel 환경에서 cron 초기화 스킵

**Files:**
- Modify: `server.js` (라인 6781-6812: `app.listen` 블록)

- [ ] **Step 1: Vercel 환경 감지하여 스케줄러 스킵**

`app.listen` 콜백(라인 6781-6812)에서 `initSchedulers()`와 `initAutoSettlement()` 호출을 조건부로 변경:

```javascript
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`====================================`);
    console.log(`  F1 팬페이지 서버 시작!`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`====================================`);

    // 서버 시작 시 뉴스 미리 로드
    fetchAllNews().catch(console.error);

    // 서버 시작 시 드라이버 순위 캐시 초기화
    fetchServerDriverStandings().catch(err => console.error('[시작] 순위 캐시 초기화 실패:', err.message));

    // Vercel Serverless에서는 setInterval/cron 작동 불가 → 스킵
    if (!process.env.VERCEL) {
        // 30분마다 뉴스 자동 갱신 (로컬 전용)
        setInterval(() => {
            console.log('[자동 갱신] 뉴스 캐시 초기화 및 새로 로드...');
            newsCache = { data: null, timestamp: 0 };
            fetchAllNews().catch(console.error);
        }, CACHE_DURATION);

        // races 컬렉션 초기화 (베팅 시간 검증용)
        await initRacesCollection();

        // 자동 정산 시스템 시작
        await initAutoSettlement();

        // 스케줄러 초기화
        initSchedulers();

        // 서버 시작 시 리더보드 캐시 즉시 갱신
        refreshLeaderboardCache().catch(console.error);

        console.log('[환경] 로컬 모드: cron 스케줄러 활성화');
    } else {
        // Vercel: races 컬렉션 초기화만 (베팅 시간 검증용)
        await initRacesCollection();

        console.log('[환경] Vercel Serverless: cron 스킵 (GitHub Actions로 대체)');
    }
});
```

- [ ] **Step 2: 커밋**

```bash
git add server.js
git commit -m "feat: Vercel 환경에서 cron/setTimeout 스케줄러 스킵"
```

---

## Task 5: GitHub Actions - 자동정산 워크플로우

**Files:**
- Create: `.github/workflows/auto-settle.yml`

- [ ] **Step 1: 워크플로우 파일 작성**

```yaml
name: Auto Settlement

on:
  schedule:
    # 매주 토/일 04:00-16:00 UTC (KST 13:00-01:00) 10분 간격
    # F1 레이스는 대부분 이 시간대에 종료
    - cron: '*/10 4-16 * * 0,6'
  workflow_dispatch:
    inputs:
      round:
        description: '정산할 라운드 번호 (비우면 최신)'
        required: false

jobs:
  settle:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Call settlement API
        env:
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          ADMIN_KEY: ${{ secrets.ADMIN_KEY }}
        run: |
          BODY='{}'
          if [ -n "${{ github.event.inputs.round }}" ]; then
            BODY='{"round": ${{ github.event.inputs.round }}}'
          fi

          RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/admin/settle" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${ADMIN_KEY}" \
            -d "${BODY}" \
            --max-time 60)

          HTTP_CODE=$(echo "$RESPONSE" | tail -1)
          BODY=$(echo "$RESPONSE" | head -n -1)

          echo "Status: ${HTTP_CODE}"
          echo "Response: ${BODY}"

          # 404 = 결과 없음 (레이스 미완료), 200 = 정산 완료/이미 완료
          if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 404 ]; then
            echo "OK"
          else
            echo "::warning::Settlement returned ${HTTP_CODE}"
          fi
```

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/auto-settle.yml
git commit -m "feat: GitHub Actions 자동정산 워크플로우 추가"
```

---

## Task 6: GitHub Actions - 일간/주간/월간 작업 워크플로우

**Files:**
- Create: `.github/workflows/scheduled-tasks.yml`

- [ ] **Step 1: 워크플로우 파일 작성**

```yaml
name: Scheduled Tasks

on:
  schedule:
    # 매일 18:00 UTC (KST 03:00) - 뉴스 삭제 + 시즌 체크 + 렌탈 만료
    - cron: '0 18 * * *'
    # 매주 일요일 15:00 UTC (KST 월요일 00:00) - 주간 리셋
    - cron: '0 15 * * 0'
    # 매월 마지막 주 28-31일 14:55 UTC (KST 23:55) - 월간 리셋
    - cron: '55 14 28-31 * *'
  workflow_dispatch:
    inputs:
      task:
        description: '실행할 작업'
        required: true
        type: choice
        options:
          - delete-old-news
          - season-check
          - process-rentals
          - weekly-reset
          - monthly-reset
          - refresh-leaderboard

jobs:
  run-tasks:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      API_BASE_URL: ${{ secrets.API_BASE_URL }}
      ADMIN_KEY: ${{ secrets.ADMIN_KEY }}
    steps:
      - name: Determine tasks to run
        id: tasks
        run: |
          # workflow_dispatch에서 직접 지정한 경우
          if [ -n "${{ github.event.inputs.task }}" ]; then
            echo "tasks=${{ github.event.inputs.task }}" >> $GITHUB_OUTPUT
            exit 0
          fi

          TASKS=""
          HOUR=$(date -u +%H)
          MINUTE=$(date -u +%M)
          DOW=$(date -u +%u)        # 1=Mon, 7=Sun
          DAY=$(date -u +%d)
          TOMORROW_DAY=$(date -u -d "+1 day" +%d)

          # 매일 18:00 UTC (KST 03:00)
          if [ "$HOUR" -eq 18 ] && [ "$MINUTE" -lt 10 ]; then
            TASKS="delete-old-news season-check process-rentals"
          fi

          # 매주 일요일 15:00 UTC (KST 월요일 00:00)
          if [ "$DOW" -eq 7 ] && [ "$HOUR" -eq 15 ] && [ "$MINUTE" -lt 10 ]; then
            TASKS="${TASKS} weekly-reset"
          fi

          # 매월 마지막 날 14:55 UTC (KST 23:55)
          if [ "$DAY" -ge 28 ] && [ "$TOMORROW_DAY" -eq 01 ]; then
            TASKS="${TASKS} monthly-reset"
          fi

          TASKS=$(echo "$TASKS" | xargs)  # trim
          echo "tasks=${TASKS}" >> $GITHUB_OUTPUT
          echo "Tasks to run: ${TASKS:-none}"

      - name: Execute tasks
        if: steps.tasks.outputs.tasks != ''
        run: |
          TASKS="${{ steps.tasks.outputs.tasks }}"
          FAILED=0

          for TASK in $TASKS; do
            echo "=== Running: ${TASK} ==="

            RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/cron/tasks" \
              -H "Content-Type: application/json" \
              -H "X-Admin-Key: ${ADMIN_KEY}" \
              -d "{\"task\":\"${TASK}\"}" \
              --max-time 120)

            HTTP_CODE=$(echo "$RESPONSE" | tail -1)
            BODY=$(echo "$RESPONSE" | head -n -1)

            echo "Status: ${HTTP_CODE}"
            echo "Response: ${BODY}"

            if [ "$HTTP_CODE" -ne 200 ]; then
              echo "::warning::${TASK} failed with ${HTTP_CODE}"
              FAILED=$((FAILED + 1))
            fi
          done

          if [ $FAILED -gt 0 ]; then
            echo "::warning::${FAILED} task(s) failed"
          fi
```

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/scheduled-tasks.yml
git commit -m "feat: GitHub Actions 일간/주간/월간 스케줄 작업 워크플로우 추가"
```

---

## Task 7: 환경변수 문서화 및 설정 안내

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: `.env.example`에 GitHub Actions 관련 안내 추가**

`.env.example` 파일 끝에 추가:

```
# === GitHub Actions Secrets (Vercel 환경에서 필요) ===
# GitHub Repository Settings > Secrets and variables > Actions 에서 설정:
# - API_BASE_URL: Vercel 배포 URL (예: https://your-app.vercel.app)
# - ADMIN_KEY: 서버의 ADMIN_KEY와 동일한 값
```

- [ ] **Step 2: 커밋**

```bash
git add .env.example
git commit -m "docs: GitHub Actions 시크릿 설정 안내 추가"
```

---

## 배포 후 체크리스트

- [ ] GitHub Repository > Settings > Secrets > Actions에 `API_BASE_URL`과 `ADMIN_KEY` 시크릿 추가
- [ ] Vercel에 배포 후 `/api/cron/tasks` 엔드포인트가 정상 응답하는지 확인
- [ ] GitHub Actions 탭에서 워크플로우가 정상 등록되었는지 확인
- [ ] `workflow_dispatch`로 수동 실행하여 정상 작동 테스트
