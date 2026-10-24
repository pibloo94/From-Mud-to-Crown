import { describe, expect, it } from 'vitest';
import { createNewGame, tileAt } from '../../src/sim/state';
import { buildWorkshop, assignArtisan } from '../../src/sim/workshops';
import { hireVillager, setJob } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { PRODUCT_IDS, VILLAGERS } from '../../src/sim/data';
import { pointOnRoad, roadCaravans, tradeRoad, villagerDuties } from '../../src/render/life';
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

const caravan = (departDay: number, returnDay: number, escort = false): Caravan => ({ id: departDay, town: 'villaclara', cargo: {}, buy: {}, escort, value: 0, departDay, returnDay });

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
    expect(roadCaravans(s)).toEqual([{ id: 10, t: 0.5, returning: false, escort: true }]);
    s.day = 12;
    expect(roadCaravans(s)).toEqual([]);
    s.day = 13;
    s.dayProgress = 0.25;
    expect(roadCaravans(s)).toEqual([{ id: 10, t: 0.75, returning: true, escort: true }]);
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
