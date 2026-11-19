import Phaser from 'phaser';
import { TEX } from '@/render/TextureFactory';
import { Theme } from '@/ui/Theme';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: string;
  power?: boolean;
  flicker?: boolean;
  /** 0-1 */
  intensity?: number;
  glow?: Phaser.GameObjects.Image;
  phase?: number;
}

export interface LightingParams {
  darkness: number;
  tint: string;
  tintAlpha: number;
  powerOut: boolean;
}

/**
 * ピクセルアート＋近代ライティング。
 * 画面サイズの暗闇レンダーテクスチャから、光源ごとに柔らかい円を「消しゴム」で抜き、
 * 加算合成の色付きグローを重ねる。ワールド解像度（640×360）で描くので軽い。
 */
export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;
  private cone: Phaser.GameObjects.Image;
  private tint: Phaser.GameObjects.Rectangle;
  private lights: LightSource[] = [];
  private playerGlow: Phaser.GameObjects.Image;
  private params: LightingParams = { darkness: 0, tint: '#ffffff', tintAlpha: 0, powerOut: false };
  private current = { darkness: 0, tintAlpha: 0 };
  private flickerT = 0;
  private readonly pad = 64;
  playerLight = { radius: 72, dirX: 0, dirY: 1, on: true };

  constructor(
    private readonly scene: Phaser.Scene,
    viewW: number,
    viewH: number,
  ) {
    this.rt = scene.add.renderTexture(0, 0, viewW + this.pad * 2, viewH + this.pad * 2).setOrigin(0).setDepth(9300);
    this.stamp = scene.make.image({ key: TEX.light, add: false });
    this.cone = scene.make.image({ key: TEX.cone, add: false }).setOrigin(0.08, 0.5);
    this.tint = scene.add.rectangle(0, 0, viewW + this.pad * 2, viewH + this.pad * 2, 0xffffff, 0).setOrigin(0).setDepth(9200);
    this.playerGlow = scene.add.image(0, 0, TEX.light).setBlendMode(Phaser.BlendModes.ADD).setDepth(9110).setAlpha(0);
  }

  setLights(lights: LightSource[]): void {
    this.lights.forEach((l) => l.glow?.destroy());
    this.lights = lights.map((l) => {
      const glow = this.scene.add
        .image(l.x, l.y, TEX.light)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(Theme.hex(l.color))
        .setScale((l.radius * 1.4) / 64)
        .setDepth(9100)
        .setAlpha(0);
      return { ...l, glow, phase: Math.random() * 10, intensity: 1 };
    });
  }

  setParams(p: LightingParams, immediate = false): void {
    this.params = p;
    this.tint.setFillStyle(Theme.hex(p.tint), 1);
    if (immediate) {
      this.current.darkness = p.darkness;
      this.current.tintAlpha = p.tintAlpha;
    }
  }

  get darkness(): number {
    return this.current.darkness;
  }

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera, player: { x: number; y: number }): void {
    const k = Math.min(1, dt / 600);
    this.current.darkness += (this.params.darkness - this.current.darkness) * k;
    this.current.tintAlpha += (this.params.tintAlpha - this.current.tintAlpha) * k;
    this.flickerT += dt / 1000;

    const ox = Math.floor(cam.worldView.x) - this.pad;
    const oy = Math.floor(cam.worldView.y) - this.pad;
    this.rt.setPosition(ox, oy);
    this.tint.setPosition(ox, oy).setAlpha(this.current.tintAlpha);

    const dark = this.current.darkness;
    const visible = (l: { x: number; y: number; radius: number }) =>
      l.x + l.radius > ox && l.x - l.radius < ox + this.rt.width && l.y + l.radius > oy && l.y - l.radius < oy + this.rt.height;

    for (const l of this.lights) {
      const on = !(l.power && this.params.powerOut);
      let inten = on ? 1 : 0;
      if (on && l.flicker) inten = 0.75 + Math.sin(this.flickerT * 13 + (l.phase ?? 0)) * 0.12 + Math.sin(this.flickerT * 31 + (l.phase ?? 0)) * 0.1;
      l.intensity = inten;
      l.glow?.setAlpha(inten * Math.min(0.4, dark * 0.55)).setVisible(visible(l));
    }

    if (dark < 0.02) {
      this.rt.setVisible(false);
      this.playerGlow.setAlpha(0);
      return;
    }
    this.rt.setVisible(true);
    this.rt.clear();
    this.rt.fill(0x05040c, dark);
    for (const l of this.lights) {
      if (!l.intensity || !visible(l)) continue;
      this.stamp.setScale((l.radius * 2) / 128).setAlpha(l.intensity);
      this.rt.erase(this.stamp, l.x - ox, l.y - oy);
    }
    if (this.playerLight.on) {
      const r = this.playerLight.radius;
      this.stamp.setScale((r * 1.1) / 128).setAlpha(0.85);
      this.rt.erase(this.stamp, player.x - ox, player.y - 8 - oy);
      this.cone.setScale((r * 2.2) / 128).setRotation(Math.atan2(this.playerLight.dirY, this.playerLight.dirX)).setAlpha(0.95);
      this.rt.erase(this.cone, player.x - ox, player.y - 10 - oy);
      this.playerGlow.setPosition(player.x, player.y - 8).setScale((r * 0.9) / 64).setTint(0xfff0d0).setAlpha(dark * 0.22);
    }
  }

  destroy(): void {
    this.lights.forEach((l) => l.glow?.destroy());
    this.rt.destroy();
    this.tint.destroy();
    this.stamp.destroy();
    this.cone.destroy();
    this.playerGlow.destroy();
  }
}

