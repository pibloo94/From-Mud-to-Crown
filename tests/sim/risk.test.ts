import { describe, expect, it } from 'vitest';
import { createNewGame, plotKey, tileAt } from '../../src/sim/state';
import { settleSeason } from '../../src/sim/taxes';
import { buyProtection, checkRankKeep, isProtected, protectionCost, rollWeather, seizeForDebt } from '../../src/sim/risk';
import { maybeTriggerEvent } from '../../src/sim/events';
import { dailyFood } from '../../src/sim/pantry';
import { multiplier } from '../../src/sim/modifiers';
import { hireVillager } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { EVENT_IDS, PROGRESSION, START } from '../../src/sim/data';
import { deserialize } from '../../src/save/serialize';
import type { GameState, Notice } from '../../src/sim/types';

function game(): GameState {
  const s = createNewGame(11);
  s.events.lastDay = 1e9;
  s.level = 10;
  s.coins = 2000;
  s.materials = { wood: 99, stone: 99, iron: 99 };
  // fuera de la estacion de gracia
  s.day = PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON + 10;
  return s;
}

describe('tiempo de la estacion', () => {
  it('el invierno duro hace comer mas y baja los animales durante una estacion', () => {
    const s = game();
    for (let i = 0; i < 10 && s.villagers.length < 2; i++) if (!hireVillager(s).ok) upgradeBuilding(s, 'house');
    expect(s.villagers.length).toBe(2);
    const food = dailyFood(s);
    const harsh = PROGRESSION.weather.winter.find((w) => w.id === 'harsh')!;
    // fuerza el sorteo: solo queda el invierno duro
    const saved = PROGRESSION.weather.winter;
    PROGRESSION.weather.winter = [{ ...harsh, weight: 1 }];
    expect(rollWeather(s, 'winter')).toBe('harsh');
    PROGRESSION.weather.winter = saved;
    expect(s.weather).toBe('harsh');
    expect(dailyFood(s)).toBeCloseTo(food * harsh.food!);
    expect(multiplier(s, 'animal')).toBeCloseTo(harsh.animal!);
    s.day += DAYS_PER_SEASON;
    expect(dailyFood(s)).toBeCloseTo(food);
  });

  it('las cuentas sortean el tiempo de la estacion que empieza y lo dicen en la tarjeta', () => {
    const s = game();
    s.day = 2 * DAYS_PER_SEASON; // empieza el otono
    const card = settleSeason(s, 'summer');
    expect(String(card.params?.weather)).toMatch(/^autumn\./);
    expect(PROGRESSION.weather.autumn.map((w) => `autumn.${w.id}`)).toContain(card.params?.weather);
  });
});

describe('prevencion', () => {
  it('cuesta segun las parcelas, dura hasta las cuentas y no se compra dos veces', () => {
    const s = game();
    const cost = protectionCost(s, 'crops');
    expect(cost).toBe(PROGRESSION.protection.crops.base + PROGRESSION.protection.crops.perUnit * Object.keys(s.plots).length);
    expect(buyProtection(s, 'crops').ok).toBe(true);
    expect(s.coins).toBe(2000 - cost);
    expect(buyProtection(s, 'crops').msg).toBe('msg.protectionActive');
    expect(isProtected(s, 'crops')).toBe(true);
    s.day = Math.ceil(s.day / DAYS_PER_SEASON) * DAYS_PER_SEASON;
    expect(isProtected(s, 'crops')).toBe(false);
  });

  it('con la prevencion comprada, el percance no llega y se avisa', () => {
    const s = game();
    s.day = DAYS_PER_SEASON + 5; // verano: hay plagas
    // solo puede salir la plaga
    for (const id of EVENT_IDS) if (id !== 'pests') s.events.cooldowns[id] = 1e9;
    buyProtection(s, 'crops');
    const notices: Notice[] = [];
    for (let i = 0; i < 300 && notices.length === 0; i++) {
      s.events.lastDay = -1e9;
      maybeTriggerEvent(s, notices);
      expect(s.events.pending).toBeNull();
    }
    expect(notices[0]).toMatchObject({ msg: 'msg.prevented', params: { protection: 'crops', eventTitle: 'pests' } });
    expect(s.events.cooldowns.pests).toBeGreaterThan(s.day);
  });
});

