/**
 * 技術的な定数。ゲーム内容（バランス・テキスト等）は src/data に置き、
 * ここにはエンジン側の設定だけを置く。
 */
export const GameConfig = {
  /** 基準解像度（World Bible: 1920×1080 を基準に設計） */
  width: 1920,
  height: 1080,
  /** 1タイル = 32×32 ドット */
  tileSize: 32,
  /** ワールドカメラの拡大率（640×360 ドット相当を表示） */
  worldZoom: 3,
  /** 戦闘画面の怪異スプライト拡大率 */
  battleSpriteScale: 4,
  targetFps: 60,
  player: {
    walkSpeed: 84,
    dashSpeed: 150,
    /** 当たり判定（足元） */
    hitbox: { w: 14, h: 10, offsetY: 10 },
  },
  clock: {
    /** 現実1秒 = ゲーム内1分 → 1日24分 */
    realMsPerGameMinute: 1000,
    startMinutes: 7 * 60,
  },
  party: { maxActive: 3, maxParty: 6 },
  autosaveIntervalMs: 3 * 60 * 1000,
  sight: { radius: 120, durationMs: 8000, cooldownMs: 2500 },
  symbols: { aggroRadius: 96, speed: 38, chaseSpeed: 62 },
  ui: {
    fontFamily: '"DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
    textSpeedCharsPerSec: 40,
  },
  save: {
    version: 1,
    keyPrefix: 'pokefuu.save.',
    settingsKey: 'pokefuu.settings',
    slots: ['auto', '1', '2', '3'] as const,
  },
} as const;

export type SaveSlotId = (typeof GameConfig.save.slots)[number];
