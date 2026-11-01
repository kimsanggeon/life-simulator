import { createRng, type Rng } from './rng';
import { quantileSorted } from './quantile';
import type { Band, Economy, EventSplit, History, LifeEvent, ModelParams, Person, Scenario, ScenarioResult, SimOptions, Story } from './types';

// 난수 스트림을 '시장 운', '개인 운', '선택 고유 운'으로 나눠 둔다.
// 경로 i는 모든 시나리오에서 같은 시장·같은 개인 충격을 겪는다(공통 난수).
// 그래서 시나리오 간 차이는 순수하게 '선택' 때문이고, 경로 간 차이는 '운' 때문이다.
const STREAM_MARKET = 0x9e3779b1;
const STREAM_LIFE = 0x85ebca77;
const STREAM_CHOICE = 0xc2b2ae3d;
// 인생 사건(결혼·출산·실직)도 운이다: 모든 시나리오에서 같은 경로는 같은 사건 난수를 쓴다.
const STREAM_EVENTS = 0x27d4eb2f;

function streamSeed(seed: number, path: number, stream: number) {
  return (Math.imul(seed ^ stream, 0x27d4eb2d) + Math.imul(path + 1, 0x165667b1)) >>> 0;
}

/**
 * 경로가 겪을 과거 연도 순서(index)를 정한다. 시장 운 스트림만 쓰므로 모든 시나리오가 같은 경제를 겪는다.
 * history: 원형 블록 부트스트랩 — 무작위 시작 연도에서 blockLen년씩 이어 붙인다.
 * replay: 지정한 해부터 순서대로, 끝(2025)에 닿으면 처음으로 돌아간다.
 */
export function economyPath(h: History, econ: Economy, years: number, market: Rng): Int32Array {
  const n = h.year.length;
  const idx = new Int32Array(years);
  if (econ.mode === 'replay') {
    const s = Math.max(0, h.year.indexOf(econ.from));
    for (let t = 0; t < years; t++) idx[t] = (s + t) % n;
    return idx;
  }
  let t = 0;
  while (t < years) {
    const s = Math.floor(market.next() * n);
    for (let k = 0; k < h.blockLen && t < years; k++) idx[t++] = (s + k) % n;
  }
  return idx;
}

type PathOut = {
  netWorth: Float64Array;
  income: Float64Array;
  startupAlive: boolean;
  /** 사건이 처음 일어난 해 (t, 1부터). 없으면 0 */
  firstMarriage: number;
  firstChild: number;
  firstJobLoss: number;
  dual: Uint8Array;
  yearIdx: Int32Array | null;
};

