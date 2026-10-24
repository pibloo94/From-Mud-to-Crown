// Ficha de personaje (rasgos y relaciones) y las piezas que comparte con el cuestionario de origen.
import { h, icon } from './dom';
import { t } from '../i18n/i18n';
import { PATHS, PROGRESSION, TRAITS, type RankDef } from '../sim/data';
import { hasRank } from '../sim/progress';
import { PATH_IDS, canChoosePath, pathLevel, pathRate } from '../sim/paths';
import type { GameState, PathId } from '../sim/types';
import { EARNED_IDS, earnStatus, traitDef, traitLines, type TraitLine } from '../sim/character';
import { ESTATE_IDS } from '../sim/estates';
import { estateBar, pct, tabs, type PanelCtx } from './panels';

export type CharacterTab = 'traits' | 'estates' | 'paths';

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Texto de una ventaja o desventaja: «Pueblo llano +15 al empezar», «Cultivos al 110 %»... */
export function traitLineText(l: TraitLine): string {
  if (l.type === 'startRep') return t('traitFx.startRep', { estate: l.key, n: signed(l.value) });
  if (l.type === 'repGain') return t('traitFx.repGain', { estate: l.key, pct: pct(l.value) });
  if (l.type === 'beds') return t('rankFx.beds', { n: l.value });
  return t(`traitFx.${l.key}`, { pct: pct(l.value) });
}

/** Lo que da un rango (progression.json, effects y beds), como texto. */
export function rankFxText(r: RankDef): string[] {
  const out = Object.entries(r.effects ?? {}).map(([k, v]) => traitLineText({ type: 'effect', key: k, value: v!, good: true }));
  if (r.beds) out.push(t('rankFx.beds', { n: r.beds }));
  return out;
}

/** Ventajas en verde y desventajas en rojo, una por linea. */
export function traitLinesEl(id: string): HTMLElement | null {
  const def = traitDef(id);
  if (!def) return null;
  return h('ul', { class: 'trait-lines' }, ...traitLines(def).map((l) => h('li', { class: l.good ? 'good' : 'bad' }, `${l.good ? '▲' : '▼'} ${traitLineText(l)}`)));
}

/** Tarjeta al ganar un rasgo con las decisiones de la partida. */
export function traitEarnedView(ctx: PanelCtx, id: string, openSheet: () => void): HTMLElement {
  const def = traitDef(id);
  return h(
    'div',
    { class: 'sheet event trait-earned' },
    h('div', { class: 'event-seal' }, icon(def?.icon ?? 'icon_scroll', 'event-icon')),
    h('span', { class: 'event-cat cat-offer' }, t('traitKind.earned')),
    h('h2', {}, t('traitCard.title', { trait: id })),
    h('p', { class: 'event-text' }, t(`trait.${id}.desc`)),
    traitLinesEl(id),
    h('p', { class: 'hint' }, t('traitCard.hint', { max: TRAITS.earned.max })),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('seasonCard.ok')),
    h('button', { class: 'btn', onclick: openSheet }, t('traitCard.sheet')),
  );
}

