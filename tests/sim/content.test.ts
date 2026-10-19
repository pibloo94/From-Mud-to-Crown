import { describe, expect, it } from 'vitest';
import es from '../../src/i18n/es.json';
import en from '../../src/i18n/en.json';
import { CROPS, CROP_IDS, PRODUCTS, ANIMALS, EVENTS, PROGRESSION, BUILDINGS, VILLAGERS, JOB_IDS, MATERIAL_IDS, WORKSHOPS, TOWN_IDS, NOBILITY, HAMLET_IDS, PATRONAGE_IDS, START } from '../../src/sim/data';
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

describe('textos de eventos y progresion', () => {
  it('cada evento tiene titulo, texto, opciones y resultados en los dos idiomas', () => {
    for (const dict of [es, en] as Record<string, string>[]) {
      for (const [id, ev] of Object.entries(EVENTS)) {
        expect(dict[`event.${id}.title`]).toBeTruthy();
        expect(dict[`event.${id}.text`]).toBeTruthy();
        for (const opt of ev.options) {
          expect(dict[`event.${id}.opt.${opt.id}`]).toBeTruthy();
          expect(dict[`event.${id}.result.${opt.id}`]).toBeTruthy();
          if (opt.risk) expect(dict[`event.${id}.result.${opt.id}.fail`]).toBeTruthy();
        }
      }
      for (const r of PROGRESSION.ranks) expect(dict[`rank.${r.id}`]).toBeTruthy();
      for (const l of PROGRESSION.levels) for (const f of l.unlocks ?? []) expect(dict[`levelup.unlock.${f}`]).toBeTruthy();
      for (const a of Object.keys(ANIMALS)) expect(dict[`animal.${a}`]).toBeTruthy();
    }
  });
});

describe('textos de la aldea', () => {
  it('edificios, mejoras, oficios, herramientas y efectos tienen nombre en los dos idiomas', () => {
    for (const dict of [es, en] as Record<string, string>[]) {
      for (const [b, def] of Object.entries(BUILDINGS)) {
        expect(dict[`building.${b}`]).toBeTruthy();
        expect(dict[`building.${b}.desc`]).toBeTruthy();
        expect(dict[`panel.${b}.stats`]).toBeTruthy();
        for (const up of def.upgrades) expect(dict[`upgrade.${b}.${up.id}`], `upgrade.${b}.${up.id}`).toBeTruthy();
      }
      for (const j of JOB_IDS) {
        for (const k of [`job.${j}`, `job.${j}.title`, `job.${j}.desc`]) expect(dict[k]).toBeTruthy();
        VILLAGERS.tools.tiers.forEach((_, i) => expect(dict[`tool.${j}.${i + 1}`]).toBeTruthy());
      }
      for (const k of ['tribute', 'growth', 'animal', 'toolDiscount', 'idle', 'priceAll']) expect(dict[`modifier.${k}`]).toBeTruthy();
      for (const c of ['offer', 'obligation', 'mishap']) expect(dict[`event.cat.${c}`]).toBeTruthy();
      for (const r of PROGRESSION.ranks) expect(dict[`rank.${r.id}.desc`]).toBeTruthy();
      for (const m of MATERIAL_IDS) expect(dict[`material.${m}`]).toBeTruthy();
      for (const c of [...CROP_IDS, 'auto', 'none']) expect(dict[`farmerCrop.${c}`]).toBeTruthy();
      for (const [w, def] of Object.entries(WORKSHOPS)) {
        for (const k of [`workshop.${w}`, `workshop.${w}.desc`]) expect(dict[k], k).toBeTruthy();
        for (const up of def.upgrades) expect(dict[`wsUpgrade.${w}.${up.id}`], `wsUpgrade.${w}.${up.id}`).toBeTruthy();
      }
      for (const st of ['working', 'noArtisan', 'noInputs', 'full', 'idle']) expect(dict[`workshop.status.${st}`]).toBeTruthy();
      for (const town of TOWN_IDS) expect(dict[`town.${town}`], `town.${town}`).toBeTruthy();
      for (const pr of ['locked', 'noCart', 'empty', 'tooMuch', 'notEnough', 'notSold', 'coins']) expect(dict[`trade.problem.${pr}`]).toBeTruthy();
    }
  });
});

