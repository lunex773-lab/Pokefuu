/**
 * データ定義（src/data/*.json）の型。
 * ゲーム内容はすべてここで定義された形のデータとして記述し、
 * コードは「データの解釈」に専念する（データ駆動設計）。
 */

// ---------------------------------------------------------------- 共通

export type EmotionType = 'fear' | 'loneliness' | 'anger' | 'obsession' | 'guilt' | 'envy' | 'despair';
/** スキル専用の無属性 */
export type SkillType = EmotionType | 'none';

export type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'mnd';
export type Stats = Record<StatKey, number>;

export type Direction = 'down' | 'up' | 'left' | 'right' | 'downLeft' | 'downRight' | 'upLeft' | 'upRight';

export type TimePhase = 'dawn' | 'morning' | 'day' | 'evening' | 'night' | 'midnight';
export type WeatherId = 'clear' | 'rain' | 'fog' | 'blackout' | 'redmoon';
export type WorldLayer = 'reality' | 'back';
export type Gender = 'male' | 'female';

/** 条件式（NPC出現・トリガー・ワープ・実績などで共通利用） */
export interface Condition {
  flag?: string;
  notFlag?: string;
  /** flags[key] が value 以上 */
  flagGte?: { key: string; value: number };
  phase?: TimePhase[];
  notPhase?: TimePhase[];
  weather?: WeatherId[];
  notWeather?: WeatherId[];
  hasItem?: string;
  notItem?: string;
  chapter?: string[];
  partySizeGte?: number;
  /** その怪異と共鳴済み（図鑑で「共鳴済」） */
  recruited?: string;
  notRecruited?: string;
  all?: Condition[];
  any?: Condition[];
}

// ---------------------------------------------------------------- 属性

export interface TypeDef {
  id: EmotionType;
  name: string;
  color: string;
  description: string;
}

export interface TypeChartDef {
  /** attacker -> defender -> 倍率（未記載は 1.0） */
  chart: Partial<Record<SkillType, Partial<Record<EmotionType, number>>>>;
  notes: string[];
}

// ---------------------------------------------------------------- 状態異常

export interface StatusDef {
  id: string;
  name: string;
  description: string;
  color: string;
  /** 行動不能確率（0-1） */
  skipChance?: number;
  /** ターン終了時の最大HP割合ダメージ */
  dotRatio?: number;
  /** 能力倍率 */
  statMul?: Partial<Record<StatKey, number>>;
  /** コスト>0のスキル使用不可 */
  silence?: boolean;
  defaultTurns: number;
}

// ---------------------------------------------------------------- スキル

export type SkillTarget = 'enemy' | 'allEnemies' | 'self' | 'ally' | 'allAllies';
export type SkillCategory = 'phys' | 'mind' | 'support';

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  category: SkillCategory;
  power: number;
  accuracy: number;
  /** 気力（EN）消費 */
  cost: number;
  target: SkillTarget;
  priority?: number;
  description: string;
  status?: { id: string; chance: number; turns?: number };
  buff?: { stat: Exclude<StatKey, 'hp'>; stages: number; to: 'self' | 'target' | 'allAllies' };
  heal?: { ratio: number };
  drain?: number;
  recoil?: number;
  /** 主人公の正気度へのダメージ（敵が使ったとき） */
  sanityDamage?: number;
}

// ---------------------------------------------------------------- 怪異

export interface ResonanceOption {
  text: string;
  /** 0:拒絶 1:曖昧 2:理解 */
  value: 0 | 1 | 2;
  reply: string;
}

