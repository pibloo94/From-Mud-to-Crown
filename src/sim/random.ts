// Generador aleatorio reproducible (mulberry32). La semilla vive en el estado y se guarda con la partida.
import type { GameState } from './types';

/** Devuelve un numero en [0, 1) y avanza la semilla. */
export function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Elige una clave segun su peso. */
export function weightedPick<T extends string>(state: GameState, items: { id: T; weight: number }[]): T | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  let r = random(state) * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item.id;
  }
  return items[items.length - 1].id;
}

export function newSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
