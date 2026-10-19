// Tipos del estado de la partida. La simulacion no sabe nada de Phaser ni del DOM.

export type ProductId = 'wheat' | 'carrot' | 'cabbage' | 'egg' | 'milk' | 'flour' | 'bread' | 'cheese';
export type CropId = 'wheat' | 'carrot' | 'cabbage';
/** Materiales de construccion: se compran en el mercado y se guardan aparte del granero. */
export type MaterialId = 'wood' | 'stone' | 'iron';
export type AnimalId = 'chicken' | 'cow';
export type BuildingId = 'house' | 'granary' | 'coop' | 'pen';
export type JobId = 'farmer' | 'herder' | 'carter' | 'artisan';
/** Talleres que transforman productos: se construyen en los solares del mapa. */
export type WorkshopId = 'mill' | 'bakery' | 'cheesery';
/**
 * Rangos de la escalera principal (de campesino a conde) y titulos de rama (Artesano, Burgues),
 * que se suman sin sustituir el rango.
 */
export type RankId = 'peasant' | 'freeFarmer' | 'landowner' | 'lord' | 'baron' | 'count' | 'artisan' | 'burgher';
/** Senor feudal al que se rinde tributo: cambia al subir en la escalera noble. */
export type LiegeId = 'baron' | 'count' | 'king';
export type Speed = 0 | 1 | 2 | 3;

export type TileKind =
  | 'grass'
  | 'soil'
  | 'path'
  | 'house'
  | 'granary'
  | 'coop'
  | 'pen'
  | 'market'
  | 'tree'
  | 'well'
  | 'rocks'
  /** Tierras del este, cerradas hasta ser Terrateniente. */
  | 'wild'
  /** Solar donde se puede levantar un taller. */
  | 'site'
  /** Taller ya construido (ver `GameState.workshops`). */
  | 'workshop'
  /** Parcela arrendada a un aparcero: paga renta cada estacion. */
  | 'tenant'
  /** Casa solariega del feudo (ver `GameState.noble.manor`). */
  | 'manor'
  /** Aldea vasalla del feudo. */
  | 'hamlet';

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
}

/** Estado de una parcela cultivable (baldosa de tipo soil). */
export interface Plot {
  crop: CropId | null;
  /** Dias de crecimiento acumulados (puede tener decimales con labradores). */
  growth: number;
}

/** Grupo de animales de una especie. */
export interface Herd {
  count: number;
  /** Producto acumulado pendiente de recoger (puede tener decimales con bonificaciones). */
  stored: number;
  /** Dias transcurridos desde la ultima produccion. */
  timer: number;
}

export interface Villager {
  id: number;
  name: string;
  job: JobId;
  /** Grado de herramienta: 0 sin herramienta, hasta 3. */
  tool: number;
  /** Dias seguidos sin comer. */
  hungry: number;
  /** Solo labradores: que siembran en sus parcelas. 'auto' elige lo mejor de la temporada; null no siembra. */
  crop: CropId | 'auto' | null;
  /** Solo artesanos: taller en el que trabaja. */
  workshop?: WorkshopId | null;
}

/** Caravana de comercio camino de otra villa. */
export interface Caravan {
  id: number;
  town: string;
  cargo: Partial<Record<ProductId, number>>;
  /** Materiales comprados en la villa: llegan con la caravana. */
  buy: Partial<Record<MaterialId, number>>;
  escort: boolean;
  /** Monedas que traera si no la asaltan (precios fijados al salir). */
  value: number;
  departDay: number;
  returnDay: number;
}

/** Taller construido en un solar. */
export interface Workshop {
  x: number;
  y: number;
  /** Mejoras compradas. */
  level: number;
  /** Tandas acumuladas (con decimales por la herramienta del artesano). */
  progress: number;
  /** Tandas hechas en total, para el panel. */
  made: number;
}

