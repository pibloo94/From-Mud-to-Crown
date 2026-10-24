// Bot de equilibrio: juega una partida entera a traves de `Game` (como la interfaz) y anota cuando
// llega cada hito. No piensa: cosecha, recoge, vende lo que sobra, compra la mejora mas barata,
// acepta los eventos y gasta en cuanto puede. Sirve para medir con numeros cada cambio de equilibrio:
// si un jugador asi no tiene ningun problema, el juego es facil; si se atasca, algo falla.
import { Game } from '../../src/sim/game';
import { createNewGame } from '../../src/sim/state';
import * as R from '../../src/sim/rules';
import { optionAvailable } from '../../src/sim/events';
import { BUILDING_IDS, CROPS, EVENTS, HAMLET_IDS, NOBILITY, PATHS, PATRONAGE_IDS, PRODUCT_IDS, PROGRESSION, TOWN_IDS, TRADE, WORKSHOPS, WORKSHOP_IDS } from '../../src/sim/data';
import { priceOf } from '../../src/sim/market';
import { nextUpgrade } from '../../src/sim/buildings';
import { materialsPrice, missingMaterials } from '../../src/sim/materials';
import { freeBeds, toolMaterials } from '../../src/sim/villagers';
import { artisansOf, builtWorkshops, nextWorkshopUpgrade } from '../../src/sim/workshops';
import { dailyFood, surplus } from '../../src/sim/pantry';
import * as T from '../../src/sim/trade';
import * as N from '../../src/sim/noble';
import { mainRanks, rankDef } from '../../src/sim/progress';
import { seasonBill } from '../../src/sim/taxes';
import { upkeepBill } from '../../src/sim/upkeep';
import { isProtected, protectionCost } from '../../src/sim/risk';
import type { CropId, Difficulty, EstateId, GameState, JobId, MaterialId, PathId, ProductId } from '../../src/sim/types';
import { PATH_IDS, canChoosePath, pathLevel } from '../../src/sim/paths';

/** Lo que mide una partida del bot. Los dias son dias de juego (10 s reales a velocidad x1). */
export interface BalanceReport {
  seed: number;
  difficulty: Difficulty;
  days: number;
  /** Dia en que se llega a cada nivel (2..20). */
  levelDay: Record<number, number>;
  /** Dia en que se consigue cada rango o titulo de rama. */
  rankDay: Record<string, number>;
  /** Camino en foco y segundo (los elige el bot al poder: los de mas meritos). */
  focus: string | null;
  second: string | null;
  /** Dia en que el camino en foco llega a cada peldano. */
  focusLevelDay: Record<number, number>;
  /** Meritos de cada camino al final. */
  merits: Record<string, number>;
  /** Tandas hechas en los talleres. */
  workshopBatches: number;
  /** Monedas cada 200 dias (dia -> monedas). */
  coinsAt: Record<number, number>;
  /** Mayor cantidad de monedas sin gastar en toda la partida. */
  maxCoins: number;
  taxesPaid: number;
  taxesUnpaid: number;
  hungryDays: number;
  villagersLeft: number;
  /** Aldeanos que se van por no cobrar el salario. */
  unpaidLeft: number;
  /** Estaciones sin dinero para el mantenimiento. */
  neglectedSeasons: number;
  /** Salarios y mantenimiento pagados. */
  fixedCosts: number;
  /** Mayor deuda con el senor. */
  maxDebt: number;
  /** Tierras embargadas por deudas. */
  seizures: number;
  /** Avisos de perder el rango y rangos perdidos. */
  rankWarnings: number;
  ranksLost: number;
  /** Percances evitados con la prevencion. */
  prevented: number;
  /** Estaciones con mal tiempo (cultivos, animales o comida por debajo de lo normal). */
  badWeather: number;
  granaryFull: number;
  caravans: number;
  caravanEarnings: number;
  /** Experiencia por encima del nivel maximo (no sirve para nada). */
  spareXp: number;
  final: {
    level: number;
    rank: string;
    titles: string[];
    coins: number;
    plots: number;
    villagers: number;
    rep: Record<EstateId, number>;
    prestige: number;
    manor: number;
    hamlets: Record<string, number>;
    soldiers: number;
  };
}

