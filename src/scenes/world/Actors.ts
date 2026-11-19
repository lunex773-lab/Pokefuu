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

/** タイル座標 → 足元のピクセル座標 */
export const tileToFeet = (tx: number, ty: number): { x: number; y: number } => ({ x: (tx + 0.5) * T, y: (ty + 1) * T - 4 });

const vecToFacing = (dx: number, dy: number): Facing4 => (dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down');

/**
 * 主人公：BW2風のマス目移動（上下左右の4方向のみ）。
 * 1マスずつ進み、移動中は次のマスを予約する。短く押すと、その場で向きだけ変える。
 */
export class Player extends Character {
  tx = 0;
  ty = 0;
  /** 直前にいたマス（通れないワープからの押し戻し用） */
  prevTx = 0;
  prevTy = 0;
  private step?: { fx: number; fy: number; tx: number; ty: number; t: number };
  private turnTimer = 0;
  /** マスに到着した瞬間だけ true（トリガー判定用） */
  arrived = false;
  onStep?: (px: number, py: number) => void;

  constructor(scene: Phaser.Scene, key: string, tx: number, ty: number, mask?: Phaser.Display.Masks.GeometryMask) {
    const p = tileToFeet(tx, ty);
    super(scene, key, p.x, p.y, mask);
    this.setTile(tx, ty);
  }

  get stepping(): boolean {
    return !!this.step;
  }

  /** 移動先として予約しているマス（移動中のみ） */
  get targetTile(): { x: number; y: number } | null {
    return this.step ? { x: this.step.tx, y: this.step.ty } : null;
  }

  setTile(tx: number, ty: number): void {
    this.step = undefined;
    this.prevTx = this.tx;
    this.prevTy = this.ty;
    this.tx = tx;
    this.ty = ty;
    const p = tileToFeet(tx, ty);
    this.x = p.x;
    this.y = p.y;
    this.setAnim(false);
    this.sync();
  }

  occupies(tx: number, ty: number): boolean {
    return (this.tx === tx && this.ty === ty) || (!!this.step && this.step.tx === tx && this.step.ty === ty);
  }

  update(dt: number, dir: { x: number; y: number } | null, dash: boolean, canEnter: (tx: number, ty: number) => boolean): void {
    this.arrived = false;
    const speed = dash ? GameConfig.player.dashSpeed : GameConfig.player.walkSpeed;
    let budget = (speed * dt) / 1000;
    // 移動中：目標マスまで進む。余った分は次のマスへ持ち越して、歩きを滑らかにする
    while (budget > 0) {
      if (!this.step) {
        if (!dir) break;
        const want = vecToFacing(dir.x, dir.y);
        if (!this.moving && want !== this.facing) {
          // 止まっている状態で別の方向を押したら、まず向きだけ変える
          this.face(want);
          this.turnTimer = 90;
          break;
        }
        if (this.turnTimer > 0) {
          this.turnTimer -= dt;
          break;
        }
        this.facing = want;
        const nx = this.tx + dir.x;
        const ny = this.ty + dir.y;
        if (!canEnter(nx, ny)) {
          this.setAnim(false);
          this.sprite.setFrame(charFrame(this.facing));
          break;
        }
        this.step = { fx: this.x, fy: this.y, tx: nx, ty: ny, t: 0 };
      }
      const target = tileToFeet(this.step.tx, this.step.ty);
      const dist = Math.hypot(target.x - this.x, target.y - this.y);
      this.setAnim(true, dash ? 1.7 : 1);
      if (budget >= dist) {
        budget -= dist;
        this.prevTx = this.tx;
        this.prevTy = this.ty;
        this.tx = this.step.tx;
        this.ty = this.step.ty;
        this.x = target.x;
        this.y = target.y;
        this.step = undefined;
        this.arrived = true;
        this.onStep?.(this.x, this.y);
        // 方向キーを離していたらここで止まる（マスの中央で止まる）
        if (!dir) break;
        // 到着したマスでトリガーを判定させるため、ここで1フレーム区切る
        break;
      }
      this.x += ((target.x - this.x) / dist) * budget;
      this.y += ((target.y - this.y) / dist) * budget;
      budget = 0;
    }
    if (!this.step && !dir) this.setAnim(false);
    if (!dir) this.turnTimer = 0;
    this.sync();
  }

  /** スクリプトからの移動（マス単位・当たり判定なし） */
  walkTiles(dx: number, dy: number, speed = 110): Promise<void> {
    const path: { x: number; y: number }[] = [];
    let cx = this.tx;
    let cy = this.ty;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let i = 0; i < Math.abs(dx); i++) path.push({ x: (cx += sx), y: cy });
    for (let i = 0; i < Math.abs(dy); i++) path.push({ x: cx, y: (cy += sy) });
    return new Promise((res) => {
      const next = () => {
        const n = path.shift();
        if (!n) {
          this.setTile(cx, cy);
          res();
          return;
        }
        this.facing = vecToFacing(n.x - this.tx, n.y - this.ty);
        this.setAnim(true);
        const p = tileToFeet(n.x, n.y);
        this.scene.tweens.add({
          targets: this,
          x: p.x,
          y: p.y,
          duration: (T / speed) * 1000,
          onUpdate: () => this.sync(),
          onComplete: () => {
            this.tx = n.x;
            this.ty = n.y;
            next();
          },
        });
      };
      next();
    });
  }
}

