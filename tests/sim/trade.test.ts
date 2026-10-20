import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { advanceDay, checkRank } from '../../src/sim/rules';
import {
  buyCart,
  buyStall,
  caravansReturn,
  cartCapacity,
  idleCarts,
  maxCarts,
  quoteCaravan,
  sendCaravan,
  townPrice,
  townToll,
} from '../../src/sim/trade';
import { priceOf } from '../../src/sim/market';
import { startEvent, resolveEvent, eligibleEvents } from '../../src/sim/events';
import { unlocksAt } from '../../src/sim/progress';
import { PRODUCT_IDS, TRADE } from '../../src/sim/data';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState } from '../../src/sim/types';

function trader(level = 16): GameState {
  const s = createNewGame(31);
  s.events.lastDay = 1e9;
  for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
  s.level = level;
  s.day = 100;
  s.coins = 5000;
  s.materials = { wood: 999, stone: 999, iron: 999 };
  s.buildings.granary = 5;
  return s;
}

function withCart(): GameState {
  const s = trader();
  expect(buyCart(s).ok).toBe(true);
  return s;
}

describe('carretas y puesto', () => {
  it('el comercio se abre en su nivel y las carretas tienen tope por nivel', () => {
    const s = trader(TRADE.unlockLevel - 1);
    expect(buyCart(s).msg).toBe('msg.upgradeLocked');
    s.level = TRADE.unlockLevel;
    expect(maxCarts(s)).toBe(1);
    expect(buyCart(s).ok).toBe(true);
    expect(buyCart(s).msg).toBe('msg.upgradeLocked');
    s.level = 16;
    expect(buyCart(s).ok).toBe(true);
    expect(buyCart(s).msg).toBe('msg.upgradeLocked');
    s.level = 18;
    expect(buyCart(s).ok).toBe(true);
    expect(buyCart(s).msg).toBe('msg.buildingMaxed');
    expect(s.carts).toBe(3);
  });

  it('una carreta cuesta monedas, madera y hierro', () => {
    const s = trader();
    s.materials = { wood: 0, stone: 0, iron: 0 };
    expect(buyCart(s).msg).toBe('msg.missingMaterials');
    s.materials = { wood: 15, stone: 0, iron: 2 };
    expect(buyCart(s).ok).toBe(true);
    expect(s.coins).toBe(5000 - TRADE.cart.cost);
  });

  it('el puesto propio sube los precios del mercado de casa', () => {
    const s = trader();
    const egg = priceOf(s, 'cheese');
    expect(buyStall(s).ok).toBe(true);
    expect(priceOf(s, 'cheese')).toBe(Math.round(egg * TRADE.stall.priceBonus));
    expect(buyStall(s).msg).toBe('msg.buildingMaxed');
  });
});

