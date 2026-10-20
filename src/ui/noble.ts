// Ventana del feudo: casa solariega, aldeas vasallas, mesnada y mecenazgo.
import { HAMLET_IDS, MATERIALS, NOBILITY, PATRONAGE_IDS, PRODUCTS, PROGRESSION, type ManorUpgradeDef, type PatronageDef } from '../sim/data';
import { hasMaterials } from '../sim/materials';
import {
  freeEscort,
  hamletLevel,
  hamletLoyalty,
  manorStage,
  maxSoldiers,
  nextHamletLevel,
  nextManorUpgrade,
  patronageProblem,
  soldierUpkeep,
} from '../sim/noble';
import type { ProductId } from '../sim/types';
import { t } from '../i18n/i18n';
import { artUrl, h, icon } from './dom';
import { buyMissingButton, materialChips, pct, tabs, type PanelCtx } from './panels';

export type ManorTab = 'house' | 'fief' | 'host' | 'patronage';

/** "+4 plazas de soldado · +30 prestigio" */
function manorFx(up: ManorUpgradeDef): string {
  const fx = up.effects;
  const parts: string[] = [];
  if (fx.soldiers) parts.push(t('noble.fx.soldiers', { n: fx.soldiers }));
  if (fx.titheMult) parts.push(t('noble.fx.titheMult', { pct: pct(1 - fx.titheMult) }));
  if (fx.churchRep) parts.push(t('noble.fx.churchRep', { n: fx.churchRep }));
  if (fx.prestigeSeason) parts.push(t('noble.fx.prestigeSeason', { n: fx.prestigeSeason }));
  parts.push(t('noble.fx.prestige', { n: up.prestige }));
  return parts.join(' · ');
}

function portrait(src: string, cls = ''): HTMLElement {
  return h('img', { class: `workshop-portrait ${cls}`, src: artUrl(src), alt: '' });
}

// ---------------------------------------------------------------- casa

function houseTab(ctx: PanelCtx): (HTMLElement | null)[] {
  const s = ctx.sim.state;
  const ups = NOBILITY.manor.upgrades;
  return [
    h('div', { class: 'manor-hero' }, portrait(`manor_${manorStage(s)}`, 'large')),
    h('p', { class: 'hint left' }, t('noble.houseIntro')),
    h(
      'div',
      { class: 'upgrade-list' },
      ...ups.map((up, i) => {
        const bought = i < s.noble.manor;
        const isNext = i === s.noble.manor;
        const action = bought
          ? h('span', { class: 'up-check', 'aria-label': t('panel.bought') }, icon('icon_check', 'icon tiny'))
          : isNext
            ? h(
                'div',
                { class: 'up-actions' },
                h(
                  'button',
                  { class: 'btn small primary', disabled: s.coins < up.cost || !hasMaterials(s, up.materials), onclick: () => ctx.sim.upgradeManor() },
                  t('noble.build', { cost: up.cost }),
                ),
                buyMissingButton(ctx, up.materials, () => ctx.sim.buyMaterialsFor(up.materials)),
              )
            : h('span', { class: 'up-req' }, h('span', { class: 'nowrap' }, icon('icon_coin', 'icon tiny'), String(up.cost)));
        return h(
          'div',
          { class: `upgrade-row state-${bought ? 'done' : isNext ? 'next' : 'later'}` },
          h(
            'div',
            { class: 'up-info' },
            h('b', {}, t(`manorUp.${up.id}`)),
            h('small', {}, t(`manorUp.${up.id}.desc`)),
            h('small', { class: 'up-fx' }, manorFx(up)),
            !bought && materialChips(ctx, up.materials, isNext),
          ),
          action,
        );
      }),
    ),
    nextManorUpgrade(s) ? null : h('p', { class: 'hint' }, t('noble.maxed')),
  ];
}

// ---------------------------------------------------------------- aldeas

