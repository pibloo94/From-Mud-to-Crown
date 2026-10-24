// Ventanas de la fase 2: edificios y aldeanos, arbol de progreso, cuentas de la estacion y rango.
// Solo leen el estado y llaman a la fachada `Game`; todo texto sale de las traducciones.
import type { Game } from '../sim/game';
import {
  ANIMALS,
  ANIMAL_IDS,
  BUILDINGS,
  BUILDING_IDS,
  CROPS,
  CROP_IDS,
  JOB_IDS,
  HAMLET_IDS,
  MATERIALS,
  MATERIAL_IDS,
  MAX_LEVEL,
  NOBILITY,
  PATHS,
  PRODUCTS,
  PRODUCT_IDS,
  PROGRESSION,
  TRADE,
  VILLAGERS,
  WORKSHOPS,
  WORKSHOP_IDS,
  type BuildingStats,
  type Feature,
  type MaterialAmounts,
  type RankDef,
  type UpgradeDef,
} from '../sim/data';
import { hasMaterials, materialsList, materialsPrice, missingMaterials } from '../sim/materials';
import { eatingOrder, reserved, reserveTotal } from '../sim/pantry';
import { cropUnlocked, hasFeature } from '../sim/progress';
import { plantableCrops } from '../sim/rules';
import { builtWorkshops } from '../sim/workshops';
import { workshopProduct, workshopTreeSection } from './workshops';
import { buildingStat, nextUpgrade, storageCapacity, storageUsed } from '../sim/buildings';
import { beds, dailyFood, efficiency, farmerPlots, foodDays, freeBeds, hireCost, toolCost, toolMaterials } from '../sim/villagers';
import { activeModifiers } from '../sim/modifiers';
import { ESTATE_IDS, rivalsOf, tierEffects, tierOf } from '../sim/estates';
import { buildingUpkeep, upkeepBill } from '../sim/upkeep';
import { branchCount, branchRanks, hamletLevelSum, hamletsTaken, hasRank, levelDef, levelOnlyRank, mainRanks, pathOk, rankDef, unlocksAt, workshopCount } from '../sim/progress';
import { rankFxText } from './character';
import { charterReady, liegeBefore, liegeOf } from '../sim/noble';
import { animalCapacity, animalsIn, buildingOf } from '../sim/rules';
import type { BuildingId, CropId, EstateId, GameState, JobId, Modifier, RankId, Villager, WorkshopId } from '../sim/types';
import { t } from '../i18n/i18n';
import { artUrl, h, icon } from './dom';

export type BuildingTab = 'upgrades' | 'villagers' | 'pantry';
export type ProgressTab = 'levels' | 'buildings' | 'tools' | 'ranks';

export interface PanelCtx {
  sim: Game;
  close: () => void;
  rerender: () => void;
  openBuilding: (b: BuildingId, tab?: BuildingTab) => void;
  openProgress: (tab?: ProgressTab) => void;
  openMarket: (tab?: 'sell' | 'buy') => void;
  openWorkshop: (id: WorkshopId) => void;
  openLedger: () => void;
  openMonument: (id: string) => void;
  openBook: (tab?: 'money' | 'estates' | 'farm' | 'achievements') => void;
}

export const BUILDING_ICON: Record<BuildingId, string> = {
  house: 'icon_house',
  granary: 'icon_granary',
  coop: 'icon_egg',
  pen: 'icon_milk',
};

export const pct = (v: number) => Math.round(v * 100);

/** Texto de lo que aporta una mejora: "+1 camas · −10 % de comida". */
export function statsLine(fx: BuildingStats): string {
  const parts: string[] = [];
  if (fx.beds) parts.push(t('stat.beds', { n: fx.beds }));
  if (fx.foodSaving) parts.push(t('stat.foodSaving', { n: pct(fx.foodSaving) }));
  if (fx.capacity) parts.push(t('stat.capacity', { n: fx.capacity }));
  if (fx.maxAnimals) parts.push(t('stat.maxAnimals', { n: fx.maxAnimals }));
  if (fx.maxSheep) parts.push(t('stat.maxSheep', { n: fx.maxSheep }));
  if (fx.animalBonus) parts.push(t('stat.animalBonus', { n: pct(fx.animalBonus) }));
  return parts.join(' · ');
}

export function tabs<T extends string>(items: { id: T; label: string; icon?: string }[], current: T, onPick: (id: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ...items.map((it) =>
      h(
        'button',
        {
          class: `tab ${it.id === current ? 'active' : ''}`,
          role: 'tab',
          'aria-selected': String(it.id === current),
          onclick: () => onPick(it.id),
        },
        it.icon ? icon(it.icon) : null,
        h('span', {}, it.label),
      ),
    ),
  );
}

// ---------------------------------------------------------------- edificios

export function buildingStatsText(sim: Game, b: BuildingId): string {
  const s = sim.state;
  switch (b) {
    case 'house':
      return t('panel.house.stats', { beds: beds(s), n: s.villagers.length, saving: pct(Math.min(0.8, buildingStat(s, 'house', 'foodSaving'))) });
    case 'granary':
      return t('panel.granary.stats', { used: storageUsed(s), cap: storageCapacity(s) });
    default: {
      // El primer animal del edificio da la linea principal; el resto (las ovejas del corral), la suya si ya se pueden tener.
      const [first, ...others] = animalsIn(b);
      const main = t(`panel.${b}.stats`, { n: s.herds[first].count, max: animalCapacity(s, first), bonus: pct(buildingStat(s, b, 'animalBonus')) });
      const extra = others
        .filter((a) => s.herds[a].count > 0 || hasFeature(s, PROGRESSION.animalsForSale[a].unlock))
        .map((a) => t(`panel.${b}.${a}`, { n: s.herds[a].count, max: animalCapacity(s, a) }));
      return [main, ...extra].join(' · ');
    }
  }
}

