// Nobleza: carta de nobleza, feudo al sur del mapa, casa solariega, aldeas vasallas, mesnada y mecenazgo.
import { HAMLET_IDS, LAYOUT, MATERIAL_IDS, NOBILITY, START, type ManorStats, type ManorUpgradeDef, type MaterialAmounts } from './data';
import { DAYS_PER_SEASON } from './calendar';
import { hasMaterials, payMaterials } from './materials';
import { hasRank, mainRanks, meetsRank, rankDef } from './progress';
import { applyRep, changeRep, repFrom } from './estates';
import type { CommandResult, GameState, LiegeId, MaterialId, NobleState, ProductId, RankId } from './types';

export function defaultNoble(): NobleState {
  return {
    charter: false,
    prestige: 0,
    manor: 0,
    hamlets: Object.fromEntries(HAMLET_IDS.map((id) => [id, 0])),
    soldiers: 0,
    patronage: {},
  };
}

export const isNoble = (state: GameState): boolean => hasRank(state, 'lord');

/** Filas del feudo: las que se anaden al sur del mapa de inicio. */
export const isFiefRow = (y: number): boolean => y >= START.map.rows.length;

/** Senor feudal al que se rinde tributo: el baron, hasta que el jugador sube en la escalera noble. */
export function liegeOf(state: GameState): LiegeId {
  let liege: LiegeId = 'baron';
  for (const r of mainRanks()) {
    if (!hasRank(state, r.id)) break;
    liege = NOBILITY.lieges[r.id] ?? liege;
  }
  return liege;
}

/** Senor feudal mientras se aspira a un rango: el del rango anterior (su favor es el que se pide). */
export function liegeBefore(rank: RankId): LiegeId {
  let liege: LiegeId = 'baron';
  for (const r of mainRanks()) {
    if (r.id === rank) break;
    liege = NOBILITY.lieges[r.id] ?? liege;
  }
  return liege;
}

// ---------------------------------------------------------------- carta de nobleza

/** El rey vende la carta cuando se cumple todo lo demas que pide el rango de Senor. */
export function charterReady(state: GameState): boolean {
  if (state.noble.charter || isNoble(state) || !hasRank(state, 'landowner')) return false;
  return meetsRank(state, { ...rankDef('lord'), charter: false });
}

export function buyCharter(state: GameState): CommandResult {
  const cost = NOBILITY.charter.cost;
  if (state.noble.charter) return { ok: false, msg: 'msg.buildingMaxed' };
  if (!charterReady(state)) return { ok: false, msg: 'noble.charterNotReady' };
  if (state.coins < cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost } };
  state.coins -= cost;
  state.noble.charter = true;
  state.noble.prestige += NOBILITY.charter.prestige;
  repFrom(state, 'charter');
  return { ok: true, msg: 'msg.charterBought', params: { cost } };
}

/** Anade al sur del mapa las filas del feudo (una sola vez). */
export function expandFief(state: GameState): void {
  if (state.map.height > START.map.rows.length) return;
  const legend = { ...START.map.legend, ...NOBILITY.fief.legend };
  NOBILITY.fief.rows.forEach((row, i) => {
    const y = state.map.height + i;
    [...row].forEach((ch, x) => {
      const kind = legend[ch];
      if (!kind) throw new Error(`Simbolo de mapa desconocido "${ch}" en el feudo (${x},${y})`);
      state.map.tiles.push({ x, y, kind });
    });
  });
  state.map.height += NOBILITY.fief.rows.length;
}

// ---------------------------------------------------------------- casa solariega

export function manorStat(state: GameState, key: keyof ManorStats): number {
  const ups = NOBILITY.manor.upgrades.slice(0, state.noble.manor);
  if (key === 'titheMult') return ups.reduce((m, u) => m * (u.effects.titheMult ?? 1), 1);
  return ups.reduce((sum, u) => sum + (u.effects[key] ?? 0), 0);
}

export const nextManorUpgrade = (state: GameState): ManorUpgradeDef | null => NOBILITY.manor.upgrades[state.noble.manor] ?? null;