const JOBS: JobId[] = ['farmer', 'herder', 'carter'];

/** Paso de reloj: lo maximo que la simulacion acepta en un fotograma. */
const FRAME_MS = R.MAX_FRAME_MS;

/** Monedas que el bot no gasta en nada que no sea imprescindible (comida, impuestos). */
const CUSHION = 80;

/**
 * Lo que costaran las cuentas de la estacion: impuestos, soldada, salarios y mantenimiento. El bot
 * lo guarda y solo gasta lo que sobra, como haria alguien que mira la tarjeta de cuentas.
 */
/** Monedas que se pueden gastar sin tocar lo guardado para las cuentas. */
const spare = (s: GameState): number => s.coins - seasonReserve(s);

function seasonReserve(s: GameState): number {
  const bill = seasonBill(s);
  const fixed = upkeepBill(s);
  return bill.tribute + Math.round(bill.tithe * 1.2) + bill.upkeep + fixed.wages + fixed.maintenance;
}

export function simulate(seed: number, days: number, level: Difficulty = 'normal', focus: PathId | null = null): BalanceReport {
  FORCED_FOCUS = focus;
  const game = new Game(createNewGame(seed, level));
  const s = (): GameState => game.state;
  const report: BalanceReport = {
    seed,
    difficulty: level,
    days,
    levelDay: {},
    rankDay: {},
    focus: null,
    second: null,
    focusLevelDay: {},
    merits: {},
    workshopBatches: 0,
    coinsAt: {},
    maxCoins: 0,
    taxesPaid: 0,
    taxesUnpaid: 0,
    hungryDays: 0,
    villagersLeft: 0,
    unpaidLeft: 0,
    neglectedSeasons: 0,
    fixedCosts: 0,
    maxDebt: 0,
    seizures: 0,
    rankWarnings: 0,
    ranksLost: 0,
    prevented: 0,
    badWeather: 0,
    granaryFull: 0,
    caravans: 0,
    caravanEarnings: 0,
    spareXp: 0,
    final: undefined as unknown as BalanceReport['final'],
  };

  game.on((e) => {
    if (e.type === 'levelUp') report.levelDay[e.level] ??= s().day;
    if (e.type === 'result' && e.result.msg === 'msg.granaryFull') report.granaryFull++;
    if (e.type !== 'notice') return;
    const n = e.notice;
    if (n.card === 'season') {
      report.taxesPaid += Number(n.params?.tithe ?? 0) + Number(n.params?.tribute ?? 0);
      report.taxesUnpaid += Number(n.params?.unpaid ?? 0);
      report.unpaidLeft += Number(n.params?.wagesLeft ?? 0);
      report.neglectedSeasons += Number(n.params?.neglected ?? 0);
      report.fixedCosts += Number(n.params?.wages ?? 0) + Number(n.params?.maintenance ?? 0);
      report.maxDebt = Math.max(report.maxDebt, Number(n.params?.debt ?? 0));
      if (n.params?.seized) report.seizures++;
      report.rankWarnings += Number(n.params?.rankWarning ?? 0);
      if (n.params?.rankLost) report.ranksLost++;
      if (['wet', 'dry', 'blight', 'harsh'].some((w) => String(n.params?.weather ?? '').endsWith(`.${w}`))) report.badWeather++;
    }
    if (n.msg === 'msg.villagersHungry') report.hungryDays++;
    if (n.msg === 'msg.prevented') report.prevented++;
    if (n.msg === 'msg.villagerLeftHunger') report.villagersLeft++;
  });

  game.skipTutorial();

  for (let d = 0; d < days; d++) {
    if (d % 200 === 0) report.coinsAt[d] = s().coins;
    answerEvent(game);
    farm(game);
    sell(game);
    spend(game);
    // Un dia de juego, en pasos de un fotograma largo (la simulacion no deja saltar mas de golpe).
    // Si a mitad de dia llega un evento, el reloj se para hasta contestarlo, como en el juego.
    game.setSpeed(3);
    const today = s().day;
    for (let guard = 0; s().day === today && guard < 1000; guard++) {
      answerEvent(game);
      game.update(FRAME_MS);
    }
    report.maxCoins = Math.max(report.maxCoins, s().coins);
    // Rango y titulos se leen del estado: no todos llegan con su propio aviso (Granjero libre va con el nivel).
    for (const id of [s().rank, ...s().titles]) report.rankDay[id] ??= s().day;
    choosePaths(game);
    const f = s().paths.focus;
    if (f) report.focusLevelDay[pathLevel(s().paths.merits[f]).level] ??= s().day;
  }
  report.focus = s().paths.focus;
  report.second = s().paths.second;
  report.workshopBatches = Object.values(s().workshops).reduce((n, w) => n + (w?.made ?? 0), 0);
  report.merits = Object.fromEntries(PATH_IDS.map((p) => [p, Math.round(s().paths.merits[p])]));

  const st = s();
  const maxXp = PROGRESSION.levels[PROGRESSION.levels.length - 1].xp;
  report.spareXp = Math.max(0, Math.round(st.xp - maxXp));
  report.caravans = st.stats.trades;
  report.caravanEarnings = st.stats.tradeEarned;
  report.final = {
    level: st.level,
    rank: st.rank,
    titles: [...st.titles],
    coins: st.coins,
    plots: Object.keys(st.plots).length,
    villagers: st.villagers.length,
    rep: { ...st.rep },
    prestige: st.noble.prestige,
    manor: st.noble.manor,
    hamlets: { ...st.noble.hamlets },
    soldiers: st.noble.soldiers,
  };
  return report;
}

