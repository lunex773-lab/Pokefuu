import Phaser from 'phaser';
import type { GameContext } from '@/core/GameContext';
import { itemIconKey } from '@/render/TextureFactory';
import { wrapText } from '@/ui/Dialogue';
import { Theme } from '@/ui/Theme';
import { drawPanel, label, ListView } from '@/ui/Widgets';

interface ShopData {
  shopId: string;
  onClose: () => void;
}

/** 買い物（コンビニ・自動販売機） */
export class ShopScene extends Phaser.Scene {
  private ctx!: GameContext;
  private list!: ListView;
  private qty!: ListView;
  private moneyText!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private qtyBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Shop');
  }

  create(data: ShopData): void {
    this.ctx = this.registry.get('ctx') as GameContext;
    const reg = this.ctx.reg;
    const shop = reg.shops.get(data.shopId);
    const s = this.ctx.session;
    const sfx = (id: string) => this.ctx.audio.sfx(id);
    this.add.rectangle(0, 0, 1920, 1080, 0x05040a, 0.8).setOrigin(0);
    const g = this.add.graphics();
    drawPanel(g, 200, 80, 900, 920);
    drawPanel(g, 1120, 80, 600, 920);
    label(this, 240, 110, shop?.name ?? 'お店', Theme.size.l, Theme.color.accentSoft);
    this.moneyText = label(this, 1060, 124, '', Theme.size.s, Theme.color.gold).setOrigin(1, 0);
    this.detail = label(this, 1150, 120, '', Theme.size.s);
    const ids = shop?.items ?? [];
    this.list = new ListView(this, 230, 220, 840, 96, 7, sfx);
    const render = (keep: boolean) => {
      this.moneyText.setText(`所持金 ${s.inventory.money}円`);
      this.list.setItems(
        [
          ...ids.map((id) => ({ text: reg.item(id).name, right: `${reg.item(id).price}円`, sub: `所持 ${s.inventory.count(id)}`, icon: itemIconKey(reg.item(id).icon), disabled: (reg.item(id).price ?? 0) > s.inventory.money })),
          { text: 'やめる', color: Theme.color.dim },
        ],
        keep,
      );
    };
    render(false);
    const close = () => {
      this.ctx.input.remove(this.list);
      this.scene.stop();
      data.onClose();
    };
    this.list.onSelect = (_it, i) => this.detail.setText(i < ids.length ? wrapText(`${reg.item(ids[i]).name}\n\n${reg.item(ids[i]).description}`, Theme.size.s, 540) : '');
    this.list.onSelect(this.list.selected!, 0);
    this.list.onCancel = close;
    this.qtyBg = this.add.graphics().setDepth(10);
    this.qty = new ListView(this, 1180, 640, 480, 86, 3, sfx);
    this.qty.setDepth(11).setVisible(false);
    this.list.onConfirm = (_it, i) => {
      if (i >= ids.length) return close();
      const id = ids[i];
      const price = reg.item(id).price ?? 0;
      this.qtyBg.clear();
      drawPanel(this.qtyBg, 1150, 600, 540, 320, { alpha: 0.98, border: Theme.color.borderHi });
      this.qty.setVisible(true);
      this.qty.setItems([
        { text: '1個', right: `${price}円`, disabled: price > s.inventory.money },
        { text: '5個', right: `${price * 5}円`, disabled: price * 5 > s.inventory.money },
        { text: 'やめる', color: Theme.color.dim },
      ]);
      this.list.active = false;
      this.ctx.input.push(this.qty);
      const done = () => {
        this.ctx.input.remove(this.qty);
        this.qty.setVisible(false);
        this.qtyBg.clear();
        this.list.active = true;
        render(true);
      };
      this.qty.onCancel = done;
      this.qty.onConfirm = (_q, qi) => {
        if (qi < 2 && s.inventory.buy(id, qi === 0 ? 1 : 5)) this.ctx.audio.sfx('item');
        done();
      };
    };
    this.ctx.input.push(this.list);
    this.events.once('shutdown', () => {
      this.ctx.input.remove(this.list);
      this.ctx.input.remove(this.qty);
    });
  }
}
