import { describe, expect, it } from 'vitest';
import { priceOf } from '../../src/sim/market';
import { createNewGame, tileAt } from '../../src/sim/state';
import { advanceDay, buyLand, collect, interact, lease, leaseCost, plant, sell } from '../../src/sim/rules';
import { buildingStat, nextUpgrade, storageCapacity, upgradeBuilding, visualStage } from '../../src/sim/buildings';
import {
  beds,
  carterSells,
  dailyFood,
  dismissVillager,
  foodDays,
  growthPerDay,
  hireCost,
  hireVillager,
  setJob,
  toolCost,
  upgradeTool,
} from '../../src/sim/villagers';
import { addModifier, multiplier } from '../../src/sim/modifiers';
import { seasonBill, settleSeason } from '../../src/sim/taxes';
import { BUILDINGS, PRODUCT_IDS, PROGRESSION, VILLAGERS } from '../../src/sim/data';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import type { GameState } from '../../src/sim/types';

const newGame = () => {
  const s = createNewGame(7);
  s.events.lastDay = 1e9; // sin eventos aleatorios
  // Materiales de sobra: aqui se prueban las reglas de la aldea, no el almacen.
  s.materials = { wood: 999, stone: 999, iron: 999 };
  return s;
};

const days = (s: GameState, n: number) => {
  const notices = [];
  for (let i = 0; i < n; i++) notices.push(...advanceDay(s));
  return notices;
};

/** Partida con casa mejorada y dinero para contratar. */
function withBeds(n: number): GameState {
  const s = newGame();
  s.coins = 1000;
  s.level = 10;
  while (beds(s) < n) upgradeBuilding(s, 'house');
  return s;
}

describe('edificios', () => {
  it('las mejoras se compran en orden, piden nivel y monedas', () => {
    const s = newGame();
    expect(nextUpgrade(s, 'house')!.id).toBe('pallet');
    s.coins = 0;
    expect(upgradeBuilding(s, 'house').result.msg).toBe('msg.notEnoughCoins');
    s.coins = 100;
    expect(upgradeBuilding(s, 'house').result.ok).toBe(true);
    expect(beds(s)).toBe(1);
    expect(upgradeBuilding(s, 'house').result.msg).toBe('msg.upgradeLocked'); // el hogar pide nivel 2
    s.level = 2;
    expect(upgradeBuilding(s, 'house').result.ok).toBe(true);
    expect(s.coins).toBe(100 - 15 - 40);
  });

  it('cada edificio tiene un tope y se ve crecer en el mapa', () => {
    const s = newGame();
    s.level = 10;
    s.coins = 1e6;
    expect(visualStage(s, 'house')).toBe(1);
    for (const up of BUILDINGS.house.upgrades) expect(upgradeBuilding(s, 'house').result.params?.upgrade).toBe(up.id);
    expect(upgradeBuilding(s, 'house').result.msg).toBe('msg.buildingMaxed');
    expect(visualStage(s, 'house')).toBe(3);
    expect(beds(s)).toBe(7);
  });

  it('el granero mejorado guarda mas', () => {
    const s = newGame();
    expect(storageCapacity(s)).toBe(30);
    s.buildings.granary = 2;
    expect(storageCapacity(s)).toBe(80);
  });

  it('tocar la casa o el granero abre su panel; el gallinero vacio tambien', () => {
    const s = newGame();
    const find = (kind: string) => s.map.tiles.find((t) => t.kind === kind)!;
    expect(interact(s, find('house').x, find('house').y)).toEqual({ kind: 'building', building: 'house' });
    expect(interact(s, find('granary').x, find('granary').y)).toEqual({ kind: 'building', building: 'granary' });
    expect(interact(s, find('coop').x, find('coop').y)).toEqual({ kind: 'building', building: 'coop' });
    advanceDay(s);
    expect(interact(s, find('coop').x, find('coop').y).kind).toBe('done');
  });

  it('las mejoras del gallinero aumentan la puesta', () => {
    const a = newGame();
    const b = newGame();
    b.buildings.coop = 2; // cajas de nidos: +10 %
    a.herds.chicken.count = b.herds.chicken.count = 6;
    days(a, 1);
    days(b, 1);
    expect(b.herds.chicken.stored).toBeCloseTo(a.herds.chicken.stored * 1.1);
  });

  it('recoger guarda la parte entera y deja la fraccion para luego', () => {
    const s = newGame();
    s.herds.chicken.stored = 3.6;
    expect(collect(s, 'chicken').result.params?.amount).toBe(3);
    expect(s.herds.chicken.stored).toBeCloseTo(0.6);
  });
});