export function simulatePath(
  person: Person,
  scenario: Scenario,
  params: ModelParams,
  years: number,
  market: Rng,
  life: Rng,
  choice: Rng,
  events: Rng | null = null,
  eventsOn = events !== null,
  economy: Economy = { mode: 'normal' },
  log?: LifeEvent[],
): PathOut {
  const note = (t: number, kind: LifeEvent['kind']) => log?.push({ t, age: person.age + t - 1, kind });
  const H = economy.mode !== 'normal' ? params.history : undefined;
  const yearIdx = H ? economyPath(H, economy, years, market) : null;
  const nw = new Float64Array(years + 1);
  const inc = new Float64Array(years + 1);
  nw[0] = person.netWorth;
  inc[0] = person.income;

  const { allocation: w } = person;
  const R = params.returns;
  let logWage = Math.log(Math.max(person.income, 1)); // 임금근로를 계속했다면의 잠재 임금
  let W = person.netWorth;

  // 창업 상태
  let inBusiness = scenario.kind === 'startup';
  let bizLog = 0; // 사업소득 / 잠재임금 (로그)
  let bizCapital = 0;
  if (inBusiness) {
    bizCapital = scenario.startupCapital ?? 0;
    // 초기 투자금은 순자산에서 사업 지분으로 옮겨 간다 (장부가 유지, 폐업 시 0)
    W -= bizCapital;
    bizLog = params.startup.initLogMean + params.startup.initLogSd * choice.normal();
  }

  const E = params.events;
  let married = person.married;
  let children = person.children;
  const kidAges: number[] = Array.from({ length: person.children }, (_, k) => E.existingChildAge + 3 * k);
  let firstMarriage = 0;
  let firstChild = 0;
  let firstJobLoss = 0;
  const dual = new Uint8Array(years + 1);

  // 배우자의 '운'은 경로 시작에 한 번 뽑는다: 소득 순위·일할지 여부·가져올 자산 순위.
  // 결혼이 언제 일어나든, 어느 시나리오든 같은 경로는 같은 배우자를 만난다.
  const spSex = person.sex === 'M' ? 'F' : 'M';
  const spGap = person.sex === 'M' ? -E.spouse.ageGap : E.spouse.ageGap;
  const qSpWage = events ? events.next() : 0.5;
  const uSpWork = events ? events.next() : 1;
  const qSpNw = events ? events.next() : 0.5;
  let spWageMult = 1; // 경력단절 등으로 낮아진 배우자 임금 배수

  for (let t = 1; t <= years; t++) {
    const age = person.age + t - 1;

    // ── 사건 운: 상태와 상관없이 매년 같은 순서로 뽑아야 시나리오끼리 짝이 맞는다 ──
    // 사건을 끈 경우에도 난수는 똑같이 소비해 배우자 운 등이 바뀌지 않게 한다
    const draw = () => (events ? events.next() : 1);
    const uMarry = eventsOn ? draw() : (draw(), 1);
    const uBirth = eventsOn ? draw() : (draw(), 1);
    const uJob = eventsOn ? draw() : (draw(), 1);
    const uBreak = eventsOn ? draw() : (draw(), 1);

    // ── 시장 운: 매년 같은 순서로 3개 뽑는다 ──
    const zDep = market.normal();
    const zStk = market.normal();
    const zHou = market.normal();
    const hy = yearIdx ? yearIdx[t - 1] : -1;
    const jobMult = H ? H.jobLossMult[hy] : 1;
    // ── 개인 운 ──
    const zInc = life.normal();

    logWage += params.incomeGrowthAtAge(age) + params.incomeShockSd * zInc;

    if (scenario.kind === 'jobChange' && t === 1) {
      logWage += params.jobChange.jumpMean + params.jobChange.jumpSd * choice.normal();
    }

    let income: number;
    // 생활비는 '평소 소득' 기준으로 정해진다. 실직·경력단절처럼 일시적으로 소득이 줄면
    // 생활비는 그대로라 저축이 그만큼 통째로 줄어든다. (영구적인 임금 변화는 생활비도 따라 바뀐다)
    let normalIncome: number;
    if (inBusiness) {
      if (t > 1) bizLog += params.startup.yearlyLogSd * choice.normal();
      income = Math.exp(logWage + bizLog);
      normalIncome = income;
      // 이번 해 말 생존 여부 (누적 생존율 → 조건부 생존율)
      const cs = params.startup.cumulativeSurvival;
      const prev = t === 1 ? 1 : cs[Math.min(t - 2, cs.length - 1)];
      const cur = cs[Math.min(t - 1, cs.length - 1)];
      const survive = t - 1 < cs.length ? cur / prev : cs[cs.length - 1] / cs[cs.length - 2];
      // 성과가 나쁜 사업이 먼저 문을 닫는다: 생존확률 s^(exp(−k·bizLog)).
      // 같은 해 창업한 집단의 평균 성과(initLogMean)면 평균 생존율 그대로.
      const sel = params.startup.exitSelection;
      const surviveI = survive ** Math.exp(-sel * (bizLog - params.startup.initLogMean));
      if (choice.next() > surviveI) {
        inBusiness = false;
        bizCapital = 0;
        note(t, 'startupClose');
        logWage += params.startup.reentryLogPenalty;
      }
    } else {
      income = Math.exp(logWage);
      normalIncome = income;
      // 실직: 그 해 일부 기간 소득을 잃고 구직급여를 받는다. 재취업 임금은 조금 낮아진다.
      if (uJob < E.jobLossHazard(age) * jobMult) {
        const U = E.unemployment;
        const benefit = Math.min(income * U.benefitRate, U.benefitCapPerYear) * U.benefitYears;
        income = income * (1 - U.yearsOut) + benefit;
        logWage += U.reentryLogPenalty;
        note(t, 'jobLoss');
        if (!firstJobLoss) firstJobLoss = t;
      }
    }

    // 가족 사건 → 지출
    let spend = 0;
    if (!married && uMarry < E.marriageHazard(age, person.sex)) {
      married = true;
      spend += E.marriageCost;
      W += E.spouse.netWorth(age + spGap, qSpNw);
      note(t, 'marriage');
      if (!firstMarriage) firstMarriage = t;
    }

    // 배우자 소득: 같은 순위(q)를 유지한 채 나이에 맞는 분포를 따라간다
    let spIncome = 0;
    const spWorks = married && uSpWork < E.spouse.employedProb(age);
    if (spWorks) {
      spIncome = E.spouse.wage(age + spGap, spSex, qSpWage) * spWageMult;
      dual[t] = 1;
    }
    let spNormal = spIncome;
    if (married && uBirth < E.birthHazard(age, person.sex, children)) {
      children++;
      kidAges.push(0);
      note(t, 'birth');
      if (!firstChild) firstChild = t;
      // 여성의 출산 후 경력단절: 그 해 소득 일부를 잃고, 복귀 임금이 낮아진다 (본인 또는 아내)
      if (uBreak < E.careerBreak.prob) {
        if (person.sex === 'F' && !inBusiness) {
          income *= 1 - E.careerBreak.incomeLoss;
          logWage += E.careerBreak.reentryLogPenalty;
          note(t, 'careerBreak');
        } else if (person.sex === 'M' && spWorks) {
          note(t, 'spouseCareerBreak');
          spIncome *= 1 - E.careerBreak.incomeLoss;
          spWageMult *= Math.exp(E.careerBreak.reentryLogPenalty);
        }
      }
    }
    for (let k = 0; k < kidAges.length; k++) spend += E.childCostAt(kidAges[k]++);

    const r =
      W < 0
        ? params.debtRealRate
        : H
          ? w.deposit * H.deposit[hy] +
            w.stock * H.stock[hy] +
            w.house * H.house[hy] +
            (w.houseSeoul ?? 0) * (H.houseSeoul ? H.houseSeoul[hy] : H.house[hy])
          : w.deposit * (R.deposit.mean + R.deposit.sd * zDep) +
            w.stock * (R.stock.mean + R.stock.sd * zStk) +
            (w.house + (w.houseSeoul ?? 0)) * (R.house.mean + R.house.sd * zHou);

    spNormal = Math.max(spNormal, spIncome);
    W = W * (1 + r) + income + spIncome - (normalIncome + spNormal) * (1 - person.savingsRate) - spend;
    nw[t] = W + bizCapital;
    inc[t] = income;
  }

  return { netWorth: nw, income: inc, startupAlive: inBusiness, firstMarriage, firstChild, firstJobLoss, dual, yearIdx };
}