describe('caravanas', () => {
  it('cada villa paga mas por lo que le falta', () => {
    const s = trader();
    expect(townPrice(s, 'saltport', 'cheese')).toBe(Math.round(priceOf(s, 'cheese') * 1.8));
    expect(townPrice(s, 'saltport', 'egg')).toBe(Math.max(1, Math.round(priceOf(s, 'egg') * 0.9)));
  });

  it('el presupuesto avisa de lo que impide salir', () => {
    const s = trader();
    s.inventory.cheese = 10;
    expect(quoteCaravan(s, 'saltport', { cheese: 5 }, {}, false).problem).toBe('trade.problem.noCart');
    buyCart(s);
    expect(quoteCaravan(s, 'saltport', {}, {}, false).problem).toBe('trade.problem.empty');
    expect(quoteCaravan(s, 'saltport', { cheese: 11 }, {}, false).problem).toBe('trade.problem.notEnough');
    s.inventory.wheat = 200;
    expect(quoteCaravan(s, 'saltport', { wheat: cartCapacity(s) + 1 }, {}, false).problem).toBe('trade.problem.tooMuch');
    expect(quoteCaravan(s, 'saltport', {}, { iron: 1 }, false).problem).toBe('trade.problem.notSold');
    s.level = 14;
    expect(quoteCaravan(s, 'ironhold', { cheese: 1 }, {}, false).problem).toBe('trade.problem.locked');
    const q = quoteCaravan(s, 'saltport', { cheese: 5 }, { stone: 10 }, true);
    expect(q.problem).toBeNull();
    expect(q.upfront).toBe(townToll(s, 'saltport') + TRADE.towns.saltport.escort + 10 * 6);
    expect(q.risk).toBe(0);
  });

  it('una caravana se lleva la carga, paga al salir y vuelve con monedas y materiales', () => {
    const s = withCart();
    s.inventory.cheese = 10;
    const q = quoteCaravan(s, 'saltport', { cheese: 10 }, { stone: 5 }, true);
    const coins = s.coins;
    expect(sendCaravan(s, 'saltport', { cheese: 10 }, { stone: 5 }, true).ok).toBe(true);
    expect(s.inventory.cheese).toBe(0);
    expect(s.coins).toBe(coins - q.upfront);
    expect(idleCarts(s)).toBe(0);
    expect(sendCaravan(s, 'abbey', { cheese: 1 }, {}, false).msg).toBe('trade.problem.noCart');
    const stone = s.materials.stone;
    for (let d = 0; d < TRADE.towns.saltport.days - 1; d++) advanceDay(s);
    expect(s.caravans).toHaveLength(1);
    const notices = advanceDay(s);
    const card = notices.find((n) => n.card === 'caravan')!;
    expect(card.params).toMatchObject({ town: 'saltport', coins: q.value, robbed: 0 });
    expect(s.materials.stone).toBe(stone + 5);
    expect(s.caravans).toHaveLength(0);
    expect(s.stats.trades).toBe(1);
    expect(s.stats.seasonEarned).toBeGreaterThanOrEqual(q.value);
  });

  it('sin escolta, a veces la asaltan y se pierde la mitad', () => {
    let robbed = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = withCart();
      s.rng = seed * 7919 + 1;
      s.inventory.bread = 20;
      sendCaravan(s, 'ironhold', { bread: 20 }, {}, false);
      const value = s.caravans[0].value;
      s.day = s.caravans[0].returnDay;
      const [card] = caravansReturn(s);
      if (card.params?.robbed) {
        robbed++;
        expect(card.params.coins).toBe(Math.round(value * (1 - TRADE.robbedFraction)));
      }
    }
    expect(robbed).toBeGreaterThan(3);
    expect(robbed).toBeLessThan(35);
  });

  it('con el titulo de Burgues caben mas cosas y el peaje es menor', () => {
    const s = trader();
    const cap = cartCapacity(s);
    const toll = townToll(s, 'saltport');
    s.titles.push('burgher');
    expect(cartCapacity(s)).toBe(Math.round(cap * TRADE.burgher.capacityMult));
    expect(townToll(s, 'saltport')).toBe(Math.round(toll * TRADE.burgher.tollMult));
  });
});

describe('titulo de Burgues', () => {
  it('pide nivel, cinco caravanas y puesto propio', () => {
    const s = trader(15);
    s.stats.trades = 5;
    expect(checkRank(s).map((n) => n.params?.rank)).not.toContain('burgher');
    buyStall(s);
    expect(checkRank(s).map((n) => n.params?.rank)).toContain('burgher');
    expect(s.titles).toContain('burgher');
  });

  it('el arbol muestra villas, puesto y carretas por nivel', () => {
    expect(unlocksAt(13).towns).toEqual(['villaclara', 'abbey']);
    expect(unlocksAt(14).stall).toBe(true);
    expect(unlocksAt(16).carts).toBe(1);
  });
});

describe('eventos de comercio', () => {
  it('el puente caido solo sale con caravanas en camino y las retrasa', () => {
    const s = withCart();
    expect(eligibleEvents(s)).not.toContain('bridgeOut');
    s.inventory.wheat = 10;
    sendCaravan(s, 'villaclara', { wheat: 10 }, {}, false);
    expect(eligibleEvents(s)).toContain('bridgeOut');
    const ret = s.caravans[0].returnDay;
    startEvent(s, 'bridgeOut');
    resolveEvent(s, 'wait');
    expect(s.caravans[0].returnDay).toBe(ret + 2);
  });

  it('el buhonero de hierro vende hierro', () => {
    const s = trader();
    s.materials.iron = 0;
    startEvent(s, 'ironPeddler');
    resolveEvent(s, 'buy');
    expect(s.materials.iron).toBe(5);
  });
});

describe('partida version 6', () => {
  it('guarda carretas, caravanas y puesto', () => {
    const s = withCart();
    s.inventory.milk = 5;
    sendCaravan(s, 'abbey', { milk: 5 }, {}, true);
    buyStall(s);
    const back = deserialize(serialize(s));
    expect(back.carts).toBe(1);
    expect(back.caravans).toEqual(s.caravans);
    expect(back.stall).toBe(true);
  });

  it('una partida de la version 5 empieza sin carretas', () => {
    const s = trader() as unknown as Record<string, any>;
    for (const k of ['carts', 'caravans', 'nextCaravanId', 'stall']) delete s[k];
    delete s.stats.trades;
    delete s.stats.tradeEarned;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 5, savedAt: '2026-10-19T18:00:00Z', state: s }));
    expect(back.carts).toBe(0);
    expect(back.caravans).toEqual([]);
    expect(back.stall).toBe(false);
    expect(back.stats.trades).toBe(0);
  });
});
