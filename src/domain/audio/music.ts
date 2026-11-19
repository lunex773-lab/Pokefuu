import type { MapDef, MusicTrackDef, TimePhase } from '../types';

/** 音列の1ステップ（notes が空なら休符） */
export interface MusicStep {
  notes: number[];
  units: number;
}

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 音名（A4, C#5, Bb3）→ MIDI ノート番号。A4 = 69 */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`[music] 音名が読めない: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + NOTE_BASE[m[1]] + acc;
}

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** "E5:2 A5 . C6+E6:4 | .:2" のような音列を読む */
export function parseSequence(seq: string): MusicStep[] {
  const steps: MusicStep[] = [];
  for (const tok of seq.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [body, len] = tok.split(':');
    const units = len === undefined ? 1 : Number(len);
    if (!(units > 0)) throw new Error(`[music] 長さが不正: ${tok}`);
    const notes = body === '.' ? [] : body.split('+').map(noteToMidi);
    steps.push({ notes, units });
  }
  return steps;
}

export const sequenceUnits = (steps: MusicStep[]): number => steps.reduce((a, s) => a + s.units, 0);

const NIGHT: TimePhase[] = ['night', 'midnight'];

/**
 * その場所・時間帯で流す BGM を決める。
 * マップに指定があればそれを使い、無ければ「裏層（危険度で2段階）／屋外（昼・夜）／屋内」で決める。
 */
export function resolveAreaMusic(def: Pick<MapDef, 'layer' | 'indoor' | 'dangerLevel' | 'music' | 'musicNight'>, phase: TimePhase): string {
  const night = NIGHT.includes(phase);
  if (night && def.musicNight) return def.musicNight;
  if (def.music) return def.music;
  if (def.layer === 'back') return def.dangerLevel >= 5 ? 'back_deep' : 'back';
  if (!def.indoor) return night ? 'town_night' : 'town';
  return 'unease';
}

/** 曲データの検証用：各パートのフレーズ長（単位数） */
export function voiceLengths(track: MusicTrackDef): number[][] {
  return track.voices.map((v) => v.phrases.map((p) => sequenceUnits(parseSequence(p))));
}
