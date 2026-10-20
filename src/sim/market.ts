// Precios del mercado: base del producto x estacion x variacion semanal x ferias.
import { PRODUCTS, PRODUCT_IDS, PROGRESSION, TRADE } from './data';
import { dateFromDay } from './calendar';
import { random } from './random';
import { multiplier } from './modifiers';
import { difficulty } from './difficulty';
import type { GameState, ProductId } from './types';

/** Recalcula la variacion aleatoria de cada producto (se llama cada semana y al cambiar de estacion). */
export function rollPrices(state: GameState): void {
  for (const p of PRODUCT_IDS) {
    const vol = PRODUCTS[p].volatility;
    state.priceMult[p] = 1 + (random(state) * 2 - 1) * vol;
  }
}

export function priceOf(state: GameState, p: ProductId): number {
  const def = PRODUCTS[p];
  const season = dateFromDay(state.day).season;
  const boost = (state.marketBoost && state.day < state.marketBoost.untilDay ? state.marketBoost.mult : 1) * multiplier(state, 'priceAll');
  // Sello del gremio: con el titulo de Artesano, lo hecho en los talleres vale mas.
  const guild = def.artisan && state.titles?.includes('artisan') ? PROGRESSION.artisanPriceBonus : 1;
  // Puesto propio en el mercado: se vende sin intermediarios.
  const stall = state.stall ? TRADE.stall.priceBonus : 1;
  return Math.max(1, Math.round(def.price * def.season[season] * (state.priceMult[p] ?? 1) * boost * guild * stall * difficulty(state).prices));
}

/** -1 por debajo del precio base, 0 parecido, 1 por encima. */
export function priceTrend(state: GameState, p: ProductId): -1 | 0 | 1 {
  const ratio = priceOf(state, p) / PRODUCTS[p].price;
  if (ratio >= 1.15) return 1;
  if (ratio <= 0.87) return -1;
  return 0;
}

export function boostActive(state: GameState): boolean {
  return !!state.marketBoost && state.day < state.marketBoost.untilDay;
}
