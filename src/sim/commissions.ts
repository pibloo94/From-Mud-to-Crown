// Encargos de los estamentos: al empezar cada estacion, cada estamento pide algo (productos, monedas
// o tandas en los talleres) hasta las cuentas. Cumplirlo da su favor (y, si es en productos, algo de
// dinero) y cuenta como decision a su favor. No cumplirlo no castiga: es una oportunidad.
import { ANIMALS, ANIMAL_IDS, COMMISSIONS, CROPS, PRODUCTS, WORKSHOPS, type CommissionDef } from './data';
import { ESTATE_IDS, applyRep } from './estates';
import { recordDeeds } from './character';
import { cropUnlocked } from './progress';
import { builtWorkshops } from './workshops';
import { priceOf } from './market';
import { random } from './random';
import type { CommandResult, CropId, GameState, Notice, ProductId } from './types';

export const commissionDef = (id: string): CommissionDef | undefined => COMMISSIONS.templates.find((c) => c.id === id);

/** Si el producto se puede conseguir ya (cultivo desbloqueado, animales o taller que lo haga). */
export function obtainable(state: GameState, p: ProductId): boolean {
  const crop = (Object.keys(CROPS) as CropId[]).find((c) => CROPS[c].product === p);
  if (crop) return cropUnlocked(state, crop);
  if (PRODUCTS[p].artisan) return builtWorkshops(state).some((id) => WORKSHOPS[id].recipe.out[p]);
  const animal = ANIMAL_IDS.find((a) => ANIMALS[a].product === p);
  if (animal) return state.herds[animal].count > 0;
  return true;
}

/** Tandas hechas en todos los talleres (para los encargos del gremio). */
export const totalBatches = (state: GameState): number => Object.values(state.workshops).reduce((n, w) => n + (w?.made ?? 0), 0);

const available = (state: GameState, c: CommissionDef): boolean => {
  if (c.goods) return Object.keys(c.goods).every((p) => obtainable(state, p as ProductId));
  if (c.batches) return builtWorkshops(state).length > 0;
  return true;
};

/** Cantidad que pide un encargo segun el nivel. */
export const commissionAmount = (state: GameState, c: CommissionDef): number => {
  const base = c.goods ? Object.values(c.goods)[0]! : (c.coins ?? c.batches ?? 0);
  return Math.round(base + c.perLevel * state.level);
};

/** Nuevos encargos al empezar la estacion: uno por estamento, al azar entre los que se pueden cumplir. */
export function offerCommissions(state: GameState): Notice[] {
  state.commissions.offers = [];
  if (state.day < COMMISSIONS.firstDay) return [];
  for (const e of ESTATE_IDS) {
    const options = COMMISSIONS.templates.filter((c) => c.estate === e && available(state, c));
    if (options.length === 0) continue;
    const c = options[Math.floor(random(state) * options.length)];
    state.commissions.offers.push({ id: c.id, amount: commissionAmount(state, c), base: c.batches ? totalBatches(state) : 0, done: false });
  }
  return state.commissions.offers.length ? [{ ok: true, msg: 'msg.commissionsNew', params: { n: state.commissions.offers.length } }] : [];
}

/** Lo que lleva hecho un encargo y lo que pide. */
export function commissionProgress(state: GameState, index: number): { have: number; need: number } {
  const o = state.commissions.offers[index];
  const c = o && commissionDef(o.id);
  if (!o || !c) return { have: 0, need: 1 };
  if (c.goods) return { have: state.inventory[Object.keys(c.goods)[0] as ProductId], need: o.amount };
  if (c.batches) return { have: totalBatches(state) - o.base, need: o.amount };
  return { have: state.coins, need: o.amount };
}

/** Dinero que se paga por lo entregado (parte de lo que vale en el mercado). */
export function commissionPay(state: GameState, index: number): number {
  const o = state.commissions.offers[index];
  const c = o && commissionDef(o.id);
  if (!c?.goods) return 0;
  const p = Object.keys(c.goods)[0] as ProductId;
  return Math.round(o.amount * priceOf(state, p) * COMMISSIONS.payRate);
}

/** Cumple un encargo: entrega lo pedido y cobra el favor y el dinero. */
export function completeCommission(state: GameState, index: number): CommandResult {
  const o = state.commissions.offers[index];
  const c = o && commissionDef(o.id);
  if (!o || !c || o.done) return { ok: false, msg: 'msg.nothing' };
  const { have, need } = commissionProgress(state, index);
  if (have < need) return { ok: false, msg: 'msg.commissionMissing', params: { n: need - have } };
  const pay = commissionPay(state, index);
  if (c.goods) state.inventory[Object.keys(c.goods)[0] as ProductId] -= need;
  else if (c.coins) state.coins -= need;
  state.coins += pay;
  const rep = { [c.estate]: c.rep };
  applyRep(state, rep);
  recordDeeds(state, rep);
  o.done = true;
  state.stats.commissionsDone++;
  if (state.commissions.offers.every((x) => x.done)) state.stats.commissionSeasons++;
  return { ok: true, msg: 'msg.commissionDone', params: { estate: c.estate, rep: c.rep, coins: pay } };
}

export const openCommissions = (state: GameState): number => state.commissions.offers.filter((o) => !o.done).length;

