import { GameConfig } from '@/config/GameConfig';
import { chance, randInt, weightedPick, type Rng } from '@/core/Rng';
import type { DataRegistry } from '@/data/DataRegistry';
import { kaiiStats, MAX_EN } from '../creature/Kaii';
import type { KaiiData } from '../state/GameState';
import type { SkillDef, StatKey, Stats } from '../types';
import { stageMultiplier, typeMultiplier } from './TypeChart';

export type Side = 'ally' | 'enemy';
type StageKey = Exclude<StatKey, 'hp'>;

export interface Combatant {
  id: string;
  side: Side;
  slot: number;
  kaii: KaiiData;
  stages: Record<StageKey, number>;
  defending: boolean;
  out: boolean;
  participated: boolean;
}

export type PlayerAction =
  | { kind: 'seal'; target: string; item: string }
  | { kind: 'item'; item: string; target?: string }
  | { kind: 'flee' }
  | { kind: 'encourage' };

export type KaiiAction = { kind: 'skill'; skill: string; target?: string } | { kind: 'defend' } | { kind: 'swap'; withUid: string };

export interface TurnInput {
  player: PlayerAction;
  allies: Record<string, KaiiAction>;
}

export type BattleEvent =
  | { t: 'message'; text: string }
  | { t: 'use'; actor: string; skill: string; skillName: string }
  | { t: 'damage'; target: string; amount: number; hp: number; maxHp: number; eff: number; crit: boolean }
  | { t: 'miss'; actor: string; target: string }
  | { t: 'heal'; target: string; amount: number; hp: number; maxHp: number }
  | { t: 'status'; target: string; status: string }
  | { t: 'statusEnd'; target: string; status: string }
  | { t: 'buff'; target: string; stat: StageKey; stages: number }
  | { t: 'calm'; target: string }
  | { t: 'exhaust'; target: string }
  | { t: 'seal'; target: string; success: boolean; shakes: number }
  | { t: 'swap'; slot: number; out?: string; in: string }
  | { t: 'flee'; success: boolean }
  | { t: 'sanity'; delta: number; value: number }
  | { t: 'en'; target: string; en: number }
  | { t: 'end'; result: BattleResultKind };

export type BattleResultKind = 'win' | 'lose' | 'flee';

/** 戦闘エンジンが外部（主人公・所持品）に触れるための窓口 */
export interface BattleHost {
  hasItem(id: string): boolean;
  consumeItem(id: string): boolean;
  readonly sanity: number;
  addSanity(delta: number): void;
  readonly resonancePower: number;
  readonly sanityDrainMul: number;
}

export interface BattleSetup {
  party: KaiiData[];
  enemies: KaiiData[];
  canFlee: boolean;
  boss: boolean;
}

export interface BattleOutcome {
  result: BattleResultKind;
  calmed: KaiiData[];
  sealed: KaiiData[];
  participants: string[];
}

const emptyStages = (): Record<StageKey, number> => ({ atk: 0, def: 0, spd: 0, mnd: 0 });

/**
 * ターン制・3体編成の戦闘ロジック（描画に依存しない純粋なロジック）。
 * 1ターンの結果を BattleEvent の列として返し、演出は BattleScene が担当する。
 */
export class BattleEngine {
  readonly allies: (Combatant | null)[] = [null, null, null];
  readonly enemies: (Combatant | null)[] = [null, null, null];
  readonly reserves: KaiiData[];
  readonly sealed: KaiiData[] = [];
  readonly calmed: KaiiData[] = [];
  turn = 0;
  result: BattleResultKind | null = null;
  private fleeAttempts = 0;
  private seq = 0;

  constructor(
    private readonly reg: DataRegistry,
    private readonly rng: Rng,
    private readonly host: BattleHost,
    readonly setup: BattleSetup,
  ) {
    const able = setup.party.filter((k) => k.hp > 0);
    const active = able.slice(0, GameConfig.party.maxActive);
    active.forEach((k, i) => (this.allies[i] = this.makeCombatant('ally', i, k)));
    this.reserves = setup.party.filter((k) => !active.includes(k));
    setup.enemies.slice(0, 3).forEach((k, i) => (this.enemies[i] = this.makeCombatant('enemy', i, k)));
  }

