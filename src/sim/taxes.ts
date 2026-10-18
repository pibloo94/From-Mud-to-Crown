// Cuentas de cada estacion: diezmo a la iglesia, tributo al baron y renta de los aparceros.
import { PROGRESSION } from './data';
import { multiplier } from './modifiers';
import { DAYS_PER_SEASON } from './calendar';
import { clampRep } from './villagers';
import type { GameState, Notice } from './types';

export interface SeasonBill {
  earned: number;
  tithe: number;
  tribute: number;
  /** Multiplicador aplicado al tributo (penalizaciones y reputacion baja). */
  tributeMult: number;
  rent: number;
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
    tithe: grace ? 0 : Math.round(state.stats.seasonEarned * t.titheRate),
    tribute: grace ? 0 : Math.round(base * tributeMult),
    tributeMult,
    rent: state.leases * PROGRESSION.lands.rentPerSeason,
    food: state.stats.seasonFood,
  };
}

/** Cobra la renta y paga los impuestos al cambiar de estacion. Devuelve la tarjeta de cuentas. */
export function settleSeason(state: GameState, endedSeason: string): Notice {
  const bill = seasonBill(state);
  state.coins += bill.rent;
  const due = bill.tithe + bill.tribute;
  const paid = Math.min(due, state.coins);
  state.coins -= paid;
  const unpaid = due - paid;
  if (unpaid > 0) state.rep.baron = clampRep(state.rep.baron + PROGRESSION.taxes.unpaidBaron);
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
      food: bill.food,
      unpaid,
      grace: bill.grace ? 1 : 0,
    },
  };
}
