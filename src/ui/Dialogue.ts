import Phaser from 'phaser';
import type { InputAction, InputConsumer, InputManager } from '@/input/InputManager';
import { UI } from '@/config/Screen';
import { textStyle, Theme } from './Theme';
import { drawPanel, label, ListView, type Sfx } from './Widgets';

const NO_LINE_START = '、。，．・：；？！ー）」』】〉》〕｝…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ';
let measureCtx: CanvasRenderingContext2D | null = null;

/** 日本語の文字単位折り返し（行頭禁則つき） */
export function wrapText(text: string, size: number, maxWidth: number): string {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = `${size}px ${Theme.font}`;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of [...para]) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line.length > 0) {
        if (NO_LINE_START.includes(ch)) {
          // 句読点はぶら下げる
          out.push(next);
          line = '';
          continue;
        }
        out.push(line);
        line = ch;
      } else line = next;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** 会話ウィンドウ（文字送り＋タップ/決定で進む） */
export class DialogueBox extends Phaser.GameObjects.Container implements InputConsumer {
  private bg: Phaser.GameObjects.Graphics;
  private nameBg: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Text;
  private full = '';
  private shown = 0;
  private resolve?: () => void;
  private typing = false;
  private acc = 0;
  private blocker: Phaser.GameObjects.Zone;
  charsPerSec = 40;

  constructor(
    scene: Phaser.Scene,
    private readonly inputMgr: InputManager,
    private readonly sfx: Sfx,
    readonly boxW = Math.min(1760, UI.R - UI.L),
    readonly boxH = 250,
  ) {
    super(scene, (UI.W - boxW) / 2, UI.B - boxH);
    this.blocker = scene.add.zone(-this.x, -this.y, UI.W, UI.H).setOrigin(0).setInteractive();
    this.blocker.on('pointerup', () => this.advance());
    this.bg = scene.add.graphics();
    drawPanel(this.bg, 0, 0, boxW, boxH, { alpha: 0.94 });
    this.nameBg = scene.add.graphics();
    this.nameText = label(scene, 48, -34, '', Theme.size.s, Theme.color.accentSoft);
    this.bodyText = scene.add.text(48, 36, '', textStyle(Theme.size.m));
    this.arrow = label(scene, boxW - 60, boxH - 60, '▼', Theme.size.s, Theme.color.accentSoft);
    scene.tweens.add({ targets: this.arrow, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
    this.add([this.blocker, this.bg, this.nameBg, this.nameText, this.bodyText, this.arrow]);
    this.setDepth(5000).setVisible(false);
    scene.add.existing(this);
    this.addToUpdateList();
    // シーン終了時に入力スタックへ残らないようにする
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.inputMgr.remove(this));
  }

  get isOpen(): boolean {
    return this.visible;
  }

  show(speaker: string | undefined, text: string): Promise<void> {
    this.setVisible(true);
    this.inputMgr.push(this);
    this.nameBg.clear();
    if (speaker) {
      this.nameText.setText(speaker);
      const w = this.nameText.width + 56;
      drawPanel(this.nameBg, 20, -50, w, 64, { fill: Theme.color.panelLight, border: Theme.color.borderHi, radius: 12 });
      this.nameText.setVisible(true);
    } else this.nameText.setVisible(false);
    this.full = wrapText(text, Theme.size.m, this.boxW - 120);
    this.shown = 0;
    this.acc = 0;
    this.typing = true;
    this.bodyText.setText('');
    this.bodyText.setColor(speaker ? Theme.color.text : '#d8d0e8');
    this.arrow.setVisible(false);
    return new Promise((res) => (this.resolve = res));
  }

  close(): void {
    this.setVisible(false);
    this.inputMgr.remove(this);
  }

  preUpdate(_t: number, dt: number): void {
    if (!this.visible || !this.typing) return;
    this.acc += dt;
    const per = 1000 / this.charsPerSec;
    let changed = false;
    while (this.acc >= per && this.shown < this.full.length) {
      this.acc -= per;
      this.shown++;
      changed = true;
      if (this.shown % 3 === 0) this.sfx('text');
    }
    if (changed) this.bodyText.setText(this.full.slice(0, this.shown));
    if (this.shown >= this.full.length) this.finishTyping();
  }

  private finishTyping(): void {
    this.typing = false;
    this.bodyText.setText(this.full);
    this.arrow.setVisible(true);
  }

  advance(): void {
    if (!this.visible) return;
    if (this.typing) {
      this.finishTyping();
      return;
    }
    const r = this.resolve;
    this.resolve = undefined;
    this.inputMgr.remove(this);
    r?.();
  }

  onAction(a: InputAction): boolean {
    if (!this.visible) return false;
    if (a === 'confirm' || a === 'cancel') this.advance();
    return true;
  }
}

/** 選択肢ウィンドウ */
export class ChoiceBox extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private listView: ListView;
  private promptText: Phaser.GameObjects.Text;
  private resolve?: (i: number) => void;
  private cancellable = false;

  constructor(
    scene: Phaser.Scene,
    private readonly inputMgr: InputManager,
    sfx: Sfx,
  ) {
    super(scene, 0, 0);
    this.bg = scene.add.graphics();
    this.promptText = label(scene, 0, 0, '', Theme.size.m, Theme.color.text);
    this.listView = new ListView(scene, 0, 0, 820, 92, 5, sfx);
    this.listView.onConfirm = (_it, i) => this.finish(i);
    this.listView.onCancel = () => {
      if (this.cancellable) this.finish(-1);
    };
    this.add([this.bg, this.promptText, this.listView]);
    this.setDepth(5100).setVisible(false);
    scene.add.existing(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.inputMgr.remove(this.listView));
  }

  show(options: string[], prompt?: string, cancellable = false): Promise<number> {
    this.cancellable = cancellable;
    const w = 900;
    const rows = Math.min(5, options.length);
    const promptH = prompt ? 110 : 0;
    const h = rows * 92 + 50 + promptH;
    const x = (UI.W - w) / 2;
    const y = Math.max(60, UI.B - 290 - h);
    this.bg.clear();
    drawPanel(this.bg, x, y, w, h, { alpha: 0.96, border: Theme.color.borderHi });
    this.promptText.setText(prompt ? wrapText(prompt, Theme.size.m, w - 80) : '').setPosition(x + 40, y + 30);
    this.listView.setPosition(x + 40, y + 25 + promptH);
    this.listView.setItems(options.map((t) => ({ text: t })));
    this.setVisible(true);
    this.inputMgr.push(this.listView);
    return new Promise((res) => (this.resolve = res));
  }

  private finish(i: number): void {
    this.setVisible(false);
    this.inputMgr.remove(this.listView);
    const r = this.resolve;
    this.resolve = undefined;
    r?.(i);
  }
}
