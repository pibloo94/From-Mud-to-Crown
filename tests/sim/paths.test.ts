import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { PATHS, PROGRESSION } from '../../src/sim/data';
import { pathOk, updateRank } from '../../src/sim/progress';
import { beds } from '../../src/sim/villagers';
import { changeRep, estateMult } from '../../src/sim/estates';
import { canChoosePath, meritsFromSales, pathLevel, pathRate, setPathFocus, setPathSecond } from '../../src/sim/paths';
import { deserialize, serialize } from '../../src/save/serialize';
import type { GameState } from '../../src/sim/types';

/** Partida que ya puede elegir camino. */
function landowner(): GameState {
  const s = createNewGame(5);
  s.rank = PATHS.focusFrom;
  return s;
}

describe('caminos', () => {
  it('el favor ganado con un estamento da meritos a su camino, a medio ritmo antes de elegir', () => {
    const s = createNewGame(5);
    changeRep(s, 'church', 4);
    expect(s.paths.merits.faith).toBe(4 * PATHS.estates.church!.perRep * PATHS.rates.before);
    // Lo que se pierde no quita meritos.
    changeRep(s, 'church', -10);
    expect(s.paths.merits.faith).toBe(4 * PATHS.estates.church!.perRep * PATHS.rates.before);
  });

  it('cuenta aunque la relacion ya este al maximo', () => {
    const s = createNewGame(5);
    s.rep.commoners = 100;
    changeRep(s, 'commoners', 2);
    expect(s.paths.merits.people).toBeGreaterThan(0);
  });

  it('las ventas dan meritos al Comercio', () => {
    const s = createNewGame(5);
    meritsFromSales(s, 1000, 'market');
    meritsFromSales(s, 1000, 'trade');
    expect(s.paths.merits.trade).toBeCloseTo((1000 * PATHS.sales.market + 1000 * PATHS.sales.trade) * PATHS.rates.before);
  });

  it('el camino se elige desde el rango de paths.json', () => {
    const s = createNewGame(5);
    expect(canChoosePath(s)).toBe(false);
    expect(setPathFocus(s, 'faith').ok).toBe(false);
    s.rank = PATHS.focusFrom;
    expect(setPathFocus(s, 'faith').ok).toBe(true);
  });

  it('foco al ritmo completo, segundo a medio y el resto parado', () => {
    const s = landowner();
    setPathFocus(s, 'faith');
    expect(setPathSecond(s, 'faith').ok).toBe(false);
    setPathSecond(s, 'people');
    expect(pathRate(s, 'faith')).toBe(PATHS.rates.focus);
    expect(pathRate(s, 'people')).toBe(PATHS.rates.second);
    expect(pathRate(s, 'crown')).toBe(PATHS.rates.other);
    changeRep(s, 'king', 10);
    expect(s.paths.merits.crown).toBe(0);
  });

  it('cambiar de foco cuesta meritos al camino que se deja, que pasa a segundo', () => {
    const s = landowner();
    setPathFocus(s, 'crown');
    s.paths.merits.crown = 1000;
    setPathFocus(s, 'trade');
    expect(s.paths.focus).toBe('trade');
    expect(s.paths.second).toBe('crown');
    expect(s.paths.merits.crown).toBe(1000 * (1 - PATHS.switchLoss));
  });

  it('peldanos segun los meritos', () => {
    const lv = PATHS.levels;
    expect(pathLevel(0)).toEqual({ level: 0, from: 0, to: lv[1] });
    expect(pathLevel(lv[2]).level).toBe(2);
    expect(pathLevel(lv[lv.length - 1] + 1).to).toBeNull();
  });

  it('se guarda y las partidas anteriores empiezan sin meritos ni foco', () => {
    const s = landowner();
    setPathFocus(s, 'craft');
    expect(deserialize(serialize(s)).paths).toEqual(s.paths);
    const old = JSON.parse(serialize(createNewGame(2)));
    delete old.state.paths;
    old.version = 15;
    const back = deserialize(JSON.stringify(old));
    expect(back.paths.focus).toBeNull();
    expect(Object.values(back.paths.merits).every((n) => n === 0)).toBe(true);
  });
});

describe('rangos de cada camino', () => {
  const faithful = (): GameState => {
    const s = landowner();
    s.level = 20;
    s.day = 2000;
    s.rep.church = 90;
    s.paths.merits.faith = PATHS.levels[4];
    return s;
  };

  it('el primero solo pide favor y peldano; los siguientes, el camino en foco o de segundo', () => {
    const s = faithful();
    updateRank(s);
    expect(s.titles).toContain('layBrother');
    // Prior pide la Fe en foco o de segundo; Emisario, en foco.
    expect(s.titles).not.toContain('prior');
    setPathFocus(s, 'crown');
    setPathSecond(s, 'faith');
    updateRank(s);
    expect(s.titles).toContain('prior');
    expect(s.titles).not.toContain('faithEnvoy');
    setPathFocus(s, 'faith');
    updateRank(s);
    expect(s.titles).toContain('faithEnvoy');
  });

  it('lo que dan los rangos se acumula como los rasgos', () => {
    const s = faithful();
    s.rep.church = 50; // tramo neutral: solo cuentan los rangos
    const before = estateMult(s, 'tithe');
    s.titles.push('layBrother', 'prior');
    expect(estateMult(s, 'tithe')).toBeCloseTo(before * 0.9 * 0.8);
  });

  it('los rangos del Pueblo dan camas', () => {
    const s = landowner();
    const n = beds(s);
    s.titles.push('spokesman', 'leader');
    expect(beds(s)).toBe(n + 6);
  });

  it('Baron pide la Corona en foco o de segundo', () => {
    const baron = PROGRESSION.ranks.find((r) => r.id === 'baron')!;
    const s = landowner();
    s.paths.merits.crown = 9999;
    expect(pathOk(s, baron)).toBe(false);
    setPathFocus(s, 'trade');
    setPathSecond(s, 'crown');
    expect(pathOk(s, baron)).toBe(true);
  });

  it('una partida anterior de un noble sigue la Corona', () => {
    const s = landowner();
    s.rank = 'baron';
    const old = JSON.parse(serialize(s));
    old.version = 16;
    const back = deserialize(JSON.stringify(old));
    expect(back.paths.focus).toBe('crown');
    expect(back.paths.merits.crown).toBeGreaterThanOrEqual(PATHS.levels[3]);
  });
});
