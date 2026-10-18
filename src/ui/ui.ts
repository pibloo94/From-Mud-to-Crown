// Interfaz HTML encima del lienzo: barra superior, controles de tiempo, ventanas, tarjetas y avisos.
import type { Game } from '../sim/game';
import { createNewGame } from '../sim/state';
import { ANIMAL_IDS, CROPS, EVENTS, PRODUCTS, PRODUCT_IDS, PROGRESSION, type EventOptionDef } from '../sim/data';
import { dateFromDay } from '../sim/calendar';
import { hasFeature, levelProgress, nextLevelXp, rankOf, unlocksAt } from '../sim/progress';
import { boostActive, priceOf, priceTrend } from '../sim/market';
import { optionAvailable } from '../sim/events';
import type { AnimalId, CommandResult, CropId, ProductId, Speed } from '../sim/types';
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n/i18n';
import { autosave, forgetLinkedFile, hasLinkedFile, loadGameFromFile, readBackup, saveGame, supportsFilePicker } from '../save/storage';
import { SaveError } from '../save/serialize';
import type { Insets } from '../render/FarmScene';
import { h, icon } from './dom';
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
  | { kind: 'market' }
  | { kind: 'plant'; x: number; y: number; crops: CropId[] }
  | { kind: 'land'; x: number; y: number; cost: number }
  | { kind: 'levelup'; level: number }
  | { kind: 'event'; id: string; result?: CommandResult };

