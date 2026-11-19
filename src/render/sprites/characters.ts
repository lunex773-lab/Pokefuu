import type { NpcSpriteDef } from '@/domain/types';
import { PixelCanvas, shadeHex } from '../pixel/PixelCanvas';

export const CHAR_SIZE = 32;
export const CHAR_DIRS = ['down', 'left', 'right', 'up'] as const;
export type CharDir = (typeof CHAR_DIRS)[number];
export const CHAR_FRAMES = 3;

const OUTLINE = '#1a1220';

/**
 * 人物スプライトをパラメータから生成する（4方向×3フレーム）。
 * 行 = 方向（下・左・右・上）、列 = フレーム（静止・右足・左足）
 */
export function buildCharacterSheet(def: NpcSpriteDef): PixelCanvas {
  const sheet = new PixelCanvas(CHAR_SIZE * CHAR_FRAMES, CHAR_SIZE * CHAR_DIRS.length);
  CHAR_DIRS.forEach((dir, row) => {
    for (let f = 0; f < CHAR_FRAMES; f++) {
      const frame = drawFrame(def, dir === 'right' ? 'left' : dir, f);
      sheet.blit(frame, f * CHAR_SIZE, row * CHAR_SIZE, dir === 'right');
    }
  });
  return sheet;
}

function drawFrame(d: NpcSpriteDef, dir: 'down' | 'left' | 'up', f: number): PixelCanvas {
  const pc = new PixelCanvas(CHAR_SIZE, CHAR_SIZE);
  const bob = f === 0 ? 0 : -1;
  const skinD = shadeHex(d.skin, 0.82);
  const topD = shadeHex(d.top, 0.75);
  const botD = shadeHex(d.bottom, 0.75);
  const shoe = '#2a2228';
  const side = dir === 'left';
  const hy = 5 + bob; // head top

  // ---- 脚
  const legY = 24 + bob;
  const stepL = f === 1 ? 1 : f === 2 ? -1 : 0;
  if (side) {
    const fx = 15;
    pc.rect(fx - 1 + stepL * 2, legY, 3, 5, d.bottomStyle === 'skirt' ? d.skin : d.bottom);
    pc.rect(fx + 1 - stepL * 2, legY, 3, 5, d.bottomStyle === 'skirt' ? skinD : botD);
    pc.rect(fx - 2 + stepL * 2, legY + 5, 4, 2, shoe);
    pc.rect(fx + 0 - stepL * 2, legY + 5, 4, 2, shoe);
  } else {
    const lOff = f === 1 ? -1 : 0;
    const rOff = f === 2 ? -1 : 0;
    const legC = d.bottomStyle === 'skirt' ? d.skin : d.bottom;
    pc.rect(12, legY, 3, 5 + lOff, legC);
    pc.rect(17, legY, 3, 5 + rOff, legC);
    pc.rect(12, legY + 5 + lOff, 3, 2, shoe);
    pc.rect(17, legY + 5 + rOff, 3, 2, shoe);
  }

  // ---- 胴体
  const by = 16 + bob;
  if (side) {
    pc.rect(12, by, 8, 8, d.top);
    pc.vline(19, by, by + 7, topD);
  } else {
    pc.rect(11, by, 10, 8, d.top);
    pc.vline(20, by, by + 7, topD);
    if (dir === 'down') {
      // 襟
      pc.set(15, by, d.accent ?? '#ffffff');
      pc.set(16, by, d.accent ?? '#ffffff');
      pc.set(15, by + 1, d.accent ?? '#ffffff');
      pc.set(16, by + 1, d.accent ?? '#ffffff');
    }
  }
  // 下衣
  if (d.bottomStyle === 'skirt') {
    if (side) pc.poly([[11, by + 7], [20, by + 7], [21, by + 11], [10, by + 11]], d.bottom);
    else pc.poly([[10, by + 7], [21, by + 7], [22, by + 11], [9, by + 11]], d.bottom);
    pc.hline(side ? 10 : 9, side ? 21 : 22, by + 11, botD);
  } else {
    pc.rect(side ? 12 : 11, by + 7, side ? 8 : 10, 2, d.bottom);
  }
  // エプロン・バッジ
  if (d.accessory === 'apron' && dir !== 'up') pc.rect(side ? 11 : 12, by + 2, side ? 4 : 8, 10, '#f4f0e8');
  if (d.accessory === 'badge' && dir === 'down') pc.rect(18, by + 2, 2, 2, d.accent ?? '#e0c040');

  // ---- 腕（歩行で振る）
  const swing = f === 1 ? 1 : f === 2 ? -1 : 0;
  if (side) {
    pc.rect(14 + swing * 2, by + 1, 3, 6, topD);
    pc.rect(14 + swing * 2, by + 7, 3, 2, d.skin);
  } else {
    pc.rect(9, by + 1 + swing, 2, 6, d.top);
    pc.rect(21, by + 1 - swing, 2, 6, topD);
    pc.rect(9, by + 7 + swing, 2, 2, d.skin);
    pc.rect(21, by + 7 - swing, 2, 2, skinD);
  }

  // ---- 頭
  const hx = 10;
  pc.rect(hx, hy + 1, 12, 10, d.skin);
  pc.rect(hx + 1, hy, 10, 12, d.skin);
  pc.vline(hx + 11, hy + 2, hy + 10, skinD);
  drawHair(pc, d, dir, hx, hy);
  // 顔
  if (dir === 'down') {
    const ey = hy + 7;
    pc.rect(hx + 3, ey, 2, 2, '#1a1220');
    pc.rect(hx + 7, ey, 2, 2, '#1a1220');
    pc.set(hx + 3, ey, '#5a5a7a');
    pc.set(hx + 7, ey, '#5a5a7a');
    pc.set(hx + 2, ey + 3, shadeHex(d.skin, 0.9));
    pc.set(hx + 9, ey + 3, shadeHex(d.skin, 0.9));
    if (d.accessory === 'glasses') {
      pc.hline(hx + 2, hx + 9, ey - 1, '#3a3a4a');
      pc.rect(hx + 2, ey - 1, 3, 4, '#3a3a4a', 120);
      pc.rect(hx + 7, ey - 1, 3, 4, '#3a3a4a', 120);
    }
  } else if (side) {
    pc.rect(hx + 2, hy + 7, 2, 2, '#1a1220');
    if (d.accessory === 'glasses') pc.hline(hx + 1, hx + 5, hy + 6, '#3a3a4a');
  }
  if (d.accessory === 'headphones') {
    pc.hline(hx, hx + 11, hy - 1, d.accent ?? '#ffd040');
    if (dir !== 'left') pc.rect(hx - 1, hy + 5, 2, 4, d.accent ?? '#ffd040');
    pc.rect(hx + 11, hy + 5, 2, 4, d.accent ?? '#ffd040');
  }

  pc.outline(OUTLINE);
  pc.rimShade(undefined, 1.12, 0.85);
  return pc;
}

