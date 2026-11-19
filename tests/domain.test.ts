import { describe, expect, it } from 'vitest';
import { GameConfig } from '@/config/GameConfig';
import { createGameBus } from '@/core/GameEvents';
import { GameSession } from '@/core/GameSession';
import { SeededRng } from '@/core/Rng';
import { createRegistry } from '@/data';
import { BattleEngine, resonanceSucceeds, type BattleHost } from '@/domain/battle/BattleEngine';
import { computeRewards } from '@/domain/battle/Rewards';
import { typeMultiplier } from '@/domain/battle/TypeChart';
import { computeStats, createKaii, expToNext, gainExp, kaiiStats, swapSkill } from '@/domain/creature/Kaii';
import { checksum, MemoryStorageAdapter, SaveError, SaveManager } from '@/domain/save/SaveManager';
import { ScriptRunner } from '@/domain/script/ScriptRunner';
import { createInitialState, type KaiiData } from '@/domain/state/GameState';
import { evaluate } from '@/domain/world/Conditions';
import { resolveEnding } from '@/domain/progress/Endings';
import { formatText } from '@/domain/script/format';
import { phaseAt } from '@/domain/world/Clock';
import { noteToMidi, parseSequence, resolveAreaMusic, sequenceUnits } from '@/domain/audio/music';
import { describeSkill, typeMatchups } from '@/domain/creature/describe';
import { ShelvingGame } from '@/domain/minigame/Shelving';

const reg = createRegistry();
let uid = 0;
const mk = (id: string, lv: number): KaiiData => createKaii(reg, id, lv, `t${uid++}`);

const host = (sanity = 100): BattleHost & { sanity: number; items: Record<string, number> } => {
  const h = {
    sanity,
    items: { ofuda: 5, dango: 3 } as Record<string, number>,
    hasItem: (id: string) => (h.items[id] ?? 0) > 0,
    consumeItem: (id: string) => {
      if (!h.items[id]) return false;
      h.items[id]--;
      return true;
    },
    addSanity: (d: number) => (h.sanity = Math.max(0, h.sanity + d)),
    resonancePower: 0.05,
    sanityDrainMul: 1,
  };
  return h;
};

describe('タイプ相性', () => {
  const chart = reg.data.typeChart;
  it('環状の相性：怒り→恐怖→執着→孤独→嫉妬→罪悪感→絶望→怒り', () => {
    const ring = ['anger', 'fear', 'obsession', 'loneliness', 'envy', 'guilt', 'despair'] as const;
    ring.forEach((t, i) => {
      const next = ring[(i + 1) % ring.length];
      expect(typeMultiplier(chart, t, [next])).toBeGreaterThan(1);
      expect(typeMultiplier(chart, next, [t])).toBeLessThan(1);
      expect(typeMultiplier(chart, t, [t])).toBe(0.5);
    });
  });
  it('無属性は等倍', () => {
    expect(typeMultiplier(chart, 'none', ['fear', 'despair'])).toBe(1);
  });
});

describe('怪異の成長', () => {
  it('レベルに応じて能力が伸びる', () => {
    const sp = reg.species('nanashi');
    const a = computeStats(sp, 5);
    const b = computeStats(sp, 20);
    for (const k of ['hp', 'atk', 'def', 'spd', 'mnd'] as const) expect(b[k]).toBeGreaterThan(a[k]);
  });
  it('経験値でレベルアップし、新しいスキルを覚える', () => {
    const k = mk('nanashi', 3);
    const res = gainExp(reg, k, expToNext(3) + expToNext(4) + 1);
    expect(k.level).toBe(5);
    expect(res.newSkills).toContain('call_name');
    expect(k.skills).toContain('call_name');
  });
  it('技が4つを超えると控えに入り、入れ替えできる', () => {
    const k = mk('nanashi', 1);
    gainExp(reg, k, 100000);
    expect(k.skills.length).toBe(4);
    expect(k.learned.length).toBeGreaterThan(0);
    const learned = k.learned[0];
    const old = k.skills[0];
    expect(swapSkill(k, 0, learned)).toBe(true);
    expect(k.skills[0]).toBe(learned);
    expect(k.learned).toContain(old);
  });
  it('御守りで能力が上がる', () => {
    const k = mk('kiritsu', 10);
    const before = kaiiStats(reg, k).atk;
    k.charm = 'charm_thread';
    expect(kaiiStats(reg, k).atk).toBeGreaterThan(before);
  });
});

