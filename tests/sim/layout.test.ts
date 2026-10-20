import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/sprites/manifest.json';
import { createNewGame, tileAt } from '../../src/sim/state';
import { canExpandAt, canLeaseAt, checkRank, openEastLands } from '../../src/sim/rules';
import { buyCharter } from '../../src/sim/noble';
import { annexTiles, blockOrigin, isBlockOrigin, objectSize } from '../../src/sim/layout';
import { LAYOUT, NOBILITY, START } from '../../src/sim/data';
import { fitScale, TILE_W } from '../../src/render/iso';
import { deserialize } from '../../src/save/serialize';
import type { GameState, TileKind } from '../../src/sim/types';

function lordWithFief(): GameState {
  const s = createNewGame(4);
  s.level = 20;
  s.day = 600;
  s.rank = 'landowner';
  openEastLands(s);
  s.titles = ['artisan'];
  s.rep = { baron: 80, village: 70 };
  s.coins = 99999;
  buyCharter(s);
  checkRank(s);
  return s;
}

describe('casillas ocupadas', () => {
  it('los objetos de varias casillas forman bloques completos y sin solaparse', () => {
    const s = lordWithFief();
    for (const [kind, n] of Object.entries(LAYOUT.size) as [TileKind, number][]) {
      const tiles = s.map.tiles.filter((t) => t.kind === kind);
      expect(tiles.length % (n * n), kind).toBe(0);
      for (const t of tiles.filter((tl) => isBlockOrigin(s, tl)))
        for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) expect(tileAt(s, t.x + dx, t.y + dy)?.kind, `${kind} ${t.x},${t.y}`).toBe(kind);
      // cada casilla del bloque apunta al mismo origen
      const origins = new Set(tiles.map((t) => JSON.stringify(blockOrigin(s, t))));
      expect(origins.size).toBe(tiles.length / (n * n));
    }
  });

  it('el puesto y la carreta tienen su casilla libre junto al mercado, en el mapa de inicio', () => {
    const s = createNewGame(1);
    const annexes = annexTiles(s);
    expect(annexes.map((a) => a.id).sort()).toEqual(['cart', 'stall']);
    for (const a of annexes) expect(['grass', 'path']).toContain(tileAt(s, a.x, a.y)?.kind);
  });

  it('no se rotura ni se arrienda en casillas reservadas ni pegado a talleres y solares', () => {
    const s = lordWithFief();
    s.level = 20;
    for (const a of annexTiles(s)) {
      expect(canExpandAt(s, a.x, a.y)).toBe(false);
      expect(canLeaseAt(s, a.x, a.y)).toBe(false);
    }
    for (const site of s.map.tiles.filter((t) => LAYOUT.keepClear.includes(t.kind))) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        expect(canExpandAt(s, site.x + dx, site.y + dy), `${site.kind} ${site.x + dx},${site.y + dy}`).toBe(false);
        expect(canLeaseAt(s, site.x + dx, site.y + dy)).toBe(false);
      }
    }
  });

  it('una partida de la version 8 recoloca la casa solariega en su bloque de 2x2', () => {
    const s = lordWithFief();
    // Feudo como lo dejaba la version anterior: casa de una sola casilla en (7,12).
    const base = START.map.rows.length;
    const old = ['TTGGRGGGGTGGTTT', 'TAGGRGGGGGGGAKT', 'GGGGRRRNRRRRRGG', 'TKGGRGGGGGGGGGT', 'TTGAGGTGGTTGTTT'];
    const legend: Record<string, TileKind> = { ...START.map.legend, ...NOBILITY.fief.legend };
    old.forEach((row, i) => [...row].forEach((ch, x) => (tileAt(s, x, base + i)!.kind = legend[ch])));
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 8, savedAt: '2026-10-20T08:00:00Z', state: s }));
    expect(back.map.tiles.filter((t) => t.kind === 'manor')).toHaveLength(4);
    expect(tileAt(back, 7, 12)?.kind).toBe('path');
  });
});

describe('dibujos dentro de sus casillas', () => {
  const sizes = manifest as Record<string, number[]>;
  const width = (f: string) => sizes[f][0];
  // Dibujos de objetos del mapa (no suelo, cultivos, personas, animales ni iconos).
  const objects = Object.keys(sizes).filter((f) => /^(house|granary|coop|market|well|rocks|tree|site|tenant|mill|bakery|cheesery|manor|hamlet|stall|cart|pen_shed)/.test(f));

  it('ningun objeto se dibuja mas ancho que sus casillas', () => {
    expect(objects.length).toBeGreaterThan(30);
    for (const f of objects) {
      const n = f.startsWith('manor') ? objectSize('manor') : 1;
      const w = width(f);
      expect(w * fitScale(w, n), f).toBeLessThanOrEqual(n * TILE_W);
      // Si hay que encogerlo mucho, el dibujo esta mal hecho: mejor redibujarlo a medida.
      expect(fitScale(w, n), f).toBeGreaterThan(0.6);
    }
  });
});
