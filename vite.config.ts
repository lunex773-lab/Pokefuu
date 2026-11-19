import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 相対パスでビルド（GitHub Pages / Capacitor 等どこに置いても動くように）
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
