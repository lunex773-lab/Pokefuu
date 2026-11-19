import type { GameState } from '../state/GameState';

/** 保存先の抽象化（Web: localStorage / 将来: Capacitor Preferences・ファイル等へ差し替え） */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  }
  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
  }
  async remove(key: string) {
    this.store.delete(key);
  }
}

export interface SaveMeta {
  slot: string;
  version: number;
  savedAt: number;
  playTimeMs: number;
  chapter: string;
  location: string;
  playerName: string;
  playerLevel: number;
}

interface SaveFile {
  meta: SaveMeta;
  state: GameState;
  checksum: string;
}

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** FNV-1a（改ざん検出ではなく破損検出用） */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class SaveError extends Error {}

/**
 * セーブデータ管理。バージョン付きスキーマ＋マイグレーションで、
 * アップデート後も古いセーブを読み込めるようにする。
 */
export class SaveManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly keyPrefix: string,
    private readonly currentVersion: number,
    private readonly migrations: Record<number, Migration> = {},
  ) {}

  private key(slot: string): string {
    return `${this.keyPrefix}${slot}`;
  }

  async save(slot: string, state: GameState, location: string): Promise<SaveMeta> {
    const meta: SaveMeta = {
      slot,
      version: this.currentVersion,
      savedAt: Date.now(),
      playTimeMs: state.playTimeMs,
      chapter: state.chapter,
      location,
      playerName: state.player.name,
      playerLevel: state.player.level,
    };
    const body = JSON.stringify(state);
    const file: SaveFile = { meta, state, checksum: checksum(body) };
    await this.storage.set(this.key(slot), JSON.stringify(file));
    return meta;
  }

  async load(slot: string): Promise<GameState | null> {
    const raw = await this.storage.get(this.key(slot));
    if (!raw) return null;
    let file: SaveFile;
    try {
      file = JSON.parse(raw) as SaveFile;
    } catch {
      throw new SaveError('セーブデータが壊れています');
    }
    if (checksum(JSON.stringify(file.state)) !== file.checksum) throw new SaveError('セーブデータが破損しています');
    return this.migrate(file.state as unknown as Record<string, unknown>);
  }

  async meta(slot: string): Promise<SaveMeta | null> {
    const raw = await this.storage.get(this.key(slot));
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as SaveFile).meta;
    } catch {
      return null;
    }
  }

  async remove(slot: string): Promise<void> {
    await this.storage.remove(this.key(slot));
  }

  migrate(state: Record<string, unknown>): GameState {
    let v = typeof state.version === 'number' ? state.version : 0;
    if (v > this.currentVersion) throw new SaveError('新しいバージョンのセーブデータです');
    while (v < this.currentVersion) {
      const m = this.migrations[v];
      if (!m) throw new SaveError(`セーブデータ v${v} からの移行手段がありません`);
      state = m(state);
      v += 1;
      state.version = v;
    }
    return state as unknown as GameState;
  }
}
