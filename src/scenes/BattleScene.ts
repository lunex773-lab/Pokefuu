import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import type { GameContext } from '@/core/GameContext';
import type { GameSession } from '@/core/GameSession';
import { BattleEngine, resonanceSucceeds, type BattleEvent, type BattleHost, type Combatant, type KaiiAction, type PlayerAction } from '@/domain/battle/BattleEngine';
import { computeRewards } from '@/domain/battle/Rewards';
import { effectivenessLabel } from '@/domain/battle/TypeChart';
import { gainExp, healFull, MAX_EN } from '@/domain/creature/Kaii';
import type { KaiiData } from '@/domain/state/GameState';
import type { InputAction, InputConsumer } from '@/input/InputManager';
import { itemIconKey, TEX } from '@/render/TextureFactory';
import { DistortPipeline } from '@/render/fx/DistortPipeline';
import { DialogueBox, wrapText } from '@/ui/Dialogue';
import { showResonance } from '@/ui/Resonance';
import { textStyle, Theme } from '@/ui/Theme';
import { drawPanel, Gauge, label, ListView, type ListItem } from '@/ui/Widgets';

export interface BattleRequest {
  enemies: KaiiData[];
  canFlee: boolean;
  boss: boolean;
  encounterId: string;
  forceResonance?: boolean;
  resolve: (r: 'win' | 'lose' | 'flee') => void;
}

const STAT_NAME: Record<string, string> = { atk: '攻撃', def: '守り', spd: '素早さ', mnd: '精神' };
const ENEMY_X = [560, 960, 1360];
const ENEMY_Y = 330;

interface EnemyView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  plate: Phaser.GameObjects.Container;
  hp: Gauge;
  status: Phaser.GameObjects.Text;
}

interface AllyCard {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  hp: Gauge;
  en: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
}

/**
 * 戦闘シーン（3体編成・ターン制）。
 * ロジックは BattleEngine に任せ、ここは入力と演出だけを担当する。
 */
export class BattleScene extends Phaser.Scene implements InputConsumer {
  private ctx!: GameContext;
  private req!: BattleRequest;
  private engine!: BattleEngine;
  private enemyViews = new Map<string, EnemyView>();
  private cards: AllyCard[] = [];
  private msgText!: Phaser.GameObjects.Text;
  private cmdTitle!: Phaser.GameObjects.Text;
  private cmdSub!: Phaser.GameObjects.Text;
  private list!: ListView;
  private dialogue!: DialogueBox;
  private skipWait?: () => void;
  private targetPick?: (id: string | null) => void;
  private fx?: DistortPipeline;

  constructor() {
    super('Battle');
  }

  private get s(): GameSession {
    return this.ctx.session;
  }

  create(req: BattleRequest): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.req = req;
    this.enemyViews.clear();
    this.cards = [];
    const s = this.s;
    const host: BattleHost = {
      hasItem: (id) => s.inventory.has(id),
      consumeItem: (id) => s.inventory.remove(id, 1),
      get sanity() {
        return s.state.player.sanity;
      },
      addSanity: (d) => s.player.addSanity(d),
      get resonancePower() {
        return s.player.resonancePower;
      },
      get sanityDrainMul() {
        return s.player.sanityDrainMul;
      },
    };
    this.engine = new BattleEngine(this.ctx.reg, this.ctx.rng, host, { party: s.party.party, enemies: req.enemies, canFlee: req.canFlee, boss: req.boss });
    for (const e of req.enemies) s.party.markSeen(e.speciesId);
    this.ctx.bus.emit('battle:start', { encounterId: req.encounterId, boss: req.boss });

