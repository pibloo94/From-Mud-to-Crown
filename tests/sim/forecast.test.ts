import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { settleSeason } from '../../src/sim/taxes';
import { seasonForecast } from '../../src/sim/forecast';
import { advanceDay, sell } from '../../src/sim/rules';
import { surplus } from '../../src/sim/pantry';
import { hireVillager, setJob } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { nextSeasonStart } from '../../src/sim/modifiers';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { PRODUCT_IDS, PROGRESSION } from '../../src/sim/data';
import type { GameState } from '../../src/sim/types';

/** Granja con tres aldeanos, algo vendido esta estacion y fuera de la gracia. */
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
  s.day = PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON + 40;
  s.stats.seasonEarned = 300;
  s.inventory.wheat = 200;
  return s;
}

describe('parte de la estacion', () => {
  it('preve exactamente lo que se cobra en las cuentas', () => {
    const s = farm();
    const f = seasonForecast(s);
    expect(f.daysLeft).toBe(nextSeasonStart(s.day) - s.day);
    expect(f.short).toBe(0);
    expect(f.charges.tithe).toBeGreaterThan(0);
    expect(f.charges.wages).toBeGreaterThan(0);
    // Las cuentas de verdad, el dia en que tocan.
    const before = s.coins;
    s.day = nextSeasonStart(s.day);
    settleSeason(s, 'summer');
    expect(before - s.coins).toBe(f.total - f.income);
  });

  it('no cambia la partida', () => {
    const s = farm();
    const copy = structuredClone(s);
    seasonForecast(s);
    expect(s).toEqual(copy);
  });

  it('si no llega, dice cuanto falta y quien se iria sin cobrar', () => {
    const s = farm();
    const f0 = seasonForecast(s);
    s.coins = f0.charges.tithe + f0.charges.tribute + 1;
    const f = seasonForecast(s);
    expect(f.short).toBe(f.total - f.income - s.coins);
    expect(f.leaving.length).toBeGreaterThan(0);
    expect(f.unpaidTaxes).toBe(0);
    // Y es lo que pasa de verdad.
    s.day = nextSeasonStart(s.day);
    const card = settleSeason(s, 'summer');
    expect(card.params?.wagesLeftNames).toBe(f.leaving.join(', '));
  });

  it('en la estacion de gracia no se cobra nada', () => {
    const s = createNewGame(3);
    s.day = 5;
    const f = seasonForecast(s);
    expect(f.grace).toBe(true);
    expect(f.total).toBe(0);
    expect(f.short).toBe(0);
  });

  it('avisa de que la comida no llega hasta las cuentas', () => {
    const s = farm();
    for (const p of PRODUCT_IDS) s.inventory[p] = 0;
    s.inventory.wheat = 2;
    const f = seasonForecast(s);
    expect(f.food.short).toBe(true);
    expect(f.food.needed).toBeGreaterThan(f.food.stock);
  });

  it('vender solo lo que sobra nunca deja la comida por debajo de la reserva (no avisa en rojo)', () => {
    const s = farm();
    for (const p of PRODUCT_IDS) s.inventory[p] = 0;
    s.inventory.wheat = 200;
    s.pantry.reserveDays = 7;
    sell(s, 'wheat', surplus(s, 'wheat'));
    const f = seasonForecast(s);
    expect(f.food.stock).toBe(f.food.reserve);
    expect(f.food.below).toBe(false);
    // Aunque no llegue hasta las cuentas: eso es un dato, no un aviso
    expect(f.food.short).toBe(true);
    // Si se vende de la reserva, si avisa
    sell(s, 'wheat', 1);
    expect(seasonForecast(s).food.below).toBe(true);
  });

  it('unos dias antes de las cuentas avisa si no llega el dinero', () => {
    const s = farm();
    s.coins = 0;
    const warn = PROGRESSION.forecast.warnDays[0];
    s.day = nextSeasonStart(s.day) - warn - 1;
    const notices = advanceDay(s);
    expect(notices.some((n) => n.msg === 'msg.ledgerShort' && n.params?.days === warn)).toBe(true);
    // Al dia siguiente ya no repite el aviso.
    expect(advanceDay(s).some((n) => n.msg === 'msg.ledgerShort')).toBe(false);
  });

  it('avisa una vez cuando quedan pocos dias de comida', () => {
    const s = farm();
    for (const p of PRODUCT_IDS) s.inventory[p] = 0;
    // Sin cosechas ni animales: la comida solo baja.
    s.plots = {};
    s.herds.chicken.count = 0;
    s.herds.cow.count = 0;
    const perDay = s.villagers.length; // de sobra para pasar del umbral
    s.inventory.wheat = Math.ceil((PROGRESSION.forecast.foodWarnDays + 1.5) * perDay);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) if (advanceDay(s).some((n) => n.msg === 'msg.foodLow')) seen.push(i);
    expect(seen.length).toBe(1);
  });
});