/** Materiales que pide una obra: en rojo los que faltan. */
export function materialChips(ctx: PanelCtx, need: MaterialAmounts = {}, check = true): HTMLElement | null {
  const ids = MATERIAL_IDS.filter((m) => need[m]);
  if (ids.length === 0) return null;
  const s = ctx.sim.state;
  return h(
    'span',
    { class: 'mat-chips' },
    ...ids.map((m) =>
      h(
        'span',
        { class: `mat-chip ${check && s.materials[m] < need[m]! ? 'lack' : ''}`, title: t(`material.${m}`) },
        icon(MATERIALS[m].icon, 'icon tiny'),
        check ? `${Math.min(s.materials[m], need[m]!)}/${need[m]}` : String(need[m]),
      ),
    ),
  );
}

/** Boton para comprar de una vez lo que falta (o nada si no falta). */
export function buyMissingButton(ctx: PanelCtx, need: MaterialAmounts | undefined, onBuy: () => void): HTMLElement | null {
  const missing = missingMaterials(ctx.sim.state, need);
  if (Object.keys(missing).length === 0) return null;
  const cost = materialsPrice(ctx.sim.state, missing);
  return h('button', { class: 'btn small', disabled: ctx.sim.state.coins < cost, onclick: onBuy }, t('panel.buyMissing', { cost }));
}

/** Fila de una mejora. `interactive` permite comprar la siguiente. */
function upgradeRow(ctx: PanelCtx, b: BuildingId, up: UpgradeDef, index: number, interactive: boolean): HTMLElement {
  const s = ctx.sim.state;
  const bought = index < s.buildings[b];
  const isNext = index === s.buildings[b];
  const levelOk = s.level >= up.level;
  const state = bought ? 'done' : isNext ? (levelOk ? 'next' : 'locked') : 'later';
  let action: HTMLElement;
  if (bought) action = h('span', { class: 'up-check', 'aria-label': t('panel.bought') }, icon('icon_check', 'icon tiny'));
  else if (isNext && interactive && levelOk)
    action = h(
      'div',
      { class: 'up-actions' },
      h(
        'button',
        { class: 'btn small primary', disabled: s.coins < up.cost || !hasMaterials(s, up.materials), onclick: () => ctx.sim.upgradeBuilding(b) },
        t('panel.buy', { cost: up.cost }),
      ),
      buyMissingButton(ctx, up.materials, () => ctx.sim.buyMissingFor(b)),
    );
  else
    action = h(
      'span',
      { class: 'up-req' },
      h('span', { class: levelOk ? '' : 'req-missing' }, t('panel.lockedAt', { level: up.level })),
      h('span', { class: 'nowrap' }, icon('icon_coin', 'icon tiny'), String(up.cost)),
    );
  return h(
    'div',
    { class: `upgrade-row state-${state}` },
    h('div', { class: 'up-info' }, h('b', {}, t(`upgrade.${b}.${up.id}`)), h('small', {}, statsLine(up.effects)), !bought && materialChips(ctx, up.materials, isNext)),
    action,
  );
}

export function buildingView(ctx: PanelCtx, b: BuildingId, tab: BuildingTab): HTMLElement {
  const s = ctx.sim.state;
  const def = BUILDINGS[b];
  const head = [
    h('div', { class: 'event-seal' }, icon(BUILDING_ICON[b], 'event-icon')),
    h('h2', {}, t(`building.${b}`)),
    h('p', { class: 'tagline' }, t(`building.${b}.desc`)),
    h('p', { class: 'panel-stats' }, buildingStatsText(ctx.sim, b)),
    buildingUpkeep(s, b) > 0 && h('p', { class: 'panel-stats muted' }, t('panel.upkeep', { n: buildingUpkeep(s, b) })),
  ];
  const extra: (HTMLElement | null)[] = [];
  if (b === 'coop' || b === 'pen') {
    const ready = animalsIn(b).filter((a) => s.herds[a].stored >= 1);
    extra.push(
      h(
        'div',
        { class: 'panel-actions' },
        ready.length > 0 &&
          h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => {
                const tile = s.map.tiles.find((tl) => tl.kind === def.tile)!;
                ctx.sim.interact(tile.x, tile.y);
              },
            },
            ...ready.map((a) => icon(PRODUCTS[ANIMALS[a].product].icon)),
            t('panel.collect', { n: ready.reduce((n, a) => n + Math.floor(s.herds[a].stored), 0) }),
          ),
        h('button', { class: 'btn small', onclick: () => ctx.openMarket() }, t('panel.buyAnimals')),
      ),
    );
  }
  if (b === 'granary')
    extra.push(
      h(
        'p',
        { class: 'panel-stats store-line' },
        t('panel.store'),
        ...MATERIAL_IDS.flatMap((m) => [' ', h('span', { class: 'nowrap' }, icon(MATERIALS[m].icon, 'icon tiny'), `${s.materials[m]}`)]),
      ),
    );
  let content: HTMLElement;
  if (b === 'house' && tab === 'villagers') content = villagersList(ctx);
  else if (b === 'granary' && tab === 'pantry') content = pantryView(ctx);
  else {
    content = h(
      'div',
      { class: 'upgrade-list' },
      ...def.upgrades.map((up, i) => upgradeRow(ctx, b, up, i, true)),
      !nextUpgrade(s, b) && h('p', { class: 'hint' }, t('panel.maxed')),
    );
  }
  return h(
    'div',
    { class: 'sheet building' },
    ...head,
    ...extra,
    b === 'house' &&
      tabs<BuildingTab>(
        [
          { id: 'upgrades', label: t('panel.tab.upgrades'), icon: 'icon_hammer' },
          { id: 'villagers', label: `${t('panel.tab.villagers')} (${s.villagers.length})`, icon: 'icon_worker' },
        ],
        tab,
        (id) => ctx.openBuilding('house', id),
      ),
    b === 'granary' &&
      tabs<BuildingTab>(
        [
          { id: 'upgrades', label: t('panel.tab.upgrades'), icon: 'icon_hammer' },
          { id: 'pantry', label: t('panel.tab.pantry'), icon: 'icon_wheat' },
        ],
        tab,
        (id) => ctx.openBuilding('granary', id),
      ),
    content,
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}

