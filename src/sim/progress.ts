// Experiencia, niveles, rangos y lo que desbloquea cada nivel (tambien para el arbol de progreso).
import { BUILDINGS, BUILDING_IDS, CROPS, CROP_IDS, JOB_IDS, MAX_LEVEL, PROGRESSION, TOWN_IDS, TRADE, VILLAGERS, WORKSHOPS, WORKSHOP_IDS, type Feature, type RankDef } from './data';
import { ESTATE_IDS } from './estates';
import type { BuildingId, CropId, GameState, JobId, RankId, WorkshopId } from './types';

export function levelDef(level: number) {
  return PROGRESSION.levels[Math.min(Math.max(level, 1), MAX_LEVEL) - 1];
}

/** Experiencia necesaria para el nivel siguiente, o null en el nivel maximo. */
export function nextLevelXp(level: number): number | null {
  return level >= MAX_LEVEL ? null : PROGRESSION.levels[level].xp;
}

/** Progreso dentro del nivel actual, de 0 a 1. En el nivel maximo, hacia el siguiente punto de renombre. */
export function levelProgress(state: GameState): number {
  const next = nextLevelXp(state.level);
  if (next === null) return renownProgress(state).xp / PROGRESSION.renown.xpPerPoint;
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

// ------------------------------------------------------------------ renombre

/** Experiencia por encima del nivel maximo. */
const spareXp = (state: GameState): number => (state.level >= MAX_LEVEL ? Math.max(0, state.xp - levelDef(MAX_LEVEL).xp) : 0);

/** Puntos de renombre ganados (cobrados o no) y experiencia que llevas hacia el siguiente. */
export function renownProgress(state: GameState): { points: number; xp: number } {
  const per = PROGRESSION.renown.xpPerPoint;
  const spare = spareXp(state);
  return { points: Math.floor(spare / per), xp: Math.floor(spare % per) };
}

/**
 * Cobra el renombre pendiente al cerrar la estacion: cada punto nuevo suma prestigio.
 * Devuelve el prestigio ganado.
 */
export function claimRenown(state: GameState): number {
  const { points } = renownProgress(state);
  const fresh = Math.max(0, points - state.renown);
  state.renown = Math.max(state.renown, points);
  const prestige = fresh * PROGRESSION.renown.prestigePerPoint;
  state.noble.prestige += prestige;
  return prestige;
}

// ------------------------------------------------------------------ rangos

export function rankDef(id: RankId): RankDef {
  return PROGRESSION.ranks.find((r) => r.id === id)!;
}

export function workshopCount(state: GameState): number {
  return WORKSHOP_IDS.filter((id) => state.workshops[id]).length;
}

/** Titulos de rama conseguidos (Artesano, Burgues). */
export const branchCount = (state: GameState): number => state.titles.length;
export const hamletsTaken = (state: GameState): number => Object.values(state.noble.hamlets).filter((l) => l > 0).length;
export const hamletLevelSum = (state: GameState): number => Object.values(state.noble.hamlets).reduce((a, b) => a + b, 0);

export function meetsRank(state: GameState, r: RankDef): boolean {
  const n = state.noble;
  return (
    state.level >= r.level &&
    state.day >= (r.days ?? 0) &&
    ESTATE_IDS.every((e) => state.rep[e] >= (r[e] ?? 0)) &&
    branchCount(state) >= (r.branches ?? 0) &&
    workshopCount(state) >= (r.workshops ?? 0) &&
    state.stats.trades >= (r.trades ?? 0) &&
    (!r.stall || state.stall) &&
    (!r.charter || n.charter) &&
    n.manor >= (r.manor ?? 0) &&
    hamletsTaken(state) >= (r.hamlets ?? 0) &&
    hamletLevelSum(state) >= (r.hamletLevels ?? 0) &&
    n.soldiers >= (r.soldiers ?? 0) &&
    n.prestige >= (r.prestige ?? 0)
  );
}

/** Rango que llega solo con el nivel (se anuncia en la tarjeta de subida de nivel, no aparte). */
export function levelOnlyRank(r: RankDef): boolean {
  return Object.keys(r).every((k) => k === 'id' || k === 'level' || k === 'branch');
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
  /** Comercio: villas que se abren, puesto en el mercado y carretas nuevas en este nivel. */
  towns: string[];
  stall: boolean;
  carts: number;
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
  const rank = PROGRESSION.ranks.find((r) => r.level === level && level > 1 && levelOnlyRank(r))?.id ?? null;
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
    towns: TOWN_IDS.filter((t) => TRADE.towns[t].unlockLevel === level),
    stall: TRADE.stall.level === level,
    carts: TRADE.maxCarts.filter((c) => c.level === level).length,
  };
}
