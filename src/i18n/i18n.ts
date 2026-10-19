// Traducciones. Todo texto visible sale de es.json / en.json; nunca se escribe en el codigo.
import es from './es.json';
import en from './en.json';

export const LANGS = { es, en } as const;
export type Lang = keyof typeof LANGS;
export type MsgKey = keyof typeof es;

const PREF_KEY = 'fmtc-lang';
let current: Lang = detect();
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(PREF_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* sin almacenamiento: usar idioma del navegador */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'es';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(PREF_KEY, lang);
  } catch {
    /* preferencia no persistente */
  }
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Parametros que llegan como identificador y se muestran traducidos. */
const TRANSLATED: Record<string, (v: string, all: Record<string, string | number>) => string> = {
  product: (v) => t(`product.${v}`).toLowerCase(),
  crop: (v) => t(`crop.${v}`),
  season: (v) => t(`season.${v}`),
  rank: (v) => t(`rank.${v}`),
  building: (v) => t(`building.${v}`),
  upgrade: (v, all) => t(`upgrade.${all.building}.${v}`),
  job: (v) => t(`job.${v}`),
  tool: (v) => t(`tool.${v}`),
  material: (v) => t(`material.${v}`).toLowerCase(),
  workshop: (v) => t(`workshop.${v}`),
  town: (v) => t(`town.${v}`),
  wsUpgrade: (v) => t(`wsUpgrade.${v}`),
  choice: (v) => t(`farmerCrop.${v}`),
  // "wood:4,stone:2" -> "4 madera, 2 piedra"
  list: (v) =>
    v
      .split(',')
      .filter(Boolean)
      .map((part) => {
        const [id, n] = part.split(':');
        return `${n} ${t(`material.${id}`).toLowerCase()}`;
      })
      .join(', '),
};

/** Traduce una clave; los parametros {nombre} se sustituyen. Los identificadores conocidos (producto, edificio...) se traducen. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const dict = LANGS[current] as Record<string, string>;
  let text = dict[key] ?? (LANGS.es as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    let v = typeof value === 'number' && !Number.isInteger(value) ? value.toLocaleString(current) : String(value);
    const tr = TRANSLATED[name];
    if (tr && typeof value === 'string') v = tr(value, params);
    text = text.replaceAll(`{${name}}`, v);
  }
  return text;
}
