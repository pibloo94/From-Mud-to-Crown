// Grupo de fichas en una sola fila: si no caben, se desliza en horizontal y una flecha en cada lado
// avisa de que hay mas (y al tocarla, avanza). Lo usan los alimentos, los materiales y la fila de estado.
import { h, icon } from './dom';

export interface ChipScroller {
  el: HTMLElement;
  track: HTMLElement;
  /** Vuelve a mirar si sobra contenido (tras mostrar u ocultar fichas). */
  update: () => void;
  /** Nombre del grupo y de las flechas (cambia con el idioma). */
  label: (group: string, prev: string, next: string) => void;
}

export function chipScroller(cls: string, ...children: (HTMLElement | null)[]): ChipScroller {
  const track = h('div', { class: 'chip-track' }, ...children);
  const arrow = (dir: 'prev' | 'next') =>
    h(
      'button',
      {
        class: `chip-more ${dir}`,
        hidden: true,
        onclick: (e: Event) => {
          e.stopPropagation();
          track.scrollBy({ left: (dir === 'next' ? 1 : -1) * Math.max(60, track.clientWidth * 0.7), behavior: 'smooth' });
        },
      },
      icon('icon_play'),
    );
  const prev = arrow('prev');
  const next = arrow('next');
  const el = h('div', { class: `chip-group ${cls}`, role: 'group' }, prev, track, next);
  const update = () => {
    const over = track.scrollWidth > track.clientWidth + 1;
    prev.hidden = !over || track.scrollLeft <= 1;
    next.hidden = !over || track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  };
  track.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(track);
  const label = (group: string, prevText: string, nextText: string) => {
    el.setAttribute('aria-label', group);
    el.title = group;
    prev.setAttribute('aria-label', prevText);
    next.setAttribute('aria-label', nextText);
  };
  return { el, track, update, label };
}
