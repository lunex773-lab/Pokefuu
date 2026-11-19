# ロードマップ

## 現在（v0.2）

- [x] 全システムの土台（探索・昼夜・天候・裏層・戦闘・封印・共鳴・育成・クラフト・装備・図鑑・実績・セーブ）
- [x] Chapter 1「学校」（朝霧町・桜ヶ丘高校・裏層の学校・十三階段）
- [x] Chapter 2「住宅街」（夕凪住宅街・空き家・裏の町・封じられた子ども部屋）
- [x] 物語全体の構成（10〜12時間）とエンディング判定（記憶片＋最後の選択）
- [x] コード生成の仮ドット絵・手続き生成サウンド
- [x] 単体テスト・データ整合性テスト・GitHub Actions（CI と Pages 公開）

## 次にやること（候補）

1. **Chapter 3「商店街」**（白灯商店街）— [STORY.md](STORY.md) の構成に沿って制作
2. Chapter 1 の拡充（目標1時間に向けて寄り道依頼・記憶片を追加）
3. **本番グラフィック**への差し替え（BW2レベルの高品質ドット）。テクスチャキーはそのまま使える
4. **アプリ化**：Capacitor で Android / iPhone 向けにラップ
   ```bash
   npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
   npx cap init pokefuu com.example.pokefuu --web-dir dist
   npm run build && npx cap add android && npx cap open android
   ```
   - セーブは `StorageAdapter` を Capacitor Preferences / Filesystem 実装に差し替える
   - 画面の向きは横固定（Android: `screenOrientation="landscape"`、iOS: Info.plist）
5. バランス調整（実機でのプレイテスト）
6. 効果音・環境音の本番素材化（`AudioManager` の `sfx(id)` を音声ファイル再生に置き換え可能）

## 未決事項（要相談）

- Chapter 3 以降の怪異・ボス・都市伝説（案で進める場合は STORY.md の方針に沿って作成）
- 妹の名前（8章で判明する。案を作るか、指定するか）
- 「？？？」組織（物語後半で判明）の詳細
- 専門用語辞典（100語以上登録予定）の残り
- 本番タイトル（現在は仮称「Project Phantom」）