  private makeCombatant(side: Side, slot: number, kaii: KaiiData): Combatant {
    return { id: `${side[0]}${this.seq++}`, side, slot, kaii, stages: emptyStages(), defending: false, out: false, participated: side === 'ally' };
  }

  // ------------------------------------------------------------ 参照

  all(): Combatant[] {
    return [...this.allies, ...this.enemies].filter((c): c is Combatant => !!c);
  }

  active(side: Side): Combatant[] {
    return (side === 'ally' ? this.allies : this.enemies).filter((c): c is Combatant => !!c && !c.out);
  }

  get(id: string): Combatant | undefined {
    return this.all().find((c) => c.id === id);
  }

  stats(c: Combatant): Stats {
    const base = kaiiStats(this.reg, c.kaii);
    const st = c.kaii.status ? this.reg.statuses.get(c.kaii.status.id) : undefined;
    const out = { ...base };
    for (const k of ['atk', 'def', 'spd', 'mnd'] as StageKey[]) {
      out[k] = Math.max(1, Math.floor(base[k] * stageMultiplier(c.stages[k]) * (st?.statMul?.[k] ?? 1)));
    }
    return out;
  }

  maxHp(c: Combatant): number {
    return kaiiStats(this.reg, c.kaii).hp;
  }

  /** そのスキルが今使えるか */
  canUse(c: Combatant, skillId: string): boolean {
    const s = this.reg.skill(skillId);
    if (c.kaii.en < s.cost) return false;
    const st = c.kaii.status ? this.reg.statuses.get(c.kaii.status.id) : undefined;
    if (st?.silence && s.cost > 0) return false;
    return true;
  }

  sealChance(target: Combatant, itemId: string): number {
    const species = this.reg.species(target.kaii.speciesId);
    if (species.sealRate <= 0) return 0;
    const power = this.reg.item(itemId).sealPower ?? 1;
    const ratio = target.kaii.hp / this.maxHp(target);
    const base = (1 - ratio) * 0.75 + 0.1 + (target.kaii.status ? 0.15 : 0);
    const c = base * power * species.sealRate + this.host.resonancePower;
    return Math.max(0.03, Math.min(0.95, c));
  }

  // ------------------------------------------------------------ ターン処理

  runTurn(input: TurnInput): BattleEvent[] {
    if (this.result) return [];
    this.turn += 1;
    const ev: BattleEvent[] = [];

    this.doPlayerAction(input.player, ev);
    if (this.checkEnd(ev)) return ev;

    type Queued = { actor: Combatant; action: KaiiAction; priority: number; speed: number };
    const queue: Queued[] = [];
    for (const c of this.active('ally')) {
      const action = input.allies[c.id] ?? this.aiAction(c);
      queue.push({ actor: c, action, priority: this.priorityOf(action), speed: this.stats(c).spd });
    }
    for (const c of this.active('enemy')) {
      const action = this.aiAction(c);
      queue.push({ actor: c, action, priority: this.priorityOf(action), speed: this.stats(c).spd });
    }
    queue.sort((a, b) => b.priority - a.priority || b.speed - a.speed || this.rng.next() - 0.5);

    for (const q of queue) {
      if (q.actor.out) continue;
      this.act(q.actor, q.action, ev);
      if (this.checkEnd(ev)) return ev;
    }

    this.endOfTurn(ev);
    this.checkEnd(ev);
    return ev;
  }

  private priorityOf(a: KaiiAction): number {
    if (a.kind === 'swap') return 10;
    if (a.kind === 'defend') return 5;
    return this.reg.skill(a.skill).priority ?? 0;
  }

