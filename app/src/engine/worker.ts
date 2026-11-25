/// <reference lib="webworker" />
import { simulateAll, simulateScenario, storyForPath } from './simulate';
import { decomposeLuckChoice } from './decompose';
import { buildParams } from '../data/params';
import { PRESETS } from '../data/presets';
import type { Allocation, Band, Person, Scenario, SimOptions } from './types';

/** 고른 길에서 하나만 바꿔 본 결과 ('확률을 올리려면?' 비교용) */
export type Lever = { id: string; label: string; nwQuantiles: number[][] };

/** 조합 하나의 결과 요약: 보통·폭, 가장 나빴던 해, 큰 위기를 그대로 겪었을 때 */
export type MixResult = {
  id: string;
  label: string;
  end: Band;
  worst: { p10: number; p50: number };
  crisis: { from: number; p50: number; worst: number }[];
};

export type WorkerRequest =
  | { kind: 'run'; id: number; person: Person; scenarios: Scenario[]; opt: SimOptions; pick: string; preset: string }
  | { kind: 'life'; id: number; person: Person; scenario: Scenario; opt: SimOptions; index: number }
  | { kind: 'mixes'; id: number; person: Person; scenario: Scenario; opt: SimOptions; mixes: { id: string; label: string; a: Allocation }[] };

const CRISES = [1997, 2008];

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const params = buildParams(req.person.age);

  if (req.kind === 'mixes') {
    const T = req.opt.years;
    const mixes: MixResult[] = req.mixes.map((m) => {
      const p = { ...req.person, allocation: m.a };
      const r = simulateScenario(p, req.scenario, params, req.opt);
      return {
        id: m.id,
        label: m.label,
        end: r.netWorth[T],
        worst: r.worstYear!,
        crisis: CRISES.map((from) => {
          const c = simulateScenario(p, req.scenario, params, { ...req.opt, runs: 400, economy: { mode: 'replay', from } });
          return { from, p50: c.netWorth[T].p50, worst: c.worstYear!.p50 };
        }),
      };
    });
    self.postMessage({ kind: 'mixes', id: req.id, mixes });
    return;
  }

  if (req.kind === 'life') {
    const story = storyForPath(req.person, req.scenario, params, req.opt, req.index);
    self.postMessage({ kind: 'life', id: req.id, index: req.index, story });
    return;
  }

  const { id, person, scenarios, opt, pick, preset } = req;
  const results = simulateAll(person, scenarios, params, opt);
  const decomposition = decomposeLuckChoice(results);

  // 고른 길 그대로 두고 하나씩만 바꿔 본다
  const base = scenarios.find((s) => s.id === pick) ?? scenarios[0];
  const variants: { id: string; label: string; person: Person }[] = [];
  if (person.savingsRate < 0.6) {
    const more = Math.min(0.6, person.savingsRate + 0.1);
    variants.push({ id: 'save', label: `저축을 ${Math.round((more - person.savingsRate) * 100)}%p 더 하면`, person: { ...person, savingsRate: more } });
  }
  for (const [k, v] of Object.entries(PRESETS)) {
    if (k !== preset) variants.push({ id: `alloc-${k}`, label: `모은 돈을 ${v.how} 굴리면`, person: { ...person, allocation: v.a } });
  }
  const levers: Lever[] = variants.map((v) => ({
    id: v.id,
    label: v.label,
    nwQuantiles: simulateScenario(v.person, base, params, opt).nwQuantiles!,
  }));

  // Float64Array는 구조화 복제로 그대로 넘어간다
  self.postMessage({ kind: 'run', id, results, decomposition, levers });
};
