import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { percentileFromAnchors, quantiles, valueFromAnchors } from './quantile';
import { economyPath, shareAtLeast, simulateAll, simulateScenario, storyForPath } from './simulate';
import { decomposeLuckChoice } from './decompose';
import type { ModelParams, Person, Scenario } from './types';

const params: ModelParams = {
  incomeGrowthAtAge: () => 0.01,
  incomeShockSd: 0.1,
  returns: {
    deposit: { mean: 0.01, sd: 0.01 },
    stock: { mean: 0.05, sd: 0.2 },
    house: { mean: 0.02, sd: 0.08 },
    usStock: { mean: 0.05, sd: 0.2 },
    gold: { mean: 0.03, sd: 0.15 },
    dollar: { mean: 0.01, sd: 0.1 },
  },
  debtRealRate: 0.04,
  jobChange: { jumpMean: 0.05, jumpSd: 0.1 },
  startup: {
    cumulativeSurvival: [0.65, 0.5, 0.45, 0.4, 0.35],
    initLogMean: 0,
    initLogSd: 0.6,
    yearlyLogSd: 0.3,
    reentryLogPenalty: -0.15,
    exitSelection: 1,
  },
  events: {
    marriageHazard: (age) => (age < 40 ? 0.1 : 0.02),
    birthHazard: (age, _sex, n) => (age < 40 && n < 2 ? 0.15 : 0),
    jobLossHazard: () => 0.05,
    unemployment: { yearsOut: 0.5, benefitRate: 0.6, benefitCapPerYear: 2000, benefitYears: 0.4, reentryLogPenalty: -0.05 },
    marriageCost: 3000,
    childCostAt: (a) => (a < 19 ? 1000 : 0),
    existingChildAge: 3,
    spouse: { ageGap: 2, employedProb: () => 0.6, wage: () => 3000, netWorth: () => 5000 },
    careerBreak: { prob: 0.3, incomeLoss: 0.5, reentryLogPenalty: -0.1 },
  },
};

const person: Person = {
  age: 32,
  income: 4000,
  netWorth: 10000,
  savingsRate: 0.2,
  allocation: { deposit: 0.5, stock: 0.3, house: 0.2 },
  sex: 'F',
  married: false,
  children: 0,
};

const stay: Scenario = { id: 'stay', label: '남기', kind: 'stay' };
const move: Scenario = { id: 'move', label: '이직', kind: 'jobChange' };
const startup: Scenario = { id: 'startup', label: '창업', kind: 'startup', startupCapital: 5000 };

describe('rng', () => {
  it('같은 시드는 같은 수열', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
  it('정규분포 평균 0, 표준편차 1 근처', () => {
    const r = createRng(1);
    const xs = Array.from({ length: 20000 }, () => r.normal());
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
});

describe('quantile', () => {
  it('P10/P50/P90', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i);
    expect(quantiles(xs, [0.1, 0.5, 0.9])).toEqual([10, 50, 90]);
  });
  it('앵커 보간과 역함수', () => {
    const anchors = [
      { p: 0.1, v: 1000 },
      { p: 0.5, v: 3000 },
      { p: 0.9, v: 8000 },
    ];
    expect(percentileFromAnchors(3000, anchors)).toBeCloseTo(0.5);
    expect(percentileFromAnchors(2000, anchors)).toBeCloseTo(0.3);
    expect(valueFromAnchors(0.3, anchors)).toBeCloseTo(2000);
  });
});

describe('simulate', () => {
  const opt = { runs: 1000, years: 15, seed: 7 };

  it('재현성: 같은 시드 → 같은 결과', () => {
    const a = simulateScenario(person, stay, params, opt);
    const b = simulateScenario(person, stay, params, opt);
    expect(a.netWorth[15].p50).toBe(b.netWorth[15].p50);
  });

  it('밴드는 P10 ≤ P50 ≤ P90', () => {
    const r = simulateScenario(person, stay, params, opt);
    for (const b of r.netWorth) {
      expect(b.p10).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p90);
    }
  });

  it('충격이 0이면 폭도 0 (운이 없으면 모두 같은 인생)', () => {
    const det: ModelParams = {
      ...params,
      events: { ...params.events, marriageHazard: () => 0, jobLossHazard: () => 0 },
      incomeShockSd: 0,
      returns: {
        deposit: { mean: 0.01, sd: 0 },
        stock: { mean: 0.05, sd: 0 },
        house: { mean: 0.02, sd: 0 },
        usStock: { mean: 0.05, sd: 0 },
        gold: { mean: 0.03, sd: 0 },
        dollar: { mean: 0.01, sd: 0 },
      },
    };
    const r = simulateScenario(person, stay, det, opt);
    const last = r.netWorth[15];
    expect(last.p90 - last.p10).toBeCloseTo(0, 6);
  });

  it('창업은 남기보다 결과 폭이 넓고, 생존율이 누적 생존율 근처', () => {
    const [s, st] = simulateAll(person, [stay, startup], params, { ...opt, years: 5 });
    const w = (b: { p10: number; p90: number }) => b.p90 - b.p10;
    expect(w(st.netWorth[5])).toBeGreaterThan(w(s.netWorth[5]));
    expect(st.startupAliveShare!).toBeGreaterThan(0.3);
    expect(st.startupAliveShare!).toBeLessThan(0.4);
  });
});

