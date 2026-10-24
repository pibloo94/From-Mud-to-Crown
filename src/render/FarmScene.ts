// Escena isometrica: dibuja el estado de la partida y convierte toques en ordenes.
// No contiene reglas del juego: todo pasa por `Game`.
import Phaser from 'phaser';
import type { Game, GameEvent } from '../sim/game';
import { CROPS, NOBILITY, PROGRESSION, START } from '../sim/data';
import { canExpandAt, canLeaseAt, cropStage, plotCount } from '../sim/rules';
import { visualStage } from '../sim/buildings';
import { workshopAt } from '../sim/workshops';
import { idleCarts } from '../sim/trade';
import { hasFeature, hasRank, levelDef } from '../sim/progress';
import { hamletAt, hamletLevel, manorStage } from '../sim/noble';
import { tutorialTiles } from '../sim/tutorial';
import { annexAt, isBlockOrigin, objectSize } from '../sim/layout';
import { dateFromDay, type Season } from '../sim/calendar';
import { plotKey, tileAt } from '../sim/state';
import type { AnimalId, BuildingId, JobId, Tile } from '../sim/types';
import { t } from '../i18n/i18n';
import pixelManifest from '../../public/assets/pixel/manifest.json';
import { blockBase, depthOf, fitScale, TILE_H, TILE_W, tileCenter, toScreen, toTile } from './iso';
import { STAGES, monumentAt, monumentStage } from '../sim/monuments';
import { pointOnRoad, roadCaravans, tradeRoad, villagerDuties, type Duty, type Spot } from './life';

/** Piezas de la interfaz que tambien salen en el mapa (la placa de los animales y sus iconos), a x3. */
const UI_SCALE = 3;
const UI_SPRITES = ['bubble', 'icon_egg', 'icon_milk', 'icon_wool', 'icon_wheat', 'icon_coin'];
/** Arte del mapa en pixel art: PNG a resolucion nativa que se dibujan a x4 con filtrado nitido. */
const ART = 4;
const PIXEL_SPRITES = Object.keys(pixelManifest);
const isPixel = new Set(PIXEL_SPRITES);
/** Paso de zoom: con el arte a x4, cada paso de 1/4 mantiene los pixeles enteros. */
const ZOOM_STEP = 0.25;
const snapZoom = (z: number) => Math.max(ZOOM_STEP, Math.floor(z / ZOOM_STEP) * ZOOM_STEP);

/**
 * Color de cada estacion sobre hierba y arboles (MULTIPLY tine y oscurece). En invierno no se
 * tine: suelos y arboles cambian a su version nevada (`<clave>_snow`).
 */
const SEASON_TINT: Record<Season, number | null> = {
  spring: null,
  summer: 0xfff0c4,
  autumn: 0xf2bf7a,
  winter: null,
};
const SNOW = '_snow';
// Las cifras salen de la fuente propia del juego (ver style.css); las letras, de Pixelify.
const FONT = '"FMTC Cifras", "Pixelify Sans", monospace';
const TAP_SLOP = 12;

/** Margenes (en pixeles CSS) que ocupa la interfaz HTML encima del lienzo. */
export interface Insets {
  top: number;
  bottom: number;
  /** Pixeles del lienzo por pixel CSS. */
  dpr: number;
}

/** Animal o aldeano que pasea por el mapa. Los aldeanos llevan su id y lo que hacen al llegar. */
interface Actor {
  sprite: Phaser.GameObjects.Image;
  area: Spot[];
  gx: number;
  gy: number;
  busy: boolean;
  villager: number | null;
  work: Duty['work'];
}

interface Bubble {
  animal: AnimalId;
  tile: { x: number; y: number };
  box: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
}

