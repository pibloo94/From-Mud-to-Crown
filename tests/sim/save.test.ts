import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { advanceDay, plant } from '../../src/sim/rules';
import { deserialize, SAVE_VERSION, serialize } from '../../src/save/serialize';
import { buildingStat, storageCapacity } from '../../src/sim/buildings';
import { beds } from '../../src/sim/villagers';
import { MAX_LEVEL, PROGRESSION, START } from '../../src/sim/data';
import { addXp, claimRenown, levelDef } from '../../src/sim/progress';
import type { GameState } from '../../src/sim/types';

describe('archivo de partida', () => {
  it('guardar y cargar devuelve la misma partida, en pausa', () => {
    const s = createNewGame(9);
    const [x, y] = Object.keys(s.plots)[0].split(',').map(Number);
    plant(s, x, y, 'wheat');
    advanceDay(s);
    s.speed = 3;
    const loaded = deserialize(serialize(s));
    expect(loaded.speed).toBe(0);
    expect({ ...loaded, speed: 3 }).toEqual(s);
  });

  it('incluye formato y version', () => {
    const data = JSON.parse(serialize(createNewGame(1)));
    expect(data.format).toBe('from-mud-to-crown-save');
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('rechaza archivos que no son partidas', () => {
    expect(() => deserialize('no es json')).toThrow();
    expect(() => deserialize('{"hola": 1}')).toThrow();
    expect(() => deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 1, state: {} }))).toThrow();
  });

  it('rechaza partidas de una version mas nueva del juego', () => {
    const data = JSON.parse(serialize(createNewGame(1)));
    data.version = SAVE_VERSION + 1;
    expect(() => deserialize(JSON.stringify(data))).toThrow();
  });

  it('carga partidas de la fase 0 (version 1) conservando el progreso', () => {
    const v1 = {
      format: 'from-mud-to-crown-save',
      version: 1,
      savedAt: '2026-10-18T18:00:00.000Z',
      state: {
        day: 12,
        dayProgress: 0.5,
        speed: 2,
        coins: 57,
        inventory: { wheat: 6, egg: 3, milk: 1 },
        map: oldMap(),
        plots: { '6,3': { crop: 'wheat', growth: 2 } },
        herds: { chicken: { count: 4, stored: 2, timer: 0 }, cow: { count: 1, stored: 1, timer: 1 } },
        stats: { harvested: 9, earned: 30 },
      },
    };
    const s = deserialize(JSON.stringify(v1));
    expect(s.coins).toBe(57);
    expect(s.inventory).toMatchObject({ wheat: 6, egg: 3, milk: 1, carrot: 0, cabbage: 0 });
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.events.pending).toBeNull();
    expect(s.speed).toBe(0);
    advanceDay(s); // la partida migrada se puede seguir jugando
    expect(s.day).toBe(13);
  });

  it('carga partidas de la fase 1 (version 2): jornaleros, mapa y granero', () => {
    const v2 = {
      format: 'from-mud-to-crown-save',
      version: 2,
      savedAt: '2026-10-18T18:00:00.000Z',
      state: {
        day: 80,
        dayProgress: 0,
        speed: 1,
        coins: 120,
        inventory: { wheat: 30, carrot: 10, cabbage: 0, egg: 4, milk: 2 },
        map: oldMap(),
        plots: { '6,3': { crop: 'wheat', growth: 2 } },
        herds: { chicken: { count: 8, stored: 2, timer: 0 }, cow: { count: 2, stored: 1, timer: 1 } },
        xp: 900,
        level: 6,
        landBought: 3,
        workers: 2,
        priceMult: { wheat: 1, carrot: 1, cabbage: 1, egg: 1, milk: 1 },
        marketBoost: null,
        events: { pending: null, lastDay: 70, cooldowns: {} },
        rng: 1234,
        stats: { harvested: 90, earned: 400 },
      },
    };
    const s = deserialize(JSON.stringify(v2));
    expect(s.map.width).toBe(15);
    expect(s.map.tiles.length).toBe(150);
    expect(s.map.tiles.every((t, i) => t.x === i % 15 && t.y === Math.floor(i / 15))).toBe(true);
    expect(s.map.tiles.find((t) => t.x === 3 && t.y === 2)!.kind).toBe('granary');
    expect(s.map.tiles.filter((t) => t.x >= 10).some((t) => t.kind === 'wild')).toBe(true);
    // los dos jornaleros pasan a ser labradores con sus camas
    expect(s.villagers.map((v) => v.job)).toEqual(['farmer', 'farmer']);
    expect(beds(s)).toBeGreaterThanOrEqual(2);
    expect('workers' in s).toBe(false);
    // lo que ya tenia cabe en el granero, el gallinero y el corral
    expect(storageCapacity(s)).toBeGreaterThanOrEqual(46);
    expect(buildingStat(s, 'coop', 'maxAnimals')).toBeGreaterThanOrEqual(8);
    expect(buildingStat(s, 'pen', 'maxAnimals')).toBeGreaterThanOrEqual(2);
    expect(s.rank).toBe('freeFarmer');
    expect(s.rep).toEqual({ king: 50, nobles: 50, artisans: 50, commoners: 50, church: 50 });
    days(s, 40); // se sigue jugando y pasa por unas cuentas de estacion
    expect(s.day).toBe(120);
  });
});

