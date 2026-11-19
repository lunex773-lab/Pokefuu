import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { computeScreen, isLandscape, Screen } from './config/Screen';
import { GameContext } from './core/GameContext';
import { createRegistry } from './data';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { NewGameScene } from './scenes/NewGameScene';
import { ShopScene } from './scenes/ShopScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';
import { DistortPipeline } from './render/fx/DistortPipeline';

const ctx = new GameContext(createRegistry());

function startGame(): Phaser.Game {
  computeScreen();
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: Screen.width,
    height: Screen.height,
    backgroundColor: '#000000',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    powerPreference: 'high-performance',
    // smoothStep は低FPS時にゲーム内時間が遅れるため無効化（移動・タイマーは実時間に追従）
    fps: { target: GameConfig.targetFps, smoothStep: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 4 },
    pipeline: { DistortFX: DistortPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
    // シーンの並び順＝描画順（後ろほど手前）
    scene: [BootScene, TitleScene, NewGameScene, WorldScene, UIScene, BattleScene, MenuScene, ShopScene],
    callbacks: {
      preBoot: (g) => g.registry.set('ctx', ctx),
    },
  });
}

const isPhone = () => ('ontouchstart' in window || navigator.maxTouchPoints > 0) && Math.min(window.innerWidth, window.innerHeight) < 800;
let game: Phaser.Game | undefined;
// スマホは横向きになってから起動する（画面の縦横比を正しく測るため）
const boot = () => {
  if (game || (isPhone() && !isLandscape())) return;
  game = startGame();
  Object.assign(window as unknown as Record<string, unknown>, { __game: game });
};
window.addEventListener('resize', () => setTimeout(boot, 250));
boot();

// バックグラウンドに回ったら音を止める（スマホの電池・作法）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) ctx.audio.suspend();
  else ctx.audio.resume();
});

// 横画面推奨の案内
const rotate = document.getElementById('rotate');
const checkOrientation = () => {
  if (!rotate) return;
  const portrait = window.innerHeight > window.innerWidth && Math.min(window.innerWidth, window.innerHeight) < 800;
  rotate.style.display = portrait ? 'flex' : 'none';
};
window.addEventListener('resize', checkOrientation);
checkOrientation();

// E2Eテスト・デバッグ用の参照
Object.assign(window as unknown as Record<string, unknown>, { __ctx: ctx });