// ---------------------------------------------------------------- aldeanos

/** Aldeano cuyo boton de despedir espera la confirmacion (segundo toque). */
let confirmDismiss: number | null = null;

function jobDesc(job: JobId): string {
  const j = VILLAGERS.jobs;
  if (job === 'farmer') return t('job.farmer.desc', { n: pct(j.farmer.growthBonus) });
  if (job === 'herder') return t('job.herder.desc', { n: pct(j.herder.animalBonus) });
  if (job === 'artisan') return t('job.artisan.desc');
  return t('job.carter.desc', { days: j.carter.sellEvery, rate: pct(j.carter.priceRate) });
}

function villagerCard(ctx: PanelCtx, v: Villager): HTMLElement {
  const s = ctx.sim.state;
  const next = v.tool + 1;
  const tier = VILLAGERS.tools.tiers[next - 1];
  let toolBtn: HTMLElement;
  if (!tier) toolBtn = h('span', { class: 'tool-max' }, t('villagers.toolMax'));
  else if (s.level < tier.level)
    toolBtn = h('button', { class: 'btn small', disabled: true }, t('villagers.toolLocked', { tool: `${v.job}.${next}`, level: tier.level }));
  else {
    const cost = toolCost(s, next);
    const mats = toolMaterials(next);
    toolBtn = h(
      'div',
      { class: 'tool-actions' },
      h(
        'button',
        { class: 'btn small primary', disabled: s.coins < cost || !hasMaterials(s, mats), onclick: () => ctx.sim.upgradeTool(v.id) },
        icon('icon_hammer'),
        t('villagers.upgradeTool', { tool: `${v.job}.${next}`, cost }),
        materialChips(ctx, mats),
      ),
      buyMissingButton(ctx, mats, () => ctx.sim.buyMissingForTool(v.id)),
    );
  }
  const confirming = confirmDismiss === v.id;
  return h(
    'div',
    { class: `villager ${v.hungry > 0 ? 'hungry' : ''}` },
    h(
      'div',
      { class: 'villager-head' },
      h('img', { class: 'villager-portrait', src: artUrl(`villager_${v.job}`), alt: '' }),
      h(
        'div',
        { class: 'villager-name' },
        h('b', {}, v.name),
        h('small', {}, v.tool > 0 ? `${t(`tool.${v.job}.${v.tool}`)} · ${t('tools.efficiency', { n: efficiency(v) })}` : t('villagers.toolNone')),
      ),
      v.hungry > 0 && h('span', { class: 'pill warn' }, t('villagers.hungry')),
      h(
        'button',
        {
          class: `icon-btn ${confirming ? 'confirm' : ''}`,
          title: t('villagers.dismiss', { name: v.name }),
          'aria-label': t('villagers.dismiss', { name: v.name }),
          onclick: () => {
            if (confirming) {
              confirmDismiss = null;
              ctx.sim.dismissVillager(v.id);
            } else {
              confirmDismiss = v.id;
              ctx.rerender();
            }
          },
        },
        confirming ? t('villagers.dismissConfirm') : '✕',
      ),
    ),
    h(
      'div',
      { class: 'job-buttons', role: 'group' },
      ...JOB_IDS.map((job) =>
        h(
          'button',
          {
            class: `job-btn ${v.job === job ? 'active' : ''}`,
            'aria-pressed': String(v.job === job),
            onclick: () => v.job !== job && ctx.sim.setJob(v.id, job),
          },
          h('img', { src: artUrl(`villager_${job}`), alt: '' }),
          t(`job.${job}.title`),
        ),
      ),
    ),
    h('small', { class: 'job-desc' }, jobDesc(v.job)),
    v.job === 'farmer' && farmerCropPicker(ctx, v),
    v.job === 'artisan' && artisanWorkshopPicker(ctx, v),
    h('div', { class: 'tool-row' }, toolBtn),
  );
}

/** En que taller trabaja el artesano. */
function artisanWorkshopPicker(ctx: PanelCtx, v: Villager): HTMLElement {
  const built = builtWorkshops(ctx.sim.state);
  if (built.length === 0) return h('small', { class: 'job-desc warn-text' }, t('artisan.noWorkshops'));
  return h(
    'div',
    { class: 'crop-buttons', role: 'group', 'aria-label': t('artisan.where') },
    ...built.map((id) =>
      h(
        'button',
        { class: `job-btn ${v.workshop === id ? 'active' : ''}`, 'aria-pressed': String(v.workshop === id), onclick: () => v.workshop !== id && ctx.sim.assignArtisan(v.id, id) },
        icon(PRODUCTS[workshopProduct(id)].icon, 'icon tiny'),
        t(`workshop.${id}`),
      ),
    ),
  );
}