export class FarmScene extends Phaser.Scene {
  private built: Phaser.GameObjects.GameObject[] = [];
  private crops = new Map<string, Phaser.GameObjects.Image>();
  private tired = new Map<string, Phaser.GameObjects.Image>();
  private bubbles: Bubble[] = [];
  /** Hierba y arboles: lo que cambia de color con la estacion. */
  private seasonal: Phaser.GameObjects.Image[] = [];
  private season: Season | null = null;
  private hover!: Phaser.GameObjects.Graphics;
  /** Animaciones de respuesta al jugador: no se detienen con la pausa del juego. */
  private feedbackTweens = new Set<Phaser.Tweens.Tween>();
  /** Contornos punteados sobre la hierba que se puede roturar. */
  private landHints!: Phaser.GameObjects.Graphics;
  /** Baldosas que senala el tutorial (latido dorado). */
  private tutorialMarks!: Phaser.GameObjects.Graphics;
  private tutorialKey = '';
  private downAt: { x: number; y: number } | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly sim: Game,
    private readonly getInsets: () => Insets,
  ) {
    super('farm');
  }

  preload(): void {
    for (const key of UI_SPRITES) this.load.image(key, `assets/ui/${key}.png`);
    for (const key of PIXEL_SPRITES) this.load.image(key, `assets/pixel/${key}.png`);
  }

  create(): void {
    // Pixeles nitidos: sin suavizado al ampliar el arte.
    for (const key of [...PIXEL_SPRITES, ...UI_SPRITES]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.hover = this.add.graphics().setDepth(60);
    this.landHints = this.add.graphics().setDepth(55);
    // Por encima de edificios y cultivos (que si no lo tapan), por debajo de los escudos de los animales.
    this.tutorialMarks = this.add.graphics().setDepth(9_000);
    // El latido sigue aunque el juego este en pausa: es una indicacion, no parte del mundo.
    this.tweens.add({ targets: this.tutorialMarks, alpha: 0.25, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.build();
    this.fit();

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomTo(this.cameras.main.zoom + (dy > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    this.input.on('gameout', () => this.hover.clear());

    this.unsubscribe = this.sim.on((e) => this.onGameEvent(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.wander() });
    this.syncSpeed();
  }

  update(_time: number, delta: number): void {
    this.sim.update(delta);
    this.moveCaravans();
  }

  // Limites del mapa en coordenadas de mundo y zoom que lo muestra entero.
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private fitZoom = 1;

  /** Recalcula zoom y encuadre para que la granja quepa entre las barras de la interfaz. */
  fit(): void {
    const cam = this.cameras.main;
    const { width: W, height: H } = this.scale.gameSize;
    const ins = this.getInsets();
    const top = ins.top * ins.dpr;
    const bottom = ins.bottom * ins.dpr;
    const { width: mw, height: mh } = this.sim.state.map;
    const b = {
      minX: -mh * (TILE_W / 2),
      maxX: mw * (TILE_W / 2),
      minY: -120, // margen para arboles y tejados de la primera fila
      maxY: (mw + mh) * (TILE_H / 2),
    };
    this.bounds = b;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const avail = H - top - bottom;
    // Zoom en multiplos de 1/4: asi cada pixel del arte (4 unidades) ocupa pixeles enteros de pantalla.
    this.fitZoom = snapZoom(Math.min(W / bw, avail / bh) * 0.96);
    // En vertical (movil) el mapa entero queda diminuto: se encuadra la parte central y se puede arrastrar.
    // En vertical se encuadra la granja (sin las tierras cerradas del este, que se ven arrastrando).
    const portrait = H > W;
    const homeW = hasRank(this.sim.state, 'landowner') ? mw : Math.min(mw, PROGRESSION.lands.eastFrom);
    // El feudo (filas del sur) no cuenta para el zoom en vertical: se llega arrastrando.
    const homeBw = (homeW + Math.min(mh, START.map.rows.length)) * (TILE_W / 2);
    const portraitZoom = Math.min(W / (homeBw * 0.64), avail / bh);
    // En vertical el mapa puede salirse por los lados (se arrastra): se redondea al paso mas cercano.
    const zoom = portrait ? Math.max(this.fitZoom, Math.round(portraitZoom / ZOOM_STEP) * ZOOM_STEP) : this.fitZoom;
    cam.setZoom(zoom);
    const cx = portrait ? ((homeW - mh) * (TILE_W / 2)) / 2 : (b.minX + b.maxX) / 2;
    const cy = portrait ? ((homeW + mh) * (TILE_H / 2)) / 2 - 40 : (b.minY + b.maxY) / 2;
    cam.centerOn(cx, cy - (top - bottom) / 2 / zoom);
  }

  private zoomTo(zoom: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(Math.round(zoom / ZOOM_STEP) * ZOOM_STEP, this.fitZoom, Math.max(this.fitZoom, snapZoom(this.fitZoom * 3.5))));
    this.clampScroll();
  }

  /** Impide alejar la camara tanto que la granja salga de la pantalla. */
  private clampScroll(): void {
    const cam = this.cameras.main;
    const { minX, maxX, minY, maxY } = this.bounds;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, minX - cam.width / 2, maxX - cam.width / 2);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, minY - cam.height / 2, maxY - cam.height / 2);
  }

  // ---------------------------------------------------------------- construccion

  private build(): void {
    for (const o of this.built) o.destroy();
    this.built = [];
    this.crops.clear();
    this.tired.clear();
    this.bubbles = [];
    this.seasonal = [];
    this.season = null;
    this.hintsKey = '';
    this.tutorialKey = '';

    const { tiles } = this.sim.state.map;
    for (const tile of tiles) this.addGround(tile);
    this.landmarks = [];
    this.landmarkAreas = [];
    this.occluders = [];
    for (const tile of tiles) this.addObject(tile);
    this.addPenFence();
    this.addAnimals();
    this.road = tradeRoad(this.sim.state);
    for (const c of this.caravans.values()) for (const im of c) im.destroy();
    this.caravans.clear();
    this.fadeOccluders();
    this.refresh();
  }

  /** Edificios que no deben quedar tapados, y lo alto que puede taparlos (arboles). */
  private landmarks: Phaser.GameObjects.Image[] = [];
  /** Zonas sin dibujo propio que tampoco deben quedar tapadas (el corral y sus vacas), con su profundidad. */
  private landmarkAreas: { rect: Phaser.Geom.Rectangle; depth: number }[] = [];
  private occluders: Phaser.GameObjects.Image[] = [];

  /**
   * Un arbol delante de un edificio puede taparlo casi entero: se vuelve translucido para que el
   * edificio se vea (lo de detras sigue detras; solo cambia la opacidad).
   */
  private fadeOccluders(): void {
    for (const tree of this.occluders) {
      const tb = tree.getBounds();
      const covers = (bb: Phaser.Geom.Rectangle) => {
        const inter = Phaser.Geom.Rectangle.Intersection(tb, bb);
        return inter.width * inter.height > 0.15 * bb.width * bb.height;
      };
      const hides =
        this.landmarks.some((b) => b.depth < tree.depth && covers(b.getBounds())) ||
        this.landmarkAreas.some((a) => a.depth < tree.depth && covers(a.rect));
      if (hides) tree.setAlpha(0.55);
    }
  }

  private img(key: string, x: number, y: number, ox: number, oy: number, depth: number): Phaser.GameObjects.Image {
    const im = this.add.image(x, y, key).setOrigin(ox, oy).setScale(isPixel.has(key) ? ART : UI_SCALE).setDepth(depth);
    this.built.push(im);
    return im;
  }

  private addGround(tile: Tile): void {
    const { sx, sy } = toScreen(tile.x, tile.y);
    const grass = ['grass_a', 'grass_b', 'grass_c'][(tile.x * 7 + tile.y * 13) % 3];
    const key =
      tile.kind === 'soil' || tile.kind === 'tenant'
        ? 'soil'
        : tile.kind === 'path' || tile.kind === 'market'
          ? 'path'
          : tile.kind === 'wild'
            ? 'wild'
            : grass;
    this.seasonal.push(this.img(key, sx, sy, 0.5, 0, 1));
    // Borde de la isla: corte de tierra bajo las casillas de los lados delanteros del mapa.
    const { width, height } = this.sim.state.map;
    if (tile.y === height - 1) this.img('cliff_l', sx, sy, 0.5, 0, 0);
    if (tile.x === width - 1) this.img('cliff_r', sx, sy, 0.5, 0, 0);
  }

  /**
   * Coloca el dibujo de un objeto sobre la base de las casillas que ocupa, ordenado por su esquina
   * delantera y sin pasar de su ancho (para no invadir la casilla de al lado).
   */
  private place(key: string, tile: { x: number; y: number }, layer: number, n = 1, dy = 0): Phaser.GameObjects.Image {
    const { sx, sy } = blockBase(tile.x, tile.y, n);
    const im = this.img(key, sx, sy + dy, 0.5, 1, depthOf(tile.x + n - 1, tile.y + n - 1, layer));
    const k = isPixel.has(key) ? ART : UI_SCALE;
    return im.setScale(k * fitScale(im.width * k, n));
  }

  private addObject(tile: Tile): void {
    const { sx, sy } = toScreen(tile.x, tile.y);
    const st = this.sim.state;
    switch (tile.kind) {
      case 'house':
      case 'granary':
        this.landmarks.push(this.place(this.stageKey(tile.kind), tile, 5));
        break;
      case 'coop':
        this.landmarks.push(this.place(this.stageKey('coop'), tile, 5));
        this.addBubble('chicken', tile, sx + 18, sy - 44, 'icon_egg');
        break;
      case 'tenant':
        this.place('tenant', tile, 1);
        break;
      case 'site':
        this.place('site', tile, 1);
        break;
      case 'workshop': {
        const id = workshopAt(st, tile.x, tile.y);
        if (id) this.landmarks.push(this.place(id, tile, 5));
        break;
      }
      case 'manor':
        // Ocupa un bloque: se dibuja una vez, desde su casilla de origen.
        if (isBlockOrigin(st, tile)) this.landmarks.push(this.place(`manor_${manorStage(st)}`, tile, 5, objectSize('manor')));
        break;
      case 'monument': {
        // Bloque de 2x2 como la casa solariega: la obra a medias o el monumento terminado.
        if (!isBlockOrigin(st, tile)) break;
        const id = monumentAt(st, tile.x, tile.y);
        if (!id) break;
        const stage = monumentStage(st, id);
        this.landmarks.push(this.place(stage >= STAGES ? `monument_${id}` : `monument_works_${Math.max(1, stage)}`, tile, 5, objectSize('monument')));
        break;
      }
      case 'hamlet': {
        // Ocupa un bloque como la casa solariega: se dibuja una vez, desde la casilla de origen.
        const id = hamletAt(tile.x, tile.y);
        const h = id ? NOBILITY.hamlets[id] : null;
        if (id && h && h.x === tile.x && h.y === tile.y)
          this.landmarks.push(this.place(`hamlet_${h.material}_${hamletLevel(st, id)}`, tile, 5, objectSize('hamlet')));
        break;
      }
      case 'wild':
        // Mojones del baron en la linde de sus tierras
        if (tile.x === PROGRESSION.lands.eastFrom && tile.y % 2 === 0) this.img('boundary', sx - TILE_W / 4, sy + TILE_H * 0.75, 0.5, 1, depthOf(tile.x, tile.y, 3));
        break;
      case 'market': {
        this.landmarks.push(this.place('market', tile, 5));
        // Puesto propio y carreta lista para salir, cada uno en su casilla reservada junto al mercado.
        const free = (a: { x: number; y: number } | null) => {
          const k = a && tileAt(st, a.x, a.y)?.kind;
          return a && (k === 'grass' || k === 'path') ? a : null;
        };
        const stall = free(annexAt(st, 'stall'));
        if (st.stall && stall) this.place('stall', stall, 5);
        const cart = free(annexAt(st, 'cart'));
        if (idleCarts(st) > 0 && cart) this.place('cart', cart, 4, 1, -6);
        break;
      }
      case 'well':
        this.place('well', tile, 5, 1, -4);
        break;
      case 'rocks':
        this.place('rocks', tile, 4, 1, -6);
        break;
      case 'tree':
      {
        // El tronco, en el centro de la casilla (el dibujo se apoya en su vertice inferior).
        const tree = this.place((tile.x + tile.y) % 2 ? 'tree_a' : 'tree_b', tile, 5, 1, -4 * ART);
        this.seasonal.push(tree);
        this.occluders.push(tree);
      }
        break;
      case 'soil': {
        // Capa de tierra cansada (fertilidad baja), entre el suelo y el cultivo.
        const { sx, sy } = toScreen(tile.x, tile.y);
        this.tired.set(plotKey(tile.x, tile.y), this.img('soil_tired', sx, sy, 0.5, 0, 1.5).setVisible(false));
        const crop = this.place('wheat_0', tile, 1).setVisible(false);
        this.crops.set(plotKey(tile.x, tile.y), crop);
        break;
      }
      default:
        break;
    }
  }

  private stageKey(b: BuildingId): string {
    return `${b}_${Math.max(1, visualStage(this.sim.state, b))}`;
  }

  private penTiles(): Tile[] {
    return this.sim.state.map.tiles.filter((tl) => tl.kind === 'pen');
  }

  /** Valla alrededor del corral: los lados traseros detras de la vaca y los delanteros delante. */
  private addPenFence(): void {
    const pen = this.penTiles();
    if (!pen.length) return;
    const x0 = Math.min(...pen.map((p) => p.x));
    const y0 = Math.min(...pen.map((p) => p.y));
    const x1 = Math.max(...pen.map((p) => p.x)) + 1;
    const y1 = Math.max(...pen.map((p) => p.y)) + 1;
    const c = (x: number, y: number) => {
      const s = toScreen(x, y);
      return { x: s.sx, y: s.sy };
    };
    const topV = c(x0, y0);
    const rightV = c(x1, y0);
    const bottomV = c(x1, y1);
    const leftV = c(x0, y1);
    // El corral entero cuenta como edificio: los arboles de delante no lo tapan.
    this.landmarkAreas.push({ rect: new Phaser.Geom.Rectangle(leftV.x, topV.y - 40, rightV.x - leftV.x, bottomV.y - topV.y + 40), depth: depthOf(x1 - 1, y1 - 1, 0) });
    const back = this.add.graphics().setDepth(depthOf(x0, y0, -5));
    const front = this.add.graphics().setDepth(depthOf(x1, y1, 8));
    this.built.push(back, front);
    const stage = visualStage(this.sim.state, 'pen');
    // Con el establo, un cobertizo con heno en la esquina del fondo.
    if (stage >= 2) this.img('pen_shed', topV.x, topV.y + TILE_H + 4, 0.5, 1, depthOf(x0, y0, -4));
    this.drawFence(back, leftV, topV, stage);
    this.drawFence(back, topV, rightV, stage);
    this.drawFence(front, rightV, bottomV, stage);
    this.drawFence(front, bottomV, leftV, stage);
    const midX = (topV.x + bottomV.x) / 2;
    const midY = (topV.y + bottomV.y) / 2;
    this.addBubble('cow', { x: pen[0].x, y: pen[0].y }, midX + 30, midY - 70, 'icon_milk');
    this.addBubble('sheep', { x: pen[0].x, y: pen[0].y }, midX - 40, midY - 50, 'icon_wool');
  }

  /** Valla del corral: estacas toscas, cerca de tablas o muro de piedra segun las mejoras. */
  /**
   * Valla del corral en pixel art: listones en escalera 2:1 (como el borde de las casillas) y postes.
   * Estacas al principio, tablas con el establo y muro de piedra al final.
   */
  private drawFence(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, stage = 1): void {
    const U = ART;
    const steps = Math.max(1, Math.round(Math.abs(b.x - a.x) / (2 * U)));
    const at = (i: number) => ({ x: Math.round((a.x + ((b.x - a.x) * i) / steps) / U) * U, y: Math.round((a.y + ((b.y - a.y) * i) / steps) / U) * U });
    const run = (z: number, h: number, color: number | ((i: number) => number)) => {
      for (let i = 0; i < steps; i++) {
        const p = at(i);
        g.fillStyle(typeof color === 'number' ? color : color(i), 1).fillRect(p.x, p.y - (z + h) * U, 2 * U, h * U);
      }
    };
    const post = (i: number, h: number, dark: number, light: number) => {
      const p = at(i);
      g.fillStyle(0x1b1611, 1).fillRect(p.x - U, p.y - (h + 1) * U, 3 * U, (h + 1) * U);
      g.fillStyle(light, 1).fillRect(p.x, p.y - h * U, U, h * U);
      g.fillStyle(dark, 1).fillRect(p.x + U, p.y - h * U, U, h * U);
    };
    if (stage >= 3) {
      run(0, 7, 0x1b1611);
      for (let row = 0; row < 3; row++) run(row * 2, 2, (i) => [0x7a7568, 0x625e54, 0x928c7c][(i + row) % 3]);
      run(6, 1, 0x4d4a42);
      return;
    }
    const rails = stage === 2 ? [2, 4, 6] : [3, 6];
    for (const z of rails) {
      run(z - 1, 1, 0x1b1611);
      run(z, 1, stage === 2 ? 0x86633d : 0x6d4d2e);
    }
    for (let i = 0; i <= steps; i += stage === 2 ? 3 : 4) post(Math.min(i, steps), 8, 0x3e2a1a, 0x6d4d2e);
  }

  private addBubble(animal: AnimalId, tile: { x: number; y: number }, x: number, y: number, icon: string): void {
    // Placa de madera en pixel art con el icono y el numero (todo a x3).
    const bg = this.add.image(0, 0, 'bubble').setScale(UI_SCALE);
    const ic = this.add.image(-18, -3, icon).setScale(UI_SCALE);
    const label = this.add
      .text(18, -4, '0', { fontFamily: FONT, fontSize: '30px', color: '#ecd08a', fontStyle: 'bold', stroke: '#1b1611', strokeThickness: 6 })
      .setOrigin(0.5);
    const box = this.add.container(x, y, [bg, ic, label]).setDepth(10_000).setVisible(false);
    this.built.push(box);
    this.bubbles.push({ animal, tile, box, label });
    this.respectPause(this.tweens.add({ targets: box, y: y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  }

  // ---------------------------------------------------------------- animales (decorativos)

  private animals: Actor[] = [];

  private addAnimals(): void {
    this.animals = [];
    const free = (kinds: string[]) => (tl: Tile) => kinds.includes(tl.kind);
    const coop = this.sim.state.map.tiles.find((tl) => tl.kind === 'coop');
    if (coop) {
      const area = this.sim.state.map.tiles
        .filter(free(['grass']))
        .filter((tl) => Math.abs(tl.x - coop.x) <= 2 && Math.abs(tl.y - coop.y) <= 1)
        .map((tl) => ({ x: tl.x, y: tl.y }));
      for (let i = 0; i < this.sim.state.herds.chicken.count; i++) this.addAnimal('chicken', area, 0.5);
    }
    // Con el establo, su casilla (la del fondo) queda para el cobertizo: las vacas pastan en las demas.
    const penAll = this.penTiles().map((tl) => ({ x: tl.x, y: tl.y }));
    const shed = visualStage(this.sim.state, 'pen') >= 2 && penAll.length > 1;
    const x0 = Math.min(...penAll.map((p) => p.x));
    const y0 = Math.min(...penAll.map((p) => p.y));
    const pen = shed ? penAll.filter((p) => p.x !== x0 || p.y !== y0) : penAll;
    for (let i = 0; i < this.sim.state.herds.cow.count; i++) this.addAnimal('cow', pen, 0.9);
    // Las ovejas comparten el corral (como mucho seis a la vista, para que no se amontonen).
    for (let i = 0; i < Math.min(6, this.sim.state.herds.sheep.count); i++) this.addAnimal('sheep', pen, 0.8);
    // Aldeanos: cada oficio pasea por donde trabaja.
    const tiles = this.sim.state.map.tiles;
    const coopArea = coop ? tiles.filter((tl) => tl.kind === 'grass' && Math.abs(tl.x - coop.x) <= 1 && Math.abs(tl.y - coop.y) <= 1) : [];
    const areas: Record<JobId, { x: number; y: number }[]> = {
      farmer: tiles.filter((tl) => tl.kind === 'soil'),
      herder: [...pen, ...coopArea],
      carter: tiles.filter((tl) => tl.kind === 'path' && tl.x < PROGRESSION.lands.eastFrom),
      // Los artesanos rondan su taller.
      artisan: tiles.filter(
        (tl) => (tl.kind === 'grass' || tl.kind === 'path') && tiles.some((w) => w.kind === 'workshop' && Math.abs(w.x - tl.x) <= 1 && Math.abs(w.y - tl.y) <= 1),
      ),
    };
    // Labradores, artesanos y carreteros van a su trabajo (life.ts); los pastores, al corral y al gallinero.
    const duties = villagerDuties(this.sim.state);
    for (const v of this.sim.state.villagers) {
      const duty = duties.get(v.id);
      const a = this.addAnimal(`villager_${v.job}`, duty?.area.length ? duty.area : areas[v.job], 0.95);
      if (a) {
        a.villager = v.id;
        a.work = duty?.work ?? null;
      }
    }
    // La mesnada ronda la casa solariega (como mucho seis, para no llenar el mapa).
    const manor = tiles.find((tl) => tl.kind === 'manor');
    if (manor) {
      // Patio: casillas libres alrededor del bloque de la casa (nunca dentro).
      const n = objectSize('manor');
      const yard = tiles.filter((tl) => (tl.kind === 'grass' || tl.kind === 'path') && tl.x >= manor.x - 1 && tl.x <= manor.x + n && tl.y >= manor.y - 1 && tl.y <= manor.y + n);
      for (let i = 0; i < Math.min(6, this.sim.state.noble.soldiers); i++) this.addAnimal('villager_soldier', yard, 0.95);
    }
  }

  private addAnimal(key: string, area: Spot[], oy: number): Actor | null {
    if (!area.length) return null;
    const start = Phaser.Utils.Array.GetRandom(area);
    const gx = start.x + 0.5;
    const gy = start.y + 0.5;
    const { sx, sy } = toScreen(gx, gy);
    const sprite = this.img(key, sx, sy, 0.5, oy, depthOf(gx, gy, 2));
    const actor: Actor = { sprite, area, gx, gy, busy: false, villager: null, work: null };
    this.animals.push(actor);
    return actor;
  }

  /** Cada dia cambia el trabajo: un taller que se queda sin materia prima, el dia de venta del carretero... */
  private updateDuties(): void {
    const duties = villagerDuties(this.sim.state);
    for (const a of this.animals) {
      if (a.villager === null) continue;
      const d = duties.get(a.villager);
      if (!d) continue;
      if (d.area.length) a.area = d.area;
      a.work = d.work;
    }
  }

  /** Al llegar a su sitio, el labrador cava y el artesano martillea un rato (unos saltitos o un balanceo). */
  private doWork(a: Actor, onDone: () => void): void {
    const base = a.sprite.y;
    const tw =
      a.work === 'hoe'
        ? this.tweens.add({ targets: a.sprite, y: base - ART, duration: 160, yoyo: true, repeat: 3, hold: 120, onComplete: () => (a.sprite.setY(base), onDone()) })
        : this.tweens.add({ targets: a.sprite, angle: 8, duration: 110, yoyo: true, repeat: 5, hold: 60, onComplete: () => (a.sprite.setAngle(0), onDone()) });
    this.respectPause(tw);
  }

  // ---------------------------------------------------------------- caravanas en el camino

  /** Camino de las caravanas (del mercado al borde del mapa). */
  private road: Spot[] = [];
  /** Caravanas a la vista: carreta, carretero y, con escolta, un soldado. */
  private caravans = new Map<number, Phaser.GameObjects.Image[]>();

  /** Coloca cada frame las caravanas que salen o vuelven, segun la hora del dia (life.ts). */
  private moveCaravans(): void {
    if (this.road.length < 2) return;
    const seen = new Set<number>();
    for (const c of roadCaravans(this.sim.state)) {
      seen.add(c.id);
      let parts = this.caravans.get(c.id);
      if (!parts) {
        const mk = (key: string, oy: number) => this.add.image(0, 0, key).setOrigin(0.5, oy).setScale(ART);
        parts = [mk('cart', 0.85), mk('villager_carter', 0.95)];
        if (c.escort) parts.push(mk('villager_soldier', 0.95));
        this.caravans.set(c.id, parts);
      }
      // El carretero va delante tirando de la carreta; el soldado, detras. Hacia fuera o hacia el mercado.
      const ahead = c.returning ? -1 : 1;
      const step = 0.35 / (this.road.length - 1);
      const offsets = [0, ahead * step, -ahead * step];
      const here = pointOnRoad(this.road, c.t);
      const next = pointOnRoad(this.road, c.t + ahead * 0.02);
      const flip = toScreen(next.x, next.y).sx < toScreen(here.x, here.y).sx;
      // Se desvanece al salir del mapa (ultimo tramo del camino) y aparece al volver.
      const alpha = Math.max(0, Math.min(1, (1 - c.t) / 0.12));
      parts.forEach((im, i) => {
        const p = pointOnRoad(this.road, c.t + offsets[i]);
        const { sx, sy } = toScreen(p.x, p.y);
        im.setPosition(Math.round(sx / ART) * ART, Math.round(sy / ART) * ART)
          .setDepth(depthOf(p.x, p.y, 2))
          .setFlipX(flip)
          .setAlpha(alpha);
      });
    }
    for (const [id, parts] of this.caravans) {
      if (seen.has(id)) continue;
      for (const im of parts) im.destroy();
      this.caravans.delete(id);
    }
  }

  private wander(): void {
    for (const a of this.animals) {
      if (a.busy || Math.random() < 0.45) continue;
      const tile = Phaser.Utils.Array.GetRandom(a.area);
      const gx = tile.x + 0.2 + Math.random() * 0.6;
      const gy = tile.y + 0.2 + Math.random() * 0.6;
      const { sx, sy } = toScreen(gx, gy);
      a.busy = true;
      a.sprite.setFlipX(sx < a.sprite.x);
      const from = { gx: a.gx, gy: a.gy };
      this.tweens.add({
        targets: a.sprite,
        x: sx,
        y: sy,
        duration: 700 + Math.hypot(sx - a.sprite.x, sy - a.sprite.y) * 8,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          a.sprite.setPosition(Math.round(a.sprite.x / ART) * ART, Math.round(a.sprite.y / ART) * ART);
          const k = tw.progress;
          a.sprite.setDepth(depthOf(from.gx + (gx - from.gx) * k, from.gy + (gy - from.gy) * k, 2));
        },
        onComplete: () => {
          a.gx = gx;
          a.gy = gy;
          if (a.work) this.doWork(a, () => (a.busy = false));
          else a.busy = false;
        },
      });
    }
  }

  // ---------------------------------------------------------------- sincronizar con el estado

  private onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case 'loaded':
        this.build();
        this.fit();
        break;
      case 'mapChanged':
        this.build();
        break;
      case 'day':
        this.updateDuties();
        break;
      case 'notice':
        // Al ser Terrateniente el encuadre en vertical pasa a incluir las tierras del este.
        if (e.notice.card === 'rank') this.fit();
        break;
      case 'change':
        this.refresh();
        this.syncSpeed();
        break;
      case 'result':
        if (e.result.ok && e.x !== undefined && e.y !== undefined && e.result.params?.amount !== undefined) {
          const sign = e.result.msg === 'msg.planted' ? '' : '+';
          this.floatText(e.x, e.y, `${sign}${e.result.params.amount} ${t(`product.${e.result.params.product}`)}`);
        } else if (e.result.ok && (e.result.msg === 'msg.planted' || e.result.msg === 'msg.landBought') && e.x !== undefined && e.y !== undefined) {
          this.floatText(e.x, e.y, `−${e.result.params?.cost}`, '#d98b6a');
        }
        break;
      default:
        break;
    }
  }

  private applySeason(): void {
    const season = dateFromDay(this.sim.state.day).season;
    if (season === this.season) return;
    this.season = season;
    const tint = SEASON_TINT[season];
    for (const im of this.seasonal) {
      const base = im.texture.key.endsWith(SNOW) ? im.texture.key.slice(0, -SNOW.length) : im.texture.key;
      const snowy = season === 'winter' && this.textures.exists(base + SNOW);
      im.setTexture(snowy ? base + SNOW : base);
      if (tint === null) im.clearTint();
      else im.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  private hintsKey = '';

  private drawLandHints(): void {
    const s = this.sim.state;
    // Se redibuja solo cuando cambia algo que afecta (la escena refresca en cada fotograma).
    const key = `${s.level}|${plotCount(s)}|${s.rank}|${s.leases}`;
    if (key === this.hintsKey) return;
    this.hintsKey = key;
    const g = this.landHints;
    g.clear();
    const canBuy = hasFeature(s, 'buyLand') && plotCount(s) < levelDef(s.level).maxPlots;
    for (const tile of s.map.tiles) {
      const buy = canBuy && canExpandAt(s, tile.x, tile.y);
      const lease = canLeaseAt(s, tile.x, tile.y);
      if (!buy && !lease) continue;
      // Dorado para roturar; rojo del baron para arrendar a un aparcero.
      g.fillStyle(lease ? 0xc0573f : 0xe8d08a, 0.75);
      const { sx, sy } = toScreen(tile.x, tile.y);
      const corners = [
        [sx, sy + 6],
        [sx + TILE_W / 2 - 12, sy + TILE_H / 2],
        [sx, sy + TILE_H - 6],
        [sx - TILE_W / 2 + 12, sy + TILE_H / 2],
      ];
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = corners[i];
        const [bx, by] = corners[(i + 1) % 4];
        for (let k = 0; k < 6; k++) {
          const f = k / 6;
          g.fillCircle(ax + (bx - ax) * f, ay + (by - ay) * f, 2.2);
        }
      }
    }
  }

  private drawTutorialMarks(): void {
    const tiles = tutorialTiles(this.sim.state);
    const key = tiles.map((tl) => `${tl.x},${tl.y}`).join('|');
    if (key === this.tutorialKey) return;
    this.tutorialKey = key;
    const g = this.tutorialMarks;
    g.clear();
    for (const tile of tiles) {
      const { sx, sy } = toScreen(tile.x, tile.y);
      g.lineStyle(5, 0x24170e, 0.9);
      g.strokePoints([new Phaser.Math.Vector2(sx, sy + 3), new Phaser.Math.Vector2(sx + TILE_W / 2 - 5, sy + TILE_H / 2), new Phaser.Math.Vector2(sx, sy + TILE_H - 3), new Phaser.Math.Vector2(sx - TILE_W / 2 + 5, sy + TILE_H / 2)], true);
      g.lineStyle(3, 0xf0d27f, 1);
      g.strokePoints([new Phaser.Math.Vector2(sx, sy + 3), new Phaser.Math.Vector2(sx + TILE_W / 2 - 5, sy + TILE_H / 2), new Phaser.Math.Vector2(sx, sy + TILE_H - 3), new Phaser.Math.Vector2(sx - TILE_W / 2 + 5, sy + TILE_H / 2)], true);
    }
  }

  private refresh(): void {
    this.applySeason();
    this.drawLandHints();
    this.drawTutorialMarks();
    const s = this.sim.state;
    const winter = dateFromDay(s.day).season === 'winter';
    for (const [key, layer] of this.tired) layer.setVisible(!winter && (s.plots[key]?.fertility ?? 1) < PROGRESSION.fertility.tiredBelow);
    for (const [key, sprite] of this.crops) {
      const plot = s.plots[key];
      const stage = plot ? cropStage(plot) : -1;
      if (stage < 0 || !plot?.crop) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setTexture(CROPS[plot.crop].stageSprites[stage]).setVisible(true);
    }
    for (const b of this.bubbles) {
      const stored = Math.floor(s.herds[b.animal].stored);
      b.box.setVisible(stored >= 1);
      b.label.setText(String(stored));
    }
  }

  private lastSpeed = -1;

  private syncSpeed(): void {
    const speed = this.sim.state.speed;
    if (speed === this.lastSpeed) return;
    this.lastSpeed = speed;
    // Se pausan y reanudan las animaciones una a una: las de respuesta al jugador (textos flotantes)
    // siguen siempre. Reanudar solo el gestor no basta, porque no despausa cada animacion.
    for (const tw of this.tweens.getTweens()) {
      if (this.feedbackTweens.has(tw)) continue;
      if (speed === 0) tw.pause();
      else if (tw.paused) tw.resume();
    }
    this.time.paused = speed === 0;
    if (speed > 0) {
      this.tweens.timeScale = speed;
      this.time.timeScale = speed;
    }
  }

  /** Las animaciones nuevas nacen en el estado de pausa actual. */
  private respectPause(tw: Phaser.Tweens.Tween): Phaser.Tweens.Tween {
    if (this.sim.state.speed === 0) tw.pause();
    return tw;
  }

  private floatText(x: number, y: number, text: string, color = '#ecd08a'): void {
    const { cx, cy } = tileCenter(x, y);
    const label = this.add
      .text(cx, cy - 30, text, {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color,
        stroke: '#140e08',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(20_000);
    // Este tween no se pausa con el juego: es respuesta inmediata al toque.
    const tw = this.tweens.add({
      targets: label,
      y: cy - 80,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.feedbackTweens.delete(tw);
        label.destroy();
      },
    });
    this.feedbackTweens.add(tw);
  }

  // ---------------------------------------------------------------- entrada

  private drag: { scrollX: number; scrollY: number; moved: boolean } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;

  private bothPointers(): [Phaser.Input.Pointer, Phaser.Input.Pointer] | null {
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    return a?.isDown && b?.isDown ? [a, b] : null;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    const two = this.bothPointers();
    if (two) {
      this.pinch = { dist: Phaser.Math.Distance.BetweenPoints(two[0], two[1]), zoom: this.cameras.main.zoom };
      this.downAt = null;
      return;
    }
    this.downAt = { x: p.x, y: p.y };
    this.drag = { scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY, moved: false };
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const down = this.downAt;
    const dragged = this.drag?.moved;
    this.downAt = null;
    this.drag = null;
    if (!this.bothPointers()) this.pinch = null;
    if (!down || dragged || Math.hypot(p.x - down.x, p.y - down.y) > TAP_SLOP * this.getInsets().dpr) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    for (const b of this.bubbles) {
      if (b.box.visible && Math.hypot(w.x - b.box.x, w.y - b.box.y) < 30) {
        this.sim.interact(b.tile.x, b.tile.y);
        return;
      }
    }
    const { x, y } = toTile(w.x, w.y);
    this.sim.interact(x, y);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const two = this.bothPointers();
    if (two && this.pinch) {
      const dist = Phaser.Math.Distance.BetweenPoints(two[0], two[1]);
      this.zoomTo(this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)));
      return;
    }
    if (p.isDown && this.downAt && this.drag) {
      const dx = p.x - this.downAt.x;
      const dy = p.y - this.downAt.y;
      if (this.drag.moved || Math.hypot(dx, dy) > TAP_SLOP * this.getInsets().dpr) {
        this.drag.moved = true;
        const cam = this.cameras.main;
        cam.scrollX = this.drag.scrollX - dx / cam.zoom;
        cam.scrollY = this.drag.scrollY - dy / cam.zoom;
        this.clampScroll();
        this.hover.clear();
        return;
      }
    }
    this.hover.clear();
    if (p.wasTouch) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const { x, y } = toTile(w.x, w.y);
    const s = this.sim.state;
    const tile = x >= 0 && y >= 0 && x < s.map.width && y < s.map.height ? s.map.tiles[y * s.map.width + x] : undefined;
    const expandable = tile?.kind === 'grass' && ((hasFeature(s, 'buyLand') && canExpandAt(s, x, y)) || canLeaseAt(s, x, y));
    if (!tile || (!expandable && !['soil', 'coop', 'pen', 'market', 'house', 'granary', 'tenant', 'site', 'workshop'].includes(tile.kind))) {
      this.input.setDefaultCursor('default');
      return;
    }
    this.input.setDefaultCursor('pointer');
    const { sx, sy } = toScreen(x, y);
    this.hover.lineStyle(3, expandable ? 0xb8c48a : 0xd9b45a, 0.95);
    this.hover.beginPath();
    this.hover.moveTo(sx, sy);
    this.hover.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
    this.hover.lineTo(sx, sy + TILE_H);
    this.hover.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
    this.hover.closePath();
    this.hover.strokePath();
  }
}
