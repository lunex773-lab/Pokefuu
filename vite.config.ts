import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  // single: 1つのHTMLファイルにすべてを埋め込むビルド（配布・プレビュー用）
  const single = mode === 'single';
  return {
    // 相対パスでビルド（GitHub Pages / Capacitor 等どこに置いても動くように）
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2020',
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 0,
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        output: single ? { inlineDynamicImports: true } : { manualChunks: { phaser: ['phaser'] } },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
