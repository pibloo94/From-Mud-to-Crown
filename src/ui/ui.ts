// Interfaz HTML encima del lienzo: barra superior, controles de tiempo, ventanas, tarjetas y avisos.
import type { Game } from '../sim/game';
import { createNewGame } from '../sim/state';
import { CROPS, EVENTS, MATERIALS, MATERIAL_IDS, PRODUCTS, PRODUCT_IDS, PROGRESSION, TRAITS, WORKSHOPS, type EventOptionDef } from '../sim/data';
import { builtWorkshops } from '../sim/workshops';
import { dateFromDay } from '../sim/calendar';
import { levelProgress, nextLevelXp, renownProgress, unlocksAt } from '../sim/progress';
import { storageCapacity, storageUsed } from '../sim/buildings';
import { beds, foodDays } from '../sim/villagers';
import { foodStock } from '../sim/pantry';
import { seasonForecast } from '../sim/forecast';
import { activeModifiers } from '../sim/modifiers';
import { materialUnlocked } from '../sim/materials';
import {
  buildingView,
  caravanView,
  featureText,
  modifierText,
  progressView,
  rankView,
  scrollTreeToCurrent,
  seasonView,
  type BuildingTab,
  type PanelCtx,
  type ProgressTab,
} from './panels';
import { optionAvailable } from '../sim/events';
import type { BuildingId, CommandResult, CropId, Difficulty, GameState, RankId, Speed, WorkshopId } from '../sim/types';
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n/i18n';
import { autosave, forgetLinkedFile, hasLinkedFile, loadGameFromFile, readBackup, saveGame, supportsFilePicker } from '../save/storage';
import { SaveError } from '../save/serialize';
import type { Insets } from '../render/FarmScene';
import { h, icon } from './dom';
import { chipScroller } from './chipscroll';
import { marketView, resetMarketChoices, type MarketTab } from './market';
import { siteView, workshopView } from './workshops';
import { music } from '../audio/music';
import { fanfare, type FanfareKind } from '../audio/fanfare';
import { createCoach, tipView } from './coach';
import { pendingTip } from '../sim/tutorial';
import { manorView, type ManorTab } from './noble';
import { ledgerView } from './ledger';
import { commissionsView } from './commissions';
import { legacyView, monumentView } from './monuments';
import { bookView, type BookTab } from './book';
import { openCommissions } from '../sim/commissions';
import { characterView, randomName, traitEarnedView, traitLinesEl, type CharacterTab } from './character';
import type { CharacterAnswers } from '../sim/character';
import { isNoble } from '../sim/noble';

const AUTOSAVE_EVERY_DAYS = 3;
const SPEEDS: Speed[] = [0, 1, 2, 3];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface UI {
  getInsets: () => Insets;
}

/** Ventanas que puede haber abiertas. Las tarjetas (nivel y evento) se encolan. */
type Modal =
  | { kind: 'start' }
  | { kind: 'menu' }
  | { kind: 'market'; tab: MarketTab }
  | { kind: 'plant'; x: number; y: number; crops: CropId[] }
  | { kind: 'land'; x: number; y: number; cost: number }
  | { kind: 'lease'; x: number; y: number; cost: number }
  | { kind: 'building'; building: BuildingId; tab: BuildingTab }
  | { kind: 'site'; x: number; y: number; options: WorkshopId[] }
  | { kind: 'workshop'; workshop: WorkshopId }
  | { kind: 'manor'; tab: ManorTab; focus: string | null }
  | { kind: 'progress'; tab: ProgressTab }
  | { kind: 'levelup'; level: number }
  | { kind: 'season'; params: Record<string, string | number> }
  | { kind: 'rank'; rank: RankId }
  | { kind: 'caravan'; params: Record<string, string | number> }
  | { kind: 'event'; id: string; result?: CommandResult }
  | { kind: 'tip'; id: string }
  | { kind: 'ledger' }
  | { kind: 'character'; tab: CharacterTab }
  | { kind: 'trait'; id: string }
  | { kind: 'commissions' }
  | { kind: 'monument'; monument: string }
  | { kind: 'legacy'; monument: string }
  | { kind: 'book'; tab: BookTab };

/** Todas las ventanas detienen el tiempo mientras estan abiertas; al cerrarlas vuelve la velocidad anterior. */
const PAUSES: Modal['kind'][] = ['start', 'menu', 'market', 'plant', 'land', 'lease', 'building', 'site', 'workshop', 'manor', 'progress', 'levelup', 'season', 'rank', 'caravan', 'event', 'tip', 'ledger', 'character', 'trait', 'commissions', 'monument', 'legacy', 'book'];
/** Ventanas que se cierran con Escape o tocando fuera. */
const DISMISSABLE: Modal['kind'][] = ['menu', 'market', 'plant', 'land', 'lease', 'building', 'site', 'workshop', 'manor', 'progress', 'ledger', 'character', 'commissions', 'monument', 'book'];
/** Ventanas desde las que se puede ir a otra y volver con "Atras". */
const NAVIGABLE: Modal['kind'][] = ['market', 'building', 'workshop', 'site', 'manor', 'progress', 'levelup', 'ledger', 'character', 'commissions', 'monument', 'book'];

