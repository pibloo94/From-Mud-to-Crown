// Edificios con mejoras (se compran en orden) y el granero, que limita lo que se puede almacenar.
import { BUILDINGS, PRODUCT_IDS, type BuildingStats, type UpgradeDef } from './data';
import { addXp } from './progress';
import { hasMaterials, materialsList, missingMaterials, payMaterials } from './materials';
import type { BuildingId, CommandResult, GameState, ProductId } from './types';

export interface BuildOutcome {
  result: CommandResult;
  levelUps: number[];
}

/** Valor de una caracteristica del edificio: base + lo que suman las mejoras compradas. */
export function buildingStat(state: GameState, b: BuildingId, key: keyof BuildingStats): number {
  const def = BUILDINGS[b];
  let v = def.base[key] ?? 0;
  for (const up of def.upgrades.slice(0, state.buildings[b])) v += up.effects[key] ?? 0;
  return v;
}

export function nextUpgrade(state: GameState, b: BuildingId): UpgradeDef | null {
  return BUILDINGS[b].upgrades[state.buildings[b]] ?? null;
}

/** Estado visual del edificio (1, 2 o 3) segun las mejoras compradas. */
export function visualStage(state: GameState, b: BuildingId): number {
  const n = state.buildings[b];
  return BUILDINGS[b].visual.filter((t) => n >= t).length;
}

export function upgradeBuilding(state: GameState, b: BuildingId): BuildOutcome {
  const up = nextUpgrade(state, b);
  const fail = (msg: string, params?: CommandResult['params']) => ({ result: { ok: false, msg, params }, levelUps: [] });
  if (!up) return fail('msg.buildingMaxed');
  if (state.level < up.level) return fail('msg.upgradeLocked', { level: up.level });
  if (state.coins < up.cost) return fail('msg.notEnoughCoins', { cost: up.cost });
  if (!hasMaterials(state, up.materials)) return fail('msg.missingMaterials', { list: materialsList(missingMaterials(state, up.materials)) });
  state.coins -= up.cost;
  payMaterials(state, up.materials);
  state.buildings[b]++;
  const levelUps = addXp(state, 10);
  return { result: { ok: true, msg: 'msg.upgraded', params: { building: b, upgrade: up.id, cost: up.cost } }, levelUps };
}

// ------------------------------------------------------------------ granero

export function storageUsed(state: GameState): number {
  return PRODUCT_IDS.reduce((sum, p) => sum + state.inventory[p], 0);
}

export function storageCapacity(state: GameState): number {
  return buildingStat(state, 'granary', 'capacity');
}

export function storageFree(state: GameState): number {
  return Math.max(0, storageCapacity(state) - storageUsed(state));
}

/** Guarda lo que quepa en el granero y devuelve cuanto ha entrado. */
export function store(state: GameState, p: ProductId, amount: number): number {
  const added = Math.max(0, Math.min(Math.floor(amount), storageFree(state)));
  state.inventory[p] += added;
  return added;
}
