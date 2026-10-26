import { allStats, statByKey } from '../data/params';

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: '공식 통계',
  DERIVED: '통계에서 계산',
  ASSUMPTION: '모델 가정',
  TODO_VERIFY: '확인 필요',
};

/** 화면 숫자 옆에 붙이는 출처 표시 */
export function SourceTag({ keys }: { keys: string[] }) {
  const s = keys.map(statByKey).filter(Boolean);
  if (!s.length) return null;
  const title = [...new Set(s.map((x) => `${x!.source} (${x!.year})`))].join('\n');
  return (
    <a className="srctag" href="#sources" title={title}>
      출처 {[...new Set(s.map((x) => x!.year))].join('·')}
    </a>
  );
}

export function Sources() {
  return (
    <section className="sources" id="sources">
      <h2>이 시뮬레이션에 쓰인 숫자</h2>
      <p className="hint">
        <span className="st VERIFIED">공식 통계</span> 발표 자료 그대로 ·{' '}
        <span className="st DERIVED">통계에서 계산</span> 공식 통계를 가공 ·{' '}
        <span className="st ASSUMPTION">모델 가정</span> 공식 통계가 없어 정한 값(다음 단계에서 KLIPS 등으로 교체)
      </p>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th>값</th>
              <th>구분</th>
              <th>출처 · 기준연도</th>
            </tr>
          </thead>
          <tbody>
            {allStats.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>
                  {typeof s.value === 'number' ? s.value.toLocaleString('ko-KR') : s.value} {s.unit}
                </td>
                <td>
                  <span className={`st ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </td>
                <td>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.source}
                    </a>
                  ) : (
                    s.source
                  )}{' '}
                  · {s.year}
                  {s.note && <div className="hint">{s.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
