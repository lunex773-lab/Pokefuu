import type { MapDef, ScriptDef } from '@/domain/types';
import { DataRegistry, type GameData } from './DataRegistry';
import achievements from './json/achievements.json';
import chapters from './json/chapters.json';
import dangerLevels from './json/dangerLevels.json';
import encounters from './json/encounters.json';
import endings from './json/endings.json';
import fixedEncounters from './json/fixedEncounters.json';
import glossary from './json/glossary.json';
import items from './json/items.json';
import kaii from './json/kaii.json';
import memories from './json/memories.json';
import music from './json/music.json';
import npcSprites from './json/npcSprites.json';
import recipes from './json/recipes.json';
import shops from './json/shops.json';
import skills from './json/skills.json';
import statuses from './json/statuses.json';
import tiles from './json/tiles.json';
import timePhases from './json/timePhases.json';
import traits from './json/traits.json';
import typeChart from './json/typeChart.json';
import types from './json/types.json';
import weathers from './json/weathers.json';

export const gameData = {
  achievements,
  chapters,
  dangerLevels,
  encounters,
  endings,
  fixedEncounters,
  glossary,
  items,
  kaii,
  memories,
  music,
  npcSprites,
  recipes,
  shops,
  skills,
  statuses,
  tiles,
  timePhases,
  traits,
  typeChart,
  types,
  weathers,
} as unknown as GameData;

/** マップは章ごとに分割読み込み（ビルド時にチャンク分割される＝メモリ最適化） */
const mapModules = import.meta.glob<{ default: MapDef }>('./maps/*.json');
const scriptModules = import.meta.glob<{ default: ScriptDef[] }>('./scripts/*.json', { eager: true });

export const mapIds = (): string[] => Object.keys(mapModules).map((p) => p.replace('./maps/', '').replace('.json', ''));

export async function loadMap(id: string): Promise<MapDef> {
  const loader = mapModules[`./maps/${id}.json`];
  if (!loader) throw new Error(`map not found: ${id}`);
  return (await loader()).default;
}

export function allScripts(): ScriptDef[] {
  return Object.values(scriptModules).flatMap((m) => m.default);
}

export function createRegistry(): DataRegistry {
  const reg = new DataRegistry(gameData, loadMap);
  reg.registerScripts(allScripts());
  return reg;
}
