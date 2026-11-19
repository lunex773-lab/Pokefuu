import type { TileDef } from '@/domain/types';
import { mixHex, PixelCanvas, seeded, shadeHex, hashString, type RGBA } from '../pixel/PixelCanvas';

const T = 32;
type Gen = (pc: PixelCanvas, ox: number, oy: number, c: string[], rnd: () => number, frame: number) => void;

const fill = (pc: PixelCanvas, ox: number, oy: number, color: string) => pc.rect(ox, oy, T, T, color);

/** タイル生成関数（tiles.json の gen キーに対応） */
const gens: Record<string, Gen> = {
  empty: () => {},
  grass: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.22, rnd);
    for (let k = 0; k < 7; k++) {
      const x = ox + Math.floor(rnd() * 30) + 1;
      const y = oy + Math.floor(rnd() * 28) + 2;
      pc.set(x, y, c[1]);
      pc.set(x, y - 1, shadeHex(c[1], 1.15));
      pc.set(x + 1, y, c[2]);
    }
  },
  flowers: (pc, ox, oy, c, rnd) => {
    gens.grass(pc, ox, oy, c, rnd, 0);
    for (let k = 0; k < 5; k++) {
      const x = ox + 3 + Math.floor(rnd() * 26);
      const y = oy + 3 + Math.floor(rnd() * 26);
      const col = k % 2 ? c[2] : c[3];
      pc.set(x, y, col);
      pc.set(x - 1, y, col);
      pc.set(x + 1, y, col);
      pc.set(x, y - 1, col);
      pc.set(x, y + 1, col);
      pc.set(x, y, '#f8f0a0');
    }
  },
  dirt: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.3, rnd);
  },
  asphalt: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.35, rnd);
  },
  roadline: (pc, ox, oy, c, rnd) => {
    gens.asphalt(pc, ox, oy, [c[0], c[1], shadeHex(c[0], 0.88)], rnd, 0);
    pc.rect(ox + 4, oy + 15, 24, 2, c[2]);
  },
  crosswalk: (pc, ox, oy, c, rnd) => {
    gens.asphalt(pc, ox, oy, [c[0], shadeHex(c[0], 1.1), shadeHex(c[0], 0.9)], rnd, 0);
    for (let x = 2; x < 32; x += 8) pc.rect(ox + x, oy, 5, T, c[1]);
  },
  pavers: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 8) {
      const off = (y / 8) % 2 ? 8 : 0;
      pc.hline(ox, ox + T - 1, oy + y, c[1]);
      for (let x = off; x < T; x += 16) pc.vline(ox + x, oy + y, oy + y + 7, c[1]);
    }
    pc.speckle(ox, oy, T, T, [c[2]], 0.08, rnd);
  },
  wood: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 8) {
      pc.hline(ox, ox + T - 1, oy + y, c[1]);
      const seam = Math.floor(rnd() * 28) + 2;
      pc.vline(ox + seam, oy + y, oy + y + 7, c[1]);
      for (let k = 0; k < 6; k++) pc.set(ox + Math.floor(rnd() * T), oy + y + 2 + Math.floor(rnd() * 5), c[2]);
    }
  },
  linoleum: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.hline(ox, ox + T - 1, oy, c[1]);
    pc.vline(ox, oy, oy + T - 1, c[1]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.08, rnd);
    pc.rect(ox + 3, oy + 3, 6, 1, c[2]);
  },
  tatami: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 2) pc.hline(ox + 1, ox + T - 2, oy + y, c[1]);
    pc.rect(ox, oy, T, 2, c[2]);
    pc.speckle(ox, oy, T, T, [shadeHex(c[0], 1.08)], 0.05, rnd);
  },
  concrete: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.25, rnd);
  },
  checker: (pc, ox, oy, c) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) pc.rect(ox + x * 16, oy + y * 16, 16, 16, (x + y) % 2 ? c[1] : c[0]);
  },
  stairs: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 8) {
      pc.rect(ox, oy + y, T, 2, c[2]);
      pc.rect(ox, oy + y + 6, T, 2, c[1]);
    }
  },
  carpet: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.3, rnd);
  },
  water: (pc, ox, oy, c, rnd, frame) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1]], 0.15, rnd);
    for (let k = 0; k < 4; k++) {
      const y = oy + 4 + k * 8;
      const x = ox + ((k * 11 + frame * 4) % 24);
      pc.hline(x, x + 5, y, c[2]);
      pc.hline(x + 2, x + 3, y - 1, shadeHex(c[2], 1.2));
    }
  },
  crack: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1]], 0.3, rnd);
    let x = ox + Math.floor(rnd() * T);
    let y = oy;
    while (y < oy + T) {
      pc.set(x, y, c[2]);
      x += Math.floor(rnd() * 3) - 1;
      y += 1;
    }
  },
  void: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1]], 0.06, rnd);
  },
  siding: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 4) pc.hline(ox, ox + T - 1, oy + y + 3, c[1]);
    pc.rect(ox, oy + T - 3, T, 3, c[2]);
  },
  roof: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 6) {
      pc.hline(ox, ox + T - 1, oy + y + 5, c[2]);
      const off = (y / 6) % 2 ? 4 : 0;
      for (let x = off; x < T; x += 8) pc.vline(ox + x, oy + y, oy + y + 5, c[1]);
      pc.hline(ox, ox + T - 1, oy + y, shadeHex(c[0], 1.12));
    }
  },
  window: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    pc.rect(ox + 6, oy + 6, 20, 18, shadeHex(c[0], 0.6));
    pc.rect(ox + 7, oy + 7, 18, 16, c[1]);
    pc.vline(ox + 16, oy + 7, oy + 22, shadeHex(c[0], 0.6));
    pc.hline(ox + 7, ox + 24, oy + 15, shadeHex(c[0], 0.6));
    pc.line(ox + 9, oy + 21, ox + 13, oy + 9, shadeHex(c[1], 1.4));
    pc.rect(ox + 5, oy + 24, 22, 2, shadeHex(c[0], 0.8));
  },
  door: (pc, ox, oy, c) => {
    fill(pc, ox, oy, shadeHex(c[0], 0.8));
    pc.rect(ox + 6, oy + 2, 20, 30, c[1]);
    pc.rect(ox + 7, oy + 3, 18, 29, c[0]);
    pc.rect(ox + 9, oy + 6, 14, 8, shadeHex(c[0], 0.85));
    pc.rect(ox + 9, oy + 18, 14, 10, shadeHex(c[0], 0.85));
    pc.rect(ox + 21, oy + 16, 2, 3, c[2]);
  },
  concwall: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1]], 0.12, rnd);
    pc.hline(ox, ox + T - 1, oy + 15, c[1]);
    pc.rect(ox, oy + T - 3, T, 3, c[2]);
  },
  glassdoor: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[2]);
    pc.rect(ox + 2, oy + 2, 13, 30, c[1]);
    pc.rect(ox + 17, oy + 2, 13, 30, c[1]);
    pc.line(ox + 4, oy + 26, ox + 10, oy + 6, '#e8f4ff');
    pc.line(ox + 19, oy + 26, ox + 25, oy + 6, '#e8f4ff');
  },
  intwall: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    pc.rect(ox, oy + 24, T, 8, c[1]);
    pc.hline(ox, ox + T - 1, oy + 24, c[2]);
    pc.hline(ox, ox + T - 1, oy + T - 1, c[2]);
  },
  fence: (pc, ox, oy, c) => {
    pc.rect(ox, oy + 10, T, 3, c[0]);
    pc.rect(ox, oy + 22, T, 3, c[0]);
    for (let x = 2; x < T; x += 6) {
      pc.rect(ox + x, oy + 6, 3, 24, c[2]);
      pc.vline(ox + x + 2, oy + 6, oy + 29, c[1]);
    }
  },
  blockwall: (pc, ox, oy, c) => {
    fill(pc, ox, oy, c[0]);
    for (let y = 0; y < T; y += 8) {
      pc.hline(ox, ox + T - 1, oy + y, c[2]);
      const off = (y / 8) % 2 ? 8 : 0;
      for (let x = off; x < T; x += 16) pc.vline(ox + x, oy + y, oy + y + 7, c[2]);
      pc.hline(ox, ox + T - 1, oy + y + 1, shadeHex(c[0], 1.1));
    }
  },
  trunk: (pc, ox, oy, c) => {
    pc.rect(ox + 12, oy, 8, 28, c[0]);
    pc.vline(ox + 13, oy, oy + 27, shadeHex(c[0], 1.2));
    pc.vline(ox + 19, oy, oy + 27, c[1]);
    pc.ellipse(ox + 16, oy + 28, 7, 2, c[1]);
    pc.ellipse(ox + 16, oy + 2, 12, 5, c[2]);
  },
  canopy: (pc, ox, oy, c, rnd) => {
    pc.ellipse(ox + 16, oy + 16, 15, 14, c[3]);
    pc.ellipse(ox + 16, oy + 15, 14, 13, c[0]);
    pc.ellipse(ox + 12, oy + 11, 8, 6, c[2]);
    for (let k = 0; k < 40; k++) {
      const x = ox + 3 + Math.floor(rnd() * 26);
      const y = oy + 3 + Math.floor(rnd() * 24);
      if (pc.alpha(x, y) > 0) pc.set(x, y, k % 3 ? c[1] : c[2]);
    }
  },
  bush: (pc, ox, oy, c, rnd) => {
    pc.ellipse(ox + 16, oy + 18, 15, 12, shadeHex(c[1], 0.7));
    pc.ellipse(ox + 16, oy + 17, 14, 11, c[0]);
    pc.ellipse(ox + 11, oy + 13, 6, 4, c[2]);
    pc.speckle(ox + 4, oy + 8, 24, 18, [c[1]], 0.15, rnd);
  },
  lamp: (pc, ox, oy, c) => {
    pc.rect(ox + 14, oy + 6, 4, 26, c[0]);
    pc.vline(ox + 17, oy + 6, oy + 31, c[1]);
    pc.rect(ox + 10, oy + 2, 12, 5, c[1]);
    pc.rect(ox + 11, oy + 6, 10, 2, c[2]);
    pc.rect(ox + 12, oy + 28, 8, 4, c[1]);
  },
  pole: (pc, ox, oy, c) => {
    pc.rect(ox + 13, oy, 6, 32, c[0]);
    pc.vline(ox + 18, oy, oy + 31, c[1]);
    pc.vline(ox + 13, oy, oy + 31, shadeHex(c[0], 1.15));
    pc.rect(ox + 6, oy + 4, 20, 2, c[2]);
    pc.rect(ox + 12, oy + 14, 8, 6, '#e8e0c8');
    pc.rect(ox + 13, oy + 15, 6, 1, '#4a4a8a');
  },
  vending: (pc, ox, oy, c) => {
    pc.rect(ox + 3, oy + 1, 26, 31, c[0]);
    pc.rect(ox + 5, oy + 3, 22, 14, c[2]);
    for (let x = 0; x < 4; x++) pc.rect(ox + 6 + x * 5, oy + 5, 3, 5, ['#e05050', '#f0c040', '#50a0e0', '#f0f0f0'][x]);
    for (let x = 0; x < 4; x++) pc.rect(ox + 6 + x * 5, oy + 11, 3, 5, ['#50c070', '#a050e0', '#e08040', '#50e0e0'][x]);
    pc.rect(ox + 5, oy + 19, 22, 3, c[1]);
    pc.rect(ox + 7, oy + 25, 18, 5, shadeHex(c[0], 0.5));
  },
  desk: (pc, ox, oy, c) => {
    pc.rect(ox + 4, oy + 6, 24, 14, c[0]);
    pc.hline(ox + 4, ox + 27, oy + 6, shadeHex(c[0], 1.2));
    pc.rect(ox + 4, oy + 19, 24, 2, c[1]);
    pc.rect(ox + 5, oy + 21, 2, 9, c[2]);
    pc.rect(ox + 25, oy + 21, 2, 9, c[2]);
    pc.rect(ox + 8, oy + 22, 16, 5, shadeHex(c[2], 0.8));
  },
  blackboard: (pc, ox, oy, c) => {
    pc.rect(ox, oy + 2, T, 24, c[1]);
    pc.rect(ox, oy + 4, T, 20, c[0]);
    pc.line(ox + 4, oy + 10, ox + 14, oy + 10, c[2], 160);
    pc.line(ox + 6, oy + 15, ox + 24, oy + 15, c[2], 120);
    pc.rect(ox, oy + 24, T, 3, c[1]);
    pc.rect(ox + 20, oy + 22, 4, 2, c[2]);
  },
  locker: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy, 30, 32, c[2]);
    pc.rect(ox + 2, oy + 1, 13, 30, c[0]);
    pc.rect(ox + 17, oy + 1, 13, 30, c[0]);
    for (let y = 4; y < 12; y += 2) {
      pc.hline(ox + 4, ox + 12, oy + y, c[1]);
      pc.hline(ox + 19, ox + 27, oy + y, c[1]);
    }
    pc.rect(ox + 12, oy + 16, 2, 4, c[2]);
    pc.rect(ox + 27, oy + 16, 2, 4, c[2]);
  },
  shelf: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy, 30, 32, c[1]);
    pc.rect(ox + 3, oy + 2, 26, 28, c[0]);
    for (let y = 0; y < 3; y++) {
      pc.rect(ox + 3, oy + 10 + y * 9, 26, 2, c[1]);
      for (let x = 0; x < 6; x++) pc.rect(ox + 4 + x * 4, oy + 3 + y * 9, 3, 7, x % 2 ? c[2] : c[3]);
    }
  },
  bed: (pc, ox, oy, c) => {
    pc.rect(ox + 2, oy, 28, 32, c[2]);
    pc.rect(ox + 3, oy + 1, 26, 30, c[0]);
    pc.rect(ox + 5, oy + 2, 22, 8, c[1]);
    pc.hline(ox + 3, ox + 28, oy + 12, shadeHex(c[0], 1.2));
  },
  table: (pc, ox, oy, c) => {
    pc.rect(ox + 2, oy + 4, 28, 20, c[0]);
    pc.hline(ox + 2, ox + 29, oy + 4, shadeHex(c[0], 1.2));
    pc.rect(ox + 2, oy + 23, 28, 2, c[1]);
    pc.rect(ox + 4, oy + 25, 3, 6, c[2]);
    pc.rect(ox + 25, oy + 25, 3, 6, c[2]);
  },
  tv: (pc, ox, oy, c) => {
    pc.rect(ox + 2, oy + 8, 28, 18, c[0]);
    pc.rect(ox + 4, oy + 10, 24, 14, c[2]);
    pc.rect(ox + 6, oy + 26, 20, 4, c[1]);
  },
  kitchen: (pc, ox, oy, c) => {
    pc.rect(ox, oy + 2, T, 30, c[1]);
    pc.rect(ox, oy + 2, T, 6, c[0]);
    pc.rect(ox + 4, oy + 3, 10, 4, c[2]);
    pc.rect(ox + 18, oy + 3, 10, 4, c[2]);
    pc.rect(ox + 2, oy + 12, 28, 18, shadeHex(c[1], 0.9));
    pc.rect(ox + 14, oy + 18, 4, 2, c[2]);
  },
  mirror: (pc, ox, oy, c) => {
    pc.rect(ox + 6, oy, 20, 32, c[0]);
    pc.rect(ox + 8, oy + 2, 16, 28, c[1]);
    pc.line(ox + 10, oy + 26, ox + 20, oy + 6, c[2]);
    pc.line(ox + 12, oy + 27, ox + 21, oy + 9, c[2], 140);
  },
  piano: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy + 2, 30, 26, c[0]);
    pc.rect(ox + 2, oy + 3, 28, 4, shadeHex(c[0], 1.6));
    pc.rect(ox + 2, oy + 16, 28, 6, c[1]);
    for (let x = 3; x < 30; x += 3) pc.rect(ox + x, oy + 16, 2, 3, c[2]);
    pc.rect(ox + 3, oy + 28, 3, 4, c[0]);
    pc.rect(ox + 26, oy + 28, 3, 4, c[0]);
  },
  stall: (pc, ox, oy, c) => {
    pc.rect(ox, oy, T, 32, c[2]);
    pc.rect(ox + 2, oy + 1, 28, 30, c[0]);
    pc.rect(ox + 22, oy + 14, 4, 4, c[1]);
    pc.rect(ox + 2, oy + 28, 28, 3, shadeHex(c[2], 0.6));
  },
  counter: (pc, ox, oy, c) => {
    pc.rect(ox, oy + 6, T, 26, c[0]);
    pc.rect(ox, oy + 4, T, 5, c[1]);
    pc.hline(ox, ox + T - 1, oy + 12, c[2]);
  },
  shopshelf: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy + 2, 30, 30, c[0]);
    for (let y = 0; y < 3; y++) {
      pc.rect(ox + 1, oy + 11 + y * 9, 30, 2, shadeHex(c[0], 0.7));
      for (let x = 0; x < 7; x++) pc.rect(ox + 2 + x * 4, oy + 4 + y * 9, 3, 7, c[1 + ((x + y) % 3)]);
    }
  },
  sign: (pc, ox, oy, c) => {
    pc.rect(ox + 14, oy + 16, 4, 16, c[2]);
    pc.rect(ox + 4, oy + 4, 24, 14, c[0]);
    pc.rect(ox + 5, oy + 5, 22, 12, c[1]);
    pc.hline(ox + 8, ox + 23, oy + 9, c[2]);
    pc.hline(ox + 8, ox + 19, oy + 13, c[2]);
  },
  candle: (pc, ox, oy, c) => {
    pc.rect(ox + 10, oy + 26, 12, 4, c[2]);
    pc.rect(ox + 13, oy + 14, 6, 13, c[0]);
    pc.ellipse(ox + 16, oy + 10, 2, 4, c[1]);
    pc.set(ox + 16, oy + 11, '#fff8d0');
  },
  gate: (pc, ox, oy, c) => {
    pc.rect(ox, oy + 2, T, 3, c[1]);
    pc.rect(ox, oy + 26, T, 3, c[1]);
    for (let x = 1; x < T; x += 4) pc.rect(ox + x, oy + 2, 2, 28, c[0]);
    pc.vline(ox + 2, oy + 2, oy + 29, c[2]);
  },
  shoebox: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy, 30, 32, c[1]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) pc.rect(ox + 3 + x * 9, oy + 2 + y * 7, 8, 6, c[0]);
    pc.rect(ox + 1, oy + 30, 30, 2, c[2]);
  },
  planter: (pc, ox, oy, c, rnd) => {
    pc.rect(ox + 3, oy + 16, 26, 14, c[0]);
    pc.hline(ox + 3, ox + 28, oy + 16, shadeHex(c[0], 1.2));
    pc.ellipse(ox + 16, oy + 12, 12, 7, c[1]);
    for (let k = 0; k < 6; k++) pc.set(ox + 6 + Math.floor(rnd() * 20), oy + 8 + Math.floor(rnd() * 8), c[2]);
  },
  slide: (pc, ox, oy, c) => {
    // すべり台（上から見た図）
    pc.rect(ox + 10, oy + 2, 12, 28, c[0]);
    pc.rect(ox + 12, oy + 2, 8, 28, shadeHex(c[0], 1.25));
    pc.rect(ox + 8, oy + 2, 2, 10, c[1]);
    pc.rect(ox + 22, oy + 2, 2, 10, c[1]);
    for (let y = 4; y < 12; y += 3) pc.hline(ox + 8, ox + 23, oy + y, c[2]);
  },
  swing: (pc, ox, oy, c) => {
    pc.rect(ox + 2, oy + 4, 28, 3, c[0]);
    pc.rect(ox + 2, oy + 4, 3, 26, c[0]);
    pc.rect(ox + 27, oy + 4, 3, 26, c[0]);
    pc.vline(ox + 11, oy + 7, oy + 20, c[2]);
    pc.vline(ox + 20, oy + 7, oy + 20, c[2]);
    pc.rect(ox + 9, oy + 20, 14, 4, c[1]);
  },
  sand: (pc, ox, oy, c, rnd) => {
    fill(pc, ox, oy, c[0]);
    pc.speckle(ox, oy, T, T, [c[1], c[2]], 0.3, rnd);
  },
  boarded: (pc, ox, oy, c) => {
    pc.rect(ox, oy, T, T, shadeHex(c[0], 0.7));
    pc.rect(ox + 4, oy + 1, 24, 31, c[0]);
    for (const [y, tilt] of [[6, 3], [15, -2], [24, 2]] as [number, number][]) {
      pc.poly([[ox + 1, oy + y], [ox + 31, oy + y + tilt], [ox + 31, oy + y + tilt + 5], [ox + 1, oy + y + 5]], c[1]);
      pc.set(ox + 4, oy + y + 2, c[2]);
      pc.set(ox + 27, oy + y + tilt + 2, c[2]);
    }
  },
  gatepost: (pc, ox, oy, c) => {
    pc.rect(ox + 6, oy + 2, 20, 30, c[1]);
    pc.rect(ox + 7, oy + 2, 18, 29, c[0]);
    pc.hline(ox + 7, ox + 24, oy + 2, shadeHex(c[0], 1.2));
    pc.rect(ox + 9, oy + 9, 14, 8, shadeHex(c[2], 0.7));
    pc.rect(ox + 10, oy + 10, 12, 6, c[2]);
    pc.hline(ox + 12, ox + 19, oy + 13, shadeHex(c[2], 0.4));
  },
  mailbox: (pc, ox, oy, c) => {
    pc.rect(ox + 14, oy + 18, 4, 14, c[2]);
    pc.rect(ox + 8, oy + 6, 16, 13, c[0]);
    pc.hline(ox + 8, ox + 23, oy + 6, shadeHex(c[0], 1.3));
    pc.rect(ox + 10, oy + 10, 12, 2, c[1]);
  },
  busstop: (pc, ox, oy, c) => {
    pc.rect(ox + 15, oy + 10, 3, 22, c[2]);
    pc.circle(ox + 16, oy + 8, 7, c[0]);
    pc.circle(ox + 16, oy + 8, 5, c[1]);
    pc.rect(ox + 13, oy + 7, 7, 2, c[0]);
    pc.rect(ox + 11, oy + 28, 11, 4, shadeHex(c[2], 0.7));
  },
  garbage: (pc, ox, oy, c, rnd) => {
    pc.rect(ox + 1, oy + 8, 30, 22, shadeHex(c[2], 0.8));
    for (let k = 0; k < 5; k++) pc.circle(ox + 6 + k * 5 + Math.floor(rnd() * 3), oy + 18 + Math.floor(rnd() * 6), 5, c[1]);
    for (let x = 1; x < 31; x += 3) pc.vline(ox + x, oy + 8, oy + 29, c[0]);
    for (let y = 8; y < 30; y += 3) pc.hline(ox + 1, ox + 30, oy + y, c[0]);
  },
  pillar: (pc, ox, oy, c) => {
    pc.rect(ox + 10, oy, 12, 32, c[0]);
    pc.vline(ox + 10, oy, oy + 31, shadeHex(c[0], 1.2));
    pc.vline(ox + 21, oy, oy + 31, c[1]);
    for (const y of [8, 13, 18, 23]) pc.hline(ox + 12, ox + 17, oy + y, c[2]);
  },
  crayonwall: (pc, ox, oy, c, rnd) => {
    gens.intwall(pc, ox, oy, c, rnd, 0);
    for (let k = 0; k < 4; k++) {
      let x = ox + 3 + Math.floor(rnd() * 22);
      let y = oy + 3 + Math.floor(rnd() * 16);
      for (let i = 0; i < 9; i++) {
        pc.set(x, y, c[3] ?? '#c02020');
        x += Math.floor(rnd() * 3) - 1 + (i % 2);
        y += Math.floor(rnd() * 3) - 1;
      }
    }
  },
  hedge: (pc, ox, oy, c, rnd) => {
    pc.rect(ox, oy + 6, T, 24, c[2]);
    pc.rect(ox, oy + 4, T, 22, c[0]);
    pc.speckle(ox, oy + 4, T, 22, [c[1], shadeHex(c[0], 1.2)], 0.35, rnd);
  },
  bench: (pc, ox, oy, c) => {
    pc.rect(ox + 1, oy + 10, 30, 4, c[0]);
    pc.rect(ox + 1, oy + 16, 30, 4, c[0]);
    pc.rect(ox + 3, oy + 20, 2, 8, c[1]);
    pc.rect(ox + 27, oy + 20, 2, 8, c[1]);
  },
};

