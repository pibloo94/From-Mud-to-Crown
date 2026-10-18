// Tipos del estado de la partida. La simulacion no sabe nada de Phaser ni del DOM.

export type ProductId = 'wheat' | 'carrot' | 'cabbage' | 'egg' | 'milk';
export type CropId = 'wheat' | 'carrot' | 'cabbage';
export type AnimalId = 'chicken' | 'cow';
export type BuildingId = 'house' | 'granary' | 'coop' | 'pen';
export type JobId = 'farmer' | 'herder' | 'carter';
export type RankId = 'peasant' | 'freeFarmer' | 'landowner';
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
  /** Parcela arrendada a un aparcero: paga renta cada estacion. */
  | 'tenant';

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
  map: { width: number; height: number; tiles: Tile[] };
  /** Clave "x,y" de cada baldosa cultivable. */
  plots: Record<string, Plot>;
  herds: Record<AnimalId, Herd>;
  /** Experiencia acumulada (puede tener decimales; se muestra redondeada hacia abajo). */
  xp: number;
  level: number;
  rank: RankId;
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
  stats: { harvested: number; earned: number; seasonEarned: number; seasonFood: number };
}

/** Resultado de una orden del jugador; `msg` es una clave de traduccion. */
export interface CommandResult {
  ok: boolean;
  msg: string;
  params?: Record<string, string | number>;
}

/** Aviso que la simulacion genera por si sola al pasar los dias. `card` pide mostrarlo como tarjeta. */
export interface Notice extends CommandResult {
  card?: 'season' | 'rank';
}
