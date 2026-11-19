import { GameConfig } from '@/config/GameConfig';
import type { GameBus } from '@/core/GameEvents';
import type { DataRegistry } from '@/data/DataRegistry';
import { createKaii, healFull, kaiiStats, MAX_EN, playerExpToNext } from '../creature/Kaii';
import type { InventoryService } from '../inventory/Inventory';
import type { FlagValue, GameState, KaiiData } from './GameState';

/** フラグ・カウンター */
export class FlagService {
  constructor(
    private readonly state: GameState,
    private readonly bus: GameBus,
  ) {}

  get(key: string): FlagValue | undefined {
    return this.state.flags[key];
  }

  is(key: string): boolean {
    return !!this.state.flags[key];
  }

  set(key: string, value: FlagValue = true): void {
    if (this.state.flags[key] === value) return;
    this.state.flags[key] = value;
    this.bus.emit('flag:changed', { key, value });
  }

  clear(key: string): void {
    if (!(key in this.state.flags)) return;
    delete this.state.flags[key];
    this.bus.emit('flag:changed', { key, value: undefined });
  }

  counter(key: string): number {
    return this.state.counters[key] ?? 0;
  }

  increment(key: string, by = 1): number {
    const v = (this.state.counters[key] ?? 0) + by;
    this.state.counters[key] = v;
    this.bus.emit('counter:changed', { key, value: v });
    return v;
  }
}

/** 主人公（レベル・正気度・装備） */
export class PlayerService {
  constructor(
    private readonly state: GameState,
    private readonly reg: DataRegistry,
    private readonly bus: GameBus,
    private readonly inv: InventoryService,
  ) {}

  get data() {
    return this.state.player;
  }

  /** 最大正気度は主人公レベルで上昇 */
  get maxSanity(): number {
    return 100 + (this.state.player.level - 1) * 5;
  }

  /** 共鳴力：共鳴・封印の成功率補正 */
  get resonancePower(): number {
    return this.state.player.level * 0.015;
  }

  get lightRadius(): number {
    const id = this.state.player.equipment.light;
    return (id && this.reg.items.get(id)?.equip?.lightRadius) || 48;
  }

  /** 懐中電灯のように前方を照らせるか */
  get lightCone(): boolean {
    const id = this.state.player.equipment.light;
    return !!(id && this.reg.items.get(id)?.equip?.cone);
  }

  get sanityDrainMul(): number {
    const id = this.state.player.equipment.charm;
    return (id && this.reg.items.get(id)?.equip?.sanityDrainMul) || 1;
  }

  addSanity(delta: number): void {
    const p = this.state.player;
    const before = p.sanity;
    p.sanity = Math.max(0, Math.min(this.maxSanity, p.sanity + delta));
    if (p.sanity !== before) this.bus.emit('player:sanity', { sanity: p.sanity, delta: p.sanity - before });
  }

  gainExp(amount: number): number[] {
    const p = this.state.player;
    const levels: number[] = [];
    p.exp += Math.max(0, Math.floor(amount));
    while (p.level < 99 && p.exp >= playerExpToNext(p.level)) {
      p.exp -= playerExpToNext(p.level);
      p.level += 1;
      levels.push(p.level);
      this.bus.emit('player:levelup', { level: p.level });
    }
    if (levels.length) this.addSanity(10 * levels.length);
    return levels;
  }

  equip(slot: 'light' | 'charm', itemId: string | undefined): boolean {
    if (itemId) {
      const def = this.reg.item(itemId);
      if (def.equip?.slot !== slot || !this.inv.has(itemId)) return false;
    }
    this.state.player.equipment[slot] = itemId;
    this.bus.emit('equip:changed', { target: 'player' });
    return true;
  }
}

/** 怪異の手持ち・保管 */
export class PartyService {
  constructor(
    private readonly state: GameState,
    private readonly reg: DataRegistry,
    private readonly bus: GameBus,
  ) {}

