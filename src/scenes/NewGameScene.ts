import Phaser from 'phaser';
import { UI } from '@/config/Screen';
import type { GameContext } from '@/core/GameContext';
import type { Gender } from '@/domain/types';
import { charFrame } from '@/render/TextureFactory';
import { textStyle, Theme } from '@/ui/Theme';
import { Button, drawPanel, label } from '@/ui/Widgets';
import type { WorldStart } from './WorldScene';

/** 主人公の性別と名前を決める */
export class NewGameScene extends Phaser.Scene {
  private ctx!: GameContext;
  private gender: Gender = 'male';
  private frames: Phaser.GameObjects.Graphics[] = [];
  private inputEl?: HTMLInputElement;

  constructor() {
    super('NewGame');
  }

  create(): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.cameras.main.setBackgroundColor('#07060c');
    this.add.text(UI.CX, 110, 'あなたは、どんな高校生？', textStyle(Theme.size.l)).setOrigin(0.5);
    const opts: { g: Gender; key: string; label: string; x: number }[] = [
      { g: 'male', key: 'player_male', label: '男子', x: UI.CX - 260 },
      { g: 'female', key: 'player_female', label: '女子', x: UI.CX + 260 },
    ];
    this.frames = [];
    for (const o of opts) {
      const frame = this.add.graphics();
      this.frames.push(frame);
      const img = this.add.sprite(o.x, 420, o.key, charFrame('down')).setScale(9);
      this.add.text(o.x, 610, o.label, textStyle(Theme.size.m)).setOrigin(0.5);
      const zone = this.add.zone(o.x - 200, 200, 400, 460).setOrigin(0).setInteractive();
      zone.on('pointerup', () => this.pick(o.g));
      img.play(`${o.key}_walk_down`);
    }
    this.pick('male');
    label(this, UI.CX, 700, '名前', Theme.size.s, Theme.color.dim).setOrigin(0.5);
    this.makeInput();
    new Button(this, UI.CX - 200, 900, 400, 110, 'はじめる', () => this.start(), { size: Theme.size.l, sfx: (id) => this.ctx.audio.sfx(id) });
    const consumer = {
      onAction: (a: string) => {
        if (a === 'left') this.pick('male');
        else if (a === 'right') this.pick('female');
        else if (a === 'confirm') this.start();
        return true;
      },
    };
    this.ctx.input.push(consumer);
    this.events.once('shutdown', () => {
      this.ctx.input.remove(consumer);
      this.inputEl?.remove();
      this.inputEl = undefined;
    });
  }

  private pick(g: Gender): void {
    this.gender = g;
    this.ctx.audio.sfx('select');
    this.frames.forEach((f, i) => {
      f.clear();
      const sel = (i === 0 ? 'male' : 'female') === g;
      drawPanel(f, (i === 0 ? UI.CX - 260 : UI.CX + 260) - 200, 200, 400, 460, { alpha: sel ? 0.9 : 0.4, border: sel ? Theme.color.borderHi : Theme.color.border, lineWidth: sel ? 6 : 3 });
    });
  }

  /** スマホでも日本語入力できるよう HTML の入力欄を重ねる */
  private makeInput(): void {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 8;
    el.value = 'ユウ';
    el.setAttribute('aria-label', '主人公の名前');
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      boxSizing: 'border-box',
      padding: '0.2em 0.5em',
      textAlign: 'center',
      background: '#14111c',
      color: '#ece6f2',
      border: '2px solid #8f7fb0',
      borderRadius: '10px',
      fontFamily: Theme.font,
      zIndex: '10',
    } as CSSStyleDeclaration);
    // キャンバスの表示サイズに合わせて入力欄の位置・大きさを決める（1920×1080 基準の 600×80 相当）
    let last = '';
    const place = () => {
      const r = this.game.canvas.getBoundingClientRect();
      const k = r.height / 1080;
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (key === last) return;
      last = key;
      el.style.top = `${r.top + 735 * k}px`;
      el.style.left = `${r.left + r.width / 2}px`;
      el.style.width = `${600 * k}px`;
      el.style.height = `${84 * k}px`;
      el.style.fontSize = `${44 * k}px`;
    };
    place();
    this.events.on('update', place);
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        el.blur();
        this.start();
      }
    });
    document.body.appendChild(el);
    this.inputEl = el;
    this.events.once('shutdown', () => this.events.off('update', place));
  }

  private start(): void {
    const name = (this.inputEl?.value ?? '').trim().slice(0, 8) || 'ユウ';
    this.ctx.audio.unlock();
    this.ctx.audio.sfx('confirm');
    this.ctx.newGame(name, this.gender);
    this.registry.set('uiStartBlack', true);
    const start: WorldStart = { mapId: 'home', x: 4, y: 3, facing: 'down', transition: 'none' };
    this.scene.launch('UI');
    this.scene.start('World', start);
  }
}
