// Ayudante minimo para crear elementos del DOM sin framework.
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function icon(name: string, cls = 'icon'): HTMLImageElement {
  return h('img', { class: cls, src: `assets/ui/${name}.png`, alt: '', draggable: 'false' });
}

/** Dibujo del mapa (pixel art) para usarlo como retrato en la interfaz. */
export function artUrl(name: string): string {
  return `assets/pixel/${name}.png`;
}
