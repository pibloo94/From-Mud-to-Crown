import { describe, expect, it } from 'vitest';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';
import { CROPS, PRODUCTS, ANIMALS } from '../../src/sim/data';
import { toScreen, toTile } from '../../src/render/iso';

describe('traducciones', () => {
  it('espanol e ingles tienen las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('cada producto, cultivo y estacion tiene nombre en los dos idiomas', () => {
    for (const dict of [es, en] as Record<string, string>[]) {
      for (const p of Object.keys(PRODUCTS)) expect(dict[`product.${p}`]).toBeTruthy();
      for (const c of Object.keys(CROPS)) expect(dict[`crop.${c}`]).toBeTruthy();
      for (const s of ['spring', 'summer', 'autumn', 'winter']) expect(dict[`season.${s}`]).toBeTruthy();
    }
  });
});

describe('datos', () => {
  it('cultivos y animales producen productos que existen en el mercado', () => {
    for (const c of Object.values(CROPS)) expect(PRODUCTS[c.product]).toBeDefined();
    for (const a of Object.values(ANIMALS)) expect(PRODUCTS[a.product]).toBeDefined();
  });
});

describe('geometria isometrica', () => {
  it('el centro de cada baldosa vuelve a su baldosa', () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const { sx, sy } = toScreen(x, y);
        expect(toTile(sx, sy + 32)).toEqual({ x, y });
      }
    }
  });
});