  get party(): KaiiData[] {
    return this.state.party;
  }

  get storage(): KaiiData[] {
    return this.state.storage;
  }

  newUid(): string {
    return `k${this.state.nextUid++}`;
  }

  create(speciesId: string, level: number): KaiiData {
    return createKaii(this.reg, speciesId, level, this.newUid());
  }

  /** 仲間に加える。手持ちが満杯なら保管へ */
  recruit(kaii: KaiiData): 'party' | 'storage' {
    const where = this.state.party.length < GameConfig.party.maxParty ? 'party' : 'storage';
    (where === 'party' ? this.state.party : this.state.storage).push(kaii);
    this.markRecruited(kaii.speciesId);
    this.bus.emit('kaii:recruited', { speciesId: kaii.speciesId, uid: kaii.uid });
    return where;
  }

  markSeen(speciesId: string): void {
    const e = (this.state.compendium[speciesId] ??= { seen: false, recruited: false });
    if (!e.seen) {
      e.seen = true;
      this.bus.emit('kaii:seen', { speciesId });
    }
  }

  markRecruited(speciesId: string): void {
    const e = (this.state.compendium[speciesId] ??= { seen: true, recruited: false });
    e.seen = true;
    e.recruited = true;
  }

  healAll(): void {
    for (const k of [...this.state.party, ...this.state.storage]) healFull(this.reg, k);
  }

  /** 戦闘可能な（消耗していない）手持ち */
  ableMembers(): KaiiData[] {
    return this.state.party.filter((k) => k.hp > 0);
  }

  move(from: number, to: number): void {
    const p = this.state.party;
    if (from < 0 || from >= p.length || to < 0 || to >= p.length) return;
    const [k] = p.splice(from, 1);
    p.splice(to, 0, k);
  }

  /** 手持ち⇔保管の入れ替え */
  toStorage(uid: string): boolean {
    if (this.state.party.length <= 1) return false;
    const i = this.state.party.findIndex((k) => k.uid === uid);
    if (i < 0) return false;
    this.state.storage.push(...this.state.party.splice(i, 1));
    return true;
  }

  fromStorage(uid: string): boolean {
    if (this.state.party.length >= GameConfig.party.maxParty) return false;
    const i = this.state.storage.findIndex((k) => k.uid === uid);
    if (i < 0) return false;
    this.state.party.push(...this.state.storage.splice(i, 1));
    return true;
  }

  restoreEn(k: KaiiData, amount: number): void {
    k.en = Math.min(MAX_EN, k.en + amount);
  }

  maxHp(k: KaiiData): number {
    return kaiiStats(this.reg, k).hp;
  }

  equipCharm(k: KaiiData, itemId: string | undefined, inv: InventoryService): boolean {
    if (itemId) {
      const def = this.reg.item(itemId);
      if (def.equip?.slot !== 'kaiiCharm') return false;
      // 同じ御守りを複数体に付けるには所持数が必要
      const used = [...this.state.party, ...this.state.storage].filter((x) => x.charm === itemId && x.uid !== k.uid).length;
      if (inv.count(itemId) <= used) return false;
    }
    const before = kaiiStats(this.reg, k).hp;
    k.charm = itemId;
    const after = kaiiStats(this.reg, k).hp;
    if (k.hp > 0) k.hp = Math.max(1, Math.min(after, k.hp + (after - before)));
    this.bus.emit('equip:changed', { target: k.uid });
    return true;
  }
}

/** 記憶片・章 */
export class StoryService {
  constructor(
    private readonly state: GameState,
    private readonly bus: GameBus,
  ) {}

  addMemory(id: string): boolean {
    if (this.state.memories.includes(id)) return false;
    this.state.memories.push(id);
    this.bus.emit('memory:found', { id });
    return true;
  }

  setChapter(id: string): void {
    if (this.state.chapter === id) return;
    this.state.chapter = id;
    this.bus.emit('chapter:changed', { chapter: id });
  }
}
