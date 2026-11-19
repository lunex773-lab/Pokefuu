import type {
  AchievementDef,
  ChapterDef,
  DangerLevelDef,
  EndingDef,
  EncounterTableDef,
  FixedEncounterDef,
  GlossaryDef,
  ItemDef,
  KaiiSpeciesDef,
  MapDef,
  MemoryDef,
  MusicTrackDef,
  NpcSpriteDef,
  RecipeDef,
  ScriptDef,
  ShopDef,
  SkillDef,
  StatusDef,
  TileDef,
  TimePhaseDef,
  TraitDef,
  TypeChartDef,
  TypeDef,
  WeatherDef,
} from '@/domain/types';

/** すべての静的データ（マップ・スクリプトは遅延読み込み） */
export interface GameData {
  types: TypeDef[];
  typeChart: TypeChartDef;
  statuses: StatusDef[];
  skills: SkillDef[];
  kaii: KaiiSpeciesDef[];
  items: ItemDef[];
  recipes: RecipeDef[];
  shops: ShopDef[];
  encounters: EncounterTableDef[];
  fixedEncounters: FixedEncounterDef[];
  tiles: TileDef[];
  timePhases: TimePhaseDef[];
  weathers: WeatherDef[];
  dangerLevels: DangerLevelDef[];
  chapters: ChapterDef[];
  achievements: AchievementDef[];
  memories: MemoryDef[];
  glossary: GlossaryDef[];
  endings: EndingDef[];
  npcSprites: NpcSpriteDef[];
  music: MusicTrackDef[];
  traits: TraitDef[];
}

export type MapLoader = (id: string) => Promise<MapDef>;
export type ScriptLoader = () => Promise<ScriptDef[]>;

const indexBy = <T extends { id: string }>(list: T[], label: string): Map<string, T> => {
  const map = new Map<string, T>();
  for (const it of list) {
    if (map.has(it.id)) throw new Error(`[DataRegistry] duplicate ${label} id: ${it.id}`);
    map.set(it.id, it);
  }
  return map;
};

/**
 * 型付きのデータ参照窓口。
 * 各システムは JSON を直接 import せず、必ずここを経由する（差し替え・検証が容易）。
 */
export class DataRegistry {
  readonly skills: Map<string, SkillDef>;
  readonly kaii: Map<string, KaiiSpeciesDef>;
  readonly items: Map<string, ItemDef>;
  readonly statuses: Map<string, StatusDef>;
  readonly recipes: Map<string, RecipeDef>;
  readonly shops: Map<string, ShopDef>;
  readonly encounters: Map<string, EncounterTableDef>;
  readonly fixedEncounters: Map<string, FixedEncounterDef>;
  readonly tiles: Map<string, TileDef>;
  readonly tilesByChar: Map<string, TileDef>;
  readonly weathers: Map<string, WeatherDef>;
  readonly types: Map<string, TypeDef>;
  readonly achievements: Map<string, AchievementDef>;
  readonly memories: Map<string, MemoryDef>;
  readonly npcSprites: Map<string, NpcSpriteDef>;
  readonly music: Map<string, MusicTrackDef>;
  readonly traits: Map<string, TraitDef>;
  private scripts = new Map<string, ScriptDef>();
  private mapCache = new Map<string, MapDef>();

  constructor(
    readonly data: GameData,
    private readonly mapLoader?: MapLoader,
  ) {
    this.skills = indexBy(data.skills, 'skill');
    this.kaii = indexBy(data.kaii, 'kaii');
    this.items = indexBy(data.items, 'item');
    this.statuses = indexBy(data.statuses, 'status');
    this.recipes = indexBy(data.recipes, 'recipe');
    this.shops = indexBy(data.shops, 'shop');
    this.encounters = indexBy(data.encounters, 'encounter');
    this.fixedEncounters = indexBy(data.fixedEncounters, 'fixedEncounter');
    this.tiles = indexBy(data.tiles, 'tile');
    this.weathers = indexBy(data.weathers, 'weather');
    this.types = indexBy(data.types, 'type');
    this.achievements = indexBy(data.achievements, 'achievement');
    this.memories = indexBy(data.memories, 'memory');
    this.npcSprites = indexBy(data.npcSprites, 'npcSprite');
    this.music = indexBy(data.music, 'music');
    this.traits = indexBy(data.traits, 'trait');
    this.tilesByChar = new Map();
    for (const t of data.tiles) {
      if (this.tilesByChar.has(t.char)) throw new Error(`[DataRegistry] duplicate tile char: ${t.char}`);
      this.tilesByChar.set(t.char, t);
    }
  }

  registerScripts(list: ScriptDef[]): void {
    for (const s of list) {
      if (this.scripts.has(s.id)) throw new Error(`[DataRegistry] duplicate script id: ${s.id}`);
      this.scripts.set(s.id, s);
    }
  }

  script(id: string): ScriptDef {
    const s = this.scripts.get(id);
    if (!s) throw new Error(`[DataRegistry] unknown script: ${id}`);
    return s;
  }

  hasScript(id: string): boolean {
    return this.scripts.has(id);
  }

  allScripts(): ScriptDef[] {
    return [...this.scripts.values()];
  }

  /** その怪異の特性（未設定なら undefined） */
  traitOf(speciesId: string): TraitDef | undefined {
    const sp = this.kaii.get(speciesId);
    return sp ? this.traits.get(sp.trait) : undefined;
  }

  skill(id: string): SkillDef {
    return this.req(this.skills, id, 'skill');
  }
  species(id: string): KaiiSpeciesDef {
    return this.req(this.kaii, id, 'kaii');
  }
  item(id: string): ItemDef {
    return this.req(this.items, id, 'item');
  }
  status(id: string): StatusDef {
    return this.req(this.statuses, id, 'status');
  }

  /** マップは使う時に読み込み、直近のものだけキャッシュする（メモリ最適化） */
  async map(id: string): Promise<MapDef> {
    const cached = this.mapCache.get(id);
    if (cached) return cached;
    if (!this.mapLoader) throw new Error('[DataRegistry] no map loader');
    const def = await this.mapLoader(id);
    this.mapCache.set(id, def);
    if (this.mapCache.size > 4) {
      const oldest = this.mapCache.keys().next().value;
      if (oldest !== undefined && oldest !== id) this.mapCache.delete(oldest);
    }
    return def;
  }

  timePhase(id: string): TimePhaseDef {
    const p = this.data.timePhases.find((t) => t.id === id);
    if (!p) throw new Error(`[DataRegistry] unknown phase: ${id}`);
    return p;
  }

  dangerLevel(level: number): DangerLevelDef {
    return this.data.dangerLevels.find((d) => d.level === level) ?? this.data.dangerLevels[0];
  }

  private req<T>(map: Map<string, T>, id: string, label: string): T {
    const v = map.get(id);
    if (!v) throw new Error(`[DataRegistry] unknown ${label}: ${id}`);
    return v;
  }
}
