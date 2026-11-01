// 엔진 입출력 타입. 금액 단위는 모두 '만원', 실질(기준연도 물가) 가치.

/** 합 = 1. houseSeoul: 서울 아파트 (과거 재생 때 KB 서울 지수, 없으면 전국과 같게) */
export type Allocation = { deposit: number; stock: number; house: number; houseSeoul?: number };

export type Person = {
  age: number; // 현재 만 나이
  income: number; // 연 세전 근로소득 (만원)
  netWorth: number; // 순자산 (만원)
  savingsRate: number; // 세전 소득 대비 연 저축 비율 (0~1)
  allocation: Allocation;
  sex: Sex;
  married: boolean;
  children: number;
};

export type Sex = 'M' | 'F';

/** 나이·조건별 사건 확률(연간 hazard)과 사건이 돈에 미치는 영향 */
export type EventParams = {
  /** 미혼인 사람이 이번 해 (초)혼할 확률 */
  marriageHazard: (age: number, sex: Sex) => number;
  /** 기혼 가구에 이번 해 아이가 태어날 확률 (나이는 본인 기준, 남성은 배우자 나이로 환산) */
  birthHazard: (age: number, sex: Sex, children: number) => number;
  /** 임금근로자가 이번 해 비자발적으로 일자리를 잃을 확률 */
  jobLossHazard: (age: number) => number;
  /** 실직 시: 일을 못 한 기간(년), 그동안 받는 구직급여(만원, 연환산 상한 적용 전 비율과 상한) */
  unemployment: { yearsOut: number; benefitRate: number; benefitCapPerYear: number; benefitYears: number; reentryLogPenalty: number };
  /** 결혼 시 1회 비용 (만원) */
  marriageCost: number;
  /** 자녀 나이별 1명당 연간 양육비 (만원). 독립 후엔 0 */
  childCostAt: (childAge: number) => number;
  /** 시작 시점에 이미 있는 자녀의 나이 (입력에 나이가 없을 때 쓰는 가정) */
  existingChildAge: number;
  /** 배우자: 결혼하면 가구 소득·자산에 합쳐진다 */
  spouse: {
    /** 남편 나이 − 아내 나이 */
    ageGap: number;
    /** 이 나이 가구에서 배우자도 일할 확률 (맞벌이 비율) */
    employedProb: (age: number) => number;
    /** 성·나이별 임금 분포에서 q분위(0~1)의 연 소득 (만원) */
    wage: (age: number, sex: Sex, q: number) => number;
    /** 결혼할 때 배우자가 가져오는 순자산의 q분위 값 (만원) */
    netWorth: (age: number, q: number) => number;
  };
  /** 여성이 출산 후 일을 그만둘 확률과, 그 경우 줄어드는 소득 비율(그 해) */
  careerBreak: { prob: number; incomeLoss: number; reentryLogPenalty: number };
};

export type EventShares = {
  married: number[]; // 연도별 '그때까지 결혼한 비율'
  child: number[]; // 연도별 '그때까지 아이가 (새로) 태어난 비율'
  jobLoss: number[]; // 연도별 '그때까지 한 번이라도 실직한 비율'
  dualIncome: number[]; // 연도별 '그 해 배우자도 일하는 가구 비율' (전체 경로 기준)
};

export type EventSplit = {
  /** 실직을 한 번이라도 겪은 경로 / 아닌 경로의 마지막 해 순자산 중간값 */
  jobLoss: { withP50: number; withoutP50: number; withShare: number };
  child: { withP50: number; withoutP50: number; withShare: number };
  married: { withP50: number; withoutP50: number; withShare: number };
};

export type ScenarioKind = 'stay' | 'jobChange' | 'startup';

export type Scenario = {
  id: string;
  label: string;
  kind: ScenarioKind;
  startupCapital?: number; // 창업 초기 투자금 (만원)
};

export type ReturnParam = { mean: number; sd: number }; // 연 실질수익률 (소수)

