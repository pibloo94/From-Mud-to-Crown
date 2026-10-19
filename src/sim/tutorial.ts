// Tutorial guiado de los primeros minutos y consejos que aparecen una vez al desbloquear cosas.
// Los pasos avanzan solos cuando el jugador ya ha hecho lo que piden (aunque sea en otro orden).
import { TUTORIAL, type TipDef, type TutorialStepDef } from './data';
import { hasRank } from './progress';
import { charterReady } from './noble';
import { beds } from './villagers';
import { isRipe } from './rules';
import type { GameState, Tile, TutorialState } from './types';

/** Accion hecha durante el tutorial que no se puede deducir del estado (p. ej. recoger huevos). */
export type TutorialAction = 'collected' | 'progressOpened';

const did = (a: string) => `did:${a}`;

export function newTutorial(): TutorialState {
  return { step: TUTORIAL.steps[0].id, seen: [], tips: true };
}

/** Partidas ya empezadas: sin pasos guiados y con los consejos de lo ya desbloqueado dados por vistos. */
export function finishedTutorial(state: GameState): TutorialState {
  const tut: TutorialState = { step: null, seen: [], tips: true };
  tut.seen = TUTORIAL.tips.filter((tip) => tipMet(state, tip)).map((tip) => tip.id);
  return tut;
}

export function currentStep(state: GameState): TutorialStepDef | null {
  const id = state.tutorial.step;
  return id ? (TUTORIAL.steps.find((s) => s.id === id) ?? null) : null;
}

export function stepIndex(state: GameState): number {
  return TUTORIAL.steps.findIndex((s) => s.id === state.tutorial.step);
}

function stepDone(state: GameState, step: TutorialStepDef): boolean {
  const seen = state.tutorial.seen;
  switch (step.done) {
    case 'ack':
      return false;
    case 'planted':
      return Object.values(state.plots).some((p) => p.crop) || state.stats.harvested > 0;
    case 'harvested':
      return state.stats.harvested > 0;
    case 'sold':
      return state.stats.earned > 0;
    default:
      return seen.includes(did(step.done));
  }
}

/** Pasa los pasos que ya estan hechos. Devuelve si ha cambiado algo. */
export function advanceTutorial(state: GameState): boolean {
  let changed = false;
  for (let step = currentStep(state); step && stepDone(state, step); step = currentStep(state)) {
    nextStep(state);
    changed = true;
  }
  return changed;
}

function nextStep(state: GameState): void {
  const i = stepIndex(state);
  state.tutorial.step = TUTORIAL.steps[i + 1]?.id ?? null;
}

/** El jugador pulsa el boton del paso (bienvenida, final). */
export function ackStep(state: GameState): boolean {
  const step = currentStep(state);
  if (!step || step.done !== 'ack') return false;
  nextStep(state);
  advanceTutorial(state);
  return true;
}

/** Anota una accion del jugador y avanza si era lo que pedia el paso. */
export function noteAction(state: GameState, action: TutorialAction): boolean {
  if (state.tutorial.step === null) return false;
  if (!state.tutorial.seen.includes(did(action))) state.tutorial.seen.push(did(action));
  return advanceTutorial(state);
}

export function skipTutorial(state: GameState): void {
  state.tutorial.step = null;
}

/** Vuelve a empezar los pasos guiados (los consejos vistos se quedan vistos). */
export function restartTutorial(state: GameState): void {
  state.tutorial.step = TUTORIAL.steps[0].id;
  state.tutorial.seen = state.tutorial.seen.filter((s) => !s.startsWith('did:'));
}

// ---------------------------------------------------------------- consejos

export function tipMet(state: GameState, tip: TipDef): boolean {
  if (tip.level && state.level < tip.level) return false;
  if (tip.days && state.day < tip.days) return false;
  if (tip.beds && beds(state) < tip.beds) return false;
  if (tip.villagers && state.villagers.length < tip.villagers) return false;
  // Ya ha salido algun evento (cada uno deja su espera) y no hay ninguno pendiente.
  if (tip.events && (Object.keys(state.events.cooldowns).length === 0 || state.events.pending)) return false;
  if (tip.rank && !hasRank(state, tip.rank)) return false;
  if (tip.charter && !charterReady(state)) return false;
  return true;
}

/** Consejo por mostrar ahora (nunca durante los pasos guiados), o null. */
export function pendingTip(state: GameState): string | null {
  const tut = state.tutorial;
  if (tut.step !== null || !tut.tips) return null;
  return TUTORIAL.tips.find((tip) => !tut.seen.includes(tip.id) && tipMet(state, tip))?.id ?? null;
}

export function dismissTip(state: GameState, id: string): void {
  if (!state.tutorial.seen.includes(id)) state.tutorial.seen.push(id);
}

export function setTips(state: GameState, on: boolean): void {
  state.tutorial.tips = on;
}

// ---------------------------------------------------------------- donde senalar

/** Baldosas que el paso actual senala en el mapa. */
export function tutorialTiles(state: GameState): Tile[] {
  const target = currentStep(state)?.target;
  const tiles = state.map.tiles;
  switch (target) {
    case 'soil':
      return tiles.filter((t) => t.kind === 'soil' && !state.plots[`${t.x},${t.y}`]?.crop);
    case 'ripe':
      return tiles.filter((t) => {
        const p = state.plots[`${t.x},${t.y}`];
        return t.kind === 'soil' && p && isRipe(p);
      });
    case 'coop':
      return state.herds.chicken.stored >= 1 ? tiles.filter((t) => t.kind === 'coop') : [];
    default:
      return [];
  }
}