describe('aldeanos', () => {
  it('hace falta una cama libre para contratar', () => {
    const s = newGame();
    s.coins = 100;
    expect(hireVillager(s).msg).toBe('msg.noFreeBed');
    upgradeBuilding(s, 'house');
    expect(hireVillager(s).ok).toBe(true);
    expect(s.coins).toBe(100 - 15 - VILLAGERS.hireCost);
    expect(s.villagers[0]).toMatchObject({ job: 'farmer', tool: 0, hungry: 0 });
    expect(hireVillager(s).msg).toBe('msg.noFreeBed');
  });

  it('con buena fama en la aldea contratar cuesta la mitad', () => {
    const s = newGame();
    s.rep.village = PROGRESSION.reputation.highVillage;
    expect(hireCost(s)).toBe(Math.ceil(VILLAGERS.hireCost / 2));
  });

  it('los labradores aceleran los cultivos y mas con mejores herramientas', () => {
    const s = withBeds(2);
    hireVillager(s);
    hireVillager(s);
    expect(growthPerDay(s)).toBeCloseTo(1.3);
    upgradeTool(s, s.villagers[0].id);
    expect(growthPerDay(s)).toBeCloseTo(1 + 0.15 * 1.5 + 0.15);
    setJob(s, s.villagers[1].id, 'herder');
    expect(growthPerDay(s)).toBeCloseTo(1.225);
  });

  it('las herramientas suben de grado con nivel y monedas, y el herrero las abarata', () => {
    const s = withBeds(1);
    hireVillager(s);
    const id = s.villagers[0].id;
    s.level = 1;
    expect(upgradeTool(s, id).msg).toBe('msg.upgradeLocked');
    s.level = 10;
    const coins = s.coins;
    expect(upgradeTool(s, id)).toMatchObject({ ok: true, params: { tool: 'farmer.1' } });
    expect(s.coins).toBe(coins - 20);
    addModifier(s, 'smith', 'toolDiscount', 0.7, { days: 10 });
    expect(toolCost(s, 2)).toBe(49);
    upgradeTool(s, id);
    upgradeTool(s, id);
    // la herramienta del gremio llega en el nivel 17
    expect(upgradeTool(s, id).msg).toBe('msg.upgradeLocked');
    s.level = 17;
    s.materials = { wood: 99, stone: 99, iron: 99 };
    expect(upgradeTool(s, id)).toMatchObject({ ok: true, params: { tool: 'farmer.4' } });
    expect(upgradeTool(s, id).msg).toBe('msg.toolMaxed');
  });

  it('el carretero con la herramienta del gremio no vende por encima del precio de mercado', () => {
    const s = withBeds(1);
    hireVillager(s);
    setJob(s, s.villagers[0].id, 'carter');
    s.villagers[0].tool = 4;
    s.herds.chicken.count = 0;
    s.herds.cow.count = 0;
    s.pantry.reserveDays = 0;
    s.inventory.wheat = 20;
    s.day = 7;
    const coins = s.coins;
    const price = priceOf(s, 'wheat');
    expect(carterSells(s)).not.toBeNull();
    const sold = 20 - s.inventory.wheat;
    expect(sold).toBeGreaterThan(0);
    expect(s.coins - coins).toBeLessThanOrEqual(sold * price);
  });

  it('comen de la cosecha cada dia, primero lo mas barato de la despensa', () => {
    const s = withBeds(2);
    hireVillager(s);
    hireVillager(s);
    for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
    s.herds.chicken.count = 0;
    s.inventory.carrot = 5; // 4 monedas
    s.inventory.wheat = 1; // 3 monedas: se come antes
    // dos aldeanos con el hogar (ahorra un 10 %): 1,8 raciones al dia; las fracciones se acumulan
    days(s, 1);
    expect(s.inventory.wheat).toBe(0);
    expect(s.inventory.carrot).toBe(5);
    days(s, 1);
    expect(s.inventory.carrot).toBe(3);
    expect(foodDays(s)).toBe(1);
  });

  it('la despensa reduce lo que comen', () => {
    const s = withBeds(1);
    hireVillager(s);
    expect(dailyFood(s)).toBe(1);
    s.buildings.house = 2; // hogar: ahorra un 10 %
    expect(dailyFood(s)).toBeCloseTo(0.9);
  });

  it('sin comida pasan hambre y acaban marchandose, y la aldea lo recuerda', () => {
    const s = withBeds(1);
    hireVillager(s);
    s.inventory.egg = 0;
    s.herds.chicken.count = 0; // que no aparezcan huevos
    const msgs = days(s, VILLAGERS.hungerDays).map((n) => n.msg);
    expect(msgs).toContain('msg.villagersHungry');
    expect(s.villagers.length).toBe(1);
    expect(days(s, 1).map((n) => n.msg)).toContain('msg.villagerLeftHunger');
    expect(s.villagers.length).toBe(0);
    expect(s.rep.village).toBe(45);
  });

  it('el pastor recoge solo lo que producen los animales', () => {
    const s = withBeds(1);
    hireVillager(s);
    setJob(s, s.villagers[0].id, 'herder');
    s.inventory.wheat = 50;
    s.pantry.eat.egg = false; // que coman trigo y no huevos
    s.buildings.granary = 3;
    days(s, 1);
    expect(s.inventory.egg).toBe(4);
    expect(s.herds.chicken.stored).toBeCloseTo(4 * 0.08);
  });

  it('el carretero vende cada semana guardando comida de reserva', () => {
    const s = withBeds(1);
    hireVillager(s);
    setJob(s, s.villagers[0].id, 'carter');
    s.herds.chicken.count = 0;
    s.herds.cow.count = 0;
    s.inventory.wheat = 20;
    s.day = 6;
    const coins = s.coins;
    const sold = days(s, 1).find((n) => n.msg === 'msg.carterSold');
    expect(sold).toBeDefined();
    // 20 - 1 que comio = 19; guarda 7 dias de comida
    expect(s.inventory.wheat).toBe(7);
    expect(s.coins).toBeGreaterThan(coins);
    expect(s.stats.seasonEarned).toBe(s.coins - coins);
  });

  it('despedir libera la cama', () => {
    const s = withBeds(1);
    hireVillager(s);
    expect(dismissVillager(s, s.villagers[0].id).ok).toBe(true);
    expect(hireVillager(s).ok).toBe(true);
  });

  it('mientras trabajan para el baron no rinden en la granja', () => {
    const s = withBeds(1);
    hireVillager(s);
    addModifier(s, 'corvee', 'idle', 1, { days: 3 });
    expect(growthPerDay(s)).toBe(1);
    s.day = 3;
    expect(growthPerDay(s)).toBeCloseTo(1.15);
  });
});

