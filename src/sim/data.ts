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
import workshopsJson from '../data/workshops.json';
import tradeJson from '../data/trade.json';
import nobilityJson from '../data/nobility.json';
import tutorialJson from '../data/tutorial.json';
import type { AnimalId, BuildingId, CropId, JobId, LiegeId, MaterialId, ModifierKind, ProductId, RankId, TileKind, WorkshopId } from './types';
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
  /** Producto de taller: sube de precio con el titulo de Artesano. */
  artisan?: boolean;
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
  /** Titulo de rama: se suma al rango principal en vez de sustituirlo. */
  branch?: boolean;
  /** Talleres construidos que pide (rama Artesano). */
  workshops?: number;
  /** Caravanas completadas que pide (rama Burgues). */
  trades?: number;
  /** Pide tener puesto propio en el mercado. */
  stall?: boolean;
  /** Dias de juego minimos (opcional). */
  days?: number;
  /** Reputacion minima ante el senor feudal (opcional). */
  baron?: number;
  /** Reputacion minima ante la aldea (opcional). */
  village?: number;
  /** Titulos de rama que pide (Artesano o Burgues). */
  branches?: number;
  /** Pide haber comprado la carta de nobleza. */
  charter?: boolean;
  /** Mejoras de la casa solariega que pide. */
  manor?: number;
  /** Aldeas vasallas tomadas que pide. */
  hamlets?: number;
  /** Suma de niveles de las aldeas vasallas que pide. */
  hamletLevels?: number;
  soldiers?: number;
  prestige?: number;
}