    const back = this.s.state.player.position.mapId.startsWith('back');
    this.add.image(960, 540, back ? TEX.backdropBack : TEX.backdropReality).setDisplaySize(1920, 1080);
    if (this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline(DistortPipeline);
      this.fx = this.cameras.main.getPostPipeline(DistortPipeline) as DistortPipeline;
      this.fx.amount = back ? 0.25 : 0.05;
    }
    this.buildEnemies();
    this.buildAllies();
    this.buildPanels();
    this.dialogue = new DialogueBox(this, this.ctx.input, (id) => this.ctx.audio.sfx(id));
    this.dialogue.setDepth(9100);
    this.ctx.input.push(this);
    this.events.once('shutdown', () => this.ctx.input.remove(this));
    this.ctx.audio.setMusic(req.boss ? 'boss' : 'battle');
    this.cameras.main.fadeIn(350, 0, 0, 0);
    void this.run();
  }

  // ------------------------------------------------------------ 表示構築

  private buildEnemies(): void {
    this.engine.enemies.forEach((c, i) => {
      if (!c) return;
      const sp = this.ctx.reg.species(c.kaii.speciesId);
      const scale = sp.boss ? 5.5 : GameConfig.battleSpriteScale;
      const y = sp.boss ? ENEMY_Y + 25 : ENEMY_Y;
      const shadow = this.add.ellipse(ENEMY_X[i], y + 32 * scale - 10, 60 * scale, 10 * scale, 0x000000, 0.4);
      shadow.setDepth(1);
      const sprite = this.add.image(ENEMY_X[i], y, sp.sprite).setScale(scale).setDepth(2);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerup', () => this.targetPick?.(c.id));
      this.tweens.add({ targets: sprite, y: y - 8, yoyo: true, repeat: -1, duration: 1200 + i * 200, ease: 'Sine.inOut' });
      const plate = this.add.container(ENEMY_X[i] - 170, 60).setDepth(3);
      const g = this.add.graphics();
      drawPanel(g, 0, 0, 340, 110, { alpha: 0.75, radius: 14 });
      const nm = label(this, 18, 10, `${sp.name}  Lv${c.kaii.level}`, Theme.size.s);
      const hp = new Gauge(this, 18, 62, 304, 22, 0xe07090);
      hp.set(c.kaii.hp / this.engine.maxHp(c), false);
      const st = label(this, 322, 10, '', Theme.size.xs, Theme.color.accentSoft).setOrigin(1, 0);
      const types = label(this, 18, 86, sp.types.map((t) => this.ctx.reg.types.get(t)?.name).join('・'), 18, Theme.color.dim);
      plate.add([g, nm, hp, st, types]);
      this.enemyViews.set(c.id, { sprite, shadow, plate, hp, status: st });
    });
  }

  private buildAllies(): void {
    for (let i = 0; i < 3; i++) {
      const box = this.add.container(30 + i * 445, 800).setDepth(5);
      const bg = this.add.graphics();
      const icon = this.add.image(84, 130, TEX.wisp, 'f0').setScale(2);
      const name = label(this, 170, 22, '', Theme.size.s);
      const hp = new Gauge(this, 170, 82, 240, 24, 0x70d090);
      const hpText = label(this, 410, 112, '', Theme.size.xs, Theme.color.dim).setOrigin(1, 0);
      const en = this.add.graphics();
      const status = label(this, 170, 200, '', Theme.size.xs, Theme.color.accentSoft);
      box.add([bg, icon, name, hp, hpText, en, status]);
      this.cards.push({ box, bg, icon, name, hpText, hp, en, status });
    }
    this.refreshAllies();
  }

  private buildPanels(): void {
    const g = this.add.graphics().setDepth(4);
    drawPanel(g, 30, 610, 1320, 170, { alpha: 0.85 });
    this.msgText = this.add.text(64, 640, '', textStyle(Theme.size.m)).setDepth(5);
    const cg = this.add.graphics().setDepth(4);
    drawPanel(cg, 1380, 520, 510, 540, { alpha: 0.9, border: Theme.color.borderHi });
    this.cmdTitle = label(this, 1410, 540, '', Theme.size.s, Theme.color.accentSoft).setDepth(5);
    this.cmdSub = label(this, 1410, 584, '', Theme.size.xs, Theme.color.dim).setDepth(5);
    this.list = new ListView(this, 1400, 630, 470, 82, 5, (id) => this.ctx.audio.sfx(id));
    this.list.setDepth(6);
    const zone = this.add.zone(0, 0, 1380, 1080).setOrigin(0).setInteractive().setDepth(0);
    zone.on('pointerup', () => this.skipWait?.());
  }

  private refreshAllies(): void {
    const reg = this.ctx.reg;
    this.engine.allies.forEach((c, i) => {
      const card = this.cards[i];
      card.bg.clear();
      if (!c) {
        drawPanel(card.bg, 0, 0, 430, 250, { alpha: 0.5 });
        card.name.setText('―');
        card.icon.setVisible(false);
        card.hp.setVisible(false);
        card.hpText.setText('');
        card.en.clear();
        card.status.setText('');
        return;
      }
      const sp = reg.species(c.kaii.speciesId);
      const max = this.engine.maxHp(c);
      drawPanel(card.bg, 0, 0, 430, 250, { alpha: c.out ? 0.4 : 0.85, border: c.out ? 0x444050 : Theme.color.border });
      card.icon.setTexture(sp.sprite).setScale(2).setVisible(true).setAlpha(c.out ? 0.35 : 1);
      card.name.setText(`${c.kaii.nickname ?? sp.name} Lv${c.kaii.level}`);
      card.hp.setVisible(true);
      card.hp.set(c.kaii.hp / max);
      card.hpText.setText(`HP ${c.kaii.hp}/${max}`);
      card.en.clear();
      for (let k = 0; k < MAX_EN; k++) {
        card.en.fillStyle(k < c.kaii.en ? 0x80b0ff : 0x30304a, 1);
        card.en.fillRect(170 + k * 24, 160, 18, 12);
      }
      const st = c.kaii.status ? reg.status(c.kaii.status.id).name : c.out ? '消耗' : '';
      card.status.setText(st);
    });
  }

  private highlightCard(i: number | null): void {
    this.cards.forEach((card, k) => {
      const c = this.engine.allies[k];
      if (!c) return;
      if (k === i) {
        card.bg.clear();
        drawPanel(card.bg, 0, 0, 430, 250, { alpha: 0.95, border: Theme.color.borderHi, lineWidth: 5 });
      }
    });
    if (i === null) this.refreshAllies();
  }

  // ------------------------------------------------------------ 入力

  onAction(a: InputAction): boolean {
    if ((a === 'confirm' || a === 'cancel') && this.skipWait) {
      this.skipWait();
      return true;
    }
    return true; // 戦闘中はワールドへ入力を流さない
  }

  private msg(text: string, hold = 900): Promise<void> {
    this.msgText.setText(wrapText(text, Theme.size.m, 1240));
    const ms = hold / this.ctx.settings.textSpeed;
    return new Promise((res) => {
      const t = this.time.delayedCall(ms, () => done());
      const done = () => {
        t.remove(false);
        this.skipWait = undefined;
        res();
      };
      this.skipWait = done;
    });
  }

  private pick(title: string, sub: string, items: ListItem[], cancellable = true): Promise<number> {
    this.cmdTitle.setText(title);
    this.cmdSub.setText(sub);
    this.list.setItems(items);
    this.list.setVisible(true);
    this.ctx.input.push(this.list);
    return new Promise((res) => {
      this.list.onConfirm = (_it, i) => {
        this.ctx.input.remove(this.list);
        res(i);
      };
      this.list.onCancel = cancellable
        ? () => {
            this.ctx.input.remove(this.list);
            res(-1);
          }
        : undefined;
    });
  }

  /** 敵（または味方）を選ぶ。スプライトのタップにも対応 */
  private async pickTarget(side: 'enemy' | 'ally', title: string): Promise<string | null> {
    const cands = this.engine.active(side);
    if (cands.length === 1) return cands[0].id;
    const items: ListItem[] = cands.map((c) => ({ text: this.engine.name(c).replace('敵の', ''), right: `HP ${c.kaii.hp}/${this.engine.maxHp(c)}`, data: c.id }));
    items.push({ text: '戻る', color: Theme.color.dim });
    const tapPromise = new Promise<string | null>((res) => (this.targetPick = (id) => cands.some((c) => c.id === id) && res(id)));
    const listPromise = this.pick(title, side === 'enemy' ? '対象を選ぶ（敵をタップでも可）' : '対象を選ぶ', items).then((i) => (i < 0 || i >= cands.length ? null : cands[i].id));
    const id = await Promise.race([tapPromise, listPromise]);
    this.targetPick = undefined;
    this.ctx.input.remove(this.list);
    return id;
  }

  // ------------------------------------------------------------ 進行

  private async run(): Promise<void> {
    const reg = this.ctx.reg;
    const names = this.engine.active('enemy').map((c) => reg.species(c.kaii.speciesId).name);
    await this.msg(this.req.boss ? `${names.join('と')}が立ちはだかった！` : `${names.join('と')}が現れた！`, 1200);
    while (!this.engine.result) {
      const input = await this.collectInput();
      this.list.setVisible(false);
      this.cmdTitle.setText('');
      this.cmdSub.setText('');
      const events = this.engine.runTurn(input);
      await this.play(events);
      this.refreshAllies();
    }
    await this.finish();
  }

  private async collectInput(): Promise<{ player: PlayerAction; allies: Record<string, KaiiAction> }> {
    const reg = this.ctx.reg;
    const actors = this.engine.active('ally');
    const allies: Record<string, KaiiAction> = {};
    let i = 0;
    while (i < actors.length) {
      const c = actors[i];
      this.highlightCard(this.engine.allies.indexOf(c));
      const name = c.kaii.nickname ?? reg.species(c.kaii.speciesId).name;
      const opts: ListItem[] = [{ text: '技' }, { text: '防御' }];
      const canSwap = this.engine.reserves.some((k) => k.hp > 0);
      opts.push({ text: '交代', disabled: !canSwap });
      opts.push({ text: 'おまかせ（残り全員）', color: Theme.color.dim });
      if (i > 0) opts.push({ text: '戻る', color: Theme.color.dim });
      const sel = await this.pick(`${name} の行動`, `EN ${c.kaii.en}/${MAX_EN}`, opts, i > 0);
      if (sel === -1 || opts[sel]?.text === '戻る') {
        i = Math.max(0, i - 1);
        continue;
      }
      if (sel === 3) {
        for (let k = i; k < actors.length; k++) allies[actors[k].id] = this.engine.aiAction(actors[k]);
        break;
      }
      if (sel === 1) {
        allies[c.id] = { kind: 'defend' };
        i++;
        continue;
      }
      if (sel === 2) {
        const res = this.engine.reserves.filter((k) => k.hp > 0);
        const items = res.map((k) => ({ text: `${k.nickname ?? reg.species(k.speciesId).name} Lv${k.level}`, right: `HP ${k.hp}` }));
        const r = await this.pick('交代する怪異', '', [...items, { text: '戻る', color: Theme.color.dim }]);
        if (r < 0 || r >= res.length) continue;
        allies[c.id] = { kind: 'swap', withUid: res[r].uid };
        i++;
        continue;
      }
      // 技
      const skills = c.kaii.skills.map((id) => reg.skill(id));
      const items: ListItem[] = skills.map((sk) => {
        const t = sk.type === 'none' ? '無' : reg.types.get(sk.type)?.name ?? '';
        return { text: sk.name, sub: `${t}・威力${sk.power || '-'}・${sk.description}`, right: `EN${sk.cost}`, disabled: !this.engine.canUse(c, sk.id) };
      });
      items.push({ text: '戻る', color: Theme.color.dim });
      const si = await this.pick(`${name} の技`, '', items);
      if (si < 0 || si >= skills.length) continue;
      const sk = skills[si];
      let target: string | undefined;
      if (sk.target === 'enemy') {
        const t = await this.pickTarget('enemy', `${sk.name} の対象`);
        if (!t) continue;
        target = t;
      } else if (sk.target === 'ally') {
        const t = await this.pickTarget('ally', `${sk.name} の対象`);
        if (!t) continue;
        target = t;
      }
      allies[c.id] = { kind: 'skill', skill: sk.id, target };
      i++;
    }
    this.highlightCard(null);
    const player = await this.collectPlayerAction();
    return { player, allies };
  }

  private async collectPlayerAction(): Promise<PlayerAction> {
    const s = this.s;
    const reg = this.ctx.reg;
    for (;;) {
      const seals = s.inventory.list((id) => reg.item(id).category === 'seal');
      const usable = s.inventory.list((id) => !!reg.item(id).use?.usableInBattle);
      const sub = `正気度 ${s.state.player.sanity}/${s.player.maxSanity}`;
      const opts: ListItem[] = [
        { text: '封印', sub: '御札で弱った怪異を封じる', disabled: seals.length === 0 },
        { text: 'どうぐ', disabled: usable.length === 0 },
        { text: '励ます', sub: '味方全員のEN+2' },
        { text: '逃げる', disabled: !this.req.canFlee },
      ];
      const sel = await this.pick(`主人公（${s.state.player.name}）の行動`, sub, opts, false);
      if (sel === 2) return { kind: 'encourage' };
      if (sel === 3) return { kind: 'flee' };
      if (sel === 0) {
        const items = seals.map((it) => ({ text: reg.item(it.id).name, right: `×${it.qty}`, icon: itemIconKey(reg.item(it.id).icon) }));
        const si = await this.pick('使う御札', '', [...items, { text: '戻る', color: Theme.color.dim }]);
        if (si < 0 || si >= seals.length) continue;
        const target = await this.pickTarget('enemy', '封印する怪異');
        if (!target) continue;
        const c = this.engine.get(target)!;
        const p = Math.round(this.engine.sealChance(c, seals[si].id) * 100);
        await this.msg(`封印の成功率：およそ ${p}%`, 500);
        return { kind: 'seal', target, item: seals[si].id };
      }
      if (sel === 1) {
        const items = usable.map((it) => ({ text: reg.item(it.id).name, right: `×${it.qty}`, sub: reg.item(it.id).description, icon: itemIconKey(reg.item(it.id).icon) }));
        const ii = await this.pick('どうぐ', '', [...items, { text: '戻る', color: Theme.color.dim }]);
        if (ii < 0 || ii >= usable.length) continue;
        const def = reg.item(usable[ii].id);
        if (def.use?.target === 'player') return { kind: 'item', item: def.id };
        // 控え（消耗中も含む）にも使えるよう、手持ち全体から選ぶ
        const all = s.party.party;
        const tItems = all.map((k) => ({ text: `${k.nickname ?? reg.species(k.speciesId).name}`, right: `HP ${k.hp}` }));
        const ti = await this.pick(`${def.name} を誰に？`, '', [...tItems, { text: '戻る', color: Theme.color.dim }]);
        if (ti < 0 || ti >= all.length) continue;
        const onField = this.engine.all().find((c) => c.side === 'ally' && !c.out && c.kaii === all[ti]);
        return { kind: 'item', item: def.id, target: onField?.id ?? all[ti].uid };
      }
    }
  }

  // ------------------------------------------------------------ 演出

  private viewFor(id: string): { enemy?: EnemyView; card?: AllyCard; c?: Combatant } {
    const c = this.engine.get(id);
    if (!c) return {};
    if (c.side === 'enemy') return { enemy: this.enemyViews.get(id), c };
    return { card: this.cards[c.slot], c };
  }

  private floatNumber(id: string, text: string, color: string): void {
    const v = this.viewFor(id);
    const x = v.enemy ? v.enemy.sprite.x : v.card ? v.card.box.x + 215 : 960;
    const y = v.enemy ? v.enemy.sprite.y - 60 : v.card ? v.card.box.y : 540;
    const t = this.add.text(x, y, text, textStyle(Theme.size.l, color, { stroke: '#000000', strokeThickness: 8 })).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private shakeTarget(id: string): void {
    const v = this.viewFor(id);
    const target = v.enemy?.sprite ?? v.card?.box;
    if (!target) return;
    const x = target.x;
    this.tweens.add({ targets: target, x: x + 14, yoyo: true, repeat: 3, duration: 45, onComplete: () => target.setX(x) });
    if (v.enemy) {
      v.enemy.sprite.setTintFill(0xffffff);
      this.time.delayedCall(90, () => v.enemy?.sprite.clearTint());
    }
  }

  private async play(events: BattleEvent[]): Promise<void> {
    const reg = this.ctx.reg;
    const nm = (id: string) => {
      const c = this.engine.get(id);
      return c ? this.engine.name(c) : '';
    };
    for (const e of events) {
      switch (e.t) {
        case 'message':
          await this.msg(e.text);
          break;
        case 'use': {
          const v = this.viewFor(e.actor);
          if (v.enemy) this.tweens.add({ targets: v.enemy.sprite, scale: v.enemy.sprite.scale * 1.08, yoyo: true, duration: 120 });
          if (v.card) this.tweens.add({ targets: v.card.box, y: 780, yoyo: true, duration: 120 });
          await this.msg(`${nm(e.actor)}の${e.skillName}！`, 650);
          break;
        }
        case 'damage': {
          this.ctx.audio.sfx(e.crit ? 'crit' : 'hit');
          this.shakeTarget(e.target);
          if (this.ctx.settings.screenShake && (e.crit || e.eff > 1)) this.cameras.main.shake(180, 0.006);
          this.floatNumber(e.target, `${e.amount}`, e.eff > 1 ? '#ffb040' : '#ffffff');
          const v = this.viewFor(e.target);
          v.enemy?.hp.set(e.hp / e.maxHp);
          this.refreshAllies();
          const eff = effectivenessLabel(e.eff);
          if (e.crit) await this.msg('急所に響いた！', 600);
          if (eff) await this.msg(eff, 650);
          else await this.wait(250);
          break;
        }
        case 'miss':
          this.ctx.audio.sfx('miss');
          await this.msg('しかし、外れた！', 600);
          break;
        case 'heal': {
          this.ctx.audio.sfx('heal');
          this.floatNumber(e.target, `+${e.amount}`, '#80e0a0');
          this.viewFor(e.target).enemy?.hp.set(e.hp / e.maxHp);
          this.refreshAllies();
          await this.msg(`${nm(e.target)}のHPが回復した。`, 600);
          break;
        }
        case 'status': {
          this.ctx.audio.sfx('status');
          const st = reg.status(e.status);
          const v = this.viewFor(e.target);
          v.enemy?.status.setText(st.name);
          this.refreshAllies();
          await this.msg(`${nm(e.target)}は${st.name}状態になった！`);
          break;
        }
        case 'statusEnd': {
          const v = this.viewFor(e.target);
          v.enemy?.status.setText('');
          this.refreshAllies();
          await this.msg(`${nm(e.target)}の${reg.status(e.status).name}が治まった。`, 700);
          break;
        }
        case 'buff': {
          if (e.stages === 0) {
            await this.msg(`${nm(e.target)}の${STAT_NAME[e.stat]}はもう変わらない。`, 600);
            break;
          }
          const up = e.stages > 0;
          this.ctx.audio.sfx(up ? 'heal' : 'status');
          await this.msg(`${nm(e.target)}の${STAT_NAME[e.stat]}が${up ? '上がった' : '下がった'}！`, 700);
          break;
        }
        case 'calm': {
          this.ctx.audio.sfx('calm');
          const v = this.viewFor(e.target);
          const c = this.engine.get(e.target)!;
          this.ctx.bus.emit('kaii:calmed', { speciesId: c.kaii.speciesId });
          if (v.enemy) {
            this.tweens.add({ targets: [v.enemy.sprite], alpha: 0, y: v.enemy.sprite.y - 60, duration: 900 });
            this.tweens.add({ targets: [v.enemy.plate, v.enemy.shadow], alpha: 0, duration: 600 });
          }
          await this.msg(`${nm(e.target)}は鎮まった……`, 1000);
          break;
        }
        case 'exhaust':
          this.ctx.audio.sfx('status');
          this.refreshAllies();
          await this.msg(`${nm(e.target)}は消耗してしまった……`, 900);
          break;
        case 'seal':
          await this.playSeal(e.target, e.success, e.shakes);
          break;
        case 'swap':
          this.refreshAllies();
          await this.wait(200);
          break;
        case 'flee':
          await this.msg(e.success ? 'うまく逃げ切れた！' : '逃げられなかった！', 800);
          break;
        case 'sanity':
          if (e.delta < 0) {
            this.ctx.audio.sfx('whisper');
            this.cameras.main.flash(250, 120, 0, 30);
            if (this.fx) this.fx.amount = Math.min(1.2, this.fx.amount + 0.4);
            this.time.delayedCall(600, () => this.fx && (this.fx.amount = Math.max(0.05, this.fx.amount - 0.4)));
            await this.msg(`主人公の正気度が ${-e.delta} 削られた…（残り ${e.value}）`, 900);
          } else await this.msg(`主人公の正気度が ${e.delta} 回復した。`, 700);
          break;
        case 'en':
          this.refreshAllies();
          break;
        case 'end':
          break;
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, r));
  }

  private async playSeal(targetId: string, success: boolean, shakes: number): Promise<void> {
    const v = this.viewFor(targetId);
    if (!v.enemy) return;
    const sprite = v.enemy.sprite;
    const charm = this.add.rectangle(960, 1000, 26, 46, 0xf0e8d0).setStrokeStyle(3, 0xc02030).setDepth(40);
    this.ctx.audio.sfx('seal_try');
    await new Promise<void>((res) => this.tweens.add({ targets: charm, x: sprite.x, y: sprite.y, angle: 720, duration: 500, ease: 'Cubic.out', onComplete: () => res() }));
    const baseScale = sprite.scale;
    this.tweens.add({ targets: sprite, scale: baseScale * 0.4, alpha: 0.4, duration: 300 });
    for (let k = 0; k < Math.max(1, shakes); k++) {
      await this.wait(350);
      this.tweens.add({ targets: charm, angle: charm.angle + 25, yoyo: true, duration: 120 });
      this.ctx.audio.sfx('select');
    }
    await this.wait(300);
    if (success) {
      this.ctx.audio.sfx('seal_ok');
      const glow = this.add.image(sprite.x, sprite.y, TEX.light).setTint(0xffd080).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setDepth(41);
      this.tweens.add({ targets: glow, scale: 3, alpha: 0, duration: 700, onComplete: () => glow.destroy() });
      this.tweens.add({ targets: [charm, sprite], alpha: 0, duration: 500 });
      this.tweens.add({ targets: [v.enemy.plate, v.enemy.shadow], alpha: 0, duration: 400 });
      const c = this.engine.get(targetId)!;
      await this.msg(`${this.ctx.reg.species(c.kaii.speciesId).name}を封印した！`, 1100);
    } else {
      this.ctx.audio.sfx('seal_fail');
      this.tweens.add({ targets: sprite, scale: baseScale, alpha: 1, duration: 200 });
      this.tweens.add({ targets: charm, alpha: 0, scale: 2, duration: 300, onComplete: () => charm.destroy() });
      await this.msg('封印が破られた！', 900);
    }
  }

  // ------------------------------------------------------------ 決着

  private async finish(): Promise<void> {
    const outcome = this.engine.outcome();
    const s = this.s;
    const reg = this.ctx.reg;
    this.list.setVisible(false);
    if (outcome.result === 'win') {
      this.ctx.audio.setMusic(null);
      await this.msg('すべての怪異が静かになった。', 1000);
      const rewards = computeRewards(reg, outcome, s.party.party, this.ctx.rng);
      const total = Math.max(0, ...Object.values(rewards.exp));
      if (total > 0) await this.msg(`怪異たちは経験値を ${total} 得た。`, 900);
      for (const k of s.party.party) {
        const amount = rewards.exp[k.uid];
        if (!amount) continue;
        const lv = gainExp(reg, k, amount);
        const name = k.nickname ?? reg.species(k.speciesId).name;
        if (lv.levels.length) {
          this.ctx.audio.sfx('levelup');
          this.ctx.bus.emit('kaii:levelup', { uid: k.uid, level: k.level });
          this.refreshAllies();
          await this.msg(`${name}のレベルが ${k.level} に上がった！`, 1000);
        }
        for (const sk of lv.newSkills) {
          this.ctx.bus.emit('kaii:learned', { uid: k.uid, skillId: sk });
          const equipped = k.skills.includes(sk);
          await this.msg(`${name}は「${reg.skill(sk).name}」を覚えた！${equipped ? '' : '（控えに入った。メニューの怪異画面で入れ替えられる）'}`, 1300);
        }
      }
      if (rewards.playerExp > 0) {
        s.player.gainExp(rewards.playerExp);
        await this.msg(`主人公の経験値 +${rewards.playerExp}`, 700);
      }
      for (const d of rewards.drops) {
        s.inventory.add(d.item, d.qty);
        this.ctx.audio.sfx('item');
        await this.msg(`${reg.item(d.item).name}を ${d.qty} 個手に入れた。`, 800);
      }
      const candidates = [...outcome.sealed];
      if (this.req.forceResonance) candidates.push(...outcome.calmed.filter((k) => reg.species(k.speciesId).boss));
      for (const k of candidates) await this.resonate(k);
    }
    this.ctx.bus.emit('battle:end', { result: outcome.result, boss: this.req.boss, encounterId: this.req.encounterId });
    // 戦闘後は気力を全快、状態異常は残す
    for (const k of s.party.party) k.en = MAX_EN;
    this.ctx.audio.setMusic(null);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    await this.wait(420);
    const resolve = this.req.resolve;
    this.scene.stop();
    resolve(outcome.result);
  }

  private async resonate(k: KaiiData): Promise<void> {
    const reg = this.ctx.reg;
    const s = this.s;
    const sp = reg.species(k.speciesId);
    await this.msg(`${sp.name}の声が聞こえる……`, 900);
    const i = await showResonance(this, this.ctx.input, (id) => this.ctx.audio.sfx(id), sp.sprite, sp.name, sp.resonance.prompt, sp.resonance.options.map((o) => o.text));
    const opt = sp.resonance.options[i];
    await this.dialogue.show(sp.name, opt.reply);
    this.dialogue.close();
    if (resonanceSucceeds(opt.value, s.player.resonancePower, this.ctx.rng)) {
      healFull(reg, k);
      k.bond = opt.value * 10;
      const where = s.party.recruit(k);
      this.ctx.audio.sfx('resonance');
      s.player.gainExp(10);
      await this.msg(`${sp.name}と共鳴した！ 仲間になった！${where === 'storage' ? '（手持ちがいっぱいのため保管へ）' : ''}`, 1500);
    } else {
      this.ctx.audio.sfx('calm');
      s.inventory.add('memory_dust', 1);
      await this.msg(`共鳴できなかった……。${sp.name}は静かに消えていった。（記憶の残滓を手に入れた）`, 1600);
    }
  }
}