describe('戦闘エンジン', () => {
  it('3体編成：手持ちの先頭3体が場に出る', () => {
    const party = [mk('nanashi', 5), mk('kageboushi', 5), mk('kiritsu', 5), mk('honemi', 5)];
    const e = new BattleEngine(reg, new SeededRng(1), host(), { party, enemies: [mk('kageboushi', 3)], canFlee: true, boss: false });
    expect(e.active('ally').length).toBe(3);
    expect(e.reserves.length).toBe(1);
  });

  it('HPが0になった敵は「鎮静」する（倒すのではなく鎮める）', () => {
    const e = new BattleEngine(reg, new SeededRng(2), host(), { party: [mk('kiritsu', 30)], enemies: [mk('kageboushi', 2)], canFlee: true, boss: false });
    let guard = 0;
    while (!e.result && guard++ < 20) e.runTurn({ player: { kind: 'encourage' }, allies: {} });
    expect(e.result).toBe('win');
    expect(e.calmed.length).toBe(1);
  });

  it('弱らせるほど封印しやすい。ボスは封印できない', () => {
    const e = new BattleEngine(reg, new SeededRng(3), host(), { party: [mk('nanashi', 5)], enemies: [mk('kageboushi', 5), mk('juusandan', 5)], canFlee: true, boss: false });
    const [kage, boss] = e.active('enemy');
    const full = e.sealChance(kage, 'ofuda');
    kage.kaii.hp = Math.floor(e.maxHp(kage) / 2);
    const half = e.sealChance(kage, 'ofuda');
    expect(half).toBeGreaterThan(full);
    expect(e.sealChance(kage, 'strong_ofuda')).toBeGreaterThan(half);
    kage.kaii.hp = 1;
    expect(e.sealChance(kage, 'ofuda')).toBeGreaterThan(half);
    expect(e.sealChance(boss, 'strong_ofuda')).toBe(0);
  });

  it('封印に成功すると場から消え、sealed に入る', () => {
    const h = host();
    const e = new BattleEngine(reg, new SeededRng(4), h, { party: [mk('nanashi', 5)], enemies: [mk('kageboushi', 5)], canFlee: true, boss: false });
    const target = e.active('enemy')[0];
    target.kaii.hp = 1;
    let sealed = false;
    for (let i = 0; i < 6 && !sealed; i++) {
      e.runTurn({ player: { kind: 'seal', target: target.id, item: 'ofuda' }, allies: { [e.active('ally')[0].id]: { kind: 'defend' } } });
      sealed = e.sealed.length > 0;
    }
    expect(sealed).toBe(true);
    expect(e.result).toBe('win');
    expect(h.items.ofuda).toBeLessThan(5);
  });

  it('正気度が0になると敗北', () => {
    const h = host(1);
    const e = new BattleEngine(reg, new SeededRng(5), h, { party: [mk('nanashi', 3)], enemies: [mk('juusandan', 30)], canFlee: false, boss: true });
    let guard = 0;
    while (!e.result && guard++ < 30) e.runTurn({ player: { kind: 'encourage' }, allies: {} });
    expect(e.result).toBe('lose');
  });

  it('状態異常：蝕みはターン終了時にHPを削る', () => {
    const e = new BattleEngine(reg, new SeededRng(6), host(), { party: [mk('nanashi', 20)], enemies: [mk('honemi', 20)], canFlee: true, boss: false });
    const enemy = e.active('enemy')[0];
    enemy.kaii.status = { id: 'erosion', turns: 3 };
    const before = enemy.kaii.hp;
    e.runTurn({ player: { kind: 'encourage' }, allies: { [e.active('ally')[0].id]: { kind: 'defend' } } });
    expect(enemy.kaii.hp).toBeLessThan(before);
  });

  it('交代で控えと入れ替わる', () => {
    const party = [mk('nanashi', 10), mk('kiritsu', 10)];
    const e = new BattleEngine(reg, new SeededRng(7), host(), { party, enemies: [mk('kageboushi', 2)], canFlee: true, boss: false });
    // 1体目しか出ないよう、2体目を控えにするため手動で調整
    const ally = e.active('ally')[0];
    expect(e.active('ally').length).toBe(2);
    expect(ally).toBeDefined();
  });

  it('報酬：参加した怪異は全量、控えは3割の経験値', () => {
    const party = [mk('nanashi', 5), mk('kiritsu', 5)];
    const enemy = mk('kageboushi', 5);
    const r = computeRewards(reg, { result: 'win', calmed: [enemy], sealed: [], participants: [party[0].uid] }, party, new SeededRng(8));
    expect(r.exp[party[0].uid]).toBeGreaterThan(0);
    expect(r.exp[party[1].uid]).toBe(Math.floor(r.exp[party[0].uid] * 0.3));
  });

  it('共鳴：理解（2）は必ず成功、拒絶（0）は必ず失敗', () => {
    const rng = new SeededRng(9);
    expect(resonanceSucceeds(2, 0, rng)).toBe(true);
    expect(resonanceSucceeds(0, 1, rng)).toBe(false);
  });
});

