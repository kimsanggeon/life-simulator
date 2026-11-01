/// <reference lib="webworker" />
import { simulateAll, simulateScenario, storyForPath } from './simulate';
import { decomposeLuckChoice } from './decompose';
import { buildParams } from '../data/params';
import { PRESETS } from '../data/presets';
import type { Person, Scenario, SimOptions } from './types';

/** 고른 길에서 하나만 바꿔 본 결과 ('확률을 올리려면?' 비교용) */
export type Lever = { id: string; label: string; nwQuantiles: number[][] };

export type WorkerRequest =
  | { kind: 'run'; id: number; person: Person; scenarios: Scenario[]; opt: SimOptions; pick: string; preset: string }
  | { kind: 'life'; id: number; person: Person; scenario: Scenario; opt: SimOptions; index: number };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const params = buildParams(req.person.age);

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
