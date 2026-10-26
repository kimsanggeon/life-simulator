// 과거 검증: 과거 한 해의 실제 가구 분포에서 출발해 그 뒤 실제 경제를 그대로 재생하고,
// 10년 뒤 시뮬레이션 분포를 그 해의 실제 분포와 비교한다.
import { createRng } from './rng';
import { quantiles } from './quantile';
import { simulatePath } from './simulate';
import type { Allocation, ModelParams, Person } from './types';

export type Cohort = {
  startYear: number;
  endYear: number;
  group: string;
  endGroup: string;
  startAge: number;
  income: { mean: number; median: number }; // 가구 경상소득 (만원/년, 2025년 가격)
  netWorth: { mean: number; median: number };
  leverage: number; // 자산 ÷ 순자산 (평균 기준)
  finShare: number; // 자산 중 금융자산 비중
  /** 자가 가구 비율 (그 해 연령대) */
  ownShare?: number;
  /** 자가 가구 중 서울에 집을 가진 비율 */
  seoulShareOfOwners?: number;
  actualEnd: { mean: number; median: number };
};

export type IncomePoint = { income: number; rate: number };

export type BacktestOpts = {
  savingsRate: number;
  /** 금융자산 중 주식 비중 */
  stockShareOfFin: number;
  runs: number;
  seed: number;
  /**
   * 가구마다 다르게: 소득 분위별 저축률(공식 분위 평균소득 사이를 선형 보간, savingsRate는 배수로 쓰임)과
   * 자가/무주택 구분(순자산 상위 ownShare 가구가 집을 가진다).
   */
  hetero?: {
    savingsByIncome: IncomePoint[];
    /** 소득과 순자산 순위의 상관 (가우스 코퓰라) */
    incomeWealthRho?: number;
    /** 서울 자가 가구 고르는 법: 자가 가구 중 무작위 / 순자산 상위 자가 가구부터. 없으면 서울 구분 안 함 */
    seoul?: 'random' | 'top';
  };
};

/** 분위 평균소득 점들 사이를 선형 보간한 저축률. 양 끝 바깥은 끝값 유지 */
export function savingsAt(points: IncomePoint[], income: number) {
  const p = [...points].sort((a, b) => a.income - b.income);
  if (income <= p[0].income) return p[0].rate;
  for (let i = 1; i < p.length; i++) {
    if (income <= p[i].income) {
      const f = (income - p[i - 1].income) / (p[i].income - p[i - 1].income);
      return p[i - 1].rate + f * (p[i].rate - p[i - 1].rate);
    }
  }
  return p[p.length - 1].rate;
}

export type BacktestResult = {
  cohort: Cohort;
  sim: { p10: number; p50: number; p90: number; mean: number };
  /** (시뮬레이션 − 실제) ÷ 실제 */
  medianError: number;
  meanError: number;
  /** 실제 중간값이 시뮬레이션의 P10~P90 안에 들어오는가 */
  medianInBand: boolean;
};

/** 중앙값·평균으로 로그정규 폭을 정한다 (평균 ≤ 중앙값이면 최소 폭) */
function lognormal(median: number, mean: number) {
  const sigma = Math.sqrt(Math.max(0.01, 2 * Math.log(Math.max(mean / median, 1.005))));
  return (z: number) => median * Math.exp(sigma * z);
}

/** 평균 가구의 자산 구성을 순자산 대비 비중으로 바꾼다. 부채는 예금 금리로 빌린 것으로 본다(단순화). */
export function cohortAllocation(c: Cohort, stockShareOfFin: number) {
  const L = c.leverage;
  const real = (1 - c.finShare) * L;
  const fin = c.finShare * L;
  return { house: real, stock: fin * stockShareOfFin, deposit: fin * (1 - stockShareOfFin) - (L - 1) };
}