describe('impuestos', () => {
  it('la primera estacion no paga impuestos', () => {
    const s = newGame();
    s.inventory.milk = 10;
    sell(s, 'milk', 'all');
    s.day = DAYS_PER_SEASON - 1;
    const coins = s.coins;
    const report = advanceDay(s).find((n) => n.card === 'season')!;
    expect(report.params).toMatchObject({ tithe: 0, tribute: 0, grace: 1 });
    expect(s.coins).toBe(coins);
  });

  it('diezmo sobre lo ganado y tributo por parcela al cambiar de estacion', () => {
    const s = newGame();
    s.day = DAYS_PER_SEASON + 5; // pasada la estacion de gracia
    s.inventory.milk = 10;
    sell(s, 'milk', 'all');
    const earned = s.stats.seasonEarned;
    const plots = Object.keys(s.plots).length;
    const bill = seasonBill(s);
    expect(bill.tithe).toBe(Math.round(earned * 0.1));
    expect(bill.tribute).toBe(5 + 2 * plots);
    s.day = 2 * DAYS_PER_SEASON - 1;
    const coins = s.coins;
    const notices = advanceDay(s);
    const report = notices.find((n) => n.card === 'season')!;
    expect(report.params).toMatchObject({ season: 'summer', tithe: bill.tithe, tribute: bill.tribute, unpaid: 0 });
    expect(s.coins).toBe(coins - bill.tithe - bill.tribute);
    expect(s.stats.seasonEarned).toBe(0);
  });

  it('lo que no se puede pagar enfada al baron', () => {
    const s = newGame();
    s.day = 2 * DAYS_PER_SEASON;
    s.coins = 3;
    const n = settleSeason(s, 'spring');
    expect(s.coins).toBe(0);
    expect(n.params?.unpaid).toBeGreaterThan(0);
    expect(s.rep.baron).toBe(40);
  });

  it('con el baron enfadado el tributo es mas alto', () => {
    const s = newGame();
    s.day = 2 * DAYS_PER_SEASON;
    const normal = seasonBill(s).tribute;
    s.rep.baron = 20;
    expect(seasonBill(s).tribute).toBe(Math.round(normal * 1.25));
  });

  it('el tributo crece con el rango', () => {
    const s = newGame();
    s.day = 2 * DAYS_PER_SEASON;
    const peasant = seasonBill(s).tribute;
    s.rank = 'landowner';
    expect(seasonBill(s).tribute).toBe(Math.round(peasant * 2.5));
  });

  it('los caminos sin arreglar abaratan todo una temporada', () => {
    const s = newGame();
    addModifier(s, 'road', 'priceAll', 0.9, { days: 14 });
    expect(multiplier(s, 'priceAll')).toBe(0.9);
    days(s, 14);
    expect(s.modifiers).toEqual([]);
  });
});