/** Que siembra el labrador en sus parcelas. */
function farmerCropPicker(ctx: PanelCtx, v: Villager): HTMLElement {
  const s = ctx.sim.state;
  const plots = farmerPlots(s).get(v.id) ?? [];
  const choices: (CropId | 'auto' | null)[] = ['auto', ...CROP_IDS.filter((c) => cropUnlocked(s, c)), null];
  const waiting = typeof v.crop === 'string' && v.crop !== 'auto' && !plantableCrops(s).includes(v.crop);
  return h(
    'div',
    { class: 'farm-orders' },
    h('small', { class: 'job-desc' }, plots.length ? t('farmer.plots', { n: plots.length }) : t('farmer.noPlots')),
    h(
      'div',
      { class: 'crop-buttons', role: 'group', 'aria-label': t('farmer.sow') },
      ...choices.map((c) =>
        h(
          'button',
          {
            class: `job-btn ${v.crop === c ? 'active' : ''}`,
            'aria-pressed': String(v.crop === c),
            onclick: () => v.crop !== c && ctx.sim.setFarmerCrop(v.id, c),
          },
          c && c !== 'auto' ? icon(PRODUCTS[CROPS[c].product].icon, 'icon tiny') : null,
          t(`farmerCrop.${c ?? 'none'}`),
        ),
      ),
    ),
    waiting && h('small', { class: 'job-desc warn-text' }, t('farmer.outOfSeason', { crop: v.crop as string })),
  );
}

// ---------------------------------------------------------------- despensa

function pantryView(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const res = reserved(s);
  const order = eatingOrder(s);
  const perDay = Math.round(dailyFood(s) * 10) / 10;
  const days = foodDays(s);
  return h(
    'div',
    { class: 'pantry' },
    h('p', { class: 'hint left' }, t('pantry.intro')),
    h(
      'p',
      { class: 'panel-stats' },
      s.villagers.length
        ? t('pantry.needs', { perDay, days: Number.isFinite(days) ? days : '∞' })
        : t('pantry.noVillagers'),
    ),
    ...PRODUCT_IDS.map((p) => {
      const eat = s.pantry.eat[p];
      const rank = order.indexOf(p);
      return h(
        'div',
        { class: 'upgrade-row pantry-row' },
        icon(PRODUCTS[p].icon, 'icon'),
        h(
          'div',
          { class: 'up-info' },
          h('b', {}, t(`product.${p}`)),
          h('small', {}, t('market.stock', { n: s.inventory[p] }), eat && res[p] > 0 ? ` · ${t('market.reserved', { n: res[p] })}` : '', eat && rank >= 0 ? ` · ${t('pantry.order', { n: rank + 1 })}` : ''),
        ),
        h(
          'button',
          { class: `job-btn toggle ${eat ? 'active' : ''}`, 'aria-pressed': String(eat), onclick: () => ctx.sim.setEdible(p, !eat) },
          t(eat ? 'pantry.eat' : 'pantry.keep'),
        ),
      );
    }),
    h('h3', { class: 'market-section' }, t('pantry.reserve')),
    h('p', { class: 'hint left' }, t('pantry.reserveHint')),
    h(
      'div',
      { class: 'crop-buttons', role: 'group' },
      ...VILLAGERS.pantry.reserveOptions.map((d) =>
        h(
          'button',
          { class: `job-btn ${s.pantry.reserveDays === d ? 'active' : ''}`, 'aria-pressed': String(s.pantry.reserveDays === d), onclick: () => ctx.sim.setReserveDays(d) },
          d === 0 ? t('pantry.noReserve') : t('pantry.days', { n: d }),
        ),
      ),
    ),
    h('p', { class: 'panel-stats' }, t('pantry.reserveTotal', { n: reserveTotal(s) })),
  );
}

function villagersList(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const cost = hireCost(s);
  const days = foodDays(s);
  return h(
    'div',
    { class: 'villager-list' },
    h('p', { class: 'panel-stats' }, t('villagers.beds', { n: s.villagers.length, beds: beds(s) })),
    s.villagers.length > 0 && h('p', { class: 'panel-stats muted' }, t('villagers.wages', { n: upkeepBill(s).wages })),
    s.villagers.length > 0 &&
      h(
        'p',
        { class: `panel-stats ${days < 3 ? 'warn-text' : ''}` },
        t('villagers.food', { days: Number.isFinite(days) ? days : '∞', perDay: Math.round(dailyFood(s) * 10) / 10 }),
      ),
    s.villagers.length === 0 && h('p', { class: 'hint' }, t('villagers.empty')),
    ...s.villagers.map((v) => villagerCard(ctx, v)),
    h(
      'button',
      { class: 'btn primary', disabled: freeBeds(s) <= 0 || s.coins < cost, onclick: () => ctx.sim.hireVillager() },
      t('villagers.hire', { cost }),
      freeBeds(s) <= 0 && h('small', {}, t('villagers.noBed')),
    ),
  );
}

// ---------------------------------------------------------------- arbol de progreso

interface TreeItem {
  icon: string;
  text: string;
  where?: string;
}

/** Texto de lo que abre un nivel (el renombre lleva sus cifras de los datos). */
export function featureText(f: Feature): string {
  return f === 'renown' ? t('levelup.unlock.renown', { xp: PROGRESSION.renown.xpPerPoint, prestige: PROGRESSION.renown.prestigePerPoint }) : t(`levelup.unlock.${f}`);
}

