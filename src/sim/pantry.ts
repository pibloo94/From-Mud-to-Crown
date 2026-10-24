// Despensa: que productos comen los aldeanos, en que orden y cuanto se guarda sin vender.
import { PRODUCTS, PRODUCT_IDS, VILLAGERS } from './data';
import { buildingStat } from './buildings';
import { priceOf } from './market';
import { multiplier, nextSeasonStart } from './modifiers';
import { difficulty } from './difficulty';
import type { CommandResult, GameState, Pantry, ProductId } from './types';

export function defaultPantry(): Pantry {
  const eat = {} as Record<ProductId, boolean>;
  for (const p of PRODUCT_IDS) eat[p] = isFood(p) && VILLAGERS.pantry.eat.includes(p);
  return { eat, reserveDays: VILLAGERS.pantry.reserveDays };
}

/** Racion diaria total de todos los aldeanos, con el ahorro de la casa. */
export function dailyFood(state: GameState): number {
  const saving = Math.min(0.8, buildingStat(state, 'house', 'foodSaving'));
  // El invierno duro hace comer mas (y uno suave, algo menos).
  return state.villagers.length * VILLAGERS.foodPerDay * (1 - saving) * multiplier(state, 'food') * difficulty(state).food;
}

/** Si un producto es comida (la lana y el pano no). */
export const isFood = (p: ProductId): boolean => PRODUCTS[p].food !== false;

/** Reserva «hasta las cuentas»: guarda lo que se comera hasta el proximo cierre de estacion. */
export const UNTIL_ACCOUNTS = -1;

/** Dias que cubre la reserva elegida (la de «hasta las cuentas» cambia cada dia). */
export function reserveDays(state: GameState): number {
  return state.pantry.reserveDays === UNTIL_ACCOUNTS ? nextSeasonStart(state.day) - state.day : state.pantry.reserveDays;
}

/** Productos que se pueden comer, del mas barato al mas caro: se come primero lo que menos vale. */
export function eatingOrder(state: GameState): ProductId[] {
  return PRODUCT_IDS.filter((p) => isFood(p) && state.pantry.eat[p]).sort((a, b) => priceOf(state, a) - priceOf(state, b));
}

export function foodStock(state: GameState): number {
  return eatingOrder(state).reduce((sum, p) => sum + state.inventory[p], 0);
}

/** Dias de comida que quedan en el granero al ritmo actual. */
export function foodDays(state: GameState): number {
  const perDay = dailyFood(state);
  if (perDay <= 0) return Infinity;
  return Math.floor(foodStock(state) / perDay);
}

/** Raciones que hay que guardar para los dias de reserva elegidos. */
export function reserveTotal(state: GameState): number {
  return Math.ceil(dailyFood(state) * reserveDays(state));
}

/** Cuanto de cada producto queda apartado para comer (en el orden en que se comeria). */
export function reserved(state: GameState): Record<ProductId, number> {
  const out = {} as Record<ProductId, number>;
  for (const p of PRODUCT_IDS) out[p] = 0;
  let left = reserveTotal(state);
  for (const p of eatingOrder(state)) {
    if (left <= 0) break;
    out[p] = Math.min(state.inventory[p], left);
    left -= out[p];
  }
  return out;
}

/** Lo que se puede vender de un producto sin tocar la reserva. */
export function surplus(state: GameState, p: ProductId): number {
  return Math.max(0, state.inventory[p] - reserved(state)[p]);
}

export function setEdible(state: GameState, p: ProductId, eat: boolean): CommandResult {
  if (eat && !isFood(p)) return { ok: false, msg: 'msg.notFood', params: { product: p } };
  state.pantry.eat[p] = eat;
  return { ok: true, msg: eat ? 'msg.pantryEat' : 'msg.pantryKeep', params: { product: p } };
}

export function setReserveDays(state: GameState, days: number): CommandResult {
  state.pantry.reserveDays = days === UNTIL_ACCOUNTS ? UNTIL_ACCOUNTS : Math.max(0, Math.round(days));
  return { ok: true, msg: days === UNTIL_ACCOUNTS ? 'msg.pantryReserveAccounts' : 'msg.pantryReserve', params: { days: reserveDays(state) } };
}
