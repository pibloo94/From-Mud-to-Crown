// Informe de texto del bot de equilibrio: una columna por semilla y la mediana al final.
import { DAY_MS } from '../../src/sim/calendar';
import type { BalanceReport } from './bot';

const RANKS = ['freeFarmer', 'artisan', 'landowner', 'burgher', 'lord', 'baron', 'count'];
const RANK_NAMES: Record<string, string> = {
  freeFarmer: 'Granjero libre',
  artisan: 'Artesano',
  landowner: 'Terrateniente',
  burgher: 'Burgués',
  lord: 'Señor',
  baron: 'Barón',
  count: 'Conde',
};
const LEVELS = [2, 5, 8, 10, 12, 15, 17, 20];

type Cell = number | null;

function median(values: Cell[]): Cell {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/** Tiempo real que dura un numero de dias de juego, a x1 y a x3. */
export function realTime(days: number): string {
  const min = (days * DAY_MS) / 60000;
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min` : `${Math.round(m)} min`);
  return `${fmt(min)} a x1 · ${fmt(min / 3)} a x3`;
}

export function formatReport(reports: BalanceReport[]): string {
  const rows: [string, Cell[]][] = [];
  const add = (label: string, pick: (r: BalanceReport) => Cell) => rows.push([label, reports.map(pick)]);

  for (const L of LEVELS) add(`Nivel ${L} (día)`, (r) => r.levelDay[L] ?? null);
  for (const id of RANKS) add(`${RANK_NAMES[id]} (día)`, (r) => r.rankDay[id] ?? null);
  for (const d of Object.keys(reports[0].coinsAt).map(Number)) add(`Monedas el día ${d}`, (r) => r.coinsAt[d] ?? null);
  add('Máximo de monedas sin gastar', (r) => r.maxCoins);
  add('Impuestos pagados', (r) => r.taxesPaid);
  add('Impuestos sin pagar', (r) => r.taxesUnpaid);
  add('Días con hambre', (r) => r.hungryDays);
  add('Aldeanos que se marchan (hambre)', (r) => r.villagersLeft);
  add('Aldeanos que se van sin cobrar', (r) => r.unpaidLeft);
  add('Estaciones sin mantenimiento', (r) => r.neglectedSeasons);
  add('Salarios y mantenimiento pagados', (r) => r.fixedCosts);
  add('Cosechas con el granero lleno', (r) => r.granaryFull);
  add('Caravanas', (r) => r.caravans);
  add('Ganado con caravanas', (r) => r.caravanEarnings);
  add('Experiencia sobrante (> nivel 20)', (r) => r.spareXp);
  add('Favor del barón al final', (r) => r.final.baron);
  add('Favor de la aldea al final', (r) => r.final.village);
  add('Prestigio al final', (r) => r.final.prestige);
  add('Monedas al final', (r) => r.final.coins);

  const head = ['', ...reports.map((r) => `semilla ${r.seed}`), 'mediana'];
  const body = rows.map(([label, cells]) => [label, ...cells.map(show), show(median(cells))]);
  const widths = head.map((_, i) => Math.max(...[head, ...body].map((row) => row[i].length)));
  const line = (row: string[]) => row.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');

  const out = [
    `Bot de equilibrio · ${reports.length} partidas de ${reports[0].days} días (${realTime(reports[0].days)})`,
    '',
    line(head),
    line(widths.map((w) => '-'.repeat(w))),
    ...body.map(line),
    '',
    'Tiempo real hasta cada rango (mediana):',
    ...RANKS.map((id) => {
      const d = median(reports.map((r) => r.rankDay[id] ?? null));
      return `  ${RANK_NAMES[id].padEnd(15)} ${d === null ? 'no llega' : `día ${d} · ${realTime(d)}`}`;
    }),
    '',
    'Al final:',
    ...reports.map(
      (r) =>
        `  semilla ${r.seed}: nivel ${r.final.level}, ${RANK_NAMES[r.final.rank] ?? r.final.rank}` +
        `${r.final.titles.length ? ` (${r.final.titles.map((t) => RANK_NAMES[t] ?? t).join(', ')})` : ''}, ` +
        `${r.final.plots} parcelas, ${r.final.villagers} aldeanos, casa solariega ${r.final.manor}, ` +
        `aldeas ${Object.values(r.final.hamlets).join('/')}, ${r.final.soldiers} soldados`,
    ),
  ];
  return out.join('\n');
}

const show = (c: Cell): string => (c === null ? '—' : String(c));
