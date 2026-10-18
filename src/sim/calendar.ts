export const DAYS_PER_SEASON = 30;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Duracion de un dia de juego en milisegundos reales a velocidad x1. */
export const DAY_MS = 10_000;

export interface CalendarDate {
  year: number;
  season: Season;
  /** Dia dentro de la estacion, empezando en 1. */
  dayOfSeason: number;
}

export function dateFromDay(day: number): CalendarDate {
  const daysPerYear = DAYS_PER_SEASON * SEASONS.length;
  const year = Math.floor(day / daysPerYear) + 1;
  const inYear = day % daysPerYear;
  const season = SEASONS[Math.floor(inYear / DAYS_PER_SEASON)];
  return { year, season, dayOfSeason: (inYear % DAYS_PER_SEASON) + 1 };
}
