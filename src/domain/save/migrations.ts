import type { Migration } from './SaveManager';

/**
 * セーブデータのマイグレーション表。
 * GameState の形を変えたら GameConfig.save.version を1つ上げ、
 * ここに「旧バージョン → 次バージョン」の変換を追加する。
 *
 * 例:
 *   1: (s) => ({ ...s, newField: defaultValue }),
 */
export const migrations: Record<number, Migration> = {
  0: (s) => ({ ...s, version: 1 }),
};
