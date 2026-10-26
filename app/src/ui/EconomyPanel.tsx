import type { Economy, ScenarioResult } from '../engine/types';
import { historyYears } from '../data/params';

const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

type Props = { result: ScenarioResult; economy: Economy };

export function EconomyPanel({ result, economy }: Props) {
  if (economy.mode === 'normal') {
    return (
      <div className="econ">
        <h3>경제 흐름: 평균만 사용</h3>
        <p className="hint">1996~2025년 실제 수익률의 평균·표준편차로 만든 정규분포입니다. 위기가 여러 해 이어지는 모양과, 위기 때 실직이 늘어나는 연동은 빠집니다.</p>
      </div>
    );
  }
  if (economy.mode === 'replay') {
    const seq = historyYears.slice(historyYears.findIndex((r) => r.year === economy.from)).slice(0, 6);
    return (
      <div className="econ">
        <h3>{economy.from}년부터 그대로 다시 산다면</h3>
        <p className="hint">1,000명 모두 같은 경제를 겪습니다. 남은 폭은 개인 소득과 인생 사건의 운입니다. 2025년 다음은 1996년으로 이어집니다.</p>
        <YearTable rows={seq} />
      </div>
    );
  }
  const top = (result.badYears ?? []).slice(0, 4);
  const rows = top.map((b) => ({ ...historyYears.find((r) => r.year === b.year)!, lift: b.lift }));
  return (
    <div className="econ">
      <h3>가장 나빴던 10% 인생에 자주 끼어 있던 해</h3>
      <p className="hint">
        각 인생은 1996~2025년 중 무작위로 고른 연도를 5년씩 이어 붙여 겪습니다. 주가·집값·금리·실직이 그 해 실제 값대로 함께 움직입니다.
        아래 배수는 하위 10% 인생에 그 해가 평균보다 몇 배 자주 나왔는지입니다.
      </p>
      <YearTable rows={rows} />
    </div>
  );
}

function YearTable({ rows }: { rows: ((typeof historyYears)[number] & { lift?: number })[] }) {
  return (
    <div className="wrap">
      <table className="years">
        <thead>
          <tr>
            <th>연도</th>
            {rows[0]?.lift !== undefined && <th>배수</th>}
            <th>KOSPI</th>
            <th>아파트</th>
            <th>예금</th>
            <th>실업률</th>
            <th>성장률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              {r.lift !== undefined && <td>{r.lift.toFixed(1)}배</td>}
              <td className={r.stock < 0 ? 'down' : 'up'}>{signed(r.stock)}</td>
              <td className={r.house < 0 ? 'down' : 'up'}>{signed(r.house)}</td>
              <td>{signed(r.deposit)}</td>
              <td>{r.unemployment.toFixed(1)}%</td>
              <td>{r.gdp.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">수익률은 물가를 뺀 실질 값. 출처: 한국은행 ECOS (KOSPI·배당, KB 아파트 전국, 저축성수신금리, 실업률, 실질성장률).</p>
    </div>
  );
}
