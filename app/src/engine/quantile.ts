// 분위수 계산과 '또래 중 몇 % 위치' 계산.

/** 정렬된 배열의 p분위(0~1), 선형 보간 */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const idx = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function quantiles(values: ArrayLike<number>, ps: number[]): number[] {
  const sorted = Float64Array.from(values).sort();
  return ps.map((p) => quantileSorted(sorted, p));
}

/**
 * 분위 앵커(예: P10, P50, P90 실제값) 사이를 구간별 선형 보간해
 * 어떤 값이 몇 분위인지 돌려준다. 앵커 밖은 끝 구간 기울기로 외삽 후 [0.01, 0.99]로 자른다.
 * 앵커는 통계표에 나온 그대로 쓰기 때문에, 분포 모양을 가정하지 않는다.
 */
export function percentileFromAnchors(value: number, anchors: { p: number; v: number }[]): number {
  const a = [...anchors].sort((x, y) => x.p - y.p);
  if (a.length < 2) return 0.5;
  let i = 0;
  if (value <= a[0].v) i = 0;
  else if (value >= a[a.length - 1].v) i = a.length - 2;
  else while (i < a.length - 2 && value > a[i + 1].v) i++;
  const { p: p0, v: v0 } = a[i];
  const { p: p1, v: v1 } = a[i + 1];
  const p = v1 === v0 ? p0 : p0 + ((value - v0) / (v1 - v0)) * (p1 - p0);
  return Math.min(0.99, Math.max(0.01, p));
}

/** 분위 앵커로부터 p분위 값을 역으로 구한다 (percentileFromAnchors의 역함수). */
export function valueFromAnchors(p: number, anchors: { p: number; v: number }[]): number {
  const a = [...anchors].sort((x, y) => x.p - y.p);
  let i = 0;
  if (p <= a[0].p) i = 0;
  else if (p >= a[a.length - 1].p) i = a.length - 2;
  else while (i < a.length - 2 && p > a[i + 1].p) i++;
  const { p: p0, v: v0 } = a[i];
  const { p: p1, v: v1 } = a[i + 1];
  return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0);
}
