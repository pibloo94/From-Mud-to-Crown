// Formato del archivo de partida. Puro (sin DOM) para poder probarlo.
import type { GameState } from '../sim/types';
import { PRODUCT_IDS } from '../sim/data';
import { rollPrices } from '../sim/market';

export const SAVE_FORMAT = 'from-mud-to-crown-save';
export const SAVE_VERSION = 2;

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
  return s as GameState;
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
    isObject(s.events)
  );
}
