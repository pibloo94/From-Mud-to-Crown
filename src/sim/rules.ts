// Reglas del juego: funciones que modifican el estado. Sin dependencias de Phaser ni del DOM.
import { ANIMALS, ANIMAL_IDS, CROPS, CROP_IDS, PRODUCTS, PROGRESSION } from './data';
import { DAY_MS, dateFromDay } from './calendar';
import { plotKey, tileAt } from './state';
import { addXp, cropUnlocked, hasFeature, hasRank, levelDef, levelOnlyRank, rankDef, updateRank } from './progress';
import { charterReady, expandFief, hamletAt, isFiefRow } from './noble';
import { isReserved, nextToKeepClear } from './layout';
import { priceOf, rollPrices } from './market';
import { maybeTriggerEvent } from './events';
import { buildingStat, storageFree, store } from './buildings';
import { expireModifiers, multiplier } from './modifiers';
import { carterSells, farmerPlots, feedVillagers, growthPerDay, hasHerder, herderBonus } from './villagers';
import { isIdle } from './modifiers';
import { buildableWorkshops, workshopAt, workshopsWork } from './workshops';
import { caravansReturn } from './trade';
import { settleSeason } from './taxes';
import type { AnimalId, BuildingId, CommandResult, CropId, GameState, Notice, Plot, ProductId, Speed, WorkshopId } from './types';

/** Avance maximo por fotograma, para que una pausa del navegador no salte muchos dias de golpe. */
export const MAX_FRAME_MS = 250;

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

  // Cultivos: crecen mas rapido con labradores; fuera de temporada esperan.
  const growth = growthPerDay(state);
  for (const plot of Object.values(state.plots)) {
    if (!plot.crop) continue;
    const def = CROPS[plot.crop];
    if (!def.seasons.includes(season)) continue;
    plot.growth = Math.min(plot.growth + growth, def.growDays);
  }

  // Animales: el edificio, los pastores y los percances cambian lo que producen.
  for (const id of ANIMAL_IDS) {
    const herd = state.herds[id];
    const def = ANIMALS[id];
    herd.timer++;
    if (herd.timer >= def.everyDays) {
      herd.timer = 0;
      const base = herd.count * def.amountPerAnimal;
      const bonus = 1 + buildingStat(state, buildingOf(id), 'animalBonus') + herderBonus(state);
      herd.stored = Math.min(herd.stored + base * bonus * multiplier(state, 'animal'), base * def.maxBatches * bonus);
    }
  }
  // El pastor recoge solo lo que quepa en el granero.
  if (hasHerder(state)) for (const id of ANIMAL_IDS) collectInto(state, id);

  // Los labradores cosechan y siembran sus parcelas antes de comer; despues trabajan los talleres.
  notices.push(...farmersWork(state));
  notices.push(...workshopsWork(state));

  notices.push(...feedVillagers(state));

  state.day++;
  const newSeason = dateFromDay(state.day).season;
  if (newSeason !== season) {
    notices.push(settleSeason(state, season));
    rollPrices(state);
    notices.push({ ok: true, msg: `msg.season.${newSeason}` });
  } else if (state.day % PROGRESSION.priceDays === 0) {
    rollPrices(state);
  }
  notices.push(...caravansReturn(state));
  const sale = carterSells(state);
  if (sale) notices.push(sale);
  expireModifiers(state);
  if (state.marketBoost && state.day >= state.marketBoost.untilDay) state.marketBoost = null;
  notices.push(...checkRank(state));
  maybeTriggerEvent(state, notices);
  return notices;
}

/** Cultivo que conviene sembrar ahora: el que mas deja por dia de los que se pueden sembrar. */
export function bestCrop(state: GameState): CropId | null {
  const value = (c: CropId) => (CROPS[c].yield * priceOf(state, CROPS[c].product) - CROPS[c].seedCost) / CROPS[c].growDays;
  return plantableCrops(state).sort((a, b) => value(b) - value(a))[0] ?? null;
}

/**
 * Trabajo diario de los labradores en sus parcelas: cosechan lo maduro (si cabe en el granero)
 * y siembran el cultivo que tienen asignado, pagando la semilla. Si no hay dinero o no es
 * temporada, la parcela espera.
 */
export function farmersWork(state: GameState): Notice[] {
  const notices: Notice[] = [];
  if (isIdle(state)) return notices;
  const assigned = farmerPlots(state);
  for (const v of state.villagers) {
    if (v.job !== 'farmer') continue;
    for (const key of assigned.get(v.id) ?? []) {
      const [x, y] = key.split(',').map(Number);
      const plot = state.plots[key];
      if (plot.crop && isRipe(plot)) {
        const out = harvest(state, x, y);
        if (!out.result.ok) continue;
        notices.push({ ...out.result, tile: { x, y } });
        for (const level of out.levelUps) notices.push({ ok: true, msg: 'levelup', card: 'levelup', params: { level } });
      }
      if (!plot.crop && v.crop) {
        const crop = v.crop === 'auto' ? bestCrop(state) : v.crop;
        if (crop && plantableCrops(state).includes(crop)) plant(state, x, y, crop);
      }
    }
  }
  return notices;
}

