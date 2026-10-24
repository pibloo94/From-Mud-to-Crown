// Personaje: nombre y rasgos. Los primeros rasgos salen del cuestionario de origen, caracter y
// ambicion al crear la partida (traits.json). Cada rasgo tiene ventajas y desventajas:
// - startRep: relacion con los estamentos al empezar;
// - repGain: cuanto se gana con cada estamento (1,5 = la mitad mas; 0,8 = menos);
// - effects: multiplicadores de precios, cultivos, animales, comida, experiencia, tributo, diezmo,
//   peajes, materiales, salarios y contratacion (se aplican donde ya se calculaba cada cosa).
import { TRAITS, type TraitDef } from './data';
import { ownedRanks } from './progress';
import type { EstateId, GameState, TraitEffect } from './types';

export type CharacterAnswers = { name: string; origin: string; nature: string; ambition: string };

export const traitDef = (id: string): TraitDef | undefined => TRAITS.traits[id];

/**
 * Rasgos del personaje con su definicion (los que ya no existan en los datos se ignoran), mas lo
 * que dan los rangos conseguidos (progression.json, effects), que funciona igual.
 */
const traitDefs = (state: GameState): Pick<TraitDef, 'effects' | 'repGain'>[] => [
  ...(state.character?.traits ?? []).map(traitDef).filter((d): d is TraitDef => !!d),
  ...(state.paths ? ownedRanks(state) : []),
];

/** Multiplicador de un efecto por todos los rasgos del personaje. */
export function traitMult(state: GameState, effect: TraitEffect): number {
  return traitDefs(state).reduce((m, d) => m * (d.effects?.[effect] ?? 1), 1);
}

/** Multiplicador de lo que se gana con un estamento. */
export function repGainMult(state: GameState, estate: EstateId): number {
  return traitDefs(state).reduce((m, d) => m * (d.repGain?.[estate] ?? 1), 1);
}

/** Crea el personaje con las respuestas del cuestionario y aplica su relacion inicial. */
export function createCharacter(state: GameState, answers: CharacterAnswers): void {
  const traits = [answers.origin, answers.nature, answers.ambition].filter((id) => traitDef(id));
  state.character = { name: answers.name.trim() || TRAITS.names[0], traits, ambition: answers.ambition };
  for (const id of traits) {
    for (const [e, n] of Object.entries(traitDef(id)!.startRep ?? {})) {
      state.rep[e as EstateId] = Math.max(0, Math.min(100, state.rep[e as EstateId] + (n ?? 0)));
    }
  }
}

/** Respuestas por defecto: la primera opcion de cada pregunta. */
export function defaultAnswers(name = TRAITS.names[0]): CharacterAnswers {
  const first = (q: string) => TRAITS.questions.find((x) => x.id === q)!.options[0];
  return { name, origin: first('origin'), nature: first('nature'), ambition: first('ambition') };
}

/** Una ventaja o desventaja de un rasgo, para mostrarla en la ficha y en el cuestionario. */
export interface TraitLine {
  type: 'startRep' | 'repGain' | 'effect';
  /** Estamento (startRep, repGain) o efecto (effect). */
  key: string;
  value: number;
  good: boolean;
}

/** Efectos en los que mas es mejor; en el resto (gastos, comida), menos es mejor. */
const HIGHER_IS_BETTER: TraitEffect[] = ['growth', 'animal', 'priceAll', 'xp'];

/** Ventajas y desventajas de un rasgo, sacadas de sus datos (primero las ventajas). */
export function traitLines(def: TraitDef): TraitLine[] {
  const lines: TraitLine[] = [];
  for (const [k, v] of Object.entries(def.startRep ?? {})) lines.push({ type: 'startRep', key: k, value: v!, good: v! > 0 });
  for (const [k, v] of Object.entries(def.repGain ?? {})) lines.push({ type: 'repGain', key: k, value: v!, good: v! > 1 });
  for (const [k, v] of Object.entries(def.effects ?? {})) {
    lines.push({ type: 'effect', key: k, value: v!, good: HIGHER_IS_BETTER.includes(k as TraitEffect) ? v! > 1 : v! < 1 });
  }
  return [...lines.filter((l) => l.good), ...lines.filter((l) => !l.good)];
}
