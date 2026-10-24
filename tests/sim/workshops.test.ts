import { describe, expect, it } from 'vitest';
import { createNewGame, tileAt } from '../../src/sim/state';
import { advanceDay, checkRank, interact } from '../../src/sim/rules';
import {
  artisansOf,
  assignArtisan,
  autoAssign,
  batchesPerDay,
  buildWorkshop,
  upgradeWorkshop,
  workshopAt,
  workshopStatus,
  workshopsWork,
} from '../../src/sim/workshops';
import { hireVillager, setJob, upgradeTool } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { priceOf } from '../../src/sim/market';
import { addXp, hasRank, unlocksAt } from '../../src/sim/progress';
import { reserved } from '../../src/sim/pantry';
import { startEvent, eligibleEvents } from '../../src/sim/events';
import { MAX_LEVEL, PRODUCT_IDS, PROGRESSION, WORKSHOPS } from '../../src/sim/data';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState, WorkshopId } from '../../src/sim/types';

const sites = (s: GameState) => s.map.tiles.filter((t) => t.kind === 'site');

function rich(): GameState {
  const s = createNewGame(21);
  s.events.lastDay = 1e9;
  for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
  s.level = 16;
  s.coins = 10_000;
  s.materials = { wood: 999, stone: 999, iron: 999 };
  s.buildings.granary = 5;
  return s;
}

/** Partida con un taller y un artesano en el. */
function withWorkshop(id: WorkshopId): GameState {
  const s = rich();
  const site = sites(s)[0];
  expect(buildWorkshop(s, id, site.x, site.y).result.ok).toBe(true);
  while (!hireVillager(s).ok) upgradeBuilding(s, 'house');
  assignArtisan(s, s.villagers[0].id, id);
  s.pantry.reserveDays = 0;
  return s;
}

