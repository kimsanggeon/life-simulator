import { useState } from 'react';
import type { ScenarioResult } from '../engine/types';
import { won } from './format';

const W = 640;
const H = 300;
const PAD = { l: 56, r: 16, t: 16, b: 32 };

type Props = { results: ScenarioResult[]; colors: string[]; active: number; onActive: (i: number) => void };

export function FanChart({ results, colors, active, onActive }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const r = results[active];
  const T = r.years.length - 1;

  let min = Infinity;
  let max = -Infinity;
  for (const s of results)
    for (const b of s.netWorth) {
      min = Math.min(min, b.p10);
      max = Math.max(max, b.p90);
    }
  min = Math.min(0, min);
  const x = (t: number) => PAD.l + (t / T) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);

  const area = (lo: (i: number) => number, hi: (i: number) => number) =>
    r.netWorth.map((_, i) => `${i ? 'L' : 'M'}${x(i)},${y(hi(i))}`).join('') +
    r.netWorth
      .map((_, i) => `L${x(T - i)},${y(lo(T - i))}`)
      .join('') +
    'Z';
  const line = (s: ScenarioResult) => s.netWorth.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b.p50)}`).join('');

  const ticks = niceTicks(min, max, 5);
  const h = hover ?? T;
  const hb = r.netWorth[h];

  return (
    <div className="fan">
      <div className="tabs" role="tablist">
        {results.map((s, i) => (
          <button
            key={s.scenario.id}
            role="tab"
            aria-selected={i === active}
            className={i === active ? 'on' : ''}
            style={{ '--c': colors[i] } as React.CSSProperties}
            onClick={() => onActive(i)}
          >
            {s.scenario.label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="순자산 추이 부채꼴 그래프"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.max(0, Math.min(T, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * T))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="tick">
              {won(v)}
            </text>
          </g>
        ))}
        {r.ages.map((a, i) =>
          i % Math.ceil(T / 6) === 0 || i === T ? (
            <text key={a} x={x(i)} y={H - 10} textAnchor="middle" className="tick">
              {a}세
            </text>
          ) : null,
        )}
        <path d={area((i) => r.netWorth[i].p10, (i) => r.netWorth[i].p90)} fill={colors[active]} opacity={0.16} />
        <path d={area((i) => r.netWorth[i].p25, (i) => r.netWorth[i].p75)} fill={colors[active]} opacity={0.26} />
        {results.map((s, i) =>
          i === active ? null : (
            <path key={s.scenario.id} d={line(s)} fill="none" stroke={colors[i]} strokeWidth={1.5} strokeDasharray="4 4" />
          ),
        )}
        <path d={line(r)} fill="none" stroke={colors[active]} strokeWidth={2.5} />
        <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} className="cursor" />
        <circle cx={x(h)} cy={y(hb.p50)} r={4} fill={colors[active]} />
      </svg>
      <p className="readout">
        <b>{r.ages[h]}세</b> 순자산 — 비슷한 조건의 1,000명 중 가운데 80%는 <b>{won(hb.p10)}~{won(hb.p90)}</b>, 중간값{' '}
        <b>{won(hb.p50)}</b>
      </p>
      <p className="legend">
        <span className="sw" style={{ background: colors[active], opacity: 0.4 }} /> 가운데 50% (P25~P75)
        <span className="sw" style={{ background: colors[active], opacity: 0.2 }} /> 가운데 80% (P10~P90)
        <span className="sw line" style={{ borderColor: colors[active] }} /> 중간값
        {results.length > 1 && (
          <>
            <span className="sw dash" /> 다른 선택의 중간값
          </>
        )}
      </p>
    </div>
  );
}

function niceTicks(min: number, max: number, n: number): number[] {
  const span = max - min || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v));
  return out;
}
