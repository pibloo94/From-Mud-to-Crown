// Escena isometrica: dibuja el estado de la partida y convierte toques en ordenes.
// No contiene reglas del juego: todo pasa por `Game`.
import Phaser from 'phaser';
import type { Game, GameEvent } from '../sim/game';
import { CROPS, PROGRESSION } from '../sim/data';
import { canExpandAt, canLeaseAt, cropStage, plotCount } from '../sim/rules';
import { visualStage } from '../sim/buildings';
import { workshopAt } from '../sim/workshops';
import { idleCarts } from '../sim/trade';
import { hasFeature, levelDef } from '../sim/progress';
import { dateFromDay, type Season } from '../sim/calendar';
import { plotKey } from '../sim/state';
import type { AnimalId, BuildingId, JobId, Tile } from '../sim/types';
import { t } from '../i18n/i18n';
import { depthOf, TILE_H, TILE_W, tileCenter, toScreen, toTile } from './iso';

/** Los SVG se rasterizan al doble de tamano para que se vean nitidos en pantallas de alta densidad. */
const RES = 2;
const SPRITES = [
  'grass_a', 'grass_b', 'grass_c', 'soil', 'path',
  'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3',
  'carrot_0', 'carrot_1', 'carrot_2', 'carrot_3',
  'cabbage_0', 'cabbage_1', 'cabbage_2', 'cabbage_3',
  'house_1', 'house_2', 'house_3', 'granary_1', 'granary_2', 'granary_3', 'coop_1', 'coop_2', 'coop_3', 'pen_shed',
  'market', 'well', 'rocks', 'tree_a', 'tree_b', 'wild', 'boundary', 'tenant',
  'site', 'mill', 'bakery', 'cheesery', 'villager_artisan', 'cart', 'stall',
  'cow', 'chicken', 'villager_farmer', 'villager_herder', 'villager_carter',
  'bubble', 'icon_egg', 'icon_milk', 'icon_wheat', 'icon_coin',
];

/**
 * Color de cada estacion sobre hierba y arboles. MULTIPLY tine y oscurece; SCREEN aclara
 * (la escarcha del invierno).
 */
const SEASON_TINT: Record<Season, { color: number; mode: 'multiply' | 'screen' } | null> = {
  spring: null,
  summer: { color: 0xfff0c4, mode: 'multiply' },
  autumn: { color: 0xf2bf7a, mode: 'multiply' },
  winter: { color: 0x7d8a96, mode: 'screen' },
};
const FONT = 'Cinzel, "Times New Roman", serif';
const TAP_SLOP = 12;

/** Margenes (en pixeles CSS) que ocupa la interfaz HTML encima del lienzo. */
export interface Insets {
  top: number;
  bottom: number;
  /** Pixeles del lienzo por pixel CSS. */
  dpr: number;
}

interface Bubble {
  animal: AnimalId;
  tile: { x: number; y: number };
  box: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
}

/** Rellena un cuadrilatero dado como [x0, y0, x1, y1, ...]. */
function fillQuad(g: Phaser.GameObjects.Graphics, p: number[]): void {
  g.beginPath();
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
  g.fillPath();
}

