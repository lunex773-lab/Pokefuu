import { GameConfig } from '@/config/GameConfig';

/** UI の配色・文字サイズ（1920×1080 基準） */
export const Theme = {
  font: GameConfig.ui.fontFamily,
  size: { xs: 26, s: 32, m: 40, l: 52, xl: 72, xxl: 110 },
  color: {
    text: '#ece6f2',
    dim: '#8f88a0',
    accent: '#e04860',
    accentSoft: '#ff8aa0',
    gold: '#e8c860',
    good: '#7ad08a',
    bad: '#e86060',
    panel: 0x0d0b13,
    panelAlpha: 0.92,
    panelLight: 0x1b1726,
    border: 0x8f7fb0,
    borderHi: 0xe04860,
    select: 0x3a2440,
  },
  hex: (s: string): number => parseInt(s.replace('#', ''), 16),
} as const;

export const textStyle = (size: number, color: string = Theme.color.text, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: Theme.font,
  fontSize: `${size}px`,
  color,
  lineSpacing: Math.round(size * 0.35),
  ...extra,
});
