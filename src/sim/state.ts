import { ANIMAL_IDS, BUILDING_IDS, MATERIAL_IDS, PRODUCT_IDS, PROGRESSION, START, TUTORIAL } from './data';
import { defaultPantry } from './pantry';
import { rollPrices } from './market';
import { newSeed } from './random';
import { addVillager } from './villagers';
import { defaultNoble } from './noble';
import { startReps } from './estates';
import { createCharacter, type CharacterAnswers } from './character';
import type { AnimalId, BuildingId, Difficulty, GameState, Herd, Plot, ProductId, Tile } from './types';

export const plotKey = (x: number, y: number): string => `${x},${y}`;

export function createNewGame(seed: number = newSeed(), difficulty: Difficulty = 'normal', character?: CharacterAnswers): GameState {
  const rows = START.map.rows;
  const tiles: Tile[] = [];
  const plots: Record<string, Plot> = {};
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const kind = START.map.legend[ch];
      if (!kind) throw new Error(`Simbolo de mapa desconocido "${ch}" en (${x},${y})`);
      tiles.push({ x, y, kind });
      if (kind === 'soil') plots[plotKey(x, y)] = { crop: null, growth: 0 };
    });
  });

  const herds = {} as Record<AnimalId, Herd>;
  for (const id of ANIMAL_IDS) herds[id] = { count: START.herds[id] ?? 0, stored: 0, timer: 0 };
  const inventory = {} as Record<ProductId, number>;
  const priceMult = {} as Record<ProductId, number>;
  for (const p of PRODUCT_IDS) {
    inventory[p] = START.inventory[p] ?? 0;
    priceMult[p] = 1;
  }

  const buildings = {} as Record<BuildingId, number>;
  for (const b of BUILDING_IDS) buildings[b] = 0;
  const rep = PROGRESSION.reputation.start;

  const state: GameState = {
    day: 0,
    dayProgress: 0,
    speed: 0,
    coins: START.coins,
    inventory,
    materials: Object.fromEntries(MATERIAL_IDS.map((m) => [m, 0])) as GameState['materials'],
    pantry: defaultPantry(),
    map: { width: rows[0].length, height: rows.length, tiles },
    plots,
    herds,
    xp: 0,
    level: 1,
    rank: 'peasant',
    titles: [],
    workshops: {},
    carts: 0,
    caravans: [],
    nextCaravanId: 1,
    stall: false,
    noble: defaultNoble(),
    // Partida nueva: empieza el tutorial guiado (se puede saltar).
    tutorial: { step: TUTORIAL.steps[0].id, seen: [], tips: true },
    landBought: 0,
    leases: 0,
    renown: 0,
    debt: 0,
    protections: { crops: 0, animals: 0 },
    weather: 'normal',
    rankWarning: false,
    difficulty,
    // Sin cuestionario (tests, bot, partidas antiguas): sin rasgos. La interfaz lo rellena.
    character: { name: '', traits: [], ambition: null },
    buildings,
    villagers: [],
    nextVillagerId: 1,
    foodDebt: 0,
    rep: startReps(rep),
    modifiers: [],
    flags: [],
    seedVouchers: 0,
    priceMult,
    marketBoost: null,
    events: { pending: null, lastDay: 0, cooldowns: {} },
    rng: seed >>> 0,
    stats: { harvested: 0, earned: 0, seasonEarned: 0, seasonFood: 0, trades: 0, tradeEarned: 0 },
  };
  for (let i = 0; i < (START.villagers ?? 0); i++) addVillager(state);
  rollPrices(state);
  if (character) createCharacter(state, character);
  return state;
}

export function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  return state.map.tiles[y * state.map.width + x];
}