/** Estado del dibujo de la casa (0 = solar, 1-3 = cada vez mas grande). */
export function manorStage(state: GameState): number {
  return NOBILITY.manor.visual.filter((v) => state.noble.manor >= v).length;
}

export function upgradeManor(state: GameState): CommandResult {
  const up = nextManorUpgrade(state);
  if (!isNoble(state)) return { ok: false, msg: 'noble.notNoble' };
  if (!up) return { ok: false, msg: 'msg.buildingMaxed' };
  if (state.coins < up.cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost: up.cost } };
  if (!hasMaterials(state, up.materials)) return { ok: false, msg: 'msg.missingMaterials' };
  state.coins -= up.cost;
  payMaterials(state, up.materials);
  state.noble.manor++;
  state.noble.prestige += up.prestige;
  // Cada obra de la casa solariega te hace mas igual a los demas nobles.
  repFrom(state, 'manorWork');
  return { ok: true, msg: 'msg.manorUpgraded', params: { manorUp: up.id, prestige: up.prestige } };
}

// ---------------------------------------------------------------- aldeas vasallas

export const hamletLevel = (state: GameState, id: string): number => state.noble.hamlets[id] ?? 0;
export const hamletCount = (state: GameState): number => HAMLET_IDS.filter((id) => hamletLevel(state, id) > 0).length;
export const hamletLevels = (state: GameState): number => HAMLET_IDS.reduce((sum, id) => sum + hamletLevel(state, id), 0);

/** Aldea que ocupa la casilla (x, y). Cada aldea es un bloque cuadrado que empieza en su (x, y). */
export function hamletAt(x: number, y: number): string | null {
  const n = LAYOUT.size.hamlet ?? 1;
  return (
    HAMLET_IDS.find((id) => {
      const h = NOBILITY.hamlets[id];
      return x >= h.x && x < h.x + n && y >= h.y && y < h.y + n;
    }) ?? null
  );
}

export function nextHamletLevel(state: GameState, id: string) {
  return NOBILITY.hamlets[id].levels[hamletLevel(state, id)] ?? null;
}

export function upgradeHamlet(state: GameState, id: string): CommandResult {
  const def = NOBILITY.hamlets[id];
  if (!def) return { ok: false, msg: 'msg.nothing' };
  if (!isNoble(state)) return { ok: false, msg: 'noble.notNoble' };
  const next = nextHamletLevel(state, id);
  if (!next) return { ok: false, msg: 'msg.buildingMaxed' };
  if (state.coins < next.cost) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost: next.cost } };
  if (!hasMaterials(state, next.materials)) return { ok: false, msg: 'msg.missingMaterials' };
  state.coins -= next.cost;
  payMaterials(state, next.materials);
  const first = hamletLevel(state, id) === 0;
  state.noble.hamlets[id] = hamletLevel(state, id) + 1;
  state.noble.prestige += next.prestige;
  return { ok: true, msg: first ? 'msg.hamletTaken' : 'msg.hamletUpgraded', params: { hamlet: id, level: state.noble.hamlets[id] } };
}

/** Parte de las rentas que pagan las aldeas segun la reputacion ante la aldea. */
export function hamletLoyalty(state: GameState): number {
  const { base, perRep } = NOBILITY.hamletLoyalty;
  return base + perRep * state.rep.commoners;
}

/** Lo que entregan las aldeas al cambiar de estacion: monedas y materiales. */
export function hamletDues(state: GameState): { coins: number; materials: MaterialAmounts } {
  let coins = 0;
  const materials: MaterialAmounts = {};
  for (const id of HAMLET_IDS) {
    const lvl = hamletLevel(state, id);
    if (lvl === 0) continue;
    const def = NOBILITY.hamlets[id];
    const l = def.levels[lvl - 1];
    coins += l.coins;
    materials[def.material] = (materials[def.material] ?? 0) + l.amount;
  }
  return { coins: Math.round(coins * hamletLoyalty(state)), materials };
}

// ---------------------------------------------------------------- mesnada