  private doPlayerAction(a: PlayerAction, ev: BattleEvent[]): void {
    switch (a.kind) {
      case 'encourage': {
        ev.push({ t: 'message', text: '主人公は怪異たちに声をかけた。' });
        for (const c of this.active('ally')) {
          c.kaii.en = Math.min(MAX_EN, c.kaii.en + 2);
          c.kaii.bond = Math.min(100, c.kaii.bond + 1);
          ev.push({ t: 'en', target: c.id, en: c.kaii.en });
        }
        return;
      }
      case 'flee': {
        if (!this.setup.canFlee) {
          ev.push({ t: 'message', text: '逃げられない…！ 空間が閉じている。' });
          return;
        }
        this.fleeAttempts += 1;
        const mySpd = avg(this.active('ally').map((c) => this.stats(c).spd));
        const foeSpd = avg(this.active('enemy').map((c) => this.stats(c).spd));
        const p = Math.min(0.95, 0.45 + 0.15 * (this.fleeAttempts - 1) + (mySpd - foeSpd) / 100);
        const ok = chance(this.rng, p);
        ev.push({ t: 'flee', success: ok });
        if (ok) this.result = 'flee';
        return;
      }
      case 'seal': {
        const target = this.get(a.target);
        if (!target || target.out || target.side !== 'enemy') return;
        if (!this.host.consumeItem(a.item)) {
          ev.push({ t: 'message', text: '御札がない…' });
          return;
        }
        const name = this.reg.item(a.item).name;
        ev.push({ t: 'message', text: `主人公は${name}をかざした！` });
        const p = this.sealChance(target, a.item);
        const success = chance(this.rng, p);
        const shakes = success ? 3 : Math.min(2, Math.floor(p * 4 * this.rng.next() + this.rng.next()));
        ev.push({ t: 'seal', target: target.id, success, shakes });
        if (success) {
          target.out = true;
          this.sealed.push(target.kaii);
        } else if (this.reg.species(target.kaii.speciesId).sealRate <= 0) {
          ev.push({ t: 'message', text: 'この怪異は封印を拒んでいる…' });
        }
        return;
      }
      case 'item': {
        const def = this.reg.item(a.item);
        if (!def.use?.usableInBattle || !this.host.consumeItem(a.item)) return;
        ev.push({ t: 'message', text: `主人公は${def.name}を使った。` });
        if (def.use.target === 'player') {
          if (def.use.sanity) this.changeSanity(def.use.sanity, ev);
          return;
        }
        const target = a.target ? this.get(a.target) : undefined;
        const kaii = target?.kaii ?? this.reserves.find((k) => k.uid === a.target);
        if (!kaii) return;
        const max = kaiiStats(this.reg, kaii).hp;
        if (def.use.revive && kaii.hp <= 0) {
          kaii.hp = Math.max(1, Math.floor(max * def.use.revive));
        }
        if (kaii.hp > 0 && (def.use.healHp || def.use.healRatio)) {
          const amount = Math.min(max - kaii.hp, (def.use.healHp ?? 0) + Math.floor(max * (def.use.healRatio ?? 0)));
          kaii.hp += amount;
          if (target) ev.push({ t: 'heal', target: target.id, amount, hp: kaii.hp, maxHp: max });
        }
        if (def.use.cureStatus && kaii.status) {
          const st = kaii.status.id;
          kaii.status = undefined;
          if (target) ev.push({ t: 'statusEnd', target: target.id, status: st });
        }
        if (def.use.en) {
          kaii.en = Math.min(MAX_EN, kaii.en + def.use.en);
          if (target) ev.push({ t: 'en', target: target.id, en: kaii.en });
        }
        return;
      }
    }
  }

