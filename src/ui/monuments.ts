// Ventana de un monumento (etapas, coste y lo que da) y tarjeta del legado al terminarlo.
import { artUrl, h, icon } from './dom';
import { t } from '../i18n/i18n';
import { MONUMENTS, PATHS } from '../sim/data';
import { monumentDef, monumentDone, monumentStage, monumentUnlocked, nextStage, STAGES } from '../sim/monuments';
import { hasMaterials } from '../sim/materials';
import { dateFromDay } from '../sim/calendar';
import { buyMissingButton, materialChips, type PanelCtx } from './panels';
import { rankFxText } from './character';

/** Lo que da un monumento terminado, como texto. */
const fxText = (id: string): string[] => {
  const def = monumentDef(id)!;
  return [t('monument.prestige', { n: def.prestige }), ...rankFxText({ id: 'duke', level: 0, effects: def.effects, beds: def.beds })];
};

export function monumentView(ctx: PanelCtx, id: string): HTMLElement {
  const s = ctx.sim.state;
  const def = monumentDef(id)!;
  const stage = monumentStage(s, id);
  const next = nextStage(s, id);
  const unlocked = monumentUnlocked(s, id);
  const art = monumentDone(s, id) ? `monument_${id}` : stage > 0 ? `monument_works_${stage}` : `monument_${id}`;
  return h(
    'div',
    { class: 'sheet building monument' },
    h('img', { class: 'monument-art', src: artUrl(art), alt: '' }),
    h('h2', {}, t(`monument.${id}`)),
    h('p', { class: 'tagline' }, t(`monument.${id}.desc`)),
    h('p', { class: 'panel-stats' }, icon(PATHS.icons[def.path], 'icon tiny'), ' ', t('monument.path', { path: def.path, rank: def.rank })),
    h('div', { class: 'monument-fx' }, h('b', {}, t('monument.gives')), ' ', fxText(id).join(' · ')),
    !unlocked && h('p', { class: 'fair-banner' }, t('monument.locked', { rank: def.rank })),
    unlocked && next && stage === 0 && h('p', { class: 'hint' }, t('monument.site')),
    unlocked &&
      next &&
      h(
        'div',
        { class: 'row-btns' },
        h(
          'button',
          { class: 'btn primary', disabled: s.coins < next.cost || !hasMaterials(s, next.materials), onclick: () => (ctx.sim.buildMonument(id), ctx.rerender()) },
          t('monument.build', { n: stage + 1, cost: next.cost }),
        ),
        buyMissingButton(ctx, next.materials, () => (ctx.sim.buyMissingForMonument(id), ctx.rerender())),
      ),
    ...MONUMENTS.stages.map((st, i) => {
      const done = i < stage;
      const current = i === stage;
      return h(
        'div',
        { class: `upgrade-row ${done ? 'done' : ''} ${current ? 'next' : 'locked'}` },
        h('div', { class: 'up-info' }, h('b', {}, done ? '✓ ' : '', t(`monument.stage.${i + 1}`)), h('small', {}, t('monument.stageOf', { n: i + 1, total: STAGES }))),
        !done &&
          h(
            'span',
            { class: 'up-req' },
            h('span', { class: 'nowrap' }, icon('icon_coin', 'icon tiny'), String(st.cost)),
            materialChips(ctx, st.materials, current),
          ),
      );
    }),
    monumentDone(s, id) && h('p', { class: 'ledger-ok' }, t('monument.finished')),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}

/** Tarjeta del legado: el monumento terminado y un resumen de la partida. */
export function legacyView(ctx: PanelCtx, id: string): HTMLElement {
  const s = ctx.sim.state;
  const d = dateFromDay(s.day);
  return h(
    'div',
    { class: 'sheet levelup rank-up legacy' },
    h('img', { class: 'monument-art', src: artUrl(`monument_${id}`), alt: '' }),
    h('h1', {}, t('legacy.title')),
    h('p', { class: 'tagline' }, t('legacy.sub', { name: s.character.name || t('character.unnamed'), monument: id })),
    h(
      'div',
      { class: 'accounts' },
      h('div', { class: 'acct-row' }, h('span', {}, t('legacy.rank')), h('b', {}, t(`rank.${s.rank}`))),
      h('div', { class: 'acct-row' }, h('span', {}, t('legacy.titles')), h('b', {}, s.titles.map((r) => t(`rank.${r}`)).join(', ') || '—')),
      h('div', { class: 'acct-row' }, h('span', {}, t('legacy.time')), h('b', {}, t('legacy.years', { y: d.year, day: s.day }))),
      h('div', { class: 'acct-row' }, h('span', {}, t('legacy.prestige')), h('b', {}, String(s.noble.prestige))),
      h('div', { class: 'acct-row' }, h('span', {}, t('legacy.villagers')), h('b', {}, String(s.villagers.length))),
    ),
    h('p', { class: 'hint' }, t('legacy.hint')),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('legacy.continue')),
  );
}
