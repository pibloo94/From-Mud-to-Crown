import { describe, expect, it } from 'vitest';
import { createNewGame, plotKey } from '../../src/sim/state';
import { advanceDay, collect, cropStage, harvest, interact, isRipe, plant, sell, tick } from '../../src/sim/rules';
import { CROPS, PRODUCTS, START } from '../../src/sim/data';
import { DAY_MS, dateFromDay } from '../../src/sim/calendar';
import type { GameState } from '../../src/sim/types';

function firstPlot(state: GameState): [number, number] {
  const [x, y] = Object.keys(state.plots)[0].split(',').map(Number);
  return [x, y];
}

describe('partida nueva', () => {
  it('empieza con los recursos iniciales y en pausa', () => {
    const s = createNewGame();
    expect(s.coins).toBe(START.coins);
    expect(s.speed).toBe(0);
    expect(s.herds.chicken.count).toBe(START.herds.chicken);
    expect(s.herds.cow.count).toBe(START.herds.cow);
    expect(Object.keys(s.plots).length).toBe(4);
    expect(s.map.tiles.length).toBe(s.map.width * s.map.height);
  });
});

describe('tiempo', () => {
  it('no avanza en pausa', () => {
    const s = createNewGame();
    expect(tick(s, 100)).toBe(0);
    expect(s.dayProgress).toBe(0);
  });

  it('a x3 avanza tres veces mas rapido que a x1', () => {
    const a = createNewGame();
    const b = createNewGame();
    a.speed = 1;
    b.speed = 3;
    tick(a, 100);
    tick(b, 100);
    expect(b.dayProgress).toBeCloseTo(a.dayProgress * 3);
  });

  it('pasa un dia completo tras DAY_MS a x1', () => {
    const s = createNewGame();
    s.speed = 1;
    let days = 0;
    for (let t = 0; t < DAY_MS; t += 100) days += tick(s, 100);
    expect(days).toBe(1);
    expect(s.day).toBe(1);
  });

  it('limita los saltos grandes (pestana en segundo plano)', () => {
    const s = createNewGame();
    s.speed = 3;
    expect(tick(s, 60_000)).toBe(0);
  });

  it('calcula estacion y ano', () => {
    expect(dateFromDay(0)).toEqual({ year: 1, season: 'spring', dayOfSeason: 1 });
    expect(dateFromDay(30)).toEqual({ year: 1, season: 'summer', dayOfSeason: 1 });
    expect(dateFromDay(120)).toEqual({ year: 2, season: 'spring', dayOfSeason: 1 });
  });
});

describe('cultivos', () => {
  it('sembrar cuesta monedas y la cosecha llega tras growDays', () => {
    const s = createNewGame();
    const [x, y] = firstPlot(s);
    const def = CROPS.wheat;
    expect(plant(s, x, y).ok).toBe(true);
    expect(s.coins).toBe(START.coins - def.seedCost);
    expect(harvest(s, x, y).ok).toBe(false);
    for (let d = 0; d < def.growDays; d++) advanceDay(s);
    expect(isRipe(s.plots[plotKey(x, y)])).toBe(true);
    const r = harvest(s, x, y);
    expect(r.ok).toBe(true);
    expect(s.inventory.wheat).toBe(def.yield);
    expect(s.plots[plotKey(x, y)].crop).toBeNull();
  });

  it('las fases de dibujo avanzan y terminan en madura', () => {
    const s = createNewGame();
    const [x, y] = firstPlot(s);
    plant(s, x, y);
    const plot = s.plots[plotKey(x, y)];
    const stages = [cropStage(plot)];
    for (let d = 0; d < CROPS.wheat.growDays; d++) {
      advanceDay(s);
      stages.push(cropStage(plot));
    }
    expect(stages[0]).toBe(0);
    expect(stages.at(-1)).toBe(CROPS.wheat.stageSprites.length - 1);
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]);
  });

  it('no deja sembrar sin monedas ni fuera del campo', () => {
    const s = createNewGame();
    const [x, y] = firstPlot(s);
    s.coins = 0;
    expect(plant(s, x, y).msg).toBe('msg.notEnoughCoins');
    expect(plant(s, 0, 0).msg).toBe('msg.notFarmland');
  });

  it('tocar una parcela siembra, informa y cosecha', () => {
    const s = createNewGame();
    const [x, y] = firstPlot(s);
    expect(interact(s, x, y)).toMatchObject({ ok: true, msg: 'msg.planted' });
    expect(interact(s, x, y)).toMatchObject({ ok: false, msg: 'msg.growing' });
    for (let d = 0; d < CROPS.wheat.growDays; d++) advanceDay(s);
    expect(interact(s, x, y)).toMatchObject({ ok: true, msg: 'msg.harvested' });
  });
});

describe('animales', () => {
  it('las gallinas ponen un huevo por gallina y dia', () => {
    const s = createNewGame();
    advanceDay(s);
    expect(s.herds.chicken.stored).toBe(s.herds.chicken.count);
    expect(collect(s, 'chicken').ok).toBe(true);
    expect(s.inventory.egg).toBe(s.herds.chicken.count);
    expect(collect(s, 'chicken').ok).toBe(false);
  });

  it('la vaca da leche cada dos dias y la produccion tiene tope', () => {
    const s = createNewGame();
    advanceDay(s);
    expect(s.herds.cow.stored).toBe(0);
    advanceDay(s);
    expect(s.herds.cow.stored).toBe(1);
    for (let d = 0; d < 50; d++) advanceDay(s);
    expect(s.herds.cow.stored).toBe(3);
  });
});

describe('mercado', () => {
  it('vende al precio fijo', () => {
    const s = createNewGame();
    s.inventory.milk = 3;
    const r = sell(s, 'milk', 2);
    expect(r.ok).toBe(true);
    expect(s.coins).toBe(START.coins + 2 * PRODUCTS.milk.price);
    expect(s.inventory.milk).toBe(1);
  });

  it('vender todo y no vender lo que no tienes', () => {
    const s = createNewGame();
    s.inventory.egg = 5;
    sell(s, 'egg', 'all');
    expect(s.inventory.egg).toBe(0);
    expect(sell(s, 'egg', 1).ok).toBe(false);
    expect(sell(s, 'wheat', 99).ok).toBe(false);
  });
});
