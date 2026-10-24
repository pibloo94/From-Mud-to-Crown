import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { CROPS, PROGRESSION } from '../../src/sim/data';
import { cropUnitValue, harvestYield, newPlot, restSoil, tireSoil } from '../../src/sim/soil';
import { bestCrop, harvest } from '../../src/sim/rules';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState } from '../../src/sim/types';

const F = PROGRESSION.fertility;

function soilAt(s: GameState): [number, number, string] {
  const key = Object.keys(s.plots)[0];
  const [x, y] = key.split(',').map(Number);
  return [x, y, key];
}

describe('fertilidad del suelo', () => {
  it('la cosecha rinde segun la fertilidad (al menos 1)', () => {
    const p = { ...newPlot(), crop: 'wheat' as const, fertility: 0.5 };
    expect(harvestYield(p)).toBe(Math.max(1, Math.round(CROPS.wheat.yield * 0.5)));
    p.fertility = 0.01;
    expect(harvestYield(p)).toBe(1);
  });

  it('cosechar cansa la tierra; rotando, la mitad', () => {
    const p = newPlot();
    tireSoil(p, 'wheat');
    expect(p.fertility).toBeCloseTo(1 - CROPS.wheat.drain);
    const before = p.fertility;
    tireSoil(p, 'carrot');
    expect(p.fertility).toBeCloseTo(before - CROPS.carrot.drain * F.rotation);
    expect(p.last).toBe('carrot');
  });

  it('se recupera cada dia, mas en barbecho, sin pasar del maximo', () => {
    const s = createNewGame(1);
    const [, , key] = soilAt(s);
    s.day = 10; // primavera
    s.plots[key].fertility = 0.6;
    restSoil(s);
    const fallow = s.plots[key].fertility;
    expect(fallow).toBeCloseTo(0.6 + F.regen * (F.max - 0.6) + F.fallowPerDay);
    s.plots[key].fertility = 0.6;
    s.plots[key].crop = 'wheat';
    restSoil(s);
    expect(s.plots[key].fertility).toBeLessThan(fallow);
    s.plots[key].fertility = F.max;
    restSoil(s);
    expect(s.plots[key].fertility).toBe(F.max);
  });

  it('una parcela muy explotada da menos al cosechar', () => {
    const s = createNewGame(1);
    const [x, y, key] = soilAt(s);
    Object.assign(s.plots[key], { crop: 'wheat', growth: CROPS.wheat.growDays, fertility: 0.5 });
    const before = s.inventory.wheat;
    harvest(s, x, y);
    expect(s.inventory.wheat - before).toBe(Math.round(CROPS.wheat.yield * 0.5));
  });

  it('para la misma parcela se prefiere rotar si el cultivo anterior vale parecido', () => {
    const s = createNewGame(1);
    s.level = 6;
    s.day = 10;
    const [, , key] = soilAt(s);
    const plain = bestCrop(s)!;
    const plot = { ...s.plots[key], last: plain };
    // El cultivo repetido pierde lo que cansa: si otro queda por encima, se rota.
    const choice = bestCrop(s, plot)!;
    expect(choice === plain || CROPS[choice].product !== CROPS[plain].product).toBe(true);
  });

  it('con un molino trabajando, el trigo vale lo que la harina que da', () => {
    const s = createNewGame(1);
    const base = cropUnitValue(s, 'wheat');
    s.workshops.mill = { level: 0, progress: 0, made: 0 } as never;
    s.villagers = [{ id: 1, name: 'Ana', job: 'artisan', tool: 0, hungry: 0, crop: 'auto', workshop: 'mill' } as never];
    s.inventory.wheat = 0;
    expect(cropUnitValue(s, 'wheat')).toBeGreaterThan(base);
    s.inventory.wheat = 999;
    expect(cropUnitValue(s, 'wheat')).toBe(base);
  });

  it('las partidas anteriores empiezan con la tierra descansada', () => {
    const s = createNewGame(1);
    const old = JSON.parse(serialize(s));
    for (const p of Object.values(old.state.plots) as Record<string, unknown>[]) {
      delete p.fertility;
      delete p.last;
    }
    old.version = 21;
    const back = deserialize(JSON.stringify(old));
    for (const p of Object.values(back.plots)) expect(p).toMatchObject({ fertility: 1, last: null });
  });
});
