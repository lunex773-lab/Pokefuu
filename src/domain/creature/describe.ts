import type { DataRegistry } from '@/data/DataRegistry';
import { typeMultiplier } from '../battle/TypeChart';
import type { EmotionType, SkillDef, StatKey } from '../types';

/**
 * 怪異・技の説明文を作る（メニューの「くわしく見る」と戦闘の「強さをみる」で共通）。
 * 表示に依存しない純粋な関数なので、テストで文面を確かめられる。
 */

export const STAT_NAMES: Record<StatKey, string> = { hp: 'HP', atk: '攻撃', def: '守り', spd: '素早さ', mnd: '精神' };
const CATEGORY: Record<SkillDef['category'], string> = { phys: '物理', mind: '精神', support: '補助' };
const TARGET: Record<SkillDef['target'], string> = {
  enemy: '敵1体',
  allEnemies: '敵全体',
  self: '自分',
  ally: '味方1体',
  allAllies: '味方全体',
};

export function typeName(reg: DataRegistry, t: SkillDef['type']): string {
  return t === 'none' ? '無' : reg.types.get(t)?.name ?? t;
}

/** 技の1行目（タイプ・分類・威力・命中・気力・対象） */
export function skillHeader(reg: DataRegistry, sk: SkillDef): string {
  const power = sk.power > 0 ? `威力${sk.power}` : '威力―';
  return `［${typeName(reg, sk.type)}・${CATEGORY[sk.category]}］ ${power}  命中${sk.accuracy}  EN${sk.cost}  ${TARGET[sk.target]}`;
}

/** 技の追加効果（状態異常・能力変化・回復など）。無ければ空文字 */
export function skillEffects(reg: DataRegistry, sk: SkillDef): string {
  const out: string[] = [];
  if (sk.status) out.push(`${Math.round(sk.status.chance * 100)}%で${reg.status(sk.status.id).name}`);
  if (sk.buff) {
    const who = sk.buff.to === 'self' ? '自分の' : sk.buff.to === 'allAllies' ? '味方全員の' : '相手の';
    out.push(`${who}${STAT_NAMES[sk.buff.stat]}を${Math.abs(sk.buff.stages)}段階${sk.buff.stages > 0 ? '上げる' : '下げる'}`);
  }
  if (sk.heal) out.push(`最大HPの${Math.round(sk.heal.ratio * 100)}%回復`);
  if (sk.drain) out.push(`与えたダメージの${Math.round(sk.drain * 100)}%を吸収`);
  if (sk.recoil) out.push(`与えたダメージの${Math.round(sk.recoil * 100)}%を反動で受ける`);
  if (sk.priority) out.push(sk.priority > 0 ? '先に動ける' : '後に動く');
  if (sk.sanityDamage) out.push(`正気度を${sk.sanityDamage}削る`);
  return out.join('／');
}

/** 技の説明（見出し＋追加効果＋説明文） */
export function describeSkill(reg: DataRegistry, sk: SkillDef): string {
  const fx = skillEffects(reg, sk);
  return `${skillHeader(reg, sk)}${fx ? `\n効果：${fx}` : ''}\n${sk.description}`;
}

/** タイプ相性：その怪異に「よく響く」「響きにくい」感情 */
export function typeMatchups(reg: DataRegistry, types: EmotionType[]): { weak: EmotionType[]; resist: EmotionType[] } {
  const weak: EmotionType[] = [];
  const resist: EmotionType[] = [];
  for (const t of reg.data.types) {
    const m = typeMultiplier(reg.data.typeChart, t.id, types);
    if (m > 1.01) weak.push(t.id);
    else if (m < 0.99) resist.push(t.id);
  }
  return { weak, resist };
}

/** 能力段階の表示（+1 → 「↑1」） */
export const stageMark = (n: number): string => (n > 0 ? `↑${n}` : n < 0 ? `↓${-n}` : '');