function levelItems(level: number): TreeItem[] {
  const u = unlocksAt(level);
  const items: TreeItem[] = [];
  if (level === 1) items.push({ icon: 'icon_wheat', text: t('progress.start') });
  if (u.rank) items.push({ icon: 'icon_crown', text: t('levelup.rank', { rank: u.rank }) });
  for (const c of u.crops) items.push({ icon: PRODUCTS[CROPS[c].product].icon, text: t('levelup.unlock.crop', { name: t(`product.${CROPS[c].product}`) }), where: t('progress.where.plant') });
  for (const f of u.features) {
    const where = f === 'buyLand' ? 'field' : f === 'renown' ? 'season' : 'market';
    // Comprar un animal: el icono de lo que da (gallina → huevo, vaca → leche, oveja → lana).
    const animal = ANIMAL_IDS.find((a) => PROGRESSION.animalsForSale[a].unlock === f);
    const ic = animal ? PRODUCTS[ANIMALS[animal].product].icon : f === 'buyLand' ? 'icon_wheat' : f === 'renown' ? 'icon_prestige' : 'icon_coin';
    items.push({ icon: ic, text: featureText(f), where: t(`progress.where.${where}`) });
  }
  if (u.maxPlots) items.push({ icon: 'icon_wheat', text: t('levelup.maxPlots', { max: u.maxPlots }), where: t('progress.where.field') });
  const withMats = (where: string, mats?: MaterialAmounts) => {
    const list = materialsList(mats ?? {});
    return list ? `${where} · ${t('progress.needs', { list })}` : where;
  };
  for (const up of u.upgrades) {
    const def = BUILDINGS[up.building].upgrades.find((x) => x.id === up.id);
    items.push({
      icon: BUILDING_ICON[up.building],
      text: t('progress.unlock.upgrade', { building: up.building, upgrade: up.id, cost: up.cost }),
      where: withMats(t(`progress.where.${up.building}`), def?.materials),
    });
  }
  for (const tl of u.tools)
    items.push({ icon: 'icon_hammer', text: t('progress.unlock.tool', { tier: t(`tool.tier.${tl.tier}`), cost: tl.cost }), where: withMats(t('progress.where.tools'), toolMaterials(tl.tier)) });
  for (const w of u.workshops)
    items.push({ icon: PRODUCTS[workshopProduct(w.id)].icon, text: t('progress.unlock.workshop', { workshop: w.id, cost: w.cost }), where: withMats(t('progress.where.site'), WORKSHOPS[w.id].materials) });
  for (const up of u.workshopUpgrades) {
    const def = WORKSHOPS[up.workshop].upgrades.find((x) => x.id === up.id)!;
    const where = withMats(t('progress.where.workshop', { workshop: up.workshop }), def.materials);
    items.push({ icon: 'icon_hammer', text: t('progress.unlock.wsUpgrade', { workshop: up.workshop, wsUpgrade: `${up.workshop}.${up.id}`, cost: up.cost }), where: def.title ? `${where} · ${t('progress.needsTitle', { rank: def.title })}` : where });
  }
  if (u.carts) items.push({ icon: 'icon_cart', text: t(level === TRADE.unlockLevel ? 'progress.unlock.trade' : 'progress.unlock.cart'), where: t('progress.where.trade') });
  for (const town of u.towns) items.push({ icon: 'icon_cart', text: t('progress.unlock.town', { town }), where: t('progress.where.trade') });
  if (u.stall) items.push({ icon: 'icon_coin', text: t('progress.unlock.stall', { cost: TRADE.stall.cost }), where: withMats(t('progress.where.trade'), TRADE.stall.materials) });
  for (const m of MATERIAL_IDS.filter((x) => (MATERIALS[x].unlockLevel ?? 1) === level && level > 1))
    items.push({ icon: MATERIALS[m].icon, text: t('progress.unlock.material', { material: m }), where: t('progress.where.market') });
  // Rangos que piden algo mas que nivel: aparecen en su nivel minimo con la condicion.
  for (const r of PROGRESSION.ranks.filter((rk) => rk.level === level && !levelOnlyRank(rk)))
    items.push({ icon: 'icon_crown', text: t('levelup.rank', { rank: r.id }), where: rankReqText(r.id) });
  if (level === rankDef('lord').level) items.push({ icon: 'icon_charter', text: t('progress.unlock.charter'), where: t('progress.where.charter') });
  return items;
}

function rankReqText(id: RankId): string {
  const r = PROGRESSION.ranks.find((x) => x.id === id)!;
  const parts = [t('progress.req.level', { n: r.level })];
  if (r.days) parts.push(t('progress.req.daysShort', { n: r.days }));
  for (const e of ESTATE_IDS) if (r[e]) parts.push(t('progress.req.estateShort', { estate: e, n: r[e]! }));
  if (r.branches) parts.push(t('progress.req.branchesShort'));
  if (r.workshops) parts.push(t('progress.req.workshopsShort', { n: r.workshops }));
  if (r.trades) parts.push(t('progress.req.tradesShort', { n: r.trades }));
  if (r.stall) parts.push(t('progress.req.stall'));
  if (r.charter) parts.push(t('progress.req.charter', { cost: NOBILITY.charter.cost }));
  if (r.manor) parts.push(t('progress.req.manorShort', { n: r.manor }));
  if (r.hamlets) parts.push(t('progress.req.hamletsShort', { n: r.hamlets }));
  if (r.hamletLevels) parts.push(t('progress.req.hamletsShort', { n: HAMLET_IDS.length }));
  if (r.soldiers) parts.push(t('progress.req.soldiersShort', { n: r.soldiers }));
  if (r.prestige) parts.push(t('progress.req.prestigeShort', { n: r.prestige }));
  return parts.join(' · ');
}

function levelsTab(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const cards: HTMLElement[] = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const items = levelItems(level);
    const state = level < s.level ? 'done' : level === s.level ? 'current' : 'future';
    cards.push(
      h(
        'section',
        { class: `tree-level tree-${state}`, 'data-level': level },
        h(
          'div',
          { class: 'tree-seal' },
          h('span', {}, String(level)),
        ),
        h(
          'div',
          { class: 'tree-body' },
          h(
            'div',
            { class: 'tree-head' },
            h('b', {}, t('hud.level', { n: level })),
            h('small', {}, t('progress.xp', { xp: levelDef(level).xp })),
            state === 'current' && h('span', { class: 'pill' }, t('progress.here')),
          ),
          h(
            'ul',
            { class: 'tree-items' },
            ...items.map((it) => h('li', {}, icon(it.icon), h('span', {}, it.text, it.where && h('small', {}, it.where)))),
          ),
        ),
      ),
    );
  }
  return h('div', { class: 'tree' }, ...cards);
}

