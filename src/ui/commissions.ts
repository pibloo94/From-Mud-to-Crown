// Ventana de encargos: lo que pide cada estamento esta estacion, cuanto se lleva y la recompensa.
import { h, icon } from './dom';
import { t } from '../i18n/i18n';
import { PATHS } from '../sim/data';
import { commissionDef, commissionPay, commissionProgress } from '../sim/commissions';
import { nextSeasonStart } from '../sim/modifiers';
import type { PanelCtx } from './panels';

const ESTATE_ICON: Record<string, string> = { king: 'icon_crown', nobles: 'icon_banner', church: 'icon_scroll', artisans: 'icon_hammer', commoners: 'icon_worker' };

export function commissionsView(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const offers = s.commissions.offers;
  const days = nextSeasonStart(s.day) - s.day;
  const rows = offers.map((o, i) => {
    const c = commissionDef(o.id);
    if (!c) return null;
    const { have, need } = commissionProgress(s, i);
    const pay = commissionPay(s, i);
    const path = PATHS.estates[c.estate]?.path;
    return h(
      'section',
      { class: `commission ${o.done ? 'done' : ''}` },
      icon(ESTATE_ICON[c.estate] ?? 'icon_scroll', 'icon big'),
      h(
        'div',
        { class: 'up-info' },
        h('b', {}, t(`estate.${c.estate}`)),
        h('span', {}, t(`commission.${c.id}`, { n: o.amount })),
        h(
          'small',
          { class: 'commission-reward' },
          [t('commissions.rep', { estate: c.estate, n: c.rep }), pay > 0 ? t('commissions.coins', { n: pay }) : '', path ? t('commissions.path', { path }) : ''].filter(Boolean).join(' · '),
        ),
        o.done
          ? h('span', { class: 'pill' }, t('commissions.done'))
          : h(
              'div',
              { class: 'commission-act' },
              h('span', { class: 'rep-bar' }, h('span', { class: 'rep-fill', style: `width:${Math.min(100, Math.round((have / need) * 100))}%` })),
              h('small', {}, t('commissions.progress', { have: Math.min(have, need), need })),
              h('button', { class: 'btn small primary', disabled: have < need, onclick: () => (ctx.sim.completeCommission(i), ctx.rerender()) }, t('commissions.deliver')),
            ),
      ),
    );
  });
  return h(
    'div',
    { class: 'sheet building commissions' },
    h('div', { class: 'event-seal' }, icon('icon_banner', 'event-icon')),
    h('h2', {}, t('commissions.title')),
    h('p', { class: 'tagline' }, offers.length ? t('commissions.sub', { days }) : t('commissions.none')),
    ...rows,
    h('p', { class: 'hint' }, t('commissions.hint')),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}
