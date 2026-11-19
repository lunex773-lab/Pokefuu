import Phaser from 'phaser';
import { GameConfig } from '@/config/GameConfig';
import { UI } from '@/config/Screen';
import type { GameContext } from '@/core/GameContext';
import type { GameSession } from '@/core/GameSession';
import { expToNext, kaiiStats, MAX_EN, playerExpToNext, swapSkill } from '@/domain/creature/Kaii';
import type { KaiiData } from '@/domain/state/GameState';
import { itemIconKey } from '@/render/TextureFactory';
import { formatText } from '@/domain/script/format';
import { wrapText } from '@/ui/Dialogue';
import { Theme } from '@/ui/Theme';
import { drawPanel, label, ListView, type ListItem } from '@/ui/Widgets';
import { showKaiiInfo } from '@/ui/KaiiInfo';
import { showAreaMap } from '@/ui/AreaMap';
import type { WorldScene } from './WorldScene';

interface MenuData {
  mode: 'full' | 'save';
  onClose: () => void;
}

const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分`;
};

/**
 * メニュー（怪異・アイテム・クラフト・装備・図鑑・実績・主人公・セーブ・設定）。
 * 左のタブ → 中央のリスト → 右の詳細、という3段構成。
 */
export class MenuScene extends Phaser.Scene {
  private ctx!: GameContext;
  private data_!: MenuData;
  private tabs!: ListView;
  private main!: ListView;
  private sub!: ListView;
  private subBg!: Phaser.GameObjects.Graphics;
  private subBlock!: Phaser.GameObjects.Zone;
  /** ポップアップ表示中だけ設定される（外側タップ・戻るで呼ぶ） */
  private subCancel?: () => void;
  private title!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private detailImg!: Phaser.GameObjects.Image;
  private money!: Phaser.GameObjects.Text;
  /** 画面幅に合わせた3列レイアウト */
  private lay = { tabsX: 30, mainX: 450, mainW: 760, detailX: 1230, detailW: 660, bottom: 1050 };

  constructor() {
    super('Menu');
  }

  private get s(): GameSession {
    return this.ctx.session;
  }

  create(data: MenuData): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    this.data_ = data;
    const sfx = (id: string) => this.ctx.audio.sfx(id);
    const detailW = 660;
    const detailX = UI.R - detailW;
    const tabsX = UI.L;
    const mainX = tabsX + 420;
    this.lay = { tabsX, mainX, mainW: detailX - 20 - mainX, detailX, detailW, bottom: UI.B };
    const L = this.lay;
    const panelH = L.bottom - 30;
    this.add.rectangle(0, 0, UI.W, UI.H, 0x05040a, 0.88).setOrigin(0);
    const g = this.add.graphics();
    drawPanel(g, L.tabsX, 30, 400, panelH);
    drawPanel(g, L.mainX, 30, L.mainW, panelH);
    drawPanel(g, L.detailX, 30, L.detailW, panelH);
    this.title = label(this, L.mainX + 30, 50, '', Theme.size.m, Theme.color.accentSoft);
    this.money = label(this, L.mainX + L.mainW - 30, 58, '', Theme.size.s, Theme.color.gold).setOrigin(1, 0);
    this.detailImg = this.add.image(L.detailX + 330, 240, '__DEFAULT').setVisible(false);
    this.detail = label(this, L.detailX + 30, 60, '', Theme.size.s, Theme.color.text);
    this.main = new ListView(this, L.mainX + 20, 130, L.mainW - 40, 98, Math.floor((L.bottom - 150) / 98), sfx);
    // ポップアップ表示中は後ろを触れなくし、外側をタップしたら閉じる
    this.subBlock = this.add.zone(0, 0, UI.W, UI.H).setOrigin(0).setDepth(19).setInteractive();
    this.subBlock.disableInteractive();
    this.subBlock.on('pointerup', () => this.subCancel?.());
    this.subBg = this.add.graphics().setDepth(20);
    this.sub = new ListView(this, 0, 0, 560, 86, 7, sfx);
    this.sub.setDepth(21).setVisible(false);

    const tabs: { text: string; open: () => void }[] =
      data.mode === 'save'
        ? [{ text: 'セーブ', open: () => this.pageSave() }]
        : [
            { text: '怪異', open: () => this.pageParty() },
            { text: '地図', open: () => void this.openMap() },
            { text: 'アイテム', open: () => this.pageItems() },
            { text: 'クラフト', open: () => this.pageCraft() },
            { text: '装備', open: () => this.pageEquip() },
            { text: '図鑑', open: () => this.pageBook() },
            { text: '実績', open: () => this.pageAchievements() },
            { text: '主人公', open: () => this.pagePlayer() },
            { text: 'セーブ', open: () => this.pageSave() },
            { text: '設定', open: () => this.pageSettings() },
            { text: 'タイトルへ', open: () => this.toTitle() },
          ];
    tabs.push({ text: '閉じる', open: () => this.close() });
    // 「閉じる」まで全部のタブが必ず画面に収まる行の高さにする（iPhone はホームバーの分だけ縦が狭い）
    const tabRowH = Math.min(86, Math.floor((panelH - 50) / tabs.length));
    this.tabs = new ListView(this, L.tabsX + 20, 60, 360, tabRowH, tabs.length, sfx);
    this.tabs.setItems(tabs.map((t) => ({ text: t.text })));
    // 中央のリストを操作中でもタブはタップできる（タッチ操作ではキャンセルボタンが無いため）
    this.tabs.onInactiveTap = () => {
      if (this.subCancel) return false;
      this.activateTabs();
      return true;
    };
    this.tabs.onSelect = (_it, i) => {
      // カーソルを合わせただけで画面が切り替わらないもの（地図・タイトルへ）は、決定したときだけ開く
      if (i < tabs.length - 1 && !['タイトルへ', '地図'].includes(tabs[i].text)) tabs[i].open();
    };
    this.tabs.onConfirm = (_it, i) => {
      tabs[i].open();
      if (tabs[i].text === '地図') return;
      if (i < tabs.length - 1 && this.main.visible && this.mainHasItems()) this.focusMain();
    };
    this.tabs.onCancel = () => this.close();
    this.main.onCancel = () => this.focusTabs();
    this.ctx.input.push(this.tabs);
    this.events.once('shutdown', () => {
      this.ctx.input.remove(this.tabs);
      this.ctx.input.remove(this.main);
      this.ctx.input.remove(this.sub);
    });
    tabs[0].open();
    if (data.mode === 'save') this.focusMain();
  }

  private mainHasItems(): boolean {
    return !!this.main.selected;
  }

  private focusMain(): void {
    this.tabs.active = false;
    this.main.active = true;
    this.ctx.input.push(this.main);
  }

  /** タブを操作できる状態に戻す（セーブ専用モードでも閉じない） */
  private activateTabs(): void {
    this.ctx.input.remove(this.main);
    this.main.active = true;
    this.tabs.active = true;
  }

  private focusTabs(): void {
    this.ctx.input.remove(this.main);
    this.main.active = true;
    this.tabs.active = true;
    if (this.data_.mode === 'save') this.close();
  }

  private close(): void {
    this.ctx.audio.sfx('cancel');
    const cb = this.data_.onClose;
    this.scene.stop();
    cb();
  }

  private setDetail(text: string, img?: { key: string; scale: number }): void {
    this.detailImg.setVisible(!!img);
    if (img) {
      this.detailImg.setTexture(img.key).setScale(img.scale);
      this.detail.setPosition(this.lay.detailX + 30, 420);
    } else this.detail.setPosition(this.lay.detailX + 30, 60);
    this.detail.setText(wrapText(text, Theme.size.s, this.lay.detailW - 60));
  }

  private setMain(title: string, items: ListItem[], onConfirm?: (i: number) => void, onSelect?: (i: number) => void, keep = false): void {
    this.title.setText(title);
    this.money.setText(`所持金 ${this.s.inventory.money}円`);
    this.main.setItems(items, keep);
    this.main.onConfirm = onConfirm ? (_it, i) => onConfirm(i) : undefined;
    this.main.onSelect = onSelect ? (_it, i) => onSelect(i) : undefined;
    if (onSelect && items.length) onSelect(this.main.index);
    else if (!items.length) this.setDetail('');
  }

  /** 小さなポップアップ選択 */
  private popup(title: string, items: ListItem[]): Promise<number> {
    const x = this.lay.mainX + 190;
    const y = 300;
    const rows = Math.min(7, items.length);
    this.subBg.clear();
    drawPanel(this.subBg, x - 30, y - 90, 620, rows * 86 + 130, { alpha: 0.98, border: Theme.color.borderHi });
    const t = label(this, x, y - 70, title, Theme.size.s, Theme.color.accentSoft).setDepth(22);
    this.sub.setPosition(x, y).setVisible(true);
    this.sub.setItems(items);
    this.ctx.input.push(this.sub);
    this.subBlock.setInteractive();
    return new Promise((res) => {
      const done = (i: number) => {
        this.ctx.input.remove(this.sub);
        this.sub.setVisible(false);
        this.subBg.clear();
        this.subBlock.disableInteractive();
        this.subCancel = undefined;
        t.destroy();
        res(i);
      };
      this.sub.onConfirm = (_it, i) => done(i);
      this.sub.onCancel = () => done(-1);
      this.subCancel = () => {
        this.ctx.audio.sfx('cancel');
        done(-1);
      };
    });
  }

  private async confirm(q: string): Promise<boolean> {
    return (await this.popup(q, [{ text: 'はい' }, { text: 'いいえ' }])) === 0;
  }

  // ------------------------------------------------------------ 怪異

  private kaiiName(k: KaiiData): string {
    return k.nickname ?? this.ctx.reg.species(k.speciesId).name;
  }

  private pageParty(keep = false): void {
    const s = this.s;
    const reg = this.ctx.reg;
    const all: { k: KaiiData; stored: boolean }[] = [...s.party.party.map((k) => ({ k, stored: false })), ...s.party.storage.map((k) => ({ k, stored: true }))];
    const items: ListItem[] = all.map(({ k, stored }, i) => ({
      text: `${stored ? '［保管］' : i < GameConfig.party.maxActive ? '◆' : '◇'} ${this.kaiiName(k)}`,
      right: `Lv${k.level}  HP ${k.hp}/${kaiiStats(reg, k).hp}`,
      color: k.hp <= 0 ? Theme.color.bad : undefined,
    }));
    if (!items.length) {
      this.setMain('怪異', []);
      this.setDetail('まだ仲間の怪異がいない。');
      return;
    }
    this.setMain(
      '怪異（◆＝戦闘に出る3体）',
      items,
      (i) => void this.kaiiActions(all[i].k, all[i].stored),
      (i) => this.showKaii(all[i].k),
      keep,
    );
  }

  private showKaii(k: KaiiData): void {
    const reg = this.ctx.reg;
    const sp = reg.species(k.speciesId);
    const st = kaiiStats(reg, k);
    const types = sp.types.map((t) => reg.types.get(t)?.name).join('・');
    const skills = k.skills.map((id) => `・${reg.skill(id).name}（EN${reg.skill(id).cost}）`).join('\n');
    const learned = k.learned.length ? `\n控え：${k.learned.map((id) => reg.skill(id).name).join('、')}` : '';
    const charm = k.charm ? reg.item(k.charm).name : 'なし';
    const trait = reg.traitOf(k.speciesId);
    this.setDetail(
      `No.${String(sp.no).padStart(3, '0')} ${sp.name}［${types}］\nLv${k.level}  次まで ${expToNext(k.level) - k.exp}\n` +
        `HP ${k.hp}/${st.hp}  EN ${k.en}/${MAX_EN}\n攻撃${st.atk} 守り${st.def} 素早さ${st.spd} 精神${st.mnd}\n` +
        `御守り：${charm}  絆：${k.bond}\n特性：${trait?.name ?? 'なし'}\n\n技\n${skills}${learned}\n\n（決定→「くわしく見る」で技の効果）`,
      { key: sp.sprite, scale: 4 },
    );
  }

  private async kaiiActions(k: KaiiData, stored: boolean): Promise<void> {
    const s = this.s;
    const reg = this.ctx.reg;
    const opts = stored ? ['くわしく見る', '手持ちに加える', '戻る'] : ['くわしく見る', '先頭にする', '技を入れ替える', '御守りを持たせる', '保管に預ける', '戻る'];
    const i = await this.popup(this.kaiiName(k), opts.map((t) => ({ text: t })));
    const op = opts[i];
    if (op === 'くわしく見る') {
      // タイプ・相性・能力・特性・技の効果を1画面で
      await showKaiiInfo(this, reg, { kaii: k, known: true, input: this.ctx.input, sfx: (id) => this.ctx.audio.sfx(id) });
    } else if (op === '手持ちに加える') {
      if (!s.party.fromStorage(k.uid)) await this.popup('手持ちがいっぱいです', [{ text: 'OK' }]);
    } else if (op === '先頭にする') {
      s.party.move(s.party.party.indexOf(k), 0);
    } else if (op === '保管に預ける') {
      if (!s.party.toStorage(k.uid)) await this.popup('最後の1体は預けられない', [{ text: 'OK' }]);
    } else if (op === '技を入れ替える') {
      if (!k.learned.length) await this.popup('控えの技がない', [{ text: 'OK' }]);
      else {
        const li = await this.popup('覚えさせる技', k.learned.map((id) => ({ text: reg.skill(id).name, sub: reg.skill(id).description })));
        if (li >= 0) {
          const slots = [...k.skills.map((id) => ({ text: `${reg.skill(id).name} と入れ替え` }))];
          if (k.skills.length < 4) slots.push({ text: '空き枠に入れる' });
          const si = await this.popup('どの技と入れ替える？', slots);
          if (si >= 0) swapSkill(k, si, k.learned[li]);
        }
      }
    } else if (op === '御守りを持たせる') {
      const charms = s.inventory.list((id) => reg.item(id).equip?.slot === 'kaiiCharm');
      const items: ListItem[] = [{ text: '外す' }, ...charms.map((c) => ({ text: reg.item(c.id).name, sub: reg.item(c.id).description, right: `×${c.qty}` }))];
      const ci = await this.popup('御守り', items);
      if (ci === 0) s.party.equipCharm(k, undefined, s.inventory);
      else if (ci > 0 && !s.party.equipCharm(k, charms[ci - 1].id, s.inventory)) await this.popup('他の怪異が使っている', [{ text: 'OK' }]);
    }
    this.pageParty(true);
  }

  // ------------------------------------------------------------ アイテム

  private pageItems(keep = false): void {
    const s = this.s;
    const reg = this.ctx.reg;
    const cat: Record<string, string> = { consumable: '消耗品', seal: '御札', material: '素材', equipment: '装備', key: '大切なもの' };
    const list = s.inventory.list();
    this.setMain(
      'アイテム',
      list.map((it) => {
        const d = reg.item(it.id);
        return { text: d.name, right: `×${it.qty}`, icon: itemIconKey(d.icon), sub: cat[d.category] };
      }),
      (i) => void this.useItem(list[i].id),
      (i) => this.setDetail(`${reg.item(list[i].id).name}\n\n${reg.item(list[i].id).description}`),
      keep,
    );
    if (!list.length) this.setDetail('何も持っていない。');
  }

  private async useItem(id: string): Promise<void> {
    const s = this.s;
    const reg = this.ctx.reg;
    const def = reg.item(id);
    if (!def.use?.usableInField) return;
    if (def.use.target === 'player') {
      s.inventory.remove(id);
      if (def.use.sanity) s.player.addSanity(def.use.sanity);
      this.ctx.audio.sfx('heal');
      this.pageItems(true);
      return;
    }
    const party = s.party.party;
    if (!party.length) return;
    const ti = await this.popup(`${def.name} を誰に？`, party.map((k) => ({ text: this.kaiiName(k), right: `HP ${k.hp}/${kaiiStats(reg, k).hp}` })));
    if (ti < 0) return;
    const k = party[ti];
    const max = kaiiStats(reg, k).hp;
    const u = def.use;
    let used = false;
    if (u.revive && k.hp <= 0) {
      k.hp = Math.max(1, Math.floor(max * u.revive));
      used = true;
    }
    if (k.hp > 0 && (u.healHp || u.healRatio) && k.hp < max) {
      k.hp = Math.min(max, k.hp + (u.healHp ?? 0) + Math.floor(max * (u.healRatio ?? 0)));
      used = true;
    }
    if (u.cureStatus && k.status) {
      k.status = undefined;
      used = true;
    }
    if (u.en && k.en < MAX_EN) {
      k.en = Math.min(MAX_EN, k.en + u.en);
      used = true;
    }
    if (used) {
      s.inventory.remove(id);
      this.ctx.audio.sfx('heal');
    } else await this.popup('効果がない', [{ text: 'OK' }]);
    this.pageItems(true);
  }

  // ------------------------------------------------------------ クラフト

  private pageCraft(keep = false): void {
    const s = this.s;
    const reg = this.ctx.reg;
    const recipes = s.crafting.available({ state: s.state, phase: s.clock.phase });
    this.setMain(
      'クラフト',
      recipes.map((r) => ({ text: reg.item(r.result).name, right: s.crafting.canCraft(r) ? '作れる' : '', color: s.crafting.canCraft(r) ? Theme.color.good : Theme.color.dim, icon: itemIconKey(reg.item(r.result).icon) })),
      (i) => {
        if (s.crafting.craft(recipes[i].id)) {
          this.ctx.audio.sfx('item');
          this.pageCraft(true);
        } else this.ctx.audio.sfx('cancel');
      },
      (i) => {
        const r = recipes[i];
        const need = r.inputs.map((x) => `・${reg.item(x.item).name} ${s.inventory.count(x.item)}/${x.qty}`).join('\n');
        this.setDetail(`${reg.item(r.result).name} ×${r.qty}\n${reg.item(r.result).description}\n\n必要な素材\n${need}\n\n所持数：${s.inventory.count(r.result)}`);
      },
      keep,
    );
  }

  // ------------------------------------------------------------ 装備

  private pageEquip(): void {
    const s = this.s;
    const reg = this.ctx.reg;
    const eq = s.state.player.equipment;
    const slots: { slot: 'light' | 'charm'; name: string }[] = [
      { slot: 'light', name: 'ライト' },
      { slot: 'charm', name: 'お守り' },
    ];
    this.setMain(
      '主人公の装備',
      slots.map((sl) => ({ text: sl.name, right: eq[sl.slot] ? reg.item(eq[sl.slot]!).name : 'なし' })),
      (i) => void this.equipSlot(slots[i].slot),
      (i) => {
        const id = eq[slots[i].slot];
        this.setDetail(id ? `${reg.item(id).name}\n\n${reg.item(id).description}` : '何も装備していない。\n\n怪異の御守りは「怪異」画面から持たせられる。');
      },
    );
  }

  private async equipSlot(slot: 'light' | 'charm'): Promise<void> {
    const s = this.s;
    const reg = this.ctx.reg;
    const owned = s.inventory.list((id) => reg.item(id).equip?.slot === slot);
    const items: ListItem[] = [...(slot === 'charm' ? [{ text: '外す' }] : []), ...owned.map((o) => ({ text: reg.item(o.id).name, sub: reg.item(o.id).description }))];
    const i = await this.popup('装備を選ぶ', items);
    if (i < 0) return;
    if (slot === 'charm' && i === 0) s.player.equip('charm', undefined);
    else s.player.equip(slot, owned[slot === 'charm' ? i - 1 : i].id);
    this.ctx.audio.sfx('confirm');
    this.pageEquip();
  }

  // ------------------------------------------------------------ 図鑑

  private async pageBook(): Promise<void> {
    const s = this.s;
    const reg = this.ctx.reg;
    this.setMain(
      '図鑑',
      [{ text: '怪異図鑑' }, { text: '記憶片' }, { text: '用語辞典' }, { text: '章' }],
      (i) => {
        if (i === 0) {
          const list = [...reg.data.kaii].sort((a, b) => a.no - b.no);
          this.setMain(
            '怪異図鑑',
            list.map((sp) => {
              const e = s.state.compendium[sp.id];
              return { text: `No.${String(sp.no).padStart(3, '0')} ${e?.seen ? sp.name : '？？？'}`, right: e?.recruited ? '共鳴済' : e?.seen ? '発見' : '' };
            }),
            undefined,
            (k) => {
              const sp = list[k];
              const e = s.state.compendium[sp.id];
              if (!e?.seen) return this.setDetail('まだ出会っていない。');
              const types = sp.types.map((t) => reg.types.get(t)?.name).join('・');
              // 特性は共鳴して初めてわかる
              const trait = reg.traitOf(sp.id);
              const traitText = e.recruited && trait ? `\n\n【特性】${trait.name}：${trait.description}` : '\n\n【特性】？？？（共鳴すると分かる）';
              this.setDetail(`${sp.name}［${types}］\n\n${sp.description}\n\n【誕生】${sp.origin}\n\n【伝承】${sp.legend}${traitText}`, { key: sp.sprite, scale: 4 });
            },
          );
          this.main.onCancel = () => this.pageBookBack();
        } else if (i === 1) {
          const mems = reg.data.memories;
          this.setMain(
            '記憶片',
            mems.map((m) => ({ text: s.state.memories.includes(m.id) ? m.title : '？？？', sub: reg.data.chapters.find((c) => c.id === m.chapter)?.no })),
            undefined,
            (k) => this.setDetail(s.state.memories.includes(mems[k].id) ? `${mems[k].title}\n\n${formatText(mems[k].text, s.state)}` : 'まだ見つけていない記憶。'),
          );
          this.main.onCancel = () => this.pageBookBack();
        } else if (i === 2) {
          const gl = reg.data.glossary;
          this.setMain('用語辞典', gl.map((g) => ({ text: g.term, sub: g.reading })), undefined, (k) => this.setDetail(`${gl[k].term}\n\n${gl[k].text}`));
          this.main.onCancel = () => this.pageBookBack();
        } else {
          const ch = reg.data.chapters;
          this.setMain('章', ch.map((c) => ({ text: `${c.no}  ${c.title}`, right: c.status === 'implemented' ? '' : '制作中', color: c.status === 'implemented' ? undefined : Theme.color.dim })), undefined, (k) =>
            this.setDetail(`${ch[k].no}「${ch[k].title}」\n舞台：${ch[k].region}\n\n${ch[k].summary || '（制作中）'}`),
          );
          this.main.onCancel = () => this.pageBookBack();
        }
      },
      () => this.setDetail('怪異・記憶片・用語・章の記録。'),
    );
  }

  private pageBookBack(): void {
    void this.pageBook();
    this.main.onCancel = () => this.focusTabs();
  }

  // ------------------------------------------------------------ 実績・主人公

  private pageAchievements(): void {
    const s = this.s;
    const defs = this.ctx.reg.data.achievements;
    const got = (id: string) => s.state.achievements.includes(id);
    this.setMain(
      `実績 ${s.state.achievements.length}/${defs.length}`,
      defs.map((d) => ({ text: got(d.id) || !d.hidden ? d.name : '？？？', right: got(d.id) ? '★' : '', color: got(d.id) ? Theme.color.gold : Theme.color.dim })),
      undefined,
      (i) => this.setDetail(got(defs[i].id) || !defs[i].hidden ? `${defs[i].name}\n\n${defs[i].description}` : '隠し実績'),
    );
  }

  private pagePlayer(): void {
    const s = this.s;
    const p = s.state.player;
    const chapter = this.ctx.reg.data.chapters.find((c) => c.id === s.state.chapter);
    this.setMain('主人公', [{ text: p.name, right: `Lv${p.level}` }], undefined, () =>
      this.setDetail(
        `${p.name}（${p.gender === 'male' ? '男子' : '女子'}・高校生）\n\nLv${p.level}  次まで ${playerExpToNext(p.level) - p.exp}\n正気度 ${p.sanity}/${s.player.maxSanity}\n共鳴力 +${Math.round(s.player.resonancePower * 100)}%\n所持金 ${p.money}円\n\n${chapter?.no ?? ''} ${chapter?.title ?? ''}\nプレイ時間 ${fmtTime(s.state.playTimeMs)}\n記憶片 ${s.state.memories.length}/${this.ctx.reg.data.memories.length}`,
        { key: p.gender === 'male' ? 'player_male' : 'player_female', scale: 6 },
      ),
    );
  }

  // ------------------------------------------------------------ セーブ

  private async pageSave(): Promise<void> {
    const metas = await Promise.all(GameConfig.save.slots.map((slot) => this.ctx.save.meta(slot)));
    const items: ListItem[] = GameConfig.save.slots.map((slot, i) => {
      const m = metas[i];
      const name = slot === 'auto' ? 'オートセーブ' : `スロット${slot}`;
      return { text: name, sub: m ? `${m.location}  Lv${m.playerLevel}  ${fmtTime(m.playTimeMs)}` : '― 空き ―', disabled: slot === 'auto' };
    });
    this.setMain('セーブ', items, (i) => void this.doSave(GameConfig.save.slots[i]), (i) => this.setDetail(metas[i] ? `保存日時\n${new Date(metas[i]!.savedAt).toLocaleString('ja-JP')}` : 'このスロットに記録する。'));
  }

  private async doSave(slot: string): Promise<void> {
    if (slot === 'auto') return;
    const meta = await this.ctx.save.meta(slot);
    if (meta && !(await this.confirm('上書きしますか？'))) return;
    const world = this.scene.get('World') as WorldScene;
    world.syncPosition();
    try {
      await this.ctx.save.save(slot, this.s.state, world.mapDef?.name ?? '');
      this.ctx.audio.sfx('save');
      this.ctx.bus.emit('save:completed', { slot, auto: false });
      await this.popup('記録しました', [{ text: 'OK' }]);
    } catch {
      await this.popup('保存できませんでした（容量不足の可能性）', [{ text: 'OK' }]);
    }
    await this.pageSave();
  }

  // ------------------------------------------------------------ 設定

  private pageSettings(keep = false): void {
    const st = this.ctx.settings;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const rows: { text: string; right: string; act: () => void }[] = [
      { text: '全体音量', right: pct(st.master), act: () => (st.master = cycle(st.master)) },
      { text: '環境音', right: pct(st.ambience), act: () => (st.ambience = cycle(st.ambience)) },
      { text: '効果音', right: pct(st.sfx), act: () => (st.sfx = cycle(st.sfx)) },
      { text: '音楽', right: pct(st.music), act: () => (st.music = cycle(st.music)) },
      { text: '文字の速さ', right: st.textSpeed >= 2 ? '速い' : st.textSpeed >= 1 ? 'ふつう' : 'ゆっくり', act: () => (st.textSpeed = st.textSpeed >= 2 ? 0.6 : st.textSpeed >= 1 ? 2 : 1) },
      { text: '画面の揺れ', right: st.screenShake ? 'ON' : 'OFF', act: () => (st.screenShake = !st.screenShake) },
      {
        text: '画質',
        right: st.quality === 'auto' ? '自動' : st.quality === 'high' ? '高' : '低（軽量）',
        act: () => {
          st.quality = st.quality === 'auto' ? 'high' : st.quality === 'high' ? 'low' : 'auto';
          this.registry.set('autoLowQuality', false);
        },
      },
    ];
    this.setMain(
      '設定（決定で切り替え）',
      rows.map((r) => ({ text: r.text, right: r.right })),
      (i) => {
        rows[i].act();
        void this.ctx.saveSettings();
        this.pageSettings(true);
      },
      () => this.setDetail('音量は 0〜100% を順に切り替えます。\n画質「自動」は、動作が重いときに画面エフェクトを自動で切ります。\n\n操作\n移動：左スティック／矢印・WASD\n調べる：Z・Enter\n視る：C\nダッシュ：Shift\nメニュー：Esc・M'),
      keep,
    );
  }

  // ------------------------------------------------------------ 地図

  private mapOpen = false;

  private async openMap(): Promise<void> {
    if (this.mapOpen) return;
    const info = (this.scene.get('World') as WorldScene).areaMapInfo();
    if (!info) return;
    this.mapOpen = true;
    this.tabs.active = false;
    await showAreaMap(this, this.ctx.reg, info, this.ctx.input, (id) => this.ctx.audio.sfx(id));
    this.tabs.active = true;
    this.mapOpen = false;
  }

  private async toTitle(): Promise<void> {
    if (!(await this.confirm('タイトルに戻りますか？（セーブしていない進行は失われます）'))) return;
    this.ctx.audio.setAmbience({ kind: 'none', back: false, danger: 0, night: false, rain: 0 });
    this.ctx.audio.setHeartbeat(0);
    this.ctx.audio.setMusic(null);
    this.scene.stop('World');
    this.scene.stop('UI');
    this.scene.start('Title');
  }
}

const cycle = (v: number): number => {
  const steps = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const i = steps.findIndex((x) => Math.abs(x - v) < 0.05);
  return steps[(i + 1) % steps.length];
};