function buildingsTab(ctx: PanelCtx): HTMLElement {
  return h(
    'div',
    { class: 'tree-buildings' },
    ...BUILDING_IDS.map((b) =>
      h(
        'section',
        { class: 'tree-building' },
        h(
          'div',
          { class: 'tree-building-head' },
          icon(BUILDING_ICON[b], 'icon big'),
          h('div', { class: 'market-info' }, h('b', {}, t(`building.${b}`)), h('small', {}, buildingStatsText(ctx.sim, b))),
          h('button', { class: 'btn small', onclick: () => ctx.openBuilding(b) }, t('progress.open')),
        ),
        ...BUILDINGS[b].upgrades.map((up, i) => upgradeRow(ctx, b, up, i, false)),
      ),
    ),
    h('h3', { class: 'market-section' }, t('progress.workshops')),
    h('p', { class: 'hint left' }, t('progress.workshopsHint')),
    ...WORKSHOP_IDS.map((id) => workshopTreeSection(ctx, id)),
  );
}

function toolsTab(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const eff = VILLAGERS.tools.efficiency;
  return h(
    'div',
    { class: 'tree-tools' },
    h('p', { class: 'hint' }, t('progress.toolsIntro')),
    h('p', { class: 'panel-stats' }, t('progress.toolBase')),
    ...VILLAGERS.tools.tiers.map((tier, i) =>
      h(
        'section',
        { class: `tree-building ${s.level >= tier.level ? '' : 'locked'}` },
        h(
          'div',
          { class: 'tree-building-head' },
          icon('icon_hammer', 'icon big'),
          h(
            'div',
            { class: 'market-info' },
            h('b', {}, t(`tool.tier.${i + 1}`)),
            h('small', {}, `${t('panel.lockedAt', { level: tier.level })} · ${t('tools.efficiency', { n: eff[i + 1] })}`),
          ),
          h('span', { class: 'up-req' }, h('span', { class: 'nowrap' }, icon('icon_coin', 'icon tiny'), String(toolCost(s, i + 1))), materialChips(ctx, toolMaterials(i + 1), false)),
        ),
        ...JOB_IDS.map((job) =>
          h(
            'div',
            { class: 'upgrade-row' },
            h('img', { class: 'villager-portrait small', src: artUrl(`villager_${job}`), alt: '' }),
            h('div', { class: 'up-info' }, h('b', {}, t(`tool.${job}.${i + 1}`)), h('small', {}, `${t(`job.${job}.title`)} · ${jobDesc(job)}`)),
          ),
        ),
      ),
    ),
    h('p', { class: 'hint' }, t('progress.where.tools')),
  );
}

export function modifierText(m: Modifier, day: number): { text: string; days: string } {
  const effect = t(`modifier.${m.kind}`, { pct: pct(m.value) });
  // El tiempo de la estacion lleva su nombre delante: «Verano seco: cultivos al 80 %».
  const text = m.source.startsWith('weather:') ? `${t(`weather.${m.source.slice(8)}`)}: ${effect.toLowerCase()}` : effect;
  const left = m.untilDay - day;
  return { text, days: t('modifier.days', { n: left }) };
}

/** Relacion con un estamento: barra, tramo, lo que da ahora, como sube y quien es su rival. */
export function estateBar(s: GameState, e: EstateId): HTMLElement {
  const value = s.rep[e];
  const tier = tierOf(value);
  const fx = Object.entries(tierEffects(s, e)).map(([k, v]) => t(`estateEffect.${k}`, { pct: pct(v ?? 1) }));
  const rivals = rivalsOf(e);
  return h(
    'div',
    { class: `rep tier-${tier}` },
    h('div', { class: 'rep-head' }, h('b', {}, t(`estate.${e}`)), h('span', {}, `${t(`tier.${tier}`)} · ${value} / 100`)),
    h('span', { class: 'rep-bar' }, h('span', { class: 'rep-fill', style: `width:${value}%` })),
    fx.length > 0 && h('small', { class: 'rep-effect' }, fx.join(' · ')),
    h('small', {}, t(`estate.${e}.desc`)),
    rivals.length > 0 && h('small', { class: 'rep-rivals' }, t('progress.rivals', { names: rivals.map((r) => t(`estate.${r}`)).join(', ') })),
  );
}