function drawHair(pc: PixelCanvas, d: NpcSpriteDef, dir: 'down' | 'left' | 'up', hx: number, hy: number): void {
  const h = d.hair;
  const hD = shadeHex(h, 0.7);
  const hL = shadeHex(h, 1.35);
  const side = dir === 'left';
  const back = dir === 'up';
  // 基本の髪（頭頂）
  pc.rect(hx, hy, 12, 4, h);
  pc.rect(hx + 1, hy - 1, 10, 1, h);
  if (back) {
    pc.rect(hx, hy, 12, 11, h);
    pc.vline(hx + 11, hy, hy + 10, hD);
  } else if (side) {
    pc.rect(hx + 5, hy, 7, 9, h);
    pc.rect(hx, hy + 3, 3, 2, h);
  } else {
    pc.rect(hx, hy + 3, 2, 5, h);
    pc.rect(hx + 10, hy + 3, 2, 5, hD);
    pc.rect(hx + 2, hy + 3, 3, 2, h);
    pc.rect(hx + 7, hy + 3, 2, 1, h);
  }
  pc.hline(hx + 2, hx + 6, hy, hL);

  switch (d.hairStyle) {
    case 'spiky':
      for (let x = 0; x < 12; x += 3) pc.set(hx + x, hy - 2, h);
      pc.set(hx + 1, hy - 1, hL);
      break;
    case 'long':
      if (back) pc.rect(hx, hy + 10, 12, 8, h);
      else if (side) pc.rect(hx + 6, hy + 8, 6, 9, h);
      else {
        pc.rect(hx - 1, hy + 3, 2, 13, h);
        pc.rect(hx + 11, hy + 3, 2, 13, hD);
      }
      break;
    case 'bob':
      if (back) pc.rect(hx - 1, hy + 2, 14, 10, h);
      else if (side) pc.rect(hx + 4, hy + 2, 9, 9, h);
      else {
        pc.rect(hx - 1, hy + 2, 2, 9, h);
        pc.rect(hx + 11, hy + 2, 2, 9, hD);
        pc.rect(hx + 2, hy + 3, 8, 2, h);
      }
      break;
    case 'bun':
      pc.circle(hx + (side ? 9 : 6), hy - 2, 2.5, h);
      if (!back && !side) pc.rect(hx + 2, hy + 3, 8, 1, h);
      break;
    case 'twin':
      if (!side) {
        pc.rect(hx - 2, hy + 4, 2, 10, h);
        pc.rect(hx + 12, hy + 4, 2, 10, hD);
      } else pc.rect(hx + 10, hy + 4, 3, 10, h);
      break;
    case 'cap': {
      const cap = d.accent ?? '#3a3a6a';
      pc.rect(hx - 1, hy - 1, 14, 4, d.top);
      pc.hline(hx, hx + 11, hy - 1, shadeHex(d.top, 1.3));
      if (dir === 'down') pc.rect(hx + 1, hy + 3, 10, 1, shadeHex(d.top, 0.6));
      if (side) pc.rect(hx - 3, hy + 2, 4, 1, shadeHex(d.top, 0.6));
      pc.rect(hx + 5, hy, 2, 2, cap);
      break;
    }
    default:
      break;
  }
}
