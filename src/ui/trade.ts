// Pestaña Comercio del mercado: carretas, puesto propio y caravanas a otras villas.
import { MATERIALS, MATERIAL_IDS, PRODUCTS, PRODUCT_IDS, PROGRESSION, TOWN_IDS, TRADE, type MaterialAmounts } from '../sim/data';
import { surplus } from '../sim/pantry';
import { hasMaterials } from '../sim/materials';
import {
  buyPrice,
  cartCapacity,
  idleCarts,
  maxCarts,
  quoteCaravan,
  townPrice,
  townToll,
  townUnlocked,
  tradeUnlocked,
} from '../sim/trade';
import type { GameState, ProductId } from '../sim/types';
import { t } from '../i18n/i18n';
import { h, icon } from './dom';
import { buyMissingButton, materialChips, pct, type PanelCtx } from './panels';

/** Caravana que se esta preparando (se conserva al repintar la ventana). */
interface Draft {
  town: string | null;
  cargo: Partial<Record<ProductId, number>>;
  buy: MaterialAmounts;
  escort: boolean;
}

let draft: Draft = { town: null, cargo: {}, buy: {}, escort: true };

export function resetTradeDraft(): void {
  draft = { town: null, cargo: {}, buy: {}, escort: true };
}

/** Llena la carreta con lo que mas paga esa villa, sin tocar la reserva de la despensa. */
function fillBest(state: GameState, town: string): Partial<Record<ProductId, number>> {
  const cargo: Partial<Record<ProductId, number>> = {};
  let left = cartCapacity(state);
  const order = PRODUCT_IDS.slice().sort((a, b) => townPrice(state, town, b) - townPrice(state, town, a));
  for (const p of order) {
    const n = Math.min(left, surplus(state, p));
    if (n > 0) {
      cargo[p] = n;
      left -= n;
    }
  }
  return cargo;
}

function cartsSection(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const max = maxCarts(s);
  const canMore = s.carts < max;
  const next = TRADE.maxCarts[s.carts];
  return h(
    'div',
    { class: 'trade-row' },
    h(
      'div',
      { class: 'trade-head' },
      icon('icon_cart', 'icon big'),
      h('div', { class: 'market-info' }, h('b', {}, t('trade.carts')), h('small', {}, t('trade.cartsInfo', { n: s.carts, max, free: idleCarts(s), cap: cartCapacity(s), upkeep: PROGRESSION.upkeep.cart }))),
      canMore
        ? h(
            'button',
            { class: 'btn small primary', disabled: s.coins < TRADE.cart.cost || !hasMaterials(s, TRADE.cart.materials), onclick: () => ctx.sim.buyCart() },
            t('trade.buyCart', { cost: TRADE.cart.cost }),
          )
        : h('span', { class: 'up-req' }, next ? t('panel.lockedAt', { level: next.level }) : ''),
    ),
    canMore && materialChips(ctx, TRADE.cart.materials),
    canMore && buyMissingButton(ctx, TRADE.cart.materials, () => ctx.sim.buyMaterialsFor(TRADE.cart.materials)),
  );
}

function stallSection(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const def = TRADE.stall;
  return h(
    'div',
    { class: `trade-row ${s.level >= def.level || s.stall ? '' : 'locked'}` },
    h(
      'div',
      { class: 'trade-head' },
      icon('icon_coin', 'icon big'),
      h('div', { class: 'market-info' }, h('b', {}, t('trade.stall')), h('small', {}, t(s.stall ? 'trade.stallOwned' : 'trade.stallInfo', { n: pct(def.priceBonus - 1) }))),
      s.stall
        ? h('span', { class: 'up-check' }, icon('icon_check', 'icon tiny'))
        : s.level < def.level
          ? h('span', { class: 'up-req' }, h('span', { class: 'req-missing' }, t('panel.lockedAt', { level: def.level })))
          : h(
              'button',
              { class: 'btn small primary', disabled: s.coins < def.cost || !hasMaterials(s, def.materials), onclick: () => ctx.sim.buyStall() },
              t('trade.buyStall', { cost: def.cost }),
            ),
    ),
    !s.stall && s.level >= def.level && materialChips(ctx, def.materials),
    !s.stall && s.level >= def.level && buyMissingButton(ctx, def.materials, () => ctx.sim.buyMaterialsFor(def.materials)),
  );
}

