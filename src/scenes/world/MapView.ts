import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import type { DataRegistry } from '@/data/DataRegistry';
import type { Condition, MapDef, TileDef } from '@/domain/types';
import { TEX } from '@/render/TextureFactory';
import type { TileAtlas } from '@/render/sprites/tiles';

const T = GameConfig.tileSize;
type LayerName = 'ground' | 'objects' | 'above';

export interface TileLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  power?: boolean;
  flicker?: boolean;
  /** 窓：ガラス面が光る */
  window?: boolean;
}

/** タイル位置から決まる 0〜99 の値（どの窓に明かりが灯るかを毎回同じにする） */
const tileHash = (x: number, y: number): number => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;

/**
 * マップの描画と当たり判定。
 * MapDef（文字列グリッド）→ Phaser Tilemap に変換し、条件付きタイル上書きにも対応する。
 */
export class MapView {
  readonly widthPx: number;
  readonly heightPx: number;
  private tilemap: Phaser.Tilemaps.Tilemap;
  private layers: Record<LayerName, Phaser.Tilemaps.TilemapLayer>;
  private grids: Record<LayerName, string[][]>;
  private solid: boolean[][] = [];
  private waterCells: { x: number; y: number }[] = [];
  private waterFrame = 0;
  private waterTimer = 0;
  readonly back: boolean;

  constructor(
    scene: Phaser.Scene,
    readonly def: MapDef,
    private readonly reg: DataRegistry,
    private readonly atlas: TileAtlas,
    check: (c: Condition | undefined) => boolean,
  ) {
    this.back = def.palette === 'back';
    const h = def.ground.length;
    const w = def.ground[0].length;
    this.widthPx = w * T;
    this.heightPx = h * T;
    this.grids = {
      ground: def.ground.map((r) => [...r]),
      objects: def.objects.map((r) => [...r]),
      above: (def.above ?? def.ground.map((r) => ' '.repeat(r.length))).map((r) => [...r]),
    };
    this.applyOverrides(check);
    this.tilemap = scene.make.tilemap({ tileWidth: T, tileHeight: T, width: w, height: h });
    const tileset = this.tilemap.addTilesetImage(TEX.tiles, TEX.tiles, T, T, 0, 0)!;
    const mk = (name: LayerName, depth: number) => this.tilemap.createBlankLayer(name, tileset)!.setDepth(depth);
    this.layers = { ground: mk('ground', 0), objects: mk('objects', 2), above: mk('above', 9000) };
    this.redraw();
  }

  get cols(): number {
    return this.grids.ground[0].length;
  }
  get rows(): number {
    return this.grids.ground.length;
  }

  private tileFor(ch: string): TileDef | undefined {
    const id = this.def.legend?.[ch];
    if (id) return this.reg.tiles.get(id);
    return this.reg.tilesByChar.get(ch);
  }

  private indexFor(ch: string): number {
    if (ch === ' ') return -1;
    const def = this.tileFor(ch);
    if (!def) return -1;
    const idx = this.atlas.index.get(def.id)!;
    return this.back ? idx.back : idx.normal;
  }

  private applyOverrides(check: (c: Condition | undefined) => boolean): boolean {
    let changed = false;
    for (const o of this.def.overrides ?? []) {
      if (!check(o.when)) continue;
      const g = this.grids[o.layer];
      if (g[o.y]?.[o.x] !== undefined && g[o.y][o.x] !== o.char) {
        g[o.y][o.x] = o.char;
        changed = true;
      }
    }
    return changed;
  }

  /** フラグ変化後に条件付きタイルを再評価する */
  refresh(check: (c: Condition | undefined) => boolean): void {
    if (this.applyOverrides(check)) this.redraw();
  }

