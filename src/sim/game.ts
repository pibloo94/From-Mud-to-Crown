// Fachada de la simulacion: guarda el estado y avisa a quien escuche (dibujo e interfaz).
import { createNewGame } from './state';
import * as rules from './rules';
import { resolveEvent } from './events';
import { upgradeBuilding } from './buildings';
import * as villagers from './villagers';
import * as pantry from './pantry';
import * as materials from './materials';
import type { AnimalId, BuildingId, CommandResult, CropId, GameState, JobId, MaterialId, Notice, PathId, ProductId, ProtectionId, Speed, WorkshopId } from './types';
import { BUILDINGS, WORKSHOPS } from './data';
import * as workshops from './workshops';
import * as trade from './trade';
import * as noble from './noble';
import * as tutorial from './tutorial';
import * as risk from './risk';
import * as paths from './paths';
import * as commissions from './commissions';
import * as monuments from './monuments';

export type GameEvent =
  | { type: 'change' }
  | { type: 'day'; day: number }
  | { type: 'result'; result: CommandResult; x?: number; y?: number }
  | { type: 'notice'; notice: Notice }
  | { type: 'choosePlant'; x: number; y: number; crops: CropId[] }
  | { type: 'offerLand'; x: number; y: number; cost: number }
  | { type: 'offerLease'; x: number; y: number; cost: number }
  | { type: 'building'; building: BuildingId }
  | { type: 'site'; x: number; y: number; options: WorkshopId[] }
  | { type: 'workshop'; workshop: WorkshopId }
  /** Ventana de la casa solariega; `hamlet` si se ha tocado una aldea. */
  | { type: 'manor'; hamlet: string | null }
  | { type: 'monument'; monument: string }
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
    for (const notice of notices) {
      // Subidas de nivel y cosechas de los labradores se muestran como si las hiciera el jugador.
      if (notice.card === 'levelup') this.emit({ type: 'levelUp', level: Number(notice.params?.level) });
      else if (notice.tile) this.emit({ type: 'result', result: notice, x: notice.tile.x, y: notice.tile.y });
      else this.emit({ type: 'notice', notice });
    }
    // Rangos, caravanas y cuentas de la estacion (pueden irse aldeanos o soldados) cambian el mapa.
    if (notices.some((n) => n.card === 'rank' || n.card === 'caravan' || n.card === 'season' || n.msg === 'msg.villagerLeftHunger')) this.emit({ type: 'mapChanged' });
    const tutorialMoved = tutorial.advanceTutorial(this.state);
    if (days > 0 || tutorialMoved || before !== this.state.dayProgress) this.emit({ type: 'change' });
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
      case 'offerLease':
        this.emit({ type: 'offerLease', x: r.x, y: r.y, cost: r.cost });
        break;
      case 'building':
        this.emit({ type: 'building', building: r.building });
        break;
      case 'site':
        this.emit({ type: 'site', x: r.x, y: r.y, options: r.options });
        break;
      case 'workshop':
        this.emit({ type: 'workshop', workshop: r.workshop });
        break;
      case 'manor':
        this.emit({ type: 'manor', hamlet: r.hamlet });
        break;
      case 'monument':
        this.emit({ type: 'monument', monument: r.monument });
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

  lease(x: number, y: number): void {
    const out = rules.lease(this.state, x, y);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out, x, y);
  }

  /** Abre el panel de un edificio desde la interfaz (sin tocar el mapa). */
  openBuilding(building: BuildingId): void {
    this.emit({ type: 'building', building });
  }

  upgradeBuilding(building: BuildingId): void {
    const out = upgradeBuilding(this.state, building);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out);
  }

  hireVillager(): void {
    this.villagerCommand(villagers.hireVillager(this.state));
  }

  setJob(id: number, job: JobId): void {
    const result = villagers.setJob(this.state, id, job);
    if (result.ok && job === 'artisan') workshops.autoAssign(this.state, id);
    this.villagerCommand(result);
  }

  upgradeTool(id: number): void {
    this.villagerCommand(villagers.upgradeTool(this.state, id));
  }

  setFarmerCrop(id: number, crop: CropId | 'auto' | null): void {
    this.villagerCommand(villagers.setFarmerCrop(this.state, id, crop));
  }

  setEdible(p: ProductId, eat: boolean): void {
    this.report({ result: pantry.setEdible(this.state, p, eat), levelUps: [] });
  }

  setReserveDays(days: number): void {
    this.report({ result: pantry.setReserveDays(this.state, days), levelUps: [] });
  }

  /** Compra prevencion contra percances hasta las cuentas de la estacion. */
  buyProtection(kind: ProtectionId): void {
    this.report({ result: risk.buyProtection(this.state, kind), levelUps: [] });
  }

  buyMaterial(m: MaterialId, qty: number): void {
    this.report({ result: materials.buyMaterial(this.state, m, qty), levelUps: [] });
  }

  /** Compra los materiales que faltan para la siguiente mejora del edificio. */
  buyMissingFor(building: BuildingId): void {
    const up = BUILDINGS[building].upgrades[this.state.buildings[building]];
    if (!up) return;
    this.report({ result: materials.buyMissing(this.state, up.materials), levelUps: [] });
  }

  /** Compra los materiales que faltan para la siguiente herramienta de un aldeano. */
  buyMissingForTool(id: number): void {
    const v = this.state.villagers.find((x) => x.id === id);
    if (!v) return;
    this.report({ result: materials.buyMissing(this.state, villagers.toolMaterials(v.tool + 1)), levelUps: [] });
  }

  buildWorkshop(id: WorkshopId, x: number, y: number): void {
    const out = workshops.buildWorkshop(this.state, id, x, y);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out, x, y);
  }

  upgradeWorkshop(id: WorkshopId): void {
    const out = workshops.upgradeWorkshop(this.state, id);
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report(out);
  }

  openWorkshop(id: WorkshopId): void {
    this.emit({ type: 'workshop', workshop: id });
  }

  assignArtisan(villagerId: number, id: WorkshopId | null): void {
    this.villagerCommand(workshops.assignArtisan(this.state, villagerId, id));
  }

  /** Compra los materiales que faltan para levantar o mejorar un taller. */
  buyMissingForWorkshop(id: WorkshopId): void {
    const need = this.state.workshops[id] ? workshops.nextWorkshopUpgrade(this.state, id)?.materials : WORKSHOPS[id].materials;
    this.report({ result: materials.buyMissing(this.state, need), levelUps: [] });
  }

  /** Compra los materiales que falten de una lista (carreta, puesto...). */
  buyMaterialsFor(need: Partial<Record<MaterialId, number>> | undefined): void {
    this.report({ result: materials.buyMissing(this.state, need), levelUps: [] });
  }

  buyCart(): void {
    const result = trade.buyCart(this.state);
    if (result.ok) this.emit({ type: 'mapChanged' });
    this.report({ result, levelUps: [] });
  }

  buyStall(): void {
    const result = trade.buyStall(this.state);
    if (result.ok) this.emit({ type: 'mapChanged' });
    this.report({ result, levelUps: [] });
  }

  sendCaravan(town: string, cargo: Partial<Record<ProductId, number>>, buy: Partial<Record<MaterialId, number>>, escort: boolean): void {
    const result = trade.sendCaravan(this.state, town, cargo, buy, escort);
    if (result.ok) this.emit({ type: 'mapChanged' });
    this.report({ result, levelUps: [] });
  }

  // ---------------------------------------------------------------- monumentos

  /** Levanta la siguiente etapa de un monumento (la primera elige el sitio y redibuja el mapa). */
  buildMonument(id: string): void {
    const out = monuments.buildMonument(this.state, id);
    const ranks = out.result.ok ? rules.checkRank(this.state) : [];
    if (out.result.ok) this.emit({ type: 'mapChanged' });
    this.report({ result: out.result, levelUps: [] });
    for (const notice of [...out.notices, ...ranks]) this.emit({ type: 'notice', notice });
  }

  buyMissingForMonument(id: string): void {
    this.report({ result: materials.buyMissing(this.state, monuments.nextStage(this.state, id)?.materials), levelUps: [] });
  }

  openMonument(id: string): void {
    this.emit({ type: 'monument', monument: id });
  }

  // ---------------------------------------------------------------- encargos

  completeCommission(index: number): void {
    this.report({ result: commissions.completeCommission(this.state, index), levelUps: [] });
  }

  // ---------------------------------------------------------------- caminos

  setPathFocus(path: PathId): void {
    this.report({ result: paths.setPathFocus(this.state, path), levelUps: [] });
  }

  setPathSecond(path: PathId): void {
    this.report({ result: paths.setPathSecond(this.state, path), levelUps: [] });
  }

  // ---------------------------------------------------------------- nobleza

  /** Compra la carta de nobleza: el ascenso a Senor y el feudo llegan en el acto. */
  buyCharter(): void {
    this.nobleCommand(noble.buyCharter(this.state), true);
  }

  openManor(hamlet: string | null = null): void {
    this.emit({ type: 'manor', hamlet });
  }

  upgradeManor(): void {
    this.nobleCommand(noble.upgradeManor(this.state), true);
  }

  upgradeHamlet(id: string): void {
    this.nobleCommand(noble.upgradeHamlet(this.state, id), true);
  }

  hireSoldier(): void {
    this.nobleCommand(noble.hireSoldier(this.state), true);
  }

  dismissSoldier(): void {
    this.nobleCommand(noble.dismissSoldier(this.state), true);
  }

  doPatronage(id: string): void {
    this.nobleCommand(noble.doPatronage(this.state, id), false);
  }

  /**
   * Las obras de la nobleza pueden cumplir lo que pide el siguiente rango: se asciende antes de
   * avisar, para que la ventana abierta ya se pinte con el rango nuevo (y el feudo, si se abre).
   */
  private nobleCommand(result: CommandResult, visible: boolean): void {
    const notices = result.ok ? rules.checkRank(this.state) : [];
    if (result.ok && (visible || notices.length)) this.emit({ type: 'mapChanged' });
    this.report({ result, levelUps: [] });
    for (const notice of notices) this.emit({ type: 'notice', notice });
  }

  dismissVillager(id: number): void {
    this.villagerCommand(villagers.dismissVillager(this.state, id));
  }

  private villagerCommand(result: CommandResult): void {
    // Los aldeanos se ven en el mapa: cualquier cambio redibuja.
    if (result.ok) this.emit({ type: 'mapChanged' });
    this.report({ result, levelUps: [] });
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
    const visible = () => JSON.stringify([this.state.herds, this.state.villagers.length]);
    const before = visible();
    const out = resolveEvent(this.state, optionId);
    if (visible() !== before) this.emit({ type: 'mapChanged' });
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

  // ---------------------------------------------------------------- tutorial y consejos

  /** Boton del paso guiado (bienvenida y final). */
  tutorialAck(): void {
    if (tutorial.ackStep(this.state)) this.emit({ type: 'change' });
  }

  /** Accion de la interfaz que cuenta para el tutorial (p. ej. abrir Progreso). */
  noteTutorial(action: tutorial.TutorialAction): void {
    if (tutorial.noteAction(this.state, action)) this.emit({ type: 'change' });
  }

  skipTutorial(): void {
    tutorial.skipTutorial(this.state);
    this.emit({ type: 'change' });
  }

  restartTutorial(): void {
    tutorial.restartTutorial(this.state);
    tutorial.advanceTutorial(this.state);
    this.emit({ type: 'change' });
  }

  dismissTip(id: string): void {
    tutorial.dismissTip(this.state, id);
    this.emit({ type: 'change' });
  }

  setTips(on: boolean): void {
    tutorial.setTips(this.state, on);
    this.emit({ type: 'change' });
  }

  private report(out: rules.Outcome, x?: number, y?: number): void {
    if (out.result.ok) {
      if (out.result.msg === 'msg.collected') tutorial.noteAction(this.state, 'collected');
      tutorial.advanceTutorial(this.state);
    }
    this.emit({ type: 'result', result: out.result, x, y });
    for (const level of out.levelUps) this.emit({ type: 'levelUp', level });
    if (out.result.ok) this.emit({ type: 'change' });
  }
}
