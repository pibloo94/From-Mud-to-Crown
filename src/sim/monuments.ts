// Monumentos: la gran obra final de cada camino (castillo, gran iglesia, casa del gremio, lonja y
// concejo). Se levantan en tres etapas, sobre un bloque libre de 2x2 junto a la aldea, cuando se
// tiene el ultimo rango del camino. Terminado da prestigio, sus efectos (como los rangos) y la
// tarjeta del legado. La partida sigue despues.
import { MONUMENTS, START, type MonumentDef } from './data';
import { hasRank } from './progress';
import { hasMaterials, materialsList, missingMaterials, payMaterials } from './materials';
import { isReserved } from './layout';
import { tileAt } from './state';
import type { CommandResult, GameState, Notice, Tile } from './types';

export const MONUMENT_IDS = Object.keys(MONUMENTS.monuments);
export const STAGES = MONUMENTS.stages.length;

export const monumentDef = (id: string): MonumentDef | undefined => MONUMENTS.monuments[id];
export const monumentStage = (state: GameState, id: string): number => state.monuments[id]?.stage ?? 0;
export const monumentDone = (state: GameState, id: string): boolean => monumentStage(state, id) >= STAGES;

/** Monumentos terminados, con sus efectos (cuentan como los rangos). */
export const doneMonuments = (state: GameState): MonumentDef[] =>
  MONUMENT_IDS.filter((id) => monumentDone(state, id)).map((id) => MONUMENTS.monuments[id]);

/** Si ya se puede empezar (o seguir) el monumento: hace falta el ultimo rango de su camino. */
export const monumentUnlocked = (state: GameState, id: string): boolean => {
  const def = monumentDef(id);
  return !!def && hasRank(state, def.rank);
};

/** Siguiente etapa por construir, o null si ya esta terminado. */
export function nextStage(state: GameState, id: string): (typeof MONUMENTS.stages)[number] | null {
  return MONUMENTS.stages[monumentStage(state, id)] ?? null;
}

/** Monumento que ocupa una casilla. */
export function monumentAt(state: GameState, x: number, y: number): string | null {
  for (const [id, m] of Object.entries(state.monuments)) if (x >= m.x && x <= m.x + 1 && y >= m.y && y <= m.y + 1) return id;
  return null;
}

const FREE: Tile['kind'][] = ['grass', 'wild'];

/** Bloque de 2x2 libre (hierba o tierras del este sin arrendar) lo mas cerca posible de la casa. */
export function findMonumentSite(state: GameState): { x: number; y: number } | null {
  const rows = START.map.rows.length;
  const house = state.map.tiles.find((t) => t.kind === 'house') ?? { x: 3, y: 3 };
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < state.map.width - 1; x++) {
      const cells = [tileAt(state, x, y), tileAt(state, x + 1, y), tileAt(state, x, y + 1), tileAt(state, x + 1, y + 1)];
      if (!cells.every((t) => t && FREE.includes(t.kind) && !isReserved(state, t.x, t.y))) continue;
      const d = Math.abs(x - house.x) + Math.abs(y - house.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best && { x: best.x, y: best.y };
}

export interface MonumentOutcome {
  result: CommandResult;
  notices: Notice[];
}

/** Levanta la siguiente etapa: monedas y materiales; la primera elige el sitio. */
export function buildMonument(state: GameState, id: string): MonumentOutcome {
  const def = monumentDef(id);
  const fail = (msg: string, params?: Record<string, string | number>) => ({ result: { ok: false, msg, params }, notices: [] });
  if (!def) return fail('msg.nothing');
  if (!monumentUnlocked(state, id)) return fail('msg.monumentLocked', { rank: def.rank });
  const stage = nextStage(state, id);
  if (!stage) return fail('msg.monumentDone');
  if (state.coins < stage.cost) return fail('msg.notEnoughCoins', { cost: stage.cost });
  if (!hasMaterials(state, stage.materials)) return fail('msg.missingMaterials', { list: materialsList(missingMaterials(state, stage.materials)) });
  let m = state.monuments[id];
  if (!m) {
    const site = findMonumentSite(state);
    if (!site) return fail('msg.monumentNoSite');
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) tileAt(state, site.x + dx, site.y + dy)!.kind = 'monument';
    m = state.monuments[id] = { stage: 0, x: site.x, y: site.y };
  }
  state.coins -= stage.cost;
  payMaterials(state, stage.materials);
  m.stage++;
  const notices: Notice[] = [];
  if (m.stage >= STAGES) {
    state.noble.prestige += def.prestige;
    notices.push({ ok: true, msg: 'msg.monumentFinished', card: 'legacy', params: { monument: id } });
  }
  return { result: { ok: true, msg: 'msg.monumentStage', params: { monument: id, stage: m.stage, total: STAGES } }, notices };
}
