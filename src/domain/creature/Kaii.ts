import type { DataRegistry } from '@/data/DataRegistry';
import type { KaiiData } from '../state/GameState';
import type { KaiiSpeciesDef, Stats, StatKey } from '../types';

export const MAX_LEVEL = 60;
export const MAX_SKILLS = 4;
export const MAX_EN = 10;

/** レベルnからn+1に必要な経験値 */
export const expToNext = (level: number): number => Math.floor(6 * Math.pow(level, 1.55) + 12);

/** 主人公レベルの必要経験値（怪異よりやや緩やか） */
export const playerExpToNext = (level: number): number => Math.floor(10 * Math.pow(level, 1.4) + 20);

export function computeStats(species: KaiiSpeciesDef, level: number, statMul?: Partial<Record<StatKey, number>>): Stats {
  const out = {} as Stats;
  for (const k of ['hp', 'atk', 'def', 'spd', 'mnd'] as StatKey[]) {
    const raw = species.base[k] + species.growth[k] * (level - 1);
    out[k] = Math.max(1, Math.floor(raw * (statMul?.[k] ?? 1)));
  }
  return out;
}

export function kaiiStats(reg: DataRegistry, k: KaiiData): Stats {
  const species = reg.species(k.speciesId);
  const charm = k.charm ? reg.items.get(k.charm)?.equip?.statMul : undefined;
  return computeStats(species, k.level, charm);
}

export function displayName(reg: DataRegistry, k: KaiiData): string {
  return k.nickname ?? reg.species(k.speciesId).name;
}

/** その種族がレベルまでに習得するスキル（新しい順に最大4つを装備） */
export function skillsAtLevel(species: KaiiSpeciesDef, level: number): { equipped: string[]; learned: string[] } {
  const all = species.learnset.filter((l) => l.level <= level).map((l) => l.skill);
  const uniq = [...new Set(all)];
  const equipped = uniq.slice(-MAX_SKILLS);
  const learned = uniq.slice(0, Math.max(0, uniq.length - MAX_SKILLS));
  return { equipped, learned };
}

export function createKaii(reg: DataRegistry, speciesId: string, level: number, uid: string): KaiiData {
  const species = reg.species(speciesId);
  const { equipped, learned } = skillsAtLevel(species, level);
  const stats = computeStats(species, level);
  return {
    uid,
    speciesId,
    level,
    exp: 0,
    hp: stats.hp,
    en: MAX_EN,
    skills: equipped,
    learned,
    bond: 0,
  };
}

export interface LevelUpResult {
  levels: number[];
  newSkills: string[];
}

/** 経験値を加算し、レベルアップと新スキル習得を処理する */
export function gainExp(reg: DataRegistry, k: KaiiData, amount: number): LevelUpResult {
  const res: LevelUpResult = { levels: [], newSkills: [] };
  if (k.level >= MAX_LEVEL) return res;
  const species = reg.species(k.speciesId);
  k.exp += Math.max(0, Math.floor(amount));
  while (k.level < MAX_LEVEL && k.exp >= expToNext(k.level)) {
    const before = kaiiStats(reg, k);
    k.exp -= expToNext(k.level);
    k.level += 1;
    const after = kaiiStats(reg, k);
    // 最大HPの増加分だけ現在HPも増やす（消耗中は回復しない）
    if (k.hp > 0) k.hp = Math.min(after.hp, k.hp + (after.hp - before.hp));
    res.levels.push(k.level);
    for (const l of species.learnset.filter((x) => x.level === k.level)) {
      if (k.skills.includes(l.skill) || k.learned.includes(l.skill)) continue;
      if (k.skills.length < MAX_SKILLS) k.skills.push(l.skill);
      else k.learned.push(l.skill);
      res.newSkills.push(l.skill);
    }
  }
  return res;
}

export function healFull(reg: DataRegistry, k: KaiiData): void {
  k.hp = kaiiStats(reg, k).hp;
  k.en = MAX_EN;
  k.status = undefined;
}

/** 装備スキルと控えスキルを入れ替える（育成メニュー） */
export function swapSkill(k: KaiiData, equippedIndex: number, learnedSkill: string): boolean {
  const li = k.learned.indexOf(learnedSkill);
  if (li < 0) return false;
  if (equippedIndex >= k.skills.length) {
    if (k.skills.length >= MAX_SKILLS) return false;
    k.skills.push(learnedSkill);
    k.learned.splice(li, 1);
    return true;
  }
  const old = k.skills[equippedIndex];
  k.skills[equippedIndex] = learnedSkill;
  k.learned[li] = old;
  return true;
}
