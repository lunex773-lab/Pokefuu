import { healFull, kaiiStats, MAX_EN } from '@/domain/creature/Kaii';
import { SCRIPT_COMMANDS } from '@/domain/script/commands';
import { formatText } from '@/domain/script/format';
import { ShelvingGame } from '@/domain/minigame/Shelving';
import type { ScriptRunner } from '@/domain/script/ScriptRunner';
import type { Direction, ScriptCommand, WeatherId } from '@/domain/types';
import type { WorldScene } from '../WorldScene';
import { toFacing4 } from './Actors';

const str = (v: unknown, d = ''): string => (v === undefined || v === null ? d : String(v));
const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : d);
const sleep = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/**
 * イベントスクリプトのコマンド実装。
 * 新しい演出・処理はここに register を1つ追加するだけで、全スクリプトから使える。
 */
export function registerScriptCommands(runner: ScriptRunner, w: WorldScene): void {
  const ui = () => w.ui;
  const s = () => w.session;
  const fmt = (t: unknown) => formatText(str(t), s().state);
  const visual = () => ui().closeDialogue();

  // ---- 会話・演出
  runner.register('say', async (c) => {
    await ui().say(c.speaker ? fmt(c.speaker) : undefined, fmt(c.text));
  });
  runner.register('choice', async (c, r) => {
    const opts = (c.options as { text: string; then: ScriptCommand[] }[]) ?? [];
    const i = await ui().choose(
      opts.map((o) => fmt(o.text)),
      c.prompt ? fmt(c.prompt) : undefined,
    );
    if (i >= 0 && opts[i]) await r.exec(opts[i].then ?? []);
  });
  runner.register('fade', async (c) => {
    await ui().fade(c.to === 'clear' ? 'clear' : 'black', num(c.ms, 500));
  });
  runner.register('wait', async (c) => sleep(w, num(c.ms, 500)));
  runner.register('shake', async (c) => {
    if (w.ctx.settings.screenShake) w.cameras.main.shake(num(c.ms, 400), num(c.intensity, 0.004));
  });
  runner.register('flash', async (c) => ui().flash(str(c.color, '#ffffff'), num(c.ms, 300)));
  runner.register('distort', async (c) => {
    w.pulseFx(num(c.intensity, 1));
  });
  runner.register('sfx', (c) => w.ctx.audio.sfx(str(c.id)));
  // イベント中の BGM（null で無音）。イベントが終わると場所の BGM に戻る
  runner.register('music', (c) => w.setMusicOverride((c.id as string | null) ?? null));
  runner.register('title', async (c) => {
    visual();
    await ui().titleCard(fmt(c.text), fmt(c.sub));
  });
  runner.register('toast', (c) => ui().toast(fmt(c.text)));

  // ---- 人物・移動
  runner.register('moveNpc', async (c) => {
    const n = w.npcs.get(str(c.npc));
    if (n) await n.walkBy(num(c.dx), num(c.dy));
  });
  runner.register('hideNpc', (c) => w.hideNpc(str(c.npc)));
  runner.register('face', (c) => {
    const n = w.npcs.get(str(c.npc));
    n?.face(toFacing4(str(c.dir, 'down') as Direction));
  });
  runner.register('facePlayer', (c) => w.player.face(toFacing4(str(c.dir, 'down') as Direction)));
  runner.register('movePlayer', async (c) => {
    await w.player.walkTiles(num(c.dx), num(c.dy));
  });
  runner.register('warp', async (c) => {
    visual();
    const tr = str(c.transition, 'fade') as 'fade' | 'distort';
    await w.enterMap(str(c.map), num(c.x), num(c.y), str(c.facing, 'down') as Direction, tr);
  });
  runner.register('warpLocal', async (c) => {
    w.pulseFx(0.8);
    await ui().fade('black', 120);
    w.player.setTile(num(c.x), num(c.y));
    w.player.face(toFacing4(str(c.facing, 'down') as Direction));
    w.cameras.main.centerOn(w.player.x, w.player.y);
    await ui().fade('clear', 220);
  });
  runner.register('respawn', async () => {
    visual();
    const st = s().state;
    const r = st.player.respawn;
    s().party.healAll();
    st.player.sanity = Math.ceil(s().player.maxSanity * 0.5);
    await w.enterMap(r.mapId, r.x, r.y, 'down', 'none');
  });

  // ---- 戦闘・怪異
  runner.register('battle', async (c, r) => {
    visual();
    const def = w.ctx.reg.fixedEncounters.get(str(c.encounter));
    if (!def) return;
    const enemies = def.enemies.map((e) => s().party.create(e.kaii, e.level));
    const result = await w.startBattle({
      enemies,
      canFlee: def.canFlee,
      boss: !!def.boss,
      encounterId: def.id,
      forceResonance: def.forceResonance,
    });
    if (result === 'lose') {
      if (c.noLose) {
        s().party.healAll();
        return;
      }
      await r.exec(w.ctx.reg.script('on_defeat').commands);
      await r.exec([{ cmd: 'end' }]);
    }
    if (result === 'flee') await r.exec([{ cmd: 'end' }]);
  });
  runner.register('recruit', (c) => {
    const k = s().party.create(str(c.kaii), num(c.level, 5));
    if (c.nickname) k.nickname = str(c.nickname);
    const where = s().party.recruit(k);
    if (!c.quiet) ui().toast(`${w.ctx.reg.species(k.speciesId).name}が仲間になった${where === 'storage' ? '（保管へ）' : ''}`);
  });
  runner.register('resonanceTalk', async (c) => {
    visual();
    const sp = w.ctx.reg.species(str(c.kaii));
    const i = await ui().resonance(sp.sprite, sp.name, sp.resonance.prompt, sp.resonance.options.map((o) => o.text));
    const opt = sp.resonance.options[i];
    w.ctx.audio.sfx('resonance');
    await ui().say(sp.name, opt.reply);
    const k = s().party.party.find((x) => x.speciesId === sp.id);
    if (k) k.bond = Math.min(100, k.bond + opt.value * 10);
  });

  // ---- 施設
  runner.register('shop', async (c) => {
    visual();
    await w.openShop(str(c.id));
  });
  runner.register('saveMenu', async () => {
    visual();
    w.syncPosition();
    await w.openMenu('save');
  });
  runner.register('autosave', async () => w.autosave());
  // アルバイト：品出しミニゲームの出来で給料が決まる（1日1回は台本側で markToday / notToday を使う）
  runner.register('parttime', async (c) => {
    visual();
    const job = w.ctx.reg.parttime.get(str(c.job, 'conbini'));
    if (!job) return;
    const strangeOk = !!job.strange && s().check(job.strange.when);
    const game = new ShelvingGame(job, w.ctx.rng, strangeOk);
    await ui().shelfGame(game);
    const pay = game.pay();
    await ui().fade('black', 400);
    s().clock.advance(job.hours * 60);
    s().inventory.addMoney(pay);
    if (game.sawStrange) s().player.addSanity(-3);
    w.ctx.bus.emit('parttime:done', { earned: pay });
    w.ctx.audio.sfx('item');
    await ui().fade('clear', 500);
    ui().toast(`${pay}円 を受け取った`);
  });
  // 「今日やった」を記録する（条件 today / notToday で1日1回にできる）
  runner.register('markToday', (c) => s().flags.set(str(c.key), s().state.clock.day));
  runner.register('sleep', async () => {
    visual();
    await ui().fade('black', 800);
    s().clock.setTime(7 * 60, true);
    s().party.healAll();
    s().player.addSanity(999);
    w.ctx.audio.sfx('heal');
    await sleep(w, 600);
    await ui().fade('clear', 800);
    ui().toast('朝になった。体も心も回復した');
    await w.autosave();
  });
  runner.register('heal', () => {
    s().party.healAll();
    s().player.addSanity(999);
  });
  runner.register('rest', (c) => {
    s().player.addSanity(num(c.sanity, 30));
    const ratio = num(c.hpRatio, 0.3);
    for (const k of s().party.party) {
      const max = kaiiStats(w.ctx.reg, k).hp;
      if (k.hp <= 0) k.hp = Math.max(1, Math.floor(max * ratio * 0.5));
      else k.hp = Math.min(max, k.hp + Math.floor(max * ratio));
      k.en = MAX_EN;
    }
  });
  runner.register('healFull', () => s().party.party.forEach((k) => healFull(w.ctx.reg, k)));

  // ---- 状態
  runner.register('setFlag', (c) => s().flags.set(str(c.key), (c.value as boolean | number | string | undefined) ?? true));
  runner.register('clearFlag', (c) => s().flags.clear(str(c.key)));
  runner.register('incFlag', (c) => {
    const cur = s().flags.get(str(c.key));
    s().flags.set(str(c.key), (typeof cur === 'number' ? cur : 0) + num(c.by, 1));
  });
  runner.register('giveItem', (c) => {
    s().inventory.add(str(c.item), num(c.qty, 1));
  });
  runner.register('takeItem', (c) => {
    s().inventory.remove(str(c.item), num(c.qty, 1));
  });
  runner.register('money', (c) => {
    s().inventory.addMoney(num(c.amount));
  });
  runner.register('memory', async (c) => {
    const def = w.ctx.reg.memories.get(str(c.id));
    if (!def || !s().story.addMemory(def.id)) return;
    visual();
    await ui().memoryPopup({ ...def, text: fmt(def.text) });
  });
  runner.register('setTime', (c) => s().clock.setTime(num(c.hour) * 60 + num(c.minute), !!c.nextDay));
  runner.register('advanceTime', (c) => s().clock.advance(num(c.minutes, 60)));
  runner.register('setWeather', (c) => s().weather.set(str(c.weather, 'clear') as WeatherId, !!c.lock));
  runner.register('unlockWeather', () => s().weather.unlock());
  runner.register('chapter', (c) => s().story.setChapter(str(c.id)));
  runner.register('playerExp', (c) => {
    s().player.gainExp(num(c.amount));
  });
  runner.register('sanity', (c) => {
    const d = num(c.delta);
    s().player.addSanity(d);
    if (d < 0) {
      w.pulseFx(0.5);
      w.ctx.audio.sfx('whisper');
    }
  });
  runner.register('achievement', (c) => s().achievements.unlock(str(c.id)));
  runner.register('refreshMap', () => w.refreshDynamic());
  runner.register('ending', (c) => {
    w.ctx.bus.emit('ending:reached', { id: str(c.id) });
  });

  if (import.meta.env.DEV) {
    const missing = SCRIPT_COMMANDS.filter((c) => !runner.has(c));
    if (missing.length) console.warn('[Script] 未実装のコマンド:', missing);
  }
}
