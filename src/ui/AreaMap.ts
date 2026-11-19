import Phaser from 'phaser';
import { UI } from '@/config/Screen';
import type { DataRegistry } from '@/data/DataRegistry';
import type { Condition, Direction, MapDef, MapWarp } from '@/domain/types';
import type { InputConsumer, InputManager } from '@/input/InputManager';
import { Theme } from './Theme';
import { drawPanel, label } from './Widgets';

/** 地図画面に渡す、いま居るマップの情報（WorldScene が作る） */
export interface AreaMapInfo {
  def: MapDef;
  cols: number;
  rows: number;
  cell: (x: number, y: number) => 'floor' | 'wall' | 'water' | 'stairs';
  explored: (x: number, y: number) => boolean;
  check: (c?: Condition) => boolean;
  revealed: (w: MapWarp) => boolean;
  player: { x: number; y: number; facing: Direction };
}

const COLORS = {
  reality: { floor: 0x8e889c, wall: 0x2c2734, water: 0x3d6aa6, stairs: 0xc9c2d8 },
  back: { floor: 0x7a4868, wall: 0x2a1424, water: 0x3a3a78, stairs: 0xb08aa8 },
};
const KIND: Record<string, { mark: string; color: string }> = {
  boss: { mark: '★', color: '#ff6a6a' },
  midboss: { mark: '◆', color: '#ffa050' },
  event: { mark: '●', color: '#ffe080' },
  save: { mark: '✚', color: '#90e0a0' },
  exit: { mark: '▲', color: '#8cc8ff' },
};

/**
 * 地図画面：いま居るマップの全体図。歩いて見たことのある場所だけが描かれる。
 * 現在地・出口の行き先・部屋の名前・見つけた重要な場所（ボス・中ボスなど）を表示する。
 */
