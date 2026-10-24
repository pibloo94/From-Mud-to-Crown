// Talleres: transforman productos del granero (trigo -> harina -> pan, leche -> queso).
// Se levantan en los solares del mapa y necesitan un aldeano artesano para trabajar.
import { PRODUCTS, PRODUCT_IDS, VILLAGERS, WORKSHOPS, WORKSHOP_IDS, type WorkshopUpgradeDef } from './data';
import { tileAt } from './state';
import { addXp } from './progress';
import { hasMaterials, materialsList, missingMaterials, payMaterials } from './materials';
import { storageFree, store } from './buildings';
import { surplus } from './pantry';
import { isIdle } from './modifiers';
import { efficiency } from './villagers';
import { repFrom } from './estates';
import { meritsFromCraft } from './paths';
import type { CommandResult, GameState, Notice, ProductId, Villager, WorkshopId } from './types';

export interface WorkOutcome {
  result: CommandResult;
  levelUps: number[];
}

const fail = (msg: string, params?: CommandResult['params']): WorkOutcome => ({ result: { ok: false, msg, params }, levelUps: [] });

export function workshopUnlocked(state: GameState, id: WorkshopId): boolean {
  return state.level >= WORKSHOPS[id].unlockLevel;
}

export function builtWorkshops(state: GameState): WorkshopId[] {
  return WORKSHOP_IDS.filter((id) => state.workshops[id]);
}

export function workshopAt(state: GameState, x: number, y: number): WorkshopId | null {
  return WORKSHOP_IDS.find((id) => state.workshops[id]?.x === x && state.workshops[id]?.y === y) ?? null;
}

/** Talleres que aun se pueden levantar en un solar. */
export function buildableWorkshops(state: GameState): WorkshopId[] {
  return WORKSHOP_IDS.filter((id) => !state.workshops[id]);
}

export function buildWorkshop(state: GameState, id: WorkshopId, x: number, y: number): WorkOutcome {
  const tile = tileAt(state, x, y);
  if (!tile || tile.kind !== 'site') return fail('msg.nothing');
  if (state.workshops[id]) return fail('msg.workshopExists');
  const def = WORKSHOPS[id];
  if (!workshopUnlocked(state, id)) return fail('msg.upgradeLocked', { level: def.unlockLevel });
  if (state.coins < def.cost) return fail('msg.notEnoughCoins', { cost: def.cost });
  if (!hasMaterials(state, def.materials)) return fail('msg.missingMaterials', { list: materialsList(missingMaterials(state, def.materials)) });
  state.coins -= def.cost;
  payMaterials(state, def.materials);
  tile.kind = 'workshop';
  state.workshops[id] = { x, y, level: 0, progress: 0, made: 0 };
  const levelUps = addXp(state, 40);
  repFrom(state, 'workshopBuilt');
  return { result: { ok: true, msg: 'msg.workshopBuilt', params: { workshop: id, cost: def.cost } }, levelUps };
}

export function nextWorkshopUpgrade(state: GameState, id: WorkshopId): WorkshopUpgradeDef | null {
  const w = state.workshops[id];
  if (!w) return null;
  return WORKSHOPS[id].upgrades[w.level] ?? null;
}

export function upgradeWorkshop(state: GameState, id: WorkshopId): WorkOutcome {
  const w = state.workshops[id];
  if (!w) return fail('msg.nothing');
  const up = nextWorkshopUpgrade(state, id);
  if (!up) return fail('msg.buildingMaxed');
  if (state.level < up.level) return fail('msg.upgradeLocked', { level: up.level });
  if (up.title && !state.titles.includes(up.title)) return fail('msg.needsTitle', { rank: up.title });
  if (state.coins < up.cost) return fail('msg.notEnoughCoins', { cost: up.cost });
  if (!hasMaterials(state, up.materials)) return fail('msg.missingMaterials', { list: materialsList(missingMaterials(state, up.materials)) });
  state.coins -= up.cost;
  payMaterials(state, up.materials);
  w.level++;
  repFrom(state, 'workshopUpgraded');
  const levelUps = addXp(state, 15);
  return { result: { ok: true, msg: 'msg.workshopUpgraded', params: { workshop: id, wsUpgrade: `${id}.${up.id}`, cost: up.cost } }, levelUps };
}

