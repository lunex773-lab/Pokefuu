import type { EmotionType, SkillType, TypeChartDef } from '../types';

export function typeMultiplier(chart: TypeChartDef, skillType: SkillType, defender: EmotionType[]): number {
  if (skillType === 'none') return 1;
  const row = chart.chart[skillType];
  return defender.reduce((m, t) => m * (row?.[t] ?? 1), 1);
}

export const effectivenessLabel = (mult: number): string | undefined => {
  if (mult >= 2) return 'こころの奥まで響いた！';
  if (mult > 1) return 'よく響いた！';
  if (mult === 0) return 'まったく響かない…';
  if (mult < 1) return 'あまり響かない…';
  return undefined;
};

export const stageMultiplier = (stage: number): number => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
