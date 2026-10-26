import type { LuckChoice as LC } from '../engine/decompose';
import type { ScenarioResult } from '../engine/types';
import { pct, won } from './format';

type Props = { d: LC; results: ScenarioResult[]; colors: string[]; endAge: number };

export function LuckChoice({ d, results, colors, endAge }: Props) {
  const rows = d.perScenario;
  const min = Math.min(...rows.map((r) => r.p10));
  const max = Math.max(...rows.map((r) => r.p90));
  const lo = min - (max - min) * 0.08;
  const hi = max + (max - min) * 0.08;
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const base = rows[0];

  return (
    <div className="luck">
      <h3>{endAge}세 순자산, 선택이 옮기는 것과 운이 벌리는 것</h3>

      <div className="ranges">
        {rows.map((r, i) => (
          <div className="range" key={r.id}>
            <span className="rl">{r.label}</span>
            <div className="track">
              <div
                className="span"
                style={{ left: pos(r.p10), width: `calc(${pos(r.p90)} - ${pos(r.p10)})`, background: colors[i] }}
              />
              <div className="mid" style={{ left: pos(r.p50), background: colors[i] }} />
              <span className="lab l" style={{ left: pos(r.p10) }}>
                {won(r.p10)}
              </span>
              <span className="lab m" style={{ left: pos(r.p50) }}>
                {won(r.p50)}
              </span>
              <span className="lab r" style={{ left: pos(r.p90) }}>
                {won(r.p90)}
              </span>
            </div>
          </div>
        ))}
        <p className="hint">막대 = 운의 폭(P10~P90), 세로선 = 중간값. 선택은 세로선을 옮기고, 운은 막대를 늘린다.</p>
      </div>

      {rows.length > 1 && (
        <>
          <div className="share" aria-label={`선택 ${pct(d.choiceShare)}, 운 ${pct(d.luckShare)}`}>
            <div className="choice" style={{ width: pct(d.choiceShare) }}>
              {d.choiceShare > 0.08 && <>선택 {pct(d.choiceShare)}</>}
            </div>
            <div className="lk">운 {pct(d.luckShare)}</div>
          </div>
          <p className="hint">
            세 갈래 결과 전체의 차이(분산)를 쪼개면, 어떤 길을 골랐는가가 {pct(d.choiceShare)}, 같은 길 안에서의 운이{' '}
            {pct(d.luckShare)}를 설명합니다.
          </p>

          <div className="cards">
            {rows.slice(1).map((r, j) => (
              <div className="card" key={r.id} style={{ borderTopColor: colors[j + 1] }}>
                <h4>
                  {r.label} vs {base.label}
                </h4>
                <dl>
                  <dt>선택 효과 (중간값 이동)</dt>
                  <dd className={r.medianShift >= 0 ? 'up' : 'down'}>
                    {r.medianShift >= 0 ? '+' : ''}
                    {won(r.medianShift)}
                  </dd>
                  <dt>운의 폭 (P90−P10)</dt>
                  <dd>
                    {won(r.luckWidth)} <small>({base.label} {won(base.luckWidth)})</small>
                  </dd>
                  <dt>같은 운을 겪었을 때 {base.label}보다 나은 경우</dt>
                  <dd>{pct(r.betterThanBaseShare)}</dd>
                </dl>
                <p className="hint">
                  시장 흐름·개인 소득 충격이 똑같은 '나' 1,000쌍을 비교하면, 차이는 {won(r.pairedDiff.p10)} ~{' '}
                  {won(r.pairedDiff.p90)} 사이였습니다.
                </p>
                {results[j + 1].startupAliveShare !== undefined && (
                  <p className="hint">
                    시뮬레이션 끝까지 사업을 유지한 비율: <b>{pct(results[j + 1].startupAliveShare!)}</b>
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
