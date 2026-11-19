/**
 * データ整合性テスト。World Bible の開発ルール
 * 「すべての怪異に誕生理由」「各マップに都市伝説・整合性」を機械的にチェックする。
 */
import { describe, expect, it } from 'vitest';
import { createRegistry, loadMap, mapIds } from '@/data';
import { SCRIPT_COMMANDS } from '@/domain/script/commands';
import { parseSequence, resolveAreaMusic, voiceLengths } from '@/domain/audio/music';
import type { Condition, ScriptCommand } from '@/domain/types';

const reg = createRegistry();
const known = new Set<string>(SCRIPT_COMMANDS);

function walk(cmds: ScriptCommand[], visit: (c: ScriptCommand) => void): void {
  for (const c of cmds) {
    visit(c);
    for (const key of ['then', 'else']) if (Array.isArray(c[key])) walk(c[key] as ScriptCommand[], visit);
    if (Array.isArray(c.options)) for (const o of c.options as { then?: ScriptCommand[] }[]) walk(o.then ?? [], visit);
  }
}

function conditionFlags(c: Condition | undefined, out: string[]): void {
  if (!c) return;
  if (c.hasItem) out.push(`item:${c.hasItem}`);
  if (c.notItem) out.push(`item:${c.notItem}`);
  c.all?.forEach((x) => conditionFlags(x, out));
  c.any?.forEach((x) => conditionFlags(x, out));
}

describe('怪異データ', () => {
  it('すべての怪異に誕生理由・伝承・共鳴の選択肢がある', () => {
    for (const k of reg.data.kaii) {
      expect(k.origin.length, k.id).toBeGreaterThan(5);
      expect(k.legend.length, k.id).toBeGreaterThan(5);
      expect(k.resonance.options.length, k.id).toBe(3);
      expect(k.resonance.options.some((o) => o.value === 2), k.id).toBe(true);
    }
  });
  it('属性・スキル・ドロップが存在する', () => {
    for (const k of reg.data.kaii) {
      for (const t of k.types) expect(reg.types.has(t), `${k.id} type ${t}`).toBe(true);
      for (const l of k.learnset) expect(reg.skills.has(l.skill), `${k.id} skill ${l.skill}`).toBe(true);
      for (const d of k.drops) expect(reg.items.has(d.item), `${k.id} drop ${d.item}`).toBe(true);
      if (k.ai?.special) expect(reg.skills.has(k.ai.special)).toBe(true);
    }
  });
  it('すべての怪異に特性があり、説明と効果が正しい', () => {
    for (const k of reg.data.kaii) {
      const t = reg.traits.get(k.trait);
      expect(t, `${k.id} trait ${k.trait}`).toBeDefined();
      expect(t!.name.length, k.id).toBeGreaterThan(0);
      expect(t!.description.length, k.id).toBeGreaterThan(5);
      expect(t!.effects.length, k.id).toBeGreaterThan(0);
      for (const e of t!.effects) if (e.kind === 'counterStatus') expect(reg.statuses.has(e.status), `${t!.id} ${e.status}`).toBe(true);
    }
  });
  it('特性の名前は技・ほかの特性と重ならない（説明画面で混同しない）', () => {
    const skillNames = new Set(reg.data.skills.map((s) => s.name));
    const seen = new Set<string>();
    for (const t of reg.data.traits) {
      expect(skillNames.has(t.name), `${t.id} ${t.name}`).toBe(false);
      expect(seen.has(t.name), t.name).toBe(false);
      seen.add(t.name);
    }
  });
  it('図鑑番号が重複しない', () => {
    const nos = reg.data.kaii.map((k) => k.no);
    expect(new Set(nos).size).toBe(nos.length);
  });
});

