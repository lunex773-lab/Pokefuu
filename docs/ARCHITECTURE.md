# アーキテクチャ

project_build の「Claudeへの要求」に沿って設計しています。

| 要求 | 対応 |
| --- | --- |
| 保守性・モジュール設計 | 「ドメイン（純粋なゲームロジック）」「データ」「描画（Phaser）」を分離 |
| データ駆動設計 | 怪異・技・アイテム・マップ・イベント・実績などはすべて `src/data/` の JSON。コードはデータを解釈するだけ |
| SOLID原則 | サービスは単一責任（Inventory / Party / Player / Flags …）。スクリプトコマンドはレジストリ登録式（開放閉鎖） |
| イベント駆動 | 型付き `EventBus`。実績・統計・HUD・サウンドはイベント購読で動き、互いを直接参照しない |
| ScriptableObject / DataAsset 相当 | 型付き JSON ＋ `DataRegistry`（参照窓口）。`tests/data.test.ts` で参照切れを検出 |
| マルチプラットフォーム | Web 技術で実装。入力は `InputManager` で抽象化、保存先は `StorageAdapter` で差し替え可能。画面は高さ1080固定・幅は端末の縦横比で決定（`src/config/Screen.ts`）し、UI はセーフエリアの内側に置く |
| スマホ60FPS維持 | ワールド解像度（640×360）でライティング、画面外の光源は描かない、FPS が落ちたら自動で画面エフェクトを無効化 |
| メモリ最適化 | マップは章ごとに分割ビルド・遅延読み込み（直近4枚のみキャッシュ）。音声ファイルを持たない手続き生成オーディオ（BGM も `music.json` の音列から合成） |
| アニメーション管理 | 人物スプライトは `TextureFactory` で一括生成・アニメ登録（キー規約 `<sprite>_walk_<dir>`） |
| セーブデータ管理 | バージョン付きスキーマ＋マイグレーション表＋チェックサム（破損検出）。3スロット＋オートセーブ |
| 拡張性 | 新しい怪異・マップ・イベント・実績はデータ追加のみ。新しい演出は `ScriptCommands` に1つ登録するだけ |

## ディレクトリ構成

```
src/
├── config/GameConfig.ts      エンジン側の定数（解像度・速度・セーブ設定）
├── core/                     アプリ基盤
│   ├── EventBus.ts             型付きイベントバス
│   ├── GameEvents.ts           イベント一覧（ここに追加すると型安全に購読できる）
│   ├── GameContext.ts          共有サービスの入れ物（DIの起点）
│   ├── GameSession.ts          1プレイ分の状態とサービス群
│   └── Rng.ts                  乱数（テストではシード付きに差し替え）
├── data/                     ★ゲーム内容（データ駆動）
│   ├── json/                   怪異・技・アイテム・レシピ・天候・時間帯・実績・図鑑 …
│   ├── maps/                   マップ（文字グリッド＋NPC・ワープ・トリガー）
│   ├── scripts/                イベントスクリプト
│   ├── DataRegistry.ts         型付き参照窓口
│   └── index.ts                読み込み（マップは遅延読み込み）
├── domain/                   ★純粋なゲームロジック（Phaser 非依存・単体テスト可能）
│   ├── battle/                 戦闘エンジン・タイプ相性・報酬
│   ├── creature/               怪異の能力・成長・スキル習得
│   ├── inventory/              所持品・お金・クラフト
│   ├── progress/               実績・統計
│   ├── save/                   セーブ・マイグレーション
│   ├── script/                 イベントスクリプトのインタプリタ
│   ├── state/                  セーブ対象の状態（GameState）とサービス
│   └── world/                  時計・天候・条件式
├── render/                   描画素材の生成
│   ├── pixel/PixelCanvas.ts    ドット絵描画の基本機能（輪郭線・立体陰影など）
│   ├── sprites/                タイル・人物・怪異・エフェクトの生成
│   ├── fx/DistortPipeline.ts   画面エフェクト（歪み・色収差・ビネット・グレイン）
│   └── TextureFactory.ts       生成物を Phaser テクスチャに登録
├── audio/AudioManager.ts     手続き生成の環境音・効果音
├── audio/MusicPlayer.ts      BGM の先読み予約再生と楽器の合成（音列の解析は domain/audio）
├── input/InputManager.ts     キーボード／仮想スティック／ボタンの統合
├── scenes/                   Phaser シーン（表示と入力だけ）
│   ├── WorldScene.ts           探索
│   ├── world/                  マップ描画・人物・光・天候・スクリプトコマンド
│   ├── BattleScene.ts          戦闘演出（ロジックは domain/battle）
│   ├── UIScene.ts              HUD・仮想操作・会話・フェード
│   ├── MenuScene.ts / ShopScene.ts / TitleScene.ts / NewGameScene.ts / BootScene.ts
└── ui/                       ボタン・リスト・会話ウィンドウ・共鳴画面・怪異の詳細（KaiiInfo）
tests/                        単体テスト＋データ整合性テスト
```

## 依存の向き

```
scenes ──▶ domain ◀── data
   │          ▲
   └──▶ render / audio / input
```

- `domain` は Phaser を import しない（Node 上でテストできる）
- `scenes` は `domain` のサービスを呼び出し、結果を描画するだけ
- 戦闘は `BattleEngine.runTurn()` が「起きたこと（BattleEvent）」の列を返し、`BattleScene` がそれを順に演出する

## イベントの流れ（例：怪異を仲間にする）

```
BattleScene ─ 封印 ─▶ BattleEngine.runTurn() ─▶ [seal 成功] イベント
BattleScene ─ 戦闘後 ─▶ 共鳴画面（ui/Resonance）─▶ PartyService.recruit()
PartyService ─ emit('kaii:recruited') ─▶ StatsTracker（カウンター＋1）
                                        └▶ AchievementSystem（「はじめての共鳴」解除）─▶ UIScene（通知）
```

## 描画レイヤー（ワールド）

| depth | 内容 |
| --- | --- |
| 0 | 地面タイル |
| 1 | 太陽の影・水面反射 |
| 2 | 壁・家具タイル |
| 10＋y | 人物・怪異（足元のyで前後関係を決める） |
| 9000 | 頭上タイル（木の葉など） |
| 9100 | 光のグロー（加算合成） |
| 9150 | 霧 |
| 9200 | 時間帯・天候の色味 |
| 9300 | 暗闇（光源の形に抜く） |
| 9350 | 暗闇でも光る怪異の目 |
| 9500〜 | 雨・『視る』の演出 |

## 本番素材への差し替え

- テクスチャキーは `src/render/TextureFactory.ts` の `TEX` と各データの `sprite` キーで決まります
- `BootScene` で同じキーの画像を `this.load.image()` / `this.load.spritesheet()` すれば、生成ドット絵の代わりに使われます
- タイルは `tiles.json` の `gen`（生成関数）を、タイルセット画像のインデックスに置き換える形で移行できます
