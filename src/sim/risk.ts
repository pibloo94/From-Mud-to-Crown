// Riesgo con consecuencias: el tiempo de cada estacion, la prevencion contra percances, la deuda con
// el senor (que acaba en embargo de tierras) y perder el rango si no se mantiene el favor.
// Todo se resuelve en las cuentas de la estacion (taxes.ts), salvo comprar prevencion.
import { DAYS_PER_SEASON, dateFromDay, type Season } from './calendar';
import { PROGRESSION, START } from './data';
import { addModifier, nextSeasonStart } from './modifiers';
import { mainRanks, rankDef } from './progress';
import { weightedPick } from './random';
import { plotKey, tileAt } from './state';
import type { CommandResult, GameState, ProtectionId, RankId } from './types';

// ------------------------------------------------------------------ tiempo de la estacion

/** Sortea el tiempo de la estacion que empieza y lo deja puesto hasta las cuentas siguientes. */
export function rollWeather(state: GameState, season: Season): string {
  const options = PROGRESSION.weather[season];
  const id = weightedPick(state, options) ?? 'normal';
  const w = options.find((o) => o.id === id)!;
  state.weather = id;
  const source = `weather:${season}.${id}`;
  for (const kind of ['growth', 'animal', 'food'] as const) {
    const value = w[kind];
    if (value !== undefined && value !== 1) addModifier(state, source, kind, value, { days: DAYS_PER_SEASON });
  }
  return id;
}

// ------------------------------------------------------------------ prevencion

const PROTECTION_UNITS: Record<ProtectionId, (s: GameState) => number> = {
  crops: (s) => Object.keys(s.plots).length,
  animals: (s) => s.herds.chicken.count + s.herds.cow.count,
};

export function protectionCost(state: GameState, kind: ProtectionId): number {
  const p = PROGRESSION.protection[kind];
  return p.base + p.perUnit * PROTECTION_UNITS[kind](state);
}

export const isProtected = (state: GameState, kind: ProtectionId): boolean => state.protections[kind] > state.day;

/** Compra prevencion hasta las cuentas de la estacion. */
export function buyProtection(state: GameState, kind: ProtectionId): CommandResult {
  if (isProtected(state, kind)) return { ok: false, msg: 'msg.protectionActive' };
  const cost = protectionCost(state, kind);
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  state.coins -= cost;
  state.protections[kind] = nextSeasonStart(state.day);
  return { ok: true, msg: 'msg.protectionBought', params: { protection: kind, cost } };
}

/** Prevencion que libra de este evento, si la hay comprada. */
export function preventedBy(state: GameState, eventId: string): ProtectionId | null {
  for (const kind of Object.keys(PROGRESSION.protection) as ProtectionId[]) {
    if (PROGRESSION.protection[kind].prevents.includes(eventId) && isProtected(state, kind)) return kind;
  }
  return null;
}

// ------------------------------------------------------------------ deuda y embargo

export interface DebtResult {
  /** Interes cargado esta estacion. */
  interest: number;
  /** Deuda pagada esta estacion. */
  paid: number;
  /** Lo embargado: una tierra arrendada, una parcela comprada o nada. */
  seized: 'lease' | 'plot' | null;
}

/** Al empezar las cuentas: la deuda crece y se paga lo que se pueda antes que nada. */
export function chargeDebt(state: GameState): Pick<DebtResult, 'interest' | 'paid'> {
  if (state.debt <= 0) return { interest: 0, paid: 0 };
  const interest = Math.ceil(state.debt * PROGRESSION.taxes.debtInterest);
  state.debt += interest;
  const paid = Math.min(state.debt, state.coins);
  state.coins -= paid;
  state.debt -= paid;
  return { interest, paid };
}

/** Parcelas que traia el mapa de inicio: esas no se embargan nunca. */
function startPlots(): Set<string> {
  const out = new Set<string>();
  START.map.rows.forEach((row, y) => [...row].forEach((ch, x) => START.map.legend[ch] === 'soil' && out.add(plotKey(x, y))));
  return out;
}

/** Si la deuda pasa del limite, el senor se cobra en tierra: primero arriendos, luego parcelas. */
export function seizeForDebt(state: GameState): DebtResult['seized'] {
  if (state.debt < PROGRESSION.taxes.seizeDebt) return null;
  const tenant = state.map.tiles.find((t) => t.kind === 'tenant');
  if (tenant) {
    tenant.kind = 'grass';
    state.leases = Math.max(0, state.leases - 1);
    state.debt = Math.max(0, state.debt - PROGRESSION.lands.leaseBaseCost);
    return 'lease';
  }
  const keep = startPlots();
  const key = Object.keys(state.plots)
    .filter((k) => !keep.has(k))
    .pop();
  if (!key) return null;
  const [x, y] = key.split(',').map(Number);
  const tile = tileAt(state, x, y);
  if (tile) tile.kind = 'grass';
  delete state.plots[key];
  state.landBought = Math.max(0, state.landBought - 1);
  const { baseCost, growth } = PROGRESSION.land;
  state.debt = Math.max(0, state.debt - Math.round(baseCost * growth ** state.landBought));
  return 'plot';
}

// ------------------------------------------------------------------ conservar el rango

/** Si el rango actual pide mantener un favor minimo y no se cumple. */
export function failsRankKeep(state: GameState): boolean {
  const keep = rankDef(state.rank)?.keep;
  if (!keep) return false;
  return state.rep.baron < (keep.baron ?? 0) || state.rep.village < (keep.village ?? 0);
}

/**
 * En las cuentas: la primera vez que no se cumple llega un aviso; si en las siguientes sigue sin
 * cumplirse, se baja al rango anterior. Devuelve el rango perdido, si se pierde.
 */
export function checkRankKeep(state: GameState): { warning: boolean; lost: RankId | null } {
  if (!failsRankKeep(state)) {
    state.rankWarning = false;
    return { warning: false, lost: null };
  }
  if (!state.rankWarning) {
    state.rankWarning = true;
    return { warning: true, lost: null };
  }
  const main = mainRanks();
  const i = main.findIndex((r) => r.id === state.rank);
  const lost = state.rank;
  if (i > 0) state.rank = main[i - 1].id;
  state.rankWarning = false;
  return { warning: false, lost };
}

/** La estacion que empieza tras unas cuentas (el dia ya ha avanzado). */
export const seasonNow = (state: GameState): Season => dateFromDay(state.day).season;
