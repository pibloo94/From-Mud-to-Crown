// Formato del archivo de partida. Puro (sin DOM) para poder probarlo.
import type { GameState } from '../sim/types';
import { ACHIEVEMENTS, BUILDING_IDS, ESTATES, MATERIAL_IDS, PATHS, PRODUCT_IDS, PROGRESSION, START } from '../sim/data';
import { defaultPantry } from '../sim/pantry';
import { rollPrices } from '../sim/market';
import { buildingStat, storageCapacity, storageUsed } from '../sim/buildings';
import { addVillager, beds } from '../sim/villagers';
import { defaultNoble } from '../sim/noble';
import { finishedTutorial } from '../sim/tutorial';
import { relayFief } from '../sim/layout';
import { rankDef, renownProgress } from '../sim/progress';
import { startReps } from '../sim/estates';
import { startPaths } from '../sim/paths';
import { emptyCharacter } from '../sim/character';
import { achievementMet } from '../sim/achievements';

export const SAVE_FORMAT = 'from-mud-to-crown-save';
export const SAVE_VERSION = 22;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  state: GameState;
}

export function serialize(state: GameState, now = new Date()): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    state: { ...state, speed: 0 },
  };
  return JSON.stringify(file, null, 2);
}

export class SaveError extends Error {
  constructor(public readonly reason: 'invalid' | 'format' | 'newer') {
    super(reason);
  }
}

/** Lee un archivo de partida. Lanza SaveError si no es valido. */
export function deserialize(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('invalid');
  }
  if (!isObject(data) || data.format !== SAVE_FORMAT || !isObject(data.state)) throw new SaveError('format');
  const version = typeof data.version === 'number' ? data.version : 0;
  if (version > SAVE_VERSION) throw new SaveError('newer');
  const state = migrate(data.state as Record<string, unknown>, version);
  if (!looksLikeState(state)) throw new SaveError('format');
  state.speed = 0; // al cargar, siempre en pausa
  return state;
}

