// Procedural Multi-Section Adaptive Soundtrack Engine for Prism.
// Combines classical voice-leading & Baroque counterpoint with modern modal interchange,
// Neo-Riemannian chromatic mediants, jazz-fusion 9th/11th extensions, and electronic synth/drum synthesis.
//
// 100% pure Web Audio API (zero external samples, strict CSP compliant).
// Uses a sample-accurate lookahead scheduler (25ms tick / 140ms lookahead) for rock-solid groove timing.

const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface ChordBar {
  bass: number;          // MIDI root/inversion bass note (octave 2-3)
  voicing: number[];     // 4-note smooth voice-led pad/arp voicing (octave 4-5)
  scale: number[];       // Consonant melody & SFX harmony MIDI pitch classes (mod 12)
  stab?: boolean;        // Accent stab on syncopated offbeat
}

interface Movement {
  id: string;
  name: string;
  modeLabel: string;
  bpm: number;
  swing: number;         // 0 = razor straight (Baroque/Boss), 0.012 = subtle electro swing
  bars: ChordBar[];      // 8 composed bars
  bassPattern: number[]; // 16 steps: -1 rest, 0 root, 7 fifth, 12 octave, 10 flat7, -2 chromatic approach
  arpOrder: number[];    // 16 steps indexing voicing[0..3] (+4 = octave up, -1 = rest)
  melodyA: (number | null)[]; // 32 steps (bars 0..1 / 4..5) scale degree offsets from tonic (null = rest)
  melodyB: (number | null)[]; // 32 steps (bars 2..3 / 6..7) answering response phrase
  drumStyle: 'pulse' | 'drive' | 'baroque' | 'halftime' | 'boss';
  tonicMidi: number;     // Reference octave-5 tonic for melodic phrases
}

// ── 6 Composed 8-Bar Movements (Classic + Modern Harmony) ─────────────────

