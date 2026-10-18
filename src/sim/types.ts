// Tipos del estado de la partida. La simulacion no sabe nada de Phaser ni del DOM.

export type ProductId = 'wheat' | 'carrot' | 'cabbage' | 'egg' | 'milk';
export type CropId = 'wheat' | 'carrot' | 'cabbage';
export type AnimalId = 'chicken' | 'cow';
export type Speed = 0 | 1 | 2 | 3;

export type TileKind = 'grass' | 'soil' | 'path' | 'house' | 'coop' | 'pen' | 'market' | 'tree' | 'well' | 'rocks';

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
}

/** Estado de una parcela cultivable (baldosa de tipo soil). */
export interface Plot {
  crop: CropId | null;
  /** Dias de crecimiento acumulados (puede tener decimales si hay jornaleros). */
  growth: number;
}

/** Grupo de animales de una especie. */
export interface Herd {
  count: number;
  /** Producto acumulado pendiente de recoger. */
  stored: number;
  /** Dias transcurridos desde la ultima produccion. */
  timer: number;
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
  /** Parcelas compradas, para calcular el precio de la siguiente. */
  landBought: number;
  /** Jornaleros contratados: aceleran el crecimiento y cobran cada dia. */
  workers: number;
  /** Multiplicador de precio de cada producto, recalculado cada semana. */
  priceMult: Record<ProductId, number>;
  /** Subida temporal de precios (p. ej. una feria). */
  marketBoost: { mult: number; untilDay: number } | null;
  events: EventsState;
  /** Semilla del generador aleatorio: la partida es reproducible y se guarda con ella. */
  rng: number;
  stats: { harvested: number; earned: number };
}

/** Resultado de una orden del jugador; `msg` es una clave de traduccion. */
export interface CommandResult {
  ok: boolean;
  msg: string;
  params?: Record<string, string | number>;
}

/** Aviso que la simulacion genera por si sola al pasar los dias. */
export type Notice = CommandResult;
