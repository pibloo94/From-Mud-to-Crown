// Acceso tipado a los archivos de datos. Para anadir contenido, editar src/data/*.json.
import productsJson from '../data/products.json';
import cropsJson from '../data/crops.json';
import animalsJson from '../data/animals.json';
import startJson from '../data/start.json';
import progressionJson from '../data/progression.json';
import eventsJson from '../data/events.json';
import type { AnimalId, CropId, ProductId, TileKind } from './types';
import type { Season } from './calendar';

export interface ProductDef {
  price: number;
  icon: string;
  /** Variacion semanal maxima del precio (0.2 = ±20 %). */
  volatility: number;
  /** Multiplicador del precio en cada estacion. */
  season: Record<Season, number>;
  /** Experiencia por unidad recogida de un animal. */
  xpCollect: number;
}

export interface CropDef {
  seedCost: number;
  growDays: number;
  product: ProductId;
  yield: number;
  xp: number;
  unlockLevel: number;
  /** Estaciones en las que se puede sembrar y en las que crece. */
  seasons: Season[];
  stageSprites: string[];
}

export interface AnimalDef {
  product: ProductId;
  everyDays: number;
  amountPerAnimal: number;
  /** Cuantas producciones se acumulan como maximo sin recoger. */
  maxBatches: number;
}

export interface StartDef {
  coins: number;
  inventory: Partial<Record<ProductId, number>>;
  herds: Partial<Record<AnimalId, number>>;
  map: { legend: Record<string, TileKind>; rows: string[] };
}

export type Feature = 'buyLand' | 'buyChicken' | 'buyCow';

export interface LevelDef {
  xp: number;
  maxPlots: number;
  unlocks?: Feature[];
}

export interface ProgressionDef {
  levels: LevelDef[];
  ranks: { id: string; level: number }[];
  xpPerCoinSold: number;
  land: { baseCost: number; growth: number };
  animalsForSale: Record<AnimalId, { price: number; max: number; unlock: Feature }>;
  workers: { growthBonus: number; wage: number; max: number };
  events: { firstDay: number; minGap: number; dailyChance: number };
  priceDays: number;
}

/** Recursos que un evento puede pedir o dar. */
export type Amounts = Partial<Record<ProductId | 'coins', number>>;

export interface EventEffects {
  xp?: number;
  /** Monedas ganadas (positivo) o perdidas (negativo, sin bajar de 0). */
  coins?: number;
  items?: Partial<Record<ProductId, number>>;
  herds?: Partial<Record<AnimalId, number>>;
  workers?: number;
  marketBoost?: { mult: number; days: number };
  sellAll?: { product: ProductId; mult: number };
}

export interface EventOptionDef {
  id: string;
  cost?: Amounts;
  /** Condiciones para que la opcion este disponible (ver `meetsRequirements`). */
  requires?: Record<string, number>;
  effects?: EventEffects;
  /** Efectos que solo ocurren con cierta probabilidad. */
  risk?: { chance: number; effects: EventEffects };
}

export interface EventDef {
  weight: number;
  cooldownDays: number;
  icon: string;
  minLevel?: number;
  seasons?: Season[];
  requires?: Record<string, number>;
  options: EventOptionDef[];
}

export const PRODUCTS = productsJson as Record<ProductId, ProductDef>;
export const CROPS = cropsJson as Record<CropId, CropDef>;
export const ANIMALS = animalsJson as Record<AnimalId, AnimalDef>;
export const START = startJson as StartDef;
export const PROGRESSION = progressionJson as ProgressionDef;
export const EVENTS = eventsJson as Record<string, EventDef>;

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const ANIMAL_IDS = Object.keys(ANIMALS) as AnimalId[];
export const EVENT_IDS = Object.keys(EVENTS);
export const MAX_LEVEL = PROGRESSION.levels.length;
