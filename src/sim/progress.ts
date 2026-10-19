// Experiencia, niveles, rangos y lo que desbloquea cada nivel (tambien para el arbol de progreso).
import { BUILDINGS, BUILDING_IDS, CROPS, CROP_IDS, JOB_IDS, MAX_LEVEL, PROGRESSION, VILLAGERS, WORKSHOPS, WORKSHOP_IDS, type Feature, type RankDef } from './data';
import type { BuildingId, CropId, GameState, JobId, RankId, WorkshopId } from './types';

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

// ------------------------------------------------------------------ rangos

export function rankDef(id: RankId): RankDef {
  return PROGRESSION.ranks.find((r) => r.id === id)!;
}

export function workshopCount(state: GameState): number {
  return WORKSHOP_IDS.filter((id) => state.workshops[id]).length;
}

export function meetsRank(state: GameState, r: RankDef): boolean {
  return (
    state.level >= r.level &&
    state.day >= (r.days ?? 0) &&
    state.rep.baron >= (r.baron ?? 0) &&
    workshopCount(state) >= (r.workshops ?? 0)
  );
}

/** Rangos de la escalera principal (sin las ramas). */
export const mainRanks = (): RankDef[] => PROGRESSION.ranks.filter((r) => !r.branch);
export const branchRanks = (): RankDef[] => PROGRESSION.ranks.filter((r) => r.branch);

export function hasRank(state: GameState, id: RankId): boolean {
  const main = mainRanks();
  const idx = main.findIndex((r) => r.id === id);
  if (idx >= 0) return main.findIndex((r) => r.id === state.rank) >= idx;
  return state.titles.includes(id);
}

/** El siguiente rango principal por conseguir, o null si ya se tiene el ultimo. */
export function nextRank(state: GameState): RankDef | null {
  const main = mainRanks();
  const idx = main.findIndex((r) => r.id === state.rank);
  return main[idx + 1] ?? null;
}

/** Asciende en la escalera principal y gana los titulos de rama que se cumplan. Devuelve lo conseguido. */
export function updateRank(state: GameState): RankId[] {
  const gained: RankId[] = [];
  for (let r = nextRank(state); r && meetsRank(state, r); r = nextRank(state)) {
    state.rank = r.id;
    gained.push(r.id);
  }
  for (const r of branchRanks()) {
    if (!state.titles.includes(r.id) && meetsRank(state, r)) {
      state.titles.push(r.id);
      gained.push(r.id);
    }
  }
  return gained;
}

export function hasFeature(state: GameState, feature: Feature): boolean {
  return PROGRESSION.levels.slice(0, state.level).some((l) => l.unlocks?.includes(feature));
}

export function cropUnlocked(state: GameState, crop: CropId): boolean {
  return state.level >= CROPS[crop].unlockLevel;
}

// ------------------------------------------------------------------ que se desbloquea y cuando

export interface Unlocks {
  crops: CropId[];
  features: Feature[];
  maxPlots: number | null;
  /** Rangos que solo dependen del nivel y llegan al alcanzarlo. */
  rank: RankId | null;
  upgrades: { building: BuildingId; id: string; cost: number }[];
  tools: { tier: number; cost: number; jobs: JobId[] }[];
  workshops: { id: WorkshopId; cost: number }[];
  workshopUpgrades: { workshop: WorkshopId; id: string; cost: number }[];
}

/** Lo que se desbloquea exactamente al llegar a `level`: tarjeta de subida y arbol de progreso. */
export function unlocksAt(level: number): Unlocks {
  const def = levelDef(level);
  const prev = level > 1 ? levelDef(level - 1) : null;
  const upgrades = BUILDING_IDS.flatMap((b) =>
    BUILDINGS[b].upgrades.filter((u) => u.level === level).map((u) => ({ building: b, id: u.id, cost: u.cost })),
  );
  const tools = VILLAGERS.tools.tiers
    .map((t, i) => ({ tier: i + 1, cost: t.cost, level: t.level, jobs: JOB_IDS }))
    .filter((t) => t.level === level)
    .map(({ tier, cost, jobs }) => ({ tier, cost, jobs }));
  const rank = PROGRESSION.ranks.find((r) => r.level === level && level > 1 && !r.days && !r.baron && !r.workshops)?.id ?? null;
  const workshops = WORKSHOP_IDS.filter((id) => WORKSHOPS[id].unlockLevel === level).map((id) => ({ id, cost: WORKSHOPS[id].cost }));
  const workshopUpgrades = WORKSHOP_IDS.flatMap((w) =>
    WORKSHOPS[w].upgrades.filter((u) => u.level === level).map((u) => ({ workshop: w, id: u.id, cost: u.cost })),
  );
  return {
    crops: CROP_IDS.filter((c) => CROPS[c].unlockLevel === level),
    features: def.unlocks ?? [],
    maxPlots: prev && def.maxPlots > prev.maxPlots ? def.maxPlots : null,
    rank,
    upgrades,
    tools,
    workshops,
    workshopUpgrades,
  };
}
