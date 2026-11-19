import type { GameBus } from '@/core/GameEvents';
import { weightedPick, type Rng } from '@/core/Rng';
import type { GameState } from '../state/GameState';
import type { WeatherDef, WeatherId, WorldLayer } from '../types';
import { evaluate, type ConditionContext } from './Conditions';

/**
 * 天候システム。時間帯が変わるたびに、層ごとの重みと条件から天候を抽選する。
 * ストーリーで固定（locked）された天候は抽選しない。
 */
export class WeatherSystem {
  constructor(
    private readonly state: GameState,
    private readonly defs: WeatherDef[],
    private readonly bus: GameBus,
    private readonly rng: Rng,
  ) {}

  get current(): WeatherId {
    return this.state.weather.current;
  }

  def(id: WeatherId = this.current): WeatherDef {
    return this.defs.find((d) => d.id === id) ?? this.defs[0];
  }

  set(id: WeatherId, lock = false): void {
    this.state.weather.locked = lock;
    if (this.state.weather.current === id) return;
    this.state.weather.current = id;
    this.bus.emit('weather:changed', { weather: id });
  }

  unlock(): void {
    this.state.weather.locked = false;
  }

  roll(layer: WorldLayer, ctx: ConditionContext, allowed?: WeatherId[]): void {
    if (this.state.weather.locked) return;
    const candidates = this.defs.filter(
      (d) => (d.weight[layer] ?? 0) > 0 && evaluate(d.when, ctx) && (!allowed || allowed.includes(d.id)),
    );
    const picked = weightedPick(this.rng, candidates, (d) => d.weight[layer] ?? 0);
    this.set(picked?.id ?? 'clear');
  }
}
