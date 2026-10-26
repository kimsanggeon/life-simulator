import { describe, expect, it } from 'vitest';
import bt from '../data/backtest.json';
import { buildParams } from '../data/params';
import { cohortAllocation, fitSavingsRate, runBacktest, savingsAt, type Cohort } from './backtest';

const cohorts = bt.cohorts as Cohort[];
const params = buildParams(35);
const base = { stockShareOfFin: 0.1, runs: 1500, seed: 3 };
const GRID = [0.05, 0.1, 0.125, 0.15, 0.175, 0.2, 0.25, 0.3];
const fitSet = cohorts.filter((c) => c.startYear <= 2013);
const testSet = cohorts.filter((c) => c.startYear >= 2014);

describe('과거 검증 (2012~2015 → 10년 뒤)', () => {
  it('코호트 8개: 2012~2015 × (30대→40대, 40대→50대)', () => {
    expect(cohorts).toHaveLength(8);
    expect(cohorts.every((c) => c.endYear - c.startYear === 10)).toBe(true);
  });

  it('자산 구성: 순자산 대비 비중의 합 = 1 (부채만큼 예금이 음수)', () => {
    const a = cohortAllocation(cohorts[0], 0.1);
    expect(a.house + a.stock + a.deposit).toBeCloseTo(1, 6);
    expect(a.house).toBeGreaterThan(0.6);
  });

  const fit = fitSavingsRate(fitSet, params, base, GRID);

  it('2012·2013 코호트로 맞춘 저축률이 후보 안쪽에 있다', () => {
    expect(fit.best).toBeGreaterThan(GRID[0]);
    expect(fit.best).toBeLessThan(GRID[GRID.length - 1]);
  });

  it('표본 밖(2014·2015) 중간값 오차 ±20% 이내, 실제 중간값이 P10~P90 안', () => {
    for (const c of testSet) {
      const r = runBacktest(c, params, { ...base, savingsRate: fit.best });
      expect(Math.abs(r.medianError)).toBeLessThan(0.2);
      expect(r.medianInBand).toBe(true);
    }
  });

  it('"아무 변화 없음" 기준선보다 중간값을 훨씬 잘 맞춘다', () => {
    for (const c of testSet) {
      const r = runBacktest(c, params, { ...base, savingsRate: fit.best });
      const naive = Math.abs(c.netWorth.median / c.actualEnd.median - 1);
      expect(Math.abs(r.medianError)).toBeLessThan(naive);
    }
  });
});

describe('가구마다 다른 저축률·자가 여부 (개선 모델)', () => {
  const het = { ...base, hetero: { savingsByIncome: bt.savingsByIncome, incomeWealthRho: bt.incomeWealthRho } };
  const HGRID = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1];

  it('분위별 저축률: 공식 분위 평균소득에서 정확히 그 값, 사이는 보간, 끝 바깥은 끝값', () => {
    const pts = bt.savingsByIncome;
    expect(savingsAt(pts, pts[0].income)).toBeCloseTo(pts[0].rate, 6);
    expect(savingsAt(pts, pts[4].income)).toBeCloseTo(pts[4].rate, 6);
    expect(savingsAt(pts, 100)).toBeCloseTo(pts[0].rate, 6);
    const mid = savingsAt(pts, (pts[1].income + pts[2].income) / 2);
    expect(mid).toBeGreaterThan(Math.min(pts[1].rate, pts[2].rate));
    expect(mid).toBeLessThan(Math.max(pts[1].rate, pts[2].rate));
  });

  it('공식 저축률이 소득이 높을수록 높다 (1분위 < 5분위)', () => {
    expect(bt.savingsByIncome[0].rate).toBeLessThan(bt.savingsByIncome[4].rate);
  });

  const fitH = fitSavingsRate(fitSet, params, het, HGRID);
  const fitOld = fitSavingsRate(fitSet, params, base, GRID);

  it('맞춘 저축 수준이 공식 저축률에 가깝다 (배수 0.6~1.1)', () => {
    expect(fitH.best).toBeGreaterThanOrEqual(0.6);
    expect(fitH.best).toBeLessThanOrEqual(1.1);
  });

  it('표본 밖: 평균 오차가 기존 모델보다 작고, 분포가 더 벌어진다', () => {
    for (const c of testSet) {
      const oldR = runBacktest(c, params, { ...base, savingsRate: fitOld.best });
      const newR = runBacktest(c, params, { ...het, savingsRate: fitH.best });
      expect(Math.abs(newR.meanError)).toBeLessThan(Math.abs(oldR.meanError));
      expect(newR.sim.mean / newR.sim.p50).toBeGreaterThan(oldR.sim.mean / oldR.sim.p50);
      expect(newR.medianInBand).toBe(true);
    }
  });
});

describe('서울 집값 (개선 + 서울)', () => {
  const het = { ...base, hetero: { savingsByIncome: bt.savingsByIncome, incomeWealthRho: bt.incomeWealthRho } };
  const seoul = { ...base, hetero: { ...het.hetero, seoul: 'top' as const } };
  const HGRID = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1];
  const fitH = fitSavingsRate(fitSet, params, het, HGRID);
  const fitS = fitSavingsRate(fitSet, params, seoul, HGRID);

  it('서울 아파트가 2016~2025년에 전국보다 훨씬 많이 올랐다 (실질)', () => {
    const at = (y: number) => params.history!.year.indexOf(y);
    let s = 1;
    let n = 1;
    for (let y = 2016; y <= 2025; y++) {
      s *= 1 + params.history!.houseSeoul![at(y)];
      n *= 1 + params.history!.house[at(y)];
    }
    expect(s - 1).toBeGreaterThan(0.3);
    expect(n - 1).toBeLessThan(0.1);
  });

  it('표본 밖: 서울 집값을 넣으면 평균 오차가 더 줄고 분포가 더 벌어진다, 중간값은 P10~P90 안', () => {
    for (const c of testSet) {
      const a = runBacktest(c, params, { ...het, savingsRate: fitH.best });
      const b = runBacktest(c, params, { ...seoul, savingsRate: fitS.best });
      expect(Math.abs(b.meanError)).toBeLessThan(Math.abs(a.meanError));
      expect(b.sim.mean / b.sim.p50).toBeGreaterThan(a.sim.mean / a.sim.p50);
      expect(b.medianInBand).toBe(true);
    }
  });
});
