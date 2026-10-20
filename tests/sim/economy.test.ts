import { describe, expect, it } from 'vitest';
import { createNewGame, plotKey } from '../../src/sim/state';
import { advanceDay, bestCrop, isRipe, plant } from '../../src/sim/rules';
import { upgradeBuilding } from '../../src/sim/buildings';
import { buyMaterial, buyMissing, materialsPrice, missingMaterials } from '../../src/sim/materials';
import { eatingOrder, reserved, reserveTotal, surplus } from '../../src/sim/pantry';
import { carterSells, farmerPlots, hireVillager, setFarmerCrop, setJob, upgradeTool } from '../../src/sim/villagers';
import { BUILDINGS, MATERIALS, PRODUCT_IDS, VILLAGERS } from '../../src/sim/data';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState } from '../../src/sim/types';

const newGame = () => {
  const s = createNewGame(11);
  s.events.lastDay = 1e9;
  for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
  return s;
};

const days = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) advanceDay(s);
};

/** Partida con una cama por aldeano y dinero. */
function village(n: number): GameState {
  const s = newGame();
  s.level = 10;
  s.coins = 5000;
  s.materials = { wood: 999, stone: 999, iron: 999 };
  while (s.villagers.length < n) {
    if (!hireVillager(s).ok) upgradeBuilding(s, 'house');
  }
  s.coins = 5000;
  return s;
}

describe('materiales', () => {
  it('se empieza sin materiales y las mejoras los piden', () => {
    const s = newGame();
    expect(s.materials).toEqual({ wood: 0, stone: 0, iron: 0 });
    s.coins = 100;
    const r = upgradeBuilding(s, 'house');
    expect(r.result.msg).toBe('msg.missingMaterials');
    expect(r.result.params?.list).toBe('wood:2');
    expect(s.coins).toBe(100); // no se cobra nada si falta material
  });

  it('se compran en el mercado y la obra los gasta', () => {
    const s = newGame();
    s.coins = 100;
    expect(buyMaterial(s, 'wood', 2)).toMatchObject({ ok: true, params: { amount: 2, cost: 2 * MATERIALS.wood.price } });
    expect(upgradeBuilding(s, 'house').result.ok).toBe(true);
    expect(s.materials.wood).toBe(0);
    expect(s.coins).toBe(100 - 2 * MATERIALS.wood.price - BUILDINGS.house.upgrades[0].cost);
  });

  it('el hierro se vende desde su nivel', () => {
    const s = newGame();
    s.coins = 500;
    expect(buyMaterial(s, 'iron', 1).msg).toBe('msg.upgradeLocked');
    s.level = MATERIALS.iron.unlockLevel!;
    expect(buyMaterial(s, 'iron', 1).ok).toBe(true);
  });

  it('comprar lo que falta para una obra compra justo eso', () => {
    const s = newGame();
    s.coins = 1000;
    s.materials.stone = 10;
    const need = { stone: 30, wood: 10, iron: 4 };
    expect(missingMaterials(s, need)).toEqual({ stone: 20, wood: 10, iron: 4 });
    s.level = 8;
    const cost = materialsPrice(s, { stone: 20, wood: 10, iron: 4 });
    expect(buyMissing(s, need)).toMatchObject({ ok: true, params: { cost } });
    expect(s.materials).toEqual({ wood: 10, stone: 30, iron: 4 });
    expect(s.coins).toBe(1000 - cost);
  });

  it('las herramientas tambien piden material', () => {
    const s = village(1);
    s.materials = { wood: 0, stone: 0, iron: 0 };
    const id = s.villagers[0].id;
    expect(upgradeTool(s, id).msg).toBe('msg.missingMaterials');
    s.materials.wood = 2;
    expect(upgradeTool(s, id).ok).toBe(true);
    expect(s.materials.wood).toBe(0);
    expect(upgradeTool(s, id).params?.list).toBe('iron:2');
  });
});

describe('despensa', () => {
  it('por defecto se come grano, verdura y huevos, pero no la leche', () => {
    const s = newGame();
    expect(s.pantry.eat).toEqual({ wheat: true, carrot: true, cabbage: true, egg: true, milk: false, flour: false, bread: true, cheese: false });
    expect(s.pantry.reserveDays).toBe(VILLAGERS.pantry.reserveDays);
  });

  it('se come primero lo mas barato y la reserva aparta comida en ese orden', () => {
    const s = village(2);
    s.pantry.reserveDays = 5;
    s.pantry.eat.egg = false;
    s.inventory.wheat = 4;
    s.inventory.carrot = 20;
    s.inventory.milk = 9;
    expect(eatingOrder(s)).toEqual(['wheat', 'carrot', 'bread', 'cabbage']);
    const need = reserveTotal(s);
    expect(need).toBe(Math.ceil(2 * 0.9 * 5)); // 2 aldeanos con el hogar, 5 dias
    expect(reserved(s)).toMatchObject({ wheat: 4, carrot: need - 4, milk: 0 });
    expect(surplus(s, 'carrot')).toBe(20 - (need - 4));
    expect(surplus(s, 'milk')).toBe(9);
  });

  it('lo que no esta en la despensa no se come', () => {
    const s = village(1);
    s.herds.chicken.count = 0;
    for (const p of PRODUCT_IDS) s.pantry.eat[p] = false;
    s.inventory.wheat = 10;
    days(s, 1);
    expect(s.inventory.wheat).toBe(10);
    expect(s.villagers[0].hungry).toBe(1);
  });

  it('el carretero no vende la reserva de la despensa', () => {
    const s = village(1);
    setJob(s, s.villagers[0].id, 'carter');
    s.pantry.reserveDays = 14;
    s.inventory.wheat = 30;
    s.inventory.milk = 5;
    s.day = 7;
    const keep = reserved(s).wheat;
    expect(carterSells(s)).not.toBeNull();
    expect(s.inventory.wheat).toBe(keep);
    expect(s.inventory.milk).toBe(0);
  });
});

