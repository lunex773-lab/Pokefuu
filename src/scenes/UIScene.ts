import Phaser from 'phaser';
import type { GameContext } from '@/core/GameContext';
import { formatClock } from '@/domain/world/Clock';
import type { MemoryDef } from '@/domain/types';
import type { InputAction, InputConsumer } from '@/input/InputManager';
import { ChoiceBox, DialogueBox, wrapText } from '@/ui/Dialogue';
import { textStyle, Theme } from '@/ui/Theme';
import { showResonance } from '@/ui/Resonance';
import { drawPanel, Gauge, label } from '@/ui/Widgets';

export const isTouchDevice = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/**
 * 常駐UI：HUD・仮想スティック・ボタン・会話・選択肢・通知・フェード。
 * ワールドとは別シーンにして、カメラのズームや演出の影響を受けないようにする。
 */
export class UIScene extends Phaser.Scene {
  ctx!: GameContext;
  dialogue!: DialogueBox;
  choice!: ChoiceBox;
  private hud!: Phaser.GameObjects.Container;
  private locText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private dangerText!: Phaser.GameObjects.Text;
  private sanityGauge!: Gauge;
  private sanityText!: Phaser.GameObjects.Text;
  private controls!: Phaser.GameObjects.Container;
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private stickPointer: number | null = null;
  private stickOrigin = { x: 230, y: 830 };
  private fadeRect!: Phaser.GameObjects.Rectangle;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;
  private toasts: Phaser.GameObjects.Container[] = [];
  private sightBtn?: Phaser.GameObjects.Container;
  private offs: (() => void)[] = [];
  location = '';
  danger = 0;
  dangerName = '';
  backLayer = false;

  constructor() {
    super('UI');
  }

