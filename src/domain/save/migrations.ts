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
  // v2：地図（歩いた場所の記録）を追加
  1: (s) => ({ ...s, explored: {}, version: 2 }),
  // v3：怪異に持たせた御守りは、持ち物から取り出して渡す形に変更
  //     （以前は持ち物に残ったままだった）。持ち物に無い分は外す
  2: (s) => {
    const inv = { ...((s.inventory as Record<string, number>) ?? {}) };
    const fix = (list: unknown) =>
      ((list as { charm?: string }[]) ?? []).map((k) => {
        if (!k.charm) return k;
        if ((inv[k.charm] ?? 0) > 0) {
          inv[k.charm] -= 1;
          if (inv[k.charm] === 0) delete inv[k.charm];
          return k;
        }
        return { ...k, charm: undefined };
      });
    return { ...s, party: fix(s.party), storage: fix(s.storage), inventory: inv, version: 3 };
  },
};
