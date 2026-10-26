import { describe, expect, it } from 'vitest';
import { allStats, buildParams, derived, history, incomePercentile, netWorthPercentile } from './params';

describe('stats.json', () => {
  it('모든 항목에 출처·기준연도·상태가 있다', () => {
    for (const s of allStats) {
      expect(s.source, s.key).toBeTruthy();
      expect(s.year, s.key).toBeGreaterThan(2000);
      expect(['VERIFIED', 'DERIVED', 'ASSUMPTION', 'TODO_VERIFY']).toContain(s.status);
      if (s.status === 'VERIFIED') expect(s.url, s.key).toMatch(/^https:/);
    }
  });
});

describe('파생값이 원 통계와 맞는다', () => {
  it('공식 분위 경계값 + 1·5분위 평균 → 전체 평균 4억7,144만원 재현 (±1%)', () => {
    const mean = derived.nwMeanOverMedian(1) * derived.nwQAll[4];
    expect(Math.abs(mean / 47144 - 1)).toBeLessThan(0.01);
  });
  it('전체 분위 경계값으로 3억 미만 57%, 10억 이상 11.8% 재현 (±1.5%p)', async () => {
    const { percentileFromAnchors } = await import('../engine/quantile');
    const anchors = derived.nwQAll.map((v, i) => ({ p: (i + 1) / 10, v }));
    expect(Math.abs(percentileFromAnchors(30000, anchors) - 0.57)).toBeLessThan(0.015);
    // 10억은 P90(11억) 아래라 구간 보간
    expect(Math.abs(1 - percentileFromAnchors(100000, anchors) - 0.118)).toBeLessThan(0.015);
  });
  it.each([
    [27, 5000, 10796],
    [35, 15585, 25060],
    [45, 28384, 48389],
    [55, 31685, 55161],
    [65, 25000, 53591],
  ])('%i세 연령대: 중앙값·평균이 공식값과 일치', (age, median, mean) => {
    const g = age <= 29 ? 'age29' : age <= 39 ? 'age30' : age <= 49 ? 'age40' : age <= 59 ? 'age50' : 'age60';
    const s = derived.nwShape(g);
    expect(s.median).toBe(median);
    expect(netWorthPercentile(age, median).p).toBeCloseTo(0.5, 6);
    expect(Math.abs((derived.nwMeanOverMedian(s.k) * median) / mean - 1)).toBeLessThan(0.001);
  });
  it('창업 생존율 1년 63.9%, 5년 36.5%', () => {
    const s = derived.startupSurvival();
    expect(s[0]).toBeCloseTo(0.639, 3);
    expect(s[4]).toBeCloseTo(0.365, 3);
  });
  it('30대 이직: 임금이 오를 확률 = 61.4%', () => {
    const { jumpMean, jumpSd } = derived.jobChangeFor(35);
    // P(N(mean, sd) > 0) = Φ(mean/sd)
    expect(jumpMean / jumpSd).toBeCloseTo(0.29, 2);
  });
  it.each([
    [22, 210],
    [27, 284],
    [32, 333],
    [37, 372],
    [42, 389],
    [47, 368],
    [52, 324],
    [57, 287],
    [62, 230],
    [67, 200],
  ])('%i세: 연령대 공식 중위 보수(월 %i만원)가 정확히 상위 50%', (age, median) => {
    expect(incomePercentile(age, median * 12).p).toBeCloseTo(0.5, 6);
  });
  it('30~34세: 월 350만원 미만 비중 54.8%, 450만원 미만 75.7% 재현', () => {
    expect(incomePercentile(32, 350 * 12).p).toBeCloseTo(0.548, 3);
    expect(incomePercentile(32, 450 * 12).p).toBeCloseTo(0.757, 3);
  });
  it('연봉 앵커는 p·값 모두 단조 증가', () => {
    for (const g of ['age20', 'age25', 'age30', 'age35', 'age40', 'age45', 'age50', 'age55', 'age60', 'age65']) {
      const a = derived.wageAnchors(g);
      for (let i = 1; i < a.length; i++) {
        expect(a[i].p).toBeGreaterThan(a[i - 1].p);
        expect(a[i].v).toBeGreaterThan(a[i - 1].v);
      }
    }
  });
  it('또래 위치는 단조 증가', () => {
    expect(incomePercentile(35, 6000).p).toBeGreaterThan(incomePercentile(35, 3000).p);
    expect(netWorthPercentile(45, 50000).p).toBeGreaterThan(netWorthPercentile(45, 10000).p);
  });
  it('파라미터 생성', () => {
    const p = buildParams(35);
    expect(p.startup.cumulativeSurvival).toHaveLength(5);
    expect(p.returns.deposit.mean).toBeCloseTo(0.015, 3);
  });
});

describe('실제 파라미터로 돌린 창업 생존율이 공식 통계 근처', () => {
  it('1년 63.9%, 5년 36.5% (±5%p)', async () => {
    const { simulateScenario } = await import('../engine/simulate');
    const person = { age: 35, income: 4800, netWorth: 15000, savingsRate: 0.2, allocation: { deposit: 1, stock: 0, house: 0 }, sex: 'M' as const, married: false, children: 0 };
    const s = { id: 's', label: '창업', kind: 'startup' as const, startupCapital: 5000 };
    const p = buildParams(35);
    const run = (years: number) => simulateScenario(person, s, p, { runs: 4000, years, seed: 11 }).startupAliveShare!;
    expect(Math.abs(run(1) - 0.639)).toBeLessThan(0.05);
    expect(Math.abs(run(5) - 0.365)).toBeLessThan(0.05);
  });
});

