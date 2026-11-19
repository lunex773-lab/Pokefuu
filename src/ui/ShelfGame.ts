import Phaser from 'phaser';
import { UI } from '@/config/Screen';
import type { ShelvingGame } from '@/domain/minigame/Shelving';
import type { InputConsumer, InputManager } from '@/input/InputManager';
import { wrapText } from './Dialogue';
import { Theme } from './Theme';
import { Button, drawPanel, label } from './Widgets';

/**
 * 品出しミニゲームの画面。商品名を見て、正しい棚のボタンを押す。
 * タッチ：棚のボタンをタップ／キーボード：← ↓（決定） → で左・中・右の棚。
 * 戻り値は終わったかどうかだけ（結果は game に入っている）。
 */
export function runShelfGame(scene: Phaser.Scene, game: ShelvingGame, input: InputManager, sfx: (id: string) => void): Promise<void> {
  const def = game.def;
  const root = scene.add.container(0, 0).setDepth(2000);
  const backdrop = scene.add.rectangle(0, 0, UI.W, UI.H, 0x05040a, 0.92).setOrigin(0).setInteractive();
  const panelW = Math.min(1500, UI.R - UI.L);
  const px = UI.CX - panelW / 2;
  const top = 40;
  const g = scene.add.graphics();
  drawPanel(g, px, top, panelW, UI.B - top, { alpha: 0.97, border: Theme.color.borderHi });
  const title = label(scene, px + 40, top + 26, def.name, Theme.size.m, Theme.color.accentSoft);
  const counter = label(scene, px + panelW - 40, top + 34, '', Theme.size.s, Theme.color.text).setOrigin(1, 0);
  const timerBg = scene.add.rectangle(px + 40, top + 110, panelW - 80, 18, 0x000000, 0.6).setOrigin(0, 0.5);
  const timerBar = scene.add.rectangle(px + 40, top + 110, panelW - 80, 18, 0x80c0a0, 1).setOrigin(0, 0.5);
  const card = scene.add.graphics();
  const cardY = top + 160;
  const cardH = 300;
  drawPanel(card, px + 120, cardY, panelW - 240, cardH, { alpha: 1, fill: 0x1c1826, border: Theme.color.border });
  const goodText = label(scene, UI.CX, cardY + cardH / 2, '', Theme.size.xl, Theme.color.text).setOrigin(0.5);
  const mark = label(scene, UI.CX + panelW / 2 - 200, cardY + cardH / 2, '', Theme.size.xxl, Theme.color.good).setOrigin(0.5).setAlpha(0);
  root.add([backdrop, g, title, counter, timerBg, timerBar, card, goodText, mark]);

  // 棚のボタン
  const gap = 30;
  const bw = Math.floor((panelW - 80 - gap * (def.shelves.length - 1)) / def.shelves.length);
  const bh = 190;
  const by = UI.B - bh - 40;
  let pick: ((shelf: number) => void) | undefined;
  def.shelves.forEach((name, i) => {
    const b = new Button(scene, px + 40 + i * (bw + gap), by, bw, bh, name, () => pick?.(i), { size: Theme.size.l });
    root.add(b);
  });
  const hint = label(scene, UI.CX, by - 34, '', Theme.size.xs, Theme.color.dim).setOrigin(0.5, 1);
  root.add(hint);

  return new Promise((res) => {
    let phase: 'intro' | 'play' | 'result' = 'intro';
    let startAt = 0;
    const limit = def.seconds * 1000;

    const show = () => {
      const cur = game.current;
      goodText.setText(cur ? cur.name : '');
      // 不気味な商品だけ、名札が滲んで見える
      goodText.setColor(cur && cur.shelf < 0 ? '#c8a0b0' : Theme.color.text);
      counter.setText(`残り ${game.goods.length - game.index} 個`);
    };
    const flashMark = (text: string, color: string) => {
      mark.setText(text).setColor(color).setAlpha(1);
      scene.tweens.killTweensOf(mark);
      scene.tweens.add({ targets: mark, alpha: 0, duration: 380, delay: 120 });
    };
    const finish = () => {
      phase = 'result';
      scene.events.off('update', tick);
      timerBar.width = 0;
      const total = game.countable;
      const lines = [`正しく並べた数　${game.correct} / ${total}`, `給料　${game.pay().toLocaleString('ja-JP')}円`];
      if (game.sawStrange && def.strange) lines.push('', def.strange.text);
      goodText.setFontSize(Theme.size.m).setText(wrapText(lines.join('\n'), Theme.size.m, panelW - 320)).setColor(Theme.color.text);
      counter.setText('おつかれさま');
      hint.setText('タップで終わる');
      sfx(game.correct >= total * 0.75 ? 'item' : 'select');
    };
    const tick = () => {
      if (phase !== 'play') return;
      const left = Math.max(0, limit - (scene.time.now - startAt));
      timerBar.width = (panelW - 80) * (left / limit);
      timerBar.fillColor = left < limit * 0.25 ? 0xe06060 : 0x80c0a0;
      if (left <= 0 || game.done) finish();
    };
    const start = () => {
      phase = 'play';
      startAt = scene.time.now;
      goodText.setFontSize(Theme.size.xl);
      hint.setText('商品にあった棚を押す（← ↓ → でも選べる）');
      show();
      scene.events.on('update', tick);
    };
    const close = () => {
      scene.events.off('update', tick);
      input.remove(consumer);
      root.destroy();
      res();
    };
    pick = (shelf) => {
      if (phase === 'intro') return start();
      if (phase === 'result') return close();
      const r = game.answer(shelf);
      if (r === 'correct') {
        sfx('select');
        flashMark('○', Theme.color.good);
      } else if (r === 'wrong') {
        sfx('cancel');
        flashMark('×', Theme.color.bad);
      } else {
        sfx('whisper');
        flashMark('……', '#c8a0b0');
      }
      if (game.done) finish();
      else show();
    };
    const consumer: InputConsumer = {
      onAction: (a) => {
        if (phase !== 'play') {
          if (a === 'confirm' || a === 'cancel') pick?.(0);
          return true;
        }
        if (a === 'left') pick?.(0);
        else if (a === 'down' || a === 'confirm') pick?.(Math.min(1, def.shelves.length - 1));
        else if (a === 'right') pick?.(def.shelves.length - 1);
        return true;
      },
    };
    input.push(consumer);
    backdrop.on('pointerup', () => {
      if (phase !== 'play') pick?.(0);
    });
    // 説明
    goodText.setFontSize(Theme.size.m).setText(
      wrapText(`届いた商品を、${def.seconds}秒以内に正しい棚へ並べよう。\n正しく並べた数で給料が決まる（最大 ${(def.base + def.perItem * def.rounds).toLocaleString('ja-JP')}円）。`, Theme.size.m, panelW - 320),
    );
    counter.setText(`${def.rounds} 個`);
    hint.setText('タップではじめる');
  });
}