function ranksTab(ctx: PanelCtx): HTMLElement {
  const s = ctx.sim.state;
  const tx = PROGRESSION.taxes;
  const mods = activeModifiers(s);
  const rankCard = (r: RankDef) => {
    const got = hasRank(s, r.id);
    const current = r.id === s.rank || (r.branch && got);
    const reqs: [string, boolean][] = [[t('progress.req.level', { n: r.level }), s.level >= r.level]];
    if (r.days) reqs.push([t('progress.req.days', { n: r.days, have: s.day }), s.day >= r.days]);
    const liege = liegeBefore(r.id);
    // El favor solo cuenta con el senor feudal de ahora: el del siguiente aun no te conoce.
    const repOk = liege === liegeOf(s);
    for (const e of ESTATE_IDS) {
      if (!r[e]) continue;
      // Con la nobleza cuenta el senor de ahora: con uno nuevo se empieza de cero.
      const have = e === 'nobles' && !repOk ? 0 : s.rep[e];
      reqs.push([t('progress.req.estate', { estate: e, n: r[e]!, have }), have >= r[e]!]);
    }
    if (r.branches) reqs.push([t('progress.req.branches'), branchCount(s) >= r.branches]);
    if (r.workshops) reqs.push([t('progress.req.workshops', { n: r.workshops, have: workshopCount(s) }), workshopCount(s) >= r.workshops]);
    if (r.trades) reqs.push([t('progress.req.trades', { n: r.trades, have: s.stats.trades }), s.stats.trades >= r.trades]);
    if (r.stall) reqs.push([t('progress.req.stall'), s.stall]);
    if (r.charter) reqs.push([t('progress.req.charter', { cost: NOBILITY.charter.cost }), s.noble.charter]);
    if (r.manor) reqs.push([t('progress.req.manor', { n: r.manor, have: s.noble.manor }), s.noble.manor >= r.manor]);
    if (r.hamlets) reqs.push([t('progress.req.hamlets', { n: r.hamlets, have: hamletsTaken(s) }), hamletsTaken(s) >= r.hamlets]);
    if (r.hamletLevels) reqs.push([t('progress.req.hamletLevels', { n: r.hamletLevels, have: hamletLevelSum(s) }), hamletLevelSum(s) >= r.hamletLevels]);
    if (r.soldiers) reqs.push([t('progress.req.soldiers', { n: r.soldiers, have: s.noble.soldiers }), s.noble.soldiers >= r.soldiers]);
    if (r.prestige) reqs.push([t('progress.req.prestige', { n: r.prestige, have: s.noble.prestige }), s.noble.prestige >= r.prestige]);
    if (r.path && (r.pathLevel || r.pathRole !== 'any')) {
      const key = r.pathRole === 'focus' ? 'progress.req.path.focus' : r.pathRole === 'main' ? 'progress.req.path.main' : 'progress.req.path';
      reqs.push([t(key, { path: r.path, n: r.pathLevel ?? 0 }), pathOk(s, r)]);
    }
    const fx = rankFxText(r);
    // Con todo lo demas cumplido, el rey vende la carta desde aqui.
    const charter =
      r.charter && charterReady(s)
        ? h(
            'div',
            { class: 'charter-offer' },
            h('p', { class: 'fair-banner' }, t('noble.charterReady')),
            h('button', { class: 'btn primary', disabled: s.coins < NOBILITY.charter.cost, onclick: () => ctx.sim.buyCharter() }, t('noble.buyCharter', { cost: NOBILITY.charter.cost })),
          )
        : null;
    return h(
      'section',
      { class: `tree-rank ${got ? 'got' : ''} ${current ? 'current' : ''}` },
      icon(r.path ? PATHS.icons[r.path] : r.branch ? 'icon_hammer' : 'icon_crown', 'icon big'),
      h(
        'div',
        { class: 'up-info' },
        h('b', {}, t(`rank.${r.id}`), current ? h('span', { class: 'pill' }, t(r.branch ? 'progress.titleNow' : 'progress.rankNow')) : null),
        h('small', {}, t(`rank.${r.id}.desc`)),
        fx.length > 0 && h('small', { class: 'rank-fx' }, fx.join(' · ')),
        !got && h('ul', { class: 'reqs' }, ...reqs.map(([txt, ok]) => h('li', { class: ok ? 'ok' : '' }, txt))),
        !got && charter,
      ),
    );
  };
  return h(
    'div',
    { class: 'tree-ranks' },
    ...mainRanks().map(rankCard),
    h('h3', { class: 'market-section' }, t('progress.branches')),
    h('p', { class: 'hint left' }, t('progress.branchesHint')),
    ...branchRanks().map(rankCard),
    h('h3', { class: 'market-section' }, t('progress.reputation')),
    h('p', { class: 'hint left' }, t('progress.estatesHint')),
    ...ESTATE_IDS.map((e) => estateBar(s, e)),
    h('h3', { class: 'market-section' }, t('progress.modifiers')),
    mods.length === 0
      ? h('p', { class: 'hint' }, t('progress.noModifiers'))
      : h(
          'div',
          { class: 'mod-list' },
          ...mods.map((m) => {
            const mt = modifierText(m, s.day);
            return h('span', { class: `pill mod mod-${m.kind}` }, `${mt.text} · ${mt.days}`);
          }),
        ),
    h('h3', { class: 'market-section' }, t('progress.taxes')),
    h('p', { class: 'hint left' }, t('progress.taxesText', { tithe: pct(tx.titheRate), base: tx.tributeBase, perPlot: tx.tributePerPlot, liege: liegeOf(s) }), ' ', t('progress.taxesRank', { pct: pct(tx.rankTribute[s.rank] ?? 1) })),
  );
}

export function progressView(ctx: PanelCtx, tab: ProgressTab): HTMLElement {
  const views: Record<ProgressTab, () => HTMLElement> = { levels: levelsTab, buildings: buildingsTab, tools: toolsTab, ranks: ranksTab } as never;
  const body = (views[tab] as unknown as (c: PanelCtx) => HTMLElement)(ctx);
  return h(
    'div',
    { class: 'sheet progress' },
    h('h2', {}, t('progress.title')),
    tabs<ProgressTab>(
      [
        { id: 'levels', label: t('progress.tab.levels'), icon: 'icon_scroll' },
        { id: 'buildings', label: t('progress.tab.buildings'), icon: 'icon_house' },
        { id: 'tools', label: t('progress.tab.tools'), icon: 'icon_hammer' },
        { id: 'ranks', label: t('progress.tab.ranks'), icon: 'icon_crown' },
      ],
      tab,
      (id) => ctx.openProgress(id),
    ),
    h('div', { class: 'progress-body' }, body),
    h('button', { class: 'btn', onclick: () => ctx.close() }, t('panel.close')),
  );
}

/** Tras pintar el arbol, lleva el nivel actual a la vista. */
export function scrollTreeToCurrent(root: HTMLElement): void {
  const current = root.querySelector<HTMLElement>('.tree-current');
  const box = root.querySelector<HTMLElement>('.progress-body');
  if (current && box) box.scrollTop = Math.max(0, current.offsetTop - box.offsetTop - 12);
}

// ---------------------------------------------------------------- tarjetas de cuentas y rango

