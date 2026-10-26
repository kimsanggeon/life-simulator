// 결과를 그래프보다 문장과 이야기로 먼저 보여 주는 부품들.
import type { LifeEvent, ScenarioResult, Story } from '../engine/types';
import type { LuckChoice } from '../engine/decompose';
import { historyYears } from '../data/params';
import { pct, won, rankLabel } from './format';

const last = (xs: number[]) => xs[xs.length - 1];

// ── 1. 한 문장 요약 ──
export function Headline({
  result,
  startAge,
  startNetWorth,
  endRank,
}: {
  result: ScenarioResult;
  startAge: number;
  startNetWorth: number;
  endRank: number;
}) {
  const end = last(result.netWorth.map((b) => b.p50));
  const b = result.netWorth[result.netWorth.length - 1];
  const endAge = startAge + result.years.length - 1;
  return (
    <div className="headline">
      <p className="hl-kicker">
        {endAge}세의 나 · {result.scenario.label}
      </p>
      <p className="hl-main">
        보통 <b>{won(end)}</b>
      </p>
      <p className="hl-sub">
        100번 중 80번은 <b>{won(b.p10)} ~ {won(b.p90)}</b> 사이에 도착합니다
      </p>
      <div className="hl-chips">
        <span>
          지금 {won(startNetWorth)} → {won(end)}
        </span>
        <span>오늘의 {endAge}세 가구와 비교하면 {rankLabel(endRank)}</span>
      </div>
    </div>
  );
}

// ── 2. 100명의 나: 점 하나 = 인생 하나, 비슷한 금액끼리 쌓는다 ──
export function HundredDots({ values }: { values: number[] }) {
  const W = 640;
  const H = 170;
  const BINS = 24;
  const lo = values[0];
  const hi = values[values.length - 1];
  const span = hi - lo || 1;
  const binW = (W - 40) / BINS;
  const counts = new Array(BINS).fill(0);
  const dots = values.map((v, k) => {
    const bin = Math.min(BINS - 1, Math.floor(((v - lo) / span) * BINS));
    const row = counts[bin]++;
    const tone = k < 10 ? 'bad' : k >= 90 ? 'good' : k === 50 ? 'mid' : 'base';
    return { x: 20 + bin * binW + binW / 2, row, tone };
  });
  const r = Math.min(binW / 2 - 1, 6);
  const maxRow = Math.max(...counts);
  const step = Math.min(2 * r + 2, (H - 40) / maxRow);
  const y = (row: number) => H - 28 - row * step - r;
  const x = (v: number) => 20 + ((v - lo) / span) * (W - 40);
  return (
    <div className="hundred">
      <h3>100명의 나</h3>
      <p className="hint">똑같이 출발한 100번의 인생이 어디에 도착했는지. 점 하나가 인생 하나입니다.</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="100번의 인생이 도착한 순자산 분포">
        {dots.map((d, k) => (
          <circle key={k} cx={d.x} cy={y(d.row)} r={r} className={`dot ${d.tone}`} />
        ))}
        <line x1={20} x2={W - 20} y1={H - 22} y2={H - 22} className="axis" />
        {[lo, values[50], hi].map((v, k) => (
          <text key={k} x={x(v)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} className="tick">
            {won(v)}
          </text>
        ))}
      </svg>
      <p className="legend">
        <span className="sw bad" /> 운이 나빴던 10명 <span className="sw mid" /> 딱 가운데 <span className="sw good" /> 운이 좋았던 10명
      </p>
    </div>
  );
}

// ── 3. 세 명의 나 ──
const TITLES = ['운이 나빴던 나', '보통의 나', '운이 좋았던 나'];
const TONES = ['bad', 'mid', 'good'];

export function eventText(e: LifeEvent, birthNo: number) {
  switch (e.kind) {
    case 'marriage':
      return '결혼';
    case 'birth':
      return ['첫째', '둘째', '셋째', '넷째'][Math.min(birthNo, 3)] + ' 출생';
    case 'jobLoss':
      return '실직 — 몇 달 쉬고 재취업 (월급이 조금 줄어듦)';
    case 'careerBreak':
      return '출산 후 일을 잠시 쉼';
    case 'spouseCareerBreak':
      return '배우자가 출산 후 일을 잠시 쉼';
    case 'startupClose':
      return '사업을 접고 다시 취업';
  }
}

const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

/** 그 인생이 겪은 큰 경제 사건: 재생한 실제 연도 중 주가·집값이 크게 떨어지거나 오른 해 */
export function economyMoments(s: Story, startAge: number) {
  if (!s.econYears) return [];
  const out: { age: number; text: string; kind: string }[] = [];
  s.econYears.forEach((y, k) => {
    const h = historyYears.find((r) => r.year === y)!;
    const down = [h.stock <= -0.25 && `주가 ${signedPct(h.stock)}`, h.house <= -0.08 && `집값 ${signedPct(h.house)}`].filter(Boolean);
    const up = [h.stock >= 0.3 && `주가 ${signedPct(h.stock)}`, h.house >= 0.1 && `집값 ${signedPct(h.house)}`].filter(Boolean);
    if (down.length) out.push({ age: startAge + k, text: `${y}년 같은 경제 위기 (${down.join(', ')})`, kind: 'crisis' });
    else if (up.length) out.push({ age: startAge + k, text: `${y}년 같은 호황 (${up.join(', ')})`, kind: 'boom' });
  });
  return out;
}

