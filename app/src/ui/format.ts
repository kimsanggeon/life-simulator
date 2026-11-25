// 과도한 정밀성은 오히려 가짜처럼 보인다 → 억은 소수 1자리, 만원은 100만 단위로 반올림.
export function won(man: number): string {
  const sign = man < 0 ? '−' : '';
  const a = Math.abs(man);
  if (a >= 10000) {
    const eok = a / 10000;
    return `${sign}${eok >= 9.95 ? Math.round(eok) : eok.toFixed(1)}억`;
  }
  if (a >= 1000) return `${sign}${(Math.round(a / 100) * 100).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a / 10) * 10}만`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** 0.83 → "상위 17%" */
export function rankLabel(p: number): string {
  return `상위 ${Math.max(1, Math.round((1 - p) * 100))}%`;
}