  create(): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.input.addPointer(3);
    this.buildVignette();
    this.buildHud();
    this.buildControls();
    this.dialogue = new DialogueBox(this, this.ctx.input, (id) => this.ctx.audio.sfx(id));
    this.choice = new ChoiceBox(this, this.ctx.input, (id) => this.ctx.audio.sfx(id));
    // 暗転中でも会話が読めるよう、フェードより手前に表示する
    this.dialogue.setDepth(9100);
    this.choice.setDepth(9200);
    this.fadeRect = this.add.rectangle(0, 0, 1920, 1080, 0x000000, 1).setOrigin(0).setDepth(9000).setAlpha(0);
    this.flashRect = this.add.rectangle(0, 0, 1920, 1080, 0xffffff, 0).setOrigin(0).setDepth(9001);
    if (this.registry.get('uiStartBlack')) {
      this.fadeRect.setAlpha(1);
      this.registry.set('uiStartBlack', false);
    }
    const bus = this.ctx.bus;
    this.offs.push(
      bus.on('ui:toast', ({ text, color }) => this.toast(text, color)),
      bus.on('achievement:unlocked', ({ id }) => {
        const def = this.ctx.reg.achievements.get(id);
        if (def) this.toast(`実績解除：${def.name}`, Theme.color.gold);
        this.ctx.audio.sfx('levelup');
      }),
      bus.on('player:levelup', ({ level }) => this.toast(`主人公のレベルが ${level} になった`, Theme.color.good)),
      bus.on('player:sanity', () => this.refreshHud()),
      bus.on('time:tick', () => this.refreshHud()),
      bus.on('weather:changed', () => this.refreshHud()),
      bus.on('save:completed', ({ auto }) => auto && this.toast('オートセーブしました', Theme.color.dim)),
    );
    this.events.once('shutdown', () => this.offs.forEach((f) => f()));
    this.refreshHud();
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    this.hud = this.add.container(0, 0).setDepth(100);
    const bg = this.add.graphics();
    drawPanel(bg, 24, 20, 620, 150, { alpha: 0.7, radius: 16 });
    this.locText = label(this, 50, 34, '', Theme.size.m);
    this.timeText = label(this, 50, 92, '', Theme.size.s, Theme.color.dim);
    this.dangerText = label(this, 360, 92, '', Theme.size.s, Theme.color.accent);
    const sbg = this.add.graphics();
    drawPanel(sbg, 1920 - 600, 20, 380, 100, { alpha: 0.7, radius: 16 });
    this.sanityText = label(this, 1920 - 576, 30, '正気度', Theme.size.xs, Theme.color.dim);
    this.sanityGauge = new Gauge(this, 1920 - 576, 72, 330, 26, 0x9a80e0);
    this.hud.add([bg, this.locText, this.timeText, this.dangerText, sbg, this.sanityText, this.sanityGauge]);
    // メニューボタン
    const menu = this.add.container(1920 - 196, 20);
    const mg = this.add.graphics();
    drawPanel(mg, 0, 0, 172, 100, { alpha: 0.8, radius: 16 });
    const menuHit = this.add.zone(0, 0, 172, 100).setOrigin(0).setInteractive();
    menu.add([mg, label(this, 86, 50, 'メニュー', Theme.size.s).setOrigin(0.5), menuHit]);
    menuHit.on('pointerup', () => this.ctx.input.dispatch('menu'));
    this.hud.add(menu);
  }

  refreshHud(): void {
    if (!this.ctx.hasSession || !this.locText) return;
    const s = this.ctx.session;
    const phase = this.ctx.reg.timePhase(s.clock.phase);
    const weather = s.weather.def();
    this.locText.setText(this.location);
    const clock = s.clock.isDistorted ? '--:--' : formatClock(s.clock.minutes);
    this.timeText.setText(`${s.clock.isDistorted ? '？？' : phase.name} ${clock}  ${weather.id === 'clear' ? '' : weather.name}`);
    this.dangerText.setText(this.backLayer ? `危険度${this.danger} ${this.dangerName}` : '');
    const ratio = s.state.player.sanity / s.player.maxSanity;
    this.sanityGauge.set(ratio);
    this.sanityText.setText(`正気度 ${Math.ceil(s.state.player.sanity)} / ${s.player.maxSanity}`);
    const low = Math.max(0, (0.35 - ratio) / 0.35);
    this.vignette.setAlpha(0.15 + low * 0.75);
    this.vignette.setTint(low > 0 ? 0xa01020 : 0x000000);
  }

  setHudVisible(on: boolean): void {
    this.hud.setVisible(on);
    this.controls.setVisible(on && isTouchDevice());
  }

  private buildVignette(): void {
    if (!this.textures.exists('fx_vignette')) {
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 270;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(240, 135, 60, 240, 135, 290);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
      grad.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 480, 270);
      this.textures.addCanvas('fx_vignette', c);
    }
    this.vignette = this.add.image(960, 540, 'fx_vignette').setDisplaySize(1920, 1080).setTint(0x000000).setAlpha(0.15).setDepth(50);
  }

  // ------------------------------------------------------------ 仮想操作

  private buildControls(): void {
    this.controls = this.add.container(0, 0).setDepth(200);
    this.stickBase = this.add.circle(this.stickOrigin.x, this.stickOrigin.y, 140, 0xffffff, 0.08).setStrokeStyle(4, 0xffffff, 0.25);
    this.stickKnob = this.add.circle(this.stickOrigin.x, this.stickOrigin.y, 62, 0xffffff, 0.22).setStrokeStyle(3, 0xffffff, 0.45);
    this.controls.add([this.stickBase, this.stickKnob]);

    const stickZone = this.add.zone(0, 180, 860, 900).setOrigin(0).setInteractive();
    this.controls.add(stickZone);
    stickZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.ctx.audio.unlock();
      if (this.stickPointer !== null) return;
      this.stickPointer = p.id;
      this.stickBase.setPosition(p.x, p.y);
      this.stickKnob.setPosition(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      const dx = p.x - this.stickBase.x;
      const dy = p.y - this.stickBase.y;
      const len = Math.hypot(dx, dy);
      const max = 120;
      const k = len > max ? max / len : 1;
      this.stickKnob.setPosition(this.stickBase.x + dx * k, this.stickBase.y + dy * k);
      this.ctx.input.setStick((dx * k) / max, (dy * k) / max);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickBase.setPosition(this.stickOrigin.x, this.stickOrigin.y);
      this.stickKnob.setPosition(this.stickOrigin.x, this.stickOrigin.y);
      this.ctx.input.setStick(0, 0);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const btn = (x: number, y: number, r: number, caption: string, color: number, onDown: () => void, onUp?: () => void) => {
      const c = this.add.container(x, y);
      const circle = this.add.circle(0, 0, r, color, 0.28).setStrokeStyle(4, 0xffffff, 0.5);
      const t = this.add.text(0, 0, caption, textStyle(r > 80 ? Theme.size.s : Theme.size.xs)).setOrigin(0.5);
      c.add([circle, t]);
      c.setSize(r * 2, r * 2).setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);
      c.on('pointerdown', () => {
        this.ctx.audio.unlock();
        circle.setFillStyle(color, 0.6);
        onDown();
      });
      const up = () => {
        circle.setFillStyle(color, 0.28);
        onUp?.();
      };
      c.on('pointerup', up);
      c.on('pointerout', up);
      this.controls.add(c);
      return c;
    };
    btn(1715, 850, 105, '調べる', 0xe04860, () => this.ctx.input.dispatch('confirm'));
    btn(1490, 960, 78, 'ダッシュ', 0x6080e0, () => this.ctx.input.setTouchDash(true), () => this.ctx.input.setTouchDash(false));
    this.sightBtn = btn(1500, 740, 78, '視る', 0xa040e0, () => this.ctx.input.dispatch('sight'));
    this.controls.setVisible(isTouchDevice());
  }

  setSightCooldown(ratio: number): void {
    this.sightBtn?.setAlpha(ratio < 1 ? 0.4 + ratio * 0.4 : 1);
  }

  // ------------------------------------------------------------ 演出

  say(speaker: string | undefined, text: string): Promise<void> {
    this.dialogue.charsPerSec = 40 * this.ctx.settings.textSpeed;
    return this.dialogue.show(speaker, text);
  }

  closeDialogue(): void {
    this.dialogue.close();
  }

  choose(options: string[], prompt?: string, cancellable = false): Promise<number> {
    return this.choice.show(options, prompt, cancellable);
  }

  toast(text: string, color: string = Theme.color.text): void {
    const y = 200 + this.toasts.length * 86;
    const c = this.add.container(960, y).setDepth(9400);
    const t = this.add.text(0, 0, text, textStyle(Theme.size.s, color)).setOrigin(0.5);
    const g = this.add.graphics();
    drawPanel(g, -t.width / 2 - 36, -36, t.width + 72, 72, { alpha: 0.9, radius: 14 });
    c.add([g, t]).setAlpha(0);
    this.toasts.push(c);
    this.tweens.add({ targets: c, alpha: 1, y: y - 10, duration: 250 });
    this.time.delayedCall(2600, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          this.toasts = this.toasts.filter((x) => x !== c);
          c.destroy();
        },
      });
    });
  }

  fade(to: 'black' | 'clear', ms: number): Promise<void> {
    const alpha = to === 'black' ? 1 : 0;
    if (ms <= 0) {
      this.fadeRect.setAlpha(alpha);
      return Promise.resolve();
    }
    return new Promise((res) => this.tweens.add({ targets: this.fadeRect, alpha, duration: ms, onComplete: () => res() }));
  }

  get isFadedOut(): boolean {
    return this.fadeRect.alpha > 0.5;
  }

  flash(color: string, ms: number): Promise<void> {
    this.flashRect.setFillStyle(Theme.hex(color), 1).setAlpha(0.9);
    return new Promise((res) => this.tweens.add({ targets: this.flashRect, alpha: 0, duration: ms, onComplete: () => res() }));
  }

  titleCard(text: string, sub: string): Promise<void> {
    const c = this.add.container(960, 480).setDepth(9500).setAlpha(0);
    const t1 = this.add.text(0, -40, text, textStyle(Theme.size.l, Theme.color.dim)).setOrigin(0.5);
    const t2 = this.add.text(0, 50, sub, textStyle(Theme.size.xxl, Theme.color.text)).setOrigin(0.5);
    const line = this.add.rectangle(0, 130, 600, 3, Theme.hex(Theme.color.accent), 0.8);
    c.add([t1, t2, line]);
    return new Promise((res) => {
      this.tweens.add({
        targets: c,
        alpha: 1,
        duration: 900,
        hold: 1800,
        yoyo: true,
        onComplete: () => {
          c.destroy();
          res();
        },
      });
    });
  }

  memoryPopup(mem: MemoryDef): Promise<void> {
    this.ctx.audio.sfx('resonance');
    const w = 1300;
    const h = 520;
    const c = this.add.container((1920 - w) / 2, (1080 - h) / 2 - 60).setDepth(9300).setAlpha(0);
    const g = this.add.graphics();
    drawPanel(g, 0, 0, w, h, { alpha: 0.97, border: Theme.color.borderHi });
    const head = label(this, w / 2, 50, '― 記憶片 ―', Theme.size.s, Theme.color.accentSoft).setOrigin(0.5, 0);
    const title = label(this, w / 2, 110, mem.title, Theme.size.l, Theme.color.text).setOrigin(0.5, 0);
    const body = label(this, 70, 210, wrapText(mem.text, Theme.size.m, w - 140), Theme.size.m, '#d8d0e8');
    const hint = label(this, w - 40, h - 30, 'タップ／決定で閉じる', Theme.size.xs, Theme.color.dim).setOrigin(1, 1);
    c.add([g, head, title, body, hint]);
    this.tweens.add({ targets: c, alpha: 1, duration: 500 });
    return this.waitConfirm(c);
  }

  /** 決定またはタップを待ってからコンテナを閉じる */
  waitConfirm(c: Phaser.GameObjects.Container): Promise<void> {
    return new Promise((res) => {
      const zone = this.add.zone(0, 0, 1920, 1080).setOrigin(0).setInteractive().setDepth(c.depth + 1);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.ctx.input.remove(consumer);
        zone.destroy();
        this.tweens.add({ targets: c, alpha: 0, duration: 250, onComplete: () => c.destroy() });
        res();
      };
      const consumer: InputConsumer = {
        onAction: (a: InputAction) => {
          if (a === 'confirm' || a === 'cancel') finish();
          return true;
        },
      };
      this.time.delayedCall(350, () => {
        this.ctx.input.push(consumer);
        zone.on('pointerup', finish);
      });
    });
  }

  /** 共鳴：怪異の声を聞き、応える */
  resonance(spriteKey: string, name: string, prompt: string, options: string[]): Promise<number> {
    return showResonance(this, this.ctx.input, (id) => this.ctx.audio.sfx(id), spriteKey, name, prompt, options);
  }
}