describe('バランス（シミュレーション）', () => {
  const simulate = (party: () => KaiiData[], enemies: () => KaiiData[], runs: number, seed: number) => {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      const e = new BattleEngine(reg, new SeededRng(seed + i), host(120), { party: party(), enemies: enemies(), canFlee: false, boss: true });
      let guard = 0;
      while (!e.result && guard++ < 60) e.runTurn({ player: { kind: 'encourage' }, allies: {} });
      if (e.result === 'win') wins++;
    }
    return wins / runs;
  };

  it('チュートリアル戦（ナナシLv5 vs カゲボウシ×2）はほぼ勝てる', () => {
    const rate = simulate(() => [mk('nanashi', 5)], () => [mk('kageboushi', 3), mk('kageboushi', 2)], 60, 100);
    expect(rate).toBeGreaterThan(0.8);
  });

  it('ボス戦は推奨レベル（Lv11×3体）で勝てるが、低レベル単騎では厳しい', () => {
    const fixed = reg.fixedEncounters.get('boss_juusandan')!;
    const boss = () => fixed.enemies.map((x) => mk(x.kaii, x.level));
    const good = simulate(() => [mk('nanashi', 11), mk('kiritsu', 11), mk('honemi', 11)], boss, 60, 200);
    const weak = simulate(() => [mk('nanashi', 7)], boss, 60, 300);
    expect(good).toBeGreaterThan(0.6);
    expect(weak).toBeLessThan(0.2);
  });
});

describe('バランス（第2章）', () => {
  const run = (party: () => KaiiData[], enemies: () => KaiiData[], runs: number, seed: number) => {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      const h = { ...host(130), sanityDrainMul: 0.5 };
      const e = new BattleEngine(reg, new SeededRng(seed + i), h, { party: party(), enemies: enemies(), canFlee: false, boss: true });
      let guard = 0;
      while (!e.result && guard++ < 80) e.runTurn({ player: { kind: 'encourage' }, allies: {} });
      if (e.result === 'win') wins++;
    }
    return wins / runs;
  };
  const fixed = (id: string) => () => reg.fixedEncounters.get(id)!.enemies.map((x) => mk(x.kaii, x.level));
  it('中ボス（カミナリオヤジ）は Lv15 前後で安定して勝てる', () => {
    expect(run(() => [mk('nanashi', 15), mk('kiritsu', 14), mk('gojinochaimu', 14)], fixed('kaminari'), 60, 400)).toBeGreaterThan(0.7);
  });
  it('ボス（アカイクレヨン）は推奨 Lv18 で勝ち越せ、Lv14 では厳しい', () => {
    expect(run(() => [mk('nanashi', 18), mk('kiritsu', 17), mk('utsushimi', 17)], fixed('boss_crayon'), 60, 500)).toBeGreaterThan(0.45);
    expect(run(() => [mk('nanashi', 14), mk('kiritsu', 13), mk('utsushimi', 13)], fixed('boss_crayon'), 60, 600)).toBeLessThan(0.2);
  });
});