export function runBacktest(c: Cohort, params: ModelParams, o: BacktestOpts): BacktestResult {
  const years = c.endYear - c.startYear;
  const incomeAt = lognormal(c.income.median, c.income.mean);
  const nwAt = lognormal(c.netWorth.median, c.netWorth.mean);
  const allocation = cohortAllocation(c, o.stockShareOfFin);
  const draw = createRng(o.seed);
  const finals = new Float64Array(o.runs);

  // 가구를 먼저 모두 뽑아 둔다 (자가 여부를 순자산 순위로 정해야 해서)
  const rho = o.hetero?.incomeWealthRho ?? 0;
  const hh = Array.from({ length: o.runs }, () => {
    const age = c.startAge + Math.floor(draw.next() * 10);
    const zi = draw.normal();
    const zw = rho * zi + Math.sqrt(1 - rho * rho) * draw.normal();
    return { age, income: incomeAt(zi), netWorth: nwAt(zw) };
  });

  // 자가/무주택: 순자산 상위 ownShare가 자가. 코호트 전체의 주택 노출(실물자산 ÷ 순자산)은 그대로 두고
  // 그것을 자가 가구에만 몰아준다. 무주택 가구는 금융자산만 가진다.
  let ownerCut = Infinity;
  let ownerHouse = 0;
  if (o.hetero && c.ownShare) {
    const sorted = hh.map((h) => h.netWorth).sort((a, b) => b - a);
    const nOwn = Math.max(1, Math.round(c.ownShare * o.runs));
    ownerCut = sorted[nOwn - 1];
    const total = sorted.reduce((a, b) => a + b, 0);
    const ownTotal = sorted.slice(0, nOwn).reduce((a, b) => a + b, 0);
    ownerHouse = (allocation.house * total) / ownTotal;
  }

  // 서울 자가: 자가 가구 중 seoulShareOfOwners 비율이 서울 아파트 지수를 따른다
  const seoul = new Uint8Array(o.runs);
  if (o.hetero?.seoul && c.seoulShareOfOwners && ownerCut < Infinity) {
    const owners = hh.map((h, i) => ({ i, nw: h.netWorth })).filter((x) => x.nw >= ownerCut);
    const k = Math.round(owners.length * c.seoulShareOfOwners);
    if (o.hetero.seoul === 'top') owners.sort((a, b) => b.nw - a.nw);
    else {
      const pick = createRng(o.seed * 43 + 7);
      for (let j = owners.length - 1; j > 0; j--) {
        const r = Math.floor(pick.next() * (j + 1));
        [owners[j], owners[r]] = [owners[r], owners[j]];
      }
    }
    for (let j = 0; j < k; j++) seoul[owners[j].i] = 1;
  }

  for (let i = 0; i < o.runs; i++) {
    const h = hh[i];
    let alloc: Allocation = allocation;
    let savingsRate = o.savingsRate;
    if (o.hetero) {
      const isOwner = h.netWorth >= ownerCut;
      const house = isOwner ? ownerHouse : 0;
      alloc = seoul[i]
        ? { house: 0, houseSeoul: house, stock: allocation.stock, deposit: 1 - house - allocation.stock }
        : { house, stock: allocation.stock, deposit: 1 - house - allocation.stock };
      savingsRate = o.savingsRate * savingsAt(o.hetero.savingsByIncome, h.income);
    }
    const person: Person = {
      age: h.age,
      income: h.income,
      netWorth: h.netWorth,
      savingsRate,
      allocation: alloc,
      sex: 'M',
      married: false, // 가구 소득에 배우자 소득이 이미 들어 있어 배우자를 따로 더하지 않는다
      children: 0,
    };
    const out = simulatePath(
      person,
      { id: 'bt', label: '과거 검증', kind: 'stay' },
      params,
      years,
      createRng(o.seed * 31 + i),
      createRng(o.seed * 37 + i + 1),
      createRng(o.seed * 41 + i + 2),
      null,
      false,
      { mode: 'replay', from: c.startYear + 1 },
    );
    finals[i] = out.netWorth[years];
  }

  const [p10, p50, p90] = quantiles(finals, [0.1, 0.5, 0.9]);
  const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
  return {
    cohort: c,
    sim: { p10, p50, p90, mean },
    medianError: (p50 - c.actualEnd.median) / c.actualEnd.median,
    meanError: (mean - c.actualEnd.mean) / c.actualEnd.mean,
    medianInBand: c.actualEnd.median >= p10 && c.actualEnd.median <= p90,
  };
}

/** 저축률 후보 중, fit 코호트들의 중간값 로그오차 제곱합이 가장 작은 값 */
export function fitSavingsRate(cohorts: Cohort[], params: ModelParams, base: Omit<BacktestOpts, 'savingsRate'>, grid: number[]) {
  let best = grid[0];
  let bestLoss = Infinity;
  const losses = grid.map((s) => {
    const loss = cohorts.reduce((acc, c) => {
      const r = runBacktest(c, params, { ...base, savingsRate: s });
      return acc + Math.log(r.sim.p50 / c.actualEnd.median) ** 2;
    }, 0);
    if (loss < bestLoss) {
      bestLoss = loss;
      best = s;
    }
    return { savingsRate: s, loss };
  });
  return { best, losses };
}
