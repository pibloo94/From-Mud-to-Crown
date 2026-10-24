// Mercado: vender con una barra para elegir la cantidad y comprar materiales y ganado.
import type { Game } from '../sim/game';
import { ANIMALS, ANIMAL_IDS, CROPS, MATERIALS, MATERIAL_IDS, PRODUCTS, PRODUCT_IDS, PROGRESSION, WORKSHOPS } from '../sim/data';
import { builtWorkshops } from '../sim/workshops';
import { boostActive, priceOf, priceTrend } from '../sim/market';
import { dateFromDay } from '../sim/calendar';
import { hasFeature } from '../sim/progress';
import { animalCapacity } from '../sim/rules';
import { materialPrice, materialUnlocked } from '../sim/materials';
import { reserved, surplus } from '../sim/pantry';
import { isProtected, protectionCost } from '../sim/risk';
import { seasonForecast } from '../sim/forecast';
import type { AnimalId, MaterialId, ProductId, ProtectionId } from '../sim/types';
import { t } from '../i18n/i18n';
import { h, icon } from './dom';
import type { PanelCtx } from './panels';
import { resetTradeDraft, tradeTab } from './trade';

export type MarketTab = 'sell' | 'buy' | 'trade';

/**
 * Cantidad que el jugador ha movido a mano en cada barra, para que no se pierda al repintar
 * la ventana. Solo guarda lo que el jugador toca: si no, cada barra arranca en su valor por
 * defecto (lo que sobra tras la reserva), que cambia con lo que hay en el granero.
 */
const chosen = new Map<string, number>();

/** Al abrir el mercado, todas las barras vuelven a su valor por defecto. */
export function resetMarketChoices(): void {
  chosen.clear();
  resetTradeDraft();
}

function trendMark(sim: Game, p: ProductId): HTMLElement | null {
  const tr = priceTrend(sim.state, p);
  if (tr === 0) return null;
  return h('span', { class: `trend trend-${tr > 0 ? 'up' : 'down'}`, title: t(tr > 0 ? 'market.trendUp' : 'market.trendDown') }, icon(tr > 0 ? 'icon_up' : 'icon_down', 'icon tiny'));
}

/**
 * Barra deslizante con su cantidad y el boton de la accion. Al mover la barra solo se
 * actualizan la etiqueta y el boton, sin repintar la ventana (para no cortar el arrastre).
 */
function slider(opts: {
  key: string;
  max: number;
  initial: number;
  unit: number;
  label: (qty: number, total: number) => string;
  note?: (qty: number) => string;
  primary?: boolean;
  onAct: (qty: number) => void;
}): HTMLElement {
  const max = Math.max(0, opts.max);
  const qty = Math.min(max, chosen.get(opts.key) ?? opts.initial);
  const input = h('input', {
    type: 'range',
    min: 0,
    max,
    step: 1,
    value: qty,
    class: 'qty-range',
    disabled: max === 0,
    'aria-label': t('market.quantity'),
  }) as HTMLInputElement;
  const qtyText = h('b', { class: 'qty-num' });
  const noteText = h('small', { class: 'qty-note' });
  const btn = h('button', { class: `btn small ${opts.primary ? 'primary' : ''}` }) as HTMLButtonElement;
  const sync = () => {
    const n = Number(input.value);
    qtyText.textContent = String(n);
    btn.textContent = opts.label(n, n * opts.unit);
    btn.disabled = n <= 0;
    noteText.textContent = opts.note?.(n) ?? '';
    input.style.setProperty('--fill', `${max ? (n / max) * 100 : 0}%`);
  };
  input.addEventListener('input', () => {
    chosen.set(opts.key, Number(input.value));
    sync();
  });
  btn.addEventListener('click', () => {
    const n = Number(input.value);
    if (n <= 0) return;
    chosen.delete(opts.key);
    opts.onAct(n);
  });
  sync();
  return h('div', { class: 'qty' }, h('div', { class: 'qty-line' }, input, qtyText), noteText, btn);
}

function sellTab(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  const res = reserved(s);
  const products = PRODUCT_IDS.filter(
    (p) =>
      s.inventory[p] > 0 ||
      (!Object.values(CROPS).some((c) => c.product === p && s.level < c.unlockLevel) &&
        (!PRODUCTS[p].artisan || builtWorkshops(s).some((id) => WORKSHOPS[id].recipe.out[p]))),
  );
  return products.map((p) => {
    const have = s.inventory[p];
    const price = priceOf(s, p);
    const keep = res[p];
    return h(
      'div',
      { class: 'trade-row' },
      h(
        'div',
        { class: 'trade-head' },
        icon(PRODUCTS[p].icon, 'icon big'),
        h(
          'div',
          { class: 'market-info' },
          h('b', {}, t(`product.${p}`)),
          h(
            'small',
            {},
            t('market.stock', { n: have }),
            keep > 0 ? ` · ${t('market.reserved', { n: keep })}` : '',
          ),
        ),
        h('span', { class: 'price nowrap' }, icon('icon_coin', 'icon tiny'), String(price), ' ', trendMark(ctx.sim, p)),
      ),
      have === 0
        ? h('small', { class: 'qty-note muted' }, t('market.noneToSell'))
        : slider({
        key: `sell:${p}`,
        max: have,
        initial: surplus(s, p),
        unit: price,
        primary: true,
        label: (n, total) => t('market.sellN', { n, coins: total }),
        // Avisa si lo elegido se come la reserva de la despensa.
        note: (n) => (n > have - keep ? t('market.intoReserve') : n === 0 && keep >= have ? t('market.allReserved') : ''),
        onAct: (n) => ctx.sim.sell(p, n),
      }),
    );
  });
}

