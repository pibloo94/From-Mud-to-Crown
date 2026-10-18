// Escena isometrica: dibuja el estado de la partida y convierte toques en ordenes.
// No contiene reglas del juego: todo pasa por `Game`.
import Phaser from 'phaser';
import type { Game, GameEvent } from '../sim/game';
import { CROPS } from '../sim/data';
import { cropStage } from '../sim/rules';
import { plotKey } from '../sim/state';
import type { AnimalId, Tile } from '../sim/types';
import { t } from '../i18n/i18n';
import { depthOf, TILE_H, TILE_W, tileCenter, toScreen, toTile } from './iso';

/** Los SVG se rasterizan al doble de tamano para que se vean nitidos en pantallas de alta densidad. */
const RES = 2;
const SPRITES = [
  'grass_a', 'grass_b', 'grass_c', 'soil', 'path',
  'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3',
  'house', 'coop', 'market', 'well', 'rocks', 'tree_a', 'tree_b',
  'cow', 'chicken', 'bubble', 'icon_egg', 'icon_milk', 'icon_wheat', 'icon_coin',
];
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

export class FarmScene extends Phaser.Scene {
  private built: Phaser.GameObjects.GameObject[] = [];
  private crops = new Map<string, Phaser.GameObjects.Image>();
  private bubbles: Bubble[] = [];
  private hover!: Phaser.GameObjects.Graphics;
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
    const portraitZoom = Math.min(W / (bw * 0.64), avail / bh);
    const zoom = H > W ? Math.max(this.fitZoom, portraitZoom) : this.fitZoom;
    cam.setZoom(zoom);
    cam.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 - (top - bottom) / 2 / zoom);
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
    const key = tile.kind === 'soil' ? 'soil' : tile.kind === 'path' || tile.kind === 'market' ? 'path' : grass;
    this.img(key, sx, sy, 0.5, 0, 1);
  }

  private addObject(tile: Tile): void {
    const { sx, sy } = toScreen(tile.x, tile.y);
    const bottom = sy + TILE_H;
    switch (tile.kind) {
      case 'house':
        this.img('house', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'coop':
        this.img('coop', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        this.addBubble('chicken', tile, sx + 18, sy - 44, 'icon_egg');
        break;
      case 'market':
        this.img('market', sx, bottom, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'well':
        this.img('well', sx, bottom - 4, 0.5, 1, depthOf(tile.x, tile.y, 5));
        break;
      case 'rocks':
        this.img('rocks', sx, bottom - 6, 0.5, 1, depthOf(tile.x, tile.y, 4));
        break;
      case 'tree':
        this.img((tile.x + tile.y) % 2 ? 'tree_a' : 'tree_b', sx, bottom + 6, 0.5, 1, depthOf(tile.x, tile.y, 5));
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
    this.drawFence(back, leftV, topV);
    this.drawFence(back, topV, rightV);
    this.drawFence(front, rightV, bottomV);
    this.drawFence(front, bottomV, leftV);
    const midX = (topV.x + bottomV.x) / 2;
    const midY = (topV.y + bottomV.y) / 2;
    this.addBubble('cow', { x: pen[0].x, y: pen[0].y }, midX + 30, midY - 70, 'icon_milk');
  }

  private drawFence(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }): void {
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
    this.tweens.add({ targets: box, y: y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
      case 'change':
        this.refresh();
        this.syncSpeed();
        break;
      case 'result':
        if (e.result.ok && e.x !== undefined && e.y !== undefined && e.result.params?.amount !== undefined) {
          const sign = e.result.msg === 'msg.planted' ? '' : '+';
          this.floatText(e.x, e.y, `${sign}${e.result.params.amount} ${t(`product.${e.result.params.product}`)}`);
        } else if (e.result.ok && e.result.msg === 'msg.planted' && e.x !== undefined && e.y !== undefined) {
          this.floatText(e.x, e.y, `−${e.result.params?.cost}`, '#d98b6a');
        }
        break;
      default:
        break;
    }
  }

  private refresh(): void {
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
      const stored = s.herds[b.animal].stored;
      b.box.setVisible(stored > 0);
      b.label.setText(String(stored));
    }
  }

  private lastSpeed = -1;

  private syncSpeed(): void {
    const speed = this.sim.state.speed;
    if (speed === this.lastSpeed) return;
    this.lastSpeed = speed;
    if (speed === 0) {
      this.tweens.pauseAll();
      this.time.paused = true;
    } else {
      this.tweens.resumeAll();
      this.tweens.timeScale = speed;
      this.time.paused = false;
      this.time.timeScale = speed;
    }
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
      onComplete: () => label.destroy(),
    });
    if (this.sim.state.speed === 0) tw.resume();
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
    if (!tile || !['soil', 'coop', 'pen', 'market', 'house'].includes(tile.kind)) {
      this.input.setDefaultCursor('default');
      return;
    }
    this.input.setDefaultCursor('pointer');
    const { sx, sy } = toScreen(x, y);
    this.hover.lineStyle(3, 0xd9b45a, 0.95);
    this.hover.beginPath();
    this.hover.moveTo(sx, sy);
    this.hover.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
    this.hover.lineTo(sx, sy + TILE_H);
    this.hover.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
    this.hover.closePath();
    this.hover.strokePath();
  }
}