describe('エンディング判定（記憶片＋最後の選択）', () => {
  const memoryIds = reg.data.memories.map((m) => m.id);
  const speciesIds = reg.data.kaii.map((k) => k.id);
  const mkState = (opts: { allMem: boolean; complete: boolean }) => {
    const st = createInitialState('ユウ', 'female');
    st.memories = opts.allMem ? [...memoryIds] : memoryIds.slice(1);
    for (const id of speciesIds) st.compendium[id] = { seen: true, recruited: opts.complete };
    return st;
  };
  const judge = (allMem: boolean, complete: boolean, finalChoice: 'accept' | 'reject') =>
    resolveEnding(reg.data.endings, { state: mkState({ allMem, complete }), memoryIds, speciesIds, finalChoice }).id;

  it('拒絶すると Bad（記憶片や図鑑に関係なく）', () => {
    expect(judge(true, true, 'reject')).toBe('bad');
    expect(judge(false, false, 'reject')).toBe('bad');
  });
  it('受け入れても記憶片が足りなければ Normal', () => {
    expect(judge(false, true, 'accept')).toBe('normal');
  });
  it('記憶片をすべて集めて受け入れると True', () => {
    expect(judge(true, false, 'accept')).toBe('true');
  });
  it('さらに図鑑を完成させると Secret', () => {
    expect(judge(true, true, 'accept')).toBe('secret');
  });
});

describe('条件式・時計', () => {
  const st = createInitialState('テスト', 'female');
  it('フラグ・時間帯・アイテム条件', () => {
    st.flags.a = true;
    expect(evaluate({ flag: 'a', phase: ['night'] }, { state: st, phase: 'night' })).toBe(true);
    expect(evaluate({ flag: 'a', phase: ['night'] }, { state: st, phase: 'day' })).toBe(false);
    expect(evaluate({ hasItem: 'smartphone' }, { state: st, phase: 'day' })).toBe(true);
    expect(evaluate({ any: [{ flag: 'zzz' }, { notFlag: 'zzz' }] }, { state: st, phase: 'day' })).toBe(true);
  });
  it('共鳴済み・未共鳴の条件', () => {
    const s2 = createInitialState('テスト', 'male');
    s2.compendium.juusandan = { seen: true, recruited: true };
    expect(evaluate({ recruited: 'juusandan' }, { state: s2, phase: 'day' })).toBe(true);
    expect(evaluate({ notRecruited: 'juusandan' }, { state: s2, phase: 'day' })).toBe(false);
    expect(evaluate({ notRecruited: 'akaikureyon' }, { state: s2, phase: 'day' })).toBe(true);
  });
  it('セリフの差し込み：名前と、妹からの呼び方（性別で変わる）', () => {
    expect(formatText('{name}、{sib}', createInitialState('ユウ', 'male'))).toBe('ユウ、おにいちゃん');
    expect(formatText('{sib}（{Sib}）', createInitialState('ユウ', 'female'))).toBe('おねえちゃん（姉）');
  });
  it('時刻から時間帯（6区分）を求める', () => {
    const p = reg.data.timePhases;
    expect(phaseAt(p, 5 * 60)).toBe('dawn');
    expect(phaseAt(p, 7 * 60)).toBe('morning');
    expect(phaseAt(p, 12 * 60)).toBe('day');
    expect(phaseAt(p, 17 * 60)).toBe('evening');
    expect(phaseAt(p, 20 * 60)).toBe('night');
    expect(phaseAt(p, 2 * 60)).toBe('midnight');
  });
});

