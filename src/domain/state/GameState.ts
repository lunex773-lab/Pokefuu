import type { Direction, Gender, WeatherId } from '../types';

export type FlagValue = boolean | number | string;

/** 状態異常の実体 */
export interface StatusInstance {
  id: string;
  turns: number;
}

/** 怪異の個体データ（セーブ対象） */
export interface KaiiData {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number;
  exp: number;
  hp: number;
  en: number;
  status?: StatusInstance;
  /** 装備中スキル（最大4） */
  skills: string[];
  /** 習得済みで外しているスキル */
  learned: string[];
  charm?: string;
  /** 絆（共鳴時の値・戦闘参加などで上昇） */
  bond: number;
}

export interface PlayerData {
  name: string;
  gender: Gender;
  level: number;
  exp: number;
  sanity: number;
  money: number;
  equipment: { light?: string; charm?: string };
  position: { mapId: string; x: number; y: number; facing: Direction };
  /** 意識を失ったときの復帰地点 */
  respawn: { mapId: string; x: number; y: number };
}

export interface GameState {
  version: number;
  player: PlayerData;
  party: KaiiData[];
  storage: KaiiData[];
  inventory: Record<string, number>;
  flags: Record<string, FlagValue>;
  counters: Record<string, number>;
  clock: { day: number; minutes: number };
  weather: { current: WeatherId; locked: boolean };
  compendium: Record<string, { seen: boolean; recruited: boolean }>;
  memories: string[];
  achievements: string[];
  chapter: string;
  playTimeMs: number;
  nextUid: number;
  /** 地図：歩いて見たことのあるマス（マップIDごとのビット列を base64 で保存） */
  explored: Record<string, string>;
}

export function createInitialState(name: string, gender: Gender): GameState {
  return {
    version: 3,
    player: {
      name,
      gender,
      level: 1,
      exp: 0,
      sanity: 100,
      money: 1000,
      equipment: { light: 'smartphone' },
      position: { mapId: 'home', x: 4, y: 3, facing: 'down' },
      respawn: { mapId: 'home', x: 4, y: 3 },
    },
    party: [],
    storage: [],
    inventory: { smartphone: 1 },
    flags: {},
    counters: {},
    clock: { day: 1, minutes: 7 * 60 },
    weather: { current: 'clear', locked: false },
    compendium: {},
    memories: [],
    achievements: [],
    chapter: 'ch1',
    playTimeMs: 0,
    nextUid: 1,
    explored: {},
  };
}