describe('운/선택 분해', () => {
  it('비율 합 = 1, 같은 시나리오끼리는 선택 효과 0', () => {
    const opt = { runs: 1000, years: 15, seed: 3 };
    const d = decomposeLuckChoice(simulateAll(person, [stay, stay], params, opt));
    expect(d.choiceShare + d.luckShare).toBeCloseTo(1);
    expect(d.choiceShare).toBeCloseTo(0, 6);
    expect(d.perScenario[1].medianShift).toBeCloseTo(0, 6);
  });

  it('이직(+5% 점프)은 중간값을 위로 이동', () => {
    const opt = { runs: 1000, years: 15, seed: 3 };
    const d = decomposeLuckChoice(simulateAll(person, [stay, move], params, opt));
    expect(d.perScenario[1].medianShift).toBeGreaterThan(0);
    expect(d.perScenario[1].betterThanBaseShare).toBeGreaterThan(0.5);
  });
});

describe('인생 사건', () => {
  const opt = { runs: 2000, years: 10, seed: 5 };

  it('누적 결혼 비율 = 1 − (1 − h)^t', () => {
    const r = simulateScenario(person, stay, params, opt);
    expect(r.events!.married[0]).toBe(0);
    expect(Math.abs(r.events!.married[5] - (1 - 0.9 ** 5))).toBeLessThan(0.03);
    expect(Math.abs(r.events!.jobLoss[10] - (1 - 0.95 ** 10))).toBeLessThan(0.03);
  });

  it('사건 끄기: 결과에 사건 기록이 없고, 순자산은 사건이 있을 때보다 높다(지출 없음)', () => {
    const on = simulateScenario(person, stay, params, opt);
    const off = simulateScenario(person, stay, params, { ...opt, events: false });
    expect(off.events).toBeUndefined();
    expect(off.netWorth[10].p50).toBeGreaterThan(on.netWorth[10].p50);
  });

  it('사건은 운: 시나리오가 달라도 같은 경로는 같은 시점에 결혼·실직한다', () => {
    const a = simulateScenario(person, stay, params, opt);
    const b = simulateScenario(person, move, params, opt);
    expect(b.events!.married).toEqual(a.events!.married);
    expect(b.events!.jobLoss).toEqual(a.events!.jobLoss);
  });

  it('실직을 겪은 경로의 순자산 중간값이 더 낮다', () => {
    const r = simulateScenario(person, stay, params, opt);
    expect(r.eventSplit!.jobLoss.withP50).toBeLessThan(r.eventSplit!.jobLoss.withoutP50);
  });

  it('이미 기혼이면 결혼 비율은 처음부터 100%', () => {
    const r = simulateScenario({ ...person, married: true }, stay, params, opt);
    expect(r.events!.married.every((x) => x === 1)).toBe(true);
  });
});

