// Fertilidad del suelo: cada cosecha cansa la parcela (mas si se repite cultivo que si se rota) y
// la cosecha rinde en proporcion. La tierra se recupera sola poco a poco, y mas en barbecho y en invierno.
// Tambien, cuanto vale de verdad un producto cuando un taller lo transforma (para elegir que sembrar).
import { CROPS, PROGRESSION, WORKSHOPS } from './data';
import { dateFromDay } from './calendar';
import { priceOf } from './market';
import { artisansOf, batchesPerDay, builtWorkshops } from './workshops';
import type { CropId, GameState, Plot, ProductId } from './types';

export const newPlot = (): Plot => ({ crop: null, growth: 0, fertility: 1, last: null });

const F = () => PROGRESSION.fertility;

/** Lo que rinde la cosecha de una parcela madura segun su fertilidad (al menos 1). */
export function harvestYield(plot: Plot): number {
  if (!plot.crop) return 0;
  return Math.max(1, Math.round(CROPS[plot.crop].yield * plot.fertility));
}

/** Tras cosechar: la tierra pierde fertilidad segun el cultivo; rotando, la mitad. */
export function tireSoil(plot: Plot, crop: CropId): void {
  const drain = CROPS[crop].drain * (plot.last && plot.last !== crop ? F().rotation : 1);
  plot.fertility = Math.max(F().min, plot.fertility - drain);
  plot.last = crop;
}

/**
 * Cada dia la tierra recupera una parte de lo que le falta (regen), mas en barbecho y en invierno.
 * Asi, rotando cultivos se queda hacia 1 y repitiendo el mismo se asienta por debajo.
 */
export function restSoil(state: GameState): void {
  const winter = dateFromDay(state.day).season === 'winter';
  for (const plot of Object.values(state.plots)) {
    const gain = F().regen * (F().max - plot.fertility) + (plot.crop ? 0 : F().fallowPerDay) + (winter ? F().winterPerDay : 0);
    plot.fertility = Math.min(F().max, plot.fertility + Math.max(0, gain));
  }
}

/** Dias de trabajo de los talleres que se tienen en cuenta al valorar lo que necesitan. */
const STOCK_DAYS = 4;

/**
 * Lo que vale una unidad para quien siembra: su precio o, si un taller con artesano la transforma
 * sola y aun le falta para unos dias, lo que saca el taller de ella.
 */
export function cropUnitValue(state: GameState, p: ProductId): number {
  let best = priceOf(state, p);
  for (const id of builtWorkshops(state)) {
    const { in: inputs, out } = WORKSHOPS[id].recipe;
    const keys = Object.keys(inputs);
    if (artisansOf(state, id).length === 0 || keys.length !== 1 || keys[0] !== p) continue;
    const need = (inputs[p] ?? 0) * Math.ceil(batchesPerDay(state, id) * STOCK_DAYS);
    if (state.inventory[p] >= need) continue;
    const made = Object.entries(out).reduce((sum, [q, n]) => sum + (n ?? 0) * priceOf(state, q as ProductId), 0);
    best = Math.max(best, made / (inputs[p] ?? 1));
  }
  return best;
}
