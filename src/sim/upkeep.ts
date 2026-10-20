// Gastos fijos de cada estacion: salario de los aldeanos y mantenimiento de lo construido.
// Se cobran al cerrar la estacion, despues de impuestos y soldada. Lo que no se paga tiene castigo:
// los aldeanos que no cobran se van y lo que no se mantiene rinde menos la estacion siguiente.
import { BUILDING_IDS, PROGRESSION, VILLAGERS, WORKSHOP_IDS } from './data';
import { addModifier } from './modifiers';
import { clampRep } from './villagers';
import { difficulty } from './difficulty';
import type { GameState, Villager } from './types';

export interface UpkeepBill {
  /** Salarios de los aldeanos. */
  wages: number;
  /** Mantenimiento: edificios, talleres, carretas, puesto y casa solariega. */
  maintenance: number;
  /** Desglose del mantenimiento, para los paneles. */
  parts: { buildings: number; workshops: number; carts: number; stall: number; manor: number };
}

/** Lo que cuesta cada cosa segun la dificultad. */
const scaled = (state: GameState, n: number): number => Math.round(n * difficulty(state).upkeep);

export const wageOf = (state: GameState, v: Villager): number => scaled(state, VILLAGERS.wages[v.job] ?? 0);

export const buildingUpkeep = (state: GameState, b: (typeof BUILDING_IDS)[number]): number => scaled(state, state.buildings[b] * PROGRESSION.upkeep.perBuildingLevel);

export function workshopUpkeep(state: GameState, id: (typeof WORKSHOP_IDS)[number]): number {
  const w = state.workshops[id];
  const u = PROGRESSION.upkeep;
  return w ? scaled(state, u.workshop + u.perWorkshopUpgrade * w.level) : 0;
}

export function upkeepBill(state: GameState): UpkeepBill {
  const u = PROGRESSION.upkeep;
  const parts = {
    buildings: BUILDING_IDS.reduce((sum, b) => sum + buildingUpkeep(state, b), 0),
    workshops: WORKSHOP_IDS.reduce((sum, id) => sum + workshopUpkeep(state, id), 0),
    carts: scaled(state, state.carts * u.cart),
    stall: state.stall ? scaled(state, u.stall) : 0,
    manor: scaled(state, state.noble.manor * u.perManorLevel),
  };
  return {
    wages: state.villagers.reduce((sum, v) => sum + wageOf(state, v), 0),
    maintenance: parts.buildings + parts.workshops + parts.carts + parts.stall + parts.manor,
    parts,
  };
}

export interface UpkeepPaid {
  wages: number;
  maintenance: number;
  /** Aldeanos que se van por no cobrar. */
  left: string[];
  /** Mantenimiento sin pagar: cultivos y animales rinden menos. */
  neglected: boolean;
}

/**
 * Paga salarios y mantenimiento con lo que haya. Primero la gente: si no llega para todos, se van
 * los ultimos en llegar hasta que el resto cobra. Despues el mantenimiento: si falta, abandono.
 */
export function payUpkeep(state: GameState, grace: boolean): UpkeepPaid {
  if (grace) return { wages: 0, maintenance: 0, left: [], neglected: false };
  const left: string[] = [];
  let wages = state.villagers.reduce((sum, v) => sum + wageOf(state, v), 0);
  while (wages > state.coins && state.villagers.length > 0) {
    const v = state.villagers[state.villagers.length - 1];
    state.villagers = state.villagers.slice(0, -1);
    left.push(v.name);
    wages -= wageOf(state, v);
  }
  if (left.length > 0) state.rep.village = clampRep(state.rep.village - 3 * left.length);
  state.coins -= wages;

  const { maintenance } = upkeepBill(state);
  const paid = Math.min(maintenance, state.coins);
  state.coins -= paid;
  const neglected = paid < maintenance;
  if (neglected) {
    const n = PROGRESSION.upkeep.neglect;
    addModifier(state, 'neglect', 'growth', n.growth, { days: n.days });
    addModifier(state, 'neglect', 'animal', n.animal, { days: n.days });
  }
  return { wages, maintenance: paid, left, neglected };
}
