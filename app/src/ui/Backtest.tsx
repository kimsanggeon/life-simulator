import { useMemo } from 'react';
import bt from '../data/backtest.json';
import { buildParams } from '../data/params';
import { fitSavingsRate, runBacktest, type BacktestOpts, type BacktestResult, type Cohort } from '../engine/backtest';
import { pct, won } from './format';

const BASE = { stockShareOfFin: 0.1, runs: 1500, seed: 3 };
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

/** 기존: 모든 가구 같은 저축률·자산 구성 / 개선: 소득 분위별 저축률 + 자가·무주택 + 소득·자산 상관 */
const MODELS = [
  { key: 'uniform', label: '기존 (모든 가구 동일)', opts: BASE, grid: [0.05, 0.1, 0.125, 0.15, 0.175, 0.2, 0.25, 0.3] },
  {
    key: 'hetero',
    label: '개선 (가구마다 다르게)',
    opts: { ...BASE, hetero: { savingsByIncome: bt.savingsByIncome, incomeWealthRho: bt.incomeWealthRho } },
    grid: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  },
  {
    key: 'seoul',
    label: '개선 + 서울 집값',
    opts: { ...BASE, hetero: { savingsByIncome: bt.savingsByIncome, incomeWealthRho: bt.incomeWealthRho, seoul: 'top' as const } },
    grid: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  },
] as const;

type Run = { label: string; level: number; rows: { r: BacktestResult; oos: boolean }[] };

function summarize(run: Run) {
  const oos = run.rows.filter((x) => x.oos).map((x) => x.r);
  const avg = (f: (r: BacktestResult) => number) => oos.reduce((a, r) => a + f(r), 0) / oos.length;
  return {
    medErr: avg((r) => Math.abs(r.medianError)),
    meanErr: avg((r) => r.meanError),
    spread: avg((r) => r.sim.mean / r.sim.p50),
    actualSpread: avg((r) => r.cohort.actualEnd.mean / r.cohort.actualEnd.median),
    naive: avg((r) => Math.abs(r.cohort.netWorth.median / r.cohort.actualEnd.median - 1)),
    inBand: oos.filter((r) => r.medianInBand).length,
    n: oos.length,
  };
}

