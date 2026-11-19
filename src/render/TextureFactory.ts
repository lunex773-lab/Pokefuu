import Phaser from 'phaser';
import type { DataRegistry } from '@/data/DataRegistry';
import { buildCharacterSheet, CHAR_DIRS, CHAR_FRAMES, CHAR_SIZE } from './sprites/characters';
import {
  buildBattleBackdrop,
  buildConeTexture,
  buildDotTexture,
  buildFogTexture,
  buildItemIcon,
  buildLightTexture,
  buildRainTexture,
  buildShadowBlob,
} from './sprites/effects';
import { buildDistortionSprite, buildKaiiSprite, buildWispSheet } from './sprites/kaii';
import { buildTileAtlas, type TileAtlas } from './sprites/tiles';

export const TEX = {
  tiles: 'tileset',
  light: 'fx_light',
  cone: 'fx_cone',
  fog: 'fx_fog',
  rain: 'fx_rain',
  dot: 'fx_dot',
  ember: 'fx_ember',
  shadow: 'fx_shadow',
  wisp: 'wisp',
  distortion: 'distortion',
  backdropReality: 'bg_reality',
  backdropBack: 'bg_back',
} as const;

/** 人物スプライトのアニメーションキー */
export const charAnim = (sprite: string, dir: string) => `${sprite}_walk_${dir}`;
export const charFrame = (dir: string, f = 0) => `${dir}_${f}`;
export const itemIconKey = (icon: string) => `icon_${icon}`;

/**
 * 起動時に、コード生成したドット絵をすべて Phaser テクスチャへ登録する。
 * 本番素材に差し替える場合は、同じキーで画像を load すればよい。
 */
export class TextureFactory {
  tileAtlas!: TileAtlas;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reg: DataRegistry,
  ) {}

  buildAll(): void {
    this.buildTiles();
    this.buildCharacters();
    this.buildKaii();
    this.buildFx();
    this.buildIcons();
  }

  private addCanvas(key: string, canvas: HTMLCanvasElement): Phaser.Textures.CanvasTexture | null {
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    return this.scene.textures.addCanvas(key, canvas);
  }

  private buildTiles(): void {
    this.tileAtlas = buildTileAtlas(this.reg.data.tiles);
    this.addCanvas(TEX.tiles, this.tileAtlas.canvas.toCanvas());
  }

  private buildCharacters(): void {
    for (const def of this.reg.data.npcSprites) {
      const tex = this.addCanvas(def.id, buildCharacterSheet(def).toCanvas());
      if (!tex) continue;
      CHAR_DIRS.forEach((dir, row) => {
        for (let f = 0; f < CHAR_FRAMES; f++) tex.add(charFrame(dir, f), 0, f * CHAR_SIZE, row * CHAR_SIZE, CHAR_SIZE, CHAR_SIZE);
        this.scene.anims.create({
          key: charAnim(def.id, dir),
          frames: [1, 0, 2, 0].map((f) => ({ key: def.id, frame: charFrame(dir, f) })),
          frameRate: 7,
          repeat: -1,
        });
      });
    }
  }

  private buildKaii(): void {
    const keys = new Set(this.reg.data.kaii.map((k) => k.sprite));
    for (const key of keys) this.addCanvas(key, buildKaiiSprite(key).toCanvas());
    const wisp = this.addCanvas(TEX.wisp, buildWispSheet().toCanvas());
    if (wisp) {
      for (let f = 0; f < 3; f++) wisp.add(`f${f}`, 0, f * 32, 0, 32, 32);
      this.scene.anims.create({ key: 'wisp_idle', frames: [0, 1, 2, 1].map((f) => ({ key: TEX.wisp, frame: `f${f}` })), frameRate: 5, repeat: -1 });
    }
    this.addCanvas(TEX.distortion, buildDistortionSprite().toCanvas());
  }

  private buildFx(): void {
    // 光と霧はなめらかに見せたいので線形補間（ドット絵本体は最近傍のまま）
    const linear = (t: Phaser.Textures.CanvasTexture | null) => t?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    linear(this.addCanvas(TEX.light, buildLightTexture(128)));
    linear(this.addCanvas(TEX.cone, buildConeTexture(128)));
    linear(this.addCanvas(TEX.fog, buildFogTexture(128)));
    this.addCanvas(TEX.rain, buildRainTexture());
    this.addCanvas(TEX.dot, buildDotTexture('#ffffff', 2));
    this.addCanvas(TEX.ember, buildDotTexture('#ff5070', 2));
    this.addCanvas(TEX.shadow, buildShadowBlob());
    this.addCanvas(TEX.backdropReality, buildBattleBackdrop(960, 540, false));
    this.addCanvas(TEX.backdropBack, buildBattleBackdrop(960, 540, true));
  }

  private buildIcons(): void {
    for (const item of this.reg.data.items) {
      const key = itemIconKey(item.icon);
      if (!this.scene.textures.exists(key)) this.addCanvas(key, buildItemIcon(item.icon, item.category));
    }
  }
}