describe('アイテム・レシピ・エンカウント', () => {
  it('レシピの素材と成果物が存在する', () => {
    for (const r of reg.data.recipes) {
      expect(reg.items.has(r.result), r.id).toBe(true);
      for (const i of r.inputs) expect(reg.items.has(i.item), `${r.id}:${i.item}`).toBe(true);
    }
  });
  it('お店の商品には値段がある', () => {
    for (const s of reg.data.shops) for (const id of s.items) expect(reg.item(id).price, id).toBeGreaterThan(0);
  });
  it('エンカウント表の怪異が存在する', () => {
    for (const e of reg.data.encounters) {
      for (const x of e.entries) expect(reg.kaii.has(x.kaii), x.kaii).toBe(true);
      for (const ex of e.extra ?? []) for (const x of ex.entries) expect(reg.kaii.has(x.kaii)).toBe(true);
    }
    for (const f of reg.data.fixedEncounters) for (const x of f.enemies) expect(reg.kaii.has(x.kaii), f.id).toBe(true);
  });
  it('スキルの状態異常が定義されている', () => {
    for (const s of reg.data.skills) if (s.status) expect(reg.statuses.has(s.status.id), s.id).toBe(true);
  });
});

describe('マップ', async () => {
  const ids = mapIds();
  const maps = await Promise.all(ids.map((id) => loadMap(id)));

  it('マップIDとファイル名が一致する', () => {
    maps.forEach((m, i) => expect(m.id).toBe(ids[i]));
  });

  it('全レイヤーが同じ大きさで、未定義のタイル文字がない', () => {
    for (const m of maps) {
      const w = m.ground[0].length;
      const h = m.ground.length;
      for (const layer of [m.ground, m.objects, m.above ?? []]) {
        if (!layer.length) continue;
        expect(layer.length, `${m.id} rows`).toBe(h);
        for (const row of layer) {
          expect(row.length, `${m.id} row width`).toBe(w);
          for (const ch of row) expect(reg.tilesByChar.has(ch) || !!m.legend?.[ch], `${m.id} char '${ch}'`).toBe(true);
        }
      }
    }
  });

  it('ワープ先が存在し、到着地点が歩ける', async () => {
    const byId = new Map(maps.map((m) => [m.id, m]));
    for (const m of maps) {
      for (const w of m.warps ?? []) {
        const dest = byId.get(w.to);
        expect(dest, `${m.id}.${w.id} -> ${w.to}`).toBeDefined();
        const ch = dest!.objects[w.ty]?.[w.tx];
        const ground = dest!.ground[w.ty]?.[w.tx];
        expect(ch, `${m.id}.${w.id} dest in bounds`).toBeDefined();
        const solid = reg.tilesByChar.get(ch!)?.solid || reg.tilesByChar.get(ground!)?.solid;
        expect(solid, `${m.id}.${w.id} -> ${w.to}(${w.tx},${w.ty}) is solid`).toBeFalsy();
      }
    }
  });

  it('どの到着地点からも、そのマップの出口（ワープ）へ歩いて行ける（閉じ込め防止）', () => {
    const byId = new Map(maps.map((m) => [m.id, m]));
    // 進行で開く扉・門（overrides）はすべて開いた状態で判定する（到着時点では開いているため）
    const opened = new Map(
      maps.map((m) => {
        const ground = m.ground.map((r) => [...r]);
        const objects = m.objects.map((r) => [...r]);
        for (const o of m.overrides ?? []) {
          if (o.layer === 'ground') ground[o.y][o.x] = o.char;
          if (o.layer === 'objects') objects[o.y][o.x] = o.char;
        }
        return [m.id, { ground, objects }];
      }),
    );
    const solidAt = (m: (typeof maps)[number], x: number, y: number) => {
      const grid = opened.get(m.id)!;
      const g = grid.ground[y]?.[x];
      const o = grid.objects[y]?.[x];
      if (g === undefined || o === undefined) return true;
      const tg = m.legend?.[g] ? reg.tiles.get(m.legend[g]) : reg.tilesByChar.get(g);
      const to = m.legend?.[o] ? reg.tiles.get(m.legend[o]) : reg.tilesByChar.get(o);
      return !!(tg?.solid || to?.solid);
    };
    const reachable = (m: (typeof maps)[number], sx: number, sy: number) => {
      const seen = new Set<string>([`${sx},${sy}`]);
      const queue = [[sx, sy]];
      while (queue.length) {
        const [x, y] = queue.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          const k = `${nx},${ny}`;
          if (seen.has(k) || solidAt(m, nx, ny)) continue;
          seen.add(k);
          queue.push([nx, ny]);
        }
      }
      return seen;
    };
    // 各マップへの到着地点（他マップのワープ先）
    const arrivals: { map: string; x: number; y: number; from: string }[] = [];
    for (const m of maps) for (const w of m.warps ?? []) arrivals.push({ map: w.to, x: w.tx, y: w.ty, from: `${m.id}.${w.id}` });
    for (const a of arrivals) {
      const m = byId.get(a.map)!;
      const seen = reachable(m, a.x, a.y);
      // 通常の（隠し・上書きで開く以外の）ワープのうち、少なくとも1つへ行けること
      const exits = (m.warps ?? []).filter((w) => !w.hidden && !solidAt(m, w.x, w.y));
      const ok = exits.some((w) => {
        for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) if (seen.has(`${x},${y}`)) return true;
        return false;
      });
      expect(ok, `${a.from} → ${a.map}(${a.x},${a.y}) から出口に行けない`).toBe(true);
    }
  });

  it('調べられる物はすべて、歩いて行けるマスから向き合える（NPCが道をふさいでいても）', () => {
    for (const m of maps) {
      const ground = m.ground.map((r) => [...r]);
      const objects = m.objects.map((r) => [...r]);
      for (const o of m.overrides ?? []) {
        if (o.layer === 'ground') ground[o.y][o.x] = o.char;
        if (o.layer === 'objects') objects[o.y][o.x] = o.char;
      }
      const npcTiles = new Set((m.npcs ?? []).map((n) => `${n.x},${n.y}`));
      const solid = (x: number, y: number) => {
        const g = ground[y]?.[x];
        const o = objects[y]?.[x];
        if (g === undefined || o === undefined) return true;
        return !!(reg.tilesByChar.get(g)?.solid || reg.tilesByChar.get(o)?.solid) || npcTiles.has(`${x},${y}`);
      };
      // このマップへの到着地点（他マップのワープ先）から歩けるマス
      const starts: [number, number][] = [];
      for (const other of maps) for (const w of other.warps ?? []) if (w.to === m.id) starts.push([w.tx, w.ty]);
      if (m.id === 'home') starts.push([4, 3]);
      const seen = new Set<string>();
      const q: [number, number][] = [];
      for (const st of starts) {
        seen.add(`${st[0]},${st[1]}`);
        q.push(st);
      }
      while (q.length) {
        const [x, y] = q.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (seen.has(k) || solid(x + dx, y + dy)) continue;
          seen.add(k);
          q.push([x + dx, y + dy]);
        }
      }
      for (const o of m.interactables ?? []) {
        const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${o.x + dx},${o.y + dy}`)) || seen.has(`${o.x},${o.y}`);
        expect(ok, `${m.id}.${o.id} (${o.x},${o.y}) に近づけない`).toBe(true);
      }
    }
  });

  it('朝霧町：家を出た地点から、学校・コンビニ・東の道へ歩いて行ける', () => {
    const town = byIdTown();
    const start = { x: 5, y: 17 };
    const seen = new Set<string>();
    const q = [[start.x, start.y]];
    seen.add(`${start.x},${start.y}`);
    const solid = (x: number, y: number) => {
      const g = town.ground[y]?.[x];
      const o = town.objects[y]?.[x];
      if (g === undefined) return true;
      return !!(reg.tilesByChar.get(g)?.solid || reg.tilesByChar.get(o)?.solid);
    };
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (seen.has(k) || solid(x + dx, y + dy)) continue;
        seen.add(k);
        q.push([x + dx, y + dy]);
      }
    }
    for (const id of ['to_school', 'to_conbini', 'to_yuunagi', 'to_home']) {
      const w = town.warps!.find((x) => x.id === id)!;
      expect(seen.has(`${w.x},${w.y}`), id).toBe(true);
    }
  });
  const byIdTown = () => maps.find((m) => m.id === 'asagiri_town')!;

  it('参照しているスクリプト・NPCスプライト・エンカウント表が存在する', () => {
    for (const m of maps) {
      const scripts = [
        m.onEnter,
        ...(m.npcs ?? []).map((n) => n.script),
        ...(m.interactables ?? []).map((o) => o.script),
        ...(m.triggers ?? []).map((t) => t.script),
        ...(m.warps ?? []).map((w) => w.blockedScript),
      ].filter((x): x is string => !!x);
      for (const s of scripts) expect(reg.hasScript(s), `${m.id} script ${s}`).toBe(true);
      for (const n of m.npcs ?? []) expect(reg.npcSprites.has(n.sprite), `${m.id} sprite ${n.sprite}`).toBe(true);
      if (m.encounters) expect(reg.encounters.has(m.encounters.table), m.id).toBe(true);
    }
  });

  it('裏層マップには危険度と固定時間帯がある（時間が歪んでいる）', () => {
    for (const m of maps.filter((x) => x.layer === 'back')) {
      expect(m.dangerLevel, m.id).toBeGreaterThanOrEqual(1);
      expect(m.dangerLevel, m.id).toBeLessThanOrEqual(7);
      expect(m.fixedPhase, m.id).toBeDefined();
    }
  });
});

describe('BGM', async () => {
  const maps = await Promise.all(mapIds().map(loadMap));
  const INSTRUMENTS = ['musicbox', 'piano', 'pad', 'bell', 'pluck', 'pulse', 'breath', 'bass'];

  it('すべての曲の音列が読めて、楽器・音量が正しい', () => {
    for (const t of reg.data.music) {
      expect(t.bpm, t.id).toBeGreaterThan(20);
      expect(t.voices.length, t.id).toBeGreaterThan(0);
      for (const v of t.voices) {
        expect(INSTRUMENTS, `${t.id} ${v.inst}`).toContain(v.inst);
        expect(v.vol, t.id).toBeGreaterThan(0);
        expect(v.vol, t.id).toBeLessThanOrEqual(1);
        expect(v.phrases.length, t.id).toBeGreaterThan(0);
        for (const p of v.phrases) expect(parseSequence(p).length, `${t.id}: ${p}`).toBeGreaterThan(0);
      }
    }
  });

  it('休みを挟まないパート同士は、フレーズの長さがそろっている（ずれて和音が濁らない）', () => {
    for (const t of reg.data.music) {
      const lens = voiceLengths(t)
        .filter((_, i) => !t.voices[i].rest && t.voices[i].order !== 'random')
        .flat();
      const longest = Math.max(...lens);
      for (const l of lens) expect(longest % l, `${t.id}: ${lens.join(',')}`).toBe(0);
    }
  });

  it('タイトル・戦闘・ボス戦の曲がある', () => {
    for (const id of ['title', 'battle', 'boss']) expect(reg.music.has(id), id).toBe(true);
  });

  it('どのマップ・どの時間帯でも、存在する曲が流れる', () => {
    for (const m of maps) {
      if (m.music) expect(reg.music.has(m.music), `${m.id} music`).toBe(true);
      if (m.musicNight) expect(reg.music.has(m.musicNight), `${m.id} musicNight`).toBe(true);
      for (const ph of reg.data.timePhases) expect(reg.music.has(resolveAreaMusic(m, ph.id)), `${m.id} ${ph.id}`).toBe(true);
    }
  });
});

describe('イベントスクリプト', () => {
  it('未知のコマンドを使っていない', () => {
    for (const s of reg.allScripts()) walk(s.commands, (c) => expect(known.has(c.cmd), `${s.id}: ${c.cmd}`).toBe(true));
  });
  it('参照先（スクリプト・アイテム・怪異・記憶片・戦闘・マップ）が存在する', async () => {
    const ids = new Set(mapIds());
    for (const s of reg.allScripts()) {
      walk(s.commands, (c) => {
        const at = `${s.id}: ${c.cmd}`;
        if (c.cmd === 'call') expect(reg.hasScript(String(c.script)), at).toBe(true);
        if (c.cmd === 'giveItem' || c.cmd === 'takeItem') expect(reg.items.has(String(c.item)), at).toBe(true);
        if (c.cmd === 'recruit' || c.cmd === 'resonanceTalk') expect(reg.kaii.has(String(c.kaii)), at).toBe(true);
        if (c.cmd === 'memory') expect(reg.memories.has(String(c.id)), at).toBe(true);
        if (c.cmd === 'battle') expect(reg.fixedEncounters.has(String(c.encounter)), at).toBe(true);
        if (c.cmd === 'shop') expect(reg.shops.has(String(c.id)), at).toBe(true);
        if (c.cmd === 'warp') expect(ids.has(String(c.map)), at).toBe(true);
        if (c.cmd === 'music' && c.id !== null && c.id !== undefined) expect(reg.music.has(String(c.id)), at).toBe(true);
        if (c.cmd === 'if') {
          const refs: string[] = [];
          conditionFlags(c.when as Condition, refs);
          for (const r of refs) expect(reg.items.has(r.slice(5)), at).toBe(true);
        }
      });
    }
  });
  it('実装済みの章の記憶片はすべて入手できる（True End に必要）', () => {
    const given = new Set<string>();
    for (const s of reg.allScripts()) walk(s.commands, (c) => c.cmd === 'memory' && given.add(String(c.id)));
    const implemented = new Set(reg.data.chapters.filter((c) => c.status === 'implemented').map((c) => c.id));
    for (const m of reg.data.memories.filter((x) => implemented.has(x.chapter))) expect(given.has(m.id), m.id).toBe(true);
  });
  it('七不思議（寄り道依頼）の7つはすべて記録できる', () => {
    const recorded = new Set<string>();
    for (const s of reg.allScripts()) walk(s.commands, (c) => {
      if (c.cmd === 'setFlag' && String(c.key).startsWith('wonder_')) recorded.add(String(c.key));
    });
    expect(recorded.size).toBe(7);
  });
  it('ボスは図鑑完成のために再戦できる（共鳴に失敗しても取り返せる）', async () => {
    const maps = await Promise.all(mapIds().map((id) => loadMap(id)));
    const bosses = reg.data.kaii.filter((k) => k.boss).map((k) => k.id);
    const json = JSON.stringify(maps);
    for (const b of bosses) expect(json.includes(`"notRecruited":"${b}"`), b).toBe(true);
  });
});

describe('世界観ルール', () => {
  it('タイプは World Bible の7感情', () => {
    expect(reg.data.types.map((t) => t.name).sort()).toEqual(['孤独', '恐怖', '怒り', '執着', '嫉妬', '絶望', '罪悪感'].sort());
  });
  it('危険度は7段階（＋現実）で、名称が World Bible と一致', () => {
    expect(reg.data.dangerLevels.filter((d) => d.level >= 1).map((d) => d.name)).toEqual(['違和感', '怪音', '空間変形', '怪異活動', '精神侵食', '現実侵食', '完全融合']);
  });
  it('章構成が企画書どおり（8章＋Final）', () => {
    expect(reg.data.chapters.map((c) => c.title)).toEqual(['学校', '住宅街', '商店街', '病院', '地下鉄', '遊園地', '研究所', '妹の記憶', '裏層最深部']);
  });
  it('エンディングは4種類で、True は「妹を受け入れる」', () => {
    expect(reg.data.endings.map((e) => e.id).sort()).toEqual(['bad', 'normal', 'secret', 'true']);
    expect(reg.data.endings.find((e) => e.id === 'true')!.rule.finalChoice).toBe('accept');
  });
});
