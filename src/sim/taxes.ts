// Cuentas de cada estacion: diezmo a la iglesia, tributo al baron y renta de los aparceros.
import { PROGRESSION } from './data';
import { multiplier } from './modifiers';
import { DAYS_PER_SEASON } from './calendar';
import { clampRep } from './villagers';
import { manorStat, nobleSeasonBill, nobleSeasonEffects, amountsList, liegeOf } from './noble';
import type { GameState, Notice } from './types';

export interface SeasonBill {
  earned: number;
  tithe: number;
  tribute: number;
  /** Multiplicador aplicado al tributo (penalizaciones y reputacion baja). */
  tributeMult: number;
  rent: number;
  /** Rentas de las aldeas vasallas. */
  dues: number;
  /** Soldada de la mesnada. */
  upkeep: number;
  food: number;
  /** Estacion de gracia: no se cobra nada. */
  grace: boolean;
}

export function plotsForTribute(state: GameState): number {
  return Object.keys(state.plots).length + state.leases;
}

/** Las primeras estaciones no pagan impuestos (el dia de las cuentas es el primero de la siguiente). */
export function inGrace(state: GameState): boolean {
  return state.day <= PROGRESSION.taxes.graceSeasons * DAYS_PER_SEASON;
}

export function seasonBill(state: GameState): SeasonBill {
  const t = PROGRESSION.taxes;
  let tributeMult = multiplier(state, 'tribute');
  if (state.rep.baron < t.lowBaron) tributeMult *= t.lowBaronMult;
  const grace = inGrace(state);
  const base = (t.tributeBase + t.tributePerPlot * plotsForTribute(state)) * (t.rankTribute[state.rank] ?? 1);
  return {
    grace,
    earned: state.stats.seasonEarned,
    tithe: grace ? 0 : Math.round(state.stats.seasonEarned * t.titheRate * manorStat(state, 'titheMult')),
    tribute: grace ? 0 : Math.round(base * tributeMult),
    tributeMult,
    rent: state.leases * PROGRESSION.lands.rentPerSeason,
    dues: nobleSeasonBill(state).dues,
    upkeep: nobleSeasonBill(state).upkeep,
    food: state.stats.seasonFood,
  };
}

/** Cobra la renta y paga los impuestos al cambiar de estacion. Devuelve la tarjeta de cuentas. */
export function settleSeason(state: GameState, endedSeason: string): Notice {
  const bill = seasonBill(state);
  const noble = nobleSeasonBill(state);
  state.coins += bill.rent + bill.dues;
  nobleSeasonEffects(state, noble);
  const due = bill.tithe + bill.tribute;
  const paid = Math.min(due, state.coins);
  state.coins -= paid;
  const unpaid = due - paid;
  if (unpaid > 0) state.rep.baron = clampRep(state.rep.baron + PROGRESSION.taxes.unpaidBaron);
  // Soldada: los soldados que no cobran se marchan.
  const wage = Math.min(bill.upkeep, state.coins);
  state.coins -= wage;
  const perSoldier = bill.upkeep / Math.max(1, state.noble.soldiers);
  const deserted = bill.upkeep > wage ? Math.min(state.noble.soldiers, Math.ceil((bill.upkeep - wage) / perSoldier)) : 0;
  state.noble.soldiers -= deserted;
  state.stats.seasonEarned = 0;
  state.stats.seasonFood = 0;
  return {
    ok: unpaid === 0,
    msg: 'report.season',
    card: 'season',
    params: {
      season: endedSeason,
      earned: bill.earned,
      tithe: bill.tithe,
      tribute: bill.tribute,
      tributeMult: Math.round(bill.tributeMult * 100),
      rent: bill.rent,
      dues: bill.dues,
      duesMats: amountsList(noble.duesMaterials),
      upkeep: wage,
      deserted,
      liege: liegeOf(state),
      food: bill.food,
      unpaid,
      grace: bill.grace ? 1 : 0,
    },
  };
}
