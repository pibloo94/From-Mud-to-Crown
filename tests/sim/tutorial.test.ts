import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import { Game } from '../../src/sim/game';
import { advanceDay, isRipe } from '../../src/sim/rules';
import { ackStep, advanceTutorial, currentStep, noteAction, pendingTip, tutorialTiles } from '../../src/sim/tutorial';
import { PROGRESSION, TUTORIAL } from '../../src/sim/data';
import { DAYS_PER_SEASON } from '../../src/sim/calendar';
import { deserialize, serialize } from '../../src/save/serialize';

function fresh(): Game {
  const s = createNewGame(5);
  s.events.lastDay = 1e9;
  return new Game(s);
}

/** Juega dias hasta que se cumpla la condicion (con limite). */
function until(game: Game, cond: () => boolean, max = 60): void {
  for (let i = 0; i < max && !cond(); i++) advanceDay(game.state);
}

describe('tutorial guiado', () => {
  it('una partida nueva empieza en la bienvenida y sin consejos hasta acabar', () => {
    const g = fresh();
    expect(g.state.tutorial.step).toBe('welcome');
    g.state.level = 2;
    expect(pendingTip(g.state)).toBeNull();
  });

  it('cada paso avanza al hacer lo que pide, hasta el final', () => {
    const g = fresh();
    const s = g.state;
    g.tutorialAck();
    expect(s.tutorial.step).toBe('sow');
    const soil = tutorialTiles(s);
    expect(soil.length).toBeGreaterThan(0);
    g.interact(soil[0].x, soil[0].y);
    // con varios cultivos pediria elegir; al principio solo hay trigo
    expect(s.tutorial.step).toBe('collect');
    until(g, () => s.herds.chicken.stored >= 1);
    expect(tutorialTiles(s).map((t) => t.kind)).toEqual(['coop']);
    const coop = s.map.tiles.find((t) => t.kind === 'coop')!;
    g.interact(coop.x, coop.y);
    expect(s.tutorial.step).toBe('harvest');
    until(g, () => Object.values(s.plots).some((p) => p.crop && isRipe(p)));
    const ripe = tutorialTiles(s)[0];
    g.interact(ripe.x, ripe.y);
    expect(s.tutorial.step).toBe('sell');
    g.sell('wheat', 1);
    expect(s.tutorial.step).toBe('progress');
    g.noteTutorial('progressOpened');
    expect(s.tutorial.step).toBe('end');
    g.tutorialAck();
    expect(s.tutorial.step).toBeNull();
  });

  it('si algo ya esta hecho, el paso se salta solo', () => {
    const s = createNewGame(9);
    ackStep(s);
    s.stats.harvested = 3;
    s.stats.earned = 10;
    advanceTutorial(s);
    expect(currentStep(s)?.id).toBe('collect');
    noteAction(s, 'collected');
    expect(currentStep(s)?.id).toBe('progress');
  });

  it('se puede saltar y repetir', () => {
    const g = fresh();
    g.skipTutorial();
    expect(g.state.tutorial.step).toBeNull();
    g.restartTutorial();
    expect(g.state.tutorial.step).toBe('welcome');
  });
});

describe('consejos', () => {
  it('aparecen una vez, en orden, cuando se cumple su condicion', () => {
    const g = fresh();
    const s = g.state;
    g.skipTutorial();
    expect(pendingTip(s)).toBeNull();
    s.day = 3;
    expect(pendingTip(s)).toBe('buildings');
    g.dismissTip('buildings');
    expect(pendingTip(s)).toBeNull();
    s.level = 2;
    expect(pendingTip(s)).toBe('land');
    g.dismissTip('land');
    s.buildings.house = 1;
    expect(pendingTip(s)).toBe('villagers');
  });

  it('se pueden apagar', () => {
    const g = fresh();
    g.skipTutorial();
    g.state.day = 3;
    g.setTips(false);
    expect(pendingTip(g.state)).toBeNull();
  });

  it('las cuentas se explican antes de las primeras que cobran, y los encargos al llegar el primero', () => {
    const g = fresh();
    const s = g.state;
    g.skipTutorial();
    const taxes = TUTORIAL.tips.find((t) => t.id === 'taxes')!;
    expect(taxes.days!).toBeLessThan(PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON + DAYS_PER_SEASON);
    // Todo lo demas ya visto: solo falta el de los encargos
    s.tutorial.seen = TUTORIAL.tips.map((t) => t.id).filter((id) => id !== 'commissions');
    s.day = 200;
    expect(pendingTip(s)).toBeNull();
    s.commissions.offers = [{ id: 'kingLevy', estate: 'king', need: {}, coins: 100, pay: 0, rep: 5, done: false } as never];
    expect(pendingTip(s)).toBe('commissions');
  });

  it('todos los consejos tienen una condicion', () => {
    for (const tip of TUTORIAL.tips) expect(Object.keys(tip).length).toBeGreaterThan(1);
  });
});

describe('partida version 8', () => {
  it('guarda en que paso va el tutorial', () => {
    const g = fresh();
    g.tutorialAck();
    const back = deserialize(serialize(g.state));
    expect(back.tutorial).toEqual(g.state.tutorial);
  });

  it('una partida de la version 7 no repite el tutorial ni los consejos de lo ya desbloqueado', () => {
    const s = createNewGame(3) as unknown as Record<string, any>;
    s.level = 5;
    s.day = 80;
    delete s.tutorial;
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 7, savedAt: '2026-10-19T18:00:00Z', state: s }));
    expect(back.tutorial.step).toBeNull();
    expect(back.tutorial.seen).toEqual(expect.arrayContaining(['buildings', 'land', 'animals', 'taxes']));
    expect(back.tutorial.seen).not.toContain('workshops');
    expect(pendingTip(back)).toBeNull();
  });
});