  private act(actor: Combatant, action: KaiiAction, ev: BattleEvent[]): void {
    // 状態異常による行動不能
    const st = actor.kaii.status ? this.reg.statuses.get(actor.kaii.status.id) : undefined;
    if (st?.skipChance && chance(this.rng, st.skipChance)) {
      ev.push({ t: 'message', text: `${this.name(actor)}は${st.name}で動けない！` });
      return;
    }
    if (action.kind === 'defend') {
      actor.defending = true;
      ev.push({ t: 'message', text: `${this.name(actor)}は身を守っている。` });
      return;
    }
    if (action.kind === 'swap') {
      this.swap(actor, action.withUid, ev);
      return;
    }
    let skillId = action.skill;
    if (!this.canUse(actor, skillId)) skillId = 'touch';
    const skill = this.reg.skill(skillId);
    actor.kaii.en = Math.max(0, actor.kaii.en - skill.cost);
    ev.push({ t: 'use', actor: actor.id, skill: skill.id, skillName: skill.name });
    for (const target of this.resolveTargets(actor, skill, action.target)) {
      if (this.result) return;
      this.applySkill(actor, target, skill, ev);
    }
  }

  private swap(actor: Combatant, uid: string, ev: BattleEvent[]): void {
    const idx = this.reserves.findIndex((k) => k.uid === uid && k.hp > 0);
    if (idx < 0) return;
    const incoming = this.reserves.splice(idx, 1)[0];
    this.reserves.push(actor.kaii);
    actor.out = true;
    const c = this.makeCombatant('ally', actor.slot, incoming);
    this.allies[actor.slot] = c;
    ev.push({ t: 'swap', slot: actor.slot, out: actor.id, in: c.id });
    ev.push({ t: 'message', text: `${this.reg.species(actor.kaii.speciesId).name}を下げ、${this.name(c)}を呼んだ！` });
  }

  private resolveTargets(actor: Combatant, skill: SkillDef, targetId?: string): Combatant[] {
    const foes = this.active(actor.side === 'ally' ? 'enemy' : 'ally');
    const friends = this.active(actor.side);
    switch (skill.target) {
      case 'self':
        return [actor];
      case 'allAllies':
        return friends;
      case 'allEnemies':
        return foes;
      case 'ally': {
        const t = targetId ? this.get(targetId) : undefined;
        if (t && !t.out && t.side === actor.side) return [t];
        return friends.length ? [friends.reduce((a, b) => (a.kaii.hp / this.maxHp(a) < b.kaii.hp / this.maxHp(b) ? a : b))] : [];
      }
      case 'enemy': {
        const t = targetId ? this.get(targetId) : undefined;
        if (t && !t.out && t.side !== actor.side) return [t];
        return foes.length ? [foes[randInt(this.rng, 0, foes.length - 1)]] : [];
      }
    }
  }

  private applySkill(actor: Combatant, target: Combatant, skill: SkillDef, ev: BattleEvent[]): void {
    const hostile = target.side !== actor.side;
    if (hostile && skill.accuracy < 100 && !chance(this.rng, skill.accuracy / 100)) {
      ev.push({ t: 'miss', actor: actor.id, target: target.id });
      return;
    }
    if (skill.power > 0 && hostile) {
      const { amount, eff, crit } = this.damage(actor, target, skill);
      this.hurt(target, amount, ev, eff, crit);
      if (skill.drain && amount > 0) this.healBy(actor, Math.floor(amount * skill.drain), ev);
      if (skill.recoil && amount > 0) this.hurt(actor, Math.max(1, Math.floor(amount * skill.recoil)), ev, 1, false);
      if (skill.sanityDamage && actor.side === 'enemy') this.changeSanity(-skill.sanityDamage * this.host.sanityDrainMul, ev);
    } else if (skill.sanityDamage && actor.side === 'enemy' && hostile) {
      this.changeSanity(-skill.sanityDamage * this.host.sanityDrainMul, ev);
    }
    if (skill.heal && !target.out) this.healBy(target, Math.floor(this.maxHp(target) * skill.heal.ratio), ev);
    if (skill.status && !target.out && !target.kaii.status && hostile) {
      const resist = Math.min(0.5, this.stats(target).mnd / (this.stats(actor).mnd * 4));
      if (chance(this.rng, skill.status.chance * (1 - resist))) {
        const def = this.reg.status(skill.status.id);
        target.kaii.status = { id: def.id, turns: skill.status.turns ?? def.defaultTurns };
        ev.push({ t: 'status', target: target.id, status: def.id });
      }
    }
    if (skill.buff) {
      const to = skill.buff.to === 'self' ? [actor] : skill.buff.to === 'allAllies' ? this.active(actor.side) : [target];
      for (const c of to) {
        if (c.out) continue;
        const before = c.stages[skill.buff.stat];
        c.stages[skill.buff.stat] = Math.max(-3, Math.min(3, before + skill.buff.stages));
        ev.push({ t: 'buff', target: c.id, stat: skill.buff.stat, stages: c.stages[skill.buff.stat] - before });
      }
    }
  }

