// Eventos con tarjeta: aparecen al pasar los dias y el jugador elige una opcion.
import { ANIMAL_IDS, EVENTS, EVENT_IDS, PRODUCT_IDS, PROGRESSION, type Amounts, type EventEffects, type EventOptionDef } from './data';
import { dateFromDay } from './calendar';
import { random, weightedPick } from './random';
import { addXp } from './progress';
import { priceOf } from './market';
import type { AnimalId, CommandResult, GameState, ProductId } from './types';

/**
 * Condiciones de eventos y opciones. Claves admitidas:
 * - un producto o "coins": tener al menos esa cantidad
 * - "chicken", "cow": tener al menos esos animales; "chickenBelow", "cowBelow": tener menos
 * - "workersBelow": tener menos jornaleros
 */
export function meetsRequirements(state: GameState, req: Record<string, number> = {}): boolean {
  for (const [key, value] of Object.entries(req)) {
    if (key === 'coins') {
      if (state.coins < value) return false;
    } else if ((PRODUCT_IDS as string[]).includes(key)) {
      if (state.inventory[key as ProductId] < value) return false;
    } else if ((ANIMAL_IDS as string[]).includes(key)) {
      if (state.herds[key as AnimalId].count < value) return false;
    } else if (key.endsWith('Below') && (ANIMAL_IDS as string[]).includes(key.slice(0, -5))) {
      if (state.herds[key.slice(0, -5) as AnimalId].count >= value) return false;
    } else if (key === 'workersBelow') {
      if (state.workers >= value) return false;
    } else {
      throw new Error(`Requisito de evento desconocido: ${key}`);
    }
  }
  return true;
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
    return meetsRequirements(state, ev.requires);
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
  const levelUps = applyEffects(state, opt.effects, params);
  let failed = false;
  if (opt.risk && random(state) < opt.risk.chance) {
    failed = true;
    levelUps.push(...applyEffects(state, opt.risk.effects, params));
  }
  state.events.pending = null;
  const msg = `event.${pending.id}.result.${opt.id}${failed ? '.fail' : ''}`;
  return { result: { ok: !failed, msg, params }, levelUps };
}

function applyEffects(state: GameState, fx: EventEffects = {}, params: Record<string, number>): number[] {
  if (fx.coins) {
    const before = state.coins;
    state.coins = Math.max(0, state.coins + fx.coins);
    params.coins = Math.abs(state.coins - before);
  }
  for (const [p, n] of Object.entries(fx.items ?? {})) {
    state.inventory[p as ProductId] = Math.max(0, state.inventory[p as ProductId] + (n ?? 0));
  }
  for (const [a, n] of Object.entries(fx.herds ?? {})) {
    const herd = state.herds[a as AnimalId];
    herd.count = Math.max(0, herd.count + (n ?? 0));
  }
  if (fx.workers) state.workers = Math.min(PROGRESSION.workers.max, Math.max(0, state.workers + fx.workers));
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
    levelUps.push(...addXp(state, coins * PROGRESSION.xpPerCoinSold));
  }
  if (fx.xp) {
    params.xp = fx.xp;
    levelUps.push(...addXp(state, fx.xp));
  }
  return levelUps;
}
