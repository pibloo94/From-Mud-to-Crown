// Parte de la estacion: lo que se cobrara en las proximas cuentas, si llega el dinero, que pasaria
// si no llega y para cuantos dias hay comida. Es una prevision "si las cuentas fueran hoy": las
// cuentas se ensayan sobre una copia de la partida, asi que la prevision sigue exactamente las mismas
// reglas que el cobro de verdad (taxes.ts) y nunca se desvia de el.
import { PROGRESSION, VILLAGERS } from './data';
import { nextSeasonStart } from './modifiers';
import { dailyFood, foodDays, foodStock } from './pantry';
import { settleSeason } from './taxes';
import type { GameState, Notice } from './types';

export interface SeasonForecast {
  /** Dias que faltan para las cuentas. */
  daysLeft: number;
  /** Estacion de gracia: no se cobra nada. */
  grace: boolean;
  /** Lo que se cobrara, en el orden en que se cobra. */
  charges: { debt: number; tithe: number; tribute: number; soldiers: number; wages: number; maintenance: number };
  /** Lo que entra al cerrar la estacion (arriendos y rentas de las aldeas). */
  income: number;
  /** Total que se cobrara. */
  total: number;
  /** Monedas que hay ahora. */
  coins: number;
  /** Lo que falta para pagarlo todo (0 si llega). */
  short: number;
  /** Lo que pasaria si las cuentas fueran hoy y no llega. */
  unpaidTaxes: number;
  deserters: number;
  leaving: string[];
  neglect: boolean;
  /** Diezmo: parte de lo que se gane hasta las cuentas (crece al vender). */
  titheRate: number;
  food: FoodForecast;
}

export interface FoodForecast {
  /** Raciones que se comen al dia. */
  perDay: number;
  /** Raciones que hay en el granero (lo que se puede comer). */
  stock: number;
  /** Dias que dura la comida (Infinity si nadie come). */
  days: number;
  /** Raciones que harian falta hasta las cuentas. */
  needed: number;
  /** Si se acaba antes de las cuentas. */
  short: boolean;
  /** Dias de hambre que aguanta un aldeano antes de irse. */
  hungerDays: number;
}

const num = (n: Notice, key: string): number => Number(n.params?.[key] ?? 0);

export function foodForecast(state: GameState): FoodForecast {
  const daysLeft = nextSeasonStart(state.day) - state.day;
  const perDay = dailyFood(state);
  const days = foodDays(state);
  return {
    perDay: Math.round(perDay * 10) / 10,
    stock: foodStock(state),
    days,
    needed: Math.ceil(perDay * daysLeft),
    short: state.villagers.length > 0 && days < daysLeft,
    hungerDays: VILLAGERS.hungerDays,
  };
}

/** Ensaya las cuentas sobre una copia de la partida, el dia en que tocan. */
function rehearse(state: GameState, coins?: number): Notice {
  const copy = structuredClone(state);
  copy.day = nextSeasonStart(state.day);
  if (coins !== undefined) copy.coins = coins;
  return settleSeason(copy, 'forecast');
}

export function seasonForecast(state: GameState): SeasonForecast {
  // Con la bolsa llena se ve lo que cuesta todo; con el dinero de ahora, lo que pasaria.
  const full = rehearse(state, Number.MAX_SAFE_INTEGER / 4);
  const real = rehearse(state);
  const charges = {
    debt: num(full, 'debtPaid'),
    tithe: num(full, 'tithe'),
    tribute: num(full, 'tribute'),
    soldiers: num(full, 'upkeep'),
    wages: num(full, 'wages'),
    maintenance: num(full, 'maintenance'),
  };
  const total = Object.values(charges).reduce((a, b) => a + b, 0);
  const income = num(full, 'rent') + num(full, 'dues');
  const left = num(real, 'wagesLeft') > 0 ? String(real.params?.wagesLeftNames ?? '').split(', ') : [];
  return {
    daysLeft: nextSeasonStart(state.day) - state.day,
    grace: num(full, 'grace') === 1,
    charges,
    income,
    total,
    coins: state.coins,
    short: Math.max(0, total - state.coins - income),
    unpaidTaxes: num(real, 'unpaid'),
    deserters: num(real, 'deserted'),
    leaving: left,
    neglect: num(real, 'neglected') === 1,
    titheRate: PROGRESSION.taxes.titheRate,
    food: foodForecast(state),
  };
}
