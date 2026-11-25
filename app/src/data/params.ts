// stats.json(출처 메타데이터 포함) → 엔진 파라미터.
// 숫자는 여기서 새로 만들지 않는다. 모든 값은 stats.json 항목에서 읽거나 그 항목들로 계산한다.
import raw from './stats.json';
import historyRaw from './history.json';
import { percentileFromAnchors, valueFromAnchors } from '../engine/quantile';
import type { EventParams, History, ModelParams, Sex } from '../engine/types';

export type Stat = {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  source: string;
  year: number;
  url: string;
  status: 'VERIFIED' | 'DERIVED' | 'ASSUMPTION' | 'TODO_VERIFY';
  note?: string;
};

export const allStats = raw as Stat[];
const byKey = new Map(allStats.map((s) => [s.key, s]));
export const statByKey = (k: string) => byKey.get(k);

function num(key: string): number {
  const s = byKey.get(key);
  if (!s || typeof s.value !== 'number') throw new Error(`stat ${key} missing or not a number`);
  return s.value;
}
/** "4.1·6.0" 또는 "5, 22" 형식 */
function list(key: string): number[] {
  const s = byKey.get(key);
  if (!s) throw new Error(`stat ${key} missing`);
  return String(s.value)
    .split(/[·,]/)
    .map((x) => Number(x.trim().replace('−', '-')));
}

