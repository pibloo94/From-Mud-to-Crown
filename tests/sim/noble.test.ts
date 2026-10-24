import { describe, expect, it } from 'vitest';
import { createNewGame, tileAt } from '../../src/sim/state';
import { advanceDay, canExpandAt, canLeaseAt, checkRank, interact, openEastLands } from '../../src/sim/rules';
import {
  buyCharter,
  charterReady,
  doPatronage,
  hamletDues,
  hireSoldier,
  liegeOf,
  maxSoldiers,
  patronageProblem,
  upgradeHamlet,
  upgradeManor,
} from '../../src/sim/noble';
import { quoteCaravan, buyCart } from '../../src/sim/trade';
import { seasonBill } from '../../src/sim/taxes';
import { eligibleEvents, resolveEvent, startEvent } from '../../src/sim/events';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { HAMLET_IDS, NOBILITY, PRODUCT_IDS, START, TRADE } from '../../src/sim/data';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState } from '../../src/sim/types';

/** Terrateniente de nivel 20 con todo lo que pide la carta salvo la propia carta. */
function candidate(): GameState {
  const s = createNewGame(77);
  s.events.lastDay = 1e9;
  for (const p of PRODUCT_IDS) s.priceMult[p] = 1;
  s.level = 20;
  s.rank = 'landowner';
  openEastLands(s);
  s.titles = ['artisan'];
  s.day = 600;
  s.coins = 100_000;
  // Camino de la Corona en foco y con meritos de sobra (Baron y Conde lo piden).
  s.paths = { merits: { crown: 9999, faith: 0, craft: 0, trade: 0, people: 0 }, focus: 'crown', second: null };
  s.rep = { ...s.rep, nobles: 80, commoners: 70 };
  s.materials = { wood: 2000, stone: 2000, iron: 2000 };
  s.buildings.granary = 5;
  return s;
}

function lord(): GameState {
  const s = candidate();
  expect(buyCharter(s).ok).toBe(true);
  checkRank(s);
  expect(s.rank).toBe('lord');
  return s;
}

describe('carta de nobleza', () => {
  it('solo se vende cuando se cumple todo lo demas que pide Senor', () => {
    const s = candidate();
    s.titles = [];
    expect(charterReady(s)).toBe(false);
    expect(buyCharter(s).msg).toBe('noble.charterNotReady');
    s.titles = ['burgher'];
    // Senor pide Pueblo llano 50
    s.rep.commoners = 49;
    expect(charterReady(s)).toBe(false);
    s.rep.commoners = 70;
    s.day = 500;
    expect(charterReady(s)).toBe(false);
    s.day = 600;
    expect(charterReady(s)).toBe(true);
  });

  it('el rey avisa una vez de que vende la carta', () => {
    const s = candidate();
    expect(checkRank(s).map((n) => n.msg)).toContain('msg.charterReady');
    expect(checkRank(s).map((n) => n.msg)).not.toContain('msg.charterReady');
  });

  it('comprarla hace Senor, da prestigio y abre el feudo al sur', () => {
    const s = candidate();
    const height = s.map.height;
    const coins = s.coins;
    expect(buyCharter(s).ok).toBe(true);
    expect(s.coins).toBe(coins - NOBILITY.charter.cost);
    const notices = checkRank(s);
    expect(notices.find((n) => n.card === 'rank')?.params?.rank).toBe('lord');
    expect(s.noble.prestige).toBe(NOBILITY.charter.prestige);
    expect(s.map.height).toBe(height + NOBILITY.fief.rows.length);
    expect(s.map.tiles).toHaveLength(s.map.width * s.map.height);
    // La casa solariega ocupa un bloque de 2x2 casillas.
    expect(s.map.tiles.filter((t) => t.kind === 'manor')).toHaveLength(4);
    for (const id of HAMLET_IDS) expect(tileAt(s, NOBILITY.hamlets[id].x, NOBILITY.hamlets[id].y)?.kind).toBe('hamlet');
    expect(buyCharter(s).ok).toBe(false);
  });

  it('el feudo no se compra ni se arrienda como tierra de labor', () => {
    const s = lord();
    const y = START.map.rows.length;
    const fiefGrass = s.map.tiles.filter((t) => t.y >= y && t.kind === 'grass');
    expect(fiefGrass.length).toBeGreaterThan(0);
    for (const t of fiefGrass) {
      expect(canExpandAt(s, t.x, t.y)).toBe(false);
      expect(canLeaseAt(s, t.x, t.y)).toBe(false);
    }
    // Las tierras del este se siguen arrendando siendo noble.
    const east = s.map.tiles.find((t) => t.x >= 10 && t.y < y && t.kind === 'grass')!;
    expect(canLeaseAt(s, east.x, east.y)).toBe(true);
  });

  it('la casa y las aldeas se abren desde el mapa', () => {
    const s = lord();
    const manor = s.map.tiles.find((t) => t.kind === 'manor')!;
    expect(interact(s, manor.x, manor.y)).toEqual({ kind: 'manor', hamlet: null });
    const q = NOBILITY.hamlets.quarry;
    expect(interact(s, q.x, q.y)).toEqual({ kind: 'manor', hamlet: 'quarry' });
    // la aldea ocupa 2x2: cualquiera de sus casillas lleva a ella
    expect(interact(s, q.x + 1, q.y + 1)).toEqual({ kind: 'manor', hamlet: 'quarry' });
  });
});

