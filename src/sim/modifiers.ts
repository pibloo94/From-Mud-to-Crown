// Efectos temporales: penalizaciones (tributo mas alto, cultivos lentos) y ventajas (descuentos).
import { DAYS_PER_SEASON } from './calendar';
import { traitMult } from './character';
import type { GameState, Modifier, ModifierKind, TraitEffect } from './types';

/** Efectos de los rasgos que se suman a los modificadores del mismo tipo. */
const TRAIT_KINDS: TraitEffect[] = ['growth', 'animal', 'food', 'priceAll', 'tribute'];

export function activeModifiers(state: GameState, kind?: ModifierKind): Modifier[] {
  return state.modifiers.filter((m) => m.untilDay > state.day && (!kind || m.kind === kind));
}

/** Producto de los multiplicadores activos de un tipo (1 si no hay ninguno). */
export function multiplier(state: GameState, kind: ModifierKind): number {
  // Los rasgos del personaje cuentan como un efecto permanente mas.
  const trait = TRAIT_KINDS.includes(kind as TraitEffect) ? traitMult(state, kind as TraitEffect) : 1;
  return activeModifiers(state, kind).reduce((acc, m) => acc * m.value, trait);
}

export function isIdle(state: GameState): boolean {
  return activeModifiers(state, 'idle').length > 0;
}

/** Primer dia de la estacion siguiente a la actual. */
export function nextSeasonStart(day: number): number {
  return (Math.floor(day / DAYS_PER_SEASON) + 1) * DAYS_PER_SEASON;
}

/**
 * Anade un efecto. Con `seasons`, dura hasta pasar esas cuentas de estacion: el efecto esta
 * activo el dia en que se cobran (el primero de la estacion nueva) y termina justo despues.
 */
export function addModifier(
  state: GameState,
  source: string,
  kind: ModifierKind,
  value: number,
  opts: { days?: number; seasons?: number },
): void {
  let untilDay = state.day + (opts.days ?? 0);
  if (opts.seasons) untilDay = nextSeasonStart(state.day) + (opts.seasons - 1) * DAYS_PER_SEASON + 1;
  state.modifiers.push({ source, kind, value, untilDay });
}

export function expireModifiers(state: GameState): void {
  state.modifiers = state.modifiers.filter((m) => m.untilDay > state.day);
}
