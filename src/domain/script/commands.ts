/**
 * イベントスクリプトで使えるコマンド名の一覧。
 * データ検証テスト（tests/data.test.ts）と実装（ScriptCommands.ts）の両方がこれを参照する。
 * 新しいコマンドを追加したら、ここにも名前を足すこと。
 */
export const SCRIPT_COMMANDS = [
  // 制御
  'if', 'call', 'end',
  // 会話・演出
  'say', 'choice', 'fade', 'wait', 'shake', 'flash', 'distort', 'sfx', 'music', 'title', 'toast',
  // 人物・移動
  'moveNpc', 'hideNpc', 'face', 'facePlayer', 'movePlayer', 'warp', 'warpLocal', 'respawn',
  // 戦闘・怪異
  'battle', 'recruit', 'resonanceTalk',
  // 施設・休息
  'shop', 'saveMenu', 'autosave', 'parttime', 'sleep', 'heal', 'rest', 'healFull',
  // 状態
  'setFlag', 'clearFlag', 'incFlag', 'giveItem', 'takeItem', 'money', 'memory', 'setTime', 'advanceTime',
  'setWeather', 'unlockWeather', 'chapter', 'playerExp', 'sanity', 'achievement', 'refreshMap', 'ending',
] as const;

export type ScriptCommandName = (typeof SCRIPT_COMMANDS)[number];
