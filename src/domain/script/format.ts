import type { GameState } from '../state/GameState';

/**
 * セリフの差し込み。
 * {name} = 主人公の名前
 * {sib}  = 妹から見た主人公の呼び方（おにいちゃん／おねえちゃん）
 * {Sib}  = 漢字の呼び方（兄／姉）
 */
export function formatText(text: string, state: GameState): string {
  const male = state.player.gender === 'male';
  return text
    .split('{name}').join(state.player.name)
    .split('{sib}').join(male ? 'おにいちゃん' : 'おねえちゃん')
    .split('{Sib}').join(male ? '兄' : '姉');
}
