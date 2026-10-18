// Experiencia, niveles, rangos y lo que desbloquea cada nivel.
import { CROPS, CROP_IDS, MAX_LEVEL, PROGRESSION, type Feature } from './data';
import type { CropId, GameState } from './types';

export function levelDef(level: number) {
  return PROGRESSION.levels[Math.min(Math.max(level, 1), MAX_LEVEL) - 1];
}

/** Experiencia necesaria para el nivel siguiente, o null en el nivel maximo. */
export function nextLevelXp(level: number): number | null {
  return level >= MAX_LEVEL ? null : PROGRESSION.levels[level].xp;
}

/** Progreso dentro del nivel actual, de 0 a 1. */
export function levelProgress(state: GameState): number {
  const next = nextLevelXp(state.level);
  if (next === null) return 1;
  const cur = levelDef(state.level).xp;
  return Math.min(1, Math.max(0, (state.xp - cur) / (next - cur)));
}

/** Suma experiencia y sube los niveles que correspondan. Devuelve los niveles alcanzados. */
export function addXp(state: GameState, amount: number): number[] {
  if (amount <= 0) return [];
  state.xp += amount;
  const reached: number[] = [];
  let next = nextLevelXp(state.level);
  while (next !== null && state.xp >= next) {
    state.level++;
    reached.push(state.level);
    next = nextLevelXp(state.level);
  }
  return reached;
}

export function rankOf(level: number): string {
  let id = PROGRESSION.ranks[0].id;
  for (const r of PROGRESSION.ranks) if (level >= r.level) id = r.id;
  return id;
}

export function hasFeature(state: GameState, feature: Feature): boolean {
  return PROGRESSION.levels.slice(0, state.level).some((l) => l.unlocks?.includes(feature));
}

export function cropUnlocked(state: GameState, crop: CropId): boolean {
  return state.level >= CROPS[crop].unlockLevel;
}

export interface Unlocks {
  crops: CropId[];
  features: Feature[];
  maxPlots: number | null;
  rank: string | null;
}

/** Lo que se desbloquea exactamente al llegar a `level`, para mostrarlo en la tarjeta de subida. */
export function unlocksAt(level: number): Unlocks {
  const def = levelDef(level);
  const prev = level > 1 ? levelDef(level - 1) : null;
  return {
    crops: CROP_IDS.filter((c) => CROPS[c].unlockLevel === level),
    features: def.unlocks ?? [],
    maxPlots: prev && def.maxPlots > prev.maxPlots ? def.maxPlots : null,
    rank: PROGRESSION.ranks.find((r) => r.level === level && level > 1)?.id ?? null,
  };
}
