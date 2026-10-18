import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { advanceDay, plant } from '../../src/sim/rules';
import { deserialize, SAVE_VERSION, serialize } from '../../src/save/serialize';

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
        map: createNewGame(1).map,
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
});