/** Efectos del tiempo de la estacion, en la misma forma que las etiquetas de la barra. */
function weatherEffects(key: string): string {
  const [season, id] = key.split('.');
  const w = PROGRESSION.weather[season as keyof typeof PROGRESSION.weather]?.find((o) => o.id === id);
  if (!w) return '';
  const parts = (['growth', 'animal', 'food'] as const).filter((k) => w[k] !== undefined && w[k] !== 1).map((k) => t(`modifier.${k}`, { pct: pct(w[k]!) }).toLowerCase());
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

export function seasonView(ctx: PanelCtx, params: Record<string, string | number>): HTMLElement {
  const n = (k: string) => Number(params[k] ?? 0);
  const row = (label: string, value: string, cls = '') => h('div', { class: `acct-row ${cls}` }, h('span', {}, label), h('b', {}, value));
  const coins = (v: number, sign: string) => (v ? `${sign}${v}` : '0');
  const balance = n('rent') + n('dues') - n('tithe') - n('tribute') - n('upkeep') - n('wages') - n('maintenance') - n('debtPaid');
  const liege = String(params.liege ?? 'baron');
  const mult = n('tributeMult');
  return h(
    'div',
    { class: 'sheet season-card' },
    h('div', { class: 'event-seal' }, icon('icon_banner', 'event-icon')),
    h('h2', {}, t('seasonCard.title', { season: String(params.season) })),
    h(
      'div',
      { class: 'accounts' },
      row(t('seasonCard.earned'), String(n('earned')), 'muted'),
      row(t('seasonCard.tithe'), coins(n('tithe'), '−')),
      row(`${t('seasonCard.tribute', { liege })}${mult !== 100 ? ` ${t('seasonCard.tributeMult', { pct: mult })}` : ''}`, coins(n('tribute'), '−'), mult > 100 ? 'warn-text' : ''),
      n('rent') > 0 && row(t('seasonCard.rent'), coins(n('rent'), '+')),
      n('dues') > 0 && row(t('seasonCard.dues'), coins(n('dues'), '+')),
      n('upkeep') > 0 && row(t('seasonCard.upkeep'), coins(n('upkeep'), '−')),
      n('wages') > 0 && row(t('seasonCard.wages'), coins(n('wages'), '−')),
      n('maintenance') > 0 && row(t('seasonCard.maintenance'), coins(n('maintenance'), '−')),
      n('debtPaid') > 0 && row(t('seasonCard.debtPaid', { interest: n('debtInterest') }), coins(n('debtPaid'), '−')),
      n('renown') > 0 && row(t('seasonCard.renown', { n: n('renown') }), '', 'muted'),
      row(t('seasonCard.balance'), `${balance > 0 ? '+' : ''}${balance}`, 'total'),
      n('food') > 0 && row(t('seasonCard.food'), t('seasonCard.foodUnits', { n: n('food') }), 'muted'),
      params.duesMats ? row(t('seasonCard.duesMats'), t('progress.needs', { list: String(params.duesMats) }), 'muted') : null,
    ),
    n('deserted') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.deserted', { n: n('deserted') })),
    n('grace') > 0 && h('p', { class: 'hint' }, t('seasonCard.grace')),
    params.weather ? h('p', { class: 'hint season-weather' }, t('seasonCard.weather', { weather: String(params.weather) }), weatherEffects(String(params.weather))) : null,
    n('unpaid') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.unpaid', { n: n('unpaid'), liege })),
    n('wagesLeft') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.wagesLeft', { n: n('wagesLeft'), names: String(params.wagesLeftNames ?? '') })),
    params.seized ? h('p', { class: 'fair-banner' }, t(`seasonCard.seized.${params.seized}`)) : null,
    n('debt') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.debt', { n: n('debt'), limit: n('seizeDebt') })),
    n('rankWarning') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.rankWarning')),
    params.rankLost ? h('p', { class: 'fair-banner' }, t('seasonCard.rankLost', { lost: String(params.rankLost), rank: String(params.rank) })) : null,
    n('neglected') > 0 && h('p', { class: 'fair-banner' }, t('seasonCard.neglected', { pct: Math.round(PROGRESSION.upkeep.neglect.growth * 100) })),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('seasonCard.ok')),
  );
}

/** Tarjeta de vuelta de una caravana. */
export function caravanView(ctx: PanelCtx, params: Record<string, string | number>): HTMLElement {
  const robbed = Number(params.robbed) > 0;
  const mats = String(params.mats ?? '');
  return h(
    'div',
    { class: 'sheet event' },
    h('div', { class: 'event-seal' }, icon('icon_cart', 'event-icon')),
    h('h2', {}, t('trade.backTitle', { town: String(params.town) })),
    h('p', { class: 'event-text' }, t(robbed ? 'trade.back.robbedText' : 'trade.back.okText', params)),
    h(
      'div',
      { class: 'accounts' },
      h('div', { class: 'acct-row total' }, h('span', {}, t('trade.earned')), h('b', {}, `+${params.coins}`)),
      robbed && h('div', { class: 'acct-row warn-text' }, h('span', {}, t('trade.lostToBandits')), h('b', {}, `−${params.lost}`)),
      mats && h('div', { class: 'acct-row' }, h('span', {}, t('trade.brought')), h('b', {}, t('progress.needs', { list: mats }))),
    ),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('seasonCard.ok')),
  );
}

export function rankView(ctx: PanelCtx, rank: RankId): HTMLElement {
  return h(
    'div',
    { class: 'sheet levelup rank-up' },
    h('div', { class: 'level-seal' }, icon('icon_crown', 'event-icon')),
    h('h2', {}, t('rankCard.title')),
    h('p', { class: 'tagline' }, t(`rank.${rank}`)),
    h('p', { class: 'event-text' }, t(`rank.${rank}.desc`)),
    h('button', { class: 'btn primary', onclick: () => ctx.close() }, t('levelup.continue')),
  );
}

export { buildingOf };
