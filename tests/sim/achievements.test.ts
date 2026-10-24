import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { ACHIEVEMENTS, PROGRESSION } from '../../src/sim/data';
import { achievementMet, checkAchievements } from '../../src/sim/achievements';
import { settleSeason } from '../../src/sim/taxes';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { deserialize, serialize } from '../../src/save/serialize';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';

describe('libro de cuentas', () => {
  it('cada cierre de estacion queda apuntado con monedas, ingresos, gastos y relaciones', () => {
    const s = createNewGame(3);
    s.day = (PROGRESSION.taxes.graceSeasons + 1) * DAYS_PER_SEASON;
    s.stats.seasonEarned = 500;
    s.coins = 900;
    settleSeason(s, 'spring');
    expect(s.history.length).toBe(1);
    const row = s.history[0];
    expect(row.income).toBe(500);
    expect(row.costs).toBeGreaterThan(0);
    expect(row.coins).toBe(s.coins);
    expect(row.rep).toEqual(s.rep);
  });

  it('guarda como mucho historyMax estaciones', () => {
    const s = createNewGame(3);
    for (let i = 0; i < ACHIEVEMENTS.historyMax + 5; i++) settleSeason(s, 'spring');
    expect(s.history.length).toBe(ACHIEVEMENTS.historyMax);
  });
});

describe('logros', () => {
  it('se consiguen una vez, con aviso', () => {
    const s = createNewGame(3);
    s.stats.harvested = 1;
    const first = checkAchievements(s);
    expect(first.map((n) => n.params?.achievement)).toContain('firstHarvest');
    expect(s.achievements.firstHarvest).toBe(s.day);
    expect(checkAchievements(s).map((n) => n.params?.achievement)).not.toContain('firstHarvest');
  });

  it('un año sin hambre pide aldeanos y que nadie haya pasado hambre en ese tiempo', () => {
    const s = createNewGame(3);
    const a = ACHIEVEMENTS.achievements.find((x) => x.id === 'noHunger')!;
    s.day = 200;
    s.stats.lastHungerDay = 150;
    s.villagers = [{ id: 1, name: 'Ana', job: 'farmer', tool: 0, hungry: 0, crop: 'auto' }];
    expect(achievementMet(s, a)).toBe(false);
    s.stats.lastHungerDay = 60;
    expect(achievementMet(s, a)).toBe(true);
  });

  it('al cargar una partida anterior, los ya cumplidos se dan por conseguidos sin aviso', () => {
    const s = createNewGame(3);
    s.stats.harvested = 5000;
    const old = JSON.parse(serialize(s));
    delete old.state.achievements;
    delete old.state.history;
    old.version = 20;
    const back = deserialize(JSON.stringify(old));
    expect(back.achievements.bigHarvest).toBeDefined();
    expect(checkAchievements(back).map((n) => n.params?.achievement)).not.toContain('bigHarvest');
  });

  it('cada logro tiene nombre y descripcion en los dos idiomas', () => {
    for (const a of ACHIEVEMENTS.achievements) {
      for (const dict of [es, en] as Record<string, string>[]) {
        expect(dict[`achievement.${a.id}`], a.id).toBeTruthy();
        expect(dict[`achievement.${a.id}.desc`], a.id).toBeTruthy();
      }
    }
  });
});
