// Formato del archivo de partida. Puro (sin DOM) para poder probarlo.
import type { GameState } from '../sim/types';
import { BUILDING_IDS, PRODUCT_IDS, PROGRESSION, START } from '../sim/data';
import { rollPrices } from '../sim/market';
import { buildingStat, storageCapacity, storageUsed } from '../sim/buildings';
import { addVillager, beds } from '../sim/villagers';

export const SAVE_FORMAT = 'from-mud-to-crown-save';
export const SAVE_VERSION = 3;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  state: GameState;
}

export function serialize(state: GameState, now = new Date()): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    state: { ...state, speed: 0 },
  };
  return JSON.stringify(file, null, 2);
}

export class SaveError extends Error {
  constructor(public readonly reason: 'invalid' | 'format' | 'newer') {
    super(reason);
  }
}

/** Lee un archivo de partida. Lanza SaveError si no es valido. */
export function deserialize(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('invalid');
  }
  if (!isObject(data) || data.format !== SAVE_FORMAT || !isObject(data.state)) throw new SaveError('format');
  const version = typeof data.version === 'number' ? data.version : 0;
  if (version > SAVE_VERSION) throw new SaveError('newer');
  const state = migrate(data.state as Record<string, unknown>, version);
  if (!looksLikeState(state)) throw new SaveError('format');
  state.speed = 0; // al cargar, siempre en pausa
  return state;
}

/** Convierte partidas de versiones anteriores al formato actual, paso a paso. */
export function migrate(state: Record<string, unknown>, from: number): GameState {
  let s = state as Record<string, any>;
  if (from < 2) {
    // v1 -> v2 (fase 1): experiencia, niveles, mas productos, precios variables y eventos.
    s = { ...s };
    s.xp = 0;
    s.level = 1;
    s.landBought = 0;
    s.workers = 0;
    s.inventory = { ...s.inventory };
    s.priceMult = {};
    for (const p of PRODUCT_IDS) {
      s.inventory[p] ??= 0;
      s.priceMult[p] = 1;
    }
    s.marketBoost = null;
    s.events = { pending: null, lastDay: s.day ?? 0, cooldowns: {} };
    s.rng = ((s.day ?? 0) * 2654435761 + 12345) >>> 0;
    rollPrices(s as GameState);
  }
  if (from < 3) s = migrateV3(s);
  return s as GameState;
}

/** v2 -> v3 (fase 2): aldeanos, edificios con mejoras, granero, reputacion, impuestos y tierras del este. */
function migrateV3(old: Record<string, any>): Record<string, any> {
  const s: Record<string, any> = { ...old };
  // El mapa crece hacia el este con las tierras cerradas del mapa inicial actual.
  const rows = START.map.rows;
  const oldW: number = s.map.width;
  const width = Math.max(oldW, rows[0].length);
  const tiles: GameState['map']['tiles'] = [];
  for (let y = 0; y < s.map.height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < oldW) tiles.push({ ...s.map.tiles[y * oldW + x] });
      else tiles.push({ x, y, kind: START.map.legend[rows[y]?.[x] ?? 'X'] ?? 'wild' });
    }
  }
  const granary = tiles.find((t) => t.x === 3 && t.y === 2);
  if (granary?.kind === 'grass') granary.kind = 'granary';
  s.map = { width, height: s.map.height, tiles };

  s.rank = s.level >= 5 ? 'freeFarmer' : 'peasant';
  s.leases = 0;
  s.buildings = {};
  for (const b of BUILDING_IDS) s.buildings[b] = 0;
  s.villagers = [];
  s.nextVillagerId = 1;
  s.foodDebt = 0;
  s.rep = { baron: PROGRESSION.reputation.start, village: PROGRESSION.reputation.start };
  s.modifiers = [];
  s.flags = [];
  s.seedVouchers = 0;
  s.stats = { harvested: 0, earned: 0, ...s.stats, seasonEarned: 0, seasonFood: 0 };

  const state = s as GameState;
  // Los jornaleros de antes pasan a ser labradores, con las camas que necesitan ya construidas.
  const workers: number = s.workers ?? 0;
  delete s.workers;
  while (beds(state) < workers && state.buildings.house < 4) state.buildings.house++;
  for (let i = 0; i < workers; i++) addVillager(state, 'farmer');
  // Si ya tenia mas cosecha guardada de la que cabe, se le regalan baldas en el granero.
  while (storageUsed(state) > storageCapacity(state) && state.buildings.granary < 2) state.buildings.granary++;
  // Los animales que ya tenia caben siempre.
  while (state.herds.chicken.count > buildingStat(state, 'coop', 'maxAnimals') && state.buildings.coop < 4) state.buildings.coop++;
  while (state.herds.cow.count > buildingStat(state, 'pen', 'maxAnimals') && state.buildings.pen < 5) state.buildings.pen++;
  return s;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeState(s: GameState): boolean {
  return (
    typeof s.day === 'number' &&
    typeof s.coins === 'number' &&
    isObject(s.inventory) &&
    isObject(s.plots) &&
    isObject(s.herds) &&
    isObject(s.map) &&
    Array.isArray(s.map.tiles) &&
    typeof s.level === 'number' &&
    isObject(s.events) &&
    isObject(s.buildings) &&
    Array.isArray(s.villagers) &&
    isObject(s.rep)
  );
}
