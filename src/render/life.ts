// Mundo vivo: por donde salen y vuelven las caravanas y en que trabaja cada aldeano en el mapa.
// Solo lee la partida y no importa Phaser: la escena lo dibuja y los tests lo comprueban.
import { PROGRESSION, VILLAGERS } from '../sim/data';
import { farmerPlots } from '../sim/villagers';
import { workshopStatus } from '../sim/workshops';
import type { GameState, Tile } from '../sim/types';

export interface Spot {
  x: number;
  y: number;
}

/** Lo que hace un aldeano en el mapa: por donde se mueve y si trabaja al llegar (y como). */
export interface Duty {
  area: Spot[];
  work: 'hoe' | 'hammer' | null;
}

/** Caravana a la vista: `t` va de 0 (plaza del mercado) a 1 (fuera del mapa). */
export interface RoadCaravan {
  id: number;
  t: number;
  returning: boolean;
  escort: boolean;
}

const STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Camino de las caravanas: del mercado, por las casillas de camino, hasta la que queda mas cerca del
 * borde del mapa, y de ahi en linea recta hasta salir. Vacio si no hay mercado o camino que lo toque.
 */
export function tradeRoad(state: GameState): Spot[] {
  const { width: W, height: H, tiles } = state.map;
  const market = tiles.find((t) => t.kind === 'market');
  if (!market) return [];
  const at = (x: number, y: number): Tile | undefined => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y * W + x] : undefined);
  const key = (x: number, y: number) => y * W + x;
  // Busqueda en anchura por el camino: asi la ruta es la mas corta hasta cada casilla.
  const prev = new Map<number, number>();
  const queue: Spot[] = [];
  for (const [dx, dy] of STEPS) {
    const t = at(market.x + dx, market.y + dy);
    if (t?.kind === 'path' && !prev.has(key(t.x, t.y))) {
      prev.set(key(t.x, t.y), key(market.x, market.y));
      queue.push({ x: t.x, y: t.y });
    }
  }
  const edge = (p: Spot) => Math.min(p.x, p.y, W - 1 - p.x, H - 1 - p.y);
  // La salida: la casilla de camino mas cerca del borde; a igualdad, la mas lejana del mercado (asi la
  // caravana cruza el pueblo y no sale por detras del puesto). La cola va en orden de distancia.
  let best: Spot | null = null;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (!best || edge(p) <= edge(best)) best = p;
    for (const [dx, dy] of STEPS) {
      const t = at(p.x + dx, p.y + dy);
      if (t?.kind === 'path' && !prev.has(key(t.x, t.y))) {
        prev.set(key(t.x, t.y), key(p.x, p.y));
        queue.push({ x: t.x, y: t.y });
      }
    }
  }
  if (!best) return [];
  const road: Spot[] = [];
  for (let k = key(best.x, best.y); k !== key(market.x, market.y); k = prev.get(k)!) road.unshift({ x: k % W, y: Math.floor(k / W) });
  road.unshift({ x: market.x, y: market.y });
  // Del final del camino, recto hacia el borde mas cercano hasta quedar fuera del mapa.
  const d = edge(best);
  const [dx, dy] = best.x === d ? [-1, 0] : best.y === d ? [0, -1] : W - 1 - best.x === d ? [1, 0] : [0, 1];
  for (let s = 1; s <= d + 1; s++) road.push({ x: best.x + dx * s, y: best.y + dy * s });
  return road;
}

/** Punto (en casillas, con decimales, centro de casilla) a una fraccion `t` del camino. */
export function pointOnRoad(road: Spot[], t: number): Spot {
  if (road.length === 0) return { x: 0, y: 0 };
  if (road.length === 1) return { x: road[0].x + 0.5, y: road[0].y + 0.5 };
  const f = Math.max(0, Math.min(1, t)) * (road.length - 1);
  const i = Math.min(road.length - 2, Math.floor(f));
  const k = f - i;
  return { x: road[i].x + (road[i + 1].x - road[i].x) * k + 0.5, y: road[i].y + (road[i + 1].y - road[i].y) * k + 0.5 };
}

/**
 * Caravanas que se ven en el mapa: la que sale recorre el camino durante su primer dia de viaje y la
 * que vuelve, durante el ultimo. Entre medias esta lejos, en la otra villa. En viajes de menos de dos
 * dias, cada tramo dura la mitad del viaje.
 */
export function roadCaravans(state: GameState): RoadCaravan[] {
  const now = state.day + state.dayProgress;
  const out: RoadCaravan[] = [];
  for (const c of state.caravans) {
    const leg = Math.min(1, (c.returnDay - c.departDay) / 2);
    if (leg <= 0) continue;
    const gone = now - c.departDay;
    const left = c.returnDay - now;
    if (gone >= 0 && gone < leg) out.push({ id: c.id, t: gone / leg, returning: false, escort: c.escort });
    else if (left > 0 && left < leg) out.push({ id: c.id, t: left / leg, returning: true, escort: c.escort });
  }
  return out;
}

/**
 * En que anda cada aldeano: el labrador recorre sus parcelas y cava; el artesano ronda su taller y
 * martillea si el taller trabaja; el carretero va por el camino y, el dia de venta, al mercado. Los
 * pastores no salen aqui: la escena los pone en el corral y el gallinero.
 */
export function villagerDuties(state: GameState): Map<number, Duty> {
  const tiles = state.map.tiles;
  const near = (p: Spot, kinds: string[]) => tiles.filter((t) => kinds.includes(t.kind) && Math.abs(t.x - p.x) <= 1 && Math.abs(t.y - p.y) <= 1 && (t.x !== p.x || t.y !== p.y));
  const spot = (t: Spot): Spot => ({ x: t.x, y: t.y });
  const soil = tiles.filter((t) => t.kind === 'soil').map(spot);
  const paths = tiles.filter((t) => t.kind === 'path' && t.x < PROGRESSION.lands.eastFrom).map(spot);
  const market = tiles.find((t) => t.kind === 'market');
  const plots = farmerPlots(state);
  const out = new Map<number, Duty>();
  for (const v of state.villagers) {
    if (v.job === 'farmer') {
      const own = (plots.get(v.id) ?? []).map((k) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y };
      });
      out.set(v.id, { area: own.length ? own : soil, work: own.length ? 'hoe' : null });
    } else if (v.job === 'artisan') {
      const w = v.workshop ? state.workshops[v.workshop] : undefined;
      if (w && v.workshop) out.set(v.id, { area: near(w, ['grass', 'path']).map(spot), work: workshopStatus(state, v.workshop) === 'working' ? 'hammer' : null });
      else out.set(v.id, { area: paths, work: null });
    } else if (v.job === 'carter') {
      const sells = state.day % VILLAGERS.jobs.carter.sellEvery === 0;
      const stand = market ? near(market, ['path', 'grass']).map(spot) : [];
      out.set(v.id, { area: sells && stand.length ? stand : paths, work: null });
    }
  }
  return out;
}
