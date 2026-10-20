// Que casillas ocupa cada cosa del mapa: bloques de varias casillas, anexos reservados y casillas
// que se dejan libres. Sirve para que nada se construya ni se dibuje encima de otra cosa.
import { LAYOUT, NOBILITY, START } from './data';
import { tileAt } from './state';
import type { GameState, Tile, TileKind } from './types';

/** Lado del bloque cuadrado que ocupa un objeto (1 casi siempre; la casa solariega, 2). */
export const objectSize = (kind: TileKind): number => LAYOUT.size[kind] ?? 1;

/** Casilla de origen (esquina superior) del bloque al que pertenece `tile`. */
export function blockOrigin(state: GameState, tile: Tile): { x: number; y: number } {
  const n = objectSize(tile.kind);
  if (n === 1) return { x: tile.x, y: tile.y };
  let x = tile.x;
  let y = tile.y;
  while (tileAt(state, x - 1, y)?.kind === tile.kind) x--;
  while (tileAt(state, x, y - 1)?.kind === tile.kind) y--;
  // Si hubiera varios bloques iguales pegados, cada uno empieza cada n casillas.
  return { x: x + Math.floor((tile.x - x) / n) * n, y: y + Math.floor((tile.y - y) / n) * n };
}

export function isBlockOrigin(state: GameState, tile: Tile): boolean {
  const o = blockOrigin(state, tile);
  return o.x === tile.x && o.y === tile.y;
}

export interface Annex {
  id: string;
  x: number;
  y: number;
  owner: Tile;
}

/** Casillas reservadas junto a otros objetos (el puesto y la carreta junto al mercado). */
export function annexTiles(state: GameState): Annex[] {
  const out: Annex[] = [];
  for (const owner of state.map.tiles) {
    const annexes = LAYOUT.annexes[owner.kind];
    if (!annexes) continue;
    for (const [id, [dx, dy]] of Object.entries(annexes)) out.push({ id, x: owner.x + dx, y: owner.y + dy, owner });
  }
  return out;
}

export function annexAt(state: GameState, id: string): Annex | null {
  return annexTiles(state).find((a) => a.id === id) ?? null;
}

export function isReserved(state: GameState, x: number, y: number): boolean {
  return annexTiles(state).some((a) => a.x === x && a.y === y);
}

/** Junto a un taller, un solar, el mercado o el feudo no se rotura: quedarian enterrados entre cultivos. */
export function nextToKeepClear(state: GameState, x: number, y: number): boolean {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => {
    const kind = tileAt(state, x + dx, y + dy)?.kind;
    return kind !== undefined && LAYOUT.keepClear.includes(kind);
  });
}

/** Vuelve a poner las filas del feudo segun los datos (por si cambia su disposicion). */
export function relayFief(state: GameState): void {
  const base = START.map.rows.length;
  if (state.map.height <= base) return;
  const legend = { ...START.map.legend, ...NOBILITY.fief.legend };
  NOBILITY.fief.rows.forEach((row, i) => {
    [...row].forEach((ch, x) => {
      const tile = tileAt(state, x, base + i);
      if (tile && legend[ch]) tile.kind = legend[ch];
    });
  });
}