function fiefTab(ctx: PanelCtx, focus: string | null): HTMLElement[] {
  const s = ctx.sim.state;
  return [
    h('p', { class: 'hint left' }, t('noble.fiefIntro'), ' ', h('b', {}, t('noble.loyalty', { pct: pct(hamletLoyalty(s)) }))),
    ...HAMLET_IDS.map((id) => {
      const def = NOBILITY.hamlets[id];
      const lvl = hamletLevel(s, id);
      const next = nextHamletLevel(s, id);
      const cur = lvl > 0 ? def.levels[lvl - 1] : null;
      const loyal = (coins: number) => Math.round(coins * hamletLoyalty(s));
      return h(
        'div',
        { class: `site-option hamlet ${focus === id ? 'focus' : ''}`, id: `hamlet-${id}` },
        portrait(`hamlet_${def.material}_${lvl}`),
        h(
          'div',
          { class: 'up-info' },
          h('b', {}, t(`hamlet.${id}`), ' ', h('span', { class: 'pill' }, lvl ? t('noble.hamlet.level', { n: lvl, max: def.levels.length }) : t('noble.hamlet.abandoned'))),
          h('small', {}, t(`hamlet.${id}.desc`)),
          cur && h('small', { class: 'up-fx' }, icon(MATERIALS[def.material].icon, 'icon tiny'), ' ', t('noble.hamlet.gives', { coins: loyal(cur.coins), amount: cur.amount, material: def.material })),
          next && h('small', {}, t('noble.hamlet.next', { coins: loyal(next.coins), amount: next.amount, material: def.material })),
          next && materialChips(ctx, next.materials),
        ),
        next
          ? h(
              'div',
              { class: 'up-actions' },
              h(
                'button',
                { class: 'btn small primary', disabled: s.coins < next.cost || !hasMaterials(s, next.materials), onclick: () => ctx.sim.upgradeHamlet(id) },
                t(lvl ? 'noble.hamlet.upgrade' : 'noble.hamlet.take', { cost: next.cost }),
              ),
              buyMissingButton(ctx, next.materials, () => ctx.sim.buyMaterialsFor(next.materials)),
            )
          : h('span', { class: 'up-check', 'aria-label': t('noble.hamlet.maxed') }, icon('icon_check', 'icon tiny')),
      );
    }),
  ];
}

// ---------------------------------------------------------------- mesnada

function hostTab(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  const def = NOBILITY.soldiers;
  const max = maxSoldiers(s);
  const room = s.noble.soldiers < max;
  return [
    h('p', { class: 'hint left' }, t('noble.hostIntro', { upkeep: def.upkeep, escort: def.escortMin })),
    h(
      'div',
      { class: 'site-option' },
      portrait('villager_soldier', 'soldier'),
      h(
        'div',
        { class: 'up-info' },
        h('b', {}, t('noble.soldiers', { n: s.noble.soldiers, max })),
        h('small', {}, t('noble.upkeep', { n: soldierUpkeep(s) })),
        h('small', { class: freeEscort(s) ? 'up-fx' : '' }, freeEscort(s) ? t('noble.escortFree') : t('noble.escortNeed', { n: def.escortMin })),
        h('small', {}, t('noble.hostUses')),
        room && materialChips(ctx, def.materials),
        !room && h('small', { class: 'req-missing' }, t('noble.noRoom')),
      ),
      h(
        'div',
        { class: 'up-actions' },
        h(
          'button',
          { class: 'btn small primary', disabled: !room || s.coins < def.hire || !hasMaterials(s, def.materials), onclick: () => ctx.sim.hireSoldier() },
          t('noble.hire', { cost: def.hire }),
        ),
        room && buyMissingButton(ctx, def.materials, () => ctx.sim.buyMaterialsFor(def.materials)),
        s.noble.soldiers > 0 && h('button', { class: 'btn small', onclick: () => ctx.sim.dismissSoldier() }, t('noble.dismiss')),
      ),
    ),
  ];
}

// ---------------------------------------------------------------- mecenazgo

