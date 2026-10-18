import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { advanceDay, plant } from '../../src/sim/rules';
import { deserialize, SAVE_VERSION, serialize } from '../../src/save/serialize';

describe('archivo de partida', () => {
  it('guardar y cargar devuelve la misma partida, en pausa', () => {
    const s = createNewGame();
    const [x, y] = Object.keys(s.plots)[0].split(',').map(Number);
    plant(s, x, y);
    advanceDay(s);
    s.speed = 3;
    const loaded = deserialize(serialize(s));
    expect(loaded.speed).toBe(0);
    expect({ ...loaded, speed: 3 }).toEqual(s);
  });

  it('incluye formato y version', () => {
    const data = JSON.parse(serialize(createNewGame()));
    expect(data.format).toBe('from-mud-to-crown-save');
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('rechaza archivos que no son partidas', () => {
    expect(() => deserialize('no es json')).toThrow();
    expect(() => deserialize('{"hola": 1}')).toThrow();
    expect(() => deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 1, state: {} }))).toThrow();
  });

  it('rechaza partidas de una version mas nueva del juego', () => {
    const data = JSON.parse(serialize(createNewGame()));
    data.version = SAVE_VERSION + 1;
    expect(() => deserialize(JSON.stringify(data))).toThrow();
  });
});