/** Convierte partidas de versiones anteriores al formato actual, paso a paso. */
export function migrate(state: Record<string, unknown>, from: number): GameState {
  let s = state as Record<string, any>;
  if (from < 2) {
    // v1 -> v2 (fase 1): experiencia, niveles, mas productos, precios variables y eventos.
    s = { ...s };
    s.xp = 0;
    s.level = 1;
    s.landBought = 0;
    s.workers = 0;
    s.inventory = { ...s.inventory };
    s.priceMult = {};
    for (const p of PRODUCT_IDS) {
      s.inventory[p] ??= 0;
      s.priceMult[p] = 1;
    }
    s.marketBoost = null;
    s.events = { pending: null, lastDay: s.day ?? 0, cooldowns: {} };
    s.rng = ((s.day ?? 0) * 2654435761 + 12345) >>> 0;
    rollPrices(s as GameState);
  }
  if (from < 3) s = migrateV3(s);
  if (from < 4) {
    // v3 -> v4: almacen de materiales, despensa configurable y cultivo de cada labrador.
    s = { ...s };
    s.materials = Object.fromEntries(MATERIAL_IDS.map((m) => [m, 0]));
    s.pantry = defaultPantry();
    s.villagers = (s.villagers as Record<string, unknown>[]).map((v) => ({ ...v, crop: 'auto' }));
  }
  if (from < 5) s = migrateV5(s);
  if (from < 6) {
    // v5 -> v6 (fase 3b): carretas, caravanas, puesto en el mercado y estadisticas de comercio.
    s = { ...s, carts: 0, caravans: [], nextCaravanId: 1, stall: false };
    s.stats = { ...s.stats, trades: 0, tradeEarned: 0 };
  }
  // v6 -> v7 (fase 3c): carta de nobleza, casa solariega, aldeas, mesnada, prestigio y mecenazgo.
  if (from < 7) s = { ...s, noble: defaultNoble() };
  // v7 -> v8 (fase 3d): tutorial y consejos. Una partida empezada no repite el tutorial.
  if (from < 8) s = { ...s, tutorial: finishedTutorial(s as GameState) };
  // v8 -> v9: la casa solariega pasa a ocupar 2x2 casillas; v9 -> v10: las aldeas, tambien.
  // En ambos casos se recolocan las filas del feudo segun los datos.
  if (from < 10) {
    s = { ...s, map: { ...s.map, tiles: (s.map.tiles as Record<string, unknown>[]).map((t) => ({ ...t })) } };
    relayFief(s as GameState);
  }
  // v10 -> v11: renombre por la experiencia por encima del nivel maximo. Lo ya acumulado no se
  // cobra de golpe: se empieza a contar desde aqui.
  if (from < 11) s = { ...s, renown: renownProgress(s as GameState).points };
  // v11 -> v12: riesgo. Sin deuda, sin prevencion comprada, tiempo normal y sin aviso de rango.
  if (from < 12) s = { ...s, debt: 0, protections: { crops: 0, animals: 0 }, weather: 'normal', rankWarning: false };
  // v12 -> v13: dificultad. Las partidas de antes se jugaban en Normal.
  if (from < 13) s = { ...s, difficulty: 'normal' };
  // v13 -> v14: estamentos. El favor del baron pasa a la Nobleza y el de la aldea al Pueblo llano;
  // Rey, Artesanos e Iglesia empiezan en el punto medio.
  if (from < 14) {
    const old = (s.rep ?? {}) as { baron?: number; village?: number };
    s = { ...s, rep: { ...startReps(), nobles: old.baron ?? ESTATES.start, commoners: old.village ?? ESTATES.start } };
  }
  // v14 -> v15: personaje. Las partidas de antes no pasaron por el cuestionario: sin rasgos.
  if (from < 15) s = { ...s, character: { name: '', traits: [], ambition: null } };
  // v15 -> v16: caminos. Se empieza sin meritos y sin foco (se elige en la ficha).
  if (from < 16) s = { ...s, paths: startPaths() };
  // v16 -> v17: rangos por camino. Quien ya era Senor, Baron o Conde sigue la Corona: se le pone en
  // foco si no tenia, con los meritos que pide su rango, para que pueda seguir subiendo.
  if (from < 17) s = { ...s, paths: crownForNobles(s as GameState) };
  // v17 -> v18: rasgos ganados. Se empieza sin decisiones contadas ni rasgos ganados.
  if (from < 18) {
    const blank = emptyCharacter();
    s = { ...s, character: { ...blank, ...s.character, earned: [], deeds: blank.deeds }, stats: { ...s.stats, leftHunger: 0 } };
  }
  // v18 -> v19: encargos. Llegan con la siguiente estacion.
  if (from < 19) s = { ...s, commissions: { offers: [] } };
  // v19 -> v20: monumentos. Ninguno empezado.
  if (from < 20) s = { ...s, monuments: {} };
  // v20 -> v21: libro de cuentas y logros. El libro empieza vacio; los logros que ya se cumplen se
  // dan por conseguidos sin aviso (no llegan veinte de golpe al cargar).
  if (from < 21) {
    s = { ...s, history: [], achievements: {}, stats: { ...s.stats, commissionsDone: 0, commissionSeasons: 0, lastHungerDay: s.day ?? 0 } };
    for (const a of ACHIEVEMENTS.achievements) if (achievementMet(s as GameState, a)) s.achievements[a.id] = s.day;
  }
  // v21 -> v22: fertilidad del suelo. Todas las parcelas empiezan descansadas.
  if (from < 22) s = { ...s, plots: Object.fromEntries(Object.entries(s.plots ?? {}).map(([k, p]) => [k, { ...(p as object), fertility: 1, last: null }])) };
  return s as GameState;
}

function crownForNobles(s: GameState): GameState['paths'] {
  const paths = { ...s.paths, merits: { ...s.paths.merits } };
  const r = rankDef(s.rank);
  if (r?.path !== 'crown') return paths;
  paths.focus ??= 'crown';
  if (paths.second === paths.focus) paths.second = null;
  paths.merits.crown = Math.max(paths.merits.crown, PATHS.levels[r.pathLevel ?? 0] ?? 0);
  return paths;
}

