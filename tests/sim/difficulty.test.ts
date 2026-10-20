import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { priceOf } from '../../src/sim/market';
import { seasonBill } from '../../src/sim/taxes';
import { upkeepBill } from '../../src/sim/upkeep';
import { dailyFood } from '../../src/sim/pantry';
import { isBadWeather, rollWeather, seizeLimit } from '../../src/sim/risk';
import { hireVillager } from '../../src/sim/villagers';
import { upgradeBuilding } from '../../src/sim/buildings';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { PRODUCT_IDS, PROGRESSION } from '../../src/sim/data';
import { deserialize } from '../../src/save/serialize';
import type { Difficulty, GameState } from '../../src/sim/types';

/** La misma granja en cada dificultad: mismos precios de partida, dos aldeanos y ventas. */
function farm(level: Difficulty): GameState {
  const s = createNewGame(17, level);
  s.events.lastDay = 1e9;
  for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
  s.level = 10;
  s.coins = 5000;
  s.materials = { wood: 99, stone: 99, iron: 99 };
  for (let i = 0; i < 10 && s.villagers.length < 2; i++) if (!hireVillager(s).ok) upgradeBuilding(s, 'house');
  s.day = PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON + 5;
  s.stats.seasonEarned = 3000;
  return s;
}

describe('dificultad', () => {
  it('se elige al crear la partida y por defecto es Normal', () => {
    expect(createNewGame(1).difficulty).toBe('normal');
    expect(createNewGame(1, 'hard').difficulty).toBe('hard');
  });

  it('Facil vende mas caro y paga menos; Dificil, al reves', () => {
    const [easy, normal, hard] = (['easy', 'normal', 'hard'] as const).map(farm);
    expect(priceOf(easy, 'cheese')).toBeGreaterThan(priceOf(normal, 'cheese'));
    expect(priceOf(hard, 'cheese')).toBeLessThan(priceOf(normal, 'cheese'));
    const taxes = (s: GameState) => seasonBill(s).tithe + seasonBill(s).tribute;
    expect(taxes(easy)).toBeLessThan(taxes(normal));
    expect(taxes(hard)).toBeGreaterThan(taxes(normal));
    const fixed = (s: GameState) => upkeepBill(s).wages + upkeepBill(s).maintenance;
    expect(fixed(easy)).toBeLessThan(fixed(normal));
    expect(fixed(hard)).toBeGreaterThan(fixed(normal));
    expect(dailyFood(easy)).toBeLessThan(dailyFood(normal));
    expect(dailyFood(hard)).toBeGreaterThan(dailyFood(normal));
    expect(seizeLimit(easy)).toBeGreaterThan(seizeLimit(normal));
    expect(seizeLimit(hard)).toBeLessThan(seizeLimit(normal));
  });

  it('en Dificil salen mas estaciones de mal tiempo que en Facil', () => {
    const bad = (level: Difficulty) => {
      const s = createNewGame(5, level);
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const id = rollWeather(s, 'winter');
        if (isBadWeather(PROGRESSION.weather.winter.find((w) => w.id === id)!)) n++;
        s.modifiers = [];
      }
      return n;
    };
    expect(bad('hard')).toBeGreaterThan(bad('normal'));
    expect(bad('normal')).toBeGreaterThan(bad('easy'));
  });

  it('las partidas de la version 12 se juegan en Normal', () => {
    const s = createNewGame(3) as Partial<GameState>;
    delete s.difficulty;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 12, savedAt: '2026-10-20T16:00:00Z', state: s }));
    expect(back.difficulty).toBe('normal');
  });
});
