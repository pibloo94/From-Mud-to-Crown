// Comercio con otras villas: carretas que llevan mercancia, la venden segun lo que alli falte y
// vuelven con monedas (y materiales comprados). Sin escolta, los caminos tienen bandidos.
import { MATERIAL_IDS, PRODUCT_IDS, TRADE, type MaterialAmounts } from './data';
import { priceOf } from './market';
import { addXp } from './progress';
import { random } from './random';
import { hasMaterials, materialsList, missingMaterials, payMaterials } from './materials';
import { clampRep } from './villagers';
import type { CommandResult, GameState, MaterialId, Notice, ProductId } from './types';
import { freeEscort } from './noble';

type Cargo = Partial<Record<ProductId, number>>;

export const isBurgher = (state: GameState): boolean => state.titles.includes('burgher');

export function tradeUnlocked(state: GameState): boolean {
  return state.level >= TRADE.unlockLevel;
}

export function townUnlocked(state: GameState, town: string): boolean {
  return state.level >= TRADE.towns[town].unlockLevel;
}

/** Carretas que se pueden tener a este nivel. */
export function maxCarts(state: GameState): number {
  return TRADE.maxCarts.filter((c) => state.level >= c.level).length;
}

export function idleCarts(state: GameState): number {
  return Math.max(0, state.carts - state.caravans.length);
}

/** Unidades que caben en una carreta. */
export function cartCapacity(state: GameState): number {
  return Math.round(TRADE.cart.capacity * (isBurgher(state) ? TRADE.burgher.capacityMult : 1));
}

export function buyCart(state: GameState): CommandResult {
  if (!tradeUnlocked(state)) return { ok: false, msg: 'msg.upgradeLocked', params: { level: TRADE.unlockLevel } };
  if (state.carts >= maxCarts(state)) {
    const next = TRADE.maxCarts[state.carts];
    return next ? { ok: false, msg: 'msg.upgradeLocked', params: { level: next.level } } : { ok: false, msg: 'msg.buildingMaxed' };
  }
  const { cost, materials } = TRADE.cart;
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  if (!hasMaterials(state, materials)) return { ok: false, msg: 'msg.missingMaterials', params: { list: materialsList(missingMaterials(state, materials)) } };
  state.coins -= cost;
  payMaterials(state, materials);
  state.carts++;
  return { ok: true, msg: 'msg.cartBought', params: { cost } };
}

export function buyStall(state: GameState): CommandResult {
  const def = TRADE.stall;
  if (state.stall) return { ok: false, msg: 'msg.buildingMaxed' };
  if (state.level < def.level) return { ok: false, msg: 'msg.upgradeLocked', params: { level: def.level } };
  if (state.coins < def.cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost: def.cost } };
  if (!hasMaterials(state, def.materials)) return { ok: false, msg: 'msg.missingMaterials', params: { list: materialsList(missingMaterials(state, def.materials)) } };
  state.coins -= def.cost;
  payMaterials(state, def.materials);
  state.stall = true;
  return { ok: true, msg: 'msg.stallBought', params: { cost: def.cost } };
}

/** Precio por unidad en la villa: el de casa por lo que alli escasea (y el sello de Burgues). */
export function townPrice(state: GameState, town: string, p: ProductId): number {
  const demand = TRADE.towns[town].demand[p] ?? 0.9;
  const bonus = isBurgher(state) ? TRADE.burgher.priceBonus : 1;
  return Math.max(1, Math.round(priceOf(state, p) * demand * bonus));
}

export function townToll(state: GameState, town: string): number {
  return Math.round(TRADE.towns[town].toll * (isBurgher(state) ? TRADE.burgher.tollMult : 1));
}

export function buyPrice(town: string, m: MaterialId): number | null {
  return TRADE.towns[town].sells?.[m] ?? null;
}

export interface Quote {
  units: number;
  value: number;
  toll: number;
  escortCost: number;
  buyCost: number;
  /** Lo que hay que pagar al salir. */
  upfront: number;
  risk: number;
  days: number;
  /** Motivo por el que no se puede mandar, si lo hay (clave de traduccion). */
  problem: string | null;
}