describe('Terrateniente y tierras del este', () => {
  function landowner(): GameState {
    const s = newGame();
    s.level = 8;
    s.day = 239;
    s.rep.baron = 60;
    s.coins = 500;
    s.inventory.wheat = 100;
    s.buildings.granary = 5;
    return s;
  }

  it('el este esta cerrado y no se rotura antes de tiempo', () => {
    const s = newGame();
    s.level = 10;
    s.coins = 1000;
    const wild = s.map.tiles.find((t) => t.kind === 'wild')!;
    expect(interact(s, wild.x, wild.y)).toMatchObject({ kind: 'done', outcome: { result: { msg: 'msg.wildLocked' } } });
  });

  it('al ascender se abren las tierras del este con su tarjeta', () => {
    const s = landowner();
    const notices = days(s, 1);
    expect(notices.find((n) => n.card === 'rank')?.params).toEqual({ rank: 'landowner' });
    expect(s.map.tiles.some((t) => t.kind === 'wild')).toBe(false);
  });

  it('las parcelas del este se arriendan a aparceros que pagan renta', () => {
    const s = landowner();
    days(s, 1);
    const east = s.map.tiles.find((t) => t.kind === 'grass' && t.x >= PROGRESSION.lands.eastFrom)!;
    const cost = leaseCost(s);
    expect(interact(s, east.x, east.y)).toEqual({ kind: 'offerLease', x: east.x, y: east.y, cost });
    expect(buyLand(s, east.x, east.y).result.ok).toBe(false); // no se rotura, se arrienda
    expect(lease(s, east.x, east.y).result.ok).toBe(true);
    expect(tileAt(s, east.x, east.y)!.kind).toBe('tenant');
    expect(leaseCost(s)).toBeGreaterThan(cost);
    expect(seasonBill(s).rent).toBe(PROGRESSION.lands.rentPerSeason);
  });
});

describe('nueva partida', () => {
  it('empieza sin aldeanos, con edificios basicos y reputacion neutra', () => {
    const s = createNewGame(1);
    expect(s.villagers).toEqual([]);
    expect(s.buildings).toEqual({ house: 0, granary: 0, coop: 0, pen: 0 });
    expect(s.rep).toEqual({ baron: 50, village: 50 });
    expect(buildingStat(s, 'coop', 'maxAnimals')).toBeGreaterThanOrEqual(s.herds.chicken.count);
    expect(s.map.tiles.filter((t) => t.kind === 'granary').length).toBe(1);
  });

  it('plantar sigue costando semillas', () => {
    const s = createNewGame(1);
    const [x, y] = Object.keys(s.plots)[0].split(',').map(Number);
    const coins = s.coins;
    plant(s, x, y, 'wheat');
    expect(s.coins).toBeLessThan(coins);
  });
});
