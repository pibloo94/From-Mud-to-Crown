import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { COMMISSIONS } from '../../src/sim/data';
import { commissionDef, commissionProgress, completeCommission, offerCommissions, openCommissions } from '../../src/sim/commissions';
import { advanceDay } from '../../src/sim/rules';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';
import type { GameState, ProductId } from '../../src/sim/types';

function farm(): GameState {
  const s = createNewGame(9);
  s.events.lastDay = 1e9;
  s.level = 6;
  s.day = COMMISSIONS.firstDay;
  return s;
}

describe('encargos de los estamentos', () => {
  it('al empezar la estacion llega uno por estamento con algo que se pueda cumplir', () => {
    const s = farm();
    const notices = offerCommissions(s);
    expect(notices[0]?.msg).toBe('msg.commissionsNew');
    const estates = s.commissions.offers.map((o) => commissionDef(o.id)!.estate);
    expect(new Set(estates).size).toBe(estates.length);
    // Sin talleres no se piden tandas ni productos de taller.
    for (const o of s.commissions.offers) {
      const c = commissionDef(o.id)!;
      expect(c.batches).toBeUndefined();
      expect(Object.keys(c.goods ?? {})).not.toContain('bread');
    }
  });

  it('antes del primer dia no hay encargos', () => {
    const s = farm();
    s.day = COMMISSIONS.firstDay - DAYS_PER_SEASON;
    offerCommissions(s);
    expect(s.commissions.offers).toEqual([]);
  });

  it('cumplirlo entrega lo pedido, paga parte de su valor y da el favor del estamento', () => {
    const s = farm();
    s.commissions.offers = [{ id: 'villageFood', amount: 30, base: 0, done: false }];
    s.inventory.wheat = 10;
    expect(completeCommission(s, 0).ok).toBe(false);
    s.inventory.wheat = 40;
    const coins = s.coins;
    const rep = s.rep.commoners;
    const r = completeCommission(s, 0);
    expect(r.ok).toBe(true);
    expect(s.inventory.wheat).toBe(10);
    expect(s.coins).toBeGreaterThan(coins);
    expect(s.rep.commoners).toBe(rep + commissionDef('villageFood')!.rep);
    expect(s.character.deeds.for.commoners).toBe(1);
    expect(openCommissions(s)).toBe(0);
    expect(completeCommission(s, 0).ok).toBe(false);
  });

  it('los de monedas se pagan y los del gremio cuentan las tandas desde que se piden', () => {
    const s = farm();
    s.coins = 1000;
    s.commissions.offers = [
      { id: 'kingLevy', amount: 300, base: 0, done: false },
      { id: 'guildBatches', amount: 5, base: 0, done: false },
    ];
    expect(completeCommission(s, 0).ok).toBe(true);
    expect(s.coins).toBe(700);
    expect(commissionProgress(s, 1)).toEqual({ have: 0, need: 5 });
  });

  it('se renuevan al cambiar de estacion', () => {
    const s = farm();
    s.day = 2 * DAYS_PER_SEASON - 1;
    s.commissions.offers = [{ id: 'kingLevy', amount: 300, base: 0, done: true }];
    advanceDay(s);
    expect(s.commissions.offers.every((o) => !o.done)).toBe(true);
    expect(s.commissions.offers.length).toBeGreaterThan(0);
  });

  it('cada encargo tiene texto en los dos idiomas y pide algo', () => {
    for (const c of COMMISSIONS.templates) {
      expect(!!c.goods || !!c.coins || !!c.batches, c.id).toBe(true);
      for (const p of Object.keys(c.goods ?? {})) expect(['wheat', 'carrot', 'cabbage', 'egg', 'milk', 'flour', 'bread', 'cheese']).toContain(p as ProductId);
      for (const dict of [es, en] as Record<string, string>[]) expect(dict[`commission.${c.id}`], c.id).toBeTruthy();
    }
  });
});
