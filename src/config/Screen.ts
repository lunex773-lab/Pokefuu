/**
 * 画面サイズとセーフエリア（ノッチ・ホームバー）。
 *
 * 高さは 1080 で固定し、幅は端末の縦横比に合わせて決める（iPhone 横向き ≒ 19.5:9 なら 約2340）。
 * これにより左右の黒帯をなくし、世界を画面いっぱいに表示する。
 * UI は safe の内側に配置して、ノッチやホームバーに隠れないようにする。
 */
export const Screen = {
  width: 1920,
  height: 1080,
  /** ゲーム座標でのセーフエリア余白 */
  safe: { left: 0, right: 0, top: 0, bottom: 0 },
};

const MIN_ASPECT = 16 / 9;
const MAX_ASPECT = 2.25;

/** CSS の env(safe-area-inset-*) を測る（px） */
function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const v = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
    return v;
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export const isLandscape = (): boolean => window.innerWidth >= window.innerHeight;

/** 端末に合わせてゲームの幅とセーフエリアを決める（起動時に1回） */
export function computeScreen(): void {
  const w = Math.max(window.innerWidth, window.innerHeight);
  const h = Math.min(window.innerWidth, window.innerHeight);
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, w / Math.max(1, h)));
  Screen.width = Math.round((Screen.height * aspect) / 2) * 2;
  const insets = readSafeAreaInsets();
  const scale = Screen.height / Math.max(1, h);
  // 端末を逆向きにするとノッチの左右が入れ替わるため、左右は大きい方にそろえる
  const side = Math.max(insets.left, insets.right) * scale;
  Screen.safe = {
    left: side,
    right: side,
    top: insets.top * scale,
    bottom: insets.bottom * scale,
  };
}

/** よく使う配置の値 */
export const UI = {
  get W(): number {
    return Screen.width;
  },
  get H(): number {
    return Screen.height;
  },
  get CX(): number {
    return Screen.width / 2;
  },
  /** 左右・下の余白（セーフエリア＋最低限のマージン） */
  get L(): number {
    return Screen.safe.left + 24;
  },
  get R(): number {
    return Screen.width - Screen.safe.right - 24;
  },
  get B(): number {
    return Screen.height - Math.max(Screen.safe.bottom, 12) - 12;
  },
};
