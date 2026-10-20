// Dificultad de la partida: un juego de multiplicadores que se elige al empezar (ver progression.json).
import { PROGRESSION, type DifficultyDef } from './data';
import type { GameState } from './types';

/** Multiplicadores de la dificultad de esta partida (Normal si falta, por partidas antiguas). */
export const difficulty = (state: GameState): DifficultyDef => PROGRESSION.difficulty[state.difficulty ?? 'normal'] ?? PROGRESSION.difficulty.normal;
