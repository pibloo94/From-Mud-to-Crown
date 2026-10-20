// Cuentas de cada estacion: diezmo a la iglesia, tributo al baron y renta de los aparceros.
import { PROGRESSION } from './data';
import { multiplier } from './modifiers';
import { DAYS_PER_SEASON } from './calendar';
import { changeRep, driftReps, estateMult, repFrom } from './estates';
import { claimRenown } from './progress';
import { payUpkeep } from './upkeep';
import { chargeDebt, checkRankKeep, rollWeather, seasonNow, seizeForDebt, seizeLimit } from './risk';
import { manorStat, nobleSeasonBill, nobleSeasonEffects, amountsList, liegeOf } from './noble';
import { difficulty } from './difficulty';
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
  // Penalizaciones de eventos y el tramo de la relacion con la nobleza (estates.json).
  const tributeMult = multiplier(state, 'tribute') * estateMult(state, 'tribute');
  const grace = inGrace(state);
  const base = (t.tributeBase + t.tributePerPlot * plotsForTribute(state)) * (t.rankTribute[state.rank] ?? 1);
  return {
    grace,
    earned: state.stats.seasonEarned,
    tithe: grace ? 0 : Math.round(state.stats.seasonEarned * t.titheRate * manorStat(state, 'titheMult') * estateMult(state, 'tithe') * difficulty(state).taxes),
    tribute: grace ? 0 : Math.round(base * tributeMult * difficulty(state).taxes),
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
  // Lo que se debia de antes crece y se paga primero (ver risk.ts).
  const debt = chargeDebt(state);
  const due = bill.tithe + bill.tribute;
  const paid = Math.min(due, state.coins);
  state.coins -= paid;
  const unpaid = due - paid;
  // La Iglesia agradece el diezmo pagado y no perdona el que falta.
  if (bill.tithe > 0) repFrom(state, unpaid > 0 ? 'titheProblem' : 'tithePaid');
  // Y tu senor, el tributo pagado entero.
  if (bill.tribute > 0 && unpaid === 0) repFrom(state, 'tributePaid');
  if (unpaid > 0) {
    changeRep(state, 'nobles', PROGRESSION.taxes.unpaidBaron);
    state.debt += unpaid;
  }
  // Soldada: los soldados que no cobran se marchan.
  const wage = Math.min(bill.upkeep, state.coins);
  state.coins -= wage;
  const perSoldier = bill.upkeep / Math.max(1, state.noble.soldiers);
  const deserted = bill.upkeep > wage ? Math.min(state.noble.soldiers, Math.ceil((bill.upkeep - wage) / perSoldier)) : 0;
  state.noble.soldiers -= deserted;
  // Gastos fijos: salarios y mantenimiento (ver upkeep.ts).
  const fixed = payUpkeep(state, bill.grace);
  state.stats.seasonEarned = 0;
  state.stats.seasonFood = 0;
  const renown = claimRenown(state);
  // Las relaciones vuelven algo hacia el punto medio si no se cuidan.
  driftReps(state);
  // Riesgo: embargo si la deuda pasa del limite, aviso o perdida de rango, y tiempo de la estacion.
  const seized = seizeForDebt(state);
  const keep = checkRankKeep(state);
  const weather = rollWeather(state, seasonNow(state));
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
      renown,
      wages: fixed.wages,
      maintenance: fixed.maintenance,
      wagesLeft: fixed.left.length,
      wagesLeftNames: fixed.left.join(', '),
      neglected: fixed.neglected ? 1 : 0,
      debtInterest: debt.interest,
      debtPaid: debt.paid,
      debt: state.debt,
      seizeDebt: seizeLimit(state),
      seized: seized ?? '',
      rankWarning: keep.warning ? 1 : 0,
      rankLost: keep.lost ?? '',
      rank: state.rank,
      weather: `${seasonNow(state)}.${weather}`,
    },
  };
}