function travelling(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  if (s.caravans.length === 0) return [];
  return [
    h('h3', { class: 'market-section' }, t('trade.onTheRoad')),
    ...s.caravans.map((c) => {
      const units = Object.values(c.cargo).reduce((a, b) => a + (b ?? 0), 0);
      return h(
        'div',
        { class: 'trade-row caravan-row' },
        h(
          'div',
          { class: 'trade-head' },
          icon('icon_cart', 'icon big'),
          h(
            'div',
            { class: 'market-info' },
            h('b', {}, t(`town.${c.town}`)),
            h('small', {}, t('trade.caravanInfo', { units, coins: c.value, days: Math.max(0, c.returnDay - s.day) }), c.escort ? ` · ${t('trade.escorted')}` : ''),
          ),
        ),
      );
    }),
  ];
}

function townPicker(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  return h(
    'div',
    { class: 'town-list' },
    ...TOWN_IDS.map((town) => {
      const def = TRADE.towns[town];
      const open = townUnlocked(s, town);
      const best = PRODUCT_IDS.filter((p) => (def.demand[p] ?? 0) >= 1.3).sort((a, b) => (def.demand[b] ?? 0) - (def.demand[a] ?? 0));
      return h(
        'button',
        {
          class: `town ${draft.town === town ? 'active' : ''}`,
          disabled: !open,
          'aria-pressed': String(draft.town === town),
          onclick: () => {
            draft = { town, cargo: fillBest(s, town), buy: {}, escort: draft.escort };
            ctx.rerender();
          },
        },
        h('b', {}, t(`town.${town}`)),
        h(
          'small',
          {},
          open ? t('trade.townInfo', { days: def.days, toll: townToll(s, town), risk: pct(def.danger) }) : t('panel.lockedAt', { level: def.unlockLevel }),
        ),
        h('span', { class: 'town-wants' }, ...best.map((p) => h('span', { class: 'nowrap' }, icon(PRODUCTS[p].icon, 'icon tiny'), `×${def.demand[p]}`))),
      );
    }),
  );
}

