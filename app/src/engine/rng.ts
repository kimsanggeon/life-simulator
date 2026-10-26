// 시드 고정 난수 (mulberry32). 같은 시드 → 같은 1,000개의 인생.
export type Rng = {
  next: () => number; // [0, 1)
  normal: () => number; // N(0, 1)
};

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  let spare: number | null = null;

  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Box–Muller
  const normal = () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };

  return { next, normal };
}
