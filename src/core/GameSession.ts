import { GameConfig } from '@/config/GameConfig';
import type { DataRegistry } from '@/data/DataRegistry';
import { CraftingService, InventoryService } from '@/domain/inventory/Inventory';
import { AchievementSystem, StatsTracker } from '@/domain/progress/Achievements';
import type { GameState } from '@/domain/state/GameState';
import { FlagService, PartyService, PlayerService, StoryService } from '@/domain/state/Services';
import { evaluate } from '@/domain/world/Conditions';
import { Clock } from '@/domain/world/Clock';
import { WeatherSystem } from '@/domain/world/Weather';
import type { Condition } from '@/domain/types';
import type { GameBus } from './GameEvents';
import type { Rng } from './Rng';

/**
 * 1プレイ分の状態とサービス群。ニューゲーム／ロード時に作り直す。
 * 各サービスは GameState の一部だけを担当する（単一責任）。
 */
export class GameSession {
  readonly flags: FlagService;
  readonly inventory: InventoryService;
  readonly crafting: CraftingService;
  readonly player: PlayerService;
  readonly party: PartyService;
  readonly story: StoryService;
  readonly clock: Clock;
  readonly weather: WeatherSystem;
  readonly achievements: AchievementSystem;
  private readonly tracker: StatsTracker;

  constructor(
    readonly state: GameState,
    readonly reg: DataRegistry,
    readonly bus: GameBus,
    readonly rng: Rng,
  ) {
    this.flags = new FlagService(state, bus);
    this.inventory = new InventoryService(state, reg, bus);
    this.crafting = new CraftingService(reg, this.inventory, bus);
    this.player = new PlayerService(state, reg, bus, this.inventory);
    this.party = new PartyService(state, reg, bus);
    this.story = new StoryService(state, bus);
    this.clock = new Clock(state, reg.data.timePhases, bus, GameConfig.clock.realMsPerGameMinute);
    this.weather = new WeatherSystem(state, reg.data.weathers, bus, rng);
    this.achievements = new AchievementSystem(state, reg.data.achievements, bus);
    this.tracker = new StatsTracker(bus, (k, by) => this.flags.increment(k, by));
  }

  check = (cond: Condition | undefined): boolean => evaluate(cond, { state: this.state, phase: this.clock.phase });

  dispose(): void {
    this.achievements.dispose();
    this.tracker.dispose();
  }
}