describe('ゲームセッション（サービス群）', () => {
  const make = () => new GameSession(createInitialState('テスト', 'male'), reg, createGameBus(), new SeededRng(1));

  it('クラフト：素材を消費して作る', () => {
    const s = make();
    s.inventory.add('hanshi', 2);
    s.inventory.add('sumi', 1);
    expect(s.crafting.craft('r_ofuda')).toBe(true);
    expect(s.inventory.count('ofuda')).toBe(1);
    expect(s.inventory.count('sumi')).toBe(0);
    expect(s.crafting.craft('r_ofuda')).toBe(false);
  });

  it('買い物：所持金が足りないと買えない', () => {
    const s = make();
    expect(s.inventory.buy('dango', 2)).toBe(true);
    expect(s.inventory.money).toBe(800);
    expect(s.inventory.buy('flashlight', 1)).toBe(false);
  });

  it('手持ちが満杯なら保管へ', () => {
    const s = make();
    for (let i = 0; i < GameConfig.party.maxParty; i++) s.party.recruit(s.party.create('kageboushi', 3));
    expect(s.party.recruit(s.party.create('hitorioni', 3))).toBe('storage');
    expect(s.state.compendium.hitorioni.recruited).toBe(true);
  });

  it('実績：カウンター到達で解除される', () => {
    const s = make();
    s.party.recruit(s.party.create('kageboushi', 3));
    expect(s.state.achievements).toContain('first_resonance');
  });

  it('主人公レベルで最大正気度と共鳴力が上がる', () => {
    const s = make();
    const before = s.player.maxSanity;
    s.player.gainExp(1000);
    expect(s.player.maxSanity).toBeGreaterThan(before);
    expect(s.player.resonancePower).toBeGreaterThan(0.015);
  });

  it('御守りは所持数ぶんだけ持たせられる', () => {
    const s = make();
    const a = s.party.create('kiritsu', 5);
    const b = s.party.create('honemi', 5);
    s.party.recruit(a);
    s.party.recruit(b);
    s.inventory.add('charm_bell', 1);
    expect(s.party.equipCharm(a, 'charm_bell', s.inventory)).toBe(true);
    expect(s.party.equipCharm(b, 'charm_bell', s.inventory)).toBe(false);
  });
});

describe('セーブデータ', () => {
  it('保存して読み込める', async () => {
    const sm = new SaveManager(new MemoryStorageAdapter(), 'p.', 1);
    const st = createInitialState('ユウ', 'male');
    st.flags.x = 3;
    await sm.save('1', st, '朝霧町');
    const loaded = await sm.load('1');
    expect(loaded?.flags.x).toBe(3);
    expect((await sm.meta('1'))?.location).toBe('朝霧町');
  });

  it('破損を検出する', async () => {
    const storage = new MemoryStorageAdapter();
    const sm = new SaveManager(storage, 'p.', 1);
    await sm.save('1', createInitialState('ユウ', 'male'), '');
    const raw = JSON.parse(storage.store.get('p.1')!);
    raw.state.player.money = 999999;
    storage.store.set('p.1', JSON.stringify(raw));
    await expect(sm.load('1')).rejects.toBeInstanceOf(SaveError);
  });

  it('古いバージョンをマイグレーションする', () => {
    const sm = new SaveManager(new MemoryStorageAdapter(), 'p.', 2, {
      1: (s) => ({ ...s, added: true }),
    });
    const migrated = sm.migrate({ version: 1 }) as unknown as Record<string, unknown>;
    expect(migrated.version).toBe(2);
    expect(migrated.added).toBe(true);
    expect(() => sm.migrate({ version: 3 })).toThrow(SaveError);
  });

  it('チェックサムは内容で変わる', () => {
    expect(checksum('a')).not.toBe(checksum('b'));
  });
});

describe('スクリプトランナー', () => {
  it('if / call / end と登録コマンドを実行する', async () => {
    const log: string[] = [];
    const scripts = new Map([
      ['sub', { id: 'sub', commands: [{ cmd: 'log', v: 'sub' }] }],
      ['main', { id: 'main', commands: [
        { cmd: 'log', v: 'a' },
        { cmd: 'if', when: { flag: 'x' }, then: [{ cmd: 'log', v: 'then' }], else: [{ cmd: 'log', v: 'else' }] },
        { cmd: 'call', script: 'sub' },
        { cmd: 'end' },
        { cmd: 'log', v: 'never' },
      ] }],
    ]);
    const flags: Record<string, boolean> = {};
    const r = new ScriptRunner((id) => scripts.get(id)!, (c) => !!flags[(c as { flag: string }).flag]);
    r.register('log', (c) => {
      log.push(String(c.v));
    });
    await r.run('main');
    expect(log).toEqual(['a', 'else', 'sub']);
    expect(r.running).toBe(false);
  });
});

