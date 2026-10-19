// Interfaz HTML encima del lienzo: barra superior, controles de tiempo, ventanas, tarjetas y avisos.
import type { Game } from '../sim/game';
import { createNewGame } from '../sim/state';
import { CROPS, EVENTS, MATERIALS, MATERIAL_IDS, PRODUCTS, PRODUCT_IDS, PROGRESSION, WORKSHOPS, type EventOptionDef } from '../sim/data';
import { builtWorkshops } from '../sim/workshops';
import { dateFromDay } from '../sim/calendar';
import { levelProgress, nextLevelXp, unlocksAt } from '../sim/progress';
import { storageCapacity, storageUsed } from '../sim/buildings';
import { beds, foodDays } from '../sim/villagers';
import { activeModifiers } from '../sim/modifiers';
import { materialUnlocked } from '../sim/materials';
import {
  buildingView,
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
import type { BuildingId, CommandResult, CropId, RankId, Speed, WorkshopId } from '../sim/types';
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n/i18n';
import { autosave, forgetLinkedFile, hasLinkedFile, loadGameFromFile, readBackup, saveGame, supportsFilePicker } from '../save/storage';
import { SaveError } from '../save/serialize';
import type { Insets } from '../render/FarmScene';
import { h, icon } from './dom';
import { marketView, type MarketTab } from './market';
import { siteView, workshopView } from './workshops';
import { music } from '../audio/music';

const AUTOSAVE_EVERY_DAYS = 3;
const SPEEDS: Speed[] = [0, 1, 2, 3];

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
  | { kind: 'progress'; tab: ProgressTab }
  | { kind: 'levelup'; level: number }
  | { kind: 'season'; params: Record<string, string | number> }
  | { kind: 'rank'; rank: RankId }
  | { kind: 'event'; id: string; result?: CommandResult };

/** Todas las ventanas detienen el tiempo mientras estan abiertas; al cerrarlas vuelve la velocidad anterior. */
const PAUSES: Modal['kind'][] = ['start', 'menu', 'market', 'plant', 'land', 'lease', 'building', 'site', 'workshop', 'progress', 'levelup', 'season', 'rank', 'event'];
/** Ventanas que se cierran con Escape o tocando fuera. */
const DISMISSABLE: Modal['kind'][] = ['menu', 'market', 'plant', 'land', 'lease', 'building', 'site', 'workshop', 'progress'];
/** Ventanas desde las que se puede ir a otra y volver con "Atras". */
const NAVIGABLE: Modal['kind'][] = ['market', 'building', 'workshop', 'site', 'progress', 'levelup'];

export function createUI(sim: Game, root: HTMLElement, onLayout: () => void): UI {
  let lastSpeed: Speed = 1;
  let modal: Modal | null = { kind: 'start' };
  let speedBeforeModal: Speed = 0;
  let confirmingNew = false;
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
    { class: 'level-box', onclick: () => openModal({ kind: 'progress', tab: 'levels' }) },
    h('span', { class: 'level-shield' }, levelNum),
    h('div', { class: 'level-info' }, rankText, h('span', { class: 'xp-bar' }, xpFill), xpText),
  );

  const amounts = new Map<string, HTMLElement>();
  const chip = (id: string, iconName: string) => {
    const n = h('b', {}, '0');
    amounts.set(id, n);
    return h('div', { class: 'chip', 'data-res': id }, icon(iconName), n);
  };
  const resources = h(
    'div',
    { class: 'resources panel' },
    levelBox,
    chip('coins', 'icon_coin'),
    ...PRODUCT_IDS.map((p) => chip(p, PRODUCTS[p].icon)),
  );

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
  const materialsInner = h('span', { class: 'status-inner' });
  const materialsPill = h('button', { class: 'status-pill', onclick: () => openModal({ kind: 'market', tab: 'buy' }) }, materialsInner);
  const modsBox = h('div', { class: 'mods' });
  const statusRow = h('div', { class: 'status-row' }, storagePill, villagersPill, materialsPill, modsBox);

  const speedButtons = SPEEDS.map((sp) =>
    h('button', { class: 'speed-btn', 'data-speed': sp, onclick: () => setSpeed(sp) }, sp === 0 ? '❚❚' : '▶'.repeat(sp)),
  );
  // El reloj y sus controles van juntos, a la izquierda.
  const timeBox = h('div', { class: 'time-box panel' }, dateBox, h('div', { class: 'speed', role: 'group' }, ...speedButtons));

  const topbar = h('header', { class: 'topbar' }, timeBox, resources, statusRow);
  // En escritorio el reloj baja a la esquina inferior izquierda y la fila de estado sube a la barra superior.
  const timeDock = h('div', { class: 'time-dock' });

  // ---------------------------------------------------------------- barra inferior
  const marketBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'market', tab: 'sell' }) }, icon('icon_coin'), h('span', {}));
  const progressBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'progress', tab: 'levels' }) }, icon('icon_scroll'), h('span', {}));
  const menuBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'menu' }) }, h('span', { class: 'burger' }, '☰'), h('span', {}));
  const bottombar = h('footer', { class: 'bottombar' }, marketBtn, progressBtn, menuBtn);

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'overlay', hidden: true });

  root.append(topbar, timeDock, bottombar, toasts, overlay);

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
      case 'workshop':
        openModal({ kind: 'workshop', workshop: e.workshop });
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
    if (modal && ['market', 'building', 'progress', 'workshop', 'site'].includes(modal.kind)) renderModal();
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
  function renderHud(): void {
    const s = sim.state;
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
    xpText.textContent = next === null ? t('hud.xpMax', { xp }) : t('hud.xp', { xp, next });
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
    materialsInner.replaceChildren(
      ...MATERIAL_IDS.filter((m) => materialUnlocked(s, m) || s.materials[m] > 0).flatMap((m) => [icon(MATERIALS[m].icon), h('b', {}, String(s.materials[m]))]),
    );
    materialsPill.title = t('hud.materials');
    materialsPill.setAttribute('aria-label', `${t('hud.materials')}: ${MATERIAL_IDS.map((m) => `${s.materials[m]} ${t(`material.${m}`)}`).join(', ')}`);
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
    marketBtn.lastElementChild!.textContent = t('hud.market');
    progressBtn.lastElementChild!.textContent = t('hud.progress');
    menuBtn.lastElementChild!.textContent = t('hud.menu');
  }

  // ---------------------------------------------------------------- ventanas y tarjetas
  /** Ventanas anteriores, para volver atras (p. ej. Progreso -> Casa -> atras). */
  const history: Modal[] = [];
  const pageKey = (m: Modal) => (m.kind === 'building' ? `building:${m.building}` : m.kind === 'workshop' ? `workshop:${m.workshop}` : m.kind);

  function openModal(next: Modal): void {
    if (modal?.kind === 'start') return;
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
    renderModal();
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
      renderModal();
      return;
    }
    if (was && was.kind !== 'start' && PAUSES.includes(was.kind) && speedBeforeModal !== 0) sim.setSpeed(speedBeforeModal);
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
      levelup: levelUpView,
      season: () => seasonView(panelCtx, (modal as Extract<Modal, { kind: 'season' }>).params),
      rank: () => rankView(panelCtx, (modal as Extract<Modal, { kind: 'rank' }>).rank),
      event: eventView,
    };
    // Al repintar la misma ventana se conserva el desplazamiento (p. ej. al mejorar algo de la lista).
    const prevBody = overlay.querySelector<HTMLElement>('.progress-body');
    const keepScroll = overlay.dataset.view === viewKey(modal) ? { overlay: overlay.scrollTop, body: prevBody?.scrollTop ?? 0 } : null;
    const view = views[modal.kind]();
    if (history.length > 0 && view.classList.contains('sheet')) {
      view.classList.add('has-back');
      view.prepend(h('button', { class: 'back-btn', 'aria-label': t('panel.back'), onclick: () => goBack() }, '‹ ', t('panel.back')));
    }
    overlay.replaceChildren(view);
    overlay.className = `overlay overlay-${modal.kind}`;
    overlay.dataset.view = viewKey(modal);
    if (keepScroll) {
      overlay.scrollTop = keepScroll.overlay;
      const body = overlay.querySelector<HTMLElement>('.progress-body');
      if (body) body.scrollTop = keepScroll.body;
    } else if (modal.kind === 'progress' && modal.tab === 'levels') {
      scrollTreeToCurrent(overlay);
    }
  }

  function viewKey(m: Modal): string {
    if (m.kind === 'building') return `building:${m.building}:${m.tab}`;
    if (m.kind === 'progress') return `progress:${m.tab}`;
    if (m.kind === 'market') return `market:${m.tab}`;
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
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && modal && DISMISSABLE.includes(modal.kind)) closeModal();
  });

  function langSwitch(): HTMLElement {
    const btn = (lang: Lang, label: string) =>
      h('button', { class: `lang-btn ${getLang() === lang ? 'active' : ''}`, onclick: () => setLang(lang) }, label);
    return h('div', { class: 'lang', role: 'group', 'aria-label': t('menu.language') }, btn('es', 'ES'), btn('en', 'EN'));
  }

  function startView(): HTMLElement {
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
        h('button', { class: `btn ${backup ? '' : 'primary'}`, onclick: () => startWith(() => newGame()) }, t('menu.newGame')),
        h('button', { class: 'btn', onclick: () => void loadFlow(true) }, t('menu.load')),
      ),
      h('p', { class: 'howto' }, t('menu.howTo')),
      langSwitch(),
    );
  }

  function confirmNewView(): HTMLElement {
    return h(
      'div',
      { class: 'sheet' },
      h('h2', {}, t('menu.newGame')),
      h('p', { class: 'howto' }, t('menu.confirmNew')),
      h(
        'div',
        { class: 'stack' },
        h('button', {
          class: 'btn primary',
          onclick: () => {
            confirmingNew = false;
            newGame();
            queue.length = 0;
            closeModal();
            setSpeed(1);
          },
        }, t('menu.confirmYes')),
        h('button', { class: 'btn', onclick: () => ((confirmingNew = false), renderModal()) }, t('menu.cancel')),
      ),
    );
  }

  function menuView(): HTMLElement {
    if (confirmingNew) return confirmNewView();
    return h(
      'div',
      { class: 'sheet' },
      h('h2', {}, t('menu.title')),
      h(
        'div',
        { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => closeModal() }, t('menu.resume')),
        h('button', { class: 'btn', onclick: () => void saveFlow(false) }, t('menu.save')),
        supportsFilePicker() && hasLinkedFile() && h('button', { class: 'btn', onclick: () => void saveFlow(true) }, t('menu.saveAs')),
        h('button', { class: 'btn', onclick: () => void loadFlow(false) }, t('menu.load')),
        h('button', { class: 'btn danger', onclick: () => ((confirmingNew = true), renderModal()) }, t('menu.newGame')),
        h(
          'button',
          {
            class: 'btn',
            'aria-pressed': String(music.isEnabled()),
            onclick: () => {
              music.setEnabled(!music.isEnabled());
              renderModal();
            },
          },
          t(music.isEnabled() ? 'menu.musicOn' : 'menu.musicOff'),
        ),
      ),
      h('p', { class: 'hint' }, t(supportsFilePicker() ? 'menu.saveHintFile' : 'menu.saveHintDownload')),
      h('p', { class: 'howto' }, t('menu.howTo')),
      h('p', { class: 'hint keys' }, t('menu.keys')),
      langSwitch(),
    );
  }

  function plantView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'plant' }>;
    const s = sim.state;
    return h(
      'div',
      { class: 'sheet compact' },
      h('h2', {}, t('plant.title')),
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
            h('span', { class: 'choice-text' }, h('b', {}, t(`product.${def.product}`)), h('small', {}, t('plant.detail', { days: def.growDays, yield: def.yield }))),
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
    for (const f of u.features) items.push(t(`levelup.unlock.${f}`));
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
    if (fx.rep?.baron) parts.push(t('fx.repBaron', { n: signed(fx.rep.baron) }));
    if (fx.rep?.village) parts.push(t('fx.repVillage', { n: signed(fx.rep.village) }));
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
      if (r.herds?.chicken) what = t('fx.loseHen');
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
    setSpeed(1); // el tiempo corre desde el primer momento; espacio o el boton ❚❚ lo pausan
    renderHud();
    onLayout();
  }

  function newGame(): void {
    forgetLinkedFile();
    sim.replaceState(createNewGame());
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
