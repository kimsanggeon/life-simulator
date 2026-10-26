/// <reference lib="webworker" />
import { simulateAll } from './simulate';
import { decomposeLuckChoice } from './decompose';
import { buildParams } from '../data/params';
import type { Person, Scenario, SimOptions } from './types';

export type WorkerRequest = { id: number; person: Person; scenarios: Scenario[]; opt: SimOptions };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, person, scenarios, opt } = e.data;
  const results = simulateAll(person, scenarios, buildParams(person.age), opt);
  const decomposition = decomposeLuckChoice(results);
  // Float64Array는 구조화 복제로 그대로 넘어간다
  self.postMessage({ id, results, decomposition });
};
