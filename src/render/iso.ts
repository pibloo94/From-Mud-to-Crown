// Geometria isometrica 2:1. Una baldosa mide 128x64; (sx, sy) es su vertice superior.
export const TILE_W = 128;
export const TILE_H = 64;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Vertice superior de la baldosa (x, y) en coordenadas de mundo. Admite fracciones. */
export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * HW, sy: (x + y) * HH };
}

/** Centro de la baldosa en coordenadas de mundo. */
export function tileCenter(x: number, y: number): { cx: number; cy: number } {
  const { sx, sy } = toScreen(x, y);
  return { cx: sx, cy: sy + HH };
}

/** Baldosa bajo un punto del mundo. */
export function toTile(wx: number, wy: number): { x: number; y: number } {
  const a = wx / HW;
  const b = wy / HH;
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** Orden de dibujo: lo que esta mas abajo en pantalla se dibuja encima. */
export function depthOf(x: number, y: number, layer = 0): number {
  return 100 + (x + y) * 10 + layer;
}
