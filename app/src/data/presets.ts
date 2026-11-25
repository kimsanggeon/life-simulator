import type { Allocation } from '../engine/types';

/** 모은 돈을 굴리는 방식 (화면 선택지와 '확률 올리는 법' 비교에 함께 쓴다) */
export const PRESETS: Record<string, { label: string; how: string; a: Allocation }> = {
  safe: { label: '예금 위주', how: '예금 위주로', a: { deposit: 0.8, stock: 0.1, house: 0.1 } },
  mid: { label: '골고루', how: '골고루 나눠', a: { deposit: 0.4, stock: 0.3, house: 0.3 } },
  home: { label: '집 위주', how: '집 위주로', a: { deposit: 0.2, stock: 0.1, house: 0.7 } },
  bold: { label: '주식 위주', how: '주식 위주로', a: { deposit: 0.2, stock: 0.7, house: 0.1 } },
};

/** '내 돈 나눠 담기'에서 조절하는 투자 대상 */
export const ASSETS = [
  { key: 'deposit', label: '예금', color: '#9aa4b2' },
  { key: 'stock', label: '국내 주식', color: '#2f6fdf' },
  { key: 'usStock', label: '미국 주식', color: '#7a5af5' },
  { key: 'gold', label: '금', color: '#d4a017' },
  { key: 'dollar', label: '달러', color: '#2a9d6f' },
  { key: 'house', label: '집 (전국 아파트)', color: '#d9822b' },
] as const;
export type AssetKey = (typeof ASSETS)[number]['key'];

/** 비교용 기본 조합 (추천이 아니라 서로 다른 성격을 보여 주는 예시) */
export const COMPARE_MIXES: { id: string; label: string; a: Allocation }[] = [
  { id: 'deposit', label: '예금만', a: { deposit: 1, stock: 0, house: 0 } },
  { id: 'kospi', label: '국내 주식만', a: { deposit: 0, stock: 1, house: 0 } },
  { id: 'us', label: '미국 주식만', a: { deposit: 0, stock: 0, house: 0, usStock: 1 } },
  { id: 'spread', label: '골고루 섞기', a: { deposit: 0.2, stock: 0.2, house: 0, usStock: 0.2, gold: 0.2, dollar: 0.2 } },
];

/** 비율 합이 1이 되게 정리 */
export function normalize(w: Record<AssetKey, number>): Allocation {
  const sum = ASSETS.reduce((s, a) => s + Math.max(0, w[a.key] ?? 0), 0);
  if (!sum) return { deposit: 1, stock: 0, house: 0 };
  const v = (k: AssetKey) => Math.max(0, w[k] ?? 0) / sum;
  return { deposit: v('deposit'), stock: v('stock'), house: v('house'), usStock: v('usStock'), gold: v('gold'), dollar: v('dollar') };
}