  damage(actor: Combatant, target: Combatant, skill: SkillDef): { amount: number; eff: number; crit: boolean } {
    const a = this.stats(actor);
    const d = this.stats(target);
    const atk = skill.category === 'mind' ? a.mnd : a.atk;
    const def = skill.category === 'mind' ? d.mnd : d.def;
    const species = this.reg.species(target.kaii.speciesId);
    const eff = typeMultiplier(this.reg.data.typeChart, skill.type, species.types);
    const attackerTypes = this.reg.species(actor.kaii.speciesId).types;
    const stab = skill.type !== 'none' && attackerTypes.includes(skill.type) ? 1.2 : 1;
    const crit = chance(this.rng, 1 / 16);
    const spread = skill.target === 'allEnemies' ? 0.75 : 1;
    const base = ((2 * actor.kaii.level) / 5 + 2) * skill.power * (atk / Math.max(1, def)) / 50 + 2;
    const roll = 0.85 + this.rng.next() * 0.15;
    const mult = eff * stab * roll * (crit ? 1.5 : 1) * (target.defending ? 0.5 : 1) * spread;
    return { amount: eff === 0 ? 0 : Math.max(1, Math.floor(base * mult)), eff, crit };
  }

  private hurt(target: Combatant, amount: number, ev: BattleEvent[], eff: number, crit: boolean): void {
    target.kaii.hp = Math.max(0, target.kaii.hp - amount);
    ev.push({ t: 'damage', target: target.id, amount, hp: target.kaii.hp, maxHp: this.maxHp(target), eff, crit });
    if (target.kaii.hp <= 0) this.knockOut(target, ev);
  }

  private healBy(target: Combatant, amount: number, ev: BattleEvent[]): void {
    const max = this.maxHp(target);
    const a = Math.min(max - target.kaii.hp, Math.max(0, amount));
    if (a <= 0) return;
    target.kaii.hp += a;
    ev.push({ t: 'heal', target: target.id, amount: a, hp: target.kaii.hp, maxHp: max });
  }

  private knockOut(c: Combatant, ev: BattleEvent[]): void {
    c.out = true;
    c.kaii.status = undefined;
    if (c.side === 'enemy') {
      this.calmed.push(c.kaii);
      ev.push({ t: 'calm', target: c.id });
    } else {
      ev.push({ t: 'exhaust', target: c.id });
    }
  }

  private changeSanity(delta: number, ev: BattleEvent[]): void {
    const d = Math.round(delta);
    if (d === 0) return;
    this.host.addSanity(d);
    ev.push({ t: 'sanity', delta: d, value: this.host.sanity });
  }

  private endOfTurn(ev: BattleEvent[]): void {
    for (const c of this.all()) {
      if (c.out) continue;
      c.defending = false;
      c.kaii.en = Math.min(MAX_EN, c.kaii.en + 1);
      const s = c.kaii.status;
      if (!s) continue;
      const def = this.reg.status(s.id);
      if (def.dotRatio) {
        const amount = Math.max(1, Math.floor(this.maxHp(c) * def.dotRatio));
        ev.push({ t: 'message', text: `${this.name(c)}は${def.name}に蝕まれている…` });
        this.hurt(c, amount, ev, 1, false);
        if (c.out) continue;
      }
      s.turns -= 1;
      if (s.turns <= 0) {
        c.kaii.status = undefined;
        ev.push({ t: 'statusEnd', target: c.id, status: def.id });
      }
    }
    // 空いた枠に控えを自動で呼ぶ
    for (let i = 0; i < this.allies.length; i++) {
      const cur = this.allies[i];
      if (cur && !cur.out) continue;
      const next = this.reserves.findIndex((k) => k.hp > 0);
      if (next < 0) continue;
      const k = this.reserves.splice(next, 1)[0];
      if (cur && cur.kaii.hp <= 0) this.reserves.push(cur.kaii);
      const c = this.makeCombatant('ally', i, k);
      this.allies[i] = c;
      ev.push({ t: 'swap', slot: i, out: cur?.id, in: c.id });
      ev.push({ t: 'message', text: `${this.name(c)}が前に出た！` });
    }
  }

