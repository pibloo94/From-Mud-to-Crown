// Musica de fondo medieval sintetizada en el navegador (Web Audio): sin archivos ni licencias.
// Pieza en Re dorico, compas de 6/8: bordon grave, laud punteado (Karplus-Strong), flauta dulce y pandero.
// Se repite en bucle con cuatro secciones para que no canse: A, B, A sin flauta, B una octava abajo.

const PREF_KEY = 'fmtc-music';
/** Duracion de una corchea en segundos (6/8 tranquilo). */
const EIGHTH = 0.24;
const LOOKAHEAD = 0.25;
const MASTER_VOLUME = 0.32;

/** Melodia: [nota MIDI o null para silencio, duracion en corcheas]. Cada compas suma 6 corcheas. */
type Phrase = [number | null, number][];

const D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71, C4 = 60, C5 = 72, D5 = 74, E5 = 76;

const MELODY_A: Phrase = [
  [D4, 2], [F4, 1], [A4, 2], [G4, 1],
  [F4, 2], [E4, 1], [D4, 3],
  [C4, 2], [D4, 1], [E4, 2], [F4, 1],
  [G4, 3], [E4, 3],
  [A4, 2], [C5, 1], [D5, 2], [C5, 1],
  [A4, 2], [G4, 1], [F4, 3],
  [G4, 2], [E4, 1], [C4, 2], [E4, 1],
  [D4, 6],
];

const MELODY_B: Phrase = [
  [A4, 2], [A4, 1], [C5, 2], [D5, 1],
  [E5, 2], [D5, 1], [C5, 3],
  [D5, 2], [C5, 1], [A4, 2], [G4, 1],
  [A4, 3], [B4, 3],
  [F4, 2], [G4, 1], [A4, 2], [C5, 1],
  [D5, 2], [C5, 1], [A4, 3],
  [G4, 2], [F4, 1], [E4, 2], [C4, 1],
  [D4, 6],
];

/** Acorde de cada compas (raiz y tipo) para el laud. */
const CHORDS_A = ['D-', 'D-', 'C', 'C', 'F', 'D-', 'C', 'D-'];
const CHORDS_B = ['A-', 'A-', 'D-', 'A-', 'F', 'D-', 'C', 'D-'];
const ROOTS: Record<string, number> = { D: 50, C: 48, F: 53, A: 45 };

