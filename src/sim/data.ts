// Acceso tipado a los archivos de datos. Para anadir contenido, editar src/data/*.json.
import productsJson from '../data/products.json';
import cropsJson from '../data/crops.json';
import animalsJson from '../data/animals.json';
import startJson from '../data/start.json';
import type { AnimalId, CropId, ProductId, TileKind } from './types';

export interface ProductDef {
  price: number;
  icon: string;
}

export interface CropDef {
  seedCost: number;
  growDays: number;
  product: ProductId;
  yield: number;
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
  inventory: Record<ProductId, number>;
  herds: Record<AnimalId, number>;
  map: { legend: Record<string, TileKind>; rows: string[] };
}

export const PRODUCTS = productsJson as Record<ProductId, ProductDef>;
export const CROPS = cropsJson as Record<CropId, CropDef>;
export const ANIMALS = animalsJson as Record<AnimalId, AnimalDef>;
export const START = startJson as StartDef;

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
export const ANIMAL_IDS = Object.keys(ANIMALS) as AnimalId[];