const MOVEMENTS: Movement[] = [
  // I. Crystal Overture — D Dorian (luminous, mysterious, driving intro)
  {
    id: 'overture',
    name: 'I. CRYSTAL OVERTURE',
    modeLabel: 'D DORIAN',
    bpm: 118,
    swing: 0.008,
    tonicMidi: 62, // D4
    drumStyle: 'pulse',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 11, 0] },           // Dm9
      { bass: 40, voicing: [60, 64, 67, 71, 74], scale: [0, 2, 4, 5, 7, 9, 11] },           // Cmaj9/E
      { bass: 41, voicing: [60, 64, 69, 72, 76], scale: [5, 7, 9, 11, 0, 2, 4], stab: true },// Fmaj7#11
      { bass: 43, voicing: [62, 67, 71, 74, 76], scale: [7, 9, 11, 0, 2, 4, 5] },           // G6/9
      { bass: 46, voicing: [62, 65, 69, 70, 74], scale: [10, 0, 2, 5, 7, 9] },              // Bbmaj7
      { bass: 43, voicing: [62, 65, 67, 70, 74], scale: [7, 9, 10, 0, 2, 5], stab: true },  // Gm9
      { bass: 45, voicing: [62, 64, 69, 71, 76], scale: [9, 11, 0, 2, 4, 7] },              // Asus4(9)
      { bass: 45, voicing: [61, 64, 67, 70, 76], scale: [9, 10, 1, 2, 4, 7], stab: true },  // A7(b9) tension
    ],
    bassPattern: [0, -1, 0, 12, -1, 7, 0, -1, 0, -1, 12, -1, 7, -1, 10, 12],
    arpOrder:    [0, 2, 1, 3, 4, 2, 3, 1, 0, 3, 2, 4, 1, 3, 4, 2],
    melodyA: [
      4, null, 7, null, 9, null, 7, 5,   4, null, 2, null, 0, null, null, null,
      4, null, 7, null, 11, null, 9, 7,  9, null, null, 7, 5, null, 4, null,
    ],
    melodyB: [
      12, null, 11, null, 9, null, 7, 5, 7, null, 4, null, 2, null, 4, 5,
      7, null, 9, null, 7, 5, 4, 2,      1, null, 4, null, 7, null, null, null,
    ],
  },

  // II. Refraction Lift — F Lydian (bright uplifting relative-major pivot)
  {
    id: 'lift',
    name: 'II. REFRACTION LIFT',
    modeLabel: 'F LYDIAN',
    bpm: 122,
    swing: 0.006,
    tonicMidi: 65, // F4
    drumStyle: 'drive',
    bars: [
      { bass: 41, voicing: [64, 69, 71, 72, 76], scale: [5, 7, 9, 11, 0, 2, 4] },           // Fmaj7#11
      { bass: 43, voicing: [62, 67, 71, 74, 76], scale: [7, 9, 11, 0, 2, 4, 5] },           // G6/9
      { bass: 40, voicing: [62, 64, 67, 71, 74], scale: [4, 7, 9, 11, 0, 2], stab: true },  // Em7
      { bass: 45, voicing: [64, 67, 71, 72, 76], scale: [9, 11, 0, 2, 4, 7] },              // Am9
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },               // Dm9
      { bass: 40, voicing: [60, 64, 67, 74, 76], scale: [0, 2, 4, 7, 9, 11], stab: true },  // Cadd9/E
      { bass: 46, voicing: [62, 65, 69, 72, 76], scale: [10, 0, 2, 4, 5, 9] },              // Bbmaj7#11
      { bass: 45, voicing: [61, 64, 69, 71, 76], scale: [9, 11, 1, 2, 4, 7], stab: true },  // A7(9)
    ],
    bassPattern: [0, 12, 0, 12, 7, 12, 0, 7, 0, 12, 0, 12, 7, 10, 12, 7],
    arpOrder:    [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 3, 1, 2, 3, 4],
    melodyA: [
      0, null, 4, null, 6, null, 7, null, 9, null, 7, 6, 4, null, 2, null,
      4, null, 7, null, 11, null, 9, null, 7, null, 6, 4, 2, null, null, null,
    ],
    melodyB: [
      12, null, 11, 9, 7, null, 6, null, 7, null, 9, 11, 12, null, 14, null,
      11, null, 9, 7, 6, null, 4, 2,     4, null, 7, null, 9, null, null, null,
    ],
  },

  // III. Prismatic Counterpoint — D Harmonic/Melodic Minor (Baroque descending chromatic bass + 16th motor!)
  {
    id: 'counterpoint',
    name: 'III. PRISMATIC COUNTERPOINT',
    modeLabel: 'D HARMONIC MINOR',
    bpm: 124,
    swing: 0.0,
    tonicMidi: 62, // D4
    drumStyle: 'baroque',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 74, 77], scale: [2, 4, 5, 7, 9, 10, 1] },           // Dm
      { bass: 36, voicing: [60, 65, 69, 74, 77], scale: [0, 2, 4, 5, 7, 9, 10] },           // Dm/C
      { bass: 34, voicing: [62, 65, 69, 70, 74], scale: [10, 0, 2, 5, 7, 9], stab: true },  // Bbmaj7
      { bass: 37, voicing: [61, 64, 67, 69, 73], scale: [1, 2, 4, 7, 9, 10] },              // A7/C#
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },               // Dm9
      { bass: 46, voicing: [62, 67, 70, 74, 79], scale: [7, 9, 10, 0, 2, 5], stab: true },  // Gm/Bb
      { bass: 40, voicing: [62, 64, 67, 70, 74], scale: [4, 5, 7, 9, 10, 2] },              // Eø7 (half-dim)
      { bass: 45, voicing: [61, 64, 67, 70, 73], scale: [9, 10, 1, 2, 4, 7], stab: true },  // A7b9
    ],
    bassPattern: [0, 12, 7, 12, 0, 12, 7, 12, 0, 12, 7, 12, 0, 7, 10, 12],
    // Bach Prelude-inspired broken-chord 16th pattern.
    arpOrder:    [0, 1, 2, 4, 2, 3, 4, 2, 0, 1, 3, 4, 3, 2, 4, 1],
    melodyA: [
      7, 5, 4, 5, 7, null, 12, null, 10, 9, 7, 9, 10, null, 7, null,
      5, 4, 2, 4, 5, 7, 9, 10,       12, null, 11, null, 9, null, null, null,
    ],
    melodyB: [
      12, 10, 9, 7, 5, 7, 9, 12,     14, null, 12, 10, 9, null, 7, null,
      10, 9, 7, 5, 4, 5, 7, 4,       1, null, 4, 7, 9, 12, 13, null,
    ],
  },

  // IV. Chromatic Horizon — Neo-Riemannian Chromatic Mediants & Neapolitan bII (cinematic color shifts!)
  {
    id: 'chromatic',
    name: 'IV. CHROMATIC HORIZON',
    modeLabel: 'MODAL INTERCHANGE',
    bpm: 120,
    swing: 0.010,
    tonicMidi: 62, // D4
    drumStyle: 'halftime',
    bars: [
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },               // Dm9
      { bass: 42, voicing: [61, 65, 66, 70, 73], scale: [6, 8, 10, 1, 3, 5], stab: true },  // F#maj7 (chromatic mediant!)
      { bass: 47, voicing: [61, 62, 66, 69, 73], scale: [11, 1, 2, 4, 6, 9] },              // Bm9
      { bass: 43, voicing: [61, 62, 67, 71, 74], scale: [7, 9, 11, 1, 2, 4] },              // Gmaj7#11
      { bass: 39, voicing: [62, 63, 67, 70, 74], scale: [3, 5, 7, 9, 10, 2], stab: true },  // Ebmaj7 (Neapolitan bII!)
      { bass: 36, voicing: [62, 63, 67, 70, 74], scale: [0, 2, 3, 5, 7, 10] },              // Cm9
      { bass: 45, voicing: [62, 64, 69, 71, 76], scale: [9, 11, 0, 2, 4, 7] },              // Asus4(9)
      { bass: 45, voicing: [61, 64, 67, 72, 76], scale: [9, 10, 0, 1, 4, 7], stab: true },  // A7#9 (Hendrix/fusion)
    ],
    bassPattern: [0, -1, -1, 0, -1, 7, 12, -1, 0, -1, 7, -1, 12, -1, 7, -1],
    arpOrder:    [0, -1, 2, 3, 4, -1, 3, 1, 0, 2, -1, 4, 3, 2, 1, 4],
    melodyA: [
      9, null, null, 7, 5, null, 4, null, 8, null, null, 10, 13, null, 11, null,
      9, null, 6, null, 4, null, 2, null, 7, null, 9, null, 11, null, null, null,
    ],
    melodyB: [
      10, null, null, 8, 7, null, 5, null, 7, null, 10, null, 12, null, 10, 8,
      9, null, 7, null, 5, null, 4, null,  7, null, 10, null, 12, null, null, null,
    ],
  },

  // V. Solar Overdrive — A Dorian High-Energy Climax
  {
    id: 'overdrive',
    name: 'V. SOLAR OVERDRIVE',
    modeLabel: 'A DORIAN · OVERDRIVE',
    bpm: 128,
    swing: 0.004,
    tonicMidi: 69, // A4
    drumStyle: 'drive',
    bars: [
      { bass: 45, voicing: [64, 67, 71, 72, 76], scale: [9, 11, 0, 2, 4, 6, 7] },           // Am9
      { bass: 41, voicing: [64, 69, 71, 72, 76], scale: [5, 7, 9, 11, 0, 2, 4], stab: true },// Fmaj7#11
      { bass: 43, voicing: [62, 67, 71, 74, 76], scale: [7, 9, 11, 0, 2, 4, 5] },           // G6/9
      { bass: 40, voicing: [62, 64, 67, 71, 74], scale: [4, 6, 7, 9, 11, 2] },              // Em7
      { bass: 41, voicing: [64, 65, 69, 72, 76], scale: [5, 7, 9, 0, 2, 4], stab: true },   // Fmaj7
      { bass: 38, voicing: [62, 65, 69, 72, 76], scale: [2, 4, 5, 7, 9, 0] },               // Dm9
      { bass: 40, voicing: [62, 64, 69, 71, 76], scale: [4, 7, 9, 11, 0, 2] },              // E7sus4
      { bass: 40, voicing: [62, 64, 68, 71, 75], scale: [4, 5, 7, 8, 11, 2], stab: true },  // E7#9
    ],
    bassPattern: [0, 12, 0, 12, 0, 7, 12, 7, 0, 12, 0, 12, 10, 12, 7, 12],
    arpOrder:    [0, 2, 4, 2, 1, 3, 4, 3, 0, 4, 2, 3, 1, 4, 3, 2],
    melodyA: [
      0, null, 3, 5, 7, null, 10, 7,     5, null, 3, 2, 0, null, -2, null,
      0, 3, 5, 7, 9, null, 7, 5,         7, null, 10, null, 12, null, null, null,
    ],
    melodyB: [
      12, null, 10, 9, 7, null, 5, 3,    5, null, 7, 9, 7, null, 3, null,
      2, 3, 5, 7, 9, 7, 5, 3,            2, null, 4, null, 7, null, 11, null,
    ],
  },
];

