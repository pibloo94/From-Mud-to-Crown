import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { changeRep, driftReps, estateMult, rivalsOf, tierOf } from '../../src/sim/estates';
import { materialPrice } from '../../src/sim/materials';
import { townToll } from '../../src/sim/trade';
import { wageOf } from '../../src/sim/upkeep';
import { meetsRequirements } from '../../src/sim/events';
import { ESTATES, MATERIALS, TRADE } from '../../src/sim/data';
import { deserialize } from '../../src/save/serialize';
import type { Villager } from '../../src/sim/types';

describe('estamentos', () => {
  it('una partida nueva empieza con los cinco estamentos en el punto medio', () => {
    expect(createNewGame(1).rep).toEqual({ king: 50, nobles: 50, artisans: 50, commoners: 50, church: 50 });
  });

  it('lo que agrada a uno disgusta un poco a su rival; perder favor no regala nada al rival', () => {
    const s = createNewGame(1);
    expect(rivalsOf('nobles').sort()).toEqual(['commoners', 'king']);
    changeRep(s, 'nobles', 10);
    expect(s.rep.nobles).toBe(60);
    expect(s.rep.commoners).toBe(50 - Math.round(10 * ESTATES.rivalShare));
    expect(s.rep.king).toBe(50 - Math.round(10 * ESTATES.rivalShare));
    expect(s.rep.church).toBe(50);
    changeRep(s, 'nobles', -20);
    expect(s.rep.commoners).toBe(47);
  });

  it('los tramos van de hostil a devoto', () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(tierOf)).toEqual([
      'hostile', 'hostile', 'cold', 'cold', 'neutral', 'neutral', 'favorable', 'favorable', 'devoted', 'devoted',
    ]);
  });

  it('cada tramo cambia lo suyo: materiales, peajes, salarios y diezmo', () => {
    const s = createNewGame(1);
    s.rep.artisans = 85;
    expect(materialPrice(s, 'iron')).toBe(Math.round(MATERIALS.iron.price * 0.8));
    s.rep.king = 10;
    expect(townToll(s, 'saltport')).toBe(Math.round(TRADE.towns.saltport.toll * 1.5));
    const v: Villager = { id: 1, name: 'Tomás', job: 'farmer', tool: 0, hungry: 0, crop: 'auto' };
    const base = wageOf(s, v);
    s.rep.commoners = 30;
    expect(wageOf(s, v)).toBe(Math.round(base * 1.15));
    s.rep.church = 90;
    expect(estateMult(s, 'tithe')).toBeCloseTo(0.8);
  });

  it('cada estacion las relaciones vuelven algo hacia el punto medio', () => {
    const s = createNewGame(1);
    s.rep = { king: 90, nobles: 51, artisans: 10, commoners: 49, church: 50 };
    driftReps(s);
    expect(s.rep).toEqual({ king: 90 - ESTATES.drift, nobles: 50, artisans: 10 + ESTATES.drift, commoners: 50, church: 50 });
  });

  it('los eventos pueden pedir una relacion minima con cualquier estamento', () => {
    const s = createNewGame(1);
    s.rep.church = 70;
    expect(meetsRequirements(s, { church: 70, commoners: 50 })).toBe(true);
    expect(meetsRequirements(s, { church: 71 })).toBe(false);
  });

  it('las partidas de la version 13 pasan el favor del baron a la Nobleza y el de la aldea al Pueblo llano', () => {
    const s = createNewGame(3) as unknown as Record<string, unknown>;
    s.rep = { baron: 72, village: 31 };
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 13, savedAt: '2026-10-20T17:00:00Z', state: s }));
    expect(back.rep).toEqual({ king: 50, nobles: 72, artisans: 50, commoners: 31, church: 50 });
  });
});