describe('casa solariega y mesnada', () => {
  it('cada mejora cuesta monedas y materiales, da prestigio y plazas de soldado', () => {
    const s = candidate();
    expect(upgradeManor(s).msg).toBe('noble.notNoble');
    const t = lord();
    const prestige = t.noble.prestige;
    t.materials = { wood: 0, stone: 0, iron: 0 };
    expect(upgradeManor(t).msg).toBe('msg.missingMaterials');
    t.materials = { wood: 2000, stone: 2000, iron: 2000 };
    expect(upgradeManor(t).ok).toBe(true);
    expect(t.noble.prestige).toBe(prestige + NOBILITY.manor.upgrades[0].prestige);
    expect(maxSoldiers(t)).toBe(NOBILITY.manor.upgrades[0].effects.soldiers);
    while (upgradeManor(t).ok);
    expect(t.noble.manor).toBe(NOBILITY.manor.upgrades.length);
    expect(upgradeManor(t).msg).toBe('msg.buildingMaxed');
  });

  it('los soldados caben segun la casa y cobran soldada cada estacion', () => {
    const s = lord();
    expect(hireSoldier(s).msg).toBe('msg.noSoldierRoom');
    upgradeManor(s);
    for (let i = 0; i < maxSoldiers(s); i++) expect(hireSoldier(s).ok).toBe(true);
    expect(hireSoldier(s).msg).toBe('msg.noSoldierRoom');
    expect(seasonBill(s).upkeep).toBe(s.noble.soldiers * NOBILITY.soldiers.upkeep);
  });

  it('los que no cobran se marchan', () => {
    const s = lord();
    upgradeManor(s);
    hireSoldier(s);
    hireSoldier(s);
    hireSoldier(s);
    s.coins = 0;
    s.stats.seasonEarned = 0;
    s.day = DAYS_PER_SEASON * 30 - 1;
    const card = advanceDay(s).find((n) => n.card === 'season')!;
    expect(Number(card.params!.deserted)).toBeGreaterThan(0);
    expect(s.noble.soldiers).toBeLessThan(3);
  });

  it('con mesnada, la escolta de las caravanas sale gratis', () => {
    const s = lord();
    s.level = 20;
    buyCart(s);
    s.inventory.cheese = 10;
    const paid = quoteCaravan(s, 'saltport', { cheese: 5 }, {}, true);
    expect(paid.escortCost).toBe(TRADE.towns.saltport.escort);
    upgradeManor(s);
    for (let i = 0; i < NOBILITY.soldiers.escortMin; i++) hireSoldier(s);
    const free = quoteCaravan(s, 'saltport', { cheese: 5 }, {}, true);
    expect(free.escortCost).toBe(0);
    expect(free.risk).toBe(0);
  });

  it('la capilla baja el diezmo', () => {
    const s = lord();
    s.stats.seasonEarned = 1000;
    const before = seasonBill(s).tithe;
    while (s.noble.manor < 3) upgradeManor(s);
    expect(seasonBill(s).tithe).toBe(Math.round(before * 0.5));
  });
});

describe('aldeas vasallas', () => {
  it('se toman y se mejoran hasta nivel 3', () => {
    const s = lord();
    expect(upgradeHamlet(s, 'woodcutters').msg).toBe('msg.hamletTaken');
    expect(upgradeHamlet(s, 'woodcutters').msg).toBe('msg.hamletUpgraded');
    expect(upgradeHamlet(s, 'woodcutters').ok).toBe(true);
    expect(upgradeHamlet(s, 'woodcutters').msg).toBe('msg.buildingMaxed');
    expect(s.noble.hamlets.woodcutters).toBe(3);
  });

  it('cada estacion pagan rentas segun la lealtad y entregan su material', () => {
    const s = lord();
    upgradeHamlet(s, 'quarry');
    upgradeHamlet(s, 'mine');
    const lvl = NOBILITY.hamlets.quarry.levels[0];
    const dues = hamletDues(s);
    expect(dues.materials).toEqual({ stone: lvl.amount, iron: NOBILITY.hamlets.mine.levels[0].amount });
    const loyal = hamletDues(s).coins;
    s.rep.commoners = 20;
    expect(hamletDues(s).coins).toBeLessThan(loyal);
    const stone = s.materials.stone;
    const coins = s.coins;
    s.day = DAYS_PER_SEASON * 30 - 1;
    const expected = hamletDues(s).coins;
    const card = advanceDay(s).find((n) => n.card === 'season')!;
    expect(s.materials.stone).toBe(stone + lvl.amount);
    expect(Number(card.params!.dues)).toBe(expected);
    expect(card.params!.duesMats).toContain('stone:');
    expect(s.coins).toBeGreaterThan(coins - 1000);
  });
});

