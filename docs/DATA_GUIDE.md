# データの書き方ガイド

ゲーム内容はすべて `src/data/` の JSON で定義します。追加・修正したら `npm test` で整合性（参照切れ・マップの幅ずれ等）を確認できます。

## 怪異を追加する（`json/kaii.json`）

```jsonc
{
  "id": "new_kaii",              // 英数字のID（重複不可）
  "no": 10,                      // 図鑑番号
  "name": "シンキカイイ",
  "types": ["fear"],             // fear / loneliness / anger / obsession / guilt / envy / despair（最大2つ）
  "origin": "誕生理由（必須）",   // World Bible：すべての怪異には誕生理由を持たせる
  "legend": "モチーフの都市伝説",
  "description": "図鑑の説明",
  "base":   { "hp": 20, "atk": 8, "def": 8, "spd": 9, "mnd": 9 },   // Lv1 の能力
  "growth": { "hp": 3, "atk": 1.5, "def": 1.5, "spd": 1.4, "mnd": 1.6 }, // 1レベルごとの上昇
  "expYield": 32,
  "sealRate": 1.0,               // 封印のしやすさ（0で封印不可）
  "sprite": "kaii_new_kaii",     // テクスチャキー（render/sprites/kaii.ts に描画関数を追加するか、画像を load）
  "learnset": [ { "level": 1, "skill": "touch" } ],
  "drops": [ { "item": "memory_dust", "chance": 0.3 } ],
  "resonance": {
    "prompt": "怪異の声",
    "options": [
      { "text": "理解する応え", "value": 2, "reply": "返事" },
      { "text": "曖昧な応え",   "value": 1, "reply": "返事" },
      { "text": "拒絶する応え", "value": 0, "reply": "返事" }
    ]
  }
}
```

出現させるには `json/encounters.json` の表に追加します。

## マップを追加する（`maps/<id>.json`）

- `ground` / `objects` / `above` は **同じ幅・高さの文字列配列**。1文字＝1タイル（32×32）
- 文字とタイルの対応は `json/tiles.json` の `char`（マップごとに `legend` で上書き可）
- `objects` の空白はタイルなし。`above` は人物より手前に描く（木の葉など）
- `layer: "back"` で裏層。`palette: "back"` で裏層用の色に自動変換、`dangerLevel` で危険度、`fixedPhase` で時刻固定
- `music` で BGM（`json/music.json` の曲ID）、`musicNight` で夜（夜・深夜）の BGM。省略すると「裏層（危険度5以上は back_deep）／屋外（昼 town・夜 town_night）／屋内（unease）」で自動的に決まる

```jsonc
"npcs":         [ { "id": "x", "name": "名前", "sprite": "student_a", "x": 3, "y": 4, "script": "talk_x", "when": { "phase": ["day"] } } ],
"interactables":[ { "id": "desk", "x": 5, "y": 2, "script": "look_desk", "hidden": true } ],   // hidden = 『視る』で発見
"triggers":     [ { "id": "t", "x": 0, "y": 5, "w": 1, "h": 3, "script": "event", "once": true } ],
"warps":        [ { "id": "w", "x": 9, "y": 7, "w": 1, "h": 1, "to": "other_map", "tx": 3, "ty": 4, "facing": "down" } ],
"overrides":    [ { "x": 13, "y": 3, "layer": "objects", "char": " ", "when": { "flag": "door_open" } } ],  // 条件でタイルを書き換え
"lights":       [ { "x": 3, "y": 3, "radius": 96, "color": "#ffe0b0", "power": true } ],  // power=停電で消える
"encounters":   { "table": "back_1f", "maxSymbols": 4 }
```

## 条件式（`when`）

`flag` / `notFlag` / `flagGte` / `phase` / `notPhase` / `weather` / `notWeather` / `hasItem` / `notItem` / `chapter` / `partySizeGte` / `all` / `any`

```json
{ "all": [ { "flag": "class_done" }, { "phase": ["evening", "night"] } ] }
```

## イベントスクリプト（`scripts/*.json`）

