// Estamentos: Rey, Nobleza, Artesanos, Pueblo llano e Iglesia. Cada uno recuerda lo que haces
// (relacion de 0 a 100) y, segun en que tramo estes, cobra o rebaja algo (estates.json).
// No se puede contentar a todos: lo que agrada a uno disgusta un poco a su rival, y cada estacion
// las relaciones vuelven algo hacia el punto medio si no se cuidan.
import { ESTATES } from './data';
import { repGainMult, traitMult } from './character';
import { meritsFromRep } from './paths';
import type { EstateEffect, EstateId, GameState } from './types';

export const ESTATE_IDS = ESTATES.ids as EstateId[];

export const clampRep = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/** Estamentos rivales de uno (los que pierden cuando este gana). */
export function rivalsOf(estate: EstateId): EstateId[] {
  return ESTATES.rivals.flatMap(([a, b]) => (a === estate ? [b] : b === estate ? [a] : [])) as EstateId[];
}

/**
 * Cambia la relacion con un estamento. Si sube, sus rivales bajan una parte (rivalShare) de lo
 * que sube, salvo que se pida lo contrario (p. ej. al restaurar o al reiniciar con un senor nuevo).
 */
export function changeRep(state: GameState, estate: EstateId, delta: number, rivals = true): void {
  // Los rasgos cambian cuanto se gana (no cuanto se pierde).
  if (delta > 0) delta = Math.round(delta * repGainMult(state, estate));
  if (!delta) return;
  // Lo que se gana cuenta para el camino de ese estamento, aunque la relacion ya este al maximo.
  if (delta > 0) meritsFromRep(state, estate, delta);
  state.rep[estate] = clampRep(state.rep[estate] + delta);
  if (rivals && delta > 0) {
    const loss = Math.round(delta * ESTATES.rivalShare);
    if (loss > 0) for (const r of rivalsOf(estate)) state.rep[r] = clampRep(state.rep[r] - loss);
  }
}

/** Aplica una lista de cambios (efectos de eventos, mecenazgo, fuentes de estates.json). */
export function applyRep(state: GameState, changes: Partial<Record<EstateId, number>> | undefined): void {
  for (const [e, n] of Object.entries(changes ?? {})) changeRep(state, e as EstateId, n ?? 0);
}

/** Fuente con nombre de estates.json (taller construido, carta de nobleza...). */
export function repFrom(state: GameState, source: keyof typeof ESTATES.sources): void {
  applyRep(state, ESTATES.sources[source] as Partial<Record<EstateId, number>>);
}

export type TierId = 'hostile' | 'cold' | 'neutral' | 'favorable' | 'devoted';

export function tierOf(value: number): TierId {
  return (ESTATES.tiers.find((t) => value < t.below) ?? ESTATES.tiers[ESTATES.tiers.length - 1]).id as TierId;
}

/** Efectos del tramo en que esta cada estamento ahora. */
export function tierEffects(state: GameState, estate: EstateId): Partial<Record<EstateEffect, number>> {
  const byTier = ESTATES.effects[estate] as Partial<Record<TierId, Partial<Record<EstateEffect, number>>>> | undefined;
  return byTier?.[tierOf(state.rep[estate])] ?? {};
}

/** Multiplicador total de un efecto (tributo, diezmo, salarios...) por todos los estamentos. */
export function estateMult(state: GameState, effect: EstateEffect): number {
  // El tributo de los rasgos ya va en multiplier('tribute'): aqui no se aplica dos veces.
  const trait = effect === 'tribute' ? 1 : traitMult(state, effect);
  return ESTATE_IDS.reduce((m, e) => m * (tierEffects(state, e)[effect] ?? 1), trait);
}

/** Cada estacion, las relaciones vuelven `drift` puntos hacia 50 si no se cuidan. */
export function driftReps(state: GameState): void {
  const mid = ESTATES.start;
  for (const e of ESTATE_IDS) {
    const v = state.rep[e];
    if (v > mid) state.rep[e] = Math.max(mid, v - ESTATES.drift);
    else if (v < mid) state.rep[e] = Math.min(mid, v + ESTATES.drift);
  }
}

export const startReps = (start = ESTATES.start): Record<EstateId, number> =>
  Object.fromEntries(ESTATE_IDS.map((e) => [e, start])) as Record<EstateId, number>;
