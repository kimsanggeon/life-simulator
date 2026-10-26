import { quantiles } from './quantile';
import type { ScenarioResult } from './types';

export type LuckChoice = {
  /** 결과 차이 중 선택(시나리오 간 중심 이동)이 설명하는 비율 */
  choiceShare: number;
  /** 결과 차이 중 운(같은 선택 안의 폭)이 설명하는 비율 */
  luckShare: number;
  perScenario: {
    id: string;
    label: string;
    p10: number;
    p50: number;
    p90: number;
    /** 기준 시나리오 대비 중간값 이동 = 선택의 효과 */
    medianShift: number;
    /** P90 − P10 = 운의 폭 */
    luckWidth: number;
    /** 같은 운을 겪은 경로끼리 비교했을 때 기준보다 나은 비율 */
    betterThanBaseShare: number;
    /** 같은 운끼리 짝지은 차이의 P10/P50/P90 */
    pairedDiff: { p10: number; p50: number; p90: number };
  }[];
};

/**
 * 분산 분해: 전체 분산 = 시나리오 평균 간 분산(선택) + 시나리오 내 분산 평균(운).
 * 극단값 몇 개가 비율을 좌우하지 않도록 전체 P2.5~P97.5로 윈저라이즈한 뒤 계산한다.
 * results[0]을 기준 시나리오로 본다.
 */
export function decomposeLuckChoice(results: ScenarioResult[]): LuckChoice {
  const pooled = new Float64Array(results.reduce((n, r) => n + r.finalNetWorth.length, 0));
  let k = 0;
  for (const r of results) for (const v of r.finalNetWorth) pooled[k++] = v;
  const [lo, hi] = quantiles(pooled, [0.025, 0.975]);
  const clip = (v: number) => Math.min(hi, Math.max(lo, v));

  const means: number[] = [];
  const vars: number[] = [];
  for (const r of results) {
    const n = r.finalNetWorth.length;
    let s = 0;
    for (const v of r.finalNetWorth) s += clip(v);
    const m = s / n;
    let ss = 0;
    for (const v of r.finalNetWorth) ss += (clip(v) - m) ** 2;
    means.push(m);
    vars.push(ss / n);
  }
  const grand = means.reduce((a, b) => a + b, 0) / means.length;
  const between = means.reduce((a, m) => a + (m - grand) ** 2, 0) / means.length;
  const within = vars.reduce((a, b) => a + b, 0) / vars.length;
  const total = between + within || 1;

  const base = results[0];
  const [, baseP50] = quantiles(base.finalNetWorth, [0.1, 0.5]);

  return {
    choiceShare: between / total,
    luckShare: within / total,
    perScenario: results.map((r) => {
      const [p10, p50, p90] = quantiles(r.finalNetWorth, [0.1, 0.5, 0.9]);
      const n = Math.min(r.finalNetWorth.length, base.finalNetWorth.length);
      const diff = new Float64Array(n);
      let better = 0;
      for (let i = 0; i < n; i++) {
        diff[i] = r.finalNetWorth[i] - base.finalNetWorth[i];
        if (diff[i] > 0) better++;
      }
      const [d10, d50, d90] = quantiles(diff, [0.1, 0.5, 0.9]);
      return {
        id: r.scenario.id,
        label: r.scenario.label,
        p10,
        p50,
        p90,
        medianShift: p50 - baseP50,
        luckWidth: p90 - p10,
        betterThanBaseShare: better / n,
        pairedDiff: { p10: d10, p50: d50, p90: d90 },
      };
    }),
  };
}