/** NPC：条件で出現し、マス目に沿ってゆっくり歩き回る */
export class Npc extends Character {
  tx: number;
  ty: number;
  private homeTx: number;
  private homeTy: number;
  private wanderTimer = 1000 + Math.random() * 2000;
  private step?: { tx: number; ty: number };
  busy = false;

  constructor(
    scene: Phaser.Scene,
    readonly def: MapNpc,
    mask?: Phaser.Display.Masks.GeometryMask,
  ) {
    const p = tileToFeet(def.x, def.y);
    super(scene, def.sprite, p.x, p.y, mask);
    this.tx = def.x;
    this.ty = def.y;
    this.homeTx = def.x;
    this.homeTy = def.y;
    this.face(toFacing4(def.facing ?? 'down'));
  }

  get tile(): { x: number; y: number } {
    return { x: this.tx, y: this.ty };
  }

  occupies(tx: number, ty: number): boolean {
    return (this.tx === tx && this.ty === ty) || (!!this.step && this.step.tx === tx && this.step.ty === ty);
  }

  update(dt: number, canEnter: (tx: number, ty: number) => boolean): void {
    if (this.busy || !this.def.wander) {
      this.sync();
      return;
    }
    if (this.step) {
      const target = tileToFeet(this.step.tx, this.step.ty);
      const d = Math.hypot(target.x - this.x, target.y - this.y);
      const s = (48 * dt) / 1000;
      if (d <= s) {
        this.x = target.x;
        this.y = target.y;
        this.tx = this.step.tx;
        this.ty = this.step.ty;
        this.step = undefined;
        this.setAnim(false);
      } else {
        this.x += ((target.x - this.x) / d) * s;
        this.y += ((target.y - this.y) / d) * s;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1500 + Math.random() * 3000;
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
        const nx = this.tx + dx;
        const ny = this.ty + dy;
        const r = this.def.wander ?? 0;
        this.facing = vecToFacing(dx, dy);
        if (Math.abs(nx - this.homeTx) <= r && Math.abs(ny - this.homeTy) <= r && canEnter(nx, ny)) {
          this.step = { tx: nx, ty: ny };
          this.setAnim(true);
        } else this.sprite.setFrame(charFrame(this.facing));
      }
    }
    this.sync();
  }

  /** スクリプトからの移動（マス単位） */
  walkBy(dx: number, dy: number, speed = 70): Promise<void> {
    this.busy = true;
    const steps: { x: number; y: number; f: Facing4 }[] = [];
    if (dx) steps.push({ x: this.tx + dx, y: this.ty, f: dx < 0 ? 'left' : 'right' });
    if (dy) steps.push({ x: this.tx + dx, y: this.ty + dy, f: dy < 0 ? 'up' : 'down' });
    return new Promise((res) => {
      const next = () => {
        const s = steps.shift();
        if (!s) {
          this.setAnim(false);
          this.homeTx = this.tx;
          this.homeTy = this.ty;
          this.busy = false;
          res();
          return;
        }
        this.facing = s.f;
        this.setAnim(true);
        const p = tileToFeet(s.x, s.y);
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        this.scene.tweens.add({
          targets: this,
          x: p.x,
          y: p.y,
          duration: (dist / speed) * 1000,
          onUpdate: () => this.sync(),
          onComplete: () => {
            this.tx = s.x;
            this.ty = s.y;
            next();
          },
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
