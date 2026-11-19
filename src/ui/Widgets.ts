import Phaser from 'phaser';
import type { InputAction, InputConsumer, InputManager } from '@/input/InputManager';
import { textStyle, Theme } from './Theme';

export type Sfx = (id: string) => void;

/** 角丸パネル */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: { fill?: number; alpha?: number; border?: number; radius?: number; lineWidth?: number } = {}): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawPanel(g, 0, 0, w, h, opts);
  g.setPosition(x, y);
  return g;
}

export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opts: { fill?: number; alpha?: number; border?: number; radius?: number; lineWidth?: number } = {}): void {
  const r = opts.radius ?? 18;
  g.fillStyle(opts.fill ?? Theme.color.panel, opts.alpha ?? Theme.color.panelAlpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(opts.lineWidth ?? 3, opts.border ?? Theme.color.border, 0.9);
  g.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, r);
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size: number = Theme.size.m, color: string = Theme.color.text, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, textStyle(size, color, extra));
}

/** タップ・クリックできるボタン */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    caption: string,
    private onClick: () => void,
    private opts: { size?: number; fill?: number; border?: number; sfx?: Sfx } = {},
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.text = label(scene, w / 2, h / 2, caption, opts.size ?? Theme.size.m).setOrigin(0.5);
    // コンテナに直接 setInteractive すると当たり判定が表示位置からずれるため、
    // 左上原点のゾーンを子として置き、そこでタップを受ける
    const hit = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.text, hit]);
    this.draw(false);
    this.setSize(w, h);
    hit.on('pointerdown', () => this.enabled && this.draw(true));
    hit.on('pointerout', () => this.draw(false));
    hit.on('pointerup', () => {
      if (!this.enabled) return;
      this.draw(false);
      this.opts.sfx?.('confirm');
      this.onClick();
    });
    scene.add.existing(this);
  }

  private draw(pressed: boolean): void {
    this.bg.clear();
    drawPanel(this.bg, 0, 0, this.w, this.h, {
      fill: pressed ? Theme.color.select : this.opts.fill ?? Theme.color.panelLight,
      border: pressed ? Theme.color.borderHi : this.opts.border ?? Theme.color.border,
      radius: 14,
    });
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.4);
    return this;
  }

  setCaption(t: string): this {
    this.text.setText(t);
    return this;
  }
}

export interface ListItem {
  text: string;
  sub?: string;
  right?: string;
  color?: string;
  disabled?: boolean;
  icon?: string;
  data?: unknown;
}

/**
 * 縦リスト。キーボード（上下・決定・キャンセル）とタップの両方に対応。
 * タップは「選択＋決定」。表示しきれない分はスクロール。
 */