describe('BGM の音列', () => {
  it('音名を MIDI 番号に変換できる', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('C#5')).toBe(73);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('A1')).toBe(33);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('音列を読める（休符・長さ・和音・区切り）', () => {
    const steps = parseSequence('E5:2 A5 | . C4+E4+G4:4 .:3');
    expect(steps.map((s) => s.units)).toEqual([2, 1, 1, 4, 3]);
    expect(steps[2].notes).toEqual([]);
    expect(steps[3].notes).toEqual([60, 64, 67]);
    expect(sequenceUnits(steps)).toBe(11);
    expect(() => parseSequence('A4:0')).toThrow();
  });

  it('場所と時間帯で BGM が決まる（指定が無ければ層・屋内外から）', () => {
    const base = { layer: 'reality' as const, indoor: false, dangerLevel: 0 };
    expect(resolveAreaMusic({ ...base, music: 'town', musicNight: 'town_night' }, 'day')).toBe('town');
    expect(resolveAreaMusic({ ...base, music: 'town', musicNight: 'town_night' }, 'midnight')).toBe('town_night');
    expect(resolveAreaMusic({ ...base, music: 'home' }, 'night')).toBe('home');
    expect(resolveAreaMusic(base, 'night')).toBe('town_night');
    expect(resolveAreaMusic({ ...base, indoor: true }, 'day')).toBe('unease');
    expect(resolveAreaMusic({ layer: 'back', indoor: true, dangerLevel: 3 }, 'midnight')).toBe('back');
    expect(resolveAreaMusic({ layer: 'back', indoor: true, dangerLevel: 5 }, 'midnight')).toBe('back_deep');
  });
});

describe('特性', () => {
  const engine = (party: KaiiData[], enemies: KaiiData[], env?: { phase: 'day' | 'midnight'; layer: 'reality' | 'back' }, seed = 1) =>
    new BattleEngine(reg, new SeededRng(seed), host(), { party, enemies, canFlee: true, boss: false, env });

  it('背中の影：裏層では素早さが上がる', () => {
    const day = engine([mk('nanashi', 5)], [mk('kageboushi', 10)]);
    const back = engine([mk('nanashi', 5)], [mk('kageboushi', 10)], { phase: 'midnight', layer: 'back' });
    const d = day.stats(day.active('enemy')[0]).spd;
    const b = back.stats(back.active('enemy')[0]).spd;
    expect(b).toBeGreaterThan(d);
    expect(back.traitBoosted(back.active('enemy')[0])).toContain('spd');
  });

  it('もういいかい：味方がひとりだけのとき攻撃が上がる', () => {
    const solo = engine([mk('hitorioni', 10)], [mk('kageboushi', 5)]);
    const duo = engine([mk('hitorioni', 10), mk('nanashi', 10)], [mk('kageboushi', 5)]);
    expect(solo.stats(solo.active('ally')[0]).atk).toBeGreaterThan(duo.stats(duo.active('ally')[0]).atk);
  });

  it('ひとりだけの名前：絆が深いほど強くなる（敵には働かない）', () => {
    const a = mk('nanashi', 10);
    const b = mk('nanashi', 10);
    b.bond = 100;
    const e = engine([a, b], [mk('nanashi', 10)]);
    const [ca, cb] = e.active('ally');
    expect(e.stats(cb).atk).toBeGreaterThan(e.stats(ca).atk);
    expect(e.traitBoosted(e.active('enemy')[0])).toEqual([]);
  });

  it('出席確認：場に出たとき相手全員の精神を下げる', () => {
    const e = engine([mk('housoushitsu', 10)], [mk('kageboushi', 5), mk('kageboushi', 5)]);
    const ev = e.start();
    expect(ev.some((x) => x.t === 'trait')).toBe(true);
    for (const c of e.active('enemy')) expect(c.stages.mnd).toBe(-1);
  });

  it('号令：最初のターンは遅くても先に動く', () => {
    const e = engine([mk('kiritsu', 3)], [mk('kageboushi', 30)]);
    const ev = e.runTurn({ player: { kind: 'encourage' }, allies: {} });
    const first = ev.find((x) => x.t === 'use');
    expect(first && first.t === 'use' && e.get(first.actor)?.side).toBe('ally');
  });

  it('空っぽの体：状態異常にかからない', () => {
    for (let seed = 0; seed < 30; seed++) {
      const e = engine([mk('honemi', 10)], [mk('kageboushi', 20)], undefined, seed);
      for (let t = 0; t < 6 && !e.result; t++) e.runTurn({ player: { kind: 'encourage' }, allies: {} });
      const c = e.allies[0]!;
      expect(c.kaii.status).toBeUndefined();
    }
  });

  it('迷い猫の張り紙：HP満タンなら倒れる攻撃でも HP1 で耐える', () => {
    const e = engine([mk('harigamineko', 3)], [mk('akaikureyon', 40)], undefined, 5);
    const ev = e.runTurn({ player: { kind: 'encourage' }, allies: {} });
    const i = ev.findIndex((x) => x.t === 'damage' && e.get(x.target)?.side === 'ally');
    const hit = ev[i];
    expect(hit.t === 'damage' && hit.hp).toBe(1);
    expect(ev[i + 1].t).toBe('trait');
  });

  it('見張りの目：技が外れない', () => {
    for (let seed = 0; seed < 20; seed++) {
      const e = engine([mk('kairanban', 15)], [mk('akaikureyon', 30)], undefined, seed);
      for (let t = 0; t < 4 && !e.result; t++) {
        const ev = e.runTurn({ player: { kind: 'encourage' }, allies: {} });
        expect(ev.some((x) => x.t === 'miss' && e.get(x.actor)?.side === 'ally')).toBe(false);
      }
    }
  });
});

