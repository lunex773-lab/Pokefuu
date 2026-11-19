/** 乱数の抽象化（テストで決定的にするため差し替え可能） */
export interface Rng {
  /** [0,1) */
  next(): number;
}

export const MathRng: Rng = { next: () => Math.random() };

/** シード付き乱数（mulberry32） */
export class SeededRng implements Rng {
  constructor(private seed: number) {}
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const randInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(rng.next() * (max - min + 1)) + min;

export const chance = (rng: Rng, p: number): boolean => rng.next() < p;

export function weightedPick<T>(rng: Rng, items: T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