/** Rasgos que se pueden ganar y cuanto falta, con la barra de lo hecho. */
function earnableList(s: GameState): HTMLElement {
  const full = s.character.earned.length >= TRAITS.earned.max;
  const rows = EARNED_IDS.filter((id) => !s.character.earned.includes(id)).map((id) => {
    const def = traitDef(id)!;
    const { have, need } = earnStatus(s, id);
    const e = def.earn!;
    const how = e.estate
      ? t(e.net! > 0 ? 'character.earn.for' : 'character.earn.against', { estate: e.estate, n: Math.min(have, need), need })
      : t(`character.earn.${e.stat}`, { n: Math.min(have, need), need });
    return h(
      'div',
      { class: 'earnable' },
      h('div', { class: 'rep-head' }, h('b', {}, t(`trait.${id}`)), h('span', {}, how)),
      h('span', { class: 'rep-bar' }, h('span', { class: 'rep-fill', style: `width:${Math.min(100, Math.round((have / need) * 100))}%` })),
      traitLinesEl(id),
    );
  });
  return h(
    'div',
    { class: 'earnable-list' },
    h('h3', { class: 'market-section' }, t('character.earnable')),
    h('p', { class: `hint left ${full ? 'warn-text' : ''}` }, t(full ? 'character.earnFull' : 'character.earnHint', { max: TRAITS.earned.max })),
    ...rows,
  );
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

/** Un camino: peldano, barra de meritos, ritmo y botones para ponerlo en foco o de segundo. */
function pathCard(ctx: PanelCtx, s: GameState, p: PathId): HTMLElement {
  const { focus, second } = s.paths;
  const merits = Math.floor(s.paths.merits[p]);
  const lv = pathLevel(merits);
  const max = PATHS.levels.length - 1;
  const fill = lv.to === null ? 100 : Math.round(((merits - lv.from) / (lv.to - lv.from)) * 100);
  const rate = Math.round(pathRate(s, p) * 100);
  const role = p === focus ? 'focus' : p === second ? 'second' : focus ? 'other' : 'before';
  const act = (fn: () => void) => () => (fn(), ctx.rerender());
  const choose = canChoosePath(s);
  return h(
    'section',
    { class: `path-card path-${role}` },
    icon(PATHS.icons[p], 'icon big'),
    h(
      'div',
      { class: 'up-info' },
      h(
        'div',
        { class: 'path-head' },
        h('b', {}, t(`path.${p}`)),
        h('span', { class: 'pill' }, t(`paths.role.${role}`, { pct: rate })),
        s.character.ambition === p && h('span', { class: 'pill ambition' }, t('paths.ambition')),
      ),
      h('small', {}, t('paths.level', { n: lv.level, max }), ' · ', lv.to === null ? t('paths.top', { n: merits }) : t('paths.merits', { n: merits, next: lv.to })),
      h('span', { class: 'rep-bar' }, h('span', { class: 'rep-fill', style: `width:${fill}%` })),
      h('small', {}, t(`path.${p}.desc`)),
      pathRanks(s, p),
      choose &&
        p !== focus &&
        h(
          'div',
          { class: 'row-btns' },
          h(
            'button',
            { class: 'btn small primary', onclick: act(() => ctx.sim.setPathFocus(p)) },
            t('paths.setFocus'),
            focus && h('small', {}, t('paths.switchLoss', { pct: Math.round(PATHS.switchLoss * 100), path: focus })),
          ),
          focus && p !== second ? h('button', { class: 'btn small', onclick: act(() => ctx.sim.setPathSecond(p)) }, t('paths.setSecond')) : null,
        ),
    ),
  );
}

/** Los rangos de un camino: peldano que piden, lo que dan y si ya se tienen. */
function pathRanks(s: GameState, p: PathId): HTMLElement | null {
  const ranks = PROGRESSION.ranks.filter((r) => r.path === p);
  if (ranks.length === 0) return null;
  return h(
    'ul',
    { class: 'path-ranks', 'aria-label': t('paths.ranks') },
    ...ranks.map((r) => {
      const got = hasRank(s, r.id);
      const fx = rankFxText(r);
      return h(
        'li',
        { class: got ? 'got' : '' },
        h('b', {}, got ? '✓ ' : '', t(`rank.${r.id}`)),
        h('span', {}, [r.pathLevel ? t('paths.level', { n: r.pathLevel, max: PATHS.levels.length - 1 }) : '', ...fx].filter(Boolean).map((x) => ` · ${x}`).join('')),
      );
    }),
  );
}

function pathsTab(ctx: PanelCtx, s: GameState): HTMLElement {
  const hint = !canChoosePath(s) ? t('paths.before', { rank: PATHS.focusFrom, pct: Math.round(PATHS.rates.before * 100) }) : s.paths.focus ? t('paths.hint') : t('paths.choose');
  // El camino en foco y el segundo, arriba.
  const order = [...PATH_IDS].sort((a, b) => rank(s, a) - rank(s, b));
  return h('div', { class: 'path-list' }, h('p', { class: `hint left ${canChoosePath(s) && !s.paths.focus ? 'fair-banner' : ''}` }, hint), ...order.map((p) => pathCard(ctx, s, p)));
}

const rank = (s: GameState, p: PathId) => (p === s.paths.focus ? 0 : p === s.paths.second ? 1 : 2);

export function characterView(ctx: PanelCtx, tab: CharacterTab, openTab: (tab: CharacterTab) => void): HTMLElement {
  const s = ctx.sim.state;
  const c = s.character;
  const body =
    tab === 'paths'
      ? pathsTab(ctx, s)
      : tab === 'traits'
      ? h(
          'div',
          { class: 'trait-list' },
          c.traits.length > 0 ? h('p', { class: 'hint left' }, t('character.traitsHint')) : h('p', { class: 'hint left' }, t('character.noTraits')),
          ...c.traits.map(traitCard),
          h('h3', { class: 'market-section' }, t('character.earnedTitle', { n: c.earned.length, max: TRAITS.earned.max })),
          c.earned.length === 0 && h('p', { class: 'hint left' }, t('character.noEarned')),
          ...c.earned.map(traitCard),
          earnableList(s),
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
        { id: 'paths', label: t('character.tab.paths'), icon: 'icon_banner' },
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
