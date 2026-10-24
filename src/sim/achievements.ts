// Libro de cuentas y logros. Cada cierre de estacion se apunta (monedas, ingresos, gastos, comida,
// aldeanos y relaciones) para las graficas del libro. Los logros se revisan cada dia y se avisan una
// vez; todo sale de achievements.json.
import { ACHIEVEMENTS, PATHS, type AchievementDef } from './data';
import { DAYS_PER_SEASON } from './calendar';
import { ESTATE_IDS, tierOf } from './estates';
import { hasRank } from './progress';
import { pathLevel } from './paths';
import { MONUMENT_IDS, monumentDone } from './monuments';
import type { EstateId, GameState, Notice } from './types';

export interface SeasonRecord {
  day: number;
  /** Lo que entra: ventas, arriendos y rentas. */
  income: number;
  /** Lo que sale en las cuentas: impuestos, deuda, soldada, salarios y mantenimiento. */
  costs: number;
  /** Monedas tras las cuentas. */
  coins: number;
  food: number;
  villagers: number;
  rep: Record<EstateId, number>;
}

/** Apunta las cuentas de la estacion en el libro (como mucho historyMax estaciones). */
export function recordSeason(state: GameState, params: Record<string, string | number>): void {
  const n = (k: string) => Number(params[k] ?? 0);
  state.history.push({
    day: state.day,
    income: n('earned') + n('rent') + n('dues'),
    costs: n('tithe') - n('unpaid') + n('tribute') + n('upkeep') + n('wages') + n('maintenance') + n('debtPaid'),
    coins: state.coins,
    food: n('food'),
    villagers: state.villagers.length,
    rep: { ...state.rep },
  });
  if (state.history.length > ACHIEVEMENTS.historyMax) state.history.splice(0, state.history.length - ACHIEVEMENTS.historyMax);
}

const batches = (state: GameState): number => Object.values(state.workshops).reduce((n, w) => n + (w?.made ?? 0), 0);

/** Si un logro se cumple ahora. */
export function achievementMet(state: GameState, a: AchievementDef): boolean {
  if (a.stat && state.stats[a.stat] < (a.min ?? 1)) return false;
  if (a.coins && state.coins < a.coins) return false;
  if (a.villagers && state.villagers.length < a.villagers) return false;
  if (a.rank && !hasRank(state, a.rank)) return false;
  if (a.batches && batches(state) < a.batches) return false;
  if (a.noHungerDays && (state.villagers.length === 0 || state.day - state.stats.lastHungerDay < a.noHungerDays || state.day < a.noHungerDays)) return false;
  if (a.devoted && ESTATE_IDS.filter((e) => tierOf(state.rep[e]) === 'devoted').length < a.devoted) return false;
  if (a.earnedTraits && state.character.earned.length < a.earnedTraits) return false;
  if (a.pathLevel && !PATHS.ids.some((p) => pathLevel(state.paths.merits[p]).level >= a.pathLevel!)) return false;
  if (a.years && state.day < a.years * 4 * DAYS_PER_SEASON) return false;
  if (a.monument && !MONUMENT_IDS.some((id) => monumentDone(state, id))) return false;
  return true;
}

/** Logros recien conseguidos (se avisan una vez). */
export function checkAchievements(state: GameState): Notice[] {
  const out: Notice[] = [];
  for (const a of ACHIEVEMENTS.achievements) {
    if (state.achievements[a.id] !== undefined || !achievementMet(state, a)) continue;
    state.achievements[a.id] = state.day;
    out.push({ ok: true, msg: 'msg.achievement', params: { achievement: a.id } });
  }
  return out;
}