interface Section {
  melody: Phrase | null;
  chords: string[];
  octave: number;
}
const SECTIONS: Section[] = [
  { melody: MELODY_A, chords: CHORDS_A, octave: 0 },
  { melody: MELODY_B, chords: CHORDS_B, octave: 0 },
  { melody: null, chords: CHORDS_A, octave: 0 },
  { melody: MELODY_B, chords: CHORDS_B, octave: -12 },
];

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private drone: OscillatorNode[] = [];
  private timer: number | null = null;
  private nextTime = 0;
  private section = 0;
  private bar = 0;
  private plucks = new Map<number, AudioBuffer>();
  private enabled = readPref();

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* preferencia no persistente */
    }
    if (on) this.start();
    else this.stop();
  }

  /** Debe llamarse desde un gesto del jugador (clic o toque): los navegadores lo exigen para sonar. */
  start(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this.setup();
      void this.ctx!.resume();
      if (this.timer === null) {
        this.nextTime = this.ctx!.currentTime + 0.1;
        this.master!.gain.cancelScheduledValues(this.ctx!.currentTime);
        this.master!.gain.setTargetAtTime(MASTER_VOLUME, this.ctx!.currentTime, 0.8);
        this.timer = window.setInterval(() => this.schedule(), 60);
      }
    } catch {
      /* sin Web Audio: el juego sigue sin musica */
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      const ctx = this.ctx;
      setTimeout(() => {
        if (this.timer === null) void ctx.suspend();
      }, 800);
    }
    this.section = 0;
    this.bar = 0;
  }

  /** Silencia sin perder la posicion (pestana en segundo plano). */
  suspend(): void {
    if (this.ctx) void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.enabled && this.timer !== null) void this.ctx.resume();
  }

  // ------------------------------------------------------------ montaje

  private setup(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    // Reverberacion de sala de piedra: ruido que se apaga en 2,2 s.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.master);
    this.startDrone();
  }

  /** Bordon de zanfona: Re y La graves, filtrados y con un leve vaiven. */
  private startDrone(): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    filter.connect(gain).connect(this.master!);
    gain.connect(this.reverb!);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    for (const [midi, detune] of [[38, -4], [45, 3], [50, 0]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq(midi);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
      this.drone.push(osc);
    }
  }

  // ------------------------------------------------------------ secuenciador

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleBar(this.nextTime);
      this.nextTime += EIGHTH * 6;
      this.bar++;
      if (this.bar >= 8) {
        this.bar = 0;
        this.section = (this.section + 1) % SECTIONS.length;
      }
    }
  }

  private scheduleBar(t0: number): void {
    const sec = SECTIONS[this.section];
    // Laud: arpegio raiz-quinta-octava-quinta-tercera-quinta
    const chord = sec.chords[this.bar];
    const minor = chord.endsWith('-');
    const root = ROOTS[chord[0]];
    const third = root + (minor ? 3 : 4);
    const pattern = [root, root + 7, root + 12, root + 7, third + 12, root + 7];
    pattern.forEach((n, i) => this.pluck(n, t0 + i * EIGHTH, i === 0 ? 0.5 : 0.3));
    // Pandero en las dos partes fuertes del 6/8
    this.drum(t0, 0.35);
    this.drum(t0 + EIGHTH * 3, 0.2);
    // Flauta dulce
    if (sec.melody) {
      let beat = 0;
      let idx = 0;
      for (let b = 0; b < this.bar; b++) {
        let acc = 0;
        while (acc < 6) acc += sec.melody[idx++][1];
      }
      while (beat < 6 && idx < sec.melody.length) {
        const [note, dur] = sec.melody[idx++];
        if (note !== null) this.recorder(note + sec.octave, t0 + beat * EIGHTH, dur * EIGHTH);
        beat += dur;
      }
    }
  }

  // ------------------------------------------------------------ instrumentos

  /** Cuerda punteada con el algoritmo de Karplus-Strong, precalculada por nota. */
  private pluck(midi: number, t: number, vel: number): void {
    const ctx = this.ctx!;
    let buf = this.plucks.get(midi);
    if (!buf) {
      const sr = ctx.sampleRate;
      const n = Math.floor(sr * 1.6);
      buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const period = Math.max(2, Math.round(sr / freq(midi)));
      for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
      for (let i = period; i < n; i++) d[i] = 0.497 * (d[i - period] + d[i - period + 1]);
      this.plucks.set(midi, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.value = vel * 0.55;
    src.connect(tone).connect(g);
    g.connect(this.master!);
    g.connect(this.reverb!);
    src.start(t);
  }

  /** Flauta dulce: seno con un poco de triangulo, ataque suave y vibrato tardio. */
  private recorder(midi: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const f = freq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.05);
    g.gain.setValueAtTime(0.1, t + Math.max(0.06, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    g.connect(this.master!);
    g.connect(this.reverb!);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibGain = ctx.createGain();
    vibGain.gain.setValueAtTime(0, t);
    vibGain.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
    vib.connect(vibGain);
    for (const [type, level] of [['sine', 1], ['triangle', 0.25]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      vibGain.connect(osc.frequency);
      const lv = ctx.createGain();
      lv.gain.value = level;
      osc.connect(lv).connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
    vib.start(t);
    vib.stop(t + dur + 0.1);
  }

  /** Pandero: golpe grave de ruido filtrado. */
  private drum(t: number, vel: number): void {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 140;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = vel * 1.4;
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
  }
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const music = new Music();
