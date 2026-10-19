// Materiales de construccion (madera, piedra, hierro): se compran en el mercado y los gastan las obras.
import { MATERIALS, MATERIAL_IDS, type MaterialAmounts } from './data';
import type { CommandResult, GameState, MaterialId } from './types';

export function materialUnlocked(state: GameState, m: MaterialId): boolean {
  return state.level >= (MATERIALS[m].unlockLevel ?? 1);
}

/** Lo que falta de cada material para pagar `need` (vacio si hay de todo). */
export function missingMaterials(state: GameState, need: MaterialAmounts = {}): MaterialAmounts {
  const out: MaterialAmounts = {};
  for (const m of MATERIAL_IDS) {
    const lack = (need[m] ?? 0) - state.materials[m];
    if (lack > 0) out[m] = lack;
  }
  return out;
}

export function hasMaterials(state: GameState, need: MaterialAmounts = {}): boolean {
  return Object.keys(missingMaterials(state, need)).length === 0;
}

export function payMaterials(state: GameState, need: MaterialAmounts = {}): void {
  for (const m of MATERIAL_IDS) state.materials[m] -= need[m] ?? 0;
}

/** Precio en monedas de un lote de materiales al precio del mercado. */
export function materialsPrice(amounts: MaterialAmounts): number {
  return MATERIAL_IDS.reduce((sum, m) => sum + (amounts[m] ?? 0) * MATERIALS[m].price, 0);
}

export function buyMaterial(state: GameState, m: MaterialId, qty: number): CommandResult {
  const n = Math.max(0, Math.floor(qty));
  if (n <= 0) return { ok: false, msg: 'msg.nothing' };
  if (!materialUnlocked(state, m)) return { ok: false, msg: 'msg.upgradeLocked', params: { level: MATERIALS[m].unlockLevel ?? 1 } };
  const cost = n * MATERIALS[m].price;
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  state.coins -= cost;
  state.materials[m] += n;
  return { ok: true, msg: 'msg.boughtMaterial', params: { amount: n, material: m, cost } };
}

/** Compra de una vez todo lo que falta para una obra. */
export function buyMissing(state: GameState, need: MaterialAmounts = {}): CommandResult {
  const missing = missingMaterials(state, need);
  const ids = MATERIAL_IDS.filter((m) => missing[m]);
  if (ids.length === 0) return { ok: false, msg: 'msg.nothing' };
  const locked = ids.find((m) => !materialUnlocked(state, m));
  if (locked) return { ok: false, msg: 'msg.upgradeLocked', params: { level: MATERIALS[locked].unlockLevel ?? 1 } };
  const cost = materialsPrice(missing);
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  state.coins -= cost;
  for (const m of ids) state.materials[m] += missing[m]!;
  return { ok: true, msg: 'msg.boughtMissing', params: { cost } };
}

/** "wood:4,stone:2" para los mensajes: la interfaz lo traduce. */
export function materialsList(m: Partial<Record<string, number>>): string {
  return Object.entries(m)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
}
