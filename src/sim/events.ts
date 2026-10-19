// Eventos con tarjeta: aparecen al pasar los dias y el jugador elige una opcion.
// Ofertas: rechazar no castiga. Obligaciones: incumplir penaliza. Percances: se juega el riesgo.
import {
  ANIMAL_IDS,
  EVENTS,
  EVENT_IDS,
  PRODUCT_IDS,
  PROGRESSION,
  type Amounts,
  type EventEffects,
  type EventOptionDef,
} from './data';
import { dateFromDay } from './calendar';
import { random, weightedPick } from './random';
import { addXp } from './progress';
import { priceOf } from './market';
import { addModifier } from './modifiers';
import { buildingStat, store } from './buildings';
import { addVillager, clampRep, freeBeds } from './villagers';
import type { AnimalId, CommandResult, GameState, MaterialId, ProductId, WorkshopId } from './types';
import { delayCaravans } from './trade';

/**
 * Condiciones de eventos y opciones. Claves admitidas:
 * - un producto o "coins": tener al menos esa cantidad
 * - "chicken", "cow": tener al menos esos animales; "chickenBelow", "cowBelow": tener menos
 * - "chickenRoom", "cowRoom": que quepan mas animales en el gallinero o el corral
 * - "villagers": tener al menos esos aldeanos; "freeBed": tener al menos esas camas libres
 * - "baron", "village": reputacion minima
 * - "flag:<nombre>": que haya pasado algo antes (1) o que no (0)
 * - "workshop:<taller>": que el taller este construido (1) o no (0)
 * - "caravans": caravanas en camino (minimo)
 * - "level": nivel minimo
 */
export function meetsRequirements(state: GameState, req: Record<string, number> = {}): boolean {
  for (const [key, value] of Object.entries(req)) {
    if (!meets(state, key, value)) return false;
  }
  return true;
}

function meets(state: GameState, key: string, value: number): boolean {
  if (key === 'coins') return state.coins >= value;
  if ((PRODUCT_IDS as string[]).includes(key)) return state.inventory[key as ProductId] >= value;
  if ((ANIMAL_IDS as string[]).includes(key)) return state.herds[key as AnimalId].count >= value;
  if (key.endsWith('Below')) {
    const a = key.slice(0, -5) as AnimalId;
    if ((ANIMAL_IDS as string[]).includes(a)) return state.herds[a].count < value;
  }
  if (key === 'chickenRoom') return state.herds.chicken.count + value <= buildingStat(state, 'coop', 'maxAnimals');
  if (key === 'cowRoom') return state.herds.cow.count + value <= buildingStat(state, 'pen', 'maxAnimals');
  if (key === 'villagers') return state.villagers.length >= value;
  if (key === 'freeBed') return freeBeds(state) >= value;
  if (key === 'baron') return state.rep.baron >= value;
  if (key === 'village') return state.rep.village >= value;
  if (key === 'level') return state.level >= value;
  if (key.startsWith('flag:')) return state.flags.includes(key.slice(5)) === value > 0;
  if (key === 'caravans') return state.caravans.length >= value;
  if (key.startsWith('workshop:')) return !!state.workshops[key.slice(9) as WorkshopId] === value > 0;
  throw new Error(`Requisito de evento desconocido: ${key}`);
}

export function canPay(state: GameState, cost: Amounts = {}): boolean {
  return meetsRequirements(state, cost as Record<string, number>);
}

export function optionAvailable(state: GameState, opt: EventOptionDef): boolean {
  return canPay(state, opt.cost) && meetsRequirements(state, opt.requires);
}

export function eligibleEvents(state: GameState): string[] {
  const season = dateFromDay(state.day).season;
  return EVENT_IDS.filter((id) => {
    const ev = EVENTS[id];
    if (ev.minLevel && state.level < ev.minLevel) return false;
    if (ev.seasons && !ev.seasons.includes(season)) return false;
    if ((state.events.cooldowns[id] ?? 0) > state.day) return false;
    if (!meetsRequirements(state, ev.requires)) return false;
    // Siempre debe quedar al menos una opcion elegible.
    return ev.options.some((o) => optionAvailable(state, o));
  });
}

/** Tirada diaria: puede dejar un evento pendiente. Devuelve su id si aparece. */
export function maybeTriggerEvent(state: GameState): string | null {
  const cfg = PROGRESSION.events;
  const ev = state.events;
  if (ev.pending || state.day < cfg.firstDay || state.day - ev.lastDay < cfg.minGap) return null;
  if (random(state) >= cfg.dailyChance) return null;
  const id = weightedPick(state, eligibleEvents(state).map((e) => ({ id: e, weight: EVENTS[e].weight })));
  if (!id) return null;
  startEvent(state, id);
  return id;
}

