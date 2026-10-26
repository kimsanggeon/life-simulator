import { describe, expect, it } from 'vitest';
import { buildParams } from '../data/params';
import { simulateAll } from '../engine/simulate';
import { decomposeLuckChoice } from '../engine/decompose';
import type { Person, Scenario } from '../engine/types';
import { buildCardText } from './cardDraw';

const person: Person = {
  age: 32, income: 4000, netWorth: 15500, savingsRate: 0.2,
  allocation: { deposit: 0.4, stock: 0.3, house: 0.3 }, sex: 'M', married: false, children: 0,
};
const scenarios: Scenario[] = [
  { id: 'stay', label: '회사 계속', kind: 'stay' },
  { id: 'move', label: '이직', kind: 'jobChange' },
  { id: 'startup', label: '창업', kind: 'startup', startupCapital: 5000 },
];
const results = simulateAll(person, scenarios, buildParams(32), { runs: 500, years: 15, seed: 1 });
const decomposition = decomposeLuckChoice(results);

describe('공유 카드 문구', () => {
  it('사이트 주소는 넘긴 값 그대로, 없으면 빈 문자열', () => {
    const a = buildCardText({ person, results, activeId: 'stay', decomposition, showMoney: false, site: 'life-simulator.vercel.app' });
    const b = buildCardText({ person, results, activeId: 'stay', decomposition, showMoney: false });
    expect(a.site).toBe('life-simulator.vercel.app');
    expect(b.site).toBe('');
  });
  it('기본은 연봉·모은 돈을 숨긴다', () => {
    const t = buildCardText({ person, results, activeId: 'stay', decomposition, showMoney: false });
    expect(t.profile).not.toContain('연봉');
    expect(t.profile).toContain('32세');
    expect(t.profile).toContain("'회사 계속'");
  });
  it('원하면 연봉·모은 돈을 넣는다', () => {
    const t = buildCardText({ person, results, activeId: 'stay', decomposition, showMoney: true });
    expect(t.profile).toContain('연봉 4,000만');
    expect(t.profile).toContain('모은 돈 1.6억');
  });
  it('큰 숫자 = 고른 길의 중간값, 세 명의 나·세 갈래·100개 점이 들어간다', () => {
    const t = buildCardText({ person, results, activeId: 'move', decomposition, showMoney: false });
    expect(t.kicker).toContain('47세');
    expect(t.lives).toHaveLength(3);
    expect(t.lives.every((l) => l.lines.length >= 1 && l.lines.length <= 2)).toBe(true);
    expect(t.compare.map((c) => c.on)).toEqual([false, true, false]);
    expect(t.dots).toHaveLength(100);
  });
});
