import Phaser from 'phaser';
import jpFontUrl from '@fontsource/dotgothic16/files/dotgothic16-japanese-400-normal.woff2?url';
import latinFontUrl from '@fontsource/dotgothic16/files/dotgothic16-latin-400-normal.woff2?url';
import type { GameContext } from '@/core/GameContext';
import { TextureFactory } from '@/render/TextureFactory';

/** フォント読み込み → ドット絵テクスチャ生成 → タイトルへ */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const ctx = this.registry.get('ctx') as GameContext;
    const t = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', { fontFamily: 'sans-serif', fontSize: '40px', color: '#8f88a0' }).setOrigin(0.5);
    void (async () => {
      await loadFonts();
      await ctx.loadSettings();
      const tf = new TextureFactory(this, ctx.reg);
      tf.buildAll();
      ctx.tileAtlas = tf.tileAtlas;
      t.destroy();
      this.scene.start('Title');
    })();
  }
}

async function loadFonts(): Promise<void> {
  try {
    const faces = [
      new FontFace('DotGothic16', `url(${latinFontUrl}) format("woff2")`, { unicodeRange: 'U+0000-00FF,U+2000-206F,U+2190-21FF,U+25A0-25FF' }),
      new FontFace('DotGothic16', `url(${jpFontUrl}) format("woff2")`),
    ];
    await Promise.all(
      faces.map(async (f) => {
        await f.load();
        document.fonts.add(f);
      }),
    );
  } catch (e) {
    console.warn('[Boot] font load failed, falling back to system font', e);
  }
}