/** Camino en foco que se fuerza en esta partida (BALANCE_FOCUS), para medir cada camino. */
let FORCED_FOCUS: PathId | null = null;

/** En cuanto puede, elige el camino en foco y el segundo. */
function choosePaths(game: Game): void {
  const st = game.state;
  if (st.paths.focus || !canChoosePath(st)) return;
  // BALANCE_FOCUS fuerza el camino en foco (para medir cada camino); si no, la Corona, que es la
  // que lleva a Conde. De segundo, el que mas meritos tenga.
  const focus = FORCED_FOCUS && PATH_IDS.includes(FORCED_FOCUS) ? FORCED_FOCUS : 'crown';
  const order = [...PATH_IDS].sort((a, b) => st.paths.merits[b] - st.paths.merits[a]).filter((p) => p !== focus);
  game.setPathFocus(focus);
  game.setPathSecond(order[0]);
}

/**
 * Contesta el evento como alguien que va a por el siguiente rango: elige la opcion que mas le acerca
 * a las relaciones que ese rango pide (y no deja caer las que hay que mantener). A igualdad, acepta
 * lo que se pide antes que negarse o arriesgarse.
 */
function answerEvent(game: Game): void {
  const s = game.state;
  const pending = s.events.pending;
  if (!pending) return;
  const options = EVENTS[pending.id].options.filter((o) => optionAvailable(s, o));
  const next = mainRanks()[mainRanks().findIndex((r) => r.id === s.rank) + 1];
  const keep = rankDef(s.rank)?.keep ?? {};
  const need = (e: EstateId) => Math.max(0, (next?.[e] ?? 0) - s.rep[e], (keep[e] ?? 0) + 10 - s.rep[e]);
  const score = (o: (typeof options)[number]) => {
    const rep = { ...(o.effects?.rep ?? {}) };
    let v = 0;
    for (const [e, n] of Object.entries(rep)) v += (n ?? 0) * (1 + need(e as EstateId) / 5);
    // Con un camino forzado, prefiere lo que agrada a su estamento.
    for (const [e, n] of Object.entries(rep)) if (FORCED_FOCUS && PATHS.estates[e as EstateId]?.path === FORCED_FOCUS) v += (n ?? 0) * 1.5;
    if (['refuse', 'decline', 'risk'].includes(o.id)) v -= 0.5;
    return v;
  };
  const pick = options.slice().sort((a, b) => score(b) - score(a))[0];
  if (pick) game.chooseEventOption(pick.id);
}