export interface KaiiSpeciesDef {
  id: string;
  no: number;
  name: string;
  types: EmotionType[];
  /** 誕生理由（World Bible: すべての怪異には誕生理由を持たせる） */
  origin: string;
  /** モチーフとなった都市伝説・怪談・伝承 */
  legend: string;
  description: string;
  base: Stats;
  growth: Stats;
  expYield: number;
  /** 封印のされやすさ（0で封印不可） */
  sealRate: number;
  learnset: { level: number; skill: string }[];
  drops: { item: string; chance: number }[];
  resonance: { prompt: string; options: ResonanceOption[] };
  sprite: string;
  boss?: boolean;
  /** AI: スキルごとの重み */
  ai?: { weights?: Record<string, number>; specialEvery?: number; special?: string };
}

// ---------------------------------------------------------------- アイテム

export type ItemCategory = 'consumable' | 'seal' | 'material' | 'equipment' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  price?: number;
  /** 使用効果 */
  use?: {
    healHp?: number;
    healRatio?: number;
    cureStatus?: boolean;
    revive?: number;
    sanity?: number;
    en?: number;
    usableInField?: boolean;
    usableInBattle?: boolean;
    target?: 'kaii' | 'player';
  };
  /** 封印力 */
  sealPower?: number;
  /** 装備 */
  equip?: {
    slot: 'light' | 'charm' | 'kaiiCharm';
    statMul?: Partial<Record<StatKey, number>>;
    lightRadius?: number;
    sanityDrainMul?: number;
  };
  icon: string;
}

export interface RecipeDef {
  id: string;
  result: string;
  qty: number;
  inputs: { item: string; qty: number }[];
  unlock?: Condition;
}

export interface ShopDef {
  id: string;
  name: string;
  items: string[];
}

// ---------------------------------------------------------------- エンカウント

export interface EncounterEntry {
  kaii: string;
  min: number;
  max: number;
  weight: number;
}

export interface EncounterTableDef {
  id: string;
  entries: EncounterEntry[];
  /** 天候・時間帯による追加 */
  extra?: { when: Condition; entries: EncounterEntry[] }[];
  /** 1戦闘の敵数の重み [1体,2体,3体] */
  groupWeights: [number, number, number];
}

export interface FixedEncounterDef {
  id: string;
  enemies: { kaii: string; level: number }[];
  boss?: boolean;
  canFlee: boolean;
  bgm?: string;
  /** 戦闘後の共鳴を強制（ボス用） */
  forceResonance?: boolean;
}

// ---------------------------------------------------------------- タイル・マップ

export interface TileDef {
  id: string;
  char: string;
  gen: string;
  colors?: string[];
  solid?: boolean;
  water?: boolean;
  /** 影を落とす高さ（タイル単位、0なら影なし） */
  height?: number;
  light?: { radius: number; color: string; power?: boolean; flicker?: boolean };
  /** 足音の種類 */
  step?: 'grass' | 'hard' | 'wood' | 'water';
}

export interface MapLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  power?: boolean;
  flicker?: boolean;
  when?: Condition;
}

export interface MapNpc {
  id: string;
  name: string;
  sprite: string;
  x: number;
  y: number;
  facing?: Direction;
  script?: string;
  when?: Condition;
  wander?: number;
  solid?: boolean;
}

export interface MapObject {
  id: string;
  x: number;
  y: number;
  script: string;
  when?: Condition;
  /** 主人公の「視る」でのみ見つかる */
  hidden?: boolean;
  /** 発見時に立てるフラグ（省略時は revealed:<map>:<id>） */
  revealFlag?: string;
  /** この条件のあいだ、頭上に「▼」の目印を出す（次に行く場所の案内） */
  marker?: Condition;
  sprite?: string;
}

export interface MapTrigger {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  script: string;
  when?: Condition;
  once?: boolean;
}

export interface MapWarp {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  to: string;
  tx: number;
  ty: number;
  facing?: Direction;
  when?: Condition;
  /** 条件を満たさない場合のスクリプト */
  blockedScript?: string;
  hidden?: boolean;
  revealFlag?: string;
  transition?: 'fade' | 'distort';
}

