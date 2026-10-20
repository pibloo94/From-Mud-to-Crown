// Ficha de personaje (rasgos y relaciones) y las piezas que comparte con el cuestionario de origen.
import { h, icon } from './dom';
import { t } from '../i18n/i18n';
import { TRAITS } from '../sim/data';
import { traitDef, traitLines, type TraitLine } from '../sim/character';
import { ESTATE_IDS } from '../sim/estates';
import { estateBar, pct, tabs, type PanelCtx } from './panels';

export type CharacterTab = 'traits' | 'estates';

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Texto de una ventaja o desventaja: «Pueblo llano +15 al empezar», «Cultivos al 110 %»... */
export function traitLineText(l: TraitLine): string {
  if (l.type === 'startRep') return t('traitFx.startRep', { estate: l.key, n: signed(l.value) });
  if (l.type === 'repGain') return t('traitFx.repGain', { estate: l.key, pct: pct(l.value) });
  return t(`traitFx.${l.key}`, { pct: pct(l.value) });
}

/** Ventajas en verde y desventajas en rojo, una por linea. */
export function traitLinesEl(id: string): HTMLElement | null {
  const def = traitDef(id);
  if (!def) return null;
  return h('ul', { class: 'trait-lines' }, ...traitLines(def).map((l) => h('li', { class: l.good ? 'good' : 'bad' }, `${l.good ? '▲' : '▼'} ${traitLineText(l)}`)));
}

function traitCard(id: string): HTMLElement | null {
  const def = traitDef(id);
  if (!def) return null;
  return h(
    'section',
    { class: 'trait-card' },
    icon(def.icon, 'icon big'),
    h('div', { class: 'up-info' }, h('span', { class: 'pill' }, t(`traitKind.${def.kind}`)), h('b', {}, t(`trait.${id}`)), h('small', {}, t(`trait.${id}.desc`)), traitLinesEl(id)),
  );
}

export function characterView(ctx: PanelCtx, tab: CharacterTab, openTab: (tab: CharacterTab) => void): HTMLElement {
  const s = ctx.sim.state;
  const c = s.character;
  const body =
    tab === 'traits'
      ? h(
          'div',
          { class: 'trait-list' },
          c.traits.length > 0 ? h('p', { class: 'hint left' }, t('character.traitsHint')) : h('p', { class: 'hint left' }, t('character.noTraits')),
          ...c.traits.map(traitCard),
        )
      : h('div', {}, h('p', { class: 'hint left' }, t('progress.estatesHint')), ...ESTATE_IDS.map((e) => estateBar(s, e)));
  return h(
    'div',
    { class: 'sheet progress character' },
    h('h2', {}, c.name || t('character.unnamed')),
    h('p', { class: 'tagline' }, t('character.sub', { rank: s.rank, n: s.level })),
    tabs<CharacterTab>(
      [
        { id: 'traits', label: t('character.tab.traits'), icon: 'icon_scroll' },
        { id: 'estates', label: t('character.tab.estates'), icon: 'icon_crown' },
      ],
      tab,
      openTab,
    ),
    h('div', { class: 'progress-body' }, body),
    h(
      'div',
      { class: 'row-btns' },
      h('button', { class: 'btn', onclick: () => ctx.openProgress('levels') }, t('hud.progress')),
      h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
    ),
  );
}

/** Nombre al azar para el cuestionario. */
export const randomName = (): string => TRAITS.names[Math.floor(Math.random() * TRAITS.names.length)];
