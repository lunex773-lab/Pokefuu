import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import type { Direction, MapNpc } from '@/domain/types';
import { charAnim, charFrame, TEX } from '@/render/TextureFactory';
import type { MapView } from './MapView';

const T = GameConfig.tileSize;
export type Facing4 = 'down' | 'up' | 'left' | 'right';

export const toFacing4 = (d: Direction | Facing4): Facing4 => {
  if (d === 'down' || d === 'up' || d === 'left' || d === 'right') return d;
  return d.includes('Left') ? 'left' : 'right';
};

export const dirVector = (d: Facing4): { x: number; y: number } =>
  d === 'up' ? { x: 0, y: -1 } : d === 'down' ? { x: 0, y: 1 } : d === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };

/** 影と水面反射を持つ人物（主人公・NPC共通） */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly reflection: Phaser.GameObjects.Sprite;
  facing: Facing4 = 'down';
  moving = false;

  constructor(
    protected readonly scene: Phaser.Scene,
    readonly key: string,
    public x: number,
    public y: number,
    mask?: Phaser.Display.Masks.GeometryMask,
  ) {
    this.shadow = scene.add.image(x, y, TEX.shadow).setDepth(3);
    this.reflection = scene.add.sprite(x, y, key, charFrame('down')).setFlipY(true).setOrigin(0.5, 0.06).setAlpha(0.38).setTint(0x8fb0e0).setDepth(1);
    if (mask) this.reflection.setMask(mask);
    else this.reflection.setVisible(false);
    this.sprite = scene.add.sprite(x, y, key, charFrame('down')).setOrigin(0.5, 0.94);
    this.sync();
  }

  face(d: Facing4): void {
    this.facing = d;
    if (!this.moving) this.sprite.setFrame(charFrame(d));
  }

  faceTowards(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.face(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
  }

  setAnim(moving: boolean, rate = 1): void {
    if (moving) {
      const key = charAnim(this.key, this.facing);
      if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) this.sprite.play(key, true);
      this.sprite.anims.timeScale = rate;
    } else if (this.moving) {
      this.sprite.stop();
      this.sprite.setFrame(charFrame(this.facing));
    }
    this.moving = moving;
  }

  sync(): void {
    const rx = Math.round(this.x);
    const ry = Math.round(this.y);
    this.sprite.setPosition(rx, ry).setDepth(10 + ry);
    this.shadow.setPosition(rx, ry - 1);
    if (this.reflection.visible) {
      this.reflection.setPosition(rx, ry + 1);
      this.reflection.setFrame(this.sprite.frame.name);
    }
  }

  setVisible(v: boolean): void {
    this.sprite.setVisible(v);
    this.shadow.setVisible(v);
    if (!v) this.reflection.setVisible(false);
  }

  updateReflection(map: MapView, hasMask: boolean): void {
    if (!hasMask || !this.sprite.visible) return;
    const tx = Math.floor(this.x / T);
    const ty = Math.floor(this.y / T);
    const near = map.isWater(tx, ty + 1) || map.isWater(tx, ty) || map.isWater(tx - 1, ty + 1) || map.isWater(tx + 1, ty + 1);
    this.reflection.setVisible(near);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.reflection.destroy();
  }
}

export interface Blocker {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Blocker, b: Blocker) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 主人公：8方向移動と当たり判定 */
export class Player extends Character {
  private stepAcc = 0;
  onStep?: (px: number, py: number) => void;

  hitbox(x = this.x, y = this.y): Blocker {
    const hb = GameConfig.player.hitbox;
    return { x: x - hb.w / 2, y: y - hb.h, w: hb.w, h: hb.h };
  }

  move(dt: number, vx: number, vy: number, dash: boolean, map: MapView, blockers: Blocker[]): void {
    const speed = dash ? GameConfig.player.dashSpeed : GameConfig.player.walkSpeed;
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      if (Math.abs(vx) > 0.01) this.facing = vx < 0 ? 'left' : 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
    }
    const s = (speed * dt) / 1000;
    const blocked = (b: Blocker) => map.hitsWall(b.x, b.y, b.w, b.h) || blockers.some((o) => overlaps(b, o));
    let moved = 0;
    // 軸ごとに判定（壁沿いに滑る）
    if (vx !== 0) {
      const nx = this.x + vx * s;
      if (!blocked(this.hitbox(nx, this.y))) {
        moved += Math.abs(nx - this.x);
        this.x = nx;
      } else {
        // 角に引っかからないよう、少しだけ縦にずらしてみる
        for (const nudge of [-3, 3]) {
          if (vy === 0 && !blocked(this.hitbox(nx, this.y + nudge)) && !blocked(this.hitbox(this.x, this.y + nudge))) {
            this.y += Math.sign(nudge) * Math.min(Math.abs(nudge), s);
            break;
          }
        }
      }
    }
    if (vy !== 0) {
      const ny = this.y + vy * s;
      if (!blocked(this.hitbox(this.x, ny))) {
        moved += Math.abs(ny - this.y);
        this.y = ny;
      } else {
        for (const nudge of [-3, 3]) {
          if (vx === 0 && !blocked(this.hitbox(this.x + nudge, ny)) && !blocked(this.hitbox(this.x + nudge, this.y))) {
            this.x += Math.sign(nudge) * Math.min(Math.abs(nudge), s);
            break;
          }
        }
      }
    }
    this.setAnim(moving, dash ? 1.7 : 1);
    if (moving && moved > 0) {
      this.stepAcc += moved;
      if (this.stepAcc > (dash ? 22 : 18)) {
        this.stepAcc = 0;
        this.onStep?.(this.x, this.y);
      }
    }
    this.sync();
  }
}