export interface MapDef {
  id: string;
  name: string;
  layer: WorldLayer;
  chapter: string;
  region: string;
  indoor: boolean;
  /** 裏層危険度 0-7 */
  dangerLevel: number;
  /** 裏層の時間は歪んでいる：固定時間帯 */
  fixedPhase?: TimePhase;
  palette?: 'normal' | 'back';
  ambience: string;
  /** 室内の基本明るさ補正（0=変化なし、正で暗く） */
  ambientDarkness?: number;
  legend?: Record<string, string>;
  ground: string[];
  objects: string[];
  above?: string[];
  lights?: MapLight[];
  npcs?: MapNpc[];
  interactables?: MapObject[];
  triggers?: MapTrigger[];
  warps?: MapWarp[];
  /** 条件付きでタイルを書き換える（隠し扉・ストーリーで開く道など） */
  overrides?: { x: number; y: number; layer: 'ground' | 'objects' | 'above'; char: string; when?: Condition }[];
  encounters?: { table: string; maxSymbols: number };
  weather?: WeatherId[];
  onEnter?: string;
  /** 「視る」で見える歪みの演出点 */
  distortions?: { x: number; y: number }[];
}

// ---------------------------------------------------------------- スクリプト（イベント）

export type ScriptCommand = { cmd: string; [key: string]: unknown };
export interface ScriptDef {
  id: string;
  commands: ScriptCommand[];
}

// ---------------------------------------------------------------- 世界

export interface TimePhaseDef {
  id: TimePhase;
  name: string;
  /** 開始時刻（分） */
  start: number;
  darkness: number;
  tint: string;
  tintAlpha: number;
  /** 太陽影の向き（度）と長さ（0で影なし） */
  shadowAngle: number;
  shadowLength: number;
  shadowAlpha: number;
}

export interface WeatherDef {
  id: WeatherId;
  name: string;
  darknessAdd: number;
  tint?: string;
  tintAlpha?: number;
  fog?: number;
  rain?: number;
  powerOut?: boolean;
  encounterMul?: number;
  levelBonus?: number;
  /** 発生条件 */
  when?: Condition;
  /** 抽選重み（層ごと） */
  weight: Partial<Record<WorldLayer, number>>;
}

export interface DangerLevelDef {
  level: number;
  name: string;
  description: string;
  distortion: number;
  /** 正気度減少（ゲーム内1分あたり） */
  sanityDrain: number;
  ambientSound: number;
}

export interface ChapterDef {
  id: string;
  no: string;
  title: string;
  region: string;
  status: 'implemented' | 'planned';
  summary: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  hidden?: boolean;
  /** イベント名 + 一致条件、またはカウンター・フラグ条件 */
  on?: { event: string; match?: Record<string, unknown> };
  counter?: { key: string; gte: number };
  flag?: string;
}

export interface MemoryDef {
  id: string;
  chapter: string;
  title: string;
  text: string;
}

export interface GlossaryDef {
  id: string;
  term: string;
  reading: string;
  text: string;
}

export interface EndingRule {
  /** 最後の選択 */
  finalChoice?: 'accept' | 'reject';
  /** 記憶片をすべて集めたか（true＝全部、false＝足りない） */
  allMemories?: boolean;
  /** 怪異図鑑の完成（全怪異と共鳴） */
  compendiumComplete?: boolean;
}

export interface EndingDef {
  id: string;
  name: string;
  /** 条件の説明文 */
  condition: string;
  /** 判定ルール（priority の高い順に評価し、最初に一致したもの） */
  rule: EndingRule;
  priority: number;
  status: 'planned' | 'implemented';
}

export interface NpcSpriteDef {
  id: string;
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bob' | 'bun' | 'spiky' | 'cap' | 'twin';
  top: string;
  bottom: string;
  bottomStyle: 'pants' | 'skirt';
  accent?: string;
  accessory?: 'glasses' | 'apron' | 'badge' | 'none' | 'headphones';
}