/** v4 -> v5 (fase 3a): talleres en solares, productos de taller y titulos de rama. */
function migrateV5(old: Record<string, any>): Record<string, any> {
  const s: Record<string, any> = { ...old, titles: old.titles ?? [], workshops: old.workshops ?? {} };
  s.inventory = { ...s.inventory };
  s.priceMult = { ...s.priceMult };
  s.pantry = { ...s.pantry, eat: { ...s.pantry.eat } };
  const fresh = defaultPantry();
  for (const p of PRODUCT_IDS) {
    s.inventory[p] ??= 0;
    s.priceMult[p] ??= 1;
    s.pantry.eat[p] ??= fresh.eat[p];
  }
  // Los solares del mapa inicial; si alli ya hay otra cosa, se busca hierba libre junto a un camino.
  const tiles: GameState['map']['tiles'] = s.map.tiles.map((t: GameState['map']['tiles'][number]) => ({ ...t }));
  const width: number = s.map.width;
  const at = (x: number, y: number) => tiles[y * width + x];
  START.map.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (START.map.legend[ch] !== 'site') return;
      let tile = at(x, y);
      if (!tile || tile.kind !== 'grass') {
        tile = tiles.find(
          (t) => t.kind === 'grass' && t.x < PROGRESSION.lands.eastFrom && tiles.some((p) => p.kind === 'path' && Math.abs(p.x - t.x) + Math.abs(p.y - t.y) === 1),
        )!;
      }
      if (tile) tile.kind = 'site';
    }),
  );
  s.map = { ...s.map, tiles };
  return s;
}

/** v2 -> v3 (fase 2): aldeanos, edificios con mejoras, granero, reputacion, impuestos y tierras del este. */
function migrateV3(old: Record<string, any>): Record<string, any> {
  const s: Record<string, any> = { ...old };
  // Productos que aun no existian: a cero, para poder sumar lo que hay en el granero.
  s.inventory = { ...s.inventory };
  s.priceMult = { ...s.priceMult };
  for (const p of PRODUCT_IDS) {
    s.inventory[p] ??= 0;
    s.priceMult[p] ??= 1;
  }
  // El mapa crece hacia el este con las tierras cerradas del mapa inicial actual.
  const rows = START.map.rows;
  const oldW: number = s.map.width;
  const width = Math.max(oldW, rows[0].length);
  const tiles: GameState['map']['tiles'] = [];
  for (let y = 0; y < s.map.height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < oldW) tiles.push({ ...s.map.tiles[y * oldW + x] });
      else tiles.push({ x, y, kind: START.map.legend[rows[y]?.[x] ?? 'X'] ?? 'wild' });
    }
  }
  const granary = tiles.find((t) => t.x === 3 && t.y === 2);
  if (granary?.kind === 'grass') granary.kind = 'granary';
  s.map = { width, height: s.map.height, tiles };

  s.rank = s.level >= 5 ? 'freeFarmer' : 'peasant';
  s.leases = 0;
  s.buildings = {};
  for (const b of BUILDING_IDS) s.buildings[b] = 0;
  s.villagers = [];
  s.nextVillagerId = 1;
  s.foodDebt = 0;
  s.rep = { baron: PROGRESSION.reputation.start, village: PROGRESSION.reputation.start };
  s.modifiers = [];
  s.flags = [];
  s.seedVouchers = 0;
  s.stats = { harvested: 0, earned: 0, ...s.stats, seasonEarned: 0, seasonFood: 0 };

  const state = s as GameState;
  // Los jornaleros de antes pasan a ser labradores, con las camas que necesitan ya construidas.
  const workers: number = s.workers ?? 0;
  delete s.workers;
  while (beds(state) < workers && state.buildings.house < 4) state.buildings.house++;
  for (let i = 0; i < workers; i++) addVillager(state, 'farmer');
  // Si ya tenia mas cosecha guardada de la que cabe, se le regalan baldas en el granero.
  while (storageUsed(state) > storageCapacity(state) && state.buildings.granary < 2) state.buildings.granary++;
  // Los animales que ya tenia caben siempre.
  while (state.herds.chicken.count > buildingStat(state, 'coop', 'maxAnimals') && state.buildings.coop < 4) state.buildings.coop++;
  while (state.herds.cow.count > buildingStat(state, 'pen', 'maxAnimals') && state.buildings.pen < 5) state.buildings.pen++;
  return s;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeState(s: GameState): boolean {
  return (
    typeof s.day === 'number' &&
    typeof s.coins === 'number' &&
    isObject(s.inventory) &&
    isObject(s.plots) &&
    isObject(s.herds) &&
    isObject(s.map) &&
    Array.isArray(s.map.tiles) &&
    typeof s.level === 'number' &&
    isObject(s.events) &&
    isObject(s.buildings) &&
    Array.isArray(s.villagers) &&
    isObject(s.rep) &&
    isObject(s.materials) &&
    isObject(s.pantry)
  );
}
