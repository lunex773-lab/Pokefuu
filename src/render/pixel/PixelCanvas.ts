/**
 * ドット絵をコードで描くための最小キャンバス。
 * 生成したドット絵は Phaser のテクスチャとして登録する（外部画像ファイル不要）。
 * 将来は同じテクスチャキーで本番素材（PNG）に差し替えられる。
 */
export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA>();
export function rgba(hex: string, alpha = 255): RGBA {
  const key = `${hex}|${alpha}`;
  const c = cache.get(key);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const v: RGBA = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha];
  cache.set(key, v);
  return v;
}

export const toHex = ([r, g, b]: RGBA | [number, number, number]): string =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

/** 明度を変える（f>1で明るく） */
export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = rgba(hex);
  if (f >= 1) {
    const t = f - 1;
    return toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
  }
  return toHex([r * f, g * f, b * f]);
}

export function mixHex(a: string, b: string, t: number): string {
  const x = rgba(a);
  const y = rgba(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export class PixelCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): RGBA {
    if (!this.inBounds(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alpha(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  set(x: number, y: number, color: string | RGBA, alpha?: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inBounds(x, y)) return;
    const c = typeof color === 'string' ? rgba(color, alpha ?? 255) : color;
    const i = (y * this.w + x) * 4;
    if (c[3] >= 255 || this.data[i + 3] === 0) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = c[3];
      return;
    }
    // アルファ合成
    const a = c[3] / 255;
    this.data[i] = this.data[i] * (1 - a) + c[0] * a;
    this.data[i + 1] = this.data[i + 1] * (1 - a) + c[1] * a;
    this.data[i + 2] = this.data[i + 2] * (1 - a) + c[2] * a;
    this.data[i + 3] = Math.max(this.data[i + 3], c[3]);
  }

  clearPx(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.data[(y * this.w + x) * 4 + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, color: string | RGBA, alpha?: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color, alpha);
  }

  hline(x0: number, x1: number, y: number, color: string): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, color);
  }

  vline(x: number, y0: number, y1: number, color: string): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string, alpha?: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35);
        const dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, color, alpha);
      }
    }
  }

  circle(cx: number, cy: number, r: number, color: string, alpha?: number): void {
    this.ellipse(cx, cy, r, r, color, alpha);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string, alpha?: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** 多角形の塗りつぶし */
  poly(points: [number, number][], color: string, alpha?: number): void {
    const ys = points.map((p) => p[1]);
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) this.set(x, y, color, alpha);
    }
  }

  /** 範囲内にランダムな点を散らす（質感） */
  speckle(x: number, y: number, w: number, h: number, colors: string[], density: number, rnd: () => number): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (rnd() < density) this.set(x + i, y + j, colors[Math.floor(rnd() * colors.length)]);
  }

  /** 不透明部分の外周に輪郭線を付ける */
  outline(color: string, region?: { x: number; y: number; w: number; h: number }): void {
    const r = region ?? { x: 0, y: 0, w: this.w, h: this.h };
    const marks: [number, number][] = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        const inR = (xx: number, yy: number) => xx >= r.x && yy >= r.y && xx < r.x + r.w && yy < r.y + r.h && this.alpha(xx, yy) > 128;
        if (inR(x - 1, y) || inR(x + 1, y) || inR(x, y - 1) || inR(x, y + 1)) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.set(x, y, color);
  }

  /** 左上から光が当たる想定で、縁を明暗付けする（近代的な立体感） */
  rimShade(region?: { x: number; y: number; w: number; h: number }, light = 1.18, dark = 0.72): void {
    const r = region ?? { x: 0, y: 0, w: this.w, h: this.h };
    const src = this.data.slice();
    const a = (x: number, y: number) => (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (a(x, y) === 0) continue;
        const i = (y * this.w + x) * 4;
        let f = 1;
        if (a(x - 1, y) === 0 || a(x, y - 1) === 0) f = light;
        else if (a(x + 1, y) === 0 || a(x, y + 1) === 0) f = dark;
        if (f === 1) continue;
        for (let k = 0; k < 3; k++) {
          const v = src[i + k];
          this.data[i + k] = f > 1 ? v + (255 - v) * (f - 1) : v * f;
        }
      }
    }
  }

  /** 別キャンバスを貼り付け */
  blit(src: PixelCanvas, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(flipX ? src.w - 1 - x : x, y);
        if (c[3] > 0) this.set(dx + x, dy + y, c);
      }
    }
  }

  /** 範囲の色をピクセル単位で変換 */
  mapColors(region: { x: number; y: number; w: number; h: number }, fn: (c: RGBA, x: number, y: number) => RGBA): void {
    for (let y = region.y; y < region.y + region.h; y++) {
      for (let x = region.x; x < region.x + region.w; x++) {
        const i = (y * this.w + x) * 4;
        if (this.data[i + 3] === 0) continue;
        const c = fn([this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]], x, y);
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
        this.data[i + 3] = c[3];
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

/** 決定的な乱数（テクスチャ生成を毎回同じ見た目にする） */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