/** Todas las ventanas detienen el tiempo mientras estan abiertas; al cerrarlas vuelve la velocidad anterior. */
const PAUSES: Modal['kind'][] = ['start', 'menu', 'market', 'plant', 'land', 'levelup', 'event'];

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
  const dateBox = h('div', { class: 'date-box panel' }, h('div', { class: 'date-line' }, dateText, pausedPill), h('div', { class: 'day-bar' }, dayBar));

  const levelNum = h('span', { class: 'level-num' });
  const rankText = h('span', { class: 'rank-text' });
  const xpFill = h('span', { class: 'xp-fill' });
  const xpText = h('span', { class: 'xp-text' });
  const levelBox = h(
    'div',
    { class: 'level-box' },
    h('span', { class: 'level-shield' }, levelNum),
    h('div', { class: 'level-info' }, rankText, h('span', { class: 'xp-bar' }, xpFill), xpText),
  );

  const amounts = new Map<string, HTMLElement>();
  const chip = (id: string, iconName: string) => {
    const n = h('b', {}, '0');
    amounts.set(id, n);
    return h('div', { class: 'chip', 'data-res': id }, icon(iconName), n);
  };
  const workersChip = chip('workers', 'icon_worker');
  const resources = h(
    'div',
    { class: 'resources panel' },
    levelBox,
    chip('coins', 'icon_coin'),
    ...PRODUCT_IDS.map((p) => chip(p, PRODUCTS[p].icon)),
    workersChip,
  );

  const speedButtons = SPEEDS.map((sp) =>
    h('button', { class: 'speed-btn', 'data-speed': sp, onclick: () => setSpeed(sp) }, sp === 0 ? '❚❚' : '▶'.repeat(sp)),
  );
  const speedBox = h('div', { class: 'speed panel', role: 'group' }, ...speedButtons);

  const topbar = h('header', { class: 'topbar' }, dateBox, resources, speedBox);

  // ---------------------------------------------------------------- barra inferior
  const marketBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'market' }) }, icon('icon_coin'), h('span', {}));
  const menuBtn = h('button', { class: 'big-btn', onclick: () => openModal({ kind: 'menu' }) }, h('span', { class: 'burger' }, '☰'), h('span', {}));
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
    if (e.key === 'Escape' && modal && ['menu', 'market', 'plant', 'land'].includes(modal.kind)) {
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
      openModal({ kind: 'market' });
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
        openModal({ kind: 'market' });
        break;
      case 'choosePlant':
        openModal({ kind: 'plant', x: e.x, y: e.y, crops: e.crops });
        break;
      case 'offerLand':
        openModal({ kind: 'land', x: e.x, y: e.y, cost: e.cost });
        break;
      case 'levelUp':
        showCard({ kind: 'levelup', level: e.level });
        break;
      case 'event':
        showCard({ kind: 'event', id: e.id });
        break;
      case 'notice':
        toast(t(e.notice.msg, e.notice.params), e.notice.ok ? 'good' : 'warn');
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
    if (modal?.kind === 'market') renderModal();
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
    dateText.textContent = t('date.format', { season: t(`season.${d.season}`), day: d.dayOfSeason, year: d.year });
    dayBar.style.width = `${Math.round(s.dayProgress * 100)}%`;
    pausedPill.textContent = t('hud.paused');
    pausedPill.hidden = s.speed !== 0;

    levelNum.textContent = String(s.level);
    rankText.textContent = t(`rank.${rankOf(s.level)}`);
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
      resources.querySelector<HTMLElement>(`[data-res="${p}"]`)!.hidden = !!crop && s.level < crop.unlockLevel && s.inventory[p] === 0;
    }
    amounts.get('workers')!.textContent = String(s.workers);
    workersChip.hidden = s.workers === 0;
    workersChip.title = t('hud.workers');

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

  // ---------------------------------------------------------------- ventanas y tarjetas
  function openModal(next: Modal): void {
    if (modal?.kind === 'start') return;
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

  function closeModal(): void {
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
      market: marketView,
      plant: plantView,
      land: landView,
      levelup: levelUpView,
      event: eventView,
    };
    overlay.replaceChildren(views[modal.kind]());
    overlay.className = `overlay overlay-${modal.kind}`;
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && modal && ['menu', 'market', 'plant', 'land'].includes(modal.kind)) closeModal();
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

  function trendMark(p: ProductId): HTMLElement | null {
    const tr = priceTrend(sim.state, p);
    if (tr === 0) return null;
    return h('span', { class: `trend trend-${tr > 0 ? 'up' : 'down'}`, title: t(tr > 0 ? 'market.trendUp' : 'market.trendDown') }, tr > 0 ? '▲' : '▼');
  }

  function marketView(): HTMLElement {
    const s = sim.state;
    const products = PRODUCT_IDS.filter((p) => s.inventory[p] > 0 || !Object.values(CROPS).some((c) => c.product === p && s.level < c.unlockLevel));
    const rows = products.map((p: ProductId) => {
      const have = s.inventory[p];
      const price = priceOf(s, p);
      return h(
        'div',
        { class: 'market-row' },
        icon(PRODUCTS[p].icon, 'icon big'),
        h(
          'div',
          { class: 'market-info' },
          h('b', {}, t(`product.${p}`)),
          h('small', {}, h('span', { class: 'nowrap' }, t('market.stock', { n: have })), ' · ', h('span', { class: 'price nowrap' }, t('market.price', { price }), ' ', trendMark(p))),
        ),
        h('button', { class: 'btn small', disabled: have <= 0, onclick: () => sim.sell(p, 1) }, t('market.sell1')),
        h('button', { class: 'btn small primary', disabled: have <= 0, onclick: () => sim.sell(p, 'all') }, t('market.sellAll')),
      );
    });
    const livestock = ANIMAL_IDS.map((a: AnimalId) => {
      const offer = PROGRESSION.animalsForSale[a];
      const unlocked = hasFeature(s, offer.unlock);
      const unlockLevel = PROGRESSION.levels.findIndex((l) => l.unlocks?.includes(offer.unlock)) + 1;
      const count = s.herds[a].count;
      return h(
        'div',
        { class: `market-row ${unlocked ? '' : 'locked'}` },
        icon(a === 'chicken' ? 'icon_egg' : 'icon_milk', 'icon big'),
        h(
          'div',
          { class: 'market-info' },
          h('b', {}, t(`animal.${a}`)),
          h('small', {}, unlocked ? t('market.have', { n: count, max: offer.max }) : t('market.lockedAt', { level: unlockLevel })),
        ),
        h('span', {}),
        h(
          'button',
          { class: 'btn small', disabled: !unlocked || count >= offer.max || s.coins < offer.price, onclick: () => sim.buyAnimal(a) },
          t('market.buy', { price: offer.price }),
        ),
      );
    });
    return h(
      'div',
      { class: 'sheet market' },
      h('h2', {}, t('market.title')),
      h('p', { class: 'tagline' }, t('market.subtitle')),
      boostActive(s) && h('p', { class: 'fair-banner' }, t('market.fair', { mult: s.marketBoost!.mult, day: dateFromDay(s.marketBoost!.untilDay).dayOfSeason })),
      ...rows,
      h('h3', { class: 'market-section' }, t('market.livestock')),
      ...livestock,
      h('div', { class: 'market-foot' }, h('span', { class: 'chip' }, icon('icon_coin'), h('b', {}, String(s.coins))), h('button', { class: 'btn', onclick: () => closeModal() }, t('market.close'))),
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

  function levelUpView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'levelup' }>;
    const u = unlocksAt(m.level);
    const items: string[] = [];
    if (u.rank) items.push(t('levelup.rank', { rank: t(`rank.${u.rank}`) }));
    for (const c of u.crops) items.push(t('levelup.unlock.crop', { crop: t(`product.${CROPS[c].product}`) }));
    for (const f of u.features) items.push(t(`levelup.unlock.${f}`));
    if (u.maxPlots) items.push(t('levelup.maxPlots', { max: u.maxPlots }));
    return h(
      'div',
      { class: `sheet levelup ${u.rank ? 'rank-up' : ''}` },
      h('div', { class: 'level-seal' }, String(m.level)),
      h('h2', {}, t('levelup.title', { level: m.level })),
      h('p', { class: 'tagline' }, t(`rank.${rankOf(m.level)}`)),
      items.length > 0 && h('ul', { class: 'unlocks' }, ...items.map((i) => h('li', {}, i))),
      h('button', { class: 'btn primary', onclick: () => closeModal() }, t('levelup.continue')),
    );
  }

  function effectsLine(opt: EventOptionDef): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(opt.cost ?? {})) parts.push(`−${v} ${k === 'coins' ? t('hud.coins').toLowerCase() : t(`product.${k}`).toLowerCase()}`);
    const fx = opt.effects ?? {};
    if (fx.xp) parts.push(t('fx.xp', { n: fx.xp }));
    if (fx.coins && fx.coins < 0) parts.push(t('fx.coinsLose'));
    if (fx.workers) parts.push(t('fx.workers'));
    if (fx.marketBoost) parts.push(t('fx.boost', { mult: fx.marketBoost.mult, days: fx.marketBoost.days }));
    if (fx.sellAll) parts.push(t('fx.sellAll', { mult: fx.sellAll.mult }));
    if (fx.herds?.chicken && fx.herds.chicken > 0) parts.push(t('fx.hen'));
    if (opt.risk) parts.push(t('fx.risk'));
    return parts.join(' · ');
  }

  function eventView(): HTMLElement {
    const m = modal as Extract<Modal, { kind: 'event' }>;
    const ev = EVENTS[m.id];
    const s = sim.state;
    const head = [
      h('div', { class: 'event-seal' }, icon(ev.icon, 'event-icon')),
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
