// Libro de cuentas: graficas de las estaciones cerradas (dinero, relaciones y granja) y los logros.
import { h, icon } from './dom';
import { t } from '../i18n/i18n';
import { ACHIEVEMENTS } from '../sim/data';
import { ESTATE_IDS } from '../sim/estates';
import { dateFromDay } from '../sim/calendar';
import { tabs, type PanelCtx } from './panels';
import type { EstateId } from '../sim/types';

export type BookTab = 'money' | 'estates' | 'farm' | 'achievements';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: Element[]): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};

const ESTATE_COLOR: Record<EstateId, string> = { king: '#c9a14a', nobles: '#7a1d14', artisans: '#86633d', commoners: '#4f7a3a', church: '#4b515a' };
const W = 300;
const H = 140;
const PAD = { l: 34, r: 6, t: 8, b: 18 };

interface Series {
  label: string;
  color: string;
  values: number[];
  kind?: 'line' | 'bar';
}

/** Grafica sencilla en pixel: barras y lineas sobre las mismas estaciones, con su escala. */
function chart(labels: string[], series: Series[], max?: number): HTMLElement {
  const n = labels.length;
  const top = max ?? Math.max(1, ...series.flatMap((s) => s.values));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => PAD.t + ih - (Math.max(0, v) / top) * ih;
  const kids: Element[] = [];
  // rejilla y escala
  for (const f of [0, 0.5, 1]) {
    const yy = Math.round(PAD.t + ih - f * ih) + 0.5;
    kids.push(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: yy, y2: yy, class: 'grid' }));
    kids.push(svg('text', { x: PAD.l - 4, y: yy + 3, class: 'axis', 'text-anchor': 'end' }));
    kids[kids.length - 1].textContent = String(Math.round(top * f));
  }
  // etiquetas de estacion: la primera, la del medio y la ultima
  for (const i of [...new Set([0, Math.floor((n - 1) / 2), n - 1])]) {
    const tx = svg('text', { x: x(i), y: H - 4, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
    tx.textContent = labels[i];
    kids.push(tx);
  }
  const bars = series.filter((s) => s.kind === 'bar');
  const bw = Math.max(2, Math.min(10, iw / Math.max(1, n) / (bars.length + 1)));
  bars.forEach((s, k) => {
    s.values.forEach((v, i) => {
      const bx = Math.round(x(i) - (bars.length * bw) / 2 + k * bw);
      kids.push(svg('rect', { x: bx, y: Math.round(y(v)), width: Math.max(1, bw - 1), height: Math.max(0, Math.round(PAD.t + ih - y(v))), fill: s.color }));
    });
  });
  for (const s of series.filter((x) => x.kind !== 'bar')) {
    kids.push(svg('polyline', { points: s.values.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2 }));
  }
  return h(
    'figure',
    { class: 'book-chart' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': series.map((s) => s.label).join(', '), 'shape-rendering': 'crispEdges' }, ...kids) as unknown as HTMLElement,
    h('figcaption', { class: 'chart-legend' }, ...series.map((s) => h('span', {}, h('i', { style: `background:${s.color}` }), s.label))),
  );
}

const seasonLabel = (day: number): string => {
  // La fila se apunta el primer dia de la estacion siguiente: se etiqueta con la que se cerro.
  const d = dateFromDay(Math.max(0, day - 1));
  return t('book.seasonShort', { season: d.season, year: d.year });
};

export function bookView(ctx: PanelCtx, tab: BookTab, openTab: (tab: BookTab) => void): HTMLElement {
  const s = ctx.sim.state;
  const rows = s.history;
  const labels = rows.map((r) => seasonLabel(r.day));
  const empty = rows.length === 0 && tab !== 'achievements';
  let body: HTMLElement;
  if (empty) body = h('p', { class: 'hint' }, t('book.empty'));
  else if (tab === 'money') {
    const last = rows[rows.length - 1];
    body = h(
      'div',
      {},
      chart(labels, [
        { label: t('book.income'), color: '#4f7a3a', values: rows.map((r) => r.income), kind: 'bar' },
        { label: t('book.costs'), color: '#7a1d14', values: rows.map((r) => r.costs), kind: 'bar' },
      ]),
      chart(labels, [{ label: t('book.coins'), color: '#c9a14a', values: rows.map((r) => r.coins) }]),
      h(
        'div',
        { class: 'accounts' },
        h('div', { class: 'acct-row' }, h('span', {}, t('book.lastIncome')), h('b', {}, `+${last.income}`)),
        h('div', { class: 'acct-row' }, h('span', {}, t('book.lastCosts')), h('b', {}, `−${last.costs}`)),
        h('div', { class: 'acct-row total' }, h('span', {}, t('book.lastBalance')), h('b', {}, `${last.income - last.costs >= 0 ? '+' : ''}${last.income - last.costs}`)),
      ),
    );
  } else if (tab === 'estates') {
    body = chart(
      labels,
      ESTATE_IDS.map((e) => ({ label: t(`estate.${e}`), color: ESTATE_COLOR[e], values: rows.map((r) => r.rep[e]) })),
      100,
    );
  } else if (tab === 'farm') {
    body = h(
      'div',
      {},
      chart(labels, [{ label: t('book.villagers'), color: '#86633d', values: rows.map((r) => r.villagers) }]),
      chart(labels, [{ label: t('book.food'), color: '#4f7a3a', values: rows.map((r) => r.food), kind: 'bar' }]),
    );
  } else {
    const got = ACHIEVEMENTS.achievements.filter((a) => s.achievements[a.id] !== undefined).length;
    body = h(
      'div',
      { class: 'achievements' },
      h('p', { class: 'hint left' }, t('book.achievementsCount', { n: got, total: ACHIEVEMENTS.achievements.length })),
      ...ACHIEVEMENTS.achievements.map((a) => {
        const day = s.achievements[a.id];
        return h(
          'div',
          { class: `achievement ${day !== undefined ? 'got' : ''}` },
          icon(a.icon, 'icon big'),
          h(
            'div',
            { class: 'up-info' },
            h('b', {}, t(`achievement.${a.id}`)),
            h('small', {}, t(`achievement.${a.id}.desc`)),
            day !== undefined && h('small', { class: 'achievement-day' }, t('book.gotOn', { day })),
          ),
        );
      }),
    );
  }
  return h(
    'div',
    { class: 'sheet progress book' },
    h('h2', {}, t('book.title')),
    tabs<BookTab>(
      [
        { id: 'money', label: t('book.tab.money'), icon: 'icon_coin' },
        { id: 'estates', label: t('book.tab.estates'), icon: 'icon_crown' },
        { id: 'farm', label: t('book.tab.farm'), icon: 'icon_wheat' },
        { id: 'achievements', label: t('book.tab.achievements'), icon: 'icon_prestige' },
      ],
      tab,
      openTab,
    ),
    h('div', { class: 'progress-body' }, body),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}