export class FarmScene extends Phaser.Scene {
  private built: Phaser.GameObjects.GameObject[] = [];
  private crops = new Map<string, Phaser.GameObjects.Image>();
  private bubbles: Bubble[] = [];
  /** Hierba y arboles: lo que cambia de color con la estacion. */
  private seasonal: Phaser.GameObjects.Image[] = [];
  private season: Season | null = null;
  private hover!: Phaser.GameObjects.Graphics;
  /** Animaciones de respuesta al jugador: no se detienen con la pausa del juego. */
  private feedbackTweens = new Set<Phaser.Tweens.Tween>();
  /** Contornos punteados sobre la hierba que se puede roturar. */
  private landHints!: Phaser.GameObjects.Graphics;
  private downAt: { x: number; y: number } | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly sim: Game,
    private readonly getInsets: () => Insets,
  ) {
    super('farm');
  }

  preload(): void {
    for (const key of SPRITES) this.load.svg(key, `assets/sprites/${key}.svg`, { scale: RES });
  }

  create(): void {
    this.hover = this.add.graphics().setDepth(60);
    this.landHints = this.add.graphics().setDepth(55);
    this.build();
    this.fit();

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.9 : 1.1));
    this.input.on('gameout', () => this.hover.clear());

    this.unsubscribe = this.sim.on((e) => this.onGameEvent(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.wander() });
    this.syncSpeed();
  }

  update(_time: number, delta: number): void {
    this.sim.update(delta);
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
    this.fitZoom = Math.min(W / bw, avail / bh) * 0.96;
    // En vertical (movil) el mapa entero queda diminuto: se encuadra la parte central y se puede arrastrar.
    // En vertical se encuadra la granja (sin las tierras cerradas del este, que se ven arrastrando).
    const portrait = H > W;
    const homeW = this.sim.state.rank === 'landowner' ? mw : Math.min(mw, PROGRESSION.lands.eastFrom);
    const homeBw = (homeW + mh) * (TILE_W / 2);
    const portraitZoom = Math.min(W / (homeBw * 0.64), avail / bh);
    const zoom = portrait ? Math.max(this.fitZoom, portraitZoom) : this.fitZoom;
    cam.setZoom(zoom);
    const cx = portrait ? ((homeW - mh) * (TILE_W / 2)) / 2 : (b.minX + b.maxX) / 2;
    const cy = portrait ? ((homeW + mh) * (TILE_H / 2)) / 2 - 40 : (b.minY + b.maxY) / 2;
    cam.centerOn(cx, cy - (top - bottom) / 2 / zoom);
  }

  private zoomBy(factor: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.fitZoom * 0.9, this.fitZoom * 3.5));
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
    this.bubbles = [];
    this.seasonal = [];
    this.season = null;
    this.hintsKey = '';

    const { tiles } = this.sim.state.map;
    for (const tile of tiles) this.addGround(tile);
    for (const tile of tiles) this.addObject(tile);
    this.addPenFence();
    this.addAnimals();
    this.refresh();
  }

  private img(key: string, x: number, y: number, ox: number, oy: number, depth: number): Phaser.GameObjects.Image {
    const im = this.add.image(x, y, key).setOrigin(ox, oy).setScale(1 / RES).setDepth(depth);
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
  }

  private addObject(tile: Tile): void {
    const { sx, sy } = toScreen(tile.x, tile.y);
    const bottom = sy + TILE_H;
    switch (tile.kind) {
      case 'house':
        this.img(this.stageKey('house'), sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'granary':
        this.img(this.stageKey('granary'), sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'coop':
        this.img(this.stageKey('coop'), sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        this.addBubble('chicken', tile, sx + 18, sy - 44, 'icon_egg');
        break;
      case 'tenant':
        this.img('tenant', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 1));
        break;
      case 'site':
        this.img('site', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 1));
        break;
      case 'workshop': {
        const id = workshopAt(this.sim.state, tile.x, tile.y);
        if (id) this.img(id, sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      }
      case 'wild':
        // Mojones del baron en la linde de sus tierras
        if (tile.x === PROGRESSION.lands.eastFrom && tile.y % 2 === 0) this.img('boundary', sx - TILE_W / 4, sy + TILE_H * 0.75, 0.5, 1, depthOf(tile.x, tile.y, 3));
        break;
      case 'market': {
        this.img('market', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        const st = this.sim.state;
        // Puesto propio a un lado del mercado y carreta lista para salir al otro.
        if (st.stall) {
          const p = toScreen(tile.x - 1, tile.y);
          this.img('stall', p.sx, p.sy + TILE_H, 0.5, 1, depthOf(tile.x - 1, tile.y, 5));
        }
        if (idleCarts(st) > 0) {
          const p = toScreen(tile.x + 1, tile.y);
          this.img('cart', p.sx, p.sy + TILE_H - 6, 0.5, 1, depthOf(tile.x + 1, tile.y, 4));
        }
        break;
      }
      case 'well':
        this.img('well', sx, bottom - 4, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'rocks':
        this.img('rocks', sx, bottom - 6, 0.5, 1, depthOf(tile.x, tile.y, 4));
        break;
      case 'tree':
        this.seasonal.push(this.img((tile.x + tile.y) % 2 ? 'tree_a' : 'tree_b', sx, bottom + 6, 0.5, 1, depthOf(tile.x, tile.y, 5)));
        break;
      case 'soil': {
        const crop = this.img('wheat_0', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 1)).setVisible(false);
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
  }

  /** Valla del corral: estacas toscas, cerca de tablas o muro de piedra segun las mejoras. */
  private drawFence(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, stage = 1): void {
    if (stage >= 3) {
      const blocks = 10;
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < blocks; i++) {
          const f0 = (i + (row % 2 ? 0.5 : 0)) / blocks;
          const f1 = Math.min(1, f0 + 1 / blocks);
          if (f0 >= 1) continue;
          const x0 = a.x + (b.x - a.x) * f0;
          const y0 = a.y + (b.y - a.y) * f0 - row * 8;
          const x1 = a.x + (b.x - a.x) * f1;
          const y1 = a.y + (b.y - a.y) * f1 - row * 8;
          const shade = [0x77715f, 0x8f8873, 0x6a6455][(i + row) % 3];
          g.fillStyle(0x35322a, 1);
          fillQuad(g, [x0, y0, x1, y1, x1, y1 - 8, x0, y0 - 8]);
          g.fillStyle(shade, 1);
          fillQuad(g, [x0 + 1, y0 - 1, x1 - 1, y1 - 1, x1 - 1, y1 - 7, x0 + 1, y0 - 7]);
        }
      }
      g.lineStyle(3, 0x4f4a3e, 1).lineBetween(a.x, a.y - 25, b.x, b.y - 25);
      return;
    }
    if (stage === 2) {
      // tablas horizontales mas tupidas y postes cuadrados
      for (const h of [7, 14, 21]) {
        g.lineStyle(6, 0x24170e, 1).lineBetween(a.x, a.y - h, b.x, b.y - h);
        g.lineStyle(4, 0x8a6a44, 1).lineBetween(a.x, a.y - h, b.x, b.y - h);
      }
      for (let i = 0; i <= 4; i++) {
        const f = i / 4;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        g.fillStyle(0x24170e, 1).fillRect(x - 4, y - 29, 8, 30);
        g.fillStyle(0x6a4a2c, 1).fillRect(x - 3, y - 28, 6, 28);
      }
      return;
    }
    const posts = 5;
    g.lineStyle(4, 0x24170e, 1);
    for (const h of [10, 20]) g.lineBetween(a.x, a.y - h, b.x, b.y - h);
    g.lineStyle(3, 0x6a4a2c, 1);
    for (const h of [10, 20]) g.lineBetween(a.x, a.y - h, b.x, b.y - h);
    for (let i = 0; i <= posts; i++) {
      const f = i / posts;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      g.fillStyle(0x24170e, 1).fillRect(x - 3, y - 26, 6, 27);
      g.fillStyle(0x5a3e24, 1).fillRect(x - 2, y - 25, 4, 25);
    }
  }

  private addBubble(animal: AnimalId, tile: { x: number; y: number }, x: number, y: number, icon: string): void {
    const bg = this.add.image(0, 0, 'bubble').setScale(1.15 / RES);
    const ic = this.add.image(-8, -7, icon).setScale(0.62 / RES);
    const label = this.add
      .text(10, -8, '0', { fontFamily: FONT, fontSize: '18px', color: '#ecd08a', fontStyle: 'bold' })
      .setOrigin(0.5);
    const box = this.add.container(x, y, [bg, ic, label]).setDepth(10_000).setVisible(false);
    this.built.push(box);
    this.bubbles.push({ animal, tile, box, label });
    this.respectPause(this.tweens.add({ targets: box, y: y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  }

  // ---------------------------------------------------------------- animales (decorativos)

  private animals: { sprite: Phaser.GameObjects.Image; area: { x: number; y: number }[]; gx: number; gy: number; busy: boolean }[] = [];

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
    const pen = this.penTiles().map((tl) => ({ x: tl.x, y: tl.y }));
    for (let i = 0; i < this.sim.state.herds.cow.count; i++) this.addAnimal('cow', pen, 0.9);
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
    for (const v of this.sim.state.villagers) this.addAnimal(`villager_${v.job}`, areas[v.job], 0.95);
  }

  private addAnimal(key: string, area: { x: number; y: number }[], oy: number): void {
    if (!area.length) return;
    const start = Phaser.Utils.Array.GetRandom(area);
    const gx = start.x + 0.5;
    const gy = start.y + 0.5;
    const { sx, sy } = toScreen(gx, gy);
    const sprite = this.img(key, sx, sy, 0.5, oy, depthOf(gx, gy, 2));
    this.animals.push({ sprite, area, gx, gy, busy: false });
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
          const k = tw.progress;
          a.sprite.setDepth(depthOf(from.gx + (gx - from.gx) * k, from.gy + (gy - from.gy) * k, 2));
        },
        onComplete: () => {
          a.gx = gx;
          a.gy = gy;
          a.busy = false;
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
      if (!tint) im.clearTint();
      else im.setTint(tint.color).setTintMode(tint.mode === 'screen' ? Phaser.TintModes.SCREEN : Phaser.TintModes.MULTIPLY);
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

  private refresh(): void {
    this.applySeason();
    this.drawLandHints();
    const s = this.sim.state;
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
      this.zoomBy((this.pinch.zoom * (dist / Math.max(1, this.pinch.dist))) / this.cameras.main.zoom);
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