describe('배우자', () => {
  const opt = { runs: 2000, years: 10, seed: 8 };
  const noSpouse: ModelParams = { ...params, events: { ...params.events, spouse: { ...params.events.spouse, employedProb: () => 0, netWorth: () => 0 } } };

  it('맞벌이 비율 ≈ 결혼 비율 × 배우자 취업 확률(0.6)', () => {
    const r = simulateScenario(person, stay, params, opt);
    const ev = r.events!;
    expect(Math.abs(ev.dualIncome[10] - ev.married[10] * 0.6)).toBeLessThan(0.03);
  });

  it('배우자 소득·자산이 들어오면 결혼한 경로의 순자산이 올라간다', () => {
    const a = simulateScenario(person, stay, params, opt);
    const b = simulateScenario(person, stay, noSpouse, opt);
    expect(a.netWorth[10].p50).toBeGreaterThan(b.netWorth[10].p50);
  });

  it('이미 기혼이면 사건을 꺼도 배우자 소득은 남는다', () => {
    const m = { ...person, married: true };
    const off = simulateScenario(m, stay, params, { ...opt, events: false });
    const offNoSp = simulateScenario(m, stay, noSpouse, { ...opt, events: false });
    expect(off.netWorth[10].p50).toBeGreaterThan(offNoSp.netWorth[10].p50);
  });
});

describe('경제 상황 재생 (historical bootstrap)', () => {
  // 가짜 과거 10년: 4번째 해(index 3)만 폭락
  const H = {
    year: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009],
    deposit: Array(10).fill(0.01),
    stock: [0.1, 0.1, 0.1, -0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    house: Array(10).fill(0.02),
    jobLossMult: [1, 1, 1, 3, 1, 1, 1, 1, 1, 1],
    blockLen: 4,
  };
  const hp: ModelParams = { ...params, history: H };
  const opt = { runs: 1000, years: 10, seed: 4 };

  it('replay: 지정한 해부터 순서대로, 끝나면 처음으로', () => {
    const idx = economyPath(H, { mode: 'replay', from: 2008 }, 4, createRng(1));
    expect([...idx]).toEqual([8, 9, 0, 1]);
  });

  it('블록 부트스트랩: blockLen년씩 연속된 연도', () => {
    const idx = economyPath(H, { mode: 'history' }, 8, createRng(2));
    expect((idx[1] - idx[0] + 10) % 10).toBe(1);
    expect((idx[3] - idx[2] + 10) % 10).toBe(1);
  });

  it('같은 경로는 시나리오가 달라도 같은 경제를 겪는다 (badYears 계산이 공통 연도 기준)', () => {
    const [a, b] = simulateAll(person, [stay, move], hp, opt);
    expect(a.badYears).toBeDefined();
    expect(b.badYears!.length).toBe(10);
  });

  it('폭락한 해(2003)가 가장 나쁜 10% 인생에 가장 자주 끼어 있다', () => {
    const r = simulateScenario({ ...person, allocation: { deposit: 0, stock: 1, house: 0 } }, stay, hp, opt);
    expect(r.badYears![0].year).toBe(2003);
    expect(r.badYears![0].lift).toBeGreaterThan(1.2);
  });

  it('2003년부터 재생하면 첫해에 폭락을 맞는다', () => {
    const r = simulateScenario({ ...person, allocation: { deposit: 0, stock: 1, house: 0 } }, stay, hp, { ...opt, economy: { mode: 'replay', from: 2003 } });
    expect(r.netWorth[1].p50).toBeLessThan(person.netWorth);
  });

  it('위기 해엔 실직 확률이 배수만큼 커진다', () => {
    const calm = simulateScenario(person, stay, hp, { ...opt, years: 1, economy: { mode: 'replay', from: 2004 } });
    const crisis = simulateScenario(person, stay, hp, { ...opt, years: 1, economy: { mode: 'replay', from: 2003 } });
    expect(crisis.events!.jobLoss[1]).toBeGreaterThan(calm.events!.jobLoss[1] * 2);
  });
});

describe('이야기용 대표 인생', () => {
  const opt = { runs: 1000, years: 15, seed: 12 };
  it('세 명의 나: 순자산이 P10 < P50 < P90 순, 마지막 값이 전체 분포의 해당 분위와 같다', () => {
    const r = simulateScenario(person, stay, params, opt);
    const [bad, mid, good] = r.stories!;
    const last = (s: { netWorth: number[] }) => s.netWorth[s.netWorth.length - 1];
    expect(last(bad)).toBeLessThan(last(mid));
    expect(last(mid)).toBeLessThan(last(good));
    expect(last(mid)).toBeCloseTo(r.netWorth[15].p50, -2);
  });
  it('사건 기록: 다시 돌린 경로의 결혼 시점이 나이 순서대로 남는다', () => {
    const r = simulateScenario(person, stay, params, opt);
    for (const s of r.stories!) {
      const ages = s.events.map((e) => e.age);
      expect([...ages].sort((a, b) => a - b)).toEqual(ages);
      expect(s.events.filter((e) => e.kind === 'marriage').length).toBeLessThanOrEqual(1);
    }
  });
  it('100명의 나: 낮은 순으로 100개', () => {
    const r = simulateScenario(person, stay, params, opt);
    expect(r.hundred).toHaveLength(100);
    for (let k = 1; k < 100; k++) expect(r.hundred![k]).toBeGreaterThanOrEqual(r.hundred![k - 1]);
  });
});

