// Formato del archivo de partida. Puro (sin DOM) para poder probarlo.
import type { GameState } from '../sim/types';

export const SAVE_FORMAT = 'from-mud-to-crown-save';
export const SAVE_VERSION = 1;

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

/** Aqui se iran anadiendo las conversiones de versiones antiguas del archivo. */
function migrate(state: Record<string, unknown>, _from: number): GameState {
  return state as unknown as GameState;
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
    Array.isArray(s.map.tiles)
  );
}