export function createUI(sim: Game, root: HTMLElement, onLayout: () => void): UI {
  let lastSpeed: Speed = 1;
  let modal: Modal | null = { kind: 'start' };
  let speedBeforeModal: Speed = 0;
  let confirmingNew = false;
  /** Pantalla de inicio: eligiendo dificultad para una partida nueva. */
  let choosingNew = false;
  /** Dificultad marcada para la proxima partida nueva. */
  let pickedDifficulty: Difficulty = 'normal';
  // Cuestionario de partida nueva: 0 es la dificultad y 1..3 las preguntas de traits.json.
  let quizStep = 0;
  let answers: Partial<CharacterAnswers> = {};
  const resetQuiz = () => {
    quizStep = 0;
    answers = { name: randomName() };
  };
  const queue: Modal[] = [];

  // ---------------------------------------------------------------- barra superior
  const dateText = h('span', { class: 'date-text' });
  const pausedPill = h('span', { class: 'paused-pill' });
  const dayBar = h('span', { class: 'day-bar-fill' });
  const dateBox = h('div', { class: 'date-box' }, h('div', { class: 'date-line' }, dateText, pausedPill), h('div', { class: 'day-bar' }, dayBar));

  const levelNum = h('span', { class: 'level-num' });
  const rankText = h('span', { class: 'rank-text' });
  const xpFill = h('span', { class: 'xp-fill' });
  const xpText = h('span', { class: 'xp-text' });
  const levelBox = h(
    'button',
    // El escudo de nivel abre la ficha del personaje; Progreso tiene su boton abajo.
    { class: 'level-box', onclick: () => openModal({ kind: 'character', tab: 'traits' }) },
    h('span', { class: 'level-shield' }, levelNum),
    h('div', { class: 'level-info' }, rankText, h('span', { class: 'xp-bar' }, xpFill), xpText),
  );

  const amounts = new Map<string, HTMLElement>();
  const chip = (id: string, iconName: string) => {
    const n = h('b', {}, '0');
    amounts.set(id, n);
    return h('div', { class: 'chip', 'data-res': id }, icon(iconName), n);
  };
  // Dos grupos que se deslizan en horizontal si no caben: alimentos y materiales (este abre la compra).
  const foods = chipScroller('foods', ...PRODUCT_IDS.map((p) => chip(p, PRODUCTS[p].icon)));
  const mats = chipScroller('mats', ...MATERIAL_IDS.map((m) => chip(`mat:${m}`, MATERIALS[m].icon)));
  mats.track.addEventListener('click', () => openModal({ kind: 'market', tab: 'buy' }));
  const resources = h('div', { class: 'resources panel' }, levelBox, chip('coins', 'icon_coin'), foods.el, mats.el);

  // Fila de estado: granero, aldeanos y efectos activos.
  const storageText = h('b', {});
  const storageFill = h('span', { class: 'mini-fill' });
  const storagePill = h(
    'button',
    { class: 'status-pill', onclick: () => openModal({ kind: 'building', building: 'granary', tab: 'upgrades' }) },
    h('span', { class: 'status-inner' }, icon('icon_granary'), storageText, h('span', { class: 'mini-bar' }, storageFill)),
  );
  const villagersText = h('b', {});
  const villagersPill = h(
    'button',
    { class: 'status-pill', onclick: () => openModal({ kind: 'building', building: 'house', tab: 'villagers' }) },
    h('span', { class: 'status-inner' }, icon('icon_worker'), villagersText),
  );
  const caravanText = h('b', {});
  const caravanPill = h(
    'button',
    { class: 'status-pill', onclick: () => openModal({ kind: 'market', tab: 'trade' }) },
    h('span', { class: 'status-inner' }, icon('icon_cart'), caravanText),
  );
  const prestigeText = h('b', {});
  const prestigePill = h(
    'button',
    { class: 'status-pill', onclick: () => openModal({ kind: 'manor', tab: 'house', focus: null }) },
    h('span', { class: 'status-inner' }, icon('icon_prestige'), prestigeText),
  );
  // Cuentas de la estacion: lo que se cobrara y en cuantos dias; en rojo si no llega.
  const ledgerText = h('b', {});
  const ledgerPill = h(
    'button',
    { class: 'status-pill ledger-pill', onclick: () => openModal({ kind: 'ledger' }) },
    h('span', { class: 'status-inner' }, icon('icon_scroll'), ledgerText),
  );
  // Encargos de los estamentos que quedan por cumplir esta estacion.
  const commissionsText = h('b', {});
  const commissionsPill = h(
    'button',
    { class: 'status-pill commissions-pill', onclick: () => openModal({ kind: 'commissions' }) },
    h('span', { class: 'status-inner' }, icon('icon_banner'), commissionsText),
  );
  const modsBox = h('div', { class: 'mods' });
  const status = chipScroller('status-row', ledgerPill, commissionsPill, storagePill, villagersPill, caravanPill, prestigePill, modsBox);
  const statusRow = status.el;

  const speedButtons = SPEEDS.map((sp) =>
    // Dibujos en vez de caracteres (❚❚ ▶): no todas las fuentes los tienen.
    h('button', { class: 'speed-btn', 'data-speed': sp, onclick: () => setSpeed(sp) }, ...(sp === 0 ? [icon('icon_pause')] : Array.from({ length: sp }, () => icon('icon_play')))),
  );
  // El reloj y sus controles van juntos, a la izquierda.
  const timeBox = h('div', { class: 'time-box panel' }, dateBox, h('div', { class: 'speed', role: 'group' }, ...speedButtons));

  const topbar = h('header', { class: 'topbar' }, timeBox, resources, statusRow);
  // En escritorio el reloj baja a la esquina inferior izquierda y la fila de estado sube a la barra superior.
  const timeDock = h('div', { class: 'time-dock' });

  // ---------------------------------------------------------------- barra inferior
  const marketBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'market', tab: 'sell' }) }, icon('icon_coin'), h('span', {}));
  const progressBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'progress', tab: 'levels' }) }, icon('icon_scroll'), h('span', {}));
  const menuBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'menu' }) }, h('span', { class: 'burger' }, icon('icon_menu')), h('span', {}));
  const bottombar = h('footer', { class: 'bottombar' }, marketBtn, progressBtn, menuBtn);

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'overlay', hidden: true });

  // Tutorial guiado: panel con el paso actual y botones senalados.
  const coach = createCoach(sim, { market: marketBtn, progress: progressBtn }, (stepId) => {
    sim.tutorialAck();
    // La bienvenida deja el tiempo en pausa mientras se lee; al empezar, corre.
    if (stepId === 'welcome') setSpeed(lastSpeed || 1);
  });

  root.append(topbar, timeDock, bottombar, coach.el, toasts, overlay);

  const wide = window.matchMedia('(min-width: 761px)');
  function placeHud(): void {
    if (wide.matches) {
      timeDock.append(timeBox);
      resources.append(statusRow);
    } else {
      topbar.prepend(timeBox);
      topbar.append(statusRow);
    }
  }
  placeHud();
  wide.addEventListener('change', () => {
    placeHud();
    onLayout();
  });

  // ---------------------------------------------------------------- tiempo
  function setSpeed(sp: Speed): void {
    if (sp !== 0) lastSpeed = sp;
    sim.setSpeed(sp);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape' && modal && DISMISSABLE.includes(modal.kind)) {
      goBack();
      return;
    }
    if (modal) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setSpeed(sim.state.speed === 0 ? lastSpeed : 0);
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      setSpeed(Number(e.key) as Speed);
    } else if (e.key.toLowerCase() === 'm') {
      openModal({ kind: 'market', tab: 'sell' });
    } else if (e.key.toLowerCase() === 'p') {
      openModal({ kind: 'progress', tab: 'levels' });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (sim.state.speed !== 0 && !modal) setSpeed(0);
      void autosave(sim.state);
      music.suspend();
    } else {
      music.resume();
    }
  });
  window.addEventListener('pagehide', () => void autosave(sim.state));

  // ---------------------------------------------------------------- eventos de la simulacion
  sim.on((e) => {
    switch (e.type) {
      case 'change':
        renderHud();
        break;
      case 'day':
        if (e.day % AUTOSAVE_EVERY_DAYS === 0) void autosave(sim.state).then((wrote) => wrote && toast(t('save.autosaved'), 'quiet'));
        break;
      case 'openMarket':
        openModal({ kind: 'market', tab: 'sell' });
        break;
      case 'choosePlant':
        openModal({ kind: 'plant', x: e.x, y: e.y, crops: e.crops });
        break;
      case 'offerLand':
        openModal({ kind: 'land', x: e.x, y: e.y, cost: e.cost });
        break;
      case 'offerLease':
        openModal({ kind: 'lease', x: e.x, y: e.y, cost: e.cost });
        break;
      case 'building':
        openModal({ kind: 'building', building: e.building, tab: 'upgrades' });
        break;
      case 'site':
        openModal({ kind: 'site', x: e.x, y: e.y, options: e.options });
        break;
      case 'manor':
        openModal({ kind: 'manor', tab: e.hamlet ? 'fief' : 'house', focus: e.hamlet });
        break;
      case 'workshop':
        openModal({ kind: 'workshop', workshop: e.workshop });
        break;
      case 'monument':
        openModal({ kind: 'monument', monument: e.monument });
        break;
      case 'levelUp':
        showCard({ kind: 'levelup', level: e.level });
        break;
      case 'event':
        showCard({ kind: 'event', id: e.id });
        break;
      case 'notice':
        if (e.notice.card === 'season') showCard({ kind: 'season', params: e.notice.params ?? {} });
        else if (e.notice.card === 'rank') showCard({ kind: 'rank', rank: e.notice.params?.rank as RankId });
        else if (e.notice.card === 'caravan') showCard({ kind: 'caravan', params: e.notice.params ?? {} });
        else if (e.notice.card === 'trait') showCard({ kind: 'trait', id: String(e.notice.params?.trait) });
        else if (e.notice.card === 'legacy') showCard({ kind: 'legacy', monument: String(e.notice.params?.monument) });
        else toast(t(e.notice.msg, e.notice.params), e.notice.ok ? 'good' : 'warn');
        break;
      case 'result':
        if (modal?.kind !== 'event') onResult(e.result, e.x !== undefined);
        break;
      default:
        break;
    }
  });

  function onResult(r: CommandResult, hasTile: boolean): void {
    const shownOnMap = r.ok && hasTile && (r.params?.amount !== undefined || r.msg === 'msg.planted' || r.msg === 'msg.landBought');
    const text = t(r.msg, r.params);
    if (!shownOnMap && text) toast(text, r.ok ? 'good' : 'warn');
    // Al levantar un taller, el solar pasa a ser el panel del taller.
    if (modal?.kind === 'site' && r.ok && r.msg === 'msg.workshopBuilt') {
      openModal({ kind: 'workshop', workshop: r.params!.workshop as WorkshopId });
      return;
    }
    if (modal && ['market', 'building', 'progress', 'workshop', 'site', 'manor'].includes(modal.kind)) renderModal();
  }

  // ---------------------------------------------------------------- avisos
  function toast(text: string, kind: 'good' | 'warn' | 'quiet' = 'good'): void {
    const el = h('div', { class: `toast toast-${kind}` }, text);
    toasts.append(el);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // ---------------------------------------------------------------- pintar HUD
  /** Consejo pendiente: se muestra como tarjeta cuando no hay otra cosa delante. */
  let tipShown: string | null = null;
  function maybeShowTip(): void {
    const id = pendingTip(sim.state);
    if (!id || modal || queue.length || id === tipShown) return;
    tipShown = id;
    showCard({ kind: 'tip', id });
  }

  function renderHud(): void {
    const s = sim.state;
    coach.render(modal !== null);
    maybeShowTip();
    const d = dateFromDay(s.day);
    dateText.textContent = t('date.format', { season: d.season, day: d.dayOfSeason, year: d.year });
    dayBar.style.width = `${Math.round(s.dayProgress * 100)}%`;
    pausedPill.textContent = t('hud.paused');
    pausedPill.hidden = s.speed !== 0;

    levelNum.textContent = String(s.level);
    rankText.textContent = t(`rank.${s.rank}`);
    xpFill.style.width = `${Math.round(levelProgress(s) * 100)}%`;
    levelBox.style.setProperty('--xp', `${Math.round(levelProgress(s) * 100)}%`);
    const next = nextLevelXp(s.level);
    const xp = Math.floor(s.xp);
    const renown = renownProgress(s);
    xpText.textContent =
      next === null ? t('hud.renown', { n: renown.points, xp: renown.xp, next: PROGRESSION.renown.xpPerPoint }) : t('hud.xp', { xp, next });
    levelBox.title = `${t('hud.level', { n: s.level })} · ${rankText.textContent} · ${xpText.textContent}`;

    amounts.get('coins')!.textContent = String(s.coins);
    for (const p of PRODUCT_IDS) {
      amounts.get(p)!.textContent = String(s.inventory[p]);
      // Los productos que aun no se pueden conseguir no ocupan sitio en la barra.
      const crop = Object.values(CROPS).find((c) => c.product === p);
      // Lo que sale de un taller solo aparece cuando hay taller que lo haga (o ya se tiene).
      const fromWorkshop = !!PRODUCTS[p].artisan && !builtWorkshops(s).some((id) => WORKSHOPS[id].recipe.out[p]);
      resources.querySelector<HTMLElement>(`[data-res="${p}"]`)!.hidden = s.inventory[p] === 0 && ((!!crop && s.level < crop.unlockLevel) || fromWorkshop);
    }
    renderLedgerPill(s);
    const open = openCommissions(s);
    commissionsPill.hidden = s.commissions.offers.length === 0;
    commissionsText.textContent = `${open}/${s.commissions.offers.length}`;
    commissionsPill.title = t('hud.commissions', { n: open });
    commissionsPill.setAttribute('aria-label', commissionsPill.title);
    const used = storageUsed(s);
    const cap = storageCapacity(s);
    storageText.textContent = `${used}/${cap}`;
    storageFill.style.width = `${Math.min(100, Math.round((used / cap) * 100))}%`;
    storagePill.classList.toggle('full', used >= cap);
    storagePill.title = t('hud.storage', { used, cap });
    storagePill.setAttribute('aria-label', storagePill.title);
    const days = foodDays(s);
    villagersText.textContent = `${s.villagers.length}/${beds(s)}`;
    const hungry = s.villagers.some((v) => v.hungry > 0) || (s.villagers.length > 0 && days < 3);
    villagersPill.classList.toggle('warn', hungry);
    villagersPill.title = `${t('hud.villagers', { n: s.villagers.length, beds: beds(s) })}${s.villagers.length ? ` · ${t('hud.foodDays', { days })}` : ''}`;
    villagersPill.setAttribute('aria-label', villagersPill.title);
    villagersPill.hidden = beds(s) === 0 && s.villagers.length === 0;
    for (const m of MATERIAL_IDS) {
      amounts.get(`mat:${m}`)!.textContent = String(s.materials[m]);
      resources.querySelector<HTMLElement>(`[data-res="mat:${m}"]`)!.hidden = !materialUnlocked(s, m) && s.materials[m] === 0;
    }
    caravanPill.hidden = s.caravans.length === 0;
    if (s.caravans.length) {
      const soon = Math.max(0, Math.min(...s.caravans.map((c) => c.returnDay)) - s.day);
      caravanText.textContent = s.caravans.length > 1 ? `${s.caravans.length} · ${soon} d` : `${soon} d`;
      caravanPill.title = t('hud.caravans', { n: s.caravans.length, days: soon });
      caravanPill.setAttribute('aria-label', caravanPill.title);
    }
    prestigePill.hidden = !isNoble(s);
    prestigeText.textContent = String(s.noble.prestige);
    prestigePill.title = t('hud.prestige');
    prestigePill.setAttribute('aria-label', `${t('noble.prestige')} ${s.noble.prestige}. ${t('hud.prestige')}`);
    const mods = activeModifiers(s);
    const modsKey = mods.map((m) => `${m.kind}${m.value}${m.untilDay - s.day}`).join('|');
    if (modsBox.dataset.key !== modsKey) {
      modsBox.dataset.key = modsKey;
      modsBox.replaceChildren(
        ...mods.map((m) => {
          const mt = modifierText(m, s.day);
          return h('button', { class: `status-pill mod mod-${m.kind}`, onclick: () => openModal({ kind: 'progress', tab: 'ranks' }) }, h('span', { class: 'status-inner' }, `${mt.text} · ${mt.days}`));
        }),
      );
    }

    speedButtons.forEach((b, i) => {
      b.classList.toggle('active', SPEEDS[i] === s.speed);
      b.title = SPEEDS[i] === 0 ? t('hud.pause') : `x${SPEEDS[i]}`;
      b.setAttribute('aria-pressed', String(SPEEDS[i] === s.speed));
    });
    resources.querySelector<HTMLElement>('[data-res="coins"]')!.title = t('hud.coins');
    for (const p of PRODUCT_IDS) resources.querySelector<HTMLElement>(`[data-res="${p}"]`)!.title = t(`product.${p}`);
    for (const m of MATERIAL_IDS) resources.querySelector<HTMLElement>(`[data-res="mat:${m}"]`)!.title = t(`material.${m}`);
    foods.label(t('hud.foods'), t('hud.scrollPrev'), t('hud.scrollNext'));
    mats.label(t('hud.materials'), t('hud.scrollPrev'), t('hud.scrollNext'));
    status.label(t('hud.status'), t('hud.scrollPrev'), t('hud.scrollNext'));
    // Las flechas de "hay mas" solo se recalculan cuando cambia lo que se ve en cada grupo.
    const scrollKey = [foods, mats, status].map((g) => [...g.track.children].map((c) => ((c as HTMLElement).hidden ? '' : c.textContent)).join('|')).join('#');
    if (scrollKey !== lastScrollKey) {
      lastScrollKey = scrollKey;
      for (const g of [foods, mats, status]) g.update();
    }
    marketBtn.lastElementChild!.textContent = t('hud.market');
    progressBtn.lastElementChild!.textContent = t('hud.progress');
    menuBtn.lastElementChild!.textContent = t('hud.menu');
  }

  let lastScrollKey = '';

  /** La prevision ensaya las cuentas sobre una copia: se rehace solo cuando cambia algo que cuenta. */
  let ledgerKey = '';
  function renderLedgerPill(s: GameState): void {
    const key = `${getLang()}|${s.day}|${s.coins}|${s.villagers.length}|${s.stats.seasonEarned}|${s.debt}|${s.noble.soldiers}|${foodStock(s)}`;
    if (key === ledgerKey) return;
    ledgerKey = key;
    const f = seasonForecast(s);
    const due = f.total - f.income;
    ledgerText.textContent = t('hud.ledgerShort', { n: Math.max(0, due), days: f.daysLeft });
    ledgerPill.classList.toggle('warn', f.short > 0 || f.food.short);
    ledgerPill.title = f.grace
      ? t('hud.ledgerGrace', { days: f.daysLeft })
      : `${t('hud.ledger', { days: f.daysLeft, n: Math.max(0, due), coins: s.coins })}${f.short > 0 ? ` ${t('ledger.short', { n: f.short })}` : ''}${f.food.short ? ` ${t('hud.ledgerFood', { days: f.food.days })}` : ''}`;
    ledgerPill.setAttribute('aria-label', ledgerPill.title);
  }

  // ---------------------------------------------------------------- ventanas y tarjetas
  /** Ventanas anteriores, para volver atras (p. ej. Progreso -> Casa -> atras). */
  const history: Modal[] = [];
  /** Cuerpos desplazables de las ventanas (se conserva su scroll al repintar). */
  const SCROLL_BODY = '.progress-body, .scroll-body, .sheet-body';
  /** Lo que queda fijo arriba de una ventana mientras el resto se desplaza. */
  const SHEET_HEAD = '.back-btn, h1, h2, .tagline, .tabs';
  const pageKey = (m: Modal) => (m.kind === 'building' ? `building:${m.building}` : m.kind === 'workshop' ? `workshop:${m.workshop}` : m.kind);

  function openModal(next: Modal): void {
    if (modal?.kind === 'start') return;
    if (next.kind === 'market' && modal?.kind !== 'market') resetMarketChoices();
    // Cambiar de pestana no es navegar; abrir otra ventana desde una navegable si.
    if (modal && pageKey(modal) === pageKey(next)) {
      /* misma pagina: se conserva el historial */
    } else if (modal && NAVIGABLE.includes(modal.kind)) history.push(modal);
    else history.length = 0;
    const pausing = PAUSES.includes(next.kind);
    // Se recuerda la velocidad solo al pasar de "corriendo" a "en pausa".
    if (pausing && !(modal && PAUSES.includes(modal.kind))) speedBeforeModal = sim.state.speed;
    modal = next;
    if (pausing) sim.setSpeed(0);
    if (next.kind === 'progress') sim.noteTutorial('progressOpened');
    playFanfare(next);
    renderModal();
    coach.render(true);
  }

  const FANFARES: Partial<Record<Modal['kind'], FanfareKind>> = { levelup: 'level', rank: 'rank', season: 'season', event: 'event' };
  function playFanfare(m: Modal): void {
    const kind = FANFARES[m.kind];
    // El resultado de un evento reusa la misma ventana: solo suena al aparecer.
    if (kind && !(m.kind === 'event' && m.result)) fanfare.play(kind);
  }

  /** Las tarjetas esperan su turno si hay otra ventana abierta. */
  function showCard(card: Modal): void {
    if (modal) queue.push(card);
    else openModal(card);
  }

  function goBack(): void {
    const prev = history.pop();
    if (!prev) {
      closeModal();
      return;
    }
    modal = prev;
    renderModal();
  }

  function closeModal(): void {
    history.length = 0;
    const was = modal;
    confirmingNew = false;
    modal = null;
    overlay.hidden = true;
    overlay.replaceChildren();
    const next = queue.shift();
    if (next) {
      // Si la ventana anterior ya pausaba, se conserva la velocidad que habia antes de la primera.
      if (PAUSES.includes(next.kind) && !(was && PAUSES.includes(was.kind))) speedBeforeModal = sim.state.speed;
      modal = next;
      if (PAUSES.includes(next.kind)) sim.setSpeed(0);
      playFanfare(next);
      renderModal();
      return;
    }
    if (was && was.kind !== 'start' && PAUSES.includes(was.kind) && speedBeforeModal !== 0) sim.setSpeed(speedBeforeModal);
    coach.render(false);
    maybeShowTip();
  }

  function renderModal(): void {
    if (!modal) return;
    overlay.hidden = false;
    const views: Record<Modal['kind'], () => HTMLElement> = {
      start: startView,
      menu: menuView,
      market: () => marketView(panelCtx, (modal as Extract<Modal, { kind: 'market' }>).tab, (tab) => openModal({ kind: 'market', tab })),
      plant: plantView,
      land: landView,
      lease: leaseView,
      building: () => {
        const m = modal as Extract<Modal, { kind: 'building' }>;
        return buildingView(panelCtx, m.building, m.tab);
      },
      progress: () => progressView(panelCtx, (modal as Extract<Modal, { kind: 'progress' }>).tab),
      site: () => {
        const m = modal as Extract<Modal, { kind: 'site' }>;
        return siteView(panelCtx, m.x, m.y, m.options);
      },
      workshop: () => workshopView(panelCtx, (modal as Extract<Modal, { kind: 'workshop' }>).workshop),
      manor: () => {
        const m = modal as Extract<Modal, { kind: 'manor' }>;
        return manorView(panelCtx, m.tab, m.focus, (tab) => openModal({ kind: 'manor', tab, focus: null }));
      },
      levelup: levelUpView,
      season: () => seasonView(panelCtx, (modal as Extract<Modal, { kind: 'season' }>).params),
      rank: () => rankView(panelCtx, (modal as Extract<Modal, { kind: 'rank' }>).rank),
      caravan: () => caravanView(panelCtx, (modal as Extract<Modal, { kind: 'caravan' }>).params),
      event: eventView,
      tip: () => tipView(sim, (modal as Extract<Modal, { kind: 'tip' }>).id, () => closeModal()),
      ledger: () => ledgerView(panelCtx),
      commissions: () => commissionsView(panelCtx),
      book: () => bookView(panelCtx, (modal as Extract<Modal, { kind: 'book' }>).tab, (tab) => openModal({ kind: 'book', tab })),
      monument: () => monumentView(panelCtx, (modal as Extract<Modal, { kind: 'monument' }>).monument),
      legacy: () => legacyView(panelCtx, (modal as Extract<Modal, { kind: 'legacy' }>).monument),
      trait: () => traitEarnedView(panelCtx, (modal as Extract<Modal, { kind: 'trait' }>).id, () => openModal({ kind: 'character', tab: 'traits' })),
      character: () => characterView(panelCtx, (modal as Extract<Modal, { kind: 'character' }>).tab, (tab) => openModal({ kind: 'character', tab })),
    };
    // Al repintar la misma ventana se conserva el desplazamiento (p. ej. al mejorar algo de la lista).
    const prevBody = overlay.querySelector<HTMLElement>(SCROLL_BODY);
    const keepScroll = overlay.dataset.view === viewKey(modal) ? { overlay: overlay.scrollTop, body: prevBody?.scrollTop ?? 0 } : null;
    const view = views[modal.kind]();
    if (history.length > 0 && view.classList.contains('sheet')) {
      view.classList.add('has-back');
      view.prepend(h('button', { class: 'back-btn', 'aria-label': t('panel.back'), onclick: () => goBack() }, '‹ ', t('panel.back')));
    }
    scrollableSheet(view);
    overlay.replaceChildren(view);
    overlay.className = `overlay overlay-${modal.kind}`;
    overlay.dataset.view = viewKey(modal);
    if (keepScroll) {
      overlay.scrollTop = keepScroll.overlay;
      const body = overlay.querySelector<HTMLElement>(SCROLL_BODY);
      if (body) body.scrollTop = keepScroll.body;
    } else if (modal.kind === 'progress' && modal.tab === 'levels') {
      scrollTreeToCurrent(overlay);
    } else if (modal.kind === 'manor' && modal.focus) {
      overlay.querySelector(`#hamlet-${modal.focus}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Toda ventana cabe en pantalla y se desplaza por dentro, como Progreso: la cabecera (volver,
   * titulo, subtitulo y pestanas) y los botones del final quedan fijos, y lo de en medio va en un
   * cuerpo con scroll. Las ventanas que ya traen su propio cuerpo desplazable se dejan igual.
   */
  function scrollableSheet(view: HTMLElement): void {
    if (!view.classList.contains('sheet') || view.querySelector(SCROLL_BODY)) return;
    const nodes = [...view.childNodes];
    const isEl = (n: ChildNode | undefined, sel: string) => n instanceof HTMLElement && n.matches(sel);
    let start = 0;
    while (start < nodes.length && isEl(nodes[start], SHEET_HEAD)) start++;
    let end = nodes.length;
    while (end > start && isEl(nodes[end - 1], '.btn')) end--;
    if (end <= start) return;
    const body = h('div', { class: 'sheet-body' });
    view.insertBefore(body, nodes[start]);
    body.append(...nodes.slice(start, end));
  }

  function viewKey(m: Modal): string {
    if (m.kind === 'building') return `building:${m.building}:${m.tab}`;
    if (m.kind === 'progress') return `progress:${m.tab}`;
    if (m.kind === 'market') return `market:${m.tab}`;
    if (m.kind === 'manor') return `manor:${m.tab}`;
    if (m.kind === 'character') return `character:${m.tab}`;
    if (m.kind === 'monument') return `monument:${m.monument}`;
    if (m.kind === 'book') return `book:${m.tab}`;
    return m.kind;
  }

  const panelCtx: PanelCtx = {
    sim,
    close: () => closeModal(),
    rerender: () => renderModal(),
    openBuilding: (b, tab = 'upgrades') => openModal({ kind: 'building', building: b, tab }),
    openProgress: (tab = 'levels') => openModal({ kind: 'progress', tab }),
    openMarket: (tab = 'buy') => openModal({ kind: 'market', tab }),
    openWorkshop: (id) => openModal({ kind: 'workshop', workshop: id }),
    openLedger: () => openModal({ kind: 'ledger' }),
    openMonument: (id) => openModal({ kind: 'monument', monument: id }),
    openBook: (tab = 'money') => openModal({ kind: 'book', tab }),
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && modal && DISMISSABLE.includes(modal.kind)) closeModal();
  });

  function langSwitch(): HTMLElement {
    const btn = (lang: Lang, label: string) =>
      h('button', { class: `lang-btn ${getLang() === lang ? 'active' : ''}`, onclick: () => setLang(lang) }, label);
    return h('div', { class: 'lang', role: 'group', 'aria-label': t('menu.language') }, btn('es', 'ES'), btn('en', 'EN'));
  }

  /** Las tres dificultades como botones; la marcada, llena y con marca. Cada una dice en que cambia. */
  function difficultyPicker(): HTMLElement {
    return h(
      'div',
      { class: 'stack difficulty-list', role: 'radiogroup', 'aria-label': t('difficulty.title') },
      ...DIFFICULTIES.map((d) =>
        h(
          'button',
          {
            class: `btn difficulty-option ${pickedDifficulty === d ? 'picked' : 'ghost'}`,
            role: 'radio',
            'aria-checked': String(pickedDifficulty === d),
            onclick: () => ((pickedDifficulty = d), renderModal()),
          },
          h('span', { class: 'difficulty-name' }, pickedDifficulty === d && icon('icon_check', 'icon tiny'), t(`difficulty.${d}`)),
          h('small', {}, t(`difficulty.${d}.desc`)),
        ),
      ),
    );
  }

  /** Una pregunta del cuestionario: origen (con el nombre), caracter o ambicion. */
  function questionView(onDone: () => void): HTMLElement {
    const total = TRAITS.questions.length;
    const q = TRAITS.questions[quizStep - 1];
    const picked = answers[q.id];
    const last = quizStep === total;
    return h(
      'div',
      { class: 'sheet start character-quiz' },
      h('h2', {}, t('character.title')),
      h('p', { class: 'tagline' }, t('character.step', { n: quizStep, total })),
      quizStep === 1 &&
        h(
          'label',
          { class: 'name-field' },
          h('span', {}, t('character.name')),
          h('input', { type: 'text', value: answers.name ?? '', maxlength: 20, autocomplete: 'off', oninput: (e: Event) => (answers.name = (e.target as HTMLInputElement).value) }),
        ),
      h('h3', { class: 'market-section' }, t(`character.q.${q.id}`)),
      h(
        'div',
        { class: 'stack difficulty-list', role: 'radiogroup', 'aria-label': t(`character.q.${q.id}`) },
        ...q.options.map((id) =>
          h(
            'button',
            {
              class: `btn difficulty-option trait-option ${picked === id ? 'picked' : 'ghost'}`,
              role: 'radio',
              'aria-checked': String(picked === id),
              onclick: () => ((answers[q.id] = id), renderModal()),
            },
            h('span', { class: 'difficulty-name' }, picked === id && icon('icon_check', 'icon tiny'), t(`trait.${id}`)),
            h('small', {}, t(`trait.${id}.desc`)),
            traitLinesEl(id),
          ),
        ),
      ),
      // Los botones van sueltos al final: quedan fijos mientras las respuestas se desplazan.
      h(
        'button',
        { class: 'btn primary', disabled: !picked, onclick: () => (last ? onDone() : (quizStep++, renderModal())) },
        !picked ? t('character.pick') : t(last ? 'difficulty.start' : 'character.next'),
      ),
      h('button', { class: 'btn ghost', onclick: () => (quizStep--, renderModal()) }, t('panel.back')),
    );
  }

  function newGameView(): HTMLElement {
    if (quizStep > 0) return questionView(() => ((choosingNew = false), startWith(() => newGame())));
    return h(
      'div',
      { class: 'sheet start' },
      h('h2', {}, t('menu.newGame')),
      h('p', { class: 'howto' }, t('difficulty.pick')),
      difficultyPicker(),
      h(
        'div',
        { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => ((quizStep = 1), renderModal()) }, t('character.next')),
        h('button', { class: 'btn ghost', onclick: () => ((choosingNew = false), renderModal()) }, t('panel.back')),
      ),
    );
  }

  function startView(): HTMLElement {
    if (choosingNew) return newGameView();
    const backup = readBackup();
    const fmt = (d: Date) => d.toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' });
    return h(
      'div',
      { class: 'sheet start' },
      h('div', { class: 'crest' }, icon('icon_wheat', 'crest-icon')),
      h('h1', {}, t('app.title')),
      h('p', { class: 'tagline' }, t('app.tagline')),
      h(
        'div',
        { class: 'stack' },
        backup &&
          h(
            'button',
            { class: 'btn primary', onclick: () => startWith(() => sim.replaceState(backup.state)) },
            t('menu.continue'),
            h('small', {}, t('menu.continueHint', { date: fmt(backup.savedAt) })),
          ),
        h('button', { class: `btn ${backup ? '' : 'primary'}`, onclick: () => ((choosingNew = true), resetQuiz(), renderModal()) }, t('menu.newGame')),
        h('button', { class: 'btn', onclick: () => void loadFlow(true) }, t('menu.load')),
      ),
      h('p', { class: 'howto' }, t('menu.howTo')),
      langSwitch(),
    );
  }

  function confirmNewView(): HTMLElement {
    if (quizStep > 0) {
      return questionView(() => {
        confirmingNew = false;
        newGame();
        queue.length = 0;
        closeModal();
        setSpeed(1);
      });
    }
    return h(
      'div',
      { class: 'sheet' },
      h('h2', {}, t('menu.newGame')),
      h('p', { class: 'howto' }, t('menu.confirmNew')),
      h('h3', { class: 'market-section' }, t('difficulty.title')),
      difficultyPicker(),
      h(
        'div',
        { class: 'stack' },
        h('button', {
          class: 'btn primary',
          onclick: () => ((quizStep = 1), renderModal()),
        }, t('menu.confirmYes')),
        h('button', { class: 'btn', onclick: () => ((confirmingNew = false), renderModal()) }, t('menu.cancel')),
      ),
    );
  }

  function menuView(): HTMLElement {
    if (confirmingNew) return confirmNewView();
    // Como en Progreso: el titulo y «Continuar» quedan fijos y lo de en medio se desplaza.
    return h(
      'div',
      { class: 'sheet menu' },
      h('h2', {}, t('menu.title')),
      h(
        'div',
        { class: 'scroll-body' },
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'btn', onclick: () => void saveFlow(false) }, t('menu.save')),
          supportsFilePicker() && hasLinkedFile() && h('button', { class: 'btn', onclick: () => void saveFlow(true) }, t('menu.saveAs')),
          h('button', { class: 'btn', onclick: () => void loadFlow(false) }, t('menu.load')),
          h('button', { class: 'btn', onclick: () => openModal({ kind: 'book', tab: 'money' }) }, t('book.title')),
          h('button', { class: 'btn danger', onclick: () => ((confirmingNew = true), resetQuiz(), renderModal()) }, t('menu.newGame')),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                sim.restartTutorial();
                closeModal();
                tipShown = null;
                // La bienvenida espera, en pausa, a que se pulse Empezar.
                sim.setSpeed(0);
              },
            },
            t('menu.tutorialAgain'),
          ),
          h(
            'button',
            {
              class: 'btn',
              'aria-pressed': String(sim.state.tutorial.tips),
              onclick: () => {
                sim.setTips(!sim.state.tutorial.tips);
                renderModal();
              },
            },
            t(sim.state.tutorial.tips ? 'menu.tipsOn' : 'menu.tipsOff'),
          ),
        ),
        h('h3', { class: 'market-section' }, t('menu.sound')),
        volumeRow(t('menu.music'), music.getVolume(), (v) => music.setVolume(v)),
        volumeRow(t('menu.fanfares'), fanfare.getVolume(), (v) => fanfare.setVolume(v), () => fanfare.play('level')),
        h('p', { class: 'hint' }, t(supportsFilePicker() ? 'menu.saveHintFile' : 'menu.saveHintDownload')),
        h('p', { class: 'howto' }, t('menu.howTo')),
        h('p', { class: 'hint' }, t('menu.difficulty', { difficulty: sim.state.difficulty ?? 'normal' })),
        h('p', { class: 'hint keys' }, t('menu.keys')),
        langSwitch(),
      ),
      h('button', { class: 'btn primary', onclick: () => closeModal() }, t('menu.resume')),
    );
  }

  /** Barra de volumen de un canal (0-100 %). `preview` suena al soltarla para oir el nivel. */
  function volumeRow(label: string, value: number, set: (v: number) => void, preview?: () => void): HTMLElement {
    const pctText = h('b', { class: 'qty-num' }, `${Math.round(value * 100)} %`);
    const input = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(value * 100), class: 'qty-range', 'aria-label': label }) as HTMLInputElement;
    const paint = () => {
      input.style.setProperty('--fill', `${input.value}%`);
      pctText.textContent = `${input.value} %`;
    };
    input.addEventListener('input', () => {
      paint();
      set(Number(input.value) / 100);
    });
    if (preview) input.addEventListener('change', preview);
    paint();
    return h('label', { class: 'volume-row' }, h('span', {}, label), h('div', { class: 'qty-line' }, input, pctText));
  }

  function plantView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'plant' }>;
    const s = sim.state;
    const plot = s.plots[`${m.x},${m.y}`];
    const fert = plot?.fertility ?? 1;
    const tired = fert < PROGRESSION.fertility.tiredBelow;
    return h(
      'div',
      { class: 'sheet compact' },
      h('h2', {}, t('plant.title')),
      plot &&
        h(
          'p',
          { class: `plant-soil ${tired ? 'warn-text' : ''}` },
          t(tired ? 'plant.soilTired' : 'plant.soil', { pct: Math.round(fert * 100) }),
          plot.last ? ` ${t('plant.last', { crop: plot.last })}` : '',
        ),
      h(
        'div',
        { class: 'choice-list' },
        ...m.crops.map((c) => {
          const def = CROPS[c];
          return h(
            'button',
            {
              class: 'choice',
              disabled: s.coins < def.seedCost,
              onclick: () => {
                closeModal();
                sim.plant(m.x, m.y, c);
              },
            },
            icon(PRODUCTS[def.product].icon, 'icon big'),
            h(
              'span',
              { class: 'choice-text' },
              h('b', {}, t(`product.${def.product}`)),
              h('small', {}, t('plant.detail', { days: def.growDays, yield: Math.max(1, Math.round(def.yield * fert)) })),
              plot?.last === c && h('small', { class: 'warn-text' }, t('plant.repeat')),
            ),
            h('span', { class: 'choice-cost' }, icon('icon_coin'), String(def.seedCost)),
          );
        }),
      ),
      h('button', { class: 'btn', onclick: () => closeModal() }, t('plant.cancel')),
    );
  }

  function landView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'land' }>;
    return h(
      'div',
      { class: 'sheet compact' },
      h('h2', {}, t('land.title')),
      h('p', { class: 'howto plain' }, t('land.text', { cost: m.cost })),
      h(
        'div',
        { class: 'stack' },
        h('button', {
          class: 'btn primary',
          onclick: () => {
            closeModal();
            sim.buyLand(m.x, m.y);
          },
        }, t('land.buy', { cost: m.cost })),
        h('button', { class: 'btn', onclick: () => closeModal() }, t('land.cancel')),
      ),
    );
  }

  function leaseView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'lease' }>;
    return h(
      'div',
      { class: 'sheet compact' },
      h('h2', {}, t('lease.title')),
      h('p', { class: 'howto plain' }, t('lease.text', { rent: PROGRESSION.lands.rentPerSeason })),
      h(
        'div',
        { class: 'stack' },
        h('button', {
          class: 'btn primary',
          disabled: sim.state.coins < m.cost,
          onclick: () => {
            closeModal();
            sim.lease(m.x, m.y);
          },
        }, t('lease.buy', { cost: m.cost })),
        h('button', { class: 'btn', onclick: () => closeModal() }, t('lease.cancel')),
      ),
    );
  }

  function levelUpView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'levelup' }>;
    const u = unlocksAt(m.level);
    const items: string[] = [];
    if (u.rank) items.push(t('levelup.rank', { rank: u.rank }));
    for (const c of u.crops) items.push(t('levelup.unlock.crop', { name: t(`product.${CROPS[c].product}`) }));
    for (const f of u.features) items.push(featureText(f));
    if (u.maxPlots) items.push(t('levelup.maxPlots', { max: u.maxPlots }));
    for (const up of u.upgrades) items.push(t('progress.unlock.upgrade', { building: up.building, upgrade: up.id, cost: up.cost }));
    for (const tl of u.tools) items.push(t('progress.unlock.tool', { tier: t(`tool.tier.${tl.tier}`), cost: tl.cost }));
    for (const w of u.workshops) items.push(t('progress.unlock.workshop', { workshop: w.id, cost: w.cost }));
    return h(
      'div',
      { class: `sheet levelup ${u.rank ? 'rank-up' : ''}` },
      h('div', { class: 'level-seal' }, String(m.level)),
      h('h2', {}, t('levelup.title', { level: m.level })),
      h('p', { class: 'tagline' }, t(`rank.${u.rank ?? sim.state.rank}`)),
      items.length > 0 && h('ul', { class: 'unlocks' }, ...items.map((i) => h('li', {}, i))),
      h(
        'div',
        { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => closeModal() }, t('levelup.continue')),
        h('button', { class: 'btn small', onclick: () => openModal({ kind: 'progress', tab: 'levels' }) }, t('hud.progress')),
      ),
    );
  }

  function effectsLine(opt: EventOptionDef): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(opt.cost ?? {})) parts.push(`−${v} ${k === 'coins' ? t('hud.coins').toLowerCase() : t(`product.${k}`).toLowerCase()}`);
    const fx = opt.effects ?? {};
    if (fx.xp) parts.push(t('fx.xp', { n: fx.xp }));
    if (fx.coins && fx.coins < 0) parts.push(t('fx.coinsLose'));
    if (fx.villagers) parts.push(t('fx.villager'));
    if (fx.marketBoost) parts.push(t('fx.boost', { mult: fx.marketBoost.mult, days: fx.marketBoost.days }));
    if (fx.sellAll) parts.push(t('fx.sellAll', { mult: fx.sellAll.mult }));
    if (fx.herds?.chicken && fx.herds.chicken > 0) parts.push(t('fx.hen'));
    if (fx.seedVouchers) parts.push(t('fx.vouchers', { n: fx.seedVouchers }));
    const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    if (fx.prestige) parts.push(t('fx.prestige', { n: signed(fx.prestige) }));
    for (const [e, n] of Object.entries(fx.rep ?? {})) if (n) parts.push(t('fx.rep', { estate: e, n: signed(n) }));
    if (fx.modifier) {
      const m = fx.modifier;
      if (m.kind === 'idle') parts.push(t('fx.away', { n: m.days ?? 0 }));
      else {
        const duration = m.seasons ? t('fx.seasons') : t('fx.days', { n: m.days ?? 0 });
        parts.push(t('fx.modifier', { text: t(`modifier.${m.kind}`, { pct: Math.round(m.value * 100) }), duration }));
      }
    }
    if (opt.risk) {
      const r = opt.risk.effects;
      let what = '';
      if (r.soldiers) what = t('fx.loseSoldier');
      else if (r.herds?.chicken) what = t('fx.loseHen');
      else if (r.loseFraction) what = t('fx.loseStock');
      else if (r.cropSetback) what = t('fx.setback');
      else if (r.modifier) what = t(`modifier.${r.modifier.kind}`, { pct: Math.round(r.modifier.value * 100) });
      parts.push(`${t('fx.riskChance', { pct: Math.round(opt.risk.chance * 100) })}${what ? `: ${what}` : ''}`);
    }
    return parts.join(' · ');
  }

  function eventView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'event' }>;
    const ev = EVENTS[m.id];
    const s = sim.state;
    const head = [
      h('div', { class: 'event-seal' }, icon(ev.icon, 'event-icon')),
      h('span', { class: `event-cat cat-${ev.category}` }, t(`event.cat.${ev.category}`)),
      h('h2', {}, t(`event.${m.id}.title`)),
    ];
    if (m.result) {
      return h(
        'div',
        { class: 'sheet event' },
        ...head,
        h('p', { class: 'event-text' }, t(m.result.msg, m.result.params)),
        h('button', { class: 'btn primary', onclick: () => closeModal() }, t('event.ok')),
      );
    }
    return h(
      'div',
      { class: 'sheet event' },
      ...head,
      h('p', { class: 'event-text' }, t(`event.${m.id}.text`)),
      h(
        'div',
        { class: 'stack' },
        ...ev.options.map((opt) => {
          const line = effectsLine(opt);
          return h(
            'button',
            {
              class: 'btn option',
              disabled: !optionAvailable(s, opt),
              onclick: () => {
                let result: CommandResult | undefined;
                const off = sim.on((e) => {
                  if (e.type === 'result') result = e.result;
                });
                sim.chooseEventOption(opt.id);
                off();
                if (modal?.kind === 'event') {
                  modal = { ...modal, result };
                  renderModal();
                }
              },
            },
            t(`event.${m.id}.opt.${opt.id}`),
            line && h('small', {}, line),
          );
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- acciones de partida
  function startWith(fn: () => void): void {
    modal = null;
    overlay.hidden = true;
    overlay.replaceChildren();
    queue.length = 0;
    fn();
    music.start(); // este clic es el gesto que los navegadores exigen para reproducir sonido
    fanfare.start();
    setSpeed(1); // el tiempo corre desde el primer momento; espacio o el boton de pausa lo paran
    // Salvo durante la bienvenida del tutorial, que espera a que el jugador pulse Empezar.
    if (sim.state.tutorial.step === 'welcome') sim.setSpeed(0);
    tipShown = null;
    renderHud();
    onLayout();
  }

  function newGame(): void {
    forgetLinkedFile();
    const name = answers.name?.trim() || randomName();
    const full = TRAITS.questions.every((q) => answers[q.id]);
    sim.replaceState(createNewGame(undefined, pickedDifficulty, full ? ({ ...answers, name } as CharacterAnswers) : undefined));
  }

  async function saveFlow(saveAs: boolean): Promise<void> {
    const outcome = await saveGame(sim.state, saveAs);
    const key = { saved: 'save.saved', downloaded: 'save.downloaded', cancelled: 'save.cancelled', error: 'save.error.write' }[outcome];
    toast(t(key), outcome === 'error' ? 'warn' : outcome === 'cancelled' ? 'quiet' : 'good');
    if (modal?.kind === 'menu') renderModal();
  }

  async function loadFlow(fromStart: boolean): Promise<void> {
    try {
      const state = await loadGameFromFile();
      if (!state) return;
      if (fromStart) startWith(() => sim.replaceState(state));
      else {
        queue.length = 0;
        closeModal();
        sim.replaceState(state);
      }
      toast(t('save.loaded'));
    } catch (err) {
      const reason = err instanceof SaveError ? err.reason : 'invalid';
      toast(t(`save.error.${reason}`), 'warn');
    }
  }

  onLangChange(() => {
    renderHud();
    renderModal();
    onLayout();
  });

  document.documentElement.lang = getLang();
  renderHud();
  renderModal();

  return {
    getInsets: () => {
      const vh = window.innerHeight;
      // En pantallas anchas los botones inferiores van en una esquina y no tapan la granja.
      const narrow = window.innerWidth < 760;
      return {
        top: topbar.getBoundingClientRect().bottom,
        bottom: narrow ? vh - bottombar.getBoundingClientRect().top : 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      };
    },
  };
}