/** NPC：条件で出現し、ゆっくり歩き回る */
export class Npc extends Character {
  private home: { x: number; y: number };
  private wanderTimer = 1000 + Math.random() * 2000;
  private target?: { x: number; y: number };
  busy = false;

  constructor(
    scene: Phaser.Scene,
    readonly def: MapNpc,
    mask?: Phaser.Display.Masks.GeometryMask,
  ) {
    super(scene, def.sprite, (def.x + 0.5) * T, (def.y + 1) * T - 4, mask);
    this.home = { x: this.x, y: this.y };
    this.face(toFacing4(def.facing ?? 'down'));
  }

  get tile(): { x: number; y: number } {
    return { x: Math.floor(this.x / T), y: Math.floor((this.y - 4) / T) };
  }

  blocker(): Blocker {
    return { x: this.x - 10, y: this.y - 12, w: 20, h: 12 };
  }

  update(dt: number, map: MapView, player: Player): void {
    if (this.busy || !this.def.wander) {
      this.sync();
      return;
    }
    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = (40 * dt) / 1000;
      const nb = { x: this.x + (dx / d) * step - 10, y: this.y + (dy / d) * step - 12, w: 20, h: 12 };
      const hitsPlayer = overlaps(nb, player.hitbox());
      if (d < step || map.hitsWall(nb.x, nb.y, nb.w, nb.h) || hitsPlayer) {
        this.target = undefined;
        this.setAnim(false);
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        this.setAnim(true);
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1500 + Math.random() * 3000;
        const r = (this.def.wander ?? 0) * T;
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        const [ax, ay] = dirs[Math.floor(Math.random() * 4)];
        const tx = this.home.x + ax * Math.random() * r;
        const ty = this.home.y + ay * Math.random() * r;
        this.target = { x: tx, y: ty };
      }
    }
    this.sync();
  }

  /** スクリプトからの移動（タイル単位） */
  walkBy(dx: number, dy: number, speed = 70): Promise<void> {
    this.busy = true;
    const steps: { x: number; y: number; f: Facing4 }[] = [];
    if (dx) steps.push({ x: this.x + dx * T, y: this.y, f: dx < 0 ? 'left' : 'right' });
    if (dy) steps.push({ x: this.x + dx * T, y: this.y + dy * T, f: dy < 0 ? 'up' : 'down' });
    return new Promise((res) => {
      const next = () => {
        const s = steps.shift();
        if (!s) {
          this.setAnim(false);
          this.home = { x: this.x, y: this.y };
          this.busy = false;
          res();
          return;
        }
        this.facing = s.f;
        this.setAnim(true);
        const dist = Math.hypot(s.x - this.x, s.y - this.y);
        this.scene.tweens.add({
          targets: this,
          x: s.x,
          y: s.y,
          duration: (dist / speed) * 1000,
          onUpdate: () => this.sync(),
          onComplete: next,
        });
      };
      next();
    });
  }
}

/** 怪異の「気配」（シンボルエンカウント） */
export class KaiiSymbol {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly eyes: Phaser.GameObjects.Image;
  private target?: { x: number; y: number };
  private timer = 0;
  chasing = false;
  highlighted = 0;

  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
  ) {
    this.sprite = scene.add.sprite(x, y, TEX.wisp, 'f0').setOrigin(0.5, 0.9).play('wisp_idle');
    this.sprite.anims.setProgress(Math.random());
    this.eyes = scene.add.image(x, y, TEX.dot).setTint(0xff2030).setScale(3, 1).setDepth(9350).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 0.92, duration: 800 });
  }

  update(dt: number, map: MapView, player: { x: number; y: number }, cfg: { aggro: number; speed: number; chase: number }, darkness: number): void {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.chasing = dist < cfg.aggro;
    let vx = 0;
    let vy = 0;
    if (this.chasing) {
      vx = dx / dist;
      vy = dy / dist;
    } else {
      this.timer -= dt;
      if (this.timer <= 0 || !this.target) {
        this.timer = 1200 + Math.random() * 2400;
        const a = Math.random() * Math.PI * 2;
        this.target = { x: this.x + Math.cos(a) * 64, y: this.y + Math.sin(a) * 64 };
      }
      const tx = this.target.x - this.x;
      const ty = this.target.y - this.y;
      const d = Math.hypot(tx, ty);
      if (d > 2) {
        vx = tx / d;
        vy = ty / d;
      }
    }
    const sp = ((this.chasing ? cfg.chase : cfg.speed) * dt) / 1000;
    const nx = this.x + vx * sp;
    const ny = this.y + vy * sp;
    if (!map.hitsWall(nx - 6, this.y - 6, 12, 6)) this.x = nx;
    else this.target = undefined;
    if (!map.hitsWall(this.x - 6, ny - 6, 12, 6)) this.y = ny;
    else this.target = undefined;
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y)).setDepth(10 + this.y);
    this.sprite.setFlipX(vx < 0);
    // 暗闇でも赤い目だけが光る
    const eyeY = this.y - 15 + (this.sprite.frame.name === 'f1' ? -1 : 0);
    this.eyes.setPosition(Math.round(this.x), Math.round(eyeY)).setAlpha(Math.min(1, darkness * 1.4 + (this.chasing ? 0.4 : 0)));
    if (this.highlighted > 0) {
      this.highlighted -= dt;
      this.sprite.setTint(0xff60a0);
    } else this.sprite.clearTint();
  }

  touches(p: { x: number; y: number }): boolean {
    return Math.hypot(p.x - this.x, p.y - this.y) < 16;
  }

  destroy(): void {
    this.sprite.destroy();
    this.eyes.destroy();
  }
}
