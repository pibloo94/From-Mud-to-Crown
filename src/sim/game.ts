// Fachada de la simulacion: guarda el estado y avisa a quien escuche (dibujo e interfaz).
import { createNewGame } from './state';
import * as rules from './rules';
import { resolveEvent } from './events';
import type { AnimalId, CommandResult, CropId, GameState, ProductId, Speed } from './types';

export type GameEvent =
  | { type: 'change' }
  | { type: 'day'; day: number }
  | { type: 'result'; result: CommandResult; x?: number; y?: number }
  | { type: 'notice'; notice: CommandResult }
  | { type: 'choosePlant'; x: number; y: number; crops: CropId[] }
  | { type: 'offerLand'; x: number; y: number; cost: number }
  | { type: 'levelUp'; level: number }
  | { type: 'event'; id: string }
  | { type: 'mapChanged' }
  | { type: 'openMarket' }
  | { type: 'loaded' };

type Listener = (e: GameEvent) => void;

export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  /** Evento pendiente ya anunciado a la interfaz (para no repetir el aviso cada fotograma). */
  private announcedEvent: string | null = null;

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
    const { days, notices } = rules.tick(this.state, realMs);
    for (let i = 0; i < days; i++) this.emit({ type: 'day', day: this.state.day });
    for (const notice of notices) this.emit({ type: 'notice', notice });
    if (days > 0 || before !== this.state.dayProgress) this.emit({ type: 'change' });
    this.announcePendingEvent();
  }

  private announcePendingEvent(): void {
    const pending = this.state.events.pending;
    if (pending && this.announcedEvent !== pending.id) {
      this.announcedEvent = pending.id;
      this.emit({ type: 'event', id: pending.id });
    } else if (!pending) {
      this.announcedEvent = null;
    }
  }

  setSpeed(speed: Speed): void {
    if (this.state.speed === speed) return;
    rules.setSpeed(this.state, speed);
    this.emit({ type: 'change' });
  }

  interact(x: number, y: number): void {
    const r = rules.interact(this.state, x, y);
    switch (r.kind) {
      case 'openMarket':
        this.emit({ type: 'openMarket' });
        break;
      case 'choosePlant':
        this.emit({ type: 'choosePlant', x: r.x, y: r.y, crops: r.crops });
        break;
      case 'offerLand':
        this.emit({ type: 'offerLand', x: r.x, y: r.y, cost: r.cost });
        break;
      default:
        this.report(r.outcome, x, y);
    }
  }

  plant(x: number, y: number, crop: CropId): void {
    this.report(rules.plant(this.state, x, y, crop), x, y);
  }

  buyLand(x: number, y: number): void {
    const out = rules.buyLand(this.state, x, y);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out, x, y);
  }

  buyAnimal(animal: AnimalId): void {
    const out = rules.buyAnimal(this.state, animal);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out);
  }

  sell(product: ProductId, qty: number | 'all'): void {
    this.report(rules.sell(this.state, product, qty));
  }

  /** Elige una opcion del evento pendiente. */
  chooseEventOption(optionId: string): void {
    const herdsBefore = JSON.stringify(this.state.herds);
    const out = resolveEvent(this.state, optionId);
    if (JSON.stringify(this.state.herds) !== herdsBefore) this.emit({ type: 'mapChanged' });
    this.announcePendingEvent();
    this.report(out);
    this.emit({ type: 'change' });
  }

  /** Sustituye el estado (cargar partida o nueva partida). */
  replaceState(state: GameState): void {
    this.state = state;
    this.announcedEvent = null;
    this.emit({ type: 'loaded' });
    this.emit({ type: 'change' });
  }

  private report(out: rules.Outcome, x?: number, y?: number): void {
    this.emit({ type: 'result', result: out.result, x, y });
    for (const level of out.levelUps) this.emit({ type: 'levelUp', level });
    if (out.result.ok) this.emit({ type: 'change' });
  }
}
