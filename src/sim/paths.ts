// Caminos: Corona, Fe, Oficio, Comercio y Pueblo. Cada uno acumula meritos con las decisiones de la
// partida: el favor que se gana con su estamento (Rey y Nobleza para la Corona, Iglesia para la Fe,
// Artesanos para el Oficio, Pueblo llano para el Pueblo) y, el Comercio, lo que se vende.
// Hasta el rango de paths.json (focusFrom) todos avanzan a medio ritmo; desde ahi se elige un camino
// en foco (ritmo completo) y un segundo (medio); el resto se queda quieto.
import { PATHS } from './data';
import { hasRank } from './progress';
import type { CommandResult, EstateId, GameState, PathId } from './types';

export const PATH_IDS = PATHS.ids;

export const startPaths = (): GameState['paths'] => ({
  merits: Object.fromEntries(PATH_IDS.map((p) => [p, 0])) as Record<PathId, number>,
  focus: null,
  second: null,
});

/** Si ya se puede elegir camino. */
export const canChoosePath = (state: GameState): boolean => hasRank(state, PATHS.focusFrom);

/** Ritmo al que avanza un camino ahora mismo. */
export function pathRate(state: GameState, p: PathId): number {
  const { focus, second } = state.paths;
  const r = PATHS.rates;
  if (!focus) return r.before;
  if (p === focus) return r.focus;
  if (p === second) return r.second;
  return r.other;
}

export function addMerits(state: GameState, p: PathId, raw: number): void {
  if (raw <= 0) return;
  state.paths.merits[p] += raw * pathRate(state, p);
}

/** El favor ganado con un estamento cuenta para su camino. */
export function meritsFromRep(state: GameState, estate: EstateId, delta: number): void {
  const link = PATHS.estates[estate];
  if (link) addMerits(state, link.path, delta * link.perRep);
}

/** Lo vendido cuenta para el Comercio (mas lo que traen las caravanas). */
export function meritsFromSales(state: GameState, coins: number, source: 'market' | 'trade'): void {
  addMerits(state, 'trade', coins * PATHS.sales[source]);
}

/** Lo que producen los talleres (a precio base) cuenta para el Oficio. */
export function meritsFromCraft(state: GameState, coins: number): void {
  addMerits(state, 'craft', coins * PATHS.sales.artisan);
}

/** Peldano de un camino segun sus meritos, con lo que falta para el siguiente. */
export function pathLevel(merits: number): { level: number; from: number; to: number | null } {
  const lv = PATHS.levels;
  let level = 0;
  while (level + 1 < lv.length && merits >= lv[level + 1]) level++;
  return { level, from: lv[level], to: level + 1 < lv.length ? lv[level + 1] : null };
}

/**
 * Pone un camino en foco. Si ya habia otro, pierde parte de sus meritos (paths.json, switchLoss)
 * y pasa a ser el segundo camino.
 */
export function setPathFocus(state: GameState, p: PathId): CommandResult {
  if (!canChoosePath(state)) return { ok: false, msg: 'msg.pathLocked', params: { rank: PATHS.focusFrom } };
  const paths = state.paths;
  if (paths.focus === p) return { ok: false, msg: 'msg.pathAlready' };
  const old = paths.focus;
  if (old) {
    const lost = Math.round(paths.merits[old] * PATHS.switchLoss);
    paths.merits[old] -= lost;
    paths.second = old;
  } else if (paths.second === p) {
    paths.second = null;
  }
  paths.focus = p;
  return { ok: true, msg: 'msg.pathFocus', params: { path: p } };
}

/** Elige el segundo camino (sin coste): avanza a medio ritmo. */
export function setPathSecond(state: GameState, p: PathId): CommandResult {
  const paths = state.paths;
  if (!paths.focus) return { ok: false, msg: 'msg.pathNoFocus' };
  if (p === paths.focus || p === paths.second) return { ok: false, msg: 'msg.pathAlready' };
  paths.second = p;
  return { ok: true, msg: 'msg.pathSecond', params: { path: p } };
}