describe('목표 확률·한 번 더 살아보기', () => {
  const opt = { runs: 1000, years: 15, seed: 21 };
  it('storyForPath(i)는 1,000개 중 i번째 인생과 같은 결과', () => {
    const r = simulateScenario(person, stay, params, opt);
    for (const i of [0, 137, 999]) {
      const s = storyForPath(person, stay, params, opt, i);
      expect(s.netWorth[15]).toBeCloseTo(r.finalNetWorth[i], 6);
    }
  });
  it('shareAtLeast: 분위 요약으로 계산한 비율이 실제 비율과 1%p 안', () => {
    const r = simulateScenario(person, stay, params, opt);
    const q = r.nwQuantiles![15];
    for (const x of [r.netWorth[15].p10, r.netWorth[15].p50, r.netWorth[15].p90]) {
      const actual = Array.from(r.finalNetWorth).filter((v) => v >= x).length / 1000;
      expect(Math.abs(shareAtLeast(q, x) - actual)).toBeLessThan(0.01);
    }
    expect(shareAtLeast(q, -1e9)).toBe(1);
    expect(shareAtLeast(q, 1e12)).toBe(0);
  });
});

describe('투자 대상 넓히기 (미국 주식·금·달러)', () => {
  // 가짜 과거 4년: 2년째에 국내 주식 폭락, 그 해 달러는 급등
  const H = {
    year: [2000, 2001, 2002, 2003],
    deposit: [0, 0, 0, 0],
    stock: [0.1, -0.5, 0.1, 0.1],
    house: [0, 0, 0, 0],
    usStock: [0.1, 0.1, 0.1, 0.1],
    gold: [0, 0.3, 0, 0],
    dollar: [0, 0.5, 0, 0],
    jobLossMult: [1, 1, 1, 1],
    blockLen: 4,
  };
  const quiet: ModelParams = { ...params, incomeShockSd: 0, events: { ...params.events, marriageHazard: () => 0, jobLossHazard: () => 0 }, history: H };
  const p0 = { ...person, savingsRate: 0, income: 1 };
  const replay = { runs: 50, years: 4, seed: 1, events: false, economy: { mode: 'replay' as const, from: 2000 } };

  it('달러 100%: 2001년 +50%가 그대로 반영', () => {
    const r = simulateScenario({ ...p0, allocation: { deposit: 0, stock: 0, house: 0, dollar: 1 } }, stay, quiet, replay);
    expect(r.netWorth[2].p50 / r.netWorth[1].p50).toBeCloseTo(1.5, 2);
  });

  it('가장 나빴던 해: 국내 주식만이면 −50%, 주식 반 + 달러 반이면 0%까지 줄어듦', () => {
    const k = simulateScenario({ ...p0, allocation: { deposit: 0, stock: 1, house: 0 } }, stay, quiet, replay);
    const mix = simulateScenario({ ...p0, allocation: { deposit: 0, stock: 0.5, house: 0, dollar: 0.5 } }, stay, quiet, replay);
    expect(k.worstYear!.p50).toBeCloseTo(-0.5, 6);
    expect(mix.worstYear!.p50).toBeCloseTo(0, 6);
  });

  it('미국 주식·금 비중도 계산에 들어간다', () => {
    const r = simulateScenario({ ...p0, allocation: { deposit: 0, stock: 0, house: 0, usStock: 0.5, gold: 0.5 } }, stay, quiet, replay);
    expect(r.netWorth[4].p50 / r.netWorth[0].p50).toBeCloseTo(1.05 * 1.2 * 1.05 * 1.05, 4);
  });
});
