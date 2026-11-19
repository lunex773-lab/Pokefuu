import type { GameState } from '../state/GameState';
import type { Condition, TimePhase } from '../types';

export interface ConditionContext {
  state: GameState;
  phase: TimePhase;
}

/** データ内の条件式を評価する。未指定の項目は「条件なし」として扱う */
export function evaluate(cond: Condition | undefined, ctx: ConditionContext): boolean {
  if (!cond) return true;
  const { state, phase } = ctx;
  if (cond.flag !== undefined && !state.flags[cond.flag]) return false;
  if (cond.notFlag !== undefined && state.flags[cond.notFlag]) return false;
  if (cond.flagGte) {
    const v = state.flags[cond.flagGte.key];
    if (typeof v !== 'number' || v < cond.flagGte.value) return false;
  }
  if (cond.phase && !cond.phase.includes(phase)) return false;
  if (cond.notPhase && cond.notPhase.includes(phase)) return false;
  if (cond.weather && !cond.weather.includes(state.weather.current)) return false;
  if (cond.notWeather && cond.notWeather.includes(state.weather.current)) return false;
  if (cond.hasItem !== undefined && !((state.inventory[cond.hasItem] ?? 0) > 0)) return false;
  if (cond.notItem !== undefined && (state.inventory[cond.notItem] ?? 0) > 0) return false;
  if (cond.chapter && !cond.chapter.includes(state.chapter)) return false;
  if (cond.partySizeGte !== undefined && state.party.length < cond.partySizeGte) return false;
  if (cond.today !== undefined && state.flags[cond.today] !== state.clock.day) return false;
  if (cond.notToday !== undefined && state.flags[cond.notToday] === state.clock.day) return false;
  if (cond.recruited !== undefined && !state.compendium[cond.recruited]?.recruited) return false;
  if (cond.notRecruited !== undefined && state.compendium[cond.notRecruited]?.recruited) return false;
  if (cond.all && !cond.all.every((c) => evaluate(c, ctx))) return false;
  if (cond.any && !cond.any.some((c) => evaluate(c, ctx))) return false;
  return true;
}
