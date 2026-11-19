import type { GameBus, GameEventMap } from '@/core/GameEvents';
import type { GameState } from '../state/GameState';
import type { AchievementDef } from '../types';

const matches = (payload: unknown, match?: Record<string, unknown>): boolean => {
  if (!match) return true;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return Object.entries(match).every(([k, v]) => {
    const actual = p[k];
    if (v && typeof v === 'object' && 'gte' in (v as object)) return typeof actual === 'number' && actual >= (v as { gte: number }).gte;
    if (v && typeof v === 'object' && 'lte' in (v as object)) return typeof actual === 'number' && actual <= (v as { lte: number }).lte;
    return actual === v;
  });
};

/**
 * 実績システム。データ定義（イベント一致／カウンター／フラグ）をイベントバスで監視する。
 * 新しい実績は achievements.json に追記するだけで追加できる。
 */
export class AchievementSystem {
  private offs: (() => void)[] = [];

  constructor(
    private readonly state: GameState,
    private readonly defs: AchievementDef[],
    private readonly bus: GameBus,
  ) {
    const events = new Set(defs.filter((d) => d.on).map((d) => d.on!.event));
    for (const ev of events) {
      this.offs.push(
        bus.on(ev as keyof GameEventMap, (payload) => {
          for (const d of this.defs) if (d.on?.event === ev && matches(payload, d.on.match)) this.unlock(d.id);
        }),
      );
    }
    this.offs.push(
      bus.on('counter:changed', ({ key, value }) => {
        for (const d of this.defs) if (d.counter?.key === key && value >= d.counter.gte) this.unlock(d.id);
      }),
    );
    this.offs.push(
      bus.on('flag:changed', ({ key, value }) => {
        if (!value) return;
        for (const d of this.defs) if (d.flag === key) this.unlock(d.id);
      }),
    );
  }

  isUnlocked(id: string): boolean {
    return this.state.achievements.includes(id);
  }

  unlock(id: string): void {
    if (this.isUnlocked(id) || !this.defs.some((d) => d.id === id)) return;
    this.state.achievements.push(id);
    this.bus.emit('achievement:unlocked', { id });
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}

/** 実績判定用の統計カウンター（イベント → カウンター変換） */
export class StatsTracker {
  private offs: (() => void)[] = [];

  constructor(bus: GameBus, increment: (key: string, by?: number) => void) {
    this.offs.push(
      bus.on('kaii:calmed', () => increment('kaii_calmed')),
      bus.on('kaii:recruited', () => increment('kaii_recruited')),
      bus.on('battle:end', ({ result }) => {
        if (result === 'win') increment('battles_won');
      }),
      bus.on('craft:done', () => increment('crafted')),
      bus.on('memory:found', () => increment('memories')),
      bus.on('kaii:seen', () => increment('kaii_seen')),
      bus.on('parttime:done', () => increment('parttime')),
      bus.on('sight:used', () => increment('sight_used')),
    );
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