// Dedicated Boss Movement — D Phrygian Dominant (intense, dramatic, urgent 134 BPM!)
const BOSS_MOVEMENT: Movement = {
  id: 'boss',
  name: 'BOSS · VOID CONVERGENCE',
  modeLabel: 'D PHRYGIAN DOMINANT',
  bpm: 134,
  swing: 0.0,
  tonicMidi: 62, // D4
  drumStyle: 'boss',
  bars: [
    { bass: 38, voicing: [62, 66, 69, 72, 75], scale: [2, 3, 6, 7, 9, 10, 0], stab: true }, // D7b9 (Phrygian Dom)
    { bass: 39, voicing: [63, 67, 70, 74, 78], scale: [3, 6, 7, 9, 10, 0, 2] },             // Ebmaj7#11
    { bass: 36, voicing: [62, 63, 67, 70, 74], scale: [0, 2, 3, 5, 7, 10], stab: true },    // Cm9
    { bass: 39, voicing: [62, 63, 67, 70, 74], scale: [3, 5, 7, 9, 10, 2] },                // Ebmaj7
    { bass: 43, voicing: [62, 65, 67, 70, 74], scale: [7, 9, 10, 0, 2, 3], stab: true },    // Gm9
    { bass: 42, voicing: [60, 63, 66, 69, 72], scale: [6, 7, 9, 10, 0, 3] },                // F#dim7
    { bass: 39, voicing: [63, 67, 70, 74, 78], scale: [3, 6, 7, 9, 10, 2], stab: true },    // Ebmaj7#11
    { bass: 45, voicing: [61, 64, 67, 70, 73], scale: [9, 10, 1, 2, 4, 7], stab: true },    // A7b9
  ],
  bassPattern: [0, 0, 12, 0, 1, 0, 12, 7, 0, 0, 12, 0, 1, 12, 7, 1],
  arpOrder:    [0, 3, 1, 4, 2, 4, 3, 1, 0, 4, 2, 3, 1, 4, 3, 2],
  melodyA: [
    0, 1, 4, null, 5, 4, 1, 0,         7, null, 8, 7, 5, 4, 1, null,
    0, 1, 4, 5, 7, 8, 7, 5,            4, null, 1, null, 0, null, null, null,
  ],
  melodyB: [
    12, 13, 12, 10, 8, 7, 5, 4,        7, null, 8, 10, 12, null, 13, null,
    12, 8, 7, 5, 4, 1, 4, 5,           7, null, 10, 8, 7, 4, 1, null,
  ],
};