/** Cosecha lo maduro, siembra lo que mas deja por dia y recoge huevos y leche. */
function farm(game: Game): void {
  const s = game.state;
  for (const [key, plot] of Object.entries(s.plots)) {
    const [x, y] = key.split(',').map(Number);
    if (plot.crop && R.isRipe(plot)) game.interact(x, y);
    if (!s.plots[key].crop) {
      const best = R.plantableCrops(s).sort((a, b) => cropValue(s, b) - cropValue(s, a))[0];
      if (best) game.plant(x, y, best);
    }
  }
  for (const kind of ['coop', 'pen'] as const) {
    const tile = s.map.tiles.find((t) => t.kind === kind);
    const animal = kind === 'coop' ? 'chicken' : 'cow';
    if (tile && s.herds[animal].stored >= 1) game.interact(tile.x, tile.y);
  }
}

const cropValue = (s: GameState, c: CropId): number => (CROPS[c].yield * priceOf(s, CROPS[c].product)) / CROPS[c].growDays;

/** Vende todo menos 10 dias de comida para los aldeanos. */
function sell(game: Game): void {
  const s = game.state;
  let reserve = Math.ceil(dailyFood(s) * 10);
  for (const p of PRODUCT_IDS) {
    const keep = Math.min(s.inventory[p], reserve);
    reserve -= keep;
    const qty = s.inventory[p] - keep;
    if (qty > 0) game.sell(p, qty);
  }
}

/** Precio de lo que hay que pagar: monedas mas los materiales que falten comprados al mercado. */
const priceWith = (s: GameState, coins: number, materials?: Partial<Record<MaterialId, number>>): number =>
  coins + materialsPrice(s, missingMaterials(s, materials));

function spend(game: Game): void {
  const s = game.state;

  // Aldeanos: uno por cama libre, repartidos entre labrador, pastor y carretero.
  if (freeBeds(s) > 0 && spare(s) > 25) {
    const before = s.villagers.length;
    game.hireVillager();
    if (s.villagers.length > before) {
      const v = s.villagers[s.villagers.length - 1];
      game.setJob(v.id, JOBS[(s.villagers.length - 1) % JOBS.length]);
    }
  }

  // Tierra junto al campo.
  for (let i = 0; i < 3; i++) {
    const t = s.map.tiles.find((tl) => R.landCheck(s, tl.x, tl.y).ok);
    if (t && spare(s) > R.landCost(s) + 30) game.buyLand(t.x, t.y);
  }

  // La mejora de edificio mas barata que ya este al alcance.
  const cheapest = BUILDING_IDS.map((b) => ({ b, up: nextUpgrade(s, b) }))
    .filter((x) => x.up && x.up.level <= s.level)
    .sort((a, b) => a.up!.cost - b.up!.cost)[0];
  if (cheapest && spare(s) > priceWith(s, cheapest.up!.cost, cheapest.up!.materials) + CUSHION) {
    game.buyMissingFor(cheapest.b);
    game.upgradeBuilding(cheapest.b);
  }

  // Herramientas.
  for (const v of s.villagers) {
    if (spare(s) > priceWith(s, 0, toolMaterials(v.tool + 1)) + 160) {
      game.buyMissingForTool(v.id);
      game.upgradeTool(v.id);
    }
  }

  // Talleres, con su artesano y sus mejoras.
  for (const id of WORKSHOP_IDS) {
    const site = s.map.tiles.find((t) => t.kind === 'site');
    if (site && !s.workshops[id] && s.level >= WORKSHOPS[id].unlockLevel && spare(s) > priceWith(s, WORKSHOPS[id].cost, WORKSHOPS[id].materials) + 300) {
      game.buyMissingForWorkshop(id);
      game.buildWorkshop(id, site.x, site.y);
    }
  }
  for (const id of builtWorkshops(s)) {
    if (artisansOf(s, id).length === 0 && freeBeds(s) > 0) {
      const before = s.villagers.length;
      game.hireVillager();
      if (s.villagers.length > before) game.assignArtisan(s.villagers[s.villagers.length - 1].id, id);
    }
    const up = nextWorkshopUpgrade(s, id);
    if (up && spare(s) > priceWith(s, up.cost, up.materials) + 300) {
      game.buyMissingForWorkshop(id);
      game.upgradeWorkshop(id);
    }
  }

  // Comercio: carretas, puesto y la caravana que mas deja por dia.
  if (spare(s) > 600) {
    game.buyMaterialsFor(TRADE.cart.materials);
    game.buyCart();
  }
  if (spare(s) > 2500 && !s.stall && s.level >= TRADE.stall.level) {
    game.buyMaterialsFor(TRADE.stall.materials);
    game.buyStall();
  }
  sendBestCaravan(game);

  // Nobleza.
  if (N.charterReady(s) && spare(s) > NOBILITY.charter.cost + 300) game.buyCharter();
  if (N.isNoble(s)) spendAsNoble(game);

  // Prevencion contra percances, si sobra para pagarla.
  for (const kind of ['crops', 'animals'] as const) {
    if (!isProtected(s, kind) && spare(s) > protectionCost(s, kind) + 200) game.buyProtection(kind);
  }

  // Animales.
  if (spare(s) > 80) game.buyAnimal('chicken');
  if (spare(s) > 150) game.buyAnimal('cow');
}