describe('인생 사건 확률이 공식 통계에서 나온다', () => {
  it('초혼 확률 = 초혼 건수 ÷ 미혼 인구 (남 30~34세 96,898 ÷ 1,348,815)', () => {
    expect(derived.marriageH.M[2]).toBeCloseTo(96898 / 1348815, 6);
    expect(derived.marriageH.F[2]).toBeCloseTo(91322 / 948486, 6);
  });
  it('기혼 여성 출산 확률이 공식 유배우 출산율(203·177·76‰)과 6% 이내', () => {
    const official = [0.2031, 0.1772, 0.076];
    official.forEach((o, k) => expect(Math.abs(derived.birthH[k + 1] / o - 1)).toBeLessThan(0.06));
  });
  it('실직 확률 약 6.9%/년', () => {
    expect(derived.jobLossRate).toBeCloseTo(0.0687, 3);
  });
  it('양육비: 영유아 연 약 827만원(2025년 물가) 중 저축에서 빠지는 절반, 23세 이후 0', () => {
    expect(Math.round(derived.childCostAt(3))).toBe(Math.round(60.6 * 12 * 1.051 * 1.036 * 1.023 * 1.021 * 0.5));
    expect(derived.childCostAt(23)).toBe(0);
  });
  it('20세 여성 가상 집단(20~49세): 출생아 순위 비중이 공식(62.4·31.1·6.4%)과 비슷', async () => {
    const { createRng } = await import('../engine/rng');
    const E = buildParams(30).events;
    const rng = createRng(9);
    const byOrder = [0, 0, 0];
    for (let i = 0; i < 20000; i++) {
      let married = false;
      let kids = 0;
      for (let age = 20; age < 50; age++) {
        if (!married && rng.next() < E.marriageHazard(age, 'F')) married = true;
        else if (married && rng.next() < E.birthHazard(age, 'F', kids)) byOrder[Math.min(kids++, 2)]++;
      }
    }
    const tot = byOrder[0] + byOrder[1] + byOrder[2];
    expect(Math.abs(byOrder[0] / tot - 0.624)).toBeLessThan(0.07);
    expect(Math.abs(byOrder[2] / tot - 0.064)).toBeLessThan(0.03);
  });
});

describe('배우자 값이 공식 통계에서 나온다', () => {
  it.each([
    [32, 'F', 306],
    [37, 'F', 311],
    [47, 'F', 266],
    [34, 'M', 353],
    [42, 'M', 461],
  ] as const)('%i세 %s: 중위(q=0.5) 연봉 = 공식 성·연령 중위 보수 월 %i만원 × 12', (age, sex, med) => {
    expect(derived.spouseWage(age, sex, 0.5)).toBeCloseTo(med * 12, 6);
  });
  it('배우자 임금은 q에 따라 증가', () => {
    expect(derived.spouseWage(35, 'F', 0.9)).toBeGreaterThan(derived.spouseWage(35, 'F', 0.5));
    expect(derived.spouseWage(35, 'F', 0.01)).toBeGreaterThanOrEqual(0);
  });
  it('맞벌이 비율: 30대 63.3%, 60세 이상 32.2%', () => {
    expect(derived.spouseEmployedProb(35)).toBeCloseTo(0.633, 6);
    expect(derived.spouseEmployedProb(62)).toBeCloseTo(0.322, 6);
  });
  it('배우자 순자산 중위 = 그 나이대 가구 중앙값 × (1인 가구 7,400 ÷ 전체 23,860)', () => {
    expect(derived.singleRatio).toBeCloseTo(7400 / 23860, 6);
    expect(derived.spouseNetWorth(33, 0.5)).toBeCloseTo(15585 * (7400 / 23860), 3);
  });
});

describe('과거 경제 (ECOS 1996~2025)', () => {
  const at = (y: number) => history.year.indexOf(y);
  it('30개 연도, 1996~2025', () => {
    expect(history.year).toHaveLength(30);
    expect(history.year[0]).toBe(1996);
    expect(history.year[29]).toBe(2025);
  });
  it('위기 연도가 실제 값으로 들어 있다', () => {
    expect(history.house[at(1998)]).toBeCloseTo(-0.196, 3); // KB 아파트 1998 실질
    expect(history.stock[at(2008)]).toBeCloseTo(-0.409, 3); // KOSPI 2008 실질(배당 포함)
    expect(history.stock[at(1997)]).toBeLessThan(-0.4);
  });
  it('실직 배수: 2025 = 1, 1998 ≈ 2.5배 (실업률 6.95 ÷ 2.79)', () => {
    expect(history.jobLossMult[at(2025)]).toBeCloseTo(1, 6);
    expect(history.jobLossMult[at(1998)]).toBeCloseTo(6.95 / 2.792, 3);
  });
});