export class ListView extends Phaser.GameObjects.Container implements InputConsumer {
  private rows: Phaser.GameObjects.Container[] = [];
  private highlight: Phaser.GameObjects.Graphics;
  private items: ListItem[] = [];
  index = 0;
  private scroll = 0;
  private upArrow: Phaser.GameObjects.Text;
  private downArrow: Phaser.GameObjects.Text;
  onSelect?: (item: ListItem, index: number) => void;
  onConfirm?: (item: ListItem, index: number) => void;
  onCancel?: () => void;
  /** 非アクティブ時にタップされたとき。true を返すとそのままタップを受け付ける（タッチ操作で戻れなくなるのを防ぐ） */
  onInactiveTap?: () => boolean;
  active = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly rowH: number,
    readonly visibleRows: number,
    private sfx?: Sfx,
  ) {
    super(scene, x, y);
    this.highlight = scene.add.graphics();
    this.add(this.highlight);
    this.upArrow = label(scene, w - 40, -44, '▲', Theme.size.s, Theme.color.dim);
    this.downArrow = label(scene, w - 40, visibleRows * rowH + 4, '▼', Theme.size.s, Theme.color.dim);
    this.add([this.upArrow, this.downArrow]);
    const zone = scene.add.zone(0, 0, w, rowH * visibleRows).setOrigin(0).setInteractive();
    this.add(zone);
    let dragY = 0;
    let dragging = false;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragY = p.y;
      dragging = false;
    });
    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (Math.abs(p.y - dragY) > this.rowH * 0.6) {
        dragging = true;
        const steps = Math.trunc((dragY - p.y) / this.rowH);
        if (steps !== 0) {
          this.setScroll(this.scroll + steps);
          dragY -= steps * this.rowH;
        }
      }
    });
    zone.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, localY: number) => {
      if (dragging) return;
      if (!this.active && !this.onInactiveTap?.()) return;
      const i = this.scroll + Math.floor(localY / this.rowH);
      if (i < 0 || i >= this.items.length) return;
      this.select(i);
      this.confirm();
    });
    scene.add.existing(this);
  }

  setItems(items: ListItem[], keepIndex = false): void {
    this.items = items;
    if (!keepIndex) {
      // 選べない項目は飛ばして、最初に選べる項目を選択状態にする
      this.index = Math.max(0, items.findIndex((it) => !it.disabled));
      this.scroll = Math.max(0, this.index - this.visibleRows + 1);
    }
    this.index = Math.max(0, Math.min(this.index, items.length - 1));
    this.render();
  }

  get selected(): ListItem | undefined {
    return this.items[this.index];
  }

  private setScroll(s: number): void {
    const max = Math.max(0, this.items.length - this.visibleRows);
    this.scroll = Math.max(0, Math.min(max, s));
    this.render();
  }

  select(i: number): void {
    if (this.items.length === 0) return;
    const n = (i + this.items.length) % this.items.length;
    if (n !== this.index) this.sfx?.('select');
    this.index = n;
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + this.visibleRows) this.scroll = this.index - this.visibleRows + 1;
    this.render();
    this.onSelect?.(this.items[this.index], this.index);
  }

  confirm(): void {
    const it = this.items[this.index];
    if (!it) return;
    if (it.disabled) {
      this.sfx?.('cancel');
      return;
    }
    this.sfx?.('confirm');
    this.onConfirm?.(it, this.index);
  }

  onAction(a: InputAction): boolean {
    if (!this.active || !this.visible) return false;
    switch (a) {
      case 'up':
        this.select(this.index - 1);
        return true;
      case 'down':
        this.select(this.index + 1);
        return true;
      case 'confirm':
        this.confirm();
        return true;
      case 'cancel':
      case 'menu':
        if (this.onCancel) {
          this.sfx?.('cancel');
          this.onCancel();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  render(): void {
    this.rows.forEach((r) => r.destroy());
    this.rows = [];
    this.highlight.clear();
    for (let k = 0; k < this.visibleRows; k++) {
      const i = this.scroll + k;
      const it = this.items[i];
      if (!it) break;
      const row = this.scene.add.container(0, k * this.rowH);
      if (i === this.index) {
        this.highlight.fillStyle(Theme.color.select, 0.9);
        this.highlight.fillRoundedRect(0, k * this.rowH + 2, this.w, this.rowH - 4, 10);
        this.highlight.lineStyle(2, Theme.color.borderHi, 0.9);
        this.highlight.strokeRoundedRect(0, k * this.rowH + 2, this.w, this.rowH - 4, 10);
      }
      let tx = 20;
      if (it.icon && this.scene.textures.exists(it.icon)) {
        row.add(this.scene.add.image(20 + 24, this.rowH / 2, it.icon).setScale(3));
        tx = 84;
      }
      const color = it.disabled ? Theme.color.dim : it.color ?? Theme.color.text;
      const size = this.rowH >= 90 ? Theme.size.m : Theme.size.s;
      const main = label(this.scene, tx, it.sub ? 8 : this.rowH / 2, it.text, size, color);
      if (!it.sub) main.setOrigin(0, 0.5);
      row.add(main);
      if (it.sub) row.add(label(this.scene, tx, 8 + size + 6, it.sub, Theme.size.xs, Theme.color.dim));
      if (it.right) row.add(label(this.scene, this.w - 20, this.rowH / 2, it.right, size, color).setOrigin(1, 0.5));
      this.add(row);
      this.rows.push(row);
    }
    this.upArrow.setVisible(this.scroll > 0);
    this.downArrow.setVisible(this.scroll + this.visibleRows < this.items.length);
  }
}

/** InputManager にリストを登録／解除するヘルパー */
export function bindList(input: InputManager, list: ListView): () => void {
  input.push(list);
  return () => input.remove(list);
}

/** 割合ゲージ（HP・正気度など） */
export class Gauge extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private value = 1;
  private shown = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    private color: number,
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.add(this.g);
    scene.add.existing(this);
    this.addToUpdateList();
    this.draw();
  }

  set(ratio: number, animate = true): void {
    this.value = Math.max(0, Math.min(1, ratio));
    if (!animate) this.shown = this.value;
    this.draw();
  }

  setColor(c: number): void {
    this.color = c;
    this.draw();
  }

  preUpdate(): void {
    if (Math.abs(this.shown - this.value) > 0.002) {
      this.shown += (this.value - this.shown) * 0.15;
      this.draw();
    }
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(0, 0, this.w, this.h, this.h / 2);
    const c = this.value < 0.25 ? 0xe04848 : this.value < 0.5 ? 0xe8c050 : this.color;
    g.fillStyle(c, 1);
    if (this.shown > 0.01) g.fillRoundedRect(2, 2, Math.max(this.h, (this.w - 4) * this.shown), this.h - 4, (this.h - 4) / 2);
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeRoundedRect(0, 0, this.w, this.h, this.h / 2);
  }
}