export class MusicEngine {
  private ctx: AudioContext;
  private musicGain: GainNode;
  private filterBus: BiquadFilterNode;
  private delaySend: GainNode;
  private noiseBuf: AudioBuffer;

  private timerId: number | null = null;
  private nextStepTime = 0;
  private stepInBar = 0; // 0..15
  private barInMov = 0;  // 0..7
  private movCycles = 0; // repeats per movement before macro transition
  private movIndex = 0;
  private activeMov: Movement = MOVEMENTS[0]!;

  // Live adaptive gameplay inputs.
  private isTitle = true;
  private energy = 0.15;     // 0..1 combined wave + build + streak + aim intensity
  private bossActive = false;
  private muted = false;
  private ducked = false;
  private running = false;

  // Melodic variation state so phrases evolve organically over time.
  private phraseVar = 0;

  constructor(ctx: AudioContext, destination: AudioNode, noiseBuf: AudioBuffer) {
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.56;
    this.musicGain.connect(destination);

    this.filterBus = ctx.createBiquadFilter();
    this.filterBus.type = 'lowpass';
    this.filterBus.frequency.value = 16000;
    this.filterBus.Q.value = 0.65;
    this.filterBus.connect(this.musicGain);

    // Tempo-friendly lush stereo ping-pong delay dedicated to music arps & lead.
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.24;

    const dL = ctx.createDelay(0.6);
    const dR = ctx.createDelay(0.6);
    dL.delayTime.value = 0.245;
    dR.delayTime.value = 0.368;

    const fL = ctx.createBiquadFilter();
    fL.type = 'bandpass';
    fL.frequency.value = 1650;
    fL.Q.value = 0.6;
    const fR = ctx.createBiquadFilter();
    fR.type = 'bandpass';
    fR.frequency.value = 2150;
    fR.Q.value = 0.6;

    const fbL = ctx.createGain();
    fbL.gain.value = 0.32;
    const fbR = ctx.createGain();
    fbR.gain.value = 0.28;

    const pL = ctx.createStereoPanner();
    pL.pan.value = -0.75;
    const pR = ctx.createStereoPanner();
    pR.pan.value = 0.75;

    this.delaySend.connect(dL);
    dL.connect(fL);
    fL.connect(pL);
    pL.connect(this.filterBus);

    fL.connect(fbL);
    fbL.connect(dR);
    dR.connect(fR);
    fR.connect(pR);
    pR.connect(this.filterBus);
    fR.connect(fbR);
    fbR.connect(dL);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.timerId = window.setInterval(() => this.schedulerTick(), 25);
  }