  private checkEnd(ev: BattleEvent[]): boolean {
    if (this.result === 'flee') {
      ev.push({ t: 'end', result: 'flee' });
      return true;
    }
    if (this.result) return true;
    if (this.host.sanity <= 0) {
      this.result = 'lose';
      ev.push({ t: 'message', text: '意識が…遠のいていく…' });
    } else if (this.active('enemy').length === 0) {
      this.result = 'win';
    } else if (this.active('ally').length === 0 && !this.reserves.some((k) => k.hp > 0)) {
      this.result = 'lose';
      ev.push({ t: 'message', text: '怪異たちは力を使い果たした…' });
    }
    if (this.result) {
      ev.push({ t: 'end', result: this.result });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ AI

  aiAction(c: Combatant): KaiiAction {
    const species = this.reg.species(c.kaii.speciesId);
    const usable = c.kaii.skills.filter((s) => this.canUse(c, s));
    if (usable.length === 0) return { kind: 'skill', skill: 'touch' };
    if (species.ai?.special && species.ai.specialEvery && this.turn % species.ai.specialEvery === 0 && this.canUse(c, species.ai.special)) {
      return { kind: 'skill', skill: species.ai.special };
    }
    const foes = this.active(c.side === 'ally' ? 'enemy' : 'ally');
    const friends = this.active(c.side);
    const pick = weightedPick(this.rng, usable, (id) => {
      const s = this.reg.skill(id);
      let w = species.ai?.weights?.[id] ?? 1;
      if (s.heal) {
        const hurt = friends.some((f) => f.kaii.hp / this.maxHp(f) < 0.5);
        w *= hurt ? 2 : 0.1;
      }
      if (s.power > 0 && foes.length) {
        const best = Math.max(...foes.map((f) => typeMultiplier(this.reg.data.typeChart, s.type, this.reg.species(f.kaii.speciesId).types)));
        w *= best;
        w *= 1 + s.power / 100;
      }
      if (s.buff && s.category === 'support') w *= this.turn <= 2 ? 1 : 0.5;
      return w;
    }) ?? usable[0];
    const skill = this.reg.skill(pick);
    let target: string | undefined;
    if (skill.target === 'enemy' && foes.length) {
      const weakest = foes.reduce((a, b) => (a.kaii.hp < b.kaii.hp ? a : b));
      target = chance(this.rng, 0.55) ? weakest.id : foes[randInt(this.rng, 0, foes.length - 1)].id;
    }
    return { kind: 'skill', skill: pick, target };
  }

  outcome(): BattleOutcome {
    return {
      result: this.result ?? 'flee',
      calmed: this.calmed,
      sealed: this.sealed,
      participants: this.all().filter((c) => c.side === 'ally' && c.participated).map((c) => c.kaii.uid),
    };
  }

  name(c: Combatant): string {
    const n = c.kaii.nickname ?? this.reg.species(c.kaii.speciesId).name;
    return c.side === 'enemy' ? `敵の${n}` : n;
  }
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** 共鳴判定：選択肢の値（理解度）と主人公の共鳴力・絆で成否を決める */
export function resonanceSucceeds(value: 0 | 1 | 2, resonancePower: number, rng: Rng): boolean {
  if (value === 2) return true;
  if (value === 0) return false;
  return chance(rng, 0.35 + resonancePower * 2);
}
