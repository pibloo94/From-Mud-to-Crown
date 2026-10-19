// Acceso tipado a los archivos de datos. Para anadir contenido, editar src/data/*.json.
import productsJson from '../data/products.json';
import cropsJson from '../data/crops.json';
import animalsJson from '../data/animals.json';
import startJson from '../data/start.json';
import progressionJson from '../data/progression.json';
import eventsJson from '../data/events.json';
import buildingsJson from '../data/buildings.json';
import villagersJson from '../data/villagers.json';
import materialsJson from '../data/materials.json';
import type { AnimalId, BuildingId, CropId, JobId, MaterialId, ModifierKind, ProductId, RankId, TileKind } from './types';
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
  villagers: number;
  map: { legend: Record<string, TileKind>; rows: string[] };
}

export type Feature = 'buyLand' | 'buyChicken' | 'buyCow';

export interface LevelDef {
  xp: number;
  maxPlots: number;
  unlocks?: Feature[];
}

export interface RankDef {
  id: RankId;
  level: number;
  /** Dias de juego minimos (opcional). */
  days?: number;
  /** Reputacion minima ante el baron (opcional). */
  baron?: number;
}

export interface ProgressionDef {
  levels: LevelDef[];
  ranks: RankDef[];
  xpPerCoinSold: number;
  land: { baseCost: number; growth: number };
  animalsForSale: Record<AnimalId, { price: number; unlock: Feature }>;
  events: { firstDay: number; minGap: number; dailyChance: number };
  priceDays: number;
  taxes: {
    titheRate: number;
    tributeBase: number;
    tributePerPlot: number;
    /** Con la reputacion del baron por debajo de esto, el tributo sube. */
    lowBaron: number;
    lowBaronMult: number;
    /** Reputacion que se pierde si no se puede pagar. */
    unpaidBaron: number;
    /** Estaciones del principio sin impuestos, para que el campesino arranque. */
    graceSeasons: number;
    /** El tributo crece con el rango: a mas tierra y nombre, mas pide el baron. */
    rankTribute: Record<RankId, number>;
  };
  reputation: { start: number; highVillage: number };
  lands: { eastFrom: number; leaseBaseCost: number; leaseGrowth: number; rentPerSeason: number };
}

/** Efectos que suma cada mejora de edificio. */
export interface BuildingStats {
  beds?: number;
  foodSaving?: number;
  capacity?: number;
  maxAnimals?: number;
  animalBonus?: number;
}

export type MaterialAmounts = Partial<Record<MaterialId, number>>;

export interface MaterialDef {
  price: number;
  icon: string;
  /** Nivel desde el que se vende en el mercado (por defecto, siempre). */
  unlockLevel?: number;
}

export interface UpgradeDef {
  id: string;
  cost: number;
  /** Materiales que gasta la obra, ademas de las monedas. */
  materials?: MaterialAmounts;
  level: number;
  effects: BuildingStats;
}

export interface BuildingDef {
  tile: TileKind;
  base: BuildingStats;
  /** Numero de mejoras a partir del cual cambia el dibujo (estado 1, 2, 3). */
  visual: number[];
  upgrades: UpgradeDef[];
}

export interface VillagersDef {
  hireCost: number;
  foodPerDay: number;
  pantry: { eat: ProductId[]; reserveDays: number; reserveOptions: number[] };
  hungerDays: number;
  jobs: {
    /** Parcelas que siembra y cosecha solo: `plots` + `plotsPerTool` por grado de herramienta. */
    farmer: { growthBonus: number; plots: number; plotsPerTool: number };
    herder: { animalBonus: number };
    carter: { sellEvery: number; priceRate: number; priceRatePerTier: number };
  };
  tools: { efficiency: number[]; tiers: { cost: number; level: number; materials?: MaterialAmounts }[] };
  names: string[];
}

/** Recursos que un evento puede pedir o dar. */
export type Amounts = Partial<Record<ProductId | 'coins', number>>;

export interface EventEffects {
  xp?: number;
  /** Monedas ganadas (positivo) o perdidas (negativo, sin bajar de 0). */
  coins?: number;
  items?: Partial<Record<ProductId, number>>;
  herds?: Partial<Record<AnimalId, number>>;
  /** Aldeanos que llegan (necesitan cama libre). */
  villagers?: number;
  rep?: { baron?: number; village?: number };
  /** Efecto temporal: dura `days` dias o hasta las cuentas de `seasons` estaciones. */
  modifier?: { kind: ModifierKind; value: number; days?: number; seasons?: number };
  flags?: { set?: string[]; clear?: string[] };
  /** Se pierde una parte de lo almacenado. */
  loseFraction?: { products: ProductId[] | 'all'; fraction: number };
  /** Los cultivos que crecen retroceden estos dias. */
  cropSetback?: number;
  seedVouchers?: number;
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

/** Oferta: rechazar no tiene castigo. Obligacion: incumplir penaliza. Percance: se juega el riesgo. */
export type EventCategory = 'offer' | 'obligation' | 'mishap';

export interface EventDef {
  category: EventCategory;
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
export const PROGRESSION = progressionJson as unknown as ProgressionDef;
export const EVENTS = eventsJson as unknown as Record<string, EventDef>;
export const BUILDINGS = buildingsJson as Record<BuildingId, BuildingDef>;
export const VILLAGERS = villagersJson as VillagersDef;
export const MATERIALS = materialsJson as Record<MaterialId, MaterialDef>;

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const ANIMAL_IDS = Object.keys(ANIMALS) as AnimalId[];
export const EVENT_IDS = Object.keys(EVENTS);
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const JOB_IDS = Object.keys(VILLAGERS.jobs) as JobId[];
export const MAX_LEVEL = PROGRESSION.levels.length;
