import type { Allocation } from '../engine/types';

/** 모은 돈을 굴리는 방식 (화면 선택지와 '확률 올리는 법' 비교에 함께 쓴다) */
export const PRESETS: Record<string, { label: string; how: string; a: Allocation }> = {
  safe: { label: '예금 위주', how: '예금 위주로', a: { deposit: 0.8, stock: 0.1, house: 0.1 } },
  mid: { label: '골고루', how: '골고루 나눠', a: { deposit: 0.4, stock: 0.3, house: 0.3 } },
  home: { label: '집 위주', how: '집 위주로', a: { deposit: 0.2, stock: 0.1, house: 0.7 } },
  bold: { label: '주식 위주', how: '주식 위주로', a: { deposit: 0.2, stock: 0.7, house: 0.1 } },
};
