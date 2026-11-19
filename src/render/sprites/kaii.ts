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
  // ---------------------------------------------------------------- Chapter 2
  kaii_gojinochaimu: (pc) => {
    // 防災無線のスピーカーを頭にした子ども
    pc.rect(30, 22, 4, 26, '#7a7a82');
    pc.poly([[18, 6], [46, 6], [40, 22], [24, 22]], '#c8c8d0');
    pc.poly([[21, 8], [43, 8], [38, 19], [26, 19]], '#2a2a34');
    for (let r = 2; r < 9; r += 3) pc.ellipse(32, 13, r + 2, r * 0.6 + 1, '#4a4a58');
    pc.rect(28, 23, 8, 2, '#ff8a3a');
    pc.poly([[24, 30], [40, 30], [42, 48], [22, 48]], '#e07a3a');
    pc.rect(24, 48, 6, 12, '#3a3a48');
    pc.rect(34, 48, 6, 12, '#3a3a48');
    pc.rect(16, 32, 8, 4, '#e07a3a');
    pc.rect(40, 32, 8, 4, '#e07a3a');
    // 音の輪
    for (const r of [24, 28]) for (let a = -0.6; a < 0.6; a += 0.05) pc.set(32 + Math.cos(a - Math.PI / 2) * r, 14 + Math.sin(a - Math.PI / 2) * r * 0.5, '#ffb070', 140);
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_kairanban: (pc) => {
    // 目だらけの回覧板と、垂れ下がる紐
    pc.rect(14, 8, 36, 46, '#8a6a3a');
    pc.rect(16, 12, 32, 40, '#f0ead8');
    pc.rect(26, 4, 12, 8, '#5a5a62');
    for (let y = 16; y < 50; y += 6) pc.hline(19, 44, y, '#c8c0b0');
    for (const [x, y] of [[22, 20], [36, 24], [26, 34], [40, 40], [20, 44], [33, 46]] as [number, number][]) {
      pc.ellipse(x, y, 3, 2, '#ffffff');
      pc.rect(x, y - 1, 2, 2, '#2a1010');
    }
    for (const x of [18, 30, 44]) pc.line(x, 54, x - 3, 63, '#c02030');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_nozokimado: (pc) => {
    // 窓に押しつけられた白い顔
    pc.rect(8, 6, 48, 52, '#d8ccb4');
    pc.rect(12, 10, 40, 44, '#2a3448');
    pc.vline(32, 10, 53, '#d8ccb4');
    pc.hline(12, 51, 30, '#d8ccb4');
    pc.ellipse(32, 32, 13, 15, '#e8e4ea');
    pc.ellipse(26, 30, 3, 2, '#0a0a10');
    pc.ellipse(38, 30, 3, 2, '#0a0a10');
    pc.set(27, 30, '#50ff70');
    pc.set(39, 30, '#50ff70');
    pc.ellipse(32, 40, 4, 2, '#5a3a4a');
    for (const x of [18, 46]) pc.rect(x - 3, 40, 6, 10, '#e8e4ea');
    pc.line(14, 48, 22, 34, '#ffffff', 90);
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_utsushimi: (pc) => {
    // 鏡のようにつるりとした人型。顔だけが空白
    pc.ellipse(32, 14, 9, 10, '#a8b8d0');
    pc.poly([[22, 24], [42, 24], [46, 50], [18, 50]], '#8898b8');
    pc.rect(20, 50, 8, 12, '#7888a8');
    pc.rect(36, 50, 8, 12, '#7888a8');
    pc.rect(12, 26, 10, 4, '#8898b8');
    pc.rect(42, 26, 10, 4, '#8898b8');
    pc.line(24, 10, 30, 30, '#e8f4ff');
    pc.line(36, 28, 40, 46, '#e8f4ff', 160);
    pc.ellipse(32, 15, 6, 6, '#f8fcff');
    pc.hline(28, 36, 15, '#6a7a98');
    pc.outline('#2a3050');
    pc.rimShade();
  },
  kaii_hanaichimonme: (pc) => {
    // 手をつないで輪になった紙人形。一人だけ輪の外
    const cols = ['#f0e8d8', '#f0d8d8', '#e8e8f0', '#e0f0e0'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = 28 + Math.cos(a) * 16;
      const y = 30 + Math.sin(a) * 10;
      pc.circle(x, y - 8, 3.5, cols[i % 4]);
      pc.poly([[x - 4, y - 4], [x + 4, y - 4], [x + 5, y + 6], [x - 5, y + 6]], cols[i % 4]);
      pc.set(x - 1, y - 9, '#2a1a1a');
      pc.set(x + 1, y - 9, '#2a1a1a');
    }
    pc.ellipse(28, 30, 16, 10, '#c02030', 0);
    for (let a = 0; a < Math.PI * 2; a += 0.12) pc.set(28 + Math.cos(a) * 16, 30 + Math.sin(a) * 10 - 2, '#c02030');
    pc.circle(54, 46, 3.5, '#d8d0c8');
    pc.poly([[50, 50], [58, 50], [59, 60], [49, 60]], '#d8d0c8');
    pc.hline(52, 56, 45, '#2a1a1a');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_kaminarioyaji: (pc) => {
    // 雷雲の顔をした怒鳴る老人
    pc.ellipse(32, 22, 24, 15, '#4a4a5a');
    pc.ellipse(20, 18, 12, 9, '#5a5a6a');
    pc.ellipse(44, 18, 12, 9, '#5a5a6a');
    pc.ellipse(32, 12, 12, 8, '#6a6a7a');
    pc.rect(22, 18, 7, 3, '#ffe040');
    pc.rect(36, 18, 7, 3, '#ffe040');
    pc.line(20, 15, 29, 18, '#1a1a22');
    pc.line(45, 15, 36, 18, '#1a1a22');
    pc.ellipse(32, 28, 7, 4, '#1a0a0a');
    pc.rect(28, 26, 8, 2, '#f0f0e8');
    pc.poly([[18, 34], [26, 34], [20, 48], [28, 46], [16, 62], [20, 50], [12, 52]], '#ffe040');
    pc.poly([[42, 34], [50, 36], [46, 46], [52, 46], [40, 60], [44, 50], [38, 50]], '#ffd020');
    pc.outline('#2a2a38');
    pc.rimShade();
  },
  kaii_harigamineko: (pc) => {
    // 「さがしています」の張り紙。描かれた猫が痩せている
    pc.rect(12, 4, 40, 56, '#f4f0e4');
    pc.rect(12, 4, 40, 8, '#d84a3a');
    pc.hline(18, 46, 8, '#ffffff');
    pc.ellipse(32, 30, 11, 9, '#3a3a3a');
    pc.poly([[23, 23], [26, 16], [29, 23]], '#3a3a3a');
    pc.poly([[35, 23], [38, 16], [41, 23]], '#3a3a3a');
    pc.rect(27, 28, 3, 2, '#e8c040');
    pc.rect(35, 28, 3, 2, '#e8c040');
    pc.line(22, 38, 18, 50, '#3a3a3a');
    pc.line(42, 38, 46, 50, '#3a3a3a');
    for (let y = 46; y < 56; y += 3) pc.hline(18, 46, y, '#a8a090');
    pc.circle(14, 6, 2, '#c02030');
    pc.circle(50, 6, 2, '#c02030');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_akiyanonushi: (pc) => {
    // 空き家そのもの。窓が目、玄関が口
    pc.poly([[6, 28], [32, 6], [58, 28]], '#4a3a4a');
    pc.rect(10, 28, 44, 32, '#6a6070');
    pc.rect(14, 34, 12, 10, '#0a0810');
    pc.rect(38, 34, 12, 10, '#0a0810');
    pc.rect(18, 37, 3, 3, '#ffd060');
    pc.rect(42, 37, 3, 3, '#ffd060');
    pc.rect(27, 46, 10, 14, '#0a0810');
    for (let x = 28; x < 37; x += 2) pc.vline(x, 46, 49, '#d8d0c0');
    pc.line(12, 30, 20, 58, '#3a3040');
    pc.line(50, 32, 44, 52, '#3a3040');
    pc.outline(OUT);
    pc.rimShade();
  },
  kaii_akaikureyon: (pc, rnd) => {
    // 塞がれた扉と、そこから伸びる小さな手。赤いクレヨンの落書き
    pc.rect(12, 4, 40, 58, '#8a6a4a');
    pc.rect(15, 7, 34, 55, '#6a4a2a');
    for (const [y, t] of [[14, 3], [30, -3], [46, 2]] as [number, number][]) pc.poly([[8, y], [56, y + t], [56, y + t + 6], [8, y + 6]], '#a07a4a');
    for (let k = 0; k < 14; k++) {
      let x = 14 + Math.floor(rnd() * 36);
      let y = 6 + Math.floor(rnd() * 52);
      for (let i = 0; i < 12; i++) {
        pc.set(x, y, '#e01818');
        x += Math.floor(rnd() * 3) - 1;
        y += Math.floor(rnd() * 3) - 1;
      }
    }
    for (const [x, y] of [[20, 22], [40, 38], [28, 54]] as [number, number][]) {
      pc.rect(x, y, 6, 4, '#f0e0d8');
      for (let f = 0; f < 3; f++) pc.rect(x + f * 2, y - 3, 1, 3, '#f0e0d8');
    }
    pc.ellipse(32, 36, 5, 7, '#0a0408');
    pc.circle(32, 35, 2, '#ff2030');
    pc.outline('#4a0a10');
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