/** Despensa: que productos comen los aldeanos y cuantos dias de comida se guardan sin vender. */
/** Todo lo de la nobleza: carta, prestigio, casa solariega, aldeas, mesnada y mecenazgo. */
export interface NobleState {
  /** Carta de nobleza comprada al rey. */
  charter: boolean;
  prestige: number;
  /** Mejoras de la casa solariega (0 = solar sin levantar). */
  manor: number;
  /** Nivel de cada aldea vasalla (0 = sin tomar). */
  hamlets: Record<string, number>;
  soldiers: number;
  /** Estacion (numero desde el inicio) en que se uso cada accion de mecenazgo. */
  patronage: Record<string, number>;
}

export interface Pantry {
  eat: Record<ProductId, boolean>;
  reserveDays: number;
}

export type ModifierKind = 'tribute' | 'growth' | 'animal' | 'toolDiscount' | 'idle' | 'priceAll';

/** Efecto temporal (bueno o malo) que termina en `untilDay`. */
export interface Modifier {
  /** Origen, para el texto: p. ej. "levy" (leva rechazada). */
  source: string;
  kind: ModifierKind;
  value: number;
  untilDay: number;
}

export interface EventsState {
  /** Evento esperando decision del jugador. */
  pending: { id: string } | null;
  /** Ultimo dia en que aparecio un evento. */
  lastDay: number;
  /** Dia a partir del cual cada evento puede repetirse. */
  cooldowns: Record<string, number>;
}

export interface GameState {
  /** Dias completos transcurridos desde el inicio (0 = primer dia). */
  day: number;
  /** Fraccion del dia actual, de 0 a 1. */
  dayProgress: number;
  speed: Speed;
  coins: number;
  inventory: Record<ProductId, number>;
  /** Almacen de materiales (no ocupa sitio en el granero). */
  materials: Record<MaterialId, number>;
  pantry: Pantry;
  map: { width: number; height: number; tiles: Tile[] };
  /** Clave "x,y" de cada baldosa cultivable. */
  plots: Record<string, Plot>;
  herds: Record<AnimalId, Herd>;
  /** Experiencia acumulada (puede tener decimales; se muestra redondeada hacia abajo). */
  xp: number;
  level: number;
  rank: RankId;
  /** Titulos de rama conseguidos (Artesano...). */
  titles: RankId[];
  workshops: Partial<Record<WorkshopId, Workshop>>;
  /** Carretas para mandar caravanas a otras villas. */
  carts: number;
  caravans: Caravan[];
  nextCaravanId: number;
  /** Puesto propio en el mercado de la villa. */
  stall: boolean;
  noble: NobleState;
  /** Parcelas compradas, para calcular el precio de la siguiente. */
  landBought: number;
  /** Parcelas arrendadas en las tierras del este. */
  leases: number;
  /** Mejoras compradas de cada edificio (se compran en orden). */
  buildings: Record<BuildingId, number>;
  villagers: Villager[];
  nextVillagerId: number;
  /** Comida que los aldeanos deben y aun no han consumido (fracciones de racion). */
  foodDebt: number;
  /** Reputacion de 0 a 100 ante el baron y ante la aldea. */
  rep: { baron: number; village: number };
  modifiers: Modifier[];
  /** Marcas de historia para eventos encadenados (p. ej. "levyRefused"). */
  flags: string[];
  /** Siembras gratis regaladas por un evento. */
  seedVouchers: number;
  /** Multiplicador de precio de cada producto, recalculado cada semana. */
  priceMult: Record<ProductId, number>;
  /** Subida temporal de precios (p. ej. una feria). */
  marketBoost: { mult: number; untilDay: number } | null;
  events: EventsState;
  /** Semilla del generador aleatorio: la partida es reproducible y se guarda con ella. */
  rng: number;
  stats: { harvested: number; earned: number; seasonEarned: number; seasonFood: number; trades: number; tradeEarned: number };
}

/** Resultado de una orden del jugador; `msg` es una clave de traduccion. */
export interface CommandResult {
  ok: boolean;
  msg: string;
  params?: Record<string, string | number>;
}

/** Aviso que la simulacion genera por si sola al pasar los dias. `card` pide mostrarlo como tarjeta. */
export interface Notice extends CommandResult {
  card?: 'season' | 'rank' | 'levelup' | 'caravan';
  /** Baldosa donde ocurrio (p. ej. una cosecha de los labradores), para mostrarlo sobre el mapa. */
  tile?: { x: number; y: number };
}