// ── 표준정규 ──
function normCdf(z: number) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function normInv(p: number) {
  // 이분법 (정밀도 충분, 호출 횟수 적음)
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (normCdf(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ── 연봉 분포 (KOSIS 연령대별 소득: 5세 단위 구간 비중·중위값을 그대로 분위 앵커로 쓴다) ──
const WAGE_GROUPS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65]; // 각 5세 구간의 시작 나이
const wageGroup = (age: number) => `age${WAGE_GROUPS.filter((g) => age >= g).pop() ?? 20}`;
const BAND_EDGES = [85, 150, 250, 350, 450, 550, 650, 800, 1000]; // 만원/월

/** 구간 경계의 누적 비중 + 중위값(p=0.5)을 합친 연봉 분위 앵커 (만원/년) */
function wageAnchors(group: string) {
  const shares = list(`wage.band.${group}`);
  let cum = 0;
  const anchors = BAND_EDGES.map((e, i) => {
    cum += shares[i] / 100;
    return { p: cum, v: e * 12 };
  });
  anchors.push({ p: 0.5, v: num(`wage.median.${group}`) * 12 });
  // 반올림된 비중 때문에 같은 p가 생기면(예: 0.0% 구간) 뒤엣것을 버린다
  return anchors
    .sort((x, y) => x.p - y.p)
    .filter((x, i, arr) => i === 0 || (x.p > arr[i - 1].p + 1e-9 && x.v > arr[i - 1].v));
}

export function incomePercentile(age: number, annualIncome: number) {
  const g = wageGroup(age);
  return {
    p: percentileFromAnchors(annualIncome, wageAnchors(g)),
    keys: [`wage.band.${g}`, `wage.median.${g}`],
  };
}

// 연령별 소득 곡선: 5세 구간 중위값을 구간 가운데 나이에 찍고 잇는다
const wageCenters = WAGE_GROUPS.map((g) => ({ a: g + 2, logMid: Math.log(num(`wage.median.age${g}`)) }));

// ── 순자산 분포 ──
// 공식 전체 분위 경계값(P10~P90) 모양을 연령대마다 '중앙값에 맞춰 옮기고, 평균이 맞도록 폭을 조정'한다.
//   q_age(p) = 중앙값_age × (q_all(p) / 중앙값_all)^k_age
// 하위 10%·상위 10% 구간 평균은 공식 1·5분위 평균에서 역산. P90 위는 그 평균을 갖는 파레토 꼬리.
const NW_P = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const nwQAll = list('nw.quantiles.all');
const nwMedAll = nwQAll[4];
const nwRatio = nwQAll.map((q) => q / nwMedAll);
// 1분위 평균 × 0.2 = (하위 10% 평균 × 0.1) + (P10~P20 사다리꼴)
const nwBottomRatio = (0.2 * num('nw.quintile_mean.q1') - 0.05 * (nwQAll[0] + nwQAll[1])) / 0.1 / nwMedAll;
const nwTopRatio = (0.2 * num('nw.quintile_mean.q5') - 0.05 * (nwQAll[7] + nwQAll[8])) / 0.1 / nwMedAll;

/** 폭 지수 k일 때 (평균 / 중앙값) */
function nwMeanOverMedian(k: number) {
  let s = 0.1 * nwBottomRatio + 0.1 * nwTopRatio ** k;
  for (let i = 0; i < 8; i++) s += 0.05 * (nwRatio[i] ** k + nwRatio[i + 1] ** k);
  return s;
}

const NW_AGE_GROUPS: [number, string][] = [
  [29, 'age29'],
  [39, 'age30'],
  [49, 'age40'],
  [59, 'age50'],
  [Infinity, 'age60'],
];
const nwGroup = (age: number) => NW_AGE_GROUPS.find(([hi]) => age <= hi)![1];

type NwShape = { median: number; k: number; anchors: { p: number; v: number }[]; alpha: number };
const nwShapes = new Map<string, NwShape>();
function nwShape(group: string): NwShape {
  const hit = nwShapes.get(group);
  if (hit) return hit;
  const median = num(`nw.median.${group}`);
  const target = num(`nw.mean.${group}`) / median;
  let lo = 0.2;
  let hi = 2.5;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (nwMeanOverMedian(m) < target) lo = m;
    else hi = m;
  }
  const k = (lo + hi) / 2;
  const anchors = NW_P.map((p, i) => ({ p, v: median * nwRatio[i] ** k }));
  const t = nwTopRatio ** k / nwRatio[8] ** k; // 상위 10% 평균 / P90
  const shape = { median, k, anchors, alpha: t / (t - 1) };
  nwShapes.set(group, shape);
  return shape;
}

/** netWorthPercentile의 역: 그 나이 가구 중 p분위(0~1)에 해당하는 순자산 (만원) */
export function netWorthAtPercentile(age: number, p: number) {
  const { anchors, alpha } = nwShape(nwGroup(age));
  const p90 = anchors[8].v;
  if (p > 0.9) return p90 * (0.1 / (1 - Math.min(p, 0.995))) ** (1 / alpha);
  return valueFromAnchors(Math.max(p, 0.1), anchors);
}

export function netWorthPercentile(age: number, netWorth: number) {
  const g = nwGroup(age);
  const { anchors, alpha } = nwShape(g);
  const p90 = anchors[8].v;
  const p = netWorth > p90 ? 1 - 0.1 * (netWorth / p90) ** -alpha : percentileFromAnchors(netWorth, anchors);
  return {
    p: Math.min(0.99, Math.max(0.01, p)),
    keys: ['nw.quantiles.all', `nw.median.${g}`, `nw.mean.${g}`, 'nw.age_shape'],
  };
}

// ── 연령별 소득 성장 (5세 구간 중위값을 이은 곡선의 기울기 + 경제 전체 실질 임금 증가) ──
const realWageGrowth = num('wage.growth.real') / 100;
function incomeGrowthAtAge(age: number) {
  const c = wageCenters;
  let i = 0;
  while (i < c.length - 2 && age >= c[i + 1].a) i++;
  return (c[i + 1].logMid - c[i].logMid) / (c[i + 1].a - c[i].a) + realWageGrowth;
}

// ── 창업 생존율: 1년·5년 공식값, 그 사이는 같은 비율로 감소한다고 보간 ──
function startupSurvival(): number[] {
  const y1 = num('startup.survival.y1') / 100;
  const y5 = num('startup.survival.y5') / 100;
  const q = (y5 / y1) ** (1 / 4);
  return [0, 1, 2, 3, 4].map((k) => y1 * q ** k);
}

// ── 이직: '임금 오른 비율'이 맞도록 평균을 역산 ──
function jobChangeFor(age: number) {
  const shares = list('move.wage_up_share').map((x) => x / 100);
  const idx = age < 30 ? 0 : age < 40 ? 1 : age < 50 ? 2 : age < 60 ? 3 : 4;
  const sd = num('move.jump_sd');
  return { jumpMean: sd * normInv(shares[idx]), jumpSd: sd };
}

// ── 인생 사건 (연령·성별 hazard) ──
// 5세 구간 [20, 25, …, 55]. 구간 밖은 0.
const EV_AGES = [20, 25, 30, 35, 40, 45, 50, 55];
const evIdx = (age: number) => (age < 20 || age >= 60 ? -1 : Math.floor((age - 20) / 5));

const marriageH = (['M', 'F'] as const).reduce(
  (acc, sx) => {
    const fm = list(`ev.firstmarriage.${sx}`);
    const nm = list(`ev.pop.nevermarried.${sx}`);
    acc[sx] = EV_AGES.map((_, i) => fm[i] / nm[i]);
    return acc;
  },
  {} as Record<Sex, number[]>,
);

const inWedlock = 1 - num('ev.births.outside_share') / 100;
const birthsByAge = list('ev.births.byage'); // 20~24 … 45~49
const marriedF = list('ev.pop.married.F');
const birthH = EV_AGES.map((_, i) => (i < birthsByAge.length ? (birthsByAge[i] * inWedlock) / marriedF[i] : 0));
const [meanAgeM, meanAgeF] = list('ev.firstmarriage.meanage');
const spouseGap = meanAgeM - meanAgeF; // 남성의 배우자 나이 = 본인 − 2.3

const cpi2022_2025 = [5.1, 3.6, 2.3, 2.1].reduce((f, x) => f * (1 + x / 100), 1);
const childMonthly = list('ev.childcost.monthly').map((x) => x * cpi2022_2025);
// 양육비 중 다른 지출을 줄여 메우는 몫은 저축에서 빠지지 않는다
const childExtraShare = 1 - num('ev.childcost.offset') / 100;
function childCostAt(a: number) {
  const m = a <= 6 ? childMonthly[0] : a <= 12 ? childMonthly[1] : a <= 18 ? childMonthly[2] : a <= 22 ? childMonthly[3] : 0;
  return m * 12 * childExtraShare;
}

const jobLossRate = (num('ub.claims.monthly') * 12) / num('ub.insured');

// ── 배우자 ──
// 임금: 해당 연령 구간의 공식 구간분포 모양을 성별 중위값 비율로 옮긴 뒤 q분위 값을 읽는다.
function spouseWage(age: number, sex: Sex, q: number) {
  const g = wageGroup(Math.max(20, Math.min(69, age)));
  const [, medSex] = list(`wage.sexage.${sex}.${g}`);
  const scale = medSex / num(`wage.median.${g}`);
  const qq = Math.min(0.99, Math.max(0.01, q));
  return Math.max(0, valueFromAnchors(qq, wageAnchors(g)) * scale);
}
// 맞벌이 비율: 가구주 연령대별 (15~29·30대·40대·50대·60+)
const dualRates = list('ev.dual_income.byage').map((x) => x / 100);
function spouseEmployedProb(age: number) {
  return dualRates[age < 30 ? 0 : age < 40 ? 1 : age < 50 ? 2 : age < 60 ? 3 : 4];
}
// 자산: 배우자 나이대 가구 순자산 분포 × (1인 가구 중앙값 ÷ 전체 중앙값)
const singleRatio = num('nw.median.single') / nwMedAll;
function spouseNetWorth(age: number, q: number) {
  const { anchors, alpha } = nwShape(nwGroup(age));
  const qq = Math.min(0.995, Math.max(0.01, q));
  const p90 = anchors[8].v;
  const v = qq > 0.9 ? p90 * (0.1 / (1 - qq)) ** (1 / alpha) : valueFromAnchors(qq, anchors);
  return v * singleRatio;
}

function eventParams(): EventParams {
  const [breakLoss, breakReentry] = list('ev.careerbreak.effect').map((x) => x / 100);
  return {
    marriageHazard: (age, sex) => {
      const i = evIdx(age);
      return i < 0 ? 0 : marriageH[sex][i];
    },
    birthHazard: (age, sex, children) => {
      const i = evIdx(sex === 'F' ? age : age - spouseGap);
      if (i < 0) return 0;
      return birthH[i] * (children >= 2 ? num('ev.birth.parity_mult') : 1);
    },
    jobLossHazard: () => jobLossRate,
    unemployment: {
      yearsOut: num('ev.jobloss.months_out') / 12,
      benefitRate: num('ub.rate') / 100,
      benefitCapPerYear: (num('ub.cap.daily') * 365) / 10000,
      benefitYears: num('ub.days') / 365,
      reentryLogPenalty: Math.log(1 - num('startup.reentry_penalty') / 100),
    },
    marriageCost: num('ev.wedding_cost'),
    childCostAt,
    existingChildAge: num('ev.existing_child_age'),
    spouse: { ageGap: spouseGap, employedProb: spouseEmployedProb, wage: spouseWage, netWorth: spouseNetWorth },
    careerBreak: {
      prob: num('ev.careerbreak.share') / 100,
      incomeLoss: breakLoss,
      reentryLogPenalty: Math.log(1 - breakReentry),
    },
  };
}

// ── 과거 경제 (ECOS 1996~2025) ──
const baseU = num('econ.jobloss_base_u');
export const history: History = {
  year: historyRaw.years.map((r) => r.year),
  deposit: historyRaw.years.map((r) => r.deposit),
  stock: historyRaw.years.map((r) => r.stock),
  house: historyRaw.years.map((r) => r.house),
  houseSeoul: historyRaw.years.map((r) => r.houseSeoul),
  usStock: historyRaw.years.map((r) => r.usStock),
  gold: historyRaw.years.map((r) => r.gold),
  dollar: historyRaw.years.map((r) => r.dollar),
  jobLossMult: historyRaw.years.map((r) => r.unemployment / baseU),
  blockLen: num('econ.block_len'),
};
export const historyYears = historyRaw.years;

export function buildParams(age = 35): ModelParams {
  const [dm, ds] = list('ret.deposit.real');
  const [sm, ss] = list('ret.stock.real');
  const [hm, hs] = list('ret.house.real');
  const [um, us] = list('ret.usstock.real');
  const [gm, gs] = list('ret.gold.real');
  const [fm, fs] = list('ret.dollar.real');
  const [initMean, initSd] = list('startup.income.init');
  return {
    incomeGrowthAtAge,
    incomeShockSd: num('income.shock_sd'),
    returns: {
      deposit: { mean: dm / 100, sd: ds / 100 },
      stock: { mean: sm / 100, sd: ss / 100 },
      house: { mean: hm / 100, sd: hs / 100 },
      usStock: { mean: um / 100, sd: us / 100 },
      gold: { mean: gm / 100, sd: gs / 100 },
      dollar: { mean: fm / 100, sd: fs / 100 },
    },
    debtRealRate: num('rate.debt.real') / 100,
    jobChange: jobChangeFor(age),
    startup: {
      cumulativeSurvival: startupSurvival(),
      initLogMean: initMean,
      initLogSd: initSd,
      yearlyLogSd: num('startup.income.yearly_sd'),
      reentryLogPenalty: Math.log(1 - num('startup.reentry_penalty') / 100),
      exitSelection: num('startup.exit_selection'),
    },
    events: eventParams(),
    history,
  };
}

/** 입력 기본값: 해당 연령대의 중간쯤 */
export const defaults = {
  income: (age: number) => Math.round((num(`wage.median.${wageGroup(age)}`) * 12) / 100) * 100,
  netWorth: (age: number) => Math.round(nwShape(nwGroup(age)).median / 500) * 500,
  savingsRate: num('savings.rate.default') / 100,
};

/** 테스트·문서용 */
export const derived = { spouseWage, spouseEmployedProb, spouseNetWorth, singleRatio, marriageH, birthH, jobLossRate, childCostAt, wageAnchors, wageGroup, nwMeanOverMedian, nwShape, nwQAll, startupSurvival, jobChangeFor };