/**
 * 1,000개 중 i번째 인생을 같은 시드로 다시 돌려 사건까지 기록한다.
 * 같은 (person, scenario, opt, i)면 simulateScenario 안의 i번째 경로와 똑같은 인생이 나온다.
 */
export function storyForPath(person: Person, scenario: Scenario, params: ModelParams, opt: SimOptions, i: number, q = NaN): Story {
  const { years, seed } = opt;
  const useEvents = opt.events ?? true;
  const economy: Economy = params.history ? (opt.economy ?? { mode: 'history' }) : { mode: 'normal' };
  const log: LifeEvent[] = [];
  const out = simulatePath(
    person,
    scenario,
    params,
    years,
    createRng(streamSeed(seed, i, STREAM_MARKET)),
    createRng(streamSeed(seed, i, STREAM_LIFE)),
    createRng(streamSeed(seed, i, STREAM_CHOICE)),
    createRng(streamSeed(seed, i, STREAM_EVENTS)),
    useEvents,
    economy,
    log,
  );
  return {
    q,
    netWorth: Array.from(out.netWorth),
    events: log,
    econYears: out.yearIdx && params.history ? Array.from(out.yearIdx, (k) => params.history!.year[k]) : null,
    startupAlive: out.startupAlive,
  };
}

/** 101개 분위 요약에서 '값이 x 이상인 비율' (사이 지점은 직선 보간) */
export function shareAtLeast(q101: number[], x: number): number {
  if (x <= q101[0]) return 1;
  if (x > q101[100]) return 0;
  for (let k = 1; k <= 100; k++) {
    if (x <= q101[k]) {
      const span = q101[k] - q101[k - 1];
      const f = span > 0 ? (x - q101[k - 1]) / span : 1;
      return 1 - (k - 1 + f) / 100;
    }
  }
  return 0;
}

function badYearLift(h: History, seqs: (Int32Array | undefined)[], finals: Float64Array) {
  const n = h.year.length;
  const cut = quantileSorted(Float64Array.from(finals).sort(), 0.1);
  const all = new Float64Array(n);
  const bad = new Float64Array(n);
  let nAll = 0;
  let nBad = 0;
  seqs.forEach((seq, i) => {
    if (!seq) return;
    const isBad = finals[i] <= cut;
    for (const y of seq) {
      all[y]++;
      nAll++;
      if (isBad) {
        bad[y]++;
        nBad++;
      }
    }
  });
  return h.year
    .map((year, k) => ({ year, lift: all[k] && nBad ? bad[k] / nBad / (all[k] / nAll) : 0 }))
    .sort((a, b) => b.lift - a.lift);
}

function split(values: Float64Array, flag: Uint8Array): EventSplit['jobLoss'] {
  const a: number[] = [];
  const b: number[] = [];
  values.forEach((v, i) => (flag[i] ? a : b).push(v));
  const med = (xs: number[]) => (xs.length ? quantileSorted(Float64Array.from(xs).sort(), 0.5) : NaN);
  return { withP50: med(a), withoutP50: med(b), withShare: a.length / values.length };
}

