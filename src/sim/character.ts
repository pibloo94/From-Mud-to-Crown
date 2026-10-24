// Personaje: nombre y rasgos. Los primeros rasgos salen del cuestionario de origen, caracter y
// ambicion al crear la partida (traits.json). Cada rasgo tiene ventajas y desventajas:
// - startRep: relacion con los estamentos al empezar;
// - repGain: cuanto se gana con cada estamento (1,5 = la mitad mas; 0,8 = menos);
// - effects: multiplicadores de precios, cultivos, animales, comida, experiencia, tributo, diezmo,
//   peajes, materiales, salarios y contratacion (se aplican donde ya se calculaba cada cosa).
import { TRAITS, type TraitDef } from './data';
import { ownedRanks } from './progress';
import type { EstateId, GameState, Notice, TraitEffect } from './types';

export type CharacterAnswers = { name: string; origin: string; nature: string; ambition: string };

export const traitDef = (id: string): TraitDef | undefined => TRAITS.traits[id];

const zeroDeeds = (): Record<EstateId, number> => ({ king: 0, nobles: 0, artisans: 0, commoners: 0, church: 0 });

/** Personaje sin cuestionario ni rasgos (tests, bot, partidas antiguas). */
export const emptyCharacter = (): GameState['character'] => ({ name: '', traits: [], ambition: null, earned: [], deeds: { for: zeroDeeds(), against: zeroDeeds() } });

/**
 * Rasgos del personaje con su definicion (los que ya no existan en los datos se ignoran), mas lo
 * que dan los rangos conseguidos (progression.json, effects), que funciona igual.
 */
const traitDefs = (state: GameState): Pick<TraitDef, 'effects' | 'repGain' | 'beds'>[] => [
  ...[...(state.character?.traits ?? []), ...(state.character?.earned ?? [])].map(traitDef).filter((d): d is TraitDef => !!d),
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
  state.character = { ...emptyCharacter(), name: answers.name.trim() || TRAITS.names[0], traits, ambition: answers.ambition };
  for (const id of traits) {
    for (const [e, n] of Object.entries(traitDef(id)!.startRep ?? {})) {
      state.rep[e as EstateId] = Math.max(0, Math.min(100, state.rep[e as EstateId] + (n ?? 0)));
    }
  }
}

/** Camas de mas por rasgos y rangos. */
export function bonusBeds(state: GameState): number {
  return traitDefs(state).reduce((n, d) => n + (d.beds ?? 0), 0);
}

// ------------------------------------------------------------------ rasgos ganados

/** Cuenta una decision (opcion de evento o mecenazgo): a favor o en contra de cada estamento. */
export function recordDeeds(state: GameState, rep: Partial<Record<EstateId, number>> | undefined): void {
  const d = state.character.deeds;
  for (const [e, n] of Object.entries(rep ?? {})) {
    if ((n ?? 0) > 0) d.for[e as EstateId]++;
    else if ((n ?? 0) < 0) d.against[e as EstateId]++;
  }
}

/** Cuanto se cumple la condicion de un rasgo ganado: 1 o mas, se gana; por debajo de loseAt, se pierde. */
function earnProgress(state: GameState, def: TraitDef): number {
  const e = def.earn;
  if (!e) return 0;
  if (e.estate && e.net) {
    const d = state.character.deeds;
    const net = d.for[e.estate] - d.against[e.estate];
    return net / e.net; // con net negativo, ir en contra cuenta a favor del rasgo
  }
  if (e.stat && e.min) return state.stats[e.stat] / e.min;
  return 0;
}

/** Lo que lleva hecho y lo que pide un rasgo ganado, para la ficha. */
export function earnStatus(state: GameState, id: string): { have: number; need: number } {
  const e = traitDef(id)?.earn;
  if (!e) return { have: 0, need: 1 };
  if (e.estate && e.net) {
    const d = state.character.deeds;
    const net = d.for[e.estate] - d.against[e.estate];
    return { have: Math.max(0, e.net > 0 ? net : -net), need: Math.abs(e.net) };
  }
  return { have: e.stat ? state.stats[e.stat] : 0, need: e.min ?? 1 };
}

/** Ids de los rasgos que se pueden ganar. */
export const EARNED_IDS = Object.keys(TRAITS.traits).filter((id) => TRAITS.traits[id].kind === 'earned');

/**
 * Gana los rasgos cuya condicion se cumple y pierde los que ya no (por debajo de loseAt del umbral;
 * los de contador no se pierden). Con el maximo lleno no se gana ninguno mas.
 */
export function updateEarnedTraits(state: GameState): Notice[] {
  const c = state.character;
  const notices: Notice[] = [];
  for (const id of [...c.earned]) {
    const def = traitDef(id);
    if (!def || (def.earn?.estate && earnProgress(state, def) < TRAITS.earned.loseAt)) {
      c.earned = c.earned.filter((x) => x !== id);
      notices.push({ ok: false, msg: 'msg.traitLost', params: { trait: id } });
    }
  }
  for (const id of EARNED_IDS) {
    if (c.earned.includes(id) || earnProgress(state, traitDef(id)!) < 1) continue;
    // Un rasgo y su contrario no van juntos (Hombre de fe e Impio, por ejemplo).
    const rival = c.earned.find((x) => traitDef(x)?.earn?.estate === traitDef(id)!.earn?.estate && traitDef(x)?.earn?.estate);
    if (rival) continue;
    // Con el maximo lleno no se gana otro: primero hay que perder alguno (cambiando de conducta).
    if (c.earned.length >= TRAITS.earned.max) break;
    c.earned.push(id);
    notices.push({ ok: true, msg: 'msg.traitEarned', card: 'trait', params: { trait: id } });
  }
  return notices;
}

/** Respuestas por defecto: la primera opcion de cada pregunta. */
export function defaultAnswers(name = TRAITS.names[0]): CharacterAnswers {
  const first = (q: string) => TRAITS.questions.find((x) => x.id === q)!.options[0];
  return { name, origin: first('origin'), nature: first('nature'), ambition: first('ambition') };
}

/** Una ventaja o desventaja de un rasgo, para mostrarla en la ficha y en el cuestionario. */
export interface TraitLine {
  type: 'startRep' | 'repGain' | 'effect' | 'beds';
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
  if (def.beds) lines.push({ type: 'beds', key: 'beds', value: def.beds, good: true });
  for (const [k, v] of Object.entries(def.effects ?? {})) {
    lines.push({ type: 'effect', key: k, value: v!, good: HIGHER_IS_BETTER.includes(k as TraitEffect) ? v! > 1 : v! < 1 });
  }
  return [...lines.filter((l) => l.good), ...lines.filter((l) => !l.good)];
}