/** Formulario de la caravana: carga con barras, compras en la villa, escolta y presupuesto en vivo. */
function caravanForm(ctx: PanelCtx, town: string): HTMLElement {
  const s = ctx.sim.state;
  const def = TRADE.towns[town];
  const cap = cartCapacity(s);
  const summary = h('div', { class: 'caravan-summary' });
  const loadBar = h('span', { class: 'mini-fill' });
  const loadText = h('b', {});
  const sendBtn = h('button', { class: 'btn primary', onclick: () => send() }) as HTMLButtonElement;

  const recalc = () => {
    const q = quoteCaravan(s, town, draft.cargo, draft.buy, draft.escort);
    loadText.textContent = t('trade.load', { n: q.units, cap });
    loadBar.style.width = `${Math.min(100, (q.units / cap) * 100)}%`;
    loadBar.parentElement?.classList.toggle('over', q.units > cap);
    summary.replaceChildren(
      row(t('trade.sumValue'), `${q.value}`),
      row(t('trade.sumUpfront'), `−${q.upfront}`),
      row(t('trade.sumRisk'), q.risk > 0 ? t('trade.riskText', { n: pct(q.risk), lost: pct(TRADE.robbedFraction) }) : t('trade.noRisk')),
      row(t('trade.sumDays'), t('pantry.days', { n: q.days })),
    );
    sendBtn.textContent = q.problem ? t(q.problem, { cost: q.upfront, max: cap }) : t('trade.send', { coins: q.value });
    sendBtn.disabled = !!q.problem;
  };
  const row = (a: string, b: string) => h('div', { class: 'acct-row' }, h('span', {}, a), h('b', {}, b));
  const send = () => {
    ctx.sim.sendCaravan(town, draft.cargo, draft.buy, draft.escort);
    if (s.caravans.some((c) => c.departDay === s.day && c.town === town)) resetTradeDraft();
    ctx.rerender();
  };

  const rangeRow = (iconName: string, label: string, max: number, value: number, unit: string, onInput: (n: number) => void) => {
    const input = h('input', { type: 'range', min: 0, max, step: 1, value: Math.min(value, max), class: 'qty-range', disabled: max === 0, 'aria-label': label }) as HTMLInputElement;
    const num = h('b', { class: 'qty-num' }, String(Math.min(value, max)));
    const paint = () => input.style.setProperty('--fill', `${max ? (Number(input.value) / max) * 100 : 0}%`);
    input.addEventListener('input', () => {
      num.textContent = input.value;
      paint();
      onInput(Number(input.value));
      recalc();
    });
    paint();
    return h(
      'div',
      { class: 'cargo-row' },
      h('span', { class: 'cargo-name' }, icon(iconName, 'icon'), h('span', {}, label, h('small', {}, unit))),
      h('div', { class: 'qty-line' }, input, num),
    );
  };

  const products = PRODUCT_IDS.filter((p) => s.inventory[p] > 0);
  const sells = MATERIAL_IDS.filter((m) => buyPrice(town, m) !== null);
  const escortBtn = h(
    'button',
    {
      class: `job-btn toggle ${draft.escort ? 'active' : ''}`,
      'aria-pressed': String(draft.escort),
      onclick: () => {
        draft.escort = !draft.escort;
        ctx.rerender();
      },
    },
    t(draft.escort ? 'trade.escortOn' : 'trade.escortOff', { cost: def.escort }),
  );

  const view = h(
    'div',
    { class: 'caravan-form' },
    h('h3', { class: 'market-section' }, t('trade.cargo', { town })),
    h('div', { class: 'load-line' }, h('span', { class: 'mini-bar load' }, loadBar), loadText),
    h('button', { class: 'btn small', onclick: () => ((draft.cargo = fillBest(s, town)), ctx.rerender()) }, t('trade.fillBest')),
    ...products.map((p) =>
      rangeRow(PRODUCTS[p].icon, t(`product.${p}`), Math.min(s.inventory[p], cap), draft.cargo[p] ?? 0, t('trade.unitPrice', { coins: townPrice(s, town, p) }), (n) => {
        draft.cargo[p] = n;
      }),
    ),
    products.length === 0 && h('p', { class: 'hint left' }, t('trade.nothingToLoad')),
    sells.length > 0 && h('h3', { class: 'market-section' }, t('trade.buyThere')),
    ...sells.map((m) =>
      rangeRow(MATERIALS[m].icon, t(`material.${m}`), 60, draft.buy[m] ?? 0, t('trade.unitPrice', { coins: buyPrice(town, m)! }), (n) => {
        draft.buy[m] = n;
      }),
    ),
    h('div', { class: 'escort-line' }, h('small', {}, t('trade.escortHint', { risk: pct(def.danger) })), escortBtn),
    summary,
    sendBtn,
  );
  recalc();
  return view;
}

export function tradeTab(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  if (!tradeUnlocked(s)) return [h('p', { class: 'hint' }, t('trade.locked', { level: TRADE.unlockLevel }))];
  const out: HTMLElement[] = [h('p', { class: 'hint left' }, t('trade.intro')), cartsSection(ctx), stallSection(ctx), ...travelling(ctx)];
  if (s.carts === 0) return out;
  out.push(h('h3', { class: 'market-section' }, t('trade.newCaravan')));
  if (idleCarts(s) === 0) {
    out.push(h('p', { class: 'hint left' }, t('trade.allOut')));
    return out;
  }
  out.push(townPicker(ctx));
  if (draft.town && townUnlocked(s, draft.town)) out.push(caravanForm(ctx, draft.town));
  return out;
}
