import Phaser from 'phaser';
import './style.css';
import { Game } from './sim/game';
import { FarmScene } from './render/FarmScene';
import { createUI } from './ui/ui';
import { music } from './audio/music';

const parent = document.getElementById('game')!;
const uiRoot = document.getElementById('ui')!;

const sim = new Game();
let scene: FarmScene | null = null;
const ui = createUI(sim, uiRoot, () => scene?.fit());

// El lienzo se crea a la resolucion real de la pantalla (hasta 2x) y se muestra a tamano CSS,
// para que el arte se vea nitido en moviles y pantallas retina.
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
const size = () => ({ w: Math.round(parent.clientWidth * dpr()), h: Math.round(parent.clientHeight * dpr()) });

scene = new FarmScene(sim, ui.getInsets);
const { w, h } = size();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#161812',
  banner: false,
  scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / dpr() },
  input: { activePointers: 2 },
  scene,
});

// Modo depuracion: con ?debug en la URL, la partida queda accesible desde la consola como `fmtc`.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).fmtc = { sim, game, music };
}

window.addEventListener('resize', () => {
  const s = size();
  game.scale.setZoom(1 / dpr());
  game.scale.resize(s.w, s.h);
  scene?.fit();
});