describe('solares y talleres', () => {
  it('el mapa trae cinco solares; tocarlos ofrece los talleres', () => {
    const s = rich();
    expect(sites(s)).toHaveLength(5);
    const [a] = sites(s);
    expect(interact(s, a.x, a.y)).toEqual({ kind: 'site', x: a.x, y: a.y, options: ['mill', 'bakery', 'cheesery', 'brewery', 'loom'] });
  });

  it('levantar un taller pide nivel, monedas y materiales, y ocupa el solar', () => {
    const s = createNewGame(3);
    const [a] = sites(s);
    expect(buildWorkshop(s, 'mill', a.x, a.y).result.msg).toBe('msg.upgradeLocked');
    s.level = WORKSHOPS.mill.unlockLevel;
    expect(buildWorkshop(s, 'mill', a.x, a.y).result.msg).toBe('msg.notEnoughCoins');
    s.coins = 1000;
    expect(buildWorkshop(s, 'mill', a.x, a.y).result.msg).toBe('msg.missingMaterials');
    s.materials = { wood: 20, stone: 10, iron: 0 };
    expect(buildWorkshop(s, 'mill', a.x, a.y).result.ok).toBe(true);
    expect(s.coins).toBe(1000 - WORKSHOPS.mill.cost);
    expect(s.materials).toEqual({ wood: 0, stone: 0, iron: 0 });
    expect(tileAt(s, a.x, a.y)!.kind).toBe('workshop');
    expect(workshopAt(s, a.x, a.y)).toBe('mill');
    expect(interact(s, a.x, a.y)).toEqual({ kind: 'workshop', workshop: 'mill' });
    // cada taller una sola vez
    const [, b] = sites(s);
    expect(buildWorkshop(s, 'mill', b.x, b.y).result.msg).toBe('msg.workshopExists');
  });

  it('sin artesano el taller no trabaja', () => {
    const s = rich();
    const [a] = sites(s);
    buildWorkshop(s, 'mill', a.x, a.y);
    s.inventory.wheat = 30;
    expect(workshopStatus(s, 'mill')).toBe('noArtisan');
    workshopsWork(s);
    expect(s.inventory.flour).toBe(0);
  });

  it('el molino convierte trigo en harina cada dia', () => {
    const s = withWorkshop('mill');
    s.inventory.wheat = 30;
    workshopsWork(s);
    // 2 tandas: 6 de trigo -> 4 de harina
    expect(s.inventory.wheat).toBe(24);
    expect(s.inventory.flour).toBe(4);
    expect(s.workshops.mill!.made).toBe(2);
  });

  it('la herramienta del artesano y las mejoras dan mas tandas', () => {
    const s = withWorkshop('mill');
    s.inventory.wheat = 99;
    expect(batchesPerDay(s, 'mill')).toBe(2);
    expect(upgradeWorkshop(s, 'mill').result.ok).toBe(true);
    expect(batchesPerDay(s, 'mill')).toBe(3);
    upgradeTool(s, s.villagers[0].id); // x1,5
    workshopsWork(s);
    expect(s.workshops.mill!.made).toBe(4); // 4,5 tandas: 4 hechas y media guardada
    expect(s.workshops.mill!.progress).toBeCloseTo(0.5);
  });

  it('la mejor mejora pide el titulo de Artesano', () => {
    const s = withWorkshop('mill');
    upgradeWorkshop(s, 'mill');
    expect(upgradeWorkshop(s, 'mill').result.msg).toBe('msg.needsTitle');
    s.titles.push('artisan');
    expect(upgradeWorkshop(s, 'mill').result.ok).toBe(true);
    // la rueda hidraulica llega en el nivel 18
    expect(upgradeWorkshop(s, 'mill').result.msg).toBe('msg.upgradeLocked');
    s.level = 18;
    expect(upgradeWorkshop(s, 'mill').result.ok).toBe(true);
    expect(upgradeWorkshop(s, 'mill').result.msg).toBe('msg.buildingMaxed');
  });

  it('no gasta la reserva de la despensa ni llena el granero de mas', () => {
    const s = withWorkshop('mill');
    s.pantry.reserveDays = 30; // un aldeano: 30 raciones de reserva
    s.inventory.wheat = 31;
    expect(reserved(s).wheat).toBe(30);
    expect(workshopStatus(s, 'mill')).toBe('noInputs');
    workshopsWork(s);
    expect(s.inventory.wheat).toBe(31);
    s.pantry.reserveDays = 0;
    s.inventory.egg = 0;
    s.inventory.milk = 0;
    s.inventory.wheat = 279; // capacidad 280: una tanda neta resta 1, cabe
    workshopsWork(s);
    expect(s.inventory.flour).toBe(4);
  });

  it('la panaderia necesita harina y huevos', () => {
    const s = withWorkshop('bakery');
    s.inventory.flour = 4;
    s.inventory.egg = 0;
    expect(workshopStatus(s, 'bakery')).toBe('noInputs');
    s.inventory.egg = 5;
    workshopsWork(s);
    expect(s.inventory.bread).toBe(6);
    expect(s.inventory.flour).toBe(0);
    expect(s.inventory.egg).toBe(3);
  });

  it('trabajar en el taller da experiencia', () => {
    const s = withWorkshop('cheesery');
    s.inventory.milk = 9;
    const xp = s.xp;
    workshopsWork(s);
    expect(s.xp).toBe(xp + WORKSHOPS.cheesery.xpPerBatch);
    expect(s.inventory.cheese).toBe(1);
  });

  it('un artesano por taller: el nuevo releva al anterior', () => {
    const s = withWorkshop('mill');
    upgradeBuilding(s, 'house');
    upgradeBuilding(s, 'house');
    while (s.villagers.length < 2) if (!hireVillager(s).ok) upgradeBuilding(s, 'house');
    const [a, b] = s.villagers;
    assignArtisan(s, b.id, 'mill');
    expect(artisansOf(s, 'mill').map((v) => v.id)).toEqual([b.id]);
    expect(a.workshop).toBeNull();
  });

  it('al hacerlo artesano desde la casa ocupa un taller libre', () => {
    const s = rich();
    const [a] = sites(s);
    buildWorkshop(s, 'bakery', a.x, a.y);
    while (!hireVillager(s).ok) upgradeBuilding(s, 'house');
    const v = s.villagers[0];
    setJob(s, v.id, 'artisan');
    autoAssign(s, v.id);
    expect(v.workshop).toBe('bakery');
  });

  it('el dia de juego hace trabajar a los talleres', () => {
    const s = withWorkshop('mill');
    s.inventory.wheat = 30;
    s.inventory.egg = 0;
    advanceDay(s);
    expect(s.inventory.flour).toBeGreaterThan(0);
  });
});

