// Ventanas de los talleres: elegir que levantar en un solar y el panel de cada taller.
import { PRODUCTS, PRODUCT_IDS, WORKSHOPS, type WorkshopUpgradeDef } from '../sim/data';
import { hasMaterials } from '../sim/materials';
import {
  artisansOf,
  batchesPerDay,
  nextWorkshopUpgrade,
  workshopStatus,
  workshopUnlocked,
} from '../sim/workshops';
import type { ProductId, WorkshopId } from '../sim/types';
import { t } from '../i18n/i18n';
import { artUrl, h, icon } from './dom';
import { buyMissingButton, materialChips, type PanelCtx } from './panels';

/** Producto principal que sale del taller (para su icono). */
export function workshopProduct(id: WorkshopId): ProductId {
  const out = WORKSHOPS[id].recipe.out;
  return PRODUCT_IDS.find((p) => out[p])!;
}

/** "3 [trigo] -> 2 [harina]" con iconos. */
export function recipeLine(id: WorkshopId): HTMLElement {
  const { recipe } = WORKSHOPS[id];
  const side = (amounts: Partial<Record<ProductId, number>>) =>
    PRODUCT_IDS.filter((p) => amounts[p]).flatMap((p, i) => [
      i > 0 ? ' + ' : '',
      h('span', { class: 'nowrap', title: t(`product.${p}`) }, String(amounts[p]), ' ', icon(PRODUCTS[p].icon, 'icon tiny')),
    ]);
  return h('span', { class: 'recipe', 'aria-label': t('workshop.recipeLabel') }, ...side(recipe.in), ' → ', ...side(recipe.out));
}

function workshopPortrait(id: WorkshopId): HTMLElement {
  return h('img', { class: 'workshop-portrait', src: artUrl(id), alt: '' });
}

// ---------------------------------------------------------------- solar

