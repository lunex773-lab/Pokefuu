import type { MusicTrackDef } from '@/domain/types';
import { MusicPlayer } from './MusicPlayer';

/**
 * 手続き生成オーディオ（WebAudio）。
 * 方針：環境音重視・BGMは静かで不気味に・静寂を多用（project_build: BGM）。
 * 音声ファイルを使わないため、ダウンロード容量とメモリを最小化できる。
 * BGM は music.json の音列を MusicPlayer が合成して鳴らす。
 */
export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export interface AmbienceParams {
  kind: string;
  back: boolean;
  danger: number;
  night: boolean;
  rain: number;
}

type Layer = { stop: (t: number) => void };

export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private busMusic?: GainNode;
  private busSfx?: GainNode;
  private busAmb?: GainNode;
  private noise?: AudioBuffer;
  private ambLayers: Layer[] = [];
  private music?: MusicPlayer;
  private musicTracks: MusicTrackDef[] = [];
  /** 流したい曲（音声がまだ使えない間も覚えておき、使えるようになったら流す） */
  private wantMusic: string | null = null;
  private ambKey = '';
  private timers: number[] = [];
  private heartbeatTimer?: number;

  constructor(private settings: AudioSettings) {}

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** ユーザー操作の後に呼ぶ（モバイルの自動再生制限対策） */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.busMusic = this.gainTo(this.master);
        this.busSfx = this.gainTo(this.master);
        this.busAmb = this.gainTo(this.master);
        this.noise = this.makeNoise();
        this.applySettings(this.settings);
        this.music = new MusicPlayer(this.ctx, this.busMusic, this.noise);
        this.music.setTracks(this.musicTracks);
        // 0.1秒ごとに 0.35秒先までの音を予約する
        window.setInterval(() => this.music?.schedule(this.ctx!.currentTime + 0.35), 100);
        this.music.play(this.wantMusic);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* 音が出せない環境でもゲームは継続 */
    }
  }

  applySettings(s: AudioSettings): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(s.master, t, 0.05);
    this.busMusic!.gain.setTargetAtTime(s.music, t, 0.05);
    this.busSfx!.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.busAmb!.gain.setTargetAtTime(s.ambience, t, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private gainTo(dest: AudioNode, value = 1): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseSource(loop = true): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise!;
    src.loop = loop;
    return src;
  }

  // ------------------------------------------------------------ 環境音

  setAmbience(p: AmbienceParams): void {
    if (!this.ctx) return;
    const key = `${p.kind}|${p.back}|${p.danger}|${p.night}|${p.rain}`;
    if (key === this.ambKey) return;
    this.ambKey = key;
    const t = this.ctx.currentTime;
    this.ambLayers.forEach((l) => l.stop(t + 1.2));
    this.ambLayers = [];
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    if (p.kind === 'none') return;

    if (p.back) {
      this.ambLayers.push(this.drone(46 + p.danger * 2, 0.05 + p.danger * 0.012));
      this.ambLayers.push(this.windLayer(220, 0.018 + p.danger * 0.004));
      if (p.danger >= 2) this.scheduleRandom(() => this.whisper(), 6000, 16000 - p.danger * 1200);
      if (p.danger >= 3) this.scheduleRandom(() => this.creak(), 9000, 20000);
    } else if (p.kind === 'town') {
      this.ambLayers.push(this.windLayer(500, p.night ? 0.012 : 0.02));
      if (p.night) this.scheduleRandom(() => this.cricket(), 1500, 4000);
      else this.scheduleRandom(() => this.bird(), 4000, 12000);
    } else {
      // 室内：かすかなルームトーン（静寂を強調）
      this.ambLayers.push(this.hum(p.kind === 'school' ? 0.006 : 0.004));
      if (p.kind === 'school' && p.night) this.scheduleRandom(() => this.creak(), 15000, 30000);
    }
    if (p.rain > 0) this.ambLayers.push(this.rainLayer(0.05 * p.rain));
  }

  private scheduleRandom(fn: () => void, min: number, max: number): void {
    const loop = () => {
      const id = window.setTimeout(() => {
        if (this.ready) fn();
        loop();
      }, min + Math.random() * Math.max(0, max - min));
      this.timers.push(id);
    };
    loop();
  }

  private fadeIn(g: GainNode, value: number, time = 1.5): void {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(value, t + time);
  }

  private stopper(g: GainNode, nodes: AudioScheduledSourceNode[]): Layer {
    return {
      stop: (t: number) => {
        g.gain.cancelScheduledValues(this.ctx!.currentTime);
        g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.3);
        nodes.forEach((n) => {
          try {
            n.stop(t);
          } catch {
            /* noop */
          }
        });
      },
    };
  }

  private windLayer(freq: number, vol: number): Layer {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.gainTo(this.busAmb!, 0);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoG.gain.value = freq * 0.4;
    lfo.connect(lfoG).connect(f.frequency);
    src.connect(f).connect(g);
    src.start();
    lfo.start();
    this.fadeIn(g, vol);
    return this.stopper(g, [src, lfo]);
  }

  private rainLayer(vol: number): Layer {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 0.4;
    const g = this.gainTo(this.busAmb!, 0);
    src.connect(f).connect(g);
    src.start();
    this.fadeIn(g, vol);
    return this.stopper(g, [src]);
  }

  private hum(vol: number): Layer {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = 60;
    const o2 = ctx.createOscillator();
    o2.frequency.value = 120.4;
    const g = this.gainTo(this.busAmb!, 0);
    o.connect(g);
    o2.connect(g);
    o.start();
    o2.start();
    this.fadeIn(g, vol);
    return this.stopper(g, [o, o2]);
  }

  private drone(freq: number, vol: number): Layer {
    const ctx = this.ctx!;
    const g = this.gainTo(this.busAmb!, 0);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    f.connect(g);
    const oscs = [freq, freq * 1.012, freq * 1.5 * 0.995].map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.05;
    lg.gain.value = 90;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    this.fadeIn(g, vol, 3);
    return this.stopper(g, [...oscs, lfo]);
  }

  private env(g: GainNode, peak: number, attack: number, decay: number): number {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay + 0.05;
  }

  private tone(freq: number, type: OscillatorType, peak: number, attack: number, decay: number, bus?: GainNode, glideTo?: number, delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const g = this.gainTo(bus ?? this.busSfx!, 0);
    o.connect(g);
    const t0 = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + attack + decay);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    o.start(t0);
    o.stop(t0 + attack + decay + 0.05);
  }

  private noiseBurst(freq: number, q: number, peak: number, decay: number, bus?: GainNode, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx) return;
    const src = this.noiseSource(false);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.gainTo(bus ?? this.busSfx!, 0);
    src.connect(f).connect(g);
    const end = this.env(g, peak, 0.005, decay);
    src.start();
    src.stop(end);
  }

  private whisper(): void {
    const f = 900 + Math.random() * 1200;
    this.noiseBurst(f, 6, 0.025, 0.9 + Math.random(), this.busAmb);
  }
  private creak(): void {
    this.tone(70 + Math.random() * 40, 'sawtooth', 0.02, 0.2, 0.8, this.busAmb, 50);
  }
  private cricket(): void {
    for (let i = 0; i < 3; i++) this.tone(4200, 'sine', 0.006, 0.005, 0.04, this.busAmb, undefined, i * 0.07);
  }
  private bird(): void {
    const base = 2200 + Math.random() * 1200;
    this.tone(base, 'sine', 0.01, 0.01, 0.12, this.busAmb, base * 1.3);
    this.tone(base * 1.2, 'sine', 0.008, 0.01, 0.1, this.busAmb, base, 0.18);
  }

  // ------------------------------------------------------------ 効果音

  sfx(id: string, volume = 1): void {
    if (!this.ready) return;
    const v = volume;
    switch (id) {
      case 'step_grass':
        return this.noiseBurst(1800, 1, 0.025 * v, 0.06);
      case 'step_hard':
        return this.noiseBurst(2600, 3, 0.03 * v, 0.04);
      case 'step_wood':
        return this.noiseBurst(900, 4, 0.04 * v, 0.05);
      case 'select':
        return this.tone(880, 'square', 0.03 * v, 0.005, 0.05);
      case 'confirm':
        this.tone(660, 'square', 0.035 * v, 0.005, 0.06);
        return this.tone(990, 'square', 0.03 * v, 0.005, 0.08, undefined, undefined, 0.06);
      case 'cancel':
        return this.tone(440, 'square', 0.03 * v, 0.005, 0.08, undefined, 330);
      case 'text':
        return this.tone(1200, 'square', 0.008 * v, 0.002, 0.02);
      case 'hit':
        this.noiseBurst(600, 1, 0.12 * v, 0.18, undefined, 'lowpass');
        return this.tone(160, 'triangle', 0.1 * v, 0.005, 0.2, undefined, 60);
      case 'crit':
        this.noiseBurst(1200, 1, 0.16 * v, 0.25);
        return this.tone(300, 'sawtooth', 0.08 * v, 0.005, 0.3, undefined, 80);
      case 'miss':
        return this.noiseBurst(3000, 2, 0.03 * v, 0.15, undefined, 'highpass');
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone(f, 'sine', 0.05 * v, 0.01, 0.4, undefined, undefined, i * 0.08));
        return;
      case 'status':
        return this.tone(220, 'sawtooth', 0.04 * v, 0.02, 0.5, undefined, 110);
      case 'calm':
        [784, 659, 523, 392].forEach((f, i) => this.tone(f, 'sine', 0.05 * v, 0.01, 0.6, undefined, undefined, i * 0.12));
        return;
      case 'seal_try':
        return this.tone(330, 'triangle', 0.06 * v, 0.01, 0.25, undefined, 660);
      case 'seal_ok':
        [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 'triangle', 0.05 * v, 0.01, 0.5, undefined, undefined, i * 0.1));
        return;
      case 'seal_fail':
        return this.tone(300, 'sawtooth', 0.05 * v, 0.01, 0.4, undefined, 120);
      case 'resonance':
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 'sine', 0.05 * v, 0.02, 1.2, undefined, undefined, i * 0.15));
        return;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'square', 0.03 * v, 0.01, 0.15, undefined, undefined, i * 0.09));
        return;
      case 'item':
        [784, 1047].forEach((f, i) => this.tone(f, 'triangle', 0.05 * v, 0.01, 0.2, undefined, undefined, i * 0.1));
        return;
      case 'door':
        this.noiseBurst(400, 2, 0.06 * v, 0.25);
        return this.tone(90, 'triangle', 0.05 * v, 0.01, 0.2);
      case 'bell':
        [1, 2.76, 5.4].forEach((m, i) => this.tone(523 * m, 'sine', (0.06 / (i + 1)) * v, 0.005, 2.2 - i * 0.5));
        return;
      case 'chime':
        [659, 523, 587, 392].forEach((f, i) => this.tone(f, 'sine', 0.05 * v, 0.01, 1.2, undefined, undefined, i * 0.55));
        return;
      case 'distort':
        this.tone(1200, 'sawtooth', 0.04 * v, 0.6, 0.4, undefined, 60);
        return this.noiseBurst(300, 0.5, 0.08 * v, 1.2, undefined, 'lowpass');
      case 'encounter':
        [233, 247, 349].forEach((f) => this.tone(f, 'sawtooth', 0.05 * v, 0.01, 0.9, undefined, f * 0.7));
        return this.noiseBurst(200, 1, 0.1 * v, 0.6, undefined, 'lowpass');
      case 'sight':
        return this.tone(180, 'sine', 0.08 * v, 0.3, 1.0, undefined, 720);
      case 'heartbeat':
        this.tone(55, 'sine', 0.18 * v, 0.01, 0.15);
        return this.tone(50, 'sine', 0.12 * v, 0.01, 0.15, undefined, undefined, 0.22);
      case 'whisper':
        return this.whisper();
      case 'save':
        return this.tone(1047, 'sine', 0.04 * v, 0.01, 0.5);
      default:
        return;
    }
  }

  /** 正気度が低いときの心音 */
  setHeartbeat(intensity: number): void {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    if (intensity <= 0) return;
    const interval = 1400 - intensity * 700;
    this.heartbeatTimer = window.setInterval(() => this.sfx('heartbeat', 0.5 + intensity * 0.5), interval);
  }

  // ------------------------------------------------------------ 音楽

  /** BGM の曲データ（music.json）を登録する */
  setTracks(tracks: MusicTrackDef[]): void {
    this.musicTracks = tracks;
    this.music?.setTracks(tracks);
  }

  /** BGM を切り替える（null で無音）。同じ曲なら続けて流す */
  setMusic(id: string | null): void {
    this.wantMusic = id;
    this.music?.play(id);
  }

  get currentMusic(): string | null {
    return this.wantMusic;
  }
}
