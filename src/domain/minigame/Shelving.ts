import type { Rng } from '@/core/Rng';
import type { ParttimeJobDef } from '../types';

export interface ShelfGood {
  name: string;
  /** 正しい棚。-1 は「不気味な商品」（どこに置いても数に入らない） */
  shelf: number;
}

export type ShelfAnswer = 'correct' | 'wrong' | 'strange';

/**
 * アルバイトの品出しミニゲーム（描画に依存しない純粋なロジック）。
 * 商品を1つずつ正しい棚へ振り分け、正しく並べた数で給料が決まる。
 */
export class ShelvingGame {
  readonly goods: ShelfGood[];
  index = 0;
  correct = 0;
  /** 不気味な商品が混ざっていて、それを並べたか */
  sawStrange = false;

  constructor(
    readonly def: ParttimeJobDef,
    rng: Rng,
    allowStrange: boolean,
  ) {
    const pool = [...def.goods];
    const picked: ShelfGood[] = [];
    for (let i = 0; i < def.rounds; i++) {
      // 同じ商品が続きすぎないよう、山札から引く（尽きたら補充）
      if (pool.length === 0) pool.push(...def.goods);
      const k = Math.floor(rng.next() * pool.length);
      picked.push({ ...pool.splice(k, 1)[0] });
    }
    if (allowStrange && def.strange && rng.next() < def.strange.chance) {
      // 後半のどこかに1つだけ混ざる
      const at = Math.floor(def.rounds / 2 + rng.next() * (def.rounds / 2));
      picked[Math.min(def.rounds - 1, at)] = { name: def.strange.name, shelf: -1 };
    }
    this.goods = picked;
  }

  get current(): ShelfGood | undefined {
    return this.goods[this.index];
  }

  get done(): boolean {
    return this.index >= this.goods.length;
  }

  /** 正しく並べられる商品の数（不気味な商品は除く） */
  get countable(): number {
    return this.goods.filter((g) => g.shelf >= 0).length;
  }

  answer(shelf: number): ShelfAnswer {
    const g = this.current;
    if (!g) return 'wrong';
    this.index++;
    if (g.shelf < 0) {
      this.sawStrange = true;
      return 'strange';
    }
    if (g.shelf === shelf) {
      this.correct++;
      return 'correct';
    }
    return 'wrong';
  }

  /** 給料（基本給＋正しく並べた数×単価） */
  pay(): number {
    return this.def.base + this.correct * this.def.perItem;
  }
}
