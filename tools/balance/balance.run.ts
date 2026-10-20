// Punto de entrada de `npm run balance`. Se ejecuta con vitest (ya es dependencia del proyecto) para
// poder importar la simulacion en TypeScript tal cual, sin compilar ni anadir herramientas.
//
// Variables de entorno:
//   BALANCE_DAYS   dias de juego por partida (1600 por defecto: da para llegar a Conde)
//   BALANCE_SEEDS  semillas separadas por comas (1,2,3,4 por defecto)
//   BALANCE_DIFFICULTY  easy, normal o hard (normal por defecto)
//
// Para comparar dos ramas basta con guardar la salida: `npm run balance > antes.txt`.
import { it } from 'vitest';
import { simulate } from './bot';
import { formatReport } from './report';
import type { Difficulty } from '../../src/sim/types';

// Sin tipos de Node en el proyecto (el juego corre en el navegador): se lee el entorno con cuidado.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const days = Number(env.BALANCE_DAYS ?? 1600);
const seeds = (env.BALANCE_SEEDS ?? '1,2,3,4').split(',').map(Number);
const level = (env.BALANCE_DIFFICULTY ?? 'normal') as Difficulty;

it(`bot de equilibrio: ${seeds.length} partidas de ${days} días (${level})`, () => {
  const reports = seeds.map((seed) => simulate(seed, days, level));
  console.log(`\n${formatReport(reports)}\n`);
});