  public stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncBus();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.syncBus();
  }

  public setGameState(isTitle: boolean, energy: number, bossActive: boolean): void {
    this.isTitle = isTitle;
    this.energy = Math.max(0, Math.min(1, energy));
    this.bossActive = bossActive;
  }

  public getNowPlaying(): string {
    if (this.isTitle) return `AMBIENT · ${this.activeMov.name}`;
    return `${this.activeMov.name} (${this.activeMov.modeLabel})`;
  }

  /** Returns consonant Hz frequencies for the currently sounding chord so SFX harmonize! */
  public getActiveScaleFreqs(): number[] {
    const bar = this.activeMov.bars[this.barInMov] ?? this.activeMov.bars[0]!;
    const out: number[] = [];
    for (const octave of [60, 72, 84]) {
      for (const pc of bar.scale) {
        const midi = octave + pc;
        if (midi >= 60 && midi <= 93) out.push(mtof(midi));
      }
    }
    return out.length > 0 ? out : [587.33, 659.25, 739.99, 880, 987.77];
  }

  private syncBus(): void {
    const now = this.ctx.currentTime;
    const gain = this.muted ? 0.0 : this.ducked ? 0.24 : 0.56;
    const cutoff = this.ducked ? 560 : 16000;
    this.musicGain.gain.setTargetAtTime(gain, now, 0.08);
    this.filterBus.frequency.setTargetAtTime(cutoff, now, 0.10);
  }

  private schedulerTick(): void {
    if (!this.running || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Recover cleanly if tab was suspended.
    if (this.nextStepTime < now - 0.3) {
      this.nextStepTime = now + 0.04;
    }
    const lookahead = 0.14;
    while (this.nextStepTime < now + lookahead) {
      this.scheduleStep(this.nextStepTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    const stepDur = 60 / this.activeMov.bpm / 4; // 16th note
    this.nextStepTime += stepDur;
    this.stepInBar = (this.stepInBar + 1) & 15;
    if (this.stepInBar === 0) {
      this.barInMov = (this.barInMov + 1) % this.activeMov.bars.length;

      // Seamless bar-boundary Boss switch!
      if (this.bossActive && this.activeMov.id !== 'boss') {
        this.activeMov = BOSS_MOVEMENT;
        this.barInMov = 0;
        this.movCycles = 0;
        return;
      }
      if (!this.bossActive && this.activeMov.id === 'boss') {
        this.movIndex = (this.movIndex + 1) % MOVEMENTS.length;
        this.activeMov = MOVEMENTS[this.movIndex]!;
        this.barInMov = 0;
        this.movCycles = 0;
        return;
      }

      // Advance macro musical form every 1–2 cycles of 8 bars so the soundtrack evolves constantly!
      if (this.barInMov === 0) {
        this.movCycles++;
        this.phraseVar = (this.phraseVar + 1) % 4;
        const maxCycles = this.isTitle ? 1 : this.energy > 0.55 ? 2 : 1;
        if (!this.bossActive && this.movCycles >= maxCycles) {
          this.movCycles = 0;
          if (this.isTitle) {
            this.movIndex = this.movIndex === 0 ? 3 : 0; // Alternate Overture & Chromatic Horizon on Title
          } else {
            // Musical journey: Overture → Lift → Counterpoint → Chromatic → Overdrive → Lift...
            this.movIndex = (this.movIndex + 1) % MOVEMENTS.length;
          }
          this.activeMov = MOVEMENTS[this.movIndex]!;
        }
      }
    }
  }

  private scheduleStep(rawTime: number): void {
    if (this.muted) return;
    const mov = this.activeMov;
    const barIdx = this.barInMov;
    const step = this.stepInBar;
    const bar = mov.bars[barIdx]!;
    const stepDur = 60 / mov.bpm / 4;
    const t = rawTime + (step % 2 === 1 ? mov.swing : 0);
    const e = this.isTitle ? 0.08 : this.energy;

    // 1. Lush Polyphonic Voice-Led Pad Chord on beat 1 of each bar (and half-bar shimmer in Lift/Overdrive).
    if (step === 0) {
      this.playPadChord(bar.voicing, t, stepDur * 15.5, this.isTitle ? 0.14 : 0.12 + e * 0.04);
    }

    // 2. Title Screen stays ambient, hypnotic, and spacious (pads + delicate harp-crystal arp + sparse melody).
    if (this.isTitle) {
      if (step % 2 === 0) {
        const arpSlot = mov.arpOrder[step]!;
        if (arpSlot >= 0) {
          const midi = bar.voicing[arpSlot % bar.voicing.length]! + (arpSlot >= 4 ? 12 : 0);
          this.playArpNote(mtof(midi), t, stepDur * 2.2, 0.045, ((step % 4) - 1.5) * 0.35);
        }
      }
      if (barIdx % 2 === 0 && (step === 0 || step === 6 || step === 10)) {
        const note = bar.voicing[(step / 2 + barIdx) % bar.voicing.length]! + 12;
        this.playLeadNote(mtof(note), t, stepDur * 5.0, 0.04, 0.25);
      }
      return;
    }

    // 3. Analog Resonant Synth Bassline (always anchors harmony & groove!).
    const bassOff = mov.bassPattern[step]!;
    if (bassOff >= 0) {
      const midi = bar.bass + bassOff;
      const accent = step === 0 || step === 8 || bassOff === 12;
      this.playBass(
        mtof(midi),
        t,
        stepDur * (accent ? 1.55 : 0.95),
        0.16 + e * 0.06,
        accent ? 1450 + e * 1200 : 720 + e * 680,
      );
    }

    // 4. Baroque / Synthwave FM-Crystal Counterpoint Arpeggiator.
    const arpSlot = mov.arpOrder[step]!;
    const arpActive =
      mov.drumStyle === 'baroque' || mov.drumStyle === 'boss' || e > 0.12 || step % 2 === 0;
    if (arpSlot >= 0 && arpActive) {
      const octUp = (this.phraseVar === 2 && step % 4 === 3) ? 12 : 0;
      const midi = bar.voicing[arpSlot % bar.voicing.length]! + octUp;
      const pan = Math.sin((step + barIdx * 3) * 0.78) * 0.58;
      const vol = mov.drumStyle === 'baroque' ? 0.088 : 0.052 + e * 0.036;
      this.playArpNote(mtof(midi), t, stepDur * 1.45, vol, pan);
    }

    // 5. Expressive Composed Melody Lead (Call & Response across 8-bar form, evolving with phraseVar!).
    const halfPhrase = barIdx % 4;
    const isB = halfPhrase >= 2;
    const phraseStep = (halfPhrase % 2) * 16 + step;
    const rawDeg = isB ? mov.melodyB[phraseStep] : mov.melodyA[phraseStep];
    if (rawDeg !== null && rawDeg !== undefined) {
      // Snap melody pitch cleanly to nearest consonant scale degree of current chord for zero clashing!
      const rawMidi = mov.tonicMidi + rawDeg + (this.phraseVar === 3 ? 12 : 0);
      const snappedMidi = this.snapToScale(rawMidi, bar.scale);
      const dur = stepDur * (step % 4 === 0 ? 3.4 : 2.1);
      const leadVol = 0.068 + e * 0.042;
      const pan = isB ? 0.22 : -0.22;
      this.playLeadNote(mtof(snappedMidi), t, dur, leadVol, pan);

      // Harmony counter-voice a 3rd/6th below on high energy climaxes!
      if (e > 0.55 && step % 4 === 0) {
        const harmMidi = this.snapToScale(snappedMidi - 4, bar.scale);
        this.playLeadNote(mtof(harmMidi), t, dur * 0.9, leadVol * 0.45, -pan);
      }
    }

    // 6. Syncopated Brassy Chord Stabs on accent bars (Climax / Boss / Modal Pivots).
    if (bar.stab && (step === 6 || step === 14) && (e > 0.35 || mov.drumStyle === 'boss')) {
      this.playStab(bar.voicing.slice(0, 4), t, stepDur * 1.3, 0.075 + e * 0.04);
    }

    // 7. Synthesized Electronic Drum Groove + Bar-4 / Bar-8 Turnaround Fills!
    this.scheduleDrums(mov.drumStyle, barIdx, step, t, stepDur, e);
  }

  private snapToScale(midi: number, scalePCs: number[]): number {
    const pc = ((midi % 12) + 12) % 12;
    if (scalePCs.includes(pc)) return midi;
    for (const d of [1, -1, 2, -2]) {
      const cand = ((pc + d) % 12 + 12) % 12;
      if (scalePCs.includes(cand)) return midi + d;
    }
    return midi;
  }

  private scheduleDrums(
    style: Movement['drumStyle'],
    barIdx: number,
    step: number,
    t: number,
    stepDur: number,
    e: number,
  ): void {
    const isFillBar = barIdx === 3 || barIdx === 7;
    const isLastBeat = step >= 12;

    // Bar 4 & Bar 8 dynamic drum fills for exciting phrase transitions!
    if (isFillBar && isLastBeat && (e > 0.25 || style === 'boss')) {
      if (step === 12) this.playSnare(t, 0.13 + e * 0.05);
      if (step === 13) this.playTom(t, 210, 0.11);
      if (step === 14) this.playTom(t, 165, 0.12);
      if (step === 15) {
        this.playTom(t, 125, 0.13);
        this.playSnare(t, 0.10);
      }
      return;
    }

    if (style === 'pulse') {
      // Deep atmospheric electro-pulse.
      if (step === 0 || step === 8 || (e > 0.3 && step === 14)) this.playKick(t, 0.22 + e * 0.08);
      if ((step === 4 || step === 12) && e > 0.18) this.playSnare(t, 0.09 + e * 0.05);
      if (step % 2 === 0 || (e > 0.4 && step % 2 === 1)) {
        this.playHat(t, step % 4 === 2, step % 2 === 0 ? 0.042 : 0.022);
      }
    } else if (style === 'drive') {
      // Energetic synthwave / four-on-the-floor drive.
      if (step % 4 === 0) this.playKick(t, 0.26 + e * 0.08);
      if (step === 4 || step === 12) this.playSnare(t, 0.14 + e * 0.06);
      if (e > 0.45 && (step === 15 || step === 7)) this.playSnare(t, 0.05); // ghost note
      this.playHat(t, step % 4 === 2, step % 2 === 0 ? 0.048 : 0.028);
    } else if (style === 'baroque') {
      // Syncopated electro-breakbeat interlocking with 16th Bach arpeggios!
      if (step === 0 || step === 6 || step === 10) this.playKick(t, 0.25 + e * 0.08);
      if (step === 4 || step === 12) this.playSnare(t, 0.14 + e * 0.06);
      if (step === 15) this.playSnare(t, 0.065);
      if (step % 2 === 0 || e > 0.35) {
        this.playHat(t, step === 2 || step === 14, step % 4 === 0 ? 0.048 : 0.026);
      }
    } else if (style === 'halftime') {
      // Cinematic half-time groove (big kick on 1, colossal snare on 3, rolling hats).
      if (step === 0 || step === 10 || (step === 14 && e > 0.35)) this.playKick(t, 0.27 + e * 0.07);
      if (step === 8) this.playSnare(t, 0.17 + e * 0.06);
      if (step % 2 === 0) this.playHat(t, step === 12, 0.038);
      if (barIdx === 7 && step >= 8) {
        // Snare build-up into next movement!
        this.playSnare(t, 0.07 + ((step - 8) / 8) * 0.10);
      }
    } else {
      // Boss: Relentless double-kick urgency + razor backbeat + frantic 16th hats!
      if (step === 0 || step === 2 || step === 6 || step === 8 || step === 10 || step === 14) {
        this.playKick(t, step % 4 === 0 ? 0.30 : 0.20);
      }
      if (step === 4 || step === 12) this.playSnare(t, 0.18);
      if (step === 7 || step === 15) this.playSnare(t, 0.08);
      this.playHat(t, step === 2 || step === 10, step % 2 === 0 ? 0.055 : 0.032);
    }

    // Subtle open crash shimmer on bar 0 beat 1.
    if (barIdx === 0 && step === 0 && e > 0.2) {
      this.playCrash(t, stepDur * 6, 0.055);
    }
  }

  // ── Instrument Synthesizers ─────────────────────────────────────────────

  private playBass(freq: number, t: number, dur: number, vol: number, cutoffPeak: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 0.5, t);

    filt.type = 'lowpass';
    filt.Q.value = 3.2;
    filt.frequency.setValueAtTime(cutoffPeak, t);
    filt.frequency.exponentialRampToValueAtTime(160, t + Math.min(dur, 0.22));

    const subGain = ctx.createGain();
    subGain.gain.value = 0.55;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filt);
    sub.connect(subGain);
    subGain.connect(g);
    filt.connect(g);
    g.connect(this.filterBus);

    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private playPadChord(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.9;
    filt.frequency.setValueAtTime(520, t);
    filt.frequency.linearRampToValueAtTime(1450 + this.energy * 900, t + dur * 0.45);
    filt.frequency.linearRampToValueAtTime(640, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol / midis.length, t + Math.min(0.35, dur * 0.25));
    g.gain.setValueAtTime(vol / midis.length, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filt.connect(g);
    g.connect(this.filterBus);

    for (let i = 0; i < midis.length; i++) {
      const hz = mtof(midis[i]!);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sawtooth';
      o1.frequency.setValueAtTime(hz, t);
      o2.frequency.setValueAtTime(hz * (1 + (i % 2 === 0 ? 0.0035 : -0.0035)), t);

      const g2 = ctx.createGain();
      g2.gain.value = 0.28;
      o1.connect(filt);
      o2.connect(g2);
      g2.connect(filt);

      o1.start(t);
      o2.start(t);
      o1.stop(t + dur + 0.04);
      o2.stop(t + dur + 0.04);
    }
  }

  /** 2-operator FM plucked crystal-harp voice for Baroque / Synthwave arpeggios. */
  private playArpNote(freq: number, t: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    car.type = 'sine';
    car.frequency.setValueAtTime(freq, t);
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * 2.0, t);

    // Crisp bell-harp harmonic brightness that decays cleanly into pure tone.
    modGain.gain.setValueAtTime(freq * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(1.0, t + Math.min(dur * 0.55, 0.14));

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), t);

    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(g);
    g.connect(panner);
    panner.connect(this.filterBus);
    panner.connect(this.delaySend);

    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.02);
    mod.stop(t + dur + 0.02);
  }

  /** Singing detuned lead synth with expressive 5.5 Hz vibrato & filter bloom. */
  private playLeadNote(freq: number, t: number, dur: number, vol: number, pan: number): void {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    o1.type = 'sawtooth';
    o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq * 1.004, t);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.4, t);
    lfoGain.gain.setValueAtTime(0.0, t);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.009, t + Math.min(dur * 0.5, 0.25));
    lfo.connect(lfoGain);
    lfoGain.connect(o1.frequency);
    lfoGain.connect(o2.frequency);

    filt.type = 'lowpass';
    filt.Q.value = 2.0;
    filt.frequency.setValueAtTime(freq * 1.6, t);
    filt.frequency.linearRampToValueAtTime(Math.min(7200, freq * 4.8), t + 0.06);
    filt.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.8), t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.018);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    panner.pan.setValueAtTime(pan, t);

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(panner);
    panner.connect(this.filterBus);
    panner.connect(this.delaySend);

    o1.start(t);
    o2.start(t);
    lfo.start(t);
    o1.stop(t + dur + 0.03);
    o2.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  private playStab(midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 2.6;
    filt.frequency.setValueAtTime(3800, t);
    filt.frequency.exponentialRampToValueAtTime(520, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol / midis.length, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filt.connect(g);
    g.connect(this.filterBus);
    g.connect(this.delaySend);

    for (const m of midis) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(m), t);
      o.connect(filt);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  // ── Electronic Drum Synthesis ───────────────────────────────────────────

  private playKick(t: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, t);
    osc.frequency.exponentialRampToValueAtTime(43, t + 0.075);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    osc.connect(g);
    g.connect(this.filterBus);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  private playSnare(t: number, vol: number): void {
    const ctx = this.ctx;
    // Pitched snappy drum body.
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(215, t);
    body.frequency.exponentialRampToValueAtTime(115, t + 0.07);
    bg.gain.setValueAtTime(vol * 0.72, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    body.connect(bg);
    bg.connect(this.filterBus);
    body.start(t);
    body.stop(t + 0.10);

    // Filtered crisp snare wire noise.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2100, t);
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.filterBus);
    src.start(t);
    src.stop(t + 0.16);
  }

  private playHat(t: number, open: boolean, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(open ? 7400 : 9200, t);
    const g = ctx.createGain();
    const dur = open ? 0.14 : 0.038;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.filterBus);
    src.start(t);
    src.stop(t + dur + 0.015);
  }

  private playTom(t: number, startHz: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, t);
    osc.frequency.exponentialRampToValueAtTime(startHz * 0.52, t + 0.13);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g);
    g.connect(this.filterBus);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private playCrash(t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5200, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.filterBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
