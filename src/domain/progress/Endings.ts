import type { GameState } from '../state/GameState';
import type { EndingDef } from '../types';

export interface EndingContext {
  state: GameState;
  /** 全記憶片のID（全章ぶん） */
  memoryIds: string[];
  /** 全怪異のID */
  speciesIds: string[];
  finalChoice: 'accept' | 'reject';
}

export const hasAllMemories = (c: Pick<EndingContext, 'state' | 'memoryIds'>): boolean =>
  c.memoryIds.every((id) => c.state.memories.includes(id));

export const isCompendiumComplete = (c: Pick<EndingContext, 'state' | 'speciesIds'>): boolean =>
  c.speciesIds.every((id) => c.state.compendium[id]?.recruited);

/**
 * エンディング判定（記憶片＋最後の選択）。
 * endings.json の rule を priority の高い順に評価し、最初に一致したものを返す。
 */
export function resolveEnding(defs: EndingDef[], c: EndingContext): EndingDef {
  const allMem = hasAllMemories(c);
  const complete = isCompendiumComplete(c);
  const sorted = [...defs].sort((a, b) => b.priority - a.priority);
  for (const d of sorted) {
    const r = d.rule;
    if (r.finalChoice !== undefined && r.finalChoice !== c.finalChoice) continue;
    if (r.allMemories !== undefined && r.allMemories !== allMem) continue;
    if (r.compendiumComplete !== undefined && r.compendiumComplete !== complete) continue;
    return d;
  }
  return sorted[sorted.length - 1];
}