export interface ProgressionDef {
  levels: LevelDef[];
  ranks: RankDef[];
  /** Multiplicador de precio de los productos artesanos con el titulo de Artesano. */
  artisanPriceBonus: number;
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

export interface WorkshopUpgradeDef {
  id: string;
  cost: number;
  level: number;
  materials?: MaterialAmounts;
  /** Tandas por dia que suma. */
  batches: number;
  /** Titulo necesario (las mejores mejoras son del gremio de artesanos). */
  title?: RankId;
}

export interface WorkshopDef {
  unlockLevel: number;
  cost: number;
  materials?: MaterialAmounts;
  recipe: { in: Partial<Record<ProductId, number>>; out: Partial<Record<ProductId, number>> };
  batchesPerDay: number;
  xpPerBatch: number;
  upgrades: WorkshopUpgradeDef[];
}

export interface TownDef {
  unlockLevel: number;
  /** Dias de ida y vuelta. */
  days: number;
  toll: number;
  escort: number;
  /** Probabilidad de asalto sin escolta. */
  danger: number;
  /** Multiplicador sobre el precio de la villa propia (lo que no aparece se paga a 0,9). */
  demand: Partial<Record<ProductId, number>>;
  /** Materiales que vende, con su precio. */
  sells?: Partial<Record<MaterialId, number>>;
  rep?: { baron?: number; village?: number };
}

export interface TradeDef {
  unlockLevel: number;
  cart: { cost: number; materials?: MaterialAmounts; capacity: number };
  maxCarts: { level: number }[];
  stall: { cost: number; level: number; materials?: MaterialAmounts; priceBonus: number };
  xpPerCoin: number;
  burgher: { capacityMult: number; tollMult: number; priceBonus: number };
  towns: Record<string, TownDef>;
  robbedFraction: number;
}

export type MaterialAmounts = Partial<Record<MaterialId, number>>;

/** Que completa un paso del tutorial: un acuse del jugador o algo que ya ha hecho. */
export type TutorialDone = 'ack' | 'planted' | 'collected' | 'harvested' | 'sold' | 'progressOpened';
/** Donde se senala el paso: baldosas del mapa o un boton de la interfaz. */
export type TutorialTarget = 'soil' | 'coop' | 'ripe' | 'market' | 'progress' | null;

export interface TutorialStepDef {
  id: string;
  done: TutorialDone;
  target: TutorialTarget;
}

/** Consejo que aparece una vez cuando se cumple su condicion (todas las que tenga). */
export interface TipDef {
  id: string;
  level?: number;
  /** Dias de partida minimos. */
  days?: number;
  /** Camas en la casa. */
  beds?: number;
  villagers?: number;
  /** Haber tenido ya algun evento. */
  events?: number;
  rank?: RankId;
  /** Que el rey ya venda la carta de nobleza. */
  charter?: number;
}

export interface TutorialDef {
  steps: TutorialStepDef[];
  tips: TipDef[];
}

/** Efectos de las mejoras de la casa solariega. */
export interface ManorStats {
  /** Plazas para soldados de la mesnada. */
  soldiers?: number;
  /** Multiplicador del diezmo (capilla propia). */
  titheMult?: number;
  /** Reputacion ante la aldea que se gana cada estacion. */
  villageRep?: number;
  /** Prestigio que se gana cada estacion. */
  prestigeSeason?: number;
}

export interface ManorUpgradeDef {
  id: string;
  cost: number;
  materials?: MaterialAmounts;
  prestige: number;
  effects: ManorStats;
}

export interface HamletLevelDef {
  cost: number;
  materials?: MaterialAmounts;
  /** Rentas por estacion (antes de la lealtad). */
  coins: number;
  /** Material que entrega por estacion. */
  amount: number;
  prestige: number;
}

export interface HamletDef {
  x: number;
  y: number;
  material: MaterialId;
  levels: HamletLevelDef[];
}

export interface PatronageDef {
  icon: string;
  cost: Partial<Record<ProductId | 'coins', number>>;
  /** Soldados necesarios (el torneo). */
  soldiers?: number;
  prestige: number;
  rep?: { baron?: number; village?: number };
}

export interface NobilityDef {
  charter: { cost: number; prestige: number };
  /** Filas de mapa que se anaden al sur al ser Senor. */
  fief: { legend: Record<string, TileKind>; rows: string[] };
  manor: { visual: number[]; upgrades: ManorUpgradeDef[] };
  hamlets: Record<string, HamletDef>;
  /** Lealtad de las aldeas: base + perRep * reputacion ante la aldea. */
  hamletLoyalty: { base: number; perRep: number };
  soldiers: { hire: number; materials?: MaterialAmounts; upkeep: number; escortMin: number };
  patronage: Record<string, PatronageDef>;
  /** Senor feudal de cada rango noble (por defecto, el baron). */
  lieges: Partial<Record<RankId, LiegeId>>;
  /** Favor con el que empieza un nuevo senor feudal. */
  newLiegeRep: number;
}

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
    artisan: { perWorkshop: number };
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
  /** Materiales que se reciben. */
  materials?: MaterialAmounts;
  /** Dias que se retrasan las caravanas en camino. */
  caravanDelay?: number;
  marketBoost?: { mult: number; days: number };
  sellAll?: { product: ProductId; mult: number };
  prestige?: number;
  /** Soldados que se ganan o se pierden (sin bajar de 0). */
  soldiers?: number;
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
  /** Rango principal maximo: p. ej. los eventos del baron dejan de salir cuando eres Baron. */
  maxRank?: RankId;
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
export const WORKSHOPS = workshopsJson as Record<WorkshopId, WorkshopDef>;
export const WORKSHOP_IDS = Object.keys(WORKSHOPS) as WorkshopId[];
export const TRADE = tradeJson as unknown as TradeDef;
export const TOWN_IDS = Object.keys(TRADE.towns);
export const NOBILITY = nobilityJson as unknown as NobilityDef;
export const TUTORIAL = tutorialJson as unknown as TutorialDef;
export const HAMLET_IDS = Object.keys(NOBILITY.hamlets);
export const PATRONAGE_IDS = Object.keys(NOBILITY.patronage);

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const ANIMAL_IDS = Object.keys(ANIMALS) as AnimalId[];
export const EVENT_IDS = Object.keys(EVENTS);
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const JOB_IDS = Object.keys(VILLAGERS.jobs) as JobId[];
export const MAX_LEVEL = PROGRESSION.levels.length;