export function Backtest() {
  const runs: Run[] = useMemo(() => {
    const params = buildParams(35);
    const cohorts = bt.cohorts as Cohort[];
    const fitSet = cohorts.filter((c) => c.startYear <= 2013);
    return MODELS.map((m) => {
      const opts = m.opts as Omit<BacktestOpts, 'savingsRate'>;
      const level = fitSavingsRate(fitSet, params, opts, [...m.grid]).best;
      const rows = cohorts.map((c) => ({ r: runBacktest(c, params, { ...opts, savingsRate: level }), oos: c.startYear >= 2014 }));
      return { label: m.label, level, rows };
    });
  }, []);

  const [old, mid, now] = runs;
  const so = summarize(old);
  const sm = summarize(mid);
  const sn = summarize(now);

  return (
    <section className="panel backtest" id="backtest">
      <h2>
        <span className="n">✓</span>이 모델은 과거를 맞혔을까?
      </h2>
      <p className="lede small">
        2012~2015년 실제 가구(가구주 30대·40대)에서 출발해, 그 뒤 10년의 실제 주가·집값·금리를 그대로 재생하고, 10년 뒤 한 연령대 위
        가구의 실제 순자산과 비교했습니다. 저축 수준 하나만 2012·2013년 출발 코호트로 맞추고, 2014·2015년 출발 코호트는 맞춘 적 없는
        '표본 밖' 시험입니다.
      </p>

      <div className="wrap">
        <table className="years bt">
          <thead>
            <tr>
              <th>모델</th>
              <th>맞춘 저축 수준</th>
              <th>표본 밖 중간값 오차</th>
              <th>표본 밖 평균 오차</th>
              <th>평균 ÷ 중간값</th>
              <th>P10~P90 안</th>
            </tr>
          </thead>
          <tbody>
            {[
              { run: old, s: so, level: `소득의 ${pct(old.level)}` },
              { run: mid, s: sm, level: `공식 분위별 저축률 × ${mid.level.toFixed(1)}` },
              { run: now, s: sn, level: `공식 분위별 저축률 × ${now.level.toFixed(1)}` },
            ].map(({ run, s, level }) => (
              <tr key={run.label}>
                <td>{run.label}</td>
                <td>{level}</td>
                <td>±{pct(s.medErr)}</td>
                <td className="down">{signed(s.meanErr)}</td>
                <td>
                  {s.spread.toFixed(2)} <small>(실제 {s.actualSpread.toFixed(2)})</small>
                </td>
                <td>
                  {s.inBand}/{s.n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        '아무 변화 없음'으로 볼 때의 중간값 오차는 ±{pct(sn.naive)}. 개선 모델: 가계동향조사 근로자가구 소득 5분위별 저축률(8.6%~33%),
        순자산 상위 가구가 자가(30대 약 36%, 40대 약 63%), 소득과 순자산의 순위 상관 0.6(가계금융 소득 분위별 순자산에 맞춤).
        서울 집값: 자가 가구 중 17%(주택소유통계 2015 서울 소유 비중)가 KB 서울 아파트 지수를 따르고, 순자산이 많은 자가 가구부터
        배정. 2016~2025 누적 실질 상승률은 서울 아파트 +43%, 전국 아파트 +3%.
      </p>

      <h3>'개선 + 서울 집값' 모델의 코호트별 결과</h3>
      <div className="wrap">
        <table className="years bt">
          <thead>
            <tr>
              <th>출발</th>
              <th>10년 뒤</th>
              <th>출발 중간값</th>
              <th>실제 중간값</th>
              <th>모델 P10~P90</th>
              <th>모델 중간값</th>
              <th>오차</th>
              <th>실제 평균</th>
              <th>모델 평균</th>
              <th>오차</th>
              <th>기존 모델 평균 오차</th>
            </tr>
          </thead>
          <tbody>
            {now.rows.map(({ r, oos }, i) => (
              <tr key={r.cohort.startYear + r.cohort.group} className={oos ? 'oos' : ''}>
                <td>
                  {r.cohort.startYear} {r.cohort.group.slice(0, 2)}대{oos ? ' *' : ''}
                </td>
                <td>
                  {r.cohort.endYear} {r.cohort.endGroup.slice(0, 2)}대
                </td>
                <td>{won(r.cohort.netWorth.median)}</td>
                <td>
                  <b>{won(r.cohort.actualEnd.median)}</b>
                </td>
                <td>
                  {won(r.sim.p10)}~{won(r.sim.p90)}
                </td>
                <td>{won(r.sim.p50)}</td>
                <td className={Math.abs(r.medianError) < 0.1 ? 'up' : ''}>{signed(r.medianError)}</td>
                <td>{won(r.cohort.actualEnd.mean)}</td>
                <td>{won(r.sim.mean)}</td>
                <td className="down">{signed(r.meanError)}</td>
                <td className="down">{signed(old.rows[i].r.meanError)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        * 표본 밖 시험. 금액은 모두 2025년 물가 기준. 출처: 가계금융복지조사(KOSIS DT_1HDBA06·DT_1HDAAA06·DT_1HDBA03), 가계동향조사(DT_1L9U003),
        주택소유통계(DT_1OH0403), 등록센서스(DT_1MR2061), 한국은행 ECOS.
      </p>

      <h3>읽는 법</h3>
      <ul className="notes">
        <li>
          <b>가운데는 여전히 맞춘다.</b> 개선 모델의 표본 밖 중간값 오차는 ±{pct(sn.medErr)}입니다 (기존 ±{pct(so.medErr)}, 변화 없음 기준선
          ±{pct(sn.naive)}).
        </li>
        <li>
          <b>위쪽 꼬리가 실제에 가까워졌다.</b> 평균 오차가 {signed(so.meanErr)} → {signed(sm.meanErr)}(가구별 저축률·자가 구분) →{' '}
          {signed(sn.meanErr)}(서울 집값)로 줄었습니다. 소득이 높은 가구가 더 많이 저축하고, 그런 가구가 이미 자산이 많으며, 그중
          일부가 훨씬 더 오른 서울 아파트를 가졌다는 점이 격차를 만듭니다.
        </li>
        <li>
          <b>서울 자가를 누구로 볼지가 핵심.</b> 자가 가구 중 무작위로 고르면 평균 오차가 거의 줄지 않았습니다. 순자산이 많은 자가
          가구부터 서울로 배정해야 꼬리가 길어집니다. 이 배정은 공식 자료가 아닌 가정이며, 2012·2013년 맞춤 코호트에서 더 잘 맞는
          쪽을 골랐습니다. 참고로 같은 기간 수도권 가구 평균 순자산은 +78%, 비수도권은 +48%(명목, 가계금융 지역별) 늘었습니다.
        </li>
        <li>
          <b>아직 남은 차이.</b> 실제 분포는 평균이 중간값의 {sn.actualSpread.toFixed(2)}배로 조금 더 벌어집니다. 경기·인천은 ECOS에 별도
          지수가 없어 전국 지수를 쓰고, 가구마다 다른 대출 비율과 다주택은 빠져 있습니다.
        </li>
        <li>
          <b>한계.</b> 같은 가구를 추적한 자료가 아니라 해마다 다른 표본의 연령대 비교입니다. 가구 분리·결합, 2017년 조사 개편, 3월 기준
          조사와 연도별 수익률의 시차가 섞여 있습니다. 이 검증 결과는 현재 화면의 기본 저축률(직접 입력)을 바꾸지 않습니다.
        </li>
      </ul>
    </section>
  );
}
