import type { ScenarioResult } from '../engine/types';
import { pct, won } from './format';

const W = 640;
const H = 180;
const PAD = { l: 40, r: 16, t: 12, b: 28 };

const SERIES = [
  { key: 'married', label: '결혼', color: '#c2417a' },
  { key: 'child', label: '아이 출생', color: '#2a9d6f' },
  { key: 'jobLoss', label: '실직 1회 이상', color: '#8c6d1f' },
  { key: 'dualIncome', label: '맞벌이 (그 해 기준)', color: '#3f6fb5' },
] as const;

type Props = { result: ScenarioResult; startAge: number };

export function EventTimeline({ result, startAge }: Props) {
  const ev = result.events;
  if (!ev) return null;
  const T = ev.married.length - 1;
  const x = (t: number) => PAD.l + (t / T) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  const path = (a: number[]) => a.map((v, t) => `${t ? 'L' : 'M'}${x(t)},${y(v)}`).join('');
  const split = result.eventSplit!;
  const endAge = startAge + T;

  return (
    <div className="events">
      <h3>
        {endAge}세까지 일어나는 일 <small>· {result.scenario.label}</small>
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연령별 누적 사건 비율">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
              {pct(v)}
            </text>
          </g>
        ))}
        {Array.from({ length: T + 1 }, (_, t) => t)
          .filter((t) => t % Math.ceil(T / 6) === 0 || t === T)
          .map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="tick">
              {startAge + t}세
            </text>
          ))}
        {SERIES.map((s) => (
          <g key={s.key}>
            <path d={path(ev[s.key])} fill="none" stroke={s.color} strokeWidth={2.5} />
            <circle cx={x(T)} cy={y(ev[s.key][T])} r={4} fill={s.color} />
          </g>
        ))}
      </svg>
      <ul className="evlegend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="sw" style={{ background: s.color }} />
            {s.label} <b>{pct(ev[s.key][T])}</b>
          </li>
        ))}
      </ul>
      <p className="hint">
        비슷한 조건의 1,000명 중 {endAge}세까지 각 사건을 겪은 사람의 비율(누적). 실직 확률은 구직급여 신규 신청 건수로 만든 근사라,
        같은 사람의 반복 신청이 섞여 실제보다 높게 나올 수 있습니다. 결혼하면 배우자의 소득(성·연령별 공식 분포, 맞벌이 비율
        반영)과 자산(같은 나이대 1인 가구 수준)이 가구에 합쳐집니다. 배우자 순위는 본인과 무관하게 정해집니다.
      </p>
      <div className="cards">
        <SplitCard title="결혼한 경우 (배우자 소득·자산 포함)" s={split.married} yes="결혼한 사람" no="미혼으로 남은 사람" />
        <SplitCard title="실직이 순자산에 남긴 차이" s={split.jobLoss} yes="실직을 겪은 사람" no="겪지 않은 사람" />
        <SplitCard title="아이가 태어난 경우" s={split.child} yes="아이가 태어난 사람" no="그렇지 않은 사람" />
      </div>
    </div>
  );
}

function SplitCard({ title, s, yes, no }: { title: string; s: { withP50: number; withoutP50: number; withShare: number }; yes: string; no: string }) {
  if (!(s.withShare > 0.02 && s.withShare < 0.98)) return null;
  return (
    <div className="card plain">
      <h4>{title}</h4>
      <dl>
        <dt>
          {yes} ({pct(s.withShare)})
        </dt>
        <dd>{won(s.withP50)}</dd>
        <dt>
          {no} ({pct(1 - s.withShare)})
        </dt>
        <dd>{won(s.withoutP50)}</dd>
      </dl>
      <p className="hint">순자산 중간값 비교. 같은 선택 안에서 사건이라는 '운'이 만든 차이입니다.</p>
    </div>
  );
}
