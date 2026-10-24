// Parte de la estacion: lo que se cobrara en las proximas cuentas, si llega el dinero y la comida,
// y que pasaria si no. Se abre desde la pastilla de cuentas de la barra y desde el mercado.
import { h, icon } from './dom';
import { getLang, t } from '../i18n/i18n';
import { seasonForecast } from '../sim/forecast';
import { liegeOf } from '../sim/noble';
import { pct } from './panels';
import type { PanelCtx } from './panels';

export function ledgerView(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const f = seasonForecast(s);
  const c = f.charges;
  const row = (label: string, value: string, cls = '') => h('div', { class: `acct-row ${cls}` }, h('span', {}, label), h('b', {}, value));
  const minus = (n: number) => (n ? `−${n}` : '0');
  const liege = liegeOf(s);
  const food = f.food;
  const fed = s.villagers.length > 0;
  const risks = [
    f.unpaidTaxes > 0 && t('ledger.risk.taxes', { n: f.unpaidTaxes, liege }),
    f.deserters > 0 && t('ledger.risk.deserters', { n: f.deserters }),
    f.leaving.length > 0 && t('ledger.risk.leaving', { names: f.leaving.join(', ') }),
    f.neglect && t('ledger.risk.neglect'),
  ].filter((x): x is string => !!x);

  return h(
    'div',
    { class: 'sheet season-card ledger' },
    h('div', { class: 'event-seal' }, icon('icon_scroll', 'event-icon')),
    h('h2', {}, t('ledger.title')),
    h('p', { class: 'tagline' }, t('ledger.when', { days: f.daysLeft })),
    f.grace
      ? h('p', { class: 'hint' }, t('ledger.grace'))
      : h(
          'div',
          { class: 'accounts' },
          c.debt > 0 && row(t('ledger.debt'), minus(c.debt), 'warn-text'),
          row(t('seasonCard.tithe'), minus(c.tithe)),
          h('p', { class: 'acct-note' }, t('ledger.titheNote', { pct: pct(f.titheRate), earned: s.stats.seasonEarned })),
          row(t('seasonCard.tribute', { liege }), minus(c.tribute)),
          c.soldiers > 0 && row(t('seasonCard.upkeep'), minus(c.soldiers)),
          c.wages > 0 && row(t('seasonCard.wages'), minus(c.wages)),
          c.maintenance > 0 && row(t('seasonCard.maintenance'), minus(c.maintenance)),
          f.income > 0 && row(t('ledger.income'), `+${f.income}`),
          row(t('ledger.total'), minus(f.total - f.income), 'total'),
          row(t('ledger.coins'), String(f.coins), 'muted'),
        ),
    !f.grace &&
      (f.short > 0
        ? h('p', { class: 'fair-banner ledger-verdict' }, t('ledger.short', { n: f.short }))
        : h('p', { class: 'ledger-ok' }, t('ledger.ok', { n: f.coins + f.income - f.total }))),
    risks.length > 0 && h('div', { class: 'ledger-risks' }, h('b', {}, t('ledger.ifShort')), h('ul', {}, ...risks.map((r) => h('li', {}, r)))),

    h('h3', { class: 'market-section' }, t('ledger.foodTitle')),
    !fed
      ? h('p', { class: 'hint' }, t('ledger.foodNone'))
      : h(
          'div',
          { class: 'accounts' },
          row(t('ledger.foodPerDay'), food.perDay.toLocaleString(getLang())),
          row(t('ledger.foodStock'), String(food.stock)),
          row(t('ledger.foodReserve', { days: food.reserveDays }), String(food.reserve), food.below ? 'warn-text' : ''),
          row(t('ledger.foodDays'), t('ledger.days', { n: food.days }), food.below ? 'total warn-text' : 'total'),
        ),
    // En rojo solo si se esta por debajo de la reserva elegida en la despensa (lo que se promete guardar).
    // Que no llegue hasta las cuentas es un dato, no un fallo: lo que se coseche y se recoja tambien cuenta.
    fed &&
      (food.below
        ? h('p', { class: 'fair-banner ledger-verdict' }, t('ledger.foodBelow', { n: food.reserve - food.stock, days: food.reserveDays, hunger: food.hungerDays }))
        : food.short
          ? h('p', { class: 'hint left' }, t('ledger.foodProduce', { needed: food.needed, stock: food.stock, days: f.daysLeft }))
          : h('p', { class: 'ledger-ok' }, t('ledger.foodOk', { n: food.needed }))),
    h('p', { class: 'hint' }, t('ledger.tip')),
    h(
      'div',
      { class: 'row-btns' },
      h('button', { class: 'btn', onclick: () => ctx.openMarket('sell') }, t('ledger.toMarket')),
      h('button', { class: 'btn', onclick: () => ctx.openBuilding('granary', 'pantry') }, t('ledger.toPantry')),
      h('button', { class: 'btn', onclick: () => ctx.openBook('money') }, t('book.title')),
    ),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('panel.close')),
  );
}