/** 裏層用の色変換：彩度を落とし、赤紫に寄せて暗くする */
export function backLayerColor(c: RGBA, x: number, y: number): RGBA {
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const n = ((x * 73856093) ^ (y * 19349663)) & 7;
  const dark = 0.62 - n * 0.008;
  const r = (lum * 0.55 + c[0] * 0.2) * dark + 22;
  const g = (lum * 0.42 + c[1] * 0.12) * dark + 6;
  const b = (lum * 0.62 + c[2] * 0.2) * dark + 26;
  return [r, g, b, c[3]];
}

export const WATER_FRAMES = 3;

export interface TileAtlas {
  canvas: PixelCanvas;
  /** タイルID → 通常/裏層のインデックス */
  index: Map<string, { normal: number; back: number }>;
  /** 水タイルのアニメーションフレーム */
  waterFrames: { normal: number[]; back: number[] };
  columns: number;
}

/** tiles.json から全タイル（通常＋裏層版＋水アニメ）を1枚のアトラスに描く */
export function buildTileAtlas(defs: TileDef[]): TileAtlas {
  const columns = 16;
  const total = defs.length * 2 + WATER_FRAMES * 2;
  const rows = Math.ceil(total / columns);
  const pc = new PixelCanvas(columns * T, rows * T);
  const index = new Map<string, { normal: number; back: number }>();
  const waterFrames = { normal: [] as number[], back: [] as number[] };
  const pos = (i: number) => ({ x: (i % columns) * T, y: Math.floor(i / columns) * T });

  const draw = (def: TileDef, i: number, frame: number, back: boolean) => {
    const { x, y } = pos(i);
    const gen = gens[def.gen];
    if (!gen) throw new Error(`unknown tile gen: ${def.gen}`);
    const rnd = seeded(hashString(def.id) + frame * 7);
    gen(pc, x, y, def.colors ?? ['#ff00ff'], rnd, frame);
    if (back) {
      pc.mapColors({ x, y, w: T, h: T }, backLayerColor);
      // 裏層の亀裂
      const r2 = seeded(hashString(def.id + 'back'));
      // 亀裂は壁など『立っているもの』だけに入れる（床に入れると模様が目立ちすぎる）
      if (def.gen !== 'empty' && def.solid && r2() < 0.6) {
        let cx = x + Math.floor(r2() * T);
        for (let yy = y + Math.floor(r2() * 12); yy < y + T && r2() < 0.93; yy++) {
          if (pc.alpha(cx, yy) > 0) pc.set(cx, yy, mixHex('#5a0a18', '#000000', r2() * 0.4));
          cx += Math.floor(r2() * 3) - 1;
        }
      }
    }
  };

  defs.forEach((def, i) => {
    index.set(def.id, { normal: i, back: defs.length + i });
    draw(def, i, 0, false);
    draw(def, defs.length + i, 0, true);
  });
  const water = defs.find((d) => d.water);
  for (let f = 0; f < WATER_FRAMES; f++) {
    const n = defs.length * 2 + f * 2;
    if (water) {
      draw(water, n, f, false);
      draw(water, n + 1, f, true);
    }
    waterFrames.normal.push(n);
    waterFrames.back.push(n + 1);
  }
  return { canvas: pc, index, waterFrames, columns };
}
