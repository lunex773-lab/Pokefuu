import { chance, type Rng } from '@/core/Rng';
import type { DataRegistry } from '@/data/DataRegistry';
import type { KaiiData } from '../state/GameState';
import type { BattleOutcome } from './BattleEngine';

export interface Rewards {
  /** uid -> 獲得経験値 */
  exp: Record<string, number>;
  playerExp: number;
  drops: { item: string; qty: number }[];
}

/**
 * 戦闘報酬。鎮めた／封印した怪異ぶんの経験値を、
 * 参加した怪異には全量、控えには3割配る（育成のテンポを保つため）。
 */
export function computeRewards(reg: DataRegistry, outcome: BattleOutcome, party: KaiiData[], rng: Rng): Rewards {
  const defeated = [...outcome.calmed, ...outcome.sealed];
  const total = defeated.reduce((s, k) => s + Math.floor((reg.species(k.speciesId).expYield * k.level) / 4), 0);
  const exp: Record<string, number> = {};
  for (const k of party) {
    if (k.hp <= 0) continue;
    exp[k.uid] = outcome.participants.includes(k.uid) ? total : Math.floor(total * 0.3);
  }
  const dropMap = new Map<string, number>();
  for (const k of outcome.calmed) {
    for (const d of reg.species(k.speciesId).drops) {
      if (chance(rng, d.chance)) dropMap.set(d.item, (dropMap.get(d.item) ?? 0) + 1);
    }
  }
  return {
    exp,
    playerExp: Math.floor(total * 0.5),
    drops: [...dropMap.entries()].map(([item, qty]) => ({ item, qty })),
  };
}