describe('titulo de Artesano y niveles hasta el 20', () => {
  it('hay 20 niveles con umbrales crecientes', () => {
    expect(MAX_LEVEL).toBe(20);
    const s = createNewGame(1);
    addXp(s, 1e9);
    expect(s.level).toBe(20);
  });

  it('Artesano pide nivel y dos talleres, y se suma al rango', () => {
    const s = rich();
    s.level = 12;
    s.rank = 'freeFarmer';
    const [a, b] = sites(s);
    buildWorkshop(s, 'mill', a.x, a.y);
    expect(checkRank(s)).toEqual([]);
    buildWorkshop(s, 'bakery', b.x, b.y);
    const notices = checkRank(s);
    expect(notices.map((n) => n.params?.rank)).toContain('artisan');
    expect(s.titles).toEqual(['artisan']);
    expect(s.rank).toBe('freeFarmer'); // no sustituye al rango principal
    expect(hasRank(s, 'artisan')).toBe(true);
    expect(hasRank(s, 'landowner')).toBe(false);
  });

  it('con el titulo, lo hecho en los talleres se vende mas caro', () => {
    const s = rich();
    const bread = priceOf(s, 'bread');
    const wheat = priceOf(s, 'wheat');
    s.titles.push('artisan');
    expect(priceOf(s, 'bread')).toBe(Math.round(bread * PROGRESSION.artisanPriceBonus));
    expect(priceOf(s, 'wheat')).toBe(wheat);
  });

  it('el arbol de progreso muestra talleres y sus mejoras', () => {
    expect(unlocksAt(9).workshops.map((w) => w.id)).toEqual(['mill']);
    expect(unlocksAt(11).workshops.map((w) => w.id)).toEqual(['cheesery']);
    expect(unlocksAt(11).workshopUpgrades.map((u) => u.id)).toContain('stones');
  });
});

describe('eventos de taller', () => {
  it('las ratas solo vienen si hay molino', () => {
    const s = rich();
    expect(eligibleEvents(s)).not.toContain('rats');
    const [a] = sites(s);
    buildWorkshop(s, 'mill', a.x, a.y);
    expect(eligibleEvents(s)).toContain('rats');
    startEvent(s, 'rats');
  });
});

describe('partida version 5', () => {
  it('guarda talleres y titulos', () => {
    const s = withWorkshop('mill');
    s.titles.push('artisan');
    const back = deserialize(serialize(s));
    expect(back.workshops.mill).toEqual(s.workshops.mill);
    expect(back.titles).toEqual(['artisan']);
    expect(back.villagers[0].workshop).toBe('mill');
  });

  it('una partida de la version 4 recibe solares, productos nuevos y despensa', () => {
    const s = rich() as unknown as Record<string, any>;
    delete s.titles;
    delete s.workshops;
    for (const p of ['flour', 'bread', 'cheese']) {
      delete s.inventory[p];
      delete s.priceMult[p];
      delete s.pantry.eat[p];
    }
    s.map.tiles = s.map.tiles.map((t: { kind: string }) => (t.kind === 'site' ? { ...t, kind: 'grass' } : t));
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 4, savedAt: '2026-10-19T12:00:00Z', state: s }));
    expect(back.map.tiles.filter((t) => t.kind === 'site')).toHaveLength(5);
    expect(back.inventory.bread).toBe(0);
    expect(back.pantry.eat.bread).toBe(true);
    expect(back.titles).toEqual([]);
    expect(back.workshops).toEqual({});
  });
});