/** 太陽の影（時間帯で向きと長さが変わる） */
export class SunShadows {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(1);
  }

  draw(casters: { x: number; y: number; h: number }[], angleDeg: number, length: number, alpha: number, tile: number): void {
    this.g.clear();
    if (length <= 0 || alpha <= 0) return;
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    this.g.fillStyle(0x000010, alpha);
    for (const c of casters) {
      const len = c.h * length * tile * 0.5;
      const x0 = c.x * tile;
      const y0 = c.y * tile;
      // タイル底辺から影方向へ平行四辺形を伸ばす
      const ex = dx * len;
      const ey = Math.max(-tile * 0.2, dy * len * 0.6);
      this.g.fillPoints(
        [
          new Phaser.Math.Vector2(x0 + 2, y0 + tile - 2),
          new Phaser.Math.Vector2(x0 + tile - 2, y0 + tile - 2),
          new Phaser.Math.Vector2(x0 + tile - 2 + ex, y0 + tile - 2 + ey),
          new Phaser.Math.Vector2(x0 + 2 + ex, y0 + tile - 2 + ey),
        ],
        true,
      );
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 霧と雨 */
export class WeatherFx {
  private fogA: Phaser.GameObjects.TileSprite;
  private fogB: Phaser.GameObjects.TileSprite;
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fogTarget = 0;
  private fogNow = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly viewW: number,
    private readonly viewH: number,
  ) {
    this.fogA = scene.add.tileSprite(0, 0, viewW + 64, viewH + 64, TEX.fog).setOrigin(0).setDepth(9150).setAlpha(0).setScale(1.5);
    this.fogB = scene.add.tileSprite(0, 0, viewW + 64, viewH + 64, TEX.fog).setOrigin(0).setDepth(9150).setAlpha(0).setScale(2.2);
  }

  set(fog: number, rain: number, back: boolean): void {
    this.fogTarget = fog;
    if (rain > 0 && !this.rain) {
      this.rain = this.scene.add.particles(0, 0, TEX.rain, {
        x: { min: 0, max: this.viewW + 200 },
        y: -20,
        lifespan: 900,
        speedY: { min: 380, max: 460 },
        speedX: { min: -70, max: -50 },
        quantity: Math.round(3 * rain),
        frequency: 16,
        alpha: { start: 0.7, end: 0.3 },
      });
      this.rain.setDepth(9500);
    } else if (rain <= 0 && this.rain) {
      this.rain.destroy();
      this.rain = undefined;
    }
    if (back && !this.embers) {
      this.embers = this.scene.add.particles(0, 0, TEX.ember, {
        x: { min: 0, max: this.viewW },
        y: { min: 0, max: this.viewH },
        lifespan: 4000,
        speedY: { min: -12, max: -4 },
        speedX: { min: -6, max: 6 },
        alpha: { start: 0, end: 0.6, ease: 'Sine.inOut' },
        scale: { min: 0.5, max: 1 },
        frequency: 220,
        blendMode: 'ADD',
      });
      this.embers.setDepth(9450);
    } else if (!back && this.embers) {
      this.embers.destroy();
      this.embers = undefined;
    }
  }

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    this.fogNow += (this.fogTarget - this.fogNow) * Math.min(1, dt / 1000);
    const x = Math.floor(cam.worldView.x) - 32;
    const y = Math.floor(cam.worldView.y) - 32;
    this.fogA.setPosition(x, y).setAlpha(this.fogNow * 0.8);
    this.fogB.setPosition(x, y).setAlpha(this.fogNow * 0.55);
    this.fogA.tilePositionX = x / 1.5 + this.scene.time.now * 0.006;
    this.fogA.tilePositionY = y / 1.5;
    this.fogB.tilePositionX = x / 2.2 - this.scene.time.now * 0.004;
    this.fogB.tilePositionY = y / 2.2 + this.scene.time.now * 0.002;
    // パーティクルの発生源をカメラの表示範囲に追従させる
    this.rain?.setPosition(cam.worldView.x - 60, cam.worldView.y);
    this.embers?.setPosition(cam.worldView.x, cam.worldView.y);
  }

  destroy(): void {
    this.fogA.destroy();
    this.fogB.destroy();
    this.rain?.destroy();
    this.embers?.destroy();
  }
}
