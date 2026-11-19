import { AudioManager, type AudioSettings } from '@/audio/AudioManager';
import { GameConfig } from '@/config/GameConfig';
import type { DataRegistry } from '@/data/DataRegistry';
import { InputManager } from '@/input/InputManager';
import { LocalStorageAdapter, SaveManager, type StorageAdapter } from '@/domain/save/SaveManager';
import { migrations } from '@/domain/save/migrations';
import { createInitialState, type GameState } from '@/domain/state/GameState';
import type { Gender } from '@/domain/types';
import type { TileAtlas } from '@/render/sprites/tiles';
import { createGameBus, type GameBus } from './GameEvents';
import { GameSession } from './GameSession';
import { MathRng, type Rng } from './Rng';

export interface Settings extends AudioSettings {
  textSpeed: number;
  screenShake: boolean;
  showFps: boolean;
}

const defaultSettings: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  ambience: 0.8,
  textSpeed: 1,
  screenShake: true,
  showFps: false,
};

/**
 * アプリ全体で共有するサービスの入れ物（依存性注入の起点）。
 * シーンは game.registry から取り出して使い、グローバル変数は使わない。
 */
export class GameContext {
  readonly bus: GameBus = createGameBus();
  readonly rng: Rng = MathRng;
  readonly input = new InputManager();
  readonly save: SaveManager;
  readonly audio: AudioManager;
  settings: Settings;
  tileAtlas?: TileAtlas;
  private _session?: GameSession;

  constructor(
    readonly reg: DataRegistry,
    readonly storage: StorageAdapter = new LocalStorageAdapter(),
  ) {
    this.save = new SaveManager(storage, GameConfig.save.keyPrefix, GameConfig.save.version, migrations);
    this.settings = { ...defaultSettings };
    this.audio = new AudioManager(this.settings);
    this.bus.on('audio:sfx', ({ id, volume }) => this.audio.sfx(id, volume));
  }

  get session(): GameSession {
    if (!this._session) throw new Error('no active session');
    return this._session;
  }

  get hasSession(): boolean {
    return !!this._session;
  }

  newGame(name: string, gender: Gender): GameSession {
    return this.startSession(createInitialState(name, gender));
  }

  startSession(state: GameState): GameSession {
    this._session?.dispose();
    this._session = new GameSession(state, this.reg, this.bus, this.rng);
    return this._session;
  }

  async loadSettings(): Promise<void> {
    try {
      const raw = await this.storage.get(GameConfig.save.settingsKey);
      if (raw) this.settings = { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* 既定値のまま */
    }
    this.audio.applySettings(this.settings);
  }

  async saveSettings(): Promise<void> {
    this.audio.applySettings(this.settings);
    try {
      await this.storage.set(GameConfig.save.settingsKey, JSON.stringify(this.settings));
    } catch {
      /* 保存できない環境でも続行 */
    }
  }
}
