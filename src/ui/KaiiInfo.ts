import Phaser from 'phaser';
import { UI } from '@/config/Screen';
import type { DataRegistry } from '@/data/DataRegistry';
import { kaiiStats, MAX_EN } from '@/domain/creature/Kaii';
import { describeSkill, stageMark, STAT_NAMES, typeMatchups } from '@/domain/creature/describe';
import type { KaiiData } from '@/domain/state/GameState';
import type { StatKey, Stats } from '@/domain/types';
import type { InputConsumer, InputManager } from '@/input/InputManager';
import { wrapText } from './Dialogue';
import { Theme } from './Theme';
import { drawPanel, label } from './Widgets';

type BattleStat = Exclude<StatKey, 'hp'>;

export interface KaiiInfoOptions {
  kaii: KaiiData;
  /** 技・能力・特性まで見せるか（共鳴したことのない敵は false：タイプと相性だけ） */
  known: boolean;
  /** 「敵の」などの前置き */
  prefix?: string;
  /** 戦闘中の能力（能力段階・状態異常・特性を反映した値）。省略時は基本値 */
  stats?: Stats;
  stages?: Record<BattleStat, number>;
  /** 特性で強くなっている能力 */
  traitBoosted?: BattleStat[];
  input: InputManager;
  sfx?: (id: string) => void;
}

/**
 * 怪異の「強さ」を1画面で見せる（タイプ・相性・能力・特性・技）。
 * メニューの「くわしく見る」と戦闘中の「強さをみる」で共通。タップか決定・キャンセルで閉じる。
 */
export function showKaiiInfo(scene: Phaser.Scene, reg: DataRegistry, o: KaiiInfoOptions): Promise<void> {
  const k = o.kaii;
  const sp = reg.species(k.speciesId);
  const base = kaiiStats(reg, k);
  const st = o.stats ?? base;
  const typeNames = (ts: string[]) => ts.map((t) => reg.types.get(t)?.name ?? t).join('・') || 'なし';

  const root = scene.add.container(0, 0).setDepth(500);
  const backdrop = scene.add.rectangle(0, 0, UI.W, UI.H, 0x05040a, 0.86).setOrigin(0).setInteractive();
  const g = scene.add.graphics();
  const top = 30;
  const bottom = UI.B;
  drawPanel(g, UI.L, top, UI.R - UI.L, bottom - top, { alpha: 0.96, border: Theme.color.borderHi });
  root.add([backdrop, g]);

  const leftX = UI.L + 40;
  const colW = Math.floor((UI.R - UI.L) * 0.44);
  const rightX = UI.L + colW + 70;
  const rightW = UI.R - 40 - rightX;
  const add = (t: Phaser.GameObjects.GameObject) => (root.add(t), t);

  // ---- 左：姿・名前・タイプ・相性・能力・特性
  // 大きな怪異でも文字に重ならないよう、高さ170までに収める
  const img = scene.add.image(leftX + 70, top + 100, sp.sprite);
  img.setScale(Math.min(4, 170 / Math.max(1, img.height), 150 / Math.max(1, img.width)));
  add(img);
  add(label(scene, leftX + 170, top + 34, `${o.prefix ?? ''}${k.nickname ?? sp.name}  Lv${k.level}`, Theme.size.m, Theme.color.accentSoft));
  add(label(scene, leftX + 170, top + 92, `感情：${typeNames(sp.types)}`, Theme.size.s));
  const mu = typeMatchups(reg, sp.types);
  let y = top + 225;
  const line = (text: string, size: number = Theme.size.s, color: string = Theme.color.text, w = colW - 40) => {
    const t = label(scene, leftX, y, wrapText(text, size, w), size, color);
    add(t);
    y += t.height + 10;
  };
  line(`よく響く：${typeNames(mu.weak)}`, Theme.size.xs, '#ffb080');
  line(`響きにくい：${typeNames(mu.resist)}`, Theme.size.xs, '#9ec8ff');
  y += 8;
  if (o.known) {
    line(`HP ${k.hp}/${base.hp}   EN ${k.en}/${MAX_EN}`);
    const statText = (key: BattleStat) => {
      const mark = o.stages ? stageMark(o.stages[key]) : '';
      const boost = o.traitBoosted?.includes(key) ? '★' : '';
      return `${STAT_NAMES[key]} ${st[key]}${mark}${boost}`;
    };
    line(`${statText('atk')}   ${statText('def')}`);
    line(`${statText('spd')}   ${statText('mnd')}`);
    line(`状態：${k.status ? reg.status(k.status.id).name : 'ふつう'}`, Theme.size.xs, Theme.color.dim);
    y += 10;
    const trait = reg.traitOf(k.speciesId);
    if (trait) {
      line(`特性「${trait.name}」`, Theme.size.s, Theme.color.gold);
      line(trait.description, Theme.size.xs);
    }
    if (o.traitBoosted?.length) line('★＝特性で強くなっている', Theme.size.xs, Theme.color.dim);
  } else {
    line('能力：？？？', Theme.size.s, Theme.color.dim);
    line('特性：？？？', Theme.size.s, Theme.color.dim);
  }

  // ---- 右：技
  y = top + 34;
  add(label(scene, rightX, y, '技', Theme.size.m, Theme.color.accentSoft));
  y += 66;
  if (o.known) {
    for (const id of k.skills) {
      const sk = reg.skill(id);
      const name = label(scene, rightX, y, sk.name, Theme.size.s, Theme.color.text);
      add(name);
      y += name.height + 4;
      const body = label(scene, rightX + 16, y, wrapText(describeSkill(reg, sk), Theme.size.xs, rightW - 16), Theme.size.xs, Theme.color.dim);
      add(body);
      y += body.height + 18;
    }
    if (k.learned.length) {
      const t = label(scene, rightX, y, wrapText(`控えの技：${k.learned.map((id) => reg.skill(id).name).join('、')}`, Theme.size.xs, rightW), Theme.size.xs, Theme.color.dim);
      add(t);
    }
  } else {
    add(label(scene, rightX, y, wrapText('共鳴したことのない怪異。\n技や力は、まだわからない。', Theme.size.s, rightW), Theme.size.s, Theme.color.dim));
  }
  add(label(scene, UI.R - 30, bottom - 20, 'タップで閉じる', Theme.size.xs, Theme.color.dim).setOrigin(1, 1));

  return new Promise((res) => {
    const opened = scene.time.now;
    let done = false;
    const close = () => {
      if (done || scene.time.now - opened < 200) return;
      done = true;
      o.sfx?.('cancel');
      o.input.remove(consumer);
      root.destroy();
      res();
    };
    // 開いている間はほかの操作を受け付けない
    const consumer: InputConsumer = {
      onAction: (a) => {
        if (a === 'confirm' || a === 'cancel' || a === 'menu') close();
        return true;
      },
    };
    o.input.push(consumer);
    backdrop.on('pointerup', close);
    scene.events.once('shutdown', () => o.input.remove(consumer));
  });
}
