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

/** Traduce una clave; los parametros {nombre} se sustituyen. Un parametro "product" o "crop" se traduce tambien. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const dict = LANGS[current] as Record<string, string>;
  let text = dict[key] ?? (LANGS.es as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    let v = typeof value === 'number' && !Number.isInteger(value) ? value.toLocaleString(current) : String(value);
    if (name === 'product') v = t(`product.${value}`).toLowerCase();
    if (name === 'crop') v = t(`crop.${value}`);
    text = text.replaceAll(`{${name}}`, v);
  }
  return text;
}
