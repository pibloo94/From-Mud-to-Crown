import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { addXp, hasFeature, levelProgress, nextLevelXp, unlocksAt, updateRank } from '../../src/sim/progress';
import { priceOf, priceTrend, rollPrices } from '../../src/sim/market';
import { eligibleEvents, maybeTriggerEvent, optionAvailable, resolveEvent, startEvent } from '../../src/sim/events';
import { advanceDay } from '../../src/sim/rules';
import { EVENTS, MAX_LEVEL, PRODUCTS, PRODUCT_IDS, PROGRESSION } from '../../src/sim/data';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { seasonBill } from '../../src/sim/taxes';
import { multiplier } from '../../src/sim/modifiers';

describe('experiencia y niveles', () => {
  it('sube varios niveles de golpe si hace falta', () => {
    const s = createNewGame(1);
    const reached = addXp(s, PROGRESSION.levels[2].xp);
    expect(reached).toEqual([2, 3]);
    expect(s.level).toBe(3);
  });

  it('no pasa del nivel maximo', () => {
    const s = createNewGame(1);
    addXp(s, 1e9);
    expect(s.level).toBe(MAX_LEVEL);
    expect(nextLevelXp(s.level)).toBeNull();
    expect(levelProgress(s)).toBe(1);
  });

  it('los umbrales de experiencia crecen', () => {
    const xs = PROGRESSION.levels.map((l) => l.xp);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('al nivel 5 se es Granjero libre', () => {
    const s = createNewGame(1);
    expect(s.rank).toBe('peasant');
    s.level = 4;
    expect(updateRank(s)).toBeNull();
    s.level = 5;
    expect(updateRank(s)).toBe('freeFarmer');
    expect(s.rank).toBe('freeFarmer');
    expect(unlocksAt(5).rank).toBe('freeFarmer');
  });

  it('Terrateniente pide nivel, dias y favor del baron', () => {
    const s = createNewGame(1);
    s.level = 8;
    s.day = 239;
    s.rep.baron = 60;
    expect(updateRank(s)).toBe('freeFarmer');
    s.day = 240;
    s.rep.baron = 59;
    expect(updateRank(s)).toBeNull();
    s.rep.baron = 60;
    expect(updateRank(s)).toBe('landowner');
    // no aparece en el arbol de niveles porque no depende solo del nivel
    expect(unlocksAt(8).rank).toBeNull();
  });

  it('el arbol informa de mejoras y herramientas por nivel', () => {
    expect(unlocksAt(1).upgrades.map((u) => u.id)).toContain('pallet');
    expect(unlocksAt(2).tools).toEqual([{ tier: 1, cost: 20, jobs: ['farmer', 'herder', 'carter'] }]);
    expect(unlocksAt(9).upgrades.map((u) => `${u.building}.${u.id}`)).toEqual(['granary.stoneBarn', 'pen.dairy']);
  });

  it('cada nivel informa de lo que desbloquea', () => {
    expect(unlocksAt(2).features).toContain('buyLand');
    expect(unlocksAt(3).crops).toContain('carrot');
    expect(unlocksAt(6).crops).toContain('cabbage');
    const s = createNewGame(1);
    expect(hasFeature(s, 'buyLand')).toBe(false);
    s.level = 2;
    expect(hasFeature(s, 'buyLand')).toBe(true);
  });
});

describe('precios', () => {
  it('se mantienen dentro de la variacion de cada producto', () => {
    const s = createNewGame(3);
    for (let i = 0; i < 200; i++) {
      rollPrices(s);
      for (const p of PRODUCT_IDS) {
        expect(Math.abs(s.priceMult[p] - 1)).toBeLessThanOrEqual(PRODUCTS[p].volatility + 1e-9);
      }
    }
  });

  it('suben en invierno los productos escasos', () => {
    const s = createNewGame(3);
    for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
    const spring = priceOf(s, 'egg');
    s.day = DAYS_PER_SEASON * 3;
    expect(priceOf(s, 'egg')).toBeGreaterThanOrEqual(spring);
  });

  it('la feria multiplica los precios mientras dura', () => {
    const s = createNewGame(3);
    const base = priceOf(s, 'cabbage');
    s.marketBoost = { mult: 1.5, untilDay: 3 };
    expect(priceOf(s, 'cabbage')).toBe(Math.max(1, Math.round(base * 1.5)));
    expect(priceTrend(s, 'cabbage')).toBe(1);
    s.day = 3;
    expect(priceOf(s, 'cabbage')).toBe(base);
  });
});

describe('eventos', () => {
  it('no aparecen los primeros dias', () => {
    const s = createNewGame(5);
    for (let d = 0; d < PROGRESSION.events.firstDay - 1; d++) {
      advanceDay(s);
      expect(s.events.pending).toBeNull();
    }
  });

  it('terminan apareciendo y respetan la separacion minima', () => {
    const s = createNewGame(5);
    const seen: number[] = [];
    for (let d = 0; d < 200; d++) {
      advanceDay(s);
      if (s.events.pending) {
        seen.push(s.day);
        s.events.pending = null;
      }
    }
    expect(seen.length).toBeGreaterThan(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(PROGRESSION.events.minGap);
  });

  it('el jornalero necesita una cama libre y la feria no sale en invierno', () => {
    const s = createNewGame(5);
    s.level = 2;
    expect(eligibleEvents(s)).not.toContain('farmhand');
    s.buildings.house = 1;
    expect(eligibleEvents(s)).toContain('farmhand');
    s.day = DAYS_PER_SEASON * 3;
    expect(eligibleEvents(s)).not.toContain('fair');
  });

  it('entregar trigo en la leva cuesta trigo y da experiencia', () => {
    const s = createNewGame(5);
    s.inventory.wheat = 10;
    startEvent(s, 'levy');
    const give = EVENTS.levy.options.find((o) => o.id === 'give')!;
    expect(optionAvailable(s, give)).toBe(true);
    const out = resolveEvent(s, 'give');
    expect(out.result.msg).toBe('event.levy.result.give');
    expect(s.inventory.wheat).toBe(4);
    expect(s.xp).toBe(30);
    expect(s.events.pending).toBeNull();
  });

  it('una opcion que no se puede pagar no esta disponible', () => {
    const s = createNewGame(5);
    s.inventory.wheat = 2;
    startEvent(s, 'levy');
    expect(resolveEvent(s, 'give').result.msg).toBe('msg.optionUnavailable');
    expect(s.events.pending).not.toBeNull();
  });

  it('negarse a la leva enfada al baron y sube el tributo una estacion', () => {
    const s = createNewGame(5);
    s.day = 10;
    const bill = seasonBill(s).tribute;
    startEvent(s, 'levy');
    resolveEvent(s, 'refuse');
    expect(s.rep.baron).toBe(40);
    expect(s.flags).toContain('levyRefused');
    expect(seasonBill(s).tribute).toBe(Math.round(bill * 1.5));
    // sigue activo el dia de las cuentas y desaparece despues
    s.day = DAYS_PER_SEASON;
    expect(multiplier(s, 'tribute')).toBe(1.5);
    s.day = DAYS_PER_SEASON + 1;
    expect(multiplier(s, 'tribute')).toBe(1);
  });

  it('rechazar una oferta no tiene ninguna penalizacion', () => {
    const s = createNewGame(5);
    s.inventory.egg = 4;
    const before = JSON.stringify({ ...s, events: null });
    startEvent(s, 'peddler');
    resolveEvent(s, 'decline');
    expect(JSON.stringify({ ...s, events: null })).toBe(before);
    for (const ev of Object.values(EVENTS).filter((e) => e.category === 'offer')) {
      const decline = ev.options.find((o) => o.id === 'decline');
      expect(decline, 'cada oferta se puede rechazar').toBeDefined();
      expect(decline!.effects ?? {}).toEqual({});
      expect(decline!.risk).toBeUndefined();
    }
  });

  it('los hombres del baron solo vienen tras negarse a la leva', () => {
    const s = createNewGame(5);
    s.level = 5;
    expect(eligibleEvents(s)).not.toContain('baronsMen');
    s.flags.push('levyRefused');
    s.coins = 50;
    expect(eligibleEvents(s)).toContain('baronsMen');
    startEvent(s, 'baronsMen');
    resolveEvent(s, 'pay');
    expect(s.flags).not.toContain('levyRefused');
  });

  it('contratar al jornalero suma un aldeano', () => {
    const s = createNewGame(5);
    s.level = 2;
    s.buildings.house = 1;
    startEvent(s, 'farmhand');
    resolveEvent(s, 'hire');
    expect(s.villagers.length).toBe(1);
  });

  it('el zorro a veces se lleva una gallina si no se pone cerca', () => {
    let lost = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = createNewGame(seed);
      startEvent(s, 'fox');
      const out = resolveEvent(s, 'risk');
      if (out.result.msg.endsWith('.fail')) {
        lost++;
        expect(s.herds.chicken.count).toBe(3);
      }
    }
    expect(lost).toBeGreaterThan(5);
    expect(lost).toBeLessThan(35);
  });

  it('el buhonero paga los huevos al doble', () => {
    const s = createNewGame(5);
    s.inventory.egg = 4;
    const price = priceOf(s, 'egg');
    startEvent(s, 'peddler');
    const out = resolveEvent(s, 'sellEggs');
    expect(out.result.params?.coins).toBe(4 * price * 2);
    expect(s.inventory.egg).toBe(0);
  });

  it('maybeTriggerEvent elige solo eventos posibles', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createNewGame(seed);
      s.day = 10;
      const id = maybeTriggerEvent(s);
      if (id) expect(eligibleEvents({ ...s, events: { ...s.events, cooldowns: {} } })).toContain(id);
    }
  });
});