function costChips(ctx: PanelCtx, def: PatronageDef): HTMLElement {
  const s = ctx.sim.state;
  return h(
    'span',
    { class: 'mat-chips' },
    ...Object.entries(def.cost).map(([k, n]) => {
      const have = k === 'coins' ? s.coins : s.inventory[k as ProductId];
      const ic = k === 'coins' ? 'icon_coin' : PRODUCTS[k as ProductId].icon;
      return h('span', { class: `mat-chip ${have < (n ?? 0) ? 'lack' : ''}`, title: t(k === 'coins' ? 'hud.coins' : `product.${k}`) }, icon(ic, 'icon tiny'), String(n));
    }),
    def.soldiers ? h('span', { class: `mat-chip ${s.noble.soldiers < def.soldiers ? 'lack' : ''}`, title: t('noble.tab.host') }, icon('icon_soldier', 'icon tiny'), String(def.soldiers)) : null,
  );
}

function patronageTab(ctx: PanelCtx): HTMLElement[] {
  const s = ctx.sim.state;
  return [
    h('p', { class: 'hint left' }, t('noble.patronageIntro')),
    ...PATRONAGE_IDS.map((id) => {
      const def = NOBILITY.patronage[id];
      const problem = patronageProblem(s, id);
      const done = problem === 'noble.patronage.done';
      return h(
        'div',
        { class: `upgrade-row state-${done ? 'done' : problem ? 'locked' : 'next'}` },
        h(
          'div',
          { class: 'up-info' },
          h('b', {}, icon(def.icon, 'icon tiny'), ' ', t(`patronage.${id}`)),
          h('small', {}, t(`patronage.${id}.desc`)),
          h('small', { class: 'up-fx' }, t('noble.patronage.gives', { prestige: def.prestige })),
          costChips(ctx, def),
        ),
        done
          ? h('span', { class: 'up-check', 'aria-label': t('noble.patronage.done') }, icon('icon_check', 'icon tiny'))
          : h(
              'div',
              { class: 'up-actions' },
              h('button', { class: 'btn small primary', disabled: !!problem, onclick: () => ctx.sim.doPatronage(id) }, t('noble.patronage.go')),
              problem && h('small', { class: 'req-missing' }, t(problem, { soldiers: def.soldiers ?? 0 })),
            ),
      );
    }),
  ];
}

export function manorView(ctx: PanelCtx, tab: ManorTab, focus: string | null, openTab: (tab: ManorTab) => void): HTMLElement {
  const s = ctx.sim.state;
  const body = tab === 'house' ? houseTab(ctx) : tab === 'fief' ? fiefTab(ctx, focus) : tab === 'host' ? hostTab(ctx) : patronageTab(ctx);
  return h(
    'div',
    { class: 'sheet building manor' },
    h('div', { class: 'event-seal' }, icon('icon_manor', 'event-icon')),
    h('h2', {}, t('noble.title')),
    h('p', { class: 'tagline' }, t('noble.sub')),
    h(
      'p',
      { class: 'panel-stats prestige-line' },
      icon('icon_prestige'),
      h('b', {}, `${t('noble.prestige')} ${s.noble.prestige}`),
      h('small', {}, t('noble.prestigeHint')),
    ),
    s.noble.manor > 0 && h('p', { class: 'panel-stats muted' }, t('panel.upkeep', { n: s.noble.manor * PROGRESSION.upkeep.perManorLevel })),
    tabs<ManorTab>(
      [
        { id: 'house', label: t('noble.tab.house'), icon: 'icon_manor' },
        { id: 'fief', label: t('noble.tab.fief'), icon: 'icon_house' },
        { id: 'host', label: t('noble.tab.host'), icon: 'icon_soldier' },
        { id: 'patronage', label: t('noble.tab.patronage'), icon: 'icon_prestige' },
      ],
      tab,
      openTab,
    ),
    h('div', { class: 'market-body progress-body' }, ...body),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}
