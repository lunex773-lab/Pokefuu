import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import type { GameContext } from '@/core/GameContext';
import type { GameSession } from '@/core/GameSession';
import { weightedPick, randInt } from '@/core/Rng';
import { ScriptRunner } from '@/domain/script/ScriptRunner';
import type { KaiiData } from '@/domain/state/GameState';
import type { Direction, EncounterEntry, MapDef, MapObject, MapWarp, TimePhase } from '@/domain/types';
import type { InputAction, InputConsumer } from '@/input/InputManager';
import { DistortPipeline } from '@/render/fx/DistortPipeline';
import { TEX } from '@/render/TextureFactory';
import { KaiiSymbol, Npc, Player, dirVector, toFacing4, type Blocker } from './world/Actors';
import { Lighting, SunShadows, WeatherFx } from './world/Lighting';
import { MapView } from './world/MapView';
import { registerScriptCommands } from './world/ScriptCommands';
import type { UIScene } from './UIScene';
import type { BattleRequest } from './BattleScene';

const T = GameConfig.tileSize;

export interface WorldStart {
  mapId: string;
  x: number;
  y: number;
  facing: Direction;
  /** none = 画面のフェード状態に触れない（ニューゲーム時の暗転開始など） */
  transition?: 'fade' | 'none';
}

/**
 * フィールド（探索）シーン。
 * マップ・人物・光・天候・イベント実行・エンカウントをまとめて管理する。
 */
export class WorldScene extends Phaser.Scene implements InputConsumer {
  ctx!: GameContext;
  ui!: UIScene;
  runner!: ScriptRunner;
  map?: MapView;
  mapDef?: MapDef;
  player!: Player;
  npcs = new Map<string, Npc>();
  private symbols: KaiiSymbol[] = [];
  private lighting?: Lighting;
  private shadows?: SunShadows;
  private weatherFx?: WeatherFx;
  private waterMask?: Phaser.Display.Masks.GeometryMask;
  private waterMaskGfx?: Phaser.GameObjects.Graphics;
  private markers: Phaser.GameObjects.Image[] = [];
  private fx?: DistortPipeline;
  private fxPulse = 0;
  private lowFpsMs = 0;
  private insideTriggers = new Set<string>();
  private sightCooldown = 0;
  private autosaveTimer = 0;
  private symbolRespawn = 0;
  private graceMs = 0;
  private sanityAcc = 0;
  private transitioning = false;
  private offs: (() => void)[] = [];
  busy = false;
  private hiddenNpcs = new Set<string>();

  constructor() {
    super('World');
  }

  get session(): GameSession {
    return this.ctx.session;
  }

