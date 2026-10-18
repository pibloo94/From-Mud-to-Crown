// Fachada de la simulacion: guarda el estado y avisa a quien escuche (dibujo e interfaz).
import { createNewGame } from './state';
import * as rules from './rules';
import type { AnimalId, CommandResult, GameState, ProductId, Speed } from './types';

export type GameEvent =
  | { type: 'change' }
  | { type: 'day'; day: number }
  | { type: 'result'; result: CommandResult; x?: number; y?: number }
  | { type: 'openMarket' }
  | { type: 'loaded' };

type Listener = (e: GameEvent) => void;

export class Game {
  state: GameState;
  private listeners = new Set<Listener>();

  constructor(state: GameState = createNewGame()) {
    this.state = state;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Llamar en cada fotograma con los milisegundos reales transcurridos. */
  update(realMs: number): void {
    const before = this.state.dayProgress;
    const days = rules.tick(this.state, realMs);
    for (let i = 0; i < days; i++) this.emit({ type: 'day', day: this.state.day });
    if (days > 0 || before !== this.state.dayProgress) this.emit({ type: 'change' });
  }

  setSpeed(speed: Speed): void {
    if (this.state.speed === speed) return;
    rules.setSpeed(this.state, speed);
    this.emit({ type: 'change' });
  }

  togglePause(lastSpeed: Speed): void {
    this.setSpeed(this.state.speed === 0 ? (lastSpeed || 1) : 0);
  }

  interact(x: number, y: number): void {
    const r = rules.interact(this.state, x, y);
    if ('open' in r) {
      this.emit({ type: 'openMarket' });
      return;
    }
    this.report(r, x, y);
  }

  collect(animal: AnimalId): void {
    this.report(rules.collect(this.state, animal));
  }

  sell(product: ProductId, qty: number | 'all'): void {
    this.report(rules.sell(this.state, product, qty));
  }

  /** Sustituye el estado (cargar partida o nueva partida). */
  replaceState(state: GameState): void {
    this.state = state;
    this.emit({ type: 'loaded' });
    this.emit({ type: 'change' });
  }

  private report(result: CommandResult, x?: number, y?: number): void {
    this.emit({ type: 'result', result, x, y });
    if (result.ok) this.emit({ type: 'change' });
  }
}