function sendBestCaravan(game: Game): void {
  const s = game.state;
  if (T.idleCarts(s) === 0) return;
  let best: { town: string; cargo: Partial<Record<ProductId, number>>; perDay: number } | null = null;
  for (const town of TOWN_IDS.filter((t) => T.townUnlocked(s, t))) {
    const cargo: Partial<Record<ProductId, number>> = {};
    let room = T.cartCapacity(s);
    for (const p of PRODUCT_IDS.slice().sort((a, b) => T.townPrice(s, town, b) - T.townPrice(s, town, a))) {
      const n = Math.min(room, surplus(s, p));
      if (n > 0) {
        cargo[p] = n;
        room -= n;
      }
    }
    const q = T.quoteCaravan(s, town, cargo, {}, true);
    if (!q.problem && (!best || q.value / q.days > best.perDay)) best = { town, cargo, perDay: q.value / q.days };
  }
  if (best && best.perDay > 20) game.sendCaravan(best.town, best.cargo, {}, true);
}

function spendAsNoble(game: Game): void {
  const s = game.state;
  const reserve = 800;
  const affordable = (coins: number, materials?: Partial<Record<MaterialId, number>>) => spare(s) > priceWith(s, coins, materials) + reserve;
  const manor = () => {
    const up = N.nextManorUpgrade(s);
    if (up && affordable(up.cost, up.materials)) {
      game.buyMaterialsFor(up.materials);
      game.upgradeManor();
    }
  };
  // Primero la casa y tomar las tres aldeas; luego soldados; luego el resto de obras.
  if (s.noble.manor === 0) manor();
  for (const id of HAMLET_IDS) {
    const next = N.nextHamletLevel(s, id);
    if (next && N.hamletLevel(s, id) === 0 && affordable(next.cost, next.materials)) {
      game.buyMaterialsFor(next.materials);
      game.upgradeHamlet(id);
    }
  }
  while (s.noble.soldiers < N.maxSoldiers(s) && spare(s) > NOBILITY.soldiers.hire + reserve) {
    const before = s.noble.soldiers;
    game.buyMaterialsFor(NOBILITY.soldiers.materials);
    game.hireSoldier();
    if (s.noble.soldiers === before) break;
  }
  if (s.noble.manor > 0) manor();
  for (const id of HAMLET_IDS) {
    const next = N.nextHamletLevel(s, id);
    if (next && affordable(next.cost, next.materials)) {
      game.buyMaterialsFor(next.materials);
      game.upgradeHamlet(id);
    }
  }
  // Mecenazgo solo con lo que sobre despues de guardar para la siguiente obra de la casa solariega.
  const nextWork = N.nextManorUpgrade(s);
  const saving = nextWork ? priceWith(s, nextWork.cost, nextWork.materials) : 0;
  for (const id of PATRONAGE_IDS) if (spare(s) > saving + 3000 && !N.patronageProblem(s, id)) game.doPatronage(id);
}
