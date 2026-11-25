import { useEffect, useMemo, useRef, useState } from 'react';
import type { Allocation, Economy, Person, Scenario, ScenarioResult, Sex, SimOptions, Story } from './engine/types';
import type { LuckChoice as LC } from './engine/decompose';
import type { Lever, MixResult, WorkerRequest } from './engine/worker';
import { FanChart } from './ui/FanChart';
import { LuckChoice } from './ui/LuckChoice';
import { EventTimeline } from './ui/EventTimeline';
import { EconomyPanel } from './ui/EconomyPanel';
import { Backtest } from './ui/Backtest';
import { Sources, SourceTag } from './ui/Sources';
import { Headline, HundredDots, ThreeLives, CompareChoices, LuckBar } from './ui/Story';
import { ShareCard } from './ui/ShareCard';
import { GoalOdds } from './ui/GoalOdds';
import { ReplayLife } from './ui/ReplayLife';
import { PortfolioLab } from './ui/PortfolioLab';
import { won, rankLabel } from './ui/format';
import { incomePercentile, netWorthPercentile, defaults } from './data/params';
import { PRESETS } from './data/presets';

const COLORS = ['#2f6fdf', '#d9822b', '#b5389b'];



const CHOICES = [
  { id: 'stay', label: '회사 계속', desc: '지금 직장에서 계속 일한다' },
  { id: 'move', label: '이직', desc: '다른 회사로 옮긴다 (월급이 오를 수도, 내릴 수도)' },
  { id: 'startup', label: '창업', desc: '내 사업을 시작한다 (5년 뒤 살아남는 곳은 약 37%)' },
] as const;

type Out = { results: ScenarioResult[]; decomposition: LC; levers: Lever[] };

