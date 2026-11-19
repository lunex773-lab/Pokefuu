import type { GameState } from '../state/GameState';

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (text: string, size: number): Uint8Array => {
  const out = new Uint8Array(size);
  try {
    const s = atob(text);
    for (let i = 0; i < Math.min(size, s.length); i++) out[i] = s.charCodeAt(i);
  } catch {
    /* 壊れていたら未踏破として扱う */
  }
  return out;
};

/**
 * 地図の「歩いて見たことのある場所」。マップごとに1マス1ビットで記録し、セーブに含める。
 * 地図画面は、ここに記録されたマスだけを描く。
 */
export class ExploreService {
  private cache = new Map<string, { cols: number; bits: Uint8Array }>();

  constructor(private readonly state: GameState) {}

  private grid(mapId: string, cols: number, rows: number): Uint8Array {
    const hit = this.cache.get(mapId);
    const size = Math.ceil((cols * rows) / 8);
    if (hit && hit.cols === cols && hit.bits.length === size) return hit.bits;
    const bits = fromBase64(this.state.explored?.[mapId] ?? '', size);
    this.cache.set(mapId, { cols, bits });
    return bits;
  }

  /** (cx, cy) の周り半径 r マスを、見たことのある場所にする。変化があれば true */
  reveal(mapId: string, cols: number, rows: number, cx: number, cy: number, r = 4): boolean {
    const bits = this.grid(mapId, cols, rows);
    let changed = false;
    for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + r) continue;
        const i = y * cols + x;
        const mask = 1 << (i & 7);
        if (bits[i >> 3] & mask) continue;
        bits[i >> 3] |= mask;
        changed = true;
      }
    }
    if (changed) {
      this.state.explored ??= {};
      this.state.explored[mapId] = toBase64(bits);
    }
    return changed;
  }

  isExplored(mapId: string, cols: number, rows: number, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const bits = this.grid(mapId, cols, rows);
    const i = y * cols + x;
    return !!(bits[i >> 3] & (1 << (i & 7)));
  }
}