  create(start: WorldStart): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.ui = this.scene.get('UI') as UIScene;
    this.cameras.main.setZoom(GameConfig.worldZoom).setRoundPixels(true).setBackgroundColor('#000000');
    this.applyQuality();
    this.runner = new ScriptRunner(
      (id) => this.ctx.reg.script(id),
      (c) => this.session.check(c),
    );
    registerScriptCommands(this.runner, this);
    this.ctx.input.push(this);
    const bus = this.ctx.bus;
    this.offs.push(
      bus.on('time:phase', ({ phase }) => this.onPhaseChanged(phase)),
      bus.on('weather:changed', () => this.applyEnvironment()),
      bus.on('flag:changed', () => this.refreshDynamic()),
      bus.on('equip:changed', () => this.applyEnvironment()),
    );
    this.events.once('shutdown', () => {
      this.offs.forEach((f) => f());
      this.ctx.input.remove(this);
      this.teardownMap();
    });
    this.events.on('resume', () => {
      this.ctx.input.clearHeld();
      this.ui.setHudVisible(true);
    });
    if (start.transition !== 'none') void this.ui.fade('black', 0);
    void this.enterMap(start.mapId, start.x, start.y, start.facing, start.transition ?? 'fade', true);
  }

  /** 画質設定：ポストエフェクトの有無を切り替える */
  applyQuality(): void {
    const want = this.renderer.type === Phaser.WEBGL && this.ctx.settings.quality !== 'low' && !this.registry.get('autoLowQuality');
    if (want && !this.fx) {
      this.cameras.main.setPostPipeline(DistortPipeline);
      this.fx = this.cameras.main.getPostPipeline(DistortPipeline) as DistortPipeline;
    } else if (!want && this.fx) {
      this.cameras.main.resetPostPipeline();
      this.fx = undefined;
    }
  }

  /** auto 設定時、FPSが落ち続けたら自動で軽量化する（スマホ60FPS維持のため） */
  private watchFps(dt: number): void {
    if (this.ctx.settings.quality !== 'auto' || !this.fx) return;
    const fps = this.game.loop.actualFps;
    this.lowFpsMs = fps < 45 ? this.lowFpsMs + dt : Math.max(0, this.lowFpsMs - dt);
    if (this.lowFpsMs > 4000) {
      this.registry.set('autoLowQuality', true);
      this.applyQuality();
      console.info('[World] FPS低下のため画面エフェクトを無効化しました');
    }
  }

  // ------------------------------------------------------------ マップ

  async enterMap(mapId: string, tx: number, ty: number, facing: Direction, transition: 'fade' | 'distort' | 'none' = 'fade', initial = false): Promise<void> {
    this.transitioning = true;
    const fades = transition !== 'none';
    if (transition === 'distort') {
      this.ctx.audio.sfx('distort');
      this.fxPulse = 1.2;
    }
    if (fades) await this.ui.fade('black', transition === 'distort' ? 500 : 260);
    const def = await this.ctx.reg.map(mapId);
    const prevLayer = this.mapDef?.layer;
    this.teardownMap();
    this.mapDef = def;
    this.buildMap(def, tx, ty, facing);
    const s = this.session;
    s.state.player.position = { mapId, x: tx, y: ty, facing };
    s.clock.setOverride(def.fixedPhase);
    if (prevLayer !== def.layer || (def.weather && !def.weather.includes(s.weather.current))) this.rollWeather();
    this.applyEnvironment(true);
    this.ui.location = def.name;
    this.ui.backLayer = def.layer === 'back';
    this.ui.danger = def.dangerLevel;
    this.ui.dangerName = this.ctx.reg.dangerLevel(def.dangerLevel).name;
    this.ui.refreshHud();
    this.ui.setHudVisible(true);
    this.ctx.bus.emit('map:enter', { mapId, layer: def.layer, dangerLevel: def.dangerLevel });
    const kind = def.layer === 'back' ? 'back' : def.indoor ? (def.ambience === 'school' ? 'school' : 'indoor') : 'town';
    this.ctx.audio.setAmbience({
      kind,
      back: def.layer === 'back',
      danger: def.dangerLevel,
      night: ['night', 'midnight'].includes(s.clock.phase),
      rain: s.weather.def().rain ?? 0,
    });
    if (fades) await this.ui.fade('clear', transition === 'distort' ? 700 : 260);
    this.transitioning = false;
    if (def.onEnter && this.ctx.reg.hasScript(def.onEnter)) await this.runScript(def.onEnter);
    if (!initial) void this.autosave();
  }

  private buildMap(def: MapDef, tx: number, ty: number, facing: Direction): void {
    const s = this.session;
    const atlas = this.ctx.tileAtlas!;
    this.map = new MapView(this, def, this.ctx.reg, atlas, s.check);
    const viewW = GameConfig.width / GameConfig.worldZoom;
    const viewH = GameConfig.height / GameConfig.worldZoom;
    // 水面反射用マスク
    if (this.map.water.length) {
      this.waterMaskGfx = this.make.graphics({}, false);
      this.waterMaskGfx.fillStyle(0xffffff);
      for (const c of this.map.water) this.waterMaskGfx.fillRect(c.x * T, c.y * T, T, T);
      this.waterMask = this.waterMaskGfx.createGeometryMask();
    }
    const spriteKey = s.state.player.gender === 'female' ? 'player_female' : 'player_male';
    this.player = new Player(this, spriteKey, (tx + 0.5) * T, (ty + 1) * T - 4, this.waterMask);
    this.player.face(toFacing4(facing));
    this.player.onStep = (x, y) => this.ctx.audio.sfx(`step_${this.map!.stepKind(x, y)}`, 0.8);
    this.spawnNpcs();
    this.shadows = new SunShadows(this);
    this.lighting = new Lighting(this, viewW, viewH);
    this.lighting.setLights([
      ...this.map.tileLights(),
      ...(def.lights ?? []).filter((l) => s.check(l.when)).map((l) => ({ ...l, x: (l.x + 0.5) * T, y: (l.y + 0.5) * T })),
    ]);
    this.weatherFx = new WeatherFx(this, viewW, viewH);
    this.refreshMarkers();
    const cam = this.cameras.main;
    const mw = this.map.widthPx;
    const mh = this.map.heightPx;
    cam.setBounds(mw < viewW ? -(viewW - mw) / 2 : 0, mh < viewH ? -(viewH - mh) / 2 : 0, Math.max(mw, viewW), Math.max(mh, viewH));
    cam.startFollow(this.player.sprite, true, 0.18, 0.18, 0, 12);
    cam.centerOn(this.player.x, this.player.y);
    this.insideTriggers.clear();
    // 到着地点にあるトリガーは発火させない
    for (const tr of def.triggers ?? []) if (this.pointIn(tr, this.player.x, this.player.y - 4)) this.insideTriggers.add(tr.id);
    for (const w of def.warps ?? []) if (this.pointIn(w, this.player.x, this.player.y - 4)) this.insideTriggers.add(`warp:${w.id}`);
    this.symbolRespawn = 1500;
    this.graceMs = 1500;
  }

  private teardownMap(): void {
    this.symbols.forEach((s) => s.destroy());
    this.symbols = [];
    this.npcs.forEach((n) => n.destroy());
    this.npcs.clear();
    this.hiddenNpcs.clear();
    this.markers.forEach((m) => m.destroy());
    this.markers = [];
    this.player?.destroy();
    this.lighting?.destroy();
    this.shadows?.destroy();
    this.weatherFx?.destroy();
    this.waterMask?.destroy();
    this.waterMaskGfx?.destroy();
    this.waterMask = undefined;
    this.waterMaskGfx = undefined;
    this.map?.destroy();
    this.map = undefined;
  }

  private spawnNpcs(): void {
    const s = this.session;
    for (const def of this.mapDef?.npcs ?? []) {
      const should = s.check(def.when) && !this.hiddenNpcs.has(def.id);
      const has = this.npcs.get(def.id);
      if (should && !has) this.npcs.set(def.id, new Npc(this, def, this.waterMask));
      else if (!should && has) {
        has.destroy();
        this.npcs.delete(def.id);
      }
    }
  }

  hideNpc(id: string): void {
    this.hiddenNpcs.add(id);
    const n = this.npcs.get(id);
    if (n) {
      n.destroy();
      this.npcs.delete(id);
    }
  }

  /** フラグ・時間帯の変化をマップへ反映 */
  refreshDynamic(): void {
    if (!this.map || !this.mapDef) return;
    this.map.refresh(this.session.check);
    this.spawnNpcs();
    this.refreshMarkers();
  }

  private isRevealed(item: MapObject | MapWarp): boolean {
    const flag = item.revealFlag ?? `revealed:${this.mapDef!.id}:${item.id}`;
    return this.session.flags.is(flag);
  }

  /** 発見済みの隠しオブジェクトに目印を出す */
  private refreshMarkers(): void {
    this.markers.forEach((m) => m.destroy());
    this.markers = [];
    if (!this.mapDef) return;
    const s = this.session;
    for (const o of this.mapDef.interactables ?? []) {
      if (!o.hidden || !this.isRevealed(o) || !s.check(o.when)) continue;
      const m = this.add.image((o.x + 0.5) * T, (o.y + 0.5) * T, TEX.distortion).setDepth(9600).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6);
      this.tweens.add({ targets: m, alpha: 0.3, angle: 360, duration: 2400, repeat: -1, yoyo: false });
      this.markers.push(m);
    }
    for (const w of this.mapDef.warps ?? []) {
      if (!w.hidden || !this.isRevealed(w)) continue;
      const m = this.add.image((w.x + 0.5) * T, (w.y + 0.5) * T, TEX.distortion).setDepth(9600).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: m, angle: -360, duration: 3000, repeat: -1 });
      this.markers.push(m);
    }
  }

  // ------------------------------------------------------------ 環境（光・天候・時間）

  private rollWeather(): void {
    const s = this.session;
    if (!this.mapDef) return;
    s.weather.roll(this.mapDef.layer, { state: s.state, phase: s.clock.phase }, this.mapDef.weather);
  }

  private onPhaseChanged(_phase: TimePhase): void {
    this.rollWeather();
    this.refreshDynamic();
    this.applyEnvironment();
    if (this.mapDef && !this.mapDef.indoor) {
      this.ctx.audio.setAmbience({
        kind: 'town',
        back: false,
        danger: 0,
        night: ['night', 'midnight'].includes(this.session.clock.phase),
        rain: this.session.weather.def().rain ?? 0,
      });
    }
  }

  applyEnvironment(immediate = false): void {
    if (!this.mapDef || !this.lighting) return;
    const s = this.session;
    const def = this.mapDef;
    const phase = this.ctx.reg.timePhase(s.clock.phase);
    const weather = s.weather.def();
    const back = def.layer === 'back';
    let darkness = phase.darkness + weather.darknessAdd + (def.ambientDarkness ?? 0);
    darkness = Math.max(0, Math.min(back ? 0.8 : 0.9, darkness));
    const tint = weather.tint ?? phase.tint;
    const tintAlpha = (weather.tint ? weather.tintAlpha ?? 0 : phase.tintAlpha) * (def.indoor && !back ? 0.5 : 1);
    this.lighting.setParams({ darkness, tint, tintAlpha, powerOut: !!weather.powerOut }, immediate);
    this.lighting.playerLight.radius = s.player.lightRadius;
    this.weatherFx?.set((weather.fog ?? 0) * (def.indoor && !back ? 0.3 : 1), def.indoor ? 0 : weather.rain ?? 0, back);
    const overcast = weather.rain || weather.fog ? 0.3 : 1;
    if (!def.indoor) this.shadows?.draw(this.map!.casters(), phase.shadowAngle, phase.shadowLength, phase.shadowAlpha * overcast, T);
    else this.shadows?.draw([], 0, 0, 0, T);
    this.ui.refreshHud();
  }

  // ------------------------------------------------------------ 毎フレーム

  update(_time: number, dt: number): void {
    if (!this.map || !this.player || this.transitioning) return;
    const s = this.session;
    const input = this.ctx.input;
    input.update();
    s.state.playTimeMs += dt;
    const frozen = this.busy || this.runner.running;
    if (!frozen) s.clock.update(dt);

    const blockers: Blocker[] = [...this.npcs.values()].map((n) => n.blocker());
    if (!frozen) this.player.move(dt, input.move.x, input.move.y, input.dash, this.map, blockers);
    else this.player.setAnim(false);
    this.player.sync();
    this.player.updateReflection(this.map, !!this.waterMask);
    for (const n of this.npcs.values()) {
      n.update(frozen ? 0 : dt, this.map, this.player);
      n.updateReflection(this.map, !!this.waterMask);
    }
    this.map.update(dt);

    const v = dirVector(this.player.facing);
    this.lighting!.playerLight.dirX = v.x;
    this.lighting!.playerLight.dirY = v.y;
    this.lighting!.update(dt, this.cameras.main, this.player);
    this.weatherFx!.update(dt, this.cameras.main);

    // 画面効果：危険度・正気度・演出パルス
    if (this.fx) {
      const danger = this.ctx.reg.dangerLevel(this.mapDef!.dangerLevel).distortion;
      const sanityRatio = s.state.player.sanity / s.player.maxSanity;
      const low = Math.max(0, 0.3 - sanityRatio) * 1.5;
      this.fxPulse = Math.max(0, this.fxPulse - dt / 900);
      this.fx.amount = danger + low + this.fxPulse;
      this.fx.vignette = 0.35 + (this.mapDef!.layer === 'back' ? 0.25 : 0) + low * 0.5;
      this.fx.grain = this.mapDef!.layer === 'back' ? 0.06 : 0.03;
    }

    this.watchFps(dt);
    if (this.sightCooldown > 0) {
      this.sightCooldown -= dt;
      this.ui.setSightCooldown(1 - Math.max(0, this.sightCooldown) / GameConfig.sight.cooldownMs);
    }
    if (frozen) return;

    this.updateSanity(dt);
    this.updateSymbols(dt);
    this.checkZones();
    this.autosaveTimer += dt;
    if (this.autosaveTimer > GameConfig.autosaveIntervalMs) {
      this.autosaveTimer = 0;
      void this.autosave();
    }
  }

  private updateSanity(dt: number): void {
    const s = this.session;
    const level = this.ctx.reg.dangerLevel(this.mapDef!.dangerLevel);
    if (level.sanityDrain <= 0) {
      this.ctx.audio.setHeartbeat(0);
      return;
    }
    this.sanityAcc += (level.sanityDrain * s.player.sanityDrainMul * dt) / 1000;
    if (this.sanityAcc >= 1) {
      const d = Math.floor(this.sanityAcc);
      this.sanityAcc -= d;
      s.player.addSanity(-d);
    }
    const ratio = s.state.player.sanity / s.player.maxSanity;
    this.ctx.audio.setHeartbeat(ratio < 0.3 ? 1 - ratio / 0.3 : 0);
    if (s.state.player.sanity <= 0) void this.faint();
  }

  private async faint(): Promise<void> {
    if (this.busy) return;
    this.ctx.audio.setHeartbeat(0);
    await this.runScript('on_defeat');
  }

  // ------------------------------------------------------------ 怪異シンボル

  private updateSymbols(dt: number): void {
    const def = this.mapDef!;
    const s = this.session;
    if (!def.encounters || def.layer !== 'back') return;
    const able = s.party.ableMembers().length > 0;
    const darkness = this.lighting!.darkness;
    const cfg = { aggro: GameConfig.symbols.aggroRadius, speed: GameConfig.symbols.speed, chase: GameConfig.symbols.chaseSpeed };
    this.graceMs = Math.max(0, this.graceMs - dt);
    for (const sym of this.symbols) {
      sym.update(dt, this.map!, this.player, cfg, darkness);
      if (able && this.graceMs <= 0 && sym.touches(this.player)) {
        void this.symbolBattle(sym);
        return;
      }
    }
    const mul = s.weather.def().encounterMul ?? 1;
    const max = able ? Math.round(def.encounters.maxSymbols * mul) : 0;
    this.symbolRespawn -= dt;
    if (this.symbols.length < max && this.symbolRespawn <= 0) {
      this.symbolRespawn = 6000 + Math.random() * 6000;
      const p = this.map!.randomWalkable(() => this.ctx.rng.next(), this.player, 7 * T);
      if (p) this.symbols.push(new KaiiSymbol(this, p.x, p.y));
    }
  }

  private async symbolBattle(sym: KaiiSymbol): Promise<void> {
    this.symbols = this.symbols.filter((x) => x !== sym);
    sym.destroy();
    const enemies = this.rollEncounter(this.mapDef!.encounters!.table);
    if (enemies.length === 0) return;
    const result = await this.startBattle({ enemies, canFlee: true, boss: false, encounterId: this.mapDef!.encounters!.table });
    this.graceMs = 2500;
    if (result === 'lose') await this.runScript('on_defeat');
  }

  rollEncounter(tableId: string): KaiiData[] {
    const s = this.session;
    const table = this.ctx.reg.encounters.get(tableId);
    if (!table) return [];
    const entries: EncounterEntry[] = [...table.entries];
    for (const ex of table.extra ?? []) if (s.check(ex.when)) entries.push(...ex.entries);
    const count = (weightedPick(this.ctx.rng, [1, 2, 3], (n) => table.groupWeights[n - 1]) ?? 1) as number;
    const bonus = s.weather.def().levelBonus ?? 0;
    const out: KaiiData[] = [];
    for (let i = 0; i < count; i++) {
      const e = weightedPick(this.ctx.rng, entries, (x) => x.weight);
      if (!e) continue;
      out.push(s.party.create(e.kaii, randInt(this.ctx.rng, e.min, e.max) + bonus));
    }
    return out;
  }

  // ------------------------------------------------------------ 戦闘

  startBattle(req: Omit<BattleRequest, 'resolve'>): Promise<'win' | 'lose' | 'flee'> {
    return new Promise((resolve) => {
      this.busy = true;
      this.ctx.audio.sfx('encounter');
      this.ui.closeDialogue();
      this.fxPulse = 1.5;
      this.cameras.main.shake(300, 0.004);
      this.time.delayedCall(450, () => {
        this.ui.setHudVisible(false);
        this.scene.pause();
        this.scene.launch('Battle', {
          ...req,
          resolve: (r: 'win' | 'lose' | 'flee') => {
            this.scene.resume();
            this.ui.setHudVisible(true);
            this.busy = false;
            this.applyEnvironment();
            this.refreshDynamic();
            this.ctx.audio.setMusic(null);
            void this.autosave();
            resolve(r);
          },
        } satisfies BattleRequest);
      });
    });
  }

  // ------------------------------------------------------------ 入力

  onAction(a: InputAction): boolean {
    if (!this.map || this.busy || this.runner.running || this.transitioning) return false;
    switch (a) {
      case 'confirm':
        this.ctx.audio.unlock();
        void this.interact();
        return true;
      case 'menu':
        this.openMenu();
        return true;
      case 'sight':
        this.useSight();
        return true;
      default:
        return false;
    }
  }

  openMenu(mode: 'full' | 'save' = 'full'): Promise<void> {
    return new Promise((res) => {
      this.busy = true;
      this.ui.setHudVisible(false);
      this.scene.pause();
      this.scene.launch('Menu', {
        mode,
        onClose: () => {
          this.scene.resume();
          this.busy = false;
          this.applyQuality();
          this.applyEnvironment();
          res();
        },
      });
    });
  }

  openShop(shopId: string): Promise<void> {
    return new Promise((res) => {
      this.busy = true;
      this.scene.pause();
      this.scene.launch('Shop', {
        shopId,
        onClose: () => {
          this.scene.resume();
          this.busy = false;
          res();
        },
      });
    });
  }

  private async interact(): Promise<void> {
    const def = this.mapDef!;
    const v = dirVector(this.player.facing);
    const fx = this.player.x + v.x * 22;
    const fy = this.player.y - 6 + v.y * 22;
    const tx = Math.floor(fx / T);
    const ty = Math.floor(fy / T);
    const s = this.session;
    for (const n of this.npcs.values()) {
      const t = n.tile;
      const near = Math.hypot(n.x - fx, n.y - 8 - fy) < 20;
      if ((t.x === tx && t.y === ty) || near) {
        if (!n.def.script) return;
        n.faceTowards(this.player.x, this.player.y);
        await this.runScript(n.def.script);
        n.face(toFacing4(n.def.facing ?? 'down'));
        return;
      }
    }
    for (const o of def.interactables ?? []) {
      if (o.x !== tx || o.y !== ty || !s.check(o.when)) continue;
      if (o.hidden && !this.isRevealed(o)) continue;
      await this.runScript(o.script);
      return;
    }
  }

  useSight(): void {
    if (this.sightCooldown > 0 || !this.mapDef) return;
    const cfg = GameConfig.sight;
    this.sightCooldown = cfg.cooldownMs;
    this.ctx.audio.sfx('sight');
    this.ctx.bus.emit('sight:used', { mapId: this.mapDef.id });
    this.fxPulse = Math.max(this.fxPulse, 0.6);
    const ring = this.add.circle(this.player.x, this.player.y - 8, 8, 0xa040ff, 0).setStrokeStyle(2, 0xc080ff, 0.9).setDepth(9600);
    this.tweens.add({ targets: ring, radius: cfg.radius, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
    const near = (x: number, y: number, r: number = cfg.radius) => Math.hypot((x + 0.5) * T - this.player.x, (y + 0.5) * T - this.player.y) < r;
    let found = false;
    const s = this.session;
    for (const o of this.mapDef.interactables ?? []) {
      if (o.hidden && s.check(o.when) && !this.isRevealed(o) && near(o.x, o.y)) {
        s.flags.set(o.revealFlag ?? `revealed:${this.mapDef.id}:${o.id}`);
        found = true;
      }
    }
    for (const w of this.mapDef.warps ?? []) {
      if (w.hidden && !this.isRevealed(w) && near(w.x, w.y)) {
        s.flags.set(w.revealFlag ?? `revealed:${this.mapDef.id}:${w.id}`);
        found = true;
      }
    }
    for (const d of this.mapDef.distortions ?? []) {
      if (!near(d.x, d.y, cfg.radius * 1.6)) continue;
      const m = this.add.image((d.x + 0.5) * T, (d.y + 0.5) * T, TEX.distortion).setDepth(9600).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.tweens.add({ targets: m, alpha: 1, angle: 540, duration: cfg.durationMs / 2, yoyo: true, onComplete: () => m.destroy() });
    }
    for (const sym of this.symbols) sym.highlighted = cfg.durationMs;
    if (found) {
      this.ctx.audio.sfx('resonance');
      this.ui.toast('歪みの奥に、何かが視えた', '#d0a0ff');
      this.refreshDynamic();
    }
  }

  // ------------------------------------------------------------ トリガー・ワープ

  private pointIn(r: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
    return px >= r.x * T && px < (r.x + r.w) * T && py >= r.y * T && py < (r.y + r.h) * T;
  }

  private checkZones(): void {
    const def = this.mapDef!;
    const s = this.session;
    const px = this.player.x;
    const py = this.player.y - 4;
    for (const w of def.warps ?? []) {
      const key = `warp:${w.id}`;
      const inside = this.pointIn(w, px, py);
      if (!inside) {
        this.insideTriggers.delete(key);
        continue;
      }
      if (this.insideTriggers.has(key)) continue;
      this.insideTriggers.add(key);
      if (w.hidden && !this.isRevealed(w)) continue;
      if (!s.check(w.when)) {
        if (w.blockedScript) void this.runScript(w.blockedScript).then(() => this.pushBack());
        continue;
      }
      this.ctx.audio.sfx('door');
      void this.enterMap(w.to, w.tx, w.ty, w.facing ?? this.player.facing, w.transition ?? 'fade');
      return;
    }
    for (const tr of def.triggers ?? []) {
      const inside = this.pointIn(tr, px, py);
      if (!inside) {
        this.insideTriggers.delete(tr.id);
        continue;
      }
      if (this.insideTriggers.has(tr.id)) continue;
      this.insideTriggers.add(tr.id);
      const onceFlag = `trig:${def.id}:${tr.id}`;
      if (tr.once !== false && s.flags.is(onceFlag)) continue;
      if (!s.check(tr.when)) continue;
      if (tr.once !== false) s.flags.set(onceFlag);
      void this.runScript(tr.script);
      return;
    }
  }

  private pushBack(): void {
    const v = dirVector(this.player.facing);
    this.player.y -= v.y * 10;
    this.player.x -= v.x * 10;
    this.player.sync();
  }

  // ------------------------------------------------------------ スクリプト

  async runScript(id: string): Promise<void> {
    if (!this.ctx.reg.hasScript(id)) {
      console.warn(`[World] missing script ${id}`);
      return;
    }
    this.player.setAnim(false);
    this.ctx.input.clearHeld();
    try {
      await this.runner.runCommands(this.ctx.reg.script(id).commands);
    } catch (e) {
      console.error(`[World] script error in ${id}`, e);
    } finally {
      this.ui.closeDialogue();
    }
  }

  async autosave(): Promise<void> {
    if (!this.ctx.hasSession || !this.mapDef) return;
    const p = this.player;
    const s = this.session;
    s.state.player.position = { mapId: this.mapDef.id, x: Math.floor(p.x / T), y: Math.floor((p.y - 4) / T), facing: p.facing };
    try {
      await this.ctx.save.save('auto', s.state, this.mapDef.name);
      this.ctx.bus.emit('save:completed', { slot: 'auto', auto: true });
    } catch (e) {
      console.warn('[World] autosave failed', e);
    }
  }

  /** 正確なタイル座標を記録してから手動セーブ */
  syncPosition(): void {
    if (!this.mapDef) return;
    this.session.state.player.position = {
      mapId: this.mapDef.id,
      x: Math.floor(this.player.x / T),
      y: Math.floor((this.player.y - 4) / T),
      facing: this.player.facing,
    };
  }

  pulseFx(amount: number): void {
    this.fxPulse = Math.max(this.fxPulse, amount);
  }
}
