// Fanfarrias sintetizadas (Web Audio, sin archivos): metales y timbales para nivel, rango, estacion y eventos.
// En Re, como la musica, para que no desentonen si suenan a la vez.

export type FanfareKind = 'level' | 'rank' | 'season' | 'event';

const VOLUME_KEY = 'fmtc-fanfare-vol';
const MASTER = 0.42;

/** Nota de metal: [segundo de inicio, nota MIDI, duracion, intensidad 0-1]. */
type Note = [number, number, number, number];

interface Piece {
  brass: Note[];
  /** Golpes de timbal: [segundo, nota MIDI, intensidad]. */
  timpani: [number, number, number][];
}

// Notas MIDI usadas
const D3 = 50, F3 = 53, A3 = 57, D4 = 62, Fs4 = 66, A4 = 69, D5 = 74;

const PIECES: Record<FanfareKind, Piece> = {
  // Tres notas ascendentes y una larga
  level: {
    brass: [[0, A4, 0.11, 0.8], [0.13, A4, 0.11, 0.8], [0.26, D5, 0.55, 1], [0.26, Fs4, 0.55, 0.6]],
    timpani: [[0.26, 38, 0.9]],
  },
  // Toque de heraldo a dos voces con redoble
  rank: {
    brass: [
      [0, D4, 0.16, 0.8], [0.18, D4, 0.08, 0.7], [0.27, D4, 0.08, 0.7], [0.36, A4, 0.34, 1],
      [0.72, Fs4, 0.16, 0.8], [0.9, A4, 0.16, 0.9], [1.08, D5, 1.0, 1],
      [0.36, Fs4, 0.34, 0.55], [0.72, D4, 0.16, 0.5], [0.9, Fs4, 0.16, 0.55], [1.08, A4, 1.0, 0.7], [1.08, D4, 1.0, 0.5],
    ],
    timpani: [[0, 38, 0.6], [0.36, 45, 0.7], [0.9, 45, 0.5], [0.96, 45, 0.55], [1.02, 45, 0.6], [1.08, 38, 1]],
  },
  // Llamada de cuerno: quinta y tonica, tranquila
  season: {
    brass: [[0, A3, 0.32, 0.7], [0.36, D4, 0.7, 0.85], [0.36, A3, 0.7, 0.45]],
    timpani: [[0.36, 38, 0.6]],
  },
  // Cuerno grave en menor: aviso de una decision
  event: {
    brass: [[0, D3, 0.22, 0.75], [0.24, F3, 0.22, 0.75], [0.48, D3, 0.6, 0.85]],
    timpani: [[0, 38, 0.45], [0.48, 38, 0.6]],
  },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Fanfare {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private volume = readVolume();

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* preferencia no persistente */
    }
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(MASTER * this.volume, this.ctx.currentTime, 0.05);
  }

  /** Llamar desde un gesto del jugador: deja el audio listo para cuando haga falta. */
  start(): void {
    try {
      if (!this.ctx) this.setup();
      void this.ctx!.resume();
    } catch {
      /* sin Web Audio: no hay fanfarrias */
    }
  }

  play(kind: FanfareKind): void {
    if (this.volume === 0) return;
    try {
      if (!this.ctx) this.setup();
      const ctx = this.ctx!;
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime + 0.05;
      const piece = PIECES[kind];
      for (const [at, midi, dur, vel] of piece.brass) this.brass(t0 + at, freq(midi), dur, vel);
      for (const [at, midi, vel] of piece.timpani) this.timpani(t0 + at, freq(midi), vel);
    } catch {
      /* sin Web Audio: no hay fanfarrias */
    }
  }

  private setup(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = MASTER * this.volume;
    this.out.connect(comp);
    // Sala grande: los metales resuenan un poco
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(this.out);
  }

  /** Metal: dos dientes de sierra desafinados con un filtro que se abre al soplar. */
  private brass(t: number, f: number, dur: number, vel: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(f * 1.2, t);
    filter.frequency.linearRampToValueAtTime(f * 6, t + 0.05);
    filter.frequency.exponentialRampToValueAtTime(f * 3.2, t + Math.min(0.3, dur));
    const g = ctx.createGain();
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.12);
    g.gain.setValueAtTime(peak * 0.7, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
    filter.connect(g);
    g.connect(this.out!);
    g.connect(this.reverb!);
    for (const detune of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      // un leve vibrato en las notas largas
      if (dur > 0.4) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(f * 0.006, t + dur);
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur + 0.25);
      }
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.25);
    }
  }

  /** Timbal: tono grave que cae un poco y golpe de ruido filtrado. */
  private timpani(t: number, f: number, vel: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.out!);
    g.connect(this.reverb!);
    o.start(t);
    o.stop(t + 1);
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0.25 * vel;
    noise.connect(lp).connect(ng).connect(this.out!);
    noise.start(t);
  }
}

function readVolume(): number {
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    if (v !== null && !Number.isNaN(Number(v))) return Math.max(0, Math.min(1, Number(v)));
  } catch {
    /* sin almacenamiento: volumen por defecto */
  }
  return 0.8;
}

export const fanfare = new Fanfare();
