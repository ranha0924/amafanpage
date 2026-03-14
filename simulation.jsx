import React, { useState, useMemo, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// ============================================================
// F1 FANS 코인 이코노미 시뮬레이션 대시보드
// 독립 React 아티팩트 (프로젝트에 포함되지 않는 분석 도구)
// ============================================================

// --- 코드에서 추출한 정확한 파라미터 ---
const PARAMS = {
  ATTENDANCE_REWARD: 10,
  STREAK_BONUS: 50,
  STREAK_DAYS: 7,
  FIRST_POST_REWARD: 20,
  PREDICTION_SHARE_REWARD: 10,
  PODIUM_BET_MIN: 1,
  PODIUM_BET_MAX_PER_POSITION: 1000,
  PODIUM_BET_MAX_TOTAL: 3000,
  H2H_BET_MIN: 1,
  H2H_BET_MAX: 1000,
  RACE_INTERVAL_DAYS: 14,
  INITIAL_TOKENS: 0,
};

// --- 프리셋 정의 ---
const PRESETS = {
  light: { label: '라이트', color: '#94a3b8', loginRate: 40, betsPerRace: 0, hitRate: 0, avgBet: 0, avgOdds: 1.3, communityActivity: 10, shopFreq: 0, avgPurchase: 0 },
  normal: { label: '일반', color: '#3b82f6', loginRate: 70, betsPerRace: 1, hitRate: 30, avgBet: 100, avgOdds: 2.0, communityActivity: 40, shopFreq: 1, avgPurchase: 200 },
  heavy: { label: '헤비', color: '#f59e0b', loginRate: 95, betsPerRace: 3, hitRate: 40, avgBet: 300, avgOdds: 2.5, communityActivity: 80, shopFreq: 3, avgPurchase: 500 },
  whale: { label: '고래', color: '#ef4444', loginRate: 95, betsPerRace: 5, hitRate: 35, avgBet: 800, avgOdds: 3.0, communityActivity: 60, shopFreq: 8, avgPurchase: 1500 },
};

// --- 시뮬레이션 함수 ---
function simulate(params, days) {
  const { loginRate, betsPerRace, hitRate, avgBet, avgOdds, communityActivity, shopFreq, avgPurchase } = params;

  let balance = PARAMS.INITIAL_TOKENS;
  let streak = 0;
  let firstPostGiven = false;
  let totalEarned = 0;
  let totalSpent = 0;

  const dailyShopProb = shopFreq / 30;
  const data = [];

  // 수입 breakdown 누적
  let attendanceTotal = 0;
  let streakTotal = 0;
  let firstPostTotal = 0;
  let bettingWinTotal = 0;
  let bettingLossTotal = 0;
  let shopTotal = 0;

  for (let day = 1; day <= days; day++) {
    let dailyEarn = 0;
    let dailySpend = 0;

    // 1. 출석 체크
    const loggedIn = Math.random() * 100 < loginRate;
    if (loggedIn) {
      dailyEarn += PARAMS.ATTENDANCE_REWARD;
      attendanceTotal += PARAMS.ATTENDANCE_REWARD;
      streak++;

      if (streak === PARAMS.STREAK_DAYS) {
        dailyEarn += PARAMS.STREAK_BONUS;
        streakTotal += PARAMS.STREAK_BONUS;
        streak = 0; // 7일 후 리셋
      }
    } else {
      streak = 0;
    }

    // 2. 커뮤니티 보상 (첫 글 20 FC만, 1회)
    if (!firstPostGiven && communityActivity > 0 && loggedIn) {
      dailyEarn += PARAMS.FIRST_POST_REWARD;
      firstPostTotal += PARAMS.FIRST_POST_REWARD;
      firstPostGiven = true;
    }

    // 3. 베팅 (레이스 있는 날만 = 14일 간격)
    const isRaceDay = day % PARAMS.RACE_INTERVAL_DAYS === 0;
    if (isRaceDay && betsPerRace > 0 && loggedIn) {
      for (let b = 0; b < betsPerRace; b++) {
        const betAmount = Math.min(avgBet, balance);
        if (betAmount <= 0) break;

        const hit = Math.random() * 100 < hitRate;
        if (hit) {
          const winnings = Math.floor(betAmount * avgOdds);
          const netWin = winnings - betAmount;
          dailyEarn += netWin;
          bettingWinTotal += netWin;
        } else {
          dailySpend += betAmount;
          bettingLossTotal += betAmount;
        }
      }
    }

    // 4. 상점 구매
    if (loggedIn && Math.random() < dailyShopProb) {
      const purchaseAmount = Math.min(avgPurchase, balance + dailyEarn - dailySpend);
      if (purchaseAmount > 0) {
        dailySpend += purchaseAmount;
        shopTotal += purchaseAmount;
      }
    }

    totalEarned += dailyEarn;
    totalSpent += dailySpend;
    balance = Math.max(0, balance + dailyEarn - dailySpend);

    data.push({
      day,
      balance: Math.round(balance),
      dailyEarn: Math.round(dailyEarn),
      dailySpend: Math.round(dailySpend),
      net: Math.round(dailyEarn - dailySpend),
    });
  }

  return {
    data,
    totalEarned: Math.round(totalEarned),
    totalSpent: Math.round(totalSpent),
    finalBalance: Math.round(balance),
    breakdown: {
      attendance: Math.round(attendanceTotal),
      streak: Math.round(streakTotal),
      firstPost: Math.round(firstPostTotal),
      bettingWin: Math.round(bettingWinTotal),
      bettingLoss: Math.round(bettingLossTotal),
      shop: Math.round(shopTotal),
    },
  };
}

// --- 핵심 지표 계산 ---
function computeMetrics(result, days) {
  const { data, totalEarned, totalSpent } = result;

  // 월간 순수익
  const monthlyNet = days >= 30
    ? Math.round(((totalEarned - totalSpent) / days) * 30)
    : Math.round(totalEarned - totalSpent);

  // 코인 0 도달일
  const zeroDay = data.find(d => d.balance === 0 && d.day > 1);
  const zeroDayStr = zeroDay ? `${zeroDay.day}일차` : 'N/A';

  // 일일 순수익
  const dailyNet = (totalEarned - totalSpent) / days;

  // 일반 아이템(200 FC) 구매까지 소요일
  const daysForCommon = dailyNet > 0 ? Math.ceil(200 / dailyNet) : Infinity;
  const daysForCommonStr = daysForCommon === Infinity ? 'N/A' : `${daysForCommon}일`;

  // 전설 아이템(2000 FC) 구매까지 소요일
  const daysForLegendary = dailyNet > 0 ? Math.ceil(2000 / dailyNet) : Infinity;
  const daysForLegendaryStr = daysForLegendary === Infinity ? 'N/A' : `${daysForLegendary}일`;

  return { monthlyNet, zeroDayStr, daysForCommonStr, daysForLegendaryStr };
}

// --- 밸런스 경고 ---
function getWarnings(presetResults, days) {
  const warnings = [];

  // 라이트 유저 인플레이션 체크
  const lightMetrics = computeMetrics(presetResults.light, days);
  if (lightMetrics.monthlyNet >= 500) {
    warnings.push({ type: 'danger', msg: `인플레이션 위험: 라이트 유저 월간 순수익 ${lightMetrics.monthlyNet} FC (>= 500)` });
  }

  // 일반 유저 이탈 위험
  const normalData = presetResults.normal.data;
  const normalZeroIn60 = normalData.slice(0, 60).find(d => d.balance === 0 && d.day > 1);
  if (normalZeroIn60) {
    warnings.push({ type: 'danger', msg: `이탈 위험: 일반 유저 ${normalZeroIn60.day}일차에 코인 0 도달` });
  }

  // 밸런스 양호 체크
  const normalMetrics = computeMetrics(presetResults.normal, days);
  const normalDailyNet = (presetResults.normal.totalEarned - presetResults.normal.totalSpent) / days;
  if (normalDailyNet > 0) {
    const daysForLegendary = Math.ceil(2000 / normalDailyNet);
    if (daysForLegendary >= 30 && daysForLegendary <= 90) {
      warnings.push({ type: 'success', msg: `밸런스 양호: 일반 유저 전설 아이템까지 ${daysForLegendary}일 (30~90일 범위)` });
    }
  }

  // 헤비 유저 소비처 부족
  const heavyData = presetResults.heavy.data;
  const heavy100kIn90 = heavyData.slice(0, 90).find(d => d.balance >= 100000);
  if (heavy100kIn90) {
    warnings.push({ type: 'warning', msg: `소비처 부족: 헤비 유저 ${heavy100kIn90.day}일차에 100,000 FC 돌파` });
  }

  if (warnings.length === 0) {
    warnings.push({ type: 'info', msg: '현재 설정에서 특이 경고 없음' });
  }

  return warnings;
}

// --- 슬라이더 컴포넌트 ---
function Slider({ label, value, onChange, min, max, step = 1, unit = '' }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

// --- 메인 App ---
export default function App() {
  const [simDays, setSimDays] = useState(180);
  const [activePreset, setActivePreset] = useState('normal');
  const [sliders, setSliders] = useState({ ...PRESETS.normal });

  const updateSlider = useCallback((key, val) => {
    setSliders(prev => ({ ...prev, [key]: val }));
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((key) => {
    setActivePreset(key);
    setSliders({ ...PRESETS[key] });
  }, []);

  // 시뮬레이션 결과 (4 프리셋 + 커스텀)
  const results = useMemo(() => {
    const presetResults = {};
    for (const [key, preset] of Object.entries(PRESETS)) {
      presetResults[key] = simulate(preset, simDays);
    }
    const custom = simulate(sliders, simDays);
    return { presets: presetResults, custom };
  }, [sliders, simDays]);

  // 잔액 추이 차트 데이터 (4 프리셋 동시 표시)
  const balanceChartData = useMemo(() => {
    const maxLen = simDays;
    const data = [];
    for (let i = 0; i < maxLen; i++) {
      const point = { day: i + 1 };
      for (const [key, preset] of Object.entries(PRESETS)) {
        point[key] = results.presets[key].data[i]?.balance ?? 0;
      }
      if (!activePreset) {
        point.custom = results.custom.data[i]?.balance ?? 0;
      }
      data.push(point);
    }
    return data;
  }, [results, simDays, activePreset]);

  // 수입/지출 breakdown (현재 슬라이더 기준)
  const breakdownData = useMemo(() => {
    const b = results.custom.breakdown;
    return [
      { name: '출석', value: b.attendance, type: 'earn' },
      { name: '7일 보너스', value: b.streak, type: 'earn' },
      { name: '첫 글', value: b.firstPost, type: 'earn' },
      { name: '베팅 수익', value: b.bettingWin, type: 'earn' },
      { name: '베팅 손실', value: b.bettingLoss, type: 'spend' },
      { name: '상점', value: b.shop, type: 'spend' },
    ];
  }, [results.custom]);

  const customMetrics = useMemo(() => computeMetrics(results.custom, simDays), [results.custom, simDays]);
  const warnings = useMemo(() => getWarnings(results.presets, simDays), [results.presets, simDays]);

  const warningColors = {
    danger: 'bg-red-900/50 border-red-500 text-red-300',
    warning: 'bg-yellow-900/50 border-yellow-500 text-yellow-300',
    success: 'bg-green-900/50 border-green-500 text-green-300',
    info: 'bg-blue-900/50 border-blue-500 text-blue-300',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-emerald-400">F1 FANS 코인 이코노미 시뮬레이션</h1>
          <p className="text-gray-400 mt-1 text-sm">코드 기반 파라미터로 토큰 이코노미 밸런스를 검증합니다</p>
        </div>

        {/* 현재 설정값 섹션 */}
        <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-3 text-gray-200">현재 적용된 파라미터 (코드 기준)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">일일 출석</div>
              <div className="text-emerald-400 font-bold">+10 FC</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">7일 연속 보너스</div>
              <div className="text-emerald-400 font-bold">+50 FC</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">첫 글 작성</div>
              <div className="text-emerald-400 font-bold">+20 FC</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">초기 지급</div>
              <div className="text-emerald-400 font-bold">0 FC</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">댓글/공감 보상</div>
              <div className="text-red-400 font-bold">미구현</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">퀴즈 보상</div>
              <div className="text-red-400 font-bold">삭제됨</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">베팅 참여 보상</div>
              <div className="text-red-400 font-bold">미구현</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-gray-400">레이스 간격</div>
              <div className="text-blue-400 font-bold">~14일</div>
            </div>
          </div>
        </div>

        {/* 프리셋 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                activePreset === key
                  ? 'ring-2 ring-offset-2 ring-offset-gray-950 ring-emerald-400 bg-gray-700'
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
              style={{ borderLeft: `4px solid ${preset.color}` }}
            >
              {preset.label} 유저
            </button>
          ))}
          <button
            onClick={() => setActivePreset(null)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              activePreset === null
                ? 'ring-2 ring-offset-2 ring-offset-gray-950 ring-emerald-400 bg-gray-700'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
            style={{ borderLeft: '4px solid #a855f7' }}
          >
            커스텀
          </button>
        </div>

        {/* 슬라이더 + 차트 레이아웃 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* 슬라이더 패널 */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-base font-semibold mb-4 text-emerald-400">획득 파라미터</h3>
            <Slider label="일일 접속률" value={sliders.loginRate} onChange={v => updateSlider('loginRate', v)} min={0} max={100} unit="%" />
            <Slider label="레이스당 베팅 횟수" value={sliders.betsPerRace} onChange={v => updateSlider('betsPerRace', v)} min={0} max={5} />
            <Slider label="베팅 적중률" value={sliders.hitRate} onChange={v => updateSlider('hitRate', v)} min={0} max={100} unit="%" />
            <Slider label="평균 베팅액" value={sliders.avgBet} onChange={v => updateSlider('avgBet', v)} min={0} max={1000} step={10} unit=" FC" />
            <Slider label="평균 배당률" value={sliders.avgOdds} onChange={v => updateSlider('avgOdds', v)} min={1.1} max={5.0} step={0.1} unit="x" />
            <Slider label="커뮤니티 활동 강도" value={sliders.communityActivity} onChange={v => updateSlider('communityActivity', v)} min={0} max={100} unit="%" />

            <h3 className="text-base font-semibold mb-4 mt-6 text-orange-400">소비 파라미터</h3>
            <Slider label="상점 구매 빈도 (월)" value={sliders.shopFreq} onChange={v => updateSlider('shopFreq', v)} min={0} max={10} unit="회" />
            <Slider label="평균 구매 금액" value={sliders.avgPurchase} onChange={v => updateSlider('avgPurchase', v)} min={0} max={5000} step={50} unit=" FC" />

            <h3 className="text-base font-semibold mb-4 mt-6 text-blue-400">시뮬레이션 기간</h3>
            <Slider label="기간" value={simDays} onChange={setSimDays} min={1} max={365} unit="일" />
          </div>

          {/* 차트 영역 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 그래프 1: 코인 잔액 추이 */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-base font-semibold mb-4 text-gray-200">코인 잔액 추이 (프리셋 비교)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={balanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="day"
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    label={{ value: '일차', position: 'insideBottomRight', offset: -5, fill: '#6b7280', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'FC', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelFormatter={v => `${v}일차`}
                    formatter={(v, name) => {
                      const labels = { light: '라이트', normal: '일반', heavy: '헤비', whale: '고래', custom: '커스텀' };
                      return [`${v.toLocaleString()} FC`, labels[name] || name];
                    }}
                  />
                  <Legend
                    formatter={v => {
                      const labels = { light: '라이트', normal: '일반', heavy: '헤비', whale: '고래', custom: '커스텀' };
                      return labels[v] || v;
                    }}
                  />
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={preset.color}
                      strokeWidth={activePreset === key ? 3 : 1.5}
                      dot={false}
                      opacity={activePreset && activePreset !== key ? 0.3 : 1}
                    />
                  ))}
                  {!activePreset && (
                    <Line
                      type="monotone"
                      dataKey="custom"
                      stroke="#a855f7"
                      strokeWidth={3}
                      dot={false}
                    />
                  )}
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 그래프 2: 수입/지출 breakdown */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-base font-semibold mb-4 text-gray-200">
                누적 수입/지출 내역
                {activePreset ? ` (${PRESETS[activePreset].label})` : ' (커스텀)'}
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={breakdownData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" stroke="#6b7280" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={v => [`${v.toLocaleString()} FC`]}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fill: '#9ca3af', fontSize: 11, formatter: v => v > 0 ? `${v.toLocaleString()}` : '' }}
                  >
                    {breakdownData.map((entry, index) => (
                      <Cell key={index} fill={entry.type === 'earn' ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 핵심 지표 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-gray-400 text-sm mb-1">월간 순수익</div>
            <div className={`text-2xl font-bold ${customMetrics.monthlyNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {customMetrics.monthlyNet >= 0 ? '+' : ''}{customMetrics.monthlyNet.toLocaleString()} FC
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-gray-400 text-sm mb-1">코인 0 도달일</div>
            <div className="text-2xl font-bold text-white">{customMetrics.zeroDayStr}</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-gray-400 text-sm mb-1">일반 아이템 (200 FC)</div>
            <div className="text-2xl font-bold text-blue-400">{customMetrics.daysForCommonStr}</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
            <div className="text-gray-400 text-sm mb-1">전설 아이템 (2000 FC)</div>
            <div className="text-2xl font-bold text-purple-400">{customMetrics.daysForLegendaryStr}</div>
          </div>
        </div>

        {/* 밸런스 경고 시스템 */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
          <h3 className="text-base font-semibold mb-3 text-gray-200">밸런스 경고 시스템</h3>
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className={`p-3 rounded-lg border text-sm ${warningColors[w.type]}`}>
                {w.msg}
              </div>
            ))}
          </div>
        </div>

        {/* 상세 시뮬레이션 결과 */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-base font-semibold mb-3 text-gray-200">프리셋별 최종 잔액 비교 ({simDays}일 시뮬레이션)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400">프리셋</th>
                  <th className="text-right py-2 px-3 text-gray-400">총 수입</th>
                  <th className="text-right py-2 px-3 text-gray-400">총 지출</th>
                  <th className="text-right py-2 px-3 text-gray-400">최종 잔액</th>
                  <th className="text-right py-2 px-3 text-gray-400">월간 순수익</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PRESETS).map(([key, preset]) => {
                  const r = results.presets[key];
                  const m = computeMetrics(r, simDays);
                  return (
                    <tr key={key} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-2 px-3 font-semibold" style={{ color: preset.color }}>{preset.label}</td>
                      <td className="py-2 px-3 text-right text-emerald-400">{r.totalEarned.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-red-400">{r.totalSpent.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-white font-bold">{r.finalBalance.toLocaleString()}</td>
                      <td className={`py-2 px-3 text-right font-bold ${m.monthlyNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.monthlyNet >= 0 ? '+' : ''}{m.monthlyNet.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center text-gray-600 text-xs mt-8">
          F1 FANS 코인 이코노미 시뮬레이션 | 코드에서 추출한 실제 파라미터 기반 | 확률 기반 시뮬레이션 (실행마다 결과 변동)
        </div>
      </div>
    </div>
  );
}