/** Tandas por dia que hace el taller con un artesano sin herramienta. */
export function batchesPerDay(state: GameState, id: WorkshopId): number {
  const w = state.workshops[id];
  if (!w) return 0;
  const def = WORKSHOPS[id];
  return def.batchesPerDay + def.upgrades.slice(0, w.level).reduce((sum, u) => sum + u.batches, 0);
}

export function artisansOf(state: GameState, id: WorkshopId): Villager[] {
  return state.villagers.filter((v) => v.job === 'artisan' && v.workshop === id);
}

/** Pone a un aldeano de artesano en un taller (o lo deja sin taller con null). Si el puesto esta lleno, el anterior queda libre. */
export function assignArtisan(state: GameState, villagerId: number, id: WorkshopId | null): CommandResult {
  const v = state.villagers.find((x) => x.id === villagerId);
  if (!v) return { ok: false, msg: 'msg.nothing' };
  if (id && !state.workshops[id]) return { ok: false, msg: 'msg.nothing' };
  v.job = 'artisan';
  v.workshop = id;
  if (id) {
    const others = artisansOf(state, id).filter((x) => x.id !== v.id);
    for (const o of others.slice(0, Math.max(0, others.length - (VILLAGERS.jobs.artisan.perWorkshop - 1)))) o.workshop = null;
  }
  return { ok: true, msg: id ? 'msg.artisanAssigned' : 'msg.jobChanged', params: id ? { name: v.name, workshop: id } : { name: v.name, job: 'artisan' } };
}

export type WorkshopStatus = 'working' | 'noArtisan' | 'noInputs' | 'full' | 'idle';

/** Puede hacerse una tanda ahora? Los ingredientes salen de lo que sobra tras la reserva de la despensa. */
function canBatch(state: GameState, id: WorkshopId): WorkshopStatus {
  const { recipe } = WORKSHOPS[id];
  for (const p of PRODUCT_IDS) if ((recipe.in[p] ?? 0) > surplus(state, p)) return 'noInputs';
  const inTotal = PRODUCT_IDS.reduce((s, p) => s + (recipe.in[p] ?? 0), 0);
  const outTotal = PRODUCT_IDS.reduce((s, p) => s + (recipe.out[p] ?? 0), 0);
  if (outTotal - inTotal > storageFree(state)) return 'full';
  return 'working';
}

export function workshopStatus(state: GameState, id: WorkshopId): WorkshopStatus {
  if (!state.workshops[id]) return 'idle';
  if (artisansOf(state, id).length === 0) return 'noArtisan';
  if (isIdle(state)) return 'idle';
  return canBatch(state, id);
}

/** Trabajo diario de los talleres. Devuelve avisos de subida de nivel. */
export function workshopsWork(state: GameState): Notice[] {
  const notices: Notice[] = [];
  if (isIdle(state)) return notices;
  for (const id of builtWorkshops(state)) {
    const w = state.workshops[id]!;
    const artisans = artisansOf(state, id);
    if (artisans.length === 0) continue;
    const eff = Math.max(...artisans.map((a) => efficiency(a)));
    w.progress += batchesPerDay(state, id) * eff;
    const { recipe, xpPerBatch } = WORKSHOPS[id];
    while (w.progress >= 1) {
      if (canBatch(state, id) !== 'working') {
        // Sin ingredientes o sin sitio, los dias parados no se acumulan como tandas pendientes.
        w.progress = Math.min(w.progress, 0.99);
        break;
      }
      for (const p of PRODUCT_IDS) state.inventory[p] -= recipe.in[p] ?? 0;
      for (const p of PRODUCT_IDS) if (recipe.out[p]) store(state, p as ProductId, recipe.out[p]!);
      // Lo que sale de los talleres cuenta para el camino del Oficio.
      meritsFromCraft(state, PRODUCT_IDS.reduce((sum, p) => sum + (recipe.out[p] ?? 0) * PRODUCTS[p].price, 0));
      w.progress -= 1;
      w.made++;
      for (const level of addXp(state, xpPerBatch)) notices.push({ ok: true, msg: 'levelup', card: 'levelup', params: { level } });
    }
  }
  return notices;
}

/** Al hacer artesano a un aldeano desde la casa, ocupa el primer taller que no tenga artesano. */
export function autoAssign(state: GameState, villagerId: number): void {
  const v = state.villagers.find((x) => x.id === villagerId);
  if (!v || v.job !== 'artisan' || (v.workshop && state.workshops[v.workshop])) return;
  v.workshop = builtWorkshops(state).find((id) => artisansOf(state, id).length < VILLAGERS.jobs.artisan.perWorkshop) ?? null;
}
