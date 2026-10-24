import { describe, expect, it } from 'vitest';
import { createNewGame, tileAt } from '../../src/sim/state';
import { buildWorkshop, assignArtisan } from '../../src/sim/workshops';
import { hireVillager, setJob } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { PRODUCT_IDS, VILLAGERS } from '../../src/sim/data';
import { AMBUSH, ambushBandits, banditCamp, pointOnRoad, roadCaravans, tradeRoad, villagerDuties } from '../../src/render/life';
import { openEastLands, checkRank } from '../../src/sim/rules';
import { buyCharter, upgradeHamlet } from '../../src/sim/noble';
import { NOBILITY } from '../../src/sim/data';
import type { Caravan, GameState } from '../../src/sim/types';

function game(): GameState {
  const s = createNewGame(8);
  s.events.lastDay = 1e9;
  s.level = 16;
  s.coins = 10_000;
  s.materials = { wood: 999, stone: 999, iron: 999 };
  s.buildings.granary = 5;
  return s;
}

const caravan = (departDay: number, returnDay: number, escort = false, ambush = false): Caravan => ({ id: departDay, town: 'villaclara', cargo: {}, buy: {}, escort, value: 0, departDay, returnDay, ambush });

describe('camino de las caravanas', () => {
  it('sale del mercado por casillas de camino seguidas y acaba fuera del mapa', () => {
    const s = game();
    const road = tradeRoad(s);
    expect(road.length).toBeGreaterThan(2);
    expect(tileAt(s, road[0].x, road[0].y)?.kind).toBe('market');
    for (let i = 1; i < road.length; i++) expect(Math.abs(road[i].x - road[i - 1].x) + Math.abs(road[i].y - road[i - 1].y)).toBe(1);
    // Nunca vuelve sobre sus pasos (ni sale por detras del mercado).
    expect(new Set(road.map((p) => `${p.x},${p.y}`)).size).toBe(road.length);
    const last = road[road.length - 1];
    expect(tileAt(s, last.x, last.y)).toBeUndefined();
    // Por el pueblo va siempre por el camino: solo el tramo final hasta el borde puede pisar otra cosa.
    const inside = road.slice(1).filter((p) => tileAt(s, p.x, p.y));
    expect(inside.filter((p) => tileAt(s, p.x, p.y)!.kind === 'path').length).toBeGreaterThanOrEqual(inside.length - 1);
  });

  it('sin mercado no hay camino', () => {
    const s = game();
    for (const t of s.map.tiles) if (t.kind === 'market') t.kind = 'grass';
    expect(tradeRoad(s)).toEqual([]);
  });

  it('un punto del camino es el centro de la casilla en los extremos y avanza entre medias', () => {
    const road = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    expect(pointOnRoad(road, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointOnRoad(road, 1)).toEqual({ x: 2.5, y: 0.5 });
    expect(pointOnRoad(road, 0.25)).toEqual({ x: 1, y: 0.5 });
    expect(pointOnRoad(road, 2)).toEqual({ x: 2.5, y: 0.5 });
  });
});

describe('caravanas a la vista', () => {
  it('la que sale recorre el camino el primer dia, desaparece y vuelve el ultimo', () => {
    const s = game();
    s.caravans = [caravan(10, 14, true)];
    s.day = 10;
    s.dayProgress = 0.5;
    expect(roadCaravans(s)).toEqual([{ id: 10, t: 0.5, returning: false, escort: true, ambush: null }]);
    s.day = 12;
    expect(roadCaravans(s)).toEqual([]);
    s.day = 13;
    s.dayProgress = 0.25;
    expect(roadCaravans(s)).toEqual([{ id: 10, t: 0.75, returning: true, escort: true, ambush: null }]);
  });

  it('en un viaje de un dia, cada tramo dura medio dia', () => {
    const s = game();
    s.caravans = [caravan(5, 6)];
    s.day = 5;
    s.dayProgress = 0.25;
    expect(roadCaravans(s)[0]).toMatchObject({ t: 0.5, returning: false });
    s.dayProgress = 0.75;
    expect(roadCaravans(s)[0]).toMatchObject({ t: 0.5, returning: true });
  });
});

describe('aldeanos trabajando', () => {
  const hire = (s: GameState) => {
    while (!hireVillager(s).ok) upgradeBuilding(s, 'house');
    return s.villagers[s.villagers.length - 1];
  };

  it('el labrador recorre sus parcelas y cava', () => {
    const s = game();
    const v = hire(s);
    setJob(s, v.id, 'farmer');
    const d = villagerDuties(s).get(v.id)!;
    expect(d.work).toBe('hoe');
    expect(d.area.length).toBeGreaterThan(0);
    for (const p of d.area) expect(tileAt(s, p.x, p.y)?.kind).toBe('soil');
  });

  it('el artesano ronda su taller y solo martillea si el taller trabaja', () => {
    const s = game();
    const site = s.map.tiles.find((t) => t.kind === 'site')!;
    expect(buildWorkshop(s, 'mill', site.x, site.y).result.ok).toBe(true);
    const v = hire(s);
    assignArtisan(s, v.id, 'mill');
    s.pantry.reserveDays = 0;
    for (const p of PRODUCT_IDS) s.inventory[p] = 0;
    let d = villagerDuties(s).get(v.id)!;
    expect(d.work).toBeNull();
    for (const p of d.area) expect(Math.abs(p.x - site.x) <= 1 && Math.abs(p.y - site.y) <= 1).toBe(true);
    s.inventory.wheat = 30;
    d = villagerDuties(s).get(v.id)!;
    expect(d.work).toBe('hammer');
  });

  it('el carretero va al mercado el dia de venta', () => {
    const s = game();
    const v = hire(s);
    setJob(s, v.id, 'carter');
    const market = s.map.tiles.find((t) => t.kind === 'market')!;
    s.day = VILLAGERS.jobs.carter.sellEvery * 3;
    const area = villagerDuties(s).get(v.id)!.area;
    for (const p of area) expect(Math.abs(p.x - market.x) <= 1 && Math.abs(p.y - market.y) <= 1).toBe(true);
    s.day += 1;
    expect(villagerDuties(s).get(v.id)!.area.length).toBeGreaterThan(area.length);
  });
});

describe('bandidos', () => {
  it('la caravana asaltada se para en el camino mientras dura el asalto y luego sigue', () => {
    const s = game();
    s.caravans = [caravan(10, 14, false, true)];
    s.day = 13;
    const at = (p: number) => {
      s.dayProgress = p;
      return roadCaravans(s)[0];
    };
    // Antes del asalto va acercandose
    expect(at(AMBUSH.at / 2).ambush).toBeNull();
    expect(at(AMBUSH.at / 2).t).toBeCloseTo(1 - AMBUSH.at / 2);
    // Durante el asalto esta parada en el mismo sitio
    const a = at(AMBUSH.at + AMBUSH.stop * 0.2);
    const b = at(AMBUSH.at + AMBUSH.stop * 0.8);
    expect(a.t).toBeCloseTo(1 - AMBUSH.at);
    expect(b.t).toBeCloseTo(a.t);
    expect(a.ambush).toBeCloseTo(0.2);
    expect(b.ambush).toBeCloseTo(0.8);
    // Despues sigue hasta el mercado
    expect(at(0.999).t).toBeLessThan(0.01);
    expect(at(0.999).ambush).toBeNull();
  });

  it('los bandidos del asalto salen de los lados, llegan a la carreta y se desvanecen al huir', () => {
    const road = tradeRoad(game());
    const cart = pointOnRoad(road, 0.6);
    const dist = (b: { x: number; y: number }) => Math.hypot(b.x - cart.x, b.y - cart.y);
    const start = ambushBandits(road, 0.6, 0);
    const mid = ambushBandits(road, 0.6, 0.5);
    const end = ambushBandits(road, 0.6, 1);
    expect(start).toHaveLength(2);
    for (const b of start) expect(b.alpha).toBe(0);
    for (const b of mid) {
      expect(b.alpha).toBe(1);
      expect(dist(b)).toBeLessThan(0.5);
    }
    for (const b of end) expect(b.alpha).toBe(0);
    // Uno por cada lado del camino
    expect(Math.hypot(start[0].x - start[1].x, start[0].y - start[1].y)).toBeGreaterThan(3);
  });

  it('con el evento de bandidos pendiente, la partida ronda las aldeas tomadas', () => {
    const s = game();
    s.level = 20;
    s.rank = 'landowner';
    openEastLands(s);
    s.titles = ['artisan'];
    s.day = 600;
    s.coins = 100_000;
    s.paths = { merits: { crown: 9999, faith: 0, craft: 0, trade: 0, people: 0 }, focus: 'crown', second: null };
    s.rep = { ...s.rep, nobles: 80, commoners: 70 };
    expect(buyCharter(s).ok).toBe(true);
    checkRank(s);
    expect(banditCamp(s)).toEqual([]);
    s.events.pending = { id: 'bandits' };
    // Sin aldeas tomadas no hay donde rondar
    expect(banditCamp(s)).toEqual([]);
    expect(upgradeHamlet(s, 'woodcutters').ok).toBe(true);
    const camp = banditCamp(s);
    const h = NOBILITY.hamlets.woodcutters;
    expect(camp.length).toBeGreaterThan(0);
    for (const p of camp) {
      expect(Math.abs(p.x - (h.x + 0.5)) <= 2 && Math.abs(p.y - (h.y + 0.5)) <= 2).toBe(true);
      expect(['grass', 'path']).toContain(tileAt(s, p.x, p.y)!.kind);
    }
  });
});
