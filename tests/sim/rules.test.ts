import { describe, expect, it } from 'vitest';
import { createNewGame, plotKey, tileAt } from '../../src/sim/state';
import {
  advanceDay,
  buyAnimal,
  buyLand,
  canExpandAt,
  collect,
  cropStage,
  harvest,
  interact,
  isRipe,
  landCost,
  plant,
  plantableCrops,
  sell,
  tick,
} from '../../src/sim/rules';
import { CROPS, PROGRESSION, START } from '../../src/sim/data';
import { DAY_MS, DAYS_PER_SEASON, dateFromDay } from '../../src/sim/calendar';
import { priceOf } from '../../src/sim/market';
import type { GameState } from '../../src/sim/types';

const SEED = 42;
const newGame = () => {
  const s = createNewGame(SEED);
  s.events.lastDay = 1e9; // sin eventos aleatorios salvo que el test los pida
  return s;
};

function firstPlot(state: GameState): [number, number] {
  const [x, y] = Object.keys(state.plots)[0].split(',').map(Number);
  return [x, y];
}

function days(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) advanceDay(state);
}

/** Primera baldosa de hierba junto al campo. */
function expandable(state: GameState): [number, number] {
  const t = state.map.tiles.find((tl) => canExpandAt(state, tl.x, tl.y))!;
  return [t.x, t.y];
}

describe('partida nueva', () => {
  it('empieza con los recursos iniciales, nivel 1 y en pausa', () => {
    const s = newGame();
    expect(s.coins).toBe(START.coins);
    expect(s.speed).toBe(0);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.herds.chicken.count).toBe(START.herds.chicken);
    expect(Object.keys(s.plots).length).toBe(4);
    expect(s.map.tiles.length).toBe(s.map.width * s.map.height);
  });

  it('la misma semilla da la misma partida', () => {
    expect(createNewGame(7)).toEqual(createNewGame(7));
  });
});

describe('tiempo', () => {
  it('no avanza en pausa', () => {
    const s = newGame();
    expect(tick(s, 100).days).toBe(0);
    expect(s.dayProgress).toBe(0);
  });

  it('a x3 avanza tres veces mas rapido que a x1', () => {
    const a = newGame();
    const b = newGame();
    a.speed = 1;
    b.speed = 3;
    tick(a, 100);
    tick(b, 100);
    expect(b.dayProgress).toBeCloseTo(a.dayProgress * 3);
  });

  it('pasa un dia completo tras DAY_MS a x1', () => {
    const s = newGame();
    s.speed = 1;
    let n = 0;
    for (let t = 0; t < DAY_MS; t += 100) n += tick(s, 100).days;
    expect(n).toBe(1);
  });

  it('limita los saltos grandes (pestana en segundo plano)', () => {
    const s = newGame();
    s.speed = 3;
    expect(tick(s, 60_000).days).toBe(0);
  });

  it('se detiene mientras hay un evento esperando decision', () => {
    const s = newGame();
    s.speed = 3;
    s.events.pending = { id: 'fair' };
    for (let i = 0; i < 100; i++) tick(s, 250);
    expect(s.day).toBe(0);
  });

  it('calcula estacion y ano', () => {
    expect(dateFromDay(0)).toEqual({ year: 1, season: 'spring', dayOfSeason: 1 });
    expect(dateFromDay(30)).toEqual({ year: 1, season: 'summer', dayOfSeason: 1 });
    expect(dateFromDay(120)).toEqual({ year: 2, season: 'spring', dayOfSeason: 1 });
  });

  it('avisa al empezar una estacion', () => {
    const s = newGame();
    s.day = DAYS_PER_SEASON - 1;
    expect(advanceDay(s).map((n) => n.msg)).toContain('msg.season.summer');
  });
});

describe('cultivos', () => {
  it('sembrar cuesta monedas y la cosecha llega tras growDays y da experiencia', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    const def = CROPS.wheat;
    expect(plant(s, x, y, 'wheat').result.ok).toBe(true);
    expect(s.coins).toBe(START.coins - def.seedCost);
    expect(harvest(s, x, y).result.ok).toBe(false);
    days(s, def.growDays);
    expect(isRipe(s.plots[plotKey(x, y)])).toBe(true);
    expect(harvest(s, x, y).result.ok).toBe(true);
    expect(s.inventory.wheat).toBe(def.yield);
    expect(s.xp).toBe(def.xp);
  });

  it('las fases de dibujo avanzan y terminan en madura', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    plant(s, x, y, 'wheat');
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

  it('no deja sembrar sin monedas, fuera del campo ni cultivos bloqueados', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    expect(plant(s, x, y, 'carrot').result.msg).toBe('msg.cropLocked');
    s.coins = 0;
    expect(plant(s, x, y, 'wheat').result.msg).toBe('msg.notEnoughCoins');
    expect(plant(s, 0, 0, 'wheat').result.msg).toBe('msg.notFarmland');
  });

  it('en invierno solo se siembra col y el trigo deja de crecer', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    plant(s, x, y, 'wheat');
    s.day = DAYS_PER_SEASON * 3; // primer dia de invierno
    s.level = 6;
    expect(plantableCrops(s)).toEqual(['cabbage']);
    const before = s.plots[plotKey(x, y)].growth;
    advanceDay(s);
    expect(s.plots[plotKey(x, y)].growth).toBe(before);
  });

  it('con un solo cultivo disponible, tocar la parcela siembra directamente', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    const r = interact(s, x, y);
    expect(r.kind).toBe('done');
    expect(s.plots[plotKey(x, y)].crop).toBe('wheat');
  });

  it('con varios cultivos, tocar la parcela pregunta cual sembrar', () => {
    const s = newGame();
    s.level = 3;
    const [x, y] = firstPlot(s);
    const r = interact(s, x, y);
    expect(r.kind).toBe('choosePlant');
    if (r.kind === 'choosePlant') expect(r.crops).toEqual(['wheat', 'carrot']);
  });

  it('una cosecha que no cabe en el granero se queda en el campo', () => {
    const s = newGame();
    const [x, y] = firstPlot(s);
    plant(s, x, y, 'wheat');
    days(s, CROPS.wheat.growDays);
    s.inventory.milk = 29; // capacidad inicial 30
    expect(harvest(s, x, y).result.msg).toBe('msg.granaryFull');
    expect(isRipe(s.plots[plotKey(x, y)])).toBe(true);
    s.inventory.milk = 0;
    expect(harvest(s, x, y).result.ok).toBe(true);
  });

  it('los vales del monje permiten sembrar gratis', () => {
    const s = newGame();
    s.seedVouchers = 1;
    s.coins = 0;
    const [x, y] = firstPlot(s);
    expect(plant(s, x, y, 'wheat').result.msg).toBe('msg.plantedFree');
    expect(s.seedVouchers).toBe(0);
  });
});