export function siteView(ctx: PanelCtx, x: number, y: number, options: WorkshopId[]): HTMLElement {
  const s = ctx.sim.state;
  return h(
    'div',
    { class: 'sheet building' },
    h('h2', {}, t('site.title')),
    h('p', { class: 'tagline' }, t('site.text')),
    options.length === 0 && h('p', { class: 'hint' }, t('site.none')),
    ...options.map((id) => {
      const def = WORKSHOPS[id];
      const unlocked = workshopUnlocked(s, id);
      const canPay = s.coins >= def.cost && hasMaterials(s, def.materials);
      return h(
        'div',
        { class: `site-option ${unlocked ? '' : 'locked'}` },
        workshopPortrait(id),
        h(
          'div',
          { class: 'up-info' },
          h('b', {}, t(`workshop.${id}`)),
          h('small', {}, t(`workshop.${id}.desc`)),
          recipeLine(id),
          materialChips(ctx, def.materials, unlocked),
        ),
        unlocked
          ? h(
              'div',
              { class: 'up-actions' },
              h('button', { class: 'btn small primary', disabled: !canPay, onclick: () => ctx.sim.buildWorkshop(id, x, y) }, t('site.build', { cost: def.cost })),
              buyMissingButton(ctx, def.materials, () => ctx.sim.buyMissingForWorkshop(id)),
            )
          : h('span', { class: 'up-req' }, h('span', { class: 'req-missing' }, t('panel.lockedAt', { level: def.unlockLevel }))),
      );
    }),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}

// ---------------------------------------------------------------- taller

/** Fila de una mejora de taller. `interactive` permite comprar la siguiente. */
function upgradeRow(ctx: PanelCtx, id: WorkshopId, up: WorkshopUpgradeDef, index: number, interactive: boolean): HTMLElement {
  const s = ctx.sim.state;
  const level = s.workshops[id]?.level ?? -1;
  const bought = index < level;
  const isNext = index === level;
  const titleOk = !up.title || s.titles.includes(up.title);
  const levelOk = s.level >= up.level && titleOk;
  const state = bought ? 'done' : isNext ? (levelOk ? 'next' : 'locked') : 'later';
  let action: HTMLElement;
  if (bought) action = h('span', { class: 'up-check', 'aria-label': t('panel.bought') }, '✓');
  else if (isNext && interactive && levelOk)
    action = h(
      'div',
      { class: 'up-actions' },
      h(
        'button',
        { class: 'btn small primary', disabled: s.coins < up.cost || !hasMaterials(s, up.materials), onclick: () => ctx.sim.upgradeWorkshop(id) },
        t('panel.buy', { cost: up.cost }),
      ),
      buyMissingButton(ctx, up.materials, () => ctx.sim.buyMissingForWorkshop(id)),
    );
  else
    action = h(
      'span',
      { class: 'up-req' },
      h('span', { class: s.level >= up.level ? '' : 'req-missing' }, t('panel.lockedAt', { level: up.level })),
      up.title && h('span', { class: titleOk ? '' : 'req-missing' }, t('rank.' + up.title)),
      h('span', { class: 'nowrap' }, icon('icon_coin', 'icon tiny'), String(up.cost)),
    );
  return h(
    'div',
    { class: `upgrade-row state-${state}` },
    h(
      'div',
      { class: 'up-info' },
      h('b', {}, t(`wsUpgrade.${id}.${up.id}`)),
      h('small', {}, t('workshop.batchesPlus', { n: up.batches })),
      !bought && materialChips(ctx, up.materials, isNext),
    ),
    action,
  );
}

export function workshopView(ctx: PanelCtx, id: WorkshopId): HTMLElement {
  const s = ctx.sim.state;
  const w = s.workshops[id];
  if (!w) return h('div', { class: 'sheet' }, h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')));
  const status = workshopStatus(s, id);
  const artisans = artisansOf(s, id);
  const others = s.villagers.filter((v) => !artisans.includes(v));
  return h(
    'div',
    { class: 'sheet building' },
    h('div', { class: 'event-seal' }, icon(PRODUCTS[workshopProduct(id)].icon, 'event-icon')),
    h('h2', {}, t(`workshop.${id}`)),
    h('p', { class: 'tagline' }, t(`workshop.${id}.desc`)),
    h('p', { class: 'panel-stats' }, recipeLine(id)),
    h('p', { class: 'panel-stats' }, t('workshop.stats', { batches: batchesPerDay(s, id), made: w.made })),
    h('p', { class: `ws-status ws-${status}` }, t(`workshop.status.${status}`)),
    h('h3', { class: 'market-section' }, t('workshop.artisan')),
    artisans.length
      ? h(
          'div',
          { class: 'artisan-line' },
          h('img', { class: 'villager-portrait small', src: artUrl('villager_artisan'), alt: '' }),
          h('b', {}, artisans.map((a) => a.name).join(', ')),
        )
      : h('p', { class: 'hint left' }, t('workshop.noArtisan')),
    others.length > 0 &&
      h(
        'div',
        { class: 'crop-buttons', role: 'group', 'aria-label': t('workshop.assign') },
        ...others.map((v) =>
          h(
            'button',
            { class: 'job-btn', onclick: () => ctx.sim.assignArtisan(v.id, id) },
            h('img', { src: artUrl(`villager_${v.job}`), alt: '' }),
            t('workshop.put', { name: v.name }),
          ),
        ),
      ),
    s.villagers.length === 0 && h('button', { class: 'btn small', onclick: () => ctx.openBuilding('house', 'villagers') }, t('workshop.hire')),
    h('h3', { class: 'market-section' }, t('panel.tab.upgrades')),
    h('div', { class: 'upgrade-list' }, ...WORKSHOPS[id].upgrades.map((up, i) => upgradeRow(ctx, id, up, i, true))),
    !nextWorkshopUpgrade(s, id) && h('p', { class: 'hint' }, t('panel.maxed')),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}

/** Seccion de un taller en la pestana Edificios del progreso. */
export function workshopTreeSection(ctx: PanelCtx, id: WorkshopId): HTMLElement {
  const s = ctx.sim.state;
  const def = WORKSHOPS[id];
  const built = !!s.workshops[id];
  return h(
    'section',
    { class: `tree-building ${built || workshopUnlocked(s, id) ? '' : 'locked'}` },
    h(
      'div',
      { class: 'tree-building-head' },
      icon(PRODUCTS[workshopProduct(id)].icon, 'icon big'),
      h(
        'div',
        { class: 'market-info' },
        h('b', {}, t(`workshop.${id}`)),
        h('small', {}, built ? t('workshop.stats', { batches: batchesPerDay(s, id), made: s.workshops[id]!.made }) : t('workshop.notBuilt', { level: def.unlockLevel, cost: def.cost })),
      ),
      built && h('button', { class: 'btn small', onclick: () => ctx.openWorkshop(id) }, t('progress.open')),
    ),
    h('p', { class: 'panel-stats' }, recipeLine(id)),
    !built && materialChips(ctx, def.materials, false),
    ...def.upgrades.map((up, i) => upgradeRow(ctx, id, up, i, false)),
  );
}
