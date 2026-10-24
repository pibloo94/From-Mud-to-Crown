import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { MONUMENTS, PATHS } from '../../src/sim/data';
import { buildMonument, findMonumentSite, monumentAt, monumentDone, MONUMENT_IDS, STAGES } from '../../src/sim/monuments';
import { estateMult } from '../../src/sim/estates';
import { updateRank } from '../../src/sim/progress';
import { interact } from '../../src/sim/rules';
import { tileAt } from '../../src/sim/state';
import { deserialize, serialize } from '../../src/save/serialize';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';
import type { GameState } from '../../src/sim/types';

function rich(): GameState {
  const s = createNewGame(11);
  s.events.lastDay = 1e9;
  s.level = 20;
  s.coins = 100_000;
  s.materials = { wood: 2000, stone: 2000, iron: 2000 };
  return s;
}

describe('monumentos', () => {
  it('piden el ultimo rango de su camino', () => {
    const s = rich();
    expect(buildMonument(s, 'greatChurch').result.msg).toBe('msg.monumentLocked');
    s.titles.push('faithEnvoy');
    expect(buildMonument(s, 'greatChurch').result.ok).toBe(true);
  });

  it('la primera etapa ocupa un bloque libre de 2x2 y se toca en el mapa', () => {
    const s = rich();
    s.titles.push('leader');
    const site = findMonumentSite(s)!;
    expect(site).not.toBeNull();
    buildMonument(s, 'council');
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(tileAt(s, site.x + dx, site.y + dy)!.kind).toBe('monument');
    expect(monumentAt(s, site.x + 1, site.y + 1)).toBe('council');
    expect(interact(s, site.x, site.y)).toEqual({ kind: 'monument', monument: 'council' });
  });

  it('cada etapa cuesta lo suyo; al terminar da prestigio, sus efectos y la tarjeta del legado', () => {
    const s = rich();
    s.titles.push('faithEnvoy');
    const coins = s.coins;
    const prestige = s.noble.prestige;
    s.rep.church = 50;
    const tithe = estateMult(s, 'tithe');
    let last;
    for (let i = 0; i < STAGES; i++) last = buildMonument(s, 'greatChurch');
    expect(s.coins).toBe(coins - MONUMENTS.stages.reduce((n, st) => n + st.cost, 0));
    expect(monumentDone(s, 'greatChurch')).toBe(true);
    expect(s.noble.prestige).toBe(prestige + MONUMENTS.monuments.greatChurch.prestige);
    expect(last!.notices[0]).toMatchObject({ card: 'legacy', params: { monument: 'greatChurch' } });
    expect(estateMult(s, 'tithe')).toBeCloseTo(tithe * MONUMENTS.monuments.greatChurch.effects!.tithe!);
    expect(buildMonument(s, 'greatChurch').result.msg).toBe('msg.monumentDone');
  });

  it('Duque pide el castillo terminado y la Corona en foco al ultimo peldano', () => {
    const s = rich();
    s.rank = 'count';
    s.rep.king = 90;
    s.paths.focus = 'crown';
    s.paths.merits.crown = PATHS.levels[5];
    updateRank(s);
    expect(s.rank).toBe('count');
    for (let i = 0; i < STAGES; i++) buildMonument(s, 'castle');
    updateRank(s);
    expect(s.rank).toBe('duke');
  });

  it('sin sitio libre no se empieza', () => {
    const s = rich();
    s.titles.push('mayor');
    for (const t of s.map.tiles) if (t.kind === 'grass' || t.kind === 'wild') t.kind = 'tree';
    expect(buildMonument(s, 'exchange').result.msg).toBe('msg.monumentNoSite');
  });

  it('se guarda, y cada monumento tiene nombre en los dos idiomas', () => {
    const s = rich();
    s.titles.push('grandMaster');
    buildMonument(s, 'guildHall');
    expect(deserialize(serialize(s)).monuments).toEqual(s.monuments);
    for (const id of MONUMENT_IDS) for (const dict of [es, en] as Record<string, string>[]) expect(dict[`monument.${id}`], id).toBeTruthy();
  });
});