describe('tierra', () => {
  it('a nivel 1 no se puede comprar tierra', () => {
    const s = newGame();
    const [x, y] = expandable(s);
    expect(buyLand(s, x, y).result.msg).toBe('msg.landLocked');
  });

  it('a nivel 2 se rotura una parcela junto al campo y la siguiente es mas cara', () => {
    const s = newGame();
    s.level = 2;
    s.coins = 100;
    const cost = landCost(s);
    const [x, y] = expandable(s);
    expect(interact(s, x, y)).toMatchObject({ kind: 'offerLand', cost });
    expect(buyLand(s, x, y).result.ok).toBe(true);
    expect(tileAt(s, x, y)!.kind).toBe('soil');
    expect(s.plots[plotKey(x, y)]).toEqual({ crop: null, growth: 0 });
    expect(s.coins).toBe(100 - cost);
    expect(landCost(s)).toBeGreaterThan(cost);
  });

  it('respeta el maximo de parcelas del nivel', () => {
    const s = newGame();
    s.level = 2;
    s.coins = 10_000;
    for (let i = 0; i < 10; i++) {
      const [x, y] = expandable(s);
      buyLand(s, x, y);
    }
    expect(Object.keys(s.plots).length).toBe(PROGRESSION.levels[1].maxPlots);
    const [x, y] = expandable(s);
    expect(buyLand(s, x, y).result.msg).toBe('msg.landLimit');
  });

  it('no se rotura hierba lejos del campo', () => {
    const s = newGame();
    s.level = 2;
    s.coins = 100;
    expect(canExpandAt(s, 2, 0)).toBe(false);
  });
});

describe('animales', () => {
  it('las gallinas ponen un huevo por gallina y dia', () => {
    const s = newGame();
    advanceDay(s);
    expect(s.herds.chicken.stored).toBe(s.herds.chicken.count);
    expect(collect(s, 'chicken').result.ok).toBe(true);
    expect(s.inventory.egg).toBe(s.herds.chicken.count);
    expect(collect(s, 'chicken').result.ok).toBe(false);
  });

  it('la vaca da leche cada dos dias y la produccion tiene tope', () => {
    const s = newGame();
    advanceDay(s);
    expect(s.herds.cow.stored).toBe(0);
    advanceDay(s);
    expect(s.herds.cow.stored).toBe(1);
    days(s, 50);
    expect(s.herds.cow.stored).toBe(3);
  });

  it('se compran gallinas desde el nivel 4 y vacas desde el 5, si caben', () => {
    const s = newGame();
    s.coins = 500;
    expect(buyAnimal(s, 'chicken').result.ok).toBe(false);
    s.level = 4;
    expect(buyAnimal(s, 'chicken').result.ok).toBe(true);
    expect(s.herds.chicken.count).toBe((START.herds.chicken ?? 0) + 1);
    expect(buyAnimal(s, 'cow').result.msg).toBe('msg.animalLocked');
    s.level = 5;
    expect(buyAnimal(s, 'cow').result.msg).toBe('msg.animalLimit');
    s.buildings.pen = 2; // pesebre + establo: caben dos vacas
    expect(buyAnimal(s, 'cow').result.ok).toBe(true);
    expect(buyAnimal(s, 'cow').result.msg).toBe('msg.animalLimit');
    // el gallinero tambien tiene tope
    s.herds.chicken.count = 6;
    expect(buyAnimal(s, 'chicken').result.msg).toBe('msg.animalLimit');
  });
});

describe('mercado', () => {
  it('vende al precio actual y da experiencia', () => {
    const s = newGame();
    s.inventory.milk = 3;
    const price = priceOf(s, 'milk');
    const r = sell(s, 'milk', 2);
    expect(r.result.ok).toBe(true);
    expect(s.coins).toBe(START.coins + 2 * price);
    expect(s.inventory.milk).toBe(1);
    expect(s.xp).toBeCloseTo(2 * price * PROGRESSION.xpPerCoinSold);
  });

  it('vender todo y no vender lo que no tienes', () => {
    const s = newGame();
    s.inventory.egg = 5;
    sell(s, 'egg', 'all');
    expect(s.inventory.egg).toBe(0);
    expect(sell(s, 'egg', 1).result.ok).toBe(false);
  });
});