export const maxSoldiers = (state: GameState): number => manorStat(state, 'soldiers');
export const soldierUpkeep = (state: GameState): number => state.noble.soldiers * NOBILITY.soldiers.upkeep;

/** Con mesnada suficiente, las caravanas salen escoltadas sin pagar. */
export const freeEscort = (state: GameState): boolean => state.noble.soldiers >= NOBILITY.soldiers.escortMin;

export function hireSoldier(state: GameState): CommandResult {
  const def = NOBILITY.soldiers;
  if (state.noble.soldiers >= maxSoldiers(state)) return { ok: false, msg: 'msg.noSoldierRoom' };
  if (state.coins < def.hire) return { ok: false, msg: 'msg.notEnoughCoins', params: { cost: def.hire } };
  if (!hasMaterials(state, def.materials)) return { ok: false, msg: 'msg.missingMaterials' };
  state.coins -= def.hire;
  payMaterials(state, def.materials);
  state.noble.soldiers++;
  return { ok: true, msg: 'msg.soldierHired', params: { cost: def.hire } };
}

export function dismissSoldier(state: GameState): CommandResult {
  if (state.noble.soldiers <= 0) return { ok: false, msg: 'msg.nothing' };
  state.noble.soldiers--;
  return { ok: true, msg: 'msg.soldierDismissed' };
}

// ---------------------------------------------------------------- mecenazgo

export const seasonIndex = (day: number): number => Math.floor(day / DAYS_PER_SEASON);

/** Por que no se puede hacer una accion de mecenazgo ahora (clave de texto) o null si se puede. */
export function patronageProblem(state: GameState, id: string): string | null {
  const def = NOBILITY.patronage[id];
  if (!isNoble(state)) return 'noble.notNoble';
  if (state.noble.patronage[id] === seasonIndex(state.day)) return 'noble.patronage.done';
  if ((def.soldiers ?? 0) > state.noble.soldiers) return 'noble.patronage.needSoldiers';
  for (const [k, n] of Object.entries(def.cost)) {
    const have = k === 'coins' ? state.coins : state.inventory[k as ProductId];
    if (have < (n ?? 0)) return 'noble.patronage.cantPay';
  }
  return null;
}

export function doPatronage(state: GameState, id: string): CommandResult {
  const def = NOBILITY.patronage[id];
  if (!def) return { ok: false, msg: 'msg.nothing' };
  const problem = patronageProblem(state, id);
  if (problem) return { ok: false, msg: problem, params: { soldiers: def.soldiers ?? 0 } };
  for (const [k, n] of Object.entries(def.cost)) {
    if (k === 'coins') state.coins -= n ?? 0;
    else state.inventory[k as ProductId] -= n ?? 0;
  }
  state.noble.patronage[id] = seasonIndex(state.day);
  state.noble.prestige += def.prestige;
  applyRep(state, def.rep);
  return { ok: true, msg: `noble.patronage.${id}.done`, params: { prestige: def.prestige } };
}

// ---------------------------------------------------------------- cuentas de la estacion

export interface NobleSeason {
  dues: number;
  duesMaterials: MaterialAmounts;
  upkeep: number;
}

export function nobleSeasonBill(state: GameState): NobleSeason {
  const d = hamletDues(state);
  return { dues: d.coins, duesMaterials: d.materials, upkeep: soldierUpkeep(state) };
}

/** Lo que pasa en el feudo al cambiar de estacion, aparte del dinero (que lo cobran las cuentas). */
export function nobleSeasonEffects(state: GameState, bill: NobleSeason): void {
  for (const m of MATERIAL_IDS) state.materials[m as MaterialId] += bill.duesMaterials[m] ?? 0;
  state.noble.prestige += manorStat(state, 'prestigeSeason');
  const rep = manorStat(state, 'churchRep');
  if (rep) changeRep(state, 'church', rep);
}

/** Lista "wood:12,stone:10" para los textos (se traduce sola). */
export function amountsList(amounts: MaterialAmounts | Partial<Record<ProductId | 'coins', number>>): string {
  return Object.entries(amounts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
}
