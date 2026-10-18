// Aldeanos: necesitan cama y comida, trabajan en un oficio y rinden mas con mejores herramientas.
import { PROGRESSION, PRODUCT_IDS, VILLAGERS } from './data';
import { buildingStat, storageFree } from './buildings';
import { isIdle, multiplier } from './modifiers';
import { random } from './random';
import { priceOf } from './market';
import type { CommandResult, GameState, JobId, Notice, ProductId, Villager } from './types';

const ok = (msg: string, params?: CommandResult['params']): CommandResult => ({ ok: true, msg, params });
const no = (msg: string, params?: CommandResult['params']): CommandResult => ({ ok: false, msg, params });

export function beds(state: GameState): number {
  return buildingStat(state, 'house', 'beds');
}

export function freeBeds(state: GameState): number {
  return Math.max(0, beds(state) - state.villagers.length);
}

export function hireCost(state: GameState): number {
  const base = VILLAGERS.hireCost;
  return state.rep.village >= PROGRESSION.reputation.highVillage ? Math.ceil(base / 2) : base;
}

/** Racion diaria total de todos los aldeanos, con el ahorro de la casa. */
export function dailyFood(state: GameState): number {
  const saving = Math.min(0.8, buildingStat(state, 'house', 'foodSaving'));
  return state.villagers.length * VILLAGERS.foodPerDay * (1 - saving);
}

/** Dias de comida que quedan en el granero al ritmo actual. */
export function foodDays(state: GameState): number {
  const perDay = dailyFood(state);
  if (perDay <= 0) return Infinity;
  const stock = VILLAGERS.foodOrder.reduce((s, p) => s + state.inventory[p], 0);
  return Math.floor(stock / perDay);
}

export function addVillager(state: GameState, job: JobId = 'farmer'): Villager | null {
  if (freeBeds(state) <= 0) return null;
  const used = new Set(state.villagers.map((v) => v.name));
  const free = VILLAGERS.names.filter((n) => !used.has(n));
  const pool = free.length ? free : VILLAGERS.names;
  const name = pool[Math.floor(random(state) * pool.length)];
  const v: Villager = { id: state.nextVillagerId++, name, job, tool: 0, hungry: 0 };
  state.villagers.push(v);
  return v;
}

export function hireVillager(state: GameState): CommandResult {
  if (freeBeds(state) <= 0) return no('msg.noFreeBed');
  const cost = hireCost(state);
  if (state.coins < cost) return no('msg.notEnoughCoins', { cost });
  state.coins -= cost;
  const v = addVillager(state)!;
  return ok('msg.villagerJoined', { name: v.name, cost });
}

export function setJob(state: GameState, id: number, job: JobId): CommandResult {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return no('msg.nothing');
  v.job = job;
  return ok('msg.jobChanged', { name: v.name, job });
}

export function toolCost(state: GameState, tier: number): number {
  const t = VILLAGERS.tools.tiers[tier - 1];
  return Math.round(t.cost * multiplier(state, 'toolDiscount'));
}

export function upgradeTool(state: GameState, id: number): CommandResult {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return no('msg.nothing');
  const next = v.tool + 1;
  const tier = VILLAGERS.tools.tiers[next - 1];
  if (!tier) return no('msg.toolMaxed');
  if (state.level < tier.level) return no('msg.upgradeLocked', { level: tier.level });
  const cost = toolCost(state, next);
  if (state.coins < cost) return no('msg.notEnoughCoins', { cost });
  state.coins -= cost;
  v.tool = next;
  return ok('msg.toolUpgraded', { name: v.name, tool: `${v.job}.${next}`, cost });
}

export function dismissVillager(state: GameState, id: number): CommandResult {
  const v = state.villagers.find((x) => x.id === id);
  if (!v) return no('msg.nothing');
  state.villagers = state.villagers.filter((x) => x.id !== id);
  return ok('msg.villagerDismissed', { name: v.name });
}

export const efficiency = (v: Villager): number => VILLAGERS.tools.efficiency[v.tool] ?? 1;

function working(state: GameState, job: JobId): Villager[] {
  return isIdle(state) ? [] : state.villagers.filter((v) => v.job === job);
}

/** Dias de crecimiento que ganan los cultivos cada dia. */
export function growthPerDay(state: GameState): number {
  const bonus = working(state, 'farmer').reduce((s, v) => s + VILLAGERS.jobs.farmer.growthBonus * efficiency(v), 0);
  return (1 + bonus) * multiplier(state, 'growth');
}

/** Bonificacion de produccion animal que aportan los pastores. */
export function herderBonus(state: GameState): number {
  return working(state, 'herder').reduce((s, v) => s + VILLAGERS.jobs.herder.animalBonus * efficiency(v), 0);
}

export function hasHerder(state: GameState): boolean {
  return working(state, 'herder').length > 0;
}

// ------------------------------------------------------------------ dia a dia

/** Los aldeanos comen de la cosecha; si no hay, pasan hambre y acaban marchandose. */
export function feedVillagers(state: GameState): Notice[] {
  const notices: Notice[] = [];
  if (state.villagers.length === 0) {
    state.foodDebt = 0;
    return notices;
  }
  state.foodDebt += dailyFood(state);
  let eaten = 0;
  while (state.foodDebt >= 1) {
    const p = VILLAGERS.foodOrder.find((f) => state.inventory[f] > 0);
    if (!p) break;
    state.inventory[p]--;
    state.foodDebt -= 1;
    eaten++;
  }
  state.stats.seasonFood += eaten;
  const fed = state.foodDebt < 1;
  for (const v of state.villagers) v.hungry = fed ? 0 : v.hungry + 1;
  if (!fed) {
    state.foodDebt = Math.min(state.foodDebt, 1);
    const starving = state.villagers.find((v) => v.hungry > VILLAGERS.hungerDays);
    if (starving) {
      state.villagers = state.villagers.filter((v) => v !== starving);
      state.rep.village = clampRep(state.rep.village - 5);
      notices.push({ ok: false, msg: 'msg.villagerLeftHunger', params: { name: starving.name } });
    } else {
      notices.push({ ok: false, msg: 'msg.villagersHungry' });
    }
  }
  return notices;
}

/** El carretero lleva al mercado lo que sobra (guardando comida para unos dias). */
export function carterSells(state: GameState): Notice | null {
  const carters = working(state, 'carter');
  if (carters.length === 0) return null;
  const cfg = VILLAGERS.jobs.carter;
  if (state.day % cfg.sellEvery !== 0) return null;
  const bestTier = Math.max(...carters.map((c) => c.tool));
  const rate = cfg.priceRate + cfg.priceRatePerTier * bestTier;
  let reserve = Math.ceil(dailyFood(state) * cfg.reserveDays);
  let coins = 0;
  let units = 0;
  for (const p of PRODUCT_IDS) {
    let keep = 0;
    if (VILLAGERS.foodOrder.includes(p) && reserve > 0) {
      keep = Math.min(state.inventory[p], reserve);
      reserve -= keep;
    }
    const n = state.inventory[p] - keep;
    if (n <= 0) continue;
    coins += Math.round(n * priceOf(state, p as ProductId) * rate);
    units += n;
    state.inventory[p] -= n;
  }
  if (units === 0) return null;
  state.coins += coins;
  state.stats.earned += coins;
  state.stats.seasonEarned += coins;
  return { ok: true, msg: 'msg.carterSold', params: { amount: units, coins } };
}

export function clampRep(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Para que el pastor no recoja mas de lo que cabe. */
export const canStoreAny = (state: GameState): boolean => storageFree(state) > 0;