export function quoteCaravan(state: GameState, town: string, cargo: Cargo, buy: MaterialAmounts, escort: boolean): Quote {
  const def = TRADE.towns[town];
  const units = PRODUCT_IDS.reduce((sum, p) => sum + Math.max(0, Math.floor(cargo[p] ?? 0)), 0);
  const value = PRODUCT_IDS.reduce((sum, p) => sum + Math.max(0, Math.floor(cargo[p] ?? 0)) * townPrice(state, town, p), 0);
  const toll = townToll(state, town);
  // Con mesnada, la escolta la ponen tus soldados.
  const escortCost = escort && !freeEscort(state) ? def.escort : 0;
  const buyCost = MATERIAL_IDS.reduce((sum, m) => sum + (buy[m] ?? 0) * (buyPrice(town, m) ?? 0), 0);
  const upfront = toll + escortCost + buyCost;
  let problem: string | null = null;
  if (!tradeUnlocked(state) || !townUnlocked(state, town)) problem = 'trade.problem.locked';
  else if (idleCarts(state) <= 0) problem = 'trade.problem.noCart';
  else if (MATERIAL_IDS.some((m) => (buy[m] ?? 0) > 0 && buyPrice(town, m) === null)) problem = 'trade.problem.notSold';
  else if (units <= 0 && buyCost <= 0) problem = 'trade.problem.empty';
  else if (units > cartCapacity(state)) problem = 'trade.problem.tooMuch';
  else if (PRODUCT_IDS.some((p) => (cargo[p] ?? 0) > state.inventory[p])) problem = 'trade.problem.notEnough';
  else if (state.coins < upfront) problem = 'trade.problem.coins';
  return { units, value, toll, escortCost, buyCost, upfront, risk: escort ? 0 : def.danger, days: def.days, problem };
}

export function sendCaravan(state: GameState, town: string, cargo: Cargo, buy: MaterialAmounts = {}, escort = false): CommandResult {
  if (!TRADE.towns[town]) return { ok: false, msg: 'msg.nothing' };
  const q = quoteCaravan(state, town, cargo, buy, escort);
  if (q.problem) return { ok: false, msg: q.problem, params: { cost: q.upfront, max: cartCapacity(state) } };
  state.coins -= q.upfront;
  const clean: Cargo = {};
  for (const p of PRODUCT_IDS) {
    const n = Math.floor(cargo[p] ?? 0);
    if (n > 0) {
      state.inventory[p] -= n;
      clean[p] = n;
    }
  }
  const cleanBuy: MaterialAmounts = {};
  for (const m of MATERIAL_IDS) if ((buy[m] ?? 0) > 0) cleanBuy[m] = Math.floor(buy[m]!);
  state.caravans.push({
    id: state.nextCaravanId++,
    town,
    cargo: clean,
    buy: cleanBuy,
    escort,
    value: q.value,
    departDay: state.day,
    returnDay: state.day + q.days,
  });
  return { ok: true, msg: 'msg.caravanSent', params: { town, days: q.days, units: q.units } };
}

/** Vuelven las caravanas que han cumplido su viaje: traen monedas, experiencia y materiales. */
export function caravansReturn(state: GameState): Notice[] {
  const notices: Notice[] = [];
  const back = state.caravans.filter((c) => c.returnDay <= state.day);
  if (back.length === 0) return notices;
  state.caravans = state.caravans.filter((c) => c.returnDay > state.day);
  for (const c of back) {
    const def = TRADE.towns[c.town];
    const robbed = !c.escort && random(state) < def.danger;
    const coins = robbed ? Math.round(c.value * (1 - TRADE.robbedFraction)) : c.value;
    state.coins += coins;
    state.stats.earned += coins;
    state.stats.seasonEarned += coins;
    state.stats.tradeEarned += coins;
    state.stats.trades++;
    for (const m of MATERIAL_IDS) state.materials[m] += c.buy[m] ?? 0;
    if (def.rep?.village) state.rep.village = clampRep(state.rep.village + def.rep.village);
    if (def.rep?.baron) state.rep.baron = clampRep(state.rep.baron + def.rep.baron);
    notices.push({
      ok: !robbed,
      msg: robbed ? 'trade.back.robbed' : 'trade.back.ok',
      card: 'caravan',
      params: { town: c.town, coins, lost: c.value - coins, robbed: robbed ? 1 : 0, mats: materialsList(c.buy) },
    });
    for (const level of addXp(state, coins * TRADE.xpPerCoin)) notices.push({ ok: true, msg: 'levelup', card: 'levelup', params: { level } });
  }
  return notices;
}

/** Retrasa las caravanas en camino (un puente caido...). */
export function delayCaravans(state: GameState, days: number): void {
  for (const c of state.caravans) c.returnDay += days;
}