/** Mapa de 10x10 de las fases 0 y 1. */
function oldMap() {
  const rows = ['TTGGGGGGTT', 'TGGGRGGGKT', 'GGHGRGGGGG', 'GWGGRGSSGG', 'GRRRRRSSGG', 'GGGGRGGGGG', 'GCGGRGPPGG', 'GGGGRGPPGG', 'TKGGRGGGGT', 'TTGGMGGGTT'];
  const tiles = rows.flatMap((row, y) => [...row].map((ch, x) => ({ x, y, kind: START.map.legend[ch] })));
  return { width: 10, height: 10, tiles };
}

function days(s: GameState, n: number) {
  for (let i = 0; i < n; i++) {
    advanceDay(s);
    s.events.pending = null;
  }
}

describe('partida version 10', () => {
  it('cuenta el renombre ya acumulado sin cobrarlo de golpe', () => {
    const s = createNewGame(5);
    addXp(s, levelDef(MAX_LEVEL).xp + PROGRESSION.renown.xpPerPoint * 4 + 10);
    delete (s as Partial<GameState>).renown;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 10, savedAt: '2026-10-20T14:00:00Z', state: s }));
    expect(back.renown).toBe(4);
    expect(claimRenown(back)).toBe(0);
  });
});

describe('partida version 22', () => {
  const load = (s: GameState) => deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 22, savedAt: '2026-10-24T10:00:00Z', state: s }));
  const sites = (s: GameState) => s.map.tiles.filter((t) => t.kind === 'site' || t.kind === 'workshop').length;
  const old = () => {
    const s = createNewGame(5);
    const inv = s.inventory as Record<string, number>;
    delete inv.barley;
    delete inv.beer;
    delete (s.priceMult as Record<string, number>).beer;
    delete (s.pantry.eat as Record<string, boolean>).beer;
    // El solar nuevo no existia: era hierba.
    s.map.tiles.find((t) => t.x === 5 && t.y === 8)!.kind = 'grass';
    return s;
  };

  it('anade la cebada y la cerveza a cero y el cuarto solar en su sitio', () => {
    const back = load(old());
    expect(back.inventory.barley).toBe(0);
    expect(back.inventory.beer).toBe(0);
    expect(back.priceMult.beer).toBe(1);
    expect(back.map.tiles.find((t) => t.x === 5 && t.y === 8)!.kind).toBe('site');
    expect(sites(back)).toBe(sites(createNewGame(5)));
  });

  it('si la casilla nueva esta ocupada, pone el solar en hierba junto a un camino', () => {
    const s = old();
    s.map.tiles.find((t) => t.x === 5 && t.y === 8)!.kind = 'house';
    const back = load(s);
    expect(sites(back)).toBe(sites(createNewGame(5)));
  });
});