describe('datos', () => {
  it('los materiales de obras y herramientas existen y las obras de piedra piden piedra', () => {
    for (const def of Object.values(BUILDINGS))
      for (const up of def.upgrades) for (const m of Object.keys(up.materials ?? {})) expect(MATERIAL_IDS).toContain(m);
    for (const tier of VILLAGERS.tools.tiers) for (const m of Object.keys(tier.materials ?? {})) expect(MATERIAL_IDS).toContain(m);
    for (const def of Object.values(BUILDINGS))
      for (const up of def.upgrades) if (up.id.startsWith('stone')) expect(up.materials?.stone ?? 0).toBeGreaterThan(0);
  });

  it('las mejoras de cada edificio piden cada vez mas nivel y dinero', () => {
    for (const def of Object.values(BUILDINGS)) {
      for (let i = 1; i < def.upgrades.length; i++) {
        expect(def.upgrades[i].level).toBeGreaterThanOrEqual(def.upgrades[i - 1].level);
        expect(def.upgrades[i].cost).toBeGreaterThan(def.upgrades[i - 1].cost);
      }
    }
  });

  it('cada evento tiene categoria y las obligaciones se pueden incumplir', () => {
    for (const ev of Object.values(EVENTS)) {
      expect(['offer', 'obligation', 'mishap']).toContain(ev.category);
      // siempre hay una opcion sin coste para no quedarse atascado
      expect(ev.options.some((o) => !o.cost && !o.requires)).toBe(true);
    }
  });

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

describe('textos de la nobleza', () => {
  it('rangos, senores, obras, aldeas y mecenazgo tienen texto en los dos idiomas', () => {
    for (const dict of [es, en] as Record<string, string>[]) {
      for (const r of PROGRESSION.ranks) expect(dict[`rank.${r.id}.desc`], `rank.${r.id}.desc`).toBeTruthy();
      for (const l of ['baron', ...Object.values(NOBILITY.lieges)]) {
        expect(dict[`liege.${l}`], `liege.${l}`).toBeTruthy();
        expect(dict[`liege.title.${l}`], `liege.title.${l}`).toBeTruthy();
      }
      for (const up of NOBILITY.manor.upgrades) {
        expect(dict[`manorUp.${up.id}`], `manorUp.${up.id}`).toBeTruthy();
        expect(dict[`manorUp.${up.id}.desc`]).toBeTruthy();
      }
      for (const id of HAMLET_IDS) expect(dict[`hamlet.${id}`] && dict[`hamlet.${id}.desc`], `hamlet.${id}`).toBeTruthy();
      for (const id of PATRONAGE_IDS) {
        expect(dict[`patronage.${id}`] && dict[`patronage.${id}.desc`], `patronage.${id}`).toBeTruthy();
        expect(dict[`noble.patronage.${id}.done`]).toBeTruthy();
      }
      for (const k of ['noble.patronage.done', 'noble.patronage.needSoldiers', 'noble.patronage.cantPay', 'noble.notNoble', 'noble.charterNotReady'])
        expect(dict[k], k).toBeTruthy();
    }
  });

  it('el feudo usa solo simbolos conocidos y cabe en el ancho del mapa', () => {
    const legend: Record<string, string> = { ...START.map.legend, ...NOBILITY.fief.legend };
    for (const row of NOBILITY.fief.rows) {
      expect(row.length).toBe(START.map.rows[0].length);
      for (const ch of row) expect(legend[ch], ch).toBeTruthy();
    }
    // Cada aldea de los datos esta sobre una baldosa de aldea del feudo.
    for (const id of HAMLET_IDS) {
      const { x, y } = NOBILITY.hamlets[id];
      expect(legend[NOBILITY.fief.rows[y - START.map.rows.length][x]]).toBe('hamlet');
    }
  });
});