describe('deuda con el senor', () => {
  it('lo que no se paga queda como deuda, crece y se cobra primero en las cuentas siguientes', () => {
    const s = game();
    s.coins = 0;
    s.stats.seasonEarned = 1000;
    const card = settleSeason(s, 'summer');
    const debt = Number(card.params?.debt);
    expect(debt).toBeGreaterThan(0);
    expect(s.debt).toBe(debt);
    s.coins = 5000;
    s.stats.seasonEarned = 0;
    const next = settleSeason(s, 'autumn');
    const interest = Math.ceil(debt * PROGRESSION.taxes.debtInterest);
    expect(next.params).toMatchObject({ debtInterest: interest, debtPaid: debt + interest, debt: 0 });
  });

  it('con mucha deuda se embargan primero los arriendos y despues las parcelas compradas, nunca las del principio', () => {
    const s = game();
    // un arriendo y una parcela comprada
    const grass = s.map.tiles.filter((t) => t.kind === 'grass');
    grass[0].kind = 'tenant';
    s.leases = 1;
    const bought = grass[1];
    bought.kind = 'soil';
    s.plots[plotKey(bought.x, bought.y)] = { crop: null, growth: 0 };
    s.landBought = 1;
    s.debt = PROGRESSION.taxes.seizeDebt * 3;
    expect(seizeForDebt(s)).toBe('lease');
    expect(grass[0].kind).toBe('grass');
    expect(s.leases).toBe(0);
    expect(seizeForDebt(s)).toBe('plot');
    expect(tileAt(s, bought.x, bought.y)?.kind).toBe('grass');
    expect(s.plots[plotKey(bought.x, bought.y)]).toBeUndefined();
    // las parcelas del mapa de inicio no se tocan
    const startPlots = START.map.rows.flatMap((row, y) => [...row].flatMap((ch, x) => (START.map.legend[ch] === 'soil' ? [plotKey(x, y)] : [])));
    s.debt = PROGRESSION.taxes.seizeDebt * 3;
    expect(seizeForDebt(s)).toBeNull();
    for (const k of startPlots) expect(s.plots[k]).toBeDefined();
  });
});

describe('conservar el rango', () => {
  it('sin el favor que pide el rango: aviso en unas cuentas y, si sigue igual, se pierde', () => {
    const s = game();
    s.rank = 'landowner';
    s.rep.baron = 30;
    expect(checkRankKeep(s)).toEqual({ warning: true, lost: null });
    expect(s.rank).toBe('landowner');
    expect(checkRankKeep(s)).toEqual({ warning: false, lost: 'landowner' });
    expect(s.rank).toBe('freeFarmer');
  });

  it('si se recupera el favor a tiempo, el aviso se olvida', () => {
    const s = game();
    s.rank = 'landowner';
    s.rep.baron = 30;
    checkRankKeep(s);
    s.rep.baron = 60;
    expect(checkRankKeep(s)).toEqual({ warning: false, lost: null });
    s.rep.baron = 30;
    expect(checkRankKeep(s).warning).toBe(true);
    expect(s.rank).toBe('landowner');
  });
});

describe('partida version 11', () => {
  it('empieza sin deuda, sin prevencion, con tiempo normal y sin aviso', () => {
    const s = createNewGame(3) as Partial<GameState>;
    delete s.debt;
    delete s.protections;
    delete s.weather;
    delete s.rankWarning;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 11, savedAt: '2026-10-20T15:00:00Z', state: s }));
    expect(back).toMatchObject({ debt: 0, protections: { crops: 0, animals: 0 }, weather: 'normal', rankWarning: false });
  });
});
