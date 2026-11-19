import type { TimePhase, WeatherId, WorldLayer } from '@/domain/types';
import { EventBus } from './EventBus';

/** ゲーム全体で流れるイベントの一覧（ここに追加するだけで型安全に購読できる） */
export interface GameEventMap {
  'flag:changed': { key: string; value: boolean | number | string | undefined };
  'item:changed': { itemId: string; qty: number; delta: number };
  'money:changed': { money: number; delta: number };
  'kaii:seen': { speciesId: string };
  'kaii:recruited': { speciesId: string; uid: string };
  'kaii:calmed': { speciesId: string };
  'kaii:levelup': { uid: string; level: number };
  'kaii:learned': { uid: string; skillId: string };
  'player:levelup': { level: number };
  'player:sanity': { sanity: number; delta: number };
  'battle:start': { encounterId: string; boss: boolean };
  'battle:end': { result: 'win' | 'lose' | 'flee'; boss: boolean; encounterId: string };
  'map:enter': { mapId: string; layer: WorldLayer; dangerLevel: number };
  'time:phase': { phase: TimePhase };
  'time:tick': { minutes: number; day: number };
  'weather:changed': { weather: WeatherId };
  'chapter:changed': { chapter: string };
  'memory:found': { id: string };
  'achievement:unlocked': { id: string };
  'craft:done': { recipeId: string };
  'equip:changed': { target: string };
  'save:completed': { slot: string; auto: boolean };
  'sight:used': { mapId: string };
  'parttime:done': { earned: number };
  'counter:changed': { key: string; value: number };
  'ui:toast': { text: string; color?: string };
  'audio:sfx': { id: string; volume?: number };
  'ending:reached': { id: string };
}

export type GameBus = EventBus<GameEventMap>;
export const createGameBus = (): GameBus => new EventBus<GameEventMap>();