export function setSpeed(state: GameState, speed: Speed): void {
  state.speed = speed;
}

/** Comprueba el ascenso de rango; al ser Terrateniente se abren las tierras del este. */
export function checkRank(state: GameState): Notice[] {
  const notices: Notice[] = [];
  // El rey avisa (una vez) de que esta dispuesto a vender la carta de nobleza.
  if (charterReady(state) && !state.flags.includes('charterOffered')) {
    state.flags.push('charterOffered');
    notices.push({ ok: true, msg: 'msg.charterReady' });
  }
  for (const gained of updateRank(state)) {
    if (gained === 'landowner') openEastLands(state);
    // Los rangos que solo piden nivel ya se anuncian en la tarjeta de subida de nivel.
    if (gained === 'lord') expandFief(state);
    if (levelOnlyRank(rankDef(gained))) continue;
    notices.push({ ok: true, msg: 'report.rank', card: 'rank', params: { rank: gained } });
  }
  return notices;
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

export function seedCost(state: GameState, crop: CropId): number {
  return state.seedVouchers > 0 ? 0 : CROPS[crop].seedCost;
}

export function plant(state: GameState, x: number, y: number, crop: CropId = 'wheat'): Outcome {
  const plot = state.plots[plotKey(x, y)];
  if (!plot) return fail('msg.notFarmland');
  if (plot.crop) return fail('msg.alreadyPlanted');
  if (!cropUnlocked(state, crop)) return fail('msg.cropLocked', { crop, level: CROPS[crop].unlockLevel });
  if (!CROPS[crop].seasons.includes(dateFromDay(state.day).season)) return fail('msg.outOfSeason', { crop });
  const cost = seedCost(state, crop);
  if (state.coins < cost) return fail('msg.notEnoughCoins', { cost });
  if (cost === 0 && state.seedVouchers > 0) state.seedVouchers--;
  state.coins -= cost;
  plot.crop = crop;
  plot.growth = 0;
  return done({ ok: true, msg: cost === 0 ? 'msg.plantedFree' : 'msg.planted', params: { crop, cost } });
}

export function harvest(state: GameState, x: number, y: number): Outcome {
  const plot = state.plots[plotKey(x, y)];
  if (!plot || !plot.crop) return fail('msg.nothingPlanted');
  if (!isRipe(plot)) return done(growingInfo(state, plot));
  const def = CROPS[plot.crop];
  // Si no cabe la cosecha entera, se queda en el campo esperando sitio en el granero.
  if (storageFree(state) < def.yield) return fail('msg.granaryFull');
  store(state, def.product, def.yield);
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
  return { ok: false, msg: 'msg.growing', params: { crop, days: Math.ceil((def.growDays - plot.growth) / growthPerDay(state)) } };
}

// ------------------------------------------------------------------ tierra

export function landCost(state: GameState): number {
  const { baseCost, growth } = PROGRESSION.land;
  return Math.round(baseCost * growth ** state.landBought);
}

export function plotCount(state: GameState): number {
  return Object.keys(state.plots).length;
}

const isEast = (x: number) => x >= PROGRESSION.lands.eastFrom;

/** Una baldosa de hierba junto al campo se puede roturar (las del este se arriendan). */
export function canExpandAt(state: GameState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);
  if (!tile || tile.kind !== 'grass' || isEast(x) || isFiefRow(y)) return false;
  if (isReserved(state, x, y) || nextToKeepClear(state, x, y)) return false;
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

// ------------------------------------------------------------------ tierras del este y aparceros

export function openEastLands(state: GameState): void {
  for (const t of state.map.tiles) if (t.kind === 'wild') t.kind = 'grass';
}

export function leaseCost(state: GameState): number {
  const { leaseBaseCost, leaseGrowth } = PROGRESSION.lands;
  return Math.round(leaseBaseCost * leaseGrowth ** state.leases);
}

export function canLeaseAt(state: GameState, x: number, y: number): boolean {
  return hasRank(state, 'landowner') && isEast(x) && !isFiefRow(y) && tileAt(state, x, y)?.kind === 'grass' && !isReserved(state, x, y) && !nextToKeepClear(state, x, y);
}

export function lease(state: GameState, x: number, y: number): Outcome {
  if (!canLeaseAt(state, x, y)) return fail('msg.nothing');
  const cost = leaseCost(state);
  if (state.coins < cost) return fail('msg.notEnoughCoins', { cost });
  state.coins -= cost;
  state.leases++;
  tileAt(state, x, y)!.kind = 'tenant';
  return done({ ok: true, msg: 'msg.leased', params: { cost, rent: PROGRESSION.lands.rentPerSeason } }, addXp(state, 15));
}

// ------------------------------------------------------------------ animales

export function buildingOf(animal: AnimalId): BuildingId {
  return animal === 'chicken' ? 'coop' : 'pen';
}

/** Pasa al granero lo producido que quepa. Devuelve cuanto se ha guardado. */
function collectInto(state: GameState, animal: AnimalId): number {
  const herd = state.herds[animal];
  const product = ANIMALS[animal].product;
  const added = store(state, product, Math.floor(herd.stored));
  herd.stored -= added;
  return added;
}

export function collect(state: GameState, animal: AnimalId): Outcome {
  const herd = state.herds[animal];
  const product = ANIMALS[animal].product;
  if (!herd || herd.stored < 1) return fail('msg.nothingToCollect', { product });
  if (storageFree(state) <= 0) return fail('msg.granaryFull');
  const amount = collectInto(state, animal);
  const levelUps = addXp(state, amount * PRODUCTS[product].xpCollect);
  return done({ ok: true, msg: 'msg.collected', params: { amount, product } }, levelUps);
}

export function animalCapacity(state: GameState, animal: AnimalId): number {
  return buildingStat(state, buildingOf(animal), 'maxAnimals');
}

export function buyAnimal(state: GameState, animal: AnimalId): Outcome {
  const offer = PROGRESSION.animalsForSale[animal];
  if (!hasFeature(state, offer.unlock)) return fail('msg.animalLocked');
  const max = animalCapacity(state, animal);
  if (state.herds[animal].count >= max) return fail('msg.animalLimit', { max });
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
  state.stats.seasonEarned += coins;
  const levelUps = addXp(state, coins * PROGRESSION.xpPerCoinSold);
  return done({ ok: true, msg: 'msg.sold', params: { amount, product, coins } }, levelUps);
}

// ------------------------------------------------------------------ interaccion con el mapa

/** Lo que pasa al tocar una baldosa: una accion directa o una pregunta al jugador. */
export type Interaction =
  | { kind: 'done'; outcome: Outcome }
  | { kind: 'choosePlant'; x: number; y: number; crops: CropId[] }
  | { kind: 'offerLand'; x: number; y: number; cost: number }
  | { kind: 'offerLease'; x: number; y: number; cost: number }
  | { kind: 'building'; building: BuildingId }
  | { kind: 'site'; x: number; y: number; options: WorkshopId[] }
  | { kind: 'workshop'; workshop: WorkshopId }
  /** Casa solariega: `hamlet` si se ha tocado una aldea. */
  | { kind: 'manor'; hamlet: string | null }
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
      if (isEast(x)) {
        if (canLeaseAt(state, x, y)) return { kind: 'offerLease', x, y, cost: leaseCost(state) };
        return { kind: 'done', outcome: fail('msg.nothing') };
      }
      const check = landCheck(state, x, y);
      if (check.ok) return { kind: 'offerLand', x, y, cost: landCost(state) };
      return { kind: 'done', outcome: done(check) };
    }
    case 'wild':
      return { kind: 'done', outcome: fail('msg.wildLocked') };
    case 'site':
      return { kind: 'site', x, y, options: buildableWorkshops(state) };
    case 'workshop': {
      const id = workshopAt(state, x, y);
      return id ? { kind: 'workshop', workshop: id } : { kind: 'done', outcome: fail('msg.nothing') };
    }
    case 'manor':
      return { kind: 'manor', hamlet: null };
    case 'hamlet':
      return { kind: 'manor', hamlet: hamletAt(x, y) };
    case 'tenant':
      return { kind: 'done', outcome: done({ ok: true, msg: 'msg.tenant', params: { rent: PROGRESSION.lands.rentPerSeason } }) };
    // Gallinero y corral: si hay algo que recoger se recoge; si no, se abre el edificio.
    case 'coop':
      if (state.herds.chicken.stored >= 1) return { kind: 'done', outcome: collect(state, 'chicken') };
      return { kind: 'building', building: 'coop' };
    case 'pen':
      if (state.herds.cow.stored >= 1) return { kind: 'done', outcome: collect(state, 'cow') };
      return { kind: 'building', building: 'pen' };
    case 'house':
      return { kind: 'building', building: 'house' };
    case 'granary':
      return { kind: 'building', building: 'granary' };
    case 'market':
      return { kind: 'openMarket' };
    default:
      return { kind: 'done', outcome: fail('msg.nothing') };
  }
}