export type ModelParams = {
  /** 나이 → 그 나이에서 다음 해로 갈 때 중위소득의 실질 로그 성장률 */
  incomeGrowthAtAge: (age: number) => number;
  /** 개인 소득의 연간 영구충격 표준편차 (로그) */
  incomeShockSd: number;
  returns: { deposit: ReturnParam; stock: ReturnParam; house: ReturnParam };
  /** 순자산이 음수일 때(부채) 적용하는 실질 이자율 */
  debtRealRate: number;
  jobChange: { jumpMean: number; jumpSd: number };
  startup: {
    /** 창업 후 n년차 말까지 살아남을 누적 생존율, index 0 = 1년차 */
    cumulativeSurvival: number[];
    /** 첫해 사업소득 / 직전 연봉, 로그 평균·표준편차 */
    initLogMean: number;
    initLogSd: number;
    /** 사업 유지 중 연간 사업소득 로그 변동 표준편차 */
    yearlyLogSd: number;
    /** 폐업 후 재취업 시 직전 임금 대비 로그 감소 */
    reentryLogPenalty: number;
    /** 성과에 따른 폐업 선별 강도 (0 = 성과와 무관하게 무작위 폐업) */
    exitSelection: number;
  };
  events: EventParams;
  /** 실제 과거 연도 (실질 수익률 + 실직 확률 배수). 있으면 블록 부트스트랩으로 재생할 수 있다 */
  history?: History;
};

export type History = {
  year: number[];
  deposit: number[];
  stock: number[];
  house: number[];
  /** KB 아파트(서울) 실질 상승률 */
  houseSeoul?: number[];
  /** 그 해 실업률 ÷ 기준연도 실업률: 실직 확률에 곱한다 */
  jobLossMult: number[];
  /** 한 번에 이어서 뽑는 연도 수 (위기가 몇 년씩 이어지는 모양을 보존) */
  blockLen: number;
};

/** history: 과거 연도를 무작위 블록으로 재생 / normal: 평균·표준편차만 쓴 정규분포 / replay: 특정 해부터 그대로 재생 */
export type Economy = { mode: 'history' } | { mode: 'normal' } | { mode: 'replay'; from: number };

export type Band = { p10: number; p25: number; p50: number; p75: number; p90: number };

export type ScenarioResult = {
  scenario: Scenario;
  years: number[]; // 0..T (0 = 현재)
  ages: number[];
  netWorth: Band[]; // 연도별
  income: Band[];
  finalNetWorth: Float64Array; // 경로별 마지막 해 순자산 (경로 i는 모든 시나리오에서 같은 운)
  /** 창업 시나리오: 마지막 해까지 사업을 유지한 비율 */
  startupAliveShare?: number;
  /** 하위 10% 경로에 각 과거 연도가 나온 빈도 ÷ 전체 경로에서의 빈도 (1보다 크면 나쁜 인생에 자주 낀 해) */
  badYears?: { year: number; lift: number }[];
  events?: EventShares;
  eventSplit?: EventSplit;
  /** 운이 나빴던 나(P10)·보통의 나(P50)·운이 좋았던 나(P90) */
  stories?: Story[];
  /** 100명의 나: 마지막 순자산을 100등분한 값 (낮은 순) */
  hundred?: number[];
  /** 해마다 순자산 분포를 0%·1%·…·100% 지점 101개로 요약 (목표 확률 계산용) */
  nwQuantiles?: number[][];
};

/** events: 결혼·출산·실직 같은 인생 사건을 켤지 (끄면 소득·시장 운만 남는다) */
/** 한 인생에서 일어난 일 (이야기용) */
export type LifeEvent = {
  t: number; // 몇 년째 (1부터)
  age: number; // 그 해의 나이
  kind: 'marriage' | 'birth' | 'jobLoss' | 'careerBreak' | 'spouseCareerBreak' | 'startupClose';
};

/** 대표 인생: 1,000개 중 마지막 순자산이 P10/P50/P90에 가장 가까운 경로 */
export type Story = {
  q: number;
  netWorth: number[];
  events: LifeEvent[];
  /** 각 해가 재생한 실제 과거 연도 (과거 재생 모드일 때) */
  econYears: number[] | null;
  startupAlive: boolean;
};

export type SimOptions = { runs: number; years: number; seed: number; events?: boolean; economy?: Economy };
