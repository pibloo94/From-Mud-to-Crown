// Tipos del estado de la partida. La simulacion no sabe nada de Phaser ni del DOM.

export type ProductId = 'wheat' | 'egg' | 'milk';
export type CropId = 'wheat';
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
  /** Dias completos que lleva creciendo. */
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
  stats: { harvested: number; earned: number };
}

/** Resultado de una orden del jugador; `msg` es una clave de traduccion. */
export interface CommandResult {
  ok: boolean;
  msg: string;
  params?: Record<string, string | number>;
}
