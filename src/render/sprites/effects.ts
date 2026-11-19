import { PixelCanvas, seeded, shadeHex } from '../pixel/PixelCanvas';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 柔らかい円形の光（ライティング用） */
export function buildLightTexture(size = 128): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** ライト（懐中電灯）の円錐形の光。右向きが基準 */
export function buildConeTexture(size = 128): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  const cx = size * 0.08;
  const cy = size / 2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.95);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, size * 0.95, -0.42, 0.42);
  g.closePath();
  g.fill();
  return c;
}

/** タイル可能な霧のノイズ（2オクターブのバリューノイズ） */
export function buildFogTexture(size = 128): HTMLCanvasElement {
  const pc = new PixelCanvas(size, size);
  const rnd = seeded(4242);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (grid: number) => {
    const v: number[][] = [];
    for (let y = 0; y < grid; y++) {
      v.push([]);
      for (let x = 0; x < grid; x++) v[y].push(rnd());
    }
    const cells = size / grid;
    return (x: number, y: number) => {
      const gx = x / cells;
      const gy = y / cells;
      const x0 = Math.floor(gx) % grid;
      const y0 = Math.floor(gy) % grid;
      const x1 = (x0 + 1) % grid;
      const y1 = (y0 + 1) % grid;
      const tx = smooth(gx - Math.floor(gx));
      const ty = smooth(gy - Math.floor(gy));
      const a = v[y0][x0] * (1 - tx) + v[y0][x1] * tx;
      const b = v[y1][x0] * (1 - tx) + v[y1][x1] * tx;
      return a * (1 - ty) + b * ty;
    };
  };
  const o1 = octave(4);
  const o2 = octave(8);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = o1(x, y) * 0.65 + o2(x, y) * 0.35;
      pc.set(x, y, [220, 222, 232, Math.floor(Math.max(0, n - 0.3) * 260)]);
    }
  }
  return pc.toCanvas();
}

export function buildRainTexture(): HTMLCanvasElement {
  const pc = new PixelCanvas(2, 10);
  for (let y = 0; y < 10; y++) pc.set(y < 5 ? 1 : 0, y, [180, 200, 230, 90 + y * 12]);
  return pc.toCanvas();
}

export function buildDotTexture(color = '#ffffff', size = 2): HTMLCanvasElement {
  const pc = new PixelCanvas(size, size);
  pc.rect(0, 0, size, size, color);
  return pc.toCanvas();
}

export function buildShadowBlob(): HTMLCanvasElement {
  const pc = new PixelCanvas(20, 8);
  pc.ellipse(10, 4, 8, 3, '#000000', 90);
  pc.ellipse(10, 4, 6, 2, '#000000', 50);
  return pc.toCanvas();
}

/** 戦闘背景（層・場所ごとに色を変える） */
export function buildBattleBackdrop(w: number, h: number, back: boolean): HTMLCanvasElement {
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  if (back) {
    grad.addColorStop(0, '#120814');
    grad.addColorStop(0.55, '#2a0e1e');
    grad.addColorStop(1, '#0a050c');
  } else {
    grad.addColorStop(0, '#1a2238');
    grad.addColorStop(1, '#0a0e18');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const rnd = seeded(back ? 13 : 17);
  // 床のパース線
  g.strokeStyle = back ? 'rgba(160,40,70,0.25)' : 'rgba(120,140,200,0.18)';
  g.lineWidth = 2;
  const horizon = h * 0.42;
  for (let i = -12; i <= 12; i++) {
    g.beginPath();
    g.moveTo(w / 2 + i * 30, horizon);
    g.lineTo(w / 2 + i * 260, h);
    g.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const y = horizon + Math.pow(k / 8, 2) * (h - horizon);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let k = 0; k < 120; k++) {
    g.fillStyle = back ? `rgba(255,60,90,${rnd() * 0.25})` : `rgba(200,210,255,${rnd() * 0.2})`;
    g.fillRect(rnd() * w, rnd() * horizon, 3, 3);
  }
  return c;
}

/** アイテムアイコン（16×16）：icon キーから決定的に生成 */
export function buildItemIcon(icon: string, category: string): HTMLCanvasElement {
  const pc = new PixelCanvas(16, 16);
  const rnd = seeded(icon.length * 131 + icon.charCodeAt(0));
  const hue = ['#e05050', '#e0a040', '#50a0e0', '#60c070', '#c070e0', '#e0e0e0'][Math.floor(rnd() * 6)];
  switch (category) {
    case 'seal':
      pc.rect(4, 1, 8, 14, '#f0e8d0');
      pc.rect(5, 3, 6, 1, '#c02030');
      pc.vline(8, 5, 12, '#2a2020');
      pc.circle(8, 12, 1.5, icon === 'ofuda_strong' ? '#a040e0' : '#c02030');
      break;
    case 'material':
      pc.poly([[8, 1], [14, 8], [8, 15], [2, 8]], hue);
      pc.poly([[8, 3], [11, 8], [8, 10], [5, 8]], shadeHex(hue, 1.3));
      break;
    case 'equipment':
      pc.circle(8, 8, 6, hue);
      pc.circle(8, 8, 3, '#1a1420');
      pc.rect(7, 0, 2, 3, shadeHex(hue, 0.7));
      break;
    case 'key':
      pc.circle(5, 6, 3.5, '#e0c040');
      pc.circle(5, 6, 1.5, '#1a1420');
      pc.rect(8, 5, 7, 2, '#e0c040');
      pc.rect(12, 7, 2, 3, '#e0c040');
      break;
    default:
      pc.circle(8, 9, 6, hue);
      pc.circle(6, 7, 2, shadeHex(hue, 1.4));
      pc.rect(7, 1, 2, 3, '#7a5232');
  }
  pc.outline('#0c0810');
  return pc.toCanvas();
}

/** 次に行く場所の目印（▼） */
export function buildArrowTexture(): HTMLCanvasElement {
  const pc = new PixelCanvas(9, 7);
  pc.poly([[0, 0], [8, 0], [4, 5]], '#ffd84a');
  pc.hline(1, 7, 0, '#fff4b0');
  pc.outline('#2a1a10');
  return pc.toCanvas();
}