function band(sorted: Float64Array): Band {
  return {
    p10: quantileSorted(sorted, 0.1),
    p25: quantileSorted(sorted, 0.25),
    p50: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
  };
}

export function simulateScenario(
  person: Person,
  scenario: Scenario,
  params: ModelParams,
  opt: SimOptions,
): ScenarioResult {
  const { runs, years, seed } = opt;
  const nwByYear = Array.from({ length: years + 1 }, () => new Float64Array(runs));
  const incByYear = Array.from({ length: years + 1 }, () => new Float64Array(runs));
  const finalNetWorth = new Float64Array(runs);
  let alive = 0;
  const useEvents = opt.events ?? true;
  const economy: Economy = params.history ? (opt.economy ?? { mode: 'history' }) : { mode: 'normal' };
  const yearSeqs: (Int32Array | undefined)[] = new Array(runs);
  const cnt = { married: new Array(years + 1).fill(0), child: new Array(years + 1).fill(0), jobLoss: new Array(years + 1).fill(0), dual: new Array(years + 1).fill(0) };
  const hadJobLoss = new Uint8Array(runs);
  const hadChild = new Uint8Array(runs);
  const hadMarried = new Uint8Array(runs);

  for (let i = 0; i < runs; i++) {
    const out = simulatePath(
      person,
      scenario,
      params,
      years,
      createRng(streamSeed(seed, i, STREAM_MARKET)),
      createRng(streamSeed(seed, i, STREAM_LIFE)),
      createRng(streamSeed(seed, i, STREAM_CHOICE)),
      createRng(streamSeed(seed, i, STREAM_EVENTS)),
      useEvents,
      economy,
    );
    if (out.yearIdx) yearSeqs[i] = out.yearIdx;
    for (let t = 0; t <= years; t++) {
      if (person.married || (out.firstMarriage && out.firstMarriage <= t)) cnt.married[t]++;
      if (out.firstChild && out.firstChild <= t) cnt.child[t]++;
      if (out.firstJobLoss && out.firstJobLoss <= t) cnt.jobLoss[t]++;
      cnt.dual[t] += out.dual[t];
    }
    hadJobLoss[i] = out.firstJobLoss ? 1 : 0;
    hadChild[i] = out.firstChild ? 1 : 0;
    hadMarried[i] = person.married || out.firstMarriage ? 1 : 0;
    for (let t = 0; t <= years; t++) {
      nwByYear[t][i] = out.netWorth[t];
      incByYear[t][i] = out.income[t];
    }
    finalNetWorth[i] = out.netWorth[years];
    if (out.startupAlive) alive++;
  }

  // 대표 인생 3명과 100명의 나: 같은 시드로 그 경로만 다시 돌려 사건을 기록한다
  const order = Array.from(finalNetWorth, (v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const hundred = Array.from({ length: 100 }, (_, k) => order[Math.min(runs - 1, Math.floor(((k + 0.5) / 100) * runs))].v);
  const stories: Story[] = [0.1, 0.5, 0.9].map((q) => storyForPath(person, scenario, params, opt, order[Math.min(runs - 1, Math.floor(q * runs))].i, q));

  return {
    scenario,
    stories,
    hundred,
    years: Array.from({ length: years + 1 }, (_, t) => t),
    ages: Array.from({ length: years + 1 }, (_, t) => person.age + t),
    netWorth: nwByYear.map((a) => band(a.sort())),
    nwQuantiles: nwByYear.map((a) => Array.from({ length: 101 }, (_, k) => quantileSorted(a, k / 100))),
    income: incByYear.map((a) => band(a.sort())),
    finalNetWorth,
    startupAliveShare: scenario.kind === 'startup' ? alive / runs : undefined,
    badYears: economy.mode === 'history' && params.history ? badYearLift(params.history, yearSeqs, finalNetWorth) : undefined,
    events: useEvents
      ? { married: cnt.married.map((c) => c / runs), child: cnt.child.map((c) => c / runs), jobLoss: cnt.jobLoss.map((c) => c / runs), dualIncome: cnt.dual.map((c) => c / runs) }
      : undefined,
    eventSplit: useEvents ? { jobLoss: split(finalNetWorth, hadJobLoss), child: split(finalNetWorth, hadChild), married: split(finalNetWorth, hadMarried) } : undefined,
  };
}

export function simulateAll(
  person: Person,
  scenarios: Scenario[],
  params: ModelParams,
  opt: SimOptions,
): ScenarioResult[] {
  return scenarios.map((s) => simulateScenario(person, s, params, opt));
}
