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

const DIR_KEYS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

export class InputManager {
  /** 移動方向（上下左右のいずれか。斜めにはならない） */
  readonly move = { x: 0, y: 0 };
  /** 移動方向。押されていなければ null */
  dir4: { x: number; y: number } | null = null;
  private held = new Set<string>();
  /** 押された順の方向キー（最後に押したものを優先） */
  private dirOrder: string[] = [];
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
    if (DIR_KEYS[e.code] && !e.repeat) {
      this.dirOrder = this.dirOrder.filter((c) => c !== e.code);
      this.dirOrder.push(e.code);
    }
    const a = KEYMAP[e.code];
    if (a) {
      e.preventDefault();
      this.dispatch(a);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    this.dirOrder = this.dirOrder.filter((c) => c !== e.code);
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

  /** 上下左右の移動方向を更新（毎フレーム）。斜め入力は、最後に押した方向／スティックの強い方の軸を採用 */
  update(): void {
    let dir: { x: number; y: number } | null = null;
    for (let i = this.dirOrder.length - 1; i >= 0; i--) {
      if (this.held.has(this.dirOrder[i])) {
        dir = DIR_KEYS[this.dirOrder[i]];
        break;
      }
    }
    if (!dir) {
      const ax = Math.abs(this.stick.x);
      const ay = Math.abs(this.stick.y);
      if (Math.max(ax, ay) > 0.3) dir = ax >= ay ? { x: Math.sign(this.stick.x), y: 0 } : { x: 0, y: Math.sign(this.stick.y) };
    }
    this.dir4 = this.enabled ? dir : null;
    this.move.x = this.dir4?.x ?? 0;
    this.move.y = this.dir4?.y ?? 0;
  }

  clearHeld(): void {
    this.held.clear();
    this.dirOrder = [];
    this.dir4 = null;
    this.stick.x = 0;
    this.stick.y = 0;
    this.touchDash = false;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
