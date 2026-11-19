import type { GameBus } from '@/core/GameEvents';
import type { DataRegistry } from '@/data/DataRegistry';
import type { GameState } from '../state/GameState';
import type { RecipeDef } from '../types';
import { evaluate, type ConditionContext } from '../world/Conditions';

export const MAX_STACK = 99;

/** 所持品・所持金 */
export class InventoryService {
  constructor(
    private readonly state: GameState,
    private readonly reg: DataRegistry,
    private readonly bus: GameBus,
  ) {}

  count(itemId: string): number {
    return this.state.inventory[itemId] ?? 0;
  }

  has(itemId: string, qty = 1): boolean {
    return this.count(itemId) >= qty;
  }

  add(itemId: string, qty = 1): number {
    this.reg.item(itemId); // 存在チェック
    const before = this.count(itemId);
    const after = Math.min(MAX_STACK, before + qty);
    this.state.inventory[itemId] = after;
    const delta = after - before;
    if (delta !== 0) this.bus.emit('item:changed', { itemId, qty: after, delta });
    return delta;
  }

  remove(itemId: string, qty = 1): boolean {
    const before = this.count(itemId);
    if (before < qty) return false;
    const after = before - qty;
    if (after === 0) delete this.state.inventory[itemId];
    else this.state.inventory[itemId] = after;
    this.bus.emit('item:changed', { itemId, qty: after, delta: -qty });
    return true;
  }

  /** カテゴリ別の所持一覧（データ定義順） */
  list(filter?: (id: string) => boolean): { id: string; qty: number }[] {
    const out: { id: string; qty: number }[] = [];
    for (const def of this.reg.data.items) {
      const qty = this.count(def.id);
      if (qty > 0 && (!filter || filter(def.id))) out.push({ id: def.id, qty });
    }
    return out;
  }

  get money(): number {
    return this.state.player.money;
  }

  addMoney(delta: number): boolean {
    const next = this.state.player.money + delta;
    if (next < 0) return false;
    this.state.player.money = next;
    this.bus.emit('money:changed', { money: next, delta });
    return true;
  }

  buy(itemId: string, qty = 1): boolean {
    const price = this.reg.item(itemId).price;
    if (price === undefined) return false;
    if (this.count(itemId) + qty > MAX_STACK) return false;
    if (!this.addMoney(-price * qty)) return false;
    this.add(itemId, qty);
    return true;
  }
}

/** クラフト（素材 → アイテム） */
export class CraftingService {
  constructor(
    private readonly reg: DataRegistry,
    private readonly inv: InventoryService,
    private readonly bus: GameBus,
  ) {}

  available(ctx: ConditionContext): RecipeDef[] {
    return this.reg.data.recipes.filter((r) => evaluate(r.unlock, ctx));
  }

  canCraft(recipe: RecipeDef): boolean {
    return recipe.inputs.every((i) => this.inv.has(i.item, i.qty)) && this.inv.count(recipe.result) < 99;
  }

  craft(recipeId: string): boolean {
    const recipe = this.reg.recipes.get(recipeId);
    if (!recipe || !this.canCraft(recipe)) return false;
    for (const i of recipe.inputs) this.inv.remove(i.item, i.qty);
    this.inv.add(recipe.result, recipe.qty);
    this.bus.emit('craft:done', { recipeId });
    return true;
  }
}
