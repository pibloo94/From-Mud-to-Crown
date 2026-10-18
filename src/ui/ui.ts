// Interfaz HTML encima del lienzo: barra superior, controles de tiempo, mercado, menu y avisos.
import type { Game } from '../sim/game';
import { createNewGame } from '../sim/state';
import { PRODUCTS, PRODUCT_IDS } from '../sim/data';
import { dateFromDay } from '../sim/calendar';
import type { CommandResult, ProductId, Speed } from '../sim/types';
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n/i18n';
import { autosave, forgetLinkedFile, hasLinkedFile, loadGameFromFile, readBackup, saveGame, supportsFilePicker } from '../save/storage';
import { SaveError } from '../save/serialize';
import type { Insets } from '../render/FarmScene';
import { h, icon } from './dom';

const AUTOSAVE_EVERY_DAYS = 3;
const SPEEDS: Speed[] = [0, 1, 2, 3];

export interface UI {
  getInsets: () => Insets;
}

export function createUI(sim: Game, root: HTMLElement, onLayout: () => void): UI {
  let lastSpeed: Speed = 1;
  let modal: 'start' | 'menu' | 'market' | null = 'start';
  let speedBeforeModal: Speed = 0;
  let confirmingNew = false;

  // ---------------------------------------------------------------- barra superior
  const dateText = h('span', { class: 'date-text' });
  const pausedPill = h('span', { class: 'paused-pill' });
  const dayBar = h('span', { class: 'day-bar-fill' });
  const dateBox = h('div', { class: 'date-box panel' }, h('div', { class: 'date-line' }, dateText, pausedPill), h('div', { class: 'day-bar' }, dayBar));

  const amounts = new Map<string, HTMLElement>();
  const chip = (id: string, iconName: string) => {
    const n = h('b', {}, '0');
    amounts.set(id, n);
    return h('div', { class: 'chip', 'data-res': id }, icon(iconName), n);
  };
  const resources = h('div', { class: 'resources panel' }, chip('coins', 'icon_coin'), ...PRODUCT_IDS.map((p) => chip(p, PRODUCTS[p].icon)));

  const speedButtons = SPEEDS.map((sp) =>
    h('button', { class: 'speed-btn', 'data-speed': sp, onclick: () => setSpeed(sp) }, sp === 0 ? '❚❚' : '▶'.repeat(sp)),
  );
  const speedBox = h('div', { class: 'speed panel', role: 'group' }, ...speedButtons);

  const topbar = h('header', { class: 'topbar' }, dateBox, resources, speedBox);

  // ---------------------------------------------------------------- barra inferior
  const marketBtn = h('button', { class: 'big-btn', onclick: () => openModal('market') }, icon('icon_coin'), h('span', {}));
  const menuBtn = h('button', { class: 'big-btn', onclick: () => openModal('menu') }, h('span', { class: 'burger' }, '☰'), h('span', {}));
  const bottombar = h('footer', { class: 'bottombar' }, marketBtn, menuBtn);

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'overlay', hidden: true });

  root.append(topbar, bottombar, toasts, overlay);

  // ---------------------------------------------------------------- tiempo
  function setSpeed(sp: Speed): void {
    if (sp !== 0) lastSpeed = sp;
    sim.setSpeed(sp);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape' && modal && modal !== 'start') {
      closeModal();
      return;
    }
    if (modal) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setSpeed(sim.state.speed === 0 ? lastSpeed : 0);
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      setSpeed(Number(e.key) as Speed);
    } else if (e.key.toLowerCase() === 'm') {
      openModal('market');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (sim.state.speed !== 0 && !modal) setSpeed(0);
      void autosave(sim.state);
    }
  });
  window.addEventListener('pagehide', () => void autosave(sim.state));

  // ---------------------------------------------------------------- eventos de la simulacion
  sim.on((e) => {
    if (e.type === 'change') renderHud();
    if (e.type === 'day' && e.day % AUTOSAVE_EVERY_DAYS === 0) {
      void autosave(sim.state).then((wrote) => wrote && toast(t('save.autosaved'), 'quiet'));
    }
    if (e.type === 'openMarket') openModal('market');
    if (e.type === 'result') onResult(e.result, e.x !== undefined);
  });

  function onResult(r: CommandResult, hasTile: boolean): void {
    const shownOnMap = r.ok && hasTile && (r.params?.amount !== undefined || r.msg === 'msg.planted');
    const text = t(r.msg, r.params);
    if (!shownOnMap && text) toast(text, r.ok ? 'good' : 'warn');
    if (modal === 'market') renderModal();
  }

  // ---------------------------------------------------------------- avisos
  function toast(text: string, kind: 'good' | 'warn' | 'quiet' = 'good'): void {
    const el = h('div', { class: `toast toast-${kind}` }, text);
    toasts.append(el);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ---------------------------------------------------------------- pintar HUD
  function renderHud(): void {
    const s = sim.state;
    const d = dateFromDay(s.day);
    dateText.textContent = t('date.format', { season: t(`season.${d.season}`), day: d.dayOfSeason, year: d.year });
    dayBar.style.width = `${Math.round(s.dayProgress * 100)}%`;
    pausedPill.textContent = t('hud.paused');
    pausedPill.hidden = s.speed !== 0;
    amounts.get('coins')!.textContent = String(s.coins);
    for (const p of PRODUCT_IDS) amounts.get(p)!.textContent = String(s.inventory[p]);
    speedButtons.forEach((b, i) => {
      b.classList.toggle('active', SPEEDS[i] === s.speed);
      b.title = SPEEDS[i] === 0 ? t('hud.pause') : `x${SPEEDS[i]}`;
      b.setAttribute('aria-pressed', String(SPEEDS[i] === s.speed));
    });
    resources.querySelector<HTMLElement>('[data-res="coins"]')!.title = t('hud.coins');
    for (const p of PRODUCT_IDS) resources.querySelector<HTMLElement>(`[data-res="${p}"]`)!.title = t(`product.${p}`);
    marketBtn.lastElementChild!.textContent = t('hud.market');
    menuBtn.lastElementChild!.textContent = t('hud.menu');
  }

  // ---------------------------------------------------------------- ventanas
  function openModal(which: 'start' | 'menu' | 'market'): void {
    if (!modal) speedBeforeModal = sim.state.speed;
    modal = which;
    // El menu pausa el juego; el mercado no (como en CK3, el tiempo sigue mientras compras y vendes).
    if (which !== 'market') sim.setSpeed(0);
    renderModal();
  }

  function closeModal(): void {
    const was = modal;
    confirmingNew = false;
    modal = null;
    overlay.hidden = true;
    overlay.replaceChildren();
    if (was === 'menu' && speedBeforeModal !== 0) sim.setSpeed(speedBeforeModal);
  }

  function renderModal(): void {
    if (!modal) return;
    overlay.hidden = false;
    const body = modal === 'start' ? startView() : modal === 'menu' ? menuView() : marketView();
    overlay.replaceChildren(body);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && modal !== 'start') closeModal();
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
      ),
      h('p', { class: 'hint' }, t(supportsFilePicker() ? 'menu.saveHintFile' : 'menu.saveHintDownload')),
      h('p', { class: 'howto' }, t('menu.howTo')),
      h('p', { class: 'hint keys' }, t('menu.keys')),
      langSwitch(),
    );
  }

  function marketView(): HTMLElement {
    const s = sim.state;
    const rows = PRODUCT_IDS.map((p: ProductId) => {
      const have = s.inventory[p];
      return h(
        'div',
        { class: 'market-row' },
        icon(PRODUCTS[p].icon, 'icon big'),
        h('div', { class: 'market-info' }, h('b', {}, t(`product.${p}`)), h('small', {}, `${t('market.stock', { n: have })} · ${t('market.price', { price: PRODUCTS[p].price })}`)),
        h('button', { class: 'btn small', disabled: have <= 0, onclick: () => sim.sell(p, 1) }, t('market.sell1')),
        h('button', { class: 'btn small primary', disabled: have <= 0, onclick: () => sim.sell(p, 'all') }, t('market.sellAll')),
      );
    });
    return h(
      'div',
      { class: 'sheet market' },
      h('h2', {}, t('market.title')),
      h('p', { class: 'tagline' }, t('market.subtitle')),
      ...rows,
      h('div', { class: 'market-foot' }, h('span', { class: 'chip' }, icon('icon_coin'), h('b', {}, String(s.coins))), h('button', { class: 'btn', onclick: () => closeModal() }, t('market.close'))),
    );
  }

  // ---------------------------------------------------------------- acciones de partida
  function startWith(fn: () => void): void {
    fn();
    modal = null;
    overlay.hidden = true;
    overlay.replaceChildren();
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
    if (modal === 'menu') renderModal();
  }

  async function loadFlow(fromStart: boolean): Promise<void> {
    try {
      const state = await loadGameFromFile();
      if (!state) return;
      if (fromStart) startWith(() => sim.replaceState(state));
      else {
        sim.replaceState(state);
        closeModal();
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
