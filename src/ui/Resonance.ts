import Phaser from 'phaser';
import type { InputManager } from '@/input/InputManager';
import { UI } from '@/config/Screen';
import { wrapText } from './Dialogue';
import { Theme } from './Theme';
import { drawPanel, label, ListView, type Sfx } from './Widgets';

/**
 * 共鳴：怪異の「声」を聞き、どう応えるかを選ぶ画面。
 * 戦闘後（封印した怪異）とイベントの両方から使う。
 */
export async function showResonance(
  scene: Phaser.Scene,
  input: InputManager,
  sfx: Sfx,
  spriteKey: string,
  name: string,
  prompt: string,
  options: string[],
  depth = 9250,
): Promise<number> {
  sfx('sight');
  const c = scene.add.container(0, 0).setDepth(depth).setAlpha(0);
  const cx = UI.CX;
  const dim = scene.add.rectangle(0, 0, UI.W, UI.H, 0x05030a, 0.86).setOrigin(0);
  const glow = scene.add.image(cx, 290, 'fx_light').setScale(5).setTint(0x8040c0).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
  const sprite = scene.add.image(cx, 290, spriteKey).setScale(5);
  const nameT = label(scene, cx, 480, `― ${name} の声 ―`, Theme.size.s, Theme.color.accentSoft).setOrigin(0.5);
  const promptT = label(scene, cx, 540, wrapText(prompt, Theme.size.l, 1500), Theme.size.l, Theme.color.text, { align: 'center' }).setOrigin(0.5, 0);
  c.add([dim, glow, sprite, nameT, promptT]);
  scene.tweens.add({ targets: c, alpha: 1, duration: 500 });
  scene.tweens.add({ targets: sprite, y: 280, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
  scene.tweens.add({ targets: glow, alpha: 0.25, yoyo: true, repeat: -1, duration: 900 });
  const lbg = scene.add.graphics().setDepth(depth + 10);
  drawPanel(lbg, cx - 460, 700, 920, 330, { alpha: 0.95, border: Theme.color.borderHi });
  const list = new ListView(scene, cx - 430, 720, 860, 96, 3, sfx);
  list.setDepth(depth + 20);
  list.setItems(options.map((t) => ({ text: t })));
  const choice = await new Promise<number>((res) => {
    list.onConfirm = (_it, i) => res(i);
    input.push(list);
  });
  input.remove(list);
  list.destroy();
  lbg.destroy();
  await new Promise<void>((res) =>
    scene.tweens.add({
      targets: c,
      alpha: 0,
      duration: 350,
      onComplete: () => {
        c.destroy();
        res();
      },
    }),
  );
  return choice;
}