  private redraw(): void {
    this.solid = [];
    this.waterCells = [];
    for (const name of ['ground', 'objects', 'above'] as LayerName[]) {
      const data = this.grids[name].map((row) => row.map((ch) => this.indexFor(ch)));
      this.layers[name].putTilesAt(data, 0, 0, false);
    }
    for (let y = 0; y < this.rows; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.cols; x++) {
        const g = this.tileFor(this.grids.ground[y][x]);
        const o = this.tileFor(this.grids.objects[y][x]);
        row.push(!!(g?.solid || o?.solid));
        if (g?.water) this.waterCells.push({ x, y });
      }
      this.solid.push(row);
    }
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    return this.solid[ty][tx];
  }

  /** 矩形（ワールド座標）がタイルの壁と重なるか */
  hitsWall(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / T);
    const y0 = Math.floor(y / T);
    const x1 = Math.floor((x + w - 0.01) / T);
    const y1 = Math.floor((y + h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }

  tileAt(layer: LayerName, tx: number, ty: number): TileDef | undefined {
    const ch = this.grids[layer][ty]?.[tx];
    return ch === undefined ? undefined : this.tileFor(ch);
  }

  isWater(tx: number, ty: number): boolean {
    return !!this.tileAt('ground', tx, ty)?.water;
  }

  /** 地図画面用：そのマスの種類 */
  cellKind(tx: number, ty: number): 'floor' | 'wall' | 'water' | 'stairs' {
    if (this.isWater(tx, ty)) return 'water';
    if (this.isSolidTile(tx, ty)) return 'wall';
    return this.tileAt('ground', tx, ty)?.id === 'stairs' ? 'stairs' : 'floor';
  }

  /** (tx, ty) が歩けなければ、いちばん近い歩けるマスを返す（古いセーブの位置が壁になった場合など） */
  nearestWalkable(tx: number, ty: number): { x: number; y: number } {
    const sx = Math.max(0, Math.min(this.cols - 1, tx));
    const sy = Math.max(0, Math.min(this.rows - 1, ty));
    if (!this.isSolidTile(sx, sy)) return { x: sx, y: sy };
    const seen = new Set<number>([sy * this.cols + sx]);
    const q: [number, number][] = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const k = ny * this.cols + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!this.isSolidTile(nx, ny)) return { x: nx, y: ny };
        q.push([nx, ny]);
      }
    }
    return { x: sx, y: sy };
  }

  get water(): { x: number; y: number }[] {
    return this.waterCells;
  }

  /** 光源タイル（街灯・窓・自販機など） */
  tileLights(): TileLight[] {
    const out: TileLight[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tileAt('objects', x, y);
        if (!t?.light) continue;
        if (t.light.window) {
          // 屋内の窓：夜は外から月明かりが差すだけ（電気とは無関係）
          if (this.def.indoor) {
            out.push({ x: (x + 0.5) * T, y: (y + 0.47) * T, radius: 18, color: '#a8bce8', window: true });
            continue;
          }
          // 屋外の窓：すべての家に明かりがついているわけではない。夜の学校はほとんど真っ暗
          const litShare = t.id === 'window_school' ? 12 : 65;
          if (tileHash(x, y) >= litShare) continue;
          out.push({ x: (x + 0.5) * T, y: (y + 0.47) * T, ...t.light });
          continue;
        }
        const yOff = t.gen === 'lamp' ? 0.2 : 0.5;
        out.push({ x: (x + 0.5) * T, y: (y + yOff) * T, ...t.light });
      }
    }
    return out;
  }

  /** 影を落とすタイル（高さ付き） */
  casters(): { x: number; y: number; h: number }[] {
    const out: { x: number; y: number; h: number }[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tileAt('objects', x, y);
        if (t?.height) out.push({ x, y, h: t.height });
      }
    }
    return out;
  }

  /** 足音の種類 */
  stepKind(px: number, py: number): string {
    const t = this.tileAt('ground', Math.floor(px / T), Math.floor(py / T));
    return t?.step ?? 'hard';
  }

  /** 歩ける位置をランダムに選ぶ */
  randomWalkable(rnd: () => number, avoid: { x: number; y: number }, minDist: number): { x: number; y: number } | null {
    for (let k = 0; k < 60; k++) {
      const tx = Math.floor(rnd() * this.cols);
      const ty = Math.floor(rnd() * this.rows);
      if (this.isSolidTile(tx, ty)) continue;
      const px = (tx + 0.5) * T;
      const py = (ty + 0.5) * T;
      if (Math.hypot(px - avoid.x, py - avoid.y) < minDist) continue;
      return { x: px, y: py };
    }
    return null;
  }

  update(dt: number): void {
    if (this.waterCells.length === 0) return;
    this.waterTimer += dt;
    if (this.waterTimer < 420) return;
    this.waterTimer = 0;
    this.waterFrame = (this.waterFrame + 1) % this.atlas.waterFrames.normal.length;
    const idx = (this.back ? this.atlas.waterFrames.back : this.atlas.waterFrames.normal)[this.waterFrame];
    for (const c of this.waterCells) this.layers.ground.putTileAt(idx, c.x, c.y);
  }

  destroy(): void {
    this.tilemap.destroy();
  }
}
