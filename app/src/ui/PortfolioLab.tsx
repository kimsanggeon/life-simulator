// 내 돈 나눠 담기 — 예금·국내 주식·미국 주식·금·달러·집 비율을 바꾸면 미래가 어떻게 달라지나
import { useEffect, useMemo, useState } from 'react';
import type { Allocation } from '../engine/types';
import type { MixResult } from '../engine/worker';
import { ASSETS, COMPARE_MIXES, normalize, type AssetKey } from '../data/presets';
import { pct, won } from './format';

type Props = {
  requestMixes: (mixes: { id: string; label: string; a: Allocation }[]) => Promise<MixResult[]>;
  initial: Allocation;
  onUse: (a: Allocation) => void;
  endAge: number;
  /** 입력(나이·연봉 등)이 바뀌면 다시 계산 */
  resetKey: string;
};

const signed = (x: number) => {
  const n = Math.round(x * 100);
  return n === 0 ? '0%' : `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
};

function toWeights(a: Allocation): Record<AssetKey, number> {
  return {
    deposit: Math.round(a.deposit * 100),
    stock: Math.round(a.stock * 100),
    usStock: Math.round((a.usStock ?? 0) * 100),
    gold: Math.round((a.gold ?? 0) * 100),
    dollar: Math.round((a.dollar ?? 0) * 100),
    house: Math.round((a.house + (a.houseSeoul ?? 0)) * 100),
  };
}

export function PortfolioLab({ requestMixes, initial, onUse, endAge, resetKey }: Props) {
  const [w, setW] = useState(() => toWeights(initial));
  const [rows, setRows] = useState<MixResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = useMemo(() => normalize(w), [w]);
  const total = ASSETS.reduce((s, a) => s + w[a.key], 0);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      const res = await requestMixes([{ id: 'mine', label: '내 조합', a: mine }, ...COMPARE_MIXES]);
      if (alive) {
        setRows(res);
        setBusy(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // requestMixes는 매 렌더 새로 만들어지므로 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, resetKey]);

  const share = (k: AssetKey) => (total ? w[k] / total : 0);

  return (
    <div className="lab">
      <h3>내 돈 나눠 담기 — 어디에 굴리면 어떻게 될까?</h3>
      <p className="hint">
        모은 돈과 앞으로 저축할 돈을 어디에 얼마나 나눠 둘지 정해 보세요. 지난 30년(1996~2025)의 실제 주가·금값·환율·집값을 그대로 재생해
        1,000번 돌립니다.
      </p>

      <div className="lab-sliders">
        {ASSETS.map((a) => (
          <label key={a.key} className="lab-row">
            <span className="lab-name">
              <i style={{ background: a.color }} />
              {a.label}
            </span>
            <input type="range" min={0} max={100} step={5} value={w[a.key]} onChange={(e) => setW({ ...w, [a.key]: +e.target.value })} />
            <b>{pct(share(a.key))}</b>
          </label>
        ))}
        <div className="lab-stack" aria-hidden>
          {ASSETS.map((a) => (
            <i key={a.key} style={{ width: `${share(a.key) * 100}%`, background: a.color }} />
          ))}
        </div>
        {total !== 100 && total > 0 && <p className="hint">막대 합이 {total}이라 비율로 나눠 계산합니다 (위 %가 실제 비중).</p>}
        {total === 0 && <p className="hint">하나 이상 골라 주세요. 지금은 모두 예금으로 계산합니다.</p>}
      </div>

      <div className={`lab-cards ${busy ? 'busy' : ''}`}>
        {(rows ?? []).map((r) => (
          <article key={r.id} className={`lab-card ${r.id === 'mine' ? 'mine' : ''}`}>
            <h4>{r.label}</h4>
            <p className="lab-mid">
              {endAge}세 보통 <b>{won(r.end.p50)}</b>
            </p>
            <p className="lab-range">
              운 나쁠 때 {won(r.end.p10)} ~ 좋을 때 {won(r.end.p90)}
            </p>
            <dl>
              <dt>가장 나빴던 해 (보통)</dt>
              <dd className={r.worst.p50 < -0.15 ? 'down' : ''}>모은 돈 {signed(r.worst.p50)}</dd>
              {r.crisis.map((c) => (
                <div key={c.from} className="lab-crisis">
                  <dt>{c.from}년부터 그대로 겪으면</dt>
                  <dd>
                    {won(c.p50)} <small>(최악의 해 {signed(c.worst)})</small>
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {!rows && <p className="hint">조합마다 1,000번씩 계산하는 중…</p>}
      </div>

      <div className="lab-actions">
        <button className="primary" onClick={() => onUse(mine)}>
          이 조합으로 위 결과 보기
        </button>
      </div>
      <ul className="notes">
        <li>1997년에는 국내 주식이 −43%일 때 달러는 +103%, 2008년에는 국내 주식 −41%일 때 금·달러가 각각 +31%였습니다. 섞으면 가장 나쁜 해가 덜 나빠지는 이유입니다.</li>
        <li>
          추천이 아니라 과거 30년을 재생한 결과입니다. 과거 수익률이 앞으로도 같다는 보장은 없어요. 미국 주식은 배당 제외, 수수료·세금·환전 비용은 모두
          빠져 있습니다.
        </li>
        <li>코인은 2013년 이후 자료뿐이라 1997·2008 같은 위기를 겪어 본 적이 없어, 다음에 별도 '실험실'로 다룰 예정입니다.</li>
      </ul>
    </div>
  );
}
