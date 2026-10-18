// Reglas del juego: funciones que modifican el estado. Sin dependencias de Phaser ni del DOM.
import { ANIMALS, ANIMAL_IDS, CROPS, CROP_IDS, PRODUCTS, PROGRESSION } from './data';
import { DAY_MS, dateFromDay } from './calendar';
import { plotKey, tileAt } from './state';
import { addXp, cropUnlocked, hasFeature, levelDef } from './progress';
import { priceOf, rollPrices } from './market';
import { maybeTriggerEvent } from './events';
import type { AnimalId, CommandResult, CropId, GameState, Notice, Plot, ProductId, Speed } from './types';

/** Avance maximo por fotograma, para que una pausa del navegador no salte muchos dias de golpe. */
const MAX_FRAME_MS = 250;

/** Resultado de una orden que ademas puede subir de nivel. */
export interface Outcome {
  result: CommandResult;
  levelUps: number[];
}

const done = (result: CommandResult, levelUps: number[] = []): Outcome => ({ result, levelUps });
const fail = (msg: string, params?: CommandResult['params']): Outcome => done({ ok: false, msg, params });

// ------------------------------------------------------------------ tiempo

export interface TickResult {
  days: number;
  notices: Notice[];
}

/** Avanza el reloj segun la velocidad. No avanza si hay un evento esperando decision. */
export function tick(state: GameState, realMs: number): TickResult {
  const out: TickResult = { days: 0, notices: [] };
  if (state.speed === 0 || realMs <= 0 || state.events.pending) return out;
  const ms = Math.min(realMs, MAX_FRAME_MS);
  state.dayProgress += (ms * state.speed) / DAY_MS;
  while (state.dayProgress >= 1 && !state.events.pending) {
    state.dayProgress -= 1;
    out.notices.push(...advanceDay(state));
    out.days++;
  }
  if (state.events.pending) state.dayProgress = Math.min(state.dayProgress, 0.999);
  return out;
}