function buyTab(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  const materials = MATERIAL_IDS.map((m: MaterialId) => {
    const def = MATERIALS[m];
    const unlocked = materialUnlocked(s, m);
    const price = materialPrice(s, m);
    const affordable = Math.min(99, Math.floor(s.coins / price));
    return h(
      'div',
      { class: `trade-row ${unlocked ? '' : 'locked'}` },
      h(
        'div',
        { class: 'trade-head' },
        icon(def.icon, 'icon big'),
        h('div', { class: 'market-info' }, h('b', {}, t(`material.${m}`)), h('small', {}, t('market.stock', { n: s.materials[m] }))),
        h('span', { class: 'price nowrap' }, icon('icon_coin', 'icon tiny'), String(price)),
      ),
      unlocked
        ? slider({
            key: `buy:${m}`,
            max: affordable,
            initial: Math.min(affordable, 5),
            unit: price,
            label: (n, total) => t('market.buyN', { n, coins: total }),
            onAct: (n) => ctx.sim.buyMaterial(m, n),
          })
        : h('small', { class: 'qty-note' }, t('market.lockedAt', { level: def.unlockLevel ?? 1 })),
    );
  });
  const livestock = ANIMAL_IDS.map((a: AnimalId) => {
    const offer = PROGRESSION.animalsForSale[a];
    const unlocked = hasFeature(s, offer.unlock);
    const unlockLevel = PROGRESSION.levels.findIndex((l) => l.unlocks?.includes(offer.unlock)) + 1;
    const count = s.herds[a].count;
    const max = animalCapacity(s, a);
    return h(
      'div',
      { class: `trade-row ${unlocked ? '' : 'locked'}` },
      h(
        'div',
        { class: 'trade-head' },
        icon(PRODUCTS[ANIMALS[a].product].icon, 'icon big'),
        h(
          'div',
          { class: 'market-info' },
          h('b', {}, t(`animal.${a}`)),
          h('small', {}, unlocked ? t('market.have', { n: count, max }) : t('market.lockedAt', { level: unlockLevel })),
        ),
        h(
          'button',
          { class: 'btn small', disabled: !unlocked || count >= max || s.coins < offer.price, onclick: () => ctx.sim.buyAnimal(a) },
          t('market.buy', { price: offer.price }),
        ),
      ),
    );
  });
  const protections = (['crops', 'animals'] as ProtectionId[]).map((kind) => {
    const active = isProtected(s, kind);
    const cost = protectionCost(s, kind);
    return h(
      'div',
      { class: 'trade-row' },
      h(
        'div',
        { class: 'trade-head' },
        icon(kind === 'crops' ? 'icon_scarecrow' : 'icon_fence', 'icon big'),
        h('div', { class: 'market-info' }, h('b', {}, t(`protection.${kind}`)), h('small', {}, t(`protection.${kind}.desc`))),
        active
          ? h('span', { class: 'up-req' }, icon('icon_check', 'icon tiny'), t('protection.active'))
          : h('button', { class: 'btn small', disabled: s.coins < cost, onclick: () => ctx.sim.buyProtection(kind) }, t('market.buy', { price: cost })),
      ),
    );
  });
  return [
    h('h3', { class: 'market-section' }, t('market.materials')),
    h('p', { class: 'hint left' }, t('market.materialsHint')),
    ...materials,
    h('h3', { class: 'market-section' }, t('market.protection')),
    h('p', { class: 'hint left' }, t('market.protectionHint')),
    ...protections,
    h('h3', { class: 'market-section' }, t('market.livestock')),
    ...livestock,
  ];
}

/** Recordatorio de las cuentas al pie del mercado: lo que se cobrara y si llega lo que tienes. */
function ledgerLine(ctx: PanelCtx): HTMLElement {
  const f = seasonForecast(ctx.sim.state);
  const due = Math.max(0, f.total - f.income);
  return h(
    'button',
    { class: `ledger-line ${f.short > 0 ? 'warn' : ''}`, onclick: () => ctx.openLedger() },
    icon('icon_scroll', 'icon tiny'),
    f.grace ? t('market.ledgerGrace', { days: f.daysLeft }) : t('market.ledger', { days: f.daysLeft, n: due }),
    f.short > 0 && h('b', { class: 'nowrap' }, t('market.ledgerShort', { n: f.short })),
  );
}

export function marketView(ctx: PanelCtx, tab: MarketTab, openTab: (tab: MarketTab) => void): HTMLElement {
  const s = ctx.sim.state;
  return h(
    'div',
    { class: 'sheet market' },
    h('h2', {}, t('market.title')),
    h('p', { class: 'market-sub' }, t('market.subtitle')),
    boostActive(s) && h('p', { class: 'fair-banner' }, t('market.fair', { mult: s.marketBoost!.mult, day: dateFromDay(s.marketBoost!.untilDay).dayOfSeason })),
    h(
      'div',
      { class: 'tabs', role: 'tablist' },
      ...(['sell', 'buy', 'trade'] as MarketTab[]).map((id) =>
        h(
          'button',
          { class: `tab ${id === tab ? 'active' : ''}`, role: 'tab', 'aria-selected': String(id === tab), onclick: () => openTab(id) },
          h('span', {}, t(`market.tab.${id}`)),
        ),
      ),
    ),
    h('div', { class: 'market-body progress-body' }, ...(tab === 'sell' ? sellTab(ctx) : tab === 'buy' ? buyTab(ctx) : tradeTab(ctx))),
    ledgerLine(ctx),
    h(
      'div',
      { class: 'market-foot' },
      h('span', { class: 'chip' }, icon('icon_coin'), h('b', {}, String(s.coins))),
      h('button', { class: 'btn', onclick: () => ctx.close() }, t('market.close')),
    ),
  );
}
