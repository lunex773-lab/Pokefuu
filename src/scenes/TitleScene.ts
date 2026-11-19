import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import type { GameContext } from '@/core/GameContext';
import { SaveError } from '@/domain/save/SaveManager';
import { TEX } from '@/render/TextureFactory';
import { textStyle, Theme } from '@/ui/Theme';
import { drawPanel, label, ListView, type ListItem } from '@/ui/Widgets';
import type { WorldStart } from './WorldScene';

/** タイトル画面 */
export class TitleScene extends Phaser.Scene {
  private ctx!: GameContext;
  private list!: ListView;
  private started = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.started = false;
    this.cameras.main.setBackgroundColor('#05040a');
    // 赤い月と霧、校舎のシルエット
    const moon = this.add.image(1500, 240, TEX.light).setScale(3.2).setTint(0xc01830).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    this.add.circle(1500, 240, 90, 0x9a1426, 1);
    this.add.circle(1470, 220, 90, 0x05040a, 0.25);
    this.tweens.add({ targets: moon, alpha: 0.25, yoyo: true, repeat: -1, duration: 2600 });
    const g = this.add.graphics();
    g.fillStyle(0x0b0912, 1);
    g.fillRect(0, 760, 1920, 320);
    g.fillRect(260, 560, 900, 220);
    g.fillRect(620, 470, 180, 100);
    g.fillStyle(0x16121e, 1);
    for (let x = 300; x < 1140; x += 80) for (let y = 600; y < 740; y += 70) g.fillRect(x, y, 40, 36);
    g.fillStyle(0xffd890, 0.7);
    g.fillRect(780, 670, 40, 36);
    const fog = this.add.tileSprite(0, 560, 480, 130, TEX.fog).setOrigin(0).setAlpha(0.45).setScale(4);
    this.events.on('update', (_t: number, dt: number) => (fog.tilePositionX += dt * 0.004));
    this.add.text(960, 250, 'Project Phantom', textStyle(110, '#ece6f2', { stroke: '#2a0a14', strokeThickness: 10 })).setOrigin(0.5);
    this.add.text(960, 370, '― 裏 層 ―', textStyle(Theme.size.l, Theme.color.accentSoft)).setOrigin(0.5);
    label(this, 1890, 1050, `v${__APP_VERSION__}（仮）`, Theme.size.xs, Theme.color.dim).setOrigin(1, 1);
    const hint = label(this, 960, 900, 'タップ／Enter ではじめる', Theme.size.m, Theme.color.text).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.2, yoyo: true, repeat: -1, duration: 900 });
    const start = () => {
      if (this.started) return;
      this.started = true;
      this.ctx.audio.unlock();
      this.ctx.audio.setMusic('title');
      hint.destroy();
      void this.showMenu();
    };
    this.input.once('pointerup', start);
    const consumer = { onAction: () => (start(), true) };
    this.ctx.input.push(consumer);
    this.events.once('shutdown', () => {
      this.ctx.input.remove(consumer);
      if (this.list) this.ctx.input.remove(this.list);
    });
  }

  private async showMenu(): Promise<void> {
    const auto = await this.ctx.save.meta('auto');
    const anySlot = (await Promise.all(GameConfig.save.slots.map((s) => this.ctx.save.meta(s)))).some(Boolean);
    const g = this.add.graphics();
    drawPanel(g, 660, 560, 600, 400, { alpha: 0.85 });
    this.list = new ListView(this, 690, 590, 540, 86, 4, (id) => this.ctx.audio.sfx(id));
    const items: ListItem[] = [
      { text: 'つづきから', sub: auto ? `${auto.location}  Lv${auto.playerLevel}` : undefined, disabled: !auto },
      { text: 'はじめから' },
      { text: 'ロード', disabled: !anySlot },
    ];
    this.list.setItems(items);
    if (!auto) this.list.select(1);
    this.list.onConfirm = (_it, i) => {
      if (i === 0) void this.loadSlot('auto');
      else if (i === 1) this.newGame();
      else void this.loadMenu();
    };
    this.ctx.input.push(this.list);
  }

  private async loadMenu(): Promise<void> {
    const slots = GameConfig.save.slots;
    const metas = await Promise.all(slots.map((s) => this.ctx.save.meta(s)));
    const items: ListItem[] = slots.map((s, i) => ({
      text: s === 'auto' ? 'オートセーブ' : `スロット${s}`,
      sub: metas[i] ? `${metas[i]!.location} Lv${metas[i]!.playerLevel}` : '― 空き ―',
      disabled: !metas[i],
    }));
    items.push({ text: '戻る', color: Theme.color.dim });
    this.list.setItems(items);
    this.list.onConfirm = (_it, i) => {
      if (i >= slots.length) {
        this.ctx.input.remove(this.list);
        this.list.destroy();
        void this.showMenu();
        return;
      }
      void this.loadSlot(slots[i]);
    };
  }

  private newGame(): void {
    this.ctx.audio.setMusic(null);
    this.scene.start('NewGame');
  }

  private async loadSlot(slot: string): Promise<void> {
    try {
      const state = await this.ctx.save.load(slot);
      if (!state) return;
      this.ctx.startSession(state);
      this.ctx.audio.setMusic(null);
      const p = state.player.position;
      const start: WorldStart = { mapId: p.mapId, x: p.x, y: p.y, facing: p.facing, transition: 'fade' };
      this.scene.launch('UI');
      this.scene.start('World', start);
    } catch (e) {
      const msg = e instanceof SaveError ? e.message : '読み込みに失敗しました';
      label(this, 960, 1010, msg, Theme.size.s, Theme.color.bad).setOrigin(0.5);
    }
  }
}
