import type { GameBus } from '@/core/GameEvents';
import type { GameState } from '../state/GameState';
import type { TimePhase, TimePhaseDef } from '../types';

export const MINUTES_PER_DAY = 24 * 60;

/** 分 → 時間帯 */
export function phaseAt(phases: TimePhaseDef[], minutes: number): TimePhase {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const sorted = [...phases].sort((a, b) => a.start - b.start);
  let current = sorted[sorted.length - 1];
  for (const p of sorted) if (m >= p.start) current = p;
  return current.id;
}

export const formatClock = (minutes: number): string => {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * ゲーム内時計。現実時間の経過を受け取り、時間帯の変化をイベントで通知する。
 * 裏層では「時間が歪んでいる」ため固定時間帯（override）を使う。
 */
export class Clock {
  private acc = 0;
  private lastPhase: TimePhase;
  private override?: TimePhase;

  constructor(
    private readonly state: GameState,
    private readonly phases: TimePhaseDef[],
    private readonly bus: GameBus,
    private readonly msPerMinute: number,
  ) {
    this.lastPhase = phaseAt(phases, state.clock.minutes);
  }

  get phase(): TimePhase {
    return this.override ?? phaseAt(this.phases, this.state.clock.minutes);
  }

  get realPhase(): TimePhase {
    return phaseAt(this.phases, this.state.clock.minutes);
  }

  get minutes(): number {
    return this.state.clock.minutes;
  }

  get isDistorted(): boolean {
    return this.override !== undefined;
  }

  setOverride(phase: TimePhase | undefined): void {
    this.override = phase;
    this.checkPhase();
  }

  update(deltaMs: number): void {
    if (this.override) return;
    this.acc += deltaMs;
    let added = 0;
    while (this.acc >= this.msPerMinute) {
      this.acc -= this.msPerMinute;
      added += 1;
    }
    if (added > 0) this.advance(added);
  }

  /** 時間を進める（睡眠・アルバイト等） */
  advance(minutes: number): void {
    const c = this.state.clock;
    c.minutes += minutes;
    while (c.minutes >= MINUTES_PER_DAY) {
      c.minutes -= MINUTES_PER_DAY;
      c.day += 1;
    }
    this.bus.emit('time:tick', { minutes: c.minutes, day: c.day });
    this.checkPhase();
  }

  /** 指定時刻へ（翌日になる場合は日付も進む） */
  setTime(targetMinutes: number, nextDayIfPast = true): void {
    const c = this.state.clock;
    if (nextDayIfPast && targetMinutes <= c.minutes) c.day += 1;
    c.minutes = targetMinutes;
    this.bus.emit('time:tick', { minutes: c.minutes, day: c.day });
    this.checkPhase();
  }

  private checkPhase(): void {
    const p = this.phase;
    if (p !== this.lastPhase) {
      this.lastPhase = p;
      this.bus.emit('time:phase', { phase: p });
    }
  }
}
