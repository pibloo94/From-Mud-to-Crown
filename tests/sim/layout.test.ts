import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/pixel/manifest.json';
import { createNewGame, tileAt } from '../../src/sim/state';
import { canExpandAt, canLeaseAt, checkRank, openEastLands } from '../../src/sim/rules';
import { buyCharter, hamletAt } from '../../src/sim/noble';
import { annexTiles, blockOrigin, isBlockOrigin, objectSize } from '../../src/sim/layout';
import { HAMLET_IDS, LAYOUT, NOBILITY, START } from '../../src/sim/data';
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

  it('una partida de la version 9 pasa cada aldea a su bloque de 2x2', () => {
    const s = lordWithFief();
    // Feudo como lo dejaba la version 9: aldeas de una sola casilla.
    const base = START.map.rows.length;
    const old = ['TTGGRGGGGTGGTTT', 'TAGGRGGGNNGGAKT', 'GGGGRRRRNNRRRGG', 'TKGGRGGGGGGGGGT', 'TTGAGGTGGTTGTTT'];
    const legend: Record<string, TileKind> = { ...START.map.legend, ...NOBILITY.fief.legend };
    old.forEach((row, i) => [...row].forEach((ch, x) => (tileAt(s, x, base + i)!.kind = legend[ch])));
    const back = deserialize(JSON.stringify({ format: 'from-mud-to-crown-save', version: 9, savedAt: '2026-10-20T10:00:00Z', state: s }));
    expect(back.map.tiles.filter((t) => t.kind === 'hamlet')).toHaveLength(4 * HAMLET_IDS.length);
    for (const id of HAMLET_IDS) {
      const { x, y } = NOBILITY.hamlets[id];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        expect(tileAt(back, x + dx, y + dy)?.kind, `${id} ${x + dx},${y + dy}`).toBe('hamlet');
        expect(hamletAt(x + dx, y + dy)).toBe(id);
      }
    }
  });
});

describe('dibujos dentro de sus casillas', () => {
  // El arte del mapa es pixel art a x4: una casilla mide 32 px de ancho en el PNG.
  const ART = 4;
  const sizes = manifest as Record<string, number[]>;
  // Dibujos de objetos del mapa (no suelo, cultivos, personas ni animales).
  const objects = Object.keys(sizes).filter((f) => /^(house|granary|coop|market|well|rocks|tree|site|tenant|mill|bakery|cheesery|manor|hamlet|stall|cart|pen_shed)/.test(f));

  it('cada objeto esta dibujado a la medida de sus casillas (sin tener que encogerlo)', () => {
    expect(objects.length).toBeGreaterThan(35);
    for (const f of objects) {
      const n = f.startsWith('manor') ? objectSize('manor') : f.startsWith('hamlet') ? objectSize('hamlet') : 1;
      const w = sizes[f][0] * ART;
      expect(w, f).toBeLessThanOrEqual(n * TILE_W);
      expect(fitScale(w, n), f).toBe(1);
    }
  });

  it('suelo, cultivos y bordes miden exactamente una casilla de ancho', () => {
    for (const f of Object.keys(sizes).filter((k) => /^(grass|soil|path|wild|cliff|wheat|carrot|cabbage)/.test(k))) expect(sizes[f][0] * ART, f).toBe(TILE_W);
  });
});