export async function showAreaMap(scene: Phaser.Scene, reg: DataRegistry, info: AreaMapInfo, input: InputManager, sfx?: (id: string) => void): Promise<void> {
  const { def, cols, rows } = info;
  // 出口の行き先の名前（行き先のマップを読み込んで名前を引く）
  const dests = new Map<string, string>();
  await Promise.all(
    [...new Set((def.warps ?? []).map((w) => w.to))].map(async (id) => {
      try {
        dests.set(id, (await reg.map(id)).name);
      } catch {
        dests.set(id, id);
      }
    }),
  );

  const root = scene.add.container(0, 0).setDepth(600);
  const backdrop = scene.add.rectangle(0, 0, UI.W, UI.H, 0x05040a, 0.95).setOrigin(0).setInteractive();
  const g = scene.add.graphics();
  drawPanel(g, UI.L, 20, UI.R - UI.L, UI.B - 20, { alpha: 0.97, border: Theme.color.borderHi });
  root.add([backdrop, g]);
  root.add(label(scene, UI.L + 36, 40, `地図　${def.name}`, Theme.size.m, Theme.color.accentSoft));

  // マス目の大きさ：画面に収まる最大（大きすぎず小さすぎず）
  const areaX = UI.L + 40;
  const areaY = 120;
  const areaW = UI.R - UI.L - 80;
  const areaH = UI.B - 110 - areaY;
  const cs = Math.max(6, Math.min(48, Math.floor(Math.min(areaW / cols, areaH / rows))));
  const ox = Math.round(areaX + (areaW - cs * cols) / 2);
  const oy = Math.round(areaY + (areaH - cs * rows) / 2);
  const pal = def.layer === 'back' ? COLORS.back : COLORS.reality;

  const cells = scene.add.graphics();
  root.add(cells);
  let explored = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!info.explored(x, y)) continue;
      explored++;
      const kind = info.cell(x, y);
      cells.fillStyle(pal[kind], 1);
      cells.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      if (kind === 'stairs' && cs >= 10) {
        // 階段は横じまで
        cells.fillStyle(0x000000, 0.25);
        for (let k = 1; k < 4; k++) cells.fillRect(ox + x * cs, oy + y * cs + Math.floor((cs * k) / 4), cs, 1);
      }
    }
  }

  const center = (x: number, y: number, w = 1, h = 1) => ({ x: ox + (x + w / 2) * cs, y: oy + (y + h / 2) * cs });
  const anyExplored = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (info.explored(xx, yy)) return true;
    return false;
  };
  const tag = (x: number, y: number, text: string, color: string, size: number = Theme.size.xs) => {
    const t = label(scene, x, y, text, size, color, { backgroundColor: '#05040ad0', padding: { x: 6, y: 2 } }).setOrigin(0.5);
    // 画面の端からはみ出さない
    t.x = Math.max(UI.L + 30 + t.width / 2, Math.min(UI.R - 30 - t.width / 2, t.x));
    t.y = Math.max(110 + t.height / 2, Math.min(UI.B - 100 - t.height / 2, t.y));
    root.add(t);
    return t;
  };

  // 部屋の名前
  for (const r of def.rooms ?? []) {
    if (!anyExplored(r.x, r.y, r.w, r.h)) continue;
    const c = center(r.x, r.y, r.w, r.h);
    root.add(label(scene, c.x, c.y, r.name, Theme.size.xs, '#d8d0e8').setOrigin(0.5).setAlpha(0.75));
  }

  // 同じ建物の中なら、行き先は違う部分だけ（「裏・桜ヶ丘高校 1F」→「1F」）
  const shortName = (name: string) => {
    const a = def.name.lastIndexOf(' ');
    const b = name.lastIndexOf(' ');
    return a > 0 && b > 0 && def.name.slice(0, a) === name.slice(0, b) ? name.slice(b + 1) : name;
  };
  const landmarkIn = (w: MapWarp) => (def.landmarks ?? []).some((l) => info.check(l.when) && l.x >= w.x && l.x < w.x + w.w && l.y >= w.y && l.y < w.y + w.h);
  // 出口（通れるものだけ。行き先を表示）
  for (const w of def.warps ?? []) {
    if (!info.revealed(w) || !info.check(w.when)) continue;
    if (!anyExplored(w.x, w.y, w.w, w.h)) continue;
    cells.fillStyle(0x5ac8ff, 0.85);
    cells.fillRect(ox + w.x * cs, oy + w.y * cs, w.w * cs, w.h * cs);
    // 目印と同じ場所なら、目印の名前に任せる（二重に書かない）
    if (landmarkIn(w)) continue;
    const c = center(w.x, w.y, w.w, w.h);
    // 部屋の上に重ならないよう、マップの外側に向けて書く（上半分の出口は上へ、下半分は下へ）
    const outward = w.y + w.h / 2 < rows / 2 ? -1 : 1;
    tag(c.x, c.y + outward * (cs * (w.h / 2) + 22), `→ ${shortName(dests.get(w.to) ?? w.to)}`, '#8cc8ff');
  }

  // 重要な場所（見たことのある場所だけ）
  for (const l of def.landmarks ?? []) {
    if (!info.check(l.when) || !anyExplored(l.x - 1, l.y - 1, 3, 3)) continue;
    const k = KIND[l.kind] ?? KIND.event;
    const c = center(l.x, l.y);
    root.add(label(scene, c.x, c.y, k.mark, Math.max(Theme.size.xs, Math.min(Theme.size.m, cs)), k.color, { stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5));
    tag(c.x, c.y - Math.max(cs, 26) - 4, l.label, k.color);
  }

  // 現在地
  const p = center(info.player.x, info.player.y);
  const me = scene.add.circle(p.x, p.y, Math.max(7, cs * 0.42), 0xffffff, 1).setStrokeStyle(4, 0xe0405a);
  root.add(me);
  scene.tweens.add({ targets: me, scale: 1.35, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.inOut' });
  tag(p.x, p.y + Math.max(cs, 24) + 6, '現在地', '#ffffff');

  // 凡例
  const legend = '●現在地　→出口　★ボス　◆中ボス　●気になる場所　✚灯り（休憩）';
  root.add(label(scene, UI.L + 36, UI.B - 60, legend, Theme.size.xs, Theme.color.dim));
  root.add(label(scene, UI.R - 36, UI.B - 60, 'タップで閉じる', Theme.size.xs, Theme.color.dim).setOrigin(1, 0));
  if (explored < cols * rows * 0.08) {
    root.add(label(scene, UI.CX, UI.B - 104, '（歩いた場所が、地図に描かれていく）', Theme.size.xs, Theme.color.dim).setOrigin(0.5));
  }

  return new Promise((res) => {
    const opened = scene.time.now;
    let done = false;
    const close = () => {
      if (done || scene.time.now - opened < 200) return;
      done = true;
      sfx?.('cancel');
      input.remove(consumer);
      root.destroy();
      res();
    };
    const consumer: InputConsumer = {
      onAction: (a) => {
        if (a === 'confirm' || a === 'cancel' || a === 'menu') close();
        return true;
      },
    };
    input.push(consumer);
    backdrop.on('pointerup', close);
    scene.events.once('shutdown', () => input.remove(consumer));
  });
}
