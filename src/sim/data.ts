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
import estatesJson from '../data/estates.json';
import traitsJson from '../data/traits.json';
import pathsJson from '../data/paths.json';
import commissionsJson from '../data/commissions.json';
import layoutJson from '../data/layout.json';
import type { AnimalId, BuildingId, CropId, Difficulty, EstateEffect, EstateId, JobId, LiegeId, MaterialId, ModifierKind, PathId, ProductId, ProtectionId, RankId, TileKind, TraitEffect, WorkshopId } from './types';
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

export type Feature = 'buyLand' | 'buyChicken' | 'buyCow' | 'renown';

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
  /** Relacion minima con cada estamento (opcional): "nobles": 60, "commoners": 60... */
  king?: number;
  nobles?: number;
  artisans?: number;
  commoners?: number;
  church?: number;
  /** Titulos de rama que pide (Artesano o Burgues). */
  branches?: number;
  /**
   * Lo que hay que mantener para conservar el rango (favor minimo). Si falla en unas cuentas llega
   * un aviso; si sigue fallando en las siguientes, se baja al rango anterior.
   */
  keep?: Partial<Record<EstateId, number>>;
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
  /** Camino al que pertenece y peldano que pide (ver paths.ts). */
  path?: PathId;
  pathLevel?: number;
  /** Cuando cuenta el camino: 'any' siempre, 'main' en foco o de segundo, 'focus' solo en foco. */
  pathRole?: 'any' | 'main' | 'focus';
  /** Lo que da tener el rango, como los rasgos (se acumula con los demas rangos conseguidos). */
  effects?: Partial<Record<TraitEffect, number>>;
  /** Camas de mas en la casa. */
  beds?: number;
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
  /** Avisos del parte de la estacion: dias antes de las cuentas y dias de comida. */
  forecast: { warnDays: number[]; foodWarnDays: number };
  taxes: {
    titheRate: number;
    tributeBase: number;
    tributePerPlot: number;
    /** Con la reputacion del baron por debajo de esto, el tributo sube. */
    /** Reputacion que se pierde si no se puede pagar. */
    unpaidBaron: number;
    /** Estaciones del principio sin impuestos, para que el campesino arranque. */
    graceSeasons: number;
    /** El tributo crece con el rango: a mas tierra y nombre, mas pide el baron. */
    rankTribute: Record<RankId, number>;
    /** Lo que no se paga queda como deuda y crece esto cada estacion. */
    debtInterest: number;
    /** Con esta deuda o mas, el baron embarga tierra para cobrarse. */
    seizeDebt: number;
  };
  reputation: { start: number };
  lands: { eastFrom: number; leaseBaseCost: number; leaseGrowth: number; rentPerSeason: number };
  /** Experiencia por encima del nivel maximo: cada `xpPerPoint` es un punto de renombre que da prestigio. */
  renown: { xpPerPoint: number; prestigePerPoint: number };
  /** Multiplicadores de cada dificultad (se elige al crear la partida). */
  difficulty: Record<Difficulty, DifficultyDef>;
  /** Tiempo de cada estacion: se sortea al empezarla y dura hasta las cuentas siguientes. */
  weather: Record<Season, WeatherDef[]>;
  /**
   * Prevencion que se compra en el mercado y dura hasta las cuentas: libra de los percances de
   * `prevents`. Cuesta `base` + `perUnit` por parcela (cultivos) o por animal (animales).
   */
  protection: Record<ProtectionId, { base: number; perUnit: number; prevents: string[] }>;
  /**
   * Mantenimiento por estacion: cada mejora de edificio, cada taller y sus mejoras, carretas, puesto y
   * obras de la casa solariega. Si no se paga, `neglect` baja cultivos y animales durante `days` dias.
   */
  upkeep: {
    perBuildingLevel: number;
    workshop: number;
    perWorkshopUpgrade: number;
    cart: number;
    stall: number;
    perManorLevel: number;
    neglect: { days: number; growth: number; animal: number };
  };
}

/** Un encargo de estamento: que pide (productos, monedas o tandas), cuanto mas por nivel y que favor da. */
export interface CommissionDef {
  id: string;
  estate: EstateId;
  goods?: Partial<Record<ProductId, number>>;
  coins?: number;
  batches?: number;
  perLevel: number;
  rep: number;
}

export interface CommissionsDef {
  /** Dia desde el que llegan encargos. */
  firstDay: number;
  /** Parte del valor de mercado que se paga por lo entregado. */
  payRate: number;
  templates: CommissionDef[];
}

/** Caminos: de donde salen los meritos, ritmos, coste de cambiar de foco y peldanos. */
export interface PathsDef {
  ids: PathId[];
  icons: Record<PathId, string>;
  /** Camino al que cuenta el favor de cada estamento y meritos por punto de favor ganado. */
  estates: Partial<Record<EstateId, { path: PathId; perRep: number }>>;
  /** Meritos por moneda: ventas (Comercio), caravanas (Comercio) y lo producido en talleres (Oficio). */
  sales: { market: number; trade: number; artisan: number };
  focusFrom: RankId;
  rates: { before: number; focus: number; second: number; other: number };
  switchLoss: number;
  levels: number[];
}

