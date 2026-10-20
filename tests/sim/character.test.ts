import { describe, expect, it } from 'vitest';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';
import { createNewGame } from '../../src/sim/state';
import { TRAITS } from '../../src/sim/data';
import { defaultAnswers, traitLines, traitMult } from '../../src/sim/character';
import { changeRep, estateMult } from '../../src/sim/estates';
import { multiplier } from '../../src/sim/modifiers';
import { addXp } from '../../src/sim/progress';
import { deserialize, serialize } from '../../src/save/serialize';

const game = (origin: string, nature: string, ambition: string) => createNewGame(1, 'normal', { name: 'Elvira', origin, nature, ambition });

describe('personaje y rasgos', () => {
  it('el cuestionario da un rasgo por respuesta y la relacion inicial', () => {
    const s = game('peasantBorn', 'diligent', 'people');
    expect(s.character).toEqual({ name: 'Elvira', traits: ['peasantBorn', 'diligent', 'people'], ambition: 'people' });
    expect(s.rep.commoners).toBe(65);
    expect(s.rep.nobles).toBe(40);
  });

  it('sin cuestionario no hay rasgos ni cambios', () => {
    const s = createNewGame(1);
    expect(s.character.traits).toEqual([]);
    expect(traitMult(s, 'growth')).toBe(1);
  });

  it('el nombre vacio toma uno por defecto', () => {
    const s = createNewGame(1, 'normal', { ...defaultAnswers(), name: '  ' });
    expect(s.character.name).toBe(TRAITS.names[0]);
  });

  it('los rasgos cambian cuanto se gana con un estamento, no cuanto se pierde', () => {
    const s = game('craftBorn', 'pious', 'craft');
    const church = s.rep.church;
    changeRep(s, 'church', 10);
    expect(s.rep.church).toBe(church + 15);
    changeRep(s, 'church', -10);
    expect(s.rep.church).toBe(church + 5);
  });

  it('los efectos entran en los multiplicadores de siempre', () => {
    const s = game('peasantBorn', 'diligent', 'people');
    s.rep.commoners = 50; // en tramo neutral, para ver solo el rasgo
    expect(multiplier(s, 'growth')).toBeCloseTo(1.1);
    expect(multiplier(s, 'food')).toBeCloseTo(1.1);
    expect(estateMult(s, 'hire')).toBeCloseTo(0.8);
  });

  it('el tributo del rasgo no se aplica dos veces', () => {
    const s = game('nobleBastard', 'diligent', 'crown');
    s.rep.nobles = 50;
    expect(multiplier(s, 'tribute')).toBeCloseTo(0.9);
    expect(estateMult(s, 'tribute')).toBe(1);
  });

  it('criado en la abadia gana mas experiencia', () => {
    const s = game('cloisterRaised', 'diligent', 'faith');
    const xp = s.xp;
    addXp(s, 100);
    expect(s.xp).toBeCloseTo(xp + 110);
  });

  it('cada respuesta del cuestionario es un rasgo de su tipo, con ventajas y desventajas y nombre en los dos idiomas', () => {
    for (const q of TRAITS.questions) {
      expect(q.options.length).toBeGreaterThan(1);
      for (const id of q.options) {
        const def = TRAITS.traits[id];
        expect(def?.kind, id).toBe(q.id);
        const lines = traitLines(def);
        expect(lines.some((l) => l.good), `${id} sin ventajas`).toBe(true);
        expect(lines.some((l) => !l.good), `${id} sin desventajas`).toBe(true);
        for (const dict of [es, en] as Record<string, string>[]) {
          expect(dict[`trait.${id}`], id).toBeTruthy();
          expect(dict[`trait.${id}.desc`], id).toBeTruthy();
        }
      }
    }
  });

  it('el personaje se guarda y las partidas anteriores cargan sin rasgos', () => {
    const s = game('craftBorn', 'shrewd', 'trade');
    expect(deserialize(serialize(s)).character).toEqual(s.character);
    const old = JSON.parse(serialize(createNewGame(2)));
    delete old.state.character;
    old.version = 14;
    expect(deserialize(JSON.stringify(old)).character).toEqual({ name: '', traits: [], ambition: null });
  });
});