export default function App() {
  const [age, setAge] = useState(32);
  const [income, setIncome] = useState(defaults.income(32));
  const [netWorth, setNetWorth] = useState(defaults.netWorth(32));
  const [savingsRate, setSavingsRate] = useState(defaults.savingsRate);
  const [preset, setPreset] = useState('mid');
  const [customAlloc, setCustomAlloc] = useState<Allocation | null>(null);
  const [sex, setSex] = useState<Sex>('M');
  const [married, setMarried] = useState(false);
  const [children, setChildren] = useState(0);
  const [eventsOn, setEventsOn] = useState(true);
  const [econKey, setEconKey] = useState('history');
  const economy: Economy = useMemo(
    () => (econKey === 'history' ? { mode: 'history' } : econKey === 'normal' ? { mode: 'normal' } : { mode: 'replay', from: +econKey }),
    [econKey],
  );
  const [years, setYears] = useState(15);
  const [capital, setCapital] = useState(5000);
  const [pick, setPick] = useState<string>('stay');
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);

  const person: Person = useMemo(
    () => ({ age, income, netWorth, savingsRate, allocation: preset === 'custom' && customAlloc ? customAlloc : (PRESETS[preset] ?? PRESETS.mid).a, sex, married, children: married ? children : 0 }),
    [age, income, netWorth, savingsRate, preset, customAlloc, sex, married, children],
  );
  // 세 갈래는 항상 함께 계산한다 (비교용). 고른 길은 결과 화면의 주인공일 뿐.
  const scenarios: Scenario[] = useMemo(
    () => [
      { id: 'stay', label: '회사 계속', kind: 'stay' },
      { id: 'move', label: '이직', kind: 'jobChange' },
      { id: 'startup', label: '창업', kind: 'startup', startupCapital: capital },
    ],
    [capital],
  );

  const simOpt: SimOptions = useMemo(() => ({ runs: 1000, years, seed: 20261025, events: eventsOn, economy }), [years, eventsOn, economy]);

  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const lifeId = useRef(0);
  const waiters = useRef(new Map<number, (v: never) => void>());
  useEffect(() => {
    const w = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (
      e: MessageEvent<(Out & { kind: 'run'; id: number }) | { kind: 'life'; id: number; story: Story } | { kind: 'mixes'; id: number; mixes: MixResult[] }>,
    ) => {
      const d = e.data;
      if (d.kind === 'life' || d.kind === 'mixes') {
        const done = waiters.current.get(d.id) as ((v: Story | MixResult[]) => void) | undefined;
        done?.(d.kind === 'life' ? d.story : d.mixes);
        waiters.current.delete(d.id);
        return;
      }
      if (d.id !== reqId.current) return; // 오래된 응답 무시
      setOut(d);
      setBusy(false);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const id = ++reqId.current;
      setBusy(true);
      const req: WorkerRequest = { kind: 'run', id, person, scenarios, opt: simOpt, pick, preset };
      worker.current?.postMessage(req);
    }, 150);
    return () => clearTimeout(t);
  }, [person, scenarios, simOpt, pick, preset]);

  /** 한 번 더 살아보기: i번째 인생 하나만 워커에 부탁한다 */
  const ask = <T,>(make: (id: number) => WorkerRequest) =>
    new Promise<T>((resolve) => {
      const id = ++lifeId.current;
      waiters.current.set(id, resolve as (v: never) => void);
      worker.current?.postMessage(make(id));
    });
  const pickedScenario = scenarios.find((s) => s.id === pick) ?? scenarios[0];
  const requestLife = (index: number) => ask<Story>((id) => ({ kind: 'life', id, person, scenario: pickedScenario, opt: simOpt, index }));
  /** 내 돈 나눠 담기: 조합 여러 개를 한 번에 계산 */
  const requestMixes = (mixes: { id: string; label: string; a: Allocation }[]) =>
    ask<MixResult[]>((id) => ({ kind: 'mixes', id, person, scenario: pickedScenario, opt: simOpt, mixes }));

  const incP = incomePercentile(age, income);
  const nwP = netWorthPercentile(age, netWorth);
  const endAge = age + years;
  const activeIdx = out ? Math.max(0, out.results.findIndex((r) => r.scenario.id === pick)) : 0;
  const active = out?.results[activeIdx];

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">실제 한국 통계로 돌리는 인생 시뮬레이터</p>
        <h1>내 인생, 1,000번 살아보기</h1>
        <p className="lede">
          지금의 나를 입력하면, 결혼·출산·실직·주가·집값이 실제 통계 확률대로 다르게 일어나는 미래를 1,000번 돌려서 {years}년 뒤 내가 어디쯤
          있을지 보여 줍니다.
        </p>
        <ol className="how">
          <li>
            <b>1</b> 지금의 나
          </li>
          <li>
            <b>2</b> 고민 중인 길
          </li>
          <li>
            <b>3</b> 1,000번의 미래
          </li>
        </ol>
      </header>

      <section className="panel step">
        <h2>
          <span className="n">1</span>지금의 나는?
        </h2>
        <div className="inputs">
          <label className="field">
            <span>나이</span>
            <div className="big">{age}세</div>
            <input type="range" min={20} max={55} value={age} onChange={(e) => setAge(+e.target.value)} />
          </label>
          <div className="field">
            <span>성별</span>
            <div className="seg">
              {(['M', 'F'] as const).map((v) => (
                <button key={v} className={sex === v ? 'on' : ''} onClick={() => setSex(v)}>
                  {v === 'M' ? '남' : '여'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>결혼</span>
            <div className="seg">
              <button className={!married ? 'on' : ''} onClick={() => setMarried(false)}>
                아직
              </button>
              <button className={married ? 'on' : ''} onClick={() => setMarried(true)}>
                했어요
              </button>
            </div>
            {married && (
              <div className="seg small">
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} className={children === n ? 'on' : ''} onClick={() => setChildren(n)}>
                    {n === 0 ? '자녀 없음' : n === 3 ? '3명+' : `${n}명`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="field">
            <span>연봉 (세전)</span>
            <div className="money">
              <input type="number" min={0} step={100} value={income} onChange={(e) => setIncome(Math.max(0, +e.target.value))} />
              <em>만원</em>
            </div>
            <small className="chip">
              같은 나이대 직장인 중 <b>{rankLabel(incP.p)}</b> <SourceTag keys={incP.keys} />
            </small>
          </label>
          <label className="field">
            <span>{married ? '부부가 모은 돈 (빚 빼고)' : '모은 돈 (빚 빼고)'}</span>
            <div className="money">
              <input type="number" step={500} value={netWorth} onChange={(e) => setNetWorth(+e.target.value)} />
              <em>만원</em>
            </div>
            <small className="chip">
              {won(netWorth)} · 같은 나이대 가구 중 <b>{rankLabel(nwP.p)}</b> <SourceTag keys={nwP.keys} />
            </small>
          </label>
        </div>

        <details className="more">
          <summary>더 자세히 설정하기 (저축·투자·경제 흐름)</summary>
          <div className="inputs">
            <label className="field">
              <span>연봉 중 저축하는 비율 {Math.round(savingsRate * 100)}%</span>
              <input type="range" min={0} max={60} value={Math.round(savingsRate * 100)} onChange={(e) => setSavingsRate(+e.target.value / 100)} />
            </label>
            <div className="field">
              <span>모은 돈을 주로 어디에?</span>
              <div className="seg small">
                {preset === 'custom' && <button className="on">직접 만든 조합</button>}
                {Object.entries(PRESETS).map(([k, v]) => (
                  <button key={k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>창업할 때 넣을 돈</span>
              <div className="money">
                <input type="number" min={0} step={500} value={capital} onChange={(e) => setCapital(Math.max(0, +e.target.value))} />
                <em>만원</em>
              </div>
            </label>
            <label className="field">
              <span>경제 흐름</span>
              <select value={econKey} onChange={(e) => setEconKey(e.target.value)}>
                <option value="history">지난 30년(1996~2025) 중 무작위</option>
                <option value="1997">1997년 외환위기부터 그대로</option>
                <option value="2008">2008년 금융위기부터 그대로</option>
                <option value="2020">2020년 코로나·집값 급등락부터 그대로</option>
                <option value="normal">평균만 (위기 없이 고르게)</option>
              </select>
            </label>
            <label className="field toggle">
              <span>결혼·출산·실직 같은 인생 사건 넣기</span>
              <input type="checkbox" checked={eventsOn} onChange={(e) => setEventsOn(e.target.checked)} />
            </label>
          </div>
        </details>
      </section>

      <section className="panel step">
        <h2>
          <span className="n">2</span>어떤 길을 고민 중인가요?
        </h2>
        <div className="choices">
          {CHOICES.map((c) => (
            <button key={c.id} className={`choice-card ${pick === c.id ? 'on' : ''}`} onClick={() => setPick(c.id)}>
              <b>{c.label}</b>
              <span>{c.desc}</span>
            </button>
          ))}
        </div>
        <div className="field inline">
          <span>몇 년 뒤를 볼까요?</span>
          <div className="seg">
            {[10, 15, 20].map((y) => (
              <button key={y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>
                {y}년 뒤 ({age + y}세)
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`panel step result ${busy ? 'busy' : ''}`} aria-busy={busy}>
        <h2>
          <span className="n">3</span>
          {endAge}세의 나, 1,000번의 미래
        </h2>
        {out && active ? (
          <>
            <Headline
              result={active}
              startAge={age}
              startNetWorth={netWorth}
              endRank={netWorthPercentile(endAge, active.netWorth[active.netWorth.length - 1].p50).p}
            />
            {active.hundred && <HundredDots values={active.hundred} />}
            {active.stories && <ThreeLives stories={active.stories} startAge={age} scenarioLabel={active.scenario.label} />}
            <CompareChoices results={out.results} d={out.decomposition} activeId={pick} onPick={setPick} />
            <PortfolioLab
              requestMixes={requestMixes}
              initial={person.allocation}
              onUse={(a) => {
                setCustomAlloc(a);
                setPreset('custom');
                document.querySelector('.headline')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              endAge={endAge}
              resetKey={JSON.stringify([age, income, netWorth, savingsRate, sex, married, children, pick, simOpt])}
            />
            <GoalOdds results={out.results} levers={out.levers} activeId={pick} startAge={age} />
            <ReplayLife
              requestLife={requestLife}
              runs={simOpt.runs}
              startAge={age}
              finalQuantiles={active.nwQuantiles![active.nwQuantiles!.length - 1]}
              scenarioLabel={active.scenario.label}
              resetKey={JSON.stringify([person, pick, simOpt])}
            />
            <LuckBar d={out.decomposition} />
            <ShareCard person={person} results={out.results} activeId={pick} decomposition={out.decomposition} />
          </>
        ) : (
          <p className="hint">1,000번의 인생을 계산하는 중…</p>
        )}
        <p className="disclaimer">
          참고용 시뮬레이션이며 재무·투자 권유가 아닙니다. 모든 금액은 오늘 물가 기준입니다. 한 사람의 미래를 맞히는 것이 아니라, 비슷한
          조건의 사람들이 어디쯤 흩어지는지를 보여 줍니다.
        </p>
      </section>

      <section className="panel deep">
        <h2>자세히 보기</h2>
        <details>
          <summary>해마다 어떻게 변하는지 (그래프)</summary>
          {out && <FanChart results={out.results} colors={COLORS} active={activeIdx} onActive={(i) => setPick(out.results[i].scenario.id)} />}
        </details>
        <details>
          <summary>선택 효과와 운의 폭 (자세한 수치)</summary>
          {out && <LuckChoice d={out.decomposition} results={out.results} colors={COLORS} endAge={endAge} />}
        </details>
        <details>
          <summary>몇 살까지 결혼·출산·실직을 겪을 확률</summary>
          {active && <EventTimeline result={active} startAge={age} />}
        </details>
        <details>
          <summary>어떤 경제를 겪었나 (실제 과거 연도)</summary>
          {active && <EconomyPanel result={active} economy={economy} />}
        </details>
        <details>
          <summary>이 모델은 과거를 맞혔을까? (검증)</summary>
          <Backtest />
        </details>
        <details>
          <summary>이 숫자들은 어디서 왔나요? (출처)</summary>
          <Sources />
        </details>
      </section>
    </div>
  );
}