/** Un rasgo del personaje: de donde sale y que cambia (ver character.ts). */
export interface TraitDef {
  kind: 'origin' | 'nature' | 'ambition' | 'earned';
  icon: string;
  /** Rasgos ganados: por lo que se hace con un estamento (neto de decisiones a favor y en contra) o por un contador. */
  earn?: { estate?: EstateId; net?: number; stat?: 'trades' | 'leftHunger'; min?: number };
  /** Camas de mas en la casa. */
  beds?: number;
  startRep?: Partial<Record<EstateId, number>>;
  repGain?: Partial<Record<EstateId, number>>;
  effects?: Partial<Record<TraitEffect, number>>;
}

/** Cuestionario de origen, caracter y ambicion, y los rasgos que da cada respuesta. */
export interface TraitsDef {
  names: string[];
  questions: { id: 'origin' | 'nature' | 'ambition'; options: string[] }[];
  /** Rasgos ganados: cuantos a la vez y en que parte del umbral se pierden. */
  earned: { max: number; loseAt: number };
  traits: Record<string, TraitDef>;
}

/** Estamentos: relaciones, tramos, rivalidades y lo que mueve cada cosa (ver estates.ts). */
export interface EstatesDef {
  ids: EstateId[];
  start: number;
  /** Puntos que vuelve cada relacion hacia `start` en cada cuentas de estacion. */
  drift: number;
  rivals: [EstateId, EstateId][];
  /** Parte de lo que sube un estamento que pierde su rival. */
  rivalShare: number;
  tiers: { id: string; below: number }[];
  effects: Partial<Record<EstateId, Record<string, Partial<Record<EstateEffect, number>>>>>;
  sources: Record<'workshopBuilt' | 'workshopUpgraded' | 'manorWork' | 'charter' | 'titheProblem' | 'tithePaid' | 'tributePaid' | 'wagesPaid', Partial<Record<EstateId, number>>>;
}

export interface DifficultyDef {
  /** Precio de venta en el mercado. */
  prices: number;
  /** Diezmo y tributo. */
  taxes: number;
  /** Salarios y mantenimiento. */
  upkeep: number;
  /** Peso de los percances al sortear eventos. */
  mishaps: number;
  /** Comida que comen los aldeanos. */
  food: number;
  /** Peso de las estaciones de mal tiempo. */
  badWeather: number;
  /** Deuda a partir de la que se embarga. */
  seizeDebt: number;
}

export interface WeatherDef {
  id: string;
  weight: number;
  /** Multiplicadores de la estacion (crecimiento, animales y comida de los aldeanos). */
  growth?: number;
  animal?: number;
  food?: number;
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
  rep?: Partial<Record<EstateId, number>>;
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

/**
 * Que ocupa cada cosa del mapa, para que nada se dibuje encima de otra:
 * - size: lado (en casillas) de los objetos que ocupan un bloque cuadrado; por defecto, 1.
 * - annexes: casillas reservadas junto a un objeto (desplazamiento [dx, dy]), p. ej. el puesto y la carreta.
 * - keepClear: objetos junto a los que no se puede roturar tierra (para que no queden enterrados entre cultivos).
 */
export interface LayoutDef {
  size: Partial<Record<TileKind, number>>;
  annexes: Partial<Record<TileKind, Record<string, [number, number]>>>;
  keepClear: TileKind[];
}

/** Efectos de las mejoras de la casa solariega. */
export interface ManorStats {
  /** Plazas para soldados de la mesnada. */
  soldiers?: number;
  /** Multiplicador del diezmo (capilla propia). */
  titheMult?: number;
  /** Reputacion ante la aldea que se gana cada estacion. */
  /** Relacion con la Iglesia que se gana cada estacion (la capilla). */
  churchRep?: number;
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
  rep?: Partial<Record<EstateId, number>>;
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
    /** El carretero vende a `priceRate` + `priceRatePerTier` por grado de herramienta, sin pasar de `priceRateMax`. */
    carter: { sellEvery: number; priceRate: number; priceRatePerTier: number; priceRateMax: number };
    artisan: { perWorkshop: number };
  };
  tools: { efficiency: number[]; tiers: { cost: number; level: number; materials?: MaterialAmounts }[] };
  /** Salario por estacion de cada oficio (ademas de la comida). */
  wages: Record<JobId, number>;
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
  rep?: Partial<Record<EstateId, number>>;
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
export const ESTATES = estatesJson as unknown as EstatesDef;
export const TRAITS = traitsJson as unknown as TraitsDef;
export const PATHS = pathsJson as unknown as PathsDef;
export const COMMISSIONS = commissionsJson as unknown as CommissionsDef;
export const LAYOUT = layoutJson as unknown as LayoutDef;
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
