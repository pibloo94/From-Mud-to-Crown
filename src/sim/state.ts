import { ANIMAL_IDS, BUILDING_IDS, PRODUCT_IDS, PROGRESSION, START } from './data';
import { rollPrices } from './market';
import { newSeed } from './random';
import { addVillager } from './villagers';
import type { AnimalId, BuildingId, GameState, Herd, Plot, ProductId, Tile } from './types';

export const plotKey = (x: number, y: number): string => `${x},${y}`;

export function createNewGame(seed: number = newSeed()): GameState {
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
    map: { width: rows[0].length, height: rows.length, tiles },
    plots,
    herds,
    xp: 0,
    level: 1,
    rank: 'peasant',
    landBought: 0,
    leases: 0,
    buildings,
    villagers: [],
    nextVillagerId: 1,
    foodDebt: 0,
    rep: { baron: rep, village: rep },
    modifiers: [],
    flags: [],
    seedVouchers: 0,
    priceMult,
    marketBoost: null,
    events: { pending: null, lastDay: 0, cooldowns: {} },
    rng: seed >>> 0,
    stats: { harvested: 0, earned: 0, seasonEarned: 0, seasonFood: 0 },
  };
  for (let i = 0; i < (START.villagers ?? 0); i++) addVillager(state);
  rollPrices(state);
  return state;
}

export function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  return state.map.tiles[y * state.map.width + x];
}