```json
{ "id": "talk_x", "commands": [
  { "cmd": "say", "speaker": "湊", "text": "よう、{name}！" },
  { "cmd": "choice", "prompt": "どうする？", "options": [
    { "text": "行く", "then": [ { "cmd": "setFlag", "key": "go" } ] },
    { "text": "やめる", "then": [] }
  ] },
  { "cmd": "if", "when": { "flag": "go" }, "then": [ { "cmd": "warp", "map": "school_1f", "x": 15, "y": 12 } ] }
] }
```

使えるコマンドの一覧は `src/domain/script/commands.ts`、実装は `src/scenes/world/ScriptCommands.ts` にあります。
主なもの：`say` `choice` `if` `call` `end` `fade` `wait` `shake` `flash` `distort` `sfx` `title` `toast`
`warp` `moveNpc` `hideNpc` `battle` `recruit` `resonanceTalk` `shop` `saveMenu` `autosave` `sleep` `parttime`
`setFlag` `incFlag` `giveItem` `takeItem` `memory` `setTime` `setWeather` `sanity` `playerExp` `refreshMap` `music`

`{name}` は主人公の名前に置き換わります。

## そのほかのデータ

| ファイル | 内容 |
| --- | --- |
| `json/skills.json` | 技（威力・命中・気力・対象・状態異常・能力変化・回復・吸収・正気度ダメージ） |
| `json/typeChart.json` | タイプ相性表 |
| `json/statuses.json` | 状態異常 |
| `json/items.json` / `recipes.json` / `shops.json` | アイテム・クラフト・お店 |
| `json/fixedEncounters.json` | イベント戦闘・ボス |
| `json/timePhases.json` | 時間帯（暗さ・色味・影の向きと長さ） |
| `json/weathers.json` | 天候（発生条件・出現率補正・暗さ） |
| `json/dangerLevels.json` | 裏層の危険度（歪み・正気度減少） |
| `json/achievements.json` | 実績（イベント一致／カウンター／フラグ） |
| `json/memories.json` / `glossary.json` / `chapters.json` / `endings.json` | 記憶片・用語辞典・章・エンディング |
| `json/npcSprites.json` | 人物の見た目（髪型・服の色など）→ ドット絵を自動生成 |
| `json/music.json` | BGM（下記） |

## BGM を追加する（`json/music.json`）

音声ファイルは使わず、音列（楽譜）から WebAudio で合成します。

```jsonc
{
  "id": "town", "name": "朝霧の通学路",
  "bpm": 104,          // 1分あたりの「単位」の数（単位＝音列の長さ1。8分音符を単位にするなら 4分音符の速さ×2）
  "vol": 1.0, "reverb": 0.5, "echo": 0.2, "echoUnits": 3, "lowpass": 2000,  // 残響・やまびこ・こもり具合
  "voices": [
    { "inst": "musicbox", "vol": 0.9, "wobble": 5, "sour": 0.05, "prob": 0.9,
      "phrases": ["B5:2 G5:2 E5:4 | .:4 D5 E5 G5:2", "…"] },   // 1周ごとに次のフレーズへ
    { "inst": "breath", "vol": 0.6, "rest": [8, 24], "order": "random", "phrases": ["E4:8"] }
  ]
}
```

- 音列：`A4` `C#5` `Bb3` が音、`.` が休符、`:n` で長さ（単位数）、`+` で和音、`|` は区切り（無視）
- 楽器 `inst`：`musicbox`（オルゴール）`piano`（古いピアノ）`pad`（持続和音）`bell`（遠くの鐘）`pluck`（はじく音）`pulse`（鼓動）`breath`（ささやき）`bass`
- 不気味さ：`sour`（半音ずれる確率）、`wobble`（音程の揺れ・セント）、`prob`（音を間引いて静けさを出す）
- `rest`（1周ごとの休み）を付けたパートは他とずれていく。和音を支えるパートには付けず、フレーズの長さをそろえる（テストで検査）
- イベント中は `{ "cmd": "music", "id": null }` で無音にできる（イベントが終わると場所の BGM に戻る）
