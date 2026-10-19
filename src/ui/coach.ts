// Panel del tutorial guiado y tarjetas de consejo. El estado vive en la partida; aqui solo se pinta.
import type { Game } from '../sim/game';
import { TUTORIAL } from '../sim/data';
import { currentStep, stepIndex } from '../sim/tutorial';
import { t } from '../i18n/i18n';
import { h, icon } from './dom';

export interface Coach {
  el: HTMLElement;
  /** Repinta el panel; `modalOpen` lo oculta mientras hay una ventana delante. */
  render(modalOpen: boolean): void;
}

/** Botones de la interfaz que puede senalar un paso. */
export interface CoachTargets {
  market: HTMLElement;
  progress: HTMLElement;
}

export function createCoach(sim: Game, targets: CoachTargets, onAck: (stepId: string) => void): Coach {
  const el = h('aside', { class: 'coach', role: 'status', 'aria-live': 'polite', hidden: true });
  let key = '';
  const render = (modalOpen: boolean) => {
    const step = currentStep(sim.state);
    for (const [name, btn] of Object.entries(targets)) btn.classList.toggle('tut-target', !modalOpen && step?.target === name);
    el.hidden = !step || modalOpen;
    const k = `${step?.id ?? ''}|${t('tutorial.skip')}`;
    if (!step || k === key) return;
    key = k;
    const n = stepIndex(sim.state);
    // El primer y el ultimo paso no cuentan como tareas.
    const total = TUTORIAL.steps.length - 2;
    el.replaceChildren(
      h('div', { class: 'coach-seal' }, icon('icon_scroll')),
      h(
        'div',
        { class: 'coach-body' },
        n > 0 && n <= total && h('small', { class: 'coach-count' }, t('tutorial.count', { n, total })),
        h('b', {}, t(`tutorial.${step.id}.title`)),
        h('p', {}, t(`tutorial.${step.id}.text`)),
        h(
          'div',
          { class: 'coach-actions' },
          step.done === 'ack' && h('button', { class: 'btn small primary', onclick: () => onAck(step.id) }, t(`tutorial.${step.id}.ok`)),
          step.id !== TUTORIAL.steps[TUTORIAL.steps.length - 1].id &&
            h('button', { class: 'btn small ghost', onclick: () => sim.skipTutorial() }, t('tutorial.skip')),
        ),
      ),
    );
  };
  return { el, render };
}

/** Icono de cada consejo. */
const TIP_ICON: Record<string, string> = {
  buildings: 'icon_house',
  land: 'icon_wheat',
  villagers: 'icon_worker',
  pantry: 'icon_granary',
  animals: 'icon_egg',
  events: 'icon_banner',
  taxes: 'icon_coin',
  landowner: 'icon_crown',
  workshops: 'icon_hammer',
  trade: 'icon_cart',
  charter: 'icon_charter',
  fief: 'icon_manor',
};

/** Tarjeta de un consejo: se ve una vez; se puede pedir que no salgan mas. */
export function tipView(sim: Game, id: string, close: () => void): HTMLElement {
  const done = () => {
    sim.dismissTip(id);
    close();
  };
  return h(
    'div',
    { class: 'sheet event tip' },
    h('div', { class: 'event-seal' }, icon(TIP_ICON[id] ?? 'icon_scroll', 'event-icon')),
    h('span', { class: 'event-cat cat-tip' }, t('tip.kind')),
    h('h2', {}, t(`tip.${id}.title`)),
    h('p', { class: 'event-text' }, t(`tip.${id}.text`)),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn primary', onclick: done }, t('tip.ok')),
      h(
        'button',
        {
          class: 'btn small ghost',
          onclick: () => {
            sim.setTips(false);
            done();
          },
        },
        t('tip.off'),
      ),
    ),
  );
}
