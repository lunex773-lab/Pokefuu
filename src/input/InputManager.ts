/**
 * 入力の抽象化。キーボード・仮想スティック・タッチボタン（将来はゲームパッド）を
 * 同じ「アクション」に変換し、最前面の受け手（UI → ワールドの順）へ配送する。
 */
export type InputAction = 'confirm' | 'cancel' | 'menu' | 'sight' | 'up' | 'down' | 'left' | 'right';

export interface InputConsumer {
  /** true を返すと消費（下の受け手へは流れない） */
  onAction(action: InputAction): boolean;
}

const KEYMAP: Record<string, InputAction> = {
  KeyZ: 'confirm',
  Enter: 'confirm',
  Space: 'confirm',
  KeyX: 'cancel',
  Backspace: 'cancel',
  Escape: 'menu',
  KeyM: 'menu',
  KeyC: 'sight',
  KeyV: 'sight',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export class InputManager {
  readonly move = { x: 0, y: 0 };
  private held = new Set<string>();
  private stick = { x: 0, y: 0 };
  private touchDash = false;
  private stack: InputConsumer[] = [];
  enabled = true;
  /** 直近の入力がタッチかどうか（UI表示の切り替えに使う） */
  usingTouch = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.held.clear());
  }

  get dash(): boolean {
    return this.touchDash || this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    this.usingTouch = false;
    this.held.add(e.code);
    const a = KEYMAP[e.code];
    if (a) {
      e.preventDefault();
      this.dispatch(a);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  push(c: InputConsumer): void {
    this.remove(c);
    this.stack.push(c);
  }

  remove(c: InputConsumer): void {
    const i = this.stack.indexOf(c);
    if (i >= 0) this.stack.splice(i, 1);
  }

  dispatch(a: InputAction): void {
    if (!this.enabled) return;
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].onAction(a)) return;
  }

  setStick(x: number, y: number): void {
    this.usingTouch = true;
    this.stick.x = x;
    this.stick.y = y;
  }

  setTouchDash(on: boolean): void {
    this.touchDash = on;
  }

  /** 8方向の移動ベクトルを更新（毎フレーム） */
  update(): void {
    let x = 0;
    let y = 0;
    const h = (c: string) => this.held.has(c);
    if (h('ArrowLeft') || h('KeyA')) x -= 1;
    if (h('ArrowRight') || h('KeyD')) x += 1;
    if (h('ArrowUp') || h('KeyW')) y -= 1;
    if (h('ArrowDown') || h('KeyS')) y += 1;
    if (x === 0 && y === 0 && (Math.abs(this.stick.x) > 0.25 || Math.abs(this.stick.y) > 0.25)) {
      // スティックを8方向に量子化（BW2風の8方向歩行）
      const ang = Math.atan2(this.stick.y, this.stick.x);
      const oct = Math.round(ang / (Math.PI / 4));
      x = Math.round(Math.cos((oct * Math.PI) / 4));
      y = Math.round(Math.sin((oct * Math.PI) / 4));
    }
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
  }

  clearHeld(): void {
    this.held.clear();
    this.stick.x = 0;
    this.stick.y = 0;
    this.touchDash = false;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
