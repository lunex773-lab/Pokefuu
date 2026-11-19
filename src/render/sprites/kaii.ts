import { PixelCanvas, seeded, shadeHex } from '../pixel/PixelCanvas';

export const KAII_SIZE = 64;
const OUT = '#0c0810';

type Draw = (pc: PixelCanvas, rnd: () => number) => void;

/** 怪異の戦闘用スプライト（64×64）。データの sprite キーに対応 */
const kaiiDraw: Record<string, Draw> = {
  kaii_nanashi: (pc) => {
    // 小さな影の子：白い丸顔、空欄の名札、赤いリボン
    pc.poly([[22, 30], [42, 30], [48, 58], [16, 58]], '#2a2240');
    pc.poly([[24, 32], [40, 32], [44, 56], [20, 56]], '#3a3058');
    pc.rect(20, 56, 8, 3, '#2a2240');
    pc.rect(36, 56, 8, 3, '#2a2240');
    pc.circle(32, 22, 11, '#ece8f2');
    pc.circle(32, 22, 11, '#ece8f2');
    pc.ellipse(32, 26, 9, 6, '#d8d2e2');
    pc.rect(27, 21, 2, 3, '#14101c');
    pc.rect(35, 21, 2, 3, '#14101c');
    // 髪（おかっぱの影）
    pc.poly([[20, 18], [32, 9], [44, 18], [44, 14], [32, 8], [20, 14]], '#1a1428');
    pc.rect(20, 12, 24, 5, '#1a1428');
    pc.rect(20, 16, 3, 9, '#1a1428');
    pc.rect(41, 16, 3, 9, '#1a1428');
    // リボン
    pc.poly([[40, 10], [46, 7], [46, 14]], '#c02030');
    pc.poly([[40, 10], [35, 6], [36, 13]], '#c02030');
    pc.circle(40, 10, 1.5, '#e04050');
    // 空欄の名札
    pc.rect(26, 38, 12, 7, '#f0ece0');
    pc.rect(27, 39, 10, 1, '#c02030');
    pc.hline(28, 35, 43, '#c8c0b0');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_kageboushi: (pc, rnd) => {
    // ひょろ長い影、つば広帽子、黄色い目
    pc.poly([[26, 20], [38, 20], [44, 62], [20, 62]], '#141018');
    pc.poly([[28, 22], [36, 22], [40, 60], [24, 60]], '#1e1826');
    for (let y = 40; y < 62; y += 3) pc.set(22 + Math.floor(rnd() * 20), y, '#2a2234');
    pc.ellipse(32, 18, 9, 9, '#16121c');
    pc.ellipse(32, 12, 18, 3, '#0e0a12');
    pc.rect(25, 3, 14, 9, '#0e0a12');
    pc.hline(25, 38, 9, '#3a2a40');
    pc.rect(27, 17, 3, 2, '#f0d040');
    pc.rect(35, 17, 3, 2, '#f0d040');
    pc.set(28, 17, '#fff8c0');
    pc.set(36, 17, '#fff8c0');
    // 長い腕
    pc.line(25, 26, 14, 46, '#141018');
    pc.line(26, 26, 15, 46, '#141018');
    pc.line(39, 26, 50, 46, '#141018');
    pc.line(38, 26, 49, 46, '#141018');
    pc.rect(12, 45, 4, 3, '#141018');
    pc.rect(48, 45, 4, 3, '#141018');
    pc.outline('#3a2a48');
  },
  kaii_hitorioni: (pc) => {
    // 布人形：白い体、赤い糸、バツ目
    pc.circle(32, 22, 13, '#e8e2d4');
    pc.poly([[22, 32], [42, 32], [46, 54], [18, 54]], '#e0d8c8');
    pc.rect(14, 34, 9, 5, '#e0d8c8');
    pc.rect(41, 34, 9, 5, '#e0d8c8');
    pc.rect(21, 54, 8, 7, '#d8d0c0');
    pc.rect(35, 54, 8, 7, '#d8d0c0');
    // バツ目
    for (const ex of [26, 38]) {
      pc.line(ex - 2, 18, ex + 2, 22, '#a01020');
      pc.line(ex + 2, 18, ex - 2, 22, '#a01020');
    }
    pc.hline(28, 36, 28, '#a01020');
    for (let x = 29; x <= 35; x += 2) pc.set(x, 29, '#a01020');
    // 巻かれた赤い糸
    for (let k = 0; k < 6; k++) pc.line(18, 34 + k * 4, 46, 30 + k * 4, '#c02030');
    pc.line(16, 38, 26, 12, '#c02030');
    // 縫い目
    pc.vline(32, 33, 52, '#b0a898');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_sanbanme: (pc) => {
    // 個室の扉。隙間から大きな目
    pc.rect(12, 6, 40, 56, '#8a7a92');
    pc.rect(14, 8, 36, 52, '#c8b8d0');
    pc.rect(14, 8, 36, 2, '#e0d4e8');
    pc.rect(42, 30, 5, 6, '#6a5a72');
    pc.rect(43, 31, 3, 2, '#e04050');
    pc.rect(16, 12, 6, 44, '#060408');
    pc.ellipse(19, 30, 3, 6, '#f0ece8');
    pc.ellipse(19, 30, 2, 3, '#2a0a10');
    pc.set(19, 29, '#ff4060');
    // 指
    for (let k = 0; k < 4; k++) pc.rect(22, 18 + k * 4, 4, 2, '#e8d8d0');
    pc.rect(14, 58, 36, 4, '#4a3a52');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_kiritsu: (pc) => {
    // 口のように開いた机
    pc.poly([[10, 26], [54, 26], [58, 34], [6, 34]], '#c8a070');
    pc.poly([[10, 26], [54, 26], [50, 10], [14, 10]], '#b08858');
    pc.hline(14, 50, 10, '#e0c090');
    // 口の中と歯
    pc.poly([[14, 25], [50, 25], [48, 14], [16, 14]], '#3a0a10');
    for (let x = 16; x < 48; x += 4) pc.poly([[x, 25], [x + 3, 25], [x + 1.5, 21]], '#f0e8d8');
    for (let x = 18; x < 48; x += 4) pc.poly([[x, 14], [x + 3, 14], [x + 1.5, 18]], '#f0e8d8');
    // 目（怒り）
    pc.rect(20, 28, 6, 3, '#e02020');
    pc.rect(38, 28, 6, 3, '#e02020');
    pc.line(19, 27, 26, 29, '#2a1010');
    pc.line(45, 27, 38, 29, '#2a1010');
    // 脚
    pc.rect(12, 34, 4, 26, '#6a6a72');
    pc.rect(48, 34, 4, 26, '#6a6a72');
    pc.rect(18, 36, 28, 8, '#7a5a3a');
    // チョーク粉
    pc.circle(54, 12, 2, '#f0f0f0', 180);
    pc.circle(58, 8, 1.5, '#f0f0f0', 140);
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_gakubuchi: (pc) => {
    // 金の額縁、黒い肖像、白い目
    pc.rect(8, 6, 48, 54, '#a07a28');
    pc.rect(10, 8, 44, 50, '#d8b048');
    pc.rect(14, 12, 36, 42, '#8a6a20');
    pc.rect(16, 14, 32, 38, '#14101a');
    pc.circle(32, 28, 9, '#1e1828');
    pc.poly([[18, 52], [46, 52], [42, 38], [22, 38]], '#1e1828');
    pc.ellipse(28, 27, 3, 2, '#f0f0f0');
    pc.ellipse(37, 27, 3, 2, '#f0f0f0');
    pc.rect(29, 26, 2, 2, '#40c040');
    pc.rect(38, 26, 2, 2, '#40c040');
    for (const [x, y] of [[10, 8], [52, 8], [10, 56], [52, 56]] as [number, number][]) pc.circle(x + 1, y + 1, 3, '#f0d070');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_yonakipiano: (pc) => {
    // 鍵盤の歯をもつピアノ
    pc.rect(8, 10, 48, 42, '#1a1418');
    pc.rect(10, 12, 44, 4, '#3a3038');
    pc.rect(8, 30, 48, 12, '#0a080a');
    for (let x = 10; x < 54; x += 4) pc.rect(x, 30, 3, 9, '#f0f0e8');
    for (let x = 12; x < 52; x += 8) pc.rect(x, 30, 2, 5, '#1a1418');
    // 目と涙
    pc.ellipse(22, 22, 4, 3, '#e8e8f0');
    pc.ellipse(42, 22, 4, 3, '#e8e8f0');
    pc.rect(22, 21, 2, 3, '#3a4aa0');
    pc.rect(42, 21, 2, 3, '#3a4aa0');
    pc.vline(20, 25, 29, '#6aa0e0');
    pc.vline(44, 25, 29, '#6aa0e0');
    pc.rect(10, 52, 4, 10, '#1a1418');
    pc.rect(50, 52, 4, 10, '#1a1418');
    // 音符
    pc.circle(56, 6, 2, '#a0b0e0');
    pc.vline(58, 0, 6, '#a0b0e0');
    pc.outline('#3a3048');
    pc.rimShade();
  },
  kaii_honemi: (pc) => {
    // 半身だけ皮膚のある人体模型
    pc.circle(32, 14, 10, '#e8c8a8');
    pc.poly([[32, 4], [42, 10], [42, 20], [32, 24]], '#d08a8a');
    pc.rect(22, 24, 20, 22, '#e8c8a8');
    pc.rect(32, 24, 10, 22, '#c86060');
    pc.ellipse(36, 30, 3, 4, '#e09090');
    pc.ellipse(37, 38, 4, 3, '#a04848');
    pc.circle(35, 43, 2, '#e0a050');
    pc.rect(14, 26, 8, 4, '#e8c8a8');
    pc.rect(42, 26, 8, 4, '#c86060');
    pc.rect(12, 30, 5, 14, '#e8c8a8');
    pc.rect(47, 30, 5, 14, '#c86060');
    pc.rect(24, 46, 7, 16, '#e8c8a8');
    pc.rect(33, 46, 7, 16, '#c86060');
    // 空の眼窩
    pc.ellipse(28, 14, 2, 3, '#100808');
    pc.ellipse(36, 14, 2, 3, '#100808');
    pc.hline(28, 36, 20, '#6a3a3a');
    pc.rect(30, 46, 4, 2, '#5a5a62');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_juusandan: (pc, rnd) => {
    // 十三段の階段が背骨のように連なり、頂上に大きな目
    for (let i = 0; i < 13; i++) {
      const x = 6 + i * 3.6;
      const y = 60 - i * 4;
      pc.rect(Math.round(x), Math.round(y), 12, 4, i % 2 ? '#7a7468' : '#9a9488');
      pc.hline(Math.round(x), Math.round(x) + 11, Math.round(y), '#c0baae');
      if (rnd() < 0.6) pc.rect(Math.round(x) + 2, Math.round(y) + 4, 2, 3, '#d8c8c0');
    }
    pc.poly([[6, 64], [58, 12], [64, 12], [64, 64]], '#2a2430', 200);
    pc.circle(52, 12, 10, '#0e0a12');
    pc.ellipse(52, 12, 8, 6, '#f0e8e0');
    pc.circle(52, 12, 4, '#8a1020');
    pc.circle(52, 12, 2, '#0a0408');
    pc.set(50, 10, '#ffffff');
    for (let k = 0; k < 6; k++) {
      const x = 12 + k * 8;
      const y = 58 - k * 8;
      pc.line(x, y, x - 4, y + 6, '#d8c8c0');
      pc.rect(x - 6, y + 6, 3, 2, '#d8c8c0');
    }
    pc.outline('#4a1020');
    pc.rimShade();
  },
};

export function buildKaiiSprite(key: string): PixelCanvas {
  const pc = new PixelCanvas(KAII_SIZE, KAII_SIZE);
  const draw = kaiiDraw[key];
  if (draw) draw(pc, seeded(key.length * 991));
  else {
    pc.circle(32, 32, 20, '#ff00ff');
    pc.outline(OUT);
  }
  return pc;
}

export const kaiiSpriteKeys = (): string[] => Object.keys(kaiiDraw);

/** フィールド上の「気配」（怪異のシンボル）：3フレーム */
export function buildWispSheet(): PixelCanvas {
  const pc = new PixelCanvas(32 * 3, 32);
  for (let f = 0; f < 3; f++) {
    const ox = f * 32;
    const rnd = seeded(77 + f);
    pc.ellipse(ox + 16, 18 + (f === 1 ? -1 : 0), 8, 10, '#0c0812', 220);
    pc.poly([[ox + 8, 22], [ox + 24, 22], [ox + 20 + f, 31], [ox + 12 - f, 31]], '#0c0812', 200);
    for (let k = 0; k < 10; k++) pc.set(ox + 8 + Math.floor(rnd() * 16), 10 + Math.floor(rnd() * 20), '#1e1428');
    pc.rect(ox + 12, 15 + (f === 1 ? -1 : 0), 2, 2, '#ff3040');
    pc.rect(ox + 18, 15 + (f === 1 ? -1 : 0), 2, 2, '#ff3040');
    pc.outline('#3a1838', { x: ox, y: 0, w: 32, h: 32 });
  }
  return pc;
}

/** 歪みの印（主人公だけが視える） */
export function buildDistortionSprite(): PixelCanvas {
  const pc = new PixelCanvas(32, 32);
  for (let a = 0; a < Math.PI * 4; a += 0.08) {
    const r = 2 + a * 1.1;
    const x = 16 + Math.cos(a) * r;
    const y = 16 + Math.sin(a) * r * 0.8;
    pc.set(Math.round(x), Math.round(y), a > 9 ? '#c040ff' : '#ff4080', 220);
  }
  return pc;
}

export { shadeHex };