function Spark({ values, tone }: { values: number[]; tone: string }) {
  const W = 220;
  const H = 48;
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values);
  const p = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * W},${H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`spark ${tone}`} aria-hidden>
      <path d={p} />
    </svg>
  );
}

export function ThreeLives({ stories, startAge, scenarioLabel }: { stories: Story[]; startAge: number; scenarioLabel: string }) {
  return (
    <div className="lives">
      <h3>세 명의 나</h3>
      <p className="hint">1,000번의 인생 중 실제로 이렇게 흘러간 세 사람입니다. 모두 같은 조건에서 '{scenarioLabel}'을 골랐습니다.</p>
      <div className="lives-grid">
        {stories.map((s, k) => {
          let births = 0;
          const items = [
            ...s.events.map((e) => ({ age: e.age, text: eventText(e, e.kind === 'birth' ? births++ : 0)!, kind: e.kind as string })),
            ...economyMoments(s, startAge),
          ].sort((a, b) => a.age - b.age);
          const endAge = startAge + s.netWorth.length - 1;
          return (
            <article key={s.q} className={`life ${TONES[k]}`}>
              <header>
                <h4>{TITLES[k]}</h4>
                <p className="life-end">
                  {endAge}세 <b>{won(last(s.netWorth))}</b>
                </p>
              </header>
              <Spark values={s.netWorth} tone={TONES[k]} />
              <ol>
                {items.length === 0 && <li className="quiet">큰 사건 없이 조용히 흘러간 {s.netWorth.length - 1}년</li>}
                {items.slice(0, 7).map((it, j) => (
                  <li key={j} className={it.kind}>
                    <span className="age">{it.age}세</span> {it.text}
                  </li>
                ))}
                {items.length > 7 && <li className="quiet">… 외 {items.length - 7}건</li>}
                {scenarioLabel === '창업' && s.startupAlive && <li className="quiet">사업을 끝까지 유지</li>}
              </ol>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. 다른 길을 갔다면? ──
export function CompareChoices({
  results,
  d,
  activeId,
  onPick,
}: {
  results: ScenarioResult[];
  d: LuckChoice;
  activeId: string;
  onPick: (id: string) => void;
}) {
  const rows = d.perScenario;
  const lo = Math.min(...rows.map((r) => r.p10));
  const hi = Math.max(...rows.map((r) => r.p90));
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 92 + 4}%`;
  const base = rows[0];
  return (
    <div className="compare">
      <h3>다른 길을 갔다면?</h3>
      <div className="cmp-rows">
        {rows.map((r, k) => {
          const res = results[k];
          const diff = r.medianShift;
          return (
            <button key={r.id} className={`cmp ${r.id === activeId ? 'on' : ''}`} onClick={() => onPick(r.id)}>
              <span className="cmp-name">{r.label}</span>
              <span className="cmp-bar">
                <span className="cmp-range" style={{ left: pos(r.p10), width: `calc(${pos(r.p90)} - ${pos(r.p10)})` }} />
                <span className="cmp-mid" style={{ left: pos(r.p50) }} />
              </span>
              <span className="cmp-text">
                {k === 0 ? (
                  <>
                    보통 <b>{won(r.p50)}</b>
                  </>
                ) : (
                  <>
                    보통 <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : '−'}{won(Math.abs(diff))}</b> · 같은 운이라면 {pct(r.betterThanBaseShare)}가 더 나음
                  </>
                )}
                {res.startupAliveShare !== undefined && <> · 끝까지 사업 유지 {pct(res.startupAliveShare)}</>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hint">막대는 100번 중 80번이 도착한 범위, 세로선은 보통(가운데). '{base.label}'과 비교. 누르면 위 결과가 그 길로 바뀝니다.</p>
    </div>
  );
}

// ── 5. 결과를 가른 건? ──
export function LuckBar({ d }: { d: LuckChoice }) {
  return (
    <div className="luckbar">
      <h3>결과를 가른 건 선택일까, 운일까?</h3>
      <div className="share" aria-label={`선택 ${pct(d.choiceShare)}, 운 ${pct(d.luckShare)}`}>
        <div className="choice" style={{ width: pct(Math.max(d.choiceShare, 0.02)) }}>
          {d.choiceShare > 0.1 && <>선택 {pct(d.choiceShare)}</>}
        </div>
        <div className="lk">운 {pct(d.luckShare)}</div>
      </div>
      <p className="hint">
        {d.choiceShare < 0.2
          ? '어떤 길을 고르느냐보다, 그 길에서 무슨 일이 생기느냐(결혼·실직·주가·집값)가 결과를 훨씬 크게 가릅니다.'
          : '이 조건에서는 어떤 길을 고르느냐가 결과를 꽤 크게 바꿉니다.'}{' '}
        선택 {pct(d.choiceShare)} · 운 {pct(d.luckShare)}
      </p>
    </div>
  );
}
