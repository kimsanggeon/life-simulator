// ② 한 번 더 살아보기 — 1,000개 인생 중 하나를 무작위로 꺼내 한 해씩 펼쳐 보인다
import { useEffect, useRef, useState } from 'react';
import type { Story } from '../engine/types';
import { shareAtLeast } from '../engine/simulate';
import { economyMoments, eventText } from './Story';
import { won } from './format';

type Props = {
  /** i번째 인생을 받아 온다 (워커에서 계산) */
  requestLife: (index: number) => Promise<Story>;
  runs: number;
  startAge: number;
  /** 마지막 해 순자산 분포 (101개 분위) — 이 인생이 몇 등인지 계산 */
  finalQuantiles: number[];
  scenarioLabel: string;
  /** 입력이 바뀌면 지금 보던 인생은 지운다 */
  resetKey: string;
};

type Line = { age: number; text: string; kind: string };

function linesOf(s: Story, startAge: number): Line[] {
  let births = 0;
  return [
    ...s.events.map((e) => ({ age: e.age, text: eventText(e, e.kind === 'birth' ? births++ : 0)!, kind: e.kind as string })),
    ...economyMoments(s, startAge),
  ].sort((a, b) => a.age - b.age);
}

const STEP_MS = 350;

export function ReplayLife({ requestLife, runs, startAge, finalQuantiles, scenarioLabel, resetKey }: Props) {
  const [story, setStory] = useState<Story | null>(null);
  const [index, setIndex] = useState(0);
  const [year, setYear] = useState(0); // 지금까지 펼친 해
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    setStory(null);
    setCount(0);
    seen.current.clear();
  }, [resetKey]);

  const T = story ? story.netWorth.length - 1 : 0;
  useEffect(() => {
    if (!story || year >= T) return;
    const id = setTimeout(() => setYear((y) => y + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [story, year, T]);

  async function draw() {
    if (seen.current.size >= runs) seen.current.clear();
    let i = Math.floor(Math.random() * runs);
    while (seen.current.has(i)) i = (i + 1) % runs;
    seen.current.add(i);
    setLoading(true);
    const s = await requestLife(i);
    setLoading(false);
    setStory(s);
    setIndex(i);
    setYear(0);
    setCount((c) => c + 1);
  }

  const done = story && year >= T;
  const lines = story ? linesOf(story, startAge).filter((l) => l.age < startAge + year) : [];
  const nw = story ? story.netWorth[year] : 0;
  const top = story ? shareAtLeast(finalQuantiles, story.netWorth[T]) : 0;

  return (
    <div className="replay">
      <h3>한 번 더 살아보기</h3>
      <p className="hint">1,000번의 인생 중 하나를 무작위로 꺼내, 한 해씩 펼쳐 봅니다. 누를 때마다 다른 인생이 나와요. ('{scenarioLabel}'을 고른 나)</p>

      <button className="dice" onClick={draw} disabled={loading || (!!story && !done)}>
        {loading ? '인생을 꺼내는 중…' : story ? '🎲 한 번 더 살아보기' : '🎲 인생 하나 꺼내 보기'}
      </button>
      {count > 1 && <span className="count">지금까지 {count}번 살아봤어요</span>}

      {story && (
        <div className="replay-body" aria-live="polite">
          <div className="replay-now">
            <span className="replay-no">#{(index + 1).toLocaleString('ko-KR')}번째 인생</span>
            <span className="replay-age">{startAge + year}세</span>
            <b className="replay-nw">{won(nw)}</b>
            <div className="replay-bar">
              <i style={{ width: `${(year / (T || 1)) * 100}%` }} />
            </div>
          </div>
          <ol className="replay-lines">
            {lines.length === 0 && <li className="quiet">{year === 0 ? '출발!' : '아직 조용한 나날…'}</li>}
            {lines.map((l, k) => (
              <li key={k} className={`${l.kind} pop`}>
                <span className="age">{l.age}세</span> {l.text}
              </li>
            ))}
          </ol>
          {done && (
            <p className="replay-end">
              {startAge + T}세, 순자산 <b>{won(story.netWorth[T])}</b>에 도착.
              <br />이 인생은 1,000명 중 <b>상위 {Math.max(1, Math.round(top * 100))}%</b>였어요.
              {top <= 0.1 ? ' 운이 아주 좋았던 인생이에요!' : top >= 0.9 ? ' 운이 많이 따르지 않았던 인생이에요.' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