export function startEvent(state: GameState, id: string): void {
  state.events.pending = { id };
  state.events.lastDay = state.day;
  state.events.cooldowns[id] = state.day + EVENTS[id].cooldownDays;
}

export interface EventOutcome {
  result: CommandResult;
  levelUps: number[];
}

/** Aplica la opcion elegida del evento pendiente. */
export function resolveEvent(state: GameState, optionId: string): EventOutcome {
  const pending = state.events.pending;
  if (!pending) return { result: { ok: false, msg: 'msg.nothing' }, levelUps: [] };
  const opt = EVENTS[pending.id].options.find((o) => o.id === optionId);
  if (!opt || !optionAvailable(state, opt)) return { result: { ok: false, msg: 'msg.optionUnavailable' }, levelUps: [] };

  for (const [key, value] of Object.entries(opt.cost ?? {})) {
    if (key === 'coins') state.coins -= value;
    else state.inventory[key as ProductId] -= value;
  }
  const params: Record<string, number> = {};
  const levelUps = applyEffects(state, pending.id, opt.effects, params);
  let failed = false;
  if (opt.risk && random(state) < opt.risk.chance) {
    failed = true;
    levelUps.push(...applyEffects(state, pending.id, opt.risk.effects, params));
  }
  state.events.pending = null;
  const msg = `event.${pending.id}.result.${opt.id}${failed ? '.fail' : ''}`;
  return { result: { ok: !failed, msg, params }, levelUps };
}

function applyEffects(state: GameState, source: string, fx: EventEffects = {}, params: Record<string, number>): number[] {
  if (fx.coins) {
    const before = state.coins;
    state.coins = Math.max(0, state.coins + fx.coins);
    params.coins = Math.abs(state.coins - before);
  }
  for (const [p, n] of Object.entries(fx.items ?? {})) {
    if ((n ?? 0) > 0) params.amount = store(state, p as ProductId, n ?? 0);
    else state.inventory[p as ProductId] = Math.max(0, state.inventory[p as ProductId] + (n ?? 0));
  }
  for (const [a, n] of Object.entries(fx.herds ?? {})) {
    const herd = state.herds[a as AnimalId];
    herd.count = Math.max(0, herd.count + (n ?? 0));
  }
  if (fx.villagers) for (let i = 0; i < fx.villagers; i++) addVillager(state);
  if (fx.rep?.baron) state.rep.baron = clampRep(state.rep.baron + fx.rep.baron);
  if (fx.rep?.village) state.rep.village = clampRep(state.rep.village + fx.rep.village);
  if (fx.modifier) {
    const m = fx.modifier;
    addModifier(state, source, m.kind, m.value, { days: m.days, seasons: m.seasons });
  }
  for (const f of fx.flags?.set ?? []) if (!state.flags.includes(f)) state.flags.push(f);
  if (fx.flags?.clear) state.flags = state.flags.filter((f) => !fx.flags!.clear!.includes(f));
  if (fx.loseFraction) {
    const products = fx.loseFraction.products === 'all' ? PRODUCT_IDS : fx.loseFraction.products;
    let lost = 0;
    for (const p of products) {
      const n = Math.floor(state.inventory[p] * fx.loseFraction.fraction);
      state.inventory[p] -= n;
      lost += n;
    }
    params.lost = lost;
  }
  if (fx.cropSetback) {
    for (const plot of Object.values(state.plots)) if (plot.crop) plot.growth = Math.max(0, plot.growth - fx.cropSetback);
  }
  if (fx.seedVouchers) state.seedVouchers += fx.seedVouchers;
  for (const [m, n] of Object.entries(fx.materials ?? {})) state.materials[m as MaterialId] = Math.max(0, state.materials[m as MaterialId] + (n ?? 0));
  if (fx.caravanDelay) delayCaravans(state, fx.caravanDelay);
  if (fx.marketBoost) state.marketBoost = { mult: fx.marketBoost.mult, untilDay: state.day + fx.marketBoost.days };
  const levelUps: number[] = [];
  if (fx.sellAll) {
    const { product, mult } = fx.sellAll;
    const coins = Math.round(state.inventory[product] * priceOf(state, product) * mult);
    params.amount = state.inventory[product];
    params.coins = coins;
    state.inventory[product] = 0;
    state.coins += coins;
    state.stats.earned += coins;
    state.stats.seasonEarned += coins;
    levelUps.push(...addXp(state, coins * PROGRESSION.xpPerCoinSold));
  }
  if (fx.xp) {
    params.xp = fx.xp;
    levelUps.push(...addXp(state, fx.xp));
  }
  return levelUps;
}
