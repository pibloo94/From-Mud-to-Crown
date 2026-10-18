// Reglas del juego: funciones que modifican el estado. Sin dependencias de Phaser ni del DOM.
import { ANIMALS, ANIMAL_IDS, CROPS, PRODUCTS } from './data';
import { DAY_MS } from './calendar';
import { plotKey, tileAt } from './state';
import type { AnimalId, CommandResult, CropId, GameState, Plot, ProductId, Speed } from './types';

/** Avance maximo por fotograma, para que una pausa del navegador no salte muchos dias de golpe. */
const MAX_FRAME_MS = 250;

// ------------------------------------------------------------------ tiempo

/** Avanza el reloj segun la velocidad. Devuelve cuantos dias completos han pasado. */
export function tick(state: GameState, realMs: number): number {
  if (state.speed === 0 || realMs <= 0) return 0;
  const ms = Math.min(realMs, MAX_FRAME_MS);
  state.dayProgress += (ms * state.speed) / DAY_MS;
  let days = 0;
  while (state.dayProgress >= 1) {
    state.dayProgress -= 1;
    advanceDay(state);
    days++;
  }
  return days;
}

export function advanceDay(state: GameState): void {
  for (const plot of Object.values(state.plots)) {
    if (!plot.crop) continue;
    plot.growth = Math.min(plot.growth + 1, CROPS[plot.crop].growDays);
  }
  for (const id of ANIMAL_IDS) {
    const herd = state.herds[id];
    const def = ANIMALS[id];
    herd.timer++;
    if (herd.timer >= def.everyDays) {
      herd.timer = 0;
      const batch = herd.count * def.amountPerAnimal;
      herd.stored = Math.min(herd.stored + batch, batch * def.maxBatches);
    }
  }
  state.day++;
}

export function setSpeed(state: GameState, speed: Speed): void {
  state.speed = speed;
}

// ------------------------------------------------------------------ cultivos

export function isRipe(plot: Plot): boolean {
  return plot.crop !== null && plot.growth >= CROPS[plot.crop].growDays;
}

/** Indice del dibujo de crecimiento (0..n-1), o -1 si la parcela esta vacia. */
export function cropStage(plot: Plot): number {
  if (!plot.crop) return -1;
  const def = CROPS[plot.crop];
  const last = def.stageSprites.length - 1;
  if (plot.growth >= def.growDays) return last;
  if (def.growDays <= 1) return 0;
  return Math.min(last - 1, Math.ceil((plot.growth * (last - 1)) / (def.growDays - 1)));
}

export function plant(state: GameState, x: number, y: number, crop: CropId = 'wheat'): CommandResult {
  const plot = state.plots[plotKey(x, y)];
  if (!plot) return { ok: false, msg: 'msg.notFarmland' };
  if (plot.crop) return { ok: false, msg: 'msg.alreadyPlanted' };
  const cost = CROPS[crop].seedCost;
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  state.coins -= cost;
  plot.crop = crop;
  plot.growth = 0;
  return { ok: true, msg: 'msg.planted', params: { crop, cost } };
}

export function harvest(state: GameState, x: number, y: number): CommandResult {
  const plot = state.plots[plotKey(x, y)];
  if (!plot || !plot.crop) return { ok: false, msg: 'msg.nothingPlanted' };
  if (!isRipe(plot)) return growingInfo(plot);
  const def = CROPS[plot.crop];
  state.inventory[def.product] += def.yield;
  state.stats.harvested += def.yield;
  plot.crop = null;
  plot.growth = 0;
  return { ok: true, msg: 'msg.harvested', params: { amount: def.yield, product: def.product } };
}

function growingInfo(plot: Plot): CommandResult {
  const def = CROPS[plot.crop as CropId];
  return { ok: false, msg: 'msg.growing', params: { crop: plot.crop as CropId, days: def.growDays - plot.growth } };
}

// ------------------------------------------------------------------ animales

export function collect(state: GameState, animal: AnimalId): CommandResult {
  const herd = state.herds[animal];
  const product = ANIMALS[animal].product;
  if (!herd || herd.stored <= 0) return { ok: false, msg: 'msg.nothingToCollect', params: { product } };
  const amount = herd.stored;
  state.inventory[product] += amount;
  herd.stored = 0;
  return { ok: true, msg: 'msg.collected', params: { amount, product } };
}

// ------------------------------------------------------------------ mercado

export function sell(state: GameState, product: ProductId, qty: number | 'all'): CommandResult {
  const have = state.inventory[product];
  const amount = qty === 'all' ? have : Math.min(Math.max(0, Math.floor(qty)), have);
  if (amount <= 0) return { ok: false, msg: 'msg.nothingToSell', params: { product } };
  const coins = amount * PRODUCTS[product].price;
  state.inventory[product] -= amount;
  state.coins += coins;
  state.stats.earned += coins;
  return { ok: true, msg: 'msg.sold', params: { amount, product, coins } };
}

// ------------------------------------------------------------------ interaccion con el mapa

/** Accion por defecto al tocar una baldosa. */
export function interact(state: GameState, x: number, y: number): CommandResult | { open: 'market' } {
  const tile = tileAt(state, x, y);
  if (!tile) return { ok: false, msg: 'msg.nothing' };
  switch (tile.kind) {
    case 'soil': {
      const plot = state.plots[plotKey(x, y)];
      if (!plot.crop) return plant(state, x, y);
      if (isRipe(plot)) return harvest(state, x, y);
      return growingInfo(plot);
    }
    case 'coop':
      return collect(state, 'chicken');
    case 'pen':
      return collect(state, 'cow');
    case 'market':
      return { open: 'market' };
    case 'house':
      return { ok: true, msg: 'msg.house' };
    default:
      return { ok: false, msg: 'msg.nothing' };
  }
}
