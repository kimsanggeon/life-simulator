// ① 내 목표, 이룰 확률은? — 1,000번의 인생 중 목표에 닿은 비율과, 확률을 올리는 방법
import { useMemo, useState } from 'react';
import type { ScenarioResult } from '../engine/types';
import type { Lever } from '../engine/worker';
import { shareAtLeast } from '../engine/simulate';
import { netWorthAtPercentile } from '../data/params';
import { pct, won } from './format';

type Props = {
  results: ScenarioResult[];
  levers: Lever[];
  activeId: string;
  startAge: number;
};

const AMOUNTS = [10000, 30000, 50000, 100000]; // 만원
const RANKS = [0.1, 0.2, 0.3];

function mood(p: number) {
  if (p >= 0.7) return '이 조건이면 꽤 가능성이 높은 목표예요.';
  if (p >= 0.4) return '반반쯤 되는 목표예요. 어떤 길을 가느냐가 중요해져요.';
  if (p >= 0.15) return '쉽지는 않지만 손이 닿는 목표예요.';
  if (p >= 0.03) return '운이 꽤 따라야 닿는 목표예요.';
  return '이 조건에서는 거의 닿지 않는 목표예요. 목표를 조금 낮춰 보면 어떨까요?';
}

export function GoalOdds({ results, levers, activeId, startAge }: Props) {
  const active = results.find((r) => r.scenario.id === activeId) ?? results[0];
  const T = active.years.length - 1;
  const endAge = startAge + T;

  // 기본 목표: 보통의 나(중간값)보다 한 단계 위 금액 → 너무 쉽지도 어렵지도 않게
  const median = active.netWorth[T].p50;
  const [kind, setKind] = useState<'amount' | 'rank'>('amount');
  const [amount, setAmount] = useState(() => AMOUNTS.find((a) => a > median) ?? AMOUNTS[AMOUNTS.length - 1]);
  const [custom, setCustom] = useState('');
  const [rank, setRank] = useState(0.2);
  const [age, setAge] = useState(endAge);
  const goalAge = Math.min(Math.max(age, startAge + 1), endAge);
  const t = goalAge - startAge;

  const target = kind === 'amount' ? amount : netWorthAtPercentile(goalAge, 1 - rank);
  const goalText = kind === 'amount' ? `${goalAge}세에 순자산 ${won(target)} 이상` : `${goalAge}세에 또래 가구 상위 ${pct(rank)} (${won(target)} 이상)`;

  const odds = shareAtLeast(active.nwQuantiles![t], target);

  const ways = useMemo(() => {
    const rows = [
      ...results
        .filter((r) => r.scenario.id !== active.scenario.id)
        .map((r) => ({ id: r.scenario.id, label: `'${r.scenario.label}'을 고르면`, p: shareAtLeast(r.nwQuantiles![t], target) })),
      ...levers.map((l) => ({ id: l.id, label: l.label, p: shareAtLeast(l.nwQuantiles[t], target) })),
    ];
    return rows.sort((a, b) => b.p - a.p);
  }, [results, levers, active.scenario.id, t, target]);

  const filled = Math.round(odds * 100);

  return (
    <div className="goal">
      <h3>내 목표, 이룰 확률은?</h3>
      <div className="goal-pick">
        <div className="seg small">
          <button className={kind === 'amount' ? 'on' : ''} onClick={() => setKind('amount')}>
            모은 돈 목표
          </button>
          <button className={kind === 'rank' ? 'on' : ''} onClick={() => setKind('rank')}>
            또래 중 순위 목표
          </button>
        </div>
        {kind === 'amount' ? (
          <div className="chips">
            {AMOUNTS.map((a) => (
              <button key={a} className={amount === a && !custom ? 'on' : ''} onClick={() => (setAmount(a), setCustom(''))}>
                {won(a)}
              </button>
            ))}
            <label className="custom">
              <input
                type="number"
                min={0.1}
                step={0.5}
                placeholder="직접"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (v > 0) setAmount(Math.round(v * 10000));
                }}
              />
              억
            </label>
          </div>
        ) : (
          <div className="chips">
            {RANKS.map((r) => (
              <button key={r} className={rank === r ? 'on' : ''} onClick={() => setRank(r)}>
                상위 {pct(r)}
              </button>
            ))}
          </div>
        )}
        <label className="goal-age">
          <span>
            몇 살까지? <b>{goalAge}세</b>
          </span>
          <input type="range" min={startAge + 1} max={endAge} value={goalAge} onChange={(e) => setAge(+e.target.value)} />
        </label>
      </div>

      <div className="goal-result">
        <div className="goal-big">
          <b>{pct(odds)}</b>
          <span>
            비슷한 조건의 1,000명 중 <b>{Math.round(odds * 1000).toLocaleString('ko-KR')}명</b>이 {goalText}에 닿았어요
          </span>
          <em>{mood(odds)}</em>
        </div>
        <div className="grid100" role="img" aria-label={`100칸 중 ${filled}칸`}>
          {Array.from({ length: 100 }, (_, k) => (
            <i key={k} className={k < filled ? 'yes' : ''} />
          ))}
        </div>
      </div>

      <h4 className="goal-ways-title">확률을 올리려면?</h4>
      <ul className="goal-ways">
        {ways.map((w) => {
          const d = w.p - odds;
          return (
            <li key={w.id}>
              <span>{w.label}</span>
              <b>{pct(w.p)}</b>
              <em className={Math.abs(d) < 0.005 ? '' : d > 0 ? 'up' : 'down'}>
                {Math.abs(d) < 0.005 ? '비슷' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%p`}
              </em>
            </li>
          );
        })}
      </ul>
      <p className="hint">
        지금 조건에서 한 가지만 바꿔 다시 1,000번 돌린 결과입니다. 확률이 올라도 그 길이 꼭 낫다는 뜻은 아니에요. 예를 들어 주식 위주는 확률이 오르면서 폭도 커집니다.
      </p>
    </div>
  );
}
