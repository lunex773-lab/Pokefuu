import { midiToFreq, parseSequence, type MusicStep } from '@/domain/audio/music';
import type { InstrumentId, MusicTrackDef, MusicVoiceDef } from '@/domain/types';

type Rand = () => number;

interface VoiceState {
  def: MusicVoiceDef;
  phrases: MusicStep[][];
  phrase: number;
  step: number;
  /** 次の音を鳴らす時刻（AudioContext の秒） */
  next: number;
}

interface Playing {
  def: MusicTrackDef;
  /** 1単位の長さ（秒） */
  unit: number;
  /** 楽器の出力先 */
  input: GainNode;
  /** クロスフェード用 */
  fader: GainNode;
  nodes: AudioNode[];
  voices: VoiceState[];
}

/** 楽器ごとの基準音量（聴感上の大きさをそろえる） */
const BASE: Record<InstrumentId, number> = {
  musicbox: 0.1,
  piano: 0.09,
  pad: 0.035,
  bell: 0.06,
  pluck: 0.08,
  pulse: 0.2,
  breath: 0.5,
  bass: 0.07,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 手続き生成の BGM プレイヤー。
 * music.json の音列を AudioContext の時刻で先読み予約して鳴らす（setTimeout より正確でずれない）。
 * 楽器はすべてオシレーターとノイズから合成するので、音声ファイルは不要。
 * OfflineAudioContext にも対応（schedule() を呼んでから startRendering すれば書き出せる）。
 */
export class MusicPlayer {
  private tracks = new Map<string, MusicTrackDef>();
  private parsed = new Map<string, MusicStep[][][]>();
  private current?: Playing;
  private reverb: ConvolverNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly rand: Rand = Math.random,
  ) {
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2);
    this.reverb.connect(out);
  }

  setTracks(defs: MusicTrackDef[]): void {
    this.tracks.clear();
    this.parsed.clear();
    for (const d of defs) {
      this.tracks.set(d.id, d);
      this.parsed.set(
        d.id,
        d.voices.map((v) => v.phrases.map(parseSequence)),
      );
    }
  }

  get playing(): string | null {
    return this.current?.def.id ?? null;
  }

  /** 曲を切り替える（null で無音）。同じ曲なら何もしない */
  play(id: string | null, fadeIn = 1.5): void {
    if ((this.current?.def.id ?? null) === id) return;
    this.stopCurrent(1.2);
    if (!id) return;
    const def = this.tracks.get(id);
    const phrases = this.parsed.get(id);
    if (!def || !phrases) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const unit = 60 / def.bpm;
    const nodes: AudioNode[] = [];
    const node = <N extends AudioNode>(n: N): N => (nodes.push(n), n);

    const input = node(ctx.createGain());
    const fader = node(ctx.createGain());
    fader.gain.setValueAtTime(0.0001, t);
    fader.gain.linearRampToValueAtTime(def.vol, t + fadeIn);
    if (def.lowpass) {
      const lp = node(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = def.lowpass;
      lp.Q.value = 0.4;
      input.connect(lp).connect(fader);
    } else input.connect(fader);
    fader.connect(this.out);
    const wet = node(ctx.createGain());
    wet.gain.value = def.reverb;
    fader.connect(wet).connect(this.reverb);
    if (def.echo) {
      const delay = node(ctx.createDelay(4));
      delay.delayTime.value = Math.min(3.9, unit * (def.echoUnits ?? 3));
      const fb = node(ctx.createGain());
      fb.gain.value = 0.38;
      const echoOut = node(ctx.createGain());
      echoOut.gain.value = def.echo;
      fader.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(echoOut);
      echoOut.connect(this.out);
      echoOut.connect(wet);
    }

    const start = t + 0.12;
    this.current = {
      def,
      unit,
      input,
      fader,
      nodes,
      voices: def.voices.map((v, i) => ({ def: v, phrases: phrases[i], phrase: 0, step: 0, next: start + (v.delay ?? 0) * unit })),
    };
  }

  private stopCurrent(fade: number): void {
    const p = this.current;
    if (!p) return;
    this.current = undefined;
    const t = this.ctx.currentTime;
    p.fader.gain.cancelScheduledValues(t);
    p.fader.gain.setValueAtTime(Math.max(0.0001, p.fader.gain.value), t);
    p.fader.gain.linearRampToValueAtTime(0.0001, t + fade);
    // 残響が消えてから切り離す（ライブ再生のときだけ）
    if (typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext) {
      window.setTimeout(() => p.nodes.forEach((n) => n.disconnect()), (fade + 5) * 1000);
    }
  }

  /** horizon（AudioContext の秒）までに鳴らす音を予約する */
  schedule(horizon: number): void {
    const p = this.current;
    if (!p) return;
    const now = this.ctx.currentTime;
    for (const v of p.voices) {
      // タブを裏に回していた等で予約が遅れたら、たまった音を一度に鳴らさず今から再開する
      if (v.next < now - 0.25) v.next = now + 0.05;
      let guard = 0;
      while (v.next < horizon && guard++ < 64) {
        const phrase = v.phrases[v.phrase];
        const st = phrase[v.step];
        this.playStep(p, v.def, st, v.next);
        v.next += st.units * p.unit;
        v.step++;
        if (v.step >= phrase.length) {
          v.step = 0;
          v.phrase = v.def.order === 'random' ? Math.floor(this.rand() * v.phrases.length) : (v.phrase + 1) % v.phrases.length;
          if (v.def.rest) {
            const [lo, hi] = v.def.rest;
            v.next += Math.round(lo + this.rand() * (hi - lo)) * p.unit;
          }
        }
      }
    }
  }

  private playStep(p: Playing, v: MusicVoiceDef, st: MusicStep, t: number): void {
    if (!st.notes.length) return;
    if (this.rand() > (v.prob ?? 1)) return;
    const dur = st.units * p.unit;
    // 和音は1音あたりを小さくして、全体の大きさをそろえる
    const vel = (BASE[v.inst] * v.vol) / Math.sqrt(st.notes.length);
    for (const n of st.notes) {
      let midi = n + (v.transpose ?? 0);
      if (v.sour && this.rand() < v.sour) midi += this.rand() < 0.5 ? -1 : 1;
      const cents = v.wobble ? (this.rand() * 2 - 1) * v.wobble : 0;
      const f = midiToFreq(midi) * Math.pow(2, cents / 1200);
      this.note(v.inst, t, f, dur, vel, p.input);
    }
  }

  // ------------------------------------------------------------ 楽器

  private note(inst: InstrumentId, t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    switch (inst) {
      case 'musicbox':
        return this.musicbox(t, f, v, dest);
      case 'piano':
        return this.piano(t, f, dur, v, dest);
      case 'pad':
        return this.pad(t, f, dur, v, dest);
      case 'bell':
        return this.bell(t, f, v, dest);
      case 'pluck':
        return this.pluck(t, f, dur, v, dest);
      case 'pulse':
        return this.pulse(t, f, v, dest);
      case 'breath':
        return this.breath(t, f, dur, v, dest);
      case 'bass':
        return this.bass(t, f, dur, v, dest);
    }
  }

  private osc(type: OscillatorType, freq: number, t: number, end: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  private gain(dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(dest);
    return g;
  }

  /** 打鍵してから減衰する音量の形 */
  private strike(g: GainNode, t: number, peak: number, attack: number, decay: number): number {
    const p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay + 0.05;
  }

  /** オルゴール：澄んだ基音＋金属的な倍音（高い音ほど早く消える） */
  private musicbox(t: number, f: number, v: number, dest: AudioNode): void {
    const k = clamp(Math.sqrt(900 / f), 0.55, 1.4);
    const partials: [number, number, number][] = [
      [1, 1, 2.6 * k],
      [2, 0.2, 0.9 * k],
      [4.1, 0.06, 0.22 * k],
    ];
    for (const [ratio, amp, decay] of partials) {
      if (f * ratio > 12000) continue;
      const g = this.gain(dest);
      const end = this.strike(g, t, v * amp, 0.002, decay);
      this.osc('sine', f * ratio, t, end, g);
    }
  }

  /** 古いピアノ：わずかに音程のずれた2本の弦。鍵盤を離すと止音する */
  private piano(t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx;
    const decay = clamp(3.2 - Math.log2(f / 110) * 0.5, 1.0, 3.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(5000, f * 5);
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g).connect(dest);
    const peak = Math.max(0.0002, v);
    const body = peak * 0.35;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(body, t + 0.25);
    const release = t + Math.max(0.3, dur * 1.05);
    let end: number;
    if (release < t + decay) {
      // 離鍵の瞬間の音量（減衰カーブ上の値）から、短く止音する
      const frac = (release - t - 0.25) / (decay - 0.25);
      const at = body * Math.pow(0.0001 / body, Math.max(0, frac));
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, at), release);
      g.gain.exponentialRampToValueAtTime(0.0001, release + 0.3);
      end = release + 0.35;
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      end = t + decay + 0.05;
    }
    this.osc('triangle', f * 1.0012, t, end, lp);
    this.osc('triangle', f * 0.9988, t, end, lp);
    const h = this.gain(lp);
    h.gain.value = 0.15;
    this.osc('sine', f * 2, t, end, h);
  }

  /** 持続音：ゆっくり立ち上がる、こもった和音 */
  private pad(t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.6);
    lp.frequency.linearRampToValueAtTime(500, t + dur + 1.2);
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g).connect(dest);
    const a = Math.min(1.4, dur * 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    const end = t + dur + 1.3;
    this.osc('sawtooth', f * Math.pow(2, 7 / 1200), t, end, lp);
    this.osc('sawtooth', f * Math.pow(2, -7 / 1200), t, end, lp);
  }

  /** 遠くの鐘：非整数倍の倍音で、長く尾を引く */
  private bell(t: number, f: number, v: number, dest: AudioNode): void {
    const partials: [number, number, number][] = [
      [1, 1, 4.5],
      [2.76, 0.45, 2.6],
      [5.4, 0.22, 1.3],
      [8.93, 0.1, 0.6],
    ];
    for (const [ratio, amp, decay] of partials) {
      if (f * ratio > 14000) continue;
      const g = this.gain(dest);
      const end = this.strike(g, t, v * amp, 0.003, decay);
      this.osc('sine', f * ratio, t, end, g);
    }
  }

  /** はじく音（琴・ピチカート風） */
  private pluck(t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(Math.min(8000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, f * 1.5), t + 0.15);
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g).connect(dest);
    const end = this.strike(g, t, v, 0.003, Math.min(0.45, dur + 0.25));
    this.osc('triangle', f, t, end, lp);
  }

  /** 低い鼓動（スマホのスピーカーでも聞こえるよう倍音を足す） */
  private pulse(t: number, f: number, v: number, dest: AudioNode): void {
    const g = this.gain(dest);
    const end = this.strike(g, t, v, 0.004, 0.45);
    const o = this.osc('sine', f * 2, t, end, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const h = this.gain(dest);
    const end2 = this.strike(h, t, v * 0.35, 0.004, 0.16);
    this.osc('sine', f * 3, t, end2, h);
  }

  /** ささやき：音程のあるノイズがふくらんで消える */
  private breath(t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.linearRampToValueAtTime(f * 0.97, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.start(t, this.rand() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** 低音の持続（倍音つき） */
  private bass(t: number, f: number, dur: number, v: number, dest: AudioNode): void {
    const g = this.gain(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.4);
    g.gain.setValueAtTime(v, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.0);
    const end = t + dur + 1.05;
    this.osc('sine', f, t, end, g);
    const h = this.gain(g);
    h.gain.value = 0.35;
    this.osc('triangle', f * 2, t, end, h);
  }

  /** 残響の応答（ノイズを指数的に減衰させたもの） */
  private makeImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.02);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = pre; i < len; i++) {
        const k = (i - pre) / (len - pre);
        d[i] = (this.rand() * 2 - 1) * Math.pow(1 - k, 3) * 0.5;
      }
    }
    return buf;
  }
}