describe('labradores que siembran y cosechan', () => {
  it('cada labrador trabaja sus parcelas, mas con mejor herramienta', () => {
    const s = village(2);
    const plots = farmerPlots(s);
    const [a, b] = s.villagers;
    expect(plots.get(a.id)).toHaveLength(VILLAGERS.jobs.farmer.plots);
    upgradeTool(s, a.id);
    expect(farmerPlots(s).get(a.id)).toHaveLength(VILLAGERS.jobs.farmer.plots + 1);
    // no se pisan
    const all = [...farmerPlots(s).values()].flat();
    expect(new Set(all).size).toBe(all.length);
    expect(farmerPlots(s).get(b.id)!.every((k) => !farmerPlots(s).get(a.id)!.includes(k))).toBe(true);
  });

  it('siembran el cultivo asignado pagando la semilla y cosechan al granero', () => {
    const s = village(1);
    const v = s.villagers[0];
    setFarmerCrop(s, v.id, 'carrot');
    s.inventory.wheat = 20; // comida para que no se marche
    const mine = farmerPlots(s).get(v.id)!;
    const coins = s.coins;
    days(s, 1);
    for (const k of mine) expect(s.plots[k].crop).toBe('carrot');
    expect(s.coins).toBe(coins - mine.length * 3);
    // las demas parcelas siguen siendo del jugador
    const others = Object.keys(s.plots).filter((k) => !mine.includes(k));
    for (const k of others) expect(s.plots[k].crop).toBeNull();
    const before = s.inventory.carrot;
    for (let i = 0; i < 5 && s.inventory.carrot === before; i++) advanceDay(s);
    expect(s.inventory.carrot).toBeGreaterThan(before);
    expect(s.stats.harvested).toBeGreaterThan(0);
  });

  it('en automatico eligen lo que mas deja en temporada, y sin cultivo no siembran', () => {
    const s = village(1);
    s.level = 1;
    expect(bestCrop(s)).toBe('wheat');
    s.level = 10;
    expect(['carrot', 'cabbage', 'wheat']).toContain(bestCrop(s));
    s.day = 3 * DAYS_PER_SEASON + 1; // invierno: solo coles
    expect(bestCrop(s)).toBe('cabbage');
    const v = s.villagers[0];
    setFarmerCrop(s, v.id, null);
    days(s, 1);
    for (const k of farmerPlots(s).get(v.id)!) expect(s.plots[k].crop).toBeNull();
  });

  it('fuera de temporada o sin dinero, la parcela espera', () => {
    const s = village(1);
    const v = s.villagers[0];
    setFarmerCrop(s, v.id, 'wheat');
    s.day = 3 * DAYS_PER_SEASON + 1; // invierno
    days(s, 1);
    for (const k of farmerPlots(s).get(v.id)!) expect(s.plots[k].crop).toBeNull();
    s.day = 1;
    s.coins = 0;
    days(s, 1);
    for (const k of farmerPlots(s).get(v.id)!) expect(s.plots[k].crop).toBeNull();
  });

  it('las cosechas de los labradores dan experiencia y avisan sobre la parcela', () => {
    const s = village(1);
    const v = s.villagers[0];
    const [key] = farmerPlots(s).get(v.id)!;
    const [x, y] = key.split(',').map(Number);
    plant(s, x, y, 'wheat');
    s.plots[plotKey(x, y)].growth = 99;
    expect(isRipe(s.plots[key])).toBe(true);
    const xp = s.xp;
    const notices = advanceDay(s);
    const harvest = notices.find((n) => n.msg === 'msg.harvested');
    expect(harvest?.tile).toEqual({ x, y });
    expect(s.xp).toBeGreaterThan(xp);
  });
});

describe('partida version 4', () => {
  it('guarda y carga materiales, despensa y cultivo de los labradores', () => {
    const s = village(1);
    s.materials.stone = 7;
    s.pantry.eat.milk = true;
    s.pantry.reserveDays = 14;
    setFarmerCrop(s, s.villagers[0].id, 'cabbage');
    const back = deserialize(serialize(s));
    expect(back.materials.stone).toBe(7);
    expect(back.pantry).toEqual(s.pantry);
    expect(back.villagers[0].crop).toBe('cabbage');
  });

  it('una partida de la version 3 recibe almacen, despensa y labradores en automatico', () => {
    const s = village(2) as unknown as Record<string, unknown>;
    delete s.materials;
    delete s.pantry;
    s.villagers = (s.villagers as Record<string, unknown>[]).map(({ crop: _crop, ...v }) => v);
    const file = JSON.stringify({ format: 'from-mud-to-crown-save', version: 3, savedAt: '2026-10-19T08:00:00Z', state: s });
    const back = deserialize(file);
    expect(back.materials).toEqual({ wood: 0, stone: 0, iron: 0 });
    expect(back.pantry.reserveDays).toBe(VILLAGERS.pantry.reserveDays);
    expect(back.villagers.every((v) => v.crop === 'auto')).toBe(true);
  });
});