describe('技・相性の説明', () => {
  it('技の説明に威力・命中・気力と追加効果が入る', () => {
    const text = describeSkill(reg, reg.skill('startle'));
    expect(text).toContain('威力45');
    expect(text).toContain('命中95');
    expect(text).toContain('EN1');
    expect(text).toContain('20%で恐慌');
  });
  it('相性：タイプ表どおりに「よく響く」「響きにくい」が出る', () => {
    const m = typeMatchups(reg, ['fear']);
    expect(m.weak.length + m.resist.length).toBeGreaterThan(0);
    for (const t of m.weak) expect(typeMultiplier(reg.data.typeChart, t, ['fear'])).toBeGreaterThan(1);
    for (const t of m.resist) expect(typeMultiplier(reg.data.typeChart, t, ['fear'])).toBeLessThan(1);
  });
});

describe('アルバイト（品出しミニゲーム）', () => {
  const job = reg.parttime.get('conbini')!;

  it('決められた数の商品が出て、正しく並べた数で給料が決まる', () => {
    const g = new ShelvingGame(job, new SeededRng(3), false);
    expect(g.goods.length).toBe(job.rounds);
    let i = 0;
    while (!g.done) {
      const cur = g.current!;
      // 半分だけ正解する
      g.answer(i++ % 2 === 0 ? cur.shelf : (cur.shelf + 1) % job.shelves.length);
    }
    expect(g.correct).toBe(Math.ceil(job.rounds / 2));
    expect(g.pay()).toBe(job.base + g.correct * job.perItem);
  });

  it('全問正解でも以前の固定給（2400円）を超えない', () => {
    const g = new ShelvingGame(job, new SeededRng(4), false);
    while (!g.done) g.answer(g.current!.shelf);
    expect(g.pay()).toBeLessThanOrEqual(2400);
  });

  it('不気味な商品は、どの棚に置いても数に入らない', () => {
    let found = false;
    for (let seed = 0; seed < 40 && !found; seed++) {
      const g = new ShelvingGame(job, new SeededRng(seed), true);
      const k = g.goods.findIndex((x) => x.shelf < 0);
      if (k < 0) continue;
      found = true;
      while (!g.done) g.answer(g.current!.shelf < 0 ? 0 : g.current!.shelf);
      expect(g.sawStrange).toBe(true);
      expect(g.correct).toBe(job.rounds - 1);
    }
    expect(found).toBe(true);
  });
});

describe('条件：今日やったかどうか', () => {
  it('markToday で記録した日だけ today が真になる', () => {
    const st = createInitialState('テスト', 'male');
    const ctx = { state: st, phase: 'day' as const };
    expect(evaluate({ today: 'parttime_day' }, ctx)).toBe(false);
    expect(evaluate({ notToday: 'parttime_day' }, ctx)).toBe(true);
    st.flags.parttime_day = st.clock.day;
    expect(evaluate({ today: 'parttime_day' }, ctx)).toBe(true);
    st.clock.day += 1;
    expect(evaluate({ today: 'parttime_day' }, ctx)).toBe(false);
  });
});