describe('mecenazgo', () => {
  it('una vez por estacion cada accion, a cambio de prestigio y reputacion', () => {
    const s = lord();
    const prestige = s.noble.prestige;
    expect(doPatronage(s, 'donation').ok).toBe(true);
    expect(s.noble.prestige).toBe(prestige + NOBILITY.patronage.donation.prestige);
    expect(patronageProblem(s, 'donation')).toBe('noble.patronage.done');
    s.day += DAYS_PER_SEASON;
    expect(patronageProblem(s, 'donation')).toBeNull();
  });

  it('el banquete gasta pan y queso y el torneo pide soldados', () => {
    const s = lord();
    expect(patronageProblem(s, 'banquet')).toBe('noble.patronage.cantPay');
    s.inventory.bread = 30;
    s.inventory.cheese = 30;
    expect(doPatronage(s, 'banquet').ok).toBe(true);
    expect(s.inventory.bread).toBe(10);
    expect(patronageProblem(s, 'tourney')).toBe('noble.patronage.needSoldiers');
  });
});

describe('escalera noble', () => {
  function readyForBaron(): GameState {
    const s = lord();
    s.day = 900;
    while (s.noble.manor < 3) upgradeManor(s);
    for (const id of HAMLET_IDS) upgradeHamlet(s, id);
    for (let i = 0; i < 6; i++) hireSoldier(s);
    s.noble.prestige = 800;
    return s;
  }

  it('Baron pide casa, aldeas, soldados y prestigio; el senor feudal pasa a ser el conde', () => {
    const s = readyForBaron();
    s.noble.prestige = 799;
    checkRank(s);
    expect(s.rank).toBe('lord');
    expect(liegeOf(s)).toBe('baron');
    s.noble.prestige = 800;
    expect(checkRank(s).find((n) => n.card === 'rank')?.params?.rank).toBe('baron');
    expect(liegeOf(s)).toBe('count');
    // la Nobleza es un estamento: no se empieza de cero con cada senor nuevo (las obras la suben)
    expect(s.rep.nobles).toBeGreaterThanOrEqual(80);
  });

  it('Conde pide todo al maximo y el favor del rey; despues se sirve al rey', () => {
    const s = readyForBaron();
    checkRank(s);
    s.day = 1260;
    while (upgradeManor(s).ok);
    for (const id of HAMLET_IDS) while (upgradeHamlet(s, id).ok);
    while (hireSoldier(s).ok);
    s.noble.prestige = 3000;
    // Conde sirve al rey: pide su favor ademas del de la nobleza
    s.rep.nobles = 60;
    s.rep.king = 69;
    checkRank(s);
    expect(s.rank).toBe('baron');
    s.rep.king = 70;
    checkRank(s);
    expect(s.rank).toBe('count');
    expect(liegeOf(s)).toBe('king');
  });

  it('los eventos del baron dejan de salir al ser Baron y salen los de la nobleza', () => {
    const s = readyForBaron();
    s.inventory.wheat = 50;
    s.inventory.milk = 50;
    s.inventory.bread = 50;
    expect(eligibleEvents(s)).toContain('levy');
    expect(eligibleEvents(s)).toContain('royalHost');
    expect(eligibleEvents(s)).toContain('bandits');
    checkRank(s);
    expect(eligibleEvents(s)).not.toContain('levy');
    expect(eligibleEvents(s)).not.toContain('feast');
    expect(eligibleEvents(s)).toContain('royalHost');
  });

  it('la hueste del rey se cubre con soldados y puede costar uno', () => {
    let lost = 0;
    for (let seed = 1; seed < 40; seed++) {
      const s = readyForBaron();
      s.rng = seed * 104729;
      const soldiers = s.noble.soldiers;
      const prestige = s.noble.prestige;
      startEvent(s, 'royalHost');
      const out = resolveEvent(s, 'send');
      expect(s.noble.prestige).toBe(prestige + 40);
      if (!out.result.ok) {
        lost++;
        expect(s.noble.soldiers).toBe(soldiers - 1);
      }
    }
    expect(lost).toBeGreaterThan(3);
    expect(lost).toBeLessThan(30);
  });
});

describe('partida version 7', () => {
  it('guarda la nobleza y el feudo', () => {
    const s = lord();
    upgradeManor(s);
    hireSoldier(s);
    upgradeHamlet(s, 'mine');
    const back = deserialize(serialize(s));
    expect(back.noble).toEqual(s.noble);
    expect(back.map.height).toBe(s.map.height);
    expect(back.rank).toBe('lord');
  });

  it('una partida de la version 6 empieza sin nobleza', () => {
    const s = candidate() as unknown as Record<string, any>;
    delete s.noble;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 6, savedAt: '2026-10-19T18:00:00Z', state: s }));
    expect(back.noble.charter).toBe(false);
    expect(back.noble.hamlets).toEqual({ woodcutters: 0, quarry: 0, mine: 0 });
  });
});
