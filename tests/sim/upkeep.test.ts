import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { settleSeason } from '../../src/sim/taxes';
import { payUpkeep, upkeepBill, wageOf } from '../../src/sim/upkeep';
import { hireVillager, setJob } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { multiplier } from '../../src/sim/modifiers';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { PROGRESSION, VILLAGERS } from '../../src/sim/data';
import type { GameState } from '../../src/sim/types';

/** Granja con dos mejoras de casa, tres aldeanos (labrador, pastor, carretero) y ya fuera de la gracia. */
function farm(): GameState {
  const s = createNewGame(7);
  s.events.lastDay = 1e9;
  s.level = 10;
  s.coins = 5000;
  s.materials = { wood: 99, stone: 99, iron: 99 };
  while (s.villagers.length < 3) {
    if (!hireVillager(s).ok) upgradeBuilding(s, 'house');
  }
  setJob(s, s.villagers[0].id, 'farmer');
  setJob(s, s.villagers[1].id, 'herder');
  setJob(s, s.villagers[2].id, 'carter');
  s.day = PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON + 40;
  return s;
}

describe('gastos fijos', () => {
  it('suma salarios por oficio y mantenimiento de lo construido', () => {
    const s = farm();
    const u = PROGRESSION.upkeep;
    s.carts = 2;
    s.stall = true;
    s.workshops.mill = { x: 0, y: 0, level: 2, progress: 0, made: 0 };
    s.noble.manor = 1;
    const bill = upkeepBill(s);
    expect(bill.wages).toBe(VILLAGERS.wages.farmer + VILLAGERS.wages.herder + VILLAGERS.wages.carter);
    const levels = Object.values(s.buildings).reduce((a, b) => a + b, 0);
    expect(bill.parts).toEqual({
      buildings: levels * u.perBuildingLevel,
      workshops: u.workshop + 2 * u.perWorkshopUpgrade,
      carts: 2 * u.cart,
      stall: u.stall,
      manor: u.perManorLevel,
    });
    expect(bill.maintenance).toBe(Object.values(bill.parts).reduce((a, b) => a + b, 0));
  });

  it('se cobran al cerrar la estacion y salen en la tarjeta', () => {
    const s = farm();
    const bill = upkeepBill(s);
    const card = settleSeason(s, 'summer');
    expect(card.params).toMatchObject({ wages: bill.wages, maintenance: bill.maintenance, wagesLeft: 0, neglected: 0 });
    expect(s.villagers).toHaveLength(3);
  });

  it('en la primera estacion, como los impuestos, no se cobran', () => {
    const s = farm();
    s.day = 20;
    const coins = s.coins;
    const card = settleSeason(s, 'spring');
    expect(card.params).toMatchObject({ wages: 0, maintenance: 0 });
    expect(s.coins).toBe(coins);
  });

  it('si no llega para los salarios, se van los ultimos en llegar hasta que el resto cobra', () => {
    const s = farm();
    const village = s.rep.village;
    const [first, second, last] = s.villagers;
    s.coins = wageOf(first) + wageOf(second);
    const out = payUpkeep(s, false);
    expect(out.left).toEqual([last.name]);
    expect(s.villagers.map((v) => v.id)).toEqual([first.id, second.id]);
    expect(s.coins).toBe(0);
    expect(s.rep.village).toBeLessThan(village);
  });

  it('sin dinero para el mantenimiento, cultivos y animales rinden menos una estacion', () => {
    const s = farm();
    s.coins = upkeepBill(s).wages;
    const out = payUpkeep(s, false);
    expect(out.left).toEqual([]);
    expect(out.neglected).toBe(true);
    const n = PROGRESSION.upkeep.neglect;
    expect(multiplier(s, 'growth')).toBeCloseTo(n.growth);
    expect(multiplier(s, 'animal')).toBeCloseTo(n.animal);
    s.day += n.days;
    expect(multiplier(s, 'growth')).toBe(1);
  });
});