export function advanceDay(state: GameState): Notice[] {
  const notices: Notice[] = [];
  const season = dateFromDay(state.day).season;
  const growth = 1 + state.workers * PROGRESSION.workers.growthBonus;
  for (const plot of Object.values(state.plots)) {
    if (!plot.crop) continue;
    const def = CROPS[plot.crop];
    if (!def.seasons.includes(season)) continue; // helada: el cultivo espera
    plot.growth = Math.min(plot.growth + growth, def.growDays);
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
  // Jornal: si no se puede pagar, el jornalero se marcha.
  if (state.workers > 0) {
    const wage = state.workers * PROGRESSION.workers.wage;
    if (state.coins >= wage) state.coins -= wage;
    else {
      state.workers--;
      notices.push({ ok: false, msg: 'msg.workerLeft' });
    }
  }
  state.day++;
  const newSeason = dateFromDay(state.day).season;
  if (newSeason !== season) {
    rollPrices(state);
    notices.push({ ok: true, msg: `msg.season.${newSeason}` });
  } else if (state.day % PROGRESSION.priceDays === 0) {
    rollPrices(state);
  }
  if (state.marketBoost && state.day >= state.marketBoost.untilDay) state.marketBoost = null;
  maybeTriggerEvent(state);
  return notices;
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

/** Cultivos que se pueden sembrar ahora mismo (desbloqueados y en temporada). */
export function plantableCrops(state: GameState): CropId[] {
  const season = dateFromDay(state.day).season;
  return CROP_IDS.filter((c) => cropUnlocked(state, c) && CROPS[c].seasons.includes(season));
}

export function plant(state: GameState, x: number, y: number, crop: CropId = 'wheat'): Outcome {
  const plot = state.plots[plotKey(x, y)];
  if (!plot) return fail('msg.notFarmland');
  if (plot.crop) return fail('msg.alreadyPlanted');
  if (!cropUnlocked(state, crop)) return fail('msg.cropLocked', { crop, level: CROPS[crop].unlockLevel });
  if (!CROPS[crop].seasons.includes(dateFromDay(state.day).season)) return fail('msg.outOfSeason', { crop });
  const cost = CROPS[crop].seedCost;
  if (state.coins < cost) return fail('msg.notEnoughCoins', { cost });
  state.coins -= cost;
  plot.crop = crop;
  plot.growth = 0;
  return done({ ok: true, msg: 'msg.planted', params: { crop, cost } });
}

export function harvest(state: GameState, x: number, y: number): Outcome {
  const plot = state.plots[plotKey(x, y)];
  if (!plot || !plot.crop) return fail('msg.nothingPlanted');
  if (!isRipe(plot)) return done(growingInfo(state, plot));
  const def = CROPS[plot.crop];
  state.inventory[def.product] += def.yield;
  state.stats.harvested += def.yield;
  plot.crop = null;
  plot.growth = 0;
  const levelUps = addXp(state, def.xp);
  return done({ ok: true, msg: 'msg.harvested', params: { amount: def.yield, product: def.product, xp: def.xp } }, levelUps);
}

function growingInfo(state: GameState, plot: Plot): CommandResult {
  const crop = plot.crop as CropId;
  const def = CROPS[crop];
  if (!def.seasons.includes(dateFromDay(state.day).season)) return { ok: false, msg: 'msg.dormant', params: { crop } };
  const perDay = 1 + state.workers * PROGRESSION.workers.growthBonus;
  return { ok: false, msg: 'msg.growing', params: { crop, days: Math.ceil((def.growDays - plot.growth) / perDay) } };
}

// ------------------------------------------------------------------ tierra

export function landCost(state: GameState): number {
  const { baseCost, growth } = PROGRESSION.land;
  return Math.round(baseCost * growth ** state.landBought);
}

export function plotCount(state: GameState): number {
  return Object.keys(state.plots).length;
}

/** Una baldosa de hierba junto al campo se puede roturar. */
export function canExpandAt(state: GameState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  if (!tile || tile.kind !== 'grass') return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => tileAt(state, x + dx, y + dy)?.kind === 'soil');
}

/** Comprueba si se puede comprar la baldosa; devuelve el motivo si no. */
export function landCheck(state: GameState, x: number, y: number): CommandResult {
  if (!canExpandAt(state, x, y)) return { ok: false, msg: 'msg.nothing' };
  if (!hasFeature(state, 'buyLand')) return { ok: false, msg: 'msg.landLocked', params: { level: 2 } };
  const max = levelDef(state.level).maxPlots;
  if (plotCount(state) >= max) return { ok: false, msg: 'msg.landLimit', params: { max } };
  const cost = landCost(state);
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoinsLand', params: { cost } };
  return { ok: true, msg: 'msg.landOffer', params: { cost } };
}

export function buyLand(state: GameState, x: number, y: number): Outcome {
  const check = landCheck(state, x, y);
  if (!check.ok) return done(check);
  const cost = landCost(state);
  state.coins -= cost;
  state.landBought++;
  tileAt(state, x, y)!.kind = 'soil';
  state.plots[plotKey(x, y)] = { crop: null, growth: 0 };
  return done({ ok: true, msg: 'msg.landBought', params: { cost } }, addXp(state, 5));
}

// ------------------------------------------------------------------ animales

export function collect(state: GameState, animal: AnimalId): Outcome {
  const herd = state.herds[animal];
  const product = ANIMALS[animal].product;
  if (!herd || herd.stored <= 0) return fail('msg.nothingToCollect', { product });
  const amount = herd.stored;
  state.inventory[product] += amount;
  herd.stored = 0;
  const levelUps = addXp(state, amount * PRODUCTS[product].xpCollect);
  return done({ ok: true, msg: 'msg.collected', params: { amount, product } }, levelUps);
}

export function buyAnimal(state: GameState, animal: AnimalId): Outcome {
  const offer = PROGRESSION.animalsForSale[animal];
  if (!hasFeature(state, offer.unlock)) return fail('msg.animalLocked');
  if (state.herds[animal].count >= offer.max) return fail('msg.animalLimit', { max: offer.max });
  if (state.coins < offer.price) return fail('msg.notEnoughCoins', { cost: offer.price });
  state.coins -= offer.price;
  state.herds[animal].count++;
  return done({ ok: true, msg: `msg.bought.${animal}`, params: { cost: offer.price } }, addXp(state, 5));
}

// ------------------------------------------------------------------ mercado

export function sell(state: GameState, product: ProductId, qty: number | 'all'): Outcome {
  const have = state.inventory[product];
  const amount = qty === 'all' ? have : Math.min(Math.max(0, Math.floor(qty)), have);
  if (amount <= 0) return fail('msg.nothingToSell', { product });
  const coins = amount * priceOf(state, product);
  state.inventory[product] -= amount;
  state.coins += coins;
  state.stats.earned += coins;
  const levelUps = addXp(state, coins * PROGRESSION.xpPerCoinSold);
  return done({ ok: true, msg: 'msg.sold', params: { amount, product, coins } }, levelUps);
}

// ------------------------------------------------------------------ interaccion con el mapa

/** Lo que pasa al tocar una baldosa: una accion directa o una pregunta al jugador. */
export type Interaction =
  | { kind: 'done'; outcome: Outcome }
  | { kind: 'choosePlant'; x: number; y: number; crops: CropId[] }
  | { kind: 'offerLand'; x: number; y: number; cost: number }
  | { kind: 'openMarket' };

export function interact(state: GameState, x: number, y: number): Interaction {
  const tile = tileAt(state, x, y);
  if (!tile) return { kind: 'done', outcome: fail('msg.nothing') };
  switch (tile.kind) {
    case 'soil': {
      const plot = state.plots[plotKey(x, y)];
      if (plot.crop) return { kind: 'done', outcome: isRipe(plot) ? harvest(state, x, y) : done(growingInfo(state, plot)) };
      const crops = plantableCrops(state);
      if (crops.length === 0) return { kind: 'done', outcome: fail('msg.winterNoCrops') };
      if (crops.length === 1) return { kind: 'done', outcome: plant(state, x, y, crops[0]) };
      return { kind: 'choosePlant', x, y, crops };
    }
    case 'grass': {
      const check = landCheck(state, x, y);
      if (check.ok) return { kind: 'offerLand', x, y, cost: landCost(state) };
      return { kind: 'done', outcome: done(check) };
    }
    case 'coop':
      return { kind: 'done', outcome: collect(state, 'chicken') };
    case 'pen':
      return { kind: 'done', outcome: collect(state, 'cow') };
    case 'market':
      return { kind: 'openMarket' };
    case 'house':
      return { kind: 'done', outcome: done({ ok: true, msg: 'msg.house' }) };
    default:
      return { kind: 'done', outcome: fail('msg.nothing') };
  }
}
